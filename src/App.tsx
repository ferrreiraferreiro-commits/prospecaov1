import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Button, Spinner } from './components/ui'
import { LocalRepository } from './data/localRepository'
import { SupabaseRepository } from './data/supabaseRepository'
import { supabase } from './data/supabaseClient'
import { CallModeEntry, CallModePage } from './pages/CallModePage'
import { CentralPage } from './pages/CentralPage'
import { HojePage } from './pages/HojePage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'
import { useApp } from './store/useApp'

function Routed() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CentralPage />} />
          <Route path="hoje" element={<HojePage />} />
          <Route path="ligacao" element={<CallModeEntry />} />
          <Route path="ligacao/:id" element={<CallModePage />} />
          <Route path="estatisticas" element={<StatsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function Loaded() {
  const ready = useApp((s) => s.ready)
  const loadError = useApp((s) => s.loadError)
  const repo = useApp((s) => s.repo)
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-xs text-fg-3">
        <Spinner /> Carregando leads…
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-fg">Não foi possível carregar os dados.</p>
        <p className="max-w-md text-xs text-fg-3">{loadError}</p>
        <Button onClick={() => repo && useApp.getState().init(repo)}>Tentar de novo</Button>
      </div>
    )
  }
  return <Routed />
}

function LocalApp() {
  useEffect(() => {
    void useApp.getState().init(new LocalRepository())
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
    if (userId) void useApp.getState().init(new SupabaseRepository(client))
  }, [userId, client])

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return <LoginPage client={client} />
  return <Loaded />
}

export function App() {
  return supabase ? <SupabaseApp /> : <LocalApp />
}
