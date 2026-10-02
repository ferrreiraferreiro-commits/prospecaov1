import clsx from 'clsx'
import { ChartColumn, CheckCircle2, Headphones, Info, LayoutList, Send, Settings, Sun, TriangleAlert, Upload, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMetrics } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { ImportModal } from './ImportModal'
import { LeadDrawer } from './LeadDrawer'
import { MessageModal } from './MessageModal'
import { OutcomeModal } from './OutcomeModal'
import { TopBar } from './TopBar'
import { useReminders } from './useReminders'

const NAV = [
  { to: '/', label: 'Central', icon: LayoutList, end: true },
  { to: '/hoje', label: 'Hoje', icon: Sun },
  { to: '/ligacao', label: 'Ligação', icon: Headphones },
  { to: '/disparo', label: 'Disparo', icon: Send },
  { to: '/estatisticas', label: 'Números', icon: ChartColumn },
  { to: '/configuracoes', label: 'Ajustes', icon: Settings },
]

export function Layout() {
  const { pathname } = useLocation()
  const full = pathname.startsWith('/ligacao')
  const metrics = useMetrics()
  const setImportOpen = useUi((s) => s.setImportOpen)
  const badge = metrics.followupsHoje
  useReminders()

  return (
    <div className="min-h-dvh lg:pl-[72px]">
      {/* Trilho lateral (desktop) */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center border-r border-line-soft bg-panel/60 py-3 lg:flex" aria-label="Navegação">
        <div className="mb-4 flex size-9 items-center justify-center rounded-lg border border-line bg-raised" title="Central de Prospecção">
          <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
            <path d="M11 9.5c0-.8.7-1.5 1.5-1.5h2l1.5 4-2 1.3a8.5 8.5 0 0 0 4.7 4.7l1.3-2 4 1.5v2c0 .8-.7 1.5-1.5 1.5C15.6 21 11 16.4 11 9.5Z" fill="#e3b341" />
          </svg>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'relative flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'bg-tint/[0.06] text-fg' : 'text-fg-3 hover:bg-tint/[0.03] hover:text-fg-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-2 bottom-2 -left-2 w-[2px] rounded-r bg-accent" />}
                  <item.icon className="size-[18px]" strokeWidth={1.75} />
                  {item.label}
                  {item.to === '/hoje' && badge > 0 && (
                    <span className="num absolute top-1 right-1.5 min-w-4 rounded-full bg-sky-400 px-1 text-center text-[9px] leading-4 font-semibold text-ink">{badge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium text-fg-3 transition-colors hover:bg-tint/[0.03] hover:text-fg-2"
          title="Importar leads"
        >
          <Upload className="size-[18px]" strokeWidth={1.75} />
          Importar
        </button>
      </nav>

      <main className={clsx(full ? 'pb-16 lg:pb-0' : 'mx-auto max-w-[1480px] px-4 pt-3 pb-24 sm:px-6 sm:pt-4 lg:pb-10')}>
        {!full && (
          <div className="mb-3 flex justify-end sm:mb-1">
            <TopBar />
          </div>
        )}
        <Outlet />
      </main>

      {/* Barra inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegação">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-fg' : 'text-fg-3')
            }
          >
            <item.icon className="size-[18px]" strokeWidth={1.75} />
            {item.label}
            {item.to === '/hoje' && badge > 0 && (
              <span className="num absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-sky-400 px-1 text-center text-[9px] leading-4 font-semibold text-ink">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <ImportModal />
      <LeadDrawer />
      <OutcomeModal />
      <MessageModal />
      <Toasts />
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
