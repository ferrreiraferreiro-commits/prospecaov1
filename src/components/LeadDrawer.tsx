import clsx from 'clsx'
import { AlarmClock, CalendarCheck, CalendarClock, Check, Copy, Copy as CopyIcon, Headphones, MessageCircle, PhoneOutgoing, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPhone, instagramHandle, instagramHref, mapsHref, telHref, websiteHref, websiteLabel, whatsappDigits, whatsappTarget } from '../lib/contact'
import { formatDateKey, formatRelative, todayKey, whenLabel } from '../lib/dates'
import { DUP_REASON_LABEL } from '../lib/duplicates'
import { nextAction } from '../lib/selectors'
import type { Lead } from '../lib/types'
import { useDuplicates, useIndex, useLead } from '../store/derived'
import { useApp } from '../store/useApp'
import { useHasMotor } from '../store/useAccount'
import { useUi } from '../store/useUi'
import { defaultFollowup, draftToInput, FollowupPicker } from './FollowupPicker'
import { HotTag, NextActionText, QuickActions, Rating, SiteTag, Status2Menu, StatusMenu } from './leadBits'
import { useLiguei } from './OutcomeModal'
import { ClientLink } from './ClientLink'
import { CnpjSection } from './CnpjSection'
import { MeetingResult } from './MeetingResult'
import { Timeline } from './Timeline'
import { Button, Drawer, Missing, WhatsAppIcon } from './ui'
import { useCopyPhone, useWhatsApp } from './whatsapp'

export function LeadDrawer() {
  const id = useUi((s) => s.drawerLeadId)
  const openLead = useUi((s) => s.openLead)
  const lead = useLead(id)
  useEffect(() => {
    if (id && !lead) openLead(null)
  }, [id, lead, openLead])
  if (!lead) return null
  return (
    <Drawer open onClose={() => openLead(null)}>
      <LeadDetail key={lead.id} lead={lead} onClose={() => openLead(null)} />
    </Drawer>
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line-soft px-5 py-4 last:border-0">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-fg-2">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  )
}

/** `priv`: dado do lead que some no modo live (nome, telefone, endereço…). */
function Row({ label, children, priv }: { label: string; children: ReactNode; priv?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1 text-xs">
      <dt className="text-fg-3">{label}</dt>
      <dd className={clsx('min-w-0 break-words text-fg', priv && 'pv')}>{children}</dd>
    </div>
  )
}

function LinkOr({ href, label }: { href: string | null; label: string }) {
  if (!href) return <Missing />
  return (
    <a href={href} target={href.startsWith('tel:') ? undefined : '_blank'} rel="noreferrer" className="text-blue-300 hover:text-blue-200 hover:underline">
      {label}
    </a>
  )
}

function CopyButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="ml-1.5 inline-flex rounded p-0.5 align-[-2px] text-fg-4 hover:bg-hover hover:text-fg">
      <CopyIcon className="size-3" />
    </button>
  )
}

/** Campo editável que salva ao sair do foco. */
function InlineField({ value, placeholder, onSave, multiline }: { value: string | null; placeholder: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  const commit = () => {
    if ((draft.trim() || null) !== (value ?? null)) onSave(draft)
  }
  const cls = 'pv input h-7 border-transparent bg-transparent px-1.5 hover:border-line focus:bg-ink'
  return multiline ? (
    <textarea className="pv input min-h-20 resize-y" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
  ) : (
    <input className={cls} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  )
}

function LeadDetail({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const interactions = useApp((s) => s.interactions)
  const imports = useApp((s) => s.imports)
  const meetings = useApp((s) => s.meetings)
  const leads = useApp((s) => s.leads)
  const { updateLeadWork, completeFollowup, deleteFollowup, deleteMeeting, scheduleFollowup, ignoreDuplicate, deleteLeads, setQueue, toast } = useApp.getState()
  const openLead = useUi((s) => s.openLead)
  const index = useIndex()
  const dupMap = useDuplicates()
  const liguei = useLiguei()
  const openWhatsApp = useWhatsApp()
  const copyPhone = useCopyPhone()
  const openOutcome = useUi((s) => s.openOutcome)
  const openMessage = useUi((s) => s.openMessage)
  const navigate = useNavigate()
  const motor = useHasMotor()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [draft, setDraft] = useState(() => defaultFollowup())

  const history = useMemo(() => interactions.filter((i) => i.lead_id === lead.id), [interactions, lead.id])
  const followups = index.followupsByLead.get(lead.id) ?? []
  const leadMeetings = meetings.filter((m) => m.lead_id === lead.id).sort((a, b) => b.data.localeCompare(a.data))
  const dups = dupMap.get(lead.id)
  const importRecord = imports.find((i) => i.id === lead.import_id)
  const next = nextAction(lead, index)
  const extras = lead.dados_extras ? Object.entries(lead.dados_extras) : []

  const save = (field: 'falei_com' | 'cargo' | 'anotacoes' | 'proxima_acao') => (v: string) => void updateLeadWork(lead.id, { [field]: v })

  return (
    <>
      {/* Cabeçalho */}
      <header className="border-b border-line-soft px-5 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="pv text-base leading-6 font-semibold tracking-[-0.01em]">{lead.empresa}</h2>
            <p className="mt-0.5 text-xs text-fg-3">
              {lead.nicho ?? 'Nicho não informado'}
              {lead.cidade && ` · ${[lead.cidade, lead.estado].filter(Boolean).join(' - ')}`}
            </p>
          </div>
          <button onClick={onClose} className="-mr-1.5 rounded-md p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusMenu lead={lead} />
          <Status2Menu lead={lead} alwaysVisible />
          <Rating lead={lead} className="text-xs" />
          <SiteTag lead={lead} className="text-xs" />
          <HotTag lead={lead} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<WhatsAppIcon className="size-3.5" />}
            disabled={!whatsappTarget(lead)}
            title="Abre a conversa no WhatsApp e registra a ligação. Para ligar, clique no ícone de telefone da conversa."
            onClick={async () => {
              const call = await openWhatsApp(lead, { ligar: true })
              if (call) openOutcome({ leadId: lead.id, mode: 'call', callId: call.id, presetStatus: null })
            }}
          >
            Ligar pelo WhatsApp
          </Button>
          <Button variant="secondary" size="sm" icon={<PhoneOutgoing className="size-3.5" />} onClick={() => liguei(lead.id)} title="Liguei por outro aparelho: registra a ligação agora">
            Liguei
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Headphones className="size-3.5" />}
            onClick={() => {
              const q = useApp.getState().queue
              if (!q.ids.includes(lead.id)) setQueue([lead.id], 'Lead avulso')
              onClose()
              navigate(`/ligacao/${lead.id}`)
            }}
          >
            Modo Ligação
          </Button>
          <Button variant="secondary" size="sm" icon={<MessageCircle className="size-3.5" />} disabled={!whatsappTarget(lead)} onClick={() => openMessage({ leadId: lead.id })}>
            Mensagem
          </Button>
          {motor && (
          <Button
            variant="secondary"
            size="sm"
            icon={<AlarmClock className="size-3.5" />}
            disabled={!whatsappTarget(lead)}
            title="Deixar uma mensagem de WhatsApp marcada para um dia e hora"
            onClick={() => {
              onClose()
              navigate(`/agendamentos?lead=${lead.id}`)
            }}
          >
            Agendar
          </Button>
          )}
          <ClientLink lead={lead} />
          <QuickActions lead={lead} className="ml-auto" size="md" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {dups && (
          <div className="mx-5 mt-4 rounded-lg border border-orange-400/25 bg-orange-400/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-orange-300">
              <Copy className="size-3.5" /> Possível duplicado
            </p>
            <ul className="mt-2 space-y-1">
              {dups.map((d) => {
                const other = leads.find((l) => l.id === d.otherId)
                if (!other) return null
                return (
                  <li key={d.otherId} className="flex items-center gap-2 text-xs">
                    <button onClick={() => openLead(other.id)} className="pv truncate font-medium text-fg hover:underline">
                      {other.empresa}
                    </button>
                    <span className="shrink-0 text-fg-3">{d.reasons.map((r) => DUP_REASON_LABEL[r]).join(', ')}</span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                size="xs"
                variant="secondary"
                icon={<Check className="size-3" />}
                onClick={() => {
                  void ignoreDuplicate([lead.id, ...dups.map((d) => d.otherId)])
                  toast('Marcado como não duplicado.')
                }}
              >
                Não é duplicado
              </Button>
              <Button
                size="xs"
                variant="danger"
                icon={<Trash2 className="size-3" />}
                onClick={async () => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  onClose()
                  await deleteLeads([lead.id])
                  toast('Lead excluído.', 'info')
                }}
              >
                {confirmDelete ? 'Confirmar exclusão' : 'Excluir este'}
              </Button>
            </div>
          </div>
        )}

        <Section title="Informações">
          <dl>
            <Row label="Empresa" priv>
              {lead.empresa}
            </Row>
            <Row label="Nicho">{lead.nicho ?? <Missing />}</Row>
            <Row label="Telefone" priv>
              <LinkOr href={telHref(lead.telefone)} label={formatPhone(lead.telefone)} />
              {lead.telefone && <CopyButton onClick={() => copyPhone(lead.telefone, 'Telefone')} label="Copiar telefone" />}
            </Row>
            <Row label="WhatsApp" priv>
              {lead.whatsapp ? (
                <>
                  <button onClick={() => openWhatsApp(lead)} className="text-blue-300 hover:text-blue-200 hover:underline">
                    {formatPhone(whatsappDigits(lead.whatsapp)) || lead.whatsapp}
                  </button>
                  <CopyButton onClick={() => copyPhone(whatsappDigits(lead.whatsapp), 'WhatsApp')} label="Copiar WhatsApp" />
                </>
              ) : (
                <Missing />
              )}
            </Row>
            <Row label="Instagram" priv>
              <LinkOr href={instagramHref(lead.instagram)} label={instagramHandle(lead.instagram)} />
            </Row>
            <Row label="Website" priv>
              {lead.website ? <LinkOr href={websiteHref(lead.website)} label={websiteLabel(lead.website)} /> : <span className="text-gold/90">Sem site</span>}
            </Row>
            <Row label="Endereço" priv>
              {lead.endereco ?? <Missing />}
            </Row>
            <Row label="Cidade">{lead.cidade ? [lead.cidade, lead.estado].filter(Boolean).join(' - ') : <Missing />}</Row>
            <Row label="Avaliação Google">
              {lead.avaliacao !== null ? <Rating lead={lead} /> : <Missing />}
            </Row>
            <Row label="Google Maps">
              <LinkOr href={mapsHref(lead.maps_url)} label="Abrir no Maps" />
            </Row>
            <Row label="Pasta">{lead.pasta ?? <Missing />}</Row>
            {lead.etapa && <Row label="Etapa (arquivo)">{lead.etapa}</Row>}
            {extras.map(([k, v]) => (
              <Row key={k} label={k} priv>
                {v}
              </Row>
            ))}
          </dl>
        </Section>

        <Section title="Contato">
          <dl>
            <Row label="Falei com">
              <InlineField value={lead.falei_com} placeholder="Nome" onSave={save('falei_com')} />
            </Row>
            <Row label="Cargo">
              <InlineField value={lead.cargo} placeholder="Cargo" onSave={save('cargo')} />
            </Row>
            <Row label="Última ligação">
              {lead.ultima_ligacao ? <span className="num">{formatRelative(lead.ultima_ligacao)}</span> : <Missing>Nunca</Missing>}
              {(index.callsByLead.get(lead.id)?.length ?? 0) > 0 && (
                <span className="text-fg-3"> · {index.callsByLead.get(lead.id)!.length} no total</span>
              )}
            </Row>
            <Row label="Próximo contato">
              <NextActionText action={next} />
            </Row>
            <Row label="Próxima ação">
              <InlineField value={lead.proxima_acao} placeholder="Ex.: mandar exemplo" onSave={save('proxima_acao')} />
            </Row>
          </dl>
        </Section>

        <Section
          title="Agenda"
          right={
            !scheduling && (
              <Button size="xs" variant="ghost" icon={<CalendarClock className="size-3" />} onClick={() => setScheduling(true)}>
                Agendar retorno
              </Button>
            )
          }
        >
          {scheduling && (
            <div className="mb-3">
              <FollowupPicker value={draft} onChange={setDraft} />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setScheduling(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await scheduleFollowup(lead.id, draftToInput(draft))
                    setScheduling(false)
                    toast('Retorno agendado.')
                  }}
                >
                  Salvar retorno
                </Button>
              </div>
            </div>
          )}
          {followups.length === 0 && leadMeetings.length === 0 && !scheduling && <p className="text-xs text-fg-4">Nenhum retorno ou reunião agendada.</p>}
          <ul className="space-y-1.5">
            {followups.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border border-line-soft bg-ink/60 px-2.5 py-2 text-xs">
                <CalendarClock className="size-3.5 shrink-0 text-sky-300" />
                <div className="min-w-0 flex-1">
                  <span className="text-fg">Retorno {whenLabel(f.data, f.horario, f.periodo)}</span>
                  {f.observacao && <p className="pv truncate text-fg-3">{f.observacao}</p>}
                </div>
                <Button size="xs" variant="subtle" icon={<Check className="size-3" />} onClick={() => completeFollowup(f.id)}>
                  Concluir
                </Button>
                <button onClick={() => deleteFollowup(f.id)} className="rounded p-1 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Remover retorno">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
            {leadMeetings.map((m) => (
              <li key={m.id} className="flex items-start gap-2 rounded-md border border-emerald-300/15 bg-emerald-300/[0.03] px-2.5 py-2 text-xs">
                <CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
                <div className="min-w-0 flex-1">
                  <span className="text-fg">
                    Reunião {formatDateKey(m.data)}
                    {m.horario && ` · ${m.horario}`}
                    {m.contato && <span className="pv text-fg-3"> com {m.contato}</span>}
                  </span>
                  {m.observacao && <p className="pv truncate text-fg-3">{m.observacao}</p>}
                  {(m.data <= todayKey() || m.resultado) && (
                    <div className="mt-1.5">
                      <MeetingResult meeting={m} />
                    </div>
                  )}
                </div>
                <button onClick={() => deleteMeeting(m.id)} className="rounded p-1 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Remover reunião">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="CNPJ e sócios">
          <div className="pv">
            <CnpjSection lead={lead} />
          </div>
        </Section>

        <Section title="Observações">
          <InlineField value={lead.anotacoes} placeholder="Anotações livres sobre este lead…" onSave={save('anotacoes')} multiline />
          {lead.observacoes && (
            <p className="mt-2 text-2xs whitespace-pre-line text-fg-3">
              <span className="text-fg-4">Do arquivo: </span>
              <span className="pv">{lead.observacoes}</span>
            </p>
          )}
        </Section>

        <Section title="Histórico">
          <Timeline lead={lead} items={history} importRecord={importRecord} />
        </Section>

        <div className="px-5 py-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-fg-2">Excluir o lead e todo o histórico?</span>
              <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button
                size="xs"
                variant="danger"
                onClick={async () => {
                  onClose()
                  await deleteLeads([lead.id])
                  toast('Lead excluído.', 'info')
                }}
              >
                Excluir
              </Button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className={clsx('inline-flex items-center gap-1.5 text-xs text-fg-4 hover:text-red-300')}>
              <Trash2 className="size-3.5" /> Excluir lead
            </button>
          )}
        </div>
      </div>
    </>
  )
}
