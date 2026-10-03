import type { Session } from '@supabase/supabase-js'
import { lazy, useEffect, useState } from 'react'
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

// Telas carregadas sob demanda (o mapa e a gestão não pesam na abertura do app)
const ClientesPage = lazy(() => import('./pages/ClientesPage').then((m) => ({ default: m.ClientesPage })))
const DisparoPage = lazy(() => import('./pages/DisparoPage').then((m) => ({ default: m.DisparoPage })))
const FinanceiroPage = lazy(() => import('./pages/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })))
const FunisPage = lazy(() => import('./pages/FunisPage').then((m) => ({ default: m.FunisPage })))
const MapsPage = lazy(() => import('./pages/MapsPage').then((m) => ({ default: m.MapsPage })))
const PrecificacaoPage = lazy(() => import('./pages/PrecificacaoPage').then((m) => ({ default: m.PrecificacaoPage })))
const ProjetosPage = lazy(() => import('./pages/ProjetosPage').then((m) => ({ default: m.ProjetosPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage').then((m) => ({ default: m.WhatsAppPage })))

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
          <Route path="maps" element={<MapsPage />} />
          <Route path="funis" element={<FunisPage />} />
          <Route path="disparo" element={<DisparoPage />} />
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
      <LogoMark size={44} />
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
