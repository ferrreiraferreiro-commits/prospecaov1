import { useCallback } from 'react'
import { timeHM } from '../lib/dates'
import { STATUS_MAP } from '../lib/statuses'
import type { StatusId } from '../lib/types'
import { useLead } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { OutcomeForm } from './OutcomeForm'
import { Modal } from './ui'

/** Botão "Liguei": registra data e hora na hora do clique e abre o painel de resultado. */
export function useLiguei() {
  const registerCall = useApp((s) => s.registerCall)
  const openOutcome = useUi((s) => s.openOutcome)
  return useCallback(
    async (leadId: string) => {
      const call = await registerCall(leadId)
      openOutcome({ leadId, mode: 'call', callId: call.id, presetStatus: null })
    },
    [registerCall, openOutcome],
  )
}

/** Mudança de status sem ligação. Retorno e reunião abrem o painel para pedir os detalhes. */
export function useChangeStatus() {
  const saveOutcome = useApp((s) => s.saveOutcome)
  const openOutcome = useUi((s) => s.openOutcome)
  const toast = useApp((s) => s.toast)
  return useCallback(
    async (leadId: string, status: StatusId) => {
      if (status === 'follow_up' || status === 'agendou_reuniao') {
        openOutcome({ leadId, mode: 'status', callId: null, presetStatus: status })
        return
      }
      await saveOutcome({ leadId, mode: 'status', status })
      toast(`Status alterado para “${STATUS_MAP[status].label}”.`)
    },
    [saveOutcome, openOutcome, toast],
  )
}

export function OutcomeModal() {
  const target = useUi((s) => s.outcome)
  const openOutcome = useUi((s) => s.openOutcome)
  const lead = useLead(target?.leadId)
  const discardCall = useApp((s) => s.discardCall)
  const toast = useApp((s) => s.toast)
  const close = () => openOutcome(null)

  if (!target || !lead) return null
  return (
    <Modal
      open
      onClose={close}
      width="max-w-xl"
      title={target.mode === 'call' ? 'Resultado da ligação' : 'Alterar status'}
      subtitle={<span className="text-fg-2">{lead.empresa}</span>}
    >
      <div className="px-5 py-4">
        <OutcomeForm
          key={`${target.leadId}-${target.callId}-${target.presetStatus}`}
          lead={lead}
          mode={target.mode}
          callId={target.callId}
          presetStatus={target.presetStatus}
          onCancel={close}
          onDiscardCall={
            target.callId
              ? async () => {
                  await discardCall(target.callId!)
                  close()
                  toast('Ligação desfeita.', 'info')
                }
              : undefined
          }
          onSaved={() => {
            close()
            toast(target.mode === 'call' ? `Ligação salva · ${timeHM()}` : 'Status atualizado.')
          }}
        />
      </div>
    </Modal>
  )
}
