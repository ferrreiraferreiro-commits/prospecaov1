import { LogoMark, Wordmark } from '../Brand'

// Links com recarregamento (<a>): as páginas legais abrem fora do roteador do app
const LINKS = [
  { href: '/privacidade', label: 'Política de Privacidade' },
  { href: '/termos', label: 'Termos de Uso' },
]

/** Rodapé das páginas públicas (landing, privacidade e termos). */
export function SiteFooter() {
  return (
    <footer className="border-t border-line-soft">
      <div className="mx-auto max-w-[1160px] px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <a href="/" className="flex items-center gap-2.5 self-start" aria-label="XS Prospecção, página inicial">
            <LogoMark size={26} className="opacity-90" />
            <Wordmark />
          </a>
          <nav aria-label="Rodapé">
            <ul className="flex flex-col gap-3 text-[13px] text-fg-3 sm:flex-row sm:gap-7">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="transition-colors hover:text-fg">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 text-2xs text-fg-4 sm:flex-row sm:justify-between">
          <p>Captação e organização de clientes para quem vende sites e serviços digitais.</p>
          <p>© {new Date().getFullYear()} XS Prospecção</p>
        </div>
      </div>
    </footer>
  )
}
