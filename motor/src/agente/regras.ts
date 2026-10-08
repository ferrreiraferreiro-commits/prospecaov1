// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Regras puras do agente (sem WhatsApp nem IA): horários, cota do dia, ritmo das abordagens,
 * pedidos para parar, escolha da próxima cidade/nicho e custo.
 */
import { MODELOS, type Alvo, type Conversa, type Modelo } from './tipos.js'

/** DDD + 8 últimos dígitos (o nono dígito não engana), igual ao resto da XS. */
export function phoneKey(p: string | null | undefined): string {
  const d = String(p ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d
}

/** Data local (fuso da VPS: America/Sao_Paulo) no formato AAAA-MM-DD. */
export function diaDe(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Está entre `inicio` e `fim` (horas cheias, fim exclusivo) e num dos dias da semana? */
export function dentroDoHorario(agora: Date, inicio: number, fim: number, dias?: number[]): boolean {
  if (dias && !dias.includes(agora.getDay())) return false
  const h = agora.getHours() + agora.getMinutes() / 60
  return h >= inicio && h < fim
}

/** Próximo momento em que o horário abre (para respostas que chegaram de madrugada). */
export function proximaAbertura(agora: Date, inicio: number, fim: number, dias?: number[]): Date {
  for (let i = 0; i < 8; i++) {
    const d = new Date(agora)
    d.setDate(d.getDate() + i)
    d.setHours(inicio, 0, 0, 0)
    if (dias && !dias.includes(d.getDay())) continue
    if (i === 0 && agora.getHours() >= fim) continue
    return d > agora ? d : agora
  }
  return new Date(agora.getTime() + 60 * 60_000)
}

/**
 * Quantas empresas abordar hoje: começa em `porDiaInicial` e sobe `aumentoSemana` por semana desde o
 * primeiro dia de prospecção, até `porDiaMax`. Um problema no número (risco) recomeça a contagem.
 */
export function cotaDoDia(p: { porDiaInicial: number; porDiaMax: number; aumentoSemana: number }, desde: string | null, hoje = new Date()): number {
  const base = Math.max(1, Math.round(p.porDiaInicial))
  const teto = Math.max(base, Math.round(p.porDiaMax))
  if (!desde) return base
  const semanas = Math.floor((hoje.getTime() - Date.parse(`${desde}T00:00:00`)) / (7 * 86_400_000))
  return Math.min(teto, base + Math.max(0, semanas) * Math.max(0, Math.round(p.aumentoSemana)))
}

/**
 * Espera até a próxima abordagem: espalha as que faltam pelo resto do horário, com sorteio (±40%),
 * nunca menos de 4 min nem mais de 90 min.
 */
export function intervaloAbordagemMs(agora: Date, fim: number, faltam: number, sorteio = Math.random()): number {
  const fimHoje = new Date(agora)
  fimHoje.setHours(fim, 0, 0, 0)
  const janela = Math.max(0, fimHoje.getTime() - agora.getTime())
  const media = faltam > 0 ? janela / faltam : 60 * 60_000
  const ms = media * (0.6 + 0.8 * sorteio)
  return Math.round(Math.min(90 * 60_000, Math.max(4 * 60_000, ms)))
}

/** Tempo "digitando…" antes de cada balão: parece gente, sem demorar demais. */
export function tempoDigitandoMs(texto: string, sorteio = Math.random()): number {
  const ms = 1200 + texto.length * 45
  return Math.round(Math.min(14_000, Math.max(2000, ms)) * (0.85 + 0.3 * sorteio))
}

/** Espera depois da mensagem do lead (ele pode estar mandando várias seguidas). */
export function esperaRespostaMs(sorteio = Math.random()): number {
  return Math.round(25_000 + 35_000 * sorteio)
}

const PARAR =
  /\b(pare|para|parem)\s+de\s+(me\s+)?(mandar|enviar|chamar)|n[ãa]o\s+(me\s+)?(mande|mandem|envie|enviem|chame|chamem)\s+mais|me\s+(tira|tire|tirem|remove|remova|exclui|exclua)\b|descadastr|\bvou\s+(te\s+)?(denunciar|bloquear)|\bspam\b|sai\s+fora/i

/** Pedido claro para não receber mais mensagens: o agente para na hora, sem perguntar à IA. */
export function pediuParaParar(texto: string): boolean {
  return PARAR.test(texto)
}

/** Já respondeu alguma vez (de verdade: resposta automática do WhatsApp Business não conta)? */
export const respondeu = (c: Pick<Conversa, 'mensagens'>) => c.mensagens.some((m) => m.de === 'lead' && !m.auto)

/** Frases típicas de resposta automática (WhatsApp Business, robôs de atendimento). */
const AUTOMATICA_FORTE =
  /mensagem\s+autom[aá]tica|resposta\s+autom[aá]tica|(obrigad[oa]|agradecemos|agrade[cç]o)\s+(por|pelo|pela)\s+(o\s+|seu\s+|sua\s+)?(entrar\s+em\s+)?(contato|mensagem)|em\s+breve\s+(retornaremos|responderemos|entraremos|daremos|retorno|um\s+de\s+nossos|um\s+atendente|voc[eê]\s+ser[aá]|iremos)|(no\s+momento|agora)\s+(n[aã]o\s+)?(estamos|estou|nos\s+encontramos)\s+(dispon[ií]ve(l|is)|ausentes?|fora|fechad[oa]s?)|nosso\s+hor[aá]rio\s+de\s+(atendimento|funcionamento)|(digite|escolha|selecione|responda\s+com)\s+(o\s+n[uú]mero|uma\s+das\s+op[cç][oõ]es|a\s+op[cç][aã]o|\d)|assim\s+que\s+poss[ií]vel\s+(retornaremos|responderemos|te\s+respond)|fora\s+do\s+(nosso\s+)?hor[aá]rio\s+de\s+atendimento|confira\s+(nosso|o)\s+card[aá]pio\s*:?\s*(https?:|www\.)/i
/** Frases que um robô e uma pessoa usam: só contam como automáticas se chegarem quase na hora. */
const AUTOMATICA_FRACA = /seja\s+(muito\s+)?bem[\s-]?vind[oa]|como\s+(podemos|posso)\s+(te\s+|lhe\s+)?(ajudar|ser\s+[uú]til)|em\s+que\s+(podemos|posso)\s+(te\s+|lhe\s+)?ajudar|ol[aá]!?\s+tudo\s+bem\?\s*$/i

/**
 * Parece resposta automática? `segundos` = tempo desde a nossa mensagem. As fortes valem até 15 min;
 * as fracas só até 20 s (gente de verdade não responde tão rápido com saudação de robô).
 */
export function pareceAutomatica(texto: string, segundos: number): boolean {
  const t = String(texto ?? '')
  if (segundos > 15 * 60) return false
  if (AUTOMATICA_FORTE.test(t)) return true
  return segundos <= 20 && AUTOMATICA_FRACA.test(t)
}

/** Ramos que vivem de horário de pico (comida): não abordar no meio do almoço nem do jantar. */
const RAMO_COMIDA =
  /restaurante|pizzaria|pizza|lanchonete|lanche|hamburgu|burger|\bbar\b|boteco|padaria|panificadora|a[cç]a[ií]|sorveteria|marmit|churrascaria|cafeteria|caf[eé]\b|delivery|pastelaria|sushi|japones|temaki|espetinho|food|comida|cozinha|esfiha|esfirra|confeitaria|doceria|petiscaria|cervejaria|choperia|bistr[oô]/i

/** Boa hora para abordar este ramo? Comida: fora de 11h30–14h e 18h30–21h. */
export function boaHoraPara(nicho: string, agora: Date): boolean {
  if (!RAMO_COMIDA.test(nicho ?? '')) return true
  const h = agora.getHours() + agora.getMinutes() / 60
  return !((h >= 11.5 && h < 14) || (h >= 18.5 && h < 21))
}

/** Saúde do número nos últimos dias: muita gente pedindo para parar = risco de bloqueio. */
export function saudeDoNumero(dias: { abordados: number; optouts: number }[]): { abordados: number; optouts: number; taxaOptout: number; ruim: boolean } {
  const abordados = dias.reduce((s, d) => s + (d.abordados || 0), 0)
  const optouts = dias.reduce((s, d) => s + (d.optouts || 0), 0)
  const taxaOptout = abordados ? optouts / abordados : 0
  return { abordados, optouts, taxaOptout, ruim: abordados >= 20 && taxaOptout > 0.05 }
}

/** Freio do dia: 3 ou mais pedidos para parar e pelo menos 10% dos abordados hoje. */
export function precisaFrear(d: { abordados: number; optouts: number }): boolean {
  return d.optouts >= 3 && d.optouts >= 0.1 * Math.max(1, d.abordados)
}

export interface NumerosVariante {
  id: string
  nome: string
  abordados: number
  responderam: number
  quentes: number
  vendas: number
}

export interface AnaliseTeste {
  /** Abordagem na frente (null = empate ou poucos dados) */
  lider: string | null
  confianca: 'poucos_dados' | 'baixa' | 'media' | 'alta'
  texto: string
}

/**
 * Compara as abordagens de um teste pela % de resposta (teste de duas proporções entre a 1ª e a 2ª).
 * Menos de 10 empresas por abordagem = poucos dados. 90% de certeza = média; 95% = alta.
 */
export function analisarTeste(vs: NumerosVariante[]): AnaliseTeste {
  const taxa = (v: NumerosVariante) => (v.abordados ? v.responderam / v.abordados : 0)
  const ordem = vs.slice().sort((a, b) => taxa(b) - taxa(a) || b.quentes - a.quentes)
  const [a, b] = ordem
  const pct = (v: NumerosVariante) => `${Math.round(taxa(v) * 100)}%`
  if (!a || !b) return { lider: null, confianca: 'poucos_dados', texto: 'O teste precisa de pelo menos 2 abordagens.' }
  if (vs.some((v) => v.abordados < 10)) {
    return { lider: null, confianca: 'poucos_dados', texto: `Poucos dados ainda (menos de 10 empresas em alguma abordagem). Por enquanto: ${a.nome} ${pct(a)} de resposta x ${b.nome} ${pct(b)}.` }
  }
  const p = (a.responderam + b.responderam) / (a.abordados + b.abordados)
  const erro = Math.sqrt(p * (1 - p) * (1 / a.abordados + 1 / b.abordados))
  const z = erro > 0 ? (taxa(a) - taxa(b)) / erro : 0
  const extra = a.quentes || a.vendas ? ` (${a.quentes} quente(s), ${a.vendas} venda(s))` : ''
  if (z >= 1.96) return { lider: a.id, confianca: 'alta', texto: `${a.nome} venceu: ${pct(a)} de resposta contra ${pct(b)} da ${b.nome}${extra}. Diferença clara (95% de certeza).` }
  if (z >= 1.645) return { lider: a.id, confianca: 'media', texto: `${a.nome} está na frente: ${pct(a)} contra ${pct(b)} da ${b.nome}${extra}. Boa chance de ser melhor (90% de certeza).` }
  return { lider: null, confianca: 'baixa', texto: `Empate técnico: ${a.nome} ${pct(a)} x ${b.nome} ${pct(b)} de resposta. A diferença ainda pode ser sorte; olhe também quentes e vendas.` }
}

/**
 * Próxima cidade/nicho para buscar: sorteio com peso pela taxa de resposta de cada alvo (as que
 * respondem mais saem mais vezes, mas toda cidade nova ainda ganha chance).
 */
export function escolherAlvo(alvos: Alvo[], conversas: Pick<Conversa, 'alvoId' | 'mensagens' | 'origem'>[], sorteio = Math.random()): Alvo | null {
  const ativos = alvos.filter((a) => a.ativo && a.nichos.length && a.cidade && a.uf)
  if (!ativos.length) return null
  const pesos = ativos.map((a) => {
    const deste = conversas.filter((c) => c.origem === 'agente' && c.alvoId === a.id)
    const resp = deste.filter(respondeu).length
    return (resp + 1) / (deste.length + 3)
  })
  const total = pesos.reduce((s, p) => s + p, 0)
  let x = sorteio * total
  for (let i = 0; i < ativos.length; i++) {
    x -= pesos[i]
    if (x <= 0) return ativos[i]
  }
  return ativos[ativos.length - 1]
}

/** Custo de uma chamada à IA (US$): cache lido sai a 10% e cache gravado a 125% da entrada. */
export function custoUSD(modelo: Modelo, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = MODELOS[modelo]
  const entrada = u.input_tokens + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.cache_creation_input_tokens ?? 0) * 1.25
  return (entrada * p.entrada + u.output_tokens * p.saida) / 1_000_000
}

export function saudacao(agora = new Date()): string {
  const h = agora.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}
