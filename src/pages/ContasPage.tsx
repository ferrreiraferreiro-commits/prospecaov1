import clsx from 'clsx'
import { Crown, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, SearchInput, Stat } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Modal, Segmented, Spinner } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { definirPlano, ESCOLHAS, escolhaAtual, fimSugerido, isCiclo, listarContas, loginDe, type Conta, type Escolha } from '../lib/admin'
import { formatDateTime, formatRelative } from '../lib/dates'
import { planInfo, type Profile } from '../store/useAccount'
import { useApp } from '../store/useApp'

type Filtro = 'todas' | 'teste' | 'pagantes' | 'vitalicio' | 'bloqueadas'

const DIA = 86_400_000

/** Plano pago ou teste que já passou da data. */
function vencida(c: Conta, now: number): boolean {
  if (c.plano === 'teste') return Date.parse(c.teste_ate) <= now
  if (c.plano === 'ativo') return !!c.plano_ate && Date.parse(c.plano_ate) <= now
  return false
}

function asProfile(c: Conta): Profile {
  return { ...c, recursos: [], boas_vindas_feitas: true }
}

export function ContasPage() {
  const [contas, setContas] = useState<Conta[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [editando, setEditando] = useState<Conta | null>(null)
  const [eu, setEu] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!supabase) return
    setErro(null)
    try {
      setContas(await listarContas(supabase))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar as contas.')
    }
  }, [])

  useEffect(() => {
    void carregar()
    void supabase?.auth.getSession().then(({ data }) => setEu(data.session?.user.id ?? null))
  }, [carregar])

  const now = Date.now()
  const resumo = useMemo(() => {
    const lista = contas ?? []
    const pagantes = lista.filter((c) => c.plano === 'ativo' && !vencida(c, now))
    return {
      total: lista.length,
      teste: lista.filter((c) => c.plano === 'teste' && !vencida(c, now)).length,
      pagantes: pagantes.length,
      vencendo: pagantes.filter((c) => c.plano_ate && Date.parse(c.plano_ate) - now <= 3 * DIA).length,
      vitalicio: lista.filter((c) => c.plano === 'vitalicio').length,
      bloqueadas: lista.filter((c) => c.plano === 'cancelado' || vencida(c, now)).length,
    }
  }, [contas, now])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (contas ?? []).filter((c) => {
      if (q && ![c.nome, c.email, c.cidade].some((v) => v?.toLowerCase().includes(q))) return false
      if (filtro === 'teste') return c.plano === 'teste' && !vencida(c, now)
      if (filtro === 'pagantes') return c.plano === 'ativo' && !vencida(c, now)
      if (filtro === 'vitalicio') return c.plano === 'vitalicio'
      if (filtro === 'bloqueadas') return c.plano === 'cancelado' || vencida(c, now)
      return true
    })
  }, [contas, busca, filtro, now])

  if (!supabase) {
    return (
      <div className="space-y-4">
        <PageHeader title="Contas" />
        <Empty icon={<Users />} title="Só funciona com login">
          No modo local não existem outras contas.
        </Empty>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contas"
        subtitle="Planos de quem usa a XS. Só você vê esta tela."
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void carregar()}>
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Contas" value={resumo.total} icon={<Users />} hint={`${resumo.bloqueadas} sem acesso`} />
        <Stat label="Em teste" value={resumo.teste} tone="blue" />
        <Stat label="Pagantes" value={resumo.pagantes} tone="go" hint={resumo.vencendo ? `${resumo.vencendo} vence(m) em até 3 dias` : 'nenhum vencendo'} />
        <Stat label="Vitalício" value={resumo.vitalicio} tone="gold" icon={<Crown />} />
      </div>

      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={[
              { id: 'todas', label: 'Todas' },
              { id: 'teste', label: 'Teste' },
              { id: 'pagantes', label: 'Pagantes' },
              { id: 'vitalicio', label: 'Vitalício' },
              { id: 'bloqueadas', label: 'Sem acesso' },
            ]}
          />
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar nome, login, cidade…" className="w-full sm:ml-auto sm:w-64" />
        </div>

        {erro ? (
          <p className="px-4 py-10 text-center text-xs text-red-300">{erro}</p>
        ) : !contas ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : visiveis.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-fg-3">Nenhuma conta aqui.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            <li className="hidden grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.3fr)_110px_auto] gap-4 px-4 py-2 text-2xs font-medium text-fg-4 md:grid">
              <span>Conta</span>
              <span>Plano</span>
              <span>Acaba em</span>
              <span>Último acesso</span>
              <span className="w-[92px]" />
            </li>
            {visiveis.map((c) => (
              <ContaRow key={c.user_id} conta={c} now={now} onEditar={() => setEditando(c)} />
            ))}
          </ul>
        )}
      </Card>

      {editando && (
        <PlanoModal
          conta={editando}
          souEu={editando.user_id === eu}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function PlanoBadge({ conta, now }: { conta: Conta; now: number }) {
  const nome = planInfo(asProfile(conta), now)?.nome ?? conta.plano
  const tone =
    conta.plano === 'cancelado'
      ? 'bg-bad/10 text-red-300'
      : vencida(conta, now)
        ? 'bg-orange-400/10 text-orange-300'
        : conta.plano === 'vitalicio'
          ? 'bg-gold/15 text-gold'
          : conta.plano === 'teste'
            ? 'bg-blue-500/10 text-blue-300'
            : 'bg-go/10 text-emerald-300'
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap', tone)}>
      {conta.plano === 'vitalicio' && <Crown className="size-3" />}
      {conta.plano === 'cancelado' ? 'Pausada' : nome}
    </span>
  )
}

function FimLabel({ conta, now }: { conta: Conta; now: number }) {
  const ate = planInfo(asProfile(conta), now)?.ate ?? null
  if (conta.plano === 'cancelado') return <span className="text-fg-4">Sem acesso</span>
  if (!ate) return <span className="text-fg-3">{conta.plano === 'vitalicio' ? 'Não acaba' : 'Sem data'}</span>
  const diff = Date.parse(ate) - now
  const dias = Math.ceil(Math.abs(diff) / DIA)
  return (
    <span className="min-w-0">
      <span className="num text-fg">{formatDateTime(ate)}</span>
      <span className={clsx('num block text-2xs', diff <= 0 ? 'text-orange-300' : diff <= 3 * DIA ? 'text-amber-200' : 'text-fg-4')}>
        {diff <= 0 ? `Venceu há ${dias} dia(s)` : dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`}
      </span>
    </span>
  )
}

function ContaRow({ conta, now, onEditar }: { conta: Conta; now: number; onEditar: () => void }) {
  const login = loginDe(conta.email)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-xs md:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.3fr)_110px_auto]">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium text-fg">
          {conta.nome || login}
          {conta.admin && <ShieldCheck className="size-3.5 shrink-0 text-blue-300" aria-label="Dono" />}
        </p>
        <p className="truncate text-2xs text-fg-3">
          {login}
          {conta.cidade ? ` · ${conta.cidade}` : ''}
        </p>
      </div>
      <div className="md:order-none">
        <PlanoBadge conta={conta} now={now} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <FimLabel conta={conta} now={now} />
      </div>
      <div className="text-2xs text-fg-3">{conta.ultimo_acesso ? formatRelative(conta.ultimo_acesso) : 'Nunca entrou'}</div>
      <Button size="sm" onClick={onEditar} className="w-[92px] justify-self-end">
        Mudar plano
      </Button>
    </li>
  )
}

/** "2026-10-04T14:30" para o campo de data e hora. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function PlanoModal({ conta, souEu, onClose, onSalvo }: { conta: Conta; souEu: boolean; onClose: () => void; onSalvo: () => void }) {
  const toast = useApp((s) => s.toast)
  const [escolha, setEscolha] = useState<Escolha>(() => escolhaAtual(conta))
  const [ate, setAte] = useState(() => {
    const d = fimSugerido(escolhaAtual(conta), conta)
    return d ? toLocalInput(d) : ''
  })
  const [salvando, setSalvando] = useState(false)

  const escolher = (e: Escolha) => {
    setEscolha(e)
    const d = fimSugerido(e, conta)
    setAte(d ? toLocalInput(d) : '')
  }

  const temData = escolha === 'teste' || isCiclo(escolha)
  const renovando = isCiclo(escolha) && conta.plano === 'ativo' && !!conta.plano_ate && Date.parse(conta.plano_ate) > Date.now()
  const bloqueado = (souEu && escolha === 'cancelado') || (temData && !ate)

  const salvar = async () => {
    if (!supabase) return
    setSalvando(true)
    try {
      await definirPlano(supabase, conta.user_id, escolha, temData ? new Date(ate) : null)
      toast(`Plano de ${conta.nome || loginDe(conta.email)} atualizado.`)
      onSalvo()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
      setSalvando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Plano de ${conta.nome || loginDe(conta.email)}`}
      subtitle={loginDe(conta.email)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="ml-auto">
            Cancelar
          </Button>
          <Button variant={escolha === 'cancelado' ? 'danger' : 'primary'} loading={salvando} disabled={bloqueado} onClick={() => void salvar()}>
            {escolha === 'cancelado' ? 'Pausar acesso' : 'Salvar plano'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="label">Plano</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {ESCOLHAS.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => escolher(e.id)}
                className={clsx(
                  'h-9 rounded-lg border text-xs font-medium transition-colors',
                  escolha === e.id
                    ? e.id === 'cancelado'
                      ? 'border-bad/40 bg-bad/10 text-red-300'
                      : 'border-blue-500/50 bg-blue-500/10 text-fg'
                    : 'border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {temData && (
          <label className="block">
            <span className="label">Acaba em</span>
            <input type="datetime-local" className="input" value={ate} onChange={(e) => setAte(e.target.value)} />
            <span className="mt-1 block text-2xs text-fg-4">
              {renovando ? 'Renovação: conta a partir do fim do plano atual, sem perder os dias que faltam.' : 'Pode mudar a data se quiser.'}
            </span>
          </label>
        )}

        {escolha === 'vitalicio' && <p className="text-xs text-fg-2">Acesso para sempre, sem data para acabar.</p>}
        {escolha === 'cancelado' && (
          <p className={clsx('text-xs', souEu ? 'text-orange-300' : 'text-fg-2')}>
            {souEu ? 'Você não pode pausar a sua própria conta.' : 'A pessoa não consegue entrar até você liberar um plano de novo. Os dados dela continuam guardados.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
