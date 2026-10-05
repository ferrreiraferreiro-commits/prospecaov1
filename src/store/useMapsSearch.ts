// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { categoriaDe } from '../lib/categorias'
import { mapsKey, phoneKey } from '../lib/duplicates'
import { addMapsRunToLeads } from '../lib/mapsAutoImport'
import { knownKeys, type MapsResult, type MapsSearchInput, type MapsState } from '../lib/mapsSearch'
import { restantes, useGoogleKey } from './useGoogleKey'
import { useApp } from './useApp'

/**
 * Busca de empresas pela função /api/maps: base aberta de comércios (grátis, no servidor da XS)
 * ou Google Maps (com a chave do próprio usuário). Fica fora da tela: trocar de página no
 * meio não perde a busca, e o resultado vai direto para os leads quando termina.
 */

export interface SearchArea {
  lat: number
  lng: number
  /** Caixa da cidade: sul, norte, oeste, leste */
  caixa: [number, number, number, number]
  uf: string
}

interface Stats {
  found: number
  approved: number
  recurring: number
  blocked: number
  calls?: number
  elapsedMs: number
}

export async function mapsApi<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
  const res = await fetch('/api/maps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `Falha na busca (${res.status}).`)
  return data
}

/** Nominatim (OpenStreetMap): acha cidades e bairros. Uma consulta por vez, como pedem as regras deles. */
let lastNominatim = 0
export async function nominatim<T>(path: string, signal?: AbortSignal): Promise<T> {
  const wait = lastNominatim + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatim = Date.now()
  const timeout = AbortSignal.timeout(10_000)
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&addressdetails=1&accept-language=pt-BR`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!res.ok) throw new Error('O serviço de mapas não respondeu agora. Tente de novo em instantes.')
  return (await res.json()) as T
}

const now = () => new Date().toLocaleTimeString('pt-BR')

interface MapsSearchStore {
  state: MapsState | null
  run(input: MapsSearchInput & { area: SearchArea }): Promise<void>
  stop(): void
  /** Salva nos leads uma busca que não conseguiu ir sozinha (ex.: falha de rede). */
  save(): Promise<number | null>
}

let ctrl: AbortController | null = null

/** Caixa de cada bairro no mapa (Nominatim). Bairro que o mapa não conhece fica de fora, com aviso. */
async function bairroBoxes(bairros: string[], location: string, signal: AbortSignal, log: (l: string) => void): Promise<[number, number, number, number][]> {
  const out: [number, number, number, number][] = []
  for (const b of bairros.slice(0, 10)) {
    const rows = await nominatim<{ boundingbox: string[] }[]>(`search?q=${encodeURIComponent(`${b}, ${location}`)}&countrycodes=br&limit=1`, signal).catch(() => [])
    const bb = rows[0]?.boundingbox?.map(Number)
    if (bb?.length === 4 && bb.every(Number.isFinite)) out.push([bb[0], bb[1], bb[2], bb[3]])
    else log(`Não achei o bairro "${b}" no mapa; ele ficou de fora.`)
  }
  return out
}

/** Busca na base aberta de comércios (servidor da XS): grátis, sem chave e sem limite. */
async function searchBase(input: MapsSearchInput & { area: SearchArea }, signal: AbortSignal, log: (l: string) => void): Promise<{ results: MapsResult[]; stats: Stats }> {
  const caixas = input.bairros.length ? await bairroBoxes(input.bairros, input.location, signal, log) : []
  if (input.bairros.length && !caixas.length) throw new Error('Não achei esses bairros no mapa. Confira o nome ou busque a cidade toda.')
  const known = knownKeys(useApp.getState().leads)
  return mapsApi<{ results: MapsResult[]; stats: Stats }>(
    {
      acao: 'base',
      uf: input.area.uf,
      cidade: input.location.split(',')[0].trim(),
      nichos: input.niches.map((n) => {
        const c = categoriaDe(n)
        return { nome: c.nome, tax: c.base, nomes: c.nomes }
      }),
      caixas,
      filtros: {
        telefone: input.qualification.phone,
        celular: input.qualification.mobile,
        site: input.qualification.website,
      },
      meta: input.targetLeads,
      conhecidos: { telefones: known.phones },
      pular: input.existingPolicy === 'block',
    },
    signal,
  )
}

export const useMapsSearch = create<MapsSearchStore>()((set, get) => {
  // Só mexe na busca certa: uma busca antiga que ainda está terminando não escreve por cima da nova
  const patch = (runId: string, p: Partial<MapsState>) => set((s) => (s.state && s.state.runId === runId ? { state: { ...s.state, ...p } } : s))
  const log = (runId: string, line: string) =>
    set((s) =>
      s.state && s.state.runId === runId
        ? {
            state: { ...s.state, logs: [...s.state.logs, `${now()}  ${line}`] },
          }
        : s,
    )

  async function finish(runId: string, phase: 'completed' | 'cancelled' | 'error', extra: Partial<MapsState> = {}) {
    const st = get().state
    if (!st || st.runId !== runId) return
    patch(runId, {
      active: false,
      phase,
      progress: 100,
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(st.startedAt ?? ''),
      ...extra,
    })
    const done = get().state
    if (!done?.results.length) return
    try {
      const added = await addMapsRunToLeads(done)
      if (added === null) return
      patch(runId, { imported: true })
      log(runId, added ? `${added} lead(s) entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.')
      useApp.getState().toast(added ? `${added} lead(s) da busca entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', {
        label: 'Ver leads',
        run: () => (window.location.href = '/leads'),
      })
    } catch (err) {
      useApp.getState().toast(err instanceof Error ? `Não consegui salvar a busca nos leads: ${err.message}` : 'Não consegui salvar a busca nos leads.', 'error')
    }
  }

  /** Abre o site de quem tem: acha o Instagram e, quando o CNPJ do site confere, o sócio responsável. */
  async function checkSites(runId: string, toCheck: MapsResult[]) {
    const queue: MapsResult[][] = []
    for (let i = 0; i < toCheck.length; i += 6) queue.push(toCheck.slice(i, i + 6))
    let insta = 0
    let socios = 0
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const batch = queue.shift()!
          try {
            const { itens } = await mapsApi<{
              itens: {
                id: string
                alive: boolean
                instagram: string
                cnpj: string
                responsibleName: string
                responsibleRole: string
                enrichmentConfidence: MapsResult['enrichmentConfidence']
                enrichmentSource: string
              }[]
            }>({
              acao: 'enriquecer',
              itens: batch.map((r) => ({
                id: r.id,
                website: r.website,
                name: r.name,
                phone: r.phone,
                city: r.city,
              })),
            })
            const byId = new Map(itens.map((e) => [e.id, e]))
            set((s) =>
              s.state?.runId === runId
                ? {
                    state: {
                      ...s.state,
                      results: s.state.results.map((r) => {
                        const e = byId.get(r.id)
                        return e
                          ? {
                              ...r,
                              instagram: r.instagram || e.instagram,
                              responsibleName: e.responsibleName,
                              responsibleRole: e.responsibleRole,
                              cnpj: e.cnpj,
                              enrichmentConfidence: e.enrichmentConfidence,
                            }
                          : r
                      }),
                    },
                  }
                : s,
            )
            const app = useApp.getState()
            for (const e of itens) {
              if (e.instagram) insta++
              if (e.responsibleName) socios++
              if (!e.instagram) continue
              const r = batch.find((x) => x.id === e.id)
              // O lead que veio deste resultado: pelo lugar no Maps ou pelo telefone
              const mk = mapsKey(r?.mapsUrl ?? null)
              const pk = phoneKey(r?.phone ?? null)
              const lead = app.leads.find((l) => (mk && mapsKey(l.maps_url) === mk) || (pk && phoneKey(l.telefone) === pk))
              if (lead) await app.fillLeadLinks(lead.id, { instagram: e.instagram })
            }
          } catch {
            /* site lento ou fora do ar: o lead fica sem Instagram */
          }
        }
      }),
    )
    log(runId, `Sites conferidos: ${insta} com Instagram${socios ? `, ${socios} com o sócio pelo CNPJ` : ''}.`)
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
      const google = input.source === 'google'
      set({
        state: {
          runId,
          active: true,
          phase: 'connecting',
          message: google ? 'Buscando no Google Maps…' : 'Buscando na base aberta…',
          progress: 20,
          cardsFound: 0,
          approvedCount: 0,
          discarded: 0,
          recurringDetected: 0,
          recurringBlocked: 0,
          currentSector: 0,
          totalSectors: 0,
          center: {
            lat: input.area.lat,
            lng: input.area.lng,
            label: input.location,
          },
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
      log(runId, `Busca (${google ? 'Google Maps' : 'base aberta'}): ${input.niches.join(', ')} · ${where}`)

      let results: MapsResult[] = []
      try {
        let data: { results: MapsResult[]; stats: Stats }
        if (google) {
          const gk = useGoogleKey.getState()
          if (!gk.loaded) await gk.load()
          const cfg = useGoogleKey.getState().config
          if (!cfg.chave) throw new Error('Coloque a sua chave do Google em Ajustes → Busca do Google (ou use a busca grátis da base aberta).')
          const known = knownKeys(useApp.getState().leads)
          data = await mapsApi<{ results: MapsResult[]; stats: Stats }>(
            {
              acao: 'google',
              chave: cfg.chave,
              nichos: input.niches.map((n) => ({
                nome: categoriaDe(n).nome,
                busca: categoriaDe(n).google,
              })),
              cidade: input.location,
              caixa: input.area.caixa,
              bairros: input.bairros,
              meta: input.targetLeads,
              filtros: {
                telefone: input.qualification.phone,
                celular: input.qualification.mobile,
                site: input.qualification.website,
              },
              conhecidos: { telefones: known.phones, maps: known.maps },
              pular: input.existingPolicy === 'block',
              restante: restantes(cfg),
            },
            c.signal,
          )
          if (data.stats.calls) {
            await useGoogleKey
              .getState()
              .addUso(data.stats.calls)
              .catch(() => undefined)
            log(runId, `${data.stats.calls} consulta(s) do Google usadas · ${restantes(useGoogleKey.getState().config)} ainda grátis neste mês.`)
          }
        } else {
          data = await searchBase(input, c.signal, (l) => log(runId, l))
        }
        results = data.results
        const fresh = results.filter((r) => !r.recurring).length
        log(runId, `${data.stats.found} empresas nesse nicho e região; ${fresh} passaram nos filtros (${(data.stats.elapsedMs / 1000).toFixed(1).replace('.', ',')} s).`)
        if (data.stats.blocked) log(runId, `${data.stats.blocked} já estavam nos seus leads e foram puladas.`)
        patch(runId, {
          results,
          cardsFound: data.stats.found,
          approvedCount: fresh,
          recurringDetected: data.stats.recurring,
          recurringBlocked: data.stats.blocked,
          progress: 70,
          message: `${fresh} empresa(s) encontradas.`,
        })
      } catch (err) {
        if (c.signal.aborted)
          return void finish(runId, 'cancelled', {
            message: 'Busca interrompida.',
          })
        const msg = err instanceof Error ? err.message : 'Falha na busca.'
        log(runId, `Erro: ${msg}`)
        return void finish(runId, 'error', { error: msg, message: msg })
      }

      // Os leads entram na hora; a leitura dos sites vem depois, em segundo plano
      const fresh = results.filter((r) => !r.recurring)
      const secs = (Date.now() - Date.parse(startedAt)) / 1000
      const toCheck = input.analyzeSites ? fresh.filter((r) => r.website && !r.instagram) : []
      const vazio = !fresh.length && (google ? ' Tente outro tipo de negócio ou tire filtros.' : ' Tente outro tipo de negócio, tire filtros ou use a busca do Google.')
      await finish(runId, 'completed', {
        results,
        approvedCount: fresh.length,
        message: `${fresh.length} empresa(s) em ${secs < 1 ? 'menos de 1 segundo' : `${secs.toFixed(1).replace('.', ',')} s`}.${vazio || ''}${toCheck.length ? ` Lendo ${toCheck.length} site(s) em segundo plano…` : ''}`,
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
