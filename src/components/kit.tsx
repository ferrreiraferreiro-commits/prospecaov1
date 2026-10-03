import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

/** Painel com cabeçalho (título, descrição, ações). */
export function Card({
  id,
  title,
  description,
  actions,
  children,
  className,
  bodyClass = 'px-4 py-3.5',
}: {
  id?: string
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section id={id} className={clsx('panel scroll-mt-6', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[13px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

type Tone = 'default' | 'go' | 'bad' | 'blue' | 'gold'

const TONE: Record<Tone, string> = {
  default: 'text-fg',
  go: 'text-emerald-300',
  bad: 'text-red-300',
  blue: 'text-blue-300',
  gold: 'text-gold',
}

/** Indicador numérico (rótulo pequeno + valor grande). */
export function Stat({ label, value, hint, tone = 'default', icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center gap-1.5 text-2xs font-medium text-fg-3">
        {icon && <span className="[&_svg]:size-3.5">{icon}</span>}
        {label}
      </div>
      <div className={clsx('num mt-1 text-xl leading-7 font-semibold tracking-[-0.02em]', TONE[tone])}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-2xs text-fg-4">{hint}</div>}
    </div>
  )
}

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-fg-4">{hint}</span>}
    </label>
  )
}

/** Campo numérico que aceita vírgula ("1.500,50") e só dispara onChange com número válido. */
export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  min,
  className,
  placeholder,
  step,
}: {
  value: number | null
  onChange: (v: number | null) => void
  prefix?: string
  suffix?: string
  min?: number
  className?: string
  placeholder?: string
  step?: number
}) {
  const [text, setText] = useState(value === null || Number.isNaN(value) ? '' : formatInput(value))
  useEffect(() => {
    const parsed = parseNumber(text)
    if (parsed !== value) setText(value === null ? '' : formatInput(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={clsx('relative', className)}>
      {prefix && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-fg-4">{prefix}</span>}
      <input
        inputMode="decimal"
        className={clsx('input num', prefix && 'pl-8', suffix && 'pr-8')}
        value={text}
        placeholder={placeholder}
        step={step}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseNumber(e.target.value)
          if (e.target.value.trim() === '') onChange(null)
          else if (n !== null && (min === undefined || n >= min)) onChange(n)
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-4">{suffix}</span>}
    </div>
  )
}

function formatInput(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',')
}

export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s|R\$/g, '')
  if (!t) return null
  // "1.500,50" → 1500.50 ; "1500.5" → 1500.5
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-2xs font-medium whitespace-nowrap ring-1 ring-inset', className)}>{children}</span>
}

export const PILL = {
  neutral: 'bg-tint/[0.04] text-fg-2 ring-line',
  blue: 'bg-blue-500/10 text-blue-300 ring-blue-500/25',
  go: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  bad: 'bg-red-500/10 text-red-300 ring-red-500/25',
  gold: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
}

/** Barra de busca compacta. */
export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={clsx('input h-8 w-full sm:w-64', className)} />
  )
}

/** Confirmação simples (window.confirm) com texto em português. */
export function confirmAction(message: string): boolean {
  return window.confirm(message)
}
