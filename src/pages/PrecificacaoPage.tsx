import { Calculator, FolderPlus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, Field, NumberInput, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty } from '../components/ui'
import { newId, nowIso } from '../data/repository'
import { calcPrice, DEFAULT_PRICING, type PricingEstimate, type PricingSettings } from '../lib/biz'
import { formatMoney } from '../lib/insights'
import { blankClient, blankPayment, blankProject, useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'

export function PrecificacaoPage() {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const estimates = useBiz((s) => s.pricing_estimates)
  const clients = useBiz((s) => s.clients)
  const { saveEstimate, deleteEstimate, saveClient, saveProject, savePayment } = useBiz.getState()

  const base = settings.precificacao ?? DEFAULT_PRICING
  const [cfg, setCfg] = useState<PricingSettings>(base)
  const cfgDirty = JSON.stringify(cfg) !== JSON.stringify(base)

  const [nome, setNome] = useState('')
  const [cliente, setCliente] = useState('')
  const [horas, setHoras] = useState<number>(20)
  const [custos, setCustos] = useState<number>(0)
  const [imposto, setImposto] = useState<number>(base.imposto)
  const [taxa, setTaxa] = useState<number>(base.taxa_cartao)
  const [margem, setMargem] = useState<number>(base.margem)

  const r = useMemo(() => calcPrice(cfg, { horas, custos_diretos: custos, imposto, taxa_cartao: taxa, margem }), [cfg, horas, custos, imposto, taxa, margem])
  const deducoes = imposto + taxa + margem
  const sorted = useMemo(() => [...estimates].sort((a, b) => b.created_at.localeCompare(a.created_at)), [estimates])

  async function salvarOrcamento() {
    if (!nome.trim()) return toast('Dê um nome ao orçamento.', 'error')
    const e: PricingEstimate = {
      id: newId(),
      nome: nome.trim(),
      cliente: cliente.trim() || null,
      horas,
      custos_diretos: custos,
      imposto,
      taxa_cartao: taxa,
      margem,
      preco_final: round(r.preco_final),
      valor_hora: round(r.valor_hora),
      lucro: round(r.lucro),
      observacoes: null,
      created_at: nowIso(),
    }
    await saveEstimate(e)
    toast('Orçamento salvo.')
  }

  /** Transforma o orçamento em projeto (e cliente, se ainda não existir) com a entrada pendente. */
  async function virarProjeto(e: PricingEstimate) {
    let client = e.cliente ? clients.find((c) => c.nome.toLowerCase() === e.cliente!.toLowerCase() && !c.arquivado) : undefined
    if (!client && e.cliente) {
      client = blankClient({ nome: e.cliente, origem: 'Precificação' })
      await saveClient(client)
    }
    const project = blankProject({ nome: e.nome, client_id: client?.id ?? null, orcamento: e.preco_final, status: 'planejamento', descricao: `${e.horas} h estimadas · margem ${e.margem}%` })
    await saveProject(project)
    if (client) await savePayment(blankPayment(client.id, { project_id: project.id, valor: round(e.preco_final / 2), descricao: `${e.nome} · entrada 50%` }))
    toast(client ? 'Projeto criado com a entrada de 50% pendente no cliente.' : 'Projeto criado (sem cliente).')
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Precificação" subtitle="Quanto cobrar para cobrir seus custos, os impostos e ainda ter lucro." />

      <div className="grid gap-3 xl:grid-cols-[1fr_1.35fr]">
        <Card
          title="Seus custos fixos"
          description="Base para o custo da sua hora. Vale para todos os orçamentos."
          actions={
            <Button
              size="sm"
              variant="primary"
              disabled={!cfgDirty}
              icon={<Save className="size-3.5" />}
              onClick={async () => {
                await saveSettings({ ...settings, precificacao: cfg })
                toast('Custos salvos.')
              }}
            >
              Salvar
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Custos fixos por mês" hint="Ferramentas, internet, pró-labore…" className="col-span-2">
              <NumberInput prefix="R$" value={cfg.custos_fixos} onChange={(v) => setCfg({ ...cfg, custos_fixos: v ?? 0 })} min={0} />
            </Field>
            <Field label="Horas trabalhadas / mês">
              <NumberInput suffix="h" value={cfg.horas_mes} onChange={(v) => setCfg({ ...cfg, horas_mes: v ?? 0 })} min={0} />
            </Field>
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/[0.06] px-3 py-2">
              <p className="text-2xs text-fg-3">Custo da sua hora</p>
              <p className="num text-lg font-semibold text-blue-300">{formatMoney(r.custo_hora)}</p>
            </div>
            <Field label="Imposto padrão">
              <NumberInput suffix="%" value={cfg.imposto} onChange={(v) => setCfg({ ...cfg, imposto: v ?? 0 })} min={0} />
            </Field>
            <Field label="Taxa de cartão padrão">
              <NumberInput suffix="%" value={cfg.taxa_cartao} onChange={(v) => setCfg({ ...cfg, taxa_cartao: v ?? 0 })} min={0} />
            </Field>
            <Field label="Margem de lucro padrão" className="col-span-2">
              <NumberInput suffix="%" value={cfg.margem} onChange={(v) => setCfg({ ...cfg, margem: v ?? 0 })} min={0} />
            </Field>
          </div>
        </Card>

        <Card title="Calcular um orçamento" description="Ajuste horas, custos e margem; o preço atualiza na hora.">
          <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome do projeto" className="col-span-2">
                <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Site + Google Meu Negócio" />
              </Field>
              <Field label="Cliente (opcional)" className="col-span-2">
                <input className="input" list="xs-clientes" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
                <datalist id="xs-clientes">
                  {clients.map((c) => (
                    <option key={c.id} value={c.nome} />
                  ))}
                </datalist>
              </Field>
              <Field label="Horas estimadas">
                <NumberInput suffix="h" value={horas} onChange={(v) => setHoras(v ?? 0)} min={0} />
              </Field>
              <Field label="Custos diretos" hint="Domínio, tema, terceiros">
                <NumberInput prefix="R$" value={custos} onChange={(v) => setCustos(v ?? 0)} min={0} />
              </Field>
              <Field label="Imposto">
                <NumberInput suffix="%" value={imposto} onChange={(v) => setImposto(v ?? 0)} min={0} />
              </Field>
              <Field label="Taxa de cartão">
                <NumberInput suffix="%" value={taxa} onChange={(v) => setTaxa(v ?? 0)} min={0} />
              </Field>
              <Field label={`Margem de lucro · ${margem}%`} className="col-span-2">
                <input type="range" min={0} max={70} step={1} value={margem} onChange={(e) => setMargem(Number(e.target.value))} className="w-full accent-blue-500" />
              </Field>
            </div>

            <div className="flex flex-col rounded-xl border border-line bg-ink p-4">
              <p className="text-2xs font-medium text-fg-3">Preço sugerido</p>
              <p className="num mt-1 text-3xl font-semibold tracking-[-0.03em] text-fg">{formatMoney(r.preco_final)}</p>
              <p className="num mt-0.5 text-xs text-fg-3">{formatMoney(r.valor_hora)} por hora vendida</p>
              {deducoes >= 90 && <p className="mt-2 text-2xs text-red-300">Imposto + taxa + margem passam de 90%: o preço fica irreal.</p>}
              <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3 text-xs">
                <Row label="Custo (horas + diretos)">{formatMoney(r.custo_total)}</Row>
                <Row label="Impostos e taxas">{formatMoney(r.impostos_taxas)}</Row>
                <Row label="Lucro líquido" strong>
                  {formatMoney(r.lucro)}
                </Row>
              </dl>
              <div className="mt-auto pt-4">
                <Button variant="primary" className="w-full" icon={<Calculator className="size-3.5" />} onClick={() => void salvarOrcamento()}>
                  Salvar orçamento
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Orçamentos salvos" bodyClass="p-0">
        {sorted.length === 0 ? (
          <Empty icon={<Calculator />} title="Nenhum orçamento salvo">
            Calcule acima e clique em "Salvar orçamento".
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                  <th className="px-4 py-2 font-medium">Projeto</th>
                  <th className="px-2 py-2 font-medium">Cliente</th>
                  <th className="px-2 py-2 text-right font-medium">Horas</th>
                  <th className="px-2 py-2 text-right font-medium">Margem</th>
                  <th className="px-2 py-2 text-right font-medium">Lucro</th>
                  <th className="px-2 py-2 text-right font-medium">Preço</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {sorted.map((e) => (
                  <tr key={e.id} className="hover:bg-tint/[0.02]">
                    <td className="px-4 py-2.5 font-medium text-fg">{e.nome}</td>
                    <td className="px-2 py-2.5 text-fg-2">{e.cliente ?? '—'}</td>
                    <td className="num px-2 py-2.5 text-right text-fg-2">{e.horas} h</td>
                    <td className="num px-2 py-2.5 text-right text-fg-2">{e.margem}%</td>
                    <td className="num px-2 py-2.5 text-right text-emerald-300">{formatMoney(e.lucro)}</td>
                    <td className="num px-2 py-2.5 text-right font-semibold text-fg">{formatMoney(e.preco_final)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="subtle" icon={<FolderPlus className="size-3" />} onClick={() => void virarProjeto(e)}>
                          Virar projeto
                        </Button>
                        <Button size="xs" variant="ghost" aria-label="Excluir orçamento" onClick={() => confirmAction('Excluir este orçamento?') && void deleteEstimate(e.id)} icon={<Trash2 className="size-3" />} />
                      </div>
                    </td>
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

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-3">{label}</dt>
      <dd className={strong ? 'num font-semibold text-emerald-300' : 'num text-fg'}>{children}</dd>
    </div>
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
