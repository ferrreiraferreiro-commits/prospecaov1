import { whatsappTarget } from './contact'
import { isoDateKey, todayKey } from './dates'
import { SEM_RESPOSTA } from './statuses'
import { opportunityScore } from './selectors'
import type { Interaction, Lead, StatusId } from './types'

export type Publico = 'pediu_whatsapp' | 'novos' | 'sem_resposta' | 'interessados' | 'todos'

export const PUBLICOS: { id: Publico; label: string; hint: string }[] = [
  { id: 'pediu_whatsapp', label: 'Pediram WhatsApp', hint: 'Status “Pediu WhatsApp”' },
  { id: 'sem_resposta', label: 'Não atenderam', hint: 'Só chama, não atendeu, não completou' },
  { id: 'novos', label: 'Novos', hint: 'Ainda não trabalhados' },
  { id: 'interessados', label: 'Conversaram', hint: 'Falei com responsável, retorno, cliente potencial' },
  { id: 'todos', label: 'Todos', hint: 'Qualquer status, menos os encerrados' },
]

/** Nunca recebem disparo: pediram para não, número errado ou já encerrados. */
export const BLOQUEADOS: StatusId[] = ['nao_tem_interesse', 'numero_incorreto', 'finalizado', 'agendou_reuniao']

export interface AudienceFilter {
  publico: Publico
  nicho: string
  cidade: string
  status2: string
  somenteSemSite: boolean
  /** Não repete para quem recebeu mensagem nos últimos N dias */
  diasSemRepetir: number
}

export const DEFAULT_AUDIENCE: AudienceFilter = {
  publico: 'pediu_whatsapp',
  nicho: '',
  cidade: '',
  status2: '',
  somenteSemSite: false,
  diasSemRepetir: 7,
}

function matchesPublico(lead: Lead, p: Publico): boolean {
  switch (p) {
    case 'pediu_whatsapp':
      return lead.status === 'pediu_whatsapp'
    case 'novos':
      return lead.status === 'novo'
    case 'sem_resposta':
      return SEM_RESPOSTA.includes(lead.status)
    case 'interessados':
      return lead.status === 'falei_responsavel' || lead.status === 'follow_up' || lead.status === 'cliente_potencial'
    case 'todos':
      return true
  }
}

export interface Audience {
  /** Prontos para receber, do maior potencial para o menor */
  leads: Lead[]
  semNumero: number
  recentes: number
  bloqueados: number
  repetidos: number
}

/**
 * Quem entra no disparo. Fica de fora: status bloqueado, sem número válido,
 * quem já recebeu mensagem há pouco e o mesmo número repetido em outro lead.
 */
export function buildAudience(leads: Lead[], interactions: Interaction[], f: AudienceFilter, now: Date = new Date()): Audience {
  const lastMsg = new Map<string, string>()
  for (const i of interactions) {
    if (i.tipo !== 'mensagem') continue
    const prev = lastMsg.get(i.lead_id)
    if (!prev || i.created_at > prev) lastMsg.set(i.lead_id, i.created_at)
  }
  const limite = new Date(now.getTime() - f.diasSemRepetir * 86_400_000).toISOString()
  const out: Audience = { leads: [], semNumero: 0, recentes: 0, bloqueados: 0, repetidos: 0 }
  const numeros = new Set<string>()

  const candidatos = leads
    .filter((l) => matchesPublico(l, f.publico))
    .filter((l) => (!f.nicho || l.nicho === f.nicho) && (!f.cidade || l.cidade === f.cidade))
    .filter((l) => !f.status2 || (f.status2 === '__vazio__' ? !l.status2 : l.status2 === f.status2))
    .filter((l) => !f.somenteSemSite || !l.website)
    .sort((a, b) => opportunityScore(b) - opportunityScore(a) || a.created_at.localeCompare(b.created_at))

  for (const lead of candidatos) {
    if (BLOQUEADOS.includes(lead.status)) {
      out.bloqueados++
      continue
    }
    const target = whatsappTarget(lead)
    if (!target) {
      out.semNumero++
      continue
    }
    const last = lastMsg.get(lead.id)
    if (f.diasSemRepetir > 0 && last && last >= limite) {
      out.recentes++
      continue
    }
    // Mesmo número em dois leads (ex.: filial): só um recebe
    const key = target.number.slice(-8)
    if (numeros.has(key)) {
      out.repetidos++
      continue
    }
    numeros.add(key)
    out.leads.push(lead)
  }
  return out
}

/** Mensagens abertas hoje (contam para o limite diário). */
export function messagesToday(interactions: Interaction[], now: Date = new Date()): number {
  const today = todayKey(now)
  return interactions.filter((i) => i.tipo === 'mensagem' && isoDateKey(i.created_at) === today).length
}

/** Espera sorteada entre o mínimo e o máximo (segundos), incluindo os dois. */
export function randomDelay(minSec: number, maxSec: number, rand: () => number = Math.random): number {
  const lo = Math.max(0, Math.min(minSec, maxSec))
  const hi = Math.max(minSec, maxSec)
  return Math.round(lo + rand() * (hi - lo))
}
