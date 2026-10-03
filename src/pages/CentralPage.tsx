import clsx from 'clsx'
import { Copy, Headphones, Search, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActiveFilterPills, FiltersPopover } from '../components/FiltersPopover'
import { LeadListHeader, LeadRow } from '../components/LeadRow'
import { DayComparison, MetricsStrip } from '../components/MetricsStrip'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Progress } from '../components/ui'
import {
  matchesAdvanced,
  matchesQuick,
  matchesSearch,
  nextAction,
  QUICK_FILTERS,
  SORT_OPTIONS,
  sortLeads,
  type QuickFilter,
  type SortKey,
} from '../lib/selectors'
import { useDuplicates, useIndex, useMetrics, useToday } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'

const PAGE_SIZE = 60

export function CentralPage() {
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const view = useApp((s) => s.central)
  const setCentral = useApp((s) => s.setCentral)
  const setQueue = useApp((s) => s.setQueue)
  const setImportOpen = useUi((s) => s.setImportOpen)
  const index = useIndex()
  const dupMap = useDuplicates()
  const metrics = useMetrics()
  const today = useToday()
  const navigate = useNavigate()

  const [limit, setLimit] = useState(PAGE_SIZE)
  const dupIds = useMemo(() => new Set(dupMap.keys()), [dupMap])

  // Busca + filtros avançados formam a base; os filtros rápidos mostram contagem sobre ela.
  const base = useMemo(
    () => leads.filter((l) => matchesSearch(l, view.search) && matchesAdvanced(l, view.advanced)),
    [leads, view.search, view.advanced],
  )
  const counts = useMemo(() => {
    const c = {} as Record<QuickFilter, number>
    for (const f of [...QUICK_FILTERS.map((q) => q.id), 'duplicados' as const]) {
      c[f] = base.filter((l) => matchesQuick(f, l, index, dupIds, today)).length
    }
    return c
  }, [base, index, dupIds, today])

  const filtered = useMemo(
    () => sortLeads(base.filter((l) => matchesQuick(view.quick, l, index, dupIds, today)), view.sort, index, today),
    [base, view.quick, view.sort, index, dupIds, today],
  )

  useEffect(() => setLimit(PAGE_SIZE), [view.quick, view.search, view.advanced, view.sort])

  // Renderização incremental ao rolar
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE_SIZE)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  const quickLabel = QUICK_FILTERS.find((q) => q.id === view.quick)?.label ?? 'Duplicados'
  const openCallMode = useCallback(
    (leadId: string) => {
      setQueue(filtered.map((l) => l.id), `Central · ${quickLabel}`)
      navigate(`/ligacao/${leadId}`)
    },
    [filtered, quickLabel, setQueue, navigate],
  )

  const startSequence = () => {
    if (!filtered.length) return
    openCallMode(filtered[0].id)
  }

  if (!leads.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leads" subtitle="Importe sua lista ou busque no Maps e comece a ligar." />
        <div className="panel">
          <Empty
            icon={<Upload />}
            title="Nenhum lead ainda"
            action={
              <Button variant="primary" icon={<Upload className="size-3.5" />} onClick={() => setImportOpen(true)}>
                Importar arquivo TXT
              </Button>
            }
          >
            Importe o arquivo exportado da sua busca de leads. Cada bloco numerado do arquivo vira um lead pronto para ligar.
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        subtitle={`${metrics.totalLeads} leads · ${metrics.hoje.ligacoes} ligações hoje`}
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="size-3.5" />} onClick={() => setImportOpen(true)}>
              Importar TXT
            </Button>
            <Button variant="primary" icon={<Headphones className="size-3.5" />} onClick={startSequence} disabled={!filtered.length}>
              Ligar em sequência
            </Button>
          </>
        }
      />

      <MetricsStrip m={metrics} meta={settings.meta_diaria} />

      <section className="panel grid gap-x-8 gap-y-4 px-4 py-3.5 md:grid-cols-[1fr_300px] md:items-center">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-xs text-fg-2">
              <span className="num font-semibold text-fg">{metrics.trabalhados}</span>
              <span className="text-fg-3"> / {metrics.totalLeads} leads trabalhados</span>
            </p>
            <span className="num text-2xs text-fg-3">
              {metrics.totalLeads ? Math.round((metrics.trabalhados / metrics.totalLeads) * 100) : 0}%
            </span>
          </div>
          <Progress value={metrics.trabalhados} max={metrics.totalLeads} tone="accent" />
        </div>
        <DayComparison m={metrics} />
      </section>

      {/* Filtros */}
      <section className="space-y-3">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
          {QUICK_FILTERS.map((q) => (
            <QuickChip key={q.id} active={view.quick === q.id} count={counts[q.id]} onClick={() => setCentral({ quick: q.id })}>
              {q.label}
            </QuickChip>
          ))}
          {counts.duplicados > 0 && (
            <QuickChip active={view.quick === 'duplicados'} count={counts.duplicados} warn onClick={() => setCentral({ quick: 'duplicados' })}>
              <Copy className="size-3" /> Possíveis duplicados
            </QuickChip>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
            <input
              className="input pl-8"
              placeholder="Buscar empresa, telefone, cidade…"
              value={view.search}
              onChange={(e) => setCentral({ search: e.target.value })}
              aria-label="Buscar"
            />
            {view.search && (
              <button onClick={() => setCentral({ search: '' })} className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-4 hover:text-fg" aria-label="Limpar busca">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <FiltersPopover leads={leads} value={view.advanced} onChange={(advanced) => setCentral({ advanced })} />
          <select
            className="input h-8 w-auto cursor-pointer pr-7"
            value={view.sort}
            onChange={(e) => setCentral({ sort: e.target.value as SortKey })}
            aria-label="Ordenar"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="num ml-auto text-xs text-fg-3">
            {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}
          </span>
        </div>
        <ActiveFilterPills value={view.advanced} onChange={(advanced) => setCentral({ advanced })} />
      </section>

      {/* Lista */}
      <section>
        <LeadListHeader />
        <div className="panel overflow-hidden">
          {filtered.length === 0 ? (
            <Empty icon={<Search />} title="Nenhum lead neste filtro">
              Ajuste a busca ou os filtros para ver outros leads.
            </Empty>
          ) : (
            filtered
              .slice(0, limit)
              .map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  next={nextAction(lead, index, today)}
                  calls={index.callsByLead.get(lead.id)}
                  duplicate={dupIds.has(lead.id)}
                  onCallMode={openCallMode}
                />
              ))
          )}
        </div>
        {limit < filtered.length && <div ref={sentinel} className="h-10" />}
      </section>
    </div>
  )
}

function QuickChip({ active, count, onClick, children, warn }: { active: boolean; count: number; onClick: () => void; children: ReactNode; warn?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
        active ? 'bg-fg text-ink' : warn ? 'text-orange-300 hover:bg-orange-400/10' : 'text-fg-2 hover:bg-hover hover:text-fg',
      )}
    >
      {children}
      <span className={clsx('num text-2xs', active ? 'text-ink/60' : 'text-fg-4')}>{count}</span>
    </button>
  )
}
