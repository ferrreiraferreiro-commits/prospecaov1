import { addDays, toDateKey } from './dates'
import { SEM_RESPOSTA } from './statuses'
import type { Interaction, Periodo } from './types'

/**
 * Tentativas seguidas sem resposta, da mais recente para trás.
 * Para na primeira ligação em que alguém atendeu (ou teve outro resultado).
 * Ligações ainda sem resultado são ignoradas.
 */
export function consecutiveNoAnswer(calls: Interaction[], ignoreId?: string | null): number {
  const sorted = calls
    .filter((c) => c.tipo === 'ligacao' && c.status !== null && c.id !== ignoreId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  let n = 0
  for (const c of sorted) {
    if (!c.status || !SEM_RESPOSTA.includes(c.status)) break
    n++
  }
  return n
}

/**
 * Próxima tentativa: no dia seguinte, no período oposto ao desta ligação
 * (ligou de manhã → tenta à tarde; ligou à tarde/noite → tenta de manhã).
 * Domingo é pulado.
 */
export function nextAttempt(callAt: Date = new Date()): { data: string; periodo: Periodo } {
  const periodo: Periodo = callAt.getHours() < 12 ? 'tarde' : 'manha'
  let data = addDays(toDateKey(callAt), 1)
  const [y, m, d] = data.split('-').map(Number)
  if (new Date(y, m - 1, d).getDay() === 0) data = addDays(data, 1)
  return { data, periodo }
}

/** "3ª tentativa" */
export function ordinal(n: number): string {
  return `${n}ª`
}
