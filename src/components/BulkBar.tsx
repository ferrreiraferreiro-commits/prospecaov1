import { Headphones, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { STATUS_MAP, STATUSES } from '../lib/statuses'
import type { StatusId } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button } from './ui'

// Retorno e reunião pedem data/hora de cada lead: ficam fora da troca em massa
const BULK_STATUSES = STATUSES.filter((s) => s.id !== 'follow_up' && s.id !== 'agendou_reuniao')

/** Barra de ações para os leads selecionados na lista. */
export function BulkBar({ ids, onClear, onCall }: { ids: string[]; onClear: () => void; onCall: (ids: string[]) => void }) {
  const saveOutcome = useApp((s) => s.saveOutcome)
  const deleteLeads = useApp((s) => s.deleteLeads)
  const toast = useApp((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const n = ids.length
  const plural = n === 1 ? 'lead' : 'leads'

  async function setStatus(status: StatusId) {
    setBusy(true)
    try {
      for (const id of ids) await saveOutcome({ leadId: id, mode: 'status', status })
      toast(`${n} ${plural} em “${STATUS_MAP[status].label}”.`)
      onClear()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Excluir ${n} ${plural}? O histórico de ligações deles também some. Não dá para desfazer.`)) return
    setBusy(true)
    try {
      await deleteLeads(ids)
      toast(`${n} ${plural} excluído(s).`, 'info')
      onClear()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao excluir.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="anim-rise fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.85)] lg:bottom-6 lg:pl-4">
      <span className="num mr-1 text-xs font-semibold text-fg">
        {n} {n === 1 ? 'selecionado' : 'selecionados'}
      </span>
      <select
        className="input h-8 w-auto cursor-pointer pr-7 text-xs"
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && void setStatus(e.target.value as StatusId)}
        aria-label="Mudar o status dos selecionados"
      >
        <option value="">Mudar status…</option>
        {BULK_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" icon={<Headphones className="size-3.5" />} disabled={busy} onClick={() => onCall(ids)}>
        Ligar em sequência
      </Button>
      <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={busy} onClick={() => void remove()}>
        Excluir
      </Button>
      <button onClick={onClear} className="ml-auto rounded-md p-1.5 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Limpar seleção">
        <X className="size-4" />
      </button>
    </div>
  )
}
