import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { useHasMotor } from '../store/useAccount'

/** Tudo de mensagem de WhatsApp numa área só: modelos e, com o Motor, funis, disparo e agendadas. */
export const MENSAGENS_ROUTES = ['/mensagens', '/funis', '/disparo', '/agendamentos']

const TABS = [
  { to: '/mensagens', label: 'Modelos', motor: false },
  { to: '/funis', label: 'Funis', motor: true },
  { to: '/disparo', label: 'Disparo', motor: true },
  { to: '/agendamentos', label: 'Agendadas', motor: true },
]

export function MensagensTabs() {
  const motor = useHasMotor()
  if (!motor) return null
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line-soft" aria-label="Mensagens">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            clsx(
              '-mb-px border-b-2 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
              isActive ? 'border-blue-500 text-fg' : 'border-transparent text-fg-3 hover:text-fg-2',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
