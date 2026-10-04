import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ciclo, Profile } from '../store/useAccount'
import { LOGIN_DOMAIN } from './auth'

/** Uma conta na tela "Contas" (só o dono da XS vê). */
export interface Conta {
  user_id: string
  email: string | null
  usuario: string | null
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

/** O usuário (ex.: "ana.web") para logins por usuário; o e-mail nos outros. */
export function loginDe(email: string | null): string {
  if (!email) return 'Sem e-mail'
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email
}

export async function listarContas(db: SupabaseClient): Promise<Conta[]> {
  const { data, error } = await db.rpc('admin_contas')
  if (error) throw new Error(error.message)
  return (data ?? []) as Conta[]
}

export async function definirEmail(db: SupabaseClient, alvo: string, email: string): Promise<void> {
  const { error } = await db.rpc('admin_definir_email', { alvo, novo: email })
  if (error) throw new Error(error.message)
}

export async function novaSenha(db: SupabaseClient, alvo: string, senha: string): Promise<void> {
  const { error } = await db.rpc('admin_nova_senha', { alvo, senha })
  if (error) throw new Error(error.message)
}

/** Senha provisória fácil de ditar (sem 0/o, 1/l/i). */
export function gerarSenha(tamanho = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

/** Pagamento que o dono recebeu de uma conta. */
export interface PagamentoXs {
  id: string
  user_id: string
  valor: number
  /** diario | semanal | mensal | trimestral | vitalicio | teste */
  plano: string
  pago_em: string
  obs: string | null
}

export async function listarPagamentos(db: SupabaseClient): Promise<PagamentoXs[]> {
  const { data, error } = await db.from('pagamentos_xs').select('id,user_id,valor,plano,pago_em,obs').order('pago_em', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as PagamentoXs[]).map((p) => ({ ...p, valor: Number(p.valor) }))
}

export async function registrarPagamento(db: SupabaseClient, p: Omit<PagamentoXs, 'id'>): Promise<void> {
  const { error } = await db.from('pagamentos_xs').insert(p)
  if (error) throw new Error(error.message)
}

export async function apagarPagamento(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('pagamentos_xs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Soma do que entrou no mês de `now` (horário local). */
export function recebidoNoMes(pagamentos: Pick<PagamentoXs, 'valor' | 'pago_em'>[], now = new Date()): number {
  return pagamentos
    .filter((p) => {
      const d = new Date(p.pago_em)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    .reduce((s, p) => s + p.valor, 0)
}

export function nomeDoPlano(plano: string): string {
  return ESCOLHAS.find((e) => e.id === plano)?.label ?? plano
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
