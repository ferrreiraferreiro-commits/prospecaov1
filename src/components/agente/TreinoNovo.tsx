// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, MessageSquareQuote, Sparkles, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag } from '../../lib/agente'
import { useApp } from '../../store/useApp'
import { Card, Field, NumberInput } from '../kit'
import { Button, Spinner } from '../ui'
import { ComoFunciona, Selo } from './Ajuda'
import { Chave, erroTexto, Texto, type AgenteCtx } from './comum'

type Tom = 'caloroso' | 'objetivo' | 'curto'
interface Cap {
  id: string
  nome: string
  descricao: string
  risco: 'le' | 'crm' | 'mensagem' | 'irreversivel'
  ligada: boolean
}
interface Pacote {
  id: string
  nome: string
  descricao: string
  total: number
  ligadas: number
  capacidades: Cap[]
}
interface Entrevista {
  mensagens: { de: 'xico' | 'voce'; texto: string }[]
  resultado: Record<string, unknown> | null
}
interface DadosTreino {
  persona: { nome: string; tom: Tom; regrasCasa: string }
  estiloResposta: { variasBolhas: boolean; maxBolha: number }
  pacotes: Pacote[]
  jaVemSabendo: string[]
  nuncaVaiFazer: string[]
  entrevista: Entrevista | null
}

const TONS: { id: Tom; nome: string; texto: string }[] = [
  { id: 'caloroso', nome: 'Próximo e caloroso', texto: 'Conversa como gente, puxa assunto, tranquiliza. Bom para quem vende no dia a dia.' },
  { id: 'objetivo', nome: 'Objetivo e cordial', texto: 'Vai direto ao ponto sem ser seco, e sempre indica o próximo passo.' },
  { id: 'curto', nome: 'Curto e prático', texto: 'Frases curtas, pergunta só o essencial e chama você cedo.' },
]

const RISCO: Record<Cap['risco'], { texto: string; tom: 'neutro' | 'azul' | 'ouro' | 'vermelho' }> = {
  le: { texto: 'só consulta', tom: 'neutro' },
  crm: { texto: 'muda o CRM', tom: 'azul' },
  mensagem: { texto: 'manda mensagem', tom: 'ouro' },
  irreversivel: { texto: 'não dá para desfazer', tom: 'vermelho' },
}

/** O treino novo: persona, entrevista, "copiar meu jeito" e as capacidades. */
export function TreinoNovo({ ctx, parte }: { ctx: AgenteCtx; parte?: 'entrevista' | 'jeito' | 'pode' }) {
  const [d, setD] = useState<DadosTreino | null>(null)
  const carregar = useCallback(() => ag<DadosTreino>('/treino', { timeoutMs: 10000 }).then(setD, () => setD(null)), [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!d)
    return (
      <div className="grid h-24 place-items-center">
        <Spinner />
      </div>
    )

  if (parte === 'entrevista') return <EntrevistaXico d={d.entrevista} onMudou={carregar} recarregarCtx={() => void ctx.recarregar()} />
  if (parte === 'jeito') return <Persona ctx={ctx} d={d} onSalvo={carregar} />
  if (parte === 'pode') return <Pode d={d} ctx={ctx} onMudou={setD} />

  return (
    <div className="space-y-4">
      <ComoFunciona
        id="treino"
        titulo="Como treinar o vendedor"
        passos={[
          <>Ele já vem sabendo vender: Método XS, as objeções mais comuns do Brasil e um roteiro para cada ramo.</>,
          <>O jeito mais rápido de ensinar o seu negócio é a <b>entrevista</b>: 10 minutos de perguntas e o treino sai pronto.</>,
          <>Escolha o jeito de falar e o que ele pode fazer. O que tem a etiqueta vermelha só liga uma a uma.</>,
          <>Depois, teste no <b>Laboratório</b> antes de deixar ele conversar com cliente de verdade.</>,
        ]}
      />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Persona ctx={ctx} d={d} onSalvo={carregar} />
        <EntrevistaXico d={d.entrevista} onMudou={carregar} recarregarCtx={() => void ctx.recarregar()} />
      </div>
      <Capacidades pacotes={d.pacotes} ctx={ctx} onMudou={(n) => setD(n)} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Ele já vem sabendo" description="O que está ligado agora.">
          <ul className="grid gap-1 text-xs text-fg-2 sm:grid-cols-2">
            {d.jaVemSabendo.map((t) => (
              <li key={t} className="flex gap-1.5">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-300" /> {t}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="E nunca vai fazer" description="Essas conferências acontecem antes de cada mensagem sair e não têm interruptor.">
          <ul className="space-y-1 text-xs text-fg-2">
            {d.nuncaVaiFazer.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/** O que ela pode fazer (cada um liga e desliga) e o que ela nunca faz. */
function Pode({ d, ctx, onMudou }: { d: DadosTreino; ctx: AgenteCtx; onMudou: (d: DadosTreino) => void }) {
  return (
    <div className="space-y-4">
      <Capacidades pacotes={d.pacotes} ctx={ctx} onMudou={onMudou} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Ela já vem sabendo" description="O que está ligado agora.">
          <ul className="grid gap-1 text-xs text-fg-2 sm:grid-cols-2">
            {d.jaVemSabendo.map((t) => (
              <li key={t} className="flex gap-1.5">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-300" /> {t}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="E nunca vai fazer" description="Ela confere isso antes de cada mensagem sair. Não dá para desligar.">
          <ul className="space-y-1 text-xs text-fg-2">
            {d.nuncaVaiFazer.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Persona({ ctx, d, onSalvo }: { ctx: AgenteCtx; d: DadosTreino; onSalvo: () => void }) {
  const [p, setP] = useState(d.persona)
  const [e, setE] = useState(d.estiloResposta)
  const [busy, setBusy] = useState(false)
  const [jeito, setJeito] = useState('')
  const [lendo, setLendo] = useState(false)
  const mudou = JSON.stringify([p, e]) !== JSON.stringify([d.persona, d.estiloResposta])

  async function salvar() {
    setBusy(true)
    if (await ctx.salvar({ persona: p, estiloResposta: e } as never, 'Persona salva.')) onSalvo()
    setBusy(false)
  }

  async function copiarJeito() {
    setLendo(true)
    try {
      const r = await ag<{ estilo: string; exemplos: string[] }>('/treino/meu-jeito', { method: 'POST', json: { mensagens: jeito }, timeoutMs: 60000 })
      if (window.confirm(`Este é o seu jeito de escrever:\n\n${r.estilo}\n\nUsar no vendedor?`)) await ctx.salvar({ negocio: { ...ctx.config.negocio, estilo: r.estilo } }, 'Ele vai escrever do seu jeito.')
    } catch (err) {
      useApp.getState().toast(erroTexto(err), 'error')
    } finally {
      setLendo(false)
    }
  }

  return (
    <Card
      title="Jeito de falar"
      description="Escolha como a IA conversa. O cliente nunca vê as configurações, só as mensagens."
      actions={
        <Button variant="primary" size="sm" loading={busy} disabled={!mudou} onClick={() => void salvar()}>
          Salvar
        </Button>
      }
      bodyClass="px-4 py-4 space-y-4"
    >
      <Field label="Apelido da IA (só você vê)">
        <input className="input" value={p.nome} onChange={(x) => setP({ ...p, nome: x.target.value })} placeholder="Atendente IA" />
      </Field>
      <div>
        <span className="label">Tom da conversa</span>
        <div className="space-y-1.5">
          {TONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setP({ ...p, tom: t.id })}
              className={clsx('flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors', p.tom === t.id ? 'border-gold/50 bg-gold/[0.06]' : 'border-line-soft hover:border-line')}
            >
              <span className={clsx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', p.tom === t.id ? 'border-gold bg-gold' : 'border-line-strong')}>{p.tom === t.id && <span className="size-1.5 rounded-full bg-ink" />}</span>
              <span>
                <span className="block text-[13px] font-medium text-fg">{t.nome}</span>
                <span className="block text-xs text-fg-3">{t.texto}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <Field label="As regras da casa (opcional)" hint='Ex.: "Nunca prometa desconto sem confirmar comigo." "Horário: 9h às 18h, de segunda a sexta."'>
        <Texto value={p.regrasCasa} onChange={(v) => setP({ ...p, regrasCasa: v })} rows={3} />
      </Field>
      <div className="rounded-lg border border-line-soft bg-ink p-3">
        <Chave ligado={e.variasBolhas} onChange={(v) => setE({ ...e, variasBolhas: v })} label="Responder em várias mensagens curtas (como uma pessoa digita)" />
        <div className="mt-2.5 flex items-center gap-2 text-xs text-fg-3">
          Tamanho máximo por bolha
          <NumberInput className="w-24" value={e.maxBolha} min={80} onChange={(v) => setE({ ...e, maxBolha: v ?? 600 })} />
          caracteres
        </div>
      </div>
      <div className="rounded-lg border border-line-soft p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
          <MessageSquareQuote className="size-3.5 text-blue-300" /> Copiar meu jeito
        </p>
        <p className="mt-0.5 text-xs text-fg-3">Ele lê as mensagens que você já mandou pela XS e descreve o seu estilo. Pode colar mais algumas aqui, uma por linha.</p>
        <Texto value={jeito} onChange={setJeito} rows={2} placeholder="Opa, tudo certo? Te mando o orçamento ainda hoje" />
        <Button className="mt-2" size="sm" icon={<Wand2 className="size-3.5" />} loading={lendo} onClick={() => void copiarJeito()}>
          Descrever meu jeito
        </Button>
      </div>
    </Card>
  )
}

function EntrevistaXico({ d, onMudou, recarregarCtx }: { d: Entrevista | null; onMudou: () => void; recarregarCtx: () => void }) {
  const toast = useApp((s) => s.toast)
  const [resp, setResp] = useState('')
  const [busy, setBusy] = useState(false)

  async function chamar(caminho: string, json?: unknown, aviso?: string) {
    setBusy(true)
    try {
      await ag(caminho, { method: 'POST', json: json ?? {}, timeoutMs: 90000 })
      setResp('')
      if (aviso) toast(aviso)
      onMudou()
      recarregarCtx()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-gold" /> Entrevista de treino
        </span>
      }
      description="Jeito mais fácil: responda umas 10 perguntas, por escrito, e a XS preenche tudo para você (o que vende, preços, jeito de falar). Depois é só conferir."
      actions={d?.mensagens.length ? <Button size="xs" variant="ghost" onClick={() => void chamar('/treino/entrevista/recomecar')}>Recomeçar</Button> : undefined}
      bodyClass="px-4 py-4 space-y-3"
    >
      {d?.mensagens.length ? (
        <div className="max-h-[340px] space-y-2 overflow-y-auto rounded-lg border border-line-soft bg-ink p-3">
          {d.mensagens.map((m, i) => (
            <div key={i} className={clsx('max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap', m.de === 'xico' ? 'bg-raised text-fg ring-1 ring-line' : 'ml-auto bg-emerald-500/15 text-fg ring-1 ring-emerald-500/25')}>
              {m.texto}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-3">Leva uns 10 minutos. Você pode parar quando quiser e terminar com o que já respondeu.</p>
      )}
      {d?.resultado ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
          <p className="text-[13px] font-medium text-emerald-200">Pronto! O treino está montado.</p>
          <p className="mt-0.5 text-xs text-fg-3">Aplicar preenche "Seu negócio", a persona e o material. Guardo uma versão antes, para você poder voltar.</p>
          <Button className="mt-2" variant="go" size="sm" loading={busy} onClick={() => void chamar('/treino/entrevista/aplicar', {}, 'Treino aplicado.')}>
            Aplicar no treino
          </Button>
        </div>
      ) : (
        <>
          {d && <Texto value={resp} onChange={setResp} rows={3} placeholder="Sua resposta" />}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" loading={busy} disabled={!!d && !resp.trim()} onClick={() => void chamar('/treino/entrevista', { resposta: resp })}>
              {d ? 'Responder' : 'Começar a entrevista'}
            </Button>
            {d && d.mensagens.length > 2 && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void chamar('/treino/entrevista', { resposta: resp, encerrar: true })}>
                Terminar agora
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function Capacidades({ pacotes, ctx, onMudou }: { pacotes: Pacote[]; ctx: AgenteCtx; onMudou: (d: DadosTreino) => void }) {
  const toast = useApp((s) => s.toast)
  const [avancado, setAvancado] = useState(false)

  async function pacote(id: string, ligado: boolean) {
    try {
      onMudou(await ag<DadosTreino>('/treino/pacote', { method: 'POST', json: { pacote: id, ligado } }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  async function uma(id: string, ligado: boolean) {
    const c = await ctx.salvar({ capacidades: { ...(ctx.config as { capacidades?: Record<string, boolean> }).capacidades, [id]: ligado } } as never, '')
    if (c) onMudou(await ag<DadosTreino>('/treino'))
  }

  return (
    <Card
      title="O que ele pode fazer"
      description="Pacotes ligam várias capacidades de uma vez. As marcadas como “não dá para desfazer” só ligam uma a uma."
      actions={
        <Button size="xs" variant="ghost" onClick={() => setAvancado(!avancado)}>
          {avancado ? 'Ver só os pacotes' : 'Escolher uma a uma (modo avançado)'}
        </Button>
      }
      bodyClass="divide-y divide-line-soft"
    >
      {pacotes.map((p) => {
        const irreversiveis = p.capacidades.filter((x) => x.risco === 'irreversivel')
        return (
          <div key={p.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Chave ligado={p.ligadas > 0 && p.ligadas >= p.total - irreversiveis.filter((x) => !x.ligada).length} onChange={(v) => void pacote(p.id, v)} />
              <span className="text-[13px] font-medium text-fg">{p.nome}</span>
              <Selo tom={p.ligadas === p.total ? 'verde' : p.ligadas ? 'ouro' : 'neutro'}>{p.ligadas === p.total ? 'completo' : p.ligadas ? 'parcial' : 'desligado'}</Selo>
            </div>
            <p className="mt-1 text-xs text-fg-3">{p.descricao}</p>
            <p className="mt-0.5 text-2xs text-fg-4">
              {p.ligadas} de {p.total} capacidades ligadas
            </p>
            {(avancado || irreversiveis.length > 0) && (
              <div className={clsx('mt-2.5 space-y-2 rounded-lg border border-line-soft p-3', !avancado && 'bg-ink')}>
                {!avancado && <p className="text-2xs font-medium text-fg-3">Só ligando uma a uma — o pacote não liga por você:</p>}
                {(avancado ? p.capacidades : irreversiveis).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-gold,#e0a84a)]" checked={c.ligada} onChange={(x) => void uma(c.id, x.target.checked)} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg">
                        {c.nome} <Selo tom={RISCO[c.risco].tom}>{RISCO[c.risco].texto}</Selo>
                      </span>
                      <span className="block text-xs text-fg-3">{c.descricao}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}
