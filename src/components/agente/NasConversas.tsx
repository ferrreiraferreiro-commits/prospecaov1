// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Bot, Hand, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ag, ESTADO, type ConversaDoAgente, type MapaAgente } from '../../lib/agente'
import { phoneKeyBr } from '../../lib/disparo'
import { useWaServico } from '../../lib/waServico'
import { useHasIA } from '../../store/useAccount'
import { useApp } from '../../store/useApp'
import { erroTexto } from './comum'
import { RascunhoPendente } from './PrecisaDeVoce'

/**
 * O vendedor IA dentro da tela Conversas: selo na lista, quem está com a conversa, a ficha do cliente
 * e os botões de assumir e entregar. Em toda conta com o WhatsApp da XS.
 */

/** O vendedor está disponível nesta conta? */
export function useAgenteNasConversas(): boolean {
  const temIA = useHasIA()
  const disponivel = useWaServico((s) => !!s.online && !!s.health?.agente)
  return temIA && disponivel
}

/** Quais números estão com o vendedor (confere a cada 15 s com a aba visível). */
export function useMapaAgente(ligado: boolean) {
  const [mapa, setMapa] = useState<Map<string, MapaAgente>>(new Map())
  const carregar = useCallback(async () => {
    try {
      const lista = await ag<MapaAgente[]>('/mapa', { timeoutMs: 8000 })
      setMapa(new Map(lista.map((m) => [phoneKeyBr(m.telefone), m])))
    } catch {
      /* motor antigo ou fora do ar: sem selos */
    }
  }, [])
  useEffect(() => {
    if (!ligado) return
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 15_000)
    return () => clearInterval(id)
  }, [ligado, carregar])
  return { mapa, recarregar: carregar }
}

/** Selo pequeno da lista: a IA está nesta conversa (ou passou para você). */
export function SeloAgente({ m }: { m: MapaAgente | undefined }) {
  if (!m) return null
  const comVoce = m.estado === 'humano'
  return (
    <span
      title={`Vendedor IA: ${ESTADO[m.estado]?.label ?? ''}`}
      className={clsx(
        'inline-flex h-4 shrink-0 items-center gap-1 rounded px-1 text-[10px] font-semibold ring-1 ring-inset',
        m.aguardando ? 'bg-red-500/10 text-red-300 ring-red-500/25' : comVoce ? 'bg-tint/[0.05] text-fg-3 ring-line' : 'bg-blue-500/10 text-blue-300 ring-blue-500/25',
      )}
    >
      <Bot className="size-2.5" />
      {m.aguardando ? 'Com você' : comVoce ? 'Você' : 'IA'}
    </span>
  )
}

const NOME_FATO: Record<string, string> = {
  nome_contato: 'Nome',
  decisor: 'Quem decide',
  dor: 'Dor',
  orcamento: 'Orçamento',
  interesse: 'Interesse',
  retomar_em: 'Retomar em',
  canal_atual: 'Como acham hoje',
  objecao: 'Objeção',
  outro: 'Anotação',
}

/** Faixa abaixo do cabeçalho da conversa: estado do vendedor, ficha e botões. */
export function FaixaAgente({ telefone, nome, versao, onDoAgente, onMudou }: { telefone: string; nome: string | null; versao: number; onDoAgente: (ids: Set<string>) => void; onMudou: () => void }) {
  const toast = useApp((s) => s.toast)
  const [c, setC] = useState<ConversaDoAgente | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const resp = await ag<ConversaDoAgente | null>(`/tel/${telefone}`, { timeoutMs: 8000 })
      // Sem conversa do vendedor o serviço responde { ok: true }: conta como nenhuma
      const r = resp && resp.estado in ESTADO ? resp : null
      setC(r)
      onDoAgente(new Set((r?.doAgente ?? []).map((m) => m.waId)))
    } catch {
      setC(null)
      onDoAgente(new Set())
    }
  }, [telefone, onDoAgente])

  useEffect(() => {
    void carregar()
  }, [carregar, versao])

  async function acao(caminho: 'assumir' | 'entregar') {
    setBusy(true)
    try {
      const r = await ag<ConversaDoAgente>(`/tel/${telefone}/${caminho}`, { method: 'POST', json: caminho === 'entregar' ? { nome } : {} })
      setC(r)
      toast(caminho === 'assumir' ? 'Você assumiu. O vendedor não responde mais aqui.' : 'Entregue ao vendedor. Ele continua a conversa.')
      onMudou()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (c === undefined) return null
  const comIA = !!c && c.estado !== 'humano' && c.estado !== 'optout' && c.estado !== 'fechado' && c.estado !== 'perdido'
  const botao = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg disabled:opacity-40'

  return (
    <div className="shrink-0 border-b border-line-soft bg-panel/60 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={clsx('inline-flex items-center gap-1.5 font-medium', comIA ? 'text-blue-300' : 'text-fg-3')}>
          <Bot className="size-3.5" />
          {!c ? 'O vendedor IA não está nesta conversa' : comIA ? `Vendedor IA: ${ESTADO[c.estado].label}` : `Vendedor IA parado aqui (${ESTADO[c.estado].label})`}
        </span>
        {c?.temperatura === 'quente' && <span className="rounded bg-amber-400/10 px-1.5 text-[10px] font-semibold text-amber-300">Quente</span>}
        <span className="flex-1" />
        {c && comIA && (
          <button className={botao} disabled={busy} onClick={() => void acao('assumir')} title="O vendedor para de responder nesta conversa">
            <Hand className="size-3.5" /> Assumir
          </button>
        )}
        {(!c || !comIA) && c?.estado !== 'optout' && (
          <button className={botao} disabled={busy} onClick={() => void acao('entregar')} title="O vendedor continua a conversa a partir daqui">
            <Bot className="size-3.5" /> {c ? 'Devolver à IA' : 'Entregar à IA'}
          </button>
        )}
        <Link to={c ? `/agente?aba=conversas&conversa=${c.id}` : '/agente'} className="text-2xs text-blue-300 hover:text-blue-200">
          Abrir no vendedor →
        </Link>
      </div>
      {c?.pendencia && (
        <div className="mt-1.5 rounded-md border border-red-500/25 bg-red-500/[0.06] px-2 py-1.5">
          <p className="flex items-start gap-1.5 text-2xs text-red-200">
            <ShieldAlert className="mt-px size-3 shrink-0" />
            <span>
              {c.pendencia.texto}
              {c.pendencia.motivo && <span className="text-red-200/80"> {c.pendencia.motivo}</span>}
            </span>
          </p>
          {c.pendencia.mensagens.length > 0 && (
            <div className="mt-2">
              <RascunhoPendente
                key={c.pendencia.id}
                id={c.pendencia.id}
                mensagens={c.pendencia.mensagens}
                compacto
                onFeito={() => {
                  void carregar()
                  onMudou()
                }}
              />
            </div>
          )}
        </div>
      )}
      {c && (c.resumo || c.fatos.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-fg-3">
          {c.resumo && <span className="pv min-w-0 basis-full truncate text-fg-2">{c.resumo}</span>}
          {c.fatos.slice(-6).map((f, i) => (
            <span key={i} className="pv">
              <span className="text-fg-4">{NOME_FATO[f.chave] ?? f.chave}:</span> {f.valor}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
