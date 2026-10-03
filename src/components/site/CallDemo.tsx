import clsx from 'clsx'
import { CalendarClock, Check, PhoneOff, PhoneOutgoing, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

type Result = 'atendeu' | 'nao_atendeu' | 'retornar'

// Leads de exemplo (fictícios) que a janela do Modo Ligação vai mostrando
const DEMO: { empresa: string; info: string; ultimo: string; horario: string; tentativa: string; fala: string; result: Result; aviso: string }[] = [
  {
    empresa: 'Barbearia Navalha',
    info: 'Barbearia · Centro',
    ultimo: 'Ontem, não atendeu',
    horario: '14h – 16h',
    tentativa: '2ª',
    fala: 'Oi, tudo bem? Aqui é o Rafael. Vi a Barbearia Navalha no Google e reparei que vocês ainda não têm site. Posso te mostrar em dois minutos como isso traz cliente novo?',
    result: 'retornar',
    aviso: 'Retorno marcado para hoje, 16:30',
  },
  {
    empresa: 'Pet Shop Amigo',
    info: 'Pet shop · Jardim Europa',
    ultimo: 'Nenhum ainda',
    horario: '9h – 11h',
    tentativa: '1ª',
    fala: 'Bom dia! Aqui é o Rafael. Quem procura pet shop no Google escolhe pelo que aparece primeiro. Vocês já pensaram em ter um site para agendar banho e tosa?',
    result: 'nao_atendeu',
    aviso: 'Nova tentativa marcada para amanhã à tarde',
  },
  {
    empresa: 'Clínica Sorriso',
    info: 'Dentista · Cambuí',
    ultimo: 'Há 2 dias, pediu retorno',
    horario: '13h – 14h',
    tentativa: '3ª',
    fala: 'Olá, Dra. Ana! Retornando como combinamos. Separei três exemplos de site de clínica que trazem paciente pelo Google. Posso te mandar agora no WhatsApp?',
    result: 'atendeu',
    aviso: 'Ligação registrada no histórico do lead',
  },
]

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Só anima enquanto a janela está na tela (e a aba está aberta). */
function useActive(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return inView && visible
}

/** Texto aparecendo como se estivesse sendo lido na hora. */
function useTypewriter(text: string, active: boolean, speed = 22) {
  const [st, setSt] = useState(() => ({ text, n: reducedMotion() ? text.length : 0 }))
  useEffect(() => {
    if (reducedMotion()) return setSt({ text, n: text.length })
    setSt((s) => (s.text === text ? s : { text, n: 0 }))
  }, [text])
  useEffect(() => {
    if (!active || reducedMotion()) return
    const id = setInterval(() => setSt((s) => (s.text === text && s.n < text.length ? { text, n: s.n + 1 } : s)), speed)
    return () => clearInterval(id)
  }, [text, speed, active])
  const n = st.text === text ? st.n : 0
  return { shown: text.slice(0, n), done: n >= text.length }
}

/** Janela do Modo Ligação desenhada em HTML (sem imagem), com uma pequena demonstração. */
export function CallDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const active = useActive(ref)
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<Result | null>(null)
  const lead = DEMO[i]
  const { shown, done } = useTypewriter(lead.fala, active)

  // Terminou a fala: registra o resultado, mostra o aviso e passa para o próximo lead
  useEffect(() => {
    if (!done || !active || reducedMotion()) return
    if (!chosen) {
      const t = setTimeout(() => setChosen(lead.result), 1100)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setChosen(null)
      setI((v) => (v + 1) % DEMO.length)
    }, 2600)
    return () => clearTimeout(t)
  }, [done, active, chosen, lead.result])

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-xl border border-line bg-panel shadow-[0_32px_64px_-40px_rgba(0,0,0,0.9)]" aria-hidden>
      <div className="flex h-11 items-center gap-3 border-b border-line-soft px-4">
        <span className="text-xs font-semibold text-fg">Modo Ligação</span>
        <span className="num truncate text-xs text-fg-3">
          Fila de hoje · <span className="text-fg-2">{8 + i}</span> de 32
        </span>
        <span className="num ml-auto hidden items-center gap-2 text-2xs text-fg-3 sm:flex">
          Hoje
          <span className="relative h-1 w-16 overflow-hidden rounded-full bg-line">
            <span className="absolute inset-y-0 left-0 rounded-full bg-gold/80 transition-[width] duration-700" style={{ width: `${((11 + i) / 40) * 100}%` }} />
          </span>
          <span>
            <span className="text-fg-2">{11 + i}</span>/40
          </span>
        </span>
      </div>

      <div key={i} className="anim-fade grid sm:grid-cols-[184px_minmax(0,1fr)]">
        <div className="border-b border-line-soft px-4 py-4 sm:border-r sm:border-b-0 sm:px-5 sm:py-5">
          <p className="text-[15px] leading-5 font-semibold tracking-[-0.01em] text-fg">{lead.empresa}</p>
          <p className="mt-1 text-2xs text-fg-3">{lead.info}</p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-2xs sm:mt-6 sm:grid-cols-1 sm:gap-3.5">
            <Fact label="Último contato">{lead.ultimo}</Fact>
            <Fact label="Melhor horário">{lead.horario}</Fact>
            <Fact label="Tentativa">{lead.tentativa}</Fact>
          </dl>
        </div>

        <div className="flex flex-col px-4 py-4 sm:px-5 sm:py-5">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Roteiro · abertura</p>
          {/* O texto inteiro (invisível) reserva a altura: a janela não pula enquanto digita */}
          <p className="relative mt-2.5 text-[13px] leading-6 text-fg-2">
            <span className="invisible">“{lead.fala}”</span>
            <span className="absolute inset-0">
              “{shown}
              {done ? '”' : <span className="caret text-accent" />}
            </span>
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <ResultButton icon={<PhoneOutgoing />} tone="go" pressed={chosen === 'atendeu'}>
              Atendeu
            </ResultButton>
            <ResultButton icon={<PhoneOff />} pressed={chosen === 'nao_atendeu'}>
              Não atendeu
            </ResultButton>
            <ResultButton icon={<RotateCcw />} pressed={chosen === 'retornar'}>
              Retornar
            </ResultButton>
          </div>
        </div>
      </div>

      <div className="flex h-10 items-center gap-2 border-t border-line-soft px-4 text-2xs">
        {chosen ? (
          <span key={`${i}-ok`} className="anim-rise flex min-w-0 items-center gap-2 text-fg-2">
            {chosen === 'atendeu' ? <Check className="size-3.5 shrink-0 text-go" /> : <CalendarClock className="size-3.5 shrink-0 text-sky-300" />}
            <span className="truncate">{lead.aviso}</span>
          </span>
        ) : (
          <span className="truncate text-fg-3">Próximo: {DEMO[(i + 1) % DEMO.length].empresa}</span>
        )}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-3">{label}</dt>
      <dd className="num mt-0.5 font-medium text-fg">{children}</dd>
    </div>
  )
}

function ResultButton({ children, icon, tone, pressed }: { children: ReactNode; icon: ReactNode; tone?: 'go'; pressed?: boolean }) {
  return (
    <div
      className={clsx(
        'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-1 text-2xs font-semibold whitespace-nowrap transition-colors duration-200 [&>svg]:size-3.5 [&>svg]:shrink-0 max-[420px]:[&>svg]:hidden',
        tone === 'go' ? 'bg-go text-[#04140c]' : 'border text-fg-2',
        tone !== 'go' && (pressed ? 'border-line-strong bg-hover text-fg' : 'border-line bg-raised'),
        pressed && 'press',
        pressed && tone === 'go' && 'bg-go-strong',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </div>
  )
}
