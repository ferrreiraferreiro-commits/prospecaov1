import clsx from 'clsx'

/** Logo XS (prata). `size` é a altura em px; a largura acompanha a proporção. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <img src="/logo-xs.webp" alt="XS" height={size} style={{ height: size, width: 'auto' }} className={clsx('shrink-0 select-none', className)} draggable={false} />
}


export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('min-w-0 leading-tight', className)}>
      <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-fg">Prospecção</span>
      <span className="block truncate text-2xs text-fg-4">Para quem vende sites</span>
    </span>
  )
}
