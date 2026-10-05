import { useApp } from '../store/useApp'
import { mapsKey, phoneKey } from './duplicates'
import { knownKeys, mapsToParsed, nameCityKey, type MapsState } from './mapsSearch'

/**
 * A busca no Maps não tem passo de "importar": o que ela acha vai direto para os
 * leads assim que termina (ou é parada). Quem já está nos leads (mesmo telefone ou
 * mesmo lugar no Maps) é pulado.
 */

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
    const cnpjs = new Set(known.cnpjs)
    const names = new Set(known.names)
    const fresh = state.results.filter((r) => {
      const p = phoneKey(r.phone)
      const m = mapsKey(r.mapsUrl)
      const c = (r.cnpj ?? '').replace(/\D/g, '')
      // Da base aberta sem telefone: compara pelo nome na mesma cidade
      const n = r.source === 'base' && !p ? nameCityKey(r.name, r.city) : null
      return !(p && phones.has(p)) && !(m && maps.has(m)) && !(c && cnpjs.has(c)) && !(n && names.has(n))
    })
    if (!fresh.length) return 0
    const nichos = [...new Set(fresh.map((r) => r.niche))].join(', ')
    const fonte = state.input?.source === 'base' ? 'Base aberta' : 'Google Maps'
    return await app.importLeads(fresh.map(mapsToParsed), `${fonte} · ${nichos} · ${state.center?.label ?? state.input?.location ?? ''}`)
  } finally {
    busy.delete(runId)
  }
}
