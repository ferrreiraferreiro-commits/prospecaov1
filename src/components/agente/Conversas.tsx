// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ArrowLeft, Bot, Flame, Hand, MessagesSquare, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ag, type Conversa, type ConversaResumo, type Estado, type Licao } from '../../lib/agente'
import { formatPhone } from '../../lib/contact'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { SearchInput } from '../kit'
import { Button, Empty, Spinner, WhatsAppIcon } from '../ui'
import { Avaliacao, Bolha, erroTexto, EstadoPill } from './comum'

type Filtro = 'todas' | 'voce' | 'quentes' | 'ativas' | 'encerradas'

const FILTROS: { id: Filtro; label: string; estados: Estado[] | null }[] = [
  { id: 'todas', label: 'Todas', estados: null },
  { id: 'voce', label: 'Com você', estados: ['humano'] },
  { id: 'quentes', label: 'Quentes', estados: ['quente', 'reuniao'] },
  { id: 'ativas', label: 'Em andamento', estados: ['aguardando', 'conversando'] },
  { id: 'encerradas', label: 'Encerradas', estados: ['fechado', 'perdido', 'optout', 'sem_resposta'] },
]

export function Conversas({ abrir, setAbrir }: { abrir: string | null; setAbrir: (id: string | null) => void }) {
  const [lista, setLista] = useState<ConversaResumo[] | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    try {
      setLista(await ag<ConversaResumo[]>('/conversas', { timeoutMs: 10000 }))
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [])
  useEffect(() => {
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 10_000)
    return () => clearInterval(id)
  }, [carregar])

  const visiveis = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!
    const q = busca.trim().toLowerCase()
    return (lista ?? []).filter((c) => (!f.estados || f.estados.includes(c.estado)) && (!q || `${c.empresa} ${c.telefone} ${c.cidade} ${c.nicho}`.toLowerCase().includes(q)))
  }, [lista, filtro, busca])

  const contagem = (f: (typeof FILTROS)[number]) => (lista ?? []).filter((c) => !f.estados || f.estados.includes(c.estado)).length

  return (
    <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
      <section className={clsx('panel flex min-h-[420px] flex-col lg:h-[calc(100dvh-220px)]', abrir && 'hidden lg:flex')}>
        <div className="space-y-2 border-b border-line-soft p-3">
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar empresa, cidade, telefone…" className="sm:w-full" />
          <div className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={clsx('h-6 rounded-[5px] px-2 text-2xs font-medium', filtro === f.id ? 'bg-raised text-fg ring-1 ring-line-strong' : 'text-fg-3 hover:text-fg-2')}
              >
                {f.label} <span className="text-fg-4">{contagem(f)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lista === null ? (
            <div className="grid h-40 place-items-center">
              <Spinner />
            </div>
          ) : visiveis.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-fg-3">Nenhuma conversa aqui.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {visiveis.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setAbrir(c.id)} className={clsx('w-full px-3 py-2.5 text-left hover:bg-hover', abrir === c.id && 'bg-hover')}>
                    <div className="flex items-center gap-2">
                      {c.estado === 'humano' ? <Hand className="size-3.5 shrink-0 text-red-300" /> : c.estado === 'quente' ? <Flame className="size-3.5 shrink-0 text-amber-300" /> : null}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{c.empresa}</span>
                      <span className="shrink-0 text-2xs text-fg-4">{formatRelative(c.atualizadaEm)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-fg-3">
                      {c.ultima ? `${c.ultima.de === 'lead' ? '' : c.ultima.de === 'agente' ? 'Agente: ' : 'Você: '}${c.ultima.texto}` : '—'}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <EstadoPill estado={c.estado} />
                      {c.pendente && <span className="text-2xs text-blue-300">respondendo…</span>}
                      <span className="ml-auto truncate text-2xs text-fg-4">{[c.nicho, c.cidade].filter(Boolean).join(' · ')}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={clsx('panel flex min-h-[420px] flex-col lg:h-[calc(100dvh-220px)]', !abrir && 'hidden lg:flex')}>
        {abrir ? (
          <Detalhe key={abrir} id={abrir} voltar={() => setAbrir(null)} mudou={() => void carregar()} />
        ) : (
          <div className="grid flex-1 place-items-center">
            <Empty icon={<MessagesSquare />} title="Escolha uma conversa">
              Leia o que o agente escreveu, marque 👍/👎 para ensinar, ou assuma a conversa.
            </Empty>
          </div>
        )}
      </section>
    </div>
  )
}

function Detalhe({ id, voltar, mudou }: { id: string; voltar: () => void; mudou: () => void }) {
  const toast = useApp((s) => s.toast)
  const [c, setC] = useState<Conversa | null>(null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const total = c?.mensagens.length ?? 0

  const carregar = useCallback(async () => {
    try {
      setC(await ag<Conversa>(`/conversas/${id}`, { timeoutMs: 10000 }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }, [id, toast])
  useEffect(() => {
    void carregar()
    const t = setInterval(() => document.visibilityState === 'visible' && void carregar(), 8000)
    return () => clearInterval(t)
  }, [carregar])
  useEffect(() => fim.current?.scrollIntoView({ block: 'end' }), [total])

  async function acao(nome: string, fn: () => Promise<Conversa>, aviso?: string) {
    setBusy(nome)
    try {
      setC(await fn())
      mudou()
      if (aviso) toast(aviso)
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!c)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    )

  const comVoce = c.estado === 'humano'
  const encerrada = ['fechado', 'perdido', 'optout', 'sem_resposta'].includes(c.estado)
  const marcar = (estado: Estado, aviso: string) => acao(estado, () => ag<Conversa>(`/conversas/${id}/marcar`, { method: 'POST', json: { estado } }), aviso)

  return (
    <>
      <header className="space-y-2 border-b border-line-soft px-4 py-3">
        <div className="flex items-start gap-2">
          <button type="button" onClick={voltar} className="-ml-1 grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover lg:hidden" aria-label="Voltar">
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-fg">{c.empresa}</h2>
            <p className="text-xs text-fg-3">
              {[formatPhone(c.telefone), c.nicho, [c.cidade, c.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ')}
              {c.origem === 'disparo' && ' · veio do Disparo'}
            </p>
          </div>
          <a href={`https://wa.me/${c.telefone}`} target="_blank" rel="noreferrer" title="Abrir no WhatsApp" className="grid size-7 place-items-center rounded-md text-emerald-300 hover:bg-hover">
            <WhatsAppIcon className="size-4" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <EstadoPill estado={c.estado} />
          <span className="text-2xs text-fg-4">interesse: {c.temperatura}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {comVoce || encerrada ? (
              <Button size="xs" variant="secondary" icon={<Bot className="size-3" />} loading={busy === 'devolver'} onClick={() => void acao('devolver', () => ag<Conversa>(`/conversas/${id}/devolver`, { method: 'POST' }), 'O agente voltou para esta conversa.')}>
                Devolver ao agente
              </Button>
            ) : (
              <Button size="xs" variant="secondary" icon={<Hand className="size-3" />} loading={busy === 'assumir'} onClick={() => void acao('assumir', () => ag<Conversa>(`/conversas/${id}/assumir`, { method: 'POST' }), 'Você assumiu: o agente não responde mais aqui.')}>
                Assumir
              </Button>
            )}
            <select
              className="input h-6 w-auto py-0 text-2xs"
              value=""
              onChange={(e) => {
                const v = e.target.value as Estado
                if (v === 'fechado') void marcar('fechado', 'Venda registrada.')
                if (v === 'reuniao') void marcar('reuniao', 'Reunião registrada.')
                if (v === 'perdido') void marcar('perdido', 'Marcado como perdido.')
                if (v === 'optout' && window.confirm(`${c.empresa} não recebe mais mensagens do agente. Confirmar?`)) void marcar('optout', 'Não recebe mais mensagens.')
              }}
            >
              <option value="">Marcar resultado…</option>
              <option value="fechado">Fechou (venda)</option>
              <option value="reuniao">Marcou reunião</option>
              <option value="perdido">Perdido</option>
              <option value="optout">Não quer mensagens</option>
            </select>
          </div>
        </div>
        {c.resumo && <p className="rounded-md bg-tint/[0.03] px-2.5 py-1.5 text-xs text-fg-2">{c.resumo}</p>}
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {c.mensagens.map((m) => (
          <Bolha key={m.id} de={m.de} texto={m.texto} em={m.em}>
            {m.de === 'agente' && (
              <Avaliacao
                nota={m.nota}
                correcao={m.correcao}
                enviar={async (nota, correcao) => {
                  const r = await ag<{ licao: Licao | null; conversa: Conversa }>(`/conversas/${id}/avaliar`, { method: 'POST', json: { mensagem: m.id, nota, correcao } })
                  setC(r.conversa)
                  return r.licao?.texto ?? null
                }}
              />
            )}
          </Bolha>
        ))}
        <div ref={fim} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line-soft p-3"
        onSubmit={(e) => {
          e.preventDefault()
          const t = texto.trim()
          if (!t) return
          void acao('enviar', () => ag<Conversa>(`/conversas/${id}/enviar`, { method: 'POST', json: { texto: t } })).then(() => setTexto(''))
        }}
      >
        <textarea
          className="input max-h-32 min-h-8 flex-1 resize-none"
          rows={1}
          value={texto}
          placeholder={comVoce ? 'Responder pelo WhatsApp do agente…' : 'Responder como você (o agente para nesta conversa)…'}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <Button type="submit" variant="go" icon={<Send className="size-3.5" />} loading={busy === 'enviar'} disabled={!texto.trim()}>
          Enviar
        </Button>
      </form>
    </>
  )
}
