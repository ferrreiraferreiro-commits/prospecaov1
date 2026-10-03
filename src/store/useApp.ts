import { create } from 'zustand'
import { newId, nowIso, type Repository } from '../data/repository'
import { formatDateKey, periodoLabel } from '../lib/dates'
import { getActiveRoteiro } from '../lib/script'
import type { ParsedLead } from '../lib/parser'
import { EMPTY_ADVANCED, type AdvancedFilters, type QuickFilter, type SortKey } from '../lib/selectors'
import { STATUS_MAP } from '../lib/statuses'
import { formatCnpj } from '../lib/cnpj'
import { formatMoney, MEETING_RESULT_LABEL } from '../lib/insights'
import {
  DEFAULT_SETTINGS,
  type CnpjInfo,
  type MeetingResultado,
  type Followup,
  type ImportRecord,
  type Interaction,
  type Lead,
  type Meeting,
  type Periodo,
  type Settings,
  type Snapshot,
  type StatusId,
} from '../lib/types'

export interface Toast {
  id: string
  tone: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; run: () => void }
}

export interface FollowupInput {
  data: string
  horario: string | null
  periodo: Periodo | null
  observacao?: string | null
}

export interface MeetingInput {
  data: string
  horario: string | null
  contato: string | null
  observacao: string | null
}

export interface OutcomeInput {
  leadId: string
  /** 'call' registra uma ligação; 'status' só muda o status. */
  mode: 'call' | 'status'
  /** Ligação já registrada pelo botão "Liguei" (será atualizada, não duplicada). */
  callId?: string | null
  status: StatusId
  falei_com?: string | null
  cargo?: string | null
  observacao?: string | null
  proxima_acao?: string | null
  followup?: FollowupInput | null
  meeting?: MeetingInput | null
}

export interface CentralView {
  quick: QuickFilter
  search: string
  advanced: AdvancedFilters
  sort: SortKey
}

interface AppState extends Snapshot {
  repo: Repository | null
  ready: boolean
  loadError: string | null
  toasts: Toast[]
  queue: { ids: string[]; label: string }
  central: CentralView

  init(repo: Repository): Promise<void>
  toast(message: string, tone?: Toast['tone'], action?: Toast['action']): void
  dismissToast(id: string): void
  setQueue(ids: string[], label: string): void
  setCentral(patch: Partial<CentralView>): void

  importLeads(parsed: ParsedLead[], arquivo: string): Promise<number>
  registerCall(leadId: string): Promise<Interaction>
  discardCall(callId: string): Promise<void>
  saveOutcome(input: OutcomeInput): Promise<void>
  setStatus2(leadId: string, value: string | null): Promise<void>
  updateLeadWork(leadId: string, patch: Partial<Pick<Lead, 'falei_com' | 'cargo' | 'anotacoes' | 'proxima_acao'>>): Promise<void>
  addNote(leadId: string, text: string): Promise<void>
  scheduleFollowup(leadId: string, input: FollowupInput): Promise<void>
  completeFollowup(id: string): Promise<void>
  deleteFollowup(id: string): Promise<void>
  deleteMeeting(id: string): Promise<void>
  /** Mensagem de WhatsApp aberta para envio (fica no histórico). Marca Status 2 se estiver vazio. */
  logMessage(leadId: string, text: string, modelo?: string | null): Promise<void>
  setMeetingResult(meetingId: string, resultado: MeetingResultado | null, valor?: number | null): Promise<void>
  saveCnpj(leadId: string, cnpj: string | null, info: CnpjInfo | null): Promise<void>
  ignoreDuplicate(leadIds: string[]): Promise<void>
  deleteLeads(ids: string[]): Promise<void>
  saveSettings(settings: Settings): Promise<void>
  restoreBackup(snapshot: Snapshot): Promise<void>
}

/** Janela em que um segundo clique em "Liguei"/"Ligar" não cria outra ligação. */
const DOUBLE_CLICK_MS = 10_000

function followupText(f: FollowupInput): string {
  const when = f.horario ?? (f.periodo ? periodoLabel(f.periodo).toLowerCase() : '')
  return `Retorno agendado para ${formatDateKey(f.data)}${when ? ` • ${when}` : ''}`
}

export const useApp = create<AppState>()((set, get) => {
  /** Executa a persistência; se falhar, avisa e recarrega o estado verdadeiro do banco. */
  async function persist(work: (repo: Repository) => Promise<void>) {
    const repo = get().repo
    if (!repo) return
    try {
      await work(repo)
    } catch (err) {
      console.error(err)
      get().toast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error')
      try {
        const snap = await repo.load()
        set({ ...snap })
      } catch {
        /* mantém o estado atual */
      }
    }
  }

  function patchLead(id: string, patch: Partial<Lead>) {
    set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  }

  return {
    leads: [],
    interactions: [],
    followups: [],
    meetings: [],
    imports: [],
    settings: { ...DEFAULT_SETTINGS },
    repo: null,
    ready: false,
    loadError: null,
    toasts: [],
    queue: { ids: [], label: '' },
    central: { quick: 'todos', search: '', advanced: { ...EMPTY_ADVANCED }, sort: 'prioridade' },

    async init(repo) {
      set({ repo, ready: false, loadError: null })
      try {
        const snap = await repo.load()
        set({ ...snap, ready: true })
      } catch (err) {
        set({ loadError: err instanceof Error ? err.message : String(err), ready: true })
      }
    },

    toast(message, tone = 'success', action) {
      if (get().toasts.some((t) => t.message === message)) return // evita aviso repetido (clique duplo)
      const id = newId()
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone, action }] }))
      setTimeout(() => get().dismissToast(id), action ? 6500 : 3800)
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },

    setQueue(ids, label) {
      set({ queue: { ids, label } })
    },

    setCentral(patch) {
      set((s) => ({ central: { ...s.central, ...patch } }))
    },

    async importLeads(parsed, arquivo) {
      const now = Date.now()
      const record: ImportRecord = { id: newId(), arquivo, quantidade_leads: parsed.length, data_importacao: new Date(now).toISOString() }
      // created_at escalonado em 1ms preserva a ordem do arquivo
      const leads: Lead[] = parsed.map((p, i) => {
        const ts = new Date(now + i).toISOString()
        return {
          id: newId(),
          empresa: p.empresa,
          nicho: p.nicho,
          telefone: p.telefone,
          whatsapp: p.whatsapp,
          instagram: p.instagram,
          website: p.website,
          endereco: p.endereco,
          cidade: p.cidade,
          estado: p.estado,
          avaliacao: p.avaliacao,
          numero_avaliacoes: p.numero_avaliacoes,
          pasta: p.pasta,
          etapa: p.etapa,
          maps_url: p.maps_url,
          observacoes: p.observacoes,
          dados_extras: p.dados_extras,
          cnpj: p.cnpj ?? null,
          import_id: record.id,
          status: p.status,
          falei_com: null,
          cargo: null,
          anotacoes: null,
          proxima_acao: null,
          ultima_ligacao: null,
          duplicado_ignorado: false,
          created_at: ts,
          updated_at: ts,
        }
      })
      const repo = get().repo
      if (!repo) throw new Error('Armazenamento não inicializado.')
      await repo.insertImport(record)
      await repo.insertLeads(leads)
      set((s) => ({ imports: [...s.imports, record], leads: [...s.leads, ...leads] }))
      return leads.length
    },

    async registerCall(leadId) {
      // Clique duplo acidental: reaproveita a ligação sem resultado criada há poucos segundos.
      const recent = get().interactions.find(
        (i) => i.lead_id === leadId && i.tipo === 'ligacao' && i.status === null && Date.now() - Date.parse(i.created_at) < DOUBLE_CLICK_MS,
      )
      if (recent) return recent
      const call: Interaction = {
        id: newId(),
        lead_id: leadId,
        tipo: 'ligacao',
        status: null,
        falei_com: null,
        cargo: null,
        observacao: null,
        roteiro_id: getActiveRoteiro(get().settings).id,
        created_at: nowIso(),
      }
      set((s) => ({ interactions: [...s.interactions, call] }))
      patchLead(leadId, { ultima_ligacao: call.created_at, updated_at: call.created_at })
      await persist(async (repo) => {
        await repo.insertInteractions([call])
        await repo.updateLead(leadId, { ultima_ligacao: call.created_at })
      })
      return call
    },

    async discardCall(callId) {
      const call = get().interactions.find((i) => i.id === callId)
      if (!call) return
      const remaining = get().interactions.filter((i) => i.id !== callId)
      const previous = remaining
        .filter((i) => i.lead_id === call.lead_id && i.tipo === 'ligacao')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      const ultima = previous?.created_at ?? null
      set({ interactions: remaining })
      patchLead(call.lead_id, { ultima_ligacao: ultima })
      await persist(async (repo) => {
        await repo.deleteInteraction(callId)
        await repo.updateLead(call.lead_id, { ultima_ligacao: ultima })
      })
    },

    async saveOutcome(input) {
      const now = nowIso()
      const lead = get().leads.find((l) => l.id === input.leadId)
      if (!lead) return
      const falei = input.falei_com?.trim() || null
      const cargo = input.cargo?.trim() || null
      const obs = input.observacao?.trim() || null

      const newInteractions: Interaction[] = []
      let updatedCall: { id: string; patch: Partial<Interaction> } | null = null

      if (input.mode === 'call') {
        const patch = { status: input.status, falei_com: falei, cargo, observacao: obs }
        const existing = input.callId ? get().interactions.find((i) => i.id === input.callId) : null
        if (existing) updatedCall = { id: existing.id, patch }
        else newInteractions.push({ id: newId(), lead_id: lead.id, tipo: 'ligacao', roteiro_id: getActiveRoteiro(get().settings).id, created_at: now, ...patch })
      } else if (input.status !== lead.status) {
        newInteractions.push({
          id: newId(),
          lead_id: lead.id,
          tipo: 'status',
          status: input.status,
          falei_com: falei,
          cargo,
          observacao: obs ?? `${STATUS_MAP[lead.status].label} → ${STATUS_MAP[input.status].label}`,
          created_at: now,
        })
      } else if (obs) {
        newInteractions.push({ id: newId(), lead_id: lead.id, tipo: 'nota', status: null, falei_com: falei, cargo, observacao: obs, created_at: now })
      }

      // Ligar para o lead conclui os retornos pendentes dele.
      const concludeIds =
        input.mode === 'call' ? get().followups.filter((f) => f.lead_id === lead.id && !f.concluido).map((f) => f.id) : []

      let followup: Followup | null = null
      if (input.followup) {
        followup = {
          id: newId(),
          lead_id: lead.id,
          data: input.followup.data,
          horario: input.followup.horario,
          periodo: input.followup.periodo,
          observacao: input.followup.observacao?.trim() || obs,
          concluido: false,
          created_at: now,
        }
        newInteractions.push({
          id: newId(),
          lead_id: lead.id,
          tipo: 'followup',
          status: null,
          falei_com: null,
          cargo: null,
          observacao: followupText(input.followup),
          created_at: new Date(Date.parse(now) + 1).toISOString(),
        })
      }

      let meeting: Meeting | null = null
      if (input.meeting) {
        meeting = {
          id: newId(),
          lead_id: lead.id,
          data: input.meeting.data,
          horario: input.meeting.horario,
          contato: input.meeting.contato?.trim() || falei,
          observacao: input.meeting.observacao?.trim() || null,
          created_at: now,
        }
        newInteractions.push({
          id: newId(),
          lead_id: lead.id,
          tipo: 'reuniao',
          status: null,
          falei_com: meeting.contato,
          cargo: null,
          observacao: `Reunião marcada para ${formatDateKey(meeting.data)}${meeting.horario ? ` • ${meeting.horario}` : ''}${meeting.observacao ? ` — ${meeting.observacao}` : ''}`,
          created_at: new Date(Date.parse(now) + 2).toISOString(),
        })
      }

      const leadPatch: Partial<Lead> = { status: input.status, updated_at: now }
      if (input.mode === 'call' && !updatedCall) leadPatch.ultima_ligacao = now
      if (falei) leadPatch.falei_com = falei
      if (cargo) leadPatch.cargo = cargo
      if (input.proxima_acao !== undefined) leadPatch.proxima_acao = input.proxima_acao?.trim() || null

      const concludeSet = new Set(concludeIds)
      set((s) => ({
        interactions: [
          ...s.interactions.map((i) => (updatedCall && i.id === updatedCall.id ? { ...i, ...updatedCall.patch } : i)),
          ...newInteractions,
        ],
        followups: [...s.followups.map((f) => (concludeSet.has(f.id) ? { ...f, concluido: true } : f)), ...(followup ? [followup] : [])],
        meetings: meeting ? [...s.meetings, meeting] : s.meetings,
        leads: s.leads.map((l) => (l.id === lead.id ? { ...l, ...leadPatch } : l)),
      }))

      await persist(async (repo) => {
        if (updatedCall) await repo.updateInteraction(updatedCall.id, updatedCall.patch)
        await repo.insertInteractions(newInteractions)
        if (concludeIds.length) await repo.updateFollowups(concludeIds, { concluido: true })
        if (followup) await repo.insertFollowup(followup)
        if (meeting) await repo.insertMeeting(meeting)
        const { updated_at: _u, ...dbPatch } = leadPatch
        await repo.updateLead(lead.id, dbPatch)
      })
    },

    async setStatus2(leadId, value) {
      const lead = get().leads.find((l) => l.id === leadId)
      const next = value?.trim() || null
      if (!lead || (lead.status2 ?? null) === next) return
      const now = nowIso()
      const log: Interaction = {
        id: newId(),
        lead_id: leadId,
        tipo: 'status2',
        status: null,
        falei_com: null,
        cargo: null,
        observacao: next ? `Status 2: ${next}` : `Status 2 removido (era “${lead.status2}”)`,
        created_at: now,
      }
      patchLead(leadId, { status2: next, updated_at: now })
      set((s) => ({ interactions: [...s.interactions, log] }))
      await persist(async (repo) => {
        await repo.updateLead(leadId, { status2: next })
        await repo.insertInteractions([log])
      })
    },

    async updateLeadWork(leadId, patch) {
      const clean = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
      ) as Partial<Lead>
      patchLead(leadId, clean)
      await persist((repo) => repo.updateLead(leadId, clean))
    },

    async addNote(leadId, text) {
      const note: Interaction = {
        id: newId(),
        lead_id: leadId,
        tipo: 'nota',
        status: null,
        falei_com: null,
        cargo: null,
        observacao: text.trim(),
        created_at: nowIso(),
      }
      if (!note.observacao) return
      set((s) => ({ interactions: [...s.interactions, note] }))
      await persist((repo) => repo.insertInteractions([note]))
    },

    async scheduleFollowup(leadId, input) {
      const now = nowIso()
      const fu: Followup = {
        id: newId(),
        lead_id: leadId,
        data: input.data,
        horario: input.horario,
        periodo: input.periodo,
        observacao: input.observacao?.trim() || null,
        concluido: false,
        created_at: now,
      }
      const log: Interaction = {
        id: newId(),
        lead_id: leadId,
        tipo: 'followup',
        status: null,
        falei_com: null,
        cargo: null,
        observacao: followupText(input),
        created_at: now,
      }
      set((s) => ({ followups: [...s.followups, fu], interactions: [...s.interactions, log] }))
      await persist(async (repo) => {
        await repo.insertFollowup(fu)
        await repo.insertInteractions([log])
      })
    },

    async completeFollowup(id) {
      set((s) => ({ followups: s.followups.map((f) => (f.id === id ? { ...f, concluido: true } : f)) }))
      await persist((repo) => repo.updateFollowups([id], { concluido: true }))
    },

    async deleteFollowup(id) {
      set((s) => ({ followups: s.followups.filter((f) => f.id !== id) }))
      await persist((repo) => repo.deleteFollowup(id))
    },

    async deleteMeeting(id) {
      set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) }))
      await persist((repo) => repo.deleteMeeting(id))
    },

    async logMessage(leadId, text, modelo) {
      const lead = get().leads.find((l) => l.id === leadId)
      if (!lead) return
      const now = nowIso()
      const log: Interaction = {
        id: newId(),
        lead_id: leadId,
        tipo: 'mensagem',
        status: null,
        falei_com: null,
        cargo: null,
        observacao: modelo ? `[${modelo}] ${text.trim()}` : text.trim(),
        created_at: now,
      }
      set((s) => ({ interactions: [...s.interactions, log] }))
      await persist((repo) => repo.insertInteractions([log]))
      if (!lead.status2) await get().setStatus2(leadId, 'Mensagem enviada')
    },

    async setMeetingResult(meetingId, resultado, valor = null) {
      const meeting = get().meetings.find((m) => m.id === meetingId)
      if (!meeting) return
      const now = nowIso()
      const patch: Partial<Meeting> = {
        resultado,
        valor: resultado === 'fechou' && valor && valor > 0 ? valor : null,
        resultado_em: resultado ? now : null,
      }
      const texto = resultado
        ? `Reunião de ${formatDateKey(meeting.data)}: ${MEETING_RESULT_LABEL[resultado].toLowerCase()}${patch.valor ? ` · ${formatMoney(patch.valor)}` : ''}`
        : `Resultado da reunião de ${formatDateKey(meeting.data)} removido`
      const log: Interaction = { id: newId(), lead_id: meeting.lead_id, tipo: 'reuniao', status: null, falei_com: meeting.contato, cargo: null, observacao: texto, created_at: now }
      set((s) => ({
        meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, ...patch } : m)),
        interactions: [...s.interactions, log],
      }))
      await persist(async (repo) => {
        await repo.updateMeeting(meetingId, patch)
        await repo.insertInteractions([log])
      })
      // Fechou / não fechou também aparece no Status 2 do lead
      if (resultado === 'fechou') await get().setStatus2(meeting.lead_id, 'Fechado')
      if (resultado === 'perdeu') await get().setStatus2(meeting.lead_id, 'Perdido')
    },

    async saveCnpj(leadId, cnpj, info) {
      const patch: Partial<Lead> = { cnpj, cnpj_info: info }
      patchLead(leadId, patch)
      const nome = info?.nome_fantasia || info?.razao_social
      const log: Interaction | null =
        cnpj && info
          ? {
              id: newId(),
              lead_id: leadId,
              tipo: 'nota',
              status: null,
              falei_com: null,
              cargo: null,
              observacao: `CNPJ ${formatCnpj(cnpj)} consultado${nome ? ` · ${nome}` : ''}${info.confere ? '' : ' (dados não conferem com o lead — revisar)'}`,
              created_at: nowIso(),
            }
          : null
      if (log) set((s) => ({ interactions: [...s.interactions, log] }))
      await persist(async (repo) => {
        await repo.updateLead(leadId, patch)
        if (log) await repo.insertInteractions([log])
      })
    },

    async ignoreDuplicate(leadIds) {
      const ids = new Set(leadIds)
      set((s) => ({ leads: s.leads.map((l) => (ids.has(l.id) ? { ...l, duplicado_ignorado: true } : l)) }))
      await persist(async (repo) => {
        for (const id of leadIds) await repo.updateLead(id, { duplicado_ignorado: true })
      })
    },

    async deleteLeads(ids) {
      const set_ = new Set(ids)
      set((s) => ({
        leads: s.leads.filter((l) => !set_.has(l.id)),
        interactions: s.interactions.filter((x) => !set_.has(x.lead_id)),
        followups: s.followups.filter((x) => !set_.has(x.lead_id)),
        meetings: s.meetings.filter((x) => !set_.has(x.lead_id)),
        queue: { ...s.queue, ids: s.queue.ids.filter((id) => !set_.has(id)) },
      }))
      await persist((repo) => repo.deleteLeads(ids))
    },

    async saveSettings(settings) {
      set({ settings })
      await persist((repo) => repo.saveSettings(settings))
    },

    async restoreBackup(snapshot) {
      const repo = get().repo
      if (!repo) return
      await repo.replaceAll(snapshot)
      set({ ...snapshot, settings: { ...DEFAULT_SETTINGS, ...snapshot.settings } })
    },
  }
})

export function exportSnapshot(): Snapshot {
  const { leads, interactions, followups, meetings, imports, settings } = useApp.getState()
  return { leads, interactions, followups, meetings, imports, settings }
}
