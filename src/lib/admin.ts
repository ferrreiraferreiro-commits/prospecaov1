import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ciclo, Profile } from '../store/useAccount'
import { LOGIN_DOMAIN } from './auth'

/** Uma conta na tela "Contas" (só o dono da XS vê). */
export interface Conta {
  user_id: string
  email: string | null
  nome: string | null
  cidade: string | null
  plano: Profile['plano']
  ciclo: Ciclo | null
  teste_ate: string
  plano_ate: string | null
  admin: boolean
  created_at: string
  ultimo_acesso: string | null
}

/** O que o dono escolhe no modal: um ciclo pago, teste, vitalício ou pausar. */
export type Escolha = 'teste' | Ciclo | 'vitalicio' | 'cancelado'

export const ESCOLHAS: { id: Escolha; label: string }[] = [
  { id: 'teste', label: 'Teste grátis' },
  { id: 'diario', label: 'Diário' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'vitalicio', label: 'Vitalício' },
  { id: 'cancelado', label: 'Pausar acesso' },
]

const CICLOS: Ciclo[] = ['diario', 'semanal', 'mensal', 'trimestral']

export function isCiclo(e: Escolha): e is Ciclo {
  return (CICLOS as string[]).includes(e)
}

/** Escolha que corresponde ao plano atual da conta. */
export function escolhaAtual(c: Pick<Conta, 'plano' | 'ciclo'>): Escolha {
  if (c.plano === 'ativo') return c.ciclo ?? 'mensal'
  return c.plano
}

/** Soma um ciclo a uma data. */
export function somarCiclo(ciclo: Ciclo, desde: Date): Date {
  const d = new Date(desde)
  if (ciclo === 'diario') d.setDate(d.getDate() + 1)
  else if (ciclo === 'semanal') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + (ciclo === 'mensal' ? 1 : 3))
  return d
}

/**
 * Data sugerida para o fim: se a conta já tem um plano pago em dia, renova a
 * partir do fim atual (não perde os dias que faltam); senão, conta de agora.
 */
export function fimSugerido(escolha: Escolha, c: Pick<Conta, 'plano' | 'plano_ate'>, now = new Date()): Date | null {
  if (escolha === 'teste') return somarCiclo('diario', now)
  if (!isCiclo(escolha)) return null
  const atual = c.plano === 'ativo' && c.plano_ate ? new Date(c.plano_ate) : null
  return somarCiclo(escolha, atual && atual > now ? atual : now)
}

/** "gabriel" para logins por usuário; o e-mail nos outros. */
export function loginDe(email: string | null): string {
  if (!email) return 'Sem e-mail'
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email
}

export async function listarContas(db: SupabaseClient): Promise<Conta[]> {
  const { data, error } = await db.rpc('admin_contas')
  if (error) throw new Error(error.message)
  return (data ?? []) as Conta[]
}

export async function definirPlano(db: SupabaseClient, alvo: string, escolha: Escolha, ate: Date | null): Promise<void> {
  const plano = isCiclo(escolha) ? 'ativo' : escolha
  const { error } = await db.rpc('admin_definir_plano', {
    alvo,
    novo_plano: plano,
    novo_ciclo: isCiclo(escolha) ? escolha : null,
    ate: ate ? ate.toISOString() : null,
  })
  if (error) throw new Error(error.message)
}
