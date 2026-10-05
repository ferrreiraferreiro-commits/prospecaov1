import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Cliente do Supabase de mentira: sessão logada */
function fakeClient(logado = true) {
  return {
    auth: { getSession: async () => ({ data: { session: logado ? { access_token: 'token-da-sessao', user: { id: 'u-1' } } : null } }) },
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
afterEach(() => vi.unstubAllGlobals())

describe('WhatsApp da XS (na nuvem)', () => {
  it('pedidos vão ao gateway da XS, com o login, e nunca a 127.0.0.1', async () => {
    mockFetch(() => json({ ok: true, whatsapp: { status: 'connected', user: null } }))
    const { iniciarWhatsApp, waFetch, WA_URL } = await import('../src/lib/waServico')
    iniciarWhatsApp(fakeClient())
    await waFetch('/disparo/campanhas', { method: 'POST', json: { nome: 'x' } })
    const pedido = chamadas.find((c) => c.url === `${WA_URL}/motor/disparo/campanhas`)!
    expect(pedido.init?.method).toBe('POST')
    expect((pedido.init?.headers as Record<string, string>).Authorization).toBe('Bearer token-da-sessao')
    expect(chamadas.some((c) => c.url.includes('127.0.0.1') || c.url.includes('/ponte/'))).toBe(false)
  })

  it('serviço fora do ar: mensagem amigável, sem endereço técnico', async () => {
    mockFetch(() => json({ error: 'x', offline: true }, 503))
    const { iniciarWhatsApp, waFetch, useWaServico, MSG_INDISPONIVEL } = await import('../src/lib/waServico')
    iniciarWhatsApp(fakeClient())
    await expect(waFetch('/agenda')).rejects.toThrow(MSG_INDISPONIVEL)
    expect(useWaServico.getState().online).toBe(false)
  })

  it('sem vaga na nuvem para a conta (403): também é "indisponível", nunca instruções de instalar nada', async () => {
    mockFetch(() => json({ error: 'Sua conta não usa o WhatsApp na nuvem.' }, 403))
    const { iniciarWhatsApp, waFetch, MSG_INDISPONIVEL } = await import('../src/lib/waServico')
    iniciarWhatsApp(fakeClient())
    await expect(waFetch('/health')).rejects.toThrow(MSG_INDISPONIVEL)
  })

  it('sem login: nem tenta chamar', async () => {
    mockFetch(() => json({ ok: true }))
    const { iniciarWhatsApp, useWaServico } = await import('../src/lib/waServico')
    iniciarWhatsApp(fakeClient(false))
    await useWaServico.getState().check()
    expect(chamadas).toHaveLength(0)
    expect(useWaServico.getState().online).toBe(false)
  })

  it('erros do serviço (mensagens da XS) chegam como estão', async () => {
    mockFetch(() => json({ error: 'Este número não tem WhatsApp ativo.' }, 400))
    const { iniciarWhatsApp, waFetch } = await import('../src/lib/waServico')
    iniciarWhatsApp(fakeClient())
    await expect(waFetch('/whatsapp/teste', { method: 'POST', json: {} })).rejects.toThrow('Este número não tem WhatsApp ativo.')
  })
})

describe('estados da tela de Conexão', () => {
  it('traduz o status do WhatsApp', async () => {
    const { estadoDoWhatsApp } = await import('../src/lib/waServico')
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
