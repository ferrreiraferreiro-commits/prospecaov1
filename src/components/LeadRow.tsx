import clsx from 'clsx'
import { Copy, Headphones, PhoneOutgoing } from 'lucide-react'
import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPhone } from '../lib/contact'
import { formatRelative } from '../lib/dates'
import type { NextAction } from '../lib/selectors'
import { STATUS_MAP, TONE_CLASSES } from '../lib/statuses'
import type { Interaction, Lead } from '../lib/types'
import { useUi } from '../store/useUi'
import { HotTag, NextActionText, QuickActions, Rating, SiteTag, Status2Menu, StatusMenu } from './leadBits'
import { useLiguei } from './OutcomeModal'
import { Button } from './ui'

export const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(200px,2.4fr)_76px_118px_74px_164px_92px_minmax(120px,1.3fr)_250px] lg:items-center lg:gap-x-4'

export function LeadListHeader({ allChecked, someChecked, onToggleAll }: { allChecked?: boolean; someChecked?: boolean; onToggleAll?: () => void }) {
  return (
    <div className={clsx(ROW_GRID, 'hidden px-4 pb-2 pl-5 text-2xs font-medium text-fg-4')}>
      <span className="flex items-center gap-2.5">
        {onToggleAll && (
          <input
            type="checkbox"
            className="size-3.5 cursor-pointer accent-blue-500"
            checked={!!allChecked}
            ref={(el) => {
              if (el) el.indeterminate = !allChecked && !!someChecked
            }}
            onChange={onToggleAll}
            aria-label="Selecionar todos os leads da lista"
          />
        )}
        Empresa
      </span>
      <span>Google</span>
      <span>Telefone</span>
      <span>Site</span>
      <span>Status</span>
      <span>Última ligação</span>
      <span>Próxima ação</span>
      <span className="pr-1 text-right">Ações</span>
    </div>
  )
}

interface LeadRowProps {
  lead: Lead
  next: NextAction
  calls: Interaction[] | undefined
  duplicate?: boolean
  onCallMode: (leadId: string) => void
  checked?: boolean
  onToggle?: (leadId: string) => void
}

export const LeadRow = memo(function LeadRow({ lead, next, calls, duplicate, onCallMode, checked, onToggle }: LeadRowProps) {
  const openLead = useUi((s) => s.openLead)
  const openOutcome = useUi((s) => s.openOutcome)
  const liguei = useLiguei()
  const lastCall = calls?.[0]
  const pending = lastCall && lastCall.status === null ? lastCall : null
  const tone = TONE_CLASSES[STATUS_MAP[lead.status].tone]
  const local = [lead.cidade, lead.estado].filter(Boolean).join(' - ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openLead(lead.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openLead(lead.id)
      }}
      className={clsx(
        ROW_GRID,
        'group relative cursor-pointer border-b border-line-soft px-4 py-2.5 pl-5 transition-colors last:border-b-0 hover:bg-tint/[0.022] focus-visible:bg-tint/[0.03] focus-visible:outline-none',
        checked && 'bg-blue-500/[0.06] hover:bg-blue-500/[0.08]',
      )}
    >
      <span className={clsx('absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-r', tone.bar)} aria-hidden />

      {/* Empresa */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {onToggle && (
            <input
              type="checkbox"
              className="size-3.5 shrink-0 cursor-pointer accent-blue-500"
              checked={!!checked}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggle(lead.id)}
              aria-label={`Selecionar ${lead.empresa}`}
            />
          )}
          <span className="truncate text-[13px] font-semibold text-fg" title={lead.empresa}>
            {lead.empresa}
          </span>
          <HotTag lead={lead} />
          {duplicate && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-orange-400/10 px-1.5 text-[10px] leading-4 font-medium text-orange-300" title="Possível duplicado — abra o lead para decidir">
              <Copy className="size-2.5" /> Possível duplicado
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-fg-3">
          {lead.nicho ?? <span className="text-fg-4">Nicho não informado</span>}
          {local && <span className="text-fg-4"> · </span>}
          {local}
        </div>
      </div>

      {/* Mobile: linha de detalhes */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:contents">
        <Rating lead={lead} className="text-xs" />
        <span className="num text-xs text-fg-2">{lead.telefone ? formatPhone(lead.telefone) : <span className="text-fg-4">Sem telefone</span>}</span>
        <SiteTag lead={lead} className="text-xs" />
      </div>

      <div className="mt-2 flex items-center gap-3 lg:contents" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-wrap items-center gap-1 lg:flex-col lg:items-start">
          <StatusMenu lead={lead} />
          <Status2Menu lead={lead} />
        </div>
        <div className="min-w-0 text-xs">
          {pending ? (
            <button
              onClick={() => openOutcome({ leadId: lead.id, mode: 'call', callId: pending.id, presetStatus: null })}
              className="rounded bg-gold/10 px-1.5 py-0.5 text-2xs font-medium text-gold hover:bg-gold/20"
              title="Ligação registrada sem resultado — clique para preencher"
            >
              Sem resultado
            </button>
          ) : lead.ultima_ligacao ? (
            <span className="num text-fg-2">{formatRelative(lead.ultima_ligacao)}</span>
          ) : (
            <span className="text-fg-4">Nunca</span>
          )}
        </div>
      </div>

      <div className="mt-1 min-w-0 truncate text-xs lg:mt-0">
        <NextActionText action={next} />
      </div>

      {/* Ações */}
      <div className="mt-2 flex items-center justify-between gap-1 lg:mt-0 lg:justify-end" onClick={(e) => e.stopPropagation()}>
        <QuickActions lead={lead} />
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCallMode(lead.id)}
            className="inline-flex size-7 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg"
            title="Abrir no Modo Ligação"
            aria-label="Abrir no Modo Ligação"
          >
            <Headphones className="size-[15px]" />
          </button>
          <Button size="sm" variant="secondary" className="border-go/25 text-go hover:border-go/40 hover:bg-go/10" icon={<PhoneOutgoing className="size-3.5" />} onClick={() => liguei(lead.id)}>
            Liguei
          </Button>
        </div>
      </div>
    </div>
  )
})

export function useOpenCallMode() {
  const navigate = useNavigate()
  return (leadId: string) => navigate(`/ligacao/${leadId}`)
}
