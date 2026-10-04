import clsx from 'clsx'
import { Building2, Check, CircleStop, Crosshair, Download, Globe, LoaderCircle, Mail, Phone, Plus, Radar, Search, Smartphone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/kit'
import { getMapStyle, MapView, saveMapStyle, type MapPoint, type MapStyle } from '../components/MapView'
import { PageHeader } from '../components/PageHeader'
import { Button, InstagramIcon, Progress, Segmented } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { formatElapsed, PHASE_LABEL, POPULAR_NICHES, type Mode } from '../lib/mapsSearch'
import { mapsApi, useMapsSearch } from '../store/useMapsSearch'
import { useApp } from '../store/useApp'

const FORM_KEY = 'xs-prospeccao:busca-maps'

interface Form {
  location: string
  point: (MapPoint & { label: string }) | null
  bairros: string[]
  niches: string[]
  targetLeads: number
  qualification: { phone: Mode; website: Mode; mobile: Mode }
  analyzeSites: boolean
  existingPolicy: 'block' | 'allow'
}

const DEFAULT_FORM: Form = {
  location: '',
  point: null,
  bairros: [],
  niches: [],
  targetLeads: 30,
  qualification: { phone: 1, website: 0, mobile: 0 },
  analyzeSites: true,
  existingPolicy: 'block',
}

function loadForm(): Form {
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>
    // Formulários salvos antes da busca nova não têm bairros nem o filtro de celular
    return { ...DEFAULT_FORM, ...saved, bairros: saved.bairros ?? [], qualification: { ...DEFAULT_FORM.qualification, ...saved.qualification } }
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
  const toast = useApp((s) => s.toast)
  const state = useMapsSearch((s) => s.state)
  const [form, setForm] = useState<Form>(loadForm)
  const [nicheInput, setNicheInput] = useState('')
  const [bairroInput, setBairroInput] = useState('')
  const [suggested, setSuggested] = useState<{ nome: string; empresas: number }[]>([])
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>(getMapStyle)
  const [, tick] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

  // Bairros com mais empresas na cidade escolhida (sugestões)
  const cityLabel = form.point?.label
  useEffect(() => {
    if (!cityLabel) return setSuggested([])
    let alive = true
    mapsApi<{ bairros: { nome: string; empresas: number }[] }>({ acao: 'bairros', cidade: cityLabel })
      .then((r) => alive && setSuggested(r.bairros.slice(0, 14)))
      .catch(() => alive && setSuggested([]))
    return () => {
      alive = false
    }
  }, [cityLabel])

  const active = !!state?.active
  // Relógio da busca em andamento
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [active])
  const elapsed = state ? (active && state.startedAt ? Date.now() - Date.parse(state.startedAt) : state.elapsedMs) : 0

  const center: MapPoint | null = form.point ?? state?.center ?? null
  const results = state?.results ?? []
  // Normalmente vai sozinho para os leads; isto cobre uma falha ao salvar
  const pendingSave = !!state && !state.active && !state.imported && results.length > 0

  /** Acha a cidade digitada. Devolve o ponto (ou null se não achou). */
  async function locate(): Promise<Form['point']> {
    const q = form.location.trim()
    if (q.length < 2) {
      toast('Digite a cidade (ex.: Londrina, PR).', 'error')
      return null
    }
    setLocating(true)
    try {
      const rows = (await nominatim(`search?q=${encodeURIComponent(q)}&countrycodes=br&limit=1`)) as { lat: string; lon: string; address?: Record<string, string> }[]
      if (!rows[0]) throw new Error('Não achei essa cidade. Tente "Cidade, UF".')
      const label = placeLabel(rows[0].address, q)
      const point = { lat: Number(rows[0].lat), lng: Number(rows[0].lon), label }
      setForm((f) => ({ ...f, point, location: label, bairros: f.point?.label === label ? f.bairros : [] }))
      return point
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao localizar.', 'error')
      return null
    } finally {
      setLocating(false)
    }
  }

  async function pick(p: MapPoint) {
    try {
      const data = (await nominatim(`reverse?lat=${p.lat}&lon=${p.lng}&zoom=10`)) as { address?: Record<string, string> }
      const label = placeLabel(data.address, '')
      if (label) setForm((f) => ({ ...f, point: { ...p, label }, location: label, bairros: f.point?.label === label ? f.bairros : [] }))
    } catch {
      /* fica a cidade anterior */
    }
  }

  function addNiche(raw: string) {
    const n = raw.trim()
    if (!n) return
    setForm((f) => (f.niches.some((x) => x.toLowerCase() === n.toLowerCase()) ? f : { ...f, niches: [...f.niches, n].slice(0, 10) }))
    setNicheInput('')
  }

  function toggleNiche(n: string) {
    setForm((f) => ({ ...f, niches: f.niches.includes(n) ? f.niches.filter((x) => x !== n) : [...f.niches, n].slice(0, 10) }))
  }

  function toggleBairro(b: string) {
    const n = b.trim()
    if (!n) return
    setForm((f) => ({ ...f, bairros: f.bairros.some((x) => x.toLowerCase() === n.toLowerCase()) ? f.bairros.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...f.bairros, n].slice(0, 20) }))
    setBairroInput('')
  }

  async function start() {
    if (!form.niches.length) return toast('Escolha ao menos um nicho.', 'error')
    if (!form.point && !form.location.trim()) return toast('Informe a cidade.', 'error')
    // Cidade digitada sem localizar: localiza agora (padroniza "Cidade, UF") e já busca
    const point = form.point?.label === form.location ? form.point : await locate()
    if (!point) return
    void useMapsSearch.getState().run({
      niches: form.niches,
      location: point.label,
      lat: point.lat,
      lng: point.lng,
      bairros: form.bairros,
      targetLeads: form.targetLeads,
      qualification: form.qualification,
      analyzeSites: form.analyzeSites,
      existingPolicy: form.existingPolicy,
    })
  }

  async function saveNow() {
    if (!state) return
    setSaving(true)
    try {
      const n = await useMapsSearch.getState().save()
      if (n !== null) toast(n ? `${n} lead(s) entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', { label: 'Ver leads', run: () => (window.location.href = '/leads') })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar nos leads.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(
    () => ({
      whatsapp: results.filter((r) => r.hasWhatsapp).length,
      semSite: results.filter((r) => !r.website && !r.siteGuess).length,
      responsavel: results.filter((r) => r.responsibleName).length,
    }),
    [results],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buscar empresas"
        subtitle="Todas as empresas ativas do Brasil, pela base pública do CNPJ (Receita Federal). Resultado na hora, com telefone, e-mail e o sócio responsável."
      />

      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        {/* Formulário */}
        <section className="panel h-fit divide-y divide-line-soft">
          <div className="space-y-2 p-4">
            <p className="label">Cidade</p>
            <div className="flex gap-1.5">
              <input
                className="input"
                value={form.location}
                disabled={active}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void locate()}
                onBlur={() => form.location.trim() && form.location !== form.point?.label && void locate()}
                placeholder="Cidade, UF"
              />
              <Button onClick={() => void locate()} loading={locating} disabled={active} icon={<Search className="size-3.5" />} aria-label="Localizar" />
            </div>
            <p className="flex items-center gap-1.5 text-2xs text-fg-3">
              <Crosshair className="size-3" />
              {form.point ? form.point.label : 'Digite a cidade ou clique no mapa.'}
            </p>
          </div>

          <div className="space-y-2 p-4">
            <p className="label">
              Bairros <span className="font-normal text-fg-4">(opcional)</span> {form.bairros.length > 0 && <span className="text-blue-300">· {form.bairros.length}</span>}
            </p>
            <div className="flex gap-1.5">
              <input
                className="input"
                value={bairroInput}
                disabled={active}
                onChange={(e) => setBairroInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), toggleBairro(bairroInput))}
                placeholder="Digite o bairro e Enter"
              />
              <Button onClick={() => toggleBairro(bairroInput)} disabled={active || !bairroInput.trim()} icon={<Plus className="size-3.5" />} aria-label="Adicionar bairro" />
            </div>
            {form.bairros.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.bairros.map((b) => (
                  <span key={b} className="inline-flex h-6 items-center gap-1 rounded-md bg-blue-500/15 pr-1 pl-2 text-2xs font-medium text-blue-200 ring-1 ring-blue-500/30 ring-inset">
                    {b}
                    {!active && (
                      <button onClick={() => toggleBairro(b)} className="rounded p-0.5 hover:bg-blue-500/20" aria-label={`Remover ${b}`}>
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {suggested.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggested
                  .filter((s) => !form.bairros.some((b) => b.toLowerCase() === s.nome.toLowerCase()))
                  .map((s) => (
                    <button
                      key={s.nome}
                      disabled={active}
                      onClick={() => toggleBairro(s.nome)}
                      className="h-6 rounded-md border border-line px-2 text-2xs text-fg-3 transition-colors hover:border-blue-500/40 hover:text-fg-2 disabled:opacity-40"
                    >
                      {s.nome} <span className="num text-fg-4">{s.empresas}</span>
                    </button>
                  ))}
              </div>
            )}
            <p className="text-2xs text-fg-4">Sem bairro, a busca pega a cidade toda.</p>
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
                max={500}
                disabled={active}
                className="input num h-7 w-20"
                value={form.targetLeads}
                onChange={(e) => setForm({ ...form, targetLeads: Math.max(5, Math.min(500, Number(e.target.value) || 5)) })}
                aria-label="Quantidade personalizada"
              />
            </div>
          </div>

          <div className="space-y-2.5 p-4">
            <p className="label">Filtros</p>
            <Tri label="Telefone" icon={<Phone className="size-3.5" />} value={form.qualification.phone} disabled={active} onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, phone: v } })} />
            <Tri
              label="Celular"
              icon={<Smartphone className="size-3.5" />}
              value={form.qualification.mobile}
              disabled={active}
              onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, mobile: v } })}
            />
            <Tri label="Site" icon={<Globe className="size-3.5" />} value={form.qualification.website} disabled={active} onChange={(v) => setForm({ ...form, qualification: { ...form.qualification, website: v } })} />
            <p className="text-2xs text-fg-4">Celular = número que costuma ter WhatsApp. Site é estimado pelo e-mail da empresa: e-mail grátis (Gmail, Hotmail…) quase sempre significa que ela ainda não tem site.</p>
            <label className="flex items-start gap-2 pt-1 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={form.analyzeSites} disabled={active} onChange={(e) => setForm({ ...form, analyzeSites: e.target.checked })} />
              <span>
                Conferir os sites
                <span className="block text-2xs text-fg-4">Para quem tem e-mail com domínio próprio: confere se o site está no ar e acha o Instagram. Leva alguns segundos a mais.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={form.existingPolicy === 'block'} disabled={active} onChange={(e) => setForm({ ...form, existingPolicy: e.target.checked ? 'block' : 'allow' })} />
              <span>
                Pular quem já está nos meus leads
                <span className="block text-2xs text-fg-4">Confere telefone e CNPJ; repõe com empresas novas.</span>
              </span>
            </label>
          </div>

          <div className="p-4">
            {active ? (
              <Button variant="danger" size="lg" className="w-full" icon={<CircleStop className="size-4" />} onClick={() => useMapsSearch.getState().stop()}>
                Parar busca
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="w-full" icon={<Radar className="size-4" />} loading={locating} onClick={() => void start()}>
                Buscar empresas
              </Button>
            )}
          </div>
        </section>

        {/* Mapa + progresso + resultados */}
        <div className="min-w-0 space-y-3">
          <section className="panel relative h-[260px] overflow-hidden p-1 sm:h-[340px]">
            <MapView center={center} radiusKm={10} hideCircle results={[]} onPick={(p) => void pick(p)} locked={active} mapStyle={mapStyle} />
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
          </section>

          {state && state.phase !== 'idle' && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  {active && <LoaderCircle className="size-3.5 animate-spin text-blue-400" />}
                  {PHASE_LABEL[state.phase]}
                  {state.input && <span className="font-normal text-fg-3">· {state.input.location}</span>}
                </span>
              }
              description={
                state.input ? `${state.input.niches.join(', ')}${state.input.bairros.length ? ` · ${state.input.bairros.join(', ')}` : ''} · meta ${state.input.targetLeads}` : undefined
              }
              actions={
                <button onClick={() => setShowLogs((s) => !s)} className="text-2xs font-medium text-fg-3 hover:text-fg">
                  {showLogs ? 'Esconder registro' : 'Ver registro'}
                </button>
              }
            >
              <Progress value={state.progress} max={100} tone={state.phase === 'error' ? 'gold' : 'accent'} className="h-1.5" />
              <p className={clsx('mt-2 text-xs', state.phase === 'error' ? 'text-red-300' : 'text-fg-2')}>{state.error ?? state.message}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="No nicho e região" value={state.cardsFound} />
                <Metric label="Aprovadas" value={state.approvedCount} tone="text-emerald-300" />
                <Metric label="Já na base" value={state.recurringBlocked || state.recurringDetected} />
                <Metric label="Tempo" value={elapsed < 60_000 ? `${(elapsed / 1000).toFixed(1).replace('.', ',')} s` : formatElapsed(elapsed)} />
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
                    {stats.whatsapp} com celular (WhatsApp) · {stats.semSite} provavelmente sem site · {stats.responsavel} com responsável
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
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                      <th className="py-2 pl-4 font-medium">Empresa</th>
                      <th className="px-2 py-2 font-medium">Contato</th>
                      <th className="px-2 py-2 font-medium">Site</th>
                      <th className="px-2 py-2 font-medium">Responsável</th>
                      <th className="px-4 py-2 text-right font-medium">Aberta em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {results.map((r) => (
                      <tr key={r.id} className={clsx('align-top', r.recurring && 'opacity-55')}>
                        <td className="py-2.5 pr-2 pl-4">
                          <span className="font-medium text-fg">{r.name}</span>
                          <p className="text-2xs text-fg-3">
                            {r.niche}
                            {r.neighborhood ? ` · ${r.neighborhood}` : r.city ? ` · ${r.city}` : ''}
                          </p>
                          {r.razao && r.razao !== r.name && (
                            <p className="flex items-center gap-1 text-2xs text-fg-4">
                              <Building2 className="size-3" /> {r.razao}
                            </p>
                          )}
                          {r.recurring && <p className="text-2xs text-fg-4">Já está nos seus leads</p>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.phone ? (
                            <span className="num whitespace-nowrap text-fg">
                              {formatPhone(r.phone)} <span className={clsx('text-2xs', r.hasWhatsapp ? 'text-emerald-300' : 'text-fg-4')}>{r.hasWhatsapp ? 'celular' : 'fixo'}</span>
                            </span>
                          ) : (
                            <span className="text-fg-4">Sem telefone</span>
                          )}
                          {r.email && (
                            <span className="mt-0.5 flex max-w-[220px] items-center gap-1 truncate text-2xs text-fg-3" title={r.email}>
                              <Mail className="size-3 shrink-0" /> {r.email}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {r.website ? (
                              <a href={r.website} target="_blank" rel="noreferrer" title={r.website} className="text-blue-300 hover:text-blue-200">
                                <Globe className="size-4" />
                              </a>
                            ) : r.siteGuess ? (
                              <span className="text-2xs text-fg-3" title="E-mail com domínio próprio: pode ter site">
                                {r.siteGuess}
                              </span>
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
                          {r.responsibleName ? (
                            <>
                              <span className="text-fg">{r.responsibleName}</span>
                              <span className="block text-2xs text-fg-4">{r.responsibleRole || 'sócio'}</span>
                            </>
                          ) : (
                            <span className="text-fg-4">—</span>
                          )}
                        </td>
                        <td className="num px-4 py-2.5 text-right whitespace-nowrap text-fg-2">{r.openedAt ? r.openedAt.slice(0, 4) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(!state || state.phase === 'idle') && (
            <div className="panel flex items-center gap-3 px-4 py-3 text-xs text-fg-3">
              <Building2 className="size-4 shrink-0 text-blue-400" />
              Escolha a cidade e os nichos ao lado. A busca leva menos de um segundo, e as empresas que ela achar entram direto nos seus leads.
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
