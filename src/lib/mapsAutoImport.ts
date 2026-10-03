import { useEffect } from 'react'
import { supabase } from '../data/supabaseClient'
import { useApp } from '../store/useApp'
import { mapsKey, phoneKey } from './duplicates'
import { knownKeys, mapsToParsed, type MapsState } from './mapsSearch'
import { motorFetch, useMotor } from './motor'

/**
 * A busca no Maps não tem passo de "importar": o que ela acha vai direto para os
 * leads assim que termina (ou é parada), em qualquer tela do app. Quem já está nos
 * leads (mesmo telefone ou mesmo lugar no Maps) é pulado.
 */

const FINISHED = new Set(['completed', 'cancelled', 'error'])
const busy = new Set<string>()

/** Leva para os leads o que a busca achou e ainda não está lá. Devolve quantos entraram (null se não era a hora: já salva, em andamento ou leads não carregados). */
export async function addMapsRunToLeads(state: MapsState): Promise<number | null> {
  const runId = state.runId
  if (!runId || state.active || state.imported || !state.results.length || busy.has(runId)) return null
  const app = useApp.getState()
  // Sem os leads carregados não dá para conferir duplicados
  if (!app.ready || app.loadError || !app.repo) return null
  busy.add(runId)
  try {
    const known = knownKeys(app.leads)
    const phones = new Set(known.phones)
    const maps = new Set(known.maps)
    const fresh = state.results.filter((r) => {
      const p = phoneKey(r.phone)
      const m = mapsKey(r.mapsUrl)
      return !(p && phones.has(p)) && !(m && maps.has(m))
    })
    let added = 0
    if (fresh.length) {
      const nichos = [...new Set(fresh.map((r) => r.niche))].join(', ')
      added = await app.importLeads(fresh.map(mapsToParsed), `Maps · ${nichos} · ${state.center?.label ?? state.input?.location ?? ''}`)
    }
    await motorFetch('/maps/ack', { method: 'POST', json: { runId } }).catch(() => undefined)
    return added
  } finally {
    busy.delete(runId)
  }
}

async function checkPending() {
  let state: MapsState
  try {
    state = await motorFetch<MapsState>('/maps/estado', { timeoutMs: 5000 })
  } catch {
    return
  }
  try {
    const added = await addMapsRunToLeads(state)
    if (added) {
      useApp.getState().toast(`${added} lead(s) da busca no Maps entraram na sua lista.`, 'success', { label: 'Ver leads', run: () => (window.location.href = '/leads') })
    }
  } catch (err) {
    useApp.getState().toast(err instanceof Error ? `Não consegui salvar a busca nos leads: ${err.message}` : 'Não consegui salvar a busca nos leads.', 'error')
  }
}

/** Fica de olho no Motor e salva nos leads cada busca que terminar. */
export function useMapsAutoImport() {
  const maps = useMotor((s) => s.health?.maps)
  // Uma prévia de desenvolvimento sem Supabase não pode "pegar" a busca do motor de verdade
  const ready = useApp((s) => s.ready && !s.loadError) && !(import.meta.env.DEV && !supabase)
  // Motor 1.2+ avisa quando há resultado pendente; o antigo só diz que a busca acabou
  const pending = maps ? (maps.pendente ?? (!maps.active && FINISHED.has(maps.phase))) : false
  const key = pending ? `${maps?.runId ?? ''}:${maps?.phase}` : null

  useEffect(() => {
    if (ready && key) void checkPending()
  }, [ready, key])
}
