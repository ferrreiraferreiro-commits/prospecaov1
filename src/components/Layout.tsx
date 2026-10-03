import clsx from 'clsx'
import {
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
  Send,
  Settings,
  Smartphone,
  Sun,
  TriangleAlert,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDisparoSync } from '../lib/disparo'
import { useMotor, useMotorPolling } from '../lib/motor'
import { useMetrics } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { LogoMark, Wordmark } from './Brand'
import { ImportModal } from './ImportModal'
import { LeadDrawer } from './LeadDrawer'
import { MessageModal } from './MessageModal'
import { OutcomeModal } from './OutcomeModal'
import { TopBar } from './TopBar'
import { Spinner } from './ui'
import { useReminders } from './useReminders'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Prospecção',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
      { to: '/leads', label: 'Leads', icon: LayoutList },
      { to: '/hoje', label: 'Hoje', icon: Sun },
      { to: '/ligacao', label: 'Ligação', icon: Headphones },
      { to: '/roteiros', label: 'Roteiros', icon: ScrollText },
      { to: '/maps', label: 'Buscar no Maps', icon: MapPinned },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { to: '/funis', label: 'Funis', icon: MessagesSquare },
      { to: '/disparo', label: 'Disparo', icon: Send },
      { to: '/whatsapp', label: 'Conexão', icon: Smartphone },
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
    ],
  },
]

const MOBILE: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: LayoutList },
  { to: '/hoje', label: 'Hoje', icon: Sun },
  { to: '/ligacao', label: 'Ligação', icon: Headphones },
]

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
  const metrics = useMetrics()
  const setImportOpen = useUi((s) => s.setImportOpen)
  const badge = metrics.followupsHoje
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [sheet, setSheet] = useState(false)
  useReminders()
  useMotorPolling()
  useDisparoSync()

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
          <LogoMark size={30} />
          {!collapsed && <Wordmark />}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-3">
              {collapsed ? (
                <div className="mx-auto my-2 h-px w-6 bg-line-soft first:hidden" />
              ) : (
                <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-fg-4 uppercase">{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} collapsed={collapsed} badge={item.to === '/hoje' ? badge : 0} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-line-soft p-2.5">
          <MotorPill collapsed={collapsed} />
          <button
            onClick={() => setImportOpen(true)}
            title="Importar leads"
            className={clsx(
              'flex h-9 w-full items-center gap-2.5 rounded-lg text-xs font-medium text-fg-3 transition-colors hover:bg-tint/[0.04] hover:text-fg',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
          >
            <Upload className="size-4" strokeWidth={1.75} />
            {!collapsed && 'Importar leads'}
          </button>
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
              <LogoMark size={28} />
              <span className="text-[13px] font-semibold">
                XS <span className="text-blue-400">Prospecção</span>
              </span>
            </div>
            <TopBar />
          </div>
        )}
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
              clsx('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-blue-400' : 'text-fg-3')
            }
          >
            <item.icon className="size-[18px]" strokeWidth={1.75} />
            {item.label}
            {item.to === '/hoje' && badge > 0 && (
              <span className="num absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-sky-400 px-1 text-center text-[9px] leading-4 font-semibold text-ink">{badge}</span>
            )}
          </NavLink>
        ))}
        <button onClick={() => setSheet(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-fg-3">
          <Menu className="size-[18px]" strokeWidth={1.75} />
          Mais
        </button>
      </nav>

      {sheet && <MobileSheet onClose={() => setSheet(false)} onImport={() => setImportOpen(true)} />}

      <ImportModal />
      <LeadDrawer />
      <OutcomeModal />
      <MessageModal />
      <Toasts />
    </div>
  )
}

function SideLink({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge: number }) {
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
          {badge > 0 && (
            <span
              className={clsx(
                'num min-w-[18px] rounded-full bg-sky-400 px-1 text-center text-[10px] leading-[18px] font-semibold text-ink',
                collapsed ? 'absolute top-0.5 right-1' : 'ml-auto',
              )}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

/** Indica se o Motor XS (busca no Maps e WhatsApp) está rodando neste computador. */
function MotorPill({ collapsed }: { collapsed: boolean }) {
  const online = useMotor((s) => s.online)
  const wa = useMotor((s) => s.health?.whatsapp.status)
  const label = online ? (wa === 'connected' ? 'Motor · WhatsApp on' : 'Motor online') : online === false ? 'Motor desligado' : 'Verificando motor…'
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

function MobileSheet({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
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
        {GROUPS.map((group) => (
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
        <button
          onClick={() => {
            onClose()
            onImport()
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line text-xs font-medium text-fg-2"
        >
          <Upload className="size-4" /> Importar leads
        </button>
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

