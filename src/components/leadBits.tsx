import clsx from 'clsx'
import { ChevronDown, Flame, Globe, MapPin, Phone, Plus, Settings2, Star, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getStatus2Options } from '../lib/status2'
import { useApp } from '../store/useApp'
import { useRef, useState } from 'react'
import { instagramHref, mapsHref, telHref, websiteHref, whatsappTarget } from '../lib/contact'
import { formatDayLabel, periodoLabel } from '../lib/dates'
import { isHot, type NextAction } from '../lib/selectors'
import { fmtRating } from '../lib/script'
import { STATUSES } from '../lib/statuses'
import type { Lead, StatusId } from '../lib/types'
import { useUi } from '../store/useUi'
import { useChangeStatus } from './OutcomeModal'
import { IconLink, InstagramIcon, MenuItem, Popover, StatusBadge, StatusDot, WhatsAppIcon } from './ui'

export function QuickActions({ lead, className, size = 'sm' }: { lead: Lead; className?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'size-8 [&_svg]:size-4' : undefined
  const openMessage = useUi((s) => s.openMessage)
  const waTarget = whatsappTarget(lead)
  return (
    <div className={clsx('flex items-center', className)}>
      <IconLink href={telHref(lead.telefone)} label="Ligar pelo discador (celular ou app de telefone do PC)" className={cls}>
        <Phone />
      </IconLink>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openMessage({ leadId: lead.id })
        }}
        disabled={!waTarget}
        title={waTarget ? 'Mandar mensagem no WhatsApp (não registra ligação)' : 'WhatsApp: sem número válido'}
        aria-label="WhatsApp"
        className={clsx(
          'inline-flex size-7 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:text-fg-4/60 disabled:hover:bg-transparent [&_svg]:size-[15px]',
          cls,
        )}
      >
        <WhatsAppIcon />
      </button>
      <IconLink href={mapsHref(lead.maps_url, lead.empresa, lead.cidade)} label="Google Maps" className={cls}>
        <MapPin />
      </IconLink>
      <IconLink href={instagramHref(lead.instagram)} label="Instagram" className={cls}>
        <InstagramIcon />
      </IconLink>
      <IconLink href={websiteHref(lead.website)} label="Website" className={cls}>
        <Globe />
      </IconLink>
    </div>
  )
}

export function Rating({ lead, className }: { lead: Lead; className?: string }) {
  if (lead.avaliacao === null) return <span className={clsx('text-fg-4', className)}>—</span>
  const good = lead.avaliacao >= 4.5
  return (
    <span className={clsx('num inline-flex items-center gap-1 whitespace-nowrap', className)}>
      <Star className={clsx('size-3', good ? 'fill-gold text-gold' : 'fill-fg-3/60 text-fg-3/60')} />
      <span className={good ? 'text-fg' : 'text-fg-2'}>{fmtRating(lead.avaliacao)}</span>
      {lead.numero_avaliacoes !== null && <span className="text-fg-4">({lead.numero_avaliacoes})</span>}
    </span>
  )
}

/** Sem site + bem avaliado + muitas avaliações: tem clientes e não tem site. */
export function HotTag({ lead, className }: { lead: Lead; className?: string }) {
  if (!isHot(lead)) return null
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center gap-1 rounded bg-gold/10 px-1.5 text-[10px] leading-4 font-medium text-gold', className)}
      title="Sem site, bem avaliado e com muitas avaliações: tem clientes e ainda não tem site"
    >
      <Flame className="size-2.5" /> Alto potencial
    </span>
  )
}

/** "Sem site" é destacado: é a principal oportunidade de venda. */
export function SiteTag({ lead, className }: { lead: Lead; className?: string }) {
  return lead.website ? (
    <span className={clsx('inline-flex items-center gap-1 text-fg-3', className)}>
      <Globe className="size-3" /> Com site
    </span>
  ) : (
    <span className={clsx('inline-flex items-center gap-1 font-medium text-gold/90', className)}>
      <span className="size-1.5 rounded-full bg-gold/80" /> Sem site
    </span>
  )
}

export function NextActionText({ action, className }: { action: NextAction; className?: string }) {
  switch (action.kind) {
    case 'followup': {
      const f = action.followup
      const time = f.horario ?? periodoLabel(f.periodo).toLowerCase()
      return (
        <span className={clsx('truncate', action.atrasado ? 'text-orange-300' : 'text-sky-300', className)}>
          {action.atrasado ? 'Atrasado · ' : 'Retorno '}
          {formatDayLabel(f.data)}
          {time && ` ${time}`}
        </span>
      )
    }
    case 'reuniao':
      return (
        <span className={clsx('truncate text-emerald-300', className)}>
          Reunião {formatDayLabel(action.meeting.data)}
          {action.meeting.horario && ` ${action.meeting.horario}`}
        </span>
      )
    case 'primeira':
      return <span className={clsx('truncate text-fg-3', className)}>Primeira ligação</span>
    case 'tentar':
      return (
        <span className={clsx('truncate text-fg-2', className)}>
          Tentar de novo
          {action.tentativas > 0 && (
            <span className="text-fg-4">
              {' '}· {action.tentativas} {action.tentativas === 1 ? 'tentativa' : 'tentativas'}
            </span>
          )}
        </span>
      )
    case 'texto':
      return <span className={clsx('truncate text-fg-2', className)} title={action.texto}>{action.texto}</span>
    case 'nenhuma':
      return <span className={clsx('text-fg-4', className)}>—</span>
  }
}

/** Badge de status clicável que abre o menu de troca. */
export function StatusMenu({ lead, className }: { lead: Lead; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const changeStatus = useChangeStatus()
  const choose = (s: StatusId) => {
    setOpen(false)
    if (s !== lead.status || s === 'follow_up' || s === 'agendou_reuniao') void changeStatus(lead.id, s)
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={clsx('group inline-flex max-w-full items-center gap-0.5 rounded-md', className)}
        aria-label="Alterar status"
      >
        <StatusBadge status={lead.status} />
        <ChevronDown className="size-3 shrink-0 text-fg-4 transition-colors group-hover:text-fg-2" />
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={210}>
        <div onClick={(e) => e.stopPropagation()}>
          {STATUSES.map((s) => (
            <MenuItem key={s.id} onClick={() => choose(s.id)} active={s.id === lead.status} hint={s.id === lead.status ? 'atual' : undefined}>
              <StatusDot status={s.id} />
              {s.label}
            </MenuItem>
          ))}
        </div>
      </Popover>
    </>
  )
}

/** Segunda categoria de status (ex.: "Mensagem enviada"). Vazio mostra só um "+ Status 2" discreto. */
export function Status2Menu({ lead, className, alwaysVisible }: { lead: Lead; className?: string; alwaysVisible?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const settings = useApp((s) => s.settings)
  const setStatus2 = useApp((s) => s.setStatus2)
  const options = getStatus2Options(settings)
  const choose = (v: string | null) => {
    setOpen(false)
    void setStatus2(lead.id, v)
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        title="Status 2"
        aria-label="Alterar Status 2"
        className={clsx(
          'inline-flex h-5 max-w-full items-center gap-1 rounded-[5px] px-1.5 text-2xs font-medium whitespace-nowrap transition-colors',
          lead.status2
            ? 'bg-accent/10 text-blue-300 ring-1 ring-accent/25 ring-inset hover:bg-accent/15'
            : clsx('text-fg-4 hover:bg-hover hover:text-fg-2', !alwaysVisible && !open && 'lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100'),
          className,
        )}
      >
        {lead.status2 ? <span className="truncate">{lead.status2}</span> : (<><Plus className="size-3" /> Status 2</>)}
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={210}>
        <div onClick={(e) => e.stopPropagation()}>
          <p className="px-2 pt-1 pb-1.5 text-2xs font-medium text-fg-4">Status 2</p>
          {options.map((o) => (
            <MenuItem key={o} onClick={() => choose(o)} active={o === lead.status2} hint={o === lead.status2 ? 'atual' : undefined}>
              <span className={clsx('size-1.5 rounded-full', o === lead.status2 ? 'bg-accent' : 'bg-fg-4')} />
              {o}
            </MenuItem>
          ))}
          {lead.status2 && (
            <MenuItem onClick={() => choose(null)} className="text-fg-3">
              <X className="size-3" /> Remover Status 2
            </MenuItem>
          )}
          <div className="my-1 border-t border-line-soft" />
          <Link to="/configuracoes#status2" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fg-3 hover:bg-tint/[0.06] hover:text-fg">
            <Settings2 className="size-3" /> Editar opções
          </Link>
        </div>
      </Popover>
    </>
  )
}
