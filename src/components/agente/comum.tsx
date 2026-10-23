// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ag, ESTADO, type AgenteConfig, type Estado, type EstadoAgente } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Pill } from '../kit'

/** Avisa a lista de lições que ele acabou de aprender algo. */
export const LICAO_NOVA = 'xs:agente-licao'

export const erroTexto =(err: unknown, padrao = 'Não foi possível concluir agora.') => (err instanceof Error && err.message) || padrao

/** Estado do agente e a configuração, recarregados de tempos em tempos. */
export function useAgente(intervaloMs = 15_000) {
  const [estado, setEstado] = useState<EstadoAgente | null>(null)
  const [config, setConfig] = useState<AgenteConfig | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([ag<EstadoAgente>('/estado', { timeoutMs: 10000 }), ag<AgenteConfig>('/config', { timeoutMs: 10000 })])
      setEstado(e)
      setConfig(c)
      setErro(null)
    } catch (err) {
      setErro(erroTexto(err))
    }
  }, [])

  useEffect(() => {
    void recarregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void recarregar(), intervaloMs)
    return () => clearInterval(id)
  }, [recarregar, intervaloMs])

  /** Salva mudanças na configuração. Devolve a versão final (o servidor confere e ajusta), ou null se falhou. */
  const salvar = useCallback(
    async (patch: Partial<AgenteConfig>, aviso = 'Salvo.'): Promise<AgenteConfig | null> => {
      try {
        const c = await ag<AgenteConfig>('/config', { method: 'POST', json: patch })
        setConfig(c)
        if (aviso) useApp.getState().toast(aviso)
        void recarregar()
        return c
      } catch (err) {
        useApp.getState().toast(erroTexto(err), 'error')
        return null
      }
    },
    [recarregar],
  )

  return { estado, config, erro, recarregar, salvar, setEstado }
}

export type AgenteCtx = ReturnType<typeof useAgente> & { estado: EstadoAgente; config: AgenteConfig }

/** Interruptor liga/desliga. */
export function Chave({ ligado, onChange, disabled, label }: { ligado: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: ReactNode }) {
  return (
    <label className={clsx('inline-flex cursor-pointer items-center gap-2.5 select-none', disabled && 'pointer-events-none opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => onChange(!ligado)}
        className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', ligado ? 'bg-go' : 'bg-line-strong')}
      >
        <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', ligado ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label && <span className="text-[13px] text-fg-2">{label}</span>}
    </label>
  )
}

export function EstadoPill({ estado }: { estado: Estado }) {
  return <Pill className={ESTADO[estado].cls}>{ESTADO[estado].label}</Pill>
}

/** Balão de WhatsApp: cliente à esquerda, agente (azul) e você (verde) à direita. */
export function Bolha({
  de,
  texto,
  em,
  rodape,
  children,
}: {
  de: 'lead' | 'agente' | 'voce'
  texto: string
  em?: string
  rodape?: ReactNode
  children?: ReactNode
}) {
  const nosso = de !== 'lead'
  return (
    <div className={clsx('flex flex-col', nosso ? 'items-end' : 'items-start')}>
      <div
        className={clsx(
          'max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap sm:max-w-[75%]',
          de === 'lead' && 'rounded-tl-sm bg-raised text-fg ring-1 ring-line',
          de === 'agente' && 'rounded-tr-sm bg-blue-500/15 text-fg ring-1 ring-blue-500/25',
          de === 'voce' && 'rounded-tr-sm bg-emerald-500/15 text-fg ring-1 ring-emerald-500/25',
        )}
      >
        {texto}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 px-1 text-2xs text-fg-4">
        {de === 'agente' ? 'Agente' : de === 'voce' ? 'Você' : null}
        {em && <span>{formatRelative(em)}</span>}
        {rodape}
      </div>
      {children}
    </div>
  )
}

/**
 * 👍/👎 numa mensagem do agente. No 👎 (ou se quiser comentar), abre o campo "como você teria escrito".
 * `enviar` devolve a lição aprendida (ou null).
 */
export function Avaliacao({ nota, correcao, enviar }: { nota?: 'bom' | 'ruim'; correcao?: string; enviar: (nota: 'bom' | 'ruim', correcao: string) => Promise<string | null> }) {
  const [aberto, setAberto] = useState<'ruim' | null>(null)
  const [texto, setTexto] = useState(correcao ?? '')
  const [busy, setBusy] = useState(false)
  const [atual, setAtual] = useState(nota)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (aberto) ref.current?.focus()
  }, [aberto])

  async function mandar(n: 'bom' | 'ruim', t: string) {
    setBusy(true)
    try {
      const licao = await enviar(n, t)
      if (licao) window.dispatchEvent(new Event(LICAO_NOVA))
      setAtual(n)
      setAberto(null)
      useApp.getState().toast(licao ? `Aprendeu: ${licao}` : n === 'bom' ? 'Anotado: assim está bom.' : 'Anotado.')
    } catch (err) {
      useApp.getState().toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 flex w-full max-w-[85%] flex-col items-end gap-1.5 sm:max-w-[75%]">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Boa resposta"
          disabled={busy}
          onClick={() => void mandar('bom', '')}
          className={clsx('grid size-6 place-items-center rounded-md transition-colors hover:bg-hover [&_svg]:size-3.5', atual === 'bom' ? 'text-emerald-300' : 'text-fg-4')}
        >
          <ThumbsUp />
        </button>
        <button
          type="button"
          title="Resposta ruim: ensinar o jeito certo"
          disabled={busy}
          onClick={() => setAberto(aberto === 'ruim' ? null : 'ruim')}
          className={clsx('grid size-6 place-items-center rounded-md transition-colors hover:bg-hover [&_svg]:size-3.5', atual === 'ruim' ? 'text-red-300' : 'text-fg-4')}
        >
          <ThumbsDown />
        </button>
      </div>
      {aberto && (
        <div className="w-full rounded-lg border border-line bg-ink p-2">
          <textarea
            ref={ref}
            className="input resize-y"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Como você teria escrito? Ou explique o que ficou ruim."
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" className="h-7 rounded-md px-2.5 text-xs text-fg-3 hover:text-fg" onClick={() => setAberto(null)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !texto.trim()}
              onClick={() => void mandar('ruim', texto)}
              className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Aprendendo…' : 'Ensinar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Campo de texto longo do treino. */
export function Texto({ value, onChange, rows = 4, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className="input resize-y" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export const usd = (v: number) => `US$ ${v.toFixed(v > 0 && v < 0.1 ? 3 : 2).replace('.', ',')}`

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
