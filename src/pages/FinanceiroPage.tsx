import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Plus, Scale, Trash2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, Field, NumberInput, SearchInput, Stat, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Modal, Segmented } from '../components/ui'
import { newId, nowIso } from '../data/repository'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  lastMonths,
  monthKey,
  monthLabel,
  summarize,
  type Transaction,
  type TransactionTipo,
} from '../lib/biz'
import { formatDateKeyShort, todayKey } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { normalizeKey } from '../lib/statuses'
import { useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'

type Filtro = 'todos' | 'receita' | 'despesa' | 'pendente'

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function FinanceiroPage() {
  const transactions = useBiz((s) => s.transactions)
  const payments = useBiz((s) => s.client_payments)
  const clients = useBiz((s) => s.clients)
  const togglePayment = useBiz((s) => s.togglePayment)
  const [mes, setMes] = useState(todayKey().slice(0, 7))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)

  const resumo = useMemo(() => summarize(transactions, payments, mes), [transactions, payments, mes])
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.nome])), [clients])

  const doMes = useMemo(() => {
    const q = normalizeKey(busca)
    return transactions
      .filter((t) => monthKey(t.data) === mes)
      .filter((t) => (filtro === 'todos' ? true : filtro === 'pendente' ? t.status === 'pendente' : t.tipo === filtro))
      .filter((t) => !q || normalizeKey(`${t.descricao} ${t.categoria}`).includes(q))
      .sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at))
  }, [transactions, mes, filtro, busca])

  const pendentes = useMemo(
    () => payments.filter((p) => p.status === 'pendente').sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999')),
    [payments],
  )

  const categorias = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) if (t.tipo === 'despesa' && t.status === 'pago' && monthKey(t.data) === mes) map.set(t.categoria, (map.get(t.categoria) ?? 0) + t.valor)
    return [...map].sort((a, b) => b[1] - a[1])
  }, [transactions, mes])

  const today = todayKey()
  const novo = (tipo: TransactionTipo) =>
    setEditing({
      id: newId(),
      descricao: '',
      valor: 0,
      tipo,
      categoria: tipo === 'receita' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0],
      data: mes === today.slice(0, 7) ? today : `${mes}-01`,
      status: 'pago',
      payment_id: null,
      client_id: null,
      created_at: nowIso(),
    })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Financeiro"
        subtitle="Entradas e saídas do mês. Pagamentos de clientes marcados como pagos entram aqui sozinhos."
        actions={
          <>
            <Button icon={<ArrowDownRight className="size-3.5 text-viz-out" />} onClick={() => novo('despesa')}>
              Despesa
            </Button>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => novo('receita')}>
              Receita
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setMes((m) => shiftMonth(m, -1))} aria-label="Mês anterior" icon={<ChevronLeft className="size-4" />} />
        <span className="min-w-40 text-center text-sm font-semibold">{monthLabel(mes, 'long')}</span>
        <Button size="sm" variant="ghost" onClick={() => setMes((m) => shiftMonth(m, 1))} aria-label="Próximo mês" icon={<ChevronRight className="size-4" />} />
        {mes !== today.slice(0, 7) && (
          <Button size="xs" variant="subtle" onClick={() => setMes(today.slice(0, 7))}>
            Mês atual
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Receitas recebidas" value={formatMoney(resumo.receitas)} icon={<ArrowUpRight />} tone="blue" />
        <Stat label="Despesas pagas" value={formatMoney(resumo.despesas)} icon={<ArrowDownRight />} />
        <Stat label="Saldo do mês" value={formatMoney(resumo.saldo)} icon={<Scale />} tone={resumo.saldo >= 0 ? 'go' : 'bad'} />
        <Stat label="A receber" value={formatMoney(resumo.aReceber)} icon={<Wallet />} tone="gold" hint={resumo.aPagar ? `${formatMoney(resumo.aPagar)} a pagar` : 'Pagamentos pendentes até este mês'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Últimos 6 meses" description="Receitas e despesas pagas por mês.">
          <MonthlyChart transactions={transactions} selected={mes} onSelect={setMes} />
        </Card>
        <Card title="Despesas por categoria" description={monthLabel(mes, 'long')}>
          {categorias.length === 0 ? (
            <p className="py-8 text-center text-xs text-fg-3">Nenhuma despesa paga neste mês.</p>
          ) : (
            <ul className="space-y-2.5">
              {categorias.map(([cat, valor]) => (
                <li key={cat}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-fg-2">{cat}</span>
                    <span className="num font-medium text-fg">{formatMoney(valor)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-tint/[0.05]">
                    <div className="h-full rounded-full bg-viz-out" style={{ width: `${(valor / categorias[0][1]) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
            <Segmented
              value={filtro}
              onChange={setFiltro}
              options={[
                { id: 'todos', label: 'Todos' },
                { id: 'receita', label: 'Receitas' },
                { id: 'despesa', label: 'Despesas' },
                { id: 'pendente', label: 'Pendentes' },
              ]}
            />
            <SearchInput value={busca} onChange={setBusca} className="sm:ml-auto sm:w-52" />
          </div>
          {doMes.length === 0 ? (
            <Empty icon={<Wallet />} title="Nenhum lançamento neste mês">
              Use os botões Receita e Despesa no topo.
            </Empty>
          ) : (
            <ul className="divide-y divide-line-soft">
              {doMes.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setEditing(t)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-tint/[0.025]">
                    <span
                      className={clsx(
                        'flex size-7 shrink-0 items-center justify-center rounded-md',
                        t.tipo === 'receita' ? 'bg-viz-in/12 text-viz-in' : 'bg-viz-out/12 text-viz-out',
                      )}
                    >
                      {t.tipo === 'receita' ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-fg">{t.descricao}</p>
                      <p className="truncate text-2xs text-fg-3">
                        {t.categoria} · {formatDateKeyShort(t.data)}
                        {t.client_id && clientName.get(t.client_id) ? ` · ${clientName.get(t.client_id)}` : ''}
                        {t.status === 'pendente' && <span className="text-amber-300"> · pendente</span>}
                        {t.payment_id && <span className="text-fg-4"> · pagamento de cliente</span>}
                      </p>
                    </div>
                    <span className={clsx('num text-xs font-semibold', t.tipo === 'receita' ? 'text-fg' : 'text-fg-2')}>
                      {t.tipo === 'receita' ? '+' : '−'} {formatMoney(t.valor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card title="A receber de clientes" description="Clique no círculo quando o dinheiro entrar." bodyClass="p-0">
          {pendentes.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-fg-3">Nenhum pagamento pendente.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {pendentes.slice(0, 12).map((p) => {
                const late = p.vencimento && p.vencimento < today
                return (
                  <li key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <button
                      onClick={() => void togglePayment(p.id).then(() => useApp.getState().toast('Pagamento recebido e lançado como receita.'))}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors hover:border-go hover:text-go"
                      title="Marcar como recebido"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{clientName.get(p.client_id) ?? 'Cliente'}</p>
                      <p className={clsx('truncate text-2xs', late ? 'text-red-300' : 'text-fg-3')}>
                        {p.descricao}
                        {p.vencimento && ` · ${late ? 'venceu' : 'vence'} ${formatDateKeyShort(p.vencimento)}`}
                      </p>
                    </div>
                    <span className="num text-xs font-semibold">{formatMoney(p.valor)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {editing && <TransactionModal key={editing.id} tx={editing} clients={clients} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Barras agrupadas (receita × despesa) dos últimos 6 meses, com tooltip por mês. */
function MonthlyChart({ transactions, selected, onSelect }: { transactions: Transaction[]; selected: string; onSelect: (m: string) => void }) {
  const months = lastMonths(6)
  const data = months.map((m) => {
    let entrada = 0
    let saida = 0
    for (const t of transactions) {
      if (t.status !== 'pago' || monthKey(t.data) !== m) continue
      if (t.tipo === 'receita') entrada += t.valor
      else saida += t.valor
    }
    return { m, entrada, saida }
  })
  const max = Math.max(1, ...data.flatMap((d) => [d.entrada, d.saida]))
  const [hover, setHover] = useState<number | null>(null)
  const ticks = [1, 0.5, 0]

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-2xs text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-viz-in" /> Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-viz-out" /> Despesas
        </span>
      </div>
      <div className="relative h-48 pl-14">
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-14 border-t border-line-soft" style={{ bottom: `${t * 100}%` }}>
            <span className="num absolute -top-2 -left-14 w-12 text-right text-[10px] text-fg-4">{formatMoney(max * t).replace(',00', '')}</span>
          </div>
        ))}
        <div className="relative flex h-full items-end gap-2">
          {data.map((d, i) => (
            <button
              key={d.m}
              type="button"
              onClick={() => onSelect(d.m)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={clsx('relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-md transition-colors', hover === i && 'bg-tint/[0.03]', d.m === selected && 'bg-blue-500/[0.06]')}
              aria-label={`${monthLabel(d.m, 'long')}: receitas ${formatMoney(d.entrada)}, despesas ${formatMoney(d.saida)}`}
            >
              <span className="w-[38%] max-w-6 rounded-t-[4px] bg-viz-in" style={{ height: `${(d.entrada / max) * 100}%`, minHeight: d.entrada ? 2 : 0 }} />
              <span className="w-[38%] max-w-6 rounded-t-[4px] bg-viz-out" style={{ height: `${(d.saida / max) * 100}%`, minHeight: d.saida ? 2 : 0 }} />
              {hover === i && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-40 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-2 text-left text-2xs shadow-xl">
                  <span className="block font-semibold text-fg">{monthLabel(d.m, 'long')}</span>
                  <span className="mt-1 flex justify-between text-fg-2">
                    Receitas <span className="num text-fg">{formatMoney(d.entrada)}</span>
                  </span>
                  <span className="flex justify-between text-fg-2">
                    Despesas <span className="num text-fg">{formatMoney(d.saida)}</span>
                  </span>
                  <span className="mt-1 flex justify-between border-t border-line-soft pt-1 text-fg-2">
                    Saldo <span className="num font-medium text-fg">{formatMoney(d.entrada - d.saida)}</span>
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2 pl-14">
        {data.map((d) => (
          <span key={d.m} className={clsx('flex-1 text-center text-[10px] capitalize', d.m === selected ? 'font-semibold text-fg' : 'text-fg-4')}>
            {monthLabel(d.m)}
          </span>
        ))}
      </div>
    </div>
  )
}

function TransactionModal({ tx, clients, onClose }: { tx: Transaction; clients: { id: string; nome: string }[]; onClose: () => void }) {
  const exists = useBiz((s) => s.transactions.some((t) => t.id === tx.id))
  const { saveTransaction, deleteTransaction } = useBiz.getState()
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState(tx)
  const cats = d.tipo === 'receita' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  async function save() {
    if (!d.descricao.trim()) return toast('Descreva o lançamento.', 'error')
    if (!(d.valor > 0)) return toast('Informe o valor.', 'error')
    await saveTransaction({ ...d, descricao: d.descricao.trim() })
    toast(d.tipo === 'receita' ? 'Receita salva.' : 'Despesa salva.')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar lançamento' : d.tipo === 'receita' ? 'Nova receita' : 'Nova despesa'}
      subtitle={d.payment_id ? 'Ligado a um pagamento de cliente: apagar aqui volta o pagamento para pendente.' : undefined}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (!confirmAction('Excluir este lançamento?')) return
                await deleteTransaction(tx.id)
                onClose()
              }}
            >
              Excluir
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              Salvar
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        {!d.payment_id && (
          <div className="col-span-2">
            <Segmented
              value={d.tipo}
              onChange={(tipo) => setD({ ...d, tipo, categoria: (tipo === 'receita' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] })}
              options={[
                { id: 'receita', label: 'Receita' },
                { id: 'despesa', label: 'Despesa' },
              ]}
            />
          </div>
        )}
        <Field label="Descrição" className="col-span-2">
          <input className="input" autoFocus value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} placeholder={d.tipo === 'receita' ? 'Ex.: Site Padaria Sol' : 'Ex.: Hospedagem'} />
        </Field>
        <Field label="Valor">
          <NumberInput prefix="R$" value={d.valor || null} onChange={(v) => setD({ ...d, valor: v ?? 0 })} min={0} />
        </Field>
        <Field label="Data">
          <input type="date" className="input" value={d.data} onChange={(e) => e.target.value && setD({ ...d, data: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <select className="input" value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value })}>
            {[...new Set([...cats, d.categoria])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Situação">
          <select className="input" value={d.status} disabled={!!d.payment_id} onChange={(e) => setD({ ...d, status: e.target.value as Transaction['status'] })}>
            <option value="pago">{d.tipo === 'receita' ? 'Recebido' : 'Pago'}</option>
            <option value="pendente">Pendente</option>
          </select>
        </Field>
        <Field label="Cliente (opcional)" className="col-span-2">
          <select className="input" value={d.client_id ?? ''} disabled={!!d.payment_id} onChange={(e) => setD({ ...d, client_id: e.target.value || null })}>
            <option value="">Nenhum</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}
