import type { Periodo } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local no formato YYYY-MM-DD. */
export function toDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now)
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function isoDateKey(iso: string): string {
  return toDateKey(new Date(iso))
}

export function timeHM(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "01/10/2026" */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

/** "01/10" */
export function formatDateKeyShort(key: string): string {
  const [, m, d] = key.split('-')
  return `${d}/${m}`
}

/** "01/10/2026 • 14:32" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDateKey(toDateKey(d))} • ${timeHM(d)}`
}

/** "hoje 14:32", "ontem 16:51", "28/09 10:00" */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const key = toDateKey(d)
  const today = todayKey(now)
  if (key === today) return `hoje ${timeHM(d)}`
  if (key === addDays(today, -1)) return `ontem ${timeHM(d)}`
  if (key.slice(0, 4) === today.slice(0, 4)) return `${formatDateKeyShort(key)} ${timeHM(d)}`
  return `${formatDateKey(key)} ${timeHM(d)}`
}

/** "hoje", "amanhã", "sex 03/10", "03/10/2027" */
export function formatDayLabel(key: string, now: Date = new Date()): string {
  const today = todayKey(now)
  if (key === today) return 'hoje'
  if (key === addDays(today, 1)) return 'amanhã'
  if (key === addDays(today, -1)) return 'ontem'
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const diff = Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
  if (diff > 0 && diff < 7) return `${WEEKDAYS[date.getDay()]} ${formatDateKeyShort(key)}`
  if (y === now.getFullYear()) return formatDateKeyShort(key)
  return formatDateKey(key)
}

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "quarta-feira, 1 de outubro" */
export function formatLongToday(now: Date = new Date()): string {
  return `${WEEKDAYS_LONG[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}`
}

export const PERIODOS: { id: Periodo; label: string; hora: string }[] = [
  { id: 'manha', label: 'Manhã', hora: '09:00' },
  { id: 'tarde', label: 'Tarde', hora: '14:00' },
  { id: 'noite', label: 'Noite', hora: '19:00' },
]

export function periodoLabel(p: Periodo | null): string {
  return PERIODOS.find((x) => x.id === p)?.label ?? ''
}

/** Chave de ordenação HH:mm para horário específico ou período. */
export function sortTime(horario: string | null, periodo: Periodo | null): string {
  if (horario) return horario
  return PERIODOS.find((x) => x.id === periodo)?.hora ?? '23:59'
}

export function whenLabel(data: string, horario: string | null, periodo: Periodo | null, now?: Date): string {
  const day = formatDayLabel(data, now)
  const time = horario ?? (periodo ? periodoLabel(periodo).toLowerCase() : '')
  return time ? `${day} ${horario ? horario : `• ${time}`}` : day
}
