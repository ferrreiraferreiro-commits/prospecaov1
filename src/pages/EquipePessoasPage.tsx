// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: o dono convida até 10 pessoas, escolhe o cargo de cada uma e como os leads novos são distribuídos.
import clsx from 'clsx'
import { Code, Shuffle, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { PAPEIS, SOBRE_PAPEL } from '../lib/equipe'
import { useAccount, type MembroEquipe } from '../store/useAccount'
import { useApp } from '../store/useApp'

type Papel = MembroEquipe['papel']

export const CARGO_ESTILO: Record<Papel, { icon: typeof Users; chip: string }> = {
  gestor: { icon: ShieldCheck, chip: 'bg-gold/10 text-gold ring-gold/30' },
  vendedor: { icon: Users, chip: 'bg-blue-500/10 text-blue-300 ring-blue-500/30' },
  desenvolvedor: { icon: Code, chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
}

export function CargoChip({ papel }: { papel: Papel }) {
  const { icon: Icon, chip } = CARGO_ESTILO[papel]
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded px-1.5 text-2xs leading-5 font-medium ring-1 ring-inset', chip)}>
      <Icon className="size-3" />
      {PAPEIS[papel]}
    </span>
  )
}

export async function chamar(nome: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Equipe só funciona com a conta na nuvem.')
  const { error } = await supabase.rpc(nome, args)
  if (error) throw new Error(error.message)
}

export function EquipePessoasPage() {
  const equipe = useAccount((s) => s.equipe)
  const recarregar = useAccount((s) => s.recarregarEquipe)
  const [login, setLogin] = useState('')
  const [papel, setPapel] = useState<Papel>('vendedor')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!equipe?.times || equipe.dono) return <Navigate to="/equipe" replace />
  const cheia = equipe.membros.length >= equipe.limite

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

  const alternarDistribuicao = async () => {
    try {
      await chamar('equipe_roleta', { p_ligar: !equipe.roleta })
      await recarregar()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Pessoas e cargos" subtitle={`${equipe.membros.length} de ${equipe.limite} vagas usadas. Cada pessoa entra com o próprio login, sem pagar nada.`} />

      {/* Os três cargos, lado a lado: escolhe e convida */}
      <section className="panel overflow-hidden">
        <div className="grid gap-px bg-line-soft sm:grid-cols-3">
          {(Object.keys(PAPEIS) as Papel[]).map((p) => {
            const { icon: Icon } = CARGO_ESTILO[p]
            const ativo = papel === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPapel(p)}
                className={clsx('flex flex-col gap-1.5 bg-panel px-4 py-3.5 text-left transition-colors hover:bg-hover', ativo && 'bg-blue-500/[0.07]')}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <Icon className={clsx('size-4', ativo ? 'text-blue-300' : 'text-fg-3')} />
                  {PAPEIS[p]}
                  {ativo && <span className="ml-auto size-1.5 rounded-full bg-blue-400" />}
                </span>
                <span className="text-xs leading-5 text-fg-3">{SOBRE_PAPEL[p]}</span>
              </button>
            )
          })}
        </div>
        <form onSubmit={(e) => void convidar(e)} className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
          <input
            className="input min-w-0 flex-1"
            placeholder="Usuário ou e-mail da pessoa (ex.: flaviosites)"
            value={login}
            disabled={cheia}
            onChange={(e) => setLogin(e.target.value)}
          />
          <Button type="submit" variant="primary" icon={<UserPlus className="h-3.5 w-3.5" />} loading={busy} disabled={cheia || !login.trim()}>
            Convidar como {PAPEIS[papel].toLowerCase()}
          </Button>
        </form>
        {(erro || cheia) && <p className="border-t border-line-soft px-4 py-2 text-xs text-red-300">{erro ?? 'A equipe está cheia.'}</p>}
      </section>

      <Card title="Pessoas da equipe" description="A pessoa precisa ter a conta dela na XS. Ela aceita o convite na tela Painel da equipe." bodyClass="px-0 py-0">
        {equipe.membros.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-fg-3">Ninguém ainda. Convide a primeira pessoa acima.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {equipe.membros.map((m) => (
              <Pessoa key={m.id} m={m} onMudou={recarregar} />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Shuffle className="size-3.5 text-fg-3" /> Distribuição automática de leads
          </span>
        }
        description={
          equipe.roleta
            ? 'Ligada: cada lead novo (busca, importação ou cadastro) vai sozinho para um vendedor, um de cada vez.'
            : 'Desligada: os leads novos ficam com você até você passar para alguém. Na lista de Leads, selecione e use “Passar para…”.'
        }
        actions={
          <Button size="sm" variant={equipe.roleta ? 'go' : 'secondary'} onClick={() => void alternarDistribuicao()}>
            {equipe.roleta ? 'Ligada' : 'Desligada'}
          </Button>
        }
      >
        <p className="text-xs text-fg-3">Só os vendedores entram no rodízio. Gestor e desenvolvedor nunca recebem leads sozinhos.</p>
      </Card>
    </div>
  )
}

function Pessoa({ m, onMudou }: { m: MembroEquipe; onMudou: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const nome = m.nome ?? m.usuario ?? 'Sem nome'
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
    if (!confirmAction(m.aceito ? `Tirar ${nome} da equipe? O que essa pessoa fez fica na sua conta.` : 'Cancelar o convite?')) return
    void agir(() => chamar('equipe_remover', { p_membro: m.id }))
  }
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-[200px] flex-1 items-center gap-3">
        <Avatar src={null} name={nome} size={34} />
        <div className="min-w-0">
          <p className="pv flex items-center gap-2 truncate text-[13px] font-medium">
            {m.aceito ? (
              <Link to={`/equipe/${m.id}`} className="hover:underline">
                {nome}
              </Link>
            ) : (
              nome
            )}
            <CargoChip papel={m.papel} />
          </p>
          <p className="pv truncate text-xs text-fg-3">
            {[m.usuario && `@${m.usuario}`, m.email].filter(Boolean).join(' · ')}
            {!m.aceito && <span className="ml-1.5 text-gold">Convite enviado</span>}
          </p>
        </div>
      </div>
      {m.papel === 'vendedor' && (
        <>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-2" title="Desmarcado: a pessoa só vê os leads que estão com ela">
            <input
              type="checkbox"
              checked={m.ve_todos}
              disabled={busy}
              onChange={(e) => void agir(() => chamar('equipe_definir', { p_membro: m.id, p_papel: m.papel, p_ve_todos: e.target.checked }))}
            />
            Vê todos os leads
          </label>
          <MetaInput label="Contatos/mês" valor={m.meta_contatos} disabled={busy} onSalvar={(v) => void agir(() => chamar('equipe_metas', { p_membro: m.id, p_contatos: v, p_vendas: m.meta_vendas }))} />
          <MetaInput label="Vendas/mês" valor={m.meta_vendas} disabled={busy} onSalvar={(v) => void agir(() => chamar('equipe_metas', { p_membro: m.id, p_contatos: m.meta_contatos, p_vendas: v }))} />
        </>
      )}
      <select
        className="input h-8 w-auto cursor-pointer pr-7 text-xs"
        value={m.papel}
        disabled={busy}
        aria-label="Cargo"
        onChange={(e) => void agir(() => chamar('equipe_definir', { p_membro: m.id, p_papel: e.target.value, p_ve_todos: m.ve_todos }))}
      >
        {(Object.keys(PAPEIS) as Papel[]).map((p) => (
          <option key={p} value={p}>
            {PAPEIS[p]}
          </option>
        ))}
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
