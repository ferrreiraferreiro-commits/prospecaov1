// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import {
  AlarmClock,
  BadgeDollarSign,
  CalendarCheck,
  Check,
  CircleAlert,
  Flame,
  GraduationCap,
  Hand,
  MessageCircle,
  Search,
  Send,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ag, type Atividade, type EstadoAgente } from '../../lib/agente'
import { formatRelative, timeHM } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card, Stat } from '../kit'
import { Button } from '../ui'
import { erroTexto, usd, type AgenteCtx } from './comum'

const ICONE: Record<Atividade['tipo'], { icon: typeof Send; cls: string }> = {
  abordou: { icon: Send, cls: 'text-blue-300' },
  respondeu: { icon: MessageCircle, cls: 'text-fg-2' },
  followup: { icon: AlarmClock, cls: 'text-fg-2' },
  quente: { icon: Flame, cls: 'text-amber-300' },
  reuniao: { icon: CalendarCheck, cls: 'text-emerald-300' },
  venda: { icon: BadgeDollarSign, cls: 'text-emerald-300' },
  humano: { icon: Hand, cls: 'text-red-300' },
  optout: { icon: X, cls: 'text-fg-3' },
  busca: { icon: Search, cls: 'text-fg-2' },
  aviso: { icon: CircleAlert, cls: 'text-fg-3' },
  erro: { icon: ShieldAlert, cls: 'text-red-300' },
  licao: { icon: GraduationCap, cls: 'text-blue-300' },
}

/** O que falta para ligar o agente. */
export function passos(e: EstadoAgente, c: AgenteCtx['config']) {
  return [
    { ok: e.temChave, texto: 'Colar a chave da IA (a do Google é grátis)', aba: 'conectar' },
    { ok: e.whatsapp === 'connected', texto: 'Conectar o seu WhatsApp (QR Code)', link: '/whatsapp' },
    { ok: !!c.negocio.seuNome.trim() && !!c.negocio.oferta.trim(), texto: 'Contar seu nome e o que você vende', aba: 'voce' },
    { ok: !!c.negocio.estilo.trim(), texto: 'Ensinar o seu jeito de falar', aba: 'jeito', opcional: true },
    { ok: !!e.materiais, texto: 'Colocar preços e perguntas frequentes no Material', aba: 'material', opcional: true },
    { ok: !!c.avisos.telefone, texto: 'Informar um outro número seu, para receber os avisos', aba: 'ajustes', opcional: true },
  ]
}

export function Painel({ ctx, irPara, abrirConversa }: { ctx: AgenteCtx; irPara: (aba: string) => void; abrirConversa: (id: string) => void }) {
  const { estado: e, config: c } = ctx
  const [atividade, setAtividade] = useState<Atividade[]>([])
  const [retomando, setRetomando] = useState(false)

  useEffect(() => {
    let vivo = true
    const carregar = () => ag<Atividade[]>('/atividade', { timeoutMs: 10000 }).then((a) => vivo && setAtividade(a), () => undefined)
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 15_000)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])

  async function retomar() {
    setRetomando(true)
    try {
      ctx.setEstado(await ag<EstadoAgente>('/retomar', { method: 'POST' }))
      useApp.getState().toast('Agente retomado.')
    } catch (err) {
      useApp.getState().toast(erroTexto(err), 'error')
    } finally {
      setRetomando(false)
    }
  }

  const lista = passos(e, c)
  const falta = lista.filter((p) => !p.ok && !p.opcional)
  const precisam = (e.contagem.humano ?? 0) + (e.contagem.quente ?? 0)

  return (
    <div className="space-y-4">
      {e.pausadoPorRisco && (
        <Alerta tom="bad" titulo="Agente pausado por segurança" acao={<Button size="sm" variant="secondary" loading={retomando} onClick={() => void retomar()}>Retomar</Button>}>
          O WhatsApp desconectou de um jeito suspeito em {formatRelative(e.pausadoPorRisco)}. Confira se o número está funcionando no celular antes de retomar. O ritmo de abordagens voltou ao começo para proteger o número.
        </Alerta>
      )}
      {e.chaveRecusada && (
        <Alerta tom="bad" titulo="A IA parou" acao={<Button size="sm" variant="secondary" onClick={() => irPara('conectar')}>Ver chave</Button>}>
          {e.ultimoErro ?? 'A chave da API foi recusada ou acabou o crédito.'}
        </Alerta>
      )}
      {e.ativo && e.whatsapp !== 'connected' && (
        <Alerta tom="gold" titulo="WhatsApp desconectado" acao={<Link to="/whatsapp" className="text-xs font-medium text-blue-300 hover:underline">Conectar</Link>}>
          O agente está ligado, mas só trabalha com o WhatsApp conectado.
        </Alerta>
      )}
      {e.hoje.custoUSD >= c.limiteDiaUSD && (
        <Alerta tom="gold" titulo="Limite de gasto de hoje atingido" acao={<Button size="sm" variant="secondary" onClick={() => irPara('ajustes')}>Ajustar</Button>}>
          O agente gastou {usd(e.hoje.custoUSD)} hoje (limite {usd(c.limiteDiaUSD)}) e volta amanhã.
        </Alerta>
      )}

      {(falta.length > 0 || !e.ativo) && (
        <Card title="O que falta" description="Faça uma vez. Os passos estão em Começar, na ordem.">
          <ol className="space-y-1.5">
            {lista.map((p, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13px]">
                <span className={clsx('grid size-5 shrink-0 place-items-center rounded-full text-2xs font-semibold', p.ok ? 'bg-go text-[#04140c]' : 'bg-tint/[0.06] text-fg-3')}>
                  {p.ok ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={clsx(p.ok ? 'text-fg-3 line-through' : 'text-fg')}>{p.texto}</span>
                {p.opcional && !p.ok && <span className="text-2xs text-fg-4">(opcional)</span>}
                {!p.ok &&
                  (p.link ? (
                    <Link to={p.link} className="ml-auto text-xs font-medium text-blue-300 hover:underline">
                      Abrir
                    </Link>
                  ) : (
                    <button type="button" onClick={() => irPara(p.aba!)} className="ml-auto text-xs font-medium text-blue-300 hover:underline">
                      Abrir
                    </button>
                  ))}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-2xs text-fg-4">Antes de ligar, teste em Começar → Testar e ligar: converse com a IA fingindo ser um cliente e corrija o que não gostar.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Abordadas hoje" value={`${e.hoje.abordados}/${e.cotaHoje}`} hint={c.prospeccao.ativa ? (e.proximaAbordagem ? `próxima às ${timeHM(new Date(e.proximaAbordagem))}` : `${e.fila} na fila`) : 'prospecção desligada'} icon={<Send />} />
        <Stat label="Responderam" value={e.hoje.responderam} icon={<MessageCircle />} tone="blue" />
        <Stat label="Quentes" value={e.hoje.quentes} icon={<Flame />} tone="gold" />
        <Stat label="Reuniões" value={e.hoje.reunioes} icon={<CalendarCheck />} tone="go" />
        <Stat label="Vendas" value={e.hoje.vendas} hint={`${e.mes.vendas} no mês`} icon={<BadgeDollarSign />} tone="go" />
        <Stat label="Gasto com IA hoje" value={usd(e.hoje.custoUSD)} hint={`${usd(e.mes.custoUSD)} no mês`} icon={<Wallet />} />
      </div>

      {precisam > 0 && (
        <button type="button" onClick={() => irPara('conversas')} className="panel flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
          <Hand className="size-4 text-red-300" />
          <span className="text-[13px] text-fg">
            {e.contagem.humano ? `${e.contagem.humano} conversa(s) esperando você` : ''}
            {e.contagem.humano && e.contagem.quente ? ' · ' : ''}
            {e.contagem.quente ? `${e.contagem.quente} lead(s) quente(s)` : ''}
          </span>
          <span className="ml-auto text-xs font-medium text-blue-300">Ver conversas</span>
        </button>
      )}

      <Card title="O que a IA fez" description="Atualiza sozinho." bodyClass="px-2 py-1.5">
        {atividade.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-3">Nada ainda. Quando você ligar a IA, tudo o que ela fizer aparece aqui.</p>
        ) : (
          <ul className="max-h-[480px] divide-y divide-line-soft overflow-y-auto">
            {atividade.map((a, i) => {
              const I = ICONE[a.tipo] ?? ICONE.aviso
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!a.conversa}
                    onClick={() => a.conversa && abrirConversa(a.conversa)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left enabled:hover:bg-hover"
                  >
                    <I.icon className={clsx('mt-0.5 size-3.5 shrink-0', I.cls)} />
                    <span className="min-w-0 flex-1 text-[13px] leading-5 text-fg-2">{a.texto}</span>
                    <span className="shrink-0 text-2xs text-fg-4">{formatRelative(a.em)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Alerta({ tom, titulo, children, acao }: { tom: 'bad' | 'gold'; titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className={clsx('flex flex-wrap items-start gap-3 rounded-[10px] border px-4 py-3', tom === 'bad' ? 'border-bad/30 bg-bad/[0.07]' : 'border-amber-400/30 bg-amber-400/[0.06]')}>
      <ShieldAlert className={clsx('mt-0.5 size-4 shrink-0', tom === 'bad' ? 'text-red-300' : 'text-amber-300')} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fg">{titulo}</p>
        <p className="mt-0.5 text-xs text-fg-2">{children}</p>
      </div>
      {acao}
    </div>
  )
}
