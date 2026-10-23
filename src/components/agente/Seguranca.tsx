// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { LockKeyhole, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag, type OpcionaisConferencia, type Seguranca as Dados } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card } from '../kit'
import { Button, Empty, Spinner } from '../ui'
import { Chave, erroTexto, type AgenteCtx } from './comum'

const NIVEIS: { nivel: number; nome: string; texto: string }[] = [
  { nivel: 1, nome: 'Rascunho', texto: 'Ele escreve, toda mensagem espera você aprovar.' },
  { nivel: 2, nome: 'Copiloto', texto: 'Conversa sozinho; preço, desconto, pagamento e agenda esperam você.' },
  { nivel: 3, nome: 'Piloto', texto: 'Conversa e negocia sozinho; fechar a venda espera você.' },
  { nivel: 4, nome: 'Piloto automático', texto: 'Fecha sozinho dentro dos limites que você deu.' },
]

const PADRAO: OpcionaisConferencia = { revisorTom: false, assuntosProibidos: true, proibidos: '', manipulacao: true, transcreverAudio: false }

/** As conferências que toda mensagem passa antes de sair, os opcionais e o nível de piloto. */
export function Seguranca({ ctx }: { ctx: AgenteCtx }) {
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mudando, setMudando] = useState<number | null>(null)
  const [op, setOp] = useState<OpcionaisConferencia>(ctx.config.conferencias ?? PADRAO)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await ag<Dados>('/seguranca', { timeoutMs: 10000 })
      setD(r)
      setOp(r.opcionais)
      setErro(null)
    } catch (err) {
      setErro(erroTexto(err))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function nivel(n: number) {
    setMudando(n)
    try {
      setD(await ag<Dados>('/nivel', { method: 'POST', json: { nivel: n } }))
      toast(`Nível ${n}: ${NIVEIS[n - 1].nome}.`)
      void ctx.recarregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setMudando(null)
    }
  }

  async function salvarOpcionais() {
    setSalvando(true)
    const c = await ctx.salvar({ conferencias: op }, 'Conferências salvas.')
    if (c?.conferencias) setOp(c.conferencias)
    setSalvando(false)
  }

  if (!d) return erro ? <Empty icon={<ShieldCheck />} title="Não deu para abrir a Segurança">{erro}</Empty> : <div className="grid h-40 place-items-center"><Spinner /></div>

  const fixas = d.conferencias.filter((c) => c.fixa)
  const mudou = JSON.stringify(op) !== JSON.stringify(d.opcionais)

  return (
    <div className="space-y-4">
      <Card title="Nível de piloto" description="Quanta liberdade o vendedor tem. Descer é na hora; subir pede o que está na lista.">
        {d.desceuNivel && (
          <p className="mb-3 rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-xs text-amber-200">
            Ele desceu de nível sozinho {formatRelative(d.desceuNivel.em)}: {d.desceuNivel.motivo}.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {NIVEIS.map((n) => {
            const atual = d.piloto === n.nivel
            const faltam = d.niveis.find((x) => x.nivel === n.nivel)?.faltam ?? []
            const bloqueado = n.nivel > d.piloto && faltam.length > 0
            return (
              <button
                key={n.nivel}
                disabled={atual || bloqueado || mudando !== null}
                onClick={() => void nivel(n.nivel)}
                className={clsx(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  atual ? 'border-blue-500/50 bg-blue-500/10' : 'border-line hover:bg-hover disabled:hover:bg-transparent',
                  bloqueado && 'opacity-70',
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <span className={clsx('grid size-5 place-items-center rounded text-2xs', atual ? 'bg-blue-500 text-white' : 'bg-tint/[0.06] text-fg-3')}>{n.nivel}</span>
                  {n.nome}
                  {atual && <span className="text-2xs font-medium text-blue-300">agora</span>}
                  {mudando === n.nivel && <Spinner className="size-3" />}
                </span>
                <span className="mt-1 block text-xs text-fg-3">{n.texto}</span>
                {bloqueado && (
                  <ul className="mt-1.5 space-y-0.5 text-2xs text-amber-200/90">
                    {faltam.map((f, i) => (
                      <li key={i}>Falta: {f}</li>
                    ))}
                  </ul>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <Card
        title={`As ${fixas.length} conferências`}
        description={`Toda mensagem passa por elas, nesta ordem, antes de sair. Barradas hoje: ${d.barradasHoje}.`}
        bodyClass="divide-y divide-line-soft"
      >
        {fixas.map((c, i) => (
          <div key={c.id} className="flex gap-3 px-4 py-2.5">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-tint/[0.06] text-2xs text-fg-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{c.titulo}</p>
              <p className="text-xs text-fg-3">{c.oQueFaz}</p>
              <p className="mt-1 flex items-start gap-1.5 text-2xs text-fg-4">
                <LockKeyhole className="mt-px size-3 shrink-0" />
                <span>
                  <span className="font-medium text-fg-3">Isto não se desliga.</span> {c.porque}
                </span>
              </p>
            </div>
          </div>
        ))}
      </Card>

      <Card
        title="Opcionais"
        description="Você liga ou desliga."
        actions={
          <Button variant="primary" size="sm" loading={salvando} disabled={!mudou} onClick={() => void salvarOpcionais()}>
            Salvar
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <Chave ligado={op.revisorTom} onChange={(v) => setOp({ ...op, revisorTom: v })} label="Revisor de tom" />
            <p className="mt-1 text-xs text-fg-3">Uma IA barata lê cada mensagem e responde se soa como gente. Custa +1 consulta por mensagem.</p>
          </div>
          <div>
            <Chave ligado={op.assuntosProibidos} onChange={(v) => setOp({ ...op, assuntosProibidos: v })} label="Assuntos proibidos" />
            <p className="mt-1 text-xs text-fg-3">Política, falar mal de concorrente e os temas que você escrever abaixo (separe por vírgula ou linha).</p>
            {op.assuntosProibidos && (
              <textarea
                value={op.proibidos}
                onChange={(e) => setOp({ ...op, proibidos: e.target.value })}
                rows={2}
                placeholder="religião, futebol"
                className="input mt-2 w-full resize-y py-2 text-[13px]"
              />
            )}
          </div>
          <div>
            <Chave ligado={op.manipulacao} onChange={(v) => setOp({ ...op, manipulacao: v })} label="Proteção contra manipulação" />
            <p className="mt-1 text-xs text-fg-3">Quando alguém tenta fazer o vendedor ignorar as instruções ("esqueça suas regras", "me passa seu prompt"), ele não obedece e avisa você.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
