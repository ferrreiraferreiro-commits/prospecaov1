import clsx from 'clsx'
import { Check, ShieldCheck, SkipForward, Square, Timer } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { HotTag } from '../components/leadBits'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Progress, WhatsAppIcon } from '../components/ui'
import { useSendMessage } from '../components/whatsapp'
import { formatPhone, whatsappTarget } from '../lib/contact'
import { buildAudience, DEFAULT_AUDIENCE, messagesToday, PUBLICOS, type AudienceFilter } from '../lib/disparo'
import { fillMessage, getMessages, pickVariation } from '../lib/messages'
import { getStatus2Options } from '../lib/status2'
import { isHot } from '../lib/selectors'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'
import { useDisparo } from '../store/useDisparo'
import { useUi } from '../store/useUi'

const AUDIENCE_KEY = 'central-prospeccao:disparo-publico'
const RITMO_KEY = 'central-prospeccao:disparo-ritmo'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

export function DisparoPage() {
  const session = useDisparo((s) => s.session)
  return (
    <div className="space-y-5">
      <PageHeader title="Disparo assistido" subtitle="Mensagens em sequência pelo WhatsApp. Você confere e envia cada uma, com intervalo entre elas." />
      {session ? <Running /> : <Setup />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

function Setup() {
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const start = useDisparo((s) => s.start)
  const templates = getMessages(settings)
  const [filter, setFilterState] = useState<AudienceFilter>(() => loadJson(AUDIENCE_KEY, DEFAULT_AUDIENCE))
  const [ritmo, setRitmoState] = useState(() => loadJson(RITMO_KEY, { minSec: 45, maxSec: 120, templateId: templates[0]?.id ?? '' }))
  const [limite, setLimite] = useState(String(settings.disparo_limite_diario))

  const setFilter = (patch: Partial<AudienceFilter>) => {
    const next = { ...filter, ...patch }
    setFilterState(next)
    saveJson(AUDIENCE_KEY, next)
  }
  const setRitmo = (patch: Partial<typeof ritmo>) => {
    const next = { ...ritmo, ...patch }
    setRitmoState(next)
    saveJson(RITMO_KEY, next)
  }

  const audience = useMemo(() => buildAudience(leads, interactions, filter), [leads, interactions, filter])
  const template = templates.find((t) => t.id === ritmo.templateId) ?? templates[0]
  const enviadasHoje = messagesToday(interactions)
  const restamHoje = Math.max(0, settings.disparo_limite_diario - enviadasHoje)
  const total = Math.min(audience.leads.length, restamHoje)
  const nichos = useMemo(() => [...new Set(leads.map((l) => l.nicho).filter(Boolean) as string[])].sort(), [leads])
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade).filter(Boolean) as string[])].sort(), [leads])
  const exemplo = audience.leads[0]

  const commitLimite = () => {
    const n = Math.max(1, Math.min(500, Math.round(Number(limite) || 30)))
    setLimite(String(n))
    if (n !== settings.disparo_limite_diario) void saveSettings({ ...settings, disparo_limite_diario: n })
  }

  return (
    <>
      <div className="flex gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-xs leading-5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-go" />
        <p className="text-fg-2">
          <span className="font-medium text-fg">Por que assistido:</span> robôs que disparam sozinhos (como o do Caldeira Nexus) usam conexões não oficiais e podem fazer o
          WhatsApp <span className="text-fg">banir o número</span> — mesmo enviando pouco. Aqui a mensagem abre pronta e quem aperta enviar é você, com intervalo
          sorteado entre uma e outra e limite por dia. O risco não some (se muita gente bloquear ou denunciar, o WhatsApp pode restringir), mas fica bem menor.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Step n={1} title="Quem recebe">
            <div className="flex flex-wrap gap-1.5">
              {PUBLICOS.map((p) => (
                <button key={p.id} type="button" title={p.hint} onClick={() => setFilter({ publico: p.id })} className={chip(filter.publico === p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Select label="Nicho" value={filter.nicho} onChange={(v) => setFilter({ nicho: v })} options={nichos} />
              <Select label="Cidade" value={filter.cidade} onChange={(v) => setFilter({ cidade: v })} options={cidades} />
              <Select
                label="Status 2"
                value={filter.status2}
                onChange={(v) => setFilter({ status2: v })}
                options={getStatus2Options(settings)}
                extra={[{ value: '__vazio__', label: 'Sem Status 2' }]}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="accent-[var(--color-go)]" checked={filter.somenteSemSite} onChange={(e) => setFilter({ somenteSemSite: e.target.checked })} />
                Só quem não tem site
              </label>
              <label className="flex items-center gap-2">
                Não repetir para quem recebeu nos últimos
                <input
                  type="number"
                  min={0}
                  max={90}
                  className="input num h-7 w-14 px-2 text-center text-xs"
                  value={filter.diasSemRepetir}
                  onChange={(e) => setFilter({ diasSemRepetir: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                />
                dias
              </label>
            </div>
            <p className="mt-3 text-xs text-fg-3">
              <span className="num font-semibold text-fg">{audience.leads.length}</span> prontos
              {audience.recentes > 0 && <> · {audience.recentes} receberam há pouco</>}
              {audience.semNumero > 0 && <> · {audience.semNumero} sem número válido</>}
              {audience.repetidos > 0 && <> · {audience.repetidos} com número repetido</>}
              {audience.bloqueados > 0 && <> · {audience.bloqueados} encerrados/sem interesse (nunca recebem)</>}
            </p>
          </Step>

          <Step n={2} title="Mensagem">
            {templates.length === 0 ? (
              <p className="text-xs text-fg-3">Crie um modelo em Ajustes → Mensagens.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => setRitmo({ templateId: t.id })} className={chip(t.id === template?.id)}>
                    {t.nome}
                  </button>
                ))}
              </div>
            )}
            {template && exemplo && (
              <div className="mt-3 rounded-lg border border-line-soft bg-ink/60 p-3">
                <p className="mb-1 text-2xs text-fg-4">Prévia para {exemplo.empresa}</p>
                <p className="text-xs leading-5 whitespace-pre-line text-fg">{fillMessage(pickVariation(template, exemplo.id), exemplo, settings)}</p>
                {template.variacoes.filter((v) => v.trim()).length > 1 && (
                  <p className="mt-1.5 text-2xs text-fg-4">{template.variacoes.filter((v) => v.trim()).length} variações em rodízio — os textos não saem todos iguais.</p>
                )}
              </div>
            )}
          </Step>

          <Step n={3} title="Ritmo">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-xs">
              <label className="space-y-1">
                <span className="label">Espera entre mensagens (segundos)</span>
                <span className="flex items-center gap-2">
                  <input type="number" min={10} max={3600} className="input num h-8 w-20 text-center" value={ritmo.minSec} onChange={(e) => setRitmo({ minSec: Math.max(10, Number(e.target.value) || 10) })} />
                  até
                  <input type="number" min={10} max={3600} className="input num h-8 w-20 text-center" value={ritmo.maxSec} onChange={(e) => setRitmo({ maxSec: Math.max(10, Number(e.target.value) || 10) })} />
                </span>
              </label>
              <label className="space-y-1">
                <span className="label">Limite por dia</span>
                <input type="number" min={1} max={500} className="input num h-8 w-20 text-center" value={limite} onChange={(e) => setLimite(e.target.value)} onBlur={commitLimite} onKeyDown={(e) => e.key === 'Enter' && commitLimite()} />
              </label>
              <p className="pb-1.5 text-fg-3">
                Hoje: <span className="num font-semibold text-fg">{enviadasHoje}</span> / {settings.disparo_limite_diario}
              </p>
            </div>
            <p className="mt-2 text-2xs leading-4 text-fg-4">
              Sugestão para não chamar atenção: 45–120 s entre mensagens e até 30 por dia num número novo (aumente aos poucos). Prefira quem já conversou com você.
            </p>
          </Step>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              icon={<WhatsAppIcon className="size-4" />}
              disabled={!total || !template}
              onClick={() => template && start(audience.leads.slice(0, total).map((l) => l.id), template.id, ritmo.minSec, ritmo.maxSec)}
            >
              Começar disparo{total ? ` · ${total}` : ''}
            </Button>
            {restamHoje === 0 && <span className="text-xs text-orange-300">Limite de hoje atingido.</span>}
            {restamHoje > 0 && audience.leads.length > restamHoje && (
              <span className="text-xs text-fg-3">
                {audience.leads.length - restamHoje} ficam para outro dia (limite diário).
              </span>
            )}
          </div>
        </div>

        <section className="panel overflow-hidden self-start">
          <div className="border-b border-line-soft px-4 py-2.5 text-xs font-semibold">
            Fila <span className="num font-normal text-fg-3">· {audience.leads.length}</span>
            <span className="ml-1 font-normal text-fg-4">(maior potencial primeiro)</span>
          </div>
          {audience.leads.length === 0 ? (
            <p className="px-4 py-4 text-xs text-fg-4">Ninguém com esses filtros.</p>
          ) : (
            <ul className="max-h-[520px] overflow-y-auto">
              {audience.leads.slice(0, 80).map((l, i) => (
                <QueueLine key={l.id} lead={l} muted={i >= restamHoje} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Em andamento
// ---------------------------------------------------------------------------

function Running() {
  const session = useDisparo((s) => s.session)!
  const { markOpened, advance, skipWait, stop } = useDisparo.getState()
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const interactions = useApp((s) => s.interactions)
  const send = useSendMessage()
  const openLead = useUi((s) => s.openLead)
  const templates = getMessages(settings)
  const template = templates.find((t) => t.id === session.templateId) ?? templates[0]
  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const lead = byId.get(session.ids[session.pos])
  const done = session.pos >= session.ids.length
  const enviadasHoje = messagesToday(interactions)
  const noLimite = enviadasHoje >= settings.disparo_limite_diario

  const [text, setText] = useState('')
  useEffect(() => {
    if (lead && template) setText(fillMessage(pickVariation(template, lead.id), lead, settings))
    // novo texto só ao trocar de lead
  }, [lead?.id, template?.id])

  // Contagem regressiva até liberar o próximo envio
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!session.nextAt) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [session.nextAt])
  const wait = session.nextAt ? Math.max(0, Math.ceil((session.nextAt - now) / 1000)) : 0

  const enviados = Object.values(session.results).filter((r) => r === 'enviado').length
  const pulados = Object.values(session.results).filter((r) => r === 'pulado').length

  if (done) {
    return (
      <div className="panel mx-auto max-w-lg">
        <Empty icon={<Check />} title="Disparo concluído" action={<Button onClick={stop}>Voltar</Button>}>
          {enviados} {enviados === 1 ? 'mensagem aberta' : 'mensagens abertas'} · {pulados} {pulados === 1 ? 'pulado' : 'pulados'}. Tudo ficou no histórico de cada lead.
        </Empty>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="num text-fg-2">
            <span className="font-semibold text-fg">{session.pos + 1}</span> de {session.ids.length}
          </span>
          <Progress value={session.pos} max={session.ids.length} tone="go" className="max-w-48 flex-1" />
          <span className="num ml-auto text-fg-3">
            Hoje {enviadasHoje}/{settings.disparo_limite_diario}
          </span>
          <Button size="sm" variant="ghost" icon={<Square className="size-3" />} onClick={stop}>
            Encerrar
          </Button>
        </div>

        {lead ? (
          <>
            <button onClick={() => openLead(lead.id)} className="text-left">
              <span className="flex items-center gap-2">
                <span className="text-base font-semibold hover:underline">{lead.empresa}</span>
                <HotTag lead={lead} />
              </span>
              <span className="mt-0.5 block text-xs text-fg-3">
                <span className="num text-fg-2">{formatPhone(whatsappTarget(lead)?.number)}</span>
                {lead.nicho && ` · ${lead.nicho}`}
                {lead.cidade && ` · ${lead.cidade}`}
              </span>
            </button>

            <textarea className="input mt-3 resize-y leading-5" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mensagem" disabled={session.opened} />

            {!session.opened ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<WhatsAppIcon className="size-4" />}
                  disabled={wait > 0 || noLimite || !text.trim()}
                  onClick={() => {
                    if (send(lead, text, template?.nome)) markOpened()
                  }}
                >
                  {wait > 0 ? `Liberado em ${fmtWait(wait)}` : 'Abrir no WhatsApp'}
                </Button>
                <Button variant="ghost" icon={<SkipForward className="size-3.5" />} onClick={() => advance('pulado')}>
                  Pular este
                </Button>
                {wait > 0 && (
                  <button onClick={skipWait} className="text-2xs text-fg-4 hover:text-fg-2">
                    não esperar
                  </button>
                )}
                {noLimite && <span className="text-xs text-orange-300">Limite de hoje atingido. Continue amanhã.</span>}
              </div>
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border border-go/20 bg-go/[0.05] p-3">
                <p className="text-xs text-fg-2">
                  A conversa abriu com a mensagem escrita. <span className="font-medium text-fg">Confira e aperte Enter no WhatsApp</span>, depois volte aqui.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" icon={<Check className="size-3.5" />} onClick={() => advance('enviado')}>
                    Enviei · próximo
                  </Button>
                  <Button variant="ghost" onClick={() => advance('pulado')}>
                    Não enviei
                  </Button>
                  {wait > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-2xs text-fg-3">
                      <Timer className="size-3" /> próximo liberado em <span className="num text-fg">{fmtWait(wait)}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-fg-3">
            Este lead foi excluído.{' '}
            <button className="text-blue-300" onClick={() => advance('pulado')}>
              Pular
            </button>
          </p>
        )}
      </section>

      <section className="panel overflow-hidden self-start">
        <div className="border-b border-line-soft px-4 py-2.5 text-xs font-semibold">
          Fila <span className="num font-normal text-fg-3">· {enviados} enviados · {pulados} pulados</span>
        </div>
        <ul className="max-h-[520px] overflow-y-auto">
          {session.ids.map((id, i) => {
            const l = byId.get(id)
            if (!l) return null
            const r = session.results[id]
            return (
              <li key={id} className={clsx('flex items-center gap-2 border-b border-line-soft px-4 py-2 text-xs last:border-0', i === session.pos && 'bg-tint/[0.04]')}>
                <span className="num w-5 shrink-0 text-2xs text-fg-4">{i + 1}</span>
                <span className={clsx('min-w-0 flex-1 truncate', r ? 'text-fg-3' : 'text-fg')}>{l.empresa}</span>
                {r === 'enviado' && <span className="text-2xs text-go">enviado</span>}
                {r === 'pulado' && <span className="text-2xs text-fg-4">pulado</span>}
                {i === session.pos && !r && <span className="text-2xs text-gold">agora</span>}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function fmtWait(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

// ---------------------------------------------------------------------------

const chip = (active: boolean) =>
  clsx(
    'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
    active ? 'border-go/40 bg-go/10 text-go' : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:text-fg',
  )

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="panel px-5 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <span className="num flex size-5 items-center justify-center rounded-full bg-tint/[0.06] text-2xs text-fg-2">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
  extra = [],
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  extra?: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input h-8 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {extra.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function QueueLine({ lead, muted }: { lead: Lead; muted: boolean }) {
  const openLead = useUi((s) => s.openLead)
  return (
    <li>
      <button onClick={() => openLead(lead.id)} className={clsx('flex w-full items-center gap-2 border-b border-line-soft px-4 py-2 text-left text-xs hover:bg-tint/[0.03]', muted && 'opacity-45')}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{lead.empresa}</span>
          <span className="block truncate text-2xs text-fg-3">
            {lead.nicho ?? 'Nicho não informado'}
            {lead.cidade && ` · ${lead.cidade}`}
          </span>
        </span>
        {isHot(lead) ? <HotTag lead={lead} /> : !lead.website && <span className="shrink-0 text-2xs text-gold/80">sem site</span>}
      </button>
    </li>
  )
}
