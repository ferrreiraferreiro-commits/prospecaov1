import clsx from 'clsx'
import { Check, CircleStop, Crosshair, Download, ExternalLink, Globe, LoaderCircle, MapPinned, Phone, Plus, Radar, Search, Star, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/kit'
import { getMapStyle, MapView, saveMapStyle, type MapPoint, type MapStyle } from '../components/MapView'
import { MotorOffline } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button, InstagramIcon, Progress, Segmented } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { addMapsRunToLeads } from '../lib/mapsAutoImport'
import { formatElapsed, knownKeys, PHASE_LABEL, POPULAR_NICHES, type MapsSearchInput, type MapsState, type Mode } from '../lib/mapsSearch'
import { motorFetch, useMotor } from '../lib/motor'
import { useApp } from '../store/useApp'

const FORM_KEY = 'xs-prospeccao:busca-maps'

interface Form {
  location: string
  point: (MapPoint & { label: string }) | null
  radiusKm: number
  niches: string[]
  targetLeads: number
  qualification: { phone: Mode; website: Mode; instagram: Mode }
  analyzeSites: boolean
  existingPolicy: 'block' | 'allow'
}

const DEFAULT_FORM: Form = {
  location: '',
  point: null,
  radiusKm: 5,
  niches: [],
  targetLeads: 30,
  qualification: { phone: 1, website: 0, instagram: 0 },
  analyzeSites: true,
  existingPolicy: 'block',
}

function loadForm(): Form {
  try {
    return { ...DEFAULT_FORM, ...(JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>) }
  } catch {
    return DEFAULT_FORM
  }
}

async function nominatim(path: string): Promise<unknown> {
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&addressdetails=1&accept-language=pt-BR`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error('Serviço de mapas indisponível no momento.')
  return res.json()
}

function placeLabel(a: Record<string, string> | undefined, fallback: string): string {
  const city = a?.city || a?.town || a?.municipality || a?.village || a?.county || fallback
  const uf = String(a?.['ISO3166-2-lvl4'] ?? '').split('-').pop()
  return [city, uf].filter(Boolean).join(', ')
}

export function MapsPage() {
  const online = useMotor((s) => s.online)
  const leads = useApp((s) => s.leads)
  const toast = useApp((s) => s.toast)
  const [form, setForm] = useState<Form>(loadForm)
  const [state, setState] = useState<MapsState | null>(null)
  const [nicheInput, setNicheInput] = useState('')
  const [locating, setLocating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>(getMapStyle)

  useEffect(() => {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

  const refresh = useCallback(async () => {
    try {
      setState(await motorFetch<MapsState>('/maps/estado', { timeoutMs: 5000 }))
    } catch {
      /* motor desligado: o aviso aparece pela barra lateral */
    }
  }, [])

  const active = !!state?.active
  useEffect(() => {
    if (!online) return
    void refresh()
    const id = setInterval(() => void refresh(), active ? 1500 : 8000)
    return () => clearInterval(id)
  }, [online, active, refresh])

  const center: MapPoint | null = state?.active && state.center ? state.center : (form.point ?? state?.center ?? null)
  const results = state?.results ?? []
  // Normalmente vai sozinho para os leads (useMapsAutoImport); isto cobre uma falha ao salvar
  const pendingSave = !!state && !state.active && !state.imported && results.length > 0

  async function locate() {
    const q = form.location.trim()
    if (q.length < 2) return toast('Digite a cidade (ex.: Poços de Caldas, MG).', 'error')
    setLocating(true)
    try {
      const rows = (await nominatim(`search?q=${encodeURIComponent(q)}&countrycodes=br&limit=1`)) as { lat: string; lon: string; address?: Record<string, string> }[]
      if (!rows[0]) throw new Error('Não achei essa cidade. Tente "Cidade, UF".')
      const label = placeLabel(rows[0].address, q)
      setForm((f) => ({ ...f, point: { lat: Number(rows[0].lat), lng: Number(rows[0].lon), label }, location: label }))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao localizar.', 'error')
    } finally {
      setLocating(false)
    }
  }

  async function pick(p: MapPoint) {
    setForm((f) => ({ ...f, point: { ...p, label: 'Ponto no mapa' } }))
    try {
      const data = (await nominatim(`reverse?lat=${p.lat}&lon=${p.lng}&zoom=10`)) as { address?: Record<string, string> }
      const label = placeLabel(data.address, 'Ponto no mapa')
      setForm((f) => (f.point && f.point.lat === p.lat ? { ...f, point: { ...p, label }, location: label } : f))
    } catch {
      /* mantém "Ponto no mapa" */
    }
  }

  function addNiche(raw: string) {
    const n = raw.trim()
    if (!n) return
    setForm((f) => (f.niches.some((x) => x.toLowerCase() === n.toLowerCase()) ? f : { ...f, niches: [...f.niches, n].slice(0, 30) }))
    setNicheInput('')
  }

  function toggleNiche(n: string) {
    setForm((f) => ({ ...f, niches: f.niches.includes(n) ? f.niches.filter((x) => x !== n) : [...f.niches, n] }))
  }

  async function start() {
    if (!form.niches.length) return toast('Escolha ao menos um nicho.', 'error')
    if (!form.point && !form.location.trim()) return toast('Informe a cidade ou clique no mapa.', 'error')
    setStarting(true)
    try {
      // Garante que a busca anterior está nos leads antes de o motor trocá-la pela nova
      if (pendingSave && state) await addMapsRunToLeads(state)
      const body: MapsSearchInput & { known: { phones: string[]; maps: string[] } } = {
        niches: form.niches,
        location: form.point?.label ?? form.location,
        lat: form.point?.lat,
        lng: form.point?.lng,
        radiusKm: form.radiusKm,
        targetLeads: form.targetLeads,
        qualification: form.qualification,
        analyzeSites: form.analyzeSites,
        existingPolicy: form.existingPolicy,
        known: knownKeys(leads),
      }
      await motorFetch('/maps/iniciar', { method: 'POST', json: body })
      await refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao iniciar.', 'error')
    } finally {
      setStarting(false)
    }
  }

  async function stop() {
    await motorFetch('/maps/parar', { method: 'POST' }).catch(() => undefined)
    await refresh()
  }

  async function saveNow() {
    if (!state) return
    setSaving(true)
    try {
      const n = await addMapsRunToLeads(state)
      await refresh()
      if (n !== null) toast(n ?`${n} lead(s) entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', { label: 'Ver leads', run: () => (window.location.href = '/leads') })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar nos leads.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(
    () => ({
      semSite: results.filter((r) => !r.website).length,
      whatsapp: results.filter((r) => r.hasWhatsapp).length,
      cnpj: results.filter((r) => r.enrichmentConfidence === 'confirmed').length,
    }),
    [results],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buscar no Maps"
        subtitle="Varre a região em setores, abre cada ficha e confere telefone, site, Instagram e CNPJ. Nada é inventado: só entra o que o Maps mostra."
      />

      {online === false && <MotorOffline feature="A busca no Maps" />}

      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        {/* Formulário */}
        <section className="panel h-fit divide-y divide-line-soft">
          <div className="space-y-2 p-4">
            <p className="label">Onde</p>
            <div className="flex gap-1.5">
              <input
                className="input"
                value={form.location}
                disabled={active}
                onChange={(e) => setForm({ ...form, location: e.target.value, point: null })}
                onKeyDown={(e) => e.key === 'Enter' && void locate()}
                placeholder="Cidade, UF"
              />
              <Button onClick={() => void locate()} loading={locating} disabled={active} icon={<Search className="size-3.5" />} aria-label="Localizar" />
            </div>
            <p className="flex items-center gap-1.5 text-2xs text-fg-3">
              <Crosshair className="size-3" />
              {form.point ? `${form.point.label} · ${form.point.lat.toFixed(4)}, ${form.point.lng.toFixed(4)}` : 'Ou clique no mapa / arraste o pino azul para escolher o centro.'}
            </p>
          </div>

          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <p className="label mb-0">Raio</p>
              <span className="num text-xs font-semibold text-blue-300">{form.radiusKm} km</span>
            </div>
            <input type="range" min={1} max={50} value={form.radiusKm} disabled={active} onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })} className="w-full accent-blue-500" />
            <div className="flex gap-1">
              {[5, 15, 30, 40, 50].map((r) => (
                <Chip key={r} active={form.radiusKm === r} onClick={() => !active && setForm({ ...form, radiusKm: r })}>
                  {r} km
                </Chip>
              ))}
            </div>
            <p className="text-2xs text-fg-4">{form.radiusKm <= 5 ? '19 pontos de varredura' : '41 pontos de varredura (centro + 4 anéis)'}</p>
          </div>

          <div className="space-y-2 p-4">
            <p className="label">Nichos {form.niches.length > 0 && <span className="text-blue-300">· {form.niches.length}</span>}</p>
            <div className="flex gap-1.5">
              <input
                className="input"
                value={nicheInput}
                disabled={active}
                onChange={(e) => setNicheInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNiche(nicheInput))}
                placeholder="Digite qualquer nicho e Enter"
              />
              <Button onClick={() => addNiche(nicheInput)} disabled={active || !nicheInput.trim()} icon={<Plus className="size-3.5" />} aria-label="Adicionar nicho" />
            </div>
            {form.niches.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.niches.map((n) => (
                  <span key={n} className="inline-flex h-6 items-center gap-1 rounded-md bg-blue-500/15 pr-1 pl-2 text-2xs font-medium text-blue-200 ring-1 ring-blue-500/30 ring-inset">
                    {n}
                    {!active && (
                      <button onClick={() => toggleNiche(n)} className="rounded p-0.5 hover:bg-blue-500/20" aria-label={`Remover ${n}`}>
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {POPULAR_NICHES.filter((n) => !form.niches.includes(n)).map((n) => (
                <button key={n} disabled={active} onClick={() => toggleNiche(n)} className="h-6 rounded-md border border-line px-2 text-2xs text-fg-3 transition-colors hover:border-blue-500/40 hover:text-fg-2 disabled:opacity-40">
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 p-4">
            <p className="label">Quantos leads</p>
            <div className="flex items-center gap-1">
              {[30, 60, 120].map((n) => (
                <Chip key={n} active={form.targetLeads === n} onClick={() => !active && setForm({ ...form, targetLeads: n })}>
                  {n}
                </Chip>
              ))}
              <input
                type="number"
                min={5}
                max={300}
                disabled={active}
                className="input num h-7 w-20"
                value={form.targetLeads}
                onChange={(e) => setForm({ ...form, targetLeads: Math.max(5, Math.min(300, Number(e.target.value) || 5)) })}
                aria-label="Quantidade personalizada"
              />
            </div>
          </div>

          <div className="space-y-2.5 p-4">
            <p className="label">Filtros</p>
            <Tri label="Telefone" icon={<Phone className="size-3.5" />} value={form.qualification.phone} disabled={active} onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, phone: v } })} />
            <Tri label="Site" icon={<Globe className="size-3.5" />} value={form.qualification.website} disabled={active} onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, website: v } })} />
            <Tri
              label="Instagram"
              icon={<InstagramIcon className="size-3.5" />}
              value={form.qualification.instagram}
              disabled={active}
              onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, instagram: v } })}
            />
            <p className="text-2xs text-fg-4">Para vender site: Site = "Sem" traz só quem ainda não tem.</p>
            <label className="flex items-start gap-2 pt-1 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={form.analyzeSites} disabled={active} onChange={(e) => setForm({ ...form, analyzeSites: e.target.checked })} />
              <span>
                Abrir o site de cada empresa
                <span className="block text-2xs text-fg-4">Acha Instagram e CNPJ (com o sócio responsável). Mais lento.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={form.existingPolicy === 'block'} disabled={active} onChange={(e) => setForm({ ...form, existingPolicy: e.target.checked ? 'block' : 'allow' })} />
              <span>
                Pular quem já está nos meus leads
                <span className="block text-2xs text-fg-4">Confere telefone e lugar no Maps; repõe com empresas novas.</span>
              </span>
            </label>
          </div>

          <div className="p-4">
            {active ? (
              <Button variant="danger" size="lg" className="w-full" icon={<CircleStop className="size-4" />} onClick={() => void stop()}>
                Parar busca
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="w-full" icon={<Radar className="size-4" />} loading={starting} disabled={!online} onClick={() => void start()}>
                Iniciar busca
              </Button>
            )}
          </div>
        </section>

        {/* Mapa + progresso + resultados */}
        <div className="min-w-0 space-y-3">
          <section className="panel relative h-[380px] overflow-hidden p-1 sm:h-[520px]">
            <MapView center={center} radiusKm={form.radiusKm} results={results} onPick={(p) => void pick(p)} locked={active} mapStyle={mapStyle} />
            <div className="absolute top-3 right-3 z-10 flex rounded-md border border-line bg-panel/90 p-0.5 text-2xs font-medium backdrop-blur">
              {(['claro', 'escuro'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setMapStyle(s)
                    saveMapStyle(s)
                  }}
                  className={clsx('rounded px-2 py-1 capitalize', mapStyle === s ? 'bg-blue-600 text-white' : 'text-fg-3 hover:text-fg')}
                >
                  Mapa {s}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute top-12 right-3 z-10 flex gap-2 rounded-md bg-ink/85 px-2.5 py-1.5 text-[10px] text-fg-2 backdrop-blur">
              <Legend color="#3fb97f">Sem site</Legend>
              <Legend color="#60a5fa">Com site</Legend>
              <Legend color="#a1a1aa">Já na base</Legend>
            </div>
          </section>

          {state && state.phase !== 'idle' && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  {active && <LoaderCircle className="size-3.5 animate-spin text-blue-400" />}
                  {PHASE_LABEL[state.phase]}
                  {state.center && <span className="font-normal text-fg-3">· {state.center.label}</span>}
                </span>
              }
              description={state.input ? `${state.input.niches.join(', ')} · ${state.input.radiusKm} km · meta ${state.input.targetLeads}` : undefined}
              actions={
                <button onClick={() => setShowLogs((s) => !s)} className="text-2xs font-medium text-fg-3 hover:text-fg">
                  {showLogs ? 'Esconder registro' : 'Ver registro'}
                </button>
              }
            >
              <Progress value={state.progress} max={100} tone={state.phase === 'error' ? 'gold' : 'accent'} className="h-1.5" />
              <p className={clsx('mt-2 text-xs', state.phase === 'error' ? 'text-red-300' : 'text-fg-2')}>{state.error ?? state.message}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Metric label="Progresso" value={`${state.progress}%`} />
                <Metric label="Setores" value={state.totalSectors ? `${state.currentSector}/${state.totalSectors}` : '—'} />
                <Metric label="Candidatos" value={state.cardsFound} />
                <Metric label="Aprovados" value={state.approvedCount} tone="text-emerald-300" />
                <Metric label="Já na base" value={state.recurringBlocked || state.recurringDetected} />
                <Metric label="Tempo" value={formatElapsed(state.elapsedMs)} />
              </dl>
              {showLogs && (
                <pre className="mt-3 max-h-48 overflow-y-auto rounded-md border border-line-soft bg-ink p-2.5 font-mono text-[10.5px] leading-4 whitespace-pre-wrap text-fg-3">
                  {state.logs.slice().reverse().join('\n') || 'Sem registros.'}
                </pre>
              )}
            </Card>
          )}

          {results.length > 0 && (
            <section className="panel">
              <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-semibold">{results.length} empresa(s) encontradas</h2>
                  <p className="text-2xs text-fg-3">
                    {stats.semSite} sem site · {stats.whatsapp} com celular (WhatsApp) · {stats.cnpj} com responsável confirmado pelo CNPJ
                  </p>
                </div>
                {active ? (
                  <span className="text-2xs text-fg-3">Entram nos seus leads quando a busca terminar.</span>
                ) : pendingSave ? (
                  <Button variant="primary" icon={<Download className="size-3.5" />} loading={saving} onClick={() => void saveNow()}>
                    Salvar nos leads
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <Check className="size-3.5" /> Já estão nos seus leads ·{' '}
                    <Link to="/leads" className="underline underline-offset-2">
                      ver leads
                    </Link>
                  </span>
                )}
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                      <th className="py-2 pl-4 font-medium">Empresa</th>
                      <th className="px-2 py-2 font-medium">Telefone</th>
                      <th className="px-2 py-2 font-medium">Presença</th>
                      <th className="px-2 py-2 font-medium">Responsável</th>
                      <th className="px-4 py-2 text-right font-medium">Avaliação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {results.map((r) => (
                      <tr key={r.id} className={clsx('align-top', r.recurring && 'opacity-55')}>
                        <td className="py-2.5 pr-2 pl-4">
                          <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fg hover:text-blue-300">
                            {r.name} <ExternalLink className="size-3 text-fg-4" />
                          </a>
                          <p className="text-2xs text-fg-3">
                            {r.niche}
                            {r.address ? ` · ${r.address}` : r.city ? ` · ${r.city}` : ''}
                          </p>
                          {r.recurring && <p className="text-2xs text-fg-4">Já está nos seus leads</p>}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          {r.phone ? (
                            <>
                              <span className="num text-fg">{formatPhone(r.phone)}</span>
                              <span className={clsx('block text-2xs', r.hasWhatsapp ? 'text-emerald-300' : 'text-fg-4')}>{r.hasWhatsapp ? 'celular' : 'fixo'}</span>
                            </>
                          ) : (
                            <span className="text-fg-4">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {r.website ? (
                              <a href={r.website} target="_blank" rel="noreferrer" title={r.website} className="text-blue-300 hover:text-blue-200">
                                <Globe className="size-4" />
                              </a>
                            ) : (
                              <span className="rounded bg-emerald-500/10 px-1.5 text-2xs leading-5 font-medium text-emerald-300">sem site</span>
                            )}
                            {r.instagram && (
                              <a href={r.instagram} target="_blank" rel="noreferrer" title={r.instagram} className="text-fg-3 hover:text-fg">
                                <InstagramIcon className="size-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          {r.enrichmentConfidence === 'confirmed' ? (
                            <>
                              <span className="text-fg">{r.responsibleName}</span>
                              <span className="block text-2xs text-fg-4">{r.responsibleRole || 'sócio'} · CNPJ confere</span>
                            </>
                          ) : r.cnpj ? (
                            <span className="text-2xs text-amber-300" title={r.enrichmentSource}>
                              CNPJ a conferir
                            </span>
                          ) : (
                            <span className="text-fg-4">—</span>
                          )}
                        </td>
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                          {r.rating ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-fg">
                                <Star className="size-3 fill-gold text-gold" />
                                {r.rating.toFixed(1)}
                              </span>
                              <span className="block text-2xs text-fg-4">{r.reviewsCount} aval.</span>
                            </>
                          ) : (
                            <span className="text-fg-4">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(!state || state.phase === 'idle') && online && (
            <div className="panel flex items-center gap-3 px-4 py-3 text-xs text-fg-3">
              <MapPinned className="size-4 shrink-0 text-blue-400" />
              Escolha a cidade, o raio e os nichos ao lado. O Motor abre o Google Maps escondido no seu computador, e as empresas que ele achar entram direto nos seus leads.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'num h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
        active ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:text-fg-2',
      )}
    >
      {children}
    </button>
  )
}

function Tri({ label, icon, value, onChange, disabled }: { label: string; icon: React.ReactNode; value: Mode; onChange: (v: Mode) => void; disabled?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2', disabled && 'pointer-events-none opacity-50')}>
      <span className="flex w-24 items-center gap-1.5 text-xs text-fg-2">
        {icon}
        {label}
      </span>
      <Segmented<'1' | '0' | '-1'>
        size="xs"
        value={String(value) as '1' | '0' | '-1'}
        onChange={(v) => onChange(Number(v) as Mode)}
        options={[
          { id: '1', label: 'Com' },
          { id: '0', label: 'Tanto faz' },
          { id: '-1', label: 'Sem' },
        ]}
      />
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
      <dt className="text-[10px] text-fg-4">{label}</dt>
      <dd className={clsx('num text-sm font-semibold', tone ?? 'text-fg')}>{value}</dd>
    </div>
  )
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}
