import clsx from 'clsx'
import { Archive, CalendarCheck, CalendarClock, Headphones, PhoneOutgoing, RotateCcw, MapPinned, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { HotTag, QuickActions, StatusMenu } from '../components/leadBits'
import { MeetingResult } from '../components/MeetingResult'
import { useLiguei } from '../components/OutcomeModal'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Progress, SectionTitle, StatusBadge } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { formatDateKeyShort, formatDayLabel, formatLongToday, formatRelative, periodoLabel, timeHM } from '../lib/dates'
import { needsResult } from '../lib/insights'
import { buildTodayPlan, isHot, todayQueue } from '../lib/selectors'
import type { Lead, Meeting } from '../lib/types'
import { useIndex, useMetrics, useToday } from '../store/derived'
import { useHasMotor } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'

export function HojePage() {
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const meta = useApp((s) => s.settings.meta_diaria)
  const maxTentativas = useApp((s) => s.settings.max_tentativas)
  const saveOutcome = useApp((s) => s.saveOutcome)
  const toast = useApp((s) => s.toast)
  const setQueue = useApp((s) => s.setQueue)
  const index = useIndex()
  const metrics = useMetrics()
  const today = useToday()
  const navigate = useNavigate()
  const motor = useHasMotor()
  const setImportOpen = useUi((s) => s.setImportOpen)
  const [novosLimit, setNovosLimit] = useState(15)

  const plan = useMemo(
    () => buildTodayPlan(leads, interactions, index, meetings, today, maxTentativas),
    [leads, interactions, index, meetings, today, maxTentativas],
  )
  // Reuniões que já passaram e ainda não têm resultado (mais antigas primeiro)
  const semResultado = useMemo(() => {
    const byId = new Map(leads.map((l) => [l.id, l]))
    return meetings
      .filter((m) => needsResult(m) && byId.has(m.lead_id))
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((m) => ({ meeting: m, lead: byId.get(m.lead_id)! }))
  }, [meetings, leads, today])
  const encerrar = async (ids: string[]) => {
    for (const id of ids) {
      await saveOutcome({ leadId: id, mode: 'status', status: 'finalizado', observacao: `Encerrado após ${maxTentativas}+ tentativas sem resposta` })
    }
    toast(ids.length === 1 ? 'Lead encerrado.' : `${ids.length} leads encerrados.`)
  }
  const queue = useMemo(() => todayQueue(plan), [plan])

  const feitas = metrics.hoje.ligacoes
  const faltamMeta = Math.max(0, meta - feitas)
  // Meta restante, mas nunca mais do que os leads realmente disponíveis hoje
  const disponiveis = plan.followups.length + plan.tentarNovamente.length + plan.novos.length
  const paraFazer = Math.min(Math.max(faltamMeta, plan.followups.length), disponiveis)

  const start = (leadId?: string) => {
    if (!queue.length && !leadId) return
    setQueue(queue, 'Hoje')
    navigate(`/ligacao/${leadId ?? queue[0]}`)
  }

  if (!leads.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hoje" subtitle={formatLongToday()} />
        <div className="panel">
          <Empty
            icon={<MapPinned />}
            title="Sua lista de hoje aparece aqui"
            action={
              motor ? (
                <Button variant="primary" icon={<MapPinned className="size-3.5" />} onClick={() => navigate('/maps')}>
                  Buscar leads
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setImportOpen(true)}>
                  Adicionar leads
                </Button>
              )
            }
          >
            {motor ? 'Busque empresas no Maps para montar a fila de ligações do dia.' : 'Adicione seus leads para montar a fila de ligações do dia.'}
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hoje"
        subtitle={<span className="inline-block first-letter:uppercase">{formatLongToday()}</span>}
        actions={
          <Button variant="primary" size="lg" icon={<Headphones className="size-4" />} onClick={() => start()} disabled={!queue.length}>
            Começar ligações
          </Button>
        }
      />

      {/* Resumo do dia */}
      <section className="panel border-t-gold/40 px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[28px] leading-8 font-semibold tracking-[-0.02em]">
              <span className="num text-gold">{paraFazer}</span>{' '}
              <span className="text-fg">{paraFazer === 1 ? 'ligação' : 'ligações'} para fazer hoje</span>
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-3">
              <Count n={plan.followups.length} label="retornos" tone="text-sky-300" />
              <Count n={plan.reunioesHoje.length} label="reuniões" tone="text-emerald-300" />
              <Count n={plan.tentarNovamente.length} label="para tentar de novo" />
              <Count n={plan.novos.length} label="novos disponíveis" />
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-fg-3">Meta do dia</span>
              <span className="num">
                <span className="font-semibold text-fg">{feitas}</span>
                <span className="text-fg-3"> / {meta}</span>
                <span className="ml-2 text-fg-3">{faltamMeta > 0 ? `faltam ${faltamMeta}` : 'meta batida'}</span>
              </span>
            </div>
            <Progress value={feitas} max={meta} tone={faltamMeta ? 'gold' : 'go'} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Block title="Retornos" count={plan.followups.length} icon={<CalendarClock className="size-3.5 text-sky-300" />}>
            {plan.followups.length === 0 ? (
              <EmptyLine>Nenhum retorno para hoje.</EmptyLine>
            ) : (
              plan.followups.map(({ lead, followup, atrasado }) => (
                <TodayRow
                  key={lead.id}
                  lead={lead}
                  onCallMode={() => start(lead.id)}
                  aside={
                    <span className={clsx('num text-xs font-medium', atrasado ? 'text-orange-300' : 'text-sky-300')}>
                      {atrasado ? `Atrasado · ${formatDayLabel(followup.data)}` : followup.horario ?? periodoLabel(followup.periodo)}
                    </span>
                  }
                  note={followup.observacao}
                />
              ))
            )}
          </Block>

          <Block title="Tentar novamente" count={plan.tentarNovamente.length} icon={<RotateCcw className="size-3.5 text-yellow-200/70" />}>
            {plan.tentarNovamente.length === 0 ? (
              <EmptyLine>Ninguém pendente de nova tentativa.</EmptyLine>
            ) : (
              plan.tentarNovamente.slice(0, 30).map(({ lead, tentativas, ultima }) => (
                <TodayRow
                  key={lead.id}
                  lead={lead}
                  onCallMode={() => start(lead.id)}
                  aside={
                    <span className="text-2xs text-fg-3">
                      {tentativas} {tentativas === 1 ? 'tentativa' : 'tentativas'}
                      {ultima && <span className="text-fg-4"> · {formatRelative(ultima)}</span>}
                    </span>
                  }
                  showStatus
                />
              ))
            )}
            {plan.tentarNovamente.length > 30 && <MoreLine>+{plan.tentarNovamente.length - 30} na fila</MoreLine>}
          </Block>

          {plan.esgotados.length > 0 && (
            <Block
              title="Sugestão: encerrar"
              count={plan.esgotados.length}
              icon={<Archive className="size-3.5 text-orange-300" />}
              right={
                <Button size="xs" variant="ghost" onClick={() => encerrar(plan.esgotados.map((e) => e.lead.id))}>
                  Encerrar todos
                </Button>
              }
            >
              <p className="border-b border-line-soft px-4 py-2 text-2xs text-fg-3">
                {maxTentativas} ou mais tentativas seguidas sem resposta. Saíram da fila — encerre ou ligue mais uma vez se quiser.
              </p>
              {plan.esgotados.slice(0, 20).map(({ lead, tentativas, ultima }) => (
                <TodayRow
                  key={lead.id}
                  lead={lead}
                  onCallMode={() => start(lead.id)}
                  aside={
                    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-2xs text-fg-3">
                        {tentativas} tentativas{ultima && <span className="text-fg-4"> · {formatRelative(ultima)}</span>}
                      </span>
                      <Button size="xs" variant="subtle" onClick={() => encerrar([lead.id])}>
                        Encerrar
                      </Button>
                    </span>
                  }
                />
              ))}
              {plan.esgotados.length > 20 && <MoreLine>+{plan.esgotados.length - 20}</MoreLine>}
            </Block>
          )}

          <Block title="Novos para ligar" count={plan.novos.length} icon={<Sparkles className="size-3.5 text-fg-3" />}>
            {plan.novos.length === 0 ? (
              <EmptyLine>Todos os leads já foram trabalhados. Importe mais quando quiser.</EmptyLine>
            ) : (
              plan.novos.slice(0, novosLimit).map((lead) => <TodayRow key={lead.id} lead={lead} onCallMode={() => start(lead.id)} />)
            )}
            {plan.novos.length > novosLimit && (
              <button onClick={() => setNovosLimit((n) => n + 30)} className="w-full border-t border-line-soft py-2.5 text-xs text-fg-3 hover:bg-tint/[0.02] hover:text-fg">
                Mostrar mais {Math.min(30, plan.novos.length - novosLimit)} de {plan.novos.length - novosLimit}
              </button>
            )}
          </Block>
        </div>

        <div className="space-y-5">
          {semResultado.length > 0 && (
            <Block title="Como foram as reuniões?" count={semResultado.length} icon={<CalendarCheck className="size-3.5 text-gold" />}>
              {semResultado.map(({ lead, meeting }) => (
                <ResultLine key={meeting.id} lead={lead} meeting={meeting} />
              ))}
            </Block>
          )}

          <Block title="Reuniões" count={plan.reunioesHoje.length} icon={<CalendarCheck className="size-3.5 text-emerald-300" />}>
            {plan.reunioesHoje.length === 0 && plan.proximasReunioes.length === 0 && <EmptyLine>Nenhuma reunião marcada.</EmptyLine>}
            {plan.reunioesHoje.map(({ lead, meeting }) => (
              <MeetingLine key={meeting.id} lead={lead} when={meeting.horario ?? 'hoje'} who={meeting.contato} note={meeting.observacao} highlight />
            ))}
            {plan.proximasReunioes.length > 0 && (
              <>
                <p className="border-t border-line-soft px-4 pt-2.5 pb-1 text-2xs font-medium text-fg-4">Próximos 7 dias</p>
                {plan.proximasReunioes.map(({ lead, meeting }) => (
                  <MeetingLine
                    key={meeting.id}
                    lead={lead}
                    when={`${formatDayLabel(meeting.data)}${meeting.horario ? ` ${meeting.horario}` : ''}`}
                    who={meeting.contato}
                    note={meeting.observacao}
                  />
                ))}
              </>
            )}
          </Block>

          <Block title="Feitas hoje" count={plan.feitasHoje.length} icon={<PhoneOutgoing className="size-3.5 text-go" />}>
            {plan.feitasHoje.length === 0 ? (
              <EmptyLine>Nenhuma ligação ainda hoje.</EmptyLine>
            ) : (
              <ul className="max-h-[420px] overflow-y-auto">
                {plan.feitasHoje.map(({ lead, call }) => (
                  <FeitaLine key={call.id} lead={lead} time={timeHM(new Date(call.created_at))} status={call.status} callId={call.id} falei={call.falei_com} />
                ))}
              </ul>
            )}
          </Block>
        </div>
      </div>
    </div>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <span>
      <span className={clsx('num font-semibold', n ? tone ?? 'text-fg' : 'text-fg-3')}>{n}</span> {label}
    </span>
  )
}

function Block({ title, count, icon, children, right }: { title: string; count: number; icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
        {icon}
        <SectionTitle count={count}>{title}</SectionTitle>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-xs text-fg-4">{children}</p>
}

function MoreLine({ children }: { children: ReactNode }) {
  return <p className="border-t border-line-soft px-4 py-2 text-2xs text-fg-4">{children}</p>
}

function TodayRow({ lead, aside, note, showStatus, onCallMode }: { lead: Lead; aside?: ReactNode; note?: string | null; showStatus?: boolean; onCallMode: () => void }) {
  const liguei = useLiguei()
  const openLead = useUi((s) => s.openLead)
  return (
    <div
      onClick={() => openLead(lead.id)}
      className="group flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-4 py-2.5 last:border-0 hover:bg-tint/[0.022]"
    >
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold">{lead.empresa}</span>
          {isHot(lead) ? <HotTag lead={lead} /> : !lead.website && <span className="shrink-0 text-2xs font-medium text-gold/80">sem site</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-fg-3">
          <span className="num text-fg-2">{lead.telefone ? formatPhone(lead.telefone) : 'Sem telefone'}</span>
          {lead.nicho && ` · ${lead.nicho}`}
          {lead.cidade && ` · ${lead.cidade}`}
        </div>
        {note && <p className="mt-0.5 truncate text-2xs text-fg-3">“{note}”</p>}
      </div>
      {showStatus && (
        <div onClick={(e) => e.stopPropagation()}>
          <StatusMenu lead={lead} />
        </div>
      )}
      {aside && <div className="shrink-0">{aside}</div>}
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <QuickActions lead={lead} className="hidden sm:flex" />
        <button onClick={onCallMode} className="inline-flex size-7 items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" title="Abrir no Modo Ligação" aria-label="Abrir no Modo Ligação">
          <Headphones className="size-[15px]" />
        </button>
        <Button size="sm" variant="secondary" className="border-go/25 text-go hover:border-go/40 hover:bg-go/10" icon={<PhoneOutgoing className="size-3.5" />} onClick={() => liguei(lead.id)}>
          Liguei
        </Button>
      </div>
    </div>
  )
}

function ResultLine({ lead, meeting }: { lead: Lead; meeting: Meeting }) {
  const openLead = useUi((s) => s.openLead)
  return (
    <div className="border-b border-line-soft px-4 py-2.5 last:border-0">
      <button onClick={() => openLead(lead.id)} className="flex w-full items-baseline gap-2 text-left">
        <span className="num shrink-0 text-2xs text-fg-3">
          {formatDateKeyShort(meeting.data)}
          {meeting.horario && ` ${meeting.horario}`}
        </span>
        <span className="truncate text-xs font-medium text-fg hover:underline">{lead.empresa}</span>
      </button>
      <div className="mt-1.5">
        <MeetingResult meeting={meeting} compact />
      </div>
    </div>
  )
}

function MeetingLine({ lead, when, who, note, highlight }: { lead: Lead; when: string; who: string | null; note: string | null; highlight?: boolean }) {
  const openLead = useUi((s) => s.openLead)
  return (
    <button onClick={() => openLead(lead.id)} className="flex w-full items-start gap-3 border-b border-line-soft px-4 py-2.5 text-left last:border-0 hover:bg-tint/[0.022]">
      <span className={clsx('num mt-px w-16 shrink-0 text-xs font-semibold', highlight ? 'text-emerald-300' : 'text-fg-2')}>{when}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-fg">{lead.empresa}</span>
        {(who || note) && (
          <span className="block truncate text-2xs text-fg-3">
            {who && `com ${who}`}
            {who && note && ' · '}
            {note}
          </span>
        )}
      </span>
    </button>
  )
}

function FeitaLine({ lead, time, status, callId, falei }: { lead: Lead; time: string; status: Lead['status'] | null; callId: string; falei: string | null }) {
  const openLead = useUi((s) => s.openLead)
  const openOutcome = useUi((s) => s.openOutcome)
  return (
    <li className="flex items-center gap-3 border-b border-line-soft px-4 py-2 last:border-0">
      <span className="num w-10 shrink-0 text-2xs text-fg-3">{time}</span>
      <button onClick={() => openLead(lead.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium hover:underline">{lead.empresa}</span>
        {falei && <span className="block truncate text-2xs text-fg-3">com {falei}</span>}
      </button>
      {status ? (
        <StatusBadge status={status} />
      ) : (
        <button onClick={() => openOutcome({ leadId: lead.id, mode: 'call', callId, presetStatus: null })} className="rounded bg-gold/10 px-1.5 text-2xs leading-5 font-medium text-gold hover:bg-gold/20">
          Sem resultado
        </button>
      )}
    </li>
  )
}
