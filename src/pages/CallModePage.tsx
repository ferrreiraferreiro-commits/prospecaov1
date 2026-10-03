import clsx from 'clsx'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Globe, Headphones, MapPin, PhoneCall, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CallScript } from '../components/CallScript'
import { TopBar } from '../components/TopBar'
import { NextActionText, Rating, Status2Menu, StatusMenu } from '../components/leadBits'
import { OutcomeForm } from '../components/OutcomeForm'
import { useCopyPhone, useWhatsApp } from '../components/whatsapp'
import { Button, Empty, InstagramIcon, Missing, Progress, Segmented, StatusBadge, WhatsAppIcon } from '../components/ui'
import { formatPhone, instagramHandle, instagramHref, mapsHref, telHref, websiteHref, websiteLabel, whatsappTarget } from '../lib/contact'
import { formatRelative, timeHM } from '../lib/dates'
import { leadInsights, type InsightTone } from '../lib/script'
import { buildTodayPlan, nextAction, todayQueue } from '../lib/selectors'
import { useIndex, useLead, useMetrics, useToday } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'

/** /ligacao sem id: abre o primeiro da fila atual ou da fila de hoje. */
export function CallModeEntry() {
  const queue = useApp((s) => s.queue)
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const setQueue = useApp((s) => s.setQueue)
  const max = useApp((s) => s.settings.max_tentativas)
  const index = useIndex()
  const today = useToday()
  const first = useMemo(() => {
    if (queue.ids.length) return { ids: queue.ids, label: queue.label }
    const ids = todayQueue(buildTodayPlan(leads, interactions, index, meetings, today, max))
    return { ids, label: 'Hoje' }
  }, [queue, leads, interactions, meetings, index, today, max])

  useEffect(() => {
    if (!queue.ids.length && first.ids.length) setQueue(first.ids, first.label)
  }, [queue.ids.length, first, setQueue])

  if (!first.ids.length) {
    return (
      <div className="panel mx-auto mt-10 max-w-lg">
        <Empty icon={<Headphones />} title="Nada na fila de ligações">
          Importe leads ou agende retornos para começar a ligar em sequência.
        </Empty>
      </div>
    )
  }
  return <Navigate to={`/ligacao/${first.ids[0]}`} replace />
}

type Tab = 'lead' | 'roteiro' | 'anotar'

export function CallModePage() {
  const { id } = useParams()
  const lead = useLead(id)
  const navigate = useNavigate()
  const queue = useApp((s) => s.queue)
  const settings = useApp((s) => s.settings)
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const { registerCall, discardCall, toast } = useApp.getState()
  const openWhatsApp = useWhatsApp()
  const copyPhone = useCopyPhone()
  const openMessage = useUi((s) => s.openMessage)
  const metrics = useMetrics()
  const index = useIndex()
  const [callId, setCallId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [tab, setTab] = useState<Tab>('lead')

  // A cada lead: reaproveita uma ligação de hoje ainda sem resultado (ex.: "Liguei" clicado na lista)
  useEffect(() => {
    const today = new Date().toDateString()
    const pending = useApp
      .getState()
      .interactions.filter((i) => i.lead_id === id && i.tipo === 'ligacao' && i.status === null && new Date(i.created_at).toDateString() === today)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    setCallId(pending?.id ?? null)
    setTab('lead')
  }, [id])

  const ids = queue.ids.length ? queue.ids : id ? [id] : []
  const pos = id ? ids.indexOf(id) : -1
  const nextId = pos >= 0 ? ids[pos + 1] : undefined
  const prevId = pos > 0 ? ids[pos - 1] : undefined
  const nextLead = leads.find((l) => l.id === nextId)

  const history = useMemo(
    () => interactions.filter((i) => i.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [interactions, id],
  )

  if (!lead) {
    return (
      <div className="panel mx-auto mt-10 max-w-lg">
        <Empty icon={<Headphones />} title="Lead não encontrado" action={<Button onClick={() => navigate('/leads')}>Voltar para os leads</Button>}>
          Ele pode ter sido excluído.
        </Empty>
      </div>
    )
  }

  const go = (target?: string) => {
    if (target) navigate(`/ligacao/${target}`)
  }

  const waTarget = whatsappTarget(lead)

  /** Abre a conversa no WhatsApp (mesma aba) e registra a ligação. */
  const callWhatsApp = async () => {
    const call = await openWhatsApp(lead, { ligar: !callId })
    if (call) setCallId(call.id)
    setTab('anotar')
  }

  /** Discador do sistema (tel:) + registro. */
  const callPhone = async () => {
    if (!callId) {
      const call = await registerCall(lead.id)
      setCallId(call.id)
    }
    setTab('anotar')
  }

  const justRegister = async () => {
    const call = await registerCall(lead.id)
    setCallId(call.id)
    setTab('anotar')
  }

  const onSaved = (goNext: boolean) => {
    toast(`Salvo · ${lead.empresa}`)
    if (goNext && nextId) go(nextId)
    else if (goNext && !nextId) {
      toast('Fila concluída. Bom trabalho!', 'info')
      navigate('/hoje')
    } else {
      setCallId(null)
      setFormKey((k) => k + 1)
    }
  }

  const meta = settings.meta_diaria
  const calls = index.callsByLead.get(lead.id)?.length ?? 0

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col lg:min-h-dvh">
      {/* Barra superior */}
      <div className="sticky top-0 z-20 border-b border-line-soft bg-ink/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={() => navigate(-1)}>
            <span className="hidden sm:inline">Sair</span>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-xs font-semibold text-fg sm:inline">Modo Ligação</span>
            {ids.length > 1 && (
              <span className="num truncate text-xs text-fg-3">
                <span className="hidden sm:inline">· </span>
                {queue.label} · <span className="text-fg">{pos + 1}</span> de {ids.length}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden w-40 md:block">
              <div className="mb-1 flex justify-between text-2xs">
                <span className="text-fg-3">Hoje</span>
                <span className="num text-fg-2">
                  <span className="font-semibold text-gold">{metrics.hoje.ligacoes}</span> / {meta}
                </span>
              </div>
              <Progress value={metrics.hoje.ligacoes} max={meta} />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" icon={<ChevronLeft className="size-3.5" />} disabled={!prevId} onClick={() => go(prevId)} aria-label="Lead anterior" />
              <Button
                variant="secondary"
                size="sm"
                disabled={!nextId}
                onClick={() => go(nextId)}
                title={nextLead ? `Próximo: ${nextLead.empresa}` : undefined}
              >
                <span className="hidden sm:inline">Próximo lead</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
            <div className="hidden md:block">
              <TopBar compact />
            </div>
          </div>
        </div>
        <div className="mt-2.5 xl:hidden">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'lead', label: 'Lead' },
              { id: 'roteiro', label: 'Roteiro' },
              { id: 'anotar', label: callId ? 'Anotar •' : 'Anotar' },
            ]}
          />
        </div>
      </div>

      <div className="grid flex-1 gap-0 xl:grid-cols-[310px_minmax(0,1fr)_370px]">
        {/* Esquerda: empresa */}
        <aside className={clsx('space-y-5 border-line-soft px-4 py-5 sm:px-6 xl:border-r xl:px-5', tab !== 'lead' && 'max-xl:hidden')}>
          <div>
            <h1 className="text-lg leading-6 font-semibold tracking-[-0.01em]">{lead.empresa}</h1>
            <p className="mt-1 text-xs text-fg-3">
              {lead.nicho ?? 'Nicho não informado'}
              {lead.cidade && ` · ${[lead.cidade, lead.estado].filter(Boolean).join(' - ')}`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusMenu lead={lead} />
              <Status2Menu lead={lead} alwaysVisible />
              <Rating lead={lead} className="text-xs" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="num text-[22px] leading-none font-semibold tracking-tight">
              {lead.telefone ? formatPhone(lead.telefone) : <Missing>Sem telefone</Missing>}
            </p>
            <Button
              variant="primary"
              size="lg"
              className="h-12 w-full text-[15px]"
              icon={<WhatsAppIcon className="size-[18px]" />}
              onClick={callWhatsApp}
              disabled={!waTarget}
              title={waTarget ? 'Abre a conversa no WhatsApp e registra a ligação. Para ligar, clique no ícone de telefone no topo da conversa.' : 'Sem WhatsApp ou telefone válido no cadastro'}
            >
              {callId ? 'Abrir WhatsApp de novo' : 'Ligar pelo WhatsApp'}
            </Button>
            <p className={clsx('text-center text-2xs leading-4', callId ? 'text-go' : 'text-fg-3')}>
              {callId
                ? `Ligação registrada às ${timeHM(new Date(history.find((h) => h.id === callId)?.created_at ?? Date.now()))} · no WhatsApp, clique no ícone de telefone da conversa`
                : waTarget
                  ? 'Abre a conversa no WhatsApp. Lá, clique no ícone de telefone para ligar.'
                  : 'Sem WhatsApp ou telefone válido no cadastro.'}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <a
                href={telHref(lead.telefone) ?? undefined}
                onClick={(e) => {
                  if (!lead.telefone) return e.preventDefault()
                  void callPhone()
                }}
                title="Ligar pelo discador do sistema (celular ou app de telefone do PC) e registrar a ligação"
                className={clsx(SMALL_ACTION, !lead.telefone && 'pointer-events-none opacity-40')}
              >
                <PhoneCall /> Telefone
              </a>
              <button
                type="button"
                onClick={() => copyPhone(lead.telefone)}
                disabled={!lead.telefone}
                title="Copiar o número para colar no discador ou em outro app"
                className={SMALL_ACTION}
              >
                <Copy /> Copiar
              </button>
              <button type="button" onClick={justRegister} disabled={!!callId} title="Liguei por outro aparelho: só registrar a ligação agora" className={SMALL_ACTION}>
                <Check /> Registrar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => openMessage({ leadId: lead.id })}
              disabled={!waTarget}
              title="Mandar mensagem pronta no WhatsApp (não registra ligação)"
              className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-line bg-ink px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:border-line-soft disabled:text-fg-4 [&_svg]:size-3.5 [&_svg]:shrink-0"
            >
              <WhatsAppIcon />
              <span className="truncate">Mensagem</span>
            </button>
            <ContactButton href={mapsHref(lead.maps_url, lead.empresa, lead.cidade)} icon={<MapPin />} label="Maps" />
            <ContactButton href={instagramHref(lead.instagram)} icon={<InstagramIcon />} label={lead.instagram ? instagramHandle(lead.instagram) : 'Instagram'} />
            <ContactButton href={websiteHref(lead.website)} icon={<Globe />} label={lead.website ? websiteLabel(lead.website) : 'Sem site'} />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-fg-2">Contexto</h3>
            <ul className="space-y-1.5">
              {leadInsights(lead).map((i) => (
                <li key={i.id} className="flex gap-2.5 text-xs">
                  <span className={clsx('mt-1.5 size-1.5 shrink-0 rounded-full', INSIGHT_DOT[i.tone])} />
                  <span>
                    <span className="text-fg">{i.title}</span>
                    {i.detail && <span className="block text-fg-3">{i.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="space-y-1.5 text-xs">
            <Info label="Endereço">{lead.endereco ?? <Missing />}</Info>
            <Info label="Pasta">{lead.pasta ?? <Missing />}</Info>
            <Info label="Ligações">{calls ? `${calls} · última ${formatRelative(lead.ultima_ligacao!)}` : <Missing>Nenhuma ainda</Missing>}</Info>
            <Info label="Próximo">
              <NextActionText action={nextAction(lead, index)} />
            </Info>
            {lead.falei_com && (
              <Info label="Contato">
                {lead.falei_com}
                {lead.cargo && <span className="text-fg-3"> · {lead.cargo}</span>}
              </Info>
            )}
          </dl>

          {history.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-fg-2">Últimos contatos</h3>
              <ul className="space-y-2">
                {history.slice(0, 4).map((h) => (
                  <li key={h.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="num text-2xs text-fg-3">{formatRelative(h.created_at)}</span>
                      {h.status && <StatusBadge status={h.status} />}
                      {!h.status && h.tipo === 'ligacao' && <span className="text-2xs text-gold">sem resultado</span>}
                    </div>
                    {(h.falei_com || h.observacao) && (
                      <p className="mt-0.5 line-clamp-2 text-fg-2">
                        {h.falei_com && <span className="text-fg">{h.falei_com}: </span>}
                        {h.observacao}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Centro: roteiro */}
        <main className={clsx('min-w-0 px-4 py-5 sm:px-6 xl:px-8', tab !== 'roteiro' && 'max-xl:hidden')}>
          <div className="mx-auto max-w-[680px]">
            <CallScript lead={lead} settings={settings} />
          </div>
        </main>

        {/* Direita: anotações e resultado */}
        <aside className={clsx('border-line-soft bg-panel/40 px-4 py-5 sm:px-6 xl:border-l xl:px-5', tab !== 'anotar' && 'max-xl:hidden')}>
          <h2 className="mb-3 text-xs font-semibold text-fg-2">Anotações</h2>
          <OutcomeForm
            key={`${lead.id}-${formKey}`}
            lead={lead}
            mode="call"
            callId={callId}
            variant="panel"
            hasNext={!!nextId}
            onSaved={onSaved}
            onDiscardCall={
              callId
                ? async () => {
                    await discardCall(callId)
                    setCallId(null)
                    toast('Ligação desfeita.', 'info')
                  }
                : undefined
            }
          />
          {nextId && (
            <button onClick={() => go(nextId)} className="mt-4 flex w-full items-center justify-center gap-1.5 text-2xs text-fg-4 hover:text-fg-2">
              <SkipForward className="size-3" /> Pular sem registrar{nextLead && ` · próximo: ${nextLead.empresa}`}
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

const INSIGHT_DOT: Record<InsightTone, string> = {
  gold: 'bg-gold',
  green: 'bg-go',
  blue: 'bg-accent',
  neutral: 'bg-fg-4',
  red: 'bg-bad',
}

const SMALL_ACTION =
  'flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-ink px-2 text-2xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5'

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-fg-3">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function ContactButton({ href, icon, label }: { href: string | null; icon: ReactNode; label: string }) {
  const cls = 'flex h-9 min-w-0 items-center gap-2 rounded-md border px-2.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0'
  if (!href) {
    return (
      <span className={clsx(cls, 'cursor-not-allowed border-line-soft text-fg-4')} title={`${label}: não informado`}>
        {icon}
        <span className="truncate">{label}</span>
      </span>
    )
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={clsx(cls, 'border-line bg-ink text-fg-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-fg')}>
      {icon}
      <span className="truncate">{label}</span>
    </a>
  )
}

