import type { Session } from '@supabase/supabase-js'
import { lazy, useEffect, useState, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LogoMark } from './components/Brand'
import { Layout } from './components/Layout'
import { Button, Spinner } from './components/ui'
import { LocalRepository } from './data/localRepository'
import { SupabaseRepository } from './data/supabaseRepository'
import { supabase } from './data/supabaseClient'
import { CallModeEntry, CallModePage } from './pages/CallModePage'
import { CentralPage } from './pages/CentralPage'
import { HojePage } from './pages/HojePage'
import { LoginPage } from './pages/LoginPage'
import { PainelPage } from './pages/PainelPage'
import type { Repository } from './data/repository'
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
const MapsPage = lazyPage(() => import('./pages/MapsPage').then((m) => ({ default: m.MapsPage })))
const PrecificacaoPage = lazyPage(() => import('./pages/PrecificacaoPage').then((m) => ({ default: m.PrecificacaoPage })))
const ProjetosPage = lazyPage(() => import('./pages/ProjetosPage').then((m) => ({ default: m.ProjetosPage })))
const AgendamentosPage = lazyPage(() => import('./pages/AgendamentosPage').then((m) => ({ default: m.AgendamentosPage })))
const RoteirosPage = lazyPage(() => import('./pages/RoteirosPage').then((m) => ({ default: m.RoteirosPage })))
const SettingsPage = lazyPage(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const StatsPage = lazyPage(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const WhatsAppPage = lazyPage(() => import('./pages/WhatsAppPage').then((m) => ({ default: m.WhatsAppPage })))

function Routed() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PainelPage />} />
          <Route path="leads" element={<CentralPage />} />
          <Route path="hoje" element={<HojePage />} />
          <Route path="ligacao" element={<CallModeEntry />} />
          <Route path="ligacao/:id" element={<CallModePage />} />
          <Route path="roteiros" element={<RoteirosPage />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="funis" element={<FunisPage />} />
          <Route path="disparo" element={<DisparoPage />} />
          <Route path="agendamentos" element={<AgendamentosPage />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="projetos" element={<ProjetosPage />} />
          <Route path="financeiro" element={<FinanceiroPage />} />
          <Route path="precificacao" element={<PrecificacaoPage />} />
          <Route path="estatisticas" element={<StatsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
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
  if (!ready || !bizReady) return <Splash text="Carregando o XS Prospecção…" />
  if (loadError || bizError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-fg">Não foi possível carregar os dados.</p>
        <p className="max-w-md text-xs text-fg-3">{loadError ?? bizError}</p>
        <Button onClick={() => repo && initAll(repo)}>Tentar de novo</Button>
      </div>
    )
  }
  return <Routed />
}

function LocalApp() {
  useEffect(() => {
    initAll(new LocalRepository())
  }, [])
  return <Loaded />
}

function SupabaseApp() {
  const client = supabase!
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [client])

  const userId = session?.user.id
  useEffect(() => {
    if (userId) initAll(new SupabaseRepository(client))
  }, [userId, client])

  if (session === undefined) return <Splash text="Conectando…" />
  if (!session) return <LoginPage client={client} />
  return <Loaded />
}

export function App() {
  return supabase ? <SupabaseApp /> : <LocalApp />
}
