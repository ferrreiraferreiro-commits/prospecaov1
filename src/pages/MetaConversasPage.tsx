// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ArrowLeft, BadgeCheck, Clock, FileText, MessagesSquare, Search, SendHorizontal, TriangleAlert, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { camposIniciais, MetaModelo, type EscolhaModelo } from '../components/MetaModelo'
import { Button, Segmented, Spinner, StatusBadge } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { telefoneConversa, type ConversaAberta, type MensagemConversa, type ResumoConversa } from '../lib/conversas'
import { leadPhone, phoneKeyBr } from '../lib/disparo'
import { janelaAberta, metaConversasApi as api, metaFetch, textoDoModelo, useMetaConexao, valoresParaLead } from '../lib/meta'
import { fillMessage, getMessages, pickVariation } from '../lib/messages'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Avatar, ListaConversas, Mensagens, type Filtro } from './ConversasPage'

/** Confere novidades a cada 4 s (só com a aba visível), como a tela Conversas do WhatsApp da XS. */
const INTERVALO_MS = 4000
const SEM_AGENTE = () => undefined
const NENHUMA = new Set<string>()

/** Conversas da API oficial (Meta): mesmas telas da XS, com a regra das 24 h e os modelos aprovados. */
export function MetaConversasPage() {
  const { carregado, conexao, carregar } = useMetaConexao()
  const leads = useApp((s) => s.leads)
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<ResumoConversa[] | null>(null)
  const [aberta, setAberta] = useState<ConversaAberta | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const versaoRef = useRef<number | null>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = selecionada

  useEffect(() => {
    void carregar()
  }, [carregar])

  const porTelefone = useMemo(() => {
    const m = new Map<string, Lead>()
    for (const l of leads) {
      const p = leadPhone(l)
      if (p) m.set(phoneKeyBr(p), l)
    }
    return m
  }, [leads])
  const leadDe = useCallback((tel: string) => porTelefone.get(phoneKeyBr(tel)) ?? null, [porTelefone])

  // A Meta pode guardar o número sem o nono dígito: abre a conversa que já existe com o mesmo número
  const telefoneExistente = useCallback((tel: string) => lista?.find((c) => phoneKeyBr(c.telefone) === phoneKeyBr(tel))?.telefone ?? tel, [lista])

  const carregarConversa = useCallback(async (tel: string) => {
    try {
      const c = await api.abrir(tel)
      if (selRef.current !== tel) return
      setAberta(c)
      if (c.naoLidas > 0 && document.visibilityState === 'visible') {
        await api.marcarLidas(tel)
        setLista((l) => l?.map((x) => (x.telefone === c.telefone ? { ...x, naoLidas: 0 } : x)) ?? l)
      }
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [])

  const atualizar = useCallback(async () => {
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
  }, [carregarConversa])

  useEffect(() => {
    if (!conexao) return
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
  }, [conexao, atualizar])

  const abrir = useCallback(
    (tel: string) => {
      const t = telefoneExistente(tel)
      setSelecionada(t)
      selRef.current = t
      setAberta((a) => (a?.telefone === t ? a : null))
      void carregarConversa(t)
    },
    [carregarConversa, telefoneExistente],
  )

  // Veio de outro lugar: /api-oficial/conversas?tel=5543…
  useEffect(() => {
    const tel = params.get('tel')
    if (!tel || !conexao) return
    abrir(telefoneConversa(tel))
    setParams({}, { replace: true })
  }, [params, conexao, abrir, setParams])

  const naoLidas = lista?.reduce((n, c) => n + (c.naoLidas > 0 ? 1 : 0), 0) ?? 0

  if (!carregado) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[460px] flex-col gap-3 lg:h-[calc(100dvh-5.5rem)]">
      {!conexao && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">Conecte a API oficial da Meta para ver e responder as conversas por aqui.</span>
          <Link to="/api-oficial" className="font-medium text-blue-300 hover:text-blue-200">
            Conectar API oficial →
          </Link>
        </div>
      )}

      <div className="panel flex min-h-0 flex-1 overflow-hidden p-0">
        <aside className={clsx('flex min-h-0 w-full shrink-0 flex-col border-line-soft md:w-[330px] md:border-r xl:w-[360px]', selecionada && 'hidden md:flex')}>
          <div className="space-y-2.5 border-b border-line-soft px-3.5 pt-3.5 pb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Conversas</h1>
              {naoLidas > 0 && <span className="num rounded-full bg-emerald-400/15 px-1.5 text-2xs leading-[18px] font-semibold text-emerald-300">{naoLidas}</span>}
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                <BadgeCheck className="size-3" /> API oficial
              </span>
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
          <ListaConversas lista={conexao ? lista : []} filtro={filtro} busca={busca} selecionada={selecionada} leadDe={leadDe} agenteDe={SEM_AGENTE} leads={leads} onAbrir={abrir} />
        </aside>

        <section className={clsx('min-w-0 flex-1 flex-col', selecionada ? 'flex' : 'hidden md:flex')}>
          {selecionada ? (
            <Chat
              key={selecionada}
              telefone={selecionada}
              conversa={aberta?.telefone === selecionada ? aberta : null}
              nomeLista={lista?.find((c) => c.telefone === selecionada)?.nome ?? null}
              lead={leadDe(selecionada)}
              podeEnviar={!!conexao}
              onVoltar={() => setSelecionada(null)}
              onEnviou={(msg) => {
                // A Meta pode devolver o número de outro jeito (sem o nono dígito): a conversa segue o dela
                const tel = (msg as MensagemConversa & { telefone?: string }).telefone
                if (tel && tel !== selecionada) {
                  setSelecionada(tel)
                  selRef.current = tel
                }
                setAberta((a) => (a && a.telefone === selecionada ? { ...a, msgs: [...a.msgs.filter((x) => x.id !== msg.id), msg] } : a))
                void atualizar().then(() => tel && void carregarConversa(tel))
              }}
            />
          ) : (
            <NenhumaAberta />
          )}
        </section>
      </div>
    </div>
  )
}

function Chat({
  telefone,
  conversa,
  nomeLista,
  lead,
  podeEnviar,
  onVoltar,
  onEnviou,
}: {
  telefone: string
  conversa: ConversaAberta | null
  nomeLista: string | null
  lead: Lead | null
  podeEnviar: boolean
  onVoltar: () => void
  onEnviou: (msg: MensagemConversa) => void
}) {
  const openLead = useUi((s) => s.openLead)
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
      </header>

      <Mensagens conversa={conversa} doAgente={NENHUMA} />

      {conversa && <Composer telefone={telefone} conversa={conversa} lead={lead} podeEnviar={podeEnviar} onEnviou={onEnviou} />}
    </>
  )
}

/** Dentro das 24 h: texto livre. Fora: só modelo aprovado (regra da Meta). */
function Composer({
  telefone,
  conversa,
  lead,
  podeEnviar,
  onEnviou,
}: {
  telefone: string
  conversa: ConversaAberta
  lead: Lead | null
  podeEnviar: boolean
  onEnviou: (msg: MensagemConversa) => void
}) {
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const respostas = useMemo(() => getMessages(settings).filter((m) => m.variacoes.some((v) => v.trim())), [settings])
  const livre = janelaAberta(conversa.msgs)
  const [usarModelo, setUsarModelo] = useState(false)
  const [escolha, setEscolha] = useState<EscolhaModelo>({ modelo: null, campos: [] })
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const modo = livre && !usarModelo ? 'texto' : 'modelo'

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`
  }, [texto])

  const enviarTexto = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    try {
      onEnviou(await api.enviar(telefone, t))
      setTexto('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível enviar.', 'error')
    } finally {
      setEnviando(false)
      ref.current?.focus()
    }
  }

  const enviarModelo = async () => {
    const m = escolha.modelo
    if (!m || enviando) return
    setEnviando(true)
    try {
      const valores = valoresParaLead(escolha.campos, lead, settings)
      const msg = await metaFetch<MensagemConversa>({
        acao: 'modelo',
        para: telefone,
        modelo: m.nome,
        idioma: m.idioma,
        nomes: m.variaveis,
        valores,
        nomeadas: m.nomeadas,
        texto: textoDoModelo(m, valores),
        nome: lead?.empresa,
      })
      onEnviou(msg)
      setUsarModelo(false)
      setEscolha({ modelo: m, campos: camposIniciais(m) })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-line-soft bg-panel px-3 py-2.5 sm:px-4">
      {!podeEnviar && (
        <p className="mb-2 flex items-center gap-1.5 text-2xs text-amber-200">
          <TriangleAlert className="size-3.5" /> Conecte a API oficial para enviar.
        </p>
      )}
      <div className="mx-auto max-w-[760px]">
        {modo === 'modelo' ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-2xs text-fg-3">
              <Clock className="size-3.5 text-amber-300" />
              {livre ? 'Enviando um modelo aprovado.' : 'Fora da janela de 24 h: pela regra da Meta, só sai um modelo aprovado. Quando a pessoa responder, a conversa fica livre.'}
            </p>
            <div className="max-h-[42vh] overflow-y-auto pr-1">
              <MetaModelo valor={escolha} onChange={setEscolha} lead={lead} compacto />
            </div>
            <div className="flex justify-end gap-2">
              {livre && (
                <Button size="sm" variant="ghost" onClick={() => setUsarModelo(false)}>
                  Voltar ao texto
                </Button>
              )}
              <Button size="sm" variant="primary" loading={enviando} disabled={!escolha.modelo || !podeEnviar} icon={<SendHorizontal className="size-3.5" />} onClick={() => void enviarModelo()}>
                Enviar modelo
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <button
                onClick={() => setUsarModelo(true)}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
                title="Enviar um modelo aprovado pela Meta"
              >
                <FileText className="size-3.5" /> <span className="hidden sm:inline">Modelo</span>
              </button>
              {respostas.length > 0 && (
                <select
                  className="input h-10 w-10 shrink-0 cursor-pointer px-1 text-xs sm:w-auto sm:pr-7"
                  value=""
                  onChange={(e) => {
                    const t = respostas.find((r) => r.id === e.target.value)
                    if (!t) return
                    const v = pickVariation(t, lead?.id ?? telefone)
                    setTexto(lead ? fillMessage(v, lead, settings) : v)
                    ref.current?.focus()
                  }}
                  title="Respostas rápidas (seus Modelos de mensagem)"
                  aria-label="Resposta rápida"
                >
                  <option value="">Rápidas</option>
                  {respostas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              )}
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
                      void enviarTexto()
                    }
                  }}
                  placeholder="Escreva uma mensagem"
                  className="pv block max-h-[148px] min-h-[38px] w-full resize-none bg-transparent px-3 py-[9px] text-[13px] leading-5 text-fg outline-none placeholder:text-fg-4"
                />
              </div>
              <button
                onClick={() => void enviarTexto()}
                disabled={!texto.trim() || enviando || !podeEnviar}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-[#3b7bf6] disabled:pointer-events-none disabled:opacity-35"
                aria-label="Enviar"
                title="Enviar (Enter)"
              >
                {enviando ? <Spinner className="size-4 text-white" /> : <SendHorizontal className="size-4" />}
              </button>
            </div>
            <p className="mt-1.5 hidden text-[10px] text-fg-4 sm:block">Enter envia · Shift + Enter quebra a linha · conversa livre até 24 h depois da última mensagem dela</p>
          </>
        )}
      </div>
    </div>
  )
}

function NenhumaAberta() {
  return (
    <div className="chat-fundo flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-line-soft bg-raised text-fg-3">
        <MessagesSquare className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-fg">Escolha uma conversa</p>
      <p className="mt-1 max-w-[320px] text-xs leading-5 text-fg-3">
        Conversas do número da API oficial. Para começar uma nova, busque o lead ou digite o número: a primeira mensagem sai como modelo aprovado.
      </p>
    </div>
  )
}
