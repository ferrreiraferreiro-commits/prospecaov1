// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Agente IA de vendas: roda no WhatsApp do dono (sessão "principal", XS_AGENTE=1), 24 h na VPS.
 *
 *  - Busca empresas na base aberta (cidades e tipos de negócio que você escolher), filtra e põe na fila.
 *  - Aborda algumas por dia (a cota sobe devagar), com a primeira mensagem escrita para cada empresa.
 *  - Responde quem responde, faz follow-up de quem sumiu e fecha a venda ou chama você.
 *  - Avisa no seu outro número: lead quente, reunião, venda, quem precisa de você e o resumo do dia.
 *  - Aprende: suas correções e o resultado das conversas viram lições que entram nas próximas.
 *
 * Uma ação por vez (ciclo a cada 15 s). Você responder pelo celular = o agente para naquela conversa.
 */
import { randomUUID } from 'node:crypto'
import type { WAMessageKey } from '@whiskeysockets/baileys'
import { abrirConversa, conversaEventos } from '../conversas.js'
import { recipientByPhone, sentPhones } from '../disparo.js'
import { formatBrazilPhone, getSock, getWa, isValidBrazilWhatsApp, registerSent, samePhone, sendText, sentByThisMotor, waEvents, withTimeout } from '../whatsapp.js'
import { buscarTrechos, materiaisComTreino, textoDoMaterial } from './base.js'
import { limparCapacidades, pode } from './capacidades.js'
import { CONFERENCIAS, conferir, conferirLegal, linksDe, parecenca, pareceManipulacao, precisaAprovacao, requisitosNivel, type ContextoConferencia } from './conferente.js'
import { completarConfig, db, gravarChaves, lerChaves, salvar } from './estado.js'
import { buscarNoGoogle, caixaDaCidade, ErroGoogle, notaEncaixe, type ResultadoGoogle } from './google.js'
import * as ia from './ia.js'
import * as apoioIA from './ia-apoio.js'
import { blocoRoteiro } from './metodo.js'
import { testarGemini, testarXai, usarChaves } from './outras-ias.js'
import { calcularPadroes, faixaBoa, horariosLivres, numerosDoRamo, rotuloHorario, taxaDoRamo, type Padroes } from './padroes.js'
import {
  analisarTeste,
  boaHoraPara,
  cotaDoDia,
  cumprimento,
  dentroDoHorario,
  diaDe,
  escolherAlvo,
  esperaRespostaMs,
  intervaloAbordagemMs,
  pareceAutomatica,
  pediuParaParar,
  phoneKey,
  precisaFrear,
  proximaAbertura,
  respondeu,
  saudeDoNumero,
  tempoDigitandoMs,
} from './regras.js'
import {
  DIA_VAZIO,
  ESTADOS_ATIVOS,
  MODELOS,
  type AgenteConfig,
  type Alvo,
  type Atividade,
  type Conversa,
  type Dia,
  type Estado,
  type FilaItem,
  type Licao,
  type Mensagem,
  type Modelo,
  type NichoBusca,
  type NomeAgente,
  type Pendencia,
  type Piloto,
  type Teste,
  type Trace,
  type Variante,
  provedorDe,
  type Provedor,
} from './tipos.js'

/** Só a sessão do dono liga o agente (no systemd: /etc/xs-whatsapp/motor-principal.env). */
export const AGENTE_LIGADO = process.env.XS_AGENTE === '1'

/** Mensagens do agente numa conversa no mesmo dia antes de parar e chamar você (evita conversa sem fim com outro robô) */
const MAX_POR_CONVERSA_DIA = 30
/** Lições automáticas ativas de cada tipo (as suas não entram na conta) */
const MAX_LICOES_AUTO = 40

const chaves = lerChaves()
usarChaves(() => chaves)
/** A chave da IA do modelo escolhido (Claude, Gemini ou Grok) */
let chave = ''
function chaveDe(modelo: Modelo) {
  const p = provedorDe(modelo)
  // Gemini sem chave mas com Grok: o Grok responde sozinho
  return p === 'gemini' ? chaves.gemini || chaves.xai : p === 'xai' ? chaves.xai : chaves.anthropic
}
function atualizarChave() {
  chave = chaveDe(db.config.modelo)
}
atualizarChave()
/** A IA recusou a chave (ou acabou o crédito): para até você trocar a chave */
let chaveRecusada = false
let proximaAbordagem = 0
let proximoFollowup = 0
let avisouLimite = ''

const iso = () => new Date().toISOString()
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function hoje(d = new Date()): Dia {
  const k = diaDe(d)
  return (db.dias[k] ??= { ...DIA_VAZIO })
}

function registrar(tipo: Atividade['tipo'], texto: string, conversa?: string) {
  db.atividade.push({ em: iso(), tipo, texto, conversa })
  if (db.atividade.length > 500) db.atividade.splice(0, db.atividade.length - 500)
  if (tipo === 'erro') db.extra.ultimoErro = texto
  salvar()
}

const ctx = (): ia.Contexto => ({ chave, cfg: db.config, licoes: db.licoes })

/** Para o Xico (o assistente do dono): a mesma chave e o mesmo caixa de gasto do dia. */
export const chaveDaApi = () => chave
/** O chat do Xico da XS usa ferramentas do Claude: precisa da chave da Anthropic mesmo com o vendedor no Gemini. */
export const chaveAnthropic = () => chaves.anthropic
export const modeloClaude = (): Modelo => (provedorDe(db.config.modelo) === 'anthropic' ? db.config.modelo : 'claude-opus-5-5')
export function registrarGasto(custo: number) {
  hoje().custoUSD += custo
  salvar()
}

/** Chama a IA, conta o gasto e transforma falha em registro (devolve null). */
async function comIA<T>(fn: () => Promise<{ dados: T; uso: ia.Uso }>, oQue: string): Promise<T | null> {
  try {
    const r = await fn()
    hoje().custoUSD += r.uso.custo
    db.extra.ultimoErro = null
    salvar()
    return r.dados
  } catch (err) {
    const uso = (err as { uso?: ia.Uso }).uso
    if (uso) hoje().custoUSD += uso.custo
    const e = err instanceof ia.ErroIA ? err : new ia.ErroIA((err as Error).message)
    if (e.bloqueante) {
      chaveRecusada = true
      void avisarDono(`⚠️ O agente parou: ${e.message}`)
    }
    registrar('erro', `${oQue}: ${e.message}`)
    return null
  }
}

function porTelefone(phone: string): Conversa | undefined {
  return db.conversas
    .filter((c) => samePhone(c.telefone, phone))
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))[0]
}

const limparTexto = (t: string) =>
  String(t ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 1200)

/** Manda os balões como gente: marca como lida, "digitando…" proporcional ao texto, pausa entre eles. */
async function enviar(c: Conversa, textos: string[], de: Mensagem['de'] = 'agente', trace?: Trace): Promise<number> {
  const sock = getSock()
  if (!sock) throw new Error('WhatsApp desconectado.')
  const jid = c.jid ?? `${c.telefone}@s.whatsapp.net`
  if (c.ultimaChave) {
    await sock.readMessages([c.ultimaChave as WAMessageKey]).catch(() => undefined)
    c.ultimaChave = null
  }
  let n = 0
  for (const bruto of textos) {
    const texto = limparTexto(bruto)
    if (!texto) continue
    if (de === 'agente') {
      await sock.sendPresenceUpdate('composing', jid).catch(() => undefined)
      await dormir(tempoDigitandoMs(texto))
      await sock.sendPresenceUpdate('paused', jid).catch(() => undefined)
    }
    const s = getSock()
    if (!s) throw new Error('WhatsApp desconectado.')
    const res = await withTimeout(s.sendMessage(jid, { text: texto }), 25_000, 'Tempo esgotado ao enviar.')
    const id = res?.key?.id
    if (!id) throw new Error('O WhatsApp não confirmou o envio.')
    registerSent(id)
    c.mensagens.push({ id: randomUUID(), de, texto, em: iso(), waId: id, ...(trace ? { trace } : {}) })
    c.atualizadaEm = iso()
    hoje().enviadas++
    n++
    salvar()
    await dormir(800 + Math.random() * 1500)
  }
  return n
}

/** Aviso no outro número do dono. */
async function avisarDono(texto: string) {
  const tel = db.config.avisos.telefone
  if (!tel || !getSock()) return
  try {
    await sendText(tel, `🤖 Agente XS\n${texto}`)
  } catch (err) {
    db.atividade.push({ em: iso(), tipo: 'erro', texto: `Não consegui avisar no seu número: ${(err as Error).message}` })
  }
}

const link = (c: Conversa) => `wa.me/${c.telefone}`

/** O que mais a busca trouxe e ajuda a personalizar a conversa (bairro, categoria, nota, responsável). */
export function detalhesDoBruto(bruto: Record<string, unknown> | null | undefined): string {
  if (!bruto) return ''
  const s = (k: string) => (typeof bruto[k] === 'string' ? (bruto[k] as string).trim() : '')
  const n = (k: string) => (typeof bruto[k] === 'number' && Number.isFinite(bruto[k]) ? (bruto[k] as number) : 0)
  const nota = n('rating')
  const avaliacoes = n('reviewsCount')
  return [
    s('neighborhood') && `Bairro: ${s('neighborhood')}`,
    s('category') && s('category').toLowerCase() !== s('niche').toLowerCase() && `Categoria no Google: ${s('category')}`,
    nota > 0 && `Nota no Google: ${nota.toFixed(1).replace('.', ',')}${avaliacoes ? ` (${avaliacoes} avaliações)` : ''}`,
    s('facebook') && 'Tem página no Facebook',
    s('responsibleName') && bruto.enrichmentConfidence === 'confirmed' && `Responsável: ${s('responsibleName')}${s('responsibleRole') ? ` (${s('responsibleRole')})` : ''}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const comDetalhes = (c: Conversa) => ({ ...c, detalhes: detalhesDoBruto(c.bruto) })

// ---------------------------------------------------------------------------
// Apoio: roteiro do ramo, material consultado, ficha do cliente e agenda
// ---------------------------------------------------------------------------

let padroesCache: { em: number; p: Padroes } | null = null
/** Padrões das conversas (recalcula a cada 10 min). */
export function padroes(): Padroes {
  if (!padroesCache || Date.now() - padroesCache.em > 10 * 60_000) padroesCache = { em: Date.now(), p: calcularPadroes(db.conversas) }
  return padroesCache.p
}

const materiais = () => materiaisComTreino(db.materiais, db.config)

/** Lições valendo de um ramo (vão junto do roteiro do ramo). */
function licoesDoRamo(nicho: string): string[] {
  const n = nicho.toLowerCase()
  return ia
    .licoesValendo(db.licoes)
    .filter((l) => l.tipo === 'conversa' && l.escopo?.toLowerCase() === `ramo:${n}`)
    .map((l) => l.texto)
}

function apoioPara(c: Pick<Conversa, 'nicho' | 'mensagens'> & { fatos?: Conversa['fatos'] }, consulta: string, comAgenda = true): ia.Apoio {
  const cfg = db.config
  return {
    roteiro: blocoRoteiro(c.nicho, licoesDoRamo(c.nicho), numerosDoRamo(padroes(), c.nicho)),
    trechos: pode(cfg, 'consultar_base') ? buscarTrechos(materiais(), `${consulta} ${c.nicho}`).map((t) => ({ titulo: t.titulo, texto: t.texto })) : [],
    fatos: c.fatos ?? [],
    horarios: comAgenda && pode(cfg, 'ver_horarios') && pode(cfg, 'marcar_reuniao') ? horariosLivres(cfg.agenda, db.reunioes).map(rotuloHorario) : [],
  }
}

/** O que o cliente disse por último (para procurar no material). */
const ultimasDoCliente = (c: Pick<Conversa, 'mensagens'>) =>
  c.mensagens
    .filter((m) => m.de === 'lead' && !m.auto)
    .slice(-3)
    .map((m) => m.texto)
    .join(' ')

// ---------------------------------------------------------------------------
// O Conferente e os níveis de piloto (antes de cada mensagem sair)
// ---------------------------------------------------------------------------

/** Conferências que não adianta reescrever (o problema não é o texto). */
const SEM_REESCRITA = new Set(['parar', 'lgpd', 'horario', 'ritmo', 'robo_robo'])

/** Textos que saíram para outras pessoas nos últimos dias (para não repetir). */
function enviadosOutros(c: Conversa): string[] {
  const limite = Date.now() - 7 * 86_400_000
  const out: { em: string; texto: string }[] = []
  for (const x of db.conversas) {
    if (x.id === c.id) continue
    for (const m of x.mensagens) if (m.de === 'agente' && Date.parse(m.em) > limite) out.push(m)
  }
  return out
    .sort((a, b) => b.em.localeCompare(a.em))
    .slice(0, 300)
    .map((m) => m.texto)
}

function linksPermitidos(): string[] {
  const cfg = db.config
  return [...new Set([...linksDe(textoDoMaterial(materiais())), ...linksDe(cfg.linksPermitidos), ...cfg.linksPermitidos.split(/\s+/).filter((l) => /\./.test(l))])]
}

function ritmoMotivo(c: Conversa, proativa: boolean, t = new Date()): string | null {
  if (db.extra.pausadoPorRisco) return 'O WhatsApp está em pausa por segurança.'
  if (proativa && db.extra.freio === diaDe(t)) return 'O freio de segurança está ligado hoje (muita gente pediu para parar).'
  const dia = diaDe(t)
  if (c.mensagens.filter((m) => m.de === 'agente' && diaDe(new Date(m.em)) === dia).length >= MAX_POR_CONVERSA_DIA) return `Já foram ${MAX_POR_CONVERSA_DIA} mensagens nesta conversa hoje.`
  return null
}

function contextoConferencia(c: Conversa, proativa: boolean, t = new Date()): ContextoConferencia {
  const cfg = db.config
  return {
    agora: t,
    mensagens: c.mensagens,
    estado: c.estado,
    proativa,
    bloqueado: db.extra.apagados.includes(phoneKey(c.telefone)),
    ritmo: ritmoMotivo(c, proativa, t),
    nicho: c.nicho,
    enviadosOutros: enviadosOutros(c),
    maxBolha: cfg.estiloResposta.maxBolha,
    material: textoDoMaterial(materiais(), t),
    descontoMax: pode(cfg, 'negociar') ? cfg.negocio.descontoMax : 0,
    linksPermitidos: linksPermitidos(),
    podePreco: pode(cfg, 'passar_preco'),
    podePix: pode(cfg, 'mandar_pix'),
    dono: cfg.negocio.seuNome.trim(),
    proibidos: cfg.conferencias.assuntosProibidos ? cfg.conferencias.proibidos.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) : null,
  }
}

export interface Pronto {
  mensagens: string[]
  acao: string
  /** O que mais a ação precisa (horário escolhido, aviso para você, resumo) */
  dados?: Record<string, unknown>
}

type Saida =
  | { tipo: 'enviada'; final: Pronto; trace: Trace }
  | { tipo: 'aguardando'; pendencia: Pendencia }
  | { tipo: 'barrada'; motivo: string; id: string; pendencia: Pendencia | null }

/** Conferências + reescrita guiada pelo motivo (até 2 vezes). */
async function conferirComReescrita(
  c: Conversa,
  inicial: Pronto,
  o: { agente: NomeAgente; proativa: boolean; fontes: string[]; horarios: string[]; refazer?: (atual: Pronto, motivo: string) => Promise<Pronto | null> },
): Promise<{ ok: true; final: Pronto; trace: Trace } | { ok: false; final: Pronto; id: string; titulo: string; motivo: string; trace: Trace }> {
  const cfg = db.config
  let atual: Pronto = { ...inicial, mensagens: inicial.mensagens.map(limparTexto).filter(Boolean) }
  const trace: Trace = { agente: o.agente, fontes: o.fontes, conferencias: 0, reescritas: 0, barradas: [] }
  for (let tentativa = 0; ; tentativa++) {
    let r = conferir({ mensagens: atual.mensagens, acao: atual.acao, horariosOferecidos: o.horarios }, contextoConferencia(c, o.proativa))
    if (r.ok && cfg.conferencias.revisorTom && atual.mensagens.length && chave && !chaveRecusada) {
      const tom = await comIA(() => apoioIA.revisarTom(ctx(), atual.mensagens), 'Revisor de tom')
      if (tom && !tom.sim) r = { ok: false, id: 'tom', titulo: 'Revisor de tom', motivo: tom.motivo || 'Soa robótico. Escreva mais natural.', passou: r.passou }
    }
    trace.conferencias = r.passou.length
    if (r.ok) return { ok: true, final: atual, trace }
    trace.barradas.push(`${r.titulo}: ${r.motivo}`)
    hoje().barradas = (hoje().barradas ?? 0) + 1
    if (SEM_REESCRITA.has(r.id) || !o.refazer || tentativa >= 2) return { ok: false, final: atual, id: r.id, titulo: r.titulo, motivo: r.motivo, trace }
    const novo = await o.refazer(atual, r.motivo)
    trace.reescritas++
    hoje().reescritas = (hoje().reescritas ?? 0) + 1
    if (!novo) return { ok: false, final: atual, id: r.id, titulo: r.titulo, motivo: r.motivo, trace }
    atual = { ...novo, mensagens: novo.mensagens.map(limparTexto).filter(Boolean) }
    if (!atual.mensagens.length) return { ok: true, final: atual, trace }
  }
}

function novaPendencia(p: Omit<Pendencia, 'id' | 'criadaEm'>): Pendencia {
  const pend: Pendencia = { id: randomUUID(), criadaEm: iso(), ...p }
  db.pendencias.push(pend)
  // Guarda as últimas 400 (as resolvidas mais antigas saem primeiro)
  if (db.pendencias.length > 400) {
    const i = db.pendencias.findIndex((x) => x.resolvidaEm)
    db.pendencias.splice(i >= 0 ? i : 0, 1)
  }
  registrar('pendencia', `${p.empresa ? `${p.empresa}: ` : ''}${p.texto}`, p.conversaId ?? undefined)
  return pend
}

let avisouAprovacao = 0
/** Avisa no seu número que tem mensagem esperando (no máximo uma vez por hora). */
function avisarAprovacoes() {
  if (Date.now() - avisouAprovacao < 3_600_000) return
  avisouAprovacao = Date.now()
  const n = db.pendencias.filter((p) => !p.resolvidaEm && (p.tipo === 'aprovar' || p.tipo === 'barrada')).length
  if (n) void avisarDono(`📝 ${n} mensagem(ns) esperando você na XS (Vendedor → Precisa de você).`)
}

/**
 * O caminho de toda mensagem do agente: confere (e reescreve), vê se o nível de piloto pede a sua
 * aprovação e só então envia. Barrada de vez ou esperando você: vai para "Precisa de você".
 */
async function sair(
  c: Conversa,
  pronto: Pronto,
  o: { agente: NomeAgente; proativa: boolean; fontes?: string[]; horarios?: string[]; refazer?: (atual: Pronto, motivo: string) => Promise<Pronto | null>; maxBolhas?: number },
): Promise<Saida> {
  const r = await conferirComReescrita(c, { ...pronto, mensagens: pronto.mensagens.slice(0, o.maxBolhas ?? 3) }, { agente: o.agente, proativa: o.proativa, fontes: o.fontes ?? [], horarios: o.horarios ?? [], refazer: o.refazer })
  const rascunho = (final: Pronto, trace: Trace) => ({ mensagens: final.mensagens, acao: final.acao, agente: o.agente, fontes: trace.fontes, reescritas: trace.reescritas, barradas: trace.barradas, dados: final.dados })
  if (!r.ok) {
    if (SEM_REESCRITA.has(r.id) && r.id !== 'robo_robo') return { tipo: 'barrada', motivo: r.motivo, id: r.id, pendencia: null }
    registrar('barrada', `${c.empresa}: ${r.titulo} — ${r.motivo}`, c.id)
    const p = novaPendencia({ tipo: r.id === 'robo_robo' ? 'pessoa' : 'barrada', texto: r.id === 'robo_robo' ? 'O outro lado parece um robô. Dê uma olhada.' : 'A mensagem foi barrada pela conferência e não saiu.', conversaId: c.id, empresa: c.empresa, motivo: `${r.titulo}: ${r.motivo}`, rascunho: rascunho(r.final, r.trace) })
    c.aguardandoVoce = p.id
    c.pendente = false
    // Vai para "Precisa de você" (você aprova, edita ou descarta); robô do outro lado: a conversa fica com você
    if (r.id === 'robo_robo' && c.mensagens.length) c.estado = 'humano'
    void avisarDono(`🛑 Barrei uma mensagem para ${c.empresa}: ${r.titulo}. ${r.motivo}\nEstá em Precisa de você.\n${link(c)}`)
    verificarDescida()
    salvar()
    return { tipo: 'barrada', motivo: r.motivo, id: r.id, pendencia: p }
  }
  if (!r.final.mensagens.length) return { tipo: 'enviada', final: r.final, trace: r.trace }
  const precisa = precisaAprovacao(db.config.piloto, { mensagens: r.final.mensagens, acao: r.final.acao })
  if (precisa) {
    const p = novaPendencia({ tipo: 'aprovar', texto: precisa, conversaId: c.id, empresa: c.empresa, rascunho: rascunho(r.final, r.trace), prazo: new Date(Date.now() + 2 * 3_600_000).toISOString() })
    c.aguardandoVoce = p.id
    c.pendente = false
    avisarAprovacoes()
    salvar()
    return { tipo: 'aguardando', pendencia: p }
  }
  await enviar(c, r.final.mensagens, 'agente', r.trace)
  return { tipo: 'enviada', final: r.final, trace: r.trace }
}

/** Resposta da IA → o que o Conferente recebe. */
const doIA = (d: ia.RespostaIA): Pronto => ({ mensagens: d.mensagens, acao: d.acao, dados: { temperatura: d.temperatura, resumo: d.resumo, aviso_dono: d.aviso_dono, horario: d.horario } })

/** Desce um nível sozinho quando algo dá errado (e avisa você). */
function descerNivel(motivo: string) {
  const cfg = db.config
  if (cfg.piloto <= 1) return
  cfg.piloto = (cfg.piloto - 1) as Piloto
  db.extra.desceuNivel = { em: iso(), motivo }
  registrar('nivel', `Desceu para o nível ${cfg.piloto}: ${motivo}`)
  void avisarDono(`⬇️ O vendedor desceu para o nível ${cfg.piloto} de piloto: ${motivo}. Ele sobe de novo quando você quiser, na XS.`)
  salvar(true)
}

/** Três mensagens barradas de vez no mesmo dia: desce um nível. */
function verificarDescida() {
  const dia = diaDe()
  const barradasHoje = db.pendencias.filter((p) => p.tipo === 'barrada' && diaDe(new Date(p.criadaEm)) === dia).length
  if (barradasHoje >= 3 && db.extra.desceuNivel?.em.slice(0, 10) !== dia) descerNivel('três mensagens barradas pela conferência hoje')
}

/** Guarda na ficha o que o cliente contou (e o retorno combinado). */
function anotarFatos(c: Conversa, fatos: ia.RespostaIA['fatos']) {
  if (!pode(db.config, 'anotar_fatos') || !fatos?.length) return
  c.fatos ??= []
  for (const f of fatos) {
    const valor = String(f.valor ?? '').trim().slice(0, 300)
    if (!valor) continue
    const i = c.fatos.findIndex((x) => x.chave === f.chave && f.chave !== 'outro' && f.chave !== 'objecao')
    const fato = { chave: f.chave, valor, em: iso() }
    if (i >= 0) c.fatos[i] = fato
    else c.fatos.push(fato)
    if (f.chave === 'retomar_em' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && valor > diaDe()) c.retomarEm = valor
  }
  if (c.fatos.length > 30) c.fatos.splice(0, c.fatos.length - 30)
}

/** Pergunta que o material não respondeu: vira um aviso (junta as parecidas). */
function anotarLacuna(c: Conversa, lacuna: string) {
  const t = lacuna.trim()
  if (!t || !pode(db.config, 'avisar_lacuna')) return
  const aberta = db.pendencias.find((p) => p.tipo === 'lacuna' && !p.resolvidaEm && parecenca(p.motivo ?? '', t) >= 0.5)
  if (aberta) {
    const n = Number((aberta.texto.match(/^(\d+)/) ?? [])[1] ?? 1) + 1
    aberta.texto = `${n} clientes perguntaram e o seu material não responde.`
    return
  }
  novaPendencia({ tipo: 'lacuna', texto: '1 cliente perguntou e o seu material não responde.', motivo: t.slice(0, 300), conversaId: c.id, empresa: c.empresa })
}

// ---------------------------------------------------------------------------
// Aprendizado
// ---------------------------------------------------------------------------

function guardarLicao(tipo: Licao['tipo'], texto: string, origem: Licao['origem'], extra: Partial<Licao> = {}): Licao | null {
  const t = texto.trim()
  if (!t) return null
  const status = extra.status ?? 'ativa'
  const l: Licao = {
    id: randomUUID(),
    tipo,
    texto: t.slice(0, 400),
    origem,
    ativa: status === 'ativa',
    em: iso(),
    escopo: 'geral',
    confianca: origem === 'voce' ? 'alta' : 'media',
    revisarEm: diaDe(new Date(Date.now() + 60 * 86_400_000)),
    ...extra,
    status,
  }
  db.licoes.push(l)
  // Só as automáticas mais novas ficam ativas; as que você escreveu nunca saem sozinhas
  const auto = db.licoes.filter((x) => x.tipo === tipo && x.ativa && x.origem !== 'voce')
  for (const velha of auto.slice(0, Math.max(0, auto.length - MAX_LICOES_AUTO))) {
    velha.ativa = false
    velha.status = 'arquivada'
  }
  registrar('licao', status === 'proposta' ? `Propôs uma lição: ${l.texto}` : `Aprendeu: ${l.texto}`)
  return l
}

/** Fim de conversa: o Professor lê à noite (a reflexão vira proposta de lição para você aprovar). */
function aprenderCom(c: Conversa, _resultado: string) {
  c.refletidaEm = null
}

// ---------------------------------------------------------------------------
// Mensagens que chegam e que saem
// ---------------------------------------------------------------------------

/** Quem respondeu a um Disparo vira conversa do agente (com as mensagens da campanha no histórico). */
function daCampanha(phone: string): Conversa | undefined {
  const r = recipientByPhone(phone)
  if (!r) return undefined
  const agora = iso()
  const c = novaConversa({ telefone: formatBrazilPhone(phone), empresa: r.nome, origem: 'disparo', leadId: r.leadId })
  c.mensagens = r.textos.map((texto) => ({ id: randomUUID(), de: 'voce' as const, texto, em: agora }))
  c.sinc.mensagens = c.mensagens.length
  db.conversas.push(c)
  registrar('aviso', `${c.empresa} respondeu ao disparo "${r.campanha}": o agente assumiu a conversa`, c.id)
  return c
}

function novaConversa(p: Partial<Conversa> & Pick<Conversa, 'telefone' | 'empresa' | 'origem'>): Conversa {
  const agora = iso()
  return {
    id: randomUUID(),
    jid: null,
    nicho: '',
    cidade: '',
    uf: '',
    endereco: '',
    site: '',
    instagram: '',
    alvoId: null,
    leadId: null,
    bruto: null,
    estado: 'aguardando',
    temperatura: 'frio',
    resumo: '',
    mensagens: [],
    followups: 0,
    pendente: false,
    responderEm: null,
    ultimaChave: null,
    avisadoQuente: false,
    criadaEm: agora,
    atualizadaEm: agora,
    sinc: { mensagens: 0, estado: null, lead: !!p.leadId },
    ...p,
  }
}

/** Mensagem do cliente (exportada para os testes). */
export function receber(phone: string, texto: string, key: WAMessageKey) {
  const cfg = db.config
  if (cfg.avisos.telefone && samePhone(phone, cfg.avisos.telefone)) return comandoDoDono(texto)
  const c = porTelefone(phone) ?? (cfg.ativo && cfg.responderDisparos ? daCampanha(phone) : undefined)
  if (!c) return
  // Resposta automática do WhatsApp Business antes de qualquer resposta de verdade: guarda, mas não
  // conta como resposta, não gasta IA e não zera o follow-up (a pessoa ainda não viu a mensagem)
  const nossa = c.mensagens.filter((m) => m.de !== 'lead').at(-1)
  const segundos = nossa ? (Date.now() - Date.parse(nossa.em)) / 1000 : Infinity
  const anterior = c.mensagens.at(-1)
  // Muita empresa manda 2 ou 3 mensagens automáticas seguidas (saudação, depois "sobre a empresa"):
  // o que chega até 30 s depois de uma automática também é automático (gente demora mais para digitar)
  const emSequencia = !!anterior?.auto && Date.now() - Date.parse(anterior.em) < 30_000
  if (!respondeu(c) && c.estado === 'aguardando' && !pediuParaParar(texto) && (emSequencia || pareceAutomatica(texto, segundos))) {
    c.mensagens.push({ id: randomUUID(), de: 'lead', texto: texto || '[mensagem sem texto]', em: iso(), auto: true })
    c.ultimaChave = key
    c.atualizadaEm = iso()
    // Só mandou o cumprimento: a resposta automática é a deixa para a apresentação (espera as outras chegarem)
    if (c.apresentar && cfg.ativo) {
      c.pendente = true
      c.responderEm = new Date(Date.now() + 60_000 + Math.random() * 60_000).toISOString()
    }
    if (!emSequencia) registrar('aviso', `${c.empresa} mandou uma resposta automática (não conta como resposta)`, c.id)
    else salvar()
    return
  }
  if (c.origem === 'agente' && !respondeu(c)) hoje().responderam++
  // Antes de ler: tentativa de manipular o assistente (regra sem custo; a IA confere depois, se ligada)
  c.mensagens.push({ id: randomUUID(), de: 'lead', texto: texto || '[mensagem sem texto]', em: iso(), ...(pareceManipulacao(texto) ? { manipulacao: true } : {}) })
  c.ultimaChave = key
  c.followups = 0
  c.atualizadaEm = iso()
  // Chegou mensagem nova: a resposta que esperava você ficou velha (ele escreve outra com tudo)
  if (c.aguardandoVoce) {
    const p = db.pendencias.find((x) => x.id === c.aguardandoVoce && !x.resolvidaEm)
    if (p && (p.tipo === 'aprovar' || p.tipo === 'barrada')) {
      p.resolvidaEm = iso()
      p.resultado = 'substituida'
      c.aguardandoVoce = null
    }
  }
  if (c.estado === 'optout') return salvar()
  if (pediuParaParar(texto)) return void optout(c)
  if (c.estado === 'fechado') {
    void avisarDono(`💬 ${c.empresa} (venda fechada) mandou mensagem:\n"${texto.slice(0, 300)}"\n${link(c)}`)
    return salvar()
  }
  if (c.estado === 'humano') return salvar()
  if (c.estado === 'aguardando' || c.estado === 'perdido' || c.estado === 'sem_resposta') c.estado = 'conversando'
  if (cfg.ativo) {
    c.pendente = true
    c.responderEm = new Date(Date.now() + esperaRespostaMs()).toISOString()
  }
  salvar()
}

/** Você mandou mensagem pelo celular para alguém em conversa com o agente: ele para ali. */
export function saiuPeloCelular(phone: string, texto: string, waId: string) {
  if (sentByThisMotor(waId)) return
  voceAssumiu(phone, texto, waId, 'pelo celular')
}

/** Você respondeu pela tela Conversas da XS: o agente para ali, igual ao celular. */
export function saiuPelaXS(phone: string, texto: string, waId: string) {
  voceAssumiu(phone, texto, waId, 'pela XS')
}

function voceAssumiu(phone: string, texto: string, waId: string, como: string) {
  const c = porTelefone(phone)
  if (!c || c.mensagens.some((m) => m.waId === waId)) return
  c.mensagens.push({ id: randomUUID(), de: 'voce', texto: texto || '[mídia]', em: iso(), waId })
  c.pendente = false
  c.atualizadaEm = iso()
  if (c.aguardandoVoce) {
    const p = db.pendencias.find((x) => x.id === c.aguardandoVoce && !x.resolvidaEm)
    if (p) Object.assign(p, { resolvidaEm: iso(), resultado: 'feita' })
    c.aguardandoVoce = null
  }
  if (c.estado !== 'optout' && c.estado !== 'fechado' && c.estado !== 'humano') {
    c.estado = 'humano'
    registrar('humano', `Você respondeu ${c.empresa} ${como}: o agente parou nessa conversa`, c.id)
  }
  salvar()
}

/** Pediu para parar: nada mais sai para essa pessoa (nem despedida), por nenhum caminho. */
async function optout(c: Conversa) {
  c.estado = 'optout'
  c.pendente = false
  c.aguardandoVoce = null
  hoje().optouts++
  db.extra.descartados.push(phoneKey(c.telefone))
  for (const p of db.pendencias) if (p.conversaId === c.id && !p.resolvidaEm && (p.tipo === 'aprovar' || p.tipo === 'barrada')) Object.assign(p, { resolvidaEm: iso(), resultado: 'substituida' })
  registrar('optout', `${c.empresa} pediu para não receber mais mensagens`, c.id)
  frearSePreciso()
  salvar()
}

/** Mensagem do seu número de avisos: "XS pausar" para tudo; "XS voltar" retoma. */
function comandoDoDono(texto: string) {
  const t = String(texto ?? '').trim().toLowerCase()
  if (/^xs\s+(pausar|pausa|parar|para)\b/.test(t)) {
    pararTudo('pelo WhatsApp')
    void avisarDono('⏸️ Parei tudo. Para voltar, mande "XS voltar" ou ligue na XS.')
  } else if (/^xs\s+(voltar|volta|retomar|ligar)\b/.test(t)) {
    try {
      voltarATrabalhar()
      void avisarDono('▶️ Voltei a trabalhar.')
    } catch (err) {
      void avisarDono(`Não consegui voltar: ${(err as Error).message}`)
    }
  } else if (/^xs\s+(status|como foi|resumo)\b/.test(t)) {
    const d = hoje()
    const esperando = db.pendencias.filter((p) => !p.resolvidaEm).length
    void avisarDono(`📊 Hoje: ${d.abordados} abordadas, ${d.responderam} responderam, ${d.quentes} quentes, ${d.vendas} vendas. ${esperando} item(ns) em "Precisa de você". Nível ${db.config.piloto}. ${db.config.ativo ? 'Ligado.' : 'Desligado.'}`)
  }
}

/** Botão de parar tudo (ou "XS pausar" no WhatsApp). */
export function pararTudo(como = 'pela XS') {
  db.config.ativo = false
  db.extra.paradoEm = iso()
  registrar('aviso', `Você parou tudo ${como}`)
  salvar(true)
}

export function voltarATrabalhar() {
  if (!chave) throw new Error('Falta a chave da IA.')
  db.config.ativo = true
  db.extra.paradoEm = null
  db.extra.pausadoPorRisco = null
  registrar('aviso', 'Voltou a trabalhar')
  salvar(true)
}

/**
 * Muita gente pedindo para parar no mesmo dia é o sinal que mais leva a bloqueio do número: a
 * prospecção para até amanhã (conversas em andamento continuam) e você recebe um aviso.
 */
function frearSePreciso(t = new Date()) {
  const d = hoje(t)
  if (db.extra.freio === diaDe(t) || !db.config.prospeccao.ativa || !precisaFrear(d)) return
  db.extra.freio = diaDe(t)
  registrar('aviso', `Freio de segurança: ${d.optouts} pessoas pediram para parar hoje (de ${d.abordados} abordadas). A prospecção para até amanhã para proteger o número.`)
  descerNivel('muita gente pediu para parar hoje')
  void avisarDono(`🛑 Freio de segurança: ${d.optouts} pessoas pediram para parar hoje (de ${d.abordados} abordadas). Parei de abordar empresas novas até amanhã para proteger o número; as conversas continuam. Vale revisar a primeira mensagem com o Xico.`)
}

// ---------------------------------------------------------------------------
// Responder, follow-up, prospectar, resumo do dia
// ---------------------------------------------------------------------------

/** Depois que a mensagem saiu (ou você aprovou): muda o estado da conversa conforme a ação. */
async function aplicarAcao(c: Conversa, f: Pronto, apresentou = false) {
  const d = f.dados ?? {}
  const temperatura = (d.temperatura as Conversa['temperatura']) ?? c.temperatura
  const resumo = String(d.resumo ?? '').trim()
  c.temperatura = temperatura
  if (resumo) c.resumo = resumo
  const aviso = (String(d.aviso_dono ?? '') || resumo).trim()
  switch (f.acao) {
    case 'chamar_dono':
      c.estado = 'humano'
      registrar('humano', `${c.empresa} precisa de você: ${aviso}`, c.id)
      novaPendencia({ tipo: 'pessoa', texto: 'Pediu para falar com você ou ele não soube responder.', motivo: aviso, conversaId: c.id, empresa: c.empresa, prazo: new Date(Date.now() + 2 * 3_600_000).toISOString() })
      await avisarDono(`🙋 ${c.empresa} precisa de você.\n${aviso}\n${link(c)}`)
      break
    case 'marcar_reuniao': {
      const quando = String(d.horario ?? '')
      const livre = horariosLivres(db.config.agenda, db.reunioes, new Date(), 12).find((h) => rotuloHorario(h) === quando)
      if (!livre || !pode(db.config, 'marcar_reuniao')) {
        c.estado = 'humano'
        novaPendencia({ tipo: 'reuniao', texto: `Combinou conversa${quando ? ` (${quando})` : ''}, mas o horário não está mais livre. Confirme com o cliente.`, conversaId: c.id, empresa: c.empresa })
        await avisarDono(`📅 ${c.empresa} quer conversar${quando ? ` (${quando})` : ''}, mas o horário não está mais livre. Confirme com o cliente.\n${link(c)}`)
        break
      }
      for (const r of db.reunioes) if (r.conversaId === c.id && (r.estado === 'marcada' || r.estado === 'confirmada')) r.estado = 'cancelada'
      db.reunioes.push({ id: randomUUID(), conversaId: c.id, empresa: c.empresa, telefone: c.telefone, inicio: livre.toISOString(), fim: new Date(livre.getTime() + db.config.agenda.duracaoMin * 60_000).toISOString(), estado: 'marcada', criadaEm: iso() })
      c.estado = 'reuniao'
      hoje().reunioes++
      registrar('reuniao', `Conversa marcada com ${c.empresa}: ${quando}`, c.id)
      await avisarDono(`📅 Conversa marcada com ${c.empresa}: ${quando}.\n${aviso}\n${link(c)}`)
      void aprenderCom(c, 'reunião marcada')
      break
    }
    case 'reuniao_marcada':
      c.estado = 'reuniao'
      hoje().reunioes++
      registrar('reuniao', `Reunião com ${c.empresa}: ${aviso}`, c.id)
      await avisarDono(`📅 Reunião marcada com ${c.empresa}.\n${aviso}\n${link(c)}`)
      void aprenderCom(c, 'reunião marcada')
      break
    case 'pedir_contrato':
      c.estado = 'humano'
      novaPendencia({ tipo: 'contrato', texto: 'Fechou e precisa do contrato. Gere em Projetos e mande para o cliente.', motivo: aviso, conversaId: c.id, empresa: c.empresa, prazo: new Date(Date.now() + 4 * 3_600_000).toISOString() })
      registrar('venda', `${c.empresa} pediu o contrato`, c.id)
      await avisarDono(`📄 ${c.empresa} fechou e precisa do contrato.\n${aviso}\n${link(c)}`)
      break
    case 'venda_fechada':
      if (!pode(db.config, 'marcar_resultado')) {
        c.estado = 'humano'
        novaPendencia({ tipo: 'pessoa', texto: 'Disse que fechou. Confira o pagamento e marque a venda.', motivo: aviso, conversaId: c.id, empresa: c.empresa })
        await avisarDono(`💰 ${c.empresa} disse que fechou. Confira o pagamento e marque a venda na XS.\n${aviso}\n${link(c)}`)
        break
      }
      c.estado = 'fechado'
      c.fechadoEm = iso()
      hoje().vendas++
      registrar('venda', `Venda: ${c.empresa} fechou. ${aviso}`, c.id)
      await avisarDono(`💰 Venda! ${c.empresa} fechou. Confira o pagamento.\n${aviso}\n${link(c)}`)
      void aprenderCom(c, 'venda fechada')
      break
    case 'perdido':
      c.estado = 'perdido'
      registrar('respondeu', `${c.empresa} recusou`, c.id)
      void aprenderCom(c, 'o cliente recusou')
      break
    default:
      if (temperatura === 'quente' && c.estado !== 'reuniao') {
        c.estado = 'quente'
        if (!c.avisadoQuente) {
          c.avisadoQuente = true
          hoje().quentes++
          registrar('quente', `${c.empresa} esquentou: ${aviso}`, c.id)
          await avisarDono(`🔥 ${c.empresa} esquentou.\n${aviso}\nO agente continua a conversa; se quiser assumir, é só responder pelo celular.\n${link(c)}`)
        }
      } else if (c.estado === 'aguardando' && respondeu(c)) c.estado = 'conversando'
      registrar('respondeu', apresentou ? `Mandou a apresentação para ${c.empresa}` : `Respondeu ${c.empresa}`, c.id)
  }
  salvar()
}

async function responderPendente(t: Date): Promise<boolean> {
  const cfg = db.config
  const c = db.conversas
    .filter((x) => x.pendente && !x.aguardandoVoce && ESTADOS_ATIVOS.includes(x.estado) && Date.parse(x.responderEm ?? '') <= t.getTime())
    .sort((a, b) => (a.responderEm ?? '').localeCompare(b.responderEm ?? ''))[0]
  if (!c) return false
  if (!dentroDoHorario(t, cfg.respostas.inicio, cfg.respostas.fim)) {
    c.responderEm = proximaAbertura(t, cfg.respostas.inicio, cfg.respostas.fim).toISOString()
    salvar()
    return false
  }
  // O funil do disparo ainda está mandando as mensagens dele para essa pessoa
  if (c.origem === 'disparo' && recipientByPhone(c.telefone)?.enviando) {
    c.responderEm = new Date(t.getTime() + 5 * 60_000).toISOString()
    return false
  }
  const dia = diaDe(t)
  if (c.mensagens.filter((m) => m.de === 'agente' && diaDe(new Date(m.em)) === dia).length >= MAX_POR_CONVERSA_DIA) {
    c.estado = 'humano'
    c.pendente = false
    registrar('humano', `Conversa longa demais com ${c.empresa} hoje: o agente parou e chamou você`, c.id)
    await avisarDono(`🙋 A conversa com ${c.empresa} passou de ${MAX_POR_CONVERSA_DIA} mensagens hoje. Dê uma olhada.\n${link(c)}`)
    return true
  }
  if (!pode(cfg, c.apresentar ? 'apresentar' : 'responder')) {
    c.pendente = false
    c.estado = 'humano'
    novaPendencia({ tipo: 'pessoa', texto: 'Respondeu, e ele está sem permissão para responder (Treino → Capacidades).', conversaId: c.id, empresa: c.empresa })
    return true
  }
  // Antes de ler: a IA confere se as mensagens novas tentam manipular o assistente (se você ligou)
  const novas = c.mensagens.filter((m) => m.de === 'lead' && !m.auto && m.manipulacao === undefined && Date.parse(m.em) > Date.now() - 3_600_000)
  if (novas.length && cfg.conferencias.manipulacao) {
    const r = await comIA(() => apoioIA.manipulacao(ctx(), novas.map((m) => m.texto).join('\n')), `Conferir mensagem de ${c.empresa}`)
    for (const m of novas) m.manipulacao = r?.sim ? true : false
    if (r?.sim) registrar('aviso', `${c.empresa} tentou manipular o assistente: ${r.motivo}`, c.id)
  }
  const total = c.mensagens.length
  // Só mandou o cumprimento: a vez agora é da apresentação (com o ângulo do teste, se for de um)
  const apresentar = !!c.apresentar
  const angulo = apresentar && c.testeId ? (db.testes.find((x) => x.id === c.testeId)?.variantes.find((v) => v.id === c.variante)?.angulo ?? '') : ''
  const apoio = apoioPara(c, ultimasDoCliente(c), !apresentar)
  const r = await comIA(
    () => (apresentar ? ia.apresentacao(ctx(), comDetalhes(c), t, angulo, apoio) : ia.responder(ctx(), comDetalhes(c), t, apoio)),
    `${apresentar ? 'Apresentação' : 'Resposta'} para ${c.empresa}`,
  )
  if (!r) {
    c.responderEm = new Date(Date.now() + 2 * 60_000).toISOString()
    return true
  }
  // Chegou mensagem nova enquanto a IA pensava: pensa de novo com tudo
  if (c.mensagens.slice(total).some((m) => m.de === 'lead')) {
    c.responderEm = new Date(Date.now() + 5000).toISOString()
    return true
  }
  // Você assumiu enquanto a IA pensava
  if (!c.pendente || !ESTADOS_ATIVOS.includes(c.estado)) return true
  c.pendente = false
  c.responderEm = null
  anotarFatos(c, r.fatos)
  anotarLacuna(c, r.lacuna)
  if (r.acao === 'aguardar') {
    c.temperatura = r.temperatura
    if (r.resumo.trim()) c.resumo = r.resumo.trim()
    salvar()
    return true
  }
  if (r.acao === 'optout') {
    await optout(c)
    return true
  }
  const fontes = r.fontes.map((i) => apoio.trechos[i - 1]?.titulo).filter((x): x is string => !!x)
  const s = await sair(c, doIA(r), {
    agente: apresentar ? 'abridor' : r.acao === 'venda_fechada' || r.acao === 'pedir_contrato' ? 'fechador' : r.acao === 'marcar_reuniao' ? 'agendador' : 'vendedor',
    proativa: false,
    fontes: [...new Set(fontes)],
    horarios: apoio.horarios,
    refazer: async (atual, motivo) => {
      const n = await comIA(() => ia.reescrever(ctx(), comDetalhes(c), atual, motivo, t, apoio), `Reescrever para ${c.empresa}`)
      return n ? doIA(n) : null
    },
  })
  if (s.tipo === 'barrada' && !s.pendencia) {
    // Horário, ritmo: tenta de novo quando abrir
    c.pendente = true
    c.responderEm = (s.id === 'horario' ? proximaAbertura(t, Math.max(8, cfg.respostas.inicio), Math.min(21, cfg.respostas.fim)) : new Date(t.getTime() + 30 * 60_000)).toISOString()
    salvar()
    return true
  }
  if (s.tipo !== 'enviada') return true
  if (apresentar) c.apresentar = false
  await aplicarAcao(c, s.final, apresentar)
  return true
}

/**
 * Cumprimentou e ninguém respondeu (nem a resposta automática) em 2 h: manda a apresentação mesmo
 * assim, dentro do horário de prospecção.
 */
function apresentarSemResposta(t: Date): boolean {
  const p = db.config.prospeccao
  if (!dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  const c = db.conversas.find((x) => x.apresentar && !x.pendente && x.estado === 'aguardando' && t.getTime() - Date.parse(x.mensagens.at(-1)?.em ?? x.criadaEm) > 2 * 3_600_000)
  if (!c) return false
  c.pendente = true
  c.responderEm = new Date(t.getTime()).toISOString()
  salvar()
  return false // quem manda é o responderPendente, no próximo ciclo
}

const emFerias = (t = new Date()) => !!db.config.feriasAte && diaDe(t) <= db.config.feriasAte

/** Manda uma mensagem que ele mesmo puxa (follow-up, retorno, reativação, pós-venda) pelo Conferente. */
async function mandarProativa(c: Conversa, mensagens: string[], agente: NomeAgente, t: Date, refazer?: (atual: Pronto, motivo: string) => Promise<Pronto | null>): Promise<boolean> {
  const s = await sair(c, { mensagens, acao: 'continuar' }, { agente, proativa: true, maxBolhas: 1, refazer })
  return s.tipo === 'enviada' && s.final.mensagens.length > 0
}

/** Retorno combinado ("me chama mês que vem"): chama no dia. */
async function retornoCombinado(t: Date): Promise<boolean> {
  const cfg = db.config
  const p = cfg.prospeccao
  if (!pode(cfg, 'retorno_combinado') || emFerias(t) || t.getTime() < proximoFollowup || !dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  const hojeStr = diaDe(t)
  const c = db.conversas.find((x) => x.retomarEm && x.retomarEm <= hojeStr && !x.pendente && !x.aguardandoVoce && ['aguardando', 'conversando', 'quente', 'perdido', 'sem_resposta'].includes(x.estado) && x.mensagens.at(-1)?.de !== 'lead')
  if (!c) return false
  proximoFollowup = Date.now() + (3 + Math.random() * 3) * 60_000
  const apoio = apoioPara(c, c.resumo, false)
  const r = await comIA(() => ia.followup(ctx(), { ...comDetalhes(c), retomarCombinado: true }, 1, t, apoio), `Retorno combinado com ${c.empresa}`)
  if (!r) return true
  c.retomarEm = null
  if (await mandarProativa(c, r.mensagens, 'recuperador', t)) {
    if (c.estado === 'perdido' || c.estado === 'sem_resposta') c.estado = 'aguardando'
    registrar('followup', `Retomou com ${c.empresa} no dia combinado`, c.id)
  }
  salvar()
  return true
}

async function fazerFollowup(t: Date): Promise<boolean> {
  const cfg = db.config
  const p = cfg.prospeccao
  const dias = cfg.followup.dias.filter((d) => d > 0)
  if (!cfg.followup.ativo || !pode(cfg, 'followup') || emFerias(t) || !dias.length || t.getTime() < proximoFollowup || !dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  let alvo: Conversa | null = null
  for (const c of db.conversas) {
    // Ainda falta a apresentação: o follow-up só começa depois dela
    if (c.pendente || c.apresentar || c.aguardandoVoce || c.retomarEm || !['aguardando', 'conversando', 'quente'].includes(c.estado)) continue
    // Resposta automática não conta: o follow-up segue o relógio da nossa última mensagem
    const ultima = c.mensagens.filter((m) => !m.auto).at(-1)
    if (!ultima || ultima.de === 'lead') continue
    const desde = t.getTime() - Date.parse(ultima.em)
    if (c.followups >= dias.length) {
      // Acabaram as tentativas e passaram mais 3 dias sem resposta
      if (desde > 3 * 86_400_000) {
        c.estado = 'sem_resposta'
        salvar()
      }
      continue
    }
    if (desde >= dias[c.followups] * 86_400_000 && (!alvo || c.atualizadaEm < alvo.atualizadaEm)) alvo = c
  }
  if (!alvo) return false
  const c = alvo
  const apoio = apoioPara(c, c.resumo, false)
  const r = await comIA(() => ia.followup(ctx(), comDetalhes(c), dias.length, t, apoio), `Follow-up para ${c.empresa}`)
  proximoFollowup = Date.now() + (3 + Math.random() * 3) * 60_000
  if (!r) return true
  c.followups++
  c.atualizadaEm = iso()
  const refazer = async (atual: Pronto, motivo: string) => {
    const n = await comIA(() => ia.reescrever(ctx(), comDetalhes(c), atual, motivo, t, apoio), `Reescrever follow-up para ${c.empresa}`)
    return n ? { mensagens: n.mensagens.slice(0, 1), acao: 'continuar' } : null
  }
  if (r.mensagens.length && (await mandarProativa(c, r.mensagens, 'recuperador', t, refazer))) registrar('followup', `Follow-up ${c.followups} para ${c.empresa}`, c.id)
  salvar()
  return true
}

function bloqueados(): Set<string> {
  return new Set([...db.extra.conhecidos, ...db.extra.descartados, ...sentPhones(), ...db.conversas.map((c) => phoneKey(c.telefone))])
}

/** Pede ao app para somar consultas do Google ao contador do mês (o app soma quando abre). */
function contarGoogle(chamadas: number) {
  const g = db.extra.google
  g.restante = Math.max(0, g.restante - chamadas)
  g.pendentes += chamadas
  salvar()
}

/** Texto da busca no Google de um tipo de negócio (cidades antigas não tinham). */
const textoBusca = (n: NichoBusca) => (n.busca?.trim() || n.nome).toLowerCase()

/** Busca no Google Maps com a chave do dono (a mesma de "Buscar empresas"). */
async function buscarGoogle(alvo: Alvo, meta: number, soSemSite: boolean, conhecidos: Set<string>): Promise<ResultadoGoogle[]> {
  const g = db.extra.google
  if (!g.chave) throw new Error('Coloque a chave do Google em Configurações → Busca do Google e abra a XS uma vez para o vendedor receber a chave.')
  if (!alvo.caixa) {
    alvo.caixa = await caixaDaCidade(alvo.cidade, alvo.uf)
    salvar()
  }
  try {
    const r = await buscarNoGoogle({ chave: g.chave, cidade: alvo.cidade, uf: alvo.uf, caixa: alvo.caixa, nichos: alvo.nichos.map((n) => ({ nome: n.nome, busca: textoBusca(n) })), meta, soSemSite, conhecidos, restante: g.restante, phoneKey })
    contarGoogle(r.chamadas)
    return r.resultados
  } catch (err) {
    if (err instanceof ErroGoogle && err.parar) throw new Error(err.message)
    throw new Error((err as Error).message || 'A busca do Google falhou.')
  }
}

/** Busca mais empresas para a fila numa cidade/nicho (sorteado pelos resultados, ou o que você escolher). */
async function reabastecer(alvoEscolhido?: Alvo, testeId?: string): Promise<{ achadas: number; mantidas: FilaItem[] }> {
  const p = db.config.prospeccao
  if (!pode(db.config, 'buscar_maps')) throw new Error('A capacidade "Buscar empresas no Google Maps" está desligada.')
  const alvo = alvoEscolhido ?? escolherAlvo(p.alvos, db.conversas)
  if (!alvo) throw new Error('Cadastre ao menos uma cidade com tipos de negócio em Prospecção.')
  const conhecidos = new Set([...bloqueados(), ...db.fila.map((f) => phoneKey(f.telefone))])
  const resultados = await buscarGoogle(alvo, 30, p.soSemSite, conhecidos)
  const agora = iso()
  const pad = padroes()
  let itens: FilaItem[] = resultados
    .map((r) => {
      const n = pode(db.config, 'nota_encaixe') ? notaEncaixe(r, taxaDoRamo(pad, r.niche)) : null
      return {
        id: randomUUID(),
        telefone: formatBrazilPhone(r.phone),
        empresa: r.name,
        nicho: r.niche,
        cidade: r.city || alvo.cidade,
        uf: r.state || alvo.uf,
        endereco: r.address ?? '',
        site: r.website ?? '',
        instagram: r.instagram ?? '',
        alvoId: alvo.id,
        bruto: { ...r, ...(n ? { encaixe: n.nota, encaixeMotivos: n.motivos } : {}) } as unknown as Record<string, unknown>,
        em: agora,
        ...(testeId ? { testeId } : {}),
      }
    })
    .filter((f) => isValidBrazilWhatsApp(f.telefone))
  const achadas = itens.length
  const temCriterio = !!p.criterios.trim() || db.licoes.some((l) => l.ativa && l.tipo === 'busca')
  if (itens.length && temCriterio && chave && !chaveRecusada) {
    const r = await comIA(() => ia.filtrarEmpresas(ctx(), itens), 'Filtrar empresas')
    if (r) {
      const manter = new Set(r.manter)
      for (const [i, f] of itens.entries()) if (!manter.has(i)) db.extra.descartados.push(phoneKey(f.telefone))
      itens = itens.filter((_, i) => manter.has(i))
    }
  }
  // Quem combina mais vai primeiro (nota de encaixe)
  itens.sort((a, b) => Number(b.bruto.encaixe ?? 0) - Number(a.bruto.encaixe ?? 0))
  db.fila.push(...itens)
  if (db.fila.length > 300) db.fila.splice(0, db.fila.length - 300)
  const nomes = alvo.nichos.map((n) => n.nome).join(', ')
  registrar('busca', `Buscou ${nomes} em ${alvo.cidade} no Google Maps: ${itens.length} empresa(s) nova(s) na fila${achadas > itens.length ? ` (${achadas - itens.length} fora dos seus critérios)` : ''}`)
  return { achadas, mantidas: itens }
}

export interface EmpresaAchada {
  empresa: string
  nicho: string
  telefone: string
  site: string
  instagram: string
  endereco: string
  cidade: string
  uf: string
}

/**
 * Busca empresas no Google Maps para o dono escolher (conector do Claude/Jarvis).
 * Não mexe na fila do vendedor; pula quem já foi abordado ou descartado.
 */
export async function buscarEmpresas(p: { uf: string; cidade: string; nichos: NichoBusca[]; quantidade: number; soSemSite: boolean }): Promise<EmpresaAchada[]> {
  const alvo: Alvo = { id: 'conector', uf: p.uf, cidade: p.cidade, nichos: p.nichos, ativo: true, caixa: db.config.prospeccao.alvos.find((a) => a.cidade === p.cidade && a.uf === p.uf)?.caixa }
  const resultados = await buscarGoogle(alvo, Math.max(1, Math.min(60, p.quantidade)), p.soSemSite, bloqueados())
  return resultados
    .map((r) => ({
      empresa: r.name,
      nicho: r.niche,
      telefone: formatBrazilPhone(r.phone),
      site: r.website ?? '',
      instagram: r.instagram ?? '',
      endereco: r.address ?? '',
      cidade: r.city || p.cidade,
      uf: r.state || p.uf,
    }))
    .filter((e) => isValidBrazilWhatsApp(e.telefone))
    .slice(0, p.quantidade)
}


/** Teste que ainda precisa abordar empresas (o mais antigo primeiro). */
function testeAtivo(): Teste | undefined {
  return db.testes.find((t) => t.estado === 'rodando' && db.conversas.filter((c) => c.testeId === t.id).length < t.porVariante * t.variantes.length)
}

/** Abordagem do teste com menos empresas até agora (divide igual). */
function proximaVariante(t: Teste): Variante {
  const usadas = (v: Variante) => db.conversas.filter((c) => c.testeId === t.id && c.variante === v.id).length
  return t.variantes.reduce((menor, v) => (usadas(v) < usadas(menor) ? v : menor), t.variantes[0])
}

/**
 * Posição do próximo da fila: primeiro quem está em boa hora (restaurante não no meio do almoço).
 * -2 = só sobrou empresa em hora ruim (melhor esperar); -1 = não tem ninguém.
 */
function indiceNaFila(t: Date, deste: (f: FilaItem) => boolean): number {
  // Primeiro quem está na melhor faixa do dia para o ramo (quando já há dados), depois a ordem da fila
  const p = padroes()
  const boa = db.fila.findIndex((f) => deste(f) && boaHoraPara(f.nicho, t) && faixaBoa(p, f.nicho, t) === true)
  if (boa >= 0) return boa
  const i = db.fila.findIndex((f) => deste(f) && boaHoraPara(f.nicho, t))
  if (i >= 0) return i
  return db.fila.some(deste) ? -2 : -1
}

async function proximoDaFila(t = new Date()): Promise<FilaItem | 'espera' | null> {
  // Teste rodando: as empresas dele vêm antes da prospecção normal
  const teste = testeAtivo()
  for (let tentativa = 0; teste && tentativa < 2; tentativa++) {
    const fora = bloqueados()
    let i: number
    while ((i = indiceNaFila(t, (f) => f.testeId === teste.id)) >= 0) {
      const [it] = db.fila.splice(i, 1)
      if (!fora.has(phoneKey(it.telefone)) && isValidBrazilWhatsApp(it.telefone)) return it
    }
    // Empresas do teste só em hora ruim agora: segue a prospecção normal e volta ao teste depois
    if (i === -2) break
    const r = await reabastecer(teste.alvo, teste.id).catch((err) => {
      registrar('erro', `Busca do teste "${teste.nome}": ${(err as Error).message}`)
      return null
    })
    if (!r?.mantidas.length) {
      teste.estado = 'pausado'
      registrar('aviso', `Teste "${teste.nome}" pausado: acabaram as empresas novas de ${teste.alvo.nichos.map((n) => n.nome).join(', ')} em ${teste.alvo.cidade}.`)
      break
    }
  }
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const fora = bloqueados()
    let i: number
    while ((i = indiceNaFila(t, (f) => !f.testeId)) >= 0) {
      const [it] = db.fila.splice(i, 1)
      if (!fora.has(phoneKey(it.telefone)) && isValidBrazilWhatsApp(it.telefone)) return it
    }
    if (i === -2) return 'espera'
    if (!db.config.prospeccao.alvos.some((a) => a.ativo)) return null
    const r = await reabastecer().catch((err) => {
      registrar('erro', `Busca de empresas: ${(err as Error).message}`)
      return null
    })
    if (!r) return null
  }
  return null
}

async function prospectar(t: Date): Promise<boolean> {
  const p = db.config.prospeccao
  if (!p.ativa || emFerias(t) || t.getTime() < proximaAbordagem || !dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  if (db.extra.freio === diaDe(t)) return false
  const dia = hoje(t)
  const cota = cotaHoje(t)
  if (dia.abordados >= cota) return false
  const item = await proximoDaFila(t)
  if (item === 'espera') {
    proximaAbordagem = Date.now() + 15 * 60_000
    return false
  }
  if (!item) {
    proximaAbordagem = Date.now() + 30 * 60_000
    registrar('aviso', 'Sem empresas novas para abordar nas cidades e tipos de negócio escolhidos. Adicione mais em Prospecção.')
    return false
  }
  db.extra.desde ??= diaDe(t)
  const sock = getSock()
  if (!sock) return false
  const consulta = await withTimeout(sock.onWhatsApp(`${item.telefone}@s.whatsapp.net`), 15_000, 'Tempo esgotado ao consultar o número.').catch(() => null)
  // Falha na consulta (rede, WhatsApp lento) não quer dizer que o número não tem WhatsApp: volta para a fila
  if (!consulta) {
    db.fila.unshift(item)
    proximaAbordagem = Date.now() + 2 * 60_000
    return false
  }
  const [contato] = consulta
  if (!contato?.exists || !contato.jid) {
    dia.semWhatsApp++
    db.extra.descartados.push(phoneKey(item.telefone))
    proximaAbordagem = Date.now() + 20_000
    salvar()
    return true
  }
  const lead = { empresa: item.empresa, nicho: item.nicho, cidade: item.cidade, uf: item.uf, endereco: item.endereco, site: item.site, instagram: item.instagram }
  const teste = item.testeId ? db.testes.find((x) => x.id === item.testeId && x.estado === 'rodando') : undefined
  const variante = teste ? proximaVariante(teste) : undefined
  // Do jeito do dono: primeiro só o cumprimento (sem IA); a apresentação vem depois da resposta
  const doisPassos = p.cumprimentarPrimeiro && pode(db.config, 'cumprimentar')
  const apoio = apoioPara({ nicho: item.nicho, mensagens: [] }, item.nicho, false)
  const r = doisPassos
    ? { mensagens: [cumprimento(item.empresa, t)] }
    : await comIA(() => ia.abordagem(ctx(), { ...lead, detalhes: detalhesDoBruto(item.bruto) }, t, variante?.angulo, apoio), `Abordagem de ${item.empresa}`)
  if (!r?.mensagens.length) {
    db.fila.unshift(item)
    proximaAbordagem = Date.now() + 5 * 60_000
    return true
  }
  const c = novaConversa({
    ...lead,
    telefone: item.telefone,
    jid: contato.jid,
    origem: 'agente',
    alvoId: item.alvoId,
    bruto: item.bruto,
    testeId: teste?.id ?? null,
    variante: variante?.id ?? null,
    encaixe: typeof item.bruto.encaixe === 'number' ? item.bruto.encaixe : undefined,
    ...(doisPassos ? { apresentar: true } : {}),
  })
  db.conversas.push(c)
  // Cumprimento repetido demais: tenta outra frase (sem IA); abordagem escrita: a IA reescreve pelo motivo
  const refazer = doisPassos
    ? async (_a: Pronto) => ({ mensagens: [cumprimento(item.empresa, t, Math.random())], acao: 'continuar' })
    : async (atual: Pronto, motivo: string) => {
        const n = await comIA(() => ia.reescrever(ctx(), { ...comDetalhes(c), mensagens: [] }, atual, motivo, t, apoio), `Reescrever abordagem de ${item.empresa}`)
        return n ? doIA(n) : null
      }
  let s: Saida
  try {
    s = await sair(c, { mensagens: r.mensagens, acao: 'continuar' }, { agente: doisPassos ? 'cumprimento' : 'abridor', proativa: true, maxBolhas: 2, refazer })
  } catch (err) {
    if (!c.mensagens.length) db.conversas.splice(db.conversas.indexOf(c), 1)
    registrar('erro', `Não consegui mandar para ${item.empresa}: ${(err as Error).message}`)
    proximaAbordagem = Date.now() + 5 * 60_000
    return true
  }
  if (s.tipo !== 'enviada' || !c.mensagens.length) {
    // Barrou ou espera você: a empresa volta para a fila (ou fica com você, se virou pendência)
    if (s.tipo === 'barrada' && !s.pendencia) {
      db.conversas.splice(db.conversas.indexOf(c), 1)
      db.fila.unshift(item)
      proximaAbordagem = Date.now() + 15 * 60_000
    }
    salvar()
    return true
  }
  dia.abordados++
  registrar('abordou', `Abordou ${c.empresa} (${[c.nicho, c.cidade].filter(Boolean).join(', ')})${teste && variante ? ` · teste "${teste.nome}", abordagem ${variante.nome}` : ''}`, c.id)
  proximaAbordagem = Date.now() + intervaloAbordagemMs(t, p.fim, cota - dia.abordados)
  salvar()
  return true
}

/** Os últimos `n` dias (sem hoje), para medir a saúde do número. */
function ultimosDias(t: Date, n = 7): Dia[] {
  return Array.from({ length: n }, (_, i) => db.dias[diaDe(new Date(t.getTime() - (i + 1) * 86_400_000))]).filter((d): d is Dia => !!d)
}

/** Cota de hoje. Semana com muita gente pedindo para parar: a cota não sobe (fica na da semana anterior). */
function cotaHoje(t = new Date()): number {
  const p = db.config.prospeccao
  const saude = saudeDoNumero(ultimosDias(t))
  return saude.ruim ? cotaDoDia(p, db.extra.desde, new Date(t.getTime() - 7 * 86_400_000)) : cotaDoDia(p, db.extra.desde, t)
}

/** Conversa que o agente passou para você e o cliente está esperando resposta há mais de 2 h: lembra uma vez. */
async function lembrarDono(t: Date): Promise<boolean> {
  const cfg = db.config
  if (!cfg.avisos.telefone || !dentroDoHorario(t, cfg.respostas.inicio, cfg.respostas.fim)) return false
  const c = db.conversas.find((x) => {
    const ultima = x.mensagens.at(-1)
    return x.estado === 'humano' && ultima?.de === 'lead' && !ultima.auto && t.getTime() - Date.parse(ultima.em) > 2 * 3_600_000 && (!x.lembradoEm || x.lembradoEm < ultima.em)
  })
  if (!c) return false
  c.lembradoEm = iso()
  salvar()
  const ultima = c.mensagens.at(-1)!
  await avisarDono(`⏰ ${c.empresa} está esperando você responder desde ${new Date(ultima.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}:\n"${ultima.texto.slice(0, 200)}"\n${link(c)}`)
  return true
}

/**
 * Teste que já abordou todas as empresas e deu 3 dias para responderem: encerra sozinho com a
 * conclusão dos números e avisa você (o Xico vê no próximo papo).
 */
async function concluirTestes(t: Date): Promise<boolean> {
  for (const teste of db.testes) {
    if (teste.estado !== 'rodando') continue
    const deste = db.conversas.filter((c) => c.testeId === teste.id)
    if (deste.length < teste.porVariante * teste.variantes.length) continue
    const ultima = Math.max(...deste.map((c) => Date.parse(c.criadaEm)))
    if (t.getTime() - ultima < 3 * 86_400_000) continue
    const a = analiseDoTeste(teste)
    teste.estado = 'encerrado'
    teste.encerradoEm = iso()
    teste.conclusao = `Automática: ${a.texto}`
    for (const f of db.fila) if (f.testeId === teste.id) delete f.testeId
    registrar('aviso', `Teste "${teste.nome}" terminou. ${a.texto}`)
    await avisarDono(`🧪 Teste "${teste.nome}" terminou.\n${a.texto}\nPeça ao Xico para adotar a vencedora ou montar outro teste.`)
    return true
  }
  return false
}

async function resumoDoDia(t: Date) {
  const cfg = db.config
  if (!cfg.avisos.relatorio || !cfg.avisos.telefone || t.getHours() < cfg.prospeccao.fim) return
  const d = hoje(t)
  if (d.relatorio) return
  d.relatorio = true
  salvar()
  if (!d.abordados && !d.enviadas) return
  const esperando = db.conversas.filter((c) => c.estado === 'humano' && c.mensagens.at(-1)?.de === 'lead').length
  const pct = d.abordados ? ` (${Math.round((d.responderam / d.abordados) * 100)}%)` : ''
  await avisarDono(
    [
      '📊 Resumo de hoje',
      `Empresas abordadas: ${d.abordados}`,
      `Responderam: ${d.responderam}${pct}`,
      `Esquentaram: ${d.quentes}`,
      `Reuniões: ${d.reunioes}`,
      `Vendas: ${d.vendas}`,
      `Pediram para parar: ${d.optouts}`,
      `Gasto com IA: US$ ${d.custoUSD.toFixed(2)}`,
      esperando ? `\n🙋 ${esperando} conversa(s) esperando você responder.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

let ocupado = false

async function ciclo() {
  const cfg = db.config
  if (ocupado || !cfg.ativo || !chave || chaveRecusada || db.extra.pausadoPorRisco || getWa().status !== 'connected') return
  ocupado = true
  try {
    const t = new Date()
    if (hoje(t).custoUSD >= cfg.limiteDiaUSD) {
      if (avisouLimite !== diaDe(t)) {
        avisouLimite = diaDe(t)
        registrar('aviso', `Chegou no limite de gasto do dia (US$ ${cfg.limiteDiaUSD.toFixed(2)}). O agente volta amanhã.`)
        await avisarDono(`⏸️ O agente chegou no limite de gasto de hoje (US$ ${cfg.limiteDiaUSD.toFixed(2)}) e volta amanhã. Dá para aumentar o limite na XS.`)
      }
      return
    }
    apresentarSemResposta(t)
    if (await responderPendente(t)) return
    if (await retornoCombinado(t)) return
    if (await fazerFollowup(t)) return
    if (await prospectar(t)) return
    if (await lembrarDono(t)) return
    if (await concluirTestes(t)) return
    await resumoDoDia(t)
  } catch (err) {
    registrar('erro', (err as Error).message)
  } finally {
    ocupado = false
  }
}

if (AGENTE_LIGADO) {
  waEvents.incoming((phone, texto, info) => {
    if (!info.grupo) receber(phone, texto, info.key)
  })
  // Espera um pouco: o envio do próprio motor registra o id logo depois do evento
  waEvents.outgoing((phone, texto, id) => void setTimeout(() => saiuPeloCelular(phone, texto, id), 4000))
  // Você respondeu pela tela Conversas da XS: o agente para naquela conversa
  conversaEventos.enviouPelaXS((phone, texto, id) => saiuPelaXS(phone, texto, id))
  waEvents.risk(({ reason }) => {
    db.extra.pausadoPorRisco = iso()
    // A cota volta ao começo: o número precisa de calma depois de um problema
    db.extra.desde = diaDe()
    registrar('aviso', `Agente pausado por segurança: ${reason} Confira o WhatsApp e retome na tela do Agente.`)
  })
  setInterval(() => void ciclo(), 15_000).unref()
}

// ---------------------------------------------------------------------------
// O que a tela do Agente usa
// ---------------------------------------------------------------------------

export function estado() {
  const t = new Date()
  const mes = diaDe(t).slice(0, 7)
  const doMes = Object.entries(db.dias).filter(([k]) => k.startsWith(mes))
  const soma = (f: keyof Dia) => doMes.reduce((s, [, d]) => s + Number(d[f] || 0), 0)
  const contagem: Partial<Record<Estado, number>> = {}
  for (const c of db.conversas) contagem[c.estado] = (contagem[c.estado] ?? 0) + 1
  return {
    disponivel: AGENTE_LIGADO,
    ativo: db.config.ativo,
    temChave: !!chave,
    chaveFinal: chave ? chave.slice(-4) : null,
    provedor: provedorDe(db.config.modelo),
    chaveRecusada,
    pausadoPorRisco: db.extra.pausadoPorRisco,
    ultimoErro: db.extra.ultimoErro,
    whatsapp: getWa().status,
    modelo: db.config.modelo,
    hoje: hoje(t),
    cotaHoje: cotaHoje(t),
    freioHoje: db.extra.freio === diaDe(t),
    saude: saudeDoNumero(ultimosDias(t)),
    proximaAbordagem: proximaAbordagem > Date.now() ? new Date(proximaAbordagem).toISOString() : null,
    fila: db.fila.length,
    mes: { custoUSD: soma('custoUSD'), abordados: soma('abordados'), responderam: soma('responderam'), reunioes: soma('reunioes'), vendas: soma('vendas') },
    contagem,
    licoes: db.licoes.filter((l) => l.ativa).length,
    piloto: db.config.piloto,
    paradoEm: db.extra.paradoEm,
    pendencias: db.pendencias.filter((p) => !p.resolvidaEm).length,
    google: { temChave: !!db.extra.google.chave, restante: db.extra.google.restante, atualizadoEm: db.extra.google.atualizadoEm },
  }
}

const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
const horas = (v: unknown, padrao: number) => Math.round(num(v, 0, 24, padrao))

function limparAlvo(a: Partial<Alvo>): Alvo | null {
  const uf = txt(a.uf, 2).toUpperCase()
  const cidade = txt(a.cidade, 80)
  const nichos = (Array.isArray(a.nichos) ? a.nichos : [])
    .slice(0, 30)
    .map((n) => ({
      nome: txt(n?.nome, 80),
      busca: txt(n?.busca, 80) || txt(n?.nome, 80).toLowerCase(),
      tax: (Array.isArray(n?.tax) ? n.tax : []).map((x) => txt(x, 60)).filter(Boolean).slice(0, 40),
      nomes: (Array.isArray(n?.nomes) ? n.nomes : []).map((x) => txt(x, 60)).filter(Boolean).slice(0, 20),
    }))
    .filter((n) => n.nome)
  if (!/^[A-Z]{2}$/.test(uf) || !cidade || !nichos.length) return null
  const caixa = Array.isArray(a.caixa) && a.caixa.length === 4 && a.caixa.every((x) => Number.isFinite(Number(x))) ? (a.caixa.map(Number) as [number, number, number, number]) : undefined
  return { id: txt(a.id, 60) || randomUUID(), uf, cidade, nichos, ativo: a.ativo !== false, ...(caixa ? { caixa } : {}) }
}

export function lerConfig(): AgenteConfig {
  return db.config
}

/** Salva o que veio da tela (só os campos conhecidos, com limites). */
export function salvarConfig(body: Partial<AgenteConfig>): AgenteConfig {
  const atual = db.config
  const b = completarConfig({ ...atual, ...body, negocio: { ...atual.negocio, ...body.negocio }, prospeccao: { ...atual.prospeccao, ...body.prospeccao } })
  const n = b.negocio
  const p = b.prospeccao
  const nova: AgenteConfig = {
    ativo: b.ativo === true,
    modelo: (Object.keys(MODELOS) as Modelo[]).includes(b.modelo) ? b.modelo : atual.modelo,
    negocio: {
      seuNome: txt(n.seuNome, 80),
      empresa: txt(n.empresa, 80),
      apresentacao: txt(n.apresentacao, 600),
      oferta: txt(n.oferta, 6000),
      pagamento: txt(n.pagamento, 1500),
      descontoMax: num(n.descontoMax, 0, 90, 10),
      portfolio: txt(n.portfolio, 2000),
      objecoes: txt(n.objecoes, 6000),
      estilo: txt(n.estilo, 2000),
      regras: txt(n.regras, 3000),
    },
    podeFechar: b.podeFechar !== false,
    avisos: { telefone: formatBrazilPhone(txt(b.avisos.telefone, 30)), relatorio: b.avisos.relatorio !== false },
    prospeccao: {
      ativa: p.ativa === true,
      alvos: (Array.isArray(p.alvos) ? p.alvos : []).slice(0, 50).map(limparAlvo).filter((a): a is Alvo => !!a),
      porDiaInicial: Math.round(num(p.porDiaInicial, 1, 200, 20)),
      porDiaMax: Math.round(num(p.porDiaMax, 1, 300, 50)),
      aumentoSemana: Math.round(num(p.aumentoSemana, 0, 50, 5)),
      soSemSite: p.soSemSite !== false,
      cumprimentarPrimeiro: p.cumprimentarPrimeiro !== false,
      criterios: txt(p.criterios, 2000),
      dias: [...new Set((Array.isArray(p.dias) ? p.dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      inicio: horas(p.inicio, 9),
      fim: horas(p.fim, 18),
    },
    respostas: { inicio: horas(b.respostas.inicio, 8), fim: horas(b.respostas.fim, 21) },
    followup: {
      ativo: b.followup.ativo !== false,
      dias: (Array.isArray(b.followup.dias) ? b.followup.dias : []).map((d) => num(d, 0.5, 30, 2)).slice(0, 5),
    },
    responderDisparos: b.responderDisparos !== false,
    limiteDiaUSD: num(b.limiteDiaUSD, 0.1, 100, 3),
    // O nível só muda por mudarNivel (confere o que falta para subir)
    piloto: atual.piloto,
    persona: { nome: txt(b.persona.nome, 60) || 'Atendente IA', tom: (['caloroso', 'objetivo', 'curto'] as const).includes(b.persona.tom) ? b.persona.tom : 'caloroso', regrasCasa: txt(b.persona.regrasCasa, 3000) },
    estiloResposta: { variasBolhas: b.estiloResposta.variasBolhas !== false, maxBolha: Math.round(num(b.estiloResposta.maxBolha, 80, 4000, 600)) },
    capacidades: limparCapacidades(b.capacidades),
    conferencias: {
      revisorTom: b.conferencias.revisorTom === true,
      assuntosProibidos: b.conferencias.assuntosProibidos !== false,
      proibidos: txt(b.conferencias.proibidos, 1000),
      manipulacao: b.conferencias.manipulacao !== false,
      transcreverAudio: b.conferencias.transcreverAudio === true,
    },
    agenda: {
      dias: [...new Set((Array.isArray(b.agenda.dias) ? b.agenda.dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      inicio: horas(b.agenda.inicio, 9),
      fim: horas(b.agenda.fim, 18),
      duracaoMin: Math.round(num(b.agenda.duracaoMin, 15, 180, 30)),
      antecedenciaH: Math.round(num(b.agenda.antecedenciaH, 0, 72, 3)),
      como: txt(b.agenda.como, 200),
    },
    posVenda: { depoimentoDias: Math.round(num(b.posVenda.depoimentoDias, 1, 120, 15)), indicacaoDias: Math.round(num(b.posVenda.indicacaoDias, 1, 180, 30)) },
    reativacao: { diasParado: Math.round(num(b.reativacao.diasParado, 7, 365, 30)), porDia: Math.round(num(b.reativacao.porDia, 0, 50, 5)) },
    linksPermitidos: txt(b.linksPermitidos, 3000),
    autoAprovarLicoes: b.autoAprovarLicoes === true,
    inteligenciaXS: b.inteligenciaXS === true,
    feriasAte: typeof b.feriasAte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.feriasAte) ? b.feriasAte : null,
  }
  if (nova.avisos.telefone && !isValidBrazilWhatsApp(nova.avisos.telefone)) throw new Error('O número para avisos precisa ter DDD + número.')
  if (nova.prospeccao.fim <= nova.prospeccao.inicio || nova.respostas.fim <= nova.respostas.inicio) throw new Error('O horário de fim precisa ser depois do início.')
  if (nova.ativo && !chaveDe(nova.modelo)) throw new Error(`Coloque a chave da API (${MODELOS[nova.modelo].nome}) antes de ligar o agente.`)
  if (nova.ativo && !nova.negocio.oferta) throw new Error('Preencha "O que você vende" no Treino antes de ligar o agente.')
  if (nova.ativo && !atual.ativo) registrar('aviso', 'Agente ligado')
  if (!nova.ativo && atual.ativo) registrar('aviso', 'Agente desligado')
  if (nova.modelo !== atual.modelo) registrar('aviso', `IA do agente: ${MODELOS[nova.modelo].nome}`)
  db.config = nova
  atualizarChave()
  salvar(true)
  return nova
}

const NOME_PROVEDOR: Record<Provedor, string> = { anthropic: 'do Claude', gemini: 'do Gemini', xai: 'do Grok' }

/** Conecta uma chave. Descobre de quem ela é pelo começo (sk-ant- = Claude, xai- = Grok, outra = Gemini). */
export async function trocarChave(nova: string, provedor?: Provedor) {
  const k = txt(nova, 300)
  const p: Provedor = provedor ?? (k.startsWith('sk-ant-') ? 'anthropic' : k.startsWith('xai-') ? 'xai' : 'gemini')
  try {
    if (p === 'anthropic') {
      if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) throw new Error('Isso não parece uma chave do Claude (ela começa com "sk-ant-").')
      await ia.testarChave(k, provedorDe(db.config.modelo) === 'anthropic' ? db.config.modelo : 'claude-haiku-5-5')
      chaves.anthropic = k
    } else if (p === 'xai') {
      if (!/^xai-[A-Za-z0-9_-]{20,}$/.test(k)) throw new Error('A chave do Grok começa com "xai-" (console.x.ai → API Keys).')
      chaves.xaiModelo = await testarXai(k)
      chaves.xai = k
    } else {
      if (!/^[A-Za-z0-9_.-]{30,}$/.test(k)) throw new Error('Isso não parece uma chave do Gemini (aistudio.google.com/apikey).')
      await testarGemini(k)
      chaves.gemini = k
    }
  } catch (err) {
    throw new Error((err as Error).message)
  }
  gravarChaves(chaves)
  atualizarChave()
  chaveRecusada = false
  db.extra.ultimoErro = null
  registrar('aviso', `Chave ${NOME_PROVEDOR[p]} conectada`)
}

/** Tira a chave da IA escolhida agora (ou a de um provedor). Sem chave para o modelo, o agente desliga. */
export function removerChave(provedor: Provedor = provedorDe(db.config.modelo)) {
  if (provedor === 'anthropic') chaves.anthropic = ''
  else if (provedor === 'xai') chaves.xai = chaves.xaiModelo = ''
  else chaves.gemini = ''
  gravarChaves(chaves)
  atualizarChave()
  if (!chave) db.config.ativo = false
  registrar('aviso', `Chave ${NOME_PROVEDOR[provedor]} removida${chave ? '' : ': agente desligado'}`)
}

/** Qual IA o agente usa e quais chaves estão conectadas (sem mostrar as chaves). */
export function infoIA() {
  const fim = (k: string) => (k ? `…${k.slice(-4)}` : null)
  return {
    modelo: db.config.modelo,
    nome: MODELOS[db.config.modelo].nome,
    provedor: provedorDe(db.config.modelo),
    chaves: { claude: fim(chaves.anthropic), gemini: fim(chaves.gemini), grok: fim(chaves.xai) },
    modeloDoGrok: chaves.xai ? chaves.xaiModelo : null,
    opcoes: Object.entries(MODELOS).map(([id, m]) => ({ id, nome: m.nome })),
  }
}

export function retomar() {
  db.extra.pausadoPorRisco = null
  db.extra.freio = null
  chaveRecusada = false
  registrar('aviso', 'Agente retomado')
}

const resumoConversa = (c: Conversa) => {
  const ultima = c.mensagens.at(-1)
  return {
    id: c.id,
    empresa: c.empresa,
    telefone: c.telefone,
    nicho: c.nicho,
    cidade: c.cidade,
    origem: c.origem,
    estado: c.estado,
    temperatura: c.temperatura,
    resumo: c.resumo,
    total: c.mensagens.length,
    ultima: ultima ? { de: ultima.de, texto: ultima.texto.slice(0, 160), em: ultima.em } : null,
    pendente: c.pendente,
    atualizadaEm: c.atualizadaEm,
  }
}

export function listarConversas() {
  return db.conversas
    .slice()
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
    .slice(0, 500)
    .map(resumoConversa)
}

function achar(id: string): Conversa {
  const c = db.conversas.find((x) => x.id === id)
  if (!c) throw new Error('Conversa não encontrada.')
  return c
}

export function verConversa(id: string) {
  const { ultimaChave: _k, bruto: _b, ...c } = achar(id)
  return c
}

export function assumir(id: string) {
  const c = achar(id)
  c.estado = 'humano'
  c.pendente = false
  registrar('humano', `Você assumiu a conversa com ${c.empresa}`, c.id)
  return verConversa(id)
}

/** Devolve ao agente; se a última mensagem é do cliente, ele responde em instantes. */
export function devolver(id: string) {
  const c = achar(id)
  c.estado = respondeu(c) ? (c.temperatura === 'quente' ? 'quente' : 'conversando') : 'aguardando'
  if (c.mensagens.at(-1)?.de === 'lead') {
    c.pendente = true
    c.responderEm = new Date(Date.now() + 5000).toISOString()
  }
  registrar('aviso', `Conversa com ${c.empresa} devolvida ao agente`, c.id)
  return verConversa(id)
}

/** Você marca o resultado à mão. */
export function marcar(id: string, estadoNovo: Estado) {
  const c = achar(id)
  if (!['perdido', 'fechado', 'reuniao', 'optout', 'humano'].includes(estadoNovo)) throw new Error('Resultado inválido.')
  if (c.estado === estadoNovo) return verConversa(id)
  c.estado = estadoNovo
  c.pendente = false
  if (estadoNovo === 'fechado') {
    c.fechadoEm = iso()
    hoje().vendas++
    void aprenderCom(c, 'venda fechada')
  }
  if (estadoNovo === 'reuniao') hoje().reunioes++
  if (estadoNovo === 'perdido') void aprenderCom(c, 'o cliente recusou')
  if (estadoNovo === 'optout') db.extra.descartados.push(phoneKey(c.telefone))
  registrar('aviso', `${c.empresa}: marcado como ${estadoNovo}`, c.id)
  return verConversa(id)
}

/** Você responde pela XS (sai pelo WhatsApp do agente) e assume a conversa. */
export async function enviarComoVoce(id: string, texto: string) {
  const c = achar(id)
  const t = txt(texto, 1500)
  if (!t) throw new Error('Escreva a mensagem.')
  if (getWa().status !== 'connected') throw new Error('Conecte o WhatsApp antes.')
  c.pendente = false
  c.estado = c.estado === 'optout' || c.estado === 'fechado' ? c.estado : 'humano'
  await enviar(c, [t], 'voce')
  return verConversa(id)
}

/** 👍/👎 numa mensagem do agente, com o jeito que você teria escrito: vira lição. */
export async function avaliar(id: string, msgId: string, nota: 'bom' | 'ruim', correcao: string) {
  const c = achar(id)
  const i = c.mensagens.findIndex((m) => m.id === msgId)
  if (i < 0 || c.mensagens[i].de !== 'agente') throw new Error('Mensagem não encontrada.')
  if (nota !== 'bom' && nota !== 'ruim') throw new Error('Avaliação inválida.')
  c.mensagens[i].nota = nota
  c.mensagens[i].correcao = txt(correcao, 1500) || undefined
  salvar()
  if (!chave) throw new Error('Coloque a chave da API para o agente aprender com a avaliação.')
  const r = await comIA(() => ia.licaoDaCorrecao(ctx(), c, i, nota, correcao), 'Lição da avaliação')
  return { licao: r?.licao ? guardarLicao('conversa', r.licao, 'correcao') : null, conversa: verConversa(id) }
}

export function listarLicoes() {
  return db.licoes.slice().sort((a, b) => b.em.localeCompare(a.em))
}

export function novaLicao(body: { tipo?: unknown; texto?: unknown }) {
  const tipo = body.tipo === 'busca' ? 'busca' : 'conversa'
  const l = guardarLicao(tipo, txt(body.texto, 400), 'voce')
  if (!l) throw new Error('Escreva a lição.')
  return l
}

export function editarLicao(id: string, body: { texto?: unknown; ativa?: unknown }) {
  const l = db.licoes.find((x) => x.id === id)
  if (!l) throw new Error('Lição não encontrada.')
  if (typeof body.texto === 'string' && body.texto.trim()) l.texto = txt(body.texto, 400)
  if (typeof body.ativa === 'boolean') l.ativa = body.ativa
  salvar()
  return l
}

export function apagarLicao(id: string) {
  db.licoes = db.licoes.filter((l) => l.id !== id)
  salvar()
}

export function listarFila() {
  return db.fila.slice(0, 150).map(({ bruto, ...f }) => ({ ...f, encaixe: typeof bruto?.encaixe === 'number' ? bruto.encaixe : null, encaixeMotivos: Array.isArray(bruto?.encaixeMotivos) ? (bruto.encaixeMotivos as string[]) : [] }))
}

/** Tira uma empresa da fila (ela não volta). Com motivo, vira critério de busca. */
export async function descartarDaFila(id: string, motivo: string) {
  const i = db.fila.findIndex((f) => f.id === id)
  if (i < 0) throw new Error('Empresa não está mais na fila.')
  const [f] = db.fila.splice(i, 1)
  db.extra.descartados.push(phoneKey(f.telefone))
  salvar()
  if (!txt(motivo, 500) || !chave) return { licao: null }
  const r = await comIA(() => ia.licaoDaBusca(ctx(), f, motivo), 'Critério de busca')
  return { licao: r?.licao ? guardarLicao('busca', r.licao, 'correcao') : null }
}

/** Busca agora (para ver o que viria): numa cidade escolhida ou sorteada. */
export async function buscarAgora(alvoId?: string) {
  const alvo = alvoId ? db.config.prospeccao.alvos.find((a) => a.id === alvoId) : undefined
  if (alvoId && !alvo) throw new Error('Cidade não encontrada em Prospecção.')
  const r = await reabastecer(alvo)
  return { achadas: r.achadas, novas: r.mantidas.length, fila: listarFila() }
}

// ---------------------------------------------------------------------------
// Testes de abordagens e números por ramo
// ---------------------------------------------------------------------------

export interface Numeros {
  abordados: number
  responderam: number
  quentes: number
  reunioes: number
  vendas: number
  pediramParar: number
  /** % que respondeu */
  taxaResposta: number
}

const QUENTE: Estado[] = ['quente', 'reuniao', 'fechado']

/** Contas de um grupo de conversas abordadas pelo agente. */
export function numerosDe(lista: Conversa[]): Numeros {
  const abordados = lista.length
  const responderam = lista.filter(respondeu).length
  return {
    abordados,
    responderam,
    quentes: lista.filter((c) => c.avisadoQuente || QUENTE.includes(c.estado)).length,
    reunioes: lista.filter((c) => c.estado === 'reuniao').length,
    vendas: lista.filter((c) => c.estado === 'fechado').length,
    pediramParar: lista.filter((c) => c.estado === 'optout').length,
    taxaResposta: abordados ? Math.round((responderam / abordados) * 100) : 0,
  }
}

/** Como cada ramo (tipo de negócio) está indo, só com o que o agente abordou. */
export function numerosPorRamo() {
  const grupos = new Map<string, Conversa[]>()
  for (const c of db.conversas) {
    if (c.origem !== 'agente') continue
    const k = c.nicho || 'Sem ramo'
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  return [...grupos.entries()].map(([ramo, lista]) => ({ ramo, ...numerosDe(lista) })).sort((a, b) => b.abordados - a.abordados)
}

/** Quem está ganhando o teste e com que certeza. */
function analiseDoTeste(t: Teste) {
  const deste = db.conversas.filter((c) => c.testeId === t.id)
  return analisarTeste(t.variantes.map((v) => ({ id: v.id, nome: v.nome, ...numerosDe(deste.filter((c) => c.variante === v.id)) })))
}

function verTeste(t: Teste) {
  const deste = db.conversas.filter((c) => c.testeId === t.id)
  return {
    analise: analiseDoTeste(t),
    ...t,
    abordados: deste.length,
    meta: t.porVariante * t.variantes.length,
    variantes: t.variantes.map((v) => ({ ...v, ...numerosDe(deste.filter((c) => c.variante === v.id)) })),
    total: numerosDe(deste),
  }
}

export function listarTestes() {
  return db.testes
    .slice()
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map(verTeste)
}

/** Cria um teste (a prospecção precisa estar ligada para ele rodar). */
export function criarTeste(body: { nome?: unknown; alvo?: Partial<Alvo>; variantes?: { nome?: unknown; angulo?: unknown }[]; porVariante?: unknown }) {
  const alvo = limparAlvo({ ...body.alvo, id: randomUUID(), ativo: true })
  if (!alvo) throw new Error('O teste precisa de cidade, UF e tipos de negócio da busca.')
  const variantes = (Array.isArray(body.variantes) ? body.variantes : [])
    .slice(0, 4)
    .map((v, i) => ({ id: randomUUID().slice(0, 8), nome: txt(v.nome, 60) || String.fromCharCode(65 + i), angulo: txt(v.angulo, 800) }))
    .filter((v) => v.angulo)
  if (variantes.length < 2) throw new Error('O teste precisa de pelo menos 2 abordagens, cada uma com o seu ângulo.')
  const t: Teste = {
    id: randomUUID(),
    nome: txt(body.nome, 80) || `${alvo.nichos.map((n) => n.nome).join(', ')} em ${alvo.cidade}`,
    alvo,
    variantes,
    porVariante: Math.round(num(body.porVariante, 3, 100, 15)),
    estado: 'rodando',
    criadoEm: iso(),
    encerradoEm: null,
    conclusao: '',
  }
  db.testes.push(t)
  registrar('aviso', `Teste criado: "${t.nome}" (${variantes.length} abordagens, ${t.porVariante} empresas cada)`)
  return verTeste(t)
}

export function mudarTeste(id: string, body: { estado?: unknown; conclusao?: unknown }) {
  const t = db.testes.find((x) => x.id === id)
  if (!t) throw new Error('Teste não encontrado.')
  if (body.estado === 'rodando' || body.estado === 'pausado' || body.estado === 'encerrado') {
    t.estado = body.estado
    t.encerradoEm = body.estado === 'encerrado' ? iso() : null
    // Empresas buscadas para o teste que não foram usadas voltam a ser da prospecção normal
    if (body.estado === 'encerrado') for (const f of db.fila) if (f.testeId === t.id) delete f.testeId
  }
  if (typeof body.conclusao === 'string') t.conclusao = txt(body.conclusao, 1500)
  registrar('aviso', `Teste "${t.nome}": ${t.estado}`)
  return verTeste(t)
}

const leadDeTeste = (l: Partial<Conversa> = {}) => ({
  empresa: txt(l.empresa, 120) || 'Pizzaria Bella Massa',
  nicho: txt(l.nicho, 80) || 'Pizzaria',
  cidade: txt(l.cidade, 80) || 'Londrina',
  uf: txt(l.uf, 2) || 'PR',
  endereco: txt(l.endereco, 200),
  site: txt(l.site, 200),
  instagram: txt(l.instagram, 200),
})

function exigirChave() {
  if (!chave) throw new Error('Coloque a chave da API primeiro.')
}

/** Treino: mostra a primeira mensagem que ele mandaria para uma empresa (não envia nada). */
export async function simularAbordagem(lead: Partial<Conversa>) {
  exigirChave()
  const r = await comIA(() => ia.abordagem(ctx(), leadDeTeste(lead)), 'Simulação')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu.')
  return r
}

function mensagensDeTeste(mensagens: { de?: unknown; texto?: unknown }[]): Mensagem[] {
  const agora = Date.now()
  return (Array.isArray(mensagens) ? mensagens : []).slice(-40).map((m, i, all) => ({
    id: String(i),
    de: m.de === 'lead' ? 'lead' : 'agente',
    texto: txt(m.texto, 1500),
    em: new Date(agora - (all.length - i) * 60_000).toISOString(),
  }))
}

/** Treino: você faz o papel do cliente e vê como ele responde (não envia nada). */
export async function simularConversa(lead: Partial<Conversa>, mensagens: { de?: unknown; texto?: unknown }[]) {
  exigirChave()
  const r = await comIA(() => ia.responder(ctx(), { ...leadDeTeste(lead), mensagens: mensagensDeTeste(mensagens), resumo: '' }), 'Simulação')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu.')
  return r
}

/** Treino: avaliação de uma resposta do simulador (a mensagem `indice`) vira lição. */
export async function avaliarSimulacao(mensagens: { de?: unknown; texto?: unknown }[], indice: number, nota: 'bom' | 'ruim', correcao: string) {
  exigirChave()
  const msgs = mensagensDeTeste(mensagens)
  const i = Math.trunc(Number(indice))
  if (!(i >= 0 && i < msgs.length) || msgs[i].de !== 'agente') throw new Error('Mensagem não encontrada.')
  if (nota !== 'bom' && nota !== 'ruim') throw new Error('Avaliação inválida.')
  const r = await comIA(() => ia.licaoDaCorrecao(ctx(), { mensagens: msgs }, i, nota, correcao), 'Lição da avaliação')
  return { licao: r?.licao ? guardarLicao('conversa', r.licao, 'correcao') : null }
}

export function atividade() {
  return db.atividade.slice(-200).reverse()
}

// ---------------------------------------------------------------------------
// Sincronização com o CRM (o app leva para os leads quando está aberto)
// ---------------------------------------------------------------------------

export function pendentesSinc() {
  return db.conversas
    .filter((c) => (!c.sinc.lead && !c.leadId) || c.mensagens.length > c.sinc.mensagens || c.estado !== c.sinc.estado)
    .slice(0, 40)
    .map((c) => ({
      id: c.id,
      leadId: c.leadId,
      telefone: c.telefone,
      empresa: c.empresa,
      origem: c.origem,
      bruto: c.leadId ? null : c.bruto,
      estado: c.estado,
      estadoAnterior: c.sinc.estado,
      temperatura: c.temperatura,
      resumo: c.resumo,
      total: c.mensagens.length,
      novas: c.mensagens.slice(c.sinc.mensagens).map(({ de, texto, em }) => ({ de, texto, em })),
    }))
}

export function marcarSinc(itens: { id?: unknown; leadId?: unknown; mensagens?: unknown; estado?: unknown }[]) {
  for (const it of Array.isArray(itens) ? itens : []) {
    const c = db.conversas.find((x) => x.id === it.id)
    if (!c) continue
    if (typeof it.leadId === 'string' && it.leadId) c.leadId = it.leadId
    c.sinc = {
      lead: c.sinc.lead || !!c.leadId,
      mensagens: Math.min(c.mensagens.length, Math.max(c.sinc.mensagens, Number(it.mensagens) || 0)),
      estado: typeof it.estado === 'string' ? (it.estado as Estado) : c.sinc.estado,
    }
  }
  salvar()
}

/** Telefones que já estão no CRM: o agente não aborda (o app manda ao sincronizar). */
export function definirConhecidos(telefones: unknown) {
  const lista = (Array.isArray(telefones) ? telefones : []).map((t) => phoneKey(String(t))).filter((k) => k.length >= 10)
  db.extra.conhecidos = [...new Set(lista)].slice(0, 200_000)
  salvar()
  return { total: db.extra.conhecidos.length }
}

// ---------------------------------------------------------------------------
// Chave do Google (a mesma de "Buscar empresas") e a tela Conversas da XS
// ---------------------------------------------------------------------------

/**
 * O app manda a chave do Google e quanto ainda cabe na cota do mês; o vendedor devolve quantas
 * consultas fez desde a última vez (o app soma no contador e confirma com `ack`).
 */
export function definirGoogle(body: { chave?: unknown; restante?: unknown; ack?: unknown }) {
  const g = db.extra.google
  if (typeof body.chave === 'string') g.chave = /^AIza[\w-]{30,}$/.test(body.chave.trim()) ? body.chave.trim() : ''
  if (body.restante !== undefined) g.restante = Math.max(0, Math.round(num(body.restante, 0, 1_000_000, 0)) - g.pendentes)
  const ack = Math.round(num(body.ack, 0, g.pendentes, 0))
  g.pendentes -= ack
  g.atualizadoEm = iso()
  salvar()
  return { temChave: !!g.chave, restante: g.restante, pendentes: g.pendentes }
}

/** Para a lista da tela Conversas: quais números estão com o vendedor e em que pé. */
export function mapaConversas() {
  return db.conversas
    .filter((c) => c.estado !== 'optout' || Date.now() - Date.parse(c.atualizadaEm) < 7 * 86_400_000)
    .map((c) => ({ id: c.id, telefone: c.telefone, estado: c.estado, temperatura: c.temperatura, aguardando: !!c.aguardandoVoce || (c.estado === 'humano' && c.mensagens.at(-1)?.de === 'lead') }))
}

/** A conversa do vendedor com um número (para a tela Conversas): estado, ficha e quais mensagens foram dele. */
export function conversaPorTelefone(telefone: string) {
  const c = porTelefone(telefone)
  if (!c) return null
  const pendencia = c.aguardandoVoce ? (db.pendencias.find((p) => p.id === c.aguardandoVoce && !p.resolvidaEm) ?? null) : null
  return {
    id: c.id,
    estado: c.estado,
    temperatura: c.temperatura,
    resumo: c.resumo,
    origem: c.origem,
    fatos: c.fatos ?? [],
    pendente: c.pendente,
    pendencia: pendencia ? { id: pendencia.id, tipo: pendencia.tipo, texto: pendencia.texto, motivo: pendencia.motivo ?? '', mensagens: pendencia.rascunho?.mensagens ?? [] } : null,
    doAgente: c.mensagens.filter((m) => m.de === 'agente' && m.waId).map((m) => ({ waId: m.waId!, trace: m.trace ?? null })),
  }
}

/**
 * Você entrega ao vendedor uma conversa da tela Conversas: ele assume com o histórico recente.
 * Se a última mensagem é do cliente, responde em instantes.
 */
export function entregarAoAgente(telefone: string, nome?: string) {
  const tel = formatBrazilPhone(telefone)
  if (!isValidBrazilWhatsApp(tel)) throw new Error('Telefone inválido.')
  if (db.extra.apagados.includes(phoneKey(tel))) throw new Error('Este contato foi apagado a pedido e não pode receber mensagens.')
  let c = porTelefone(tel)
  if (c?.estado === 'optout') throw new Error('Esta pessoa pediu para não receber mensagens.')
  if (!c) {
    const hist = abrirConversa(tel)
    c = novaConversa({ telefone: hist.telefone || tel, empresa: txt(nome, 120) || hist.nome || tel, origem: 'manual', estado: 'conversando' })
    c.mensagens = hist.msgs
      .filter((m) => m.texto)
      .slice(-20)
      .map((m) => ({ id: randomUUID(), de: m.deMim ? ('voce' as const) : ('lead' as const), texto: m.texto, em: m.em, waId: m.id }))
    c.sinc.mensagens = c.mensagens.length
    db.conversas.push(c)
  } else {
    c.estado = respondeu(c) ? (c.temperatura === 'quente' ? 'quente' : 'conversando') : 'aguardando'
  }
  c.aguardandoVoce = null
  if (c.mensagens.at(-1)?.de === 'lead') {
    c.pendente = true
    c.responderEm = new Date(Date.now() + 5000).toISOString()
  }
  registrar('aviso', `Você entregou a conversa com ${c.empresa} ao vendedor`, c.id)
  return conversaPorTelefone(c.telefone)
}

/** Assumir pelo número (botão da tela Conversas). */
export function assumirPorTelefone(telefone: string) {
  const c = porTelefone(telefone)
  if (!c) throw new Error('O vendedor não está nesta conversa.')
  assumir(c.id)
  return conversaPorTelefone(c.telefone)
}

// ---------------------------------------------------------------------------
// "Precisa de você", Segurança e nível de piloto (telas da fase 1)
// ---------------------------------------------------------------------------

const recente = (a: Pendencia, b: Pendencia) => b.criadaEm.localeCompare(a.criadaEm)

/** A fila: abertas (mais novas primeiro) com o fim da conversa, e as últimas resolvidas. */
export function listarPendencias() {
  const comConversa = (p: Pendencia) => {
    const c = p.conversaId ? db.conversas.find((x) => x.id === p.conversaId) : undefined
    return {
      ...p,
      telefone: c?.telefone ?? null,
      estado: c?.estado ?? null,
      ultimas: (c?.mensagens ?? []).slice(-4).map((m) => ({ de: m.de, texto: m.texto.slice(0, 600), em: m.em })),
    }
  }
  return {
    abertas: db.pendencias.filter((p) => !p.resolvidaEm).sort(recente).map(comConversa),
    resolvidas: db.pendencias
      .filter((p) => p.resolvidaEm)
      .sort((a, b) => String(b.resolvidaEm).localeCompare(String(a.resolvidaEm)))
      .slice(0, 30),
  }
}

const resolvendo = new Set<string>()

/**
 * Você resolve um item: aprovar (sai como está), editar (sai o seu texto), descartar (não sai) ou
 * feita (aviso lido). Antes de sair, as conferências legais rodam de novo (parar, LGPD, horário).
 */
export async function resolverPendencia(pid: string, acao: string, textos?: unknown) {
  const p = db.pendencias.find((x) => x.id === pid)
  if (!p) throw new Error('Item não encontrado.')
  if (p.resolvidaEm) throw new Error('Este item já foi resolvido.')
  if (resolvendo.has(pid)) throw new Error('Este item já está sendo enviado.')
  const c = p.conversaId ? db.conversas.find((x) => x.id === p.conversaId) : undefined
  const fechar = (resultado: NonNullable<Pendencia['resultado']>) => {
    Object.assign(p, { resolvidaEm: iso(), resultado })
    if (c?.aguardandoVoce === p.id) c.aguardandoVoce = null
  }
  if (acao === 'descartar' || acao === 'feita') {
    fechar(acao === 'descartar' ? 'descartada' : 'feita')
    if (c && acao === 'descartar' && p.rascunho) {
      // Abordagem que nem saiu: a conversa some; resposta descartada: o cliente fica esperando você
      if (!c.mensagens.length) db.conversas.splice(db.conversas.indexOf(c), 1)
      else if (c.mensagens.at(-1)?.de === 'lead' && ESTADOS_ATIVOS.includes(c.estado)) c.estado = 'humano'
      registrar('aviso', `Você descartou a mensagem para ${c.empresa}`, c.id)
    }
    salvar()
    return { ok: true }
  }
  if (acao !== 'aprovar' && acao !== 'editar') throw new Error('Ação inválida.')
  if (!p.rascunho || !c) throw new Error('Este item não tem mensagem para enviar.')
  if (c.estado === 'optout') throw new Error('Esta pessoa pediu para não receber mensagens.')
  const editada = acao === 'editar'
  const mensagens = editada
    ? (Array.isArray(textos) ? textos : [textos]).map((t) => String(t ?? '').trim().slice(0, 4000)).filter(Boolean).slice(0, 3)
    : p.rascunho.mensagens
  if (!mensagens.length) throw new Error('Escreva a mensagem.')
  const r = conferirLegal({ mensagens, acao: p.rascunho.acao }, contextoConferencia(c, false))
  if (!r.ok) throw new Error(`${r.titulo}: ${r.motivo}`)
  resolvendo.add(pid)
  try {
    const primeira = !c.mensagens.some((m) => m.de !== 'lead')
    const { agente, fontes, reescritas, barradas } = p.rascunho
    await enviar(c, mensagens, 'agente', { agente, fontes, conferencias: r.passou.length, reescritas, barradas })
    fechar(editada ? 'editada' : 'aprovada')
    registrar('aviso', `Você ${editada ? 'editou e enviou' : 'aprovou'} a mensagem para ${c.empresa}`, c.id)
    if (primeira && c.origem === 'agente') hoje().abordados++
    const apresentou = agente === 'abridor' && !!c.apresentar
    if (apresentou) c.apresentar = false
    await aplicarAcao(c, { mensagens, acao: p.rascunho.acao, dados: p.rascunho.dados }, apresentou)
    salvar()
  } finally {
    resolvendo.delete(pid)
  }
  return { ok: true }
}

/** O que a tela de Segurança mostra: as conferências, os opcionais e o nível com o que falta para subir. */
export function seguranca() {
  const cfg = db.config
  const notaProva = db.lab.provas.filter((x) => x.estado === 'pronta' && x.nota !== null).at(-1)?.nota ?? null
  const barradas = new Set(db.pendencias.filter((p) => p.tipo === 'barrada').map((p) => p.conversaId))
  const dados = {
    notaProva,
    conversasSemBarrar: db.conversas.filter((c) => c.mensagens.some((m) => m.de === 'agente') && !barradas.has(c.id)).length,
    vendasOuReunioes: Object.values(db.dias).reduce((s, d) => s + (d.vendas ?? 0) + (d.reunioes ?? 0), 0),
    podeFechar: pode(cfg, 'mandar_pix') || pode(cfg, 'pedir_contrato'),
  }
  const dia = diaDe()
  return {
    conferencias: CONFERENCIAS,
    opcionais: cfg.conferencias,
    piloto: cfg.piloto,
    desceuNivel: db.extra.desceuNivel,
    paradoEm: db.extra.paradoEm,
    ativo: cfg.ativo,
    barradasHoje: db.pendencias.filter((p) => p.tipo === 'barrada' && diaDe(new Date(p.criadaEm)) === dia).length,
    niveis: ([1, 2, 3, 4] as Piloto[]).map((n) => ({ nivel: n, faltam: requisitosNivel(n, dados) })),
  }
}

/** Muda o nível de piloto: descer sempre pode; subir só com os requisitos cumpridos. */
export function mudarNivel(valor: unknown) {
  const n = Number(valor)
  if (![1, 2, 3, 4].includes(n)) throw new Error('Nível inválido.')
  const nivel = n as Piloto
  if (nivel > db.config.piloto) {
    const faltam = seguranca().niveis.find((x) => x.nivel === nivel)?.faltam ?? []
    if (faltam.length) throw new Error(`Para subir ao nível ${nivel}, falta: ${faltam.join(' ')}`)
  }
  if (nivel !== db.config.piloto) {
    db.config.piloto = nivel
    db.extra.desceuNivel = null
    registrar('nivel', `Você mudou o nível de piloto para ${nivel}`)
    salvar(true)
  }
  return seguranca()
}

