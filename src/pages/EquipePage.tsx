// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: painel da equipe — entrar em serviço, quem está trabalhando, sites, chat e desempenho do mês.
import clsx from 'clsx'
import { ArrowRight, Code, Crown, LogOut, MessageSquare, UserCog, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Card, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty } from '../components/ui'
import { formatarHoras, inicioDeHoje, PAPEIS, tempoEmServico, turnoAberto, useNumeros, useTurnos } from '../lib/equipe'
import { useChatNaoLidas, useSites } from '../lib/sites'
import { STATUS_MAP, STATUSES, TONE_CLASSES } from '../lib/statuses'
import { useAccount, usePessoasEquipe } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { CargoChip, chamar } from './EquipePessoasPage'

export function EquipePage() {
  const equipe = useAccount((s) => s.equipe)

  if (!equipe) {
    return (
      <div className="space-y-5">
        <PageHeader title="Painel da equipe" />
        <Empty icon={<Users className="h-5 w-5" />} title="Equipe indisponível">
          Entre com a sua conta da XS para montar ou ver a sua equipe.
        </Empty>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Painel da equipe"
        subtitle={equipe.dono ? `Você trabalha na equipe de ${equipe.dono.nome ?? 'outra pessoa'}.` : 'Quem está trabalhando, os sites em andamento e os números do mês.'}
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
    <Card title="Plano Times" description="Para agências e equipes que prospectam e fazem sites juntas.">
      <ul className="space-y-1.5 text-[13px] text-fg-2">
        <li>Até 10 pessoas no seu CRM, cada uma com o próprio login e sem pagar nada.</li>
        <li>Vendedores prospectam; desenvolvedores pegam os sites para fazer.</li>
        <li>Chat da equipe, quem está em serviço e o desempenho de cada um.</li>
      </ul>
      <p className="mt-3 text-xs text-fg-3">Para liberar o plano Times na sua conta, fale com a XS pelo suporte.</p>
    </Card>
  )
}

/** Atalhos grandes para as partes da equipe, com o que está esperando em cada uma. */
function Atalhos({ dono }: { dono: boolean }) {
  const pedidos = useSites((s) => s.pedidos)
  const eu = useAccount((s) => s.profile?.user_id)
  const chat = useChatNaoLidas()
  const fila = pedidos.filter((p) => p.status === 'fila').length
  const fazendo = pedidos.filter((p) => p.status === 'fazendo').length
  const meus = pedidos.filter((p) => p.status === 'fazendo' && p.dev === eu).length
  const itens: { to: string; icon: ReactNode; titulo: string; texto: string; destaque?: boolean }[] = [
    {
      to: '/equipe/sites',
      icon: <Code className="size-4 text-emerald-300" />,
      titulo: 'Sites para fazer',
      texto: `${fila} na fila · ${meus ? `${meus} com você` : `${fazendo} sendo feitos`}`,
      destaque: fila > 0,
    },
    { to: '/equipe/chat', icon: <MessageSquare className="size-4 text-blue-300" />, titulo: 'Chat da equipe', texto: chat ? `${chat} mensagens novas` : 'Converse com a equipe', destaque: chat > 0 },
  ]
  if (dono) itens.push({ to: '/equipe/pessoas', icon: <UserCog className="size-4 text-gold" />, titulo: 'Pessoas e cargos', texto: 'Convidar, cargos e metas' })
  return (
    <div className={clsx('grid gap-3', dono ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {itens.map((i) => (
        <Link key={i.to} to={i.to} className="panel group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
          <span className="flex size-9 items-center justify-center rounded-lg border border-line-soft bg-raised">{i.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{i.titulo}</span>
            <span className={clsx('block truncate text-xs', i.destaque ? 'text-gold' : 'text-fg-3')}>{i.texto}</span>
          </span>
          <ArrowRight className="size-4 text-fg-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
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
      <Servico />
      <Atalhos dono={false} />
      <Card title="Sua equipe" bodyClass="px-0 py-0">
        <ul className="divide-y divide-line-soft">
          <li className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <Avatar src={null} name={equipe.dono?.nome ?? 'Dono'} size={28} />
            <span className="pv flex-1 font-medium">{equipe.dono?.nome ?? 'Dono'}</span>
            <span className="inline-flex items-center gap-1 text-2xs text-gold">
              <Crown className="size-3" /> Dono
            </span>
          </li>
          {equipe.membros.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <Avatar src={null} name={m.nome ?? m.usuario ?? '?'} size={28} />
              <span className="pv flex-1 font-medium">{m.nome ?? m.usuario}</span>
              <CargoChip papel={m.papel} />
            </li>
          ))}
        </ul>
      </Card>
      {equipe.papel !== 'desenvolvedor' && <Desempenho />}
      <Button variant="danger" icon={<LogOut className="h-3.5 w-3.5" />} loading={busy} onClick={() => void sair()}>
        Sair da equipe
      </Button>
    </>
  )
}

function SouDono() {
  return (
    <>
      <Atalhos dono />
      <Agora />
      <Desempenho />
    </>
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
    const devs = new Set(equipe.membros.filter((m) => m.papel === 'desenvolvedor').map((m) => m.id))
    const visiveis = (equipe.papel === 'vendedor' ? pessoas.filter((p) => p.id === eu) : pessoas).filter((p) => !devs.has(p.id))
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

/** Quem é da equipe: entrar e sair de serviço, e os números do dia (do desenvolvedor: os sites). */
function Servico() {
  const eu = useAccount((s) => s.profile)
  const dev = useAccount((s) => s.equipe?.papel === 'desenvolvedor')
  const { turnos, carregado, entrar, sair } = useTurnos()
  const pedidos = useSites((s) => s.pedidos)
  const aberto = turnoAberto(turnos, eu?.user_id ?? null)
  const hoje = useNumeros(eu?.user_id ?? '', inicioDeHoje())
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!eu) return null

  const agir = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const mes = new Date(inicioDeHoje()).toISOString().slice(0, 7)
  const numeros: [string, number][] = dev
    ? [
        ['Na fila', pedidos.filter((p) => p.status === 'fila').length],
        ['Fazendo agora', pedidos.filter((p) => p.status === 'fazendo' && p.dev === eu.user_id).length],
        ['Prontos no mês', pedidos.filter((p) => p.status === 'pronto' && p.dev === eu.user_id && (p.pronto_em ?? '') >= mes).length],
      ]
    : [
        ['Prospectados hoje', hoje.prospectados],
        ['Ligações hoje', hoje.ligacoes],
        ['Mensagens hoje', hoje.mensagens],
        ['Respostas hoje', hoje.respostas],
        ['Reuniões hoje', hoje.reunioes],
        ['Vendas hoje', hoje.vendas],
      ]

  return (
    <section className={clsx('panel overflow-hidden', aberto && 'ring-1 ring-go/30')}>
      <div className="flex flex-wrap items-center gap-4 px-5 py-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-3">
            {saudacao}, <span className="pv">{eu.nome || eu.usuario}</span>
          </p>
          {aberto ? (
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <span className="size-2 rounded-full bg-go" /> Em serviço há {formatarHoras(Date.now() - Date.parse(aberto.inicio))}
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold">Pronto para começar?</p>
          )}
          <p className="mt-0.5 text-xs text-fg-3">
            {aberto
              ? dev
                ? 'Pegue um site em “Sites para fazer”. Os leads e as conversas estão no menu.'
                : 'Seus leads, as conversas e o WhatsApp da equipe estão no menu.'
              : 'Entre em serviço para abrir o seu trabalho. O dono vê quem está trabalhando.'}
          </p>
        </div>
        {aberto ? (
          <Button variant="secondary" loading={busy} onClick={() => void agir(sair)}>
            Sair de serviço
          </Button>
        ) : (
          <Button variant="go" size="lg" loading={busy || !carregado} onClick={() => void agir(entrar)}>
            Entrar em serviço
          </Button>
        )}
      </div>
      <div className={clsx('grid border-t border-line-soft', dev ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6')}>
        {numeros.map(([rotulo, n]) => (
          <div key={rotulo} className="border-line-soft px-4 py-3 not-last:border-r">
            <p className="text-2xs text-fg-3">{rotulo}</p>
            <p className="num text-lg font-semibold">{n}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Dono: quem está trabalhando agora e quanto cada um fez hoje. */
function Agora() {
  const equipe = useAccount((s) => s.equipe)!
  const turnos = useTurnos((s) => s.turnos)
  const membros = equipe.membros.filter((m) => m.aceito)
  if (!membros.length) return null
  const emServico = membros.filter((m) => turnoAberto(turnos, m.id)).length
  return (
    <Card title="Equipe agora" description={`${emServico} de ${membros.length} em serviço. Clique em alguém para ver tudo o que a pessoa fez.`} bodyClass="px-0 py-0">
      <ul className="divide-y divide-line-soft">
        {membros.map((m) => (
          <LinhaAgora key={m.id} id={m.id} nome={m.nome ?? m.usuario ?? 'Sem nome'} papel={PAPEIS[m.papel]} />
        ))}
      </ul>
    </Card>
  )
}

function LinhaAgora({ id, nome, papel }: { id: string; nome: string; papel: string }) {
  const turnos = useTurnos((s) => s.turnos)
  const aberto = turnoAberto(turnos, id)
  const hoje = useNumeros(id, inicioDeHoje())
  const horas = tempoEmServico(turnos, id, inicioDeHoje())
  return (
    <li>
      <Link to={`/equipe/${id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs hover:bg-hover">
        <span className="flex min-w-[160px] flex-1 items-center gap-2">
          <span className={clsx('size-2 shrink-0 rounded-full', aberto ? 'bg-go' : 'bg-fg-4/40')} title={aberto ? 'Em serviço' : 'Fora de serviço'} />
          <span className="pv truncate text-[13px] font-medium text-fg">{nome}</span>
          <span className="text-2xs text-fg-4">{papel}</span>
        </span>
        <span className={aberto ? 'text-go' : 'text-fg-4'}>{aberto ? 'Em serviço' : 'Fora'} · {formatarHoras(horas)} hoje</span>
        <span className="num text-fg-2">
          {hoje.prospectados} prospectados · {hoje.ligacoes} ligações · {hoje.respostas} respostas
        </span>
      </Link>
    </li>
  )
}
