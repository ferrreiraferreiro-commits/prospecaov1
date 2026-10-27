import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

/** De quanto em quanto tempo o plano pago renova. */
export type Ciclo = 'diario' | 'semanal' | 'mensal' | 'trimestral'

/** Conta na XS: quem é, plano/teste e recursos liberados (tabela `profiles`). */
export interface Profile {
  user_id: string
  email: string | null
  /** Nome de usuário para entrar (além do e-mail) */
  usuario?: string | null
  nome: string | null
  cidade: string | null
  plano: 'teste' | 'ativo' | 'cancelado' | 'vitalicio'
  teste_ate: string
  /** Plano ativo: ciclo e até quando vale (vazio = sem data para acabar) */
  ciclo?: Ciclo | null
  plano_ate?: string | null
  /** Ex.: 'motor' = busca no Maps e WhatsApp pelo Motor WhatsApp XS */
  recursos: string[]
  boas_vindas_feitas: boolean
  /** Dono da XS: vê a tela Contas e muda o plano dos outros */
  admin?: boolean
  /** Até quando a conta já viu os avisos da XS no sininho (hora do último aviso visto) */
  avisos_vistos_em?: string | null
}

/** Papel na equipe (plano Times). Quem não está em equipe é 'dono' da própria conta. */
export type PapelEquipe = 'dono' | 'gestor' | 'vendedor'

export interface MembroEquipe {
  id: string
  nome: string | null
  usuario: string | null
  /** Só o dono vê */
  email: string | null
  papel: Exclude<PapelEquipe, 'dono'>
  ve_todos: boolean
  aceito: boolean
}

/** Equipe da pessoa logada (RPC minha_equipe). */
export interface Equipe {
  /** Conta dona dos dados que a pessoa usa (ela mesma ou o dono da equipe) */
  conta: string
  papel: PapelEquipe
  /** A própria conta tem o plano Times (pode montar equipe) */
  times: boolean
  limite: number
  /** Dono da equipe em que a pessoa trabalha (null = é dona da própria conta) */
  dono: { id: string; nome: string | null } | null
  /** Convite esperando resposta */
  convite: { dono: string | null; papel: string } | null
  membros: MembroEquipe[]
}

type EditableProfile = Partial<Pick<Profile, 'nome' | 'cidade' | 'boas_vindas_feitas'>>

interface AccountState {
  profile: Profile | null
  equipe: Equipe | null
  ready: boolean
  init(client: SupabaseClient | null, userId?: string): Promise<void>
  save(patch: EditableProfile): Promise<void>
  /** Lê o perfil de novo sem tela de carregando (ex.: acabou de pagar o plano). */
  recarregar(): Promise<void>
  /** Lê a equipe de novo (depois de convidar, tirar ou mudar o papel de alguém). */
  recarregarEquipe(): Promise<void>
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

/** Quem trabalha na equipe de outra pessoa usa o plano e os recursos do dono. */
async function comPlanoDoDono(client: SupabaseClient, profile: Profile | null, equipe: Equipe | null): Promise<Profile | null> {
  if (!profile || !equipe || equipe.conta === profile.user_id) return profile
  const { data } = await client.rpc('meu_acesso')
  const a = (data as Pick<Profile, 'plano' | 'plano_ate' | 'teste_ate' | 'recursos'>[] | null)?.[0]
  if (!a) return profile
  return { ...profile, plano: a.plano, plano_ate: a.plano_ate, teste_ate: a.teste_ate, ciclo: null, recursos: a.recursos.filter((r) => r !== 'times'), admin: false }
}

async function lerEquipe(client: SupabaseClient): Promise<Equipe | null> {
  const { data, error } = await client.rpc('minha_equipe')
  return error ? null : (data as Equipe)
}

export const useAccount = create<AccountState>()((set, get) => ({
  profile: null,
  equipe: null,
  ready: false,

  async init(client, userId) {
    db = client
    set({ ready: false })
    if (!client || !userId) {
      set({ profile: localProfile(), ready: true })
      return
    }
    const [{ data }, equipe] = await Promise.all([client.from('profiles').select('*').eq('user_id', userId).maybeSingle(), lerEquipe(client)])
    // Sem perfil (não deveria acontecer): não bloqueia o uso
    set({ profile: await comPlanoDoDono(client, (data as Profile | null) ?? null, equipe), equipe, ready: true })
  },

  async recarregar() {
    const current = get().profile
    if (!db || !current) return
    const { data } = await db.from('profiles').select('*').eq('user_id', current.user_id).maybeSingle()
    if (data) set({ profile: await comPlanoDoDono(db, data as Profile, get().equipe) })
  },

  async recarregarEquipe() {
    if (!db) return
    const equipe = await lerEquipe(db)
    if (equipe) set({ equipe })
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

/** A conta pode usar o WhatsApp da XS (disparo, funis e agendamento)? No banco, o recurso se chama "motor". */
export function useHasWhatsApp(): boolean {
  return useAccount((s) => !s.profile || s.profile.recursos.includes('motor'))
}

/** A conta tem a IA no WhatsApp liberada (recurso "ia", o dono da XS liga em Contas)? O dono sempre tem. */
export function useHasIA(): boolean {
  return useAccount((s) => !!s.profile && (s.profile.admin || s.profile.recursos.includes('ia')))
}

/** Papel na equipe; sem equipe (ou no modo local), 'dono'. */
export function usePapel(): PapelEquipe {
  return useAccount((s) => s.equipe?.papel ?? 'dono')
}

/** É o dono da XS (tela Contas)? O banco confere de novo em cada chamada. */
export function useIsAdmin(): boolean {
  return useAccount((s) => !!s.profile?.admin)
}

export type Access = { ok: true; diasDeTeste: number | null; horasDeTeste: number | null } | { ok: false; motivo: 'teste_acabou' | 'plano_venceu' | 'cancelado' }

/** Pode entrar no app? No teste, quantos dias faltam. */
export function accessOf(profile: Profile | null, now = Date.now()): Access {
  if (!profile) return { ok: true, diasDeTeste: null, horasDeTeste: null }
  if (profile.plano === 'cancelado') return { ok: false, motivo: 'cancelado' }
  if (profile.plano === 'ativo' && profile.plano_ate && Date.parse(profile.plano_ate) <= now) return { ok: false, motivo: 'plano_venceu' }
  if (profile.plano !== 'teste') return { ok: true, diasDeTeste: null, horasDeTeste: null }
  const left = Date.parse(profile.teste_ate) - now
  if (left <= 0) return { ok: false, motivo: 'teste_acabou' }
  return { ok: true, diasDeTeste: Math.ceil(left / 86_400_000), horasDeTeste: Math.ceil(left / 3_600_000) }
}

const CICLOS: Record<Ciclo, string> = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', trimestral: 'Trimestral' }

export interface PlanInfo {
  nome: string
  /** Quando acaba (ISO); `null` = não acaba */
  ate: string | null
  /** Dias até acabar, arredondado para cima */
  dias: number | null
}

/** Nome do plano e quando acaba, para o menu do perfil. */
export function planInfo(profile: Profile | null, now = Date.now()): PlanInfo | null {
  if (!profile) return null
  const nome =
    profile.plano === 'vitalicio'
      ? 'Vitalício'
      : profile.plano === 'teste'
        ? 'Teste grátis'
        : profile.plano === 'cancelado'
          ? 'Cancelado'
          : profile.ciclo
            ? CICLOS[profile.ciclo]
            : 'Assinatura'
  const ate = profile.plano === 'teste' ? profile.teste_ate : profile.plano === 'ativo' ? (profile.plano_ate ?? null) : null
  return { nome, ate, dias: ate ? Math.max(0, Math.ceil((Date.parse(ate) - now) / 86_400_000)) : null }
}
