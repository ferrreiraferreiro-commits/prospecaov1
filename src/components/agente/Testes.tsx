// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { FlaskConical, Pause, Play, Square } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ag, type NumerosRamo, type TesteView } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card, Pill, PILL } from '../kit'
import { Button, Empty, Spinner } from '../ui'
import { erroTexto } from './comum'

const ESTADO_TESTE: Record<TesteView['estado'], { label: string; cls: string }> = {
  rodando: { label: 'Rodando', cls: PILL.blue },
  pausado: { label: 'Pausado', cls: PILL.gold },
  encerrado: { label: 'Encerrado', cls: PILL.neutral },
}

/** Testes de abordagens (o Xico cria pela conversa) e como cada ramo está indo. */
export function Testes() {
  const toast = useApp((s) => s.toast)
  const [testes, setTestes] = useState<TesteView[] | null>(null)
  const [ramos, setRamos] = useState<NumerosRamo[]>([])

  const carregar = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([ag<TesteView[]>('/testes', { timeoutMs: 10000 }), ag<NumerosRamo[]>('/ramos', { timeoutMs: 10000 })])
      setTestes(t)
      setRamos(r)
    } catch {
      setTestes((x) => x ?? [])
    }
  }, [])
  useEffect(() => {
    void carregar()
    const id = setInterval(() => document.visibilityState === 'visible' && void carregar(), 30_000)
    return () => clearInterval(id)
  }, [carregar])

  async function mudar(t: TesteView, estado: TesteView['estado']) {
    if (estado === 'encerrado' && !window.confirm(`Encerrar o teste "${t.nome}"? Os números ficam guardados.`)) return
    try {
      await ag(`/testes/${t.id}`, { method: 'POST', json: { estado } })
      await carregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  if (!testes)
    return (
      <div className="grid h-40 place-items-center">
        <Spinner />
      </div>
    )

  return (
    <div className="space-y-4">
      {testes.length === 0 ? (
        <Empty icon={<FlaskConical />} title="Nenhum teste ainda">
          Peça ao{' '}
          <Link to="/xico" className="text-blue-300 hover:underline">
            Xico
          </Link>
          : "testa restaurantes em Londrina com 3 abordagens diferentes". Ele monta o teste e você confirma.
        </Empty>
      ) : (
        testes.map((t) => {
          const melhor = Math.max(...t.variantes.map((v) => v.taxaResposta))
          return (
            <Card
              key={t.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t.nome}
                  <Pill className={ESTADO_TESTE[t.estado].cls}>{ESTADO_TESTE[t.estado].label}</Pill>
                </span>
              }
              description={`${t.alvo.nichos.map((n) => n.nome).join(', ')} em ${t.alvo.cidade} - ${t.alvo.uf} · ${t.abordados} de ${t.meta} empresas abordadas · criado ${formatRelative(t.criadoEm)}`}
              actions={
                t.estado !== 'encerrado' && (
                  <>
                    {t.estado === 'rodando' ? (
                      <Button size="xs" variant="ghost" icon={<Pause className="size-3" />} onClick={() => void mudar(t, 'pausado')}>
                        Pausar
                      </Button>
                    ) : (
                      <Button size="xs" variant="ghost" icon={<Play className="size-3" />} onClick={() => void mudar(t, 'rodando')}>
                        Retomar
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" icon={<Square className="size-3" />} onClick={() => void mudar(t, 'encerrado')}>
                      Encerrar
                    </Button>
                  </>
                )
              }
            >
              <div className="space-y-2.5">
                {t.variantes.map((v) => (
                  <div key={v.id} className="rounded-lg border border-line-soft bg-ink p-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[13px] font-semibold text-fg">{v.nome}</span>
                      <span className="min-w-0 flex-1 text-xs text-fg-3">{v.angulo}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint/[0.06]">
                        <div className={clsx('h-full rounded-full', v.taxaResposta === melhor && v.abordados > 0 ? 'bg-go' : 'bg-blue-400/60')} style={{ width: `${Math.min(100, v.taxaResposta)}%` }} />
                      </div>
                      <span className="num w-10 text-right text-xs font-semibold text-fg">{v.taxaResposta}%</span>
                    </div>
                    <p className="mt-1.5 text-2xs text-fg-3">
                      {v.abordados}/{t.porVariante} abordadas · {v.responderam} responderam · {v.quentes} quentes · {v.reunioes} reuniões · {v.vendas} vendas
                      {v.pediramParar ? ` · ${v.pediramParar} pediram para parar` : ''}
                    </p>
                  </div>
                ))}
                {t.abordados > 0 && t.abordados < t.variantes.length * 10 && <p className="text-2xs text-fg-4">Ainda são poucas empresas: veja como tendência, não como certeza.</p>}
                {t.conclusao && <p className="rounded-md bg-tint/[0.03] px-2.5 py-1.5 text-xs text-fg-2">Conclusão: {t.conclusao}</p>}
              </div>
            </Card>
          )
        })
      )}

      <Card title="Como cada ramo está indo" description="Só as empresas que o vendedor abordou." bodyClass="px-2 py-1.5">
        {ramos.length === 0 ? (
          <p className="px-2 py-5 text-center text-xs text-fg-3">Sem números ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="text-2xs text-fg-4">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">Ramo</th>
                  <th className="px-2 py-1.5 text-right font-medium">Abordadas</th>
                  <th className="px-2 py-1.5 text-right font-medium">Resposta</th>
                  <th className="px-2 py-1.5 text-right font-medium">Quentes</th>
                  <th className="px-2 py-1.5 text-right font-medium">Reuniões</th>
                  <th className="px-2 py-1.5 text-right font-medium">Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {ramos.map((r) => (
                  <tr key={r.ramo}>
                    <td className="px-2 py-1.5 text-fg">{r.ramo}</td>
                    <td className="num px-2 py-1.5 text-right text-fg-2">{r.abordados}</td>
                    <td className="num px-2 py-1.5 text-right text-fg-2">{r.taxaResposta}%</td>
                    <td className="num px-2 py-1.5 text-right text-amber-300">{r.quentes}</td>
                    <td className="num px-2 py-1.5 text-right text-emerald-300">{r.reunioes}</td>
                    <td className="num px-2 py-1.5 text-right text-emerald-300">{r.vendas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
