import clsx from 'clsx'
import { ArrowRight, CalendarClock, Check, LayoutList, Map as MapIcon, Menu, MonitorSmartphone, Plus, Route, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Brand'
import { CallDemo } from '../components/site/CallDemo'
import { ProductShowcase } from '../components/site/ProductShowcase'
import { SiteFooter } from '../components/site/SiteFooter'
import '@fontsource-variable/manrope'

/** Atraso da animação de entrada (classe land-in / reveal). */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** Largura e margens de todas as seções. */
const WRAP = 'mx-auto w-full max-w-[1160px] px-5 sm:px-8'

/** Revela cada `.reveal` da página quando ele entra na tela. */
function useRevealOnScroll(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('.reveal')
    if (!els?.length) return
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [root])
}

/**
 * O topo da landing é azul (tokens do escuro) e o resto usa .tema-claro. Se o tema salvo for o
 * claro, troca para o escuro enquanto ela está aberta (antes de desenhar) e devolve o tema ao sair.
 */
function useDarkTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const before = root.dataset.theme
    root.dataset.theme = 'dark'
    return () => {
      if (before) root.dataset.theme = before
    }
  }, [])
}

/** Página pública da XS: quem ainda não entrou chega aqui. */
export function LandingPage() {
  const ref = useRef<HTMLDivElement>(null)
  useRevealOnScroll(ref)
  useDarkTheme()
  return (
    <div ref={ref} className="land-page relative isolate min-h-dvh overflow-x-clip text-fg">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-xs">
        Pular para o conteúdo
      </a>
      <Nav />
      <main id="conteudo">
        <Hero />
        {/* O azul do topo clareia até o cinza-claro; daqui para baixo, tokens do tema claro */}
        <div className="tema-claro">
          <Highlights />
          <Steps />
          <Product />
          <Audience />
          <Faq />
          <FinalCta />
        </div>
      </main>
      <div className="tema-claro">
        <SiteFooter />
      </div>
    </div>
  )
}

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#perguntas', label: 'Perguntas' },
]

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onResize = () => window.innerWidth >= 768 && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 border-b transition-[background-color,border-color] duration-300',
        scrolled || open ? 'land-nav-bg border-line-soft backdrop-blur-md' : 'border-transparent bg-ink/0',
      )}
    >
      <div className={clsx(WRAP, 'relative flex h-16 items-center gap-3')}>
        <Link to="/" className="flex items-center gap-2.5" aria-label="XS Prospecção, página inicial">
          <LogoMark size={28} />
          <Wordmark className="hidden min-[400px]:block" />
        </Link>

        <nav aria-label="Principal" className="absolute left-1/2 hidden -translate-x-1/2 md:block">
          <ul className="flex items-center gap-8 text-[13px] text-fg-2">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="transition-colors hover:text-fg">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link to="/entrar" className="hidden h-9 items-center rounded-md px-3 text-[13px] font-medium text-fg-2 transition-colors hover:text-fg md:inline-flex">
            Entrar
          </Link>
          <Link to="/criar-conta" className="inline-flex h-9 items-center rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3b7bf6]">
            Testar grátis
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="menu-celular"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-md text-fg-2 transition-colors hover:text-fg md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="menu-celular" className="anim-fade border-t border-line-soft md:hidden">
          <nav aria-label="Menu" className={clsx(WRAP, 'py-3')}>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center border-b border-line-soft text-[15px] text-fg-2 hover:text-fg">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/entrar" className="flex h-12 items-center text-[15px] text-fg-2 hover:text-fg">
                  Entrar
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </header>
  )
}

/** Botão principal: leva para o cadastro. */
function PrimaryCta({ className }: { className?: string }) {
  return (
    <Link
      to="/criar-conta"
      className={clsx(
        'group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#3b7bf6] active:scale-[0.98] sm:h-11 sm:px-5 sm:text-sm',
        className,
      )}
    >
      Testar 1 dia grátis
      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-2xs font-medium tracking-[0.14em] text-fg-2/80 uppercase">{children}</p>
}

const H2 = 'font-display text-balance text-[30px] leading-[1.1] sm:text-[40px] sm:leading-[1.06]'

function Hero() {
  return (
    // -mt-16 + pt-16: o azul do topo continua atrás do menu
    <section aria-labelledby="hero-t" className="land-bg relative isolate -mt-16 pt-16">
      <div className="land-glow" aria-hidden />
      <div className="land-grain" aria-hidden />
      <div className={clsx(WRAP, 'grid items-center gap-14 pt-12 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,548px)] lg:gap-12 lg:pt-28 lg:pb-32')}>
        <div className="max-w-[600px]">
          <p className="land-in text-[13px] text-fg-2/80" style={delay(0)}>
            Para quem vende sites e serviços digitais
          </p>
          <h1 id="hero-t" className="font-display mt-5 text-[clamp(2.375rem,1.4rem+3.6vw,3.5rem)] leading-[1.02]">
            <span className="land-in block" style={delay(70)}>
              Do primeiro alô
            </span>
            <span className="land-in block text-fg-3" style={delay(140)}>
              ao cliente fechado.
            </span>
          </h1>
          <p className="land-in mt-6 max-w-[480px] text-base leading-7 text-fg-2" style={delay(220)}>
            Encontre empresas da sua cidade por nicho e bairro, organize todos os seus leads num lugar só e acompanhe cada contato, da ligação ao WhatsApp, até virar cliente.
          </p>
          <div className="land-in mt-9 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(300)}>
            <PrimaryCta />
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-line px-6 text-[15px] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg sm:h-11 sm:px-5 sm:text-sm"
            >
              Ver como funciona
            </a>
          </div>
          <p className="land-in mt-5 text-xs text-fg-2/70" style={delay(360)}>
            1 dia com tudo liberado. Sem cartão de crédito.
          </p>
        </div>
        <div className="land-in min-w-0" style={delay(200)}>
          <CallDemo />
        </div>
      </div>
    </section>
  )
}

function Highlights() {
  const items = [
    { icon: <MapIcon />, text: 'Empresas reais, com telefone' },
    { icon: <LayoutList />, text: 'Tudo organizado num lugar' },
    { icon: <CalendarClock />, text: 'Retornos na hora certa' },
    { icon: <Route />, text: 'Do lead ao projeto' },
  ]
  return (
    // Sem divisórias: o degradê do topo passa por trás dos textos
    <section aria-label="Em resumo" className="land-fade-end">
      <ul className={clsx(WRAP, 'grid grid-cols-2 gap-x-6 gap-y-4 pt-2 pb-8 lg:flex lg:justify-between lg:pt-1 lg:pb-10')}>
        {items.map((it) => (
          <li
            key={it.text}
            className="flex items-center gap-3 text-[13px] text-fg-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3"
          >
            {it.icon}
            {it.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Steps() {
  const steps = [
    { title: 'Capture leads', text: 'Busque empresas por cidade, bairro e nicho, com telefone, celular e e-mail, ou traga a sua planilha. Quem já está na sua lista fica de fora.' },
    { title: 'Entre em contato', text: 'Ligue em sequência com o roteiro na tela ou continue pelo WhatsApp. Cada resultado fica registrado no histórico do lead.' },
    { title: 'Organize e feche', text: 'Retornos, reuniões, clientes, projetos e pagamentos ficam ligados ao mesmo lead, do primeiro contato em diante.' },
  ]
  return (
    <section id="como-funciona" aria-labelledby="como-t" className="scroll-mt-16">
      <div className={clsx(WRAP, 'pt-14 pb-24 sm:pt-20 sm:pb-32')}>
        <div className="reveal">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 id="como-t" className={clsx(H2, 'mt-4')}>
            Três passos, todo dia.
          </h2>
        </div>
        <ol className="mt-14 grid gap-12 sm:mt-16 md:grid-cols-3 md:gap-10">
          {steps.map((s, i) => (
            <li key={s.title} className="reveal border-t border-line pt-6" style={delay(i * 90)}>
              <span className="num text-xs text-fg-3">0{i + 1}</span>
              <h3 className="mt-8 text-[19px] leading-7 font-semibold tracking-[-0.015em]">{s.title}</h3>
              <p className="mt-2 max-w-[320px] text-sm leading-6 text-fg-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Product() {
  return (
    <section id="recursos" aria-labelledby="recursos-t" className="scroll-mt-16 border-y border-line-soft bg-panel/40">
      <div className={clsx(WRAP, 'py-24 sm:py-32')}>
        <div className="reveal max-w-[640px]">
          <Eyebrow>Recursos</Eyebrow>
          <h2 id="recursos-t" className={clsx(H2, 'mt-4')}>
            Uma mesa de prospecção.
            <br />
            Não mais um CRM genérico.
          </h2>
        </div>
        <div className="reveal mt-14 sm:mt-16">
          <ProductShowcase />
        </div>
      </div>
    </section>
  )
}

function Audience() {
  const points = [
    'Capta empresas locais por cidade, bairro e tipo de negócio, já com telefone, site e Instagram.',
    'Organiza leads, status e histórico de contato num lugar só.',
    'Lembra retornos e reuniões na hora certa.',
    'Transforma o lead em cliente e projeto sem sair da XS.',
  ]
  return (
    <section aria-labelledby="publico-t">
      <div className={clsx(WRAP, 'grid gap-14 py-24 sm:py-32 lg:grid-cols-2 lg:gap-20')}>
        <div className="reveal">
          <Eyebrow>Para quem é</Eyebrow>
          <h2 id="publico-t" className={clsx(H2, 'mt-4')}>
            Feito para quem vende sites
            <br className="hidden sm:block" /> para empresas locais.
          </h2>
          <p className="mt-5 max-w-[460px] text-base leading-7 text-fg-2">
            A XS foi criada em volta de uma rotina de prospecção real: encontrar negócios, organizar os contatos, retornar na hora certa e transformar oportunidades em projetos.
          </p>
          <dl className="mt-12 grid max-w-[460px] grid-cols-[88px_1fr] gap-x-4 gap-y-3 border-t border-line-soft pt-6 text-sm">
            <dt className="text-fg-3">Antes</dt>
            <dd className="text-fg-3">Maps + bloco de notas + WhatsApp + planilha</dd>
            <dt className="text-fg-2">Com a XS</dt>
            <dd className="text-fg">Um fluxo só.</dd>
          </dl>
        </div>
        <ul className="reveal self-center border-t border-line-soft lg:mt-10" style={delay(120)}>
          {points.map((p) => (
            <li key={p} className="flex items-start gap-4 border-b border-line-soft py-5 text-[15px] leading-6 text-fg-2">
              <Check className="mt-1 size-4 shrink-0 text-go" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Faq() {
  const items: { q: string; a: ReactNode }[] = [
    {
      q: 'Preciso instalar alguma coisa?',
      a: 'Não. A XS funciona no navegador do computador e do celular, inclusive a busca de empresas, e pode ficar na tela inicial como um app. Só o disparo automático em massa no WhatsApp usa um programa opcional para Windows.',
    },
    {
      q: 'De onde vêm os leads?',
      a: 'Da busca da própria XS: uma base aberta com milhões de comércios do Brasil, quase todos com telefone, ou o Google Maps com a sua própria chave grátis do Google. Escolha a cidade, o bairro e o tipo de negócio, e as empresas entram na sua lista. Ou de onde você já tem: planilha (CSV), linhas coladas do Excel ou do Google Planilhas, ou cadastro à mão.',
    },
    {
      q: 'Meus dados ficam guardados?',
      a: (
        <>
          Sim. Ficam num banco de dados em São Paulo e cada conta só acessa os próprios dados. Você pode exportar um backup quando quiser. Os detalhes estão
          na{' '}
          <a href="/privacidade" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
            Política de Privacidade
          </a>
          .
        </>
      ),
    },
    {
      q: 'Como funciona o teste grátis?',
      a: 'Você tem 1 dia com tudo liberado, inclusive a busca de empresas e o WhatsApp, sem cartão de crédito. Quando o teste termina, seus leads continuam guardados e você decide se quer continuar.',
    },
    {
      q: 'Funciona para outros serviços além de sites?',
      a: 'Funciona para qualquer serviço vendido para empresas: tráfego pago, social media, identidade visual, sistemas. Os roteiros, mensagens e objeções são seus, e você ajusta como quiser.',
    },
  ]
  return (
    <section id="perguntas" aria-labelledby="perguntas-t" className="scroll-mt-16 border-t border-line-soft">
      <div className={clsx(WRAP, 'grid gap-14 py-24 sm:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,640px)] lg:gap-20')}>
        <div className="reveal">
          <Eyebrow>Perguntas</Eyebrow>
          <h2 id="perguntas-t" className={clsx(H2, 'mt-4')}>
            Antes de testar.
          </h2>
          <div className="mt-10 max-w-[380px] border-l border-line pl-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <MonitorSmartphone className="size-4 text-fg-3" aria-hidden /> Nada para instalar
            </p>
            <p className="mt-2 text-[13px] leading-6 text-fg-2">
              Busca de empresas, ligações, leads e gestão funcionam direto no navegador, no PC ou no celular. A busca traz as empresas na hora.
            </p>
          </div>
        </div>
        <div className="reveal border-t border-line-soft" style={delay(100)}>
          {items.map((it) => (
            <FaqItem key={it.q} q={it.q} a={it.a} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="border-b border-line-soft">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          id={`${id}-q`}
          className="group flex w-full items-center gap-4 py-5 text-left text-[15px] font-medium text-fg"
        >
          <span className="flex-1">{q}</span>
          <Plus className={clsx('size-4 shrink-0 text-fg-3 transition-transform duration-300 group-hover:text-fg-2', open && 'rotate-45')} aria-hidden />
        </button>
      </h3>
      {/* Abre deslizando (grid 0fr → 1fr) */}
      <div
        id={`${id}-a`}
        role="region"
        aria-labelledby={`${id}-q`}
        className={clsx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden" inert={!open}>
          <p className="max-w-[560px] pr-8 pb-6 text-sm leading-6 text-fg-2">{a}</p>
        </div>
      </div>
    </div>
  )
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-t" className="relative border-t border-line-soft">
      <div className="land-glow-end" aria-hidden />
      <div className={clsx(WRAP, 'flex flex-col items-center py-28 text-center sm:py-36')}>
        <LogoMark size={40} className="reveal opacity-90" />
        <h2 id="cta-t" className="font-display reveal mt-8 max-w-[680px] text-balance text-[clamp(2rem,1.2rem+3vw,3.25rem)] leading-[1.05]" style={delay(60)}>
          Seu próximo cliente está a uma busca de distância.
        </h2>
        <p className="reveal mt-5 max-w-[440px] text-base leading-7 text-pretty text-fg-2" style={delay(120)}>
          Crie sua conta, encontre empresas, organize sua prospecção e teste a XS durante 1 dia.
        </p>
        <div className="reveal mt-9 flex w-full flex-col items-center gap-4 sm:w-auto" style={delay(180)}>
          <PrimaryCta className="w-full sm:w-auto" />
          <p className="text-xs text-fg-2/70">Sem cartão de crédito.</p>
        </div>
      </div>
    </section>
  )
}
