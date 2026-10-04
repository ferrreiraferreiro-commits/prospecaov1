import clsx from 'clsx'
import { RotateCcw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BestHours } from '../components/BestHours'
import { PageHeader } from '../components/PageHeader'
import { Button, Modal, Progress, StatusDot } from '../components/ui'
import { formatDateKeyShort, formatDateTime, WEEKDAYS } from '../lib/dates'
import { formatMoney, meetingStats } from '../lib/insights'
import { getActiveRoteiro, getRoteiros } from '../lib/script'
import { callsPerDay, statsByRoteiro } from '../lib/selectors'
import { STATUSES } from '../lib/statuses'
import { useMetrics, useToday } from '../store/derived'
import { useApp } from '../store/useApp'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

export function StatsPage() {
  const m = useMetrics()
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const today = useToday()
  const [metaDraft, setMetaDraft] = useState(String(settings.meta_diaria))
  const since = settings.metricas_desde
  const [confirmReset, setConfirmReset] = useState(false)
  const days = useMemo(() => callsPerDay(interactions, 14, today, since), [interactions, today, since])
  const roteiros = getRoteiros(settings)
  const porRoteiro = useMemo(
    () => statsByRoteiro(interactions, getRoteiros(settings)[0].id, since).sort((a, b) => b.ligacoes - a.ligacoes),
    [interactions, settings, since],
  )
  const ativoId = getActiveRoteiro(settings).id
  const vendas = useMemo(() => meetingStats(meetings, since), [meetings, since])

  const resetCounters = async () => {
    await saveSettings({ ...settings, metricas_desde: new Date().toISOString() })
    setConfirmReset(false)
    useApp.getState().toast('Contadores zerados. O histórico dos leads continua guardado.')
  }
  const faltam = Math.max(0, settings.meta_diaria - m.hoje.ligacoes)

  const commitMeta = () => {
    const n = Math.max(1, Math.min(999, Math.round(Number(metaDraft) || 0)))
    setMetaDraft(String(n))
    if (n !== settings.meta_diaria) void saveSettings({ ...settings, meta_diaria: n })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Números"
        subtitle="Números que ajudam a ajustar o ritmo — sem enfeite."
        actions={
          <Button variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>
            Zerar contadores
          </Button>
        }
      />

      {since && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent/20 bg-accent/[0.05] px-4 py-2.5 text-xs">
          <span className="text-fg-2">
            Contando desde <span className="num font-medium text-fg">{formatDateTime(since)}</span>. Ligações anteriores continuam no histórico de cada lead.
          </span>
          <button onClick={() => saveSettings({ ...settings, metricas_desde: null })} className="ml-auto text-blue-300 hover:text-blue-200">
            Voltar a contar tudo
          </button>
        </div>
      )}

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Zerar contadores?"
        footer={
          <>
            <Button variant="ghost" className="ml-auto" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={resetCounters}>
              Zerar agora
            </Button>
          </>
        }
      >
        <div className="space-y-2 px-5 py-4 text-xs leading-5 text-fg-2">
          <p>Ligações, atenderam, reuniões, taxas e a contagem de hoje voltam para zero e passam a contar a partir de agora.</p>
          <p className="text-fg-3">
            Nada é apagado: o histórico de cada lead, os retornos e as reuniões continuam guardados. Leads trabalhados e status não mudam. Dá para desfazer
            depois com “Voltar a contar tudo”.
          </p>
        </div>
      </Modal>

      {/* Meta */}
      <section className="panel border-t-gold/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <label className="flex items-center gap-2 text-xs text-fg-2">
            Meta de ligações por dia
            <input
              type="number"
              min={1}
              max={999}
              className="input num h-8 w-20 text-center"
              value={metaDraft}
              onChange={(e) => setMetaDraft(e.target.value)}
              onBlur={commitMeta}
              onKeyDown={(e) => e.key === 'Enter' && commitMeta()}
            />
          </label>
          <div className="min-w-[220px] flex-1">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="num">
                <span className="text-lg font-semibold text-gold">{m.hoje.ligacoes}</span>
                <span className="text-fg-3"> / {settings.meta_diaria} hoje</span>
              </span>
              <span className={faltam ? 'text-fg-2' : 'text-go'}>{faltam ? `Faltam ${faltam}` : 'Meta batida'}</span>
            </div>
            <Progress value={m.hoje.ligacoes} max={settings.meta_diaria} tone={faltam ? 'gold' : 'go'} />
          </div>
        </div>
      </section>

      {/* Taxas */}
      <div className="grid gap-5 md:grid-cols-2">
        <Rate title="Taxa de contato" value={pct(m.taxaContato)} detail={`${m.atenderam} ${m.atenderam === 1 ? 'contato' : 'contatos'} / ${m.ligacoes} ${m.ligacoes === 1 ? 'ligação' : 'ligações'}`} ratio={m.taxaContato} />
        <Rate title="Taxa de reunião" value={pct(m.taxaReuniao)} detail={`${m.reunioes} ${m.reunioes === 1 ? 'reunião' : 'reuniões'} / ${m.atenderam} ${m.atenderam === 1 ? 'contato' : 'contatos'}`} ratio={m.taxaReuniao} tone="go" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* Números */}
          <section className="panel px-5 py-4">
            <h2 className="mb-2 text-[13px] font-semibold">Resumo</h2>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              <Stat label="Total de leads" value={m.totalLeads} />
              <Stat label="Total de ligações" value={m.ligacoes} />
              <Stat label="Leads trabalhados" value={m.trabalhados} />
              <Stat label="Ligações hoje" value={m.hoje.ligacoes} strong />
              <Stat label="Não trabalhados" value={m.naoTrabalhados} />
              <Stat label="Ligações ontem" value={m.ontem.ligacoes} />
              <Stat label="Pessoas que atenderam" value={m.atenderam} />
              <Stat label="Retornos pendentes" value={m.followupsPendentes} />
              <Stat label="Reuniões" value={m.reunioes} />
              <Stat label="Não interessados" value={m.naoInteressados} />
              <Stat label="Números incorretos" value={m.numerosIncorretos} />
            </dl>
          </section>

          <CallsChart days={days} today={today} />

          <BestHours interactions={interactions} since={since} />

          <section className="panel px-5 py-4">
            <h2 className="mb-1 text-[13px] font-semibold">Reuniões e vendas</h2>
            <p className="mb-3 text-2xs text-fg-3">
              Registre como foi cada reunião (na ficha do lead) para ver quantas viram venda.
              {vendas.semResultado > 0 && <span className="text-gold"> {vendas.semResultado} sem resultado registrado.</span>}
            </p>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <div>
                <p className="text-2xs text-fg-3">Faturado</p>
                <p className="num text-[24px] leading-8 font-semibold tracking-tight text-gold">{formatMoney(vendas.faturamento)}</p>
              </div>
              <div>
                <p className="text-2xs text-fg-3">Taxa de fechamento</p>
                <p className="num text-[24px] leading-8 font-semibold tracking-tight">{pct(vendas.taxaFechamento)}</p>
              </div>
              <div>
                <p className="text-2xs text-fg-3">Ticket médio</p>
                <p className="num text-[24px] leading-8 font-semibold tracking-tight">{vendas.ticketMedio === null ? '—' : formatMoney(vendas.ticketMedio)}</p>
              </div>
            </div>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              <Stat label="Reuniões agendadas" value={vendas.agendadas} />
              <Stat label="Realizadas" value={vendas.realizadas} />
              <Stat label="Fecharam" value={vendas.fechadas} strong />
              <Stat label="Não compareceram" value={vendas.naoCompareceu} />
              <Stat label="Comparecimento" value={pct(vendas.taxaComparecimento)} />
              <Stat label="Sem resultado" value={vendas.semResultado} />
            </dl>
          </section>

          <section className="panel px-5 py-4">
            <h2 className="mb-1 text-[13px] font-semibold">Desempenho por roteiro</h2>
            <p className="mb-3 text-2xs text-fg-3">Cada ligação guarda o roteiro que estava em uso. Compare para ver qual funciona melhor.</p>
            {porRoteiro.length === 0 ? (
              <p className="text-xs text-fg-4">Nenhuma ligação registrada ainda.</p>
            ) : (
              <table className="num w-full text-xs">
                <thead>
                  <tr className="text-2xs text-fg-4">
                    <th className="pb-1.5 text-left font-medium">Roteiro</th>
                    <th className="pb-1.5 text-right font-medium">Ligações</th>
                    <th className="pb-1.5 text-right font-medium">Atenderam</th>
                    <th className="pb-1.5 text-right font-medium">Reuniões</th>
                    <th className="pb-1.5 text-right font-medium">Reunião / contato</th>
                  </tr>
                </thead>
                <tbody>
                  {porRoteiro.map((r) => {
                    const nome = roteiros.find((x) => x.id === r.roteiroId)?.nome ?? 'Roteiro excluído'
                    return (
                      <tr key={r.roteiroId} className="border-t border-line-soft">
                        <td className="py-1.5 pr-3 text-fg">
                          {nome}
                          {r.roteiroId === ativoId && <span className="ml-1.5 rounded bg-go/15 px-1 text-[10px] text-go">em uso</span>}
                        </td>
                        <td className="py-1.5 text-right">{r.ligacoes}</td>
                        <td className="py-1.5 text-right text-fg-2">
                          {r.atenderam} <span className="text-fg-4">({pct(r.taxaContato)})</span>
                        </td>
                        <td className="py-1.5 text-right text-fg-2">{r.reunioes}</td>
                        <td className="py-1.5 text-right font-semibold text-fg">{pct(r.taxaReuniao)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Por status */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-[13px] font-semibold">Leads por status</h2>
          <ul className="space-y-2">
            {STATUSES.map((s) => {
              const n = m.porStatus[s.id] ?? 0
              return (
                <li key={s.id} className="grid grid-cols-[150px_1fr_32px] items-center gap-3 text-xs">
                  <span className="flex items-center gap-2 truncate text-fg-2">
                    <StatusDot status={s.id} /> {s.label}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-tint/[0.04]">
                    <span className="block h-full rounded-full bg-fg-3/60" style={{ width: `${m.totalLeads ? (n / m.totalLeads) * 100 : 0}%` }} />
                  </span>
                  <span className={clsx('num text-right', n ? 'text-fg' : 'text-fg-4')}>{n}</span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Rate({ title, value, detail, ratio, tone = 'accent' }: { title: string; value: string; detail: string; ratio: number | null; tone?: 'accent' | 'go' }) {
  return (
    <section className="panel px-5 py-4">
      <p className="text-xs text-fg-3">{title}</p>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="num text-[28px] leading-9 font-semibold tracking-tight">{value}</span>
        <span className="num text-xs text-fg-2">{detail}</span>
      </div>
      <Progress value={(ratio ?? 0) * 100} max={100} tone={tone} className="mt-2" />
    </section>
  )
}

function Stat({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft py-2 text-xs">
      <dt className="text-fg-3">{label}</dt>
      <dd className={clsx('num font-semibold', strong ? 'text-gold' : 'text-fg')}>{value}</dd>
    </div>
  )
}

/** Barras simples (uma série): ligações por dia nos últimos 14 dias. Contatos no tooltip e na tabela. */
function CallsChart({ days, today }: { days: { data: string; ligacoes: number; atenderam: number }[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...days.map((d) => d.ligacoes))
  const total = days.reduce((a, d) => a + d.ligacoes, 0)
  const weekday = (key: string) => {
    const [y, mo, d] = key.split('-').map(Number)
    return WEEKDAYS[new Date(y, mo - 1, d).getDay()]
  }

  return (
    <section className="panel px-5 py-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">Ligações por dia</h2>
        <span className="text-2xs text-fg-3">últimos 14 dias · {total} no total</span>
        <button onClick={() => setTable((t) => !t)} className="ml-auto text-2xs text-fg-3 hover:text-fg">
          {table ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {table ? (
        <table className="num w-full text-xs">
          <thead>
            <tr className="text-2xs text-fg-4">
              <th className="pb-1 text-left font-medium">Dia</th>
              <th className="pb-1 text-right font-medium">Ligações</th>
              <th className="pb-1 text-right font-medium">Atenderam</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.data} className="border-t border-line-soft">
                <td className="py-1 text-fg-2">
                  {weekday(d.data)} {formatDateKeyShort(d.data)}
                </td>
                <td className="py-1 text-right text-fg">{d.ligacoes}</td>
                <td className="py-1 text-right text-fg-2">{d.atenderam}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex h-28 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <div key={d.data} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <div
                  className={clsx(
                    'w-full rounded-t-[4px] transition-opacity',
                    d.ligacoes ? 'bg-gold' : 'bg-transparent',
                    hover !== null && hover !== i && 'opacity-45',
                  )}
                  style={{ height: `${(d.ligacoes / max) * 100}%`, minHeight: d.ligacoes ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-[10px] text-fg-4">
            {days.map((d, i) => (
              <span key={d.data} className={clsx('num flex-1 text-center', d.data === today && 'font-semibold text-fg-2', i % 2 === 1 && d.data !== today && 'max-sm:invisible')}>
                {d.data === today ? 'hoje' : formatDateKeyShort(d.data).slice(0, 2)}
              </span>
            ))}
          </div>
          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-raised px-2.5 py-1.5 text-2xs whitespace-nowrap shadow-xl"
              style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
            >
              <p className="text-fg-3">
                {weekday(days[hover].data)} {formatDateKeyShort(days[hover].data)}
              </p>
              <p className="num text-fg">
                <span className="font-semibold">{days[hover].ligacoes}</span> ligações · {days[hover].atenderam} atenderam
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
