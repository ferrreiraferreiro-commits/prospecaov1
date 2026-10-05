// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * WhatsApp na nuvem: o mesmo Motor WhatsApp XS, rodando na VPS da XS (whatsapp-cloud/), em vez de no
 * computador da pessoa. Escolhido na hora do build:
 *
 *   WHATSAPP_ENGINE=local   (padrão) Motor no computador, como sempre foi
 *   WHATSAPP_ENGINE=cloud   Motor na VPS, para as contas liberadas no gateway (XS_CLOUD_USUARIOS);
 *                           as outras contas continuam no Motor do computador
 *   WHATSAPP_ENGINE_URL     endereço do gateway (opcional)
 *
 * Os caminhos são os mesmos do Motor local (/health, /whatsapp/…, /disparo/…, /agenda…): o gateway
 * confere o login (token do Supabase) e repassa ao Motor da VPS.
 */
export const WHATSAPP_ENGINE: 'local' | 'cloud' = String(import.meta.env.WHATSAPP_ENGINE ?? '').trim().toLowerCase() === 'cloud' ? 'cloud' : 'local'

export const CLOUD_URL = String(import.meta.env.WHATSAPP_ENGINE_URL || 'https://109-110-184-199.sslip.io/whatsapp').replace(/\/+$/, '')

export const MSG_INDISPONIVEL = 'O serviço de WhatsApp está temporariamente indisponível. Tente novamente em alguns instantes.'

/** O serviço não respondeu (fora do ar ou sem internet) */
export class NuvemIndisponivel extends Error {
  constructor(message = MSG_INDISPONIVEL) {
    super(message)
  }
}

let client: SupabaseClient | null = null

async function token(): Promise<string> {
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } }
  const t = data.session?.access_token
  if (!t) throw new Error('Entre na sua conta da XS de novo.')
  return t
}

/** Pedido ao Motor da nuvem. A resposta (inclusive os erros) é a do próprio Motor. */
export async function pelaNuvem(path: string, method: string, json: unknown, timeoutMs: number, signal?: AbortSignal | null): Promise<Response> {
  const auth = await token()
  let res: Response
  try {
    res = await fetch(`${CLOUD_URL}/motor${path}`, {
      method,
      headers: { Authorization: `Bearer ${auth}`, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutMs + 5000),
    })
  } catch {
    throw new NuvemIndisponivel()
  }
  if (res.status === 503 || res.status === 502) throw new NuvemIndisponivel()
  return res
}

const CHAVE_ACESSO = 'xs-prospeccao:whatsapp-nuvem'

/**
 * Esta conta usa o WhatsApp na nuvem? Pergunta ao gateway. Se ele não responder, vale a última
 * resposta guardada neste navegador (quem já usava a nuvem vê "serviço indisponível", não o Motor local).
 */
export async function contaUsaNuvem(c: SupabaseClient): Promise<boolean> {
  client = c
  if (WHATSAPP_ENGINE !== 'cloud') return false
  const { data } = await c.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return false
  const lembrar = (sim: boolean) => {
    try {
      if (sim) localStorage.setItem(CHAVE_ACESSO, userId)
      else localStorage.removeItem(CHAVE_ACESSO)
    } catch {
      /* sem armazenamento */
    }
    return sim
  }
  try {
    const res = await fetch(`${CLOUD_URL}/acesso`, { headers: { Authorization: `Bearer ${data.session!.access_token}` }, signal: AbortSignal.timeout(8000) })
    if (res.status === 200) return lembrar(true)
    if (res.status === 403) return lembrar(false)
  } catch {
    /* gateway fora do ar: decide pela última resposta */
  }
  try {
    return localStorage.getItem(CHAVE_ACESSO) === userId
  } catch {
    return false
  }
}

export interface WaInfoNuvem {
  status: 'disconnected' | 'connecting' | 'qrcode' | 'connected'
  qrCodeUrl: string | null
  user: { id: string; name: string } | null
  lastError: string | null
  /** Há sessão guardada na nuvem: "conectando" quer dizer "reconectando" */
  sessaoSalva?: boolean
}

export type EstadoWhatsApp = 'verificando' | 'conectado' | 'reconectando' | 'gerando-qr' | 'aguardando-qr' | 'erro' | 'desconectado'

/** Estado mostrado na tela de Conexão (modo nuvem) a partir do que o Motor responde. */
export function estadoDoWhatsApp(wa: WaInfoNuvem | null): EstadoWhatsApp {
  if (!wa) return 'verificando'
  if (wa.status === 'connected') return 'conectado'
  if (wa.status === 'qrcode') return 'aguardando-qr'
  if (wa.status === 'connecting') return wa.sessaoSalva ? 'reconectando' : 'gerando-qr'
  return wa.lastError ? 'erro' : 'desconectado'
}
