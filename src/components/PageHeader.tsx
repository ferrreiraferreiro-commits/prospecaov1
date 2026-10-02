import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-fg-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
