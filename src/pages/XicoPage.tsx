// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ArrowRight, Check, KeyRound, LoaderCircle, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/kit'
import { Button, Spinner } from '../components/ui'
import { ag, type EstadoAgente } from '../lib/agente'
import { formatRelative } from '../lib/dates'
import { executarNoApp, type EstadoXico, type MensagemXico } from '../lib/xico'
import { useApp } from '../store/useApp'

const SUGESTOES = ['Como foi o dia?', 'Me mostra como você abordaria uma barbearia', 'O que você já sabe sobre mim?', 'Quais leads eu preciso ligar hoje?']

const erroTexto = (err: unknown) => (err instanceof Error && err.message) || 'Não foi possível agora.'

/**
 * Xico: o assistente do dono. Um chat para conversar, trocar ideias e ensinar; ao lado, o que espera
 * confirmação, como está o vendedor do WhatsApp e o que ele já sabe sobre você.
 */
export function XicoPage() {
  const toast = useApp((s) => s.toast)
  const [s, setS] = useState<EstadoXico | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const atendidas = useRef(new Set<string>())
  const fim = useRef<HTMLDivElement>(null)
  const ocupado = !!s && s.estado !== 'livre'

  // Abre (ele pode puxar assunto) e acompanha: rápido enquanto pensa, devagar quando livre
  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout>
    let ultimo: EstadoXico | null = null
    const ciclo = async (primeira: boolean) => {
      try {
        ultimo = await ag<EstadoXico>(primeira ? '/xico/abrir' : '/xico', primeira ? { method: 'POST' } : { timeoutMs: 10000 })
        if (vivo) {
          setS(ultimo)
          setErro(null)
        }
      } catch (err) {
        if (vivo) setErro(erroTexto(err))
      }
      if (vivo) timer = setTimeout(() => void ciclo(false), ultimo && ultimo.estado !== 'livre' ? 1200 : 15000)
    }
    void ciclo(true)
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [])

  // O Xico pediu algo do CRM: executa aqui e devolve
  useEffect(() => {
    if (s?.estado !== 'esperando_app' || !s.chamadasApp.length) return
    const novas = s.chamadasApp.filter((c) => !atendidas.current.has(c.id))
    if (!novas.length) return
    for (const c of novas) atendidas.current.add(c.id)
    void (async () => {
      const resultados = await Promise.all(
        s.chamadasApp.map(async (c) => {
          try {
            return { tool_use_id: c.id, content: await executarNoApp(c.name, c.input ?? {}) }
          } catch (err) {
            return { tool_use_id: c.id, content: erroTexto(err), is_error: true }
          }
        }),
      )
      try {
        setS(await ag<EstadoXico>('/xico/app', { method: 'POST', json: { resultados } }))
      } catch {
        /* outra aba já respondeu */
      }
    })()
  }, [s])

  const total = s?.mensagens.length ?? 0
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [total, ocupado])

  async function enviar(t = texto) {
    const msg = t.trim()
    if (!msg || ocupado) return
    setEnviando(true)
    setTexto('')
    try {
      setS(await ag<EstadoXico>('/xico/mensagem', { method: 'POST', json: { texto: msg } }))
    } catch (err) {
      setTexto(msg)
      toast(erroTexto(err), 'error')
    } finally {
      setEnviando(false)
    }
  }

  async function recomecar() {
    if (!window.confirm('Começar uma conversa nova? O Xico guarda um resumo desta e tudo o que ele sabe sobre você.')) return
    try {
      setS(await ag<EstadoXico>('/xico/recomecar', { method: 'POST', timeoutMs: 90000 }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  if (!s)
    return (
      <div className="grid h-[60vh] place-items-center text-center">
        {erro ? (
          <div className="max-w-sm space-y-2">
            <p className="text-sm font-semibold text-fg">O Xico não está disponível agora</p>
            <p className="text-xs text-fg-3">{erro}</p>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel flex h-[calc(100dvh-170px)] min-h-[480px] min-w-0 flex-col lg:h-[calc(100dvh-120px)]">
        <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
          <Avatar />
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold text-fg">Xico</h1>
            <p className="truncate text-xs text-fg-3">{ocupado ? `${s.fazendo || 'Pensando'}…` : 'Seu braço direito na XS. Conversa, aprende com você e cuida das vendas.'}</p>
          </div>
          <Button size="sm" variant="ghost" icon={<MessageSquarePlus className="size-3.5" />} disabled={ocupado || !s.mensagens.length} onClick={() => void recomecar()}>
            <span className="hidden sm:inline">Nova conversa</span>
          </Button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!s.temChave && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3.5 py-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <div className="text-xs text-fg-2">
                <p className="text-[13px] font-semibold text-fg">Falta a chave da API</p>
                O Xico pensa com o Claude. Coloque a chave em{' '}
                <Link to="/agente?aba=ajustes" className="text-blue-300 hover:underline">
                  Vendedor no WhatsApp → Ajustes
                </Link>{' '}
                e volte aqui.
              </div>
            </div>
          )}
          {s.mensagens.length === 0 && s.temChave && !ocupado && (
            <div className="mx-auto max-w-md py-10 text-center">
              <Avatar grande />
              <p className="mt-3 text-sm font-semibold text-fg">Fala com o Xico</p>
              <p className="mt-1 text-xs text-fg-3">Conta o que você quer, o que não quer, como gosta de vender. Ele aprende, ajusta o vendedor e te avisa do que importa.</p>
            </div>
          )}
          {s.mensagens.map((m) => (
            <Linha key={m.id} m={m} />
          ))}
          {ocupado && (
            <div className="flex items-center gap-2 text-xs text-fg-3">
              <LoaderCircle className="size-3.5 animate-spin text-blue-300" />
              {s.fazendo || 'Pensando'}…
            </div>
          )}
          <div ref={fim} />
        </div>

        {s.temChave && s.mensagens.filter((m) => m.de === 'voce').length === 0 && !ocupado && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {SUGESTOES.map((t) => (
              <button key={t} type="button" onClick={() => void enviar(t)} className="h-7 rounded-full px-3 text-xs text-fg-2 ring-1 ring-line hover:bg-hover hover:text-fg">
                {t}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex items-end gap-2 border-t border-line-soft p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
        >
          <textarea
            className="input max-h-40 min-h-9 flex-1 resize-none"
            rows={Math.min(6, Math.max(1, texto.split('\n').length))}
            value={texto}
            disabled={!s.temChave}
            placeholder={ocupado ? 'O Xico está respondendo…' : 'Fala com o Xico…'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void enviar()
              }
            }}
          />
          <Button type="submit" variant="primary" icon={<Send className="size-3.5" />} loading={enviando} disabled={!texto.trim() || ocupado || !s.temChave}>
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </form>
      </section>

      <aside className="min-w-0 space-y-4">
        <Propostas s={s} setS={setS} />
        <Vendedor />
        <Memoria s={s} setS={setS} />
      </aside>
    </div>
  )
}

function Avatar({ grande }: { grande?: boolean }) {
  return (
    <span className={clsx('inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-400 text-white', grande ? 'size-12' : 'size-9')}>
      <Sparkles className={grande ? 'size-5' : 'size-4'} />
    </span>
  )
}

function Linha({ m }: { m: MensagemXico }) {
  if (m.de === 'nota')
    return (
      <div className="text-center text-2xs text-fg-4">
        {m.acoes?.length ? <Acoes acoes={m.acoes} centro /> : null}
        {m.texto !== 'Pronto.' && m.texto}
      </div>
    )
  const voce = m.de === 'voce'
  return (
    <div className={clsx('flex flex-col', voce ? 'items-end' : 'items-start')}>
      {m.acoes?.length ? <Acoes acoes={m.acoes} /> : null}
      <div
        className={clsx(
          'max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-[1.55] sm:max-w-[78%]',
          voce ? 'rounded-tr-sm bg-emerald-500/15 text-fg ring-1 ring-emerald-500/25 whitespace-pre-wrap' : 'rounded-tl-sm bg-raised text-fg ring-1 ring-line',
        )}
      >
        {voce ? m.texto : <Rico texto={m.texto} />}
      </div>
      <span className="mt-0.5 px-1 text-2xs text-fg-4">{formatRelative(m.em)}</span>
    </div>
  )
}

function Acoes({ acoes, centro }: { acoes: string[]; centro?: boolean }) {
  const unicas = [...new Set(acoes)]
  return <div className={clsx('mb-1 flex flex-wrap gap-1 text-2xs text-fg-4', centro && 'justify-center')}>{unicas.map((a) => <span key={a} className="rounded-full bg-tint/[0.04] px-2 py-0.5 ring-1 ring-line-soft">{a}</span>)}</div>
}

/** Texto do Xico: parágrafos, listas com "- " e **negrito**. */
function Rico({ texto }: { texto: string }) {
  const negrito = (linha: string): ReactNode[] => linha.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))
  const blocos = texto.split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocos.map((b, i) => {
        const linhas = b.split('\n')
        if (linhas.every((l) => /^\s*[-•]\s/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {linhas.map((l, j) => (
                <li key={j}>{negrito(l.replace(/^\s*[-•]\s/, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i} className="whitespace-pre-wrap">
            {negrito(b)}
          </p>
        )
      })}
    </div>
  )
}

function Propostas({ s, setS }: { s: EstadoXico; setS: (v: EstadoXico) => void }) {
  const toast = useApp((x) => x.toast)
  const [busy, setBusy] = useState<string | null>(null)
  if (!s.propostas.length) return null
  async function decidir(id: string, aceitar: boolean) {
    setBusy(id)
    try {
      setS(await ag<EstadoXico>(`/xico/propostas/${id}`, { method: 'POST', json: { aceitar } }))
      toast(aceitar ? 'Feito. O vendedor já usa a mudança.' : 'Recusado.')
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card title="Esperando você" description="O Xico quer mudar isto. Só vale se você confirmar." className="border-blue-500/30">
      <ul className="space-y-3">
        {s.propostas.map((p) => (
          <li key={p.id} className="rounded-lg border border-line-soft bg-ink p-3">
            <p className="text-[13px] font-semibold text-fg">{p.titulo}</p>
            {p.detalhe && <p className="mt-1 max-h-48 overflow-y-auto text-xs whitespace-pre-wrap text-fg-2">{p.detalhe}</p>}
            <div className="mt-2.5 flex gap-1.5">
              <Button size="sm" variant="go" icon={<Check className="size-3.5" />} loading={busy === p.id} onClick={() => void decidir(p.id, true)}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => void decidir(p.id, false)}>
                Recusar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Vendedor() {
  const [e, setE] = useState<EstadoAgente | null>(null)
  const carregar = useCallback(() => ag<EstadoAgente>('/estado', { timeoutMs: 10000 }).then(setE, () => undefined), [])
  useEffect(() => {
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 30_000)
    return () => clearInterval(id)
  }, [carregar])
  if (!e) return null
  const trabalhando = e.ativo && e.whatsapp === 'connected' && !e.pausadoPorRisco
  const n = (rotulo: string, v: ReactNode, cls = 'text-fg') => (
    <div>
      <div className="text-2xs text-fg-4">{rotulo}</div>
      <div className={clsx('num text-base font-semibold', cls)}>{v}</div>
    </div>
  )
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Vendedor no WhatsApp
          <span className={clsx('size-1.5 rounded-full', trabalhando ? 'animate-pulse bg-go' : 'bg-fg-4')} />
          <span className="text-2xs font-normal text-fg-3">{trabalhando ? 'trabalhando' : e.ativo ? 'ligado, parado' : 'desligado'}</span>
        </span>
      }
      actions={
        <Link to="/agente" className="flex items-center gap-1 text-xs text-blue-300 hover:underline">
          Abrir <ArrowRight className="size-3" />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {n('Abordadas', `${e.hoje.abordados}/${e.cotaHoje}`)}
        {n('Responderam', e.hoje.responderam, 'text-blue-300')}
        {n('Quentes', e.hoje.quentes, 'text-amber-300')}
        {n('Reuniões', e.hoje.reunioes, 'text-emerald-300')}
        {n('Vendas', e.hoje.vendas, 'text-emerald-300')}
        {n('Gasto IA', `US$ ${e.hoje.custoUSD.toFixed(2).replace('.', ',')}`)}
      </div>
      {(e.contagem.humano ?? 0) > 0 && (
        <Link to="/agente?aba=conversas" className="mt-3 block rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/15">
          {e.contagem.humano} conversa(s) esperando você
        </Link>
      )}
    </Card>
  )
}

function Memoria({ s, setS }: { s: EstadoXico; setS: (v: EstadoXico) => void }) {
  const toast = useApp((x) => x.toast)
  async function apagar(id: string) {
    try {
      setS(await ag<EstadoXico>(`/xico/memoria/${id}`, { method: 'DELETE' }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }
  return (
    <Card title="O que ele sabe sobre você" description="Ele guarda sozinho o que você conta. Apague o que estiver errado.">
      {s.memoria.length === 0 ? (
        <p className="py-3 text-center text-xs text-fg-3">Nada ainda. Conversa com ele.</p>
      ) : (
        <ul className="max-h-[360px] space-y-1.5 overflow-y-auto">
          {s.memoria
            .slice()
            .reverse()
            .map((m) => (
              <li key={m.id} className="group flex items-start gap-2 text-xs text-fg-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-blue-300" />
                <span className="min-w-0 flex-1 leading-5">{m.texto}</span>
                <button type="button" title="Apagar" onClick={() => void apagar(m.id)} className="text-fg-4 opacity-0 group-hover:opacity-100 hover:text-red-300 max-lg:opacity-100">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
        </ul>
      )}
    </Card>
  )
}
