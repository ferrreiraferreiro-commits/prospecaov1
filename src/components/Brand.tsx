import clsx from 'clsx'

/** Monograma XS: quadrado azul com as letras em branco. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={clsx('shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
      <text
        x="16"
        y="21.2"
        textAnchor="middle"
        fontFamily="'Geist Variable', ui-sans-serif, system-ui, sans-serif"
        fontSize="14.5"
        fontWeight="800"
        letterSpacing="-0.6"
        fill="#ffffff"
      >
        XS
      </text>
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('min-w-0 leading-tight', className)}>
      <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-fg">
        XS <span className="text-blue-400">Prospecção</span>
      </span>
      <span className="block truncate text-2xs text-fg-4">Prospecção · Gestão</span>
    </span>
  )
}
