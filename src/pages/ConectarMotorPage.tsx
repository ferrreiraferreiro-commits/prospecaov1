import { CheckCircle2, LoaderCircle, Monitor, PlugZap, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MOTOR_DOWNLOAD } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { chavePendente, esquecerChavePendente, ligarMotorNaConta, sondarMotor, useMotor } from '../lib/motor'
import { useAccount } from '../store/useAccount'
import { useApp } from '../store/useApp'

type Fase = { tipo: 'procurando' } | { tipo: 'achou'; computador: string | null } | { tipo: 'sumiu' } | { tipo: 'sem-chave' } | { tipo: 'ligado'; computador: string | null }

/**
 * Aberta pelo próprio Motor WhatsApp XS (/motor/conectar#chave) na primeira vez que ele roda.
 * Confere pela ponte que o motor está mesmo aberto e, com um clique, liga-o à conta.
 */
export function ConectarMotorPage() {
  const navigate = useNavigate()
  const toast = useApp((s) => s.toast)
  const userId = useAccount((s) => s.profile?.user_id)
  const ligadoAntes = useMotor((s) => s.computador)
  const jaLigado = useMotor((s) => s.ligado)
  const [chave] = useState(chavePendente)
  const [fase, setFase] = useState<Fase>(() => (chave ? { tipo: 'procurando' } : { tipo: 'sem-chave' }))
  const [salvando, setSalvando] = useState(false)

  const procurar = useCallback(async () => {
    if (!chave) return
    setFase({ tipo: 'procurando' })
    // O motor acabou de abrir o navegador: pode levar alguns segundos até ele chegar na ponte
    for (let i = 0; i < 8; i++) {
      const health = await sondarMotor(chave)
      if (health) return setFase({ tipo: 'achou', computador: health.computador ?? null })
      await new Promise((r) => setTimeout(r, 1500))
    }
    setFase({ tipo: 'sumiu' })
  }, [chave])

  useEffect(() => {
    void procurar()
  }, [procurar])

  const ligar = async (computador: string | null) => {
    if (!chave || !supabase || !userId) return
    setSalvando(true)
    try {
      await ligarMotorNaConta(supabase, userId, chave, computador)
      esquecerChavePendente()
      setFase({ tipo: 'ligado', computador })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível ligar o motor.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Ligar o Motor WhatsApp XS" subtitle="Uma vez só por computador. Depois disso o motor conversa com a XS sozinho, em qualquer navegador." />

      <section className="panel mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-10 text-center">
        {fase.tipo === 'procurando' && (
          <>
            <LoaderCircle className="size-10 animate-spin text-fg-3" />
            <p className="text-sm text-fg-2">Procurando o motor neste computador…</p>
          </>
        )}

        {fase.tipo === 'achou' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-300">
              <Monitor className="size-7" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-fg">Motor encontrado{fase.computador ? ` em ${fase.computador}` : ''}</p>
              <p className="text-xs text-fg-3">Ligue-o à sua conta para usar os disparos, funis e mensagens agendadas.</p>
              {jaLigado && ligadoAntes && ligadoAntes !== fase.computador && (
                <p className="text-xs text-amber-200">O motor ligado antes ({ligadoAntes}) deixa de ser usado.</p>
              )}
            </div>
            <Button size="lg" icon={<PlugZap className="size-4" />} loading={salvando} onClick={() => void ligar(fase.computador)}>
              Ligar à minha conta
            </Button>
          </>
        )}

        {fase.tipo === 'ligado' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-go/15 text-go">
              <CheckCircle2 className="size-7" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-fg">Motor ligado à sua conta</p>
              <p className="text-xs text-fg-3">Agora conecte o seu WhatsApp lendo o QR Code. Deixe a janela preta do motor aberta (pode minimizar).</p>
            </div>
            <Button size="lg" onClick={() => navigate('/whatsapp', { replace: true })}>
              Conectar o WhatsApp
            </Button>
          </>
        )}

        {fase.tipo === 'sumiu' && (
          <>
            <PlugZap className="size-10 text-amber-300" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-fg">Não achamos o motor</p>
              <p className="max-w-sm text-xs text-fg-3">Confira se a janela preta do Motor WhatsApp XS está aberta neste computador e se a internet está funcionando.</p>
            </div>
            <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void procurar()}>
              Procurar de novo
            </Button>
          </>
        )}

        {fase.tipo === 'sem-chave' && (
          <>
            <PlugZap className="size-10 text-fg-3" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-fg">Abra o Motor WhatsApp XS</p>
              <p className="max-w-sm text-xs text-fg-3">
                Esta página é aberta pelo próprio motor. Baixe, extraia e dê dois cliques em <strong className="text-fg">Motor WhatsApp XS.exe</strong>: ele abre o navegador aqui sozinho.
              </p>
            </div>
            <a href={MOTOR_DOWNLOAD} download className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-[#3b7bf6]">
              Baixar o Motor WhatsApp XS
            </a>
          </>
        )}
      </section>
    </div>
  )
}
