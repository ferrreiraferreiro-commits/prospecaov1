// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: chat geral da equipe (bate-papo), com os avisos da fila de sites no meio.
import clsx from 'clsx'
import { Code, MessageSquare, SendHorizontal, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Button, Spinner } from '../components/ui'
import { rotuloDia } from '../lib/conversas'
import { PAPEIS, turnoAberto, useTurnos } from '../lib/equipe'
import { useChat, useQuem, useSites } from '../lib/sites'
import { useAccount, usePapel } from '../store/useAccount'
import { useApp } from '../store/useApp'

const COR_CARGO = { dono: 'text-gold', gestor: 'text-gold', vendedor: 'text-blue-300', desenvolvedor: 'text-emerald-300' } as const

export function ChatPage() {
  const { mensagens, carregado, carregar, enviar, apagar, marcarVisto } = useChat()
  const quem = useQuem()
  const turnos = useTurnos((s) => s.turnos)
  const pedidos = useSites((s) => s.pedidos)
  const eu = useAccount((s) => s.profile?.user_id)
  const papel = usePapel()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  // Enquanto o chat está aberto, busca mensagens novas a cada 4 segundos
  useEffect(() => {
    void carregar()
    const t = setInterval(() => document.visibilityState === 'visible' && void carregar(), 4000)
    return () => clearInterval(t)
  }, [carregar])

  const ultima = mensagens.at(-1)?.id
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
    marcarVisto()
  }, [ultima, marcarVisto])

  const mandar = async () => {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      await enviar(texto)
      setTexto('')
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    } finally {
      setEnviando(false)
    }
  }
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void mandar()
    }
  }

  const pessoas = [...quem.entries()]
  const pedidoDoLead = (leadId: string | null) => pedidos.find((p) => p.lead_id === leadId)

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[460px] gap-4 lg:h-[calc(100dvh-5.5rem)]">
      <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-lg border border-line-soft bg-raised">
            <MessageSquare className="size-4 text-blue-300" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-semibold">Chat da equipe</h1>
            <p className="text-2xs text-fg-3">Todo mundo da equipe vê. Os avisos dos sites aparecem aqui sozinhos.</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
          {!carregado ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !mensagens.length ? (
            <p className="py-16 text-center text-xs text-fg-4">Nenhuma mensagem ainda. Mande a primeira!</p>
          ) : (
            mensagens.map((m, i) => {
              const ant = mensagens[i - 1]
              const dia = rotuloDia(m.criado_em)
              const novoDia = !ant || rotuloDia(ant.criado_em) !== dia
              const seguida = !novoDia && ant?.autor === m.autor && !!m.autor && Date.parse(m.criado_em) - Date.parse(ant.criado_em) < 5 * 60_000
              const hora = new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              const p = m.autor ? quem.get(m.autor) : null
              const minha = m.autor === eu
              return (
                <Fragment key={m.id}>
                  {novoDia && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-tint/[0.05] px-2.5 text-2xs leading-5 text-fg-3">{dia}</span>
                    </div>
                  )}
                  {!m.autor ? (
                    <div className="flex justify-center py-1">
                      <Link
                        to={pedidoDoLead(m.lead_id) ? `/equipe/sites?id=${pedidoDoLead(m.lead_id)!.id}` : '/equipe/sites'}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-2xs text-emerald-200 hover:bg-emerald-500/10"
                      >
                        <Code className="size-3 shrink-0" />
                        <span className="pv truncate">{m.texto}</span>
                        <span className="text-emerald-200/50">{hora}</span>
                      </Link>
                    </div>
                  ) : (
                    <div className={clsx('group flex gap-2.5', minha && 'flex-row-reverse', seguida ? 'pt-0.5' : 'pt-2.5')}>
                      <div className="w-8 shrink-0">{!seguida && !minha && <Avatar src={null} name={p?.nome ?? '?'} size={32} />}</div>
                      <div className={clsx('flex min-w-0 max-w-[75%] flex-col', minha && 'items-end')}>
                        {!seguida && !minha && (
                          <p className="mb-0.5 text-2xs">
                            <span className={clsx('pv font-semibold', COR_CARGO[p?.papel ?? 'vendedor'])}>{p?.nome ?? 'Alguém'}</span>
                            <span className="ml-1.5 text-fg-4">{p ? (p.papel === 'dono' ? 'Dono' : PAPEIS[p.papel]) : ''}</span>
                          </p>
                        )}
                        <div className="flex items-end gap-1.5">
                          {(minha || papel === 'dono') && (
                            <button
                              onClick={() => void apagar(m.id).catch((e: Error) => useApp.getState().toast(e.message, 'error'))}
                              className="invisible rounded p-1 text-fg-4 group-hover:visible hover:text-red-300"
                              aria-label="Apagar mensagem"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                          <div className={clsx('pv rounded-xl px-3 py-1.5 text-[13px] leading-5 break-words whitespace-pre-wrap', minha ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-raised text-fg')}>
                            {m.texto}
                            <span className={clsx('ml-2 align-bottom text-[10px]', minha ? 'text-white/60' : 'text-fg-4')}>{hora}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })
          )}
          <div ref={fim} />
        </div>

        <footer className="flex items-end gap-2 border-t border-line-soft px-3 py-3">
          <textarea
            className="input max-h-32 min-h-[38px] flex-1 resize-none py-2 text-[13px] leading-5"
            rows={1}
            placeholder="Escreva para a equipe… (Enter envia, Shift+Enter pula linha)"
            value={texto}
            maxLength={2000}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tecla}
          />
          <Button variant="primary" size="lg" icon={<SendHorizontal className="size-4" />} loading={enviando} disabled={!texto.trim()} onClick={() => void mandar()} aria-label="Enviar" />
        </footer>
      </section>

      {/* Quem é da equipe e quem está em serviço agora */}
      <aside className="panel hidden w-60 shrink-0 flex-col overflow-hidden lg:flex">
        <p className="border-b border-line-soft px-4 py-3 text-2xs font-semibold tracking-[0.08em] text-fg-4 uppercase">Equipe · {pessoas.length}</p>
        <ul className="flex-1 overflow-y-auto py-1">
          {pessoas.map(([id, p]) => {
            const online = !!turnoAberto(turnos, id)
            return (
              <li key={id} className="flex items-center gap-2.5 px-4 py-2" title={p.papel === 'dono' ? undefined : online ? 'Em serviço' : 'Fora de serviço'}>
                <span className="relative">
                  <Avatar src={null} name={p.nome} size={28} />
                  {p.papel !== 'dono' && <span className={clsx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-panel', online ? 'bg-go' : 'bg-fg-4/50')} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="pv block truncate text-xs font-medium">{p.nome}</span>
                  <span className={clsx('block text-2xs', COR_CARGO[p.papel])}>{p.papel === 'dono' ? 'Dono' : PAPEIS[p.papel]}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}
