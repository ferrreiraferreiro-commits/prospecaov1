import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { WEEKDAYS } from '../lib/dates'
import { contactByHour, HOUR_SLOTS, MIN_SAMPLE, rate, slotLabel, type Cell } from '../lib/insights'
import type { Interaction } from '../lib/types'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

/** -1 = linha "todos" (soma de todos os dias), que ganha amostra antes das outras */
const ALL = -1
const dayName = (d: number) => (d === ALL ? 'todos' : WEEKDAYS[d])

/** 5 degraus de um só tom (verde = atenderam): mais escuro/forte = mais gente atendeu. */
const STEPS = [0.12, 0.26, 0.42, 0.6, 0.8]
function stepOf(r: number): number {
  return Math.min(STEPS.length - 1, Math.floor(r * STEPS.length))
}

/**
 * Taxa de atendimento por dia da semana × horário.
 * Célula com poucas ligações aparece só contornada: a taxa ainda não é confiável.
 */
export function BestHours({ interactions, since }: { interactions: Interaction[]; since: string | null }) {
  const stats = useMemo(() => contactByHour(interactions, since), [interactions, since])
  const [hover, setHover] = useState<{ day: number; slot: number } | null>(null)
  const [table, setTable] = useState(false)
  const rows = [ALL, ...stats.days]
  const cellsOf = (d: number) => (d === ALL ? stats.byHour : stats.grid.get(d)!)
  const hoverCell = hover ? cellsOf(hover.day)[hover.slot] : null

  return (
    <section className="panel px-5 py-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">Melhor horário para ligar</h2>
        <span className="text-2xs text-fg-3">% de ligações em que alguém atendeu</span>
        <button onClick={() => setTable((t) => !t)} className="ml-auto text-2xs text-fg-3 hover:text-fg">
          {table ? 'Ver grade' : 'Ver tabela'}
        </button>
      </div>
      <p className="mb-3 text-xs text-fg-2">
        {stats.total.ligacoes === 0 ? (
          'Registre ligações com resultado para descobrir quando as empresas mais atendem.'
        ) : stats.best ? (
          <>
            Melhor até agora:{' '}
            <span className="font-semibold text-go">
              {stats.best.day !== null ? `${WEEKDAYS[stats.best.day]} ` : ''}
              {slotLabel(stats.best.hour)}
            </span>{' '}
            · {pct(stats.best.rate)} atenderam em {stats.best.ligacoes} ligações
          </>
        ) : (
          `Ainda poucas ligações por horário (mínimo ${MIN_SAMPLE} para comparar). Continue registrando.`
        )}
      </p>

      {table ? (
        <table className="num w-full text-xs">
          <thead>
            <tr className="text-2xs text-fg-4">
              <th className="pb-1 text-left font-medium">Horário</th>
              <th className="pb-1 text-right font-medium">Ligações</th>
              <th className="pb-1 text-right font-medium">Atenderam</th>
              <th className="pb-1 text-right font-medium">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {HOUR_SLOTS.map((h, s) => {
              const c = stats.byHour[s]
              return (
                <tr key={h} className="border-t border-line-soft">
                  <td className="py-1 text-fg-2">{slotLabel(h)}</td>
                  <td className="py-1 text-right text-fg">{c.ligacoes}</td>
                  <td className="py-1 text-right text-fg-2">{c.atenderam}</td>
                  <td className="py-1 text-right font-semibold text-fg">{pct(rate(c))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto" onMouseLeave={() => setHover(null)}>
          <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: `32px repeat(${HOUR_SLOTS.length}, minmax(0, 1fr))` }}>
            <span />
            {HOUR_SLOTS.map((h) => (
              <span key={h} className="num pb-1 text-center text-[10px] text-fg-4">
                {slotLabel(h)}
              </span>
            ))}
            {rows.map((day) => (
              <Row key={day} day={day} cells={cellsOf(day)} hover={hover} onHover={setHover} best={stats.best} />
            ))}
          </div>
          {hover && hoverCell && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-raised px-2.5 py-1.5 text-2xs whitespace-nowrap shadow-xl"
              style={{
                left: `calc(32px + (100% - 32px) * ${(hover.slot + 0.5) / HOUR_SLOTS.length})`,
                top: `${18 + rows.indexOf(hover.day) * 30}px`,
              }}
            >
              <p className="text-fg-3">
                {hover.day === ALL ? 'Todos os dias' : WEEKDAYS[hover.day]} · {slotLabel(HOUR_SLOTS[hover.slot])}
              </p>
              <p className="num text-fg">
                {hoverCell.ligacoes ? (
                  <>
                    <span className="font-semibold">{pct(rate(hoverCell))}</span> · {hoverCell.atenderam} de {hoverCell.ligacoes} atenderam
                    {hoverCell.ligacoes < MIN_SAMPLE && <span className="text-fg-3"> (poucas ligações)</span>}
                  </>
                ) : (
                  'Nenhuma ligação'
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {!table && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-fg-3">
          <span className="flex items-center gap-1.5">
            0%
            {STEPS.map((a) => (
              <span key={a} className="h-2.5 w-5 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--color-go) ${a * 100}%, transparent)` }} />
            ))}
            100%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-[3px] border border-dashed border-line-strong" /> menos de {MIN_SAMPLE} ligações
          </span>
        </div>
      )}
    </section>
  )
}

function Row({
  day,
  cells,
  hover,
  onHover,
  best,
}: {
  day: number
  cells: Cell[]
  hover: { day: number; slot: number } | null
  onHover: (h: { day: number; slot: number }) => void
  best: { day: number | null; hour: number } | null
}) {
  return (
    <>
      <span className={clsx('flex items-center text-[10px] font-medium', day === ALL ? 'text-fg-2' : 'text-fg-3')}>{dayName(day)}</span>
      {cells.map((c, s) => {
        const r = rate(c)
        const reliable = r !== null && c.ligacoes >= MIN_SAMPLE
        const isBest = best && (best.day ?? ALL) === day && best.hour === HOUR_SLOTS[s]
        const dim = hover && !(hover.day === day && hover.slot === s)
        return (
          <div
            key={s}
            onMouseEnter={() => onHover({ day, slot: s })}
            className={clsx(
              'num flex h-7 items-center justify-center rounded-[4px] text-[10px] transition-opacity',
              c.ligacoes === 0 && 'bg-tint/[0.025]',
              c.ligacoes > 0 && !reliable && 'border border-dashed border-line-strong text-fg-3',
              reliable && (stepOf(r!) >= 3 ? 'font-semibold text-ink' : 'text-fg'),
              isBest && 'ring-1 ring-go ring-inset',
              dim && 'opacity-60',
            )}
            style={reliable ? { background: `color-mix(in oklab, var(--color-go) ${STEPS[stepOf(r!)] * 100}%, transparent)` } : undefined}
            aria-label={`${dayName(day)} ${slotLabel(HOUR_SLOTS[s])}: ${c.ligacoes ? `${pct(r)} de ${c.ligacoes} ligações` : 'sem ligações'}`}
          >
            {c.ligacoes > 0 ? (reliable ? pct(r) : c.ligacoes) : ''}
          </div>
        )
      })}
    </>
  )
}
