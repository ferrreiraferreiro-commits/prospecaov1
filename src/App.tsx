import type { Session } from '@supabase/supabase-js'
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LogoMark } from './components/Brand'
import { Layout } from './components/Layout'
import { Welcome } from './components/Welcome'
import { Button, Spinner } from './components/ui'
import { LocalRepository } from './data/localRepository'
import { SupabaseRepository } from './data/supabaseRepository'
import { supabase } from './data/supabaseClient'
import { CallModeEntry, CallModePage } from './pages/CallModePage'
import { CentralPage } from './pages/CentralPage'
import { ForgotPasswordPage, LoginPage, NewPasswordPage, SignupPage } from './pages/AuthPages'
import { LandingPage } from './pages/LandingPage'
import { PainelPage } from './pages/PainelPage'
import type { Repository } from './data/repository'
import { accessOf, useAccount, useHasMotor, useIsAdmin } from './store/useAccount'
import { useApp } from './store/useApp'
import { useBiz } from './store/useBiz'

/**
 * Depois de uma publicação nova, os arquivos antigos somem e a tela aberta falha ao
 * carregar outra página. Nesse caso recarrega uma vez para pegar a versão nova.
 */
const RELOAD_KEY = 'xs-prospeccao:recarregou'

function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load()
      .then((m) => {
        try {
          sessionStorage.removeItem(RELOAD_KEY)
        } catch {
          /* sem armazenamento */
        }
        return m
      })
      .catch((err) => {
        let reloaded = true
        try {
          reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
          if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1')
        } catch {
          /* sem armazenamento: não arrisca recarregar em loop */
        }
        if (reloaded) throw err
        window.location.reload()
        return new Promise<never>(() => {})
      }),
  )
}

// Telas carregadas sob demanda (o mapa e a gestão não pesam na abertura do app)
const ClientesPage = lazyPage(() => import('./pages/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const DisparoPage = lazyPage(() => import('./pages/DisparoPage').then((m) => ({ default: m.DisparoPage })))
const FinanceiroPage = lazyPage(() => import('./pages/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })))
const FunisPage = lazyPage(() => import('./pages/FunisPage').then((m) => ({ default: m.FunisPage })))
const MensagensPage = lazyPage(() => import('./pages/MensagensPage').then((m) => ({ default: m.MensagensPage })))
const MapsPage = lazyPage(() => import('./pages/MapsPage').then((m) => ({ default: m.MapsPage })))
const PrecificacaoPage = lazyPage(() => import('./pages/PrecificacaoPage').then((m) => ({ default: m.PrecificacaoPage })))
const ProjetosPage = lazyPage(() => import('./pages/ProjetosPage').then((m) => ({ default: m.ProjetosPage })))
const AgendamentosPage = lazyPage(() => import('./pages/AgendamentosPage').then((m) => ({ default: m.AgendamentosPage })))
const RoteirosPage = lazyPage(() => import('./pages/RoteirosPage').then((m) => ({ default: m.RoteirosPage })))
const SettingsPage = lazyPage(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ContasPage = lazyPage(() => import('./pages/ContasPage').then((m) => ({ default: m.ContasPage })))
const StatsPage = lazyPage(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const WhatsAppPage = lazyPage(() => import('./pages/WhatsAppPage').then((m) => ({ default: m.WhatsAppPage })))
const PrivacyPage = lazyPage(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazyPage(() => import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })))

/** Política de Privacidade e Termos: abertas para todos, logado ou não, antes de qualquer carregamento. */
const LEGAL_PATHS = ['/privacidade', '/termos']

function LegalRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-dvh bg-ink" />}>
        <Routes>
          <Route path="privacidade" element={<PrivacyPage />} />
          <Route path="termos" element={<TermsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function Routed() {
  const motor = useHasMotor()
  const admin = useIsAdmin()
  // Telas que dependem do Motor WhatsApp XS só existem para contas com esse recurso
  const m = (el: ReactNode) => (motor ? el : <Navigate to="/" replace />)
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PainelPage />} />
          <Route path="leads" element={<CentralPage />} />
          <Route path="ligacao" element={<CallModeEntry />} />
          <Route path="ligacao/:id" element={<CallModePage />} />
          <Route path="roteiros" element={<RoteirosPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="mensagens" element={<MensagensPage />} />
          <Route path="funis" element={m(<FunisPage />)} />
          <Route path="disparo" element={m(<DisparoPage />)} />
          <Route path="agendamentos" element={m(<AgendamentosPage />)} />
          <Route path="whatsapp" element={m(<WhatsAppPage />)} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="financeiro" element={<FinanceiroPage />} />
          <Route path="precificacao" element={<PrecificacaoPage />} />
          <Route path="estatisticas" element={<StatsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="contas" element={admin ? <ContasPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Welcome />
    </BrowserRouter>
  )
}

/** Carrega os dados da prospecção e da gestão com o mesmo repositório. */
function initAll(repo: Repository) {
  void useApp.getState().init(repo)
  void useBiz.getState().init(repo)
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark size={64} className="animate-pulse" />
      <div className="flex items-center gap-2 text-xs text-fg-3">
        <Spinner /> {text}
      </div>
    </div>
  )
}

function Loaded() {
  const ready = useApp((s) => s.ready)
  const bizReady = useBiz((s) => s.ready)
  const loadError = useApp((s) => s.loadError)
  const bizError = useBiz((s) => s.error)
  const repo = useApp((s) => s.repo)
  const accountReady = useAccount((s) => s.ready)
  const profile = useAccount((s) => s.profile)
  if (!ready || !bizReady || !accountReady) return <Splash text="Carregando a XS Prospecção…" />
  if (loadError || bizError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-fg">Não foi possível carregar os dados.</p>
        <p className="max-w-md text-xs text-fg-3">{loadError ?? bizError}</p>
        <Button onClick={() => repo && initAll(repo)}>Tentar de novo</Button>
      </div>
    )
  }
  const access = accessOf(profile)
  if (!access.ok) return <Blocked motivo={access.motivo} />
  return <Routed />
}

const BLOQUEIO = {
  teste_acabou: 'Seu teste grátis terminou',
  plano_venceu: 'Seu plano venceu',
  cancelado: 'Sua assinatura está pausada',
}

function Blocked({ motivo }: { motivo: keyof typeof BLOQUEIO }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={64} />
      <div className="space-y-1">
        <p className="text-base font-semibold text-fg">{BLOQUEIO[motivo]}</p>
        <p className="max-w-sm text-xs text-fg-3">Seus leads e sua gestão continuam guardados. Fale com a gente para liberar o acesso de novo.</p>
      </div>
      {supabase && (
        <Button variant="secondary" onClick={() => void supabase!.auth.signOut()}>
          Sair
        </Button>
      )}
    </div>
  )
}

function LocalApp() {
  useEffect(() => {
    initAll(new LocalRepository())
    void useAccount.getState().init(null)
  }, [])
  return <Loaded />
}

function SupabaseApp() {
  const client = supabase!
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Veio pelo link de "esqueci a senha": pede a senha nova antes de abrir o app
  const [recovering, setRecovering] = useState(() => window.location.pathname === '/redefinir-senha')

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = client.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [client])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    initAll(new SupabaseRepository(client))
    void useAccount.getState().init(client, userId)
  }, [userId, client])

  if (session === undefined) return <Splash text="Conectando…" />
  if (session && recovering) {
    return (
      <BrowserRouter>
        <NewPasswordPage client={client} onDone={() => setRecovering(false)} />
      </BrowserRouter>
    )
  }
  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="entrar" element={<LoginPage client={client} />} />
          <Route path="criar-conta" element={<SignupPage client={client} />} />
          <Route path="esqueci-senha" element={<ForgotPasswordPage client={client} />} />
          {/* Link de recuperação expirado ou já usado */}
          <Route path="redefinir-senha" element={<Navigate to="/esqueci-senha" replace />} />
          {/* Telas do app pedem login e voltam para elas depois */}
          <Route path="*" element={<LoginPage client={client} />} />
        </Routes>
      </BrowserRouter>
    )
  }
  return <Loaded />
}

export function App() {
  // Os links para essas páginas recarregam a página (<a href>), então basta olhar o caminho aqui
  if (LEGAL_PATHS.includes(window.location.pathname.replace(/\/+$/, ''))) return <LegalRoutes />
  return supabase ? <SupabaseApp /> : <LocalApp />
}
