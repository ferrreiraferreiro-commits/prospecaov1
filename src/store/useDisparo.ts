import { create } from 'zustand'
import { randomDelay } from '../lib/disparo'

export type EnvioResultado = 'enviado' | 'pulado'

export interface DisparoSession {
  ids: string[]
  templateId: string
  minSec: number
  maxSec: number
  pos: number
  results: Record<string, EnvioResultado>
  /** A conversa do lead atual já foi aberta com a mensagem */
  opened: boolean
  /** Quando o próximo envio fica liberado (ms) */
  nextAt: number | null
  startedAt: number
}

interface DisparoState {
  session: DisparoSession | null
  start(ids: string[], templateId: string, minSec: number, maxSec: number): void
  markOpened(): void
  /** Vai para o próximo lead registrando o resultado do atual */
  advance(result: EnvioResultado): void
  skipWait(): void
  stop(): void
}

/** Disparo assistido em andamento — sobrevive à troca de tela (não ao recarregar a página). */
export const useDisparo = create<DisparoState>()((set, get) => ({
  session: null,
  start: (ids, templateId, minSec, maxSec) =>
    set({ session: { ids, templateId, minSec, maxSec, pos: 0, results: {}, opened: false, nextAt: null, startedAt: Date.now() } }),
  markOpened: () => {
    const s = get().session
    if (!s) return
    set({ session: { ...s, opened: true, nextAt: Date.now() + randomDelay(s.minSec, s.maxSec) * 1000 } })
  },
  advance: (result) => {
    const s = get().session
    if (!s) return
    const id = s.ids[s.pos]
    // A espera sorteada depois do último envio continua valendo para o próximo lead
    set({ session: { ...s, pos: s.pos + 1, results: { ...s.results, [id]: result }, opened: false } })
  },
  skipWait: () => {
    const s = get().session
    if (s) set({ session: { ...s, nextAt: null } })
  },
  stop: () => set({ session: null }),
}))
