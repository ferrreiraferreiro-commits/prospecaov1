// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * A equipe em volta do vendedor: treino (persona, material, entrevista, "meu jeito"), Laboratório
 * (prova, versões, casos), Caderno (Obsidian), agenda, pós-venda, Professor e padrões.
 * Os módulos vieram do projeto separado xs-ia; aqui eles usam o vendedor de verdade (agente.ts).
 */
import { randomUUID } from 'node:crypto'
import { materiaisComTreino, precoVelho, proximosPassos, TIPO_MATERIAL } from './base.js'
import { arquivosDoCaderno, importarNota, zipDoCaderno } from './caderno.js'
import { CAPACIDADES, jaVemSabendo, ligarPacote, resumoPacotes } from './capacidades.js'
import { CONFERENCIAS } from './conferente.js'
import * as agente from './agente.js'
import { db, salvar } from './estado.js'
import * as apoio from './ia-apoio.js'
import { compararProvas, criarVersao, iniciarProva, marcarCaso, PERSONAS, versaoAtual, voltarVersao, type Prova } from './laboratorio.js'
import { TODOS_ROTEIROS } from './metodo.js'
import { confirmarVespera, painelPadroes, posVendaJob, professor } from './rotinas.js'
import { dentroDoHorario, diaDe } from './regras.js'
import type { AgenteIA, Dados } from './adaptador.js'
import type { Conversa, Licao, Material } from './tipos.js'

const { ctx, comIA, apoioPara, contextoConferencia, sair, novaPendencia, guardarLicao } = agente.interno
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const iso = () => new Date().toISOString()

/** O vendedor do jeito que os módulos do xs-ia esperam. */
export const equipe: AgenteIA = {
  get d() {
    return db as unknown as Dados
  },
  get cfg() {
    return db.config
  },
  salvar: () => salvar(),
  ctx,
  comIA: (fn) => comIA(fn, 'Equipe'),
  apoioPara: (c, consulta, comAgenda) => apoioPara(c, consulta, comAgenda),
  contexto: (c, proativa, agora) => contextoConferencia(c, proativa, agora),
  entregarFalso: (l) => {
    const agora = iso()
    return { id: 'simulacao', telefone: '0', jid: null, origem: 'manual', empresa: l.empresa, nicho: l.nicho, cidade: l.cidade, uf: l.uf, endereco: '', site: '', instagram: '', alvoId: null, leadId: null, bruto: null, estado: 'conversando', temperatura: 'frio', resumo: '', mensagens: [], followups: 0, pendente: false, responderEm: null, ultimaChave: null, avisadoQuente: false, criadaEm: agora, atualizadaEm: agora, sinc: { mensagens: 0, estado: null, lead: false } }
  },
  sair: async (c, pronto, o) => {
    const s = await sair(c, pronto, o)
    if (s.tipo === 'enviada') return 'enviada'
    if (s.tipo === 'aguardando') return 'aguardando'
    return s.pendencia ? 'barrada' : 'adiada'
  },
  pendencia: (p) => novaPendencia(p),
  novaLicao: (l) => {
    const { texto, origem, ...resto } = l
    const x = guardarLicao(l.tipo ?? 'conversa', texto, origem ?? 'voce', resto) as Licao
    if (x.status === 'proposta') novaPendencia({ tipo: 'licao', texto: 'Lição proposta para o Caderno.', motivo: x.texto, licao: x })
    return x
  },
  ultimaNota: () => db.lab.provas.filter((p) => p.estado === 'pronta' && p.nota !== null).at(-1)?.nota ?? null,
}

// ---------------------------------------------------------------- rotinas (uma por vez, no ciclo)

agente.rotinasExtras.push(async (t) => {
  const cfg = db.config
  const ferias = !!cfg.feriasAte && diaDe(t) <= cfg.feriasAte
  if (!ferias && dentroDoHorario(t, cfg.prospeccao.inicio, cfg.prospeccao.fim, cfg.prospeccao.dias)) {
    if (await confirmarVespera(equipe, t)) return true
    if (await posVendaJob(equipe, t)) return true
  }
  return t.getHours() >= Math.min(22, cfg.respostas.fim) && !!(await professor(equipe, t))
})

// ---------------------------------------------------------------- treino

/** Tudo o que a tela de Treino precisa de uma vez. */
export function treino() {
  const cfg = db.config
  return {
    persona: cfg.persona,
    estiloResposta: cfg.estiloResposta,
    pacotes: resumoPacotes(cfg),
    jaVemSabendo: jaVemSabendo(cfg),
    nuncaVaiFazer: CONFERENCIAS.filter((c) => c.fixa).map((c) => c.titulo),
    entrevista: db.lab.entrevista,
    roteiros: TODOS_ROTEIROS,
    totalCapacidades: CAPACIDADES.length,
  }
}

export function ligarPacoteDoTreino(pacote: string, ligado: boolean) {
  agente.salvarConfig({ capacidades: ligarPacote(db.config.capacidades, txt(pacote, 40), !!ligado) })
  criarVersao(equipe, `Pacote ${pacote} ${ligado ? 'ligado' : 'desligado'}`)
  return treino()
}

/** Entrevista com o Xico: devolve a próxima pergunta, ou o resultado para você revisar. */
export async function entrevista(resposta?: unknown, encerrar?: unknown) {
  const e = (db.lab.entrevista ??= { mensagens: [], resultado: null, em: iso() })
  const r0 = txt(resposta, 3000)
  if (r0) e.mensagens.push({ de: 'voce', texto: r0 })
  const r = await comIA(() => apoio.entrevista(ctx(), e.mensagens, encerrar === true), 'Entrevista do treino')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu agora.')
  if (r.pergunta) e.mensagens.push({ de: 'xico', texto: r.pergunta })
  if (r.terminou) e.resultado = r.resultado
  salvar()
  return db.lab.entrevista
}

export function recomecarEntrevista() {
  db.lab.entrevista = null
  salvar()
  return null
}

/** Aplica o resultado da entrevista no treino e no material (guarda uma versão antes). */
export function aplicarEntrevista() {
  const r = db.lab.entrevista?.resultado as (typeof apoio.ResultadoEntrevista)['_output'] | null
  if (!r) throw new Error('A entrevista ainda não terminou.')
  criarVersao(equipe, 'Antes da entrevista com o Xico')
  const n = db.config.negocio
  agente.salvarConfig({
    negocio: { ...n, apresentacao: r.apresentacao || n.apresentacao, oferta: r.oferta || n.oferta, pagamento: r.pagamento || n.pagamento, descontoMax: r.descontoMax || n.descontoMax, portfolio: r.portfolio || n.portfolio, objecoes: r.objecoes || n.objecoes, estilo: r.estilo || n.estilo, regras: r.regras || n.regras },
    persona: { ...db.config.persona, nome: r.nomeAssistente || db.config.persona.nome, tom: r.tom },
  })
  if (r.perguntasFrequentes) salvarMaterial({ titulo: 'Perguntas frequentes (entrevista)', tipo: 'faq', texto: r.perguntasFrequentes })
  if (r.politica) salvarMaterial({ titulo: 'Política (entrevista)', tipo: 'politica', texto: r.politica })
  db.lab.entrevista = null
  criarVersao(equipe, 'Entrevista com o Xico')
  salvar()
  return treino()
}

/** "Copiar meu jeito": lê mensagens que você mandou (pela XS ou pelo celular) e descreve o seu estilo. */
export async function meuJeito(extras?: unknown) {
  const minhas = db.conversas.flatMap((c) => c.mensagens.filter((m) => m.de === 'voce').map((m) => m.texto))
  const coladas = txt(extras, 8000).split('\n').map((s) => s.trim()).filter(Boolean)
  const todas = [...minhas, ...coladas].filter((t) => t.length > 3).slice(-60)
  if (todas.length < 5) throw new Error('Preciso de pelo menos 5 mensagens suas. Cole algumas no campo, uma por linha.')
  const r = await comIA(() => apoio.meuJeito(ctx(), todas), 'Copiar meu jeito')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu agora.')
  return r
}

// ---------------------------------------------------------------- material (o que ele consulta)

export function materiais() {
  return {
    lista: db.materiais.map((m) => ({ ...m, velho: precoVelho(m) })),
    passos: proximosPassos(materiaisComTreino(db.materiais, db.config)),
    tipos: TIPO_MATERIAL,
    lacunas: db.pendencias.filter((p) => p.tipo === 'lacuna' && !p.resolvidaEm).map((p) => ({ id: p.id, pergunta: p.motivo ?? '', texto: p.texto })),
  }
}

export function salvarMaterial(b: { id?: unknown; titulo?: unknown; tipo?: unknown; texto?: unknown; ativo?: unknown }) {
  const tipo = (Object.keys(TIPO_MATERIAL) as Material['tipo'][]).includes(b.tipo as Material['tipo']) ? (b.tipo as Material['tipo']) : 'outro'
  const titulo = txt(b.titulo, 120) || TIPO_MATERIAL[tipo]
  const texto = txt(b.texto, 20000)
  if (!texto) throw new Error('Escreva o texto do material.')
  const m = b.id ? db.materiais.find((x) => x.id === b.id) : undefined
  if (m) Object.assign(m, { titulo, tipo, texto, ativo: b.ativo !== false, atualizadoEm: iso() })
  else db.materiais.push({ id: randomUUID(), titulo, tipo, texto, ativo: b.ativo !== false, atualizadoEm: iso() })
  criarVersao(equipe, `Material: ${titulo}`)
  salvar()
  return materiais()
}

export function apagarMaterial(id: string) {
  db.materiais = db.materiais.filter((m) => m.id !== id)
  criarVersao(equipe, 'Material apagado')
  salvar()
  return materiais()
}

// ---------------------------------------------------------------- Laboratório

export function laboratorio() {
  const provas = db.lab.provas as unknown as Prova[]
  return {
    provas: provas.slice(-10).reverse(),
    comparar: compararProvas(equipe),
    versoes: (db.lab.versoes as { n: number; em: string; motivo: string }[]).map(({ n, em, motivo }) => ({ n, em, motivo })).reverse(),
    versaoAtual: versaoAtual(equipe),
    casos: db.lab.casos.slice(-30).reverse(),
    personas: PERSONAS.map(({ id, nome, categoria, nicho, jeito }) => ({ id, nome, categoria, nicho, jeito })),
  }
}

export function rodarProva(tamanho: unknown) {
  iniciarProva(equipe, Math.max(3, Math.min(30, Number(tamanho) || 10)))
  return laboratorio()
}

export function salvarVersao(motivo: unknown) {
  criarVersao(equipe, txt(motivo, 120) || 'Versão salva por você')
  return laboratorio()
}

export function voltarParaVersao(n: unknown) {
  voltarVersao(equipe, Number(n))
  return laboratorio()
}

export function casoDaConversa(conversaId: string, mensagemId: unknown, tipo: unknown) {
  marcarCaso(equipe, conversaId, txt(mensagemId, 80), tipo === 'erro' ? 'erro' : 'ouro')
  return laboratorio()
}

// ---------------------------------------------------------------- Caderno

export function caderno() {
  return {
    licoes: db.licoes.slice().sort((a, b) => b.em.localeCompare(a.em)),
    diario: Object.entries(db.diario)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .map(([dia, d]) => ({ dia, ...d })),
    arquivos: arquivosDoCaderno(equipe).length,
  }
}

export function cadernoZip() {
  return { nome: 'Caderno XS.zip', base64: zipDoCaderno(arquivosDoCaderno(equipe)).toString('base64') }
}

export function cadernoArquivos() {
  return arquivosDoCaderno(equipe)
}

export function importarDoObsidian(caminho: unknown, conteudo: unknown) {
  importarNota(equipe, txt(caminho, 300), txt(conteudo, 20000))
  return { ok: true }
}

/** Muda o status, o escopo ou o texto de uma lição do Caderno. */
export function editarLicaoDoCaderno(id: string, b: { status?: unknown; escopo?: unknown; texto?: unknown; titulo?: unknown }) {
  const l = db.licoes.find((x) => x.id === id)
  if (!l) throw new Error('Lição não encontrada.')
  if (b.status === 'ativa' || b.status === 'arquivada') Object.assign(l, { status: b.status, ativa: b.status === 'ativa' })
  if (typeof b.escopo === 'string') l.escopo = txt(b.escopo, 80) || 'geral'
  if (typeof b.texto === 'string' && b.texto.trim()) l.texto = txt(b.texto, 400)
  if (typeof b.titulo === 'string') l.titulo = txt(b.titulo, 80)
  criarVersao(equipe, 'Lição editada')
  salvar()
  return caderno()
}

// ---------------------------------------------------------------- agenda e números

export function agenda() {
  return {
    config: db.config.agenda,
    reunioes: db.reunioes.slice().sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 60),
  }
}

export function marcarReuniao(id: string, estado: unknown) {
  const r = db.reunioes.find((x) => x.id === id)
  if (!r) throw new Error('Reunião não encontrada.')
  if (!['marcada', 'confirmada', 'cancelada', 'veio', 'faltou'].includes(String(estado))) throw new Error('Estado inválido.')
  r.estado = estado as typeof r.estado
  salvar()
  return agenda()
}

export function padroes() {
  return painelPadroes(equipe)
}

export const _paraTeste = { conversaFalsa: (): Conversa => equipe.entregarFalso({ empresa: 'X', nicho: 'Barbearia', cidade: 'Londrina', uf: 'PR' }) }
