import type { Followup, ImportRecord, Interaction, Lead, Meeting, Settings, Snapshot } from '../lib/types'

/**
 * Contrato de persistência. A UI fala só com esta interface,
 * então trocar o armazenamento (local ↔ Supabase) não muda nenhuma tela.
 */
export interface Repository {
  readonly kind: 'local' | 'supabase'
  load(): Promise<Snapshot>

  insertImport(record: ImportRecord): Promise<void>
  insertLeads(leads: Lead[]): Promise<void>
  updateLead(id: string, patch: Partial<Lead>): Promise<void>
  deleteLeads(ids: string[]): Promise<void>

  insertInteractions(items: Interaction[]): Promise<void>
  updateInteraction(id: string, patch: Partial<Interaction>): Promise<void>
  deleteInteraction(id: string): Promise<void>

  insertFollowup(item: Followup): Promise<void>
  updateFollowups(ids: string[], patch: Partial<Followup>): Promise<void>
  deleteFollowup(id: string): Promise<void>

  insertMeeting(item: Meeting): Promise<void>
  deleteMeeting(id: string): Promise<void>

  saveSettings(settings: Settings): Promise<void>
  /** Substitui todos os dados (restaurar backup). */
  replaceAll(snapshot: Snapshot): Promise<void>
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
