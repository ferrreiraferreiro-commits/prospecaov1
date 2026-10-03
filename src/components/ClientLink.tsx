import { UserCheck, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Lead } from '../lib/types'
import { blankProject, useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Button } from './ui'

/** "Virar cliente" na ficha do lead — ou "Ver cliente", se ele já fechou. */
export function ClientLink({ lead }: { lead: Lead }) {
  const client = useBiz((s) => s.clients.find((c) => c.lead_id === lead.id))
  const clientFromLead = useBiz((s) => s.clientFromLead)
  const toast = useApp((s) => s.toast)
  const openLead = useUi((s) => s.openLead)
  const navigate = useNavigate()

  if (client) {
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={<UserCheck className="size-3.5 text-emerald-300" />}
        onClick={() => {
          openLead(null)
          navigate('/clientes')
        }}
      >
        Cliente
      </Button>
    )
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<UserPlus className="size-3.5" />}
      title="Fechou? Cria o cliente com os dados deste lead"
      onClick={async () => {
        await clientFromLead(lead)
        toast(`${lead.empresa} agora é cliente.`, 'success', {
          label: 'Abrir clientes',
          run: () => {
            openLead(null)
            navigate('/clientes')
          },
        })
      }}
    >
      Virar cliente
    </Button>
  )
}

/** Depois de "Fechou" numa reunião: cria cliente + projeto com o valor fechado. */
export async function convertClosedLead(leadId: string, valor: number | null) {
  const lead = useApp.getState().leads.find((l) => l.id === leadId)
  if (!lead) return
  const biz = useBiz.getState()
  const client = await biz.clientFromLead(lead)
  const already = biz.projects.some((p) => p.client_id === client.id)
  if (!already) {
    await biz.saveProject(blankProject({ nome: `Site ${lead.empresa}`, client_id: client.id, orcamento: valor ?? 0, status: 'planejamento' }))
  }
  useApp.getState().toast(`Cliente e projeto criados para ${lead.empresa}.`, 'success')
}
