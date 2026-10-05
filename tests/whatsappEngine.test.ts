import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Cliente do Supabase de mentira: sessão logada e a tabela `motores` */
function fakeClient(motor: { chave: string; computador: string } | null = null) {
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-da-sessao', user: { id: 'u-1' } } } }) },
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: motor }) }) }),
  } as never
}

type Chamada = { url: string; init?: RequestInit }
let chamadas: Chamada[] = []

function mockFetch(responder: (url: string) => Response | Promise<Response>) {
  chamadas = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init })
    return responder(url)
  })
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('WHATSAPP_ENGINE=local (padrão): tudo como antes', () => {
  it('sem configuração, o modo é local', async () => {
    const { WHATSAPP_ENGINE } = await import('../src/lib/whatsappCloud')
    expect(WHATSAPP_ENGINE).toBe('local')
  })

  it('app sem login fala direto com 127.0.0.1', async () => {
    mockFetch(() => json({ ok: true }))
    const { motorFetch } = await import('../src/lib/motor')
    await motorFetch('/health')
    expect(chamadas.map((c) => c.url)).toEqual(['http://127.0.0.1:3077/health'])
  })

  it('app com login usa a ponte com a chave do motor, sem perguntar ao gateway da nuvem', async () => {
    mockFetch(() => json({ ok: true, whatsapp: { status: 'connected', user: null } }))
    const { carregarMotorDaConta, motorFetch, useMotor } = await import('../src/lib/motor')
    await carregarMotorDaConta(fakeClient({ chave: 'c'.repeat(43), computador: 'PC' }))
    await motorFetch('/agenda')
    expect(chamadas.every((c) => c.url.endsWith('/ponte/pedido'))).toBe(true)
    expect(useMotor.getState().nuvem).toBe(false)
  })
})

describe('WHATSAPP_ENGINE=cloud', () => {
  beforeEach(() => vi.stubEnv('WHATSAPP_ENGINE', 'cloud'))

  it('conta liberada: pedidos vão ao gateway, com o login, e nunca a 127.0.0.1', async () => {
    mockFetch((url) => (url.endsWith('/acesso') ? json({ permitido: true }) : json({ ok: true, nuvem: true, whatsapp: { status: 'connected', user: null } })))
    const { carregarMotorDaConta, motorFetch, useMotor } = await import('../src/lib/motor')
    const { CLOUD_URL } = await import('../src/lib/whatsappCloud')
    await carregarMotorDaConta(fakeClient())
    await motorFetch('/disparo/campanhas', { method: 'POST', json: { nome: 'x' } })
    expect(useMotor.getState().nuvem).toBe(true)
    const pedido = chamadas.find((c) => c.url === `${CLOUD_URL}/motor/disparo/campanhas`)!
    expect(pedido.init?.method).toBe('POST')
    expect((pedido.init?.headers as Record<string, string>).Authorization).toBe('Bearer token-da-sessao')
    expect(chamadas.some((c) => c.url.includes('127.0.0.1') || c.url.includes('/ponte/'))).toBe(false)
  })

  it('conta não liberada (403): continua no Motor do computador', async () => {
    mockFetch((url) => (url.endsWith('/acesso') ? json({ permitido: false }, 403) : json({ ok: true })))
    const { carregarMotorDaConta, motorFetch, useMotor } = await import('../src/lib/motor')
    await carregarMotorDaConta(fakeClient({ chave: 'c'.repeat(43), computador: 'PC' }))
    await motorFetch('/health')
    expect(useMotor.getState().nuvem).toBe(false)
    expect(chamadas.at(-1)!.url.endsWith('/ponte/pedido')).toBe(true)
  })

  it('serviço fora do ar: mensagem amigável, sem endereço técnico', async () => {
    mockFetch((url) => (url.endsWith('/acesso') ? json({ permitido: true }) : json({ error: 'x', offline: true }, 503)))
    const { carregarMotorDaConta, motorFetch, useMotor } = await import('../src/lib/motor')
    const { MSG_INDISPONIVEL } = await import('../src/lib/whatsappCloud')
    await carregarMotorDaConta(fakeClient())
    await expect(motorFetch('/agenda')).rejects.toThrow(MSG_INDISPONIVEL)
    expect(useMotor.getState().online).toBe(false)
  })
})

describe('estados da tela de Conexão (nuvem)', () => {
  it('traduz o status do Motor', async () => {
    const { estadoDoWhatsApp } = await import('../src/lib/whatsappCloud')
    const base = { qrCodeUrl: null, user: null, lastError: null }
    expect(estadoDoWhatsApp(null)).toBe('verificando')
    expect(estadoDoWhatsApp({ ...base, status: 'connected' })).toBe('conectado')
    expect(estadoDoWhatsApp({ ...base, status: 'qrcode' })).toBe('aguardando-qr')
    expect(estadoDoWhatsApp({ ...base, status: 'connecting', sessaoSalva: true })).toBe('reconectando')
    expect(estadoDoWhatsApp({ ...base, status: 'connecting' })).toBe('gerando-qr')
    expect(estadoDoWhatsApp({ ...base, status: 'disconnected', lastError: 'Sessão encerrada.' })).toBe('erro')
    expect(estadoDoWhatsApp({ ...base, status: 'disconnected' })).toBe('desconectado')
  })
})
