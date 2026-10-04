import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Motor WhatsApp XS: programa local (pasta motor/) que roda no computador do usuário e
 * mantém a sessão do WhatsApp para os disparos, funis e mensagens agendadas.
 *
 * Motor 1.4+ ligado à conta (tabela `motores`): o app fala com ele pela ponte da XS na internet
 * (busca/ponte.ts na VPS), sem chamar 127.0.0.1 — o Chrome e o Brave bloqueiam isso sem permissão.
 * Sem motor ligado (motor antigo ou app sem login): HTTP direto em 127.0.0.1, como antes.
 */

/** Mesmo endereço de public/motor.json, que o motor lê para achar a ponte */
export const PONTE_URL = ((import.meta.env.VITE_PONTE_URL as string | undefined) || 'https://109-110-184-199.sslip.io/ponte').replace(/\/+$/, '')
export const CHAVE_MOTOR_OK = /^[A-Za-z0-9_-]{32,64}$/

/** Chave do motor ligado à conta (null = nenhum) */
let chave: string | null = null
/** App com login: só fala com o motor pela ponte, nunca por 127.0.0.1 */
let modoPonte = false
/** Enquanto lê a conta, as verificações esperam (para não dizer "nenhum motor" à toa) */
let carregando: Promise<void> | null = null

/** Lê da conta qual motor está ligado a ela. */
export function carregarMotorDaConta(client: SupabaseClient): Promise<void> {
  modoPonte = true
  carregando = (async () => {
    const { data } = await client.from('motores').select('chave, computador').maybeSingle()
    const row = data as { chave: string; computador: string | null } | null
    chave = row?.chave ?? null
    useMotor.setState({ ligado: !!chave, computador: row?.computador ?? null })
  })().finally(() => {
    carregando = null
    void useMotor.getState().check()
  })
  return carregando
}

/** Liga à conta o motor que abriu /motor/conectar#chave (troca o anterior, se houver). */
export async function ligarMotorNaConta(client: SupabaseClient, userId: string, novaChave: string, computador: string | null): Promise<void> {
  const { error } = await client
    .from('motores')
    .upsert({ user_id: userId, chave: novaChave, computador, ligado_em: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  chave = novaChave
  useMotor.setState({ ligado: true, computador })
  await useMotor.getState().check()
}

export async function desligarMotorDaConta(client: SupabaseClient): Promise<void> {
  const { error } = await client.from('motores').delete().not('user_id', 'is', null)
  if (error) throw new Error(error.message)
  chave = null
  useMotor.setState({ ligado: false, computador: null })
  await useMotor.getState().check()
}

const OFFLINE_MSG = 'O Motor WhatsApp XS não está aberto neste computador. Abra o "Motor WhatsApp XS" e tente de novo.'

/** Faz o pedido ao motor pela ponte; a resposta é a do próprio motor. */
async function pelaPonte(c: string, path: string, method: string, json: unknown, timeoutMs: number, signal?: AbortSignal | null): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${PONTE_URL}/pedido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Motor-Chave': c },
      body: JSON.stringify({ method, path, timeoutMs, ...(json !== undefined ? { body: json } : {}) }),
      signal: signal ?? AbortSignal.timeout(timeoutMs + 3000),
    })
  } catch {
    throw new MotorError('Sem conexão com a XS para falar com o Motor WhatsApp XS. Confira a internet e tente de novo.', true)
  }
  if (res.status === 503) {
    const body = (await res.clone().json().catch(() => ({}))) as { offline?: boolean }
    if (body.offline) throw new MotorError(OFFLINE_MSG, true)
  }
  return res
}

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
  if (carregando) await carregando.catch(() => {})
  let res: Response
  if (modoPonte && !chave) throw new MotorError('Nenhum Motor WhatsApp XS ligado à sua conta. Baixe e abra o motor: ele se liga sozinho.', true)
  if (chave) {
    try {
      res = await pelaPonte(chave, path, (rest.method ?? 'GET').toUpperCase(), json, timeoutMs, rest.signal)
    } catch (err) {
      if (err instanceof MotorError && err.offline) useMotor.getState().markOffline()
      throw err
    }
  } else {
    try {
      res = await fetch(`${getMotorUrl()}${path}`, {
        ...rest,
        headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
        signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      })
    } catch {
      useMotor.getState().markOffline()
      throw new MotorError(OFFLINE_MSG, true)
    }
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
  /** Nome do computador (motor 1.4+) */
  computador?: string
  /** O motor está impedindo o Windows de suspender */
  acordado?: boolean
}

interface MotorState {
  online: boolean | null
  health: MotorHealth | null
  checkedAt: number
  /** A conta tem um motor ligado (só no app com login) */
  ligado: boolean
  /** Nome do computador do motor ligado */
  computador: string | null
  check(): Promise<void>
  markOffline(): void
}

export const useMotor = create<MotorState>()((set) => ({
  online: null,
  health: null,
  checkedAt: 0,
  ligado: false,
  computador: null,
  async check() {
    if (carregando) await carregando.catch(() => {})
    // App com login e nenhum motor ligado: nem tenta 127.0.0.1 (o navegador pediria permissão)
    if (modoPonte && !chave) return set({ online: false, health: null, checkedAt: Date.now() })
    try {
      const res = chave ? await pelaPonte(chave, '/health', 'GET', undefined, 5000) : await fetch(`${getMotorUrl()}/health`, { signal: AbortSignal.timeout(2500) })
      const health = (await res.json()) as MotorHealth
      set({ online: res.ok, health: res.ok ? health : null, checkedAt: Date.now() })
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

/** Procura pela ponte o motor dessa chave (antes de ligá-lo à conta). null = não está aberto. */
export async function sondarMotor(c: string): Promise<MotorHealth | null> {
  try {
    const res = await pelaPonte(c, '/health', 'GET', undefined, 5000)
    return res.ok ? ((await res.json()) as MotorHealth) : null
  } catch {
    return null
  }
}

/** Link aberto pelo motor (/motor/conectar#chave): guarda a chave para depois do login. */
const CHAVE_PENDENTE = 'xs-prospeccao:motor-chave'

export function guardarChavePendente() {
  if (window.location.pathname.replace(/\/+$/, '') !== '/motor/conectar') return
  const c = window.location.hash.slice(1)
  if (!CHAVE_MOTOR_OK.test(c)) return
  try {
    sessionStorage.setItem(CHAVE_PENDENTE, c)
  } catch {
    /* sem armazenamento: depende do # continuar no endereço */
  }
}

export function chavePendente(): string | null {
  const doEndereco = window.location.hash.slice(1)
  if (CHAVE_MOTOR_OK.test(doEndereco)) return doEndereco
  try {
    const salva = sessionStorage.getItem(CHAVE_PENDENTE)
    return salva && CHAVE_MOTOR_OK.test(salva) ? salva : null
  } catch {
    return null
  }
}

export function esquecerChavePendente() {
  try {
    sessionStorage.removeItem(CHAVE_PENDENTE)
  } catch {
    /* sem armazenamento */
  }
  if (window.location.hash) history.replaceState(null, '', window.location.pathname)
}
