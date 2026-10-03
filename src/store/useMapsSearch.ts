import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { addMapsRunToLeads } from '../lib/mapsAutoImport'
import { knownKeys, type MapsResult, type MapsSearchInput, type MapsState } from '../lib/mapsSearch'
import { useApp } from './useApp'

/**
 * Busca no Maps pelo servidor da XS (Google Places), sem o Motor.
 * Fica fora da tela: trocar de página no meio não perde a busca, e o resultado
 * vai direto para os leads quando termina.
 */

type Enriched = Pick<MapsResult, 'id' | 'instagram' | 'cnpj' | 'responsibleName' | 'responsibleRole' | 'enrichmentConfidence' | 'enrichmentSource'>

interface Stats {
  found: number
  approved: number
  recurring: number
  blocked: number
  calls: number
  elapsedMs: number
}

async function api<T>(body: unknown, signal: AbortSignal): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
  const res = await fetch('/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Falha na busca (${res.status}).`)
  return data
}

const passes = (mode: number, has: boolean) => mode === 0 || (mode === 1 ? has : !has)
const now = () => new Date().toLocaleTimeString('pt-BR')

interface MapsSearchStore {
  state: MapsState | null
  run(input: MapsSearchInput & { lat: number; lng: number }): Promise<void>
  stop(): void
  /** Salva nos leads uma busca que não conseguiu ir sozinha (ex.: falha de rede). */
  save(): Promise<number | null>
}

let ctrl: AbortController | null = null

export const useMapsSearch = create<MapsSearchStore>()((set, get) => {
  // Só mexe na busca certa: uma busca antiga que ainda está terminando não escreve por cima da nova
  const patch = (runId: string, p: Partial<MapsState>) => set((s) => (s.state && s.state.runId === runId ? { state: { ...s.state, ...p } } : s))
  const log = (runId: string, line: string) =>
    set((s) => (s.state && s.state.runId === runId ? { state: { ...s.state, logs: [...s.state.logs, `${now()}  ${line}`] } } : s))

  async function finish(runId: string, phase: 'completed' | 'cancelled' | 'error', extra: Partial<MapsState> = {}) {
    const st = get().state
    if (!st || st.runId !== runId) return
    patch(runId, { active: false, phase, progress: 100, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(st.startedAt ?? ''), ...extra })
    const done = get().state
    if (!done?.results.length) return
    try {
      const added = await addMapsRunToLeads(done)
      if (added === null) return
      patch(runId, { imported: true })
      log(runId, added ? `${added} lead(s) entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.')
      useApp
        .getState()
        .toast(added ? `${added} lead(s) da busca no Maps entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', {
          label: 'Ver leads',
          run: () => (window.location.href = '/leads'),
        })
    } catch (err) {
      useApp.getState().toast(err instanceof Error ? `Não consegui salvar a busca nos leads: ${err.message}` : 'Não consegui salvar a busca nos leads.', 'error')
    }
  }

  return {
    state: null,

    async run(input) {
      ctrl?.abort()
      const prev = get().state
      if (prev && !prev.active && !prev.imported && prev.results.length) await addMapsRunToLeads(prev).catch(() => undefined)
      const c = new AbortController()
      ctrl = c
      const startedAt = new Date().toISOString()
      const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

      set({
        state: {
          runId,
          active: true,
          phase: 'connecting',
          message: 'Buscando as empresas no Google…',
          progress: 15,
          cardsFound: 0,
          approvedCount: 0,
          discarded: 0,
          recurringDetected: 0,
          recurringBlocked: 0,
          currentSector: 0,
          totalSectors: 0,
          center: { lat: input.lat, lng: input.lng, label: input.location },
          input,
          results: [],
          logs: [],
          error: null,
          startedAt,
          finishedAt: null,
          elapsedMs: 0,
          imported: false,
        },
      })
      log(runId, `Busca: ${input.niches.join(', ')} · ${input.radiusKm} km de ${input.location}`)

      let results: MapsResult[] = []
      try {
        const data = await api<{ results: MapsResult[]; stats: Stats }>({ acao: 'buscar', ...input, known: knownKeys(useApp.getState().leads) }, c.signal)
        results = data.results
        const fresh = results.filter((r) => !r.recurring).length
        log(runId, `Google: ${data.stats.found} empresas na área, ${data.stats.approved} passaram nos filtros (${(data.stats.elapsedMs / 1000).toFixed(1)} s, ${data.stats.calls} consulta(s)).`)
        if (data.stats.blocked) log(runId, `${data.stats.blocked} já estavam nos seus leads e foram puladas.`)
        patch(runId, {
          results,
          cardsFound: data.stats.found,
          approvedCount: fresh,
          recurringDetected: data.stats.recurring,
          recurringBlocked: data.stats.blocked,
          progress: 60,
          message: `${fresh} empresa(s) encontradas.`,
        })
      } catch (err) {
        if (c.signal.aborted) return void finish(runId, 'cancelled', { message: 'Busca interrompida.' })
        const msg = err instanceof Error ? err.message : 'Falha na busca.'
        log(runId, `Erro: ${msg}`)
        return void finish(runId, 'error', { error: msg, message: msg })
      }

      // Instagram e CNPJ: abre o site de quem tem (em paralelo, alguns segundos)
      const toCheck = input.analyzeSites ? results.filter((r) => r.website && !r.instagram && !r.recurring) : []
      if (toCheck.length) {
        patch(runId, { phase: 'enriching', message: `Conferindo ${toCheck.length} site(s): Instagram e CNPJ…` })
        const batches: MapsResult[][] = []
        for (let i = 0; i < toCheck.length; i += 8) batches.push(toCheck.slice(i, i + 8))
        let done = 0
        const queue = [...batches]
        await Promise.all(
          Array.from({ length: Math.min(4, queue.length) }, async () => {
            while (queue.length && !c.signal.aborted) {
              const batch = queue.shift()!
              try {
                const { itens } = await api<{ itens: Enriched[] }>(
                  { acao: 'enriquecer', itens: batch.map((r) => ({ id: r.id, website: r.website, name: r.name, phone: r.phone, city: r.city })) },
                  c.signal,
                )
                const byId = new Map(itens.map((e) => [e.id, e]))
                results = results.map((r) => {
                  const e = byId.get(r.id)
                  return e ? { ...r, ...e, instagram: e.instagram || r.instagram } : r
                })
              } catch {
                /* site fora do ar ou lento: o lead entra sem Instagram/CNPJ */
              }
              done += batch.length
              patch(runId, { results, progress: 60 + Math.round((done / toCheck.length) * 35) })
            }
          }),
        )
        log(runId, `Sites conferidos: ${results.filter((r) => r.instagram).length} com Instagram, ${results.filter((r) => r.enrichmentConfidence === 'confirmed').length} com sócio pelo CNPJ.`)
      }

      // Filtro de Instagram só agora (depende dos sites) e corte na meta
      const fresh = results.filter((r) => !r.recurring && passes(input.qualification.instagram, !!r.instagram)).slice(0, input.targetLeads)
      results = [...fresh, ...results.filter((r) => r.recurring)]
      const secs = (Date.now() - Date.parse(startedAt)) / 1000
      await finish(runId, c.signal.aborted ? 'cancelled' : 'completed', {
        results,
        approvedCount: fresh.length,
        message: c.signal.aborted ? 'Busca interrompida.' : `${fresh.length} empresa(s) em ${secs.toFixed(1)} s.`,
      })
    },

    stop() {
      ctrl?.abort()
    },

    async save() {
      const st = get().state
      if (!st) return null
      const n = await addMapsRunToLeads(st)
      if (n !== null && st.runId) patch(st.runId, { imported: true })
      return n
    },
  }
})
