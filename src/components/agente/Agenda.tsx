// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { CalendarClock, ChartColumn, HeartHandshake } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag } from '../../lib/agente'
import { useApp } from '../../store/useApp'
import { Card, Field, NumberInput } from '../kit'
import { Button, Spinner } from '../ui'
import { ComoFunciona, Selo } from './Ajuda'
import { DIAS_SEMANA, erroTexto, type AgenteCtx } from './comum'
import { Horario } from './Prospeccao'

interface ConfigAgenda {
  dias: number[]
  inicio: number
  fim: number
  duracaoMin: number
  antecedenciaH: number
  como: string
}
interface Reuniao {
  id: string
  empresa: string
  inicio: string
  estado: 'marcada' | 'confirmada' | 'cancelada' | 'veio' | 'faltou'
  confirmacaoEnviada?: boolean
}
interface Padroes {
  conversas: number
  responderam: number
  vendas: number
  total: { taxa: number }
  porHora: { hora: number; abordados: number; taxa: number }[]
  porRamo: { ramo: string; abordados: number; taxa: number; melhorFaixa: string | null }[]
  melhorHora: number | null
}

const ESTADO: Record<Reuniao['estado'], { texto: string; tom: 'neutro' | 'azul' | 'verde' | 'vermelho' }> = {
  marcada: { texto: 'marcada', tom: 'azul' },
  confirmada: { texto: 'confirmada', tom: 'verde' },
  cancelada: { texto: 'cancelada', tom: 'neutro' },
  veio: { texto: 'veio', tom: 'verde' },
  faltou: { texto: 'faltou', tom: 'vermelho' },
}
const FAIXA: Record<string, string> = { manha: 'manhã', tarde: 'tarde', noite: 'noite' }

/** Agenda das conversas com você, pós-venda e os números (que hora e que ramo respondem mais). */
export function Agenda({ ctx }: { ctx: AgenteCtx }) {
  const toast = useApp((s) => s.toast)
  const cfg = ctx.config as unknown as { agenda: ConfigAgenda; posVenda: { depoimentoDias: number; indicacaoDias: number } }
  const [ag0, setAg0] = useState<ConfigAgenda>(cfg.agenda)
  const [pv, setPv] = useState(cfg.posVenda)
  const [reunioes, setReunioes] = useState<Reuniao[] | null>(null)
  const [pad, setPad] = useState<Padroes | null>(null)
  const [busy, setBusy] = useState(false)
  const mudou = JSON.stringify([ag0, pv]) !== JSON.stringify([cfg.agenda, cfg.posVenda])

  const carregar = useCallback(async () => {
    const [a, p] = await Promise.all([ag<{ reunioes: Reuniao[] }>('/agenda').catch(() => ({ reunioes: [] })), ag<Padroes>('/padroes').catch(() => null)])
    setReunioes(a.reunioes)
    setPad(p)
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar() {
    setBusy(true)
    await ctx.salvar({ agenda: ag0, posVenda: pv } as never, 'Agenda salva.')
    setBusy(false)
  }

  async function marcar(id: string, estado: Reuniao['estado']) {
    try {
      setReunioes((await ag<{ reunioes: Reuniao[] }>(`/agenda/${id}`, { method: 'POST', json: { estado } })).reunioes)
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  const maxTaxa = Math.max(1, ...(pad?.porHora.map((h) => h.taxa) ?? [1]))

  return (
    <div className="space-y-4">
      <ComoFunciona
        id="agenda"
        titulo="Agenda e pós-venda"
        passos={[
          <>Diga em que dias e horários você pode conversar com cliente. Ele só oferece horário livre de verdade.</>,
          <>Para ele marcar sozinho, ligue o pacote <b>Agendar</b> no Treino. Na véspera, ele confirma com o cliente.</>,
          <>Depois da venda, ele agradece, pede depoimento e pede indicação nos dias que você escolher (pacote <b>Pós-venda</b>).</>,
          <>Em "Números" você vê que hora do dia e que ramo respondem mais.</>,
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title={<span className="flex items-center gap-2"><CalendarClock className="size-3.5 text-blue-300" /> Quando você pode conversar</span>}
          actions={
            <Button variant="primary" size="sm" loading={busy} disabled={!mudou} onClick={() => void salvar()}>
              Salvar
            </Button>
          }
          bodyClass="px-4 py-4 space-y-4"
        >
          <div>
            <span className="label">Dias</span>
            <div className="flex flex-wrap gap-1">
              {DIAS_SEMANA.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAg0({ ...ag0, dias: ag0.dias.includes(i) ? ag0.dias.filter((x) => x !== i) : [...ag0.dias, i].sort() })}
                  className={clsx('h-7 w-10 rounded-md text-xs font-medium ring-1 ring-inset', ag0.dias.includes(i) ? 'bg-blue-500/15 text-blue-300 ring-blue-500/30' : 'text-fg-3 ring-line hover:text-fg-2')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Horario label="Horário" inicio={ag0.inicio} fim={ag0.fim} onChange={(inicio, fim) => setAg0({ ...ag0, inicio, fim })} />
            <Field label="Duração (min)">
              <NumberInput className="w-24" value={ag0.duracaoMin} min={15} onChange={(v) => setAg0({ ...ag0, duracaoMin: v ?? 30 })} />
            </Field>
            <Field label="Antecedência (h)">
              <NumberInput className="w-24" value={ag0.antecedenciaH} min={0} onChange={(v) => setAg0({ ...ag0, antecedenciaH: v ?? 3 })} />
            </Field>
          </div>
          <Field label="Como é a conversa" hint="Ele conta isso ao cliente quando marca.">
            <input className="input" value={ag0.como} onChange={(e) => setAg0({ ...ag0, como: e.target.value })} placeholder="Chamada de vídeo ou ligação pelo WhatsApp" />
          </Field>
          <div className="rounded-lg border border-line-soft bg-ink p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <HeartHandshake className="size-3.5 text-emerald-300" /> Depois da venda
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
              Pede depoimento depois de
              <NumberInput className="w-16" value={pv.depoimentoDias} min={1} onChange={(v) => setPv({ ...pv, depoimentoDias: v ?? 15 })} />
              dias e indicação depois de
              <NumberInput className="w-16" value={pv.indicacaoDias} min={1} onChange={(v) => setPv({ ...pv, indicacaoDias: v ?? 30 })} />
              dias.
            </div>
          </div>
        </Card>

        <Card title="Conversas marcadas" description="Marque se a pessoa veio: ele aprende com isso." bodyClass="max-h-[460px] divide-y divide-line-soft overflow-y-auto">
          {reunioes === null ? (
            <div className="grid h-20 place-items-center">
              <Spinner />
            </div>
          ) : reunioes.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-fg-3">Nenhuma conversa marcada ainda.</p>
          ) : (
            reunioes.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="pv truncate text-[13px] font-medium text-fg">{r.empresa}</p>
                  <p className="text-2xs text-fg-3">
                    {new Date(r.inicio).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {r.confirmacaoEnviada ? ' · confirmação enviada' : ''}
                  </p>
                </div>
                <Selo tom={ESTADO[r.estado].tom}>{ESTADO[r.estado].texto}</Selo>
                {(r.estado === 'marcada' || r.estado === 'confirmada') && (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => void marcar(r.id, 'veio')}>
                      Veio
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => void marcar(r.id, 'faltou')}>
                      Faltou
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><ChartColumn className="size-3.5 text-gold" /> Números</span>} description="Só das conversas dele, sem texto de cliente." bodyClass="px-4 py-4 space-y-4">
        {!pad ? (
          <p className="text-xs text-fg-3">Sem números ainda.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 text-xs">
              <span>
                <span className="num text-lg font-semibold text-fg">{pad.conversas}</span> <span className="text-fg-3">conversas</span>
              </span>
              <span>
                <span className="num text-lg font-semibold text-fg">{pad.total.taxa}%</span> <span className="text-fg-3">responderam</span>
              </span>
              <span>
                <span className="num text-lg font-semibold text-emerald-300">{pad.vendas}</span> <span className="text-fg-3">vendas</span>
              </span>
              {pad.melhorHora !== null && (
                <span>
                  <span className="num text-lg font-semibold text-gold">{pad.melhorHora}h</span> <span className="text-fg-3">melhor hora</span>
                </span>
              )}
            </div>
            <div>
              <p className="label">Resposta por hora do dia</p>
              <div className="flex h-24 items-end gap-0.5">
                {pad.porHora.slice(7, 22).map((h) => (
                  <div key={h.hora} className="flex flex-1 flex-col items-center gap-1" title={`${h.hora}h: ${h.taxa}% de ${h.abordados}`}>
                    <div className={clsx('w-full rounded-t-sm', h.abordados ? 'bg-blue-500/50' : 'bg-line')} style={{ height: `${h.abordados ? Math.max(4, (h.taxa / maxTaxa) * 80) : 2}px` }} />
                    <span className="num text-[9px] text-fg-4">{h.hora}</span>
                  </div>
                ))}
              </div>
            </div>
            {pad.porRamo.length > 0 && (
              <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
                {pad.porRamo.slice(0, 10).map((r) => (
                  <li key={r.ramo} className="flex items-center gap-2 rounded-md border border-line-soft px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-fg-2">{r.ramo}</span>
                    <span className="num text-fg">{r.taxa}%</span>
                    <span className="text-fg-4">de {r.abordados}</span>
                    {r.melhorFaixa && <Selo tom="ouro">{FAIXA[r.melhorFaixa]}</Selo>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
