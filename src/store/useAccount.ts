import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

/** Conta na XS: quem é, plano/teste e recursos liberados (tabela `profiles`). */
export interface Profile {
  user_id: string
  email: string | null
  nome: string | null
  cidade: string | null
  plano: 'teste' | 'ativo' | 'cancelado' | 'vitalicio'
  teste_ate: string
  /** Ex.: 'motor' = busca no Maps e WhatsApp pelo Motor XS */
  recursos: string[]
  boas_vindas_feitas: boolean
}

type EditableProfile = Partial<Pick<Profile, 'nome' | 'cidade' | 'boas_vindas_feitas'>>

interface AccountState {
  profile: Profile | null
  ready: boolean
  init(client: SupabaseClient | null, userId?: string): Promise<void>
  save(patch: EditableProfile): Promise<void>
}

// Modo local (sem Supabase): uma conta completa guardada no navegador
const LOCAL_KEY = 'xs-prospeccao:conta'

function localProfile(): Profile {
  let saved: EditableProfile = {}
  try {
    saved = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as EditableProfile
  } catch {
    /* sem armazenamento */
  }
  return {
    user_id: 'local',
    email: null,
    nome: null,
    cidade: null,
    plano: 'vitalicio',
    teste_ate: new Date().toISOString(),
    recursos: ['motor'],
    boas_vindas_feitas: false,
    ...saved,
  }
}

let db: SupabaseClient | null = null

export const useAccount = create<AccountState>()((set, get) => ({
  profile: null,
  ready: false,

  async init(client, userId) {
    db = client
    set({ ready: false })
    if (!client || !userId) {
      set({ profile: localProfile(), ready: true })
      return
    }
    const { data } = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle()
    // Sem perfil (não deveria acontecer): não bloqueia o uso
    set({ profile: (data as Profile | null) ?? null, ready: true })
  },

  async save(patch) {
    const current = get().profile
    if (!current) return
    set({ profile: { ...current, ...patch } })
    if (!db) {
      try {
        const { nome, cidade, boas_vindas_feitas } = { ...current, ...patch }
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ nome, cidade, boas_vindas_feitas }))
      } catch {
        /* sem armazenamento */
      }
      return
    }
    const { error } = await db
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', current.user_id)
    if (error) throw new Error(error.message)
  },
}))

/** A conta pode usar o Motor XS (busca no Maps, disparo e agendamento pelo WhatsApp)? */
export function useHasMotor(): boolean {
  return useAccount((s) => !s.profile || s.profile.recursos.includes('motor'))
}

export type Access = { ok: true; diasDeTeste: number | null; horasDeTeste: number | null } | { ok: false; motivo: 'teste_acabou' | 'cancelado' }

/** Pode entrar no app? No teste, quantos dias faltam. */
export function accessOf(profile: Profile | null, now = Date.now()): Access {
  if (!profile) return { ok: true, diasDeTeste: null, horasDeTeste: null }
  if (profile.plano === 'cancelado') return { ok: false, motivo: 'cancelado' }
  if (profile.plano !== 'teste') return { ok: true, diasDeTeste: null, horasDeTeste: null }
  const left = Date.parse(profile.teste_ate) - now
  if (left <= 0) return { ok: false, motivo: 'teste_acabou' }
  return { ok: true, diasDeTeste: Math.ceil(left / 86_400_000), horasDeTeste: Math.ceil(left / 3_600_000) }
}
