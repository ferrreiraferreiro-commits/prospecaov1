// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * WhatsApp da XS: roda na nuvem da XS (whatsapp-cloud/ na VPS), um WhatsApp por conta.
 * O app fala com o gateway por HTTPS, com o login da pessoa; o gateway confere o login e repassa
 * ao WhatsApp DELA (caminhos /health, /whatsapp/…, /disparo/…, /agenda…). Nada para instalar.
 */
export const WA_URL = String(import.meta.env.VITE_WHATSAPP_URL || 'https://109-110-184-199.sslip.io/whatsapp').replace(/\/+$/, '')

export const MSG_INDISPONIVEL = 'O serviço de WhatsApp está temporariamente indisponível. Tente novamente em alguns instantes.'

export class WaError extends Error {
  constructor(
    message: string,
    /** O serviço não respondeu (fora do ar, sem internet ou sem vaga para a conta) */
    readonly offline = false,
  ) {
    super(message)
  }
}

let client: SupabaseClient | null = null

/** Chamado depois do login: a partir daí os pedidos levam o login da pessoa. */
export function iniciarWhatsApp(c: SupabaseClient) {
  client = c
  void useWaServico.getState().check()
}

async function token(): Promise<string> {
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } }
  const t = data.session?.access_token
  if (!t) throw new WaError(MSG_INDISPONIVEL, true)
  return t
}

/** Pedido ao WhatsApp da conta. A resposta (inclusive os erros) é a do próprio serviço. */
async function pedir(path: string, method: string, json: unknown, timeoutMs: number, signal?: AbortSignal | null): Promise<Response> {
  const auth = await token()
  let res: Response
  try {
    res = await fetch(`${WA_URL}/motor${path}`, {
      method,
      headers: { Authorization: `Bearer ${auth}`, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutMs + 5000),
    })
  } catch {
    throw new WaError(MSG_INDISPONIVEL, true)
  }
  // 403 = sem vaga na nuvem para esta conta agora: para a pessoa, é o serviço indisponível
  if (res.status === 503 || res.status === 502 || res.status === 403) throw new WaError(MSG_INDISPONIVEL, true)
  return res
}

export async function waFetch<T>(path: string, init: { method?: string; json?: unknown; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const { json, timeoutMs = 15000, method = 'GET', signal } = init
  let res: Response
  try {
    res = await pedir(path, method.toUpperCase(), json, timeoutMs, signal)
  } catch (err) {
    if (err instanceof WaError && err.offline) useWaServico.getState().markOffline()
    throw err
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new WaError(body.error || 'Falha no WhatsApp. Tente de novo.')
  return body
}

export type WaStatus = 'disconnected' | 'connecting' | 'qrcode' | 'connected'

export interface WaHealth {
  ok: boolean
  versao: string
  /** `sessaoSalva`: há sessão guardada (conectando → "Reconectando") */
  whatsapp: { status: WaStatus; user: { id: string; name: string } | null; sessaoSalva?: boolean }
  disparo: { running: number }
  agenda?: { pendentes: number }
}

export interface WaInfo {
  status: WaStatus
  qrCodeUrl: string | null
  user: { id: string; name: string } | null
  lastError: string | null
  sessaoSalva?: boolean
}

export type EstadoWhatsApp = 'verificando' | 'conectado' | 'reconectando' | 'gerando-qr' | 'aguardando-qr' | 'erro' | 'desconectado'

/** Estado mostrado na tela de Conexão a partir do que o serviço responde. */
export function estadoDoWhatsApp(wa: WaInfo | null): EstadoWhatsApp {
  if (!wa) return 'verificando'
  if (wa.status === 'connected') return 'conectado'
  if (wa.status === 'qrcode') return 'aguardando-qr'
  if (wa.status === 'connecting') return wa.sessaoSalva ? 'reconectando' : 'gerando-qr'
  return wa.lastError ? 'erro' : 'desconectado'
}

interface WaServicoState {
  /** O serviço de WhatsApp respondeu (null = ainda verificando) */
  online: boolean | null
  health: WaHealth | null
  checkedAt: number
  check(): Promise<void>
  markOffline(): void
}

export const useWaServico = create<WaServicoState>()((set) => ({
  online: null,
  health: null,
  checkedAt: 0,
  async check() {
    try {
      const res = await pedir('/health', 'GET', undefined, 8000)
      const health = (await res.json()) as WaHealth
      set({ online: res.ok, health: res.ok ? health : null, checkedAt: Date.now() })
    } catch {
      set({ online: false, health: null, checkedAt: Date.now() })
    }
  },
  markOffline() {
    set({ online: false, health: null, checkedAt: Date.now() })
  },
}))

/** Mantém o status do WhatsApp atualizado enquanto a aba está visível. */
export function useWaPolling(intervalMs = 6000) {
  const check = useWaServico((s) => s.check)
  useEffect(() => {
    void check()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check, intervalMs])
}
