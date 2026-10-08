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

/** Já respondeu alguma vez? */
export const respondeu = (c: Pick<Conversa, 'mensagens'>) => c.mensagens.some((m) => m.de === 'lead')

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
