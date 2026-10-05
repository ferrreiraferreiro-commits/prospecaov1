// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, ChevronDown, CircleStop, Crosshair, Download, Globe, KeyRound, LoaderCircle, Map as MapIcon, Phone, Plus, Radar, Search, Smartphone, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/kit'
import { getMapStyle, MapView, saveMapStyle, type MapPoint, type MapStyle } from '../components/MapView'
import { PageHeader } from '../components/PageHeader'
import { Button, InstagramIcon, Progress } from '../components/ui'
import { CATEGORIAS, GRUPOS, POPULARES, categoriaDe } from '../lib/categorias'
import { formatPhone } from '../lib/contact'
import { formatElapsed, PHASE_LABEL, type Mode, type SearchSource } from '../lib/mapsSearch'
import { normalizeKey } from '../lib/statuses'
import { restantes, usadasNoMes, useGoogleKey } from '../store/useGoogleKey'
import { nominatim, useMapsSearch, type SearchArea } from '../store/useMapsSearch'
import { useApp } from '../store/useApp'

const FORM_KEY = 'xs-prospeccao:busca-empresas'

type Point = MapPoint & SearchArea & { label: string }

interface Form {
  source: SearchSource
  location: string
  point: Point | null
  bairros: string[]
  niches: string[]
  targetLeads: number
  qualification: { phone: Mode; website: Mode; mobile: Mode }
  analyzeSites: boolean
  existingPolicy: 'block' | 'allow'
}

const DEFAULT_FORM: Form = {
  source: 'base',
  location: '',
  point: null,
  bairros: [],
  niches: [],
  targetLeads: 40,
  qualification: { phone: 1, website: 0, mobile: 0 },
  analyzeSites: true,
  existingPolicy: 'block',
}

function loadForm(): Form {
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>
    const form = {
      ...DEFAULT_FORM,
      ...saved,
      qualification: { ...DEFAULT_FORM.qualification, ...saved.qualification },
    }
    // Ponto salvo sem a área da cidade: localiza de novo na hora de buscar
    if (form.point && !Array.isArray(form.point.caixa)) form.point = null
    if (form.source !== 'google') form.source = 'base'
    return form
  } catch {
    return DEFAULT_FORM
  }
}

interface NominatimPlace {
  lat: string
  lon: string
  boundingbox?: string[]
  address?: Record<string, string>
}

function toPoint(row: NominatimPlace, fallback: string): Point | null {
  const a = row.address
  const city = a?.city || a?.town || a?.municipality || a?.village || a?.county || fallback
  const uf =
    String(a?.['ISO3166-2-lvl4'] ?? '')
      .split('-')
      .pop() ?? ''
  const bb = (row.boundingbox ?? []).map(Number)
  if (!city || bb.length !== 4 || !bb.every(Number.isFinite)) return null
  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    label: [city, uf].filter(Boolean).join(', '),
    caixa: [bb[0], bb[1], bb[2], bb[3]],
    uf,
  }
}

/** Quantas consultas do Google a busca pode gastar, no máximo. */
function estimateCalls(f: Form): number {
  const pages = Math.min(3, Math.ceil(f.targetLeads / 20))
  const porNicho = f.bairros.length ? f.bairros.length * pages : f.targetLeads > 50 ? pages + (f.targetLeads > 150 ? 9 : 4) : pages
  return Math.min(40, Math.max(1, f.niches.length) * porNicho)
}

export function MapsPage() {
  const toast = useApp((s) => s.toast)
  const state = useMapsSearch((s) => s.state)
  const gk = useGoogleKey()
  const [form, setForm] = useState<Form>(loadForm)
  const [nicheInput, setNicheInput] = useState('')
  const [bairroInput, setBairroInput] = useState('')
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>(getMapStyle)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!gk.loaded) void gk.load()
  }, [gk])

  useEffect(() => {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(form))
    } catch {
      /* sem armazenamento */
    }
  }, [form])

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

  const hasKey = !!gk.config.chave
  const usadas = usadasNoMes(gk.config)
  const sobra = restantes(gk.config)
  const google = form.source === 'google'
  const custo = estimateCalls(form)

  /** Acha a cidade digitada. Devolve o ponto (ou null se não achou). */
  async function locate(): Promise<Point | null> {
    const q = form.location.trim()
    if (q.length < 2) {
      toast('Digite a cidade (ex.: Londrina, PR).', 'error')
      return null
    }
    setLocating(true)
    try {
      const rows = await nominatim<NominatimPlace[]>(`search?q=${encodeURIComponent(q)}&countrycodes=br&featureType=city&limit=1`)
      const fallback = rows[0] ? null : await nominatim<NominatimPlace[]>(`search?q=${encodeURIComponent(q)}&countrycodes=br&limit=1`)
      const row = rows[0] ?? fallback?.[0]
      const point = row ? toPoint(row, q) : null
      if (!point) throw new Error('Não achei essa cidade. Tente "Cidade, UF".')
      setForm((f) => ({
        ...f,
        point,
        location: point.label,
        bairros: f.point?.label === point.label ? f.bairros : [],
      }))
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
      const data = await nominatim<NominatimPlace>(`reverse?lat=${p.lat}&lon=${p.lng}&zoom=10`)
      const city = data.address?.city || data.address?.town || data.address?.municipality || data.address?.village
      if (!city) return
      const uf =
        String(data.address?.['ISO3166-2-lvl4'] ?? '')
          .split('-')
          .pop() ?? ''
      // A busca pelo nome traz a área inteira da cidade (o reverso só traz o ponto)
      const rows = await nominatim<NominatimPlace[]>(`search?q=${encodeURIComponent(`${city}, ${uf}`)}&countrycodes=br&featureType=city&limit=1`)
      const point = rows[0] ? toPoint(rows[0], city) : null
      if (point)
        setForm((f) => ({
          ...f,
          point,
          location: point.label,
          bairros: f.point?.label === point.label ? f.bairros : [],
        }))
    } catch {
      /* fica a cidade anterior */
    }
  }

  function toggleNiche(raw: string) {
    const n = categoriaDe(raw).nome
    if (!n.trim()) return
    setForm((f) => {
      const has = f.niches.some((x) => x.toLowerCase() === n.toLowerCase())
      if (!has && f.niches.length >= 10) {
        toast('Até 10 tipos de negócio por busca.', 'error')
        return f
      }
      return {
        ...f,
        niches: has ? f.niches.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...f.niches, n],
      }
    })
    setNicheInput('')
  }

  function toggleBairro(b: string) {
    const n = b.trim()
    if (!n) return
    setForm((f) => ({
      ...f,
      bairros: f.bairros.some((x) => x.toLowerCase() === n.toLowerCase()) ? f.bairros.filter((x) => x.toLowerCase() !== n.toLowerCase()) : [...f.bairros, n].slice(0, 10),
    }))
    setBairroInput('')
  }

  async function start() {
    if (!form.niches.length) return toast('Escolha ao menos um tipo de negócio.', 'error')
    if (!form.point && !form.location.trim()) return toast('Informe a cidade.', 'error')
    if (google && !hasKey) return toast('Coloque a sua chave do Google em Ajustes ou use a busca grátis da base aberta.', 'error')
    if (google && sobra <= 0) return toast('As consultas grátis do Google deste mês acabaram. Use a base aberta até o mês virar.', 'error')
    // Cidade digitada sem localizar: localiza agora (padroniza "Cidade, UF") e já busca
    const point = form.point?.label === form.location ? form.point : await locate()
    if (!point) return
    void useMapsSearch.getState().run({
      source: form.source,
      niches: form.niches,
      location: point.label,
      area: {
        lat: point.lat,
        lng: point.lng,
        caixa: point.caixa,
        uf: point.uf,
      },
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
      if (n !== null)
        toast(n ? `${n} lead(s) entraram na sua lista.` : 'Essas empresas já estavam nos seus leads.', 'success', {
          label: 'Ver leads',
          run: () => (window.location.href = '/leads'),
        })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar nos leads.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(
    () => ({
      phone: results.filter((r) => r.phone).length,
      whatsapp: results.filter((r) => r.hasWhatsapp).length,
      semSite: results.filter((r) => !r.website).length,
    }),
    [results],
  )

  // Categorias que batem com o que foi digitado
  const matches = useMemo(() => {
    const q = normalizeKey(nicheInput)
    if (!q) return []
    return CATEGORIAS.filter((c) => normalizeKey(`${c.nome} ${c.google} ${c.grupo}`).includes(q)).slice(0, 8)
  }, [nicheInput])
  const selected = new Set(form.niches.map((n) => n.toLowerCase()))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buscar empresas"
        subtitle="Empresas de verdade da sua cidade, por tipo de negócio e bairro, com telefone, site e avaliações. Entram direto nos seus leads."
      />

      <div className="grid gap-3 xl:grid-cols-[23rem_1fr]">
        {/* Formulário */}
        <section className="panel h-fit divide-y divide-line-soft">
          {/* Fonte */}
          <div className="space-y-2.5 p-4">
            <p className="label">Onde buscar</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink p-0.5">
              {(
                [
                  { id: 'base', label: 'Base aberta', hint: 'Grátis, sem limite' },
                  { id: 'google', label: 'Google Maps', hint: 'Com nota e avaliações' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  disabled={active}
                  onClick={() => setForm({ ...form, source: s.id })}
                  className={clsx(
                    'rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-60',
                    form.source === s.id ? 'bg-raised ring-1 ring-line-strong ring-inset' : 'hover:bg-hover',
                  )}
                >
                  <span className={clsx('block text-xs font-semibold', form.source === s.id ? 'text-fg' : 'text-fg-2')}>{s.label}</span>
                  <span className="block text-2xs text-fg-4">{s.hint}</span>
                </button>
              ))}
            </div>
            {google ? (
              hasKey ? (
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between text-2xs">
                    <span className="text-fg-3">Consultas grátis do mês</span>
                    <span className="num text-fg-2">
                      {usadas} / {gk.config.limite}
                    </span>
                  </div>
                  <Progress value={usadas} max={gk.config.limite || 1} tone={sobra < 50 ? 'gold' : 'accent'} className="h-1" />
                  <p className="text-2xs text-fg-4">
                    Esta busca usa até <span className="num text-fg-3">{custo}</span>. Cada consulta traz até 20 empresas. A XS para antes da cota grátis do Google, então você
                    nunca paga.
                  </p>
                </div>
              ) : (
                <Link
                  to="/configuracoes#google"
                  className="flex items-start gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2.5 text-xs transition-colors hover:bg-blue-500/10"
                >
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-blue-300" />
                  <span>
                    <span className="block font-semibold text-fg">Coloque a sua chave do Google</span>
                    <span className="block text-2xs text-fg-3">Grátis e sem cartão, em 2 minutos: passo a passo em Ajustes. Traz nota e avaliações do Google.</span>
                  </span>
                </Link>
              )
            ) : (
              <p className="text-2xs text-fg-4">
                Milhões de comércios do Brasil, quase todos com telefone, de uma base pública e gratuita (Overture Maps: dados do Facebook, Microsoft e outros). Sem chave e
                sem limite. O Google é mais atualizado e traz nota e avaliações.
              </p>
            )}
          </div>

          {/* Cidade */}
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

          {/* Bairros */}
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
                  <Tag key={b} onRemove={active ? undefined : () => toggleBairro(b)}>
                    {b}
                  </Tag>
                ))}
              </div>
            )}
            <p className="text-2xs text-fg-4">Sem bairro, a busca pega a cidade toda.</p>
          </div>

          {/* Tipo de negócio */}
          <div className="space-y-2 p-4">
            <p className="label">Tipo de negócio {form.niches.length > 0 && <span className="text-blue-300">· {form.niches.length}</span>}</p>
            {form.niches.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.niches.map((n) => (
                  <Tag key={n} onRemove={active ? undefined : () => toggleNiche(n)}>
                    {n}
                  </Tag>
                ))}
              </div>
            )}
            <div className="relative">
              <div className="flex gap-1.5">
                <input
                  className="input"
                  value={nicheInput}
                  disabled={active}
                  onChange={(e) => setNicheInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    toggleNiche(matches[0] && normalizeKey(matches[0].nome) === normalizeKey(nicheInput) ? matches[0].nome : nicheInput)
                  }}
                  placeholder="Procure ou digite qualquer negócio"
                />
                <Button
                  onClick={() => toggleNiche(nicheInput)}
                  disabled={active || !nicheInput.trim()}
                  icon={<Plus className="size-3.5" />}
                  aria-label="Adicionar tipo de negócio"
                />
              </div>
              {matches.length > 0 && (
                <ul className="mt-1 overflow-hidden rounded-md border border-line bg-raised">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => toggleNiche(c.nome)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-hover">
                        <span className="text-fg">{c.nome}</span>
                        <span className="text-2xs text-fg-4">{selected.has(c.nome.toLowerCase()) ? 'escolhido' : c.grupo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {POPULARES.map((id) => CATEGORIAS.find((c) => c.id === id)!)
                .filter((c) => !selected.has(c.nome.toLowerCase()))
                .map((c) => (
                  <ChipButton key={c.id} disabled={active} onClick={() => toggleNiche(c.nome)}>
                    {c.nome}
                  </ChipButton>
                ))}
            </div>
            <div className="divide-y divide-line-soft rounded-md border border-line-soft">
              {GRUPOS.map((g) => {
                const cats = CATEGORIAS.filter((c) => c.grupo === g)
                const n = cats.filter((c) => selected.has(c.nome.toLowerCase())).length
                const open = openGroup === g
                return (
                  <div key={g}>
                    <button
                      onClick={() => setOpenGroup(open ? null : g)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-fg-2 hover:text-fg"
                      aria-expanded={open}
                    >
                      <span className="flex-1">{g}</span>
                      {n > 0 && <span className="num rounded bg-blue-500/15 px-1.5 text-2xs text-blue-200">{n}</span>}
                      <span className="num text-2xs text-fg-4">{cats.length}</span>
                      <ChevronDown className={clsx('size-3.5 text-fg-4 transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
                        {cats.map((c) => (
                          <ChipButton key={c.id} active={selected.has(c.nome.toLowerCase())} disabled={active} onClick={() => toggleNiche(c.nome)}>
                            {c.nome}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quantidade */}
          <div className="space-y-2 p-4">
            <p className="label">Quantos leads</p>
            <div className="flex items-center gap-1">
              {[20, 40, 60, 120].map((n) => (
                <ChipButton key={n} active={form.targetLeads === n} disabled={active} onClick={() => setForm({ ...form, targetLeads: n })} className="num h-7 px-2.5 text-xs">
                  {n}
                </ChipButton>
              ))}
              <input
                type="number"
                min={5}
                max={300}
                disabled={active}
                className="input num h-7 w-20"
                value={form.targetLeads}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetLeads: Math.max(5, Math.min(300, Number(e.target.value) || 5)),
                  })
                }
                aria-label="Quantidade personalizada"
              />
            </div>
          </div>

          {/* Filtros */}
          <div className="space-y-2.5 p-4">
            <p className="label">Filtros</p>
            <Tri
              label="Telefone"
              icon={<Phone className="size-3.5" />}
              value={form.qualification.phone}
              disabled={active}
              onChange={(v) =>
                setForm({
                  ...form,
                  qualification: { ...form.qualification, phone: v },
                })
              }
            />
            <Tri
              label="Celular"
              icon={<Smartphone className="size-3.5" />}
              value={form.qualification.mobile}
              disabled={active}
              onChange={(v) =>
                setForm({
                  ...form,
                  qualification: { ...form.qualification, mobile: v },
                })
              }
            />
            <Tri
              label="Site"
              icon={<Globe className="size-3.5" />}
              value={form.qualification.website}
              disabled={active}
              onChange={(v) =>
                setForm({
                  ...form,
                  qualification: { ...form.qualification, website: v },
                })
              }
            />
            <p className="text-2xs text-fg-4">Celular = número que costuma ter WhatsApp. "Sem site" acha quem mais precisa de um.</p>
            <label className="flex items-start gap-2 pt-1 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={form.analyzeSites} disabled={active} onChange={(e) => setForm({ ...form, analyzeSites: e.target.checked })} />
              <span>
                Ler os sites
                <span className="block text-2xs text-fg-4">Abre o site de quem tem e acha o Instagram e, quando dá, o sócio pelo CNPJ. Não gasta consulta do Google.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.existingPolicy === 'block'}
                disabled={active}
                onChange={(e) =>
                  setForm({
                    ...form,
                    existingPolicy: e.target.checked ? 'block' : 'allow',
                  })
                }
              />
              <span>
                Pular quem já está nos meus leads
                <span className="block text-2xs text-fg-4">Confere telefone e o lugar no Maps.</span>
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
                {google ? 'Buscar no Google Maps' : 'Buscar empresas'}
              </Button>
            )}
          </div>
        </section>

        {/* Mapa + progresso + resultados */}
        <div className="min-w-0 space-y-3">
          <section className="panel relative h-[260px] overflow-hidden p-1 sm:h-[340px]">
            <MapView center={center} radiusKm={8} hideCircle results={results} onPick={(p) => void pick(p)} locked={active} mapStyle={mapStyle} />
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
                state.input
                  ? `${state.input.source === 'google' ? 'Google Maps' : 'Base aberta'} · ${state.input.niches.join(', ')}${state.input.bairros.length ? ` · ${state.input.bairros.join(', ')}` : ''} · meta ${state.input.targetLeads}`
                  : undefined
              }
              actions={
                <button onClick={() => setShowLogs((s) => !s)} className="text-2xs font-medium text-fg-3 hover:text-fg">
                  {showLogs ? 'Esconder registro' : 'Ver registro'}
                </button>
              }
            >
              <Progress value={state.progress} max={100} tone={state.phase === 'error' ? 'gold' : 'accent'} className="h-1.5" />
              <p className={clsx('mt-2 text-xs', state.phase === 'error' ? 'text-red-300' : 'text-fg-2')}>{state.error ?? state.message}</p>
              {state.phase === 'error' && state.input?.source === 'google' && (
                <p className="mt-1 text-2xs text-fg-3">
                  <Link to="/configuracoes#google" className="underline underline-offset-2 hover:text-fg">
                    Abrir Ajustes → Busca do Google
                  </Link>{' '}
                  ou troque para a base aberta.
                </p>
              )}
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
                    {stats.phone} com telefone · {stats.whatsapp} com celular (WhatsApp) · {stats.semSite} sem site
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
                      <th className="px-2 py-2 font-medium">Google</th>
                      <th className="px-4 py-2 font-medium">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {results.map((r) => (
                      <tr key={r.id} className={clsx('align-top', r.recurring && 'opacity-55')}>
                        <td className="py-2.5 pr-2 pl-4">
                          <span className="pv font-medium text-fg">{r.name}</span>
                          <p className="text-2xs text-fg-3">
                            {r.niche}
                            {r.neighborhood ? ` · ${r.neighborhood}` : r.city ? ` · ${r.city}` : ''}
                          </p>
                          {r.recurring && <p className="text-2xs text-fg-4">Já está nos seus leads</p>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.phone ? (
                            <span className="num whitespace-nowrap text-fg">
                              <span className="pv">{formatPhone(r.phone)}</span>{' '}
                              <span className={clsx('text-2xs', r.hasWhatsapp ? 'text-emerald-300' : 'text-fg-4')}>{r.hasWhatsapp ? 'celular' : 'fixo'}</span>
                            </span>
                          ) : (
                            <span className="text-fg-4">Sem telefone</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {r.website ? (
                              <a href={r.website} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200" aria-label="Abrir o site">
                                <Globe className="size-4" />
                              </a>
                            ) : (
                              <span className="rounded bg-emerald-500/10 px-1.5 text-2xs leading-5 font-medium text-emerald-300">sem site</span>
                            )}
                            {r.instagram && (
                              <a href={r.instagram} target="_blank" rel="noreferrer" className="text-fg-3 hover:text-fg" aria-label="Abrir o Instagram">
                                <InstagramIcon className="size-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          {r.rating ? (
                            <span className="num inline-flex items-center gap-1 whitespace-nowrap text-fg-2">
                              <Star className="size-3 fill-gold text-gold" />
                              {r.rating.toFixed(1).replace('.', ',')}
                              <span className="text-2xs text-fg-4">({r.reviewsCount})</span>
                            </span>
                          ) : r.mapsUrl ? (
                            <span className="text-fg-4">sem nota</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-2xs text-fg-4">
                              <MapIcon className="size-3" /> base aberta
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.responsibleName ? (
                            <>
                              <span className="pv text-fg">{r.responsibleName}</span>
                              <span className="block text-2xs text-fg-4">{r.responsibleRole || 'sócio'}</span>
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

          {(!state || state.phase === 'idle') && (
            <div className="panel flex items-center gap-3 px-4 py-3 text-xs text-fg-3">
              <Radar className="size-4 shrink-0 text-blue-400" />
              Escolha a cidade e os tipos de negócio ao lado. As empresas que a busca achar entram direto nos seus leads, prontas para ligar.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Tag({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-blue-500/15 pr-1 pl-2 text-2xs font-medium text-blue-200 ring-1 ring-blue-500/30 ring-inset">
      {children}
      {onRemove && (
        <button onClick={onRemove} className="rounded p-0.5 hover:bg-blue-500/20" aria-label={`Remover ${String(children)}`}>
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function ChipButton({
  active,
  onClick,
  children,
  disabled,
  className,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={clsx(
        'h-6 rounded-md border px-2 text-2xs font-medium transition-colors disabled:opacity-40',
        active ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:border-blue-500/40 hover:text-fg-2',
        className,
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
      <div className="grid flex-1 grid-cols-3 gap-0.5 rounded-md border border-line bg-ink p-0.5">
        {(
          [
            [1, 'Com'],
            [0, 'Tanto faz'],
            [-1, 'Sem'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={clsx(
              'h-6 rounded text-2xs font-medium transition-colors',
              value === v ? 'bg-raised text-fg ring-1 ring-line-strong ring-inset' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {l}
          </button>
        ))}
      </div>
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
