// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Busca de empresas no Google Maps (Places API New) com a chave do próprio dono, a mesma da tela
 * "Buscar empresas" (api/maps.ts). Cada consulta conta na cota grátis do mês; o app soma ao contador.
 */

export interface ResultadoGoogle {
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
  neighborhood: string
  cnpj: string
  responsibleName: string
  responsibleRole: string
  enrichmentConfidence: 'not_found'
  enrichmentSource: string
  hasWhatsapp: boolean
  recurring: boolean
  source: 'google'
  category: string
}

interface Place {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  location?: { latitude: number; longitude: number }
  googleMapsUri?: string
  businessStatus?: string
  primaryTypeDisplayName?: { text?: string }
}

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.location',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',')

export class ErroGoogle extends Error {
  constructor(
    message: string,
    /** Chave ruim ou cota acabou: não adianta tentar de novo agora */
    readonly parar = false,
  ) {
    super(message)
  }
}

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function normalizarTelefone(raw: string | undefined): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return ''
}

const social = (url?: string) => {
  try {
    return /(^|\.)(instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|whatsapp\.com|tiktok\.com|ifood\.com\.br)$/i.test(new URL(url ?? '').hostname)
  } catch {
    return false
  }
}
const instagram = (url?: string) => {
  try {
    return /(^|\.)instagram\.com$/i.test(new URL(url ?? '').hostname)
  } catch {
    return false
  }
}

export function paraResultado(p: Place, nicho: string): ResultadoGoogle {
  const comp = (type: string, short = false) => {
    const c = p.addressComponents?.find((x) => x.types?.includes(type))
    return (short ? c?.shortText : c?.longText) ?? ''
  }
  const phone = normalizarTelefone(p.nationalPhoneNumber || p.internationalPhoneNumber)
  return {
    id: p.id,
    name: p.displayName?.text?.trim() || 'Sem nome',
    niche: nicho,
    phone,
    website: social(p.websiteUri) ? '' : (p.websiteUri ?? ''),
    instagram: instagram(p.websiteUri) ? (p.websiteUri ?? '') : '',
    address: p.formattedAddress ?? '',
    city: comp('administrative_area_level_2') || comp('locality'),
    state: comp('administrative_area_level_1', true),
    rating: p.rating ?? 0,
    reviewsCount: p.userRatingCount ?? 0,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    mapsUrl: p.googleMapsUri ?? '',
    neighborhood: comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood'),
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found',
    enrichmentSource: 'Google Maps',
    hasWhatsapp: phone.length === 13 && phone[4] === '9',
    recurring: false,
    source: 'google',
    category: p.primaryTypeDisplayName?.text ?? '',
  }
}

function erroDoGoogle(status: number, data: { error?: { message?: string; status?: string; details?: { reason?: string }[] } }): ErroGoogle {
  const msg = data.error?.message ?? ''
  const reason = data.error?.details?.find((d) => d.reason)?.reason ?? ''
  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(msg)) return new ErroGoogle('A chave do Google não é válida. Confira em Configurações → Busca do Google.', true)
  if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(msg)) return new ErroGoogle('A "Places API (New)" não está ativada no projeto da sua chave do Google.', true)
  if (/billing/i.test(msg) || reason === 'BILLING_DISABLED') return new ErroGoogle('O Google pede uma conta de faturamento ligada ao projeto da chave (não cobra dentro da cota grátis).', true)
  if (status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') return new ErroGoogle('A chave do Google chegou no limite de hoje. Amanhã ela volta sozinha.', true)
  if (status === 403) return new ErroGoogle(`O Google recusou a chave: ${msg || 'sem permissão'}.`, true)
  return new ErroGoogle(`O Google não respondeu (${msg || `erro ${status}`}).`)
}

async function buscarTexto(chave: string, corpo: Record<string, unknown>): Promise<{ places: Place[]; nextPageToken?: string }> {
  let res: Response
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ErroGoogle('O Google não respondeu agora.')
  }
  const data = (await res.json().catch(() => ({}))) as { places?: Place[]; nextPageToken?: string; error?: { message?: string; status?: string } }
  if (!res.ok) throw erroDoGoogle(res.status, data)
  return { places: data.places ?? [], nextPageToken: data.nextPageToken }
}

/** Caixa da cidade no mapa (OpenStreetMap), para a busca não sair da cidade. */
export async function caixaDaCidade(cidade: string, uf: string): Promise<[number, number, number, number] | undefined> {
  try {
    const q = encodeURIComponent(`${cidade}, ${uf}, Brasil`)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=br&featureType=city&limit=1&format=jsonv2`, {
      headers: { 'User-Agent': 'XS-Prospeccao/2.2 (vendedor IA; contato pelo site xs-prospeccao.vercel.app)', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(10_000),
    })
    const rows = (await res.json().catch(() => [])) as { boundingbox?: string[] }[]
    const bb = rows[0]?.boundingbox?.map(Number)
    return bb && bb.length === 4 && bb.every(Number.isFinite) ? [bb[0], bb[1], bb[2], bb[3]] : undefined
  } catch {
    return undefined
  }
}

export interface PedidoBusca {
  chave: string
  cidade: string
  uf: string
  caixa?: [number, number, number, number]
  nichos: { nome: string; busca: string }[]
  meta: number
  soSemSite: boolean
  /** Telefones (DDD + 8) que não podem voltar */
  conhecidos: Set<string>
  /** Consultas que ainda cabem na cota */
  restante: number
  phoneKey: (p: string) => string
}

/** Busca empresas com celular na cidade; para quando chega na meta ou na cota. */
export async function buscarNoGoogle(p: PedidoBusca): Promise<{ resultados: ResultadoGoogle[]; chamadas: number }> {
  const orcamento = Math.max(0, Math.min(20, Math.floor(p.restante)))
  if (!orcamento) throw new ErroGoogle('Acabaram as consultas do Google deste mês dentro da cota grátis.', true)
  const vistos = new Set<string>()
  const out: ResultadoGoogle[] = []
  let chamadas = 0
  const alvo = norm(p.cidade)
  const retangulo = p.caixa ? { low: { latitude: p.caixa[0], longitude: p.caixa[2] }, high: { latitude: p.caixa[1], longitude: p.caixa[3] } } : null
  for (const n of p.nichos) {
    let token: string | undefined
    for (let pagina = 0; pagina < 3 && out.length < p.meta && chamadas < orcamento; pagina++) {
      chamadas++
      const corpo: Record<string, unknown> = { textQuery: `${n.busca} em ${p.cidade}, ${p.uf}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 }
      if (retangulo) corpo.locationBias = { rectangle: retangulo }
      if (token) corpo.pageToken = token
      const { places, nextPageToken } = await buscarTexto(p.chave, corpo)
      for (const pl of places) {
        if (!pl.id || vistos.has(pl.id) || pl.businessStatus === 'CLOSED_PERMANENTLY' || pl.businessStatus === 'CLOSED_TEMPORARILY') continue
        vistos.add(pl.id)
        const r = paraResultado(pl, n.nome)
        if (r.city && alvo && norm(r.city) !== alvo) continue
        if (!r.hasWhatsapp || (p.soSemSite && r.website)) continue
        if (p.conhecidos.has(p.phoneKey(r.phone))) continue
        out.push(r)
        if (out.length >= p.meta) break
      }
      if (!nextPageToken) break
      token = nextPageToken
    }
    if (out.length >= p.meta || chamadas >= orcamento) break
  }
  return { resultados: out, chamadas }
}

/**
 * Nota de encaixe (0 a 100): sem site, celular, boas avaliações e movimento de negócio de bairro vão
 * primeiro. `taxaRamo` = % de resposta do ramo nas suas conversas (quando já há dados).
 */
export function notaEncaixe(r: Pick<ResultadoGoogle, 'website' | 'hasWhatsapp' | 'rating' | 'reviewsCount' | 'instagram'>, taxaRamo: number | null = null): { nota: number; motivos: string[] } {
  let nota = 20
  const motivos: string[] = []
  if (!r.website) {
    nota += 30
    motivos.push('sem site')
  }
  if (r.hasWhatsapp) {
    nota += 15
    motivos.push('celular')
  }
  if (r.rating >= 4.3) {
    nota += 12
    motivos.push(`nota ${r.rating.toFixed(1).replace('.', ',')}`)
  }
  if (r.reviewsCount >= 15 && r.reviewsCount <= 600) {
    nota += 13
    motivos.push(`${r.reviewsCount} avaliações`)
  } else if (r.reviewsCount > 1500) {
    nota -= 10
    motivos.push('parece rede grande')
  }
  if (r.instagram) {
    nota += 5
    motivos.push('Instagram ativo')
  }
  if (taxaRamo !== null) {
    const bonus = Math.round(Math.max(-10, Math.min(10, (taxaRamo - 20) / 2)))
    nota += bonus
    if (bonus) motivos.push(`ramo responde ${taxaRamo}%`)
  }
  return { nota: Math.max(0, Math.min(100, nota)), motivos }
}
