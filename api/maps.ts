// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Busca de empresas da XS: base aberta de comércios (grátis) ou Google (chave do próprio usuário).
 *
 * POST /api/maps { acao: 'base', ... }            → base aberta (Overture Maps), pelo servidor da XS na VPS
 * POST /api/maps { acao: 'google', chave, ... }   → empresas do Google Maps na cidade/bairros
 * POST /api/maps { acao: 'testar', chave }        → confere a chave (consulta grátis do Google)
 * POST /api/maps { acao: 'enriquecer', itens }    → abre o site da empresa: Instagram e CNPJ/sócio
 *
 * Só atende quem está logado com acesso liberado (teste em dia, plano ativo ou vitalício).
 * A base aberta fica na VPS (XS_BUSCA_URL + XS_BUSCA_TOKEN, só aqui no servidor).
 * A chave do Google é do usuário: cada conta usa a própria cota grátis do Google, e a XS não paga nada.
 * Cada consulta ao Google conta 1 na cota do mês; o app manda quantas ainda pode gastar
 * (`restante`) e esta função nunca passa disso.
 *
 * Arquivo único de propósito: a Vercel compila cada função sozinha, então as regras
 * puras ficam aqui mesmo (exportadas para os testes).
 */
import dns from 'node:dns/promises'
import net from 'node:net'

export const config = { maxDuration: 30 }

type Mode = 1 | 0 | -1

export interface GoogleBody {
  chave: string
  /** Textos da busca (um por nicho) e o nome do nicho que vai para o lead */
  nichos: { nome: string; busca: string }[]
  /** "Cidade, UF" */
  cidade: string
  /** Caixa da cidade (Nominatim): sul, norte, oeste, leste */
  caixa: [number, number, number, number]
  bairros?: string[]
  meta: number
  filtros?: { telefone?: Mode; site?: Mode; celular?: Mode }
  conhecidos?: { telefones?: string[]; maps?: string[] }
  pular?: boolean
  /** Consultas que ainda cabem na cota do mês */
  restante: number
}

/** Mesmo formato de resultado que o app usa (src/lib/mapsSearch.ts). */
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
  neighborhood: string
  cnpj: string
  responsibleName: string
  responsibleRole: string
  enrichmentConfidence: 'confirmed' | 'review' | 'not_found'
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
  addressComponents?: {
    longText?: string
    shortText?: string
    types?: string[]
  }[]
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

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

/** Igual a phoneKey de src/lib/duplicates.ts. */
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

const passes = (mode: Mode | undefined, has: boolean) => !mode || (mode === 1 ? has : !has)

export const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Muita empresa cadastra o perfil do Instagram (ou Facebook/linktree) como "site" no Google. */
export function isInstagramUrl(url: string | undefined): boolean {
  try {
    return /(^|\.)instagram\.com$/i.test(new URL(url ?? '').hostname)
  } catch {
    return false
  }
}
export function isSocialUrl(url: string | undefined): boolean {
  try {
    return /(^|\.)(instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|whatsapp\.com|tiktok\.com|ifood\.com\.br)$/i.test(new URL(url ?? '').hostname)
  } catch {
    return false
  }
}

/** Divide a caixa da cidade em n×n pedaços: o Google devolve no máximo 60 lugares por consulta. */
export function tilesOf(caixa: GoogleBody['caixa'], n: number) {
  const [sul, norte, oeste, leste] = caixa
  const dLat = (norte - sul) / n
  const dLng = (leste - oeste) / n
  const out: {
    low: { latitude: number; longitude: number }
    high: { latitude: number; longitude: number }
  }[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push({
        low: { latitude: sul + i * dLat, longitude: oeste + j * dLng },
        high: {
          latitude: sul + (i + 1) * dLat,
          longitude: oeste + (j + 1) * dLng,
        },
      })
  // Do centro para fora: as primeiras consultas pegam a parte mais movimentada
  const cLat = (sul + norte) / 2
  const cLng = (oeste + leste) / 2
  const dist = (t: (typeof out)[number]) => ((t.low.latitude + t.high.latitude) / 2 - cLat) ** 2 + ((t.low.longitude + t.high.longitude) / 2 - cLng) ** 2
  return out.sort((a, b) => dist(a) - dist(b))
}

/** Converte um lugar do Google no resultado do app. */
export function toResult(p: Place, niche: string): MapsResult {
  const comp = (type: string, short = false) => {
    const c = p.addressComponents?.find((x) => x.types?.includes(type))
    return (short ? c?.shortText : c?.longText) ?? ''
  }
  const phone = normalizeBrazilPhone(p.nationalPhoneNumber || p.internationalPhoneNumber)
  const social = isSocialUrl(p.websiteUri)
  return {
    id: p.id,
    name: p.displayName?.text?.trim() || 'Sem nome',
    niche,
    phone,
    website: social ? '' : (p.websiteUri ?? ''),
    instagram: isInstagramUrl(p.websiteUri) ? (p.websiteUri ?? '') : '',
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
    hasWhatsapp: looksLikeMobile(phone),
    recurring: false,
    source: 'google',
    category: p.primaryTypeDisplayName?.text ?? '',
  }
}

/** Telefone, celular e site conforme os filtros. */
export function qualifies(r: MapsResult, f: GoogleBody['filtros'] = {}): boolean {
  return passes(f.telefone, !!r.phone) && passes(f.celular, r.hasWhatsapp) && passes(f.site, !!r.website)
}

/** O lugar é da cidade escolhida? (a caixa da cidade pega pedaço das vizinhas) */
export function inCity(r: MapsResult, cidade: string): boolean {
  const alvo = norm(cidade.split(',')[0])
  if (!alvo || !r.city) return true
  return norm(r.city) === alvo
}

/** O lugar é de um dos bairros escolhidos? (pelo endereço que o Google devolve) */
export function inBairros(r: MapsResult, bairros: string[]): boolean {
  if (!bairros.length) return true
  const onde = ` ${norm(r.neighborhood)} ${norm(r.address)} `
  return bairros.some((b) => {
    const n = norm(b)
    return !!n && onde.includes(` ${n} `)
  })
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
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',')

/** Teto de consultas numa busca só (cada uma traz até 20 lugares). */
export const MAX_CALLS = 40

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Traduz o erro do Google para o que o usuário precisa fazer. */
export function googleError(
  status: number,
  data: {
    error?: {
      message?: string
      status?: string
      details?: { reason?: string }[]
    }
  },
): HttpError {
  const msg = data.error?.message ?? ''
  const reason = data.error?.details?.find((d) => d.reason)?.reason ?? ''
  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(msg))
    return new HttpError(400, 'A chave do Google não é válida. Confira se copiou a chave inteira em Ajustes → Busca do Google.')
  if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(msg))
    return new HttpError(
      400,
      'A "Places API (New)" ainda não está ativada no projeto da sua chave. Ative em console.cloud.google.com (passo 3 do guia em Ajustes) e espere 2 minutos.',
    )
  if (/billing/i.test(msg) || reason === 'BILLING_DISABLED')
    return new HttpError(400, 'O Google pede uma conta de faturamento ligada ao projeto da chave (passo 2 do guia em Ajustes). Ela não cobra nada dentro da cota grátis.')
  if (reason === 'API_KEY_SERVICE_BLOCKED' || reason === 'API_KEY_HTTP_REFERRER_BLOCKED' || reason === 'API_KEY_IP_ADDRESS_BLOCKED')
    return new HttpError(400, 'A chave está restrita e bloqueou a XS. Em "Restrições do aplicativo", deixe "Nenhuma", e em "Restrições de API" deixe só a Places API (New).')
  if (status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED')
    return new HttpError(429, 'O Google atingiu o limite de consultas da sua chave (cota do dia ou do mês). Tente amanhã ou aumente a cota no Google Cloud.')
  if (status === 403) return new HttpError(400, `O Google recusou a chave: ${msg || 'sem permissão'}.`)
  return new HttpError(502, `O Google não respondeu (${msg || `erro ${status}`}). Tente de novo.`)
}

async function searchText(key: string, body: Record<string, unknown>, fields: string, signal: AbortSignal): Promise<{ places: Place[]; nextPageToken?: string }> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify(body),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as {
    places?: Place[]
    nextPageToken?: string
    error?: { message?: string; status?: string }
  }
  if (!res.ok) throw googleError(res.status, data)
  return { places: data.places ?? [], nextPageToken: data.nextPageToken }
}

/** Confere a chave pedindo só o id de um lugar: no Google, essa consulta é grátis e ilimitada. */
async function testKey(key: string) {
  await searchText(
    key,
    {
      textQuery: 'padaria em São Paulo',
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: 1,
    },
    'places.id',
    AbortSignal.timeout(10_000),
  )
  return { ok: true }
}

interface Job {
  nome: string
  busca: string
  rect?: ReturnType<typeof tilesOf>[number]
  bairro?: string
}

export function planJobs(input: Pick<GoogleBody, 'nichos' | 'cidade' | 'caixa' | 'bairros' | 'meta'>): Job[] {
  const cidade = input.cidade.trim()
  const bairros = (input.bairros ?? [])
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 20)
  const jobs: Job[] = []
  for (const n of input.nichos) {
    if (bairros.length) {
      for (const b of bairros)
        jobs.push({
          nome: n.nome,
          busca: `${n.busca} no bairro ${b}, ${cidade}`,
          bairro: b,
        })
      continue
    }
    // A cidade inteira primeiro; se a meta for grande, pedaços dela (do centro para fora)
    jobs.push({
      nome: n.nome,
      busca: `${n.busca} em ${cidade}`,
      rect: tilesOf(input.caixa, 1)[0],
    })
    const n2 = input.meta > 150 ? 3 : input.meta > 50 ? 2 : 0
    if (n2) for (const rect of tilesOf(input.caixa, n2)) jobs.push({ nome: n.nome, busca: n.busca, rect })
  }
  return jobs
}

export async function searchGoogle(input: GoogleBody) {
  const started = Date.now()
  const target = Math.max(5, Math.min(300, Math.round(input.meta) || 30))
  const budget = Math.max(0, Math.min(MAX_CALLS, Math.floor(input.restante)))
  if (!budget) throw new HttpError(429, 'Você já usou todas as consultas do Google deste mês dentro da cota grátis. A busca grátis do OpenStreetMap continua liberada.')
  const knownPhones = new Set(input.conhecidos?.telefones ?? [])
  const knownMaps = new Set(input.conhecidos?.maps ?? [])
  const bairros = (input.bairros ?? []).filter((b) => b.trim())
  const jobs = planJobs(input)

  const seen = new Set<string>()
  const results: MapsResult[] = []
  let found = 0
  let blocked = 0
  let recurring = 0
  let calls = 0
  let lastError: unknown = null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  const enough = () => results.filter((r) => !r.recurring).length >= target

  async function runJob(job: Job) {
    let pageToken: string | undefined
    for (let page = 0; page < 3 && !enough() && calls < budget && !ctrl.signal.aborted; page++) {
      calls++
      const body: Record<string, unknown> = {
        textQuery: job.busca,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
      }
      if (job.rect) body.locationRestriction = { rectangle: job.rect }
      else body.locationBias = { rectangle: tilesOf(input.caixa, 1)[0] }
      if (pageToken) body.pageToken = pageToken
      const { places, nextPageToken } = await searchText(input.chave, body, FIELDS, ctrl.signal)
      for (const p of places) {
        if (!p.id || seen.has(p.id) || p.businessStatus === 'CLOSED_PERMANENTLY' || p.businessStatus === 'CLOSED_TEMPORARILY') continue
        seen.add(p.id)
        const r = toResult(p, job.nome)
        if (!inCity(r, input.cidade) || !inBairros(r, bairros)) continue
        found++
        if (!qualifies(r, input.filtros)) continue
        const pk = phoneKey(r.phone)
        const mk = cidKey(r.mapsUrl)
        if ((pk && knownPhones.has(pk)) || (mk && knownMaps.has(mk))) {
          recurring++
          if (input.pular !== false) {
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
    // Até 4 consultas ao mesmo tempo
    const queue = [...jobs]
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length && !enough() && calls < budget && !ctrl.signal.aborted) {
          try {
            await runJob(queue.shift()!)
          } catch (err) {
            lastError = err
            // Chave ruim ou cota estourada: não adianta continuar
            if (err instanceof HttpError && err.status !== 502) {
              queue.length = 0
              throw err
            }
          }
        }
      }),
    )
  } catch (err) {
    if (!results.length) throw err
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
  if (!results.length && lastError && !found) throw lastError

  // Com telefone primeiro; depois mais avaliações (empresa ativa e conhecida)
  results.sort((a, b) => Number(!!b.phone) - Number(!!a.phone) || b.reviewsCount - a.reviewsCount)
  const fresh = results.filter((r) => !r.recurring).slice(0, target)
  const again = results.filter((r) => r.recurring)
  return {
    results: [...fresh, ...again],
    stats: {
      found,
      approved: fresh.length,
      recurring,
      blocked,
      calls,
      elapsedMs: Date.now() - started,
    },
  }
}

// ---------------------------------------------------------------------------
// Instagram e CNPJ a partir do site público da empresa
// ---------------------------------------------------------------------------

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
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
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XSProspeccao/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertSafePublicUrl(new URL(loc, url).toString())
      continue
    }
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') ?? 'text/html')) return ''
    return (await res.text()).slice(0, 800_000)
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

/** Páginas de domínio estacionado / à venda não contam como site da empresa. */
export function looksParked(html: string): boolean {
  return /domain (is )?for sale|dom[ií]nio (est[aá] )?(à|a) venda|this domain is parked|parked domain|p[aá]gina em constru[cç][aã]o|site em constru[cç][aã]o|coming soon/i.test(
    html.slice(0, 20_000),
  )
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

const identity = (v: unknown) =>
  norm(v)
    .replace(/\b(ltda|me|eireli|sa|s a|empresa|comercio|servicos?)\b/g, ' ')
    .replace(/\s+/g, ' ')
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
  const reg = [data.ddd_telefone_1, data.ddd_telefone_2].map((v) =>
    String(v || '')
      .replace(/\D/g, '')
      .slice(-8),
  )
  if (phone && reg.some(Boolean) && !reg.includes(phone)) return false
  const city = identity(who.city)
  const regCity = identity(data.municipio)
  return !(city && regCity && !city.includes(regCity) && !regCity.includes(city))
}

const ROLE_ORDER = ['socio administrador', 'administrador', 'titular', 'presidente', 'diretor', 'socio']

interface EnrichItem {
  id: string
  website: string
  name: string
  phone: string
  city: string
}

async function enrichOne(it: EnrichItem) {
  const out = {
    id: it.id,
    alive: false,
    instagram: '',
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found' as MapsResult['enrichmentConfidence'],
    enrichmentSource: '',
  }
  let html = ''
  try {
    html = await fetchSite(it.website)
  } catch {
    return out
  }
  if (html.length < 300 || looksParked(html)) return out
  out.alive = true
  out.instagram = findInstagram(html)
  const cnpj = findCnpj(html.replace(/<[^>]+>/g, ' '))
  if (!cnpj) return out
  out.cnpj = cnpj
  out.enrichmentConfidence = 'review'
  out.enrichmentSource = 'CNPJ achado no site; consulta indisponível'
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { 'User-Agent': 'XSProspeccao/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return out
    const data = (await res.json()) as CnpjData
    if (!matchesCompany(data, it)) {
      out.enrichmentSource = 'CNPJ achado no site, mas nome/telefone/cidade não conferem'
      return out
    }
    const people = (data.qsa ?? [])
      .map((m) => ({
        name: String(m.nome_socio ?? '').trim(),
        role: String(m.qualificacao_socio ?? '').trim(),
      }))
      .filter((m) => m.name)
    const rank = (role: string) => {
      const i = ROLE_ORDER.findIndex((r) => norm(role).includes(r))
      return i === -1 ? 99 : i
    }
    people.sort((a, b) => rank(a.role) - rank(b.role))
    out.enrichmentConfidence = 'confirmed'
    out.enrichmentSource = 'Site da empresa + dados públicos do CNPJ'
    if (people[0]) {
      out.responsibleName = people[0].name
      out.responsibleRole = people[0].role
    }
  } catch {
    /* fica como "conferir" */
  }
  return out
}

// ---------------------------------------------------------------------------
// Acesso: usuário logado e com a conta liberada
// ---------------------------------------------------------------------------

async function requireAccess(authorization: string | undefined) {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new HttpError(500, 'Servidor sem Supabase configurado.')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Entre na sua conta para buscar.')
  const headers = { apikey: anon, Authorization: authorization }
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(6000),
  })
  if (!userRes.ok) throw new HttpError(401, 'Sua sessão expirou. Entre de novo.')
  const user = (await userRes.json()) as { id: string }
  // RLS: com o token do próprio usuário, só a linha dele volta
  const profRes = await fetch(`${url}/rest/v1/profiles?select=*&user_id=eq.${user.id}`, { headers, signal: AbortSignal.timeout(6000) })
  const [profile] = profRes.ok
    ? ((await profRes.json()) as {
        plano: string
        teste_ate: string
        plano_ate?: string | null
      }[])
    : []
  if (profile?.plano === 'cancelado') throw new HttpError(403, 'Sua assinatura está pausada.')
  if (profile?.plano === 'teste' && Date.parse(profile.teste_ate) <= Date.now()) throw new HttpError(403, 'Seu teste grátis terminou.')
  if (profile?.plano === 'ativo' && profile.plano_ate && Date.parse(profile.plano_ate) <= Date.now()) throw new HttpError(403, 'Seu plano venceu.')
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

export default function handler(req: Req, res: Res) {
  return handle(req, res, { skipAuth: false })
}

const validKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{30,60}$/.test(k.trim())

/** Repassa a busca para a base aberta de comércios, no servidor da XS (VPS). */
async function buscaBase(input: Record<string, unknown>): Promise<unknown> {
  const base = process.env.XS_BUSCA_URL?.replace(/\/+$/, '')
  const token = process.env.XS_BUSCA_TOKEN
  if (!base || !token) throw new HttpError(503, 'A busca grátis ainda não foi configurada no servidor. Use a busca do Google por enquanto.')
  let res: Response
  try {
    res = await fetch(`${base}/lugares/buscar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(502, 'A base aberta não respondeu agora. Tente de novo em instantes ou use a busca do Google.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (res.status === 404 || res.status === 502) throw new HttpError(503, 'A busca grátis ainda está sendo instalada no servidor. Use a busca do Google por enquanto.')
  if (!res.ok) throw new HttpError(res.status === 401 ? 502 : res.status, data.error || `Falha na base aberta (${res.status}).`)
  return data
}

const isStrList = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= 80)

/**
 * `skipAuth` só é usado pelo npm run dev no modo local (sem Supabase, sem contas):
 * na Vercel a função publicada é sempre o `handler` acima, que confere o login.
 */
export async function handle(req: Req, res: Res, opts: { skipAuth: boolean }) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  try {
    const auth = req.headers.authorization
    if (!opts.skipAuth) await requireAccess(Array.isArray(auth) ? auth[0] : auth)
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})) as Record<string, unknown>

    if (body.acao === 'enriquecer') {
      const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 12) as EnrichItem[]
      const ok = itens.filter((i) => i && typeof i.website === 'string' && i.website && typeof i.name === 'string')
      return res.status(200).json({
        itens: await Promise.all(
          ok.map((i) =>
            enrichOne({
              ...i,
              phone: String(i.phone ?? ''),
              city: String(i.city ?? ''),
            }),
          ),
        ),
      })
    }

    if (body.acao === 'base') {
      const nichos = (Array.isArray(body.nichos) ? body.nichos : []) as {
        nome?: unknown
        tax?: unknown
        nomes?: unknown
      }[]
      const ok = nichos.slice(0, 10).filter((n) => n && typeof n.nome === 'string' && isStrList(n.tax, 60) && isStrList(n.nomes, 20))
      if (!ok.length) throw new HttpError(400, 'Escolha ao menos um tipo de negócio.')
      if (typeof body.cidade !== 'string' || !body.cidade.trim() || typeof body.uf !== 'string' || !/^[A-Za-z]{2}$/.test(body.uf)) throw new HttpError(400, 'Escolha a cidade.')
      const { acao: _a, ...input } = body
      return res.status(200).json(await buscaBase({ ...input, nichos: ok }))
    }

    if (body.acao === 'testar') {
      if (!validKey(body.chave)) throw new HttpError(400, 'Isso não parece uma chave do Google. Ela começa com "AIza" e tem uns 39 caracteres.')
      return res.status(200).json(await testKey(body.chave.trim()))
    }

    if (body.acao === 'google') {
      const input = body as unknown as GoogleBody
      if (!validKey(input.chave)) throw new HttpError(400, 'Coloque a sua chave do Google em Ajustes → Busca do Google.')
      if (!Array.isArray(input.nichos) || !input.nichos.length) throw new HttpError(400, 'Escolha ao menos um tipo de negócio.')
      if (!String(input.cidade ?? '').trim()) throw new HttpError(400, 'Escolha a cidade.')
      if (!Array.isArray(input.caixa) || input.caixa.length !== 4 || !input.caixa.every(Number.isFinite))
        throw new HttpError(400, 'Localize a cidade de novo (falta a área no mapa).')
      input.chave = input.chave.trim()
      input.nichos = input.nichos.filter((n) => n && typeof n.nome === 'string' && typeof n.busca === 'string').slice(0, 10)
      return res.status(200).json(await searchGoogle(input))
    }

    throw new HttpError(400, 'Ação desconhecida.')
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error && err.name !== 'AbortError' ? err.message : 'A busca demorou demais. Tente com menos tipos de negócio.'
    return res.status(status).json({ error: message })
  }
}
