import clsx from 'clsx'
import { CalendarCheck, CalendarClock, FileDown, PencilLine, Phone, RefreshCw, Tag } from 'lucide-react'
import { formatDateTime } from '../lib/dates'
import { STATUS_MAP } from '../lib/statuses'
import type { ImportRecord, Interaction, Lead } from '../lib/types'
import { useUi } from '../store/useUi'
import { StatusBadge } from './ui'

const ICONS = {
  ligacao: Phone,
  status: RefreshCw,
  status2: Tag,
  followup: CalendarClock,
  reuniao: CalendarCheck,
  nota: PencilLine,
  importacao: FileDown,
}

const TITLES = {
  ligacao: 'Ligação',
  status: 'Status alterado',
  status2: 'Status 2',
  followup: 'Retorno agendado',
  reuniao: 'Reunião agendada',
  nota: 'Anotação',
  importacao: 'Importado',
}

export function Timeline({ lead, items, importRecord }: { lead: Lead; items: Interaction[]; importRecord?: ImportRecord }) {
  const openOutcome = useUi((s) => s.openOutcome)
  const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <ol className="relative space-y-0">
      {sorted.map((it) => {
        const Icon = ICONS[it.tipo]
        const pending = it.tipo === 'ligacao' && it.status === null
        return (
          <li key={it.id} className="relative flex gap-3 pb-4 last:pb-0">
            <span className="absolute top-6 bottom-0 left-[11px] w-px bg-line-soft" aria-hidden />
            <span
              className={clsx(
                'relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-panel',
                it.tipo === 'ligacao' ? 'border-go/30 text-go' : it.tipo === 'reuniao' ? 'border-emerald-300/30 text-emerald-300' : it.tipo === 'followup' ? 'border-sky-300/30 text-sky-300' : 'border-line text-fg-3',
              )}
            >
              <Icon className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="num text-2xs text-fg-3">{formatDateTime(it.created_at)}</span>
                <span className="text-xs font-medium text-fg">{TITLES[it.tipo]}</span>
                {it.tipo === 'ligacao' && it.status && <StatusBadge status={it.status} />}
                {it.tipo === 'status' && it.status && STATUS_MAP[it.status] && <StatusBadge status={it.status} />}
                {pending && (
                  <button
                    onClick={() => openOutcome({ leadId: lead.id, mode: 'call', callId: it.id, presetStatus: null })}
                    className="rounded bg-gold/10 px-1.5 text-2xs leading-5 font-medium text-gold hover:bg-gold/20"
                  >
                    Preencher resultado
                  </button>
                )}
              </div>
              {(it.falei_com || it.cargo) && (
                <p className="mt-1 text-xs text-fg-2">
                  Falei com <span className="font-medium text-fg">{it.falei_com ?? '—'}</span>
                  {it.cargo && <span className="text-fg-3"> · {it.cargo}</span>}
                </p>
              )}
              {it.observacao && <p className="mt-1 text-xs whitespace-pre-line text-fg-2">{it.observacao}</p>}
            </div>
          </li>
        )
      })}
      <li className="relative flex gap-3">
        <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-fg-4">
          <FileDown className="size-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="num text-2xs text-fg-3">{formatDateTime(lead.created_at)}</span>
            <span className="text-xs font-medium text-fg-2">Importado</span>
          </div>
          {importRecord && <p className="mt-0.5 text-xs text-fg-3">{importRecord.arquivo}</p>}
        </div>
      </li>
    </ol>
  )
}
