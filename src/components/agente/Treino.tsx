// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { GraduationCap, Plus, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ACAO, ag, type AgenteConfig, type Licao, type RespostaSimulada } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card, Field, NumberInput, Pill, PILL } from '../kit'
import { Button, Segmented } from '../ui'
import { Avaliacao, Bolha, Chave, erroTexto, LICAO_NOVA, Texto, type AgenteCtx } from './comum'

const EXEMPLO_OFERTA = `Exemplo:
Site Essencial – R$ 900: 1 página com tudo da empresa, botão de WhatsApp, mapa, aparece no Google. Pronto em 5 dias.
Site Completo – R$ 1.500: até 5 páginas, galeria de fotos, formulário, Google Meu Negócio configurado. Pronto em 10 dias.
Hospedagem e domínio: R$ 49/mês (primeiro mês grátis).
Manutenção e alterações: inclusas no plano mensal.`

const EXEMPLO_OBJECOES = `Exemplo:
"Já tenho Instagram" → O Instagram é ótimo para quem já te segue; o site é o que aparece para quem procura no Google e ainda não te conhece.
"Tá caro" → Dá para começar pelo Essencial e parcelar. Um cliente novo por mês já paga o site.
"Vou pensar" → Claro! Posso te mandar um exemplo de site do seu ramo para você ver?`

export function Treino({ ctx }: { ctx: AgenteCtx }) {
  return (
    <div className="space-y-4">
      <Negocio ctx={ctx} />
      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Simulador />
        <Licoes />
      </div>
    </div>
  )
}

function Negocio({ ctx }: { ctx: AgenteCtx }) {
  const [n, setN] = useState(ctx.config.negocio)
  const [podeFechar, setPodeFechar] = useState(ctx.config.podeFechar)
  const [busy, setBusy] = useState(false)
  const mudou = JSON.stringify(n) !== JSON.stringify(ctx.config.negocio) || podeFechar !== ctx.config.podeFechar
  const set = <K extends keyof AgenteConfig['negocio']>(k: K, v: AgenteConfig['negocio'][K]) => setN((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setBusy(true)
    const c = await ctx.salvar({ negocio: n, podeFechar }, 'Treino salvo. O agente já usa a partir da próxima mensagem.')
    if (c) {
      setN(c.negocio)
      setPodeFechar(c.podeFechar)
    }
    setBusy(false)
  }

  return (
    <Card
      title="Seu negócio"
      description="Tudo o que o agente sabe sobre o que você vende sai daqui. Escreva do seu jeito, como explicaria para um vendedor novo."
      actions={
        <Button variant="primary" size="sm" loading={busy} disabled={!mudou} onClick={() => void salvar()}>
          Salvar treino
        </Button>
      }
      bodyClass="px-4 py-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Seu nome">
          <input className="input" value={n.seuNome} onChange={(e) => set('seuNome', e.target.value)} placeholder="Gabriel" />
        </Field>
        <Field label="Nome da empresa">
          <input className="input" value={n.empresa} onChange={(e) => set('empresa', e.target.value)} placeholder="XS Sites" />
        </Field>
        <Field label="Como ele se apresenta" className="md:col-span-2" hint="Ele sempre diz a verdade se perguntarem se é robô: que é o assistente virtual e pode chamar você.">
          <input className="input" value={n.apresentacao} onChange={(e) => set('apresentacao', e.target.value)} placeholder={`Sou assistente do ${n.seuNome || 'Gabriel'}, da ${n.empresa || 'XS Sites'}. A gente cria sites para negócios da cidade.`} />
        </Field>
        <Field label="O que você vende: pacotes, preços, o que inclui, prazo" className="md:col-span-2">
          <Texto value={n.oferta} onChange={(v) => set('oferta', v)} rows={6} placeholder={EXEMPLO_OFERTA} />
        </Field>
        <Field label="Pagamento" hint="Chave Pix, entrada, parcelamento… Ele só manda quando o cliente topar.">
          <Texto value={n.pagamento} onChange={(v) => set('pagamento', v)} rows={3} placeholder="Pix: 43 99999-9999 (Gabriel). 50% para começar e 50% na entrega." />
        </Field>
        <Field label="Sites que você já fez (portfólio)" hint="Links que ele pode mandar como exemplo.">
          <Texto value={n.portfolio} onChange={(v) => set('portfolio', v)} rows={3} placeholder={'Pizzaria: https://…\nBarbearia: https://…'} />
        </Field>
        <Field label="Objeções que você mais ouve e como responde" className="md:col-span-2">
          <Texto value={n.objecoes} onChange={(v) => set('objecoes', v)} rows={5} placeholder={EXEMPLO_OBJECOES} />
        </Field>
        <Field label="Seu jeito de falar" hint='Ex.: "Informal, chamo de você, uso “show”, “top”. Sem textão."'>
          <Texto value={n.estilo} onChange={(v) => set('estilo', v)} rows={3} />
        </Field>
        <Field label="Regras extras" hint='Ex.: "Nunca prometa ficar em 1º no Google." "Não atende fora do Paraná."'>
          <Texto value={n.regras} onChange={(v) => set('regras', v)} rows={3} />
        </Field>
      </div>
      <div className="mt-4 grid gap-3 rounded-lg border border-line-soft bg-ink p-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[13px] font-medium text-fg">Pode fechar a venda sozinho?</p>
          <p className="text-xs text-fg-3">
            {podeFechar ? 'Ele passa preço, negocia até o desconto máximo, manda o Pix e te avisa para conferir o pagamento.' : 'Ele conversa e, quando o cliente se interessar, marca uma conversa com você ou te chama.'} Nos dois casos ele te avisa quando o lead esquenta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={podeFechar ? 'sim' : 'nao'} onChange={(v) => setPodeFechar(v === 'sim')} options={[{ id: 'sim', label: 'Fecha sozinho' }, { id: 'nao', label: 'Só me chama' }]} />
          {podeFechar && (
            <label className="flex items-center gap-2 text-xs text-fg-3">
              Desconto máx.
              <NumberInput className="w-20" value={n.descontoMax} onChange={(v) => set('descontoMax', v ?? 0)} suffix="%" min={0} />
            </label>
          )}
        </div>
      </div>
    </Card>
  )
}

interface MsgSim {
  de: 'lead' | 'agente'
  texto: string
  resp?: RespostaSimulada
  /** Aviso "não responderia": aparece na tela, mas não entra no histórico */
  nulo?: boolean
}

const historicoDe = (msgs: MsgSim[]) => msgs.filter((m) => !m.nulo).map(({ de, texto }) => ({ de, texto }))

/** Você faz o papel do cliente. Nada é enviado no WhatsApp. */
function Simulador() {
  const toast = useApp((s) => s.toast)
  const [lead, setLead] = useState({ empresa: 'Pizzaria Bella Massa', nicho: 'Pizzaria', cidade: 'Londrina', uf: 'PR' })
  const [msgs, setMsgs] = useState<MsgSim[]>([])
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)

  async function comecar() {
    setBusy(true)
    try {
      const r = await ag<{ mensagens: string[] }>('/simular/abordagem', { method: 'POST', json: { lead } })
      setMsgs(r.mensagens.map((t) => ({ de: 'agente' as const, texto: t })))
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function responder() {
    const t = texto.trim()
    if (!t) return
    const historico: MsgSim[] = [...msgs, { de: 'lead', texto: t }]
    setMsgs(historico)
    setTexto('')
    setBusy(true)
    try {
      const r = await ag<RespostaSimulada>('/simular/conversa', { method: 'POST', json: { lead, mensagens: historicoDe(historico) } })
      const novas: MsgSim[] = r.mensagens.map((m, i) => ({ de: 'agente', texto: m, resp: i === r.mensagens.length - 1 ? r : undefined }))
      setMsgs([...historico, ...(novas.length ? novas : [{ de: 'agente' as const, texto: `(não responderia: ${ACAO[r.acao].toLowerCase()})`, resp: r, nulo: true }])])
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-blue-300" /> Simulador
        </span>
      }
      description="Você faz o papel do cliente e vê como o agente responde. Nada vai para o WhatsApp. Marque 👎 e escreva o jeito certo: ele aprende."
      actions={
        msgs.length > 0 && (
          <Button size="xs" variant="ghost" icon={<RotateCcw className="size-3" />} onClick={() => setMsgs([])}>
            Recomeçar
          </Button>
        )
      }
    >
      {msgs.length === 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-fg-3">Empresa de teste:</p>
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_64px]">
            <input className="input" value={lead.empresa} onChange={(e) => setLead({ ...lead, empresa: e.target.value })} placeholder="Empresa" />
            <input className="input" value={lead.nicho} onChange={(e) => setLead({ ...lead, nicho: e.target.value })} placeholder="Tipo de negócio" />
            <input className="input" value={lead.cidade} onChange={(e) => setLead({ ...lead, cidade: e.target.value })} placeholder="Cidade" />
            <input className="input uppercase" maxLength={2} value={lead.uf} onChange={(e) => setLead({ ...lead, uf: e.target.value })} placeholder="UF" />
          </div>
          <Button variant="primary" loading={busy} onClick={() => void comecar()}>
            Ver a primeira mensagem
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-h-[520px] space-y-2.5 overflow-y-auto rounded-lg bg-ink p-3">
            {msgs.map((m, i) => (
              <Bolha
                key={i}
                de={m.de}
                texto={m.texto}
                rodape={
                  m.resp && (
                    <>
                      <Pill className={m.resp.acao === 'continuar' ? PILL.neutral : PILL.gold}>{ACAO[m.resp.acao]}</Pill>
                      <span>interesse: {m.resp.temperatura}</span>
                    </>
                  )
                }
              >
                {m.de === 'agente' && !m.nulo && (
                  <Avaliacao
                    enviar={async (nota, correcao) => {
                      const r = await ag<{ licao: Licao | null }>('/simular/avaliar', {
                        method: 'POST',
                        json: { mensagens: historicoDe(msgs), indice: historicoDe(msgs.slice(0, i)).length, nota, correcao },
                      })
                      return r.licao?.texto ?? null
                    }}
                  />
                )}
              </Bolha>
            ))}
            {busy && <p className="text-2xs text-fg-4">digitando…</p>}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void responder()
            }}
          >
            <input className="input flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder='Responda como o cliente (ex.: "quanto custa?", "já tenho Instagram")' />
            <Button type="submit" variant="go" icon={<Send className="size-3.5" />} disabled={busy || !texto.trim()}>
              Enviar
            </Button>
          </form>
        </div>
      )}
    </Card>
  )
}

const ORIGEM: Record<Licao['origem'], string> = { voce: 'Você escreveu', correcao: 'Da sua correção', resultado: 'Do resultado de uma conversa' }

function Licoes() {
  const toast = useApp((s) => s.toast)
  const [lista, setLista] = useState<Licao[] | null>(null)
  const [tipo, setTipo] = useState<Licao['tipo']>('conversa')
  const [nova, setNova] = useState('')

  const carregar = useCallback(() => ag<Licao[]>('/licoes', { timeoutMs: 10000 }).then(setLista, () => undefined), [])
  useEffect(() => {
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 20_000)
    const nova = () => void carregar()
    window.addEventListener(LICAO_NOVA, nova)
    return () => {
      clearInterval(id)
      window.removeEventListener(LICAO_NOVA, nova)
    }
  }, [carregar])

  async function fazer(fn: () => Promise<unknown>) {
    try {
      await fn()
      await carregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  const visiveis = (lista ?? []).filter((l) => l.tipo === tipo)

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5 text-blue-300" /> O que ele aprendeu
        </span>
      }
      description="Lições que entram em todas as conversas. Desligue ou apague o que não concorda."
      actions={<Segmented size="xs" value={tipo} onChange={setTipo} options={[{ id: 'conversa', label: 'Como falar' }, { id: 'busca', label: 'Quem abordar' }]} />}
    >
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nova.trim()) return
          void fazer(() => ag('/licoes', { method: 'POST', json: { tipo, texto: nova } })).then(() => setNova(''))
        }}
      >
        <input className="input flex-1" value={nova} onChange={(e) => setNova(e.target.value)} placeholder={tipo === 'conversa' ? 'Ensinar uma regra: "Sempre pergunte o nome do dono"' : 'Critério: "Evite franquias e redes grandes"'} />
        <Button type="submit" icon={<Plus className="size-3.5" />} disabled={!nova.trim()}>
          Ensinar
        </Button>
      </form>
      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-xs text-fg-3">
          {tipo === 'conversa' ? 'Nenhuma lição ainda. Use o Simulador ou avalie as conversas reais com 👍/👎.' : 'Nenhum critério ainda. Tire empresas da fila (aba Prospecção) dizendo o motivo, ou escreva aqui.'}
        </p>
      ) : (
        <ul className="max-h-[520px] space-y-1.5 overflow-y-auto">
          {visiveis.map((l) => (
            <li key={l.id} className={clsx('flex items-start gap-2.5 rounded-lg border border-line-soft px-3 py-2', !l.ativa && 'opacity-50')}>
              <Chave ligado={l.ativa} onChange={(v) => void fazer(() => ag(`/licoes/${l.id}`, { method: 'POST', json: { ativa: v } }))} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-5 text-fg">{l.texto}</p>
                <p className="text-2xs text-fg-4">
                  {ORIGEM[l.origem]} · {formatRelative(l.em)}
                </p>
              </div>
              <button
                type="button"
                title="Apagar"
                onClick={() => window.confirm('Apagar esta lição?') && void fazer(() => ag(`/licoes/${l.id}`, { method: 'DELETE' }))}
                className="grid size-6 shrink-0 place-items-center rounded-md text-fg-4 hover:bg-hover hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
