import clsx from 'clsx'
import { addDays, formatDayLabel, formatDateKey, PERIODOS, todayKey } from '../lib/dates'
import type { Periodo } from '../lib/types'

export type DayPreset = 'hoje' | 'amanha' | '2d' | '7d' | 'data'
export type TimeMode = Periodo | 'hora'

export interface FollowupDraft {
  preset: DayPreset
  data: string
  timeMode: TimeMode
  horario: string
}

const DAY_PRESETS: { id: DayPreset; label: string; days: number }[] = [
  { id: 'hoje', label: 'Hoje', days: 0 },
  { id: 'amanha', label: 'Amanhã', days: 1 },
  { id: '2d', label: 'Daqui 2 dias', days: 2 },
  { id: '7d', label: 'Daqui 7 dias', days: 7 },
]

export function defaultFollowup(preset: DayPreset = 'amanha', timeMode: TimeMode = 'manha'): FollowupDraft {
  const days = DAY_PRESETS.find((p) => p.id === preset)?.days ?? 1
  return { preset, data: addDays(todayKey(), days), timeMode, horario: '' }
}

export function draftToInput(d: FollowupDraft) {
  return {
    data: d.data,
    horario: d.timeMode === 'hora' && d.horario ? d.horario : null,
    periodo: d.timeMode === 'hora' ? null : d.timeMode,
  }
}

export function FollowupPicker({ value, onChange, title = 'Quando devo entrar em contato novamente?' }: { value: FollowupDraft; onChange: (v: FollowupDraft) => void; title?: string }) {
  const chip = (active: boolean) =>
    clsx(
      'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
      active ? 'border-sky-300/40 bg-sky-300/10 text-sky-200' : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:text-fg',
    )

  const when = value.timeMode === 'hora' ? value.horario || 'horário a definir' : PERIODOS.find((p) => p.id === value.timeMode)?.label.toLowerCase()

  return (
    <div className="space-y-2.5 rounded-lg border border-sky-300/15 bg-sky-300/[0.03] p-3">
      <p className="text-xs font-medium text-fg-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {DAY_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={chip(value.preset === p.id)}
            onClick={() => onChange({ ...value, preset: p.id, data: addDays(todayKey(), p.days) })}
          >
            {p.label}
          </button>
        ))}
        <label className={clsx(chip(value.preset === 'data'), 'relative inline-flex cursor-pointer items-center')}>
          {value.preset === 'data' ? formatDateKey(value.data) : 'Escolher data'}
          <input
            type="date"
            min={todayKey()}
            value={value.data}
            onChange={(e) => e.target.value && onChange({ ...value, preset: 'data', data: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Escolher data"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button" className={chip(value.timeMode === p.id)} onClick={() => onChange({ ...value, timeMode: p.id })}>
            {p.label}
          </button>
        ))}
        <button type="button" className={chip(value.timeMode === 'hora')} onClick={() => onChange({ ...value, timeMode: 'hora', horario: value.horario || '14:30' })}>
          Horário específico
        </button>
        {value.timeMode === 'hora' && (
          <input
            type="time"
            value={value.horario}
            onChange={(e) => onChange({ ...value, horario: e.target.value })}
            className="input h-7 w-[92px] px-2 text-xs"
            aria-label="Horário"
          />
        )}
      </div>
      <p className="text-2xs text-fg-3">
        Retorno <span className="text-sky-200">{formatDayLabel(value.data)}</span> · {formatDateKey(value.data)} · {when}
      </p>
    </div>
  )
}
