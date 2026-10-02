import { useEffect, useMemo, useState } from 'react'
import { todayKey } from '../lib/dates'
import { detectDuplicates, type DupMatch } from '../lib/duplicates'
import { buildIndex, computeMetrics, type LeadIndex } from '../lib/selectors'
import type { Lead } from '../lib/types'
import { useApp } from './useApp'

/** Data de hoje que se atualiza sozinha na virada do dia. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey())
  useEffect(() => {
    const t = setInterval(() => {
      const k = todayKey()
      setToday((prev) => (prev === k ? prev : k))
    }, 60_000)
    return () => clearInterval(t)
  }, [])
  return today
}

export function useIndex(): LeadIndex {
  const followups = useApp((s) => s.followups)
  const meetings = useApp((s) => s.meetings)
  const interactions = useApp((s) => s.interactions)
  return useMemo(() => buildIndex(followups, meetings, interactions), [followups, meetings, interactions])
}

export function useMetrics() {
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const followups = useApp((s) => s.followups)
  const meetings = useApp((s) => s.meetings)
  const since = useApp((s) => s.settings.metricas_desde)
  const today = useToday()
  return useMemo(
    () => computeMetrics(leads, interactions, followups, meetings, today, since),
    [leads, interactions, followups, meetings, today, since],
  )
}

/** Possíveis duplicados (ignora leads marcados como "não é duplicado"). */
export function useDuplicates(): Map<string, DupMatch[]> {
  const leads = useApp((s) => s.leads)
  return useMemo(() => {
    const all = detectDuplicates(leads)
    const ignored = new Set(leads.filter((l) => l.duplicado_ignorado).map((l) => l.id))
    for (const id of ignored) all.delete(id)
    return all
  }, [leads])
}

export function useLead(id: string | null | undefined): Lead | undefined {
  return useApp((s) => (id ? s.leads.find((l) => l.id === id) : undefined))
}
