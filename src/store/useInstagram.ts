// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { create } from 'zustand'
import { phoneKey } from '../lib/duplicates'
import { detectarExtensao, estadoExtensao, igGet, igPerfilPagina, igPost, PAGINA_DESDE, versaoAntiga, type EstadoExtensao } from '../lib/igPonte'
import {
  acharChave,
  chavesDosLeads,
  coletarHashtags,
  coletarPerfis,
  ESPERA,
  FONTE_LABEL,
  IgErro,
  lerLista,
  lerPerfil,
  lerPerfilPagina,
  motivoDescarte,
  perfilParaLead,
  usuarioDe,
  type IgCandidato,
  type IgFiltros,
  type IgFonte,
  type IgPerfil,
  type Motivo,
  type Velocidade,
} from '../lib/instagram'
import { useApp } from './useApp'

/**
 * Busca de leads no Instagram. Roda nesta aba da XS (trocar de tela não para a busca) e
 * consulta o Instagram pela extensão, um perfil por vez, no ritmo escolhido. Os perfis
 * aprovados entram nos leads de 10 em 10, então fechar a aba no meio não perde o que já foi achado.
 */

export interface IgBuscaInput {
  fonte: IgFonte
  /** Palavras-chave, hashtags, perfis (para seguidores) ou a lista de @ */
  termos: string[]
  cidade: string
  /** Nicho gravado nos leads (vazio = categoria do perfil) */
  nicho: string
  meta: number
  filtros: IgFiltros
  velocidade: Velocidade
  /** Na palavra-chave, também varre as hashtags que o Instagram sugerir */
  hashtags: boolean
  /** Abre de novo perfis que já foram lidos em outras buscas */
  reler: boolean
}

export interface IgResultado extends IgPerfil {
  termo: string
  salvo: boolean
}

export type IgFase = 'buscando' | 'pausada' | 'esperando' | 'concluida' | 'parada' | 'erro'

export interface IgEstado {
  runId: string
  input: IgBuscaInput
  fase: IgFase
  mensagem: string
  termoAtual: string
  /** Perfis que apareceram nas buscas */
  achados: number
  /** Perfis abertos (cada um é uma consulta ao Instagram) */
  lidos: number
  /** Pulados sem abrir: já lidos em outra busca */
  pulados: number
  aprovados: IgResultado[]
  descartes: Partial<Record<Motivo, number>>
  salvos: number
  logs: string[]
  inicio: string
  fim: string | null
  /** Como os perfis estão sendo lidos: consulta rápida ou pela página do perfil (quando a rápida é barrada) */
  modo: 'rapida' | 'pagina'
  /** Pausa automática pedida pelo Instagram: volta sozinha nesse horário */
  esperaAte: number | null
  erro: string | null
}

export interface IgHistorico {
  id: string
  quando: string
  fonte: IgFonte
  termos: string[]
  lidos: number
  aprovados: number
  salvos: number
  fim: IgFase
  duracaoMs: number
}

export interface IgHoje {
  data: string
  perfis: number
  leads: number
  pausas: number
}

// ---------------------------------------------------------------------------
// Memória local (este navegador): perfis já lidos, números do dia e histórico
// ---------------------------------------------------------------------------

const K = 'xs-prospeccao:ig:'
function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(K + chave)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(K + chave, JSON.stringify(valor))
  } catch {
    /* sem armazenamento */
  }
}

const hojeStr = () => new Date().toLocaleDateString('sv-SE')
export function lerHoje(): IgHoje {
  const h = ler<IgHoje | null>('hoje', null)
  return h && h.data === hojeStr() ? h : { data: hojeStr(), perfis: 0, leads: 0, pausas: 0 }
}
function somarHoje(p: Partial<Omit<IgHoje, 'data'>>) {
  const h = lerHoje()
  const novo = { ...h, perfis: h.perfis + (p.perfis ?? 0), leads: h.leads + (p.leads ?? 0), pausas: h.pausas + (p.pausas ?? 0) }
  gravar('hoje', novo)
  useInstagram.setState({ hoje: novo })
}

const VISTOS_DIAS = 60
const VISTOS_MAX = 30_000
function lerVistos(): Map<string, number> {
  const limite = Date.now() - VISTOS_DIAS * 86_400_000
  return new Map(Object.entries(ler<Record<string, number>>('vistos', {})).filter(([, t]) => t > limite))
}
function gravarVistos(v: Map<string, number>) {
  const lista = [...v].sort((a, b) => b[1] - a[1]).slice(0, VISTOS_MAX)
  gravar('vistos', Object.fromEntries(lista))
}

export function lerHistorico(): IgHistorico[] {
  return ler<IgHistorico[]>('historico', [])
}

// ---------------------------------------------------------------------------

const MAX_PAGINAS = { palavra: 6, hashtag: 8, seguidores: 60, relacionada: 3 }
const PAUSAS_MIN = [2, 5, 10, 20]
/** No modo página, tenta a leitura rápida de novo a cada N perfis (ela traz mais dados) */
const TENTAR_RAPIDA_A_CADA = 30
const LOTE = 10

interface Controle {
  parar: boolean
  pausado: boolean
  acordar: (() => void) | null
}

interface IgStore {
  estado: IgEstado | null
  extensao: { verificando: boolean; versao: string | null; conta: EstadoExtensao['instagram'] | null; erro: string | null }
  hoje: IgHoje
  historico: IgHistorico[]
  /** `abrir`: abre uma aba do Instagram em segundo plano se não houver */
  verificar(abrir?: boolean): Promise<void>
  buscar(input: IgBuscaInput): Promise<void>
  pausar(): void
  continuar(): void
  parar(): void
  salvar(): Promise<void>
}

let ctrl: Controle | null = null
let salvando: Promise<void> | null = null

const agora = () => new Date().toLocaleTimeString('pt-BR')
const entre = ([a, b]: [number, number]) => a + Math.random() * (b - a)
const enc = encodeURIComponent

export const useInstagram = create<IgStore>()((set, get) => {
  const patch = (runId: string, p: Partial<IgEstado> | ((e: IgEstado) => Partial<IgEstado>)) =>
    set((s) => (s.estado?.runId === runId ? { estado: { ...s.estado, ...(typeof p === 'function' ? p(s.estado) : p) } } : s))
  const log = (runId: string, linha: string) => patch(runId, (e) => ({ logs: [...e.logs.slice(-300), `${agora()}  ${linha}`] }))

  /** Espera que a pausa e o "Parar" interrompem. */
  async function dormir(c: Controle, ms: number) {
    const fim = Date.now() + ms
    while (!c.parar && Date.now() < fim) await new Promise((r) => setTimeout(r, Math.min(250, fim - Date.now())))
  }

  /** Segura a busca enquanto estiver pausada (pelo usuário ou pedindo login/verificação). */
  async function pontoDeParada(c: Controle) {
    while (c.pausado && !c.parar) await new Promise<void>((r) => (c.acordar = r))
  }

  /**
   * Faz a consulta e cuida dos tropeços: o Instagram pediu pausa → espera e tenta de novo;
   * pediu login ou verificação → pausa até o usuário resolver e clicar em Continuar.
   */
  async function chamar<T>(runId: string, c: Controle, fn: () => Promise<T>, opcoes: { pularSeLimite?: boolean } = {}): Promise<T | null> {
    let pausas = 0
    let falhasExtensao = 0
    for (;;) {
      await pontoDeParada(c)
      if (c.parar) return null
      try {
        return await fn()
      } catch (err) {
        if (!(err instanceof IgErro)) throw err
        if (err.tipo === 'limite' && opcoes.pularSeLimite) throw err
        if (err.tipo === 'limite') {
          if (pausas >= PAUSAS_MIN.length) throw new IgErro('limite', 'O Instagram continua bloqueando as consultas desta conta. Troque de conta ou tente mais tarde.')
          const min = PAUSAS_MIN[pausas++]
          somarHoje({ pausas: 1 })
          log(runId, `O Instagram pediu uma pausa${err.detalhe ? ` (${err.detalhe})` : ''}. Volto sozinho em ${min} min.`)
          patch(runId, { fase: 'esperando', esperaAte: Date.now() + min * 60_000, mensagem: `O Instagram pediu uma pausa. A busca volta sozinha em ${min} min.` })
          // "Continuar agora" na tela adianta o horário
          while (!c.parar && Date.now() < (get().estado?.esperaAte ?? 0)) await new Promise((r) => setTimeout(r, 250))
          patch(runId, { fase: 'buscando', esperaAte: null, mensagem: 'Continuando depois da pausa…' })
          continue
        }
        if (err.tipo === 'login' || err.tipo === 'verificacao') {
          log(runId, `${err.message}${err.detalhe ? ` (${err.detalhe})` : ''}`)
          c.pausado = true
          patch(runId, { fase: 'pausada', mensagem: err.message })
          continue
        }
        if (err.tipo === 'extensao' && falhasExtensao++ < 2) {
          await dormir(c, 3000)
          continue
        }
        throw err
      }
    }
  }

  /** Perfis que aparecem em cada busca, página por página (só busca a próxima quando precisa). */
  /**
   * Lê um perfil: pela consulta rápida (traz telefone do botão, categoria e posts) e, se o
   * Instagram barrar, pela página do perfil (como quando a pessoa abre). Volta a tentar a
   * rápida de tempos em tempos.
   */
  function criarLeitor(runId: string, podePagina: boolean) {
    let modo: 'rapida' | 'pagina' = 'rapida'
    let naPagina = 0
    let avisou = false
    return async function lerUm(u: string): Promise<IgPerfil | null> {
      if (modo === 'pagina' && ++naPagina % TENTAR_RAPIDA_A_CADA === 0) modo = 'rapida'
      if (modo === 'rapida') {
        try {
          const perfil = lerPerfil(await igGet(`/api/v1/users/web_profile_info/?username=${enc(u)}`))
          patch(runId, { modo: 'rapida' })
          return perfil
        } catch (err) {
          if (!(err instanceof IgErro) || !podePagina || (err.tipo !== 'limite' && err.tipo !== 'falha')) throw err
          modo = 'pagina'
          patch(runId, { modo: 'pagina' })
          if (!avisou)
            log(runId, `O Instagram barrou a leitura rápida${err.detalhe ? ` (${err.detalhe})` : ''}. Seguindo pelo modo página: abre cada perfil como uma pessoa.`)
          avisou = true
        }
      }
      return lerPerfilPagina(await igPerfilPagina(u))
    }
  }

  async function* candidatos(
    runId: string,
    c: Controle,
    input: IgBuscaInput,
    lerUm: (u: string) => Promise<IgPerfil | null>,
  ): AsyncGenerator<{ termo: string; perfis: IgCandidato[] }> {
    const esperaBusca = () => dormir(c, entre(ESPERA[input.velocidade]) * 1.3)
    const cidade = input.cidade.split(',')[0].trim()
    const termoAtual = (t: string) => patch(runId, { termoAtual: t })

    async function* hashtag(tag: string, termo: string, maxPaginas: number) {
      termoAtual(`#${tag}`)
      const j = await chamar(runId, c, () => igGet(`/api/v1/tags/web_info/?tag_name=${enc(tag)}`)).catch((e: Error) => {
        log(runId, `#${tag}: ${e.message}`)
        return null
      })
      if (!j) return
      yield { termo, perfis: coletarPerfis(j) }
      const recentes = acharChave(j, 'recent') ?? j
      let max = acharChave(recentes, 'next_max_id')
      let pagina = acharChave(recentes, 'next_page')
      let ids = acharChave(recentes, 'next_media_ids')
      for (let p = 1; p < maxPaginas && max && !c.parar; p++) {
        await esperaBusca()
        const prox = await chamar(
          runId,
          c,
          () =>
            igPost(`/api/v1/tags/${enc(tag)}/sections/`, {
              max_id: String(max),
              page: String(pagina ?? p),
              surface: 'grid',
              tab: 'recent',
              next_media_ids: JSON.stringify(Array.isArray(ids) ? ids : []),
            }),
          { pularSeLimite: true },
        ).catch(() => null)
        if (!prox) return
        yield { termo, perfis: coletarPerfis(prox) }
        max = acharChave(prox, 'next_max_id')
        pagina = acharChave(prox, 'next_page')
        ids = acharChave(prox, 'next_media_ids')
        if (acharChave(prox, 'more_available') === false) return
      }
    }

    if (input.fonte === 'lista') {
      const usuarios = lerLista(input.termos.join('\n'))
      yield { termo: 'Lista', perfis: usuarios.map((u) => ({ usuario: u, pk: null, nome: null, privado: null })) }
      return
    }

    for (const termo of input.termos) {
      if (c.parar) return
      if (input.fonte === 'hashtag') {
        const tag = termo.replace(/^#/, '').replace(/\s+/g, '').toLowerCase()
        if (tag) yield* hashtag(tag, `#${tag}`, MAX_PAGINAS.hashtag)
        continue
      }

      if (input.fonte === 'seguidores') {
        const u = usuarioDe(termo)
        if (!u) continue
        termoAtual(`@${u}`)
        const perfil = await chamar(runId, c, () => lerUm(u)).catch(() => null)
        if (!perfil?.id) {
          log(runId, `Não achei o perfil @${u}.`)
          continue
        }
        log(runId, `@${u}: ${perfil.seguidores.toLocaleString('pt-BR')} seguidores.`)
        let max: unknown = null
        for (let p = 0; p < MAX_PAGINAS.seguidores && !c.parar; p++) {
          await esperaBusca()
          const j = await chamar(runId, c, () =>
            igGet(`/api/v1/friendships/${perfil.id}/followers/?count=50&search_surface=follow_list_page${max ? `&max_id=${enc(String(max))}` : ''}`),
            { pularSeLimite: p > 0 },
          ).catch((e: Error) => {
            log(runId, `@${u}: ${e.message}`)
            return null
          })
          if (!j) break
          yield { termo: `@${u}`, perfis: coletarPerfis(j) }
          max = acharChave(j, 'next_max_id')
          if (!max) break
        }
        continue
      }

      // Palavra-chave: contas com o nome parecido + posts que falam disso (+ hashtags sugeridas)
      const q = cidade && !termo.toLowerCase().includes(cidade.toLowerCase()) ? `${termo} ${cidade}` : termo
      termoAtual(q)
      const contas = await chamar(runId, c, () => igGet(`/api/v1/web/search/topsearch/?context=blended&query=${enc(q)}&include_reel=true`)).catch((e: Error) => {
        log(runId, `"${q}": ${e.message}`)
        return null
      })
      const tags = contas && input.hashtags ? coletarHashtags(contas).slice(0, 3) : []
      if (contas) yield { termo, perfis: coletarPerfis(contas) }
      let next: unknown = null
      let rank: unknown = null
      for (let p = 0; p < MAX_PAGINAS.palavra && !c.parar; p++) {
        await esperaBusca()
        const url = `/api/v1/fbsearch/web/top_serp/?enable_metadata=true&query=${enc(q)}${next ? `&next_max_id=${enc(String(next))}` : ''}${rank ? `&rank_token=${enc(String(rank))}` : ''}`
        const j = await chamar(runId, c, () => igGet(url), { pularSeLimite: true }).catch((e: Error) => {
          log(runId, `Posts de "${q}": ${e instanceof IgErro && e.tipo === 'limite' ? 'o Instagram limitou esta parte da busca; seguindo com o resto' : e.message}`)
          return null
        })
        if (!j) break
        yield { termo, perfis: coletarPerfis(j) }
        next = acharChave(j, 'next_max_id')
        rank = acharChave(j, 'rank_token') ?? rank
        if (!next || acharChave(j, 'has_more') === false) break
      }
      for (const tag of tags) {
        if (c.parar) return
        await esperaBusca()
        yield* hashtag(tag, termo, MAX_PAGINAS.relacionada)
      }
    }
  }

  async function terminar(runId: string, fase: IgFase, extra: Partial<IgEstado> = {}) {
    patch(runId, { fase, fim: new Date().toISOString(), esperaAte: null, ...extra })
    await get().salvar()
    const e = get().estado
    if (!e || e.runId !== runId) return
    const h: IgHistorico = {
      id: runId,
      quando: e.inicio,
      fonte: e.input.fonte,
      termos: e.input.termos,
      lidos: e.lidos,
      aprovados: e.aprovados.length,
      salvos: e.salvos,
      fim: fase,
      duracaoMs: Date.now() - Date.parse(e.inicio),
    }
    const historico = [h, ...lerHistorico().filter((x) => x.id !== runId)].slice(0, 30)
    gravar('historico', historico)
    set({ historico })
    if (e.salvos)
      useApp.getState().toast(`${e.salvos} lead(s) do Instagram entraram na sua lista.`, 'success', {
        label: 'Ver leads',
        run: () => (window.location.href = '/leads'),
      })
  }

  return {
    estado: null,
    extensao: { verificando: false, versao: null, conta: null, erro: null },
    hoje: lerHoje(),
    historico: lerHistorico(),

    async verificar(abrir = false) {
      set((s) => ({ extensao: { ...s.extensao, verificando: true, erro: null } }))
      const versao = await detectarExtensao()
      if (!versao) return set({ extensao: { verificando: false, versao: null, conta: null, erro: null } })
      try {
        const r = await estadoExtensao(abrir)
        set({ extensao: { verificando: false, versao, conta: r.instagram, erro: null } })
      } catch (err) {
        set({ extensao: { verificando: false, versao, conta: null, erro: err instanceof Error ? err.message : 'A extensão não respondeu.' } })
      }
    },

    async buscar(input) {
      if (get().estado && ['buscando', 'pausada', 'esperando'].includes(get().estado!.fase)) return
      const c: Controle = { parar: false, pausado: false, acordar: null }
      ctrl = c
      const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      set({
        estado: {
          runId,
          input,
          fase: 'buscando',
          mensagem: 'Conectando ao Instagram…',
          termoAtual: '',
          achados: 0,
          lidos: 0,
          pulados: 0,
          aprovados: [],
          descartes: {},
          salvos: 0,
          logs: [],
          inicio: new Date().toISOString(),
          fim: null,
          modo: 'rapida',
          esperaAte: null,
          erro: null,
        },
      })
      log(runId, `Busca (${FONTE_LABEL[input.fonte]}): ${input.termos.join(', ')}${input.cidade ? ` · ${input.cidade}` : ''} · meta ${input.meta}`)

      // Conta do Instagram aberta no Chrome (e a própria conta nunca vira lead)
      await get().verificar(true)
      const ext = get().extensao
      if (!ext.versao) return void terminar(runId, 'erro', { erro: 'Instale a extensão XS · Instagram neste Chrome para buscar.', mensagem: 'Extensão não encontrada.' })
      if (!ext.conta?.logado) {
        log(runId, 'Entre numa conta na aba do Instagram e clique em Continuar.')
        c.pausado = true
        patch(runId, { fase: 'pausada', mensagem: 'Entre numa conta na aba do Instagram e clique em Continuar.' })
      }
      const minhaConta = ext.conta?.usuario?.toLowerCase() ?? null
      const podePagina = !!ext.versao && !versaoAntiga(ext.versao, PAGINA_DESDE)
      if (!podePagina) log(runId, 'A extensão instalada é antiga: atualize para a busca não parar quando o Instagram barrar a leitura rápida.')
      const lerUm = criarLeitor(runId, podePagina)

      const app = useApp.getState()
      const conhecidos = chavesDosLeads(app.leads)
      const vistos = lerVistos()
      const naFila = new Set<string>()
      const telefonesAprovados = new Set<string>()
      const descartar = (m: Motivo) => patch(runId, (e) => ({ descartes: { ...e.descartes, [m]: (e.descartes[m] ?? 0) + 1 } }))
      const esperaPerfil = () => dormir(c, entre(ESPERA[input.velocidade]))
      let lidosDesdeGravar = 0

      try {
        for await (const lote of candidatos(runId, c, input, lerUm)) {
          const novos = lote.perfis.filter((p) => !naFila.has(p.usuario) && p.usuario !== minhaConta)
          for (const p of novos) naFila.add(p.usuario)
          patch(runId, (e) => ({ achados: e.achados + novos.length }))

          for (const cand of novos) {
            if (c.parar) break
            if (get().estado!.aprovados.length >= input.meta) break
            if (conhecidos.usuarios.has(cand.usuario)) {
              descartar('ja_lead')
              continue
            }
            if (!input.reler && vistos.has(cand.usuario)) {
              patch(runId, (e) => ({ pulados: e.pulados + 1 }))
              continue
            }
            if (cand.privado === true) {
              descartar('privado')
              vistos.set(cand.usuario, Date.now())
              continue
            }

            await esperaPerfil()
            patch(runId, { mensagem: `Abrindo @${cand.usuario}…` })
            let perfil: IgPerfil | null = null
            try {
              perfil = await chamar(runId, c, () => lerUm(cand.usuario))
              if (c.parar) break
            } catch (err) {
              if (err instanceof IgErro && (err.tipo === 'nao_existe' || err.tipo === 'falha')) {
                descartar(err.tipo === 'nao_existe' ? 'nao_existe' : 'falha')
                continue
              }
              throw err
            }
            vistos.set(cand.usuario, Date.now())
            somarHoje({ perfis: 1 })
            patch(runId, (e) => ({ lidos: e.lidos + 1 }))
            if (++lidosDesdeGravar >= 20) {
              gravarVistos(vistos)
              lidosDesdeGravar = 0
            }
            if (!perfil) {
              descartar('nao_existe')
              continue
            }

            const tel = phoneKey(perfil.telefone)
            const motivo: Motivo | null = tel && (conhecidos.telefones.has(tel) || telefonesAprovados.has(tel)) ? 'ja_lead' : motivoDescarte(perfil, input.filtros, input.cidade)
            if (motivo) {
              descartar(motivo)
              continue
            }
            if (tel) telefonesAprovados.add(tel)
            patch(runId, (e) => ({ aprovados: [...e.aprovados, { ...perfil!, termo: lote.termo, salvo: false }] }))
            const e = get().estado!
            log(runId, `Aprovado: @${perfil.usuario}${perfil.nome ? ` (${perfil.nome})` : ''}`)
            if (e.aprovados.filter((a) => !a.salvo).length >= LOTE) void get().salvar()
          }
          if (c.parar || get().estado!.aprovados.length >= input.meta) break
        }
        gravarVistos(vistos)
        const e = get().estado!
        if (c.parar) return void terminar(runId, 'parada', { mensagem: `Busca parada. ${e.aprovados.length} perfil(is) aprovados.` })
        const bateu = e.aprovados.length >= input.meta
        log(runId, bateu ? 'Meta atingida.' : 'Não há mais perfis nessas buscas.')
        await terminar(runId, 'concluida', {
          mensagem: bateu
            ? `Meta atingida: ${e.aprovados.length} perfil(is) aprovados.`
            : `Acabaram os perfis dessas buscas: ${e.aprovados.length} aprovado(s) de ${e.lidos} aberto(s).${e.aprovados.length < 5 ? ' Tente outras palavras, hashtags ou afrouxe os filtros.' : ''}`,
        })
      } catch (err) {
        gravarVistos(vistos)
        const msg = err instanceof Error ? err.message : 'Falha na busca.'
        log(runId, `Erro: ${msg}`)
        await terminar(runId, 'erro', { erro: msg, mensagem: msg })
      } finally {
        if (ctrl === c) ctrl = null
      }
    },

    pausar() {
      const e = get().estado
      if (!ctrl || !e || e.fase !== 'buscando') return
      ctrl.pausado = true
      set({ estado: { ...e, fase: 'pausada', mensagem: 'Busca pausada.' } })
      void get().salvar()
    },

    continuar() {
      const e = get().estado
      if (!ctrl || !e) return
      // Pular a pausa automática: tenta agora
      if (e.fase === 'esperando') set({ estado: { ...e, esperaAte: Date.now() } })
      ctrl.pausado = false
      ctrl.acordar?.()
      ctrl.acordar = null
      if (e.fase === 'pausada') set({ estado: { ...e, fase: 'buscando', mensagem: 'Continuando…' } })
    },

    parar() {
      if (!ctrl) return
      ctrl.parar = true
      ctrl.pausado = false
      ctrl.acordar?.()
    },

    async salvar() {
      // Um salvamento por vez: o próximo pega o que sobrou
      while (salvando) await salvando
      const e = get().estado
      if (!e) return
      const pendentes = e.aprovados.filter((a) => !a.salvo)
      if (!pendentes.length) return
      const app = useApp.getState()
      if (!app.ready || !app.repo) return
      salvando = (async () => {
        try {
          const conhecidos = chavesDosLeads(app.leads)
          const novos = pendentes.filter((p) => {
            const t = phoneKey(p.telefone)
            return !conhecidos.usuarios.has(p.usuario) && !(t && conhecidos.telefones.has(t))
          })
          const nicho = e.input.nicho.trim()
          const busca = (termo: string) => `${FONTE_LABEL[e.input.fonte]}: ${termo}`
          const n = novos.length
            ? await app.importLeads(
                novos.map((p, i) => perfilParaLead(p, { nicho: nicho || p.categoria || (e.input.fonte === 'palavra' ? p.termo : ''), busca: busca(p.termo) }, i)),
                `Instagram · ${FONTE_LABEL[e.input.fonte]} · ${e.input.termos.join(', ')}`.slice(0, 160),
              )
            : 0
          const feitos = new Set(pendentes.map((p) => p.usuario))
          set((s) =>
            s.estado?.runId === e.runId
              ? { estado: { ...s.estado, salvos: s.estado.salvos + n, aprovados: s.estado.aprovados.map((a) => (feitos.has(a.usuario) ? { ...a, salvo: true } : a)) } }
              : s,
          )
          if (n) {
            somarHoje({ leads: n })
            log(e.runId, `${n} lead(s) salvos na sua lista.`)
          }
        } catch (err) {
          log(e.runId, `Não consegui salvar nos leads: ${err instanceof Error ? err.message : 'erro'}`)
        }
      })()
      try {
        await salvando
      } finally {
        salvando = null
      }
    },
  }
})
