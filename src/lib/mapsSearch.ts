import { mapsKey, phoneKey } from './duplicates'
import type { ParsedLead } from './parser'
import type { Lead } from './types'

/** Empresa encontrada pela busca da XS (base pública do CNPJ, pelo servidor de busca). */
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
  /** Campos que vêm da base do CNPJ */
  email?: string
  phone2?: string
  /** Domínio do e-mail próprio: candidato a site (conferido se "Conferir os sites" estiver ligado) */
  siteGuess?: string
  razao?: string
  openedAt?: string
  neighborhood?: string
  cep?: string
}

export type Mode = 1 | 0 | -1

export interface MapsSearchInput {
  niches: string[]
  /** "Cidade, UF" */
  location: string
  bairros: string[]
  targetLeads: number
  qualification: { phone: Mode; website: Mode; mobile: Mode }
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
  connecting: 'Buscando empresas',
  scrolling: 'Varrendo os setores',
  enriching: 'Conferindo os sites',
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

/** Chaves (telefone, lugar no Maps e CNPJ) dos leads que já estão no app — a busca pula esses. */
export function knownKeys(leads: Pick<Lead, 'telefone' | 'whatsapp' | 'maps_url' | 'cnpj'>[]): { phones: string[]; maps: string[]; cnpjs: string[] } {
  const phones = new Set<string>()
  const maps = new Set<string>()
  const cnpjs = new Set<string>()
  for (const l of leads) {
    for (const t of [l.telefone, l.whatsapp]) {
      const k = phoneKey(t)
      if (k) phones.add(k)
    }
    const m = mapsKey(l.maps_url)
    if (m) maps.add(m)
    const c = (l.cnpj ?? '').replace(/\D/g, '')
    if (c.length === 14) cnpjs.add(c)
  }
  return { phones: [...phones], maps: [...maps], cnpjs: [...cnpjs] }
}

const NICHE_CASE = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Converte um resultado do Maps no formato de importação dos leads. */
export function mapsToParsed(r: MapsResult, index: number): ParsedLead {
  const fromReceita = r.enrichmentSource.startsWith('Receita')
  const extras: Record<string, string> = { Origem: fromReceita ? 'Busca de empresas (base pública do CNPJ)' : 'Busca no Maps (XS)' }
  if (r.razao && r.razao !== r.name) extras['Razão social'] = r.razao
  if (r.email) extras['E-mail'] = r.email
  if (r.phone2) extras['Telefone 2'] = r.phone2
  if (r.openedAt) extras['Aberta em'] = r.openedAt.split('-').reverse().join('/')
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
    // Na base do CNPJ o número é da própria empresa; no site, só quando a identidade conferiu
    cnpj: fromReceita || r.enrichmentConfidence === 'confirmed' ? r.cnpj || null : null,
  }
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`
}
