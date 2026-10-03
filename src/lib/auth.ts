import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O Supabase exige e-mail e senha com 6+ caracteres. Para permitir login por
 * nome de usuário e senhas curtas, o app converte os dois antes de enviar:
 *   "Gabriel" → "gabriel@prospeccao.local"
 *   senha     → senha + sufixo fixo
 * Os usuários precisam ser criados com essa mesma conversão (ver supabase/criar_usuarios.sql).
 */
export const LOGIN_DOMAIN = 'prospeccao.local'
export const PASSWORD_SUFFIX = '::central-prospeccao'

export function toAuthEmail(login: string): string {
  const v = login.trim().toLowerCase()
  if (v.includes('@')) return v
  const slug = v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
  return `${slug}@${LOGIN_DOMAIN}`
}

export function toAuthPassword(password: string): string {
  return `${password}${PASSWORD_SUFFIX}`
}

/** Mensagens do Supabase Auth em português. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail (ou usuário) ou senha incorretos.'
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
 * Entra com e-mail ou com o usuário antigo. Contas antigas (criadas por usuário)
 * guardam a senha com o sufixo; contas novas, a senha como foi digitada.
 */
export async function signIn(client: SupabaseClient, login: string, password: string): Promise<string | null> {
  const legacy = !login.includes('@')
  const tries = legacy ? [toAuthPassword(password), password] : [password, toAuthPassword(password)]
  let last = ''
  for (const p of tries) {
    const { error } = await client.auth.signInWithPassword({ email: toAuthEmail(login), password: p })
    if (!error) return null
    last = error.message
    if (!last.toLowerCase().includes('invalid login credentials')) break
  }
  return authErrorPt(last)
}
