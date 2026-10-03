import { mapsKey, phoneKey } from './duplicates'
import type { ParsedLead } from './parser'
import type { Lead } from './types'

/** Resultado de uma busca no Maps feita pelo Motor XS. */
export interface MapsResult {
  id: string
  name: string
  niche: string
  phone: string
  website: string
  instagram: string
  address: string
  city: string
  state: string
  rating: number
  reviewsCount: number
  lat: number
  lng: number
  mapsUrl: string
  cnpj: string
  responsibleName: string
  responsibleRole: string
  enrichmentConfidence: 'confirmed' | 'review' | 'not_found'
  enrichmentSource: string
  hasWhatsapp: boolean
  recurring: boolean
}

export type Mode = 1 | 0 | -1

export interface MapsSearchInput {
  niches: string[]
  location: string
  lat?: number
  lng?: number
  radiusKm: number
  targetLeads: number
  qualification: { phone: Mode; website: Mode; instagram: Mode }
  analyzeSites: boolean
  existingPolicy: 'block' | 'allow'
}

export type MapsPhase = 'idle' | 'geocoding' | 'connecting' | 'scrolling' | 'enriching' | 'processing' | 'completed' | 'cancelled' | 'error'

export interface MapsState {
  runId: string | null
  active: boolean
  phase: MapsPhase
  message: string
  progress: number
  cardsFound: number
  approvedCount: number
  discarded: number
  recurringDetected: number
  recurringBlocked: number
  currentSector: number
  totalSectors: number
  center: { lat: number; lng: number; label: string } | null
  input: MapsSearchInput | null
  results: MapsResult[]
  logs: string[]
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  elapsedMs: number
  imported: boolean
}

export const PHASE_LABEL: Record<MapsPhase, string> = {
  idle: 'Pronto',
  geocoding: 'Localizando a área',
  connecting: 'Abrindo o Google Maps',
  scrolling: 'Varrendo os setores',
  enriching: 'Qualificando as fichas',
  processing: 'Finalizando',
  completed: 'Concluída',
  cancelled: 'Interrompida',
  error: 'Erro',
}

export const POPULAR_NICHES = [
  'Barbearia',
  'Salão de beleza',
  'Clínica odontológica',
  'Clínica de estética',
  'Academia',
  'Pet shop',
  'Clínica veterinária',
  'Oficina mecânica',
  'Restaurante',
  'Pizzaria',
  'Hamburgueria',
  'Padaria',
  'Imobiliária',
  'Escritório de advocacia',
  'Contabilidade',
  'Loja de roupas',
  'Ótica',
  'Auto escola',
  'Estúdio de tatuagem',
  'Fisioterapia',
]

/** Chaves (telefone e lugar no Maps) dos leads que já estão no app — o motor pula esses. */
export function knownKeys(leads: Pick<Lead, 'telefone' | 'whatsapp' | 'maps_url'>[]): { phones: string[]; maps: string[] } {
  const phones = new Set<string>()
  const maps = new Set<string>()
  for (const l of leads) {
    for (const t of [l.telefone, l.whatsapp]) {
      const k = phoneKey(t)
      if (k) phones.add(k)
    }
    const m = mapsKey(l.maps_url)
    if (m) maps.add(m)
  }
  return { phones: [...phones], maps: [...maps] }
}

const NICHE_CASE = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Converte um resultado do Maps no formato de importação dos leads. */
export function mapsToParsed(r: MapsResult, index: number): ParsedLead {
  const extras: Record<string, string> = { Origem: 'Busca no Maps (XS)' }
  if (r.responsibleName && r.enrichmentConfidence === 'confirmed') {
    extras['Responsável'] = r.responsibleName
    if (r.responsibleRole) extras['Cargo do responsável'] = r.responsibleRole
  }
  if (r.cnpj && r.enrichmentConfidence !== 'confirmed') extras['CNPJ (conferir)'] = r.enrichmentSource || 'CNPJ achado no site, identidade não confirmada'
  return {
    index: index + 1,
    empresa: r.name,
    nicho: NICHE_CASE(r.niche),
    telefone: r.phone || null,
    whatsapp: r.hasWhatsapp ? r.phone : null,
    instagram: r.instagram || null,
    website: r.website || null,
    endereco: r.address || null,
    cidade: r.city || null,
    estado: r.state || null,
    avaliacao: r.rating || null,
    numero_avaliacoes: r.reviewsCount || null,
    pasta: null,
    etapa: null,
    maps_url: r.mapsUrl || null,
    observacoes: null,
    dados_extras: extras,
    status: 'novo',
    cnpj: r.enrichmentConfidence === 'confirmed' ? r.cnpj : null,
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`
}
