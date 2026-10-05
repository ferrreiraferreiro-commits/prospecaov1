import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { findInstagram, googleError, inBairros, inCity, looksParked, planJobs, tilesOf, toResult } from '../api/maps'
import { DatabaseSync } from 'node:sqlite'
import { buscar, nichoDo, plan } from '../busca/lugares'
import { categoriaDe, CATEGORIAS } from '../src/lib/categorias'

describe('site e Instagram (api/maps)', () => {
  it('acha o perfil do Instagram e ignora links de post', () => {
    const html = '<a href="https://www.instagram.com/p/abc">post</a> <a href="https://instagram.com/clinica.sorriso/">ig</a>'
    expect(findInstagram(html)).toBe('https://www.instagram.com/clinica.sorriso')
  })

  it('domínio estacionado não conta como site', () => {
    expect(looksParked('<h1>This domain is parked</h1>')).toBe(true)
    expect(looksParked('<h1>Site em construção</h1>')).toBe(true)
    expect(looksParked('<h1>Clínica Sorriso · agende sua consulta</h1>')).toBe(false)
  })
})

describe('regras da busca no Google', () => {
  const place = {
    id: 'ChIJabc',
    displayName: { text: 'Barbearia do Zé' },
    formattedAddress: 'R. Sergipe, 100 - Centro, Londrina - PR, 86010-000',
    addressComponents: [
      { longText: 'Centro', types: ['sublocality_level_1', 'sublocality'] },
      { longText: 'Londrina', types: ['administrative_area_level_2'] },
      {
        longText: 'Paraná',
        shortText: 'PR',
        types: ['administrative_area_level_1'],
      },
    ],
    nationalPhoneNumber: '(43) 99999-1234',
    websiteUri: 'https://instagram.com/barbeariadoze',
    rating: 4.8,
    userRatingCount: 210,
    location: { latitude: -23.3, longitude: -51.16 },
    googleMapsUri: 'https://maps.google.com/?cid=123',
  }

  it('converte o lugar: celular vira WhatsApp e Instagram cadastrado como site não conta como site', () => {
    const r = toResult(place, 'Barbearia')
    expect(r).toMatchObject({
      name: 'Barbearia do Zé',
      phone: '5543999991234',
      hasWhatsapp: true,
      website: '',
      instagram: 'https://instagram.com/barbeariadoze',
      city: 'Londrina',
      state: 'PR',
      neighborhood: 'Centro',
    })
  })

  it('fica só com a cidade e os bairros escolhidos', () => {
    const r = toResult(place, 'Barbearia')
    expect(inCity(r, 'Londrina, PR')).toBe(true)
    expect(inCity(r, 'Cambé, PR')).toBe(false)
    expect(inBairros(r, ['centro'])).toBe(true)
    expect(inBairros(r, ['Gleba Palhano'])).toBe(false)
    expect(inBairros(r, [])).toBe(true)
  })

  it('cidade toda primeiro; meta grande divide a cidade em pedaços; bairro vira texto da busca', () => {
    const caixa: [number, number, number, number] = [-23.5, -23.2, -51.3, -51]
    const nichos = [{ nome: 'Barbearia', busca: 'barbearia' }]
    expect(planJobs({ nichos, cidade: 'Londrina, PR', caixa, meta: 40 })).toHaveLength(1)
    expect(planJobs({ nichos, cidade: 'Londrina, PR', caixa, meta: 120 })).toHaveLength(5)
    const jobs = planJobs({
      nichos,
      cidade: 'Londrina, PR',
      caixa,
      meta: 40,
      bairros: ['Centro', 'Gleba Palhano'],
    })
    expect(jobs.map((j) => j.busca)).toEqual(['barbearia no bairro Centro, Londrina, PR', 'barbearia no bairro Gleba Palhano, Londrina, PR'])
    expect(tilesOf(caixa, 2)).toHaveLength(4)
  })

  it('explica o erro do Google em português', () => {
    expect(
      googleError(400, {
        error: { message: 'API key not valid. Please pass a valid API key.' },
      }).message,
    ).toMatch(/não é válida/)
    expect(
      googleError(403, {
        error: {
          message: 'Places API (New) has not been used in project 1 before or it is disabled.',
        },
      }).message,
    ).toMatch(/Ativar|ativada/)
    expect(googleError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).status).toBe(429)
  })
})

describe('categorias', () => {
  it('toda categoria tem busca do Google e categoria na base aberta, sem nome repetido', () => {
    expect(CATEGORIAS.length).toBeGreaterThan(80)
    expect(new Set(CATEGORIAS.map((c) => c.nome)).size).toBe(CATEGORIAS.length)
    for (const c of CATEGORIAS) {
      expect(c.google.length).toBeGreaterThan(2)
      expect(c.base.length, `${c.nome} sem categoria na base aberta`).toBeGreaterThan(0)
      for (const t of c.base) expect(t).toMatch(/^[a-z_]+$/)
    }
  })

  it('texto livre vira busca pelo nome', () => {
    expect(categoriaDe('Açaí')).toMatchObject({ google: 'Açaí', base: [], nomes: ['Açaí'] })
    expect(categoriaDe('barbearia').nome).toBe('Barbearia')
  })
})

describe('base aberta de comércios (busca/lugares.ts)', () => {
  // Mesmo formato que o lugares-importar.ts monta
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE lugares (id TEXT, nome TEXT, nome_n TEXT, tax TEXT, tel TEXT, tel2 TEXT, site TEXT, insta TEXT, face TEXT, email TEXT,
    endereco TEXT, cep TEXT, cidade TEXT, cidade_n TEXT, uf TEXT, lat REAL, lng REAL, conf REAL)`)
  const add = db.prepare('INSERT INTO lugares VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)')
  add.run('1', 'Barbearia do Zé', 'barbearia do ze', 'barber', '5543999990001', null, 'Rua A, 1', 'Londrina', 'londrina', 'PR', -23.31, -51.16, 0.9)
  add.run('2', 'Salão Bela', 'salao bela', 'hair_salon', '554333330002', 'https://salaobela.com.br', 'Rua B, 2', 'Londrina', 'londrina', 'PR', -23.35, -51.2, 0.8)
  add.run('3', 'Barbearia Sem Fone', 'barbearia sem fone', 'barber', null, null, 'Rua C, 3', 'Londrina', 'londrina', 'PR', -23.3, -51.15, 0.95)
  add.run('4', 'Barbearia Cambé', 'barbearia cambe', 'barber', '5543999990004', null, 'Rua D, 4', 'Cambé', 'cambe', 'PR', -23.27, -51.27, 0.9)
  add.run('5', 'Point do Açaí', 'point do acai', 'restaurant', '5543999990005', null, 'Rua E, 5', 'Londrina', 'londrina', 'PR', -23.31, -51.16, 0.7)
  add.run('6', 'Barbearia do Zé (cópia)', 'barbearia do ze copia', 'barber', '43999990001', null, 'Rua A, 1', 'Londrina', 'londrina', 'PR', -23.31, -51.16, 0.5)

  const barbearia = { nome: 'Barbearia', tax: ['barber'], nomes: ['barbearia'] }
  const acai = { nome: 'Sorveteria e açaí', tax: ['ice_cream_shop'], nomes: ['acai'] }

  it('só a cidade escolhida, sem repetir o mesmo telefone, mais confiáveis primeiro', () => {
    const r = buscar({ uf: 'PR', cidade: 'Londrina', nichos: [barbearia], meta: 20 }, db)
    expect(r.results.map((x) => x.name)).toEqual(['Barbearia do Zé', 'Barbearia Sem Fone'])
    expect(r.results[0]).toMatchObject({ phone: '5543999990001', hasWhatsapp: true, source: 'base', niche: 'Barbearia', address: 'Rua A, 1 - Londrina - PR' })
  })

  it('filtros de telefone e site, e pula quem já está nos leads', () => {
    expect(buscar({ uf: 'PR', cidade: 'Londrina', nichos: [barbearia], filtros: { telefone: 1 } }, db).results.map((x) => x.id)).toEqual(['ov:1'])
    const salao = { nome: 'Salão de beleza', tax: ['hair_salon'], nomes: [] }
    expect(buscar({ uf: 'PR', cidade: 'Londrina', nichos: [salao], filtros: { site: -1 } }, db).results).toHaveLength(0)
    const r = buscar({ uf: 'PR', cidade: 'Londrina', nichos: [barbearia], conhecidos: { telefones: ['4399990001'] }, pular: true }, db)
    expect(r.results.map((x) => x.id)).toEqual(['ov:3'])
    expect(r.stats.blocked).toBe(1)
  })

  it('acha pelo pedaço do nome quando a categoria é genérica', () => {
    const r = buscar({ uf: 'PR', cidade: 'Londrina', nichos: [acai] }, db)
    expect(r.results.map((x) => x.name)).toEqual(['Point do Açaí'])
    expect(nichoDo({ tax: 'restaurant', nome_n: 'point do acai' }, [barbearia, acai])).toBe('Sorveteria e açaí')
  })

  it('bairros viram caixas no mapa', () => {
    const r = buscar({ uf: 'PR', cidade: 'Londrina', nichos: [barbearia], caixas: [[-23.32, -23.3, -51.17, -51.155]] }, db)
    expect(r.results.map((x) => x.id)).toEqual(['ov:1'])
  })

  it('aceita "Londrina PR" como cidade e ignora categorias estranhas', () => {
    const p = plan({ uf: 'pr', cidade: 'Londrina', nichos: [{ nome: 'X', tax: ['barber', "x'; DROP TABLE"], nomes: ['ab'] }] })
    expect(p).toEqual({ tax: ['barber'], nomes: [], cidades: ['londrina', 'londrina pr'], uf: 'PR' })
  })
})

// ---------------------------------------------------------------------------
// Handler com Supabase e Google simulados
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

const KEY = 'AIzaSyD-teste-0123456789abcdefghijklmn'
let profile = {
  plano: 'teste',
  teste_ate: new Date(Date.now() + 3_600_000).toISOString(),
}
let googleCalls: {
  body: Record<string, unknown>
  key: string
  fields: string
}[] = []
let googleReply: (body: Record<string, unknown>) => {
  status: number
  data: unknown
} = () => ({ status: 200, data: { places: [] } })

const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: { text: `Empresa ${id}` },
  formattedAddress: `Rua ${id} - Centro, Londrina - PR`,
  addressComponents: [{ longText: 'Londrina', types: ['administrative_area_level_2'] }],
  nationalPhoneNumber: `(43) 99999-00${id.padStart(2, '0')}`,
  googleMapsUri: `https://maps.google.com/?cid=${id}`,
  ...extra,
})

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://sb.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  profile = {
    plano: 'teste',
    teste_ate: new Date(Date.now() + 3_600_000).toISOString(),
  }
  googleCalls = []
  googleReply = () => ({ status: 200, data: { places: [] } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown, status = 200) =>
        new Response(JSON.stringify(b), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (url === 'https://sb.test/auth/v1/user') return headers.Authorization === 'Bearer ok' ? json({ id: 'u1' }) : json({}, 401)
      if (url.startsWith('https://sb.test/rest/v1/profiles')) return json([profile])
      if (url === 'https://places.googleapis.com/v1/places:searchText') {
        const body = JSON.parse(String(init?.body))
        googleCalls.push({
          body,
          key: headers['X-Goog-Api-Key'],
          fields: headers['X-Goog-FieldMask'],
        })
        const r = googleReply(body)
        return json(r.data, r.status)
      }
      throw new Error(`fetch inesperado: ${url}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const search = (extra: Record<string, unknown> = {}) => ({
  acao: 'google',
  chave: KEY,
  nichos: [{ nome: 'Dentista', busca: 'dentista' }],
  cidade: 'Londrina, PR',
  caixa: [-23.5, -23.2, -51.3, -51],
  meta: 20,
  filtros: { telefone: 1 },
  restante: 100,
  ...extra,
})

const call = async (body: unknown, auth = 'Bearer ok') => {
  const { r, out } = res()
  await handler(
    {
      method: 'POST',
      headers: { authorization: auth },
      body: JSON.stringify(body),
    },
    r,
  )
  return out
}

describe('POST /api/maps', () => {
  it('pede login e não chama o Google', async () => {
    const out = await call(search(), '')
    expect(out.code).toBe(401)
    expect(googleCalls).toHaveLength(0)
  })

  it('bloqueia teste vencido', async () => {
    profile = {
      plano: 'teste',
      teste_ate: new Date(Date.now() - 1000).toISOString(),
    }
    const out = await call(search())
    expect(out.code).toBe(403)
    expect(googleCalls).toHaveLength(0)
  })

  it('busca com a chave do usuário, na área da cidade, e conta as consultas', async () => {
    googleReply = () => ({
      status: 200,
      data: {
        places: [place('1'), place('2'), place('3', { nationalPhoneNumber: undefined })],
      },
    })
    const out = await call(search())
    expect(out.code).toBe(200)
    expect(googleCalls[0].key).toBe(KEY)
    expect(googleCalls[0].body).toMatchObject({
      textQuery: 'dentista em Londrina, PR',
      languageCode: 'pt-BR',
      locationRestriction: { rectangle: expect.any(Object) },
    })
    expect(googleCalls[0].fields).toContain('places.nationalPhoneNumber')
    const body = out.body as {
      results: { id: string }[]
      stats: { calls: number; found: number }
    }
    // Sem telefone fica de fora (filtro "com telefone")
    expect(body.results.map((r) => r.id)).toEqual(['1', '2'])
    expect(body.stats).toMatchObject({ calls: 1, found: 3 })
  })

  it('nunca passa do que ainda resta na cota do mês', async () => {
    googleReply = (b) => ({
      status: 200,
      data: {
        places: [place(String(Math.random()).slice(2, 6))],
        nextPageToken: b.pageToken ? `${b.pageToken}x` : 't',
      },
    })
    const out = await call(search({ meta: 300, restante: 2 }))
    expect(googleCalls).toHaveLength(2)
    expect((out.body as { stats: { calls: number } }).stats.calls).toBe(2)
  })

  it('sem consultas no mês, nem chama o Google', async () => {
    const out = await call(search({ restante: 0 }))
    expect(out.code).toBe(429)
    expect(googleCalls).toHaveLength(0)
  })

  it('pula quem já está nos leads', async () => {
    googleReply = () => ({
      status: 200,
      data: { places: [place('1'), place('2')] },
    })
    const out = await call(search({ conhecidos: { telefones: ['4399990001'] }, pular: true }))
    const body = out.body as {
      results: { id: string }[]
      stats: { blocked: number }
    }
    expect(body.results.map((r) => r.id)).toEqual(['2'])
    expect(body.stats.blocked).toBe(1)
  })

  it('chave inválida vira mensagem clara', async () => {
    googleReply = () => ({
      status: 400,
      data: {
        error: { message: 'API key not valid. Please pass a valid API key.' },
      },
    })
    const out = await call(search())
    expect(out.code).toBe(400)
    expect(out.body).toMatchObject({
      error: expect.stringContaining('não é válida'),
    })
  })

  it('testa a chave pedindo só o id (consulta que o Google não cobra)', async () => {
    googleReply = () => ({ status: 200, data: { places: [{ id: 'x' }] } })
    const out = await call({ acao: 'testar', chave: KEY })
    expect(out).toMatchObject({ code: 200, body: { ok: true } })
    expect(googleCalls[0].fields).toBe('places.id')
  })

  it('recusa algo que não parece chave sem chamar o Google', async () => {
    const out = await call({ acao: 'testar', chave: 'minha senha' })
    expect(out.code).toBe(400)
    expect(googleCalls).toHaveLength(0)
  })
})
