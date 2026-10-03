import clsx from 'clsx'
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Calculator,
  ChartColumn,
  Check,
  ChevronDown,
  FolderKanban,
  Headphones,
  MapPinned,
  MessageCircle,
  PhoneOff,
  PhoneOutgoing,
  RotateCcw,
  Send,
  Smartphone,
  Sun,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Brand'

/** Página pública do XS: quem ainda não entrou chega aqui. */
export function LandingPage() {
  return (
    <div className="min-h-dvh bg-ink text-fg">
      <Nav />
      <main>
        <Hero />
        <Steps />
        <Features />
        <ForSites />
        <Faq />
        <FinalCta />
      </main>
      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-2xs text-fg-4 sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark size={20} /> XS Prospecção
          </span>
          <span>Prospecção por ligação para quem vende sites e serviços digitais.</span>
        </div>
      </footer>
    </div>
  )
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-5 text-xs text-fg-3 md:flex">
          <a href="#como-funciona" className="hover:text-fg">
            Como funciona
          </a>
          <a href="#recursos" className="hover:text-fg">
            Recursos
          </a>
          <a href="#perguntas" className="hover:text-fg">
            Perguntas
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/entrar" className="rounded-md px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg">
            Entrar
          </Link>
          <Link to="/criar-conta" className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3b7bf6]">
            Testar grátis
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="border-b border-line-soft">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-2xs font-medium text-fg-2">
            <span className="size-1.5 rounded-full bg-go" /> Para quem vende sites e serviços digitais
          </p>
          <h1 className="text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] sm:text-[56px]">
            Do primeiro alô
            <br />
            ao cliente fechado.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-fg-2">
            Organize seus leads, ligue com o roteiro na tela, não perca nenhum retorno e acompanhe clientes, projetos e dinheiro num app só. No PC ou no celular.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/criar-conta" className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-[#3b7bf6]">
              Testar 1 dia grátis <ArrowRight className="size-4" />
            </Link>
            <Link to="/entrar" className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-sm font-medium text-fg-2 hover:border-line-strong hover:text-fg">
              Já tenho conta
            </Link>
          </div>
          <p className="mt-4 text-2xs text-fg-4">Um dia com tudo liberado. Sem cartão de crédito.</p>
        </div>
        <CallMock />
      </div>
    </section>
  )
}

/** Retrato do Modo Ligação, desenhado em HTML (sem imagem). */
function CallMock() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-hidden>
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
          <Headphones className="size-3.5 text-blue-400" />
          <span className="text-2xs font-medium text-fg-2">Modo ligação</span>
          <span className="num ml-auto text-2xs text-fg-4">7 de 32 · hoje</span>
        </div>
        <div className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-raised text-sm font-semibold text-fg-2">BN</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Barbearia Navalha</p>
              <p className="text-2xs text-fg-3">Barbearia · Centro · 4,8 ★ (212)</p>
            </div>
            <span className="rounded bg-emerald-500/10 px-1.5 text-2xs leading-5 font-medium text-emerald-300">sem site</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MockStat label="Tentativa" value="2ª" />
            <MockStat label="Último contato" value="ontem" />
            <MockStat label="Melhor horário" value="14h–16h" />
          </div>
          <div className="rounded-lg border border-line-soft bg-ink p-3">
            <p className="mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-fg-4 uppercase">Roteiro · abertura</p>
            <p className="text-xs leading-5 text-fg-2">
              “Oi, tudo bem? Aqui é o <span className="text-fg">Rafael</span>. Vi a <span className="text-fg">Barbearia Navalha</span> no Google e reparei que vocês ainda não têm site. Posso te mostrar em 2 minutos como
              isso traz cliente novo?”
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MockButton tone="go" icon={<PhoneOutgoing />}>
              Atendeu
            </MockButton>
            <MockButton icon={<PhoneOff />}>Não atendeu</MockButton>
            <MockButton icon={<RotateCcw />}>Retornar</MockButton>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -bottom-5 hidden w-56 rounded-lg border border-line bg-raised p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] sm:block">
        <p className="flex items-center gap-1.5 text-2xs font-medium text-sky-300">
          <CalendarClock className="size-3.5" /> Retorno às 15:00
        </p>
        <p className="mt-1 text-2xs text-fg-3">Pet Shop Amigo · falar com a Carla</p>
      </div>
    </div>
  )
}

function MockStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
      <p className="text-[10px] text-fg-4">{label}</p>
      <p className="num text-xs font-semibold">{value}</p>
    </div>
  )
}

function MockButton({ children, icon, tone }: { children: ReactNode; icon: ReactNode; tone?: 'go' }) {
  return (
    <div
      className={clsx(
        'flex h-9 items-center justify-center gap-1.5 rounded-md text-2xs font-semibold [&>svg]:size-3.5',
        tone === 'go' ? 'bg-go text-[#04140c]' : 'border border-line bg-raised text-fg-2',
      )}
    >
      {icon}
      {children}
    </div>
  )
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="mb-3 text-2xs font-semibold tracking-[0.1em] text-blue-300 uppercase">{eyebrow}</p>
      <h2 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[34px]">{title}</h2>
      {children && <p className="mt-3 text-sm leading-6 text-fg-2">{children}</p>}
    </div>
  )
}

function Steps() {
  const steps = [
    { icon: <MapPinned />, title: 'Ache os leads', text: 'Busque empresas no Google Maps por cidade e nicho, ou traga a sua planilha. Quem já está na lista é pulado.' },
    { icon: <Headphones />, title: 'Ligue em sequência', text: 'Um lead atrás do outro, com roteiro e respostas para as objeções. Registrar o resultado leva um clique.' },
    { icon: <FolderKanban />, title: 'Feche e acompanhe', text: 'Reunião marcada, cliente fechado, projeto andando e pagamento recebido, tudo ligado ao mesmo lead.' },
  ]
  return (
    <section id="como-funciona" className="scroll-mt-14 border-b border-line-soft">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHead eyebrow="Como funciona" title="Três passos, todo dia." />
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-panel p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300 [&>svg]:size-[18px]">{s.icon}</span>
                <span className="num text-xs text-fg-4">0{i + 1}</span>
              </div>
              <h3 className="text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-xs leading-5 text-fg-3">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Features() {
  const items = [
    { icon: <MapPinned />, title: 'Busca no Maps', text: 'Empresas da sua cidade com telefone, site, Instagram e o sócio pelo CNPJ. Filtre só quem não tem site.' },
    { icon: <Send />, title: 'Disparo no WhatsApp', text: 'Funis de mensagens com intervalo entre envios, mensagens agendadas e as respostas no histórico do lead.' },
    { icon: <Sun />, title: 'Hoje', text: 'A fila do dia montada sozinha: retornos, reuniões, quem tentar de novo e leads novos.' },
    { icon: <RotateCcw />, title: 'Tentativas automáticas', text: 'Não atendeu de manhã? O retorno já fica marcado para a tarde do dia seguinte.' },
    { icon: <MessageCircle />, title: 'WhatsApp com modelos', text: 'Mensagens prontas com o nome da empresa e do responsável, abertas no seu WhatsApp.' },
    { icon: <BadgeDollarSign />, title: 'Clientes e financeiro', text: 'Mensalidades, pagamentos e o que entrou no mês, sem planilha paralela.' },
    { icon: <Calculator />, title: 'Precificação', text: 'Quanto cobrar para pagar os custos, os impostos e ainda sobrar lucro.' },
    { icon: <ChartColumn />, title: 'Números', text: 'Taxa de contato, melhores horários e quanto falta para a meta do dia.' },
  ]
  return (
    <section id="recursos" className="scroll-mt-14 border-b border-line-soft">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHead eyebrow="Recursos" title="Feito para a mesa de prospecção, não para um CRM genérico.">
          Cada tela existe para você fazer mais ligações boas e não esquecer ninguém.
        </SectionHead>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <div key={f.title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-fg-2 [&>svg]:size-4">{f.icon}</span>
              <div>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-3">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ForSites() {
  const points = [
    'Filtro de empresas sem site, para atacar primeiro quem mais precisa',
    'Roteiro e objeções de venda de site já prontos para ajustar',
    'Do lead ao projeto: entrada de 50%, prazo e etapas do site',
    'Funciona no celular como app, para ligar de qualquer lugar',
  ]
  return (
    <section className="border-b border-line-soft">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
        <SectionHead eyebrow="Para quem vende site" title="Pensado para quem vive de vender site para empresa local." />
        <ul className="space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 rounded-lg border border-line-soft bg-panel px-4 py-3 text-sm text-fg-2">
              <Check className="mt-0.5 size-4 shrink-0 text-go" /> {p}
            </li>
          ))}
          <li className="flex items-start gap-3 px-4 pt-1 text-2xs text-fg-4">
            <Smartphone className="mt-px size-3.5 shrink-0" /> Instale pelo navegador: ícone na tela inicial, abre em tela cheia.
          </li>
        </ul>
      </div>
    </section>
  )
}

function Faq() {
  const items = [
    { q: 'Preciso instalar alguma coisa?', a: 'Para ligar, organizar e gerir, não: o XS funciona no navegador do PC e do celular. Para buscar empresas no Maps e disparar no WhatsApp, você baixa o Motor XS no Windows (um arquivo só, abre com dois cliques).' },
    { q: 'De onde vêm os leads?', a: 'Da busca no Google Maps do próprio XS, ou de onde você já tem: planilha (CSV), linhas coladas do Excel ou do Google Planilhas, ou cadastro à mão.' },
    { q: 'Meus dados ficam guardados?', a: 'Sim, na nuvem e protegidos. Cada conta só enxerga os próprios leads e a própria gestão. Você pode baixar um backup quando quiser.' },
    { q: 'Como funciona o teste grátis?', a: 'Você tem 1 dia com tudo liberado, inclusive a busca no Maps e o WhatsApp, sem cartão. No fim do teste você escolhe se quer continuar.' },
    { q: 'Funciona para outros serviços além de site?', a: 'Funciona para qualquer serviço vendido por ligação: tráfego pago, social media, identidade visual, sistemas. O roteiro é seu.' },
  ]
  return (
    <section id="perguntas" className="scroll-mt-14 border-b border-line-soft">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <SectionHead eyebrow="Perguntas" title="Antes de testar." />
        <div className="divide-y divide-line-soft rounded-xl border border-line bg-panel">
          {items.map((it) => (
            <FaqItem key={it.q} q={it.q} a={it.a} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-fg hover:text-fg">
        <span className="flex-1">{q}</span>
        <ChevronDown className={clsx('size-4 shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="-mt-1 px-5 pb-4 text-xs leading-5 text-fg-3">{a}</p>}
    </div>
  )
}

function FinalCta() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-line bg-panel p-8 sm:p-12 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[30px]">Sua próxima venda está numa ligação.</h2>
            <p className="mt-2 text-sm text-fg-3">Crie a conta em 1 minuto e faça a primeira ligação hoje.</p>
          </div>
          <Link to="/criar-conta" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-[#3b7bf6]">
            Testar 1 dia grátis <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
