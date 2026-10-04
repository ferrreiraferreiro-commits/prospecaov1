import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft, CalendarClock, Headphones, MailCheck, Wallet } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Brand'
import { Button } from '../components/ui'
import { authErrorPt, emailDoLogin, isLegacyEmail, signIn, USUARIO_REGRA, usuarioValido } from '../lib/auth'
import { suporteUrl, useSuporteWhatsApp } from '../lib/suporte'

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

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
          <h2 className="land-in text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-fg" style={delay(80)}>
            Mais ligações feitas.
            <br />
            <span className="text-fg-3">Mais sites vendidos.</span>
          </h2>
          <ul className="space-y-4 text-sm text-fg-2">
            <Point d={220} icon={<Headphones />}>Fila de ligações do dia, roteiro e objeções na tela enquanto você fala.</Point>
            <Point d={320} icon={<CalendarClock />}>Retornos e reuniões lembrados na hora certa, sem planilha.</Point>
            <Point d={420} icon={<Wallet />}>Clientes, projetos e financeiro no mesmo lugar dos leads.</Point>
          </ul>
        </div>
        <p className="relative text-2xs text-fg-4">XS Prospecção</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="inline-flex items-center gap-1.5 self-start text-xs text-fg-3 hover:text-fg">
          <ArrowLeft className="size-3.5" /> Início
        </Link>
        <div className="land-in mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10" style={delay(40)}>
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

function Point({ icon, children, d }: { icon: ReactNode; children: ReactNode; d: number }) {
  return (
    <li className="land-in flex gap-3" style={delay(d)}>
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
            Teste 1 dia grátis
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input id="lg-email" label="Usuário ou e-mail" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
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
  const [usuario, setUsuario] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const livre = useUsuarioLivre(client, usuario)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const u = usuario.trim().toLowerCase()
    if (!usuarioValido(u)) return setError(USUARIO_REGRA)
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setLoading(true)
    setError(null)
    const { data: disponivel } = await client.rpc('usuario_disponivel', { u })
    if (disponivel === false) {
      setLoading(false)
      return setError('Esse usuário já está em uso. Escolha outro.')
    }
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nome: nome.trim(), usuario: u }, emailRedirectTo: `${window.location.origin}/` },
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
      subtitle="1 dia grátis com tudo liberado. Sem cartão."
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
        <div>
          <Input
            id="cd-usuario"
            label="Usuário"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ex.: ana.web"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s+/g, ''))}
            required
            aside={<UsuarioStatus estado={livre} />}
          />
          <p className="mt-1 text-2xs text-fg-4">Você entra com o usuário ou com o e-mail.</p>
        </div>
        <Input id="cd-email" label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input id="cd-pass" label="Senha" type="password" autoComplete="new-password" minLength={6} placeholder="Pelo menos 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Começar o teste grátis
        </Button>
        <p className="text-center text-2xs leading-4 text-fg-4">
          Ao criar a conta você concorda com os{' '}
          <a href="/termos" target="_blank" rel="noopener" className="text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
            Termos de Uso
          </a>{' '}
          e a{' '}
          <a href="/privacidade" target="_blank" rel="noopener" className="text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
            Política de Privacidade
          </a>
          .
        </p>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [semEmail, setSemEmail] = useState(false)
  const [sent, setSent] = useState(false)
  const suporte = useSuporteWhatsApp()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSemEmail(false)
    const destino = await emailDoLogin(client, email)
    // Conta só com usuário (sem e-mail): a senha nova vem pelo dono da XS
    if (isLegacyEmail(destino)) {
      setLoading(false)
      return setSemEmail(true)
    }
    if (!destino) {
      // Usuário que não existe: mesma resposta de sucesso, sem dizer se existe
      setLoading(false)
      return setSent(true)
    }
    const { error } = await client.auth.resetPasswordForEmail(destino, { redirectTo: `${window.location.origin}/redefinir-senha` })
    setLoading(false)
    if (error) return setError(authErrorPt(error.message))
    setSent(true)
  }

  return (
    <AuthShell
      title="Recuperar a senha"
      subtitle={sent ? 'Se essa conta existir, o link para criar uma senha nova já foi para o e-mail dela.' : 'Digite seu usuário ou e-mail. Mandamos um link para o e-mail da conta.'}
      footer={
        <Link to="/entrar" className="font-medium text-blue-300 hover:text-blue-200">
          Voltar para entrar
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Input id="rs-email" label="Usuário ou e-mail" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          {error && <ErrorText>{error}</ErrorText>}
          {semEmail && (
            <ErrorText>
              Essa conta não tem e-mail cadastrado, então o link não tem para onde ir. Fale com a gente para receber uma senha nova.
              {suporte && (
                <a href={suporteUrl(suporte, `Oi! Esqueci a senha da XS. Meu usuário: ${email.trim()}`)} target="_blank" rel="noreferrer" className="mt-1.5 block font-medium text-red-200 underline">
                  Falar no WhatsApp
                </a>
              )}
            </ErrorText>
          )}
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

type Livre = 'vazio' | 'invalido' | 'checando' | 'livre' | 'ocupado'

/** Confere no banco, com uma pausa curta, se o usuário digitado está livre. */
function useUsuarioLivre(client: SupabaseClient, usuario: string): Livre {
  const u = usuario.trim().toLowerCase()
  const [res, setRes] = useState<{ u: string; livre: boolean } | null>(null)
  useEffect(() => {
    if (!usuarioValido(u)) return
    let vivo = true
    const t = setTimeout(() => {
      void client.rpc('usuario_disponivel', { u }).then(({ data }) => {
        if (vivo) setRes({ u, livre: data !== false })
      })
    }, 400)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [client, u])
  if (!u) return 'vazio'
  if (!usuarioValido(u)) return 'invalido'
  if (res?.u !== u) return 'checando'
  return res.livre ? 'livre' : 'ocupado'
}

const LIVRE_TEXTO: Record<Exclude<Livre, 'vazio'>, [string, string]> = {
  invalido: ['3 a 30: letras, números, . _ -', 'text-fg-4'],
  checando: ['Conferindo…', 'text-fg-4'],
  livre: ['Disponível', 'text-emerald-300'],
  ocupado: ['Já está em uso', 'text-red-300'],
}

function UsuarioStatus({ estado }: { estado: Livre }) {
  if (estado === 'vazio') return null
  const [texto, cor] = LIVRE_TEXTO[estado]
  return <span className={`text-2xs ${cor}`}>{texto}</span>
}
