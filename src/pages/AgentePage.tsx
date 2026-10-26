// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Bot, Check, OctagonX, Power } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Agenda } from '../components/agente/Agenda'
import { Ajustes } from '../components/agente/Ajustes'
import { Base } from '../components/agente/Base'
import { Caderno } from '../components/agente/Caderno'
import { Laboratorio } from '../components/agente/Laboratorio'
import { Prospeccao } from '../components/agente/Prospeccao'
import { TreinoNovo } from '../components/agente/TreinoNovo'
import { erroTexto, useAgente, type AgenteCtx } from '../components/agente/comum'
import { Conversas } from '../components/agente/Conversas'
import { Painel } from '../components/agente/Painel'
import { PrecisaDeVoce } from '../components/agente/PrecisaDeVoce'
import { Seguranca } from '../components/agente/Seguranca'
import { Treino } from '../components/agente/Treino'
import { ag, type EstadoAgente } from '../lib/agente'
import { useHasIA } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Spinner } from '../components/ui'

type Grupo = 'comecar' | 'dia' | 'mais'
type Aba = 'conectar' | 'voce' | 'jeito' | 'material' | 'testar' | 'inicio' | 'precisa' | 'conversas' | 'agenda' | 'pode' | 'licoes' | 'seguranca' | 'prospeccao' | 'ajustes'

interface Item {
  id: Aba
  label: string
  /** Uma frase simples: o que tem aqui */
  oQue: string
}

const GRUPOS: { id: Grupo; label: string; itens: Item[] }[] = [
  {
    id: 'comecar',
    label: 'Começar',
    itens: [
      { id: 'conectar', label: 'Conectar', oQue: 'Cole a chave da IA e confira se o seu WhatsApp está conectado. Sem isso, ela não funciona.' },
      { id: 'voce', label: 'Sobre você', oQue: 'Conte quem você é e o que você vende. É daqui que a IA tira o que falar.' },
      { id: 'jeito', label: 'Jeito de falar', oQue: 'Escolha se a IA fala mais animada, mais direta ou mais curta, e ensine o seu jeito de escrever.' },
      { id: 'material', label: 'Material', oQue: 'Coloque preços, perguntas frequentes e textos que a IA pode consultar. Opcional, mas ajuda muito.' },
      { id: 'testar', label: 'Testar e ligar', oQue: 'Converse com a IA fingindo ser um cliente. Gostou? Ligue e ela começa a responder de verdade.' },
    ],
  },
  {
    id: 'dia',
    label: 'Dia a dia',
    itens: [
      { id: 'inicio', label: 'Resumo', oQue: 'O que a IA fez hoje e os números do dia.' },
      { id: 'precisa', label: 'Precisa de você', oQue: 'Mensagens que a IA não mandou sozinha. Você aprova, muda ou descarta.' },
      { id: 'conversas', label: 'Conversas', oQue: 'Todas as conversas da IA. Você pode assumir qualquer uma quando quiser.' },
      { id: 'agenda', label: 'Agenda', oQue: 'Horários que a IA marcou com clientes para você.' },
    ],
  },
  {
    id: 'mais',
    label: 'Mais opções',
    itens: [
      { id: 'ajustes', label: 'Horários e gastos', oQue: 'Que horas ela responde, qual IA usa, quanto pode gastar por dia e onde te avisar.' },
      { id: 'pode', label: 'O que ela pode fazer', oQue: 'Ligue ou desligue o que a IA pode fazer sozinha (passar preço, marcar horário, mandar Pix…).' },
      { id: 'licoes', label: 'Lições', oQue: 'Regras que a IA aprendeu com as suas correções. Dá para editar ou apagar.' },
      { id: 'seguranca', label: 'Segurança', oQue: 'O quanto a IA faz sozinha e as conferências que acontecem antes de cada mensagem.' },
      { id: 'prospeccao', label: 'Prospecção', oQue: 'Se quiser, a IA também chama empresas novas sozinha, nas cidades e ramos que você escolher.' },
    ],
  },
]

const TODOS = GRUPOS.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.id })))
const PASSOS = GRUPOS[0].itens

/** Nomes antigos das abas (links e botões que ainda usam) → abas novas */
const ANTIGAS: Record<string, Aba> = { painel: 'inicio', treino: 'voce', base: 'material', laboratorio: 'testar', caderno: 'licoes' }
const abaDe = (v: string | null): Aba | null => (v ? (ANTIGAS[v] ?? (TODOS.some((t) => t.id === v) ? (v as Aba) : null)) : null)

/** Cada passo do começo está feito? */
function feitos(ctx: AgenteCtx): Record<string, boolean> {
  const { estado: e, config: c } = ctx
  return {
    conectar: e.temChave && !e.chaveRecusada && e.whatsapp === 'connected',
    voce: !!c.negocio.seuNome.trim() && !!c.negocio.oferta.trim(),
    jeito: !!c.negocio.estilo.trim(),
    material: !!e.materiais,
    testar: e.ativo,
  }
}

/**
 * IA no WhatsApp. Ela roda sozinha no servidor da XS (no WhatsApp de cada conta). A tela é um passo a passo:
 * Começar (5 passos, na ordem), Dia a dia (acompanhar) e Mais opções (ajustes finos).
 */
export function AgentePage() {
  const temIA = useHasIA()
  if (!temIA)
    return (
      <div className="space-y-4">
        <PageHeader title="IA no WhatsApp" />
        <Empty icon={<Bot />} title="A IA ainda não está liberada na sua conta">
          Ela chega em breve. Quando for liberada, aparece aqui no menu.
        </Empty>
      </div>
    )
  return <AgenteLiberado />
}

function AgenteLiberado() {
  const dados = useAgente()
  const [params, setParams] = useSearchParams()
  const conversa = params.get('conversa')
  const [ligando, setLigando] = useState(false)

  const ir = (proxima: string, extra: Record<string, string> = {}) => setParams({ aba: abaDe(proxima) ?? proxima, ...extra }, { replace: false })

  if (!dados.estado || !dados.config) {
    return (
      <div className="space-y-4">
        <PageHeader title="IA no WhatsApp" />
        {dados.erro ? (
          <Empty icon={<Bot />} title="A IA não respondeu agora">
            {dados.erro}
          </Empty>
        ) : (
          <div className="grid h-60 place-items-center">
            <Spinner />
          </div>
        )}
      </div>
    )
  }

  const ctx = dados as AgenteCtx
  const { estado: e } = ctx
  const feito = feitos(ctx)
  // Sem a parte obrigatória pronta, abre no primeiro passo que falta; depois, no Resumo
  const padrao: Aba = !feito.conectar ? 'conectar' : !feito.voce ? 'voce' : 'inicio'
  const aba = abaDe(params.get('aba')) ?? padrao
  const atual = TODOS.find((t) => t.id === aba)!
  const grupo = GRUPOS.find((g) => g.id === atual.grupo)!
  const passo = PASSOS.findIndex((p) => p.id === aba)

  // Parar tudo é na hora (nada sai até você ligar de novo); ligar volta a trabalhar
  async function alternar() {
    if (!e.ativo && !feito.conectar) {
      useApp.getState().toast('Antes de ligar, faça o passo 1: cole a chave e conecte o WhatsApp.', 'error')
      ir('conectar')
      return
    }
    setLigando(true)
    try {
      ctx.setEstado(await ag<EstadoAgente>(e.ativo ? '/parar' : '/voltar', { method: 'POST' }))
      useApp.getState().toast(e.ativo ? 'Parei tudo. Nada sai até você ligar de novo.' : 'IA ligada. Ela já começa a responder.')
      void ctx.recarregar()
    } catch (err) {
      useApp.getState().toast(erroTexto(err), 'error')
    } finally {
      setLigando(false)
    }
  }

  const trabalhando = e.ativo && e.whatsapp === 'connected' && !e.pausadoPorRisco && !e.chaveRecusada
  const contador = (id: Aba) => (id === 'conversas' ? e.contagem.humano : id === 'precisa' ? e.pendencias : 0) || 0

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            IA no WhatsApp
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset', trabalhando ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-tint/[0.04] text-fg-3 ring-line')}>
              <span className={clsx('size-1.5 rounded-full', trabalhando ? 'animate-pulse bg-go' : 'bg-fg-4')} />
              {trabalhando ? 'Respondendo' : e.ativo ? 'Ligada, parada' : 'Desligada'}
            </span>
          </span>
        }
        subtitle="Ela responde pelo seu WhatsApp como se fosse você, com o seu nome e o seu jeito. Siga os passos de Começar na ordem."
        actions={
          <Button variant={e.ativo ? 'danger' : 'go'} icon={e.ativo ? <OctagonX className="size-3.5" /> : <Power className="size-3.5" />} loading={ligando} onClick={() => void alternar()}>
            {e.ativo ? 'Parar tudo' : 'Ligar a IA'}
          </Button>
        }
      />

      {/* As três partes da tela */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line-soft bg-ink p-1">
        {GRUPOS.map((g) => {
          const soma = g.itens.reduce((s, i) => s + contador(i.id), 0)
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => ir(g.id === grupo.id ? aba : g.id === 'comecar' ? (PASSOS.find((p) => !feito[p.id])?.id ?? 'conectar') : g.itens[0].id)}
              className={clsx('rounded-md px-2 py-2 text-[13px] font-medium transition-colors', g.id === grupo.id ? 'bg-raised text-fg ring-1 ring-line' : 'text-fg-3 hover:text-fg')}
            >
              {g.label}
              {soma > 0 && <span className="num ml-1.5 rounded-full bg-red-500/15 px-1.5 text-2xs text-red-300">{soma}</span>}
            </button>
          )
        })}
      </div>

      {/* As abas da parte escolhida: no Começar, numeradas e com ✓ */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {grupo.itens.map((it, i) => {
          const ativo = it.id === aba
          const ok = grupo.id === 'comecar' && feito[it.id]
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => ir(it.id)}
              className={clsx(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                ativo ? 'border-gold/50 bg-gold/[0.07] text-fg' : 'border-line-soft text-fg-3 hover:border-line hover:text-fg',
              )}
            >
              {grupo.id === 'comecar' && (
                <span className={clsx('num grid size-5 place-items-center rounded-full text-[10px] font-semibold', ok ? 'bg-go text-[#04140c]' : ativo ? 'bg-gold text-ink' : 'bg-tint/[0.06] text-fg-3')}>
                  {ok ? <Check className="size-3" /> : i + 1}
                </span>
              )}
              {it.label}
              {contador(it.id) > 0 && <span className="num rounded-full bg-red-500/15 px-1.5 text-2xs text-red-300">{contador(it.id)}</span>}
            </button>
          )
        })}
      </div>

      {/* O que é esta aba, em uma frase */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] px-4 py-2.5 text-xs text-fg-2">
        {passo >= 0 && <span className="mr-1.5 font-semibold text-blue-200">Passo {passo + 1} de {PASSOS.length}:</span>}
        {atual.oQue}
      </div>

      {aba === 'conectar' && (
        <div className="space-y-4">
          <Ajustes ctx={ctx} parte="chave" />
          <WhatsAppCard conectado={e.whatsapp === 'connected'} />
        </div>
      )}
      {aba === 'voce' && (
        <div className="space-y-4">
          <TreinoNovo ctx={ctx} parte="entrevista" />
          <Treino ctx={ctx} parte="negocio" />
        </div>
      )}
      {aba === 'jeito' && <TreinoNovo ctx={ctx} parte="jeito" />}
      {aba === 'material' && <Base />}
      {aba === 'testar' && (
        <div className="space-y-4">
          <Treino ctx={ctx} parte="testar" />
          <LigarCard ctx={ctx} feito={feito} ligando={ligando} onLigar={() => void alternar()} irPara={ir} />
          <details className="panel px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-fg">Prova automática (Laboratório)</summary>
            <p className="mt-1 mb-3 text-xs text-fg-3">A XS inventa vários clientes, conversa com a IA e dá uma nota. Bom para conferir depois de mudar alguma coisa.</p>
            <Laboratorio />
          </details>
        </div>
      )}

      {aba === 'inicio' && <Painel ctx={ctx} irPara={(a) => ir(a)} abrirConversa={(id) => ir('conversas', { conversa: id })} />}
      {aba === 'precisa' && <PrecisaDeVoce onMudou={() => void ctx.recarregar()} abrirConversa={(id) => ir('conversas', { conversa: id })} />}
      {aba === 'conversas' && <Conversas abrir={conversa} setAbrir={(id) => ir('conversas', id ? { conversa: id } : {})} />}
      {aba === 'agenda' && <Agenda ctx={ctx} />}

      {aba === 'ajustes' && <Ajustes ctx={ctx} parte="funcionamento" />}
      {aba === 'pode' && <TreinoNovo ctx={ctx} parte="pode" />}
      {aba === 'licoes' && (
        <div className="space-y-4">
          <Treino ctx={ctx} parte="licoes" />
          <Caderno />
        </div>
      )}
      {aba === 'seguranca' && <Seguranca ctx={ctx} />}
      {aba === 'prospeccao' && <Prospeccao ctx={ctx} />}

      {/* Voltar / próximo passo, só no Começar */}
      {passo >= 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-4">
          {passo > 0 ? (
            <Button icon={<ArrowLeft className="size-3.5" />} onClick={() => ir(PASSOS[passo - 1].id)}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          {passo < PASSOS.length - 1 ? (
            <Button variant="primary" onClick={() => ir(PASSOS[passo + 1].id)}>
              Próximo passo: {PASSOS[passo + 1].label} <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => ir('inicio')}>
              Ir para o Dia a dia <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Cartao({ ok, titulo, children }: { ok: boolean; titulo: string; children: ReactNode }) {
  return (
    <div className={clsx('panel flex items-start gap-3 px-4 py-3', ok && 'border-emerald-500/25')}>
      <span className={clsx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', ok ? 'bg-go text-[#04140c]' : 'bg-tint/[0.06] text-fg-3')}>{ok ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fg">{titulo}</p>
        <div className="mt-0.5 text-xs text-fg-3">{children}</div>
      </div>
    </div>
  )
}

function WhatsAppCard({ conectado }: { conectado: boolean }) {
  return (
    <Cartao ok={conectado} titulo={conectado ? 'Seu WhatsApp está conectado' : 'Conecte o seu WhatsApp'}>
      {conectado ? (
        'É por ele que a IA vai mandar as mensagens.'
      ) : (
        <>
          A IA manda as mensagens pelo seu WhatsApp. Abra a tela{' '}
          <Link to="/whatsapp" className="font-medium text-blue-300 hover:underline">
            Conexão
          </Link>
          , leia o QR Code com o celular e volte aqui.
        </>
      )}
    </Cartao>
  )
}

/** O fim do passo a passo: o que falta e o botão de ligar. */
function LigarCard({ ctx, feito, ligando, onLigar, irPara }: { ctx: AgenteCtx; feito: Record<string, boolean>; ligando: boolean; onLigar: () => void; irPara: (aba: string) => void }) {
  const faltam = PASSOS.filter((p) => p.id !== 'testar' && !feito[p.id] && (p.id === 'conectar' || p.id === 'voce'))
  if (ctx.estado.ativo)
    return (
      <Cartao ok titulo="A IA está ligada">
        Ela já responde pelo seu WhatsApp. Acompanhe tudo em Dia a dia → Resumo. Para parar, use o botão vermelho “Parar tudo” lá em cima.
      </Cartao>
    )
  return (
    <Cartao ok={false} titulo={faltam.length ? 'Falta pouco para ligar' : 'Tudo pronto para ligar'}>
      {faltam.length ? (
        <p>
          Antes, termine:{' '}
          {faltam.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <button type="button" onClick={() => irPara(p.id)} className="font-medium text-blue-300 hover:underline">
                passo {PASSOS.indexOf(p) + 1} ({p.label})
              </button>
            </span>
          ))}
          .
        </p>
      ) : (
        <>
          <p>Testou e gostou? Ligue e a IA começa a responder quem te chamar no WhatsApp.</p>
          <Button className="mt-2" variant="go" icon={<Power className="size-3.5" />} loading={ligando} onClick={onLigar}>
            Ligar a IA
          </Button>
        </>
      )}
    </Cartao>
  )
}
