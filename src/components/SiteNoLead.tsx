// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: vendedor, gestor ou dono manda leads para o desenvolvedor fazer o site (fila ou direto para alguém).
import clsx from 'clsx'
import { ArrowRight, Code } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SITE_STATUS, useDesenvolvedores, useQuem, useSiteDoLead, useSites } from '../lib/sites'
import { usePapel, usePessoasEquipe } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { Button } from './ui'

/** Quem pode mandar sites: qualquer um da equipe menos o desenvolvedor (ele faz). */
export function usePodeMandarSite(): boolean {
  const pessoas = usePessoasEquipe()
  const papel = usePapel()
  return pessoas.length > 0 && papel !== 'desenvolvedor'
}

/** O que o cliente quer, prazo e para quem vai. Serve para um lead (ficha) ou vários (seleção na lista). */
export function MandarSiteForm({ leadIds, onFeito, onCancelar }: { leadIds: string[]; onFeito: () => void; onCancelar: () => void }) {
  const devs = useDesenvolvedores()
  const [briefing, setBriefing] = useState('')
  const [prazo, setPrazo] = useState('')
  const [dev, setDev] = useState('')
  const [busy, setBusy] = useState(false)
  const n = leadIds.length

  const mandar = async () => {
    setBusy(true)
    try {
      await useSites.getState().pedir(leadIds, briefing, prazo || null, dev || null)
      const para = dev ? `com ${devs.find((d) => d.id === dev)?.nome ?? 'o desenvolvedor'}` : 'na fila de sites'
      useApp.getState().toast(`${n === 1 ? 'Site' : `${n} sites`} ${para}. A equipe foi avisada no chat.`, 'success')
      onFeito()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <textarea
        className="input min-h-[88px] w-full py-2 text-[13px] leading-5"
        placeholder={n === 1 ? 'O que o cliente quer? Ex.: site de uma página com cardápio, botão de WhatsApp e as fotos do Instagram.' : 'O que esses clientes querem? (vale para todos; dá para mudar em cada site depois)'}
        value={briefing}
        autoFocus
        onChange={(e) => setBriefing(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-8 w-auto cursor-pointer pr-7 text-xs" value={dev} onChange={(e) => setDev(e.target.value)} aria-label="Para quem vai o site">
          <option value="">Fila (o primeiro desenvolvedor que pegar)</option>
          {devs.map((d) => (
            <option key={d.id} value={d.id}>
              Direto para {d.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-fg-3">
          Entregar até
          <input type="date" className="input h-8 w-auto text-xs" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="sm" variant="go" icon={<Code className="size-3.5" />} loading={busy} onClick={() => void mandar()}>
          {n === 1 ? 'Mandar para fazer o site' : `Mandar ${n} sites`}
        </Button>
      </div>
      {!devs.length && <p className="text-2xs text-gold">Ainda não tem desenvolvedor na equipe. O dono convida em Pessoas e cargos; o site fica na fila esperando.</p>}
    </div>
  )
}

/** Ficha do lead: botão de mandar para fazer o site, ou em que pé o site está. */
export function SiteNoLead({ leadId }: { leadId: string }) {
  const pedido = useSiteDoLead(leadId)
  const quem = useQuem()
  const pode = usePodeMandarSite()
  const [aberto, setAberto] = useState(false)
  if (!pode) return null

  return (
    <section className="border-b border-line-soft px-5 py-4">
      <h3 className="mb-2.5 text-2xs font-semibold tracking-[0.08em] text-fg-4 uppercase">Site do cliente</h3>
      {pedido ? (
        <Link to={`/equipe/sites?id=${pedido.id}`} className="flex items-center gap-3 rounded-lg border border-line-soft bg-raised px-3 py-2.5 hover:border-line-strong">
          <Code className="size-4 text-emerald-300" />
          <span className="min-w-0 flex-1 text-xs">
            <span className={clsx('mr-2 inline-flex rounded px-1.5 text-2xs leading-5 font-medium ring-1 ring-inset', SITE_STATUS[pedido.status].chip)}>{SITE_STATUS[pedido.status].label}</span>
            <span className="pv text-fg-2">{pedido.dev ? `com ${quem.get(pedido.dev)?.nome ?? 'alguém'}` : 'esperando um desenvolvedor pegar'}</span>
          </span>
          <ArrowRight className="size-3.5 text-fg-4" />
        </Link>
      ) : aberto ? (
        <MandarSiteForm leadIds={[leadId]} onFeito={() => setAberto(false)} onCancelar={() => setAberto(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" icon={<Code className="size-3.5 text-emerald-300" />} onClick={() => setAberto(true)}>
            Mandar para fazer o site
          </Button>
          <span className="text-2xs text-fg-4">Fechou? O desenvolvedor da equipe faz.</span>
        </div>
      )}
    </section>
  )
}
