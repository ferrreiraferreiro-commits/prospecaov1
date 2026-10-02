import clsx from 'clsx'
import { SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { countAdvanced, EMPTY_ADVANCED, type AdvancedFilters } from '../lib/selectors'
import { getStatus2Options } from '../lib/status2'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button, Popover, Segmented } from './ui'

function uniqueSorted(values: (string | null)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function FiltersPopover({ leads, value, onChange }: { leads: Lead[]; value: AdvancedFilters; onChange: (v: AdvancedFilters) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const count = countAdvanced(value)
  const cidades = useMemo(() => uniqueSorted(leads.map((l) => l.cidade)), [leads])
  const nichos = useMemo(() => uniqueSorted(leads.map((l) => l.nicho)), [leads])
  const pastas = useMemo(() => uniqueSorted(leads.map((l) => l.pasta)), [leads])
  const settings = useApp((s) => s.settings)
  const status2 = useMemo(() => {
    const base = getStatus2Options(settings)
    const extra = uniqueSorted(leads.map((l) => l.status2 ?? null)).filter((v) => !base.includes(v))
    return [...base, ...extra]
  }, [settings, leads])
  const set = (patch: Partial<AdvancedFilters>) => onChange({ ...value, ...patch })

  const toggle = (active: boolean) =>
    clsx(
      'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
      active ? 'border-accent/40 bg-accent/10 text-blue-200' : 'border-line bg-ink text-fg-2 hover:text-fg',
    )

  return (
    <>
      <Button ref={ref} variant="secondary" onClick={() => setOpen((o) => !o)} icon={<SlidersHorizontal className="size-3.5" />}>
        Filtros
        {count > 0 && <span className="num rounded bg-accent/20 px-1 text-2xs leading-4 text-blue-200">{count}</span>}
      </Button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={300} align="end">
        <div className="space-y-3 p-2.5">
          <div>
            <p className="label">Contato disponível</p>
            <div className="flex gap-1.5">
              <button className={toggle(value.whatsapp)} onClick={() => set({ whatsapp: !value.whatsapp })}>
                Com WhatsApp
              </button>
              <button className={toggle(value.instagram)} onClick={() => set({ instagram: !value.instagram })}>
                Com Instagram
              </button>
            </div>
          </div>
          <div>
            <p className="label">Site</p>
            <Segmented
              value={value.site}
              onChange={(site) => set({ site })}
              options={[
                { id: 'todos', label: 'Todos' },
                { id: 'sem', label: 'Sem site' },
                { id: 'com', label: 'Com site' },
              ]}
            />
          </div>
          <Select label="Cidade" value={value.cidade} options={cidades} onChange={(cidade) => set({ cidade })} />
          <Select label="Nicho" value={value.nicho} options={nichos} onChange={(nicho) => set({ nicho })} />
          <Select label="Pasta" value={value.pasta} options={pastas} onChange={(pasta) => set({ pasta })} />
          <div>
            <p className="label">Status 2</p>
            <select className="input cursor-pointer" value={value.status2} onChange={(e) => set({ status2: e.target.value })}>
              <option value="">Todos</option>
              <option value="__vazio__">Sem Status 2</option>
              {status2.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="label">Avaliação Google mínima</p>
            <Segmented
              value={String(value.avaliacaoMin)}
              onChange={(v) => set({ avaliacaoMin: Number(v) })}
              options={[
                { id: '0', label: 'Qualquer' },
                { id: '4', label: '4+' },
                { id: '4.5', label: '4,5+' },
                { id: '4.8', label: '4,8+' },
              ]}
            />
          </div>
          {count > 0 && (
            <button onClick={() => onChange({ ...EMPTY_ADVANCED })} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
              <X className="size-3" /> Limpar filtros
            </button>
          )}
        </div>
      </Popover>
    </>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="label">{label}</p>
      <select className="input cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} disabled={!options.length}>
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Pílulas removíveis dos filtros avançados ativos. */
export function ActiveFilterPills({ value, onChange }: { value: AdvancedFilters; onChange: (v: AdvancedFilters) => void }) {
  const pills: { label: string; clear: Partial<AdvancedFilters> }[] = []
  if (value.whatsapp) pills.push({ label: 'Com WhatsApp', clear: { whatsapp: false } })
  if (value.instagram) pills.push({ label: 'Com Instagram', clear: { instagram: false } })
  if (value.site !== 'todos') pills.push({ label: value.site === 'sem' ? 'Sem site' : 'Com site', clear: { site: 'todos' } })
  if (value.cidade) pills.push({ label: value.cidade, clear: { cidade: '' } })
  if (value.nicho) pills.push({ label: value.nicho, clear: { nicho: '' } })
  if (value.pasta) pills.push({ label: `Pasta: ${value.pasta}`, clear: { pasta: '' } })
  if (value.status2) pills.push({ label: value.status2 === '__vazio__' ? 'Sem Status 2' : `Status 2: ${value.status2}`, clear: { status2: '' } })
  if (value.avaliacaoMin > 0) pills.push({ label: `${String(value.avaliacaoMin).replace('.', ',')}+ ★`, clear: { avaliacaoMin: 0 } })
  if (!pills.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange({ ...value, ...p.clear })}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/25 bg-accent/[0.07] pr-1.5 pl-2 text-2xs font-medium text-blue-200 hover:bg-accent/15"
        >
          {p.label}
          <X className="size-3 opacity-70" />
        </button>
      ))}
    </div>
  )
}
