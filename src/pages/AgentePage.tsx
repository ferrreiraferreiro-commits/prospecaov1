// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Bot, Power } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ajustes } from '../components/agente/Ajustes'
import { useAgente, type AgenteCtx } from '../components/agente/comum'
import { Conversas } from '../components/agente/Conversas'
import { Painel } from '../components/agente/Painel'
import { Prospeccao } from '../components/agente/Prospeccao'
import { Treino } from '../components/agente/Treino'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Segmented, Spinner } from '../components/ui'

type Aba = 'painel' | 'conversas' | 'treino' | 'prospeccao' | 'ajustes'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'painel', label: 'Painel' },
  { id: 'conversas', label: 'Conversas' },
  { id: 'treino', label: 'Treino' },
  { id: 'prospeccao', label: 'Prospecção' },
  { id: 'ajustes', label: 'Ajustes' },
]

/**
 * Agente IA de vendas. Ele roda sozinho no servidor da XS (no WhatsApp do dono); aqui você liga,
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
        <PageHeader title="Agente IA" />
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

  async function alternar() {
    setLigando(true)
    await ctx.salvar({ ativo: !e.ativo }, e.ativo ? 'Agente desligado.' : 'Agente ligado. Ele já começa a trabalhar.')
    setLigando(false)
  }

  const trabalhando = e.ativo && e.whatsapp === 'connected' && !e.pausadoPorRisco && !e.chaveRecusada

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            Agente IA
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', trabalhando ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-tint/[0.04] text-fg-3 ring-line')}>
              <span className={clsx('size-1.5 rounded-full', trabalhando ? 'animate-pulse bg-go' : 'bg-fg-4')} />
              {trabalhando ? 'Trabalhando' : e.ativo ? 'Ligado, parado' : 'Desligado'}
            </span>
          </span>
        }
        subtitle="Busca empresas, aborda, conversa e vende pelo seu WhatsApp, 24 horas, do jeito que você ensinar."
        actions={
          <Button variant={e.ativo ? 'danger' : 'go'} icon={<Power className="size-3.5" />} loading={ligando} onClick={() => void alternar()}>
            {e.ativo ? 'Desligar' : 'Ligar agente'}
          </Button>
        }
      />

      <div className="overflow-x-auto">
        <Segmented value={aba} onChange={(v) => ir(v)} options={ABAS.map((a) => ({ id: a.id, label: <span className="whitespace-nowrap">{a.id === 'conversas' && e.contagem.humano ? `${a.label} (${e.contagem.humano})` : a.label}</span> }))} />
      </div>

      {aba === 'painel' && <Painel ctx={ctx} irPara={(a) => ir(a)} abrirConversa={(id) => ir('conversas', { conversa: id })} />}
      {aba === 'conversas' && <Conversas abrir={conversa} setAbrir={(id) => ir('conversas', id ? { conversa: id } : {})} />}
      {aba === 'treino' && <Treino ctx={ctx} />}
      {aba === 'prospeccao' && <Prospeccao ctx={ctx} />}
      {aba === 'ajustes' && <Ajustes ctx={ctx} />}
    </div>
  )
}
