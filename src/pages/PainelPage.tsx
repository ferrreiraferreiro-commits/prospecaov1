import clsx from 'clsx'
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CalendarClock,
  FolderKanban,
  Headphones,
  MapPinned,
  PhoneCall,
  Send,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Stat } from '../components/kit'
import { Avatar } from '../components/Avatar'
import { Progress } from '../components/ui'
import { monthKey, PROJECT_STATUS, projectProgress, summarize } from '../lib/biz'
import { formatDayLabel, formatLongToday, periodoLabel } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { saudacao } from '../lib/messages'
import { useMotor } from '../lib/motor'
import { useHasMotor } from '../store/useAccount'
import { buildTodayPlan, todayQueue } from '../lib/selectors'
import type { StatusId } from '../lib/types'
import { useIndex, useMetrics, useToday } from '../store/derived'
import { useApp } from '../store/useApp'
import { useBiz } from '../store/useBiz'
import { useUi } from '../store/useUi'

/** Etapas do funil de prospecção, agrupando os status do lead. */
const STAGES: { label: string; statuses: StatusId[] }[] = [
  { label: 'Novos', statuses: ['novo'] },
  { label: 'Tentando contato', statuses: ['so_chama', 'nao_atendeu', 'nao_completou'] },
  { label: 'Em conversa', statuses: ['falei_responsavel', 'pediu_whatsapp', 'follow_up', 'cliente_potencial'] },
  { label: 'Reunião marcada', statuses: ['agendou_reuniao'] },
]

export function PainelPage() {
  const settings = useApp((s) => s.settings)
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const setQueue = useApp((s) => s.setQueue)
  const openLead = useUi((s) => s.openLead)
  const metrics = useMetrics()
  const index = useIndex()
  const today = useToday()
  const navigate = useNavigate()

  const clients = useBiz((s) => s.clients)
  const projects = useBiz((s) => s.projects)
  const transactions = useBiz((s) => s.transactions)
  const payments = useBiz((s) => s.client_payments)
  const motorOnline = useMotor((s) => s.online)
  const wa = useMotor((s) => s.health?.whatsapp)
  const motor = useHasMotor()

  const plan = useMemo(
    () => buildTodayPlan(leads, interactions, index, meetings, today, settings.max_tentativas),
    [leads, interactions, index, meetings, today, settings.max_tentativas],
  )
  const fin = useMemo(() => summarize(transactions, payments, today.slice(0, 7)), [transactions, payments, today])
  const ativos = projects.filter((p) => ['planejamento', 'em_andamento', 'revisao'].includes(p.status))
  const clientesAtivos = clients.filter((c) => !c.arquivado)
  const recorrente = clientesAtivos.filter((c) => c.tipo === 'fixo').reduce((s, c) => s + (c.valor_mensal ?? 0), 0)
  const fechadasMes = meetings.filter((m) => m.resultado === 'fechou' && m.resultado_em && monthKey(m.resultado_em) === today.slice(0, 7))
  const nome = settings.nome_vendedor.trim().split(/\s+/)[0]

  const stageCounts = STAGES.map((st) => ({ ...st, n: st.statuses.reduce((s, id) => s + (metrics.porStatus[id] ?? 0), 0) }))
  const stageMax = Math.max(1, ...stageCounts.map((s) => s.n))
  const queue = todayQueue(plan)

  function startCalls() {
    if (queue.length) setQueue(queue, 'Hoje')
    navigate('/ligacao')
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar src={settings.avatar} name={settings.nome_vendedor || 'Você'} size={44} className="hidden sm:inline-flex" />
          <div className="min-w-0">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] sm:text-2xl">
              {saudacao()}
              {nome ? `, ${nome}` : ''}
            </h1>
            <p className="mt-0.5 text-xs text-fg-3 first-letter:uppercase">{formatLongToday()}</p>
          </div>
        </div>
        <button
          onClick={startCalls}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:w-auto text-sm font-semibold text-white transition-colors hover:bg-[#3b7bf6]"
        >
          <Headphones className="size-4" /> Começar ligações
          {queue.length > 0 && <span className="num rounded bg-white/20 px-1.5 text-xs">{queue.length}</span>}
        </button>
      </header>

      {/* Meta do dia */}
      <section className="panel overflow-hidden">
        <div className="grid grid-cols-3 divide-line-soft sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:divide-x">
          <div className="col-span-3 px-4 py-3.5 sm:col-span-1">
            <div className="flex items-baseline justify-between">
              <p className="text-2xs font-medium text-fg-3">Ligações hoje</p>
              <p className="num text-2xs text-fg-4">meta {settings.meta_diaria}</p>
            </div>
            <p className="num mt-1 text-2xl font-semibold tracking-[-0.02em]">
              {metrics.hoje.ligacoes}
              <span className="text-base text-fg-4"> / {settings.meta_diaria}</span>
            </p>
            <Progress value={metrics.hoje.ligacoes} max={settings.meta_diaria} tone={metrics.hoje.ligacoes >= settings.meta_diaria ? 'go' : 'accent'} className="mt-2" />
          </div>
          <MiniStat label="Atenderam hoje" value={metrics.hoje.atenderam} hint={metrics.taxaContato !== null ? `${Math.round(metrics.taxaContato * 100)}% de contato geral` : undefined} />
          <MiniStat label="Retornos para hoje" value={plan.followups.length} hint={plan.followups.some((f) => f.atrasado) ? `${plan.followups.filter((f) => f.atrasado).length} atrasado(s)` : 'em dia'} warn={plan.followups.some((f) => f.atrasado)} />
          <MiniStat label="Reuniões hoje" value={plan.reunioesHoje.length} hint={`${plan.proximasReunioes.length} próximas`} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Recebido no mês" value={formatMoney(fin.receitas)} tone="go" icon={<BadgeDollarSign />} hint={`Saldo ${formatMoney(fin.saldo)}`} />
        <Stat label="A receber" value={formatMoney(fin.aReceber)} tone="gold" hint={`${payments.filter((p) => p.status === 'pendente').length} pagamento(s) pendente(s)`} />
        <Stat label="Clientes ativos" value={clientesAtivos.length} icon={<Users />} hint={recorrente ? `${formatMoney(recorrente)}/mês recorrente` : `${fechadasMes.length} fechado(s) este mês`} />
        <Stat label="Projetos em andamento" value={ativos.length} icon={<FolderKanban />} tone="blue" hint={formatMoney(ativos.reduce((s, p) => s + p.orcamento, 0)) + ' em carteira'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card
          title="Para hoje"
          description="Retornos e reuniões, na ordem do horário."
          bodyClass="p-0"
        >
          {plan.followups.length + plan.reunioesHoje.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-fg-3">Nada agendado para hoje. Bom momento para ligar para os novos.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {plan.reunioesHoje.map(({ lead, meeting }) => (
                <AgendaItem
                  key={meeting.id}
                  icon={<CalendarCheck className="size-4 text-emerald-300" />}
                  title={lead.empresa}
                  detail={`Reunião ${meeting.horario ?? 'hoje'}${meeting.contato ? ` com ${meeting.contato}` : ''}`}
                  onClick={() => openLead(lead.id)}
                />
              ))}
              {plan.followups.slice(0, 7).map(({ lead, followup, atrasado }) => (
                <AgendaItem
                  key={followup.id}
                  icon={<CalendarClock className={clsx('size-4', atrasado ? 'text-orange-300' : 'text-sky-300')} />}
                  title={lead.empresa}
                  detail={atrasado ? `Atrasado desde ${formatDayLabel(followup.data)}` : `Retorno ${followup.horario ?? periodoLabel(followup.periodo).toLowerCase()}`}
                  onClick={() => openLead(lead.id)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Funil de prospecção" description={`${metrics.totalLeads} leads na base`}>
          <ul className="space-y-2.5">
            {stageCounts.map((st) => (
              <li key={st.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-fg-2">{st.label}</span>
                  <span className="num font-medium text-fg">{st.n}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-tint/[0.05]">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${(st.n / stageMax) * 100}%` }} />
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-line-soft pt-2.5 text-xs">
              <span className="text-fg-2">Fecharam (reuniões ganhas)</span>
              <span className="num font-semibold text-emerald-300">{meetings.filter((m) => m.resultado === 'fechou').length}</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card
          title="Projetos em andamento"
          actions={
            <Link to="/projetos" className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200">
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          }
          bodyClass="p-0"
        >
          {ativos.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-fg-3">Nenhum projeto aberto. Quando um lead fechar, crie o projeto pela ficha do cliente.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {ativos.slice(0, 5).map((p) => {
                const st = PROJECT_STATUS.find((s) => s.id === p.status)!
                const prog = projectProgress(p)
                return (
                  <li key={p.id}>
                    <Link to={`/projetos?p=${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-tint/[0.025]">
                      <span className={clsx('size-2 shrink-0 rounded-full', st.tone)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{p.nome}</span>
                        <span className="block text-2xs text-fg-3">
                          {st.label}
                          {p.prazo && ` · prazo ${formatDayLabel(p.prazo).toLowerCase()}`}
                        </span>
                      </span>
                      <Progress value={prog} max={100} tone="accent" className="w-20" />
                      <span className="num w-9 text-right text-2xs text-fg-3">{prog}%</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="Atalhos">
          <div className="grid grid-cols-2 gap-2">
            <Shortcut to="/maps" icon={<MapPinned />} label="Buscar empresas" hint="Na hora, pela base do CNPJ" />
            {motor ? (
              <Shortcut to="/disparo" icon={<Send />} label="Novo disparo" hint={wa?.status === 'connected' ? `WhatsApp: ${wa.user?.name ?? 'conectado'}` : 'WhatsApp desconectado'} />
            ) : (
              <Shortcut to="/ligacao" icon={<Headphones />} label="Ligações de hoje" hint={`${plan.followups.length} retorno(s)`} />
            )}
            <Shortcut to="/leads" icon={<PhoneCall />} label="Lista de leads" hint={`${metrics.naoTrabalhados} sem contato`} />
            <Shortcut to="/precificacao" icon={<Sparkles />} label="Calcular orçamento" hint="Precificação" />
            <Shortcut to="/clientes" icon={<Users />} label="Clientes" hint={`${clientesAtivos.length} ativos`} />
            {motor ? (
              <Shortcut to="/whatsapp" icon={<Smartphone />} label="Conectar WhatsApp" hint={motorOnline ? (wa?.status === 'connected' ? 'Conectado' : 'Ler QR Code') : 'Motor desligado'} />
            ) : (
              <Shortcut to="/financeiro" icon={<BadgeDollarSign />} label="Financeiro" hint={`Saldo ${formatMoney(fin.saldo)}`} />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function MiniStat({ label, value, hint, warn }: { label: string; value: ReactNode; hint?: string; warn?: boolean }) {
  return (
    <div className="border-t border-line-soft px-3 py-3 sm:border-t-0 sm:px-4 sm:py-3.5">
      <p className="text-2xs font-medium text-fg-3">{label}</p>
      <p className="num mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{value}</p>
      {hint && <p className={clsx('mt-1 text-2xs', warn ? 'text-orange-300' : 'text-fg-4')}>{hint}</p>}
    </div>
  )
}

function AgendaItem({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-tint/[0.025]">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{title}</span>
          <span className="block truncate text-2xs text-fg-3">{detail}</span>
        </span>
        <ArrowRight className="size-3.5 text-fg-4" />
      </button>
    </li>
  )
}

function Shortcut({ to, icon, label, hint }: { to: string; icon: ReactNode; label: string; hint: string }) {
  return (
    <Link to={to} className="group flex items-start gap-2.5 rounded-lg border border-line-soft bg-raised px-3 py-2.5 transition-colors hover:border-blue-500/40">
      <span className="mt-0.5 text-fg-3 group-hover:text-blue-400 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-fg">{label}</span>
        <span className="block truncate text-2xs text-fg-4">{hint}</span>
      </span>
    </Link>
  )
}
