import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft, CalendarClock, Headphones, MailCheck, Wallet } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Brand'
import { Button } from '../components/ui'
import { authErrorPt, signIn } from '../lib/auth'

/** Moldura das telas de conta: marca à esquerda (no PC) e o formulário à direita. */
function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-ink lg:grid-cols-[1fr_minmax(440px,40%)]">
      <aside className="relative hidden overflow-hidden border-r border-line-soft bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link to="/" className="relative flex items-center gap-2.5">
          <LogoMark size={36} />
          <Wordmark />
        </Link>
        <div className="relative max-w-md space-y-8">
          <h2 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-fg">
            Mais ligações feitas.
            <br />
            <span className="text-fg-3">Mais sites vendidos.</span>
          </h2>
          <ul className="space-y-4 text-sm text-fg-2">
            <Point icon={<Headphones />}>Fila de ligações do dia, roteiro e objeções na tela enquanto você fala.</Point>
            <Point icon={<CalendarClock />}>Retornos e reuniões lembrados na hora certa, sem planilha.</Point>
            <Point icon={<Wallet />}>Clientes, projetos e financeiro no mesmo lugar dos leads.</Point>
          </ul>
        </div>
        <p className="relative text-2xs text-fg-4">XS Prospecção</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="inline-flex items-center gap-1.5 self-start text-xs text-fg-3 hover:text-fg">
          <ArrowLeft className="size-3.5" /> Início
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-7 space-y-1.5">
            <div className="mb-5 lg:hidden">
              <LogoMark size={48} />
            </div>
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle && <p className="text-sm text-fg-3">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-xs text-fg-3">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300 [&>svg]:size-4">{icon}</span>
      <span className="leading-6">{children}</span>
    </li>
  )
}

function Input({ id, label, aside, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; aside?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={id}>
          {label}
        </label>
        {aside}
      </div>
      <input id={id} className="input h-10" {...rest} />
    </div>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-red-300">{children}</p>
}

export function LoginPage({ client }: { client: SupabaseClient }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(await signIn(client, login, password))
    setLoading(false)
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Bom te ver de novo."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/criar-conta" className="font-medium text-blue-300 hover:text-blue-200">
            Teste grátis por 14 dias
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input id="lg-email" label="E-mail" autoComplete="username" autoCapitalize="none" inputMode="email" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
        <Input
          id="lg-pass"
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aside={
            <Link to="/esqueci-senha" className="text-2xs text-fg-3 hover:text-fg">
              Esqueci a senha
            </Link>
          }
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  )
}

export function SignupPage({ client }: { client: SupabaseClient }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setLoading(true)
    setError(null)
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}/` },
    })
    setLoading(false)
    if (error) return setError(authErrorPt(error.message))
    // Com confirmação de e-mail ligada, a sessão só vem depois do clique no link
    if (!data.session) setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <AuthShell title="Confira seu e-mail" subtitle={<>Mandamos um link para <span className="text-fg">{sentTo}</span>. Clique nele para ativar sua conta e entrar.</>}>
        <div className="flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3.5 text-xs text-fg-2">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-go" />
          Não chegou em alguns minutos? Veja a caixa de spam ou promoções.
        </div>
        <Link to="/entrar" className="mt-6 block text-center text-xs font-medium text-blue-300 hover:text-blue-200">
          Já confirmei, quero entrar
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Criar sua conta"
      subtitle="14 dias grátis. Sem cartão."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-blue-300 hover:text-blue-200">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input id="cd-nome" label="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        <Input id="cd-email" label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input id="cd-pass" label="Senha" type="password" autoComplete="new-password" minLength={6} placeholder="Pelo menos 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Começar o teste grátis
        </Button>
        <p className="text-center text-2xs leading-4 text-fg-4">Ao criar a conta você concorda com os Termos de Uso e a Política de Privacidade.</p>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setLoading(false)
    if (error) return setError(authErrorPt(error.message))
    setSent(true)
  }

  return (
    <AuthShell
      title="Recuperar a senha"
      subtitle={sent ? 'Se esse e-mail tiver conta, o link para criar uma senha nova já está a caminho.' : 'Digite o e-mail da sua conta. Mandamos um link para criar uma senha nova.'}
      footer={
        <Link to="/entrar" className="font-medium text-blue-300 hover:text-blue-200">
          Voltar para entrar
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Input id="rs-email" label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/** Aberta pelo link do e-mail de recuperação (a sessão já vem logada). */
export function NewPasswordPage({ client, onDone }: { client: SupabaseClient; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setLoading(true)
    const { error } = await client.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(authErrorPt(error.message))
    onDone()
    navigate('/', { replace: true })
  }

  return (
    <AuthShell title="Criar senha nova" subtitle="Escolha a senha que você vai usar daqui para frente.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input id="np-pass" label="Senha nova" type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Salvar e entrar
        </Button>
      </form>
    </AuthShell>
  )
}
