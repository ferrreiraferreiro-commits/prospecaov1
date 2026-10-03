/**
 * Busca de empresas no Google Maps com cobertura territorial (malha polar),
 * qualificação por telefone/site/Instagram e enriquecimento de CNPJ.
 * Reconstruído do módulo "Prospecção pelo Maps" do Caldeira Nexus (Luis Caldeira).
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { assertSafePublicUrl, classifyExternalLinks, enrichCompanyByCnpj, extractBrazilPhone, extractCnpj, looksLikeMobile, normalizeBrazilPhone, type Confidence } from './enrich.js'
import { readJson, writeJson } from './store.js'

/** 1 = obrigatório, -1 = excluir, 0 = tanto faz */
export type Mode = 1 | -1 | 0
export type ExistingPolicy = 'block' | 'allow'

export interface SearchInput {
  niches: string[]
  location: string
  lat?: number
  lng?: number
  radiusKm: number
  targetLeads: number
  qualification: { phone: Mode; website: Mode; instagram: Mode }
  analyzeSites: boolean
  existingPolicy: ExistingPolicy
  /** Chaves dos leads que já estão no app (telefone e Maps), para não repetir */
  known: { phones: string[]; maps: string[] }
}

export interface MapsLead {
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
  enrichmentConfidence: Confidence
  enrichmentSource: string
  hasWhatsapp: boolean
  recurring: boolean
}

type Phase = 'idle' | 'geocoding' | 'connecting' | 'scrolling' | 'enriching' | 'processing' | 'completed' | 'cancelled' | 'error'

interface State {
  runId: string | null
  active: boolean
  phase: Phase
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
  input: Omit<SearchInput, 'known'> | null
  results: MapsLead[]
  logs: string[]
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  elapsedMs: number
  /** O app já importou estes resultados para os leads */
  imported: boolean
}

const LAST_FILE = 'maps-ultima-busca.json'

function freshState(): State {
  return {
    runId: null,
    active: false,
    phase: 'idle',
    message: 'Pronto para buscar.',
    progress: 0,
    cardsFound: 0,
    approvedCount: 0,
    discarded: 0,
    recurringDetected: 0,
    recurringBlocked: 0,
    currentSector: 0,
    totalSectors: 0,
    center: null,
    input: null,
    results: [],
    logs: [],
    error: null,
    startedAt: null,
    finishedAt: null,
    elapsedMs: 0,
    imported: true,
  }
}

// A última busca sobrevive a um reinício do motor (o app ainda pode importá-la).
const state: State = { ...freshState(), ...readJson<Partial<State>>(LAST_FILE, {}), active: false }
if (state.phase !== 'completed' && state.phase !== 'idle' && state.phase !== 'error' && state.phase !== 'cancelled') state.phase = 'cancelled'

let browser: Browser | null = null
let abort: AbortController | null = null

const STOPPED = 'Busca interrompida.'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new Error(STOPPED))
      },
      { once: true },
    )
  })
}

function log(message: string) {
  state.logs = [...state.logs.slice(-119), `${new Date().toLocaleTimeString('pt-BR')} · ${message}`]
  state.message = message
}

export function getMapsState(): State {
  if (state.active && state.startedAt) state.elapsedMs = Date.now() - Date.parse(state.startedAt)
  return state
}

export function ackMaps(runId: string) {
  if (state.runId === runId) {
    state.imported = true
    persist()
  }
}

function persist() {
  const { active: _a, ...rest } = state
  writeJson(LAST_FILE, rest)
}

// ---------------------------------------------------------------------------
// Geometria da cobertura
// ---------------------------------------------------------------------------

export function calculateZoom(lat: number, radiusKm: number, usableWidth = 620): number {
  const diameterM = Math.max(0.3, radiusKm) * 2000
  const mpp = diameterM / usableWidth
  const zoom = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp)
  return Math.min(17, Math.max(3, Math.round(zoom * 100) / 100))
}

export function createMapsSearchUrl(niche: string, lat: number, lng: number, radiusKm: number): string {
  const query = niche.trim().replace(/\s+/g, '+')
  return `https://www.google.com/maps/search/${encodeURIComponent(query).replace(/%2B/g, '+')}/@${lat.toFixed(6)},${lng.toFixed(6)},${calculateZoom(lat, radiusKm)}z?hl=pt-BR&gl=BR`
}

interface Point {
  lat: number
  lng: number
  label: string
}

/** Centro + anéis concêntricos: 19 pontos até 5 km, 41 acima disso. */
export function buildCoverageCenters(lat: number, lng: number, radiusKm: number): Point[] {
  const centers: Point[] = [{ lat, lng, label: 'centro' }]
  const latKm = 110.574
  const lngKm = 111.32 * Math.max(0.12, Math.cos((lat * Math.PI) / 180))
  const rings =
    radiusKm <= 5
      ? [
          { factor: 0.45, points: 6 },
          { factor: 0.82, points: 12 },
        ]
      : [
          { factor: 0.2, points: 4 },
          { factor: 0.4, points: 8 },
          { factor: 0.62, points: 12 },
          { factor: 0.84, points: 16 },
        ]
  for (const ring of rings) {
    for (let i = 0; i < ring.points; i++) {
      const angle = (i / ring.points) * Math.PI * 2
      const d = radiusKm * ring.factor
      centers.push({ lat: lat + (Math.sin(angle) * d) / latKm, lng: lng + (Math.cos(angle) * d) / lngKm, label: `setor ${centers.length}` })
    }
  }
  return centers
}

/** Intercala centro, bairros intermediários e borda para não concentrar a amostra. */
export function buildBalancedCoverageCenters(lat: number, lng: number, radiusKm: number): Point[] {
  const centers = buildCoverageCenters(lat, lng, radiusKm)
  const rings: Point[][] = [[], [], [], []]
  for (const item of centers.slice(1)) {
    const ratio = distanceKm({ lat, lng }, item) / Math.max(radiusKm, 0.1)
    rings[ratio >= 0.73 ? 0 : ratio >= 0.52 ? 1 : ratio >= 0.31 ? 2 : 3].push(item)
  }
  const mixed = [centers[0]]
  for (let i = 0; rings.some((r) => i < r.length); i++) for (const r of rings) if (r[i]) mixed.push(r[i])
  return mixed
}

/** Mistura topo, meio e cauda de cada lista para não pegar só os mais famosos. */
export function selectDiversifiedSectorCards<T>(items: T[], limit: number, sectorIndex: number): T[] {
  const desired = Math.max(0, Math.min(Math.trunc(limit), items.length))
  if (desired === items.length) return [...items]
  const third = Math.ceil(items.length / 3)
  const bands = [items.slice(0, third), items.slice(third, third * 2), items.slice(third * 2)]
  const out: T[] = []
  for (let round = 0; out.length < desired && bands.some((b) => round < b.length); round++) {
    for (let b = 0; b < bands.length && out.length < desired; b++) {
      const band = bands[(b + sectorIndex) % bands.length]
      if (round < band.length) out.push(band[round])
    }
  }
  return out
}

export function getCandidateTarget(quota: number, q: SearchInput['qualification']): number {
  const active = [q.phone, q.website, q.instagram].filter((m) => m !== 0).length
  return Math.min(2000, Math.max(quota * (3 + active * 3), quota + 20 + active * 15))
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const rad = (v: number) => (v * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function extractCoordinates(href: string): { lat: number; lng: number } {
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(href) || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(href)
  return { lat: m ? Number(m[1]) : 0, lng: m ? Number(m[2]) : 0 }
}

export function isInsideRadius(origin: { lat: number; lng: number }, c: { lat: number; lng: number }, radiusKm: number): boolean {
  const has = Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0)
  return has && distanceKm(origin, c) <= radiusKm + 0.25
}

function extractPlaceId(href: string): string {
  const m = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(href)
  if (m?.[1]) return m[1].toLowerCase()
  const slug = /\/maps\/place\/([^/@?]+)/.exec(href)?.[1] || ''
  return slug ? `slug:${slug.slice(0, 80).toLowerCase()}` : `h:${Buffer.from(href).toString('base64url').slice(0, 40)}`
}

// ---------------------------------------------------------------------------
// Identidade (mesma regra do app: DDD + 8 últimos dígitos; lugar do Maps)
// ---------------------------------------------------------------------------

export function phoneKey(tel: string): string | null {
  let d = tel.replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return `${d.slice(0, 2)}${d.slice(-8)}`
  return d.slice(-8)
}

export function mapsKey(url: string): string | null {
  if (!url) return null
  const f = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)
  if (f) return f[1].toLowerCase()
  const p = url.match(/(ChIJ[\w-]{10,})/)
  if (p) return p[1]
  const cid = url.match(/[?&]cid=(\d+)/)
  if (cid) return `cid:${cid[1]}`
  return url.split('?')[0].replace(/\/$/, '').toLowerCase()
}

// ---------------------------------------------------------------------------
// Leitura dos cartões e fichas
// ---------------------------------------------------------------------------

const UF = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))

export function parseCardLocation(text: string, defaultCity: string, defaultState = ''): { city: string; state: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(1)) {
    const matches = [...line.matchAll(/(?:^|,)\s*([^,·]+?)\s*(?:-|,)\s*([A-Z]{2})(?=\b|,|$)/g)]
    const hit = matches.reverse().find((m) => UF.has(m[2]))
    if (!hit) continue
    const city = hit[1].replace(/^.*(?:\s-\s|,)/, '').trim()
    if (city && city.length <= 80) return { city, state: hit[2] }
  }
  return { city: defaultCity, state: UF.has(defaultState) ? defaultState : '' }
}

interface RawCard {
  href: string
  text: string
  site: string
}

function parseCard(card: RawCard, niche: string, city: string, uf: string): MapsLead {
  const lines = card.text.split('\n').map((l) => l.trim()).filter(Boolean)
  let rating = 0
  let reviewsCount = 0
  const r = card.text.match(/(\d+[.,]\d+)\s*\(([\d.]+)\)/)
  if (r) {
    rating = Number.parseFloat(r[1].replace(',', '.')) || 0
    reviewsCount = Number.parseInt(r[2].replace(/\D/g, ''), 10) || 0
  }
  const phone = extractBrazilPhone(card.text)
  const loc = parseCardLocation(card.text, city, uf)
  const social = /^https?:\/\/(www\.)?(instagram\.com|facebook\.com)/i.test(card.site)
  const website = !social && card.site.length > 5 ? card.site : ''
  const instagram = /instagram\.com/i.test(card.site) ? card.site : ''
  const href = card.href.startsWith('http') ? card.href : `https://www.google.com${card.href}`
  return {
    id: extractPlaceId(card.href),
    name: lines[0] || 'Empresa',
    niche,
    phone,
    website,
    instagram,
    address: '',
    city: loc.city,
    state: loc.state,
    rating,
    reviewsCount,
    ...extractCoordinates(card.href),
    mapsUrl: href,
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found',
    enrichmentSource: '',
    hasWhatsapp: looksLikeMobile(phone),
    recurring: false,
  }
}

export async function enrichLead(page: Page, lead: MapsLead, analyzeSites: boolean, signal: AbortSignal): Promise<MapsLead> {
  if (signal.aborted) throw new Error(STOPPED)
  let { website, instagram, phone, address, rating, reviewsCount } = lead
  let cnpj = ''
  try {
    await page.goto(lead.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(700 + Math.floor(Math.random() * 400), signal)
    const detail = await page.evaluate(() => {
      return {
        hrefs: Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href),
        text: document.body?.innerText?.slice(0, 12000) || '',
        address: document.querySelector('button[data-item-id="address"]')?.getAttribute('aria-label') || '',
        phoneId: document.querySelector('button[data-item-id^="phone:tel:"]')?.getAttribute('data-item-id') || '',
        site: document.querySelector('a[data-item-id="authority"]')?.getAttribute('href') || '',
      }
    })
    const links = classifyExternalLinks(detail.site ? [detail.site, ...detail.hrefs] : detail.hrefs)
    website ||= links.website
    instagram ||= links.instagram
    if (detail.phoneId) phone ||= normalizeBrazilPhone(detail.phoneId.replace('phone:tel:', ''))
    phone ||= extractBrazilPhone(detail.text)
    address ||= detail.address.replace(/^Endereço:\s*/i, '').trim()
    if (!rating) {
      // Topo da ficha: "4,9" e "(327)", às vezes em linhas separadas
      const r = detail.text.slice(0, 2500).match(/(?:^|\n)\s*(\d[,.]\d)\s*\n?\s*\(([\d.]+)\)/)
      if (r) {
        rating = Number(r[1].replace(',', '.')) || 0
        reviewsCount = Number(r[2].replace(/\D/g, '')) || 0
      }
    }
    cnpj = extractCnpj(detail.text)
    if (website && analyzeSites) {
      await assertSafePublicUrl(website)
      await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await assertSafePublicUrl(page.url())
      await sleep(400 + Math.floor(Math.random() * 250), signal)
      const site = await page.evaluate(() => ({
        hrefs: Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href),
        text: document.body?.innerText?.slice(0, 30000) || '',
      }))
      instagram ||= classifyExternalLinks(site.hrefs).instagram
      cnpj ||= extractCnpj(site.text)
    }
  } catch (err) {
    if (signal.aborted || (err as Error)?.message === STOPPED) throw err
    if (process.env.XS_DEBUG) console.error(`[maps] ficha de ${lead.name}:`, (err as Error).message)
  }
  const company = cnpj ? await enrichCompanyByCnpj(cnpj, { name: lead.name, phone, city: lead.city }) : null
  return {
    ...lead,
    phone,
    website,
    instagram,
    address,
    rating,
    reviewsCount,
    hasWhatsapp: looksLikeMobile(phone),
    cnpj: company?.cnpj || cnpj,
    responsibleName: company?.responsibleName || '',
    responsibleRole: company?.responsibleRole || '',
    enrichmentConfidence: company?.confidence || 'not_found',
    enrichmentSource: company?.source || '',
  }
}

function matches(present: boolean, mode: Mode): boolean {
  return mode === 0 || (mode === 1 ? present : !present)
}

// ---------------------------------------------------------------------------
// Geocodificação (OpenStreetMap / Nominatim)
// ---------------------------------------------------------------------------

const NOMINATIM_UA = 'XSProspeccao/1.0 (busca local de empresas)'

export async function geocode(location: string): Promise<{ lat: number; lng: number; city: string; state: string; label: string }> {
  const coord = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(location)
  if (coord) return { lat: Number(coord[1]), lng: Number(coord[2]), city: location, state: '', label: location }
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=pt-BR&limit=1&countrycodes=br&q=${encodeURIComponent(location)}`,
    { headers: { 'User-Agent': NOMINATIM_UA }, signal: AbortSignal.timeout(10000) },
  )
  if (!res.ok) throw new Error('Não foi possível localizar a cidade/região informada.')
  const rows = (await res.json()) as { lat: string; lon: string; address?: Record<string, string> }[]
  if (!rows[0]) throw new Error('Localização não encontrada. Informe cidade e UF (ex.: Poços de Caldas, MG).')
  const a = rows[0].address || {}
  const city = a.city || a.town || a.municipality || a.village || location.split(',')[0].trim()
  const uf = String(a['ISO3166-2-lvl4'] || '').split('-').pop() || ''
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon), city, state: uf, label: [city, uf].filter(Boolean).join(', ') }
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; state: string; label: string }> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=pt-BR`, {
    headers: { 'User-Agent': NOMINATIM_UA },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Não foi possível identificar esta área do mapa.')
  const data = (await res.json()) as { address?: Record<string, string> }
  const a = data.address || {}
  const city = a.city || a.town || a.municipality || a.village || a.county || 'Área selecionada'
  const uf = String(a['ISO3166-2-lvl4'] || '').split('-').pop() || ''
  return { city, state: uf, label: [city, uf].filter(Boolean).join(', ') }
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

export function chromeExecutable(): string | undefined {
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(local, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[]
  return candidates.find((c) => fs.existsSync(c))
}

async function closeBrowser() {
  const b = browser
  browser = null
  if (b) await b.close().catch(() => undefined)
}

export async function stopMaps() {
  abort?.abort()
  abort = null
  state.active = false
  await closeBrowser()
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function collectNiche(page: Page, input: SearchInput, niche: string, target: number, geo: { lat: number; lng: number; city: string; state: string }, signal: AbortSignal, onBatch: (n: number, sector: number, total: number) => void): Promise<MapsLead[]> {
  const cards = new Map<string, RawCard>()
  const centers = buildBalancedCoverageCenters(geo.lat, geo.lng, input.radiusKm)
  const perSector = Math.max(2, Math.ceil(Math.min(2000, Math.max(1, target)) / centers.length))
  const passRadius = Math.max(1.2, input.radiusKm <= 5 ? input.radiusKm * 0.38 : input.radiusKm * 0.24)
  log(`Procurando "${niche}" em ${centers.length} setores (até ${perSector} por setor)…`)

  for (let pass = 0; pass < centers.length; pass++) {
    if (signal.aborted) throw new Error(STOPPED)
    const c = centers[pass]
    log(`${niche} · cobrindo ${c.label} (${pass + 1}/${centers.length})…`)
    await page.goto(createMapsSearchUrl(niche, c.lat, c.lng, passRadius), { waitUntil: 'domcontentloaded', timeout: 45000 })
    await sleep(1400, signal)
    const body = (await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '')).toLowerCase()
    if (/recaptcha|não é um rob|not a robot|unusual traffic|tráfego incomum/.test(body)) {
      throw new Error('O Google Maps pediu verificação anti-robô. Espere alguns minutos e tente de novo.')
    }
    if (!(await page.$('div[role="feed"]'))) {
      log(`${niche} · ${c.label} sem lista de empresas; seguindo.`)
      continue
    }
    let stagnant = 0
    let accepted = 0
    while (accepted < perSector && stagnant < 2) {
      if (signal.aborted) throw new Error(STOPPED)
      const extracted = await page.evaluate((limit: number) => {
        const feed = document.querySelector('div[role="feed"]')
        if (!feed) return []
        const seen = new Set<string>()
        const list: { href: string; text: string; site: string }[] = []
        for (const a of Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'))) {
          const href = a.getAttribute('href') || ''
          if (!href || seen.has(href)) continue
          seen.add(href)
          const card = (a.closest('div[jsaction]') || a.parentElement) as HTMLElement | null
          const text = (card?.innerText || '').trim()
          if (!text) continue
          let site = ''
          if (card)
            for (const l of Array.from(card.querySelectorAll('a[href^="http"]'))) {
              const h = l.getAttribute('href') || ''
              if (h.includes('/maps/') || /^https?:\/\/(www\.)?google\./.test(h)) continue
              site = h
              break
            }
          list.push({ href, text: text.slice(0, 900), site })
        }
        return list.slice(0, Math.max(20, Math.trunc(limit)))
      }, Math.max(20, perSector * 5))
      const before = cards.size
      for (const card of selectDiversifiedSectorCards(extracted, perSector * 3, pass)) {
        if (accepted >= perSector) break
        const id = extractPlaceId(card.href)
        if (cards.has(id)) continue
        if (!isInsideRadius(geo, extractCoordinates(card.href), input.radiusKm)) continue
        cards.set(id, card)
        accepted++
      }
      state.cardsFound += Math.max(0, cards.size - before)
      onBatch(cards.size, pass + 1, centers.length)
      stagnant = cards.size === before ? stagnant + 1 : 0
      if (accepted >= perSector) break
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]')
        if (feed) feed.scrollTop = feed.scrollHeight
      })
      await sleep(1100 + Math.floor(Math.random() * 700), signal)
    }
  }
  log(`${niche} · cobertura concluída: ${cards.size} candidatos únicos.`)
  const cityLabel = geo.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return [...cards.values()]
    .map((c) => parseCard(c, niche, geo.city, geo.state))
    .filter((l) => l.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() !== cityLabel)
}

async function run(input: SearchInput, signal: AbortSignal) {
  const knownPhones = new Set(input.known.phones)
  const knownMaps = new Set(input.known.maps)
  const isRecurring = (l: MapsLead) => {
    const p = l.phone ? phoneKey(l.phone) : null
    const m = mapsKey(l.mapsUrl)
    return (!!p && knownPhones.has(p)) || (!!m && knownMaps.has(m))
  }
  try {
    state.phase = 'geocoding'
    log('Localizando a área de busca…')
    const geo =
      input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng, ...(await reverseGeocode(input.lat, input.lng)) } : await geocode(input.location)
    state.center = { lat: geo.lat, lng: geo.lng, label: geo.label }
    state.progress = 6
    if (signal.aborted) throw new Error(STOPPED)

    state.phase = 'connecting'
    log('Abrindo o Google Maps…')
    const executablePath = chromeExecutable()
    if (!executablePath) throw new Error('Não achei o Google Chrome, Edge ou Brave neste computador. Instale o Chrome ou informe CHROME_PATH.')
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 1365, height: 900 })
    await page.setUserAgent(UA)

    const enrich = input.analyzeSites || input.qualification.phone !== 0 || input.qualification.website !== 0 || input.qualification.instagram !== 0
    const detail = enrich ? await browser.newPage() : null
    if (detail) {
      await detail.setViewport({ width: 1365, height: 900 })
      await detail.setUserAgent(UA)
      await detail.setRequestInterception(true)
      detail.on('request', async (req) => {
        try {
          if (['image', 'media', 'font'].includes(req.resourceType())) return req.abort()
          await assertSafePublicUrl(req.url())
          return req.continue()
        } catch {
          return req.abort().catch(() => undefined)
        }
      })
    }

    state.phase = 'scrolling'
    state.progress = 12
    const collected = new Map<string, MapsLead>()
    const collectionEnd = enrich ? 60 : 85
    const recurringIds = new Set<string>()
    const blockedIds = new Set<string>()

    const accept = (l: MapsLead): boolean => {
      const ok = matches(Boolean(l.phone), input.qualification.phone) && matches(Boolean(l.website), input.qualification.website) && matches(Boolean(l.instagram), input.qualification.instagram)
      if (!ok || collected.has(l.id)) return false
      const rec = isRecurring(l)
      if (rec) {
        recurringIds.add(l.id)
        state.recurringDetected = recurringIds.size
        if (input.existingPolicy === 'block') {
          blockedIds.add(l.id)
          state.recurringBlocked = blockedIds.size
          return false
        }
      }
      l.recurring = rec
      return true
    }

    for (let i = 0; i < input.niches.length && collected.size < input.targetLeads; i++) {
      const niche = input.niches[i]
      const remaining = input.targetLeads - collected.size
      const quota = Math.ceil(remaining / (input.niches.length - i))
      const target = getCandidateTarget(quota, input.qualification)
      const leads = await collectNiche(page, input, niche, target, geo, signal, (n, sector, total) => {
        state.currentSector = i * total + sector
        state.totalSectors = input.niches.length * total
        const nicheProgress = enrich ? Math.min(1, sector / Math.max(1, total)) : Math.min(1, n / Math.max(1, target))
        state.progress = Math.max(state.progress, Math.min(collectionEnd, Math.round(12 + ((i + nicheProgress) / input.niches.length) * (collectionEnd - 12))))
      })

      let approvedHere = 0
      if (detail && leads.length) {
        state.phase = 'enriching'
        for (let k = 0; k < leads.length && approvedHere < quota; k++) {
          if (signal.aborted) throw new Error(STOPPED)
          state.message = `Qualificando ${k + 1} de ${leads.length} em ${niche}…`
          const lead = await enrichLead(detail, leads[k], input.analyzeSites, signal)
          if (accept(lead)) {
            collected.set(lead.id, lead)
            approvedHere++
          } else state.discarded++
          state.approvedCount = Math.min(input.targetLeads, collected.size)
          state.progress = Math.max(state.progress, Math.min(90, Math.round(60 + ((i + (k + 1) / leads.length) / input.niches.length) * 30)))
        }
      } else {
        for (const lead of leads) {
          if (approvedHere >= quota) break
          if (accept(lead)) {
            collected.set(lead.id, lead)
            approvedHere++
          } else state.discarded++
        }
        state.approvedCount = Math.min(input.targetLeads, collected.size)
      }
      log(`${niche} · ${approvedHere} aprovado(s)${state.discarded ? `, ${state.discarded} descartado(s) pelos filtros até aqui` : ''}.`)
      state.phase = 'scrolling'
    }

    state.phase = 'processing'
    state.progress = 96
    state.results = [...collected.values()].slice(0, input.targetLeads)
    state.approvedCount = state.results.length
    if (state.results.length < input.targetLeads) log(`O Maps mostrou ${state.results.length} de ${input.targetLeads} empresas que passam nos filtros nesta área.`)
    state.phase = 'completed'
    state.progress = 100
    state.imported = state.results.length === 0
    log(`Busca concluída: ${state.results.length} lead(s) prontos para importar.`)
  } catch (err) {
    if (signal.aborted || (err as Error)?.message === STOPPED) {
      state.phase = 'cancelled'
      state.message = 'Busca interrompida com segurança.'
    } else {
      state.phase = 'error'
      state.error = (err as Error)?.message || 'Falha ao executar a busca.'
      log(state.error)
    }
  } finally {
    state.finishedAt = new Date().toISOString()
    if (state.startedAt) state.elapsedMs = Date.now() - Date.parse(state.startedAt)
    state.active = false
    abort = null
    await closeBrowser()
    persist()
  }
}

export function startMaps(raw: Partial<SearchInput>): void {
  if (state.active) throw new Error('Já existe uma busca em andamento.')
  const niches = [...new Map((raw.niches ?? []).map((n) => String(n).trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()].slice(0, 30)
  const location = String(raw.location ?? '').trim()
  const radiusKm = Number(raw.radiusKm)
  const targetLeads = Math.trunc(Number(raw.targetLeads))
  if (!niches.length) throw new Error('Escolha ao menos um nicho.')
  if (!location && (raw.lat === undefined || raw.lng === undefined)) throw new Error('Informe a cidade ou marque um ponto no mapa.')
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) throw new Error('O raio precisa estar entre 1 e 50 km.')
  if (!Number.isFinite(targetLeads) || targetLeads < 5 || targetLeads > 300) throw new Error('A meta precisa estar entre 5 e 300 leads.')
  const mode = (v: unknown): Mode => (v === 1 || v === -1 ? v : 0)
  const input: SearchInput = {
    niches,
    location,
    lat: raw.lat === undefined ? undefined : Number(raw.lat),
    lng: raw.lng === undefined ? undefined : Number(raw.lng),
    radiusKm,
    targetLeads,
    qualification: { phone: mode(raw.qualification?.phone), website: mode(raw.qualification?.website), instagram: mode(raw.qualification?.instagram) },
    analyzeSites: raw.analyzeSites !== false,
    existingPolicy: raw.existingPolicy === 'allow' ? 'allow' : 'block',
    known: { phones: raw.known?.phones ?? [], maps: raw.known?.maps ?? [] },
  }
  abort = new AbortController()
  const { known: _k, ...publicInput } = input
  Object.assign(state, freshState(), {
    runId: `${Date.now()}`,
    active: true,
    phase: 'geocoding',
    message: 'Preparando a busca…',
    input: publicInput,
    imported: false,
    startedAt: new Date().toISOString(),
  })
  void run(input, abort.signal)
}

