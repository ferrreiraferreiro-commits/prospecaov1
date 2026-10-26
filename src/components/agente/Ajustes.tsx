// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ExternalLink, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { ag, MODELOS, type AgenteConfig, type EstadoAgente } from '../../lib/agente'
import { formatPhone } from '../../lib/contact'
import { useApp } from '../../store/useApp'
import { Card, Field, NumberInput } from '../kit'
import { Button } from '../ui'
import { Chave, erroTexto, type AgenteCtx } from './comum'
import { Horario } from './Prospeccao'

type Rascunho = Pick<AgenteConfig, 'modelo' | 'limiteDiaUSD' | 'avisos' | 'respostas' | 'responderDisparos'>

const rascunhoDe = (c: AgenteConfig): Rascunho => ({ modelo: c.modelo, limiteDiaUSD: c.limiteDiaUSD, avisos: c.avisos, respostas: c.respostas, responderDisparos: c.responderDisparos })

/** parte "chave" = só a chave da IA (passo 1); "funcionamento" = horários, avisos e gastos; sem parte = tudo. */
export function Ajustes({ ctx, parte }: { ctx: AgenteCtx; parte?: 'chave' | 'funcionamento' }) {
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(ctx.config))
  const [tel, setTel] = useState(formatPhone(ctx.config.avisos.telefone))
  const [busy, setBusy] = useState(false)
  const mudou = JSON.stringify(r) !== JSON.stringify(rascunhoDe(ctx.config)) || tel !== formatPhone(ctx.config.avisos.telefone)

  async function salvar() {
    setBusy(true)
    const c = await ctx.salvar({ ...r, avisos: { ...r.avisos, telefone: tel } }, 'Ajustes salvos.')
    if (c) {
      setR(rascunhoDe(c))
      setTel(formatPhone(c.avisos.telefone))
    }
    setBusy(false)
  }

  if (parte === 'chave') return <ChaveApi ctx={ctx} />
  return (
    <div className="space-y-4">
      {parte !== 'funcionamento' && <ChaveApi ctx={ctx} />}
      <Card
        title="Horários, avisos e gastos"
        actions={
          <Button variant="primary" size="sm" loading={busy} disabled={!mudou} onClick={() => void salvar()}>
            Salvar
          </Button>
        }
        bodyClass="px-4 py-4 space-y-5"
      >
        <section>
          <span className="label">Qual IA usar</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODELOS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setR({ ...r, modelo: m.id })}
                className={clsx('rounded-lg border p-3 text-left transition-colors', r.modelo === m.id ? 'border-blue-500/50 bg-blue-500/[0.08]' : 'border-line hover:border-line-strong')}
              >
                <p className="text-[13px] font-semibold text-fg">{m.nome}</p>
                <p className="mt-0.5 text-xs text-fg-3">{m.nota}</p>
                <p className="mt-1.5 text-2xs text-fg-4">{m.custo}</p>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-fg-4">Dá para trocar quando quiser. Com 20 a 50 empresas por dia, o gasto fica por volta de US$ 3/mês no Haiku, US$ 40 no Sonnet e US$ 80 no Opus.</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Limite de gasto com IA por dia (US$)" hint="Chegou no limite, ele para até o dia seguinte e te avisa.">
            <NumberInput value={r.limiteDiaUSD} onChange={(v) => setR({ ...r, limiteDiaUSD: v ?? 1 })} min={0.1} />
          </Field>
          <Field label="Seu outro número (recebe os avisos)" hint="Lead quente, venda, reunião, quem precisa de você e o resumo do dia.">
            <input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(11) 99999-9999" />
          </Field>
        </section>

        <section className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Horario label="Horário em que ele responde (todo dia)" inicio={r.respostas.inicio} fim={r.respostas.fim} onChange={(inicio, fim) => setR({ ...r, respostas: { inicio, fim } })} />
          <Chave ligado={r.avisos.relatorio} onChange={(v) => setR({ ...r, avisos: { ...r.avisos, relatorio: v } })} label="Resumo do dia no seu número" />
          <Chave ligado={r.responderDisparos} onChange={(v) => setR({ ...r, responderDisparos: v })} label="Também conversar com quem responder aos Disparos" />
        </section>
      </Card>
    </div>
  )
}

function ChaveApi({ ctx }: { ctx: AgenteCtx }) {
  const toast = useApp((s) => s.toast)
  const [valor, setValor] = useState('')
  const [busy, setBusy] = useState(false)
  const e = ctx.estado

  async function conectar() {
    setBusy(true)
    try {
      ctx.setEstado(await ag<EstadoAgente>('/chave', { method: 'POST', json: { chave: valor.trim() } }))
      setValor('')
      toast('Chave conectada.')
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remover() {
    if (!window.confirm('Remover a chave? A IA desliga até você colocar outra.')) return
    try {
      ctx.setEstado(await ag<EstadoAgente>('/chave', { method: 'DELETE' }))
      void ctx.recarregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-gold" /> Chave da IA
        </span>
      }
      description="A chave é como uma senha que deixa a IA pensar. Ela fica guardada só no servidor da XS e não aparece de novo na tela."
    >
      {e.temChave ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className={clsx('text-[13px]', e.chaveRecusada ? 'text-red-300' : 'text-emerald-300')}>
            {e.chaveRecusada ? 'Chave recusada ou sem crédito' : 'Chave conectada'} <span className="text-fg-3">(termina em …{e.chaveFinal})</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => void remover()}>
            Remover
          </Button>
        </div>
      ) : (
        <div className="mb-3 space-y-3">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
            <p className="text-[13px] font-medium text-emerald-200">Grátis: chave do Google (Gemini)</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-fg-2">
              <li>
                Abra{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-blue-300 hover:underline">
                  aistudio.google.com/apikey <ExternalLink className="size-3" />
                </a>{' '}
                e entre com a sua conta do Google (a mesma do Gmail).
              </li>
              <li>Clique no botão “Create API key” (criar chave).</li>
              <li>Copie a chave que aparecer, cole aqui embaixo e clique em Conectar.</li>
            </ol>
          </div>
          <details className="rounded-lg border border-line-soft p-3 text-xs text-fg-2">
            <summary className="cursor-pointer text-[13px] font-medium text-fg">Prefere o Claude? (pago, escreve melhor)</summary>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                Entre em{' '}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-blue-300 hover:underline">
                  console.anthropic.com <ExternalLink className="size-3" />
                </a>{' '}
                e crie a sua conta.
              </li>
              <li>Em Billing, coloque crédito (US$ 10 dá para bastante coisa).</li>
              <li>Em API Keys, clique em “Create Key”, copie a chave e cole aqui embaixo.</li>
            </ol>
          </details>
        </div>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (valor.trim()) void conectar()
        }}
      >
        <input className="input flex-1" type="password" autoComplete="off" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder={e.temChave ? 'Trocar por outra chave' : 'Cole a chave aqui'} />
        <Button type="submit" variant="primary" loading={busy} disabled={!valor.trim()}>
          {e.temChave ? 'Trocar' : 'Conectar'}
        </Button>
      </form>
    </Card>
  )
}
