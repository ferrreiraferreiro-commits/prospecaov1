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
