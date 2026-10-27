// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: o dono convida até 10 pessoas, que trabalham no CRM dele com o próprio login.
import { Crown, LogOut, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Card, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { STATUS_MAP, STATUSES, TONE_CLASSES } from '../lib/statuses'
import { useAccount, usePessoasEquipe, type MembroEquipe } from '../store/useAccount'
import { useApp } from '../store/useApp'

const PAPEIS = {
  gestor: 'Gestor',
  vendedor: 'Vendedor',
} as const

const SOBRE_PAPEL = {
  gestor: 'Faz quase tudo na conta, menos mexer no plano e na equipe.',
  vendedor: 'Trabalha nos leads e conversas da conta. Não muda a conexão da API oficial.',
} as const

async function chamar(nome: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Equipe só funciona com a conta na nuvem.')
  const { error } = await supabase.rpc(nome, args)
  if (error) throw new Error(error.message)
}

export function EquipePage() {
  const equipe = useAccount((s) => s.equipe)

  if (!equipe) {
    return (
      <div className="space-y-5">
        <PageHeader title="Equipe" />
        <Empty icon={<Users className="h-5 w-5" />} title="Equipe indisponível">
          Entre com a sua conta da XS para montar ou ver a sua equipe.
        </Empty>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Equipe"
        subtitle={equipe.dono ? `Você trabalha na conta de ${equipe.dono.nome ?? 'outra pessoa'}.` : 'Pessoas que trabalham no seu CRM, cada uma com o próprio login.'}
      />
      {equipe.convite && <Convite dono={equipe.convite.dono} papel={equipe.convite.papel} />}
      {equipe.dono ? <SouMembro /> : equipe.times ? <SouDono /> : !equipe.convite && <SemTimes />}
    </div>
  )
}

function Convite({ dono, papel }: { dono: string | null; papel: string }) {
  const [busy, setBusy] = useState(false)
  const responder = async (aceitar: boolean) => {
    if (aceitar && !confirmAction('Ao entrar, você passa a ver e usar o CRM dessa equipe. Os seus leads de agora ficam guardados e voltam se você sair. Entrar?')) return
    setBusy(true)
    try {
      await chamar('equipe_responder', { p_aceitar: aceitar })
      window.location.reload()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <Card title="Convite para equipe" description={`${dono ?? 'Uma conta'} chamou você para a equipe como ${PAPEIS[papel as keyof typeof PAPEIS] ?? papel}.`}>
      <div className="flex flex-wrap gap-2">
        <Button variant="go" loading={busy} onClick={() => void responder(true)}>
          Entrar na equipe
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void responder(false)}>
          Recusar
        </Button>
      </div>
    </Card>
  )
}

function SemTimes() {
  return (
    <Card title="Plano Times" description="Para agências e equipes que prospectam juntas.">
      <ul className="space-y-1.5 text-[13px] text-fg-2">
        <li>Até 10 pessoas no seu CRM, cada uma com o próprio login e sem pagar nada.</li>
        <li>Todos usam os mesmos leads, funis, modelos e números de WhatsApp.</li>
        <li>Você escolhe quem é gestor e quem é vendedor.</li>
      </ul>
      <p className="mt-3 text-xs text-fg-3">Para liberar o plano Times na sua conta, fale com a XS pelo suporte.</p>
    </Card>
  )
}

function SouMembro() {
  const equipe = useAccount((s) => s.equipe)!
  const [busy, setBusy] = useState(false)
  const sair = async () => {
    if (!confirmAction('Sair da equipe? O que você fez fica com o dono, e você volta para a sua conta.')) return
    setBusy(true)
    try {
      await chamar('equipe_sair')
      window.location.reload()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <>
      <Card title="Sua equipe" description={`Seu papel: ${PAPEIS[equipe.papel as keyof typeof PAPEIS] ?? 'Dono'}.`}>
        <ul className="divide-y divide-line-soft">
          <li className="flex items-center gap-2 py-2 text-[13px]">
            <Crown className="h-3.5 w-3.5 text-gold" />
            <span className="pv">{equipe.dono?.nome ?? 'Dono'}</span>
            <span className="text-xs text-fg-3">Dono</span>
          </li>
          {equipe.membros.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2 text-[13px]">
              <span className="pv">{m.nome ?? m.usuario}</span>
              <span className="text-xs text-fg-3">{PAPEIS[m.papel]}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Desempenho />
      <Button variant="danger" icon={<LogOut className="h-3.5 w-3.5" />} loading={busy} onClick={() => void sair()}>
        Sair da equipe
      </Button>
    </>
  )
}

function SouDono() {
  const equipe = useAccount((s) => s.equipe)!
  const recarregar = useAccount((s) => s.recarregarEquipe)
  const [login, setLogin] = useState('')
  const [papel, setPapel] = useState<MembroEquipe['papel']>('vendedor')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const cheia = equipe.membros.length >= equipe.limite

  const alternarRoleta = async () => {
    try {
      await chamar('equipe_roleta', { p_ligar: !equipe.roleta })
      await recarregar()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    }
  }

  const convidar = async (e: FormEvent) => {
    e.preventDefault()
    if (!login.trim()) return
    setBusy(true)
    setErro(null)
    try {
      await chamar('equipe_convidar', { p_login: login.trim(), p_papel: papel })
      setLogin('')
      await recarregar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        title="Convidar pessoa"
        description={`A pessoa cria a conta dela na XS (grátis) e você convida pelo usuário ou e-mail. ${equipe.membros.length} de ${equipe.limite} vagas usadas.`}
      >
        <form onSubmit={(e) => void convidar(e)} className="flex flex-wrap items-end gap-2">
          <input className="input min-w-0 flex-1" placeholder="Usuário ou e-mail (ex.: flaviosites)" value={login} disabled={cheia} onChange={(e) => setLogin(e.target.value)} />
          <select className="input w-auto" value={papel} disabled={cheia} onChange={(e) => setPapel(e.target.value as MembroEquipe['papel'])}>
            <option value="vendedor">Vendedor</option>
            <option value="gestor">Gestor</option>
          </select>
          <Button type="submit" variant="primary" icon={<UserPlus className="h-3.5 w-3.5" />} loading={busy} disabled={cheia || !login.trim()}>
            Convidar
          </Button>
        </form>
        <p className="mt-2 text-xs text-fg-3">{SOBRE_PAPEL[papel]}</p>
        {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}
      </Card>

      <Desempenho />

      <Card
        title="Roleta de leads"
        description="Automático. Ligada, CADA lead novo (busca, importação ou cadastro) vai sozinho para um vendedor, um de cada vez. Desligada, os leads novos ficam só com você até você passar para alguém."
        actions={
          <Button size="sm" variant={equipe.roleta ? 'go' : 'secondary'} onClick={() => void alternarRoleta()}>
            {equipe.roleta ? 'Ligada' : 'Desligada'}
          </Button>
        }
      >
        <p className="text-xs text-fg-3">Para passar leads que já existem, selecione na lista de Leads e use “Passar para…” ou “Repartir entre a equipe”.</p>
      </Card>

      <Card title="Pessoas da equipe" bodyClass="px-4 py-1">
        {equipe.membros.length === 0 ? (
          <p className="py-3 text-[13px] text-fg-3">Ninguém ainda. Convide a primeira pessoa acima.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {equipe.membros.map((m) => (
              <Membro key={m.id} m={m} onMudou={recarregar} />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function Membro({ m, onMudou }: { m: MembroEquipe; onMudou: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const agir = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await onMudou()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const remover = () => {
    if (!confirmAction(m.aceito ? `Tirar ${m.nome ?? m.usuario} da equipe? O que essa pessoa fez fica na sua conta.` : 'Cancelar o convite?')) return
    void agir(() => chamar('equipe_remover', { p_membro: m.id }))
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="pv truncate text-[13px] font-medium">{m.nome ?? m.usuario}</p>
        <p className="pv truncate text-xs text-fg-3">
          {[m.usuario && `@${m.usuario}`, m.email].filter(Boolean).join(' · ')}
          {!m.aceito && <span className="ml-1.5 text-gold">Convite enviado</span>}
        </p>
      </div>
      {m.papel === 'vendedor' && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2" title="Desmarcado: a pessoa só vê os leads que estão com ela">
          <input
            type="checkbox"
            checked={m.ve_todos}
            disabled={busy}
            onChange={(e) => void agir(() => chamar('equipe_definir', { p_membro: m.id, p_papel: m.papel, p_ve_todos: e.target.checked }))}
          />
          Vê todos os leads
        </label>
      )}
      <MetaInput label="Contatos/mês" valor={m.meta_contatos} disabled={busy} onSalvar={(v) => void agir(() => chamar('equipe_metas', { p_membro: m.id, p_contatos: v, p_vendas: m.meta_vendas }))} />
      <MetaInput label="Vendas/mês" valor={m.meta_vendas} disabled={busy} onSalvar={(v) => void agir(() => chamar('equipe_metas', { p_membro: m.id, p_contatos: m.meta_contatos, p_vendas: v }))} />
      <select
        className="input w-auto"
        value={m.papel}
        disabled={busy}
        onChange={(e) => void agir(() => chamar('equipe_definir', { p_membro: m.id, p_papel: e.target.value, p_ve_todos: m.ve_todos }))}
      >
        <option value="vendedor">Vendedor</option>
        <option value="gestor">Gestor</option>
      </select>
      <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={busy} onClick={remover} aria-label="Tirar da equipe" />
    </li>
  )
}

function MetaInput({ label, valor, disabled, onSalvar }: { label: string; valor: number | null; disabled: boolean; onSalvar: (v: number | null) => void }) {
  const [v, setV] = useState(valor ? String(valor) : '')
  const salvar = () => {
    const n = Number(v) || null
    if (n !== valor) onSalvar(n)
  }
  return (
    <label className="flex items-center gap-1 text-2xs text-fg-3">
      {label}
      <input className="input h-7 w-14 px-1.5 text-xs" inputMode="numeric" value={v} disabled={disabled} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onBlur={salvar} />
    </label>
  )
}

/** Números do mês de cada pessoa: dono e gestor veem todos; vendedor vê só os dele. */
function Desempenho() {
  const equipe = useAccount((s) => s.equipe)!
  const eu = useAccount((s) => s.profile?.user_id)
  const pessoas = usePessoasEquipe()
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const leads = useApp((s) => s.leads)

  const linhas = useMemo(() => {
    const inicio = new Date()
    inicio.setDate(1)
    inicio.setHours(0, 0, 0, 0)
    const desde = inicio.toISOString()
    const semana = Date.now() - 7 * 86_400_000
    const respDe = new Map(leads.map((l) => [l.id, l.responsavel ?? null]))
    const visiveis = equipe.papel === 'vendedor' ? pessoas.filter((p) => p.id === eu) : pessoas
    return visiveis.map((p) => {
      const minhas = interactions.filter((i) => i.autor === p.id && i.created_at >= desde)
      const vendas = meetings.filter((m) => m.resultado === 'fechou' && m.data >= desde.slice(0, 10) && (respDe.get(m.lead_id) ?? m.autor) === p.id)
      const carteira = leads.filter((l) => l.responsavel === p.id)
      const membro = equipe.membros.find((m) => m.id === p.id)
      return {
        ...p,
        ligacoes: minhas.filter((i) => i.tipo === 'ligacao').length,
        contatos: minhas.filter((i) => i.status && STATUS_MAP[i.status]?.contato).length,
        reunioes: minhas.filter((i) => i.status === 'agendou_reuniao').length,
        vendas: vendas.length,
        valor: vendas.reduce((t, m) => t + (m.valor ?? 0), 0),
        carteira: carteira.length,
        parados: carteira.filter((l) => !l.ultima_ligacao || Date.parse(l.ultima_ligacao) < semana).length,
        porStatus: STATUSES.map((st) => ({ st, n: carteira.filter((l) => l.status === st.id).length })).filter((x) => x.n > 0),
        metaContatos: membro?.meta_contatos ?? null,
        metaVendas: membro?.meta_vendas ?? null,
      }
    })
  }, [equipe, eu, pessoas, interactions, meetings, leads])

  if (!linhas.length) return null
  const ordem = [...linhas].sort((a, b) => b.vendas - a.vendas || b.contatos - a.contatos)
  return (
    <Card title="Desempenho do mês" description="Ligações, contatos, reuniões e vendas de cada pessoa. Vendas = reuniões com resultado “Fechou”, contadas para quem cuida do lead." bodyClass="overflow-x-auto px-0 py-0">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-2xs text-fg-3">
          <tr className="border-b border-line-soft text-left">
            <th className="px-4 py-2 font-medium">Pessoa</th>
            <th className="px-2 py-2 text-right font-medium">Ligações</th>
            <th className="px-2 py-2 text-right font-medium">Contatos</th>
            <th className="px-2 py-2 text-right font-medium">Reuniões</th>
            <th className="px-2 py-2 text-right font-medium">Vendas</th>
            <th className="px-2 py-2 text-right font-medium">Valor</th>
            <th className="px-4 py-2 text-right font-medium">Carteira</th>
          </tr>
        </thead>
        <tbody>
          {ordem.map((l, i) => (
            <tr key={l.id} className="border-b border-line-soft last:border-0">
              <td className="px-4 py-2">
                <span className="num mr-1.5 text-fg-4">{i + 1}º</span>
                <span className="pv font-medium">{l.nome}</span>
              </td>
              <td className="num px-2 py-2 text-right">{l.ligacoes}</td>
              <td className="num px-2 py-2 text-right">
                {l.contatos}
                {l.metaContatos && <span className={l.contatos >= l.metaContatos ? 'text-go' : 'text-fg-4'}>/{l.metaContatos}</span>}
              </td>
              <td className="num px-2 py-2 text-right">{l.reunioes}</td>
              <td className="num px-2 py-2 text-right">
                {l.vendas}
                {l.metaVendas && <span className={l.vendas >= l.metaVendas ? 'text-go' : 'text-fg-4'}>/{l.metaVendas}</span>}
              </td>
              <td className="pv num px-2 py-2 text-right">{l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</td>
              <td className="num px-4 py-2 text-right">
                <Link to={`/leads?resp=${l.id}`} className="underline-offset-2 hover:underline" title="Ver os leads dessa pessoa">
                  {l.carteira}
                </Link>
                {l.parados > 0 && <span className="ml-1 text-gold" title="Sem ligação há mais de 7 dias">· {l.parados} parados</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-2 border-t border-line-soft px-4 py-3">
        <p className="text-2xs font-medium text-fg-3">Status dos leads de cada pessoa</p>
        {ordem.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-1.5 text-2xs">
            <Link to={`/leads?resp=${l.id}`} className="pv mr-1 font-medium text-fg hover:underline">
              {l.nome}
            </Link>
            {l.porStatus.length ? (
              l.porStatus.map(({ st, n }) => (
                <span key={st.id} className={clsx('rounded px-1.5 leading-4 ring-1 ring-inset', TONE_CLASSES[st.tone].chip)}>
                  {st.label} <span className="num">{n}</span>
                </span>
              ))
            ) : (
              <span className="text-fg-4">Nenhum lead com essa pessoa</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
