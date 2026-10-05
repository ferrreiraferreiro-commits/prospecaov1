import clsx from 'clsx'
import { Bell, CalendarCheck, CalendarClock, Crown, Eye, EyeOff, LogOut, Monitor, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../data/supabaseClient'
import { LOGIN_DOMAIN } from '../lib/auth'
import { formatDateTime, formatDayLabel, periodoLabel } from '../lib/dates'
import { PRIVACY_SHORTCUT, usePrivacy } from '../lib/privacy'
import { buildTodayPlan } from '../lib/selectors'
import { useTheme, type ThemePref } from '../lib/theme'
import { useIndex, useMetrics, useToday } from '../store/derived'
import { planInfo, useAccount, useIsAdmin } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Avatar } from './Avatar'
import { EscolherPlano } from './Planos'
import { Popover } from './ui'

/** Login atual: o usuário (ex.: "ana.web") ou o e-mail; `null` no modo local. */
function useLogin(): string | null {
  const [login, setLogin] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email ?? null
      setLogin(email?.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email)
    })
  }, [])
  return login
}

export function TopBar({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <PrivacyToggle />
      <NotificationBell />
      <UserMenu compact={compact} />
    </div>
  )
}

/** Olhinho do modo live: borra nomes, telefones e valores para mostrar a tela numa live. */
function PrivacyToggle() {
  const on = usePrivacy((s) => s.on)
  const toggle = usePrivacy((s) => s.toggle)
  return (
    <button
      onClick={toggle}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-2.5 text-xs font-semibold transition-colors',
        on ? 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/15' : 'border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg',
      )}
      aria-pressed={on}
      aria-label={on ? 'Modo live ligado: mostrar os dados' : 'Modo live: esconder nomes, telefones e valores'}
      title={`${on ? 'Mostrar os dados de novo' : 'Modo live: esconde nomes, telefones, e-mails e valores'} (${PRIVACY_SHORTCUT})`}
    >
      {on ? <EyeOff className="size-[18px]" strokeWidth={1.75} /> : <Eye className="size-[18px]" strokeWidth={1.75} />}
      {on && <span className="hidden sm:inline">Modo live</span>}
    </button>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const max = useApp((s) => s.settings.max_tentativas)
  const openLead = useUi((s) => s.openLead)
  const index = useIndex()
  const today = useToday()
  const navigate = useNavigate()
  const plan = useMemo(() => buildTodayPlan(leads, interactions, index, meetings, today, max), [leads, interactions, index, meetings, today, max])
  const count = plan.followups.length + plan.reunioesHoje.length
  const atrasados = plan.followups.filter((f) => f.atrasado).length

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        aria-label={`Avisos: ${count} para hoje`}
        title="Retornos e reuniões de hoje"
      >
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {count > 0 && (
          <span className={clsx('num absolute -top-1 -right-1 min-w-[18px] rounded-full px-1 text-center text-[10px] leading-[18px] font-semibold text-ink', atrasados ? 'bg-orange-400' : 'bg-sky-400')}>
            {count}
          </span>
        )}
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={320} align="end">
        <div className="p-2">
          <p className="px-1 pb-2 text-xs font-semibold text-fg">Para hoje</p>
          {count === 0 && <p className="px-1 pb-2 text-xs text-fg-3">Nenhum retorno ou reunião para hoje.</p>}
          <ul className="space-y-0.5">
            {plan.reunioesHoje.map(({ lead, meeting }) => (
              <BellItem
                key={meeting.id}
                icon={<CalendarCheck className="size-3.5 text-emerald-300" />}
                title={lead.empresa}
                detail={`Reunião ${meeting.horario ?? 'hoje'}${meeting.contato ? ` com ${meeting.contato}` : ''}`}
                onClick={() => {
                  setOpen(false)
                  openLead(lead.id)
                }}
              />
            ))}
            {plan.followups.slice(0, 8).map(({ lead, followup, atrasado }) => (
              <BellItem
                key={followup.id}
                icon={<CalendarClock className={clsx('size-3.5', atrasado ? 'text-orange-300' : 'text-sky-300')} />}
                title={lead.empresa}
                detail={atrasado ? `Retorno atrasado · ${formatDayLabel(followup.data)}` : `Retorno ${followup.horario ?? periodoLabel(followup.periodo).toLowerCase()}`}
                onClick={() => {
                  setOpen(false)
                  openLead(lead.id)
                }}
              />
            ))}
          </ul>
          <button
            onClick={() => {
              setOpen(false)
              navigate('/')
            }}
            className="mt-2 w-full rounded-md border border-line py-2 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg"
          >
            Ver no Painel
          </button>
        </div>
      </Popover>
    </>
  )
}

function BellItem({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-tint/[0.05]">
        <span className="mt-0.5">{icon}</span>
        <span className="min-w-0">
          <span className="pv block truncate text-xs font-medium text-fg">{title}</span>
          <span className="pv block truncate text-2xs text-fg-3">{detail}</span>
        </span>
      </button>
    </li>
  )
}

const THEMES: { id: ThemePref; label: string; icon: ReactNode }[] = [
  { id: 'dark', label: 'Escuro', icon: <Moon className="size-3.5" /> },
  { id: 'light', label: 'Claro', icon: <Sun className="size-3.5" /> },
  { id: 'system', label: 'Sistema', icon: <Monitor className="size-3.5" /> },
]

function UserMenu({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const settings = useApp((s) => s.settings)
  const repoKind = useApp((s) => s.repo?.kind)
  const metrics = useMetrics()
  const login = useLogin()
  const [theme, setTheme] = useTheme()
  const navigate = useNavigate()
  const admin = useIsAdmin()
  const usuario = useAccount((s) => s.profile?.usuario ?? null)

  const fullName = settings.nome_vendedor.trim() || (login ? login.charAt(0).toUpperCase() + login.slice(1) : 'Você')
  const firstName = fullName.split(/\s+/)[0]
  const meta = settings.meta_diaria

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-line bg-panel py-1 pr-3 pl-1 text-left transition-colors hover:bg-hover"
        aria-label="Menu do perfil"
      >
        <Avatar src={settings.avatar} name={fullName} size={30} />
        {!compact && (
          <span className="hidden min-w-0 sm:block">
            <span className="pv block max-w-[140px] truncate text-xs leading-4 font-semibold text-fg">{firstName}</span>
            <span className="num block text-2xs leading-4 text-fg-3">
              {metrics.hoje.ligacoes}/{meta} ligações hoje
            </span>
          </span>
        )}
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={300} align="end">
        <div className="p-3">
          <div className="flex items-center gap-3">
            <Avatar src={settings.avatar} name={fullName} size={40} />
            <div className="min-w-0">
              <p className="pv truncate text-sm font-semibold text-fg">{fullName}</p>
              <p className="pv truncate text-xs text-fg-3">{usuario ? `@${usuario}` : (login ?? 'Modo local (este navegador)')}</p>
            </div>
          </div>

          <PlanCard />

          <dl className="mt-3 space-y-1.5 border-t border-line-soft pt-3 text-xs">
            <MenuRow label="Ligações hoje">
              <span className="num">
                {metrics.hoje.ligacoes} / {meta}
              </span>
            </MenuRow>
            <MenuRow label="Reuniões">{metrics.reunioes}</MenuRow>
            <MenuRow label="Dados">{repoKind === 'supabase' ? 'Sincronizados' : 'Neste navegador'}</MenuRow>
          </dl>

          <div className="mt-3 border-t border-line-soft pt-3">
            <p className="mb-1.5 text-2xs font-medium text-fg-3">Tema</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-ink p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={clsx(
                    'inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                    theme === t.id ? 'bg-raised text-fg ring-1 ring-line-strong ring-inset' : 'text-fg-3 hover:text-fg-2',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <button
              onClick={() => {
                setOpen(false)
                navigate('/configuracoes#perfil')
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tint/[0.05] text-xs font-semibold text-fg transition-colors hover:bg-tint/[0.09]"
            >
              <UserRound className="size-4" /> Meu perfil
            </button>
            {admin && (
              <button
                onClick={() => {
                  setOpen(false)
                  navigate('/contas')
                }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-500/20"
              >
                <ShieldCheck className="size-4" /> Contas e planos
              </button>
            )}
            {supabase && (
              <button
                onClick={() => supabase!.auth.signOut()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-bad/10 text-xs font-semibold text-red-300 transition-colors hover:bg-bad/20"
              >
                <LogOut className="size-4" /> Sair
              </button>
            )}
          </div>
        </div>
      </Popover>
    </>
  )
}

/** Plano da conta e quando acaba. */
function PlanCard() {
  const profile = useAccount((s) => s.profile)
  const plan = planInfo(profile)
  if (!plan) return null
  const vitalicio = profile?.plano === 'vitalicio'
  const perto = plan.dias !== null && plan.dias <= 3
  return (
    <div className="mt-3 rounded-lg border border-line-soft bg-ink px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xs font-medium text-fg-3">Seu plano</span>
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold',
            vitalicio ? 'bg-gold/15 text-gold' : 'bg-tint/[0.07] text-fg',
          )}
        >
          {vitalicio && <Crown className="size-3" />}
          {plan.nome}
        </span>
      </div>
      {plan.ate ? (
        <>
          <p className="mt-1.5 text-xs text-fg-2">
            Acaba em <span className="num font-medium text-fg">{formatDateTime(plan.ate)}</span>
          </p>
          <p className={clsx('num mt-0.5 text-2xs', perto ? 'text-amber-200' : 'text-fg-3')}>
            {plan.dias === 0 ? 'Acaba hoje' : plan.dias === 1 ? 'Falta 1 dia' : `Faltam ${plan.dias} dias`}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-fg-2">{vitalicio ? 'Não acaba, é para sempre' : 'Sem data para acabar'}</p>
      )}
      {(profile?.plano === 'teste' || (profile?.plano === 'ativo' && plan.ate)) && (
        <EscolherPlano
          size="sm"
          titulo={<p className="mt-2.5 mb-1.5 border-t border-line-soft pt-2.5 text-2xs font-medium text-fg-3">{profile.plano === 'teste' ? 'Assinar pelo WhatsApp' : 'Renovar pelo WhatsApp'}</p>}
        />
      )}
    </div>
  )
}

function MenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-3">{label}</dt>
      <dd className="font-medium text-fg">{children}</dd>
    </div>
  )
}
