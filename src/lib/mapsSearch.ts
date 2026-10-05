import { mapsKey, phoneKey } from './duplicates'
import { normalizeKey } from './statuses'
import type { ParsedLead } from './parser'
import type { Lead } from './types'

/** Empresa encontrada pela busca da XS (base aberta de comércios, ou Google Maps com a chave do usuário). */
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
  /** De onde veio: base aberta (Overture Maps) ou Google Maps */
  source?: 'base' | 'google'
  /** Categoria do Google (ex.: "Barbearia") */
  category?: string
  /** Página do Facebook (base aberta) */
  facebook?: string
  /** Campos de importações antigas (base do CNPJ) */
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

export type SearchSource = 'base' | 'google'

export interface MapsSearchInput {
  source: SearchSource
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

/** Nome + cidade: só para lugares da base aberta sem telefone (não têm outro jeito de comparar). */
export function nameCityKey(nome: string | null | undefined, cidade: string | null | undefined): string | null {
  const n = normalizeKey(nome ?? '')
  return n ? `${n}|${normalizeKey(cidade ?? '')}` : null
}

/** Chaves (telefone, lugar no Maps, CNPJ e nome + cidade) dos leads que já estão no app — a busca pula esses. */
export function knownKeys(leads: Pick<Lead, 'telefone' | 'whatsapp' | 'maps_url' | 'cnpj' | 'empresa' | 'cidade'>[]): { phones: string[]; maps: string[]; cnpjs: string[]; names: string[] } {
  const phones = new Set<string>()
  const maps = new Set<string>()
  const cnpjs = new Set<string>()
  const names = new Set<string>()
  for (const l of leads) {
    const nk = nameCityKey(l.empresa, l.cidade)
    if (nk) names.add(nk)
    for (const t of [l.telefone, l.whatsapp]) {
      const k = phoneKey(t)
      if (k) phones.add(k)
    }
    const m = mapsKey(l.maps_url)
    if (m) maps.add(m)
    const c = (l.cnpj ?? '').replace(/\D/g, '')
    if (c.length === 14) cnpjs.add(c)
  }
  return { phones: [...phones], maps: [...maps], cnpjs: [...cnpjs], names: [...names] }
}

const NICHE_CASE = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Converte um resultado do Maps no formato de importação dos leads. */
export function mapsToParsed(r: MapsResult, index: number): ParsedLead {
  const fromReceita = r.enrichmentSource.startsWith('Receita')
  const extras: Record<string, string> = {
    Origem: fromReceita ? 'Busca de empresas (base pública do CNPJ)' : r.source === 'base' ? 'Busca de empresas (base aberta)' : 'Busca de empresas (Google Maps)',
  }
  if (r.category && normalizeKey(r.category) !== normalizeKey(r.niche)) extras['Categoria no Google'] = r.category
  if (r.facebook) extras.Facebook = r.facebook
  if (r.cep) extras.CEP = r.cep
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
