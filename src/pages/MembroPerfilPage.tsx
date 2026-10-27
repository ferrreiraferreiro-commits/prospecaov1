// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: perfil de uma pessoa da equipe para o dono — hoje, mês, turnos, leads e o que ela fez.
import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Empty, StatusBadge } from '../components/ui'
import { formatarHoras, inicioDeHoje, inicioDoMes, tempoEmServico, turnoAberto, useNumeros, useTurnos } from '../lib/equipe'
import { STATUSES, TONE_CLASSES } from '../lib/statuses'
import type { InteractionTipo } from '../lib/types'
import { useAccount } from '../store/useAccount'
import { useApp } from '../store/useApp'

const TIPO: Partial<Record<InteractionTipo, string>> = {
  ligacao: 'Ligou',
  status: 'Mudou o status',
  status2: 'Mudou o status 2',
  followup: 'Marcou retorno',
  reuniao: 'Reunião',
  nota: 'Anotação',
  mensagem: 'Mensagem no WhatsApp',
}

const PAPEIS = { gestor: 'Gestor', vendedor: 'Vendedor' } as const

function Numeros({ titulo, n }: { titulo: string; n: ReturnType<typeof useNumeros> & { horas: number } }) {
  const itens: [string, string | number][] = [
    ['Em serviço', formatarHoras(n.horas)],
    ['Prospectados', n.prospectados],
    ['Ligações', n.ligacoes],
    ['Mensagens', n.mensagens],
    ['Respostas', n.respostas],
    ['Reuniões', n.reunioes],
    ['Vendas', n.vendas],
    ['Valor vendido', n.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })],
  ]
  return (
    <Card title={titulo} bodyClass="grid grid-cols-2 gap-px bg-line-soft p-0 sm:grid-cols-4">
      {itens.map(([rotulo, v]) => (
        <div key={rotulo} className="bg-panel px-4 py-3">
          <p className="text-2xs text-fg-3">{rotulo}</p>
          <p className={clsx('num text-lg font-semibold', rotulo === 'Valor vendido' && 'pv')}>{v}</p>
        </div>
      ))}
    </Card>
  )
}

export function MembroPerfilPage() {
  const { id = '' } = useParams()
  const equipe = useAccount((s) => s.equipe)
  const turnos = useTurnos((s) => s.turnos)
  const leads = useApp((s) => s.leads)
  const interactions = useApp((s) => s.interactions)
  const membro = equipe?.membros.find((m) => m.id === id && m.aceito)
  const hoje = { ...useNumeros(id, inicioDeHoje()), horas: tempoEmServico(turnos, id, inicioDeHoje()) }
  const mes = { ...useNumeros(id, inicioDoMes()), horas: tempoEmServico(turnos, id, inicioDoMes()) }

  const carteira = useMemo(() => leads.filter((l) => l.responsavel === id), [leads, id])
  const porStatus = useMemo(() => STATUSES.map((st) => ({ st, n: carteira.filter((l) => l.status === st.id).length })).filter((x) => x.n > 0), [carteira])
  const empresa = useMemo(() => new Map(leads.map((l) => [l.id, l.empresa])), [leads])
  const atividades = useMemo(
    () =>
      interactions
        .filter((i) => i.autor === id && i.tipo !== 'importacao')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 40),
    [interactions, id],
  )
  const ultimosTurnos = turnos.filter((t) => t.membro === id).slice(0, 8)

  if (!membro || equipe?.papel === 'vendedor') {
    return (
      <div className="space-y-5">
        <PageHeader title="Pessoa da equipe" />
        <Empty title="Não achei essa pessoa na sua equipe">
          <Link to="/equipe" className="underline">
            Voltar para Equipe
          </Link>
        </Empty>
      </div>
    )
  }

  const aberto = turnoAberto(turnos, id)
  const parados = carteira.filter((l) => !l.ultima_ligacao || Date.parse(l.ultima_ligacao) < Date.now() - 7 * 86_400_000).length

  return (
    <div className="mx-auto max-w-[980px] space-y-4">
      <Link to="/equipe" className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
        <ArrowLeft className="size-3.5" /> Equipe
      </Link>
      <PageHeader
        title={<span className="pv">{membro.nome ?? membro.usuario}</span>}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {PAPEIS[membro.papel]}
            <span className={clsx('inline-flex items-center gap-1', aberto ? 'text-go' : 'text-fg-4')}>
              <span className={clsx('size-1.5 rounded-full', aberto ? 'bg-go' : 'bg-fg-4/50')} />
              {aberto ? `Em serviço desde ${new Date(aberto.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Fora de serviço'}
            </span>
            {membro.meta_contatos || membro.meta_vendas ? (
              <span>
                Metas do mês: {membro.meta_contatos ? `${mes.respostas}/${membro.meta_contatos} contatos` : ''}
                {membro.meta_contatos && membro.meta_vendas ? ' · ' : ''}
                {membro.meta_vendas ? `${mes.vendas}/${membro.meta_vendas} vendas` : ''}
              </span>
            ) : null}
          </span>
        }
      />

      <Numeros titulo="Hoje" n={hoje} />
      <Numeros titulo="Este mês" n={mes} />

      <Card
        title={`Carteira: ${carteira.length} lead(s)`}
        description={parados ? `${parados} sem ligação há mais de 7 dias.` : 'Todos com ligação nos últimos 7 dias.'}
        actions={
          <Link to={`/leads?resp=${id}`} className="text-xs text-blue-300 hover:underline">
            Ver os leads
          </Link>
        }
      >
        {porStatus.length ? (
          <div className="flex flex-wrap gap-1.5">
            {porStatus.map(({ st, n }) => (
              <span key={st.id} className={clsx('rounded px-2 py-0.5 text-xs ring-1 ring-inset', TONE_CLASSES[st.tone].chip)}>
                {st.label} <span className="num font-semibold">{n}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-fg-3">Nenhum lead com essa pessoa. Passe leads em Leads → selecionar → “Passar para…”.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card title="O que fez por último" bodyClass="px-0 py-0">
          {atividades.length ? (
            <ul className="divide-y divide-line-soft">
              {atividades.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                  <span className="num w-[86px] shrink-0 text-2xs text-fg-4">
                    {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-fg-2">{TIPO[a.tipo] ?? a.tipo}</span>
                  <span className="pv min-w-0 flex-1 truncate font-medium text-fg">{empresa.get(a.lead_id) ?? 'Lead'}</span>
                  {a.status && <StatusBadge status={a.status} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-fg-3">Ainda não registrou nada.</p>
          )}
        </Card>
        <Card title="Turnos" bodyClass="px-0 py-0">
          {ultimosTurnos.length ? (
            <ul className="divide-y divide-line-soft">
              {ultimosTurnos.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="num text-fg-2">
                    {new Date(t.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {t.fim ? ` – ${new Date(t.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                  <span className={clsx('num', t.fim ? 'text-fg-3' : 'text-go')}>{t.fim ? formatarHoras(Date.parse(t.fim) - Date.parse(t.inicio)) : 'agora'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-fg-3">Ainda não entrou em serviço.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
