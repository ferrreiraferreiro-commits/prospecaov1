import clsx from 'clsx'
import { useState } from 'react'
import { formatMoney, MEETING_RESULT_LABEL, MEETING_RESULTS } from '../lib/insights'
import type { Meeting, MeetingResultado } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button } from './ui'

const TONE: Record<string, string> = {
  gold: 'border-gold/40 bg-gold/10 text-gold',
  go: 'border-go/35 bg-go/10 text-go',
  muted: 'border-line-strong bg-tint/[0.04] text-fg-2',
  orange: 'border-orange-400/35 bg-orange-400/10 text-orange-300',
}

/** Valor digitado em reais ("1.500", "1500,50", "R$ 2 mil" não) → número. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.]/g, '')
  if (!clean) return null
  // "1.500,50" → 1500.50 ; "1500.5" → 1500.5
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : /\.\d{3}$/.test(clean) ? clean.replace(/\./g, '') : clean
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Como terminou a reunião: Fechou (com valor) · Realizada · Não fechou · Não compareceu. */
export function MeetingResult({ meeting, compact }: { meeting: Meeting; compact?: boolean }) {
  const setMeetingResult = useApp((s) => s.setMeetingResult)
  const toast = useApp((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [askValue, setAskValue] = useState(false)
  const [valor, setValor] = useState(meeting.valor ? String(meeting.valor).replace('.', ',') : '')

  const save = async (r: MeetingResultado, v: number | null = null) => {
    await setMeetingResult(meeting.id, r, v)
    setEditing(false)
    setAskValue(false)
    toast(r === 'fechou' ? `Venda registrada${v ? ` · ${formatMoney(v)}` : ''}. Parabéns!` : `Reunião: ${MEETING_RESULT_LABEL[r].toLowerCase()}.`)
  }

  if (meeting.resultado && !editing) {
    const tone = MEETING_RESULTS.find((x) => x.id === meeting.resultado)?.tone ?? 'muted'
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={clsx('rounded-[5px] border px-1.5 text-2xs leading-5 font-medium', TONE[tone])}>
          {MEETING_RESULT_LABEL[meeting.resultado]}
          {meeting.valor ? ` · ${formatMoney(meeting.valor)}` : ''}
        </span>
        <button onClick={() => setEditing(true)} className="text-2xs text-fg-4 hover:text-fg-2">
          alterar
        </button>
      </span>
    )
  }

  if (askValue) {
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void save('fechou', parseMoney(valor))
        }}
      >
        <span className="text-2xs text-fg-3">R$</span>
        <input
          autoFocus
          inputMode="decimal"
          className="input num h-7 w-24 px-2 text-xs"
          placeholder="Valor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label="Valor fechado"
        />
        <Button type="submit" size="xs" variant="gold">
          Salvar
        </Button>
        <button type="button" onClick={() => setAskValue(false)} className="text-2xs text-fg-4 hover:text-fg-2">
          voltar
        </button>
      </form>
    )
  }

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', compact && 'gap-0.5')}>
      {MEETING_RESULTS.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => (r.id === 'fechou' ? setAskValue(true) : void save(r.id))}
          className={clsx(
            'h-6 rounded-[5px] border px-1.5 text-2xs font-medium transition-colors',
            meeting.resultado === r.id ? TONE[r.tone] : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:text-fg',
          )}
        >
          {r.label}
        </button>
      ))}
      {editing && (
        <button onClick={() => setEditing(false)} className="ml-1 text-2xs text-fg-4 hover:text-fg-2">
          cancelar
        </button>
      )}
    </div>
  )
}
