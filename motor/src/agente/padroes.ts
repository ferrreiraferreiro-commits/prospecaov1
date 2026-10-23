// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Padrões das suas conversas (sem texto de conversa, só números): que hora e que ramo respondem mais,
 * e os horários livres para marcar conversa com você. Tudo puro.
 */
import { feriadoNacional } from './conferente.js'
import { respondeu } from './regras.js'
import type { AgenteConfig, Conversa, Reuniao } from './tipos.js'

export type Faixa = 'manha' | 'tarde' | 'noite'
export const faixaDe = (h: number): Faixa => (h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite')
export const NOME_FAIXA: Record<Faixa, string> = { manha: 'manhã', tarde: 'tarde', noite: 'noite' }

/** Mínimo de abordagens para um número valer alguma coisa */
const MINIMO = 8

interface Conta {
  abordados: number
  responderam: number
}
const taxa = (c: Conta) => (c.abordados ? Math.round((c.responderam / c.abordados) * 100) : 0)

export interface Padroes {
  total: Conta & { taxa: number }
  porHora: (Conta & { hora: number; taxa: number })[]
  porDia: (Conta & { dia: number; taxa: number })[]
  porRamo: (Conta & { ramo: string; taxa: number; melhorFaixa: Faixa | null; faixas: Record<Faixa, Conta> })[]
  melhorHora: number | null
}

/** Conta só as conversas que ele mesmo abriu (abordagem). */
export function calcularPadroes(conversas: Pick<Conversa, 'origem' | 'nicho' | 'criadaEm' | 'mensagens'>[]): Padroes {
  const abordagens = conversas.filter((c) => c.origem === 'agente')
  const hora = Array.from({ length: 24 }, (_, h) => ({ hora: h, abordados: 0, responderam: 0 }))
  const dia = Array.from({ length: 7 }, (_, d) => ({ dia: d, abordados: 0, responderam: 0 }))
  const ramos = new Map<string, { abordados: number; responderam: number; faixas: Record<Faixa, Conta> }>()
  let total = { abordados: 0, responderam: 0 }
  for (const c of abordagens) {
    const d = new Date(c.criadaEm)
    const r = respondeu(c) ? 1 : 0
    total = { abordados: total.abordados + 1, responderam: total.responderam + r }
    hora[d.getHours()].abordados++
    hora[d.getHours()].responderam += r
    dia[d.getDay()].abordados++
    dia[d.getDay()].responderam += r
    const k = c.nicho || 'Sem ramo'
    const g = ramos.get(k) ?? { abordados: 0, responderam: 0, faixas: { manha: { abordados: 0, responderam: 0 }, tarde: { abordados: 0, responderam: 0 }, noite: { abordados: 0, responderam: 0 } } }
    g.abordados++
    g.responderam += r
    const f = g.faixas[faixaDe(d.getHours())]
    f.abordados++
    f.responderam += r
    ramos.set(k, g)
  }
  const porHora = hora.map((h) => ({ ...h, taxa: taxa(h) }))
  const comDados = porHora.filter((h) => h.abordados >= MINIMO)
  return {
    total: { ...total, taxa: taxa(total) },
    porHora,
    porDia: dia.map((d) => ({ ...d, taxa: taxa(d) })),
    porRamo: [...ramos.entries()]
      .map(([ramo, g]) => {
        const faixas = (Object.keys(g.faixas) as Faixa[]).filter((f) => g.faixas[f].abordados >= MINIMO)
        const melhorFaixa = faixas.length >= 2 ? faixas.reduce((a, b) => (taxa(g.faixas[b]) > taxa(g.faixas[a]) ? b : a)) : null
        return { ramo, abordados: g.abordados, responderam: g.responderam, taxa: taxa(g), melhorFaixa, faixas: g.faixas }
      })
      .sort((a, b) => b.abordados - a.abordados),
    melhorHora: comDados.length >= 3 ? comDados.reduce((a, b) => (b.taxa > a.taxa ? b : a)).hora : null,
  }
}

/** % de resposta do ramo (null = poucos dados). */
export function taxaDoRamo(p: Padroes, ramo: string): number | null {
  const r = p.porRamo.find((x) => x.ramo === ramo)
  return r && r.abordados >= MINIMO ? r.taxa : null
}

/** Agora é a melhor faixa do dia para esse ramo? (null = não se sabe ainda) */
export function faixaBoa(p: Padroes, ramo: string, agora: Date): boolean | null {
  const r = p.porRamo.find((x) => x.ramo === ramo)
  return r?.melhorFaixa ? r.melhorFaixa === faixaDe(agora.getHours()) : null
}

/** Frase curta com os números do ramo, para o roteiro. */
export function numerosDoRamo(p: Padroes, ramo: string): string {
  const r = p.porRamo.find((x) => x.ramo === ramo)
  if (!r || r.abordados < MINIMO) return ''
  return `${r.taxa}% responderam (${r.abordados} abordados)${r.melhorFaixa ? `; responde mais de ${NOME_FAIXA[r.melhorFaixa]}` : ''}`
}

// ---------------------------------------------------------------------------
// Horários livres para marcar conversa com você
// ---------------------------------------------------------------------------

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function rotuloHorario(d: Date): string {
  const hora = d.getMinutes() ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`
  return `${DIAS[d.getDay()]} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}) às ${hora}`
}

/** Até `n` horários livres nos próximos 14 dias, no máximo 2 por dia (manhã e tarde quando dá). */
export function horariosLivres(a: AgenteConfig['agenda'], reunioes: Pick<Reuniao, 'inicio' | 'fim' | 'estado'>[], agora = new Date(), n = 6): Date[] {
  const passo = Math.max(15, Math.round(a.duracaoMin || 30))
  const desde = agora.getTime() + Math.max(0, a.antecedenciaH) * 3_600_000
  const ocupadas = reunioes.filter((r) => r.estado === 'marcada' || r.estado === 'confirmada').map((r) => [Date.parse(r.inicio), Date.parse(r.fim)] as const)
  const out: Date[] = []
  for (let i = 0; i < 15 && out.length < n; i++) {
    const dia = new Date(agora)
    dia.setDate(agora.getDate() + i)
    dia.setHours(0, 0, 0, 0)
    if (!a.dias.includes(dia.getDay()) || feriadoNacional(dia)) continue
    const doDia: Date[] = []
    for (let m = a.inicio * 60; m + passo <= a.fim * 60; m += passo) {
      const ini = new Date(dia)
      ini.setHours(0, m, 0, 0)
      const fim = ini.getTime() + passo * 60_000
      if (ini.getTime() < desde) continue
      if (ocupadas.some(([x, y]) => ini.getTime() < y && fim > x)) continue
      doDia.push(ini)
    }
    if (!doDia.length) continue
    const manha = doDia.find((d) => d.getHours() < 12)
    const tarde = doDia.find((d) => d.getHours() >= 13)
    for (const d of [manha ?? doDia[0], tarde].filter((x): x is Date => !!x)) if (out.length < n && !out.some((o) => o.getTime() === d.getTime())) out.push(d)
  }
  return out
}
