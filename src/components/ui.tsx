import clsx from 'clsx'
import { LoaderCircle, X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SVGProps,
} from 'react'
import { createPortal } from 'react-dom'
import { STATUS_MAP, TONE_CLASSES } from '../lib/statuses'
import type { StatusId } from '../lib/types'

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'go' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'subtle'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white font-semibold hover:bg-[#3b7bf6] active:bg-blue-700',
  go: 'bg-go text-[#04140c] font-semibold hover:bg-[#4ccb8d] active:bg-go-strong',
  secondary: 'border border-line bg-raised text-fg hover:bg-hover hover:border-line-strong',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  subtle: 'bg-tint/[0.04] text-fg-2 hover:bg-tint/[0.07] hover:text-fg',
  danger: 'border border-bad/30 bg-bad/10 text-red-300 hover:bg-bad/20',
  gold: 'bg-gold text-[#1a1404] font-semibold hover:bg-[#ecc25a]',
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-2xs gap-1 rounded-[5px]',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
})

interface IconLinkProps {
  href: string | null
  label: string
  children: ReactNode
  tone?: 'default' | 'go'
  className?: string
  onClick?: () => void
}

/** Ação rápida (tel:, WhatsApp, Maps…). Desabilitada visualmente quando não há dado. */
export function IconLink({ href, label, children, tone = 'default', className, onClick }: IconLinkProps) {
  const base = clsx(
    'inline-flex size-7 items-center justify-center rounded-md transition-colors [&_svg]:size-[15px]',
    className,
  )
  if (!href) {
    return (
      <span className={clsx(base, 'cursor-not-allowed text-fg-4/60')} title={`${label}: não informado`} aria-disabled>
        {children}
      </span>
    )
  }
  const external = !href.startsWith('tel:')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={clsx(
        base,
        tone === 'go' ? 'text-go hover:bg-go/10' : 'text-fg-3 hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </a>
  )
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.1z" />
      <path d="M9 9.2c.3 2.4 2.4 4.6 5 5.2l1.1-1.2 1.9.8-.4 1.6c-3.9.4-8-3.6-7.7-7.6l1.6-.4.8 1.9z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function StatusBadge({ status, className, size = 'sm' }: { status: StatusId; className?: string; size?: 'sm' | 'md' }) {
  const def = STATUS_MAP[status]
  const tone = TONE_CLASSES[def.tone]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'h-5 px-1.5 text-2xs' : 'h-6 px-2 text-xs',
        tone.chip,
        className,
      )}
    >
      <span className={clsx('size-1.5 rounded-full', tone.dot)} />
      {def.label}
    </span>
  )
}

export function StatusDot({ status }: { status: StatusId | null }) {
  if (!status) return <span className="size-1.5 rounded-full bg-fg-4" />
  return <span className={clsx('size-1.5 shrink-0 rounded-full', TONE_CLASSES[STATUS_MAP[status].tone].dot)} />
}

// ---------------------------------------------------------------------------
// Pequenos
// ---------------------------------------------------------------------------

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={clsx(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-line bg-ink px-1 font-sans text-[10px] leading-none font-medium text-fg-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Missing({ children = 'Não informado' }: { children?: ReactNode }) {
  return <span className="text-fg-4">{children}</span>
}

export function Progress({ value, max, tone = 'gold', className }: { value: number; max: number; tone?: 'gold' | 'go' | 'accent'; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={clsx('h-1 overflow-hidden rounded-full bg-tint/[0.06]', className)}>
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', {
          'bg-gold': tone === 'gold',
          'bg-go': tone === 'go',
          'bg-accent': tone === 'accent',
        })}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin text-fg-3', className ?? 'size-4')} />
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-fg-4 [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-fg-2">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-fg-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, count, right, className }: { children: ReactNode; count?: number; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <h2 className="text-[13px] font-semibold text-fg">{children}</h2>
      {count !== undefined && <span className="num rounded bg-tint/[0.06] px-1.5 text-2xs leading-[18px] font-medium text-fg-2">{count}</span>}
      {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function useEscape(onClose: () => void, active = true) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [active])
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/65 sm:items-start sm:p-6 sm:pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={clsx(
          'anim-rise flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-line bg-panel shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)] sm:max-h-[84vh] sm:rounded-xl',
          width,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-fg-3">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="-mr-1.5 rounded-md p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex items-center gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, children, width = 'sm:w-[540px]' }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEscape(onClose, open)
  if (!open) return null
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 bg-black/50" onMouseDown={onClose}>
      <aside
        className={clsx('anim-slide absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-panel shadow-2xl', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

/** Popover posicionado em relação a um elemento âncora (portal + fixed, não é cortado por overflow). */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  width = 220,
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end'
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  useEscape(onClose, open)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const h = ref.current?.offsetHeight ?? 300
      const below = window.innerHeight - r.bottom - 8
      const above = r.top - 8
      const up = below < Math.min(h, 320) && above > below
      let left = align === 'end' ? r.right - width : r.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      const maxHeight = Math.max(160, (up ? above : below) - 4)
      const top = up ? Math.max(8, r.top - 4 - Math.min(h, maxHeight)) : r.bottom + 4
      setPos({ top, left, maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, align, width])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, anchor, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      className="anim-rise fixed z-[60] overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.85)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: pos?.maxHeight }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  children,
  onClick,
  active,
  hint,
  className,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  hint?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-tint/[0.06]',
        active ? 'text-fg' : 'text-fg-2',
        className,
      )}
    >
      {children}
      {hint && <span className="ml-auto text-fg-4">{hint}</span>}
    </button>
  )
}

/** Grupo de botões segmentados. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: ReactNode }[]
  size?: 'xs' | 'sm'
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-ink p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx(
            'rounded-[5px] font-medium transition-colors',
            size === 'xs' ? 'h-6 px-2 text-2xs' : 'h-7 px-2.5 text-xs',
            value === o.id ? 'bg-raised text-fg ring-1 ring-inset ring-line-strong' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
