import clsx from 'clsx'
import {
  AlarmClock,
  BadgeDollarSign,
  Calculator,
  ChartColumn,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  Headphones,
  Info,
  LayoutDashboard,
  LayoutList,
  MapPinned,
  Menu,
  MessagesSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  Send,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Workflow,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDisparoSync } from '../lib/disparo'
import { useMotor, useMotorPolling } from '../lib/motor'
import { formatDateTime } from '../lib/dates'
import { accessOf, planInfo, useAccount, useHasMotor, useIsAdmin } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { LogoMark, Wordmark } from './Brand'
import { ImportModal } from './ImportModal'
import { LeadDrawer } from './LeadDrawer'
import { MessageModal } from './MessageModal'
import { OutcomeModal } from './OutcomeModal'
import { EscolherPlano } from './Planos'
import { TopBar } from './TopBar'
import { Spinner } from './ui'
import { useReminders } from './useReminders'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Só aparece para contas com o Motor WhatsApp XS */
  motor?: boolean
  /** Só aparece para o dono da XS */
  admin?: boolean
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Prospecção',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
      { to: '/leads', label: 'Leads', icon: LayoutList },
      { to: '/ligacao', label: 'Ligação', icon: Headphones },
      { to: '/roteiros', label: 'Roteiros', icon: ScrollText },
      { to: '/maps', label: 'Buscar empresas', icon: MapPinned },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { to: '/disparo', label: 'Disparo', icon: Send, motor: true },
      { to: '/funis', label: 'Funis', icon: Workflow, motor: true },
      { to: '/agendamentos', label: 'Agendadas', icon: AlarmClock, motor: true },
      { to: '/mensagens', label: 'Modelos de mensagem', icon: MessagesSquare },
      { to: '/whatsapp', label: 'Conexão', icon: Smartphone, motor: true },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/projetos', label: 'Projetos', icon: FolderKanban },
      { to: '/financeiro', label: 'Financeiro', icon: BadgeDollarSign },
      { to: '/precificacao', label: 'Precificação', icon: Calculator },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/estatisticas', label: 'Números', icon: ChartColumn },
      { to: '/configuracoes', label: 'Ajustes', icon: Settings },
      { to: '/contas', label: 'Contas', icon: ShieldCheck, admin: true },
    ],
  },
]

const MOBILE: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: LayoutList },
  { to: '/ligacao', label: 'Ligação', icon: Headphones },
  { to: '/maps', label: 'Buscar', icon: MapPinned },
]

/** Menu da conta: sem o Motor, somem os itens que dependem dele (e grupos vazios); Contas só para o dono. */
function useGroups() {
  const motor = useHasMotor()
  const admin = useIsAdmin()
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => (motor || !i.motor) && (admin || !i.admin)) })).filter((g) => g.items.length)
}

/** Conversa com o Motor WhatsApp XS no computador: status e disparos do WhatsApp. */
function MotorSync() {
  useMotorPolling()
  useDisparoSync()
  return null
}

const COLLAPSE_KEY = 'xs-prospeccao:menu-recolhido'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function Layout() {
  const { pathname } = useLocation()
  const full = pathname.startsWith('/ligacao')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [sheet, setSheet] = useState(false)
  const motor = useHasMotor()
  const groups = useGroups()
  useReminders()

  useEffect(() => setSheet(false), [pathname])

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* sem armazenamento */
      }
      return !c
    })
  }

  return (
    <div className={clsx('min-h-dvh transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-[232px]')}>
      {/* Barra lateral (desktop) */}
      <nav
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line-soft bg-panel/70 backdrop-blur transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-[232px]',
        )}
        aria-label="Navegação"
      >
        <div className={clsx('flex h-14 items-center gap-2.5 border-b border-line-soft', collapsed ? 'justify-center px-0' : 'px-4')}>
          <LogoMark size={collapsed ? 28 : 34} />
          {!collapsed && <Wordmark />}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-3">
              {collapsed ? (
                <div className="mx-auto my-2 h-px w-6 bg-line-soft first:hidden" />
              ) : (
                <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-fg-4 uppercase">{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-line-soft p-2.5">
          <TrialPill collapsed={collapsed} />
          {motor && <MotorPill collapsed={collapsed} />}
          <button
            onClick={toggle}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={clsx(
              'flex h-9 w-full items-center gap-2.5 rounded-lg text-xs font-medium text-fg-4 transition-colors hover:bg-tint/[0.04] hover:text-fg-2',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && 'Recolher'}
          </button>
        </div>
      </nav>

      <main className={clsx(full ? 'pb-16 lg:pb-0' : 'mx-auto max-w-[1480px] px-4 pt-3 pb-24 sm:px-6 sm:pt-4 lg:pb-10')}>
        {!full && (
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-1">
            <div className="flex items-center gap-2 lg:invisible">
              <LogoMark size={30} />
              <span className="text-[13px] font-semibold">XS Prospecção</span>
            </div>
            <TopBar />
          </div>
        )}
        {!full && <PlanoAviso />}
        <Suspense
          fallback={
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Barra inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegação">
        {MOBILE.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-blue-400' : 'text-fg-3')
            }
          >
            <item.icon className="size-[18px]" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ))}
        <button onClick={() => setSheet(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-fg-3">
          <Menu className="size-[18px]" strokeWidth={1.75} />
          Mais
        </button>
      </nav>

      {sheet && <MobileSheet groups={groups} onClose={() => setSheet(false)} />}
      {motor && <MotorSync />}

      <ImportModal />
      <LeadDrawer />
      <OutcomeModal />
      <MessageModal />
      <Toasts />
    </div>
  )
}

function SideLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors',
          collapsed ? 'justify-center' : 'px-2.5',
          isActive ? 'bg-blue-500/[0.12] text-fg' : 'text-fg-3 hover:bg-tint/[0.04] hover:text-fg-2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 -left-2.5 w-[3px] rounded-r bg-blue-500" />}
          <item.icon className={clsx('size-[17px] shrink-0', isActive && 'text-blue-400')} strokeWidth={1.75} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

/** Indica se o Motor WhatsApp XS (disparos do WhatsApp) está rodando neste computador. */
function MotorPill({ collapsed }: { collapsed: boolean }) {
  const online = useMotor((s) => s.online)
  const wa = useMotor((s) => s.health?.whatsapp.status)
  const bloqueado = useMotor((s) => s.bloqueado)
  const label = online
    ? wa === 'connected'
      ? 'Motor · WhatsApp on'
      : 'Motor online'
    : online === false
      ? bloqueado
        ? 'Motor bloqueado pelo navegador'
        : 'Motor desligado'
      : 'Verificando motor…'
  return (
    <NavLink
      to="/configuracoes#motor"
      title={label}
      className={clsx(
        'flex h-9 items-center gap-2.5 rounded-lg text-xs text-fg-3 transition-colors hover:bg-tint/[0.04] hover:text-fg-2',
        collapsed ? 'justify-center' : 'px-2.5',
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        <span className={clsx('size-2 rounded-full', online ? 'bg-go' : online === false ? 'bg-fg-4' : 'bg-amber-400')} />
        {online && <span className="absolute size-2 animate-ping rounded-full bg-go/60" />}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

/** No teste grátis, mostra quantos dias faltam. */
function TrialPill({ collapsed }: { collapsed: boolean }) {
  const profile = useAccount((s) => s.profile)
  const access = accessOf(profile)
  if (!access.ok || access.diasDeTeste === null) return null
  const label = access.diasDeTeste === 1 ? `Teste grátis · ${access.horasDeTeste}h restantes` : `Teste grátis · ${access.diasDeTeste} dias`
  return (
    <div title={label} className={clsx('flex h-9 items-center gap-2.5 rounded-lg text-xs text-amber-200/80', collapsed ? 'justify-center' : 'px-2.5')}>
      <Sparkles className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{label}</span>}
    </div>
  )
}

function MobileSheet({ groups, onClose }: { groups: typeof GROUPS; onClose: () => void }) {
  return (
    <div className="anim-fade fixed inset-0 z-40 bg-black/60 lg:hidden" onMouseDown={onClose}>
      <div
        className="anim-rise absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-panel px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <LogoMark size={28} />
          <Wordmark className="flex-1" />
          <button onClick={onClose} className="rounded-md p-1.5 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        {groups.map((group) => (
          <div key={group.title} className="mb-3">
            <p className="pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-fg-4 uppercase">{group.title}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    clsx(
                      'flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-center text-[11px] font-medium',
                      isActive ? 'border-blue-500/40 bg-blue-500/10 text-fg' : 'border-line-soft bg-raised text-fg-2',
                    )
                  }
                >
                  <item.icon className="size-[18px]" strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="anim-rise pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5 text-xs shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]">
          {t.tone === 'success' && <CheckCircle2 className="mt-px size-4 shrink-0 text-go" />}
          {t.tone === 'error' && <TriangleAlert className="mt-px size-4 shrink-0 text-bad" />}
          {t.tone === 'info' && <Info className="mt-px size-4 shrink-0 text-fg-3" />}
          <span className="flex-1 text-fg">{t.message}</span>
          {t.action && (
            <button onClick={t.action.run} className="font-medium text-blue-300 hover:text-blue-200">
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} className="text-fg-4 hover:text-fg" aria-label="Fechar aviso">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}


const AVISO_KEY = 'xs-prospeccao:aviso-plano'

/** Faixa quando o teste ou o plano acaba em até 3 dias, com um botão por plano para assinar pelo WhatsApp. */
function PlanoAviso() {
  const profile = useAccount((s) => s.profile)
  const plan = planInfo(profile)
  const [fechado, setFechado] = useState(() => {
    try {
      return sessionStorage.getItem(AVISO_KEY)
    } catch {
      return null
    }
  })
  if (!profile || !plan?.ate) return null
  const falta = Date.parse(plan.ate) - Date.now()
  if (falta <= 0 || falta > 3 * 86_400_000 || fechado === plan.ate) return null

  const teste = profile.plano === 'teste'
  const horas = Math.ceil(falta / 3_600_000)
  const quando = horas < 24 ? `em ${horas} hora${horas === 1 ? '' : 's'}` : `em ${plan.dias} dias`

  const fechar = () => {
    try {
      sessionStorage.setItem(AVISO_KEY, plan.ate!)
    } catch {
      /* sem armazenamento: some só até recarregar */
    }
    setFechado(plan.ate)
  }

  return (
    <div className="anim-fade mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs">
      <AlarmClock className="size-4 shrink-0 text-amber-200" strokeWidth={1.75} />
      <p className="min-w-0 flex-1 text-amber-100">
        {teste ? 'Seu teste grátis' : `Seu plano ${plan.nome}`} acaba <span className="font-semibold">{quando}</span>
        <span className="num text-amber-200/70"> · {formatDateTime(plan.ate)}</span>
      </p>
      <EscolherPlano size="sm" />
      <button onClick={fechar} className="rounded-md p-1 text-amber-200/60 hover:bg-amber-400/10 hover:text-amber-100" aria-label="Fechar aviso">
        <X className="size-3.5" />
      </button>
    </div>
  )
}
