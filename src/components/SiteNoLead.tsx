// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Ficha do lead (plano Times): o vendedor manda o lead para a fila de sites, e vê em que pé está.
import clsx from 'clsx'
import { ArrowRight, Code } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SITE_STATUS, useQuem, useSiteDoLead, useSites } from '../lib/sites'
import { useAccount, usePapel, usePessoasEquipe } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { Button } from './ui'

export function SiteNoLead({ leadId }: { leadId: string }) {
  const pedido = useSiteDoLead(leadId)
  const quem = useQuem()
  const papel = usePapel()
  const pessoas = usePessoasEquipe()
  const temDev = useAccount((s) => !!s.equipe?.membros.some((m) => m.aceito && m.papel === 'desenvolvedor'))
  const [aberto, setAberto] = useState(false)
  const [briefing, setBriefing] = useState('')
  const [prazo, setPrazo] = useState('')
  const [busy, setBusy] = useState(false)

  // Só com equipe; o desenvolvedor não manda sites (ele faz)
  if (!pessoas.length || papel === 'desenvolvedor') return null

  const mandar = async () => {
    setBusy(true)
    try {
      await useSites.getState().pedir(leadId, briefing, prazo || null)
      useApp.getState().toast('Mandado para a fila de sites. A equipe foi avisada no chat.', 'success')
      setAberto(false)
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-b border-line-soft px-5 py-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="flex-1 text-2xs font-semibold tracking-[0.08em] text-fg-4 uppercase">Site do cliente</h3>
      </div>
      {pedido ? (
        <Link to={`/equipe/sites?id=${pedido.id}`} className="flex items-center gap-3 rounded-lg border border-line-soft bg-raised px-3 py-2.5 hover:border-line-strong">
          <Code className="size-4 text-emerald-300" />
          <span className="min-w-0 flex-1 text-xs">
            <span className={clsx('mr-2 inline-flex rounded px-1.5 text-2xs leading-5 font-medium ring-1 ring-inset', SITE_STATUS[pedido.status].chip)}>{SITE_STATUS[pedido.status].label}</span>
            <span className="pv text-fg-2">
              {pedido.dev ? `com ${quem.get(pedido.dev)?.nome ?? 'alguém'}` : 'esperando um desenvolvedor pegar'}
            </span>
          </span>
          <ArrowRight className="size-3.5 text-fg-4" />
        </Link>
      ) : aberto ? (
        <div className="space-y-2">
          <textarea
            className="input min-h-[88px] w-full py-2 text-[13px] leading-5"
            placeholder="O que o cliente quer? Ex.: site de uma página com cardápio, botão de WhatsApp e as fotos do Instagram."
            value={briefing}
            autoFocus
            onChange={(e) => setBriefing(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-fg-3">
              Entregar até
              <input type="date" className="input h-8 w-auto text-xs" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </label>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="go" loading={busy} onClick={() => void mandar()}>
              Mandar para a fila
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" icon={<Code className="size-3.5 text-emerald-300" />} onClick={() => setAberto(true)}>
            Mandar para fazer o site
          </Button>
          <span className="text-2xs text-fg-4">{temDev ? 'Fechou? Um desenvolvedor da equipe pega e faz.' : 'Convide um desenvolvedor em Pessoas e cargos.'}</span>
        </div>
      )}
    </section>
  )
}
