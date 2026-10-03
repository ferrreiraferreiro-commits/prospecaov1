import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { cidKey, findCnpj, findInstagram, gridSize, isValidCnpj, matchesCompany, phoneKey, qualifies, tilesOf, toResult } from '../api/maps'
import { mapsKey, phoneKey as appPhoneKey } from '../src/lib/duplicates'

describe('regras da busca no Google (api/maps)', () => {
  it('phoneKey do servidor é igual ao do app', () => {
    for (const t of ['(35) 99999-0001', '5535999990001', '+55 19 3232-1111', '3232-1111', '', '123']) expect(phoneKey(t)).toBe(appPhoneKey(t))
  })

  it('o link do Google (cid) bate com o mapsKey do app', () => {
    const url = 'https://maps.google.com/?cid=2615398231449768648'
    expect(cidKey(url)).toBe(mapsKey(url))
  })

  it('converte o lugar do Google no lead', () => {
    const r = toResult(
      {
        id: 'p1',
        displayName: { text: ' Barbearia Navalha ' },
        formattedAddress: 'R. Um, 10 - Centro, Campinas - SP',
        addressComponents: [
          { longText: 'Campinas', shortText: 'Campinas', types: ['administrative_area_level_2', 'political'] },
          { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1', 'political'] },
        ],
        nationalPhoneNumber: '(19) 99812-0000',
        websiteUri: 'https://instagram.com/navalha',
        rating: 4.8,
        userRatingCount: 212,
        location: { latitude: -22.9, longitude: -47.06 },
        googleMapsUri: 'https://maps.google.com/?cid=1',
      },
      'Barbearia',
    )
    expect(r).toMatchObject({ name: 'Barbearia Navalha', phone: '5519998120000', hasWhatsapp: true, city: 'Campinas', state: 'SP', instagram: 'https://instagram.com/navalha', reviewsCount: 212 })
    // Instagram cadastrado como "site" não conta como site
    expect(qualifies(r, { phone: 1, website: -1, instagram: 0 })).toBe(true)
    expect(qualifies({ ...r, instagram: '' }, { phone: 1, website: -1, instagram: 0 })).toBe(false)
    expect(qualifies({ ...r, phone: '' }, { phone: 1, website: 0, instagram: 0 })).toBe(false)
  })

  it('divide áreas grandes só quando a meta pede', () => {
    expect(gridSize(5, 300)).toBe(1)
    expect(gridSize(20, 30)).toBe(1)
    expect(gridSize(20, 120)).toBe(2)
    expect(gridSize(40, 300)).toBe(3)
    const tiles = tilesOf(-22.9, -47.06, 10, 2)
    expect(tiles).toHaveLength(4)
    expect(tiles[0].low.latitude).toBeLessThan(tiles[3].high.latitude)
  })

  it('acha o Instagram e o CNPJ no site', () => {
    const html = '<a href="https://www.instagram.com/p/abc">post</a> <a href="https://instagram.com/clinica.sorriso/">ig</a> CNPJ 11.222.333/0001-81 · 11.222.333/0001-00'
    expect(findInstagram(html)).toBe('https://www.instagram.com/clinica.sorriso')
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(findCnpj(html)).toBe('11222333000181')
  })

  it('só aceita o CNPJ se nome, telefone e cidade conferem', () => {
    const data = { razao_social: 'CLINICA SORRISO LEVE LTDA', ddd_telefone_1: '1932321111', municipio: 'CAMPINAS' }
    expect(matchesCompany(data, { name: 'Clínica Sorriso Leve', phone: '551932321111', city: 'Campinas' })).toBe(true)
    expect(matchesCompany(data, { name: 'Clínica Sorriso Leve', phone: '551940004000', city: 'Campinas' })).toBe(false)
    expect(matchesCompany(data, { name: 'Pet Shop Amigo', phone: '', city: 'Campinas' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Handler com Google e Supabase simulados
// ---------------------------------------------------------------------------

function res() {
  const out = { code: 0, body: undefined as unknown }
  const r = {
    status(c: number) {
      out.code = c
      return r
    },
    json(b: unknown) {
      out.body = b
    },
  }
  return { r, out }
}

const place = (id: string, lat: number, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: { text: `Empresa ${id}` },
  nationalPhoneNumber: `(19) 9${String(id.charCodeAt(0)).padStart(4, '0')}-0000`,
  location: { latitude: lat, longitude: -47.06 },
  googleMapsUri: `https://maps.google.com/?cid=${id.length}${id.charCodeAt(0)}`,
  ...extra,
})

let profile = { plano: 'teste', teste_ate: new Date(Date.now() + 3_600_000).toISOString() }
let googleCalls = 0

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://sb.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  process.env.GOOGLE_PLACES_KEY = 'k'
  profile = { plano: 'teste', teste_ate: new Date(Date.now() + 3_600_000).toISOString() }
  googleCalls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
      if (url === 'https://sb.test/auth/v1/user') return (init?.headers as Record<string, string>).Authorization === 'Bearer ok' ? json({ id: 'u1' }) : json({}, 401)
      if (url.startsWith('https://sb.test/rest/v1/profiles')) return json([profile])
      if (url.startsWith('https://places.googleapis.com')) {
        googleCalls++
        const body = JSON.parse(String(init?.body))
        if (body.pageToken) return json({ places: [place('d', -22.905)] })
        return json({
          places: [
            place('a', -22.905),
            place('b', -22.906, { websiteUri: 'https://b.com.br' }),
            place('c', -23.5), // fora do raio
            place('x', -22.905, { businessStatus: 'CLOSED_PERMANENTLY' }),
            place('e', -22.906, { nationalPhoneNumber: '(19) 3232-1111' }),
            place('f', -22.904),
            place('g', -22.907),
          ],
          nextPageToken: 'pg2',
        })
      }
      throw new Error(`fetch inesperado: ${url}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const search = (extra: Record<string, unknown> = {}) => ({
  acao: 'buscar',
  niches: ['barbearia'],
  location: 'Campinas, SP',
  lat: -22.9056,
  lng: -47.0608,
  radiusKm: 5,
  targetLeads: 30,
  qualification: { phone: 1, website: -1, instagram: 0 },
  existingPolicy: 'block',
  ...extra,
})

describe('POST /api/maps', () => {
  it('pede login', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: {}, body: search() }, r)
    expect(out.code).toBe(401)
    expect(googleCalls).toBe(0)
  })

  it('bloqueia teste vencido sem gastar consulta', async () => {
    profile = { plano: 'teste', teste_ate: new Date(Date.now() - 1000).toISOString() }
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search() }, r)
    expect(out.code).toBe(403)
    expect(googleCalls).toBe(0)
  })

  it('avisa quando falta a chave do Google', async () => {
    delete process.env.GOOGLE_PLACES_KEY
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search() }, r)
    expect(out.code).toBe(503)
  })

  it('filtra por raio, fechadas, site e quem já está na lista', async () => {
    const { r, out } = res()
    const known = { phones: [], maps: [cidKey(`https://maps.google.com/?cid=1${'a'.charCodeAt(0)}`)!] }
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: JSON.stringify(search({ known })) }, r)
    expect(out.code).toBe(200)
    const body = out.body as { results: { name: string }[]; stats: { blocked: number; calls: number } }
    // a: já na lista · b: tem site · c: fora do raio · x: fechada · e: fixo passa (telefone é exigido, não celular)
    expect(body.results.map((x) => x.name).sort()).toEqual(['Empresa d', 'Empresa e', 'Empresa f', 'Empresa g'])
    expect(body.stats.blocked).toBe(1)
    expect(body.stats.calls).toBe(2)
  })

  it('para de consultar o Google quando bate a meta', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search({ targetLeads: 5, qualification: { phone: 0, website: 0, instagram: 0 } }) }, r)
    // A primeira página já traz 5 aprovadas (a, b, e, f, g): não pede a segunda
    expect((out.body as { results: unknown[] }).results).toHaveLength(5)
    expect(googleCalls).toBe(1)
  })
})
