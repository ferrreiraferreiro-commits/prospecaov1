import clsx from 'clsx'
import { Archive, CalendarClock, Check, Plus, SkipForward, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { consecutiveNoAnswer, nextAttempt, ordinal } from '../lib/attempts'
import { whatsappTarget } from '../lib/contact'
import { addDays, formatDateTime, todayKey } from '../lib/dates'
import { visibleCallResults, SEM_RESPOSTA, STATUSES, STATUS_MAP, TONE_CLASSES } from '../lib/statuses'
import type { Lead, StatusId } from '../lib/types'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { defaultFollowup, draftToInput, FollowupPicker, type DayPreset, type FollowupDraft } from './FollowupPicker'
import { Button, Kbd } from './ui'

export interface OutcomeFormProps {
  lead: Lead
  mode: 'call' | 'status'
  /** Ligação já registrada (via "Liguei") */
  callId: string | null
  presetStatus?: StatusId | null
  /** 'panel' = Modo Ligação (mais campos + "Salvar e próximo") */
  variant?: 'modal' | 'panel'
  onSaved: (goNext: boolean) => void
  onCancel?: () => void
  onDiscardCall?: () => void
  hasNext?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function isTyping(el: Element | null) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
}

export function OutcomeForm({ lead, mode, callId, presetStatus, variant = 'modal', onSaved, onCancel, onDiscardCall, hasNext }: OutcomeFormProps) {
  const saveOutcome = useApp((s) => s.saveOutcome)
  const call = useApp((s) => (callId ? s.interactions.find((i) => i.id === callId) : undefined))
  const interactions = useApp((s) => s.interactions)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const openMessage = useUi((s) => s.openMessage)
  // Tentativas seguidas sem resposta antes desta ligação
  const previousNoAnswer = useMemo(
    () => consecutiveNoAnswer(interactions.filter((i) => i.lead_id === lead.id), callId),
    [interactions, lead.id, callId],
  )

  const [status, setStatus] = useState<StatusId | null>(presetStatus ?? null)
  const [falei, setFalei] = useState(lead.falei_com ?? '')
  const [cargo, setCargo] = useState(lead.cargo ?? '')
  const [obs, setObs] = useState('')
  const [proxima, setProxima] = useState(lead.proxima_acao ?? '')
  const [wantsFollowup, setWantsFollowup] = useState(false)
  const [followup, setFollowup] = useState<FollowupDraft>(() => defaultFollowup())
  const [meeting, setMeeting] = useState({ data: addDays(todayKey(), 1), horario: '', contato: '', observacao: '' })
  const [saving, setSaving] = useState(false)
  /** Retorno sugerido sozinho (some se o resultado mudar) */
  const [autoRetry, setAutoRetry] = useState(false)
  const [encerrar, setEncerrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const options = useMemo(() => (mode === 'call' ? visibleCallResults() : STATUSES.map((s) => s.id)), [mode])
  const needsFollowup = status === 'follow_up'
  const showFollowup = needsFollowup || wantsFollowup
  const needsMeeting = status === 'agendou_reuniao'
  const isPanel = variant === 'panel'

  const semResposta = !!status && SEM_RESPOSTA.includes(status) && mode === 'call'
  const tentativa = previousNoAnswer + 1
  const esgotou = semResposta && tentativa >= settings.max_tentativas

  // Sugestão de retorno conforme o resultado escolhido
  function pick(s: StatusId) {
    setStatus(s)
    setError(null)
    const noAnswer = SEM_RESPOSTA.includes(s) && mode === 'call'
    if (noAnswer && settings.auto_tentativas && previousNoAnswer + 1 < settings.max_tentativas && (!wantsFollowup || autoRetry)) {
      // Nova tentativa automática: dia seguinte, no período oposto ao desta ligação
      const next = nextAttempt(call ? new Date(call.created_at) : new Date())
      const days = Math.round((Date.parse(next.data) - Date.parse(todayKey())) / 86_400_000)
      const preset: DayPreset = days === 1 ? 'amanha' : days === 2 ? '2d' : 'data'
      setFollowup({ preset, data: next.data, timeMode: next.periodo, horario: '' })
      setWantsFollowup(true)
      setAutoRetry(true)
    } else if (!noAnswer && autoRetry) {
      setWantsFollowup(false)
      setAutoRetry(false)
    }
    setEncerrar(noAnswer && previousNoAnswer + 1 >= settings.max_tentativas)
    if (s === 'follow_up' && !wantsFollowup) setFollowup(defaultFollowup('amanha', 'manha'))
    if (noAnswer && !wantsFollowup && !settings.auto_tentativas) setFollowup(defaultFollowup('amanha', 'tarde'))
    if (s === 'agendou_reuniao' && !meeting.contato && falei) setMeeting((m) => ({ ...m, contato: falei }))
  }

  async function save(goNext: boolean) {
    if (!status) {
      setError('Escolha como foi a ligação.')
      return
    }
    if (needsMeeting && !meeting.data) {
      setError('Informe a data da reunião.')
      return
    }
    setSaving(true)
    await saveOutcome({
      leadId: lead.id,
      mode,
      callId,
      status,
      falei_com: falei,
      cargo,
      observacao: obs,
      proxima_acao: isPanel ? proxima : undefined,
      followup: showFollowup && !(esgotou && encerrar)
        ? { ...draftToInput(followup), observacao: obs || (autoRetry ? `Nova tentativa (${ordinal(tentativa + 1)})` : obs) }
        : null,
      meeting: needsMeeting
        ? { data: meeting.data, horario: meeting.horario || null, contato: meeting.contato || falei || null, observacao: meeting.observacao || null }
        : null,
    })
    if (esgotou && encerrar) {
      await saveOutcome({ leadId: lead.id, mode: 'status', status: 'finalizado', observacao: `Encerrado após ${tentativa} tentativas seguidas sem resposta` })
    }
    setSaving(false)
    onSaved(goNext)
    if (status === 'pediu_whatsapp' && whatsappTarget(lead)) {
      toast(`${lead.empresa} pediu WhatsApp.`, 'info', { label: 'Mandar mensagem', run: () => openMessage({ leadId: lead.id, templateId: 'pos_ligacao' }) })
    }
  }

  // Atalhos: 1–0 escolhem o resultado; Ctrl+Enter salva.
  const saveRef = useRef(save)
  saveRef.current = save
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void saveRef.current(isPanel)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return
      const idx = KEYS.indexOf(e.key)
      if (mode === 'call' && idx >= 0 && idx < options.length) {
        e.preventDefault()
        pickRef.current(options[idx])
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mode, options, isPanel])

  const callTime = useMemo(() => (call ? formatDateTime(call.created_at) : null), [call])

  return (
    <div ref={rootRef} className="space-y-4">
      {mode === 'call' && (
        <div className="flex items-center gap-2 rounded-md border border-go/20 bg-go/[0.06] px-3 py-2 text-xs">
          <span className="size-1.5 rounded-full bg-go" />
          {callTime ? (
            <span className="text-fg-2">
              Ligação registrada <span className="num font-medium text-fg">{callTime}</span>
            </span>
          ) : (
            <span className="text-fg-2">A ligação será registrada com data e hora ao salvar.</span>
          )}
          {callId && onDiscardCall && (
            <button onClick={onDiscardCall} className="ml-auto inline-flex items-center gap-1 text-2xs text-fg-3 hover:text-fg">
              <Undo2 className="size-3" /> Desfazer
            </button>
          )}
        </div>
      )}

      {/* Resultado */}
      <div>
        <p className="mb-2 text-xs font-medium text-fg-2">{mode === 'call' ? 'Como foi a ligação?' : 'Novo status'}</p>
        <div className={clsx('grid gap-1.5', isPanel ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          {options.map((id, i) => {
            const def = STATUS_MAP[id]
            const tone = TONE_CLASSES[def.tone]
            const active = status === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className={clsx(
                  'group flex h-9 items-center gap-2 rounded-md border px-2.5 text-left text-xs font-medium transition-colors',
                  active
                    ? clsx('border-transparent ring-1 ring-inset', tone.chip)
                    : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:bg-hover hover:text-fg',
                )}
              >
                <span className={clsx('size-2 shrink-0 rounded-full', tone.dot, !active && 'opacity-70')} />
                <span className="truncate">{mode === 'call' ? def.callLabel : def.label}</span>
                {active ? (
                  <Check className="ml-auto size-3.5 shrink-0" />
                ) : (
                  mode === 'call' && i < KEYS.length && <Kbd className="ml-auto hidden opacity-70 sm:inline-flex">{KEYS[i]}</Kbd>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Reunião */}
      {needsMeeting && (
        <div className="anim-rise space-y-2.5 rounded-lg border border-go/20 bg-go/[0.04] p-3">
          <p className="text-xs font-medium text-fg-2">Detalhes da reunião</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={meeting.data} onChange={(e) => setMeeting({ ...meeting, data: e.target.value })} />
            </div>
            <div>
              <label className="label">Horário</label>
              <input type="time" className="input" value={meeting.horario} onChange={(e) => setMeeting({ ...meeting, horario: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Com quem</label>
            <input className="input" value={meeting.contato} placeholder={falei || 'Nome do contato'} onChange={(e) => setMeeting({ ...meeting, contato: e.target.value })} />
          </div>
          <div>
            <label className="label">Observação da reunião</label>
            <input className="input" value={meeting.observacao} placeholder="Ex.: online, mostrar exemplo de site" onChange={(e) => setMeeting({ ...meeting, observacao: e.target.value })} />
          </div>
        </div>
      )}

      {/* Muitas tentativas sem resposta: sugere encerrar */}
      {esgotou && (
        <label className="anim-rise flex cursor-pointer items-start gap-2.5 rounded-lg border border-orange-400/25 bg-orange-400/[0.05] p-3 text-xs">
          <input type="checkbox" className="mt-0.5 accent-orange-400" checked={encerrar} onChange={(e) => setEncerrar(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-orange-300">
              <Archive className="size-3.5" /> {ordinal(tentativa)} tentativa seguida sem resposta
            </span>
            <span className="mt-0.5 block text-fg-3">Encerrar o lead (vai para Finalizados). Desmarque para continuar tentando.</span>
          </span>
        </label>
      )}

      {/* Follow-up */}
      {showFollowup && !(esgotou && encerrar) ? (
        <div className="anim-rise">
          <FollowupPicker
            value={followup}
            onChange={(v) => {
              setFollowup(v)
              setAutoRetry(false)
            }}
            title={autoRetry ? `Nova tentativa automática (${ordinal(tentativa + 1)} de ${settings.max_tentativas})` : undefined}
          />
          {!needsFollowup && (
            <button
              onClick={() => {
                setWantsFollowup(false)
                setAutoRetry(false)
              }}
              className="mt-1.5 text-2xs text-fg-3 hover:text-fg"
            >
              {autoRetry ? 'Não agendar nova tentativa' : 'Remover retorno'}
            </button>
          )}
        </div>
      ) : esgotou && encerrar ? null : (
        status &&
        !needsMeeting && (
          <button onClick={() => setWantsFollowup(true)} className="inline-flex items-center gap-1.5 text-xs text-sky-300/90 hover:text-sky-200">
            <CalendarClock className="size-3.5" />
            {SEM_RESPOSTA.includes(status) ? 'Agendar nova tentativa' : 'Agendar retorno'}
            <Plus className="size-3" />
          </button>
        )
      )}

      {/* Anotações */}
      <div className="space-y-2.5">
        <div className={clsx('grid gap-2', isPanel ? 'grid-cols-1' : 'grid-cols-2')}>
          <div>
            <label className="label" htmlFor="of-falei">Falei com</label>
            <input id="of-falei" className="input" value={falei} onChange={(e) => setFalei(e.target.value)} placeholder="Nome" autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="of-cargo">Cargo</label>
            <input id="of-cargo" className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: sócio, gerente" autoComplete="off" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="of-obs">Observação</label>
          <textarea
            id="of-obs"
            className="input resize-none"
            rows={isPanel ? 4 : 3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="O que foi conversado, objeções, melhor horário…"
          />
        </div>
        {isPanel && (
          <div>
            <label className="label" htmlFor="of-prox">Próxima ação</label>
            <input id="of-prox" className="input" value={proxima} onChange={(e) => setProxima(e.target.value)} placeholder="Ex.: mandar exemplo no WhatsApp" />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className={clsx('flex items-center gap-2', isPanel ? 'flex-col items-stretch' : 'justify-end')}>
        {isPanel ? (
          <>
            <Button variant="primary" size="lg" loading={saving} onClick={() => save(true)} icon={<SkipForward className="size-4" />}>
              {hasNext ? 'Salvar e próximo lead' : 'Salvar'}
              <Kbd className="ml-1 border-black/20 bg-black/10 text-[#04140c]/70">Ctrl ↵</Kbd>
            </Button>
            {hasNext && (
              <Button variant="ghost" size="sm" onClick={() => save(false)} disabled={saving}>
                Salvar e continuar neste lead
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="mr-auto hidden text-2xs text-fg-4 sm:block">
              {mode === 'call' ? 'Teclas 1–0 escolhem o resultado · ' : ''}Ctrl+Enter salva
            </span>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} title={callId ? 'A ligação continua registrada; o resultado pode ser preenchido depois.' : undefined}>
                {callId ? 'Preencher depois' : 'Cancelar'}
              </Button>
            )}
            <Button variant="primary" loading={saving} onClick={() => save(false)}>
              Salvar
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
