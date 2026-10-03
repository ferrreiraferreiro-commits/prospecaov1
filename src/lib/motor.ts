import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Motor XS: programa local (pasta motor/) que roda no computador do usuário e
 * faz o que a Vercel não consegue — busca no Google Maps (navegador automatizado)
 * e sessão do WhatsApp para disparos. O app conversa com ele por HTTP em 127.0.0.1.
 */

const URL_KEY = 'xs-prospeccao:motor-url'
export const DEFAULT_MOTOR_URL = 'http://127.0.0.1:3077'

export function getMotorUrl(): string {
  try {
    return (localStorage.getItem(URL_KEY) || DEFAULT_MOTOR_URL).replace(/\/+$/, '')
  } catch {
    return DEFAULT_MOTOR_URL
  }
}

export function setMotorUrl(url: string) {
  try {
    if (url.trim() && url.trim() !== DEFAULT_MOTOR_URL) localStorage.setItem(URL_KEY, url.trim())
    else localStorage.removeItem(URL_KEY)
  } catch {
    /* sem armazenamento */
  }
}

export class MotorError extends Error {
  constructor(
    message: string,
    readonly offline = false,
  ) {
    super(message)
  }
}

export async function motorFetch<T>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { json, timeoutMs = 15000, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${getMotorUrl()}${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch {
    useMotor.getState().markOffline()
    throw new MotorError('O Motor XS não está rodando neste computador. Abra o "Iniciar Motor XS" e tente de novo.', true)
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new MotorError(body.error || `Falha no Motor XS (${res.status}).`)
  return body
}

export type WaStatus = 'disconnected' | 'connecting' | 'qrcode' | 'connected'

export interface MotorHealth {
  ok: boolean
  versao: string
  navegador: boolean
  whatsapp: { status: WaStatus; user: { id: string; name: string } | null }
  /** `pendente`/`runId` só vêm do motor 1.2+: há resultados que ainda não foram para os leads */
  maps: { active: boolean; phase: string; runId?: string | null; pendente?: boolean }
  disparo: { running: number }
  agenda?: { pendentes: number }
  /** O motor está impedindo o Windows de suspender */
  acordado?: boolean
}

interface MotorState {
  online: boolean | null
  health: MotorHealth | null
  checkedAt: number
  check(): Promise<void>
  markOffline(): void
}

export const useMotor = create<MotorState>()((set) => ({
  online: null,
  health: null,
  checkedAt: 0,
  async check() {
    try {
      const res = await fetch(`${getMotorUrl()}/health`, { signal: AbortSignal.timeout(2500) })
      const health = (await res.json()) as MotorHealth
      set({ online: res.ok, health, checkedAt: Date.now() })
    } catch {
      set({ online: false, health: null, checkedAt: Date.now() })
    }
  },
  markOffline() {
    set({ online: false, health: null, checkedAt: Date.now() })
  },
}))

/** Mantém o status do Motor atualizado enquanto a aba está visível. */
export function useMotorPolling(intervalMs = 6000) {
  const check = useMotor((s) => s.check)
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
