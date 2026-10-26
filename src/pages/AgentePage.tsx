// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Bot, OctagonX, Power } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Agenda } from '../components/agente/Agenda'
import { Ajustes } from '../components/agente/Ajustes'
import { Base } from '../components/agente/Base'
import { Caderno } from '../components/agente/Caderno'
import { Laboratorio } from '../components/agente/Laboratorio'
import { Prospeccao } from '../components/agente/Prospeccao'
import { TreinoNovo } from '../components/agente/TreinoNovo'
import { erroTexto, useAgente, type AgenteCtx } from '../components/agente/comum'
import { Conversas } from '../components/agente/Conversas'
import { Painel } from '../components/agente/Painel'
import { PrecisaDeVoce } from '../components/agente/PrecisaDeVoce'
import { Seguranca } from '../components/agente/Seguranca'
import { Treino } from '../components/agente/Treino'
import { ag, type EstadoAgente } from '../lib/agente'
import { useApp } from '../store/useApp'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Segmented, Spinner } from '../components/ui'

type Aba = 'painel' | 'precisa' | 'conversas' | 'treino' | 'base' | 'laboratorio' | 'caderno' | 'agenda' | 'seguranca' | 'prospeccao' | 'ajustes'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'painel', label: 'Painel' },
  { id: 'precisa', label: 'Precisa de você' },
  { id: 'conversas', label: 'Conversas' },
  { id: 'treino', label: 'Treino' },
  { id: 'base', label: 'Material' },
  { id: 'laboratorio', label: 'Laboratório' },
  { id: 'caderno', label: 'Caderno' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'prospeccao', label: 'Prospecção' },
  { id: 'ajustes', label: 'Ajustes' },
]

/**
 * Agente IA de vendas. Ele roda sozinho no servidor da XS (no WhatsApp de cada conta); aqui você liga,
 * acompanha as conversas, treina o jeito de vender e escolhe onde ele procura empresas.
 */
export function AgentePage() {
  const dados = useAgente()
  const [params, setParams] = useSearchParams()
  const aba = (ABAS.some((a) => a.id === params.get('aba')) ? params.get('aba') : 'painel') as Aba
  const conversa = params.get('conversa')
  const [ligando, setLigando] = useState(false)

  const ir = (proxima: string, extra: Record<string, string> = {}) => setParams({ aba: proxima, ...extra }, { replace: false })

  if (!dados.estado || !dados.config) {
    return (
      <div className="space-y-4">
        <PageHeader title="IA no WhatsApp" />
        {dados.erro ? (
          <Empty icon={<Bot />} title="Agente indisponível agora">
            {dados.erro}
          </Empty>
        ) : (
          <div className="grid h-60 place-items-center">
            <Spinner />
          </div>
        )}
      </div>
    )
  }

  const ctx = dados as AgenteCtx
  const { estado: e } = ctx

  // Parar tudo é na hora (nada sai até você ligar de novo); ligar volta a trabalhar
  async function alternar() {
    setLigando(true)
    try {
      ctx.setEstado(await ag<EstadoAgente>(e.ativo ? '/parar' : '/voltar', { method: 'POST' }))
      useApp.getState().toast(e.ativo ? 'Parei tudo. Nada sai até você ligar de novo.' : 'IA ligada. Ela já começa a trabalhar.')
      void ctx.recarregar()
    } catch (err) {
      useApp.getState().toast(erroTexto(err), 'error')
    } finally {
      setLigando(false)
    }
  }

  const trabalhando = e.ativo && e.whatsapp === 'connected' && !e.pausadoPorRisco && !e.chaveRecusada

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            IA no WhatsApp
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', trabalhando ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-tint/[0.04] text-fg-3 ring-line')}>
              <span className={clsx('size-1.5 rounded-full', trabalhando ? 'animate-pulse bg-go' : 'bg-fg-4')} />
              {trabalhando ? 'Trabalhando' : e.ativo ? 'Ligado, parado' : 'Desligado'}
            </span>
          </span>
        }
        subtitle="Responde e vende pelo seu WhatsApp como se fosse você, com o seu nome e o seu jeito. Nenhuma mensagem sai sem passar pelas conferências."
        actions={
          <Button variant={e.ativo ? 'danger' : 'go'} icon={e.ativo ? <OctagonX className="size-3.5" /> : <Power className="size-3.5" />} loading={ligando} onClick={() => void alternar()}>
            {e.ativo ? 'Parar tudo' : 'Ligar a IA'}
          </Button>
        }
      />

      <div className="overflow-x-auto">
        <Segmented value={aba} onChange={(v) => ir(v)} options={ABAS.map((a) => ({ id: a.id, label: <span className="whitespace-nowrap">{a.id === 'conversas' && e.contagem.humano ? `${a.label} (${e.contagem.humano})` : a.id === 'precisa' && e.pendencias ? `${a.label} (${e.pendencias})` : a.label}</span> }))} />
      </div>

      {aba === 'painel' && <Painel ctx={ctx} irPara={(a) => ir(a)} abrirConversa={(id) => ir('conversas', { conversa: id })} />}
      {aba === 'conversas' && <Conversas abrir={conversa} setAbrir={(id) => ir('conversas', id ? { conversa: id } : {})} />}
      {aba === 'precisa' && <PrecisaDeVoce onMudou={() => void ctx.recarregar()} abrirConversa={(id) => ir('conversas', { conversa: id })} />}
      {aba === 'treino' && (
        <div className="space-y-4">
          <TreinoNovo ctx={ctx} />
          <Treino ctx={ctx} />
        </div>
      )}
      {aba === 'base' && <Base />}
      {aba === 'laboratorio' && <Laboratorio />}
      {aba === 'caderno' && <Caderno />}
      {aba === 'agenda' && <Agenda ctx={ctx} />}
      {aba === 'prospeccao' && <Prospeccao ctx={ctx} />}
      {aba === 'seguranca' && <Seguranca ctx={ctx} />}
      {aba === 'ajustes' && <Ajustes ctx={ctx} />}
    </div>
  )
}
