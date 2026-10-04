import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * As primeiras contas entravam por nome de usuário: o e-mail no Auth era interno
 * ("gabriel@prospeccao.local") e a senha era guardada com um sufixo fixo.
 * Hoje só se entra por e-mail; essas contas cadastram um e-mail de verdade no
 * primeiro acesso, e a senha antiga continua valendo (por isso o sufixo segue aqui).
 */
export const LOGIN_DOMAIN = 'prospeccao.local'
export const PASSWORD_SUFFIX = '::central-prospeccao'

export function toAuthPassword(password: string): string {
  return `${password}${PASSWORD_SUFFIX}`
}

/** Conta antiga, ainda com o e-mail interno do login por nome de usuário? */
export function isLegacyEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`)
}

export const SO_EMAIL = 'Agora a XS entra só pelo e-mail. Se você entrava com nome de usuário, fale com a gente para cadastrar o seu e-mail.'

/** Mensagens do Supabase Auth em português. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
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

/**
 * Entra com e-mail e senha. Contas antigas guardam a senha com o sufixo;
 * contas novas (e senhas trocadas pelo app), a senha como foi digitada.
 */
export async function signIn(client: SupabaseClient, email: string, password: string): Promise<string | null> {
  const e = email.trim().toLowerCase()
  if (!e.includes('@') || isLegacyEmail(e)) return SO_EMAIL
  let last = ''
  for (const p of [password, toAuthPassword(password)]) {
    const { error } = await client.auth.signInWithPassword({ email: e, password: p })
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
  if (err) return err === authErrorPt('invalid login credentials') ? 'A senha atual não confere.' : err
  const { error } = await client.auth.updateUser({ password: nova })
  return error ? authErrorPt(error.message) : null
}
