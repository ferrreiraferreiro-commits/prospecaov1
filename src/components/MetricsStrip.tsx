import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Metrics } from '../lib/selectors'
import { Progress } from './ui'

function Cell({ label, value, hint, tone, children, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'gold' | 'go' | 'sky'; children?: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0 bg-panel px-3 py-2.5 sm:px-4 sm:py-3', className)}>
      <div className="text-2xs font-medium text-fg-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={clsx('num text-lg leading-none font-semibold tracking-tight sm:text-[22px]', {
            'text-fg': !tone,
            'text-gold': tone === 'gold',
            'text-go': tone === 'go',
            'text-sky-300': tone === 'sky',
          })}
        >
          {value}
        </span>
        {hint && <span className="truncate text-2xs text-fg-3">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function MetricsStrip({ m, meta }: { m: Metrics; meta: number }) {
  const faltaMeta = Math.max(0, meta - m.hoje.ligacoes)
  return (
    <section className="panel overflow-hidden border-t-gold/40">
      <div className="grid grid-cols-3 gap-px bg-line-soft sm:grid-cols-4 xl:grid-cols-7">
        <Cell label="Leads" value={m.totalLeads} />
        <Cell label="Ligações" value={m.ligacoes} />
        <Cell label="Atenderam" value={m.atenderam} hint={m.taxaContato !== null ? `${Math.round(m.taxaContato * 100)}%` : undefined} />
        <Cell label="Reuniões" value={m.reunioes} tone={m.reunioes ? 'go' : undefined} />
        <Cell label="Retornos" value={m.followupsPendentes} tone={m.followupsHoje ? 'sky' : undefined} hint={m.followupsHoje ? `${m.followupsHoje} para hoje` : undefined} />
        <Cell label="Hoje" value={m.hoje.ligacoes} hint={`/ ${meta} ligações`} tone="gold">
          <Progress value={m.hoje.ligacoes} max={meta} className="mt-2" />
        </Cell>
        <Cell label="Faltam" value={m.naoTrabalhados} hint="não trabalhados" className="col-span-3 sm:col-span-2 xl:col-span-1">
          {faltaMeta > 0 && <div className="mt-1.5 text-2xs text-fg-4">{faltaMeta} ligações para a meta</div>}
        </Cell>
      </div>
    </section>
  )
}

/** Comparação compacta Hoje / Ontem / Total — inspirada no quadro da planilha. */
export function DayComparison({ m }: { m: Metrics }) {
  const rows: { label: string; hoje: number; ontem: number; total: number }[] = [
    { label: 'Ligações', hoje: m.hoje.ligacoes, ontem: m.ontem.ligacoes, total: m.ligacoes },
    { label: 'Atenderam', hoje: m.hoje.atenderam, ontem: m.ontem.atenderam, total: m.atenderam },
    { label: 'Reuniões', hoje: m.hoje.reunioes, ontem: m.ontem.reunioes, total: m.reunioes },
  ]
  return (
    <table className="num w-full text-xs">
      <thead>
        <tr className="text-2xs text-fg-4">
          <th className="pb-1 text-left font-medium" />
          <th className="pb-1 text-right font-medium">Hoje</th>
          <th className="pb-1 text-right font-medium">Ontem</th>
          <th className="pb-1 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-line-soft">
            <td className="py-1 pr-3 text-fg-3">{r.label}</td>
            <td className="py-1 text-right font-semibold text-gold">{r.hoje}</td>
            <td className="py-1 pl-3 text-right text-fg-2">{r.ontem}</td>
            <td className="py-1 pl-3 text-right text-fg">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
