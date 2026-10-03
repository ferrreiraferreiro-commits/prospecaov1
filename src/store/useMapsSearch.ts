import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { addMapsRunToLeads } from '../lib/mapsAutoImport'
import { knownKeys, type MapsResult, type MapsSearchInput, type MapsState } from '../lib/mapsSearch'
import { useApp } from './useApp'

/**
 * Busca de empresas pelo servidor da XS (base pública do CNPJ), sem o Motor.
 * Fica fora da tela: trocar de página no meio não perde a busca, e o resultado
 * vai direto para os leads quando termina.
 */

interface Stats {
  found: number
  approved: number
  recurring: number
  blocked: number
  mes?: string
  elapsedMs: number
}

export async function mapsApi<T>(body: unknown, signal?: AbortSignal): Promise<T> {
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

const now = () => new Date().toLocaleTimeString('pt-BR')

interface MapsSearchStore {
  state: MapsState | null
  run(input: MapsSearchInput & { lat?: number; lng?: number }): Promise<void>
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
        .toast(added ? `${added} lead(s) da busca entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', {
          label: 'Ver leads',
          run: () => (window.location.href = '/leads'),
        })
    } catch (err) {
      useApp.getState().toast(err instanceof Error ? `Não consegui salvar a busca nos leads: ${err.message}` : 'Não consegui salvar a busca nos leads.', 'error')
    }
  }

  /** Confere os sites de quem tem e-mail com domínio próprio e completa site/Instagram nos leads já salvos. */
  async function checkSites(runId: string, toCheck: MapsResult[]) {
    const queue: MapsResult[][] = []
    for (let i = 0; i < toCheck.length; i += 6) queue.push(toCheck.slice(i, i + 6))
    let sites = 0
    let insta = 0
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const batch = queue.shift()!
          try {
            const { itens } = await mapsApi<{ itens: { id: string; website: string; instagram: string }[] }>({
              acao: 'enriquecer',
              itens: batch.map((r) => ({ id: r.id, site: r.siteGuess })),
            })
            const byId = new Map(itens.map((e) => [e.id, e]))
            set((s) =>
              s.state?.runId === runId
                ? { state: { ...s.state, results: s.state.results.map((r) => (byId.has(r.id) ? { ...r, website: byId.get(r.id)!.website, instagram: byId.get(r.id)!.instagram || r.instagram } : r)) } }
                : s,
            )
            const app = useApp.getState()
            for (const e of itens) {
              if (e.website) sites++
              if (e.instagram) insta++
              if (!e.website && !e.instagram) continue
              // O id do resultado é o CNPJ, que o lead também guarda
              const lead = app.leads.find((l) => (l.cnpj ?? '').replace(/\D/g, '') === e.id)
              if (lead) await app.fillLeadLinks(lead.id, { website: e.website || null, instagram: e.instagram || null })
            }
          } catch {
            /* site lento ou fora do ar: o lead fica sem site/Instagram */
          }
        }
      }),
    )
    log(runId, `Sites conferidos: ${sites} no ar, ${insta} com Instagram.`)
    const st = get().state
    if (st?.runId === runId) patch(runId, { message: st.message.replace(/ Conferindo .*$/, ` ${sites} site(s) no ar, ${insta} com Instagram.`) })
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
          message: 'Buscando as empresas…',
          progress: 20,
          cardsFound: 0,
          approvedCount: 0,
          discarded: 0,
          recurringDetected: 0,
          recurringBlocked: 0,
          currentSector: 0,
          totalSectors: 0,
          center: input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng, label: input.location } : null,
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
      const where = input.bairros.length ? `${input.bairros.join(', ')} · ${input.location}` : input.location
      log(runId, `Busca: ${input.niches.join(', ')} · ${where}`)

      let results: MapsResult[] = []
      try {
        const known = knownKeys(useApp.getState().leads)
        const data = await mapsApi<{ results: MapsResult[]; stats: Stats }>(
          {
            acao: 'buscar',
            cidade: input.location,
            nichos: input.niches,
            bairros: input.bairros,
            filtros: { telefone: input.qualification.phone, celular: input.qualification.mobile, site: input.qualification.website },
            meta: input.targetLeads,
            conhecidos: { telefones: known.phones, cnpjs: known.cnpjs },
            pular: input.existingPolicy === 'block',
          },
          c.signal,
        )
        results = data.results
        const fresh = results.filter((r) => !r.recurring).length
        log(runId, `${data.stats.found} empresas ativas nesse nicho e região; ${fresh} passaram nos filtros (${data.stats.elapsedMs} ms${data.stats.mes ? ` · base de ${data.stats.mes}` : ''}).`)
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

      // Os leads entram na hora; a conferência dos sites vem depois, em segundo plano
      const fresh = results.filter((r) => !r.recurring).length
      const secs = (Date.now() - Date.parse(startedAt)) / 1000
      const toCheck = input.analyzeSites ? results.filter((r) => r.siteGuess && !r.recurring) : []
      await finish(runId, 'completed', {
        results,
        approvedCount: fresh,
        message: `${fresh} empresa(s) em ${secs < 1 ? 'menos de 1 segundo' : `${secs.toFixed(1).replace('.', ',')} s`}.${toCheck.length ? ` Conferindo ${toCheck.length} site(s) em segundo plano…` : ''}`,
      })
      if (toCheck.length) void checkSites(runId, toCheck)
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
