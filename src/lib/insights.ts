import { isContato } from './statuses'
import { timeHM, todayKey } from './dates'
import type { Interaction, Meeting, MeetingResultado } from './types'

// ---------------------------------------------------------------------------
// Melhor horário para ligar
// ---------------------------------------------------------------------------

/** Faixas de uma hora; antes das 8h entra em 8h e depois das 19h entra em 18h. */
export const HOUR_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
/** Segunda a sábado (getDay) — domingo só aparece se houver ligação. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
/** Abaixo disso a taxa não é confiável e não disputa "melhor horário". */
export const MIN_SAMPLE = 5

export interface Cell {
  ligacoes: number
  atenderam: number
}

export interface HourStats {
  /** dias da semana (getDay) com linha na grade */
  days: number[]
  /** grade[dia][faixa] */
  grid: Map<number, Cell[]>
  byHour: Cell[]
  total: Cell
  best: { day: number | null; hour: number; rate: number; ligacoes: number } | null
}

const slotOf = (h: number) => Math.min(HOUR_SLOTS.length - 1, Math.max(0, h - HOUR_SLOTS[0]))
const empty = (): Cell => ({ ligacoes: 0, atenderam: 0 })

export function rate(c: Cell): number | null {
  return c.ligacoes ? c.atenderam / c.ligacoes : null
}

export function contactByHour(interactions: Interaction[], since: string | null = null): HourStats {
  const grid = new Map<number, Cell[]>()
  const byHour = HOUR_SLOTS.map(empty)
  const total = empty()
  for (const i of interactions) {
    if (i.tipo !== 'ligacao' || i.status === null || (since && i.created_at < since)) continue
    const d = new Date(i.created_at)
    const row = grid.get(d.getDay()) ?? HOUR_SLOTS.map(empty)
    grid.set(d.getDay(), row)
    const s = slotOf(d.getHours())
    const contato = isContato(i.status)
    for (const c of [row[s], byHour[s], total]) {
      c.ligacoes++
      if (contato) c.atenderam++
    }
  }

  const days = WEEK_ORDER.filter((d) => d !== 0 || grid.has(0))
  for (const d of days) if (!grid.has(d)) grid.set(d, HOUR_SLOTS.map(empty))

  // Melhor célula com amostra suficiente; sem nenhuma, a melhor faixa de horário geral.
  let best: HourStats['best'] = null
  for (const d of days) {
    grid.get(d)!.forEach((c, s) => {
      const r = rate(c)
      if (r !== null && c.ligacoes >= MIN_SAMPLE && (!best || r > best.rate || (r === best.rate && c.ligacoes > best.ligacoes))) {
        best = { day: d, hour: HOUR_SLOTS[s], rate: r, ligacoes: c.ligacoes }
      }
    })
  }
  if (!best) {
    byHour.forEach((c, s) => {
      const r = rate(c)
      if (r !== null && c.ligacoes >= MIN_SAMPLE && (!best || r > best.rate)) best = { day: null, hour: HOUR_SLOTS[s], rate: r, ligacoes: c.ligacoes }
    })
  }
  return { days, grid, byHour, total, best }
}

export function slotLabel(hour: number): string {
  return hour === HOUR_SLOTS[HOUR_SLOTS.length - 1] ? `${hour}h+` : `${hour}h`
}

// ---------------------------------------------------------------------------
// Reuniões e vendas
// ---------------------------------------------------------------------------

export const MEETING_RESULTS: { id: MeetingResultado; label: string; tone: 'go' | 'gold' | 'muted' | 'orange' }[] = [
  { id: 'fechou', label: 'Fechou', tone: 'gold' },
  { id: 'realizada', label: 'Realizada', tone: 'go' },
  { id: 'perdeu', label: 'Não fechou', tone: 'muted' },
  { id: 'nao_compareceu', label: 'Não compareceu', tone: 'orange' },
]

export const MEETING_RESULT_LABEL = Object.fromEntries(MEETING_RESULTS.map((r) => [r.id, r.label])) as Record<MeetingResultado, string>

/** Reunião que já passou (dia anterior, ou hoje com horário vencido) e ainda não tem resultado. */
export function needsResult(m: Meeting, now: Date = new Date()): boolean {
  if (m.resultado) return false
  const today = todayKey(now)
  if (m.data < today) return true
  return m.data === today && !!m.horario && m.horario <= timeHM(now)
}

export interface MeetingStats {
  agendadas: number
  realizadas: number
  naoCompareceu: number
  fechadas: number
  semResultado: number
  faturamento: number
  ticketMedio: number | null
  /** fechadas / realizadas */
  taxaFechamento: number | null
  /** realizadas / (realizadas + não compareceu) */
  taxaComparecimento: number | null
}

export function meetingStats(meetings: Meeting[], since: string | null = null, now: Date = new Date()): MeetingStats {
  const list = meetings.filter((m) => !since || m.created_at >= since)
  const realizadas = list.filter((m) => m.resultado === 'realizada' || m.resultado === 'fechou' || m.resultado === 'perdeu').length
  const naoCompareceu = list.filter((m) => m.resultado === 'nao_compareceu').length
  const fechadasList = list.filter((m) => m.resultado === 'fechou')
  const faturamento = fechadasList.reduce((a, m) => a + (m.valor ?? 0), 0)
  const comValor = fechadasList.filter((m) => m.valor).length
  return {
    agendadas: list.length,
    realizadas,
    naoCompareceu,
    fechadas: fechadasList.length,
    semResultado: list.filter((m) => needsResult(m, now)).length,
    faturamento,
    ticketMedio: comValor ? faturamento / comValor : null,
    taxaFechamento: realizadas ? fechadasList.length / realizadas : null,
    taxaComparecimento: realizadas + naoCompareceu ? realizadas / (realizadas + naoCompareceu) : null,
  }
}

export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 })
}
