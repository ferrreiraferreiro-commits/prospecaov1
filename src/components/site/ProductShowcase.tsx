import clsx from 'clsx'
import { CalendarCheck, CalendarClock, Check, CheckCheck, ChevronDown, Loader2, MousePointerClick, Phone, RotateCcw, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const FEATURES = [
  {
    id: 'maps',
    tab: 'Busca',
    title: 'Busca de empresas',
    text: 'Encontre empresas por cidade, bairro e nicho e filtre as oportunidades, como quem tem celular e ainda não tem site. Tudo entra direto na sua lista.',
    Mock: MapsMock,
  },
  {
    id: 'ligacao',
    tab: 'Ligação',
    title: 'Modo Ligação',
    text: 'Roteiro, objeções, informações do lead e resultado da ligação na mesma tela.',
    Mock: CallMock,
  },
  {
    id: 'retornos',
    tab: 'Retornos',
    title: 'Retornos e agenda',
    text: 'Quem precisa ser contatado de novo aparece no momento certo, junto com as reuniões do dia.',
    Mock: TodayMock,
  },
  {
    id: 'whatsapp',
    tab: 'WhatsApp',
    title: 'WhatsApp',
    text: 'Continue a conversa com modelos prontos e mantenha o histórico ligado ao lead.',
    Mock: WhatsAppMock,
  },
]

/** Uma composição só: a lista de funções à esquerda e a tela correspondente, clicável, à direita. */
export function ProductShowcase() {
  const [active, setActive] = useState(0)
  const f = FEATURES[active]
  return (
    <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
      {/* PC: lista vertical com descrição */}
      <div className="hidden border-l border-line lg:block" role="group" aria-label="Funções da XS">
        {FEATURES.map((it, i) => (
          <button key={it.id} type="button" aria-pressed={i === active} onClick={() => setActive(i)} className="group relative block w-full py-5 pr-2 pl-7 text-left">
            <span className={clsx('absolute top-0 -left-px h-full w-px transition-colors duration-300', i === active ? 'bg-accent' : 'bg-transparent')} />
            <span className={clsx('block text-[15px] font-semibold transition-colors', i === active ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')}>{it.title}</span>
            <span className={clsx('mt-1.5 block text-[13px] leading-6 transition-colors', i === active ? 'text-fg-2' : 'text-fg-3')}>{it.text}</span>
          </button>
        ))}
      </div>

      {/* Celular: abas curtas e a descrição da aba aberta */}
      <div className="lg:hidden">
        <div className="grid grid-cols-4 gap-1 rounded-lg border border-line-soft bg-panel p-1" role="group" aria-label="Funções da XS">
          {FEATURES.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={clsx('h-9 rounded-md text-xs font-medium transition-colors', i === active ? 'bg-raised text-fg' : 'text-fg-3 hover:text-fg-2')}
            >
              {it.tab}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[15px] font-semibold">{f.title}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{f.text}</p>
      </div>

      <div className="min-w-0">
        <div className="lg:min-h-[500px]">
          <div key={f.id} className="anim-fade">
            <f.Mock />
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-2xs text-fg-3">
          <MousePointerClick className="size-3.5" aria-hidden /> Demonstração com dados de exemplo. Pode clicar.
        </p>
      </div>
    </div>
  )
}

/** Agenda timeouts e cancela todos quando o painel sai da tela. */
function useTimers() {
  const ids = useRef<number[]>([])
  useEffect(() => () => ids.current.forEach((id) => window.clearTimeout(id)), [])
  return {
    after(ms: number, fn: () => void) {
      ids.current.push(window.setTimeout(fn, ms))
    },
    clear() {
      ids.current.forEach((id) => window.clearTimeout(id))
      ids.current = []
    },
  }
}

const nowHM = (plusMin = 0) => new Date(Date.now() + plusMin * 60_000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function Frame({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div role="region" aria-label={`Demonstração: ${title}`} className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_32px_64px_-40px_rgba(0,0,0,0.9)]">
      <div className="flex h-11 items-center gap-3 border-b border-line-soft px-4">
        <span className="shrink-0 text-xs font-semibold text-fg">{title}</span>
        {meta && <span className="ml-auto min-w-0 truncate text-2xs text-fg-3">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

/** Botão pequeno de escolha (nichos, filtros, resultados…). */
function Pick({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'rounded-md border px-2 py-1.5 text-2xs transition-colors',
        on ? 'border-accent/50 bg-accent/15 text-fg' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Tag({ children, tone }: { children: ReactNode; tone?: 'go' | 'muted' }) {
  return (
    <span className={clsx('shrink-0 rounded px-1.5 text-2xs leading-5 font-medium', tone === 'go' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-tint/[0.05] text-fg-3')}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Busca de empresas
// ---------------------------------------------------------------------------

type Place = { nome: string; bairro: string; cel: boolean; site: boolean; base: boolean; insta: boolean; socio: boolean }

const PLACES: Record<string, Place[]> = {
  Dentista: [
    { nome: 'Clínica Sorriso Leve', bairro: 'Cambuí', cel: true, site: false, base: false, insta: true, socio: true },
    { nome: 'Odonto Vida', bairro: 'Centro', cel: true, site: false, base: false, insta: true, socio: false },
    { nome: 'Instituto Dental Norte', bairro: 'Taquaral', cel: true, site: true, base: false, insta: true, socio: true },
    { nome: 'Sorriso Kids', bairro: 'Guanabara', cel: false, site: false, base: true, insta: false, socio: false },
    { nome: 'Consultório Bem Estar', bairro: 'Castelo', cel: false, site: false, base: false, insta: false, socio: true },
  ],
  Barbearia: [
    { nome: 'Barbearia Navalha', bairro: 'Centro', cel: true, site: false, base: true, insta: true, socio: false },
    { nome: 'Dom Bigode', bairro: 'Cambuí', cel: true, site: true, base: false, insta: true, socio: true },
    { nome: 'Corte Fino', bairro: 'Bosque', cel: false, site: false, base: false, insta: true, socio: true },
    { nome: 'Barbearia do Zé', bairro: 'Taquaral', cel: true, site: false, base: false, insta: false, socio: false },
  ],
  'Pet shop': [
    { nome: 'Pet Shop Amigo', bairro: 'Jardim Europa', cel: false, site: false, base: false, insta: true, socio: true },
    { nome: 'Banho & Tosa Patinhas', bairro: 'Cambuí', cel: true, site: false, base: false, insta: true, socio: false },
    { nome: 'Mundo Pet', bairro: 'Centro', cel: false, site: true, base: false, insta: true, socio: true },
    { nome: 'Cão Feliz', bairro: 'Guanabara', cel: false, site: false, base: true, insta: false, socio: false },
  ],
}

function MapsMock() {
  const [nicho, setNicho] = useState('Dentista')
  const [semSite, setSemSite] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const timers = useTimers()

  // Simula a busca: em menos de um segundo os resultados aparecem
  const search = (n = nicho) => {
    timers.clear()
    setNicho(n)
    setOpen(null)
    setBusy(true)
    setProgress(0)
    for (let s = 1; s <= 19; s++) timers.after(s * 35, () => setProgress(s))
    timers.after(19 * 35 + 120, () => setBusy(false))
  }

  const rows = PLACES[nicho].filter((p) => !semSite || !p.site)
  const novos = rows.filter((p) => !p.base).length

  return (
    <Frame
      title="Buscar empresas"
      meta={
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-go" /> Resultado na hora
        </span>
      }
    >
      <div className="space-y-3 border-b border-line-soft p-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Onde">Campinas - SP · 5 km</Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => search()}
              disabled={busy}
              className="flex h-[30px] items-center gap-1.5 rounded-md bg-blue-600 px-3 text-2xs font-semibold text-white transition-colors hover:bg-[#3b7bf6] disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Buscar
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-2xs text-fg-3">Nicho</span>
          {Object.keys(PLACES).map((n) => (
            <Pick key={n} on={nicho === n} onClick={() => search(n)}>
              {n}
            </Pick>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-2xs text-fg-3">Filtros</span>
          <span className="rounded-md border border-accent/50 bg-accent/15 px-2 py-1.5 text-2xs text-fg">Com telefone</span>
          <Pick on={semSite} onClick={() => setSemSite((v) => !v)}>
            Só sem site
          </Pick>
        </div>
      </div>

      {busy ? (
        <div className="px-4 py-10">
          <div className="mx-auto max-w-[260px]">
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${(progress / 19) * 100}%` }} />
            </div>
            <p className="num mt-3 text-center text-2xs text-fg-3">
              Buscando na base do CNPJ · Campinas - SP
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => {
            const isOpen = open === r.nome
            return (
              <li key={r.nome} className={clsx(r.base && 'opacity-60')}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.nome)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tint/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-fg">{r.nome}</p>
                    <p className="truncate text-2xs text-fg-3">
                      {nicho} · {r.bairro}
                    </p>
                  </div>
                  <span className={clsx('hidden text-2xs sm:inline', r.cel ? 'text-emerald-300' : 'text-fg-3')}>{r.cel ? 'celular' : 'fixo'}</span>
                  {r.base ? <Tag>já na lista</Tag> : r.site ? <Tag>tem site</Tag> : <Tag tone="go">sem site</Tag>}
                  <ChevronDown className={clsx('size-3.5 shrink-0 text-fg-3 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="anim-fade flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-3 text-2xs">
                    <Have ok>Telefone</Have>
                    <Have ok={r.insta}>Instagram</Have>
                    <Have ok={r.site}>Site</Have>
                    <Have ok={r.socio}>Sócio pelo CNPJ</Have>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="border-t border-line-soft px-4 py-3 text-2xs text-fg-2">
        {busy ? 'Conferindo telefone, site e Instagram de cada empresa…' : `${novos} novos entraram nos seus leads · ${rows.length - novos} já estava${rows.length - novos === 1 ? '' : 'm'} na lista`}
      </div>
    </Frame>
  )
}

function Have({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <span className={clsx('flex items-center gap-1', ok ? 'text-fg-2' : 'text-fg-3 line-through decoration-fg-4')}>
      {ok ? <Check className="size-3 text-go" /> : <span className="size-3" />}
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-2xs text-fg-3">{label}</p>
      <p className="truncate rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-fg">{children}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modo Ligação
// ---------------------------------------------------------------------------

const CALL_LEADS = [
  { empresa: 'Clínica Sorriso Leve', pessoa: 'Dra. Ana', bairro: 'Cambuí', tentativa: '3ª' },
  { empresa: 'Odonto Vida', pessoa: 'Marcos', bairro: 'Centro', tentativa: '1ª' },
  { empresa: 'Consultório Bem Estar', pessoa: 'Dra. Paula', bairro: 'Castelo', tentativa: '2ª' },
]

const STEPS = [
  { id: 'Abertura', fala: (l: (typeof CALL_LEADS)[number]) => `Oi, tudo bem? Aqui é o Rafael. Falo com ${l.pessoa}? Vi a ${l.empresa} no Google e queria te mostrar uma coisa rápida, pode ser?` },
  { id: 'Diagnóstico', fala: (l: (typeof CALL_LEADS)[number]) => `Hoje, quando alguém procura dentista no ${l.bairro}, vocês aparecem? E quando a pessoa clica, encontra o quê: um Instagram ou um site com horários e convênios?` },
  { id: 'Proposta', fala: () => 'Eu monto o site em poucos dias, com agendamento pelo WhatsApp. Posso te mandar dois exemplos agora e a gente conversa na quinta?' },
]

const OBJECTIONS = [
  { q: 'Já tenho Instagram', a: 'O Instagram é ótimo para quem já te segue. O site é para quem ainda não te conhece e está procurando no Google agora.' },
  { q: 'Quanto custa?', a: 'Depende do que você precisa. Te mando dois modelos com valores e você vê se faz sentido, sem compromisso.' },
  { q: 'Me manda no WhatsApp', a: 'Claro! Já te mando os exemplos. Qual o melhor horário para eu te ligar e explicar em dois minutos?' },
]

const RESULTS = ['Não atendeu', 'Falei com alguém', 'Pediu WhatsApp', 'Pediu retorno', 'Agendou reunião', 'Não tem interesse'] as const
type CallResult = (typeof RESULTS)[number]

function CallMock() {
  const [lead, setLead] = useState(0)
  const [step, setStep] = useState(1)
  const [obj, setObj] = useState<number | null>(0)
  const [result, setResult] = useState<CallResult | null>(null)
  const [quando, setQuando] = useState('Quinta, 10:00')
  const [motivo, setMotivo] = useState('Já tem site')
  const [saved, setSaved] = useState<string | null>(null)
  const timers = useTimers()
  const l = CALL_LEADS[lead]

  const save = () => {
    if (!result) return
    const next = (lead + 1) % CALL_LEADS.length
    setSaved(`${result} · salvo no histórico de ${l.empresa}`)
    timers.after(900, () => {
      setLead(next)
      setResult(null)
      setStep(0)
      setObj(null)
      setSaved(null)
    })
  }

  return (
    <Frame title="Modo Ligação" meta={`${l.empresa} · ${l.tentativa} tentativa`}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="border-b border-line-soft p-4 md:border-r md:border-b-0 md:p-5">
          <div className="flex gap-4 border-b border-line-soft text-2xs" role="group" aria-label="Etapas do roteiro">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={i === step}
                onClick={() => setStep(i)}
                className={clsx('-mb-px border-b pb-2 transition-colors', i === step ? 'border-accent text-fg' : 'border-transparent text-fg-3 hover:text-fg-2')}
              >
                {s.id}
              </button>
            ))}
          </div>
          <p key={`${lead}-${step}`} className="anim-fade mt-4 min-h-[96px] text-[13px] leading-6 text-fg-2">
            “{STEPS[step].fala(l)}”
          </p>
          <p className="mt-4 mb-2 text-[10px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Objeções</p>
          <div className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {OBJECTIONS.map((o, i) => (
              <div key={o.q}>
                <button
                  type="button"
                  aria-expanded={obj === i}
                  onClick={() => setObj(obj === i ? null : i)}
                  className={clsx('flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-colors hover:text-fg', obj === i ? 'font-medium text-fg' : 'text-fg-2')}
                >
                  {o.q} <ChevronDown className={clsx('size-3.5 text-fg-3 transition-transform', obj === i && 'rotate-180')} />
                </button>
                {obj === i && <p className="anim-fade -mt-1 px-3 pb-2.5 text-2xs leading-5 text-fg-2">{o.a}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col p-4 md:p-5">
          <p className="mb-2.5 text-xs font-semibold text-fg-2">Como foi a ligação?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {RESULTS.map((r) => (
              <Pick key={r} on={result === r} onClick={() => setResult(r)} className="truncate px-1.5 text-center">
                {r}
              </Pick>
            ))}
          </div>

          <div key={result ?? 'nada'} className="anim-fade mt-4 min-h-[86px]">
            {!result && <p className="text-2xs leading-5 text-fg-3">Escolha um resultado. O próximo passo aparece aqui.</p>}
            {result === 'Não atendeu' && <Note icon={<RotateCcw className="text-yellow-200/70" />}>Nova tentativa marcada sozinha para amanhã à tarde.</Note>}
            {result === 'Falei com alguém' && <Line label="Falei com">Recepção · pediu para ligar de manhã</Line>}
            {result === 'Pediu WhatsApp' && <Note icon={<Check className="text-go" />}>A mensagem “Depois da ligação” abre pronta, com o nome de {l.pessoa}.</Note>}
            {result === 'Pediu retorno' && (
              <>
                <p className="mb-1.5 text-2xs text-fg-3">Retornar em</p>
                <div className="flex flex-wrap gap-1">
                  {['Amanhã, 10:00', 'Quinta, 10:00', 'Próx. semana'].map((q) => (
                    <Pick key={q} on={quando === q} onClick={() => setQuando(q)}>
                      {q}
                    </Pick>
                  ))}
                </div>
              </>
            )}
            {result === 'Agendou reunião' && <Line label="Reunião">Sexta, 15:00 · por vídeo</Line>}
            {result === 'Não tem interesse' && (
              <>
                <p className="mb-1.5 text-2xs text-fg-3">Motivo</p>
                <div className="flex flex-wrap gap-1">
                  {['Já tem site', 'Sem verba', 'Outro'].map((m) => (
                    <Pick key={m} on={motivo === m} onClick={() => setMotivo(m)}>
                      {m}
                    </Pick>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!result || !!saved}
            className="mt-4 flex h-8 items-center justify-center rounded-md bg-blue-600 text-2xs font-semibold text-white transition-colors hover:bg-[#3b7bf6] disabled:opacity-40"
          >
            Salvar e ir para o próximo
          </button>
          <p className={clsx('mt-2 min-h-4 text-2xs', saved ? 'text-go' : 'text-transparent')} aria-live="polite">
            {saved ?? '.'}
          </p>
        </div>
      </div>
    </Frame>
  )
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-2 text-2xs leading-5 text-fg-2 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </p>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <p className="mb-1 text-2xs text-fg-3">{label}</p>
      <p className="rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-fg">{children}</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Retornos (Para hoje)
// ---------------------------------------------------------------------------

const TODAY = [
  { id: 'r1', grupo: 'Retornos', time: '10:00', name: 'Clínica Sorriso Leve', detail: 'Pediu retorno · falar com a Dra. Ana' },
  { id: 'r2', grupo: 'Retornos', time: '15:30', name: 'Pet Shop Amigo', detail: 'Pediu retorno · depois do almoço' },
  { id: 't1', grupo: 'Tentar novamente', name: 'Barbearia Navalha', detail: 'Não atendeu ontem de manhã · 2ª tentativa' },
  { id: 't2', grupo: 'Tentar novamente', name: 'Auto Center Silva', detail: 'Só chamou · 2ª tentativa' },
  { id: 'm1', grupo: 'Reuniões', time: '16:30', name: 'Padaria Trigo Bom', detail: 'Apresentação do site' },
]

const GROUP_ICON: Record<string, ReactNode> = {
  Retornos: <CalendarClock className="text-sky-300" />,
  'Tentar novamente': <RotateCcw className="text-yellow-200/70" />,
  Reuniões: <CalendarCheck className="text-emerald-300" />,
}

function TodayMock() {
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setDone((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const groups = [...new Set(TODAY.map((t) => t.grupo))]
  const all = done.size === TODAY.length

  return (
    <Frame
      title="Para hoje"
      meta={
        <span className="num flex items-center gap-2">
          {done.size} de {TODAY.length} feitos
          <span className="relative h-1 w-14 overflow-hidden rounded-full bg-line">
            <span className="absolute inset-y-0 left-0 rounded-full bg-go transition-[width] duration-300" style={{ width: `${(done.size / TODAY.length) * 100}%` }} />
          </span>
        </span>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        {groups.map((g) => {
          const items = TODAY.filter((t) => t.grupo === g)
          return (
            <div key={g}>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-2 [&>svg]:size-3.5">
                {GROUP_ICON[g]}
                {g}
                <span className="num font-normal text-fg-3">{items.filter((t) => !done.has(t.id)).length}</span>
              </p>
              <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
                {items.map((t) => {
                  const ok = done.has(t.id)
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="num w-10 shrink-0 text-2xs text-fg-2">{t.time ?? '—'}</span>
                      <div className={clsx('min-w-0 flex-1 transition-opacity', ok && 'opacity-50')}>
                        <p className={clsx('truncate text-xs font-medium text-fg', ok && 'line-through decoration-fg-3')}>{t.name}</p>
                        <p className="truncate text-2xs text-fg-3">{ok ? 'Ligação registrada agora' : t.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        aria-label={ok ? `Desfazer ${t.name}` : `Ligar para ${t.name}`}
                        className={clsx(
                          'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-2xs transition-colors [&>svg]:size-3.5',
                          ok ? 'border-go/30 bg-go/10 text-emerald-300' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
                        )}
                      >
                        {ok ? (
                          <>
                            <Undo2 /> Desfazer
                          </>
                        ) : (
                          <>
                            <Phone /> Ligar
                          </>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
        <p className={clsx('text-center text-2xs transition-opacity', all ? 'text-go opacity-100' : 'opacity-0')} aria-live="polite">
          {all ? 'Lista do dia concluída. Os próximos retornos já estão marcados.' : '.'}
        </p>
      </div>
    </Frame>
  )
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

const MODELS = [
  {
    nome: 'Depois da ligação',
    modelo:
      '{saudacao}, {responsavel}! Aqui é o Rafael, falamos agora há pouco por telefone. Como combinado, segue um exemplo de site para {nicho}. Posso te ligar amanhã para mostrar como ficaria o da {empresa}?',
    resposta: 'Pode ligar sim, depois das 10h',
  },
  {
    nome: 'Primeiro contato',
    modelo:
      '{saudacao}, {responsavel}! Vi a {empresa} no Google e reparei que vocês ainda não têm site. Posso te mostrar em dois minutos como isso traz cliente novo?',
    resposta: 'Oi! Pode mandar, quero ver',
  },
  {
    nome: 'Lembrete de reunião',
    modelo: '{saudacao}, {responsavel}! Passando para lembrar da nossa conversa amanhã às 15h sobre o site da {empresa}. Está confirmado?',
    resposta: 'Confirmado, até amanhã!',
  },
]

const VARS: Record<string, string> = { saudacao: 'Boa tarde', responsavel: 'Carla', nicho: 'pet shop', empresa: 'Pet Shop Amigo' }

type Ev = { id: number; time: string; title: string; detail: ReactNode; tone?: 'go' }

function WhatsAppMock() {
  const [model, setModel] = useState(0)
  const [raw, setRaw] = useState(false)
  const [sending, setSending] = useState(false)
  const [events, setEvents] = useState<Ev[]>(() => [{ id: 0, time: nowHM(-4), title: 'Ligação', detail: 'Pediu WhatsApp' }])
  const timers = useTimers()
  const m = MODELS[model]

  const parts = m.modelo.split(/(\{\w+\})/g)

  const send = () => {
    const id = Date.now()
    setSending(true)
    setEvents((e) => [...e, { id, time: nowHM(), title: 'Mensagem enviada', detail: m.nome }])
    const status = (s: string) => setEvents((e) => e.map((x) => (x.id === id ? { ...x, detail: `${m.nome} · ${s}` } : x)))
    timers.after(700, () => status('entregue'))
    timers.after(1500, () => status('lida'))
    timers.after(2600, () => {
      setEvents((e) => [...e, { id: id + 1, time: nowHM(), title: 'Resposta', detail: `“${m.resposta}”`, tone: 'go' }])
      setSending(false)
    })
  }

  return (
    <Frame title="Mensagem" meta="Pet Shop Amigo · Carla">
      <div className="grid md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="border-b border-line-soft p-4 md:border-r md:border-b-0 md:p-5">
          <p className="mb-1.5 text-2xs text-fg-3">Modelo</p>
          <div className="flex flex-wrap gap-1">
            {MODELS.map((x, i) => (
              <Pick key={x.nome} on={model === i} onClick={() => setModel(i)}>
                {x.nome}
              </Pick>
            ))}
          </div>
          <div key={model} className="anim-fade mt-4 rounded-lg rounded-tl-sm bg-raised p-3.5 text-[13px] leading-6 text-fg-2">
            {parts.map((p, i) => {
              const v = /^\{(\w+)\}$/.exec(p)?.[1]
              if (!v) return <span key={i}>{p}</span>
              return raw ? (
                <span key={i} className="rounded bg-accent/15 px-1 text-[12px] text-blue-300">
                  {p}
                </span>
              ) : (
                <span key={i} className="text-fg">
                  {VARS[v]}
                </span>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" aria-pressed={raw} onClick={() => setRaw((r) => !r)} className="text-2xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg-2">
              {raw ? 'Ver como a Carla recebe' : 'Ver as variáveis do modelo'}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="flex h-8 items-center gap-1.5 rounded-md bg-go px-3 text-2xs font-semibold text-[#04140c] transition-colors hover:bg-[#4ccb8d] disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Enviar no WhatsApp
            </button>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <p className="mb-3 text-xs font-semibold text-fg-2">Histórico do lead</p>
          <ol className="relative max-h-[260px] space-y-4 overflow-y-auto before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-line" aria-live="polite">
            {events.map((e) => (
              <li key={e.id} className="anim-rise relative pl-5">
                <span className={clsx('absolute top-1.5 left-0 size-[7px] rounded-full', e.tone === 'go' ? 'bg-go' : 'bg-fg-3')} />
                <p className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium text-fg">{e.title}</span>
                  <span className="num text-2xs text-fg-3">{e.time}</span>
                </p>
                <p className="mt-0.5 text-2xs text-fg-2">{e.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Frame>
  )
}
