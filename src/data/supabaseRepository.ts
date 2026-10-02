import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, type Lead, type Settings, type Snapshot } from '../lib/types'
import type { Repository } from './repository'

const PAGE = 1000
const CHUNK = 500

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Remove a coluna user_id (gerenciada pelo banco) dos registros lidos. */
function strip<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const { user_id: _u, ...rest } = row as T & { user_id?: string }
    return rest as T
  })
}

function normalizeLead(row: Lead): Lead {
  return { ...row, avaliacao: row.avaliacao === null ? null : Number(row.avaliacao) }
}

export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const
  constructor(private db: SupabaseClient) {}

  private async fetchAll<T>(table: string, order: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
      const rows = check(
        await this.db.from(table).select('*').order(order, { ascending: true }).order('id').range(from, from + PAGE - 1),
      ) as T[]
      out.push(...rows)
      if (rows.length < PAGE) break
    }
    return strip(out)
  }

  async load(): Promise<Snapshot> {
    const [leads, interactions, followups, meetings, imports, settingsRows] = await Promise.all([
      this.fetchAll<Lead>('leads', 'created_at'),
      this.fetchAll<Snapshot['interactions'][number]>('interactions', 'created_at'),
      this.fetchAll<Snapshot['followups'][number]>('followups', 'created_at'),
      this.fetchAll<Snapshot['meetings'][number]>('meetings', 'created_at'),
      this.fetchAll<Snapshot['imports'][number]>('imports', 'data_importacao'),
      this.db.from('settings').select('*').limit(1),
    ])
    const row = (check(settingsRows) as Record<string, unknown>[])[0] ?? {}
    // Só os campos conhecidos (ignora user_id/updated_at e colunas nulas)
    const s = Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS)
        .filter((k) => row[k] !== undefined && row[k] !== null)
        .map((k) => [k, row[k]]),
    ) as Partial<Settings>
    return {
      leads: leads.map(normalizeLead),
      interactions,
      followups,
      meetings,
      imports,
      settings: { ...DEFAULT_SETTINGS, ...s },
    }
  }

  async insertImport(record: Snapshot['imports'][number]) {
    check(await this.db.from('imports').insert(record))
  }

  async insertLeads(leads: Lead[]) {
    for (const part of chunks(leads)) check(await this.db.from('leads').insert(part))
  }

  async updateLead(id: string, patch: Partial<Lead>) {
    const { id: _id, created_at: _c, ...rest } = patch
    check(await this.db.from('leads').update(rest).eq('id', id))
  }

  async deleteLeads(ids: string[]) {
    for (const part of chunks(ids, 200)) check(await this.db.from('leads').delete().in('id', part))
  }

  async insertInteractions(items: Snapshot['interactions']) {
    if (!items.length) return
    for (const part of chunks(items)) check(await this.db.from('interactions').insert(part))
  }

  async updateInteraction(id: string, patch: Partial<Snapshot['interactions'][number]>) {
    check(await this.db.from('interactions').update(patch).eq('id', id))
  }

  async deleteInteraction(id: string) {
    check(await this.db.from('interactions').delete().eq('id', id))
  }

  async insertFollowup(item: Snapshot['followups'][number]) {
    check(await this.db.from('followups').insert(item))
  }

  async updateFollowups(ids: string[], patch: Partial<Snapshot['followups'][number]>) {
    if (!ids.length) return
    check(await this.db.from('followups').update(patch).in('id', ids))
  }

  async deleteFollowup(id: string) {
    check(await this.db.from('followups').delete().eq('id', id))
  }

  async insertMeeting(item: Snapshot['meetings'][number]) {
    check(await this.db.from('meetings').insert(item))
  }

  async deleteMeeting(id: string) {
    check(await this.db.from('meetings').delete().eq('id', id))
  }

  async saveSettings(settings: Settings) {
    check(await this.db.from('settings').upsert({ ...settings, updated_at: new Date().toISOString() }))
  }

  async replaceAll(snapshot: Snapshot) {
    // Apagar leads remove interações, follow-ups e reuniões em cascata.
    const { data: userData } = await this.db.auth.getUser()
    const uid = userData.user?.id
    if (!uid) throw new Error('Sessão expirada. Entre novamente.')
    check(await this.db.from('leads').delete().eq('user_id', uid))
    check(await this.db.from('imports').delete().eq('user_id', uid))
    for (const part of chunks(snapshot.imports)) check(await this.db.from('imports').insert(part))
    await this.insertLeads(snapshot.leads)
    await this.insertInteractions(snapshot.interactions)
    for (const part of chunks(snapshot.followups)) check(await this.db.from('followups').insert(part))
    for (const part of chunks(snapshot.meetings)) check(await this.db.from('meetings').insert(part))
    await this.saveSettings(snapshot.settings)
  }
}
