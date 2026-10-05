import clsx from 'clsx'
import { BadgeDollarSign, Check, Copy, Crown, KeyRound, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, NumberInput, SearchInput, Stat } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Modal, Segmented, Spinner } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import {
  apagarPagamento,
  definirEmail,
  definirPlano,
  ESCOLHAS,
  escolhaAtual,
  fimSugerido,
  gerarSenha,
  isCiclo,
  listarContas,
  listarPagamentos,
  loginDe,
  nomeDoPlano,
  novaSenha,
  recebidoNoMes,
  registrarPagamento,
  type Conta,
  type Escolha,
  type PagamentoXs,
} from '../lib/admin'
import { isLegacyEmail } from '../lib/auth'
import { formatDateKey, formatDateTime, formatRelative, toDateKey } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { salvarSuporteWhatsApp, useSuporteWhatsApp } from '../lib/suporte'
import { linkComunidadeValido, salvarComunidade, useComunidade } from '../lib/comunidade'
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

function nomeDe(c: Conta): string {
  return c.nome || c.usuario || loginDe(c.email)
}

export function ContasPage() {
  const [contas, setContas] = useState<Conta[] | null>(null)
  const [pagamentos, setPagamentos] = useState<PagamentoXs[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [editando, setEditando] = useState<string | null>(null)
  const [eu, setEu] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!supabase) return
    setErro(null)
    try {
      const [c, p] = await Promise.all([listarContas(supabase), listarPagamentos(supabase)])
      setContas(c)
      setPagamentos(p)
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

  const totalPorConta = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pagamentos) m.set(p.user_id, (m.get(p.user_id) ?? 0) + p.valor)
    return m
  }, [pagamentos])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (contas ?? []).filter((c) => {
      if (q && ![c.nome, c.usuario, c.email, c.cidade].some((v) => v?.toLowerCase().includes(q))) return false
      if (filtro === 'teste') return c.plano === 'teste' && !vencida(c, now)
      if (filtro === 'pagantes') return c.plano === 'ativo' && !vencida(c, now)
      if (filtro === 'vitalicio') return c.plano === 'vitalicio'
      if (filtro === 'bloqueadas') return c.plano === 'cancelado' || vencida(c, now)
      return true
    })
  }, [contas, busca, filtro, now])

  const contaAberta = contas?.find((c) => c.user_id === editando) ?? null

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

  const mesAtual = recebidoNoMes(pagamentos)
  const totalGeral = pagamentos.reduce((s, p) => s + p.valor, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contas"
        subtitle="Planos, pagamentos e acesso de quem usa a XS. Só você vê esta tela."
        actions={
          <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void carregar()}>
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat priv label="Recebido no mês" value={formatMoney(mesAtual)} tone="go" icon={<BadgeDollarSign />} hint={`${formatMoney(totalGeral)} no total`} />
        <Stat label="Pagantes" value={resumo.pagantes} tone="blue" hint={resumo.vencendo ? `${resumo.vencendo} vence(m) em até 3 dias` : 'nenhum vencendo'} />
        <Stat label="Em teste" value={resumo.teste} />
        <Stat label="Vitalício" value={resumo.vitalicio} tone="gold" icon={<Crown />} />
        <Stat label="Contas" value={resumo.total} icon={<Users />} hint={`${resumo.bloqueadas} sem acesso`} />
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
          <SearchInput value={busca} onChange={setBusca} placeholder="Buscar nome, e-mail, cidade…" className="w-full sm:ml-auto sm:w-64" />
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
            <li className="hidden grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.3fr)_100px_110px_auto] gap-4 px-4 py-2 text-2xs font-medium text-fg-4 md:grid">
              <span>Conta</span>
              <span>Plano</span>
              <span>Acaba em</span>
              <span className="text-right">Já pagou</span>
              <span>Último acesso</span>
              <span className="w-[92px]" />
            </li>
            {visiveis.map((c) => (
              <ContaRow key={c.user_id} conta={c} now={now} pago={totalPorConta.get(c.user_id) ?? 0} onEditar={() => setEditando(c.user_id)} />
            ))}
          </ul>
        )}
      </Card>

      <SuporteCard />
      <ComunidadeCard />

      {contaAberta && (
        <ContaModal
          conta={contaAberta}
          souEu={contaAberta.user_id === eu}
          pagamentos={pagamentos.filter((p) => p.user_id === contaAberta.user_id)}
          onClose={() => setEditando(null)}
          onMudou={() => void carregar()}
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

function ContaRow({ conta, now, pago, onEditar }: { conta: Conta; now: number; pago: number; onEditar: () => void }) {
  const legacy = isLegacyEmail(conta.email)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-xs md:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.3fr)_100px_110px_auto]">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium text-fg">
          <span className="pv truncate">{nomeDe(conta)}</span>
          {conta.admin && <ShieldCheck className="size-3.5 shrink-0 text-blue-300" aria-label="Dono" />}
        </p>
        <p className="pv truncate text-2xs text-fg-3">
          {[conta.usuario && `@${conta.usuario}`, legacy ? 'sem e-mail' : conta.email].filter(Boolean).join(' · ')}
          {conta.cidade ? ` · ${conta.cidade}` : ''}
        </p>
      </div>
      <div>
        <PlanoBadge conta={conta} now={now} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <FimLabel conta={conta} now={now} />
      </div>
      <div className={clsx('pv num md:text-right', pago ? 'text-fg' : 'text-fg-4')}>
        <span className="text-2xs text-fg-4 md:hidden">Já pagou </span>
        {formatMoney(pago)}
      </div>
      <div className="text-2xs text-fg-3">{conta.ultimo_acesso ? formatRelative(conta.ultimo_acesso) : 'Nunca entrou'}</div>
      <Button size="sm" onClick={onEditar} className="col-span-2 w-full justify-self-end md:col-span-1 md:w-[92px]">
        Gerenciar
      </Button>
    </li>
  )
}

/** "2026-10-04T14:30" para o campo de data e hora. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

type Aba = 'plano' | 'pagamentos' | 'acesso'

function ContaModal({
  conta,
  souEu,
  pagamentos,
  onClose,
  onMudou,
}: {
  conta: Conta
  souEu: boolean
  pagamentos: PagamentoXs[]
  onClose: () => void
  onMudou: () => void
}) {
  const [aba, setAba] = useState<Aba>('plano')
  return (
    <Modal open onClose={onClose} title={<span className="pv">{nomeDe(conta)}</span>} subtitle={<span className="pv">{[conta.usuario && `@${conta.usuario}`, isLegacyEmail(conta.email) ? 'sem e-mail' : conta.email].filter(Boolean).join(' · ')}</span>} width="max-w-xl">
      <div className="border-b border-line-soft px-5 py-2.5">
        <Segmented
          value={aba}
          onChange={setAba}
          options={[
            { id: 'plano', label: 'Plano' },
            { id: 'pagamentos', label: `Pagamentos${pagamentos.length ? ` (${pagamentos.length})` : ''}` },
            { id: 'acesso', label: 'Acesso' },
          ]}
        />
      </div>
      {aba === 'plano' && <PlanoAba conta={conta} souEu={souEu} onSalvo={() => {
            onMudou()
            onClose()
          }} />}
      {aba === 'pagamentos' && <PagamentosAba conta={conta} pagamentos={pagamentos} onMudou={onMudou} />}
      {aba === 'acesso' && <AcessoAba conta={conta} onMudou={onMudou} />}
    </Modal>
  )
}

function PlanoAba({ conta, souEu, onSalvo }: { conta: Conta; souEu: boolean; onSalvo: () => void }) {
  const toast = useApp((s) => s.toast)
  const [escolha, setEscolha] = useState<Escolha>(() => escolhaAtual(conta))
  const [ate, setAte] = useState(() => {
    const d = fimSugerido(escolhaAtual(conta), conta)
    return d ? toLocalInput(d) : ''
  })
  const [valor, setValor] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  const escolher = (e: Escolha) => {
    setEscolha(e)
    const d = fimSugerido(e, conta)
    setAte(d ? toLocalInput(d) : '')
  }

  const temData = escolha === 'teste' || isCiclo(escolha)
  const pago = isCiclo(escolha) || escolha === 'vitalicio'
  const renovando = isCiclo(escolha) && conta.plano === 'ativo' && !!conta.plano_ate && Date.parse(conta.plano_ate) > Date.now()
  const bloqueado = (souEu && escolha === 'cancelado') || (temData && !ate)

  const salvar = async () => {
    if (!supabase) return
    setSalvando(true)
    try {
      await definirPlano(supabase, conta.user_id, escolha, temData ? new Date(ate) : null)
      if (pago && valor) {
        await registrarPagamento(supabase, { user_id: conta.user_id, valor, plano: escolha, pago_em: new Date().toISOString(), obs: null })
      }
      toast(`Plano de ${nomeDe(conta)} atualizado.`)
      onSalvo()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
      setSalvando(false)
    }
  }

  return (
    <>
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

        {pago && (
          <div>
            <span className="label">Valor recebido agora (opcional)</span>
            <NumberInput value={valor} onChange={setValor} prefix="R$" min={0} placeholder="0,00" />
            <span className="mt-1 block text-2xs text-fg-4">Entra em Pagamentos e no “Recebido no mês”.</span>
          </div>
        )}

        {escolha === 'vitalicio' && <p className="text-xs text-fg-2">Acesso para sempre, sem data para acabar.</p>}
        {escolha === 'cancelado' && (
          <p className={clsx('text-xs', souEu ? 'text-orange-300' : 'text-fg-2')}>
            {souEu ? 'Você não pode pausar a sua própria conta.' : 'A pessoa não consegue entrar até você liberar um plano de novo. Os dados dela continuam guardados.'}
          </p>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-5 py-3">
        <Button variant={escolha === 'cancelado' ? 'danger' : 'primary'} loading={salvando} disabled={bloqueado} onClick={() => void salvar()} className="ml-auto">
          {escolha === 'cancelado' ? 'Pausar acesso' : 'Salvar plano'}
        </Button>
      </footer>
    </>
  )
}

function PagamentosAba({ conta, pagamentos, onMudou }: { conta: Conta; pagamentos: PagamentoXs[]; onMudou: () => void }) {
  const toast = useApp((s) => s.toast)
  const [valor, setValor] = useState<number | null>(null)
  const [data, setData] = useState(() => toDateKey())
  const [plano, setPlano] = useState<string>(() => escolhaAtual(conta))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const total = pagamentos.reduce((s, p) => s + p.valor, 0)

  const adicionar = async () => {
    if (!supabase || !valor) return
    setSalvando(true)
    try {
      await registrarPagamento(supabase, { user_id: conta.user_id, valor, plano, pago_em: new Date(`${data}T12:00:00`).toISOString(), obs: obs.trim() || null })
      setValor(null)
      setObs('')
      toast('Pagamento anotado.')
      onMudou()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  const apagar = async (p: PagamentoXs) => {
    if (!supabase || !window.confirm(`Apagar o pagamento de ${formatMoney(p.valor)}?`)) return
    try {
      await apagarPagamento(supabase, p.id)
      onMudou()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível apagar.', 'error')
    }
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="rounded-lg border border-line-soft bg-ink p-3">
        <p className="mb-2 text-xs font-semibold text-fg">Anotar pagamento</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
          <NumberInput value={valor} onChange={setValor} prefix="R$" min={0} placeholder="Valor" />
          <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
          <select className="input" value={plano} onChange={(e) => setPlano(e.target.value)}>
            {ESCOLHAS.filter((e) => e.id !== 'cancelado').map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <input className="input" placeholder="Observação (ex.: Pix, desconto)" value={obs} onChange={(e) => setObs(e.target.value)} />
          <Button variant="primary" loading={salvando} disabled={!valor} onClick={() => void adicionar()}>
            Anotar
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-xs font-semibold text-fg">Histórico</p>
          <p className="num text-xs text-fg-3">
            Total <span className="font-semibold text-emerald-300">{formatMoney(total)}</span>
          </p>
        </div>
        {pagamentos.length === 0 ? (
          <p className="py-6 text-center text-xs text-fg-3">Nenhum pagamento anotado.</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {pagamentos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="num w-20 shrink-0 text-fg-3">{formatDateKey(toDateKey(new Date(p.pago_em)))}</span>
                <span className="min-w-0 flex-1 truncate text-fg-2">
                  {nomeDoPlano(p.plano)}
                  {p.obs ? <span className="text-fg-4"> · {p.obs}</span> : null}
                </span>
                <span className="num font-medium text-fg">{formatMoney(p.valor)}</span>
                <button onClick={() => void apagar(p)} className="rounded p-1 text-fg-4 hover:bg-hover hover:text-red-300" aria-label="Apagar pagamento">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AcessoAba({ conta, onMudou }: { conta: Conta; onMudou: () => void }) {
  const toast = useApp((s) => s.toast)
  const legacy = isLegacyEmail(conta.email)
  const [email, setEmail] = useState(legacy ? '' : (conta.email ?? ''))
  const [salvandoEmail, setSalvandoEmail] = useState(false)
  const [senha, setSenha] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const salvarEmail = async () => {
    if (!supabase) return
    setSalvandoEmail(true)
    try {
      await definirEmail(supabase, conta.user_id, email)
      toast(`E-mail de ${nomeDe(conta)} salvo. Agora ela entra com ${email.trim().toLowerCase()}.`)
      onMudou()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
    } finally {
      setSalvandoEmail(false)
    }
  }

  const gerar = async () => {
    if (!supabase || !window.confirm(`Criar uma senha nova para ${nomeDe(conta)}? A senha antiga para de funcionar.`)) return
    setGerando(true)
    const nova = gerarSenha()
    try {
      await novaSenha(supabase, conta.user_id, nova)
      setSenha(nova)
      setCopiado(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível trocar a senha.', 'error')
    } finally {
      setGerando(false)
    }
  }

  const copiar = async () => {
    if (!senha) return
    try {
      await navigator.clipboard.writeText(senha)
      setCopiado(true)
    } catch {
      toast('Não deu para copiar. Selecione a senha e copie.', 'error')
    }
  }

  return (
    <div className="space-y-5 px-5 py-4">
      <div>
        <p className="label">E-mail de acesso</p>
        {legacy && <p className="mb-2 text-2xs text-amber-200/80">Esta conta não tem e-mail (entra só pelo usuário). Com e-mail, a pessoa consegue recuperar a senha sozinha.</p>}
        <div className="flex gap-2">
          <input type="email" className="input" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="primary" loading={salvandoEmail} disabled={!email.includes('@') || email.trim().toLowerCase() === conta.email} onClick={() => void salvarEmail()}>
            Salvar
          </Button>
        </div>
        <p className="mt-1 text-2xs text-fg-4">A senha continua a mesma. Avise a pessoa que agora ela entra com esse e-mail.</p>
      </div>

      <div className="border-t border-line-soft pt-4">
        <p className="label">Senha</p>
        {senha ? (
          <div className="rounded-lg border border-go/30 bg-go/[0.06] p-3">
            <p className="text-2xs text-fg-3">Senha nova de {nomeDe(conta)}:</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="num flex-1 text-base font-semibold tracking-wider text-fg select-all">{senha}</code>
              <Button size="sm" icon={copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => void copiar()}>
                {copiado ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            <p className="mt-2 text-2xs text-fg-3">Mande para a pessoa. Ela pode trocar depois em Ajustes → Acesso e senha. Esta senha não aparece de novo.</p>
          </div>
        ) : (
          <>
            <Button icon={<KeyRound className="size-3.5" />} loading={gerando} onClick={() => void gerar()}>
              Gerar senha nova
            </Button>
            <p className="mt-1 text-2xs text-fg-4">Para quem esqueceu a senha. A antiga para de funcionar na hora.</p>
          </>
        )}
      </div>
    </div>
  )
}

function SuporteCard() {
  const toast = useApp((s) => s.toast)
  const atual = useSuporteWhatsApp()
  const [numero, setNumero] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setNumero(atual ?? ''), [atual])

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarSuporteWhatsApp(numero)
      toast('WhatsApp de renovação salvo.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card title="Seu WhatsApp para renovações" description="Aparece no aviso de plano acabando e na tela de plano vencido, com o botão “Renovar pelo WhatsApp”.">
      <div className="flex max-w-md gap-2">
        <input className="input num" inputMode="tel" placeholder="(43) 91234-5678" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <Button variant="primary" loading={salvando} disabled={(numero.trim() || null) === atual} onClick={() => void salvar()}>
          Salvar
        </Button>
      </div>
    </Card>
  )
}

function ComunidadeCard() {
  const toast = useApp((s) => s.toast)
  const atual = useComunidade()
  const [link, setLink] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setLink(atual ?? ''), [atual])
  const invalido = !!link.trim() && !linkComunidadeValido(link)

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarComunidade(link)
      toast(link.trim() ? 'Link da comunidade salvo. Já aparece no menu de todo mundo.' : 'Link da comunidade removido do menu.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card title="Comunidade no WhatsApp" description="Cole o link de convite do grupo ou da comunidade (WhatsApp → grupo → Convidar via link). Aparece no menu de todas as contas como “Comunidade XS”. Deixe vazio para esconder.">
      <div className="flex max-w-xl gap-2">
        <input className="input" inputMode="url" placeholder="https://chat.whatsapp.com/…" value={link} onChange={(e) => setLink(e.target.value)} />
        <Button variant="primary" loading={salvando} disabled={invalido || (link.trim() || null) === atual} onClick={() => void salvar()}>
          Salvar
        </Button>
      </div>
      {invalido && <p className="mt-1.5 text-2xs text-red-300">Use o link de convite do WhatsApp, que começa com https://chat.whatsapp.com/</p>}
    </Card>
  )
}
