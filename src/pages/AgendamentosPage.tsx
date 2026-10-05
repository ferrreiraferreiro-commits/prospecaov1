import clsx from 'clsx'
import { AlarmClock, CalendarClock, Check, CheckCheck, Coffee, Pencil, RotateCcw, Search, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, confirmAction } from '../components/kit'
import { MOTOR_DOWNLOAD, MotorOffline } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Segmented } from '../components/ui'
import { localParts, quickTimes, relativeTo, syncAgenda, toIso, type Agendamento } from '../lib/agenda'
import { formatPhone } from '../lib/contact'
import { leadPhone } from '../lib/disparo'
import { fillMessage, getMessages, MESSAGE_VARIABLES, pickVariation } from '../lib/messages'
import { motorFetch, useMotor } from '../lib/motor'
import { normalizeKey } from '../lib/statuses'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'

type Aba = 'proximos' | 'enviados' | 'outros'

interface Draft {
  id: string | null
  leadId: string | null
  nome: string
  telefone: string
  texto: string
  date: string
  time: string
}

function tomorrow8(): { date: string; time: string } {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return localParts(d.toISOString())
}

function emptyDraft(): Draft {
  return { id: null, leadId: null, nome: '', telefone: '', texto: '', ...tomorrow8() }
}

const DAY_FMT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const t = new Date(today)
  t.setDate(t.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === t.toDateString()) return 'Amanhã'
  const s = DAY_FMT.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function AgendamentosPage() {
  const online = useMotor((s) => s.online)
  const health = useMotor((s) => s.health)
  const nuvem = useMotor((s) => s.nuvem)
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState<Agendamento[]>([])
  const [aba, setAba] = useState<Aba>('proximos')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busca, setBusca] = useState('')
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      setList(await motorFetch<Agendamento[]>('/agenda', { timeoutMs: 6000 }))
    } catch {
      /* motor desligado */
    }
  }, [])

  useEffect(() => {
    if (!online) return
    void refresh()
    const id = setInterval(() => {
      void refresh()
      setTick((t) => t + 1)
    }, 10_000)
    return () => clearInterval(id)
  }, [online, refresh])

  // Veio da ficha do lead: /agendamentos?lead=<id>
  useEffect(() => {
    const id = params.get('lead')
    if (!id) return
    const lead = leads.find((l) => l.id === id)
    if (lead) chooseLead(lead)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, leads])

  const lead = draft.leadId ? leads.find((l) => l.id === draft.leadId) : undefined
  const templates = getMessages(settings)

  function chooseLead(l: Lead) {
    setDraft((d) => ({ ...d, leadId: l.id, nome: l.falei_com?.trim() ? `${l.falei_com.trim()} · ${l.empresa}` : l.empresa, telefone: leadPhone(l) }))
    setBusca('')
  }

  const sugestoes = useMemo(() => {
    const q = normalizeKey(busca)
    const digits = busca.replace(/\D/g, '')
    if (!q && !digits) return []
    return leads
      .filter((l) => leadPhone(l))
      .filter((l) => (digits.length >= 4 && leadPhone(l).includes(digits)) || (q && normalizeKey(`${l.empresa} ${l.falei_com ?? ''} ${l.cidade ?? ''}`).includes(q)))
      .slice(0, 8)
  }, [busca, leads])

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const raw = pickVariation(t, draft.leadId ?? 'manual')
    const text = lead ? fillMessage(raw, lead, settings, new Date(), ['saudacao']) : raw
    setDraft((d) => ({ ...d, texto: text }))
  }

  async function save() {
    if (!draft.telefone.replace(/\D/g, '')) return toast('Escolha um lead ou digite o número.', 'error')
    if (!draft.texto.trim()) return toast('Escreva a mensagem.', 'error')
    const quando = toIso(draft.date, draft.time)
    if (Date.parse(quando) < Date.now() - 60_000 && !confirmAction('Esse horário já passou. Enviar assim que possível?')) return
    setSaving(true)
    try {
      const body = { leadId: draft.leadId, nome: draft.nome || draft.telefone, telefone: draft.telefone, texto: draft.texto, quando }
      if (draft.id) await motorFetch(`/agenda/${draft.id}/editar`, { method: 'POST', json: body })
      else await motorFetch('/agenda', { method: 'POST', json: body })
      toast(`${draft.id ? 'Agendamento atualizado' : 'Mensagem agendada'} para ${dayLabel(quando).toLowerCase()} às ${hhmm(quando)}.`)
      setDraft(emptyDraft())
      setAba('proximos')
      await refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao agendar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function act(path: string, method = 'POST', body?: unknown) {
    try {
      await motorFetch(path, { method, json: body })
      await refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha.', 'error')
    }
  }

  function edit(a: Agendamento) {
    setDraft({ id: a.id, leadId: a.leadId, nome: a.nome, telefone: a.telefone, texto: a.texto, ...localParts(a.quando) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const proximos = list.filter((a) => a.status === 'agendado' || a.status === 'enviando')
  const enviados = list.filter((a) => a.status === 'enviado').reverse()
  const outros = list.filter((a) => a.status === 'falhou' || a.status === 'cancelado').reverse()
  const shown = aba === 'proximos' ? proximos : aba === 'enviados' ? enviados : outros
  const atrasados = proximos.filter((a) => Date.parse(a.quando) < Date.now() - 60_000).length
  const quando = toIso(draft.date, draft.time)
  const waOk = health?.whatsapp.status === 'connected'

  // Agrupa os próximos por dia
  const groups = useMemo(() => {
    const m = new Map<string, Agendamento[]>()
    for (const a of shown) {
      const k = aba === 'proximos' ? dayLabel(a.quando) : dayLabel(a.enviadoEm ?? a.quando)
      m.set(k, [...(m.get(k) ?? []), a])
    }
    return [...m]
  }, [shown, aba])

  return (
    <div className="space-y-4">
      <PageHeader title="Mensagens agendadas" subtitle={
          nuvem
            ? 'Deixe mensagens de WhatsApp marcadas para um dia e hora. A XS envia sozinha, mesmo com o computador desligado.'
            : 'Deixe mensagens de WhatsApp marcadas para um dia e hora. O Motor WhatsApp XS envia sozinho, mesmo com você longe do computador.'
        }
      />

      {online === false && <MotorOffline feature="O agendamento" />}
      {online && health && !health.agenda && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">Seu Motor WhatsApp XS (versão {health.versao}) é anterior aos agendamentos. Baixe a versão nova, feche o motor aberto e abra o novo.</span>
          <a href={MOTOR_DOWNLOAD} download className="font-medium text-blue-300 hover:text-blue-200">
            Baixar o Motor WhatsApp XS →
          </a>
        </div>
      )}
      {online && !waOk && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">O WhatsApp não está conectado. Os agendamentos ficam guardados e saem assim que ele conectar.</span>
          <Link to="/whatsapp" className="font-medium text-blue-300 hover:text-blue-200">
            Conectar WhatsApp →
          </Link>
        </div>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-[26rem_1fr]">
        {/* Formulário */}
        <Card
          title={draft.id ? 'Editar agendamento' : 'Novo agendamento'}
          actions={
            draft.id && (
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setDraft(emptyDraft())}>
                Cancelar edição
              </Button>
            )
          }
        >
          <div className="space-y-3.5">
            <div>
              <span className="label">Para quem</span>
              {draft.telefone ? (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="pv truncate text-xs font-medium text-fg">{draft.nome || 'Número avulso'}</p>
                    <p className="pv num text-2xs text-fg-3">{formatPhone(draft.telefone)}</p>
                  </div>
                  <button onClick={() => setDraft((d) => ({ ...d, leadId: null, nome: '', telefone: '' }))} className="rounded p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Trocar destinatário">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
                  <input className="input pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lead pelo nome ou digitar o número" autoFocus />
                  {(sugestoes.length > 0 || busca.replace(/\D/g, '').length >= 10) && (
                    <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-xl">
                      {sugestoes.map((l) => (
                        <li key={l.id}>
                          <button onClick={() => chooseLead(l)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-tint/[0.05]">
                            <span className="min-w-0 flex-1">
                              <span className="pv block truncate text-xs font-medium">{l.empresa}</span>
                              <span className="pv block truncate text-2xs text-fg-3">{[l.falei_com, l.cidade].filter(Boolean).join(' · ') || l.nicho}</span>
                            </span>
                            <span className="pv num text-2xs text-fg-3">{formatPhone(leadPhone(l))}</span>
                          </button>
                        </li>
                      ))}
                      {busca.replace(/\D/g, '').length >= 10 && (
                        <li>
                          <button
                            onClick={() => {
                              setDraft((d) => ({ ...d, leadId: null, nome: '', telefone: busca.replace(/\D/g, '') }))
                              setBusca('')
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-blue-300 hover:bg-tint/[0.05]"
                          >
                            Usar o número {formatPhone(busca.replace(/\D/g, ''))}
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
              {draft.telefone && !draft.leadId && (
                <input className="pv input mt-1.5" value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} placeholder="Nome (opcional, só para você reconhecer)" />
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="label mb-0">Mensagem</span>
                <select className="input h-7 w-auto max-w-[60%] text-2xs" value="" onChange={(e) => applyTemplate(e.target.value)} aria-label="Usar modelo">
                  <option value="">Usar um modelo…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <textarea className="pv input" rows={6} value={draft.texto} onChange={(e) => setDraft({ ...draft, texto: e.target.value })} placeholder="Ex.: {saudacao}, Mariana! Conforme combinamos, segue o exemplo do site…" />
              <p className="mt-1 text-2xs text-fg-4">
                {MESSAGE_VARIABLES[0]} vira "Bom dia/Boa tarde/Boa noite" na hora do envio.
              </p>
            </div>

            <div>
              <span className="label">Quando enviar</span>
              <div className="flex gap-1.5">
                <input type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                <input type="time" className="input w-28" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {quickTimes().map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setDraft({ ...draft, ...localParts(q.iso) })}
                    className={clsx(
                      'h-6 rounded-md border px-2 text-2xs font-medium transition-colors',
                      Math.abs(Date.parse(q.iso) - Date.parse(quando)) < 60_000 ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:text-fg-2',
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-fg-3">
                {dayLabel(quando)} às {hhmm(quando)} · <span className="text-blue-300">{relativeTo(quando)}</span>
              </p>
            </div>

            <Button variant="primary" size="lg" className="w-full" icon={<AlarmClock className="size-4" />} loading={saving} disabled={!online} onClick={() => void save()}>
              {draft.id ? 'Salvar alterações' : 'Agendar mensagem'}
            </Button>

            {nuvem ? (
              <p className="rounded-lg border border-line-soft bg-ink p-3 text-2xs text-fg-3">
                As mensagens saem pela nuvem da XS no horário marcado (horário de Brasília), mesmo com o seu computador desligado. Basta o WhatsApp estar conectado.
              </p>
            ) : (
              <div className="rounded-lg border border-line-soft bg-ink p-3 text-2xs text-fg-3">
                <p className="mb-1 flex items-center gap-1.5 font-semibold text-fg-2">
                  <Coffee className="size-3.5" /> Para funcionar com você fora de casa
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Deixe o computador ligado com o Motor WhatsApp XS aberto e o WhatsApp conectado.</li>
                  <li>Enquanto houver agendamento, o Motor impede o Windows de suspender sozinho{health?.acordado ? ' (ativo agora)' : ''}. Não feche a tampa do notebook.</li>
                  <li>Se o PC estiver desligado no horário, a mensagem sai assim que o Motor abrir de novo.</li>
                </ul>
              </div>
            )}
          </div>
        </Card>

        {/* Lista */}
        <section className="panel min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
            <Segmented
              value={aba}
              onChange={setAba}
              options={[
                { id: 'proximos', label: `Próximos (${proximos.length})` },
                { id: 'enviados', label: `Enviados (${enviados.length})` },
                { id: 'outros', label: `Falhas e cancelados (${outros.length})` },
              ]}
            />
            {atrasados > 0 && aba === 'proximos' && <span className="text-2xs text-amber-300">{atrasados} aguardando o WhatsApp conectar</span>}
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              icon={<RotateCcw className="size-3" />}
              disabled={!online}
              onClick={async () => {
                await refresh()
                await syncAgenda().catch(() => 0)
              }}
            >
              Atualizar
            </Button>
          </div>

          {shown.length === 0 ? (
            <Empty icon={<CalendarClock />} title={aba === 'proximos' ? 'Nenhuma mensagem agendada' : aba === 'enviados' ? 'Nada enviado ainda' : 'Nenhuma falha'}>
              {aba === 'proximos' && 'Escolha a pessoa, escreva a mensagem e o horário ao lado.'}
            </Empty>
          ) : (
            <div className="divide-y divide-line-soft">
              {groups.map(([day, items]) => (
                <div key={day}>
                  <p className="bg-ink/40 px-4 py-1.5 text-2xs font-semibold tracking-wide text-fg-3 uppercase">{day}</p>
                  <ul className="divide-y divide-line-soft">
                    {items.map((a) => (
                      <AgendaRow
                        key={a.id}
                        a={a}
                        onEdit={() => edit(a)}
                        onCancel={() => confirmAction(`Cancelar a mensagem para ${a.nome}?`) && void act(`/agenda/${a.id}/cancelar`)}
                        onDelete={() => confirmAction('Apagar este agendamento da lista?') && void act(`/agenda/${a.id}`, 'DELETE')}
                        onRetry={() => void act(`/agenda/${a.id}/editar`, 'POST', { quando: new Date(Date.now() + 60_000).toISOString() })}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function AgendaRow({ a, onEdit, onCancel, onDelete, onRetry }: { a: Agendamento; onEdit: () => void; onCancel: () => void; onDelete: () => void; onRetry: () => void }) {
  const late = a.status === 'agendado' && Date.parse(a.quando) < Date.now() - 60_000
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="w-14 shrink-0 pt-0.5">
        <p className={clsx('num text-sm font-semibold', late ? 'text-amber-300' : 'text-fg')}>{hhmm(a.status === 'enviado' && a.enviadoEm ? a.enviadoEm : a.quando)}</p>
        <p className="text-[10px] text-fg-4">{a.status === 'agendado' ? relativeTo(a.quando) : ''}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="pv truncate text-xs font-semibold text-fg">{a.nome}</p>
          <p className="pv num text-2xs text-fg-3">{formatPhone(a.telefone)}</p>
          <StatusTag a={a} late={late} />
        </div>
        <p className="pv mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-fg-2">{a.texto}</p>
        {a.erro && <p className={clsx('mt-1 text-2xs', a.status === 'falhou' ? 'text-red-300' : 'text-fg-4')}>{a.erro}</p>}
        {a.respostas.map((r, i) => (
          <p key={i} className="mt-1 rounded bg-emerald-500/10 px-2 py-1 text-2xs text-emerald-200">
            Respondeu: “{r.texto || '…'}”
          </p>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {(a.status === 'agendado' || a.status === 'cancelado' || a.status === 'falhou') && (
          <Button size="xs" variant="ghost" icon={<Pencil className="size-3" />} onClick={onEdit} aria-label="Editar" />
        )}
        {a.status === 'falhou' && (
          <Button size="xs" variant="ghost" icon={<Send className="size-3" />} onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
        {a.status === 'agendado' && <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={onCancel} aria-label="Cancelar" />}
        {a.status !== 'agendado' && a.status !== 'enviando' && <Button size="xs" variant="ghost" icon={<Trash2 className="size-3" />} onClick={onDelete} aria-label="Apagar" />}
      </div>
    </li>
  )
}

function StatusTag({ a, late }: { a: Agendamento; late: boolean }) {
  if (a.status === 'agendado')
    return late ? <span className="text-2xs text-amber-300">aguardando WhatsApp</span> : <span className="text-2xs text-blue-300">agendada</span>
  if (a.status === 'enviando') return <span className="text-2xs text-blue-300">enviando…</span>
  if (a.status === 'cancelado') return <span className="text-2xs text-fg-4">cancelada</span>
  if (a.status === 'falhou') return <span className="text-2xs text-red-300">não enviada</span>
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-emerald-300">
      {a.entrega === 'lido' ? <CheckCheck className="size-3 text-sky-300" /> : a.entrega === 'entregue' ? <CheckCheck className="size-3" /> : <Check className="size-3" />}
      {a.entrega === 'lido' ? 'lida' : a.entrega === 'entregue' ? 'entregue' : 'enviada'}
    </span>
  )
}

