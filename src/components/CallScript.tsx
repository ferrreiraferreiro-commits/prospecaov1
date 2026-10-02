import clsx from 'clsx'
import { MessageSquareQuote } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fillTemplate, getActiveRoteiro, getObjections, getRoteiros, getScript, leadHooks, toBlocks } from '../lib/script'
import { useApp } from '../store/useApp'
import type { Lead, Settings } from '../lib/types'
import { Kbd } from './ui'

function isTyping(el: Element | null) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

/** Roteiro em forma de teleprompter: a etapa atual fica em destaque, as demais recuam. */
export function CallScript({ lead, settings }: { lead: Lead; settings: Settings }) {
  const sections = useMemo(() => getScript(settings), [settings])
  const objections = useMemo(() => getObjections(settings), [settings])
  const hooks = useMemo(() => leadHooks(lead, settings), [lead, settings])
  const [step, setStep] = useState(0)
  const [objection, setObjection] = useState<string | null>(null)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const roteiros = getRoteiros(settings)
  const ativo = getActiveRoteiro(settings)

  function switchRoteiro(id: string) {
    const r = roteiros.find((x) => x.id === id)
    if (!r) return
    // Garante que a lista exista no banco (primeira troca a partir do roteiro legado)
    void saveSettings({ ...settings, roteiros, roteiro_ativo: id })
    setStep(0)
    setObjection(null)
    toast(`Usando “${r.nome}”.`, 'info')
  }

  useEffect(() => {
    setStep(0)
    setObjection(null)
  }, [lead.id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setStep((s) => Math.min(sections.length - 1, s + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setStep((s) => Math.max(0, s - 1))
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [sections.length])

  const active = objections.find((o) => o.id === objection)

  return (
    <div className="space-y-5">
      {/* Gancho específico do lead */}
      <div className="rounded-lg border border-gold/20 bg-gold/[0.04] px-4 py-3">
        <p className="mb-1.5 text-2xs font-medium text-gold/90">Gancho para este lead</p>
        <ul className="space-y-1.5">
          {hooks.map((h) => (
            <li key={h} className="text-sm leading-6 text-fg">
              “{h}”
            </li>
          ))}
        </ul>
      </div>

      {/* Etapas */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-semibold text-fg-2">Roteiro</h3>
          {roteiros.length > 1 ? (
            <select
              value={ativo.id}
              onChange={(e) => switchRoteiro(e.target.value)}
              className="input h-6 w-auto max-w-[220px] cursor-pointer px-1.5 py-0 text-2xs"
              aria-label="Escolher roteiro"
              title="Trocar o roteiro usado nas próximas ligações"
            >
              {roteiros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          ) : (
            <Link to="/configuracoes#roteiros" className="text-2xs text-fg-3 hover:text-fg" title="Criar outros roteiros para testar">
              {ativo.nome} · criar outro
            </Link>
          )}
          {!settings.nome_vendedor.trim() && (
            <Link to="/configuracoes" className="text-2xs text-fg-3 underline decoration-fg-4 underline-offset-2 hover:text-fg">
              Defina seu nome em Ajustes
            </Link>
          )}
          <span className="ml-auto hidden items-center gap-1 text-2xs text-fg-4 sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> mudam a etapa
          </span>
        </div>
        <ol className="space-y-1">
          {sections.map((sec, i) => {
            const current = i === step
            const done = i < step
            return (
              <li key={sec.id}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={clsx(
                    'relative w-full rounded-lg py-2.5 pr-4 pl-11 text-left transition-colors',
                    current ? 'bg-raised' : 'hover:bg-tint/[0.02]',
                  )}
                >
                  {current && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-gold" aria-hidden />}
                  <span
                    className={clsx(
                      'num absolute top-2.5 left-3.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                      current ? 'bg-gold text-[#1a1404]' : done ? 'bg-tint/[0.08] text-fg-3' : 'border border-line text-fg-4',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={clsx('block text-xs font-semibold', current ? 'text-gold' : done ? 'text-fg-3' : 'text-fg-2')}>{sec.titulo}</span>
                  <div className={clsx('mt-1 space-y-1.5', current ? 'text-[15px] leading-[1.6] text-fg' : 'line-clamp-2 text-xs leading-5 text-fg-3')}>
                    {toBlocks(fillTemplate(sec.texto, lead, settings)).map((b, bi) =>
                      b.kind === 'list' ? (
                        <ul key={bi} className={clsx('space-y-1', current && 'space-y-1.5')}>
                          {b.lines.map((line) => (
                            <li key={line} className="flex gap-2">
                              <span className={clsx('mt-[0.6em] size-1 shrink-0 rounded-full', current ? 'bg-gold/70' : 'bg-fg-4')} />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p key={bi}>{b.lines.join(' ')}</p>
                      ),
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Objeções */}
      <div>
        <h3 className="mb-2 text-xs font-semibold text-fg-2">Objeções</h3>
        <div className="flex flex-wrap gap-1.5">
          {objections.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setObjection((cur) => (cur === o.id ? null : o.id))}
              className={clsx(
                'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                objection === o.id ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:text-fg',
              )}
            >
              {o.titulo}
            </button>
          ))}
        </div>
        {active && (
          <div key={active.id} className="anim-rise mt-2.5 flex gap-3 rounded-lg border border-line bg-raised px-4 py-3">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-gold" />
            <div>
              <p className="text-2xs font-medium text-fg-3">{active.titulo}</p>
              <p className="mt-1 text-[15px] leading-[1.6] text-fg">“{fillTemplate(active.resposta, lead, settings)}”</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
