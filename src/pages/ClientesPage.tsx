import clsx from 'clsx'
import { CircleDollarSign, Plus, Repeat, Users, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { ClientDrawer } from '../components/ClientDrawer'
import { Pill, PILL, SearchInput, Stat } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Segmented } from '../components/ui'
import { monthKey } from '../lib/biz'
import { formatPhone } from '../lib/contact'
import { todayKey } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { normalizeKey } from '../lib/statuses'
import { blankClient, useBiz } from '../store/useBiz'

type Filtro = 'ativos' | 'fixos' | 'avulsos' | 'arquivados'

export function ClientesPage() {
  const clients = useBiz((s) => s.clients)
  const payments = useBiz((s) => s.client_payments)
  const projects = useBiz((s) => s.projects)
  const saveClient = useBiz((s) => s.saveClient)
  const [filtro, setFiltro] = useState<Filtro>('ativos')
  const [busca, setBusca] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const porCliente = useMemo(() => {
    const map = new Map<string, { pendente: number; pago: number; atrasado: boolean; projetos: number }>()
    const today = todayKey()
    for (const c of clients) map.set(c.id, { pendente: 0, pago: 0, atrasado: false, projetos: 0 })
    for (const p of payments) {
      const m = map.get(p.client_id)
      if (!m) continue
      if (p.status === 'pago') m.pago += p.valor
      else {
        m.pendente += p.valor
        if (p.vencimento && p.vencimento < today) m.atrasado = true
      }
    }
    for (const p of projects) if (p.client_id && map.has(p.client_id) && p.status !== 'concluido' && p.status !== 'cancelado') map.get(p.client_id)!.projetos++
    return map
  }, [clients, payments, projects])

  const ativos = clients.filter((c) => !c.arquivado)
  const recorrente = ativos.filter((c) => c.tipo === 'fixo').reduce((s, c) => s + (c.valor_mensal ?? 0), 0)
  const aReceber = payments.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valor, 0)
  const mes = todayKey().slice(0, 7)
  const recebidoMes = payments.filter((p) => p.status === 'pago' && p.pago_em && monthKey(p.pago_em) === mes).reduce((s, p) => s + p.valor, 0)

  const lista = useMemo(() => {
    const q = normalizeKey(busca)
    return clients
      .filter((c) => {
        if (filtro === 'arquivados') return c.arquivado
        if (c.arquivado) return false
        if (filtro === 'fixos') return c.tipo === 'fixo'
        if (filtro === 'avulsos') return c.tipo === 'avulso'
        return true
      })
      .filter((c) => !q || normalizeKey([c.nome, c.empresa, c.telefone, c.segmento, c.email, ...c.tags].filter(Boolean).join(' ')).includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [clients, filtro, busca])

  async function novo() {
    const c = blankClient({ nome: '' })
    await saveClient({ ...c, nome: 'Novo cliente' })
    setOpenId(c.id)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        subtitle="Quem já fechou com você: dados, pagamentos, projetos e anotações."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={novo}>
            Novo cliente
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Clientes ativos" value={ativos.length} icon={<Users />} hint={`${clients.length - ativos.length} arquivado(s)`} />
        <Stat label="Receita recorrente" value={formatMoney(recorrente)} tone="blue" icon={<Repeat />} hint="Soma dos clientes fixos / mês" />
        <Stat label="A receber" value={formatMoney(aReceber)} tone="gold" icon={<Wallet />} hint="Pagamentos pendentes" />
        <Stat label="Recebido no mês" value={formatMoney(recebidoMes)} tone="go" icon={<CircleDollarSign />} />
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={[
              { id: 'ativos', label: 'Ativos' },
              { id: 'fixos', label: 'Fixos' },
              { id: 'avulsos', label: 'Avulsos' },
              { id: 'arquivados', label: 'Arquivados' },
            ]}
          />
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar cliente, empresa, etiqueta…" className="sm:ml-auto" />
        </div>

        {lista.length === 0 ? (
          <Empty
            icon={<Users />}
            title={clients.length ? 'Nenhum cliente neste filtro' : 'Nenhum cliente ainda'}
            action={!clients.length && <Button onClick={novo}>Cadastrar o primeiro</Button>}
          >
            {!clients.length && 'Cadastre aqui ou use "Virar cliente" na ficha de um lead que fechou.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {lista.map((c) => {
              const info = porCliente.get(c.id)!
              return (
                <li key={c.id}>
                  <button onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-tint/[0.025]">
                    <Avatar src={null} name={c.nome} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{c.nome}</p>
                      <p className="truncate text-2xs text-fg-3">{[c.empresa !== c.nome ? c.empresa : null, c.segmento, c.telefone ? formatPhone(c.telefone) : null].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <div className="hidden items-center gap-1.5 md:flex">
                      {c.tags.slice(0, 2).map((t) => (
                        <Pill key={t} className={PILL.neutral}>
                          {t}
                        </Pill>
                      ))}
                      {info.projetos > 0 && <Pill className={PILL.blue}>{info.projetos} projeto(s)</Pill>}
                    </div>
                    <Pill className={c.tipo === 'fixo' ? PILL.blue : PILL.neutral}>{c.tipo === 'fixo' ? 'Fixo' : 'Avulso'}</Pill>
                    <div className="w-28 text-right">
                      {c.tipo === 'fixo' && c.valor_mensal ? <p className="num text-xs font-medium text-fg">{formatMoney(c.valor_mensal)}/mês</p> : null}
                      {info.pendente > 0 ? (
                        <p className={clsx('num text-2xs', info.atrasado ? 'text-red-300' : 'text-amber-300')}>
                          {formatMoney(info.pendente)} {info.atrasado ? 'atrasado' : 'a receber'}
                        </p>
                      ) : (
                        <p className="text-2xs text-fg-4">em dia</p>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ClientDrawer clientId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
