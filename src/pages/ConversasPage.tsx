// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { useAtendenteDe, useAtendentes } from '../lib/equipe'
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Mic,
  Search,
  SendHorizontal,
  Smartphone,
  Sticker,
  TriangleAlert,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FaixaAgente, SeloAgente, useAgenteNasConversas, useMapaAgente } from '../components/agente/NasConversas'
import { Popover, Segmented, Spinner, StatusBadge, WhatsAppIcon } from '../components/ui'
import { WhatsAppIndisponivel } from '../components/WhatsAppIndisponivel'
import { formatPhone } from '../lib/contact'
import {
  conversasApi,
  horaCurta,
  previa,
  rotuloDia,
  telefoneConversa,
  type ConversaAberta,
  type ConversasApi,
  type MensagemConversa,
  type ResumoConversa,
} from '../lib/conversas'
import { leadPhone, phoneKeyBr } from '../lib/disparo'
import { fillMessage, getMessages, pickVariation, saudacao } from '../lib/messages'
import { normalizeKey } from '../lib/statuses'
import type { MapaAgente } from '../lib/agente'
import type { Lead } from '../lib/types'
import { useWaServico } from '../lib/waServico'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'

export type Filtro = 'todas' | 'naoLidas' | 'leads'

/** A tela confere novidades a cada 4 s (só com a aba visível). */
const INTERVALO_MS = 4000

export function ConversasPage() {
  const atendenteDe = useAtendenteDe('qr')
  const online = useWaServico((s) => s.online)
  const health = useWaServico((s) => s.health)
  const leads = useApp((s) => s.leads)
  const [params, setParams] = useSearchParams()
  const [api, setApi] = useState<ConversasApi | null>(null)
  const [lista, setLista] = useState<ResumoConversa[] | null>(null)
  const [aberta, setAberta] = useState<ConversaAberta | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const versaoRef = useRef<number | null>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = selecionada
  const agenteOn = useAgenteNasConversas()
  const { mapa, recarregar: recarregarMapa } = useMapaAgente(agenteOn)
  const agenteDe = useCallback((tel: string) => mapa.get(phoneKeyBr(tel)), [mapa])

  useEffect(() => {
    void conversasApi().then(setApi)
  }, [])

  const demo = !!api?.demo
  const conectado = demo || health?.whatsapp.status === 'connected'

  // Telefone → lead (ignora 55 e o nono dígito)
  const porTelefone = useMemo(() => {
    const m = new Map<string, Lead>()
    for (const l of leads) {
      const p = leadPhone(l)
      if (p) m.set(phoneKeyBr(p), l)
    }
    return m
  }, [leads])
  const leadDe = useCallback((tel: string) => porTelefone.get(phoneKeyBr(tel)) ?? null, [porTelefone])

  const carregarConversa = useCallback(
    async (tel: string) => {
      if (!api) return
      try {
        const c = await api.abrir(tel)
        if (selRef.current !== tel) return
        setAberta(c)
        if (c.naoLidas > 0 && document.visibilityState === 'visible') {
          await api.marcarLidas(tel)
          setLista((l) => l?.map((x) => (x.telefone === c.telefone ? { ...x, naoLidas: 0 } : x)) ?? l)
        }
      } catch {
        /* WhatsApp indisponível: a faixa de aviso já aparece */
      }
    },
    [api],
  )

  const atualizar = useCallback(async () => {
    if (!api) return
    try {
      const r = await api.listar()
      setLista(r.conversas)
      if (versaoRef.current !== r.versao) {
        versaoRef.current = r.versao
        if (selRef.current) await carregarConversa(selRef.current)
      }
    } catch {
      setLista((l) => l ?? [])
    }
  }, [api, carregarConversa])

  useEffect(() => {
    if (!api || (!demo && !online)) return
    void atualizar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void atualizar()
    }, INTERVALO_MS)
    const voltou = () => document.visibilityState === 'visible' && void atualizar()
    document.addEventListener('visibilitychange', voltou)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', voltou)
    }
  }, [api, demo, online, atualizar])

  const abrir = useCallback(
    (tel: string) => {
      setSelecionada(tel)
      selRef.current = tel
      setAberta((a) => (a?.telefone === tel ? a : null))
      void carregarConversa(tel)
    },
    [carregarConversa],
  )

  // Veio da ficha do lead: /conversas?tel=5543…
  useEffect(() => {
    const tel = params.get('tel')
    if (!tel || !api) return
    abrir(telefoneConversa(tel))
    setParams({}, { replace: true })
  }, [params, api, abrir, setParams])

  const naoLidas = lista?.reduce((n, c) => n + (c.naoLidas > 0 ? 1 : 0), 0) ?? 0

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[460px] flex-col gap-3 lg:h-[calc(100dvh-5.5rem)]">
      {!demo && online === false && <WhatsAppIndisponivel />}
      {!demo && online && !conectado && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">Conecte o WhatsApp para ver e responder as conversas por aqui.</span>
          <Link to="/whatsapp" className="font-medium text-blue-300 hover:text-blue-200">
            Conectar WhatsApp →
          </Link>
        </div>
      )}

      <div className="panel flex min-h-0 flex-1 overflow-hidden p-0">
        {/* Lista de conversas */}
        <aside className={clsx('flex min-h-0 w-full shrink-0 flex-col border-line-soft md:w-[330px] md:border-r xl:w-[360px]', selecionada && 'hidden md:flex')}>
          <div className="space-y-2.5 border-b border-line-soft px-3.5 pt-3.5 pb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Conversas</h1>
              {naoLidas > 0 && <span className="num rounded-full bg-emerald-400/15 px-1.5 text-2xs leading-[18px] font-semibold text-emerald-300">{naoLidas}</span>}
              {demo && <span className="ml-auto rounded bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold">Demonstração</span>}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
              <input className="input h-8 pl-8 text-xs" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, empresa ou número" />
              {busca && (
                <button onClick={() => setBusca('')} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-4 hover:text-fg-2" aria-label="Limpar busca">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Segmented<Filtro>
              size="xs"
              value={filtro}
              onChange={setFiltro}
              options={[
                { id: 'todas', label: 'Todas' },
                { id: 'naoLidas', label: naoLidas ? `Não lidas · ${naoLidas}` : 'Não lidas' },
                { id: 'leads', label: 'Leads' },
              ]}
            />
          </div>
          <ListaConversas atendenteDe={atendenteDe} lista={lista} filtro={filtro} busca={busca} selecionada={selecionada} leadDe={leadDe} agenteDe={agenteDe} leads={leads} onAbrir={abrir} />
        </aside>

        {/* Conversa aberta */}
        <section className={clsx('min-w-0 flex-1 flex-col', selecionada ? 'flex' : 'hidden md:flex')}>
          {selecionada ? (
            <Chat
              key={selecionada}
              api={api}
              telefone={selecionada}
              conversa={aberta?.telefone === selecionada ? aberta : null}
              nomeLista={lista?.find((c) => c.telefone === selecionada)?.nome ?? null}
              lead={leadDe(selecionada)}
              podeEnviar={conectado}
              agenteOn={agenteOn && !demo}
              onAgenteMudou={() => void recarregarMapa()}
              onVoltar={() => setSelecionada(null)}
              onEnviou={(msg) => {
                setAberta((a) => (a && a.telefone === selecionada ? { ...a, msgs: [...a.msgs.filter((x) => x.id !== msg.id), msg] } : a))
                void atualizar()
                // Você respondeu: o vendedor para nessa conversa
                if (agenteOn) setTimeout(() => void recarregarMapa(), 800)
              }}
            />
          ) : (
            <NenhumaAberta demo={demo} />
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- lista

export function ListaConversas({
  lista,
  filtro,
  busca,
  selecionada,
  leadDe,
  agenteDe,
  leads,
  onAbrir,
  atendenteDe,
}: {
  /** Plano Times: nome de quem da equipe respondeu por último */
  atendenteDe?: (tel: string) => string | null
  lista: ResumoConversa[] | null
  filtro: Filtro
  busca: string
  selecionada: string | null
  leadDe: (tel: string) => Lead | null
  agenteDe: (tel: string) => MapaAgente | undefined
  leads: Lead[]
  onAbrir: (tel: string) => void
}) {
  const q = normalizeKey(busca)
  const digitos = busca.replace(/\D/g, '')

  const visiveis = useMemo(() => {
    if (!lista) return []
    return lista.filter((c) => {
      const lead = leadDe(c.telefone)
      if (filtro === 'naoLidas' && c.naoLidas === 0) return false
      if (filtro === 'leads' && !lead) return false
      if (!q && !digitos) return true
      if (digitos.length >= 3 && c.telefone.includes(digitos)) return true
      return !!q && normalizeKey(`${c.nome ?? ''} ${lead?.empresa ?? ''} ${lead?.falei_com ?? ''}`).includes(q)
    })
  }, [lista, filtro, q, digitos, leadDe])

  // Leads com telefone que ainda não têm conversa: dá para começar uma por aqui
  const novos = useMemo(() => {
    if (!q && digitos.length < 4) return []
    const comConversa = new Set((lista ?? []).map((c) => phoneKeyBr(c.telefone)))
    return leads
      .filter((l) => {
        const p = leadPhone(l)
        if (!p || comConversa.has(phoneKeyBr(p))) return false
        return (digitos.length >= 4 && p.includes(digitos)) || (!!q && normalizeKey(`${l.empresa} ${l.falei_com ?? ''}`).includes(q))
      })
      .slice(0, 6)
  }, [leads, lista, q, digitos])

  const numeroAvulso = digitos.length >= 10 && !visiveis.length && !novos.length ? telefoneConversa(digitos) : null

  if (!lista)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {visiveis.length === 0 && !novos.length && !numeroAvulso && (
        <div className="px-4 py-12 text-center">
          <MessagesSquare className="mx-auto size-6 text-fg-4" />
          <p className="mt-3 text-xs font-medium text-fg-2">{lista.length ? 'Nada por aqui' : 'Nenhuma conversa ainda'}</p>
          <p className="mx-auto mt-1 max-w-[240px] text-2xs leading-4 text-fg-3">
            {lista.length
              ? 'Nenhuma conversa com esse filtro.'
              : 'As conversas aparecem aqui quando alguém te mandar mensagem ou quando você enviar uma pelo WhatsApp conectado.'}
          </p>
        </div>
      )}
      <ul className="space-y-px">
        {visiveis.map((c) => (
          <ItemConversa key={c.telefone} c={c} lead={leadDe(c.telefone)} agente={agenteDe(c.telefone)} atendente={atendenteDe?.(c.telefone) ?? null} ativa={c.telefone === selecionada} onClick={() => onAbrir(c.telefone)} />
        ))}
      </ul>
      {novos.length > 0 && (
        <>
          <p className="px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-[0.08em] text-fg-4 uppercase">Começar com um lead</p>
          <ul className="space-y-px">
            {novos.map((l) => (
              <li key={l.id}>
                <button onClick={() => onAbrir(telefoneConversa(leadPhone(l)))} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-tint/[0.04]">
                  <Avatar nome={l.empresa} />
                  <span className="min-w-0 flex-1">
                    <span className="pv block truncate text-xs font-medium text-fg">{l.empresa}</span>
                    <span className="pv num block truncate text-2xs text-fg-3">{formatPhone(leadPhone(l))}</span>
                  </span>
                  <MessageCircle className="size-3.5 text-fg-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {numeroAvulso && (
        <button onClick={() => onAbrir(numeroAvulso)} className="mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-tint/[0.04]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
            <MessageCircle className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-fg">Conversar com este número</span>
            <span className="pv num block text-2xs text-fg-3">{formatPhone(numeroAvulso)}</span>
          </span>
        </button>
      )}
    </div>
  )
}

function ItemConversa({ c, lead, agente, atendente, ativa, onClick }: { c: ResumoConversa; lead: Lead | null; agente?: MapaAgente; atendente: string | null; ativa: boolean; onClick: () => void }) {
  const titulo = lead?.empresa ?? c.nome ?? formatPhone(c.telefone)
  const novo = c.naoLidas > 0
  return (
    <li>
      <button
        onClick={onClick}
        className={clsx(
          'relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
          ativa ? 'bg-tint/[0.07]' : 'hover:bg-tint/[0.035]',
        )}
      >
        {ativa && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-400" />}
        <Avatar nome={titulo} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={clsx('pv min-w-0 flex-1 truncate text-[13px]', novo ? 'font-semibold text-fg' : 'font-medium text-fg')}>{titulo}</span>
            <SeloAgente m={agente} />
            {atendente && (
              <span className="pv max-w-[90px] shrink-0 truncate rounded bg-blue-500/12 px-1.5 text-[10px] leading-4 font-medium text-blue-300" title={`Quem está atendendo: ${atendente}`}>
                {atendente}
              </span>
            )}
            <span className={clsx('num shrink-0 text-[10px]', novo ? 'font-semibold text-emerald-300' : 'text-fg-4')}>{horaCurta(c.atualizadaEm)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {c.ultima?.deMim && <Tiques status={c.ultima.status} className="size-3.5 shrink-0" />}
            {c.ultima?.midia && <IconeMidia midia={c.ultima.midia} className="size-3 shrink-0 text-fg-3" />}
            <span className={clsx('pv min-w-0 flex-1 truncate text-xs', novo ? 'text-fg-2' : 'text-fg-3')}>{previa(c.ultima)}</span>
            {novo && <span className="num min-w-[18px] shrink-0 rounded-full bg-emerald-400 px-1 text-center text-[10px] leading-[18px] font-bold text-[#04140c]">{c.naoLidas}</span>}
          </span>
          {lead && (
            <span className="mt-1 flex items-center gap-1.5">
              <StatusBadge status={lead.status} className="!h-4 !px-1 !text-[10px]" />
              {lead.falei_com && c.nome && <span className="pv truncate text-[10px] text-fg-4">{c.nome}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------- conversa

function Chat({
  api,
  telefone,
  conversa,
  nomeLista,
  lead,
  podeEnviar,
  agenteOn,
  onAgenteMudou,
  onVoltar,
  onEnviou,
}: {
  api: ConversasApi | null
  telefone: string
  conversa: ConversaAberta | null
  nomeLista: string | null
  lead: Lead | null
  podeEnviar: boolean
  agenteOn: boolean
  onAgenteMudou: () => void
  onVoltar: () => void
  onEnviou: (msg: MensagemConversa) => void
}) {
  const openLead = useUi((s) => s.openLead)
  const [doAgente, setDoAgente] = useState<Set<string>>(new Set())
  const nome = conversa?.nome ?? nomeLista
  const titulo = lead?.empresa ?? nome ?? formatPhone(telefone)
  const subtitulo = [lead ? nome : null, formatPhone(telefone)].filter(Boolean).join(' · ')

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line-soft px-3 sm:px-4">
        <button onClick={onVoltar} className="-ml-1 rounded-md p-1.5 text-fg-3 hover:bg-hover hover:text-fg md:hidden" aria-label="Voltar para a lista">
          <ArrowLeft className="size-4" />
        </button>
        <Avatar nome={titulo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="pv truncate text-[13px] font-semibold text-fg">{titulo}</p>
            {lead && <StatusBadge status={lead.status} className="hidden sm:inline-flex" />}
          </div>
          <p className="pv num truncate text-2xs text-fg-3">{subtitulo}</p>
        </div>
        {lead ? (
          <button
            onClick={() => openLead(lead.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
          >
            <UserRound className="size-3.5" /> <span className="hidden sm:inline">Ver lead</span>
          </button>
        ) : (
          <span className="hidden rounded-md bg-tint/[0.05] px-2 py-1 text-2xs text-fg-3 lg:inline">Não está nos seus leads</span>
        )}
        <a
          href={`https://wa.me/${telefone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md border border-line text-fg-3 transition-colors hover:bg-hover hover:text-emerald-300"
          title="Abrir no WhatsApp"
          aria-label="Abrir no WhatsApp"
        >
          <WhatsAppIcon className="size-3.5" />
        </a>
      </header>

      {agenteOn && <FaixaAgente telefone={telefone} nome={lead?.empresa ?? nome} versao={conversa?.versao ?? 0} onDoAgente={setDoAgente} onMudou={onAgenteMudou} />}

      <Mensagens conversa={conversa} doAgente={doAgente} />

      <Composer api={api} telefone={telefone} lead={lead} podeEnviar={podeEnviar} onEnviou={onEnviou} />
    </>
  )
}

export function Mensagens({ conversa, doAgente }: { conversa: ConversaAberta | null; doAgente: Set<string> }) {
  const ref = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)
  const total = conversa?.msgs.length ?? 0
  const ultimaId = conversa?.msgs[total - 1]?.id

  // Desce sozinho quando chega mensagem, a não ser que a pessoa tenha subido para ler
  useLayoutEffect(() => {
    const el = ref.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [ultimaId, total])

  const grupos = useMemo(() => {
    const out: { dia: string; msgs: MensagemConversa[] }[] = []
    for (const m of conversa?.msgs ?? []) {
      const dia = rotuloDia(m.em)
      const g = out[out.length - 1]
      if (g && g.dia === dia) g.msgs.push(m)
      else out.push({ dia, msgs: [m] })
    }
    return out
  }, [conversa])

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="chat-fundo min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
    >
      {!conversa ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : total === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-tint/[0.05] text-fg-3">
            <MessageCircle className="size-5" />
          </span>
          <p className="mt-3 text-xs font-medium text-fg-2">Nenhuma mensagem por aqui ainda</p>
          <p className="mt-1 max-w-[260px] text-2xs leading-4 text-fg-3">Escreva abaixo para começar. Mensagens antigas do celular não aparecem na XS.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[760px]">
          {grupos.map((g) => (
            <div key={g.dia}>
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-md border border-line-soft bg-raised/95 px-2 py-0.5 text-[10px] font-medium text-fg-3 backdrop-blur">{g.dia}</span>
              </div>
              {g.msgs.map((m, i) => {
                const anterior = g.msgs[i - 1]
                const junto = !!anterior && anterior.deMim === m.deMim && Date.parse(m.em) - Date.parse(anterior.em) < 5 * 60_000
                return <Bolha key={m.id} m={m} junto={junto} ia={doAgente.has(m.id)} />
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Bolha({ m, junto, ia }: { m: MensagemConversa; junto: boolean; ia?: boolean }) {
  const hora = new Date(m.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={clsx('flex', m.deMim ? 'justify-end' : 'justify-start', junto ? 'mt-0.5' : 'mt-2.5')}>
      <div
        className={clsx(
          'relative max-w-[min(78%,560px)] rounded-xl px-3 pt-1.5 pb-1 text-[13px] leading-[1.45] shadow-[0_1px_0_rgba(0,0,0,0.25)]',
          m.deMim ? 'bolha-minha text-fg' : 'border border-line-soft bg-raised text-fg',
          !junto && (m.deMim ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]'),
        )}
      >
        {m.midia && (
          <span className="my-0.5 flex items-center gap-2 rounded-md bg-tint/[0.05] px-2 py-1.5 text-xs text-fg-2">
            <IconeMidia midia={m.midia} className="size-3.5 shrink-0 text-fg-3" />
            <span className="font-medium">{m.midia}</span>
            <span className="text-fg-4">· veja no celular</span>
          </span>
        )}
        {m.texto && <span className="pv break-words whitespace-pre-wrap">{m.texto}</span>}
        <span className={clsx('float-right ml-3 inline-flex translate-y-1 items-center gap-1 text-[10px] leading-4', m.deMim ? 'text-fg-3' : 'text-fg-4')}>
          {ia && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-blue-300" title="Escrita pelo vendedor IA">
              <Bot className="size-2.5" /> IA
            </span>
          )}
          <span className="num">{hora}</span>
          {m.deMim && <Tiques status={m.status} className="size-3.5" />}
        </span>
      </div>
    </div>
  )
}

function Composer({
  api,
  telefone,
  lead,
  podeEnviar,
  onEnviou,
}: {
  api: ConversasApi | null
  telefone: string
  lead: Lead | null
  podeEnviar: boolean
  onEnviou: (msg: MensagemConversa) => void
}) {
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modelos, setModelos] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const modelosRef = useRef<HTMLButtonElement>(null)

  // Campo cresce com o texto até ~6 linhas
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`
  }, [texto])

  useEffect(() => {
    ref.current?.focus()
  }, [telefone])

  const enviar = async () => {
    const t = texto.trim()
    if (!t || !api || enviando) return
    setEnviando(true)
    try {
      const msg = await api.enviar(telefone, t)
      setTexto('')
      useAtendentes.getState().marcar('qr', telefone)
      onEnviou(msg)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível enviar.', 'error')
    } finally {
      setEnviando(false)
      ref.current?.focus()
    }
  }

  const usarModelo = (id: string) => {
    const t = getMessages(settings).find((x) => x.id === id)
    if (!t) return
    const raw = pickVariation(t, lead?.id ?? telefone)
    setTexto(lead ? fillMessage(raw, lead, settings) : raw.replace(/\{saudacao\}/g, saudacao()))
    setModelos(false)
    ref.current?.focus()
  }

  return (
    <div className="shrink-0 border-t border-line-soft bg-panel px-3 py-2.5 sm:px-4">
      {!podeEnviar && (
        <p className="mb-2 flex items-center gap-1.5 text-2xs text-amber-200">
          <TriangleAlert className="size-3.5" /> Conecte o WhatsApp para enviar.
        </p>
      )}
      <div className="mx-auto flex max-w-[760px] items-end gap-2">
        <button
          ref={modelosRef}
          onClick={() => setModelos((o) => !o)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
          title="Usar um modelo de mensagem"
        >
          <FileText className="size-3.5" /> <span className="hidden sm:inline">Modelos</span>
        </button>
        <Popover anchor={modelosRef.current} open={modelos} onClose={() => setModelos(false)} width={280}>
          <p className="px-2 pt-1 pb-1.5 text-2xs font-medium text-fg-3">Modelos de mensagem</p>
          <ul className="max-h-64 overflow-y-auto">
            {getMessages(settings).map((t) => (
              <li key={t.id}>
                <button onClick={() => usarModelo(t.id)} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-tint/[0.06]">
                  <span className="block truncate text-xs font-medium text-fg">{t.nome}</span>
                  <span className="block truncate text-2xs text-fg-3">{t.variacoes[0]}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/mensagens" className="mt-1 block border-t border-line-soft px-2 pt-1.5 pb-1 text-2xs text-blue-300 hover:text-blue-200">
            Editar modelos →
          </Link>
        </Popover>
        <div className="flex min-h-10 flex-1 items-end rounded-lg border border-line bg-ink transition-colors focus-within:border-blue-500/50">
          <textarea
            ref={ref}
            rows={1}
            value={texto}
            maxLength={4096}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void enviar()
              }
            }}
            placeholder="Escreva uma mensagem"
            className="pv block max-h-[148px] min-h-[38px] w-full resize-none bg-transparent px-3 py-[9px] text-[13px] leading-5 text-fg outline-none placeholder:text-fg-4"
          />
        </div>
        <button
          onClick={() => void enviar()}
          disabled={!texto.trim() || enviando || !podeEnviar}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-[#3b7bf6] disabled:pointer-events-none disabled:opacity-35"
          aria-label="Enviar"
          title="Enviar (Enter)"
        >
          {enviando ? <Spinner className="size-4 text-white" /> : <SendHorizontal className="size-4" />}
        </button>
      </div>
      <p className="mx-auto mt-1.5 hidden max-w-[760px] text-[10px] text-fg-4 sm:block">Enter envia · Shift + Enter quebra a linha · só texto</p>
    </div>
  )
}

function NenhumaAberta({ demo }: { demo: boolean }) {
  return (
    <div className="chat-fundo flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-line-soft bg-raised text-fg-3">
        <MessagesSquare className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-fg">Escolha uma conversa</p>
      <p className="mt-1 max-w-[300px] text-xs leading-5 text-fg-3">
        Veja o que cada lead respondeu e responda daqui mesmo, sem pegar o celular. Para começar uma conversa nova, busque o lead ou digite o número.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-2xs text-fg-4">
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="size-3" /> Usa o WhatsApp conectado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3" /> Só mensagens novas
        </span>
      </div>
      {demo && <p className="mt-5 rounded-md bg-gold/10 px-2.5 py-1.5 text-2xs text-gold">Demonstração com conversas de exemplo. Na sua conta aparecem as conversas reais.</p>}
    </div>
  )
}

// ---------------------------------------------------------------- pequenos

// Só tons que o tema claro escurece (ver index.css), para as iniciais ficarem legíveis nos dois
const TONS = ['bg-sky-400/15 text-sky-200', 'bg-emerald-400/15 text-emerald-200', 'bg-amber-400/15 text-amber-200', 'bg-teal-400/15 text-teal-300', 'bg-orange-400/15 text-orange-300', 'bg-blue-400/15 text-blue-200']

export function Avatar({ nome }: { nome: string }) {
  const limpo = nome.replace(/[^\p{L}\p{N} ]/gu, ' ').trim()
  const partes = limpo.split(/\s+/).filter(Boolean)
  const iniciais = /^\d/.test(limpo) ? '#' : ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?'
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return <span className={clsx('pv flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', TONS[h % TONS.length])}>{iniciais}</span>
}

function Tiques({ status, className }: { status: MensagemConversa['status']; className?: string }) {
  if (status === 'read') return <CheckCheck className={clsx(className, 'text-sky-400')} aria-label="Lida" />
  if (status === 'delivered') return <CheckCheck className={clsx(className, 'text-fg-4')} aria-label="Entregue" />
  if (status === 'failed') return <TriangleAlert className={clsx(className, 'text-red-300')} aria-label="Falhou" />
  return <Check className={clsx(className, 'text-fg-4')} aria-label="Enviada" />
}

function IconeMidia({ midia, className }: { midia: string; className?: string }): ReactNode {
  const Icon = midia === 'Foto' ? ImageIcon : midia === 'Vídeo' ? Video : midia === 'Áudio' ? Mic : midia === 'Figurinha' ? Sticker : midia === 'Localização' ? MapPin : midia === 'Contato' ? UserRound : FileText
  return <Icon className={className} />
}
