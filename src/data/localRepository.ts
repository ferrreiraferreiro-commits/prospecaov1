import { DEFAULT_SETTINGS, type Snapshot } from '../lib/types'
import type { Repository } from './repository'

const STORAGE_KEY = 'central-prospeccao:v1'

function emptySnapshot(): Snapshot {
  return { leads: [], interactions: [], followups: [], meetings: [], imports: [], settings: { ...DEFAULT_SETTINGS } }
}

/** Armazena tudo no navegador (localStorage). Ideal para começar sem configurar nada. */
export class LocalRepository implements Repository {
  readonly kind = 'local' as const
  private data: Snapshot = emptySnapshot()

  async load(): Promise<Snapshot> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Snapshot>
        this.data = { ...emptySnapshot(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }
      }
    } catch (err) {
      console.error('Falha ao ler dados locais', err)
    }
    return structuredClone(this.data)
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch (err) {
      throw new Error('Não foi possível salvar no navegador (armazenamento cheio?). Exporte um backup.', { cause: err })
    }
  }

  private patchWhere<T extends { id: string }>(list: T[], ids: Set<string>, patch: Partial<T>): T[] {
    return list.map((x) => (ids.has(x.id) ? { ...x, ...patch } : x))
  }

  async insertImport(record: Snapshot['imports'][number]) {
    this.data.imports.push(record)
    this.persist()
  }

  async insertLeads(leads: Snapshot['leads']) {
    this.data.leads.push(...leads)
    this.persist()
  }

  async updateLead(id: string, patch: Partial<Snapshot['leads'][number]>) {
    this.data.leads = this.patchWhere(this.data.leads, new Set([id]), patch)
    this.persist()
  }

  async deleteLeads(ids: string[]) {
    const set = new Set(ids)
    this.data.leads = this.data.leads.filter((l) => !set.has(l.id))
    this.data.interactions = this.data.interactions.filter((x) => !set.has(x.lead_id))
    this.data.followups = this.data.followups.filter((x) => !set.has(x.lead_id))
    this.data.meetings = this.data.meetings.filter((x) => !set.has(x.lead_id))
    this.persist()
  }

  async insertInteractions(items: Snapshot['interactions']) {
    this.data.interactions.push(...items)
    this.persist()
  }

  async updateInteraction(id: string, patch: Partial<Snapshot['interactions'][number]>) {
    this.data.interactions = this.patchWhere(this.data.interactions, new Set([id]), patch)
    this.persist()
  }

  async deleteInteraction(id: string) {
    this.data.interactions = this.data.interactions.filter((x) => x.id !== id)
    this.persist()
  }

  async insertFollowup(item: Snapshot['followups'][number]) {
    this.data.followups.push(item)
    this.persist()
  }

  async updateFollowups(ids: string[], patch: Partial<Snapshot['followups'][number]>) {
    this.data.followups = this.patchWhere(this.data.followups, new Set(ids), patch)
    this.persist()
  }

  async deleteFollowup(id: string) {
    this.data.followups = this.data.followups.filter((x) => x.id !== id)
    this.persist()
  }

  async insertMeeting(item: Snapshot['meetings'][number]) {
    this.data.meetings.push(item)
    this.persist()
  }

  async updateMeeting(id: string, patch: Partial<Snapshot['meetings'][number]>) {
    this.data.meetings = this.patchWhere(this.data.meetings, new Set([id]), patch)
    this.persist()
  }

  async deleteMeeting(id: string) {
    this.data.meetings = this.data.meetings.filter((x) => x.id !== id)
    this.persist()
  }

  async saveSettings(settings: Snapshot['settings']) {
    this.data.settings = settings
    this.persist()
  }

  async replaceAll(snapshot: Snapshot) {
    this.data = structuredClone(snapshot)
    this.persist()
  }
}
