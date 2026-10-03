/**
 * Enriquecimento de leads: links externos, telefone, CNPJ e responsável (QSA).
 * Reconstruído a partir do Caldeira Nexus (Luis Caldeira), com autorização dele.
 */
import dns from 'node:dns/promises'
import net from 'node:net'

const blockedHosts = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|gstatic\.com|googleapis\.com)$/i
const socialHosts = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|linkedin\.com|wa\.me|whatsapp\.com)$/i

/** Desembrulha links de redirecionamento do Google (…/url?q=…). */
export function unwrapExternalUrl(rawHref: string): string {
  try {
    const parsed = new URL(rawHref, 'https://www.google.com')
    const redirected = parsed.hostname.includes('google.') ? parsed.searchParams.get('q') || parsed.searchParams.get('url') : null
    const candidate = redirected ? new URL(redirected) : parsed
    if (!/^https?:$/.test(candidate.protocol) || blockedHosts.test(candidate.hostname)) return ''
    candidate.hash = ''
    // Parâmetros de rastreamento (Instagram, Google Reserve, campanhas) não fazem parte do endereço
    if (/(^|\.)instagram\.com$/i.test(candidate.hostname)) candidate.search = ''
    for (const key of [...candidate.searchParams.keys()]) {
      if (/^(utm_|igsh|igshid|rwg_token|source|fbclid|gclid|g_ep)/i.test(key)) candidate.searchParams.delete(key)
    }
    return candidate.toString()
  } catch {
    return ''
  }
}

export function classifyExternalLinks(rawHrefs: string[]): { website: string; instagram: string } {
  let website = ''
  let instagram = ''
  for (const rawHref of rawHrefs) {
    const href = unwrapExternalUrl(rawHref)
    if (!href) continue
    const hostname = new URL(href).hostname
    if (/(^|\.)instagram\.com$/i.test(hostname)) {
      // Só perfis de verdade: "instagram.com/" (ícone genérico) ou /p/, /explore/ não contam
      const handle = new URL(href).pathname.split('/').filter(Boolean)[0] ?? ''
      if (handle && !['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv'].includes(handle.toLowerCase())) instagram ||= href
      continue
    }
    if (!socialHosts.test(hostname)) website ||= href
  }
  return { website, instagram }
}

/** Normaliza para 55 + DDD + número; aceita o "0" de tronco ("035 3715-3269"). Sem DDD, devolve vazio. */
export function normalizeBrazilPhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  // 0 + operadora (2 dígitos) + DDD + número: "0 15 35 3715-3269"
  if ((d.length === 13 || d.length === 14) && d.startsWith('0') && !d.startsWith('055')) d = d.slice(3)
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return ''
}

/** Primeiro telefone brasileiro do texto, com DDI 55. */
export function extractBrazilPhone(text: string): string {
  const re = /(?:\+?55[\s-]*)?(?:\(?0?\d{2}\)?[\s-]*)(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/g
  for (const m of String(text || '').matchAll(re)) {
    const phone = normalizeBrazilPhone(m[0])
    if (phone) return phone
  }
  return ''
}

/** Celular brasileiro (55 + DDD + 9 + 8 dígitos) — candidato a WhatsApp. */
export function looksLikeMobile(phone: string): boolean {
  return phone.length === 13 && phone[4] === '9'
}

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------

export function isValidCnpj(value: string): boolean {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false
  const calc = (length: number) => {
    let factor = length - 7
    let total = 0
    for (let i = 0; i < length; i++) {
      total += Number(digits[i]) * factor--
      if (factor < 2) factor = 9
    }
    const r = total % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13])
}

export function extractCnpj(text: string): string {
  const candidates = String(text || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []
  for (const c of candidates) {
    const d = c.replace(/\D/g, '')
    if (d.length === 14 && isValidCnpj(d)) return d
  }
  return ''
}

const RESPONSIBLE_PRIORITY = ['socio-administrador', 'administrador', 'titular', 'presidente', 'diretor', 'socio']

const strip = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface QsaMember {
  nome_socio?: string
  nome?: string
  qualificacao_socio?: string
  qualificacao?: string
}

export function selectResponsible(qsa: QsaMember[]): { name: string; role: string } {
  const people = (Array.isArray(qsa) ? qsa : [])
    .map((m) => ({ name: String(m?.nome_socio || m?.nome || '').trim(), role: String(m?.qualificacao_socio || m?.qualificacao || '').trim() }))
    .filter((m) => m.name)
  const rank = (role: string) => {
    const i = RESPONSIBLE_PRIORITY.findIndex((p) => strip(role).includes(p))
    return i === -1 ? 99 : i
  }
  people.sort((a, b) => rank(a.role) - rank(b.role))
  return people[0] ?? { name: '', role: '' }
}

function normalizeIdentity(v: unknown): string {
  return strip(String(v || ''))
    .replace(/\b(ltda|me|eireli|sa|s a|empresa|comercio|servicos?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface CnpjData {
  razao_social?: string
  nome_fantasia?: string
  ddd_telefone_1?: string
  ddd_telefone_2?: string
  municipio?: string
  uf?: string
  qsa?: QsaMember[]
  descricao_situacao_cadastral?: string
}

/** O CNPJ encontrado no site é mesmo desta empresa? Nome precisa bater; telefone e cidade não podem divergir. */
export function matchesCompanyIdentity(data: CnpjData, identity: { name: string; phone: string; city: string }): boolean {
  const expectedName = normalizeIdentity(identity.name)
  if (!expectedName) return false
  const registered = [data?.razao_social, data?.nome_fantasia].map(normalizeIdentity).filter(Boolean)
  const tokens = new Set(expectedName.split(' ').filter((t) => t.length >= 3))
  const nameOk = registered.some((r) => {
    if (r.includes(expectedName) || expectedName.includes(r)) return true
    const shared = r.split(' ').filter((t) => tokens.has(t))
    return shared.length >= Math.min(2, tokens.size)
  })
  if (!nameOk) return false
  const phone = String(identity.phone || '').replace(/\D/g, '').slice(-8)
  const regPhones = [data?.ddd_telefone_1, data?.ddd_telefone_2].map((v) => String(v || '').replace(/\D/g, '').slice(-8))
  if (phone && regPhones.some(Boolean) && !regPhones.includes(phone)) return false
  const city = normalizeIdentity(identity.city)
  const regCity = normalizeIdentity(data?.municipio)
  return !(city && regCity && !city.includes(regCity) && !regCity.includes(city))
}

export type Confidence = 'confirmed' | 'review' | 'not_found'

export interface CompanyResult {
  cnpj: string
  responsibleName: string
  responsibleRole: string
  confidence: Confidence
  source: string
}

const cache = new Map<string, { expiresAt: number; data: CnpjData }>()

export async function enrichCompanyByCnpj(cnpj: string, identity: { name: string; phone: string; city: string }): Promise<CompanyResult> {
  if (!isValidCnpj(cnpj)) return { cnpj: '', responsibleName: '', responsibleRole: '', confidence: 'not_found', source: '' }
  try {
    const hit = cache.get(cnpj)
    let data = hit && hit.expiresAt > Date.now() ? hit.data : null
    if (!data) {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'User-Agent': 'XSProspeccao/1.0 company-enrichment' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return { cnpj, responsibleName: '', responsibleRole: '', confidence: 'review', source: 'CNPJ achado no site; dados públicos indisponíveis' }
      data = (await res.json()) as CnpjData
      cache.set(cnpj, { expiresAt: Date.now() + 24 * 3_600_000, data })
    }
    if (!matchesCompanyIdentity(data, identity)) {
      return { cnpj, responsibleName: '', responsibleRole: '', confidence: 'review', source: 'CNPJ achado, mas nome/telefone/cidade não conferem' }
    }
    const r = selectResponsible(data.qsa || [])
    return {
      cnpj,
      responsibleName: r.name,
      responsibleRole: r.role,
      confidence: r.name ? 'confirmed' : 'review',
      source: 'BrasilAPI · dados públicos do CNPJ',
    }
  } catch {
    return { cnpj, responsibleName: '', responsibleRole: '', confidence: 'review', source: 'CNPJ achado no site; consulta indisponível' }
  }
}

// ---------------------------------------------------------------------------
// Segurança: o navegador automatizado só visita endereços públicos
// ---------------------------------------------------------------------------

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (net.isIPv6(address)) {
    const n = address.toLowerCase()
    return (
      n === '::' || n === '::1' || n.startsWith('fc') || n.startsWith('fd') || /^fe[89ab]/.test(n) || n.startsWith('::ffff:127.') || n.startsWith('::ffff:10.') || n.startsWith('::ffff:192.168.')
    )
  }
  return true
}

export async function assertSafePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('URL externa não permitida.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Destino privado não permitido.')
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((e) => isPrivateIp(e.address))) throw new Error('Destino privado não permitido.')
  return url
}
