/**
 * Busca de empresas no Google (Places API) — substitui o Motor XS na busca do Maps.
 *
 * POST /api/maps  { acao: 'buscar', ... }      → empresas da região, em segundos
 * POST /api/maps  { acao: 'enriquecer', itens } → Instagram e CNPJ/sócio lendo o site público
 *
 * Só atende quem está logado com acesso liberado (teste em dia, plano ativo ou vitalício).
 * A chave do Google fica só aqui no servidor (GOOGLE_PLACES_KEY na Vercel), nunca no navegador.
 *
 * Arquivo único de propósito: a Vercel compila cada função sozinha, então as regras
 * puras ficam aqui mesmo (exportadas para os testes).
 */
import dns from 'node:dns/promises'
import net from 'node:net'

export const config = { maxDuration: 30 }

type Mode = 1 | 0 | -1

export interface SearchBody {
  niches: string[]
  location: string
  lat: number
  lng: number
  radiusKm: number
  targetLeads: number
  qualification: { phone: Mode; website: Mode; instagram: Mode }
  existingPolicy: 'block' | 'allow'
  known?: { phones?: string[]; maps?: string[] }
}

/** Mesmo formato de resultado que o app já usava com o Motor. */
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
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

/** Igual a phoneKey de src/lib/duplicates.ts (o teste confere que os dois batem). */
export function phoneKey(tel: string | null | undefined): string | null {
  let d = String(tel ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return `${d.slice(0, 2)}${d.slice(-8)}`
  return d.slice(-8)
}

/** Igual a mapsKey de src/lib/duplicates.ts para os links que o Google devolve (?cid=…). */
export function cidKey(url: string | undefined): string | null {
  const cid = url?.match(/[?&]cid=(\d+)/)
  return cid ? `cid:${cid[1]}` : null
}

/** 55 + DDD + número; sem DDD, vazio. */
export function normalizeBrazilPhone(raw: string | undefined): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return ''
}

/** Celular (55 + DDD + 9 + 8 dígitos): candidato a WhatsApp. */
export const looksLikeMobile = (phone: string) => phone.length === 13 && phone[4] === '9'

const passes = (mode: Mode, has: boolean) => mode === 0 || (mode === 1 ? has : !has)

/** Retângulo que contém o círculo da busca. */
export function boundsOf(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  return { low: { latitude: lat - dLat, longitude: lng - dLng }, high: { latitude: lat + dLat, longitude: lng + dLng } }
}

/** Divide a área em n×n pedaços: o Google devolve no máximo 60 lugares por consulta. */
export function tilesOf(lat: number, lng: number, radiusKm: number, n: number) {
  const b = boundsOf(lat, lng, radiusKm)
  const stepLat = (b.high.latitude - b.low.latitude) / n
  const stepLng = (b.high.longitude - b.low.longitude) / n
  const out: ReturnType<typeof boundsOf>[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push({
        low: { latitude: b.low.latitude + i * stepLat, longitude: b.low.longitude + j * stepLng },
        high: { latitude: b.low.latitude + (i + 1) * stepLat, longitude: b.low.longitude + (j + 1) * stepLng },
      })
  return out
}

/** Quantos pedaços usar: área grande e meta alta pedem mais consultas em paralelo. */
export function gridSize(radiusKm: number, target: number): number {
  if (radiusKm < 8 || target <= 60) return 1
  return target <= 150 ? 2 : 3
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Muita empresa cadastra o perfil do Instagram como "site" no Google. */
export function isInstagramUrl(url: string | undefined): boolean {
  try {
    return /(^|\.)instagram\.com$/i.test(new URL(url ?? '').hostname)
  } catch {
    return false
  }
}

/** Converte um lugar do Google no resultado do app. */
export function toResult(p: Place, niche: string): MapsResult {
  const comp = (type: string, short = false) => {
    const c = p.addressComponents?.find((x) => x.types?.includes(type))
    return (short ? c?.shortText : c?.longText) ?? ''
  }
  const phone = normalizeBrazilPhone(p.nationalPhoneNumber || p.internationalPhoneNumber)
  return {
    id: p.id,
    name: p.displayName?.text?.trim() || 'Sem nome',
    niche,
    phone,
    website: p.websiteUri ?? '',
    instagram: isInstagramUrl(p.websiteUri) ? (p.websiteUri ?? '') : '',
    address: p.formattedAddress ?? '',
    city: comp('administrative_area_level_2') || comp('locality'),
    state: comp('administrative_area_level_1', true),
    rating: p.rating ?? 0,
    reviewsCount: p.userRatingCount ?? 0,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    mapsUrl: p.googleMapsUri ?? '',
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found',
    enrichmentSource: '',
    hasWhatsapp: looksLikeMobile(phone),
    recurring: false,
  }
}

/** Telefone e site conforme os filtros (Instagram só dá para saber depois de abrir o site). */
export function qualifies(r: MapsResult, q: SearchBody['qualification']): boolean {
  // Perfil do Instagram cadastrado como "site" no Google não conta como site
  const hasSite = !!r.website && !r.instagram
  return passes(q.phone, !!r.phone) && passes(q.website, hasSite)
}

// ---------------------------------------------------------------------------
// Google Places
// ---------------------------------------------------------------------------

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
  'nextPageToken',
].join(',')

/** Teto de consultas pagas por busca (cada uma traz até 20 lugares). */
const MAX_CALLS = 30

async function searchText(key: string, body: Record<string, unknown>, signal: AbortSignal): Promise<{ places: Place[]; nextPageToken?: string }> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as { places?: Place[]; nextPageToken?: string; error?: { message?: string; status?: string } }
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`
    throw new HttpError(502, res.status === 403 || res.status === 400 ? `O Google recusou a busca: ${msg}` : `O Google não respondeu: ${msg}`)
  }
  return { places: data.places ?? [], nextPageToken: data.nextPageToken }
}

async function search(key: string, input: SearchBody) {
  const started = Date.now()
  const target = Math.max(5, Math.min(300, Math.round(input.targetLeads) || 30))
  const radius = Math.max(1, Math.min(50, input.radiusKm || 5))
  const center = { lat: input.lat, lng: input.lng }
  const knownPhones = new Set(input.known?.phones ?? [])
  const knownMaps = new Set(input.known?.maps ?? [])
  // Com filtro de Instagram, parte cai depois de abrir os sites: busca uma folga
  const want = input.qualification.instagram !== 0 ? Math.min(300, target * 2) : target

  const niches = [...new Set(input.niches.map((n) => n.trim()).filter(Boolean))].slice(0, 10)
  const tiles = tilesOf(center.lat, center.lng, radius, gridSize(radius, target))
  const jobs = niches.flatMap((niche) => tiles.map((rect) => ({ niche, rect })))

  const seen = new Set<string>()
  const results: MapsResult[] = []
  let found = 0
  let blocked = 0
  let recurring = 0
  let calls = 0
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 24_000)
  const enough = () => results.filter((r) => !r.recurring).length >= want

  async function runJob(job: (typeof jobs)[number]) {
    let pageToken: string | undefined
    for (let page = 0; page < 3 && !enough() && calls < MAX_CALLS; page++) {
      calls++
      const { places, nextPageToken } = await searchText(
        key,
        { textQuery: job.niche, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, locationRestriction: { rectangle: job.rect }, ...(pageToken ? { pageToken } : {}) },
        ctrl.signal,
      )
      for (const p of places) {
        if (!p.id || seen.has(p.id) || p.businessStatus === 'CLOSED_PERMANENTLY') continue
        seen.add(p.id)
        const r = toResult(p, job.niche)
        // O retângulo tem cantos fora do círculo escolhido
        if (r.lat && distanceKm(center, r) > radius) continue
        found++
        if (!qualifies(r, input.qualification)) continue
        const pk = phoneKey(r.phone)
        const mk = cidKey(r.mapsUrl)
        if ((pk && knownPhones.has(pk)) || (mk && knownMaps.has(mk))) {
          recurring++
          if (input.existingPolicy === 'block') {
            blocked++
            continue
          }
          r.recurring = true
        }
        results.push(r)
      }
      if (!nextPageToken) break
      pageToken = nextPageToken
    }
  }

  try {
    // Até 6 consultas ao mesmo tempo
    const queue = [...jobs]
    await Promise.all(
      Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (queue.length && !enough()) await runJob(queue.shift()!)
      }),
    )
  } catch (err) {
    // Se já há resultado, devolve o que deu; se não, mostra o erro
    if (!results.length) throw err
  } finally {
    clearTimeout(timer)
    // Se uma consulta falhou, as que ainda estavam no ar param aqui (não gastam cota à toa)
    ctrl.abort()
  }

  // Mais perto do centro primeiro; corta na meta (a folga do Instagram fica com o app)
  results.sort((a, b) => distanceKm(center, a) - distanceKm(center, b))
  const fresh = results.filter((r) => !r.recurring).slice(0, want)
  const again = results.filter((r) => r.recurring)
  return {
    results: [...fresh, ...again],
    stats: { found, approved: fresh.length, recurring, blocked, calls, elapsedMs: Date.now() - started },
  }
}

// ---------------------------------------------------------------------------
// Instagram e CNPJ a partir do site público da empresa
// ---------------------------------------------------------------------------

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (net.isIPv6(address)) {
    const n = address.toLowerCase()
    return n === '::' || n === '::1' || n.startsWith('fc') || n.startsWith('fd') || /^fe[89ab]/.test(n) || n.startsWith('::ffff:')
  }
  return true
}

/** Só endereços públicos (o servidor nunca abre rede interna). */
async function assertSafePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('URL não permitida')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) throw new Error('Destino privado')
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true })
  if (!addrs.length || addrs.some((e) => isPrivateIp(e.address))) throw new Error('Destino privado')
  return url
}

/** Baixa o HTML seguindo até 3 redirecionamentos, conferindo cada destino. */
async function fetchSite(raw: string): Promise<string> {
  let url = await assertSafePublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XSProspeccao/1.0)' }, signal: AbortSignal.timeout(5000) })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertSafePublicUrl(new URL(loc, url).toString())
      continue
    }
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') ?? 'text/html')) return ''
    const text = await res.text()
    return text.slice(0, 800_000)
  }
  return ''
}

const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'sharer'])

export function findInstagram(html: string): string {
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?/gi)) {
    if (!IG_SKIP.has(m[1].toLowerCase())) return `https://www.instagram.com/${m[1]}`
  }
  return ''
}

export function isValidCnpj(value: string): boolean {
  const d = String(value || '').replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (len: number) => {
    let f = len - 7
    let t = 0
    for (let i = 0; i < len; i++) {
      t += Number(d[i]) * f--
      if (f < 2) f = 9
    }
    const r = t % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function findCnpj(text: string): string {
  for (const c of text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) ?? []) {
    const d = c.replace(/\D/g, '')
    if (isValidCnpj(d)) return d
  }
  return ''
}

const strip = (v: unknown) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const identity = (v: unknown) =>
  strip(v)
    .replace(/\b(ltda|me|eireli|sa|s a|empresa|comercio|servicos?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

interface CnpjData {
  razao_social?: string
  nome_fantasia?: string
  ddd_telefone_1?: string
  ddd_telefone_2?: string
  municipio?: string
  qsa?: { nome_socio?: string; qualificacao_socio?: string }[]
}

/** O CNPJ achado no site é desta empresa? Nome precisa bater; telefone e cidade não podem divergir. */
export function matchesCompany(data: CnpjData, who: { name: string; phone: string; city: string }): boolean {
  const expected = identity(who.name)
  if (!expected) return false
  const tokens = new Set(expected.split(' ').filter((t) => t.length >= 3))
  const nameOk = [data.razao_social, data.nome_fantasia]
    .map(identity)
    .filter(Boolean)
    .some((r) => r.includes(expected) || expected.includes(r) || r.split(' ').filter((t) => tokens.has(t)).length >= Math.min(2, tokens.size))
  if (!nameOk) return false
  const phone = who.phone.replace(/\D/g, '').slice(-8)
  const reg = [data.ddd_telefone_1, data.ddd_telefone_2].map((v) => String(v || '').replace(/\D/g, '').slice(-8))
  if (phone && reg.some(Boolean) && !reg.includes(phone)) return false
  const city = identity(who.city)
  const regCity = identity(data.municipio)
  return !(city && regCity && !city.includes(regCity) && !regCity.includes(city))
}

const ROLE_ORDER = ['socio-administrador', 'administrador', 'titular', 'presidente', 'diretor', 'socio']

interface EnrichItem {
  id: string
  website: string
  name: string
  phone: string
  city: string
}

async function enrichOne(it: EnrichItem) {
  const out = { id: it.id, instagram: '', cnpj: '', responsibleName: '', responsibleRole: '', enrichmentConfidence: 'not_found' as MapsResult['enrichmentConfidence'], enrichmentSource: '' }
  let html = ''
  try {
    html = await fetchSite(it.website)
  } catch {
    return out
  }
  out.instagram = findInstagram(html)
  const cnpj = findCnpj(html.replace(/<[^>]+>/g, ' '))
  if (!cnpj) return out
  out.cnpj = cnpj
  out.enrichmentConfidence = 'review'
  out.enrichmentSource = 'CNPJ achado no site; consulta indisponível'
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { 'User-Agent': 'XSProspeccao/1.0' }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return out
    const data = (await res.json()) as CnpjData
    if (!matchesCompany(data, it)) {
      out.enrichmentSource = 'CNPJ achado, mas nome/telefone/cidade não conferem'
      return out
    }
    const people = (data.qsa ?? []).map((m) => ({ name: String(m.nome_socio ?? '').trim(), role: String(m.qualificacao_socio ?? '').trim() })).filter((m) => m.name)
    const rank = (role: string) => {
      const i = ROLE_ORDER.findIndex((r) => strip(role).includes(r))
      return i === -1 ? 99 : i
    }
    people.sort((a, b) => rank(a.role) - rank(b.role))
    if (people[0]) {
      out.responsibleName = people[0].name
      out.responsibleRole = people[0].role
      out.enrichmentConfidence = 'confirmed'
    }
    out.enrichmentSource = 'BrasilAPI · dados públicos do CNPJ'
  } catch {
    /* fica como "conferir" */
  }
  return out
}

// ---------------------------------------------------------------------------
// Acesso: usuário logado e com a conta liberada
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function requireAccess(authorization: string | undefined) {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new HttpError(500, 'Servidor sem Supabase configurado.')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Entre na sua conta para buscar.')
  const headers = { apikey: anon, Authorization: authorization }
  const userRes = await fetch(`${url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(6000) })
  if (!userRes.ok) throw new HttpError(401, 'Sua sessão expirou. Entre de novo.')
  const user = (await userRes.json()) as { id: string }
  // RLS: com o token do próprio usuário, só a linha dele volta
  const profRes = await fetch(`${url}/rest/v1/profiles?select=plano,teste_ate&user_id=eq.${user.id}`, { headers, signal: AbortSignal.timeout(6000) })
  const [profile] = profRes.ok ? ((await profRes.json()) as { plano: string; teste_ate: string }[]) : []
  if (profile?.plano === 'cancelado') throw new HttpError(403, 'Sua assinatura está pausada.')
  if (profile?.plano === 'teste' && Date.parse(profile.teste_ate) <= Date.now()) throw new HttpError(403, 'Seu teste grátis terminou.')
}

// ---------------------------------------------------------------------------
// Handler (Vercel / Node)
// ---------------------------------------------------------------------------

interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  try {
    const auth = req.headers.authorization
    await requireAccess(Array.isArray(auth) ? auth[0] : auth)
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})) as Record<string, unknown>

    if (body.acao === 'enriquecer') {
      const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 12) as EnrichItem[]
      const out = await Promise.all(itens.filter((i) => i && typeof i.website === 'string' && i.website).map(enrichOne))
      return res.status(200).json({ itens: out })
    }

    const key = process.env.GOOGLE_PLACES_KEY
    if (!key) throw new HttpError(503, 'A busca ainda não foi configurada: falta a chave do Google (GOOGLE_PLACES_KEY).')
    const input = body as unknown as SearchBody
    if (!Array.isArray(input.niches) || !input.niches.length) throw new HttpError(400, 'Escolha ao menos um nicho.')
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new HttpError(400, 'Escolha a cidade ou um ponto no mapa.')
    input.qualification ??= { phone: 0, website: 0, instagram: 0 }
    return res.status(200).json(await search(key, input))
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error && err.name !== 'AbortError' ? err.message : 'A busca demorou demais. Tente um raio menor.'
    return res.status(status).json({ error: message })
  }
}
