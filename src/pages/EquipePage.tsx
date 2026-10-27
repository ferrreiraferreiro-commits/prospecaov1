// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: o dono convida até 10 pessoas, que trabalham no CRM dele com o próprio login.
import { Crown, LogOut, Trash2, UserPlus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Card, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { useAccount, type MembroEquipe } from '../store/useAccount'
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
