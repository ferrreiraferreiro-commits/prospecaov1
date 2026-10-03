import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { findInstagram, looksParked } from '../api/maps'

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

// ---------------------------------------------------------------------------
// Handler com Supabase e servidor de busca simulados
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

let profile = { plano: 'teste', teste_ate: new Date(Date.now() + 3_600_000).toISOString() }
let buscaCalls: { url: string; auth: string; body: unknown }[] = []

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://sb.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'anon'
  process.env.XS_BUSCA_URL = 'https://busca.test/'
  process.env.XS_BUSCA_TOKEN = 'segredo'
  profile = { plano: 'teste', teste_ate: new Date(Date.now() + 3_600_000).toISOString() }
  buscaCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
      const headers = (init?.headers ?? {}) as Record<string, string>
      if (url === 'https://sb.test/auth/v1/user') return headers.Authorization === 'Bearer ok' ? json({ id: 'u1' }) : json({}, 401)
      if (url.startsWith('https://sb.test/rest/v1/profiles')) return json([profile])
      if (url.startsWith('https://busca.test')) {
        buscaCalls.push({ url, auth: headers.Authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        if (url.includes('/bairros')) return json({ bairros: [{ nome: 'Centro', empresas: 10 }] })
        const body = JSON.parse(String(init?.body))
        if (body.cidade === 'Lugar Nenhum') return json({ error: 'Não achei a cidade "Lugar Nenhum".' }, 404)
        return json({ results: [{ id: '1', name: 'Clinica' }], stats: { found: 1, approved: 1, blocked: 0 } })
      }
      throw new Error(`fetch inesperado: ${url}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const search = (extra: Record<string, unknown> = {}) => ({ acao: 'buscar', cidade: 'Campinas, SP', nichos: ['Dentista'], filtros: { celular: 1 }, meta: 30, ...extra })

describe('POST /api/maps', () => {
  it('pede login e não chama o servidor de busca', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: {}, body: search() }, r)
    expect(out.code).toBe(401)
    expect(buscaCalls).toHaveLength(0)
  })

  it('bloqueia teste vencido', async () => {
    profile = { plano: 'teste', teste_ate: new Date(Date.now() - 1000).toISOString() }
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search() }, r)
    expect(out.code).toBe(403)
    expect(buscaCalls).toHaveLength(0)
  })

  it('repassa a busca com a senha do servidor (sem o campo acao)', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: JSON.stringify(search()) }, r)
    expect(out.code).toBe(200)
    expect(buscaCalls[0]).toMatchObject({ url: 'https://busca.test/buscar', auth: 'Bearer segredo', body: { cidade: 'Campinas, SP', nichos: ['Dentista'], filtros: { celular: 1 }, meta: 30 } })
    expect((buscaCalls[0].body as Record<string, unknown>).acao).toBeUndefined()
  })

  it('devolve o erro do servidor de busca (cidade não encontrada)', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search({ cidade: 'Lugar Nenhum' }) }, r)
    expect(out.code).toBe(404)
    expect(out.body).toMatchObject({ error: expect.stringContaining('Lugar Nenhum') })
  })

  it('lista bairros da cidade', async () => {
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: { acao: 'bairros', cidade: 'Campinas, SP' } }, r)
    expect(out.body).toEqual({ bairros: [{ nome: 'Centro', empresas: 10 }] })
    expect(buscaCalls[0].url).toBe('https://busca.test/bairros?cidade=Campinas%2C%20SP')
  })

  it('avisa quando o servidor de busca ainda não foi configurado', async () => {
    delete process.env.XS_BUSCA_URL
    const { r, out } = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: search() }, r)
    expect(out.code).toBe(503)
  })
})
