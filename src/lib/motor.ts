import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Motor WhatsApp XS: programa local (pasta motor/) que roda no computador do usuário e
 * mantém a sessão do WhatsApp para os disparos, funis e mensagens agendadas.
 * O app conversa com ele por HTTP em 127.0.0.1.
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
    throw new MotorError('O Motor WhatsApp XS não está rodando neste computador. Abra o "Motor WhatsApp XS" e tente de novo.', true)
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new MotorError(body.error || `Falha no Motor WhatsApp XS (${res.status}).`)
  return body
}

export type WaStatus = 'disconnected' | 'connecting' | 'qrcode' | 'connected'

export interface MotorHealth {
  ok: boolean
  versao: string
  /** Só o motor antigo (até 1.2) informava: tinha a busca no Maps */
  navegador?: boolean
  whatsapp: { status: WaStatus; user: { id: string; name: string } | null }
  /** `pendente`/`runId` só vêm do motor 1.2+: há resultados que ainda não foram para os leads */
  maps?: { active: boolean; phase: string; runId?: string | null; pendente?: boolean }
  disparo: { running: number }
  agenda?: { pendentes: number }
  /** O motor está impedindo o Windows de suspender */
  acordado?: boolean
}

interface MotorState {
  online: boolean | null
  health: MotorHealth | null
  checkedAt: number
  /** O navegador negou o acesso a programas deste computador (o motor pode estar aberto) */
  bloqueado: boolean
  check(): Promise<void>
  markOffline(): void
}

/**
 * Chrome (e Edge) pedem permissão para um site público falar com programas do próprio
 * computador. Se a pessoa negou ou fechou o aviso, o fetch falha igual a motor desligado.
 * Os nomes mudaram entre versões, então pergunta pelos três.
 */
async function navegadorBloqueia(): Promise<boolean> {
  if (!navigator.permissions) return false
  for (const name of ['loopback-network', 'local-network-access', 'local-network']) {
    try {
      const { state } = await navigator.permissions.query({ name: name as PermissionName })
      return state === 'denied'
    } catch {
      /* este navegador não conhece esse nome */
    }
  }
  return false
}

export const useMotor = create<MotorState>()((set) => ({
  online: null,
  health: null,
  checkedAt: 0,
  bloqueado: false,
  async check() {
    try {
      const res = await fetch(`${getMotorUrl()}/health`, { signal: AbortSignal.timeout(2500) })
      const health = (await res.json()) as MotorHealth
      set({ online: res.ok, health, checkedAt: Date.now(), bloqueado: false })
    } catch {
      set({ online: false, health: null, checkedAt: Date.now(), bloqueado: await navegadorBloqueia() })
    }
  },
  markOffline() {
    set({ online: false, health: null, checkedAt: Date.now() })
    void navegadorBloqueia().then((bloqueado) => set({ bloqueado }))
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
