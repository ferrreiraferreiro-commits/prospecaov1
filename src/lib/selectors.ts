import { consecutiveNoAnswer } from './attempts'
import { addDays, isoDateKey, sortTime, todayKey } from './dates'
import { SEM_RESPOSTA, isContato } from './statuses'
import type { Followup, Interaction, Lead, Meeting, StatusId } from './types'

// ---------------------------------------------------------------------------
// Índices
// ---------------------------------------------------------------------------

export interface LeadIndex {
  /** Follow-ups pendentes por lead, ordenados por data/hora */
  followupsByLead: Map<string, Followup[]>
  /** Reuniões por lead, ordenadas por data/hora */
  meetingsByLead: Map<string, Meeting[]>
  /** Ligações por lead (mais recente primeiro) */
  callsByLead: Map<string, Interaction[]>
}

const byWhen = (a: { data: string; horario: string | null; periodo?: Followup['periodo'] }, b: typeof a) =>
  a.data.localeCompare(b.data) || sortTime(a.horario, a.periodo ?? null).localeCompare(sortTime(b.horario, b.periodo ?? null))

export function buildIndex(followups: Followup[], meetings: Meeting[], interactions: Interaction[]): LeadIndex {
  const followupsByLead = new Map<string, Followup[]>()
  for (const f of followups) {
    if (f.concluido) continue
    const list = followupsByLead.get(f.lead_id) ?? []
    list.push(f)
    followupsByLead.set(f.lead_id, list)
  }
  for (const list of followupsByLead.values()) list.sort(byWhen)

  const meetingsByLead = new Map<string, Meeting[]>()
  for (const m of meetings) {
    const list = meetingsByLead.get(m.lead_id) ?? []
    list.push(m)
    meetingsByLead.set(m.lead_id, list)
  }
  for (const list of meetingsByLead.values()) list.sort(byWhen)

  const callsByLead = new Map<string, Interaction[]>()
  for (const i of interactions) {
    if (i.tipo !== 'ligacao') continue
    const list = callsByLead.get(i.lead_id) ?? []
    list.push(i)
    callsByLead.set(i.lead_id, list)
  }
  for (const list of callsByLead.values()) list.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return { followupsByLead, meetingsByLead, callsByLead }
}

// ---------------------------------------------------------------------------
// Próxima ação
// ---------------------------------------------------------------------------

export type NextAction =
  | { kind: 'followup'; followup: Followup; atrasado: boolean }
  | { kind: 'reuniao'; meeting: Meeting }
  | { kind: 'primeira' }
  | { kind: 'tentar'; tentativas: number }
  | { kind: 'texto'; texto: string }
  | { kind: 'nenhuma' }

export function nextAction(lead: Lead, index: LeadIndex, today = todayKey()): NextAction {
  const fu = index.followupsByLead.get(lead.id)?.[0]
  const meeting = index.meetingsByLead.get(lead.id)?.find((m) => m.data >= today)
  if (fu && (!meeting || fu.data <= meeting.data)) return { kind: 'followup', followup: fu, atrasado: fu.data < today }
  if (meeting) return { kind: 'reuniao', meeting }
  if (lead.proxima_acao) return { kind: 'texto', texto: lead.proxima_acao }
  if (lead.status === 'novo') return { kind: 'primeira' }
  if (SEM_RESPOSTA.includes(lead.status)) return { kind: 'tentar', tentativas: index.callsByLead.get(lead.id)?.length ?? 0 }
  return { kind: 'nenhuma' }
}

// ---------------------------------------------------------------------------
// Filtros rápidos
// ---------------------------------------------------------------------------

export type QuickFilter =
  | 'todos'
  | 'novos'
  | 'para_ligar'
  | 'follow_up'
  | 'reuniao'
  | 'sem_resposta'
  | 'nao_interessados'
  | 'finalizados'
  | 'duplicados'

export const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'novos', label: 'Novos' },
  { id: 'para_ligar', label: 'Para ligar' },
  { id: 'follow_up', label: 'Retornos' },
  { id: 'reuniao', label: 'Reunião' },
  { id: 'sem_resposta', label: 'Sem resposta' },
  { id: 'nao_interessados', label: 'Não interessados' },
  { id: 'finalizados', label: 'Finalizados' },
]

const FINAL_STATUSES: StatusId[] = ['finalizado', 'numero_incorreto']

export function matchesQuick(
  filter: QuickFilter,
  lead: Lead,
  index: LeadIndex,
  dupIds: Set<string>,
  today = todayKey(),
): boolean {
  switch (filter) {
    case 'todos':
      return true
    case 'novos':
      return lead.status === 'novo'
    case 'para_ligar': {
      const fu = index.followupsByLead.get(lead.id)?.[0]
      if (fu && fu.data <= today) return true
      return lead.status === 'novo' || SEM_RESPOSTA.includes(lead.status)
    }
    case 'follow_up':
      return index.followupsByLead.has(lead.id) || lead.status === 'follow_up'
    case 'reuniao':
      return lead.status === 'agendou_reuniao' || index.meetingsByLead.has(lead.id)
    case 'sem_resposta':
      return SEM_RESPOSTA.includes(lead.status)
    case 'nao_interessados':
      return lead.status === 'nao_tem_interesse'
    case 'finalizados':
      return FINAL_STATUSES.includes(lead.status)
    case 'duplicados':
      return dupIds.has(lead.id)
  }
}

export interface AdvancedFilters {
  whatsapp: boolean
  instagram: boolean
  site: 'todos' | 'com' | 'sem'
  cidade: string
  nicho: string
  pasta: string
  avaliacaoMin: number
  /** Status 2 exato; '__vazio__' = sem Status 2 */
  status2: string
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  whatsapp: false,
  instagram: false,
  site: 'todos',
  cidade: '',
  nicho: '',
  pasta: '',
  avaliacaoMin: 0,
  status2: '',
}

export function countAdvanced(f: AdvancedFilters): number {
  return (
    (f.whatsapp ? 1 : 0) +
    (f.instagram ? 1 : 0) +
    (f.site !== 'todos' ? 1 : 0) +
    (f.cidade ? 1 : 0) +
    (f.nicho ? 1 : 0) +
    (f.pasta ? 1 : 0) +
    (f.avaliacaoMin > 0 ? 1 : 0) +
    (f.status2 ? 1 : 0)
  )
}

export function matchesAdvanced(lead: Lead, f: AdvancedFilters): boolean {
  if (f.whatsapp && !lead.whatsapp) return false
  if (f.instagram && !lead.instagram) return false
  if (f.site === 'com' && !lead.website) return false
  if (f.site === 'sem' && lead.website) return false
  if (f.cidade && lead.cidade !== f.cidade) return false
  if (f.nicho && lead.nicho !== f.nicho) return false
  if (f.pasta && lead.pasta !== f.pasta) return false
  if (f.avaliacaoMin > 0 && (lead.avaliacao ?? 0) < f.avaliacaoMin) return false
  if (f.status2 === '__vazio__' && lead.status2) return false
  if (f.status2 && f.status2 !== '__vazio__' && lead.status2 !== f.status2) return false
  return true
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function matchesSearch(lead: Lead, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  const qDigits = q.replace(/\D/g, '')
  const hay = fold(
    [lead.empresa, lead.nicho, lead.cidade, lead.estado, lead.endereco, lead.instagram, lead.website, lead.falei_com, lead.pasta]
      .filter(Boolean)
      .join(' '),
  )
  if (hay.includes(q)) return true
  if (qDigits.length >= 3) {
    const phones = `${lead.telefone ?? ''} ${lead.whatsapp ?? ''}`.replace(/\D/g, '')
    if (phones.includes(qDigits)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Oportunidade: sem site + bem avaliado + muitas avaliações = cliente ideal
// ---------------------------------------------------------------------------

/** Pontos de oportunidade (0–8). Só usa dados do arquivo. */
export function opportunityScore(lead: Pick<Lead, 'website' | 'avaliacao' | 'numero_avaliacoes'>): number {
  let s = lead.website ? 0 : 3
  const nota = lead.avaliacao
  if (nota !== null) s += nota >= 4.5 ? 2 : nota >= 4 ? 1 : nota < 3.5 ? -1 : 0
  const n = lead.numero_avaliacoes ?? 0
  s += n >= 100 ? 3 : n >= 30 ? 2 : n >= 10 ? 1 : 0
  return Math.max(0, s)
}

/** A partir daqui o lead ganha a etiqueta "Alto potencial" (ex.: sem site, nota 4,5+ e 30+ avaliações). */
export const HOT_SCORE = 7

export function isHot(lead: Pick<Lead, 'website' | 'avaliacao' | 'numero_avaliacoes'>): boolean {
  return opportunityScore(lead) >= HOT_SCORE
}

export type SortKey = 'importacao' | 'prioridade' | 'oportunidade' | 'ultima_ligacao' | 'avaliacao' | 'empresa'

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'prioridade', label: 'Prioridade' },
  { id: 'oportunidade', label: 'Oportunidade (sem site + bem avaliado)' },
  { id: 'importacao', label: 'Ordem de importação' },
  { id: 'ultima_ligacao', label: 'Última ligação' },
  { id: 'avaliacao', label: 'Avaliação Google' },
  { id: 'empresa', label: 'Empresa (A–Z)' },
]

/** Menor = mais urgente. */
export function priorityRank(lead: Lead, index: LeadIndex, today = todayKey()): number {
  const fu = index.followupsByLead.get(lead.id)?.[0]
  if (fu && fu.data < today) return 0
  if (fu && fu.data === today) return 1
  if (lead.status === 'novo') return 3
  if (SEM_RESPOSTA.includes(lead.status)) {
    return lead.ultima_ligacao && isoDateKey(lead.ultima_ligacao) === today ? 5 : 2
  }
  if (lead.status === 'cliente_potencial' || lead.status === 'falei_responsavel' || lead.status === 'pediu_whatsapp') return 4
  if (fu) return 6
  return 9
}

export function sortLeads(leads: Lead[], key: SortKey, index: LeadIndex, today = todayKey()): Lead[] {
  const arr = [...leads]
  const importOrder = (a: Lead, b: Lead) => a.created_at.localeCompare(b.created_at)
  switch (key) {
    case 'importacao':
      return arr.sort(importOrder)
    case 'prioridade':
      // Mesmo nível de urgência: o lead com mais cara de cliente vem antes.
      return arr.sort(
        (a, b) => priorityRank(a, index, today) - priorityRank(b, index, today) || opportunityScore(b) - opportunityScore(a) || importOrder(a, b),
      )
    case 'oportunidade':
      return arr.sort((a, b) => opportunityScore(b) - opportunityScore(a) || importOrder(a, b))
    case 'ultima_ligacao':
      return arr.sort((a, b) => (b.ultima_ligacao ?? '').localeCompare(a.ultima_ligacao ?? '') || importOrder(a, b))
    case 'avaliacao':
      return arr.sort(
        (a, b) => (b.avaliacao ?? -1) - (a.avaliacao ?? -1) || (b.numero_avaliacoes ?? 0) - (a.numero_avaliacoes ?? 0),
      )
    case 'empresa':
      return arr.sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'))
  }
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export interface DayCount {
  ligacoes: number
  atenderam: number
  reunioes: number
}

export interface Metrics {
  totalLeads: number
  trabalhados: number
  naoTrabalhados: number
  ligacoes: number
  atenderam: number
  reunioes: number
  followupsPendentes: number
  followupsHoje: number
  naoInteressados: number
  numerosIncorretos: number
  hoje: DayCount
  ontem: DayCount
  taxaContato: number | null
  taxaReuniao: number | null
  porStatus: Record<StatusId, number>
}

export function computeMetrics(
  leads: Lead[],
  interactions: Interaction[],
  followups: Followup[],
  meetings: Meeting[],
  today = todayKey(),
  /** ISO: só conta ligações/reuniões a partir daqui ("Zerar contadores") */
  since: string | null = null,
): Metrics {
  const yesterday = addDays(today, -1)
  const hoje: DayCount = { ligacoes: 0, atenderam: 0, reunioes: 0 }
  const ontem: DayCount = { ligacoes: 0, atenderam: 0, reunioes: 0 }
  let ligacoes = 0
  let atenderam = 0
  const calledLeads = new Set<string>()

  const counted = (iso: string) => !since || iso >= since
  for (const i of interactions) {
    if (i.tipo !== 'ligacao' || !counted(i.created_at)) continue
    ligacoes++
    calledLeads.add(i.lead_id)
    const contato = isContato(i.status)
    if (contato) atenderam++
    const day = isoDateKey(i.created_at)
    const bucket = day === today ? hoje : day === yesterday ? ontem : null
    if (bucket) {
      bucket.ligacoes++
      if (contato) bucket.atenderam++
    }
  }

  const countedMeetings = meetings.filter((m) => counted(m.created_at))
  for (const m of countedMeetings) {
    const day = isoDateKey(m.created_at)
    if (day === today) hoje.reunioes++
    else if (day === yesterday) ontem.reunioes++
  }

  const porStatus = {} as Record<StatusId, number>
  let trabalhados = 0
  for (const l of leads) {
    porStatus[l.status] = (porStatus[l.status] ?? 0) + 1
    if (l.status !== 'novo' || calledLeads.has(l.id)) trabalhados++
  }

  const pending = followups.filter((f) => !f.concluido)

  return {
    totalLeads: leads.length,
    trabalhados,
    naoTrabalhados: leads.length - trabalhados,
    ligacoes,
    atenderam,
    reunioes: countedMeetings.length,
    followupsPendentes: pending.length,
    followupsHoje: pending.filter((f) => f.data <= today).length,
    naoInteressados: porStatus.nao_tem_interesse ?? 0,
    numerosIncorretos: porStatus.numero_incorreto ?? 0,
    hoje,
    ontem,
    taxaContato: ligacoes ? atenderam / ligacoes : null,
    taxaReuniao: atenderam ? countedMeetings.length / atenderam : null,
    porStatus,
  }
}

/** Ligações por dia nos últimos N dias (mais antigo → hoje). */
export function callsPerDay(interactions: Interaction[], days: number, today = todayKey(), since: string | null = null) {
  const keys = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))
  const counts = new Map(keys.map((k) => [k, { ligacoes: 0, atenderam: 0 }]))
  for (const i of interactions) {
    if (i.tipo !== 'ligacao' || (since && i.created_at < since)) continue
    const c = counts.get(isoDateKey(i.created_at))
    if (!c) continue
    c.ligacoes++
    if (isContato(i.status)) c.atenderam++
  }
  return keys.map((k) => ({ data: k, ...counts.get(k)! }))
}

// ---------------------------------------------------------------------------
// Tela Hoje
// ---------------------------------------------------------------------------

export interface TodayPlan {
  followups: { lead: Lead; followup: Followup; atrasado: boolean }[]
  reunioesHoje: { lead: Lead; meeting: Meeting }[]
  proximasReunioes: { lead: Lead; meeting: Meeting }[]
  tentarNovamente: { lead: Lead; tentativas: number; ultima: string | null }[]
  /** Muitas tentativas seguidas sem resposta: sugerir encerrar em vez de ligar de novo */
  esgotados: { lead: Lead; tentativas: number; ultima: string | null }[]
  novos: Lead[]
  feitasHoje: { lead: Lead; call: Interaction }[]
}

export function buildTodayPlan(
  leads: Lead[],
  interactions: Interaction[],
  index: LeadIndex,
  meetings: Meeting[],
  today = todayKey(),
  /** Tentativas seguidas sem resposta a partir das quais o lead sai da fila */
  maxTentativas = Infinity,
): TodayPlan {
  const byId = new Map(leads.map((l) => [l.id, l]))
  const followups: TodayPlan['followups'] = []
  for (const [leadId, list] of index.followupsByLead) {
    const lead = byId.get(leadId)
    const fu = list[0]
    if (lead && fu.data <= today) followups.push({ lead, followup: fu, atrasado: fu.data < today })
  }
  followups.sort((a, b) => byWhen(a.followup, b.followup))

  const reunioesHoje: TodayPlan['reunioesHoje'] = []
  const proximasReunioes: TodayPlan['proximasReunioes'] = []
  const limit = addDays(today, 7)
  for (const m of [...meetings].sort(byWhen)) {
    const lead = byId.get(m.lead_id)
    if (!lead) continue
    if (m.data === today) reunioesHoje.push({ lead, meeting: m })
    else if (m.data > today && m.data <= limit) proximasReunioes.push({ lead, meeting: m })
  }

  const withFollowupToday = new Set(followups.map((f) => f.lead.id))
  const tentarNovamente: TodayPlan['tentarNovamente'] = []
  const esgotados: TodayPlan['esgotados'] = []
  const novos: Lead[] = []
  for (const lead of leads) {
    if (withFollowupToday.has(lead.id)) continue
    if (index.followupsByLead.has(lead.id)) continue // retorno já agendado para outro dia
    const ultima = lead.ultima_ligacao
    if (ultima && isoDateKey(ultima) === today) continue // já ligou hoje → está em "Feitas hoje"
    if (lead.status === 'novo') novos.push(lead)
    else if (SEM_RESPOSTA.includes(lead.status)) {
      const calls = index.callsByLead.get(lead.id) ?? []
      const item = { lead, tentativas: calls.length, ultima }
      if (consecutiveNoAnswer(calls) >= maxTentativas) esgotados.push(item)
      else tentarNovamente.push(item)
    }
  }
  novos.sort((a, b) => opportunityScore(b) - opportunityScore(a) || a.created_at.localeCompare(b.created_at))
  tentarNovamente.sort(
    (a, b) => a.tentativas - b.tentativas || opportunityScore(b.lead) - opportunityScore(a.lead) || (a.ultima ?? '').localeCompare(b.ultima ?? ''),
  )
  esgotados.sort((a, b) => b.tentativas - a.tentativas)

  const feitasHoje: TodayPlan['feitasHoje'] = []
  for (const i of interactions) {
    if (i.tipo !== 'ligacao' || isoDateKey(i.created_at) !== today) continue
    const lead = byId.get(i.lead_id)
    if (lead) feitasHoje.push({ lead, call: i })
  }
  feitasHoje.sort((a, b) => b.call.created_at.localeCompare(a.call.created_at))

  return { followups, reunioesHoje, proximasReunioes, tentarNovamente, esgotados, novos, feitasHoje }
}

/** Ordem da fila de ligações do dia: retornos → tentar novamente → novos. */
export function todayQueue(plan: TodayPlan): string[] {
  return [
    ...plan.followups.map((f) => f.lead.id),
    ...plan.tentarNovamente.map((t) => t.lead.id),
    ...plan.novos.map((l) => l.id),
  ]
}

// ---------------------------------------------------------------------------
// Comparação de roteiros
// ---------------------------------------------------------------------------

export interface RoteiroStats {
  roteiroId: string
  ligacoes: number
  atenderam: number
  reunioes: number
  taxaContato: number | null
  taxaReuniao: number | null
}

/** Ligações agrupadas pelo roteiro ativo no momento da ligação. Sem roteiro registrado → `fallbackId`. */
export function statsByRoteiro(interactions: Interaction[], fallbackId: string, since: string | null = null): RoteiroStats[] {
  const map = new Map<string, RoteiroStats>()
  for (const i of interactions) {
    if (i.tipo !== 'ligacao' || (since && i.created_at < since)) continue
    const id = i.roteiro_id ?? fallbackId
    const r = map.get(id) ?? { roteiroId: id, ligacoes: 0, atenderam: 0, reunioes: 0, taxaContato: null, taxaReuniao: null }
    r.ligacoes++
    if (isContato(i.status)) r.atenderam++
    if (i.status === 'agendou_reuniao') r.reunioes++
    map.set(id, r)
  }
  return [...map.values()].map((r) => ({
    ...r,
    taxaContato: r.ligacoes ? r.atenderam / r.ligacoes : null,
    taxaReuniao: r.atenderam ? r.reunioes / r.atenderam : null,
  }))
}
