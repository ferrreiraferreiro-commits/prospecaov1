import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Entra com usuário OU e-mail. O usuário fica em profiles.usuario e o banco devolve
 * o e-mail do Auth correspondente (função email_para_login).
 *
 * As primeiras contas foram criadas só com usuário: o e-mail no Auth é interno
 * ("gabriel@prospeccao.local") e a senha foi guardada com um sufixo fixo. Elas
 * continuam entrando com a senha de sempre (por isso o sufixo segue aqui).
 */
export const LOGIN_DOMAIN = 'prospeccao.local'
export const PASSWORD_SUFFIX = '::central-prospeccao'

export function toAuthPassword(password: string): string {
  return `${password}${PASSWORD_SUFFIX}`
}

/** Conta antiga, sem e-mail de verdade (só o interno do login por usuário)? */
export function isLegacyEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`)
}

/** Usuário como foi guardado: minúsculo, sem acento, espaços viram ponto. */
export function normalizarUsuario(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
}

/** Regra do cadastro: 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado. */
export function usuarioValido(v: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(v)
}

export const USUARIO_REGRA = 'Use de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado, sem espaço.'

const CREDENCIAIS = 'Usuário, e-mail ou senha incorretos.'

/** Mensagens do Supabase Auth em português. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return CREDENCIAIS
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Entre ou recupere a senha.'
  if (m.includes('at least 6')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas agora. Espere alguns minutos e tente de novo.'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Esse e-mail não parece válido.'
  if (m.includes('same password') || m.includes('should be different')) return 'Escolha uma senha diferente da anterior.'
  if (m.includes('weak') || m.includes('pwned')) return 'Essa senha é fraca ou já vazou em outro site. Escolha outra.'
  if (m.includes('fetch')) return 'Sem conexão. Confira a internet e tente de novo.'
  return message
}

/** E-mail do Auth para o que foi digitado (e-mail como está; usuário pelo banco). */
export async function emailDoLogin(client: SupabaseClient, login: string): Promise<string | null> {
  const v = login.trim().toLowerCase()
  if (v.includes('@')) return v
  const usuario = normalizarUsuario(v)
  if (!usuario) return null
  const { data } = await client.rpc('email_para_login', { u: usuario })
  return (data as string | null) ?? null
}

/**
 * Entra com usuário ou e-mail e a senha. Contas antigas guardam a senha com o sufixo;
 * contas novas (e senhas trocadas pelo app), a senha como foi digitada.
 */
export async function signIn(client: SupabaseClient, login: string, password: string): Promise<string | null> {
  const email = await emailDoLogin(client, login)
  if (!email) return CREDENCIAIS
  let last = ''
  for (const p of [password, toAuthPassword(password)]) {
    const { error } = await client.auth.signInWithPassword({ email, password: p })
    if (!error) return null
    last = error.message
    if (!last.toLowerCase().includes('invalid login credentials')) break
  }
  return authErrorPt(last)
}

/** Troca a senha de quem está logado; confere a senha atual antes. */
export async function changePassword(client: SupabaseClient, email: string, atual: string, nova: string): Promise<string | null> {
  if (nova.length < 6) return 'A senha nova precisa ter pelo menos 6 caracteres.'
  const err = await signIn(client, email, atual)
  if (err) return err === CREDENCIAIS ? 'A senha atual não confere.' : err
  const { error } = await client.auth.updateUser({ password: nova })
  return error ? authErrorPt(error.message) : null
}
