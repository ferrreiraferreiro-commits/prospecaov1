import { ArrowLeft } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { LEGAL } from '../../lib/legal'
import { LogoMark, Wordmark } from '../Brand'
import { SiteFooter } from './SiteFooter'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/** Página de texto legal: cabeçalho simples, índice e seções numeradas. */
export function LegalLayout({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} · XS Prospecção`
    window.scrollTo(0, 0)
    return () => {
      document.title = before
    }
  }, [title])

  return (
    <div className="min-h-dvh bg-ink text-fg">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-xs">
        Pular para o conteúdo
      </a>
      <header className="border-b border-line-soft">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-2.5" aria-label="XS Prospecção, página inicial">
            <LogoMark size={28} />
            <Wordmark />
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 text-xs text-fg-3 transition-colors hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Voltar ao início
          </a>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[1160px] px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,680px)] lg:gap-20">
          <div className="hidden lg:block">
            <nav aria-label="Nesta página" className="sticky top-10">
              <p className="mb-4 text-2xs font-medium tracking-[0.12em] text-fg-4 uppercase">Nesta página</p>
              <Toc sections={sections} />
            </nav>
          </div>

          <article>
            <header className="mb-12">
              <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[40px]">{title}</h1>
              <p className="mt-3 text-xs text-fg-4">Versão de {LEGAL.atualizadoEm}</p>
              <div className="mt-8 space-y-4 text-[15px] leading-7 text-fg-2">{intro}</div>
            </header>

            <details className="mb-12 border-y border-line-soft py-4 lg:hidden">
              <summary className="cursor-pointer text-xs font-medium text-fg-2">Nesta página</summary>
              <div className="mt-4">
                <Toc sections={sections} />
              </div>
            </details>

            <div className="space-y-12">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-8" aria-labelledby={`${s.id}-t`}>
                  <h2 id={`${s.id}-t`} className="flex gap-3 text-[18px] leading-7 font-semibold tracking-[-0.01em]">
                    <span className="num w-6 shrink-0 text-fg-4">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </h2>
                  <div className="legal mt-3 space-y-4 pl-9 text-[15px] leading-7 text-fg-2">{s.body}</div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Toc({ sections }: { sections: LegalSection[] }) {
  return (
    <ol className="space-y-2 text-xs">
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-fg-3 transition-colors hover:text-fg">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  )
}

/** Lista com traço discreto (usada nos textos legais). */
export function Dash({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-5 before:absolute before:top-[13px] before:left-0 before:h-px before:w-2.5 before:bg-fg-4">
          {it}
        </li>
      ))}
    </ul>
  )
}

/**
 * Dado jurídico que o dono da XS ainda precisa informar (ver src/lib/legal.ts).
 * Nunca mostra valor inventado: em desenvolvimento aparece "Preencher: …"; publicado, o texto neutro.
 */
export function Fill({ value, what, fallback, href }: { value: string | null; what: string; fallback: string; href?: (v: string) => string }) {
  if (value) {
    return href ? (
      <a href={href(value)} className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg-3">
        {value}
      </a>
    ) : (
      <span className="text-fg">{value}</span>
    )
  }
  if (import.meta.env.DEV) {
    return <span className="rounded border border-dashed border-gold/50 px-1.5 py-0.5 text-[13px] text-gold">Preencher: {what}</span>
  }
  return <span>{fallback}</span>
}

/** Canal de contato de privacidade (e-mail de src/lib/legal.ts). */
export function PrivacyContact() {
  return <Fill value={LEGAL.emailPrivacidade} what="e-mail de contato (src/lib/legal.ts)" fallback="o canal de atendimento da XS" href={(v) => `mailto:${v}`} />
}
