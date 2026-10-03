import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'
import { LogoMark } from '../components/Brand'
import { Button } from '../components/ui'
import { toAuthEmail, toAuthPassword } from '../lib/auth'

export function LoginPage({ client }: { client: SupabaseClient }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await client.auth.signInWithPassword({ email: toAuthEmail(login), password: toAuthPassword(password) })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : error.message)
    setLoading(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 px-6 py-7">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-lg leading-6 font-semibold tracking-[-0.01em]">
              XS <span className="text-blue-400">Prospecção</span>
            </h1>
            <p className="text-xs text-fg-3">Entre para acessar seus leads e sua gestão.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="lg-user">Usuário</label>
          <input
            id="lg-user"
            autoComplete="username"
            autoCapitalize="none"
            className="input h-9"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="lg-pass">Senha</label>
          <input id="lg-pass" type="password" autoComplete="current-password" className="input h-9" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
    </div>
  )
}
