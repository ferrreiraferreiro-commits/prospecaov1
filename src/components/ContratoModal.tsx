// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Download, Eye, FileSignature, Share2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Client, Project } from '../lib/biz'
import {
  CONTRATO_PADRAO,
  CORES_CONTRATO,
  ESCOPO_SUGERIDO,
  faltando,
  numeroContrato,
  reais,
  type ContratoDados,
  type ContratoPadrao,
  type FormaPagamento,
  type Hospedagem,
} from '../lib/contrato'
import { todayKey } from '../lib/dates'
import { useApp } from '../store/useApp'
import { Field, NumberInput } from './kit'
import { Button, Modal, Segmented } from './ui'

/** Junta o salvo com o padrão (campos novos ganham o valor padrão). */
function padraoSalvo(salvo: ContratoPadrao | null, nomeVendedor: string): ContratoPadrao {
  const s = salvo ?? CONTRATO_PADRAO
  return { ...CONTRATO_PADRAO, ...s, contratada: { ...CONTRATO_PADRAO.contratada, ...s.contratada, nome: s.contratada.nome || nomeVendedor } }
}

function dadosIniciais(projeto: Project, cliente: Client | undefined, padrao: ContratoPadrao): ContratoDados {
  const hoje = todayKey()
  const escopo = projeto.tarefas.length ? projeto.tarefas.map((t) => t.texto).join('\n') : projeto.descricao?.trim() || ESCOPO_SUGERIDO
  const mensal = cliente?.tipo === 'fixo' && (cliente.valor_mensal ?? 0) > 0 ? cliente.valor_mensal! : 0
  return {
    ...padrao,
    numero: numeroContrato(projeto.id, hoje),
    data: hoje,
    contratante: {
      // Empresa como contratante, a pessoa como quem assina por ela
      nome: cliente?.empresa?.trim() || cliente?.nome || '',
      representante: cliente?.empresa?.trim() ? cliente.nome : '',
      documento: cliente?.documento ?? '',
      endereco: cliente?.endereco ?? '',
      email: cliente?.email ?? '',
      telefone: cliente?.telefone ?? '',
    },
    projeto: { nome: projeto.nome, escopo },
    valor: projeto.orcamento,
    pagamento: { forma: '50_50', parcelas: 3, texto: '' },
    prazo: projeto.prazo ? { tipo: 'data', data: projeto.prazo, dias: 15 } : { tipo: 'dias', data: '', dias: 15 },
    manutencao: { ativa: mensal > 0, valor: mensal, inclui: 'hospedagem, pequenas alterações de texto e fotos, e suporte pelo WhatsApp' },
    foro: padrao.contratada.cidade,
  }
}

/** Só o que vale para os próximos contratos (fica salvo nos Ajustes). */
const paraSalvar = (d: ContratoDados): ContratoPadrao => ({
  contratada: d.contratada,
  revisoes: d.revisoes,
  aprovacaoDias: d.aprovacaoDias,
  hospedagem: d.hospedagem,
  portfolio: d.portfolio,
  testemunhas: d.testemunhas,
  cor: d.cor,
  extras: d.extras,
})

/**
 * Contrato em PDF de um projeto: puxa os dados do projeto e do cliente, você confere e ajusta, e sai um
 * PDF pronto para ver, baixar ou mandar (no celular, direto pelo WhatsApp).
 */
export function ContratoModal({ projeto, cliente, onClose }: { projeto: Project; cliente: Client | undefined; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<ContratoDados>(() => dadosIniciais(projeto, cliente, padraoSalvo(settings.contrato, settings.nome_vendedor)))
  const [gerando, setGerando] = useState<'' | 'ver' | 'baixar' | 'compartilhar'>('')
  const falta = useMemo(() => faltando(d), [d])
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  const set = <K extends keyof ContratoDados>(k: K, v: ContratoDados[K]) => setD((x) => ({ ...x, [k]: v }))
  const setEu = (k: keyof ContratoDados['contratada'], v: string) => setD((x) => ({ ...x, contratada: { ...x.contratada, [k]: v }, foro: k === 'cidade' && (!x.foro || x.foro === x.contratada.cidade) ? v : x.foro }))
  const setCliente = (k: keyof ContratoDados['contratante'], v: string) => setD((x) => ({ ...x, contratante: { ...x.contratante, [k]: v } }))

  async function gerar(acao: 'ver' | 'baixar' | 'compartilhar') {
    if (falta.length) return toast(`Falta preencher: ${falta.join(', ')}.`, 'error')
    // A aba abre já no clique (senão o navegador bloqueia) e recebe o PDF quando ficar pronto
    const aba = acao === 'ver' ? window.open('', '_blank') : null
    setGerando(acao)
    try {
      const { gerarContratoPdf } = await import('../lib/contratoPdf')
      const { doc, nome } = await gerarContratoPdf(d)
      const novo = paraSalvar(d)
      if (JSON.stringify(novo) !== JSON.stringify(settings.contrato)) void saveSettings({ ...useApp.getState().settings, contrato: novo })
      if (acao === 'baixar') {
        doc.save(nome)
        toast('Contrato baixado.')
      } else if (acao === 'ver') {
        const url = URL.createObjectURL(doc.output('blob'))
        if (aba) aba.location.href = url
        else window.location.assign(url)
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' })
        if (navigator.canShare?.({ files: [arquivo] })) await navigator.share({ files: [arquivo], title: nome })
        else {
          doc.save(nome)
          toast('Este aparelho não compartilha arquivos: o contrato foi baixado.')
        }
      }
    } catch (err) {
      aba?.close()
      if ((err as Error).name !== 'AbortError') toast('Não consegui gerar o contrato agora.', 'error')
    } finally {
      setGerando('')
    }
  }

  const n = Math.max(2, Math.round(d.pagamento.parcelas))

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <span className="flex items-center gap-1.5">
          <FileSignature className="size-4 text-blue-300" /> Contrato em PDF
        </span>
      }
      subtitle={`${projeto.nome || 'Projeto'} · contrato nº ${d.numero}`}
      footer={
        <>
          <p className="hidden flex-1 text-2xs text-fg-4 sm:block">Modelo de contrato: confira antes de mandar. Em caso de dúvida, consulte um advogado.</p>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button variant="ghost" icon={<Eye className="size-3.5" />} loading={gerando === 'ver'} onClick={() => void gerar('ver')}>
              Ver
            </Button>
            {podeCompartilhar && (
              <Button icon={<Share2 className="size-3.5" />} loading={gerando === 'compartilhar'} onClick={() => void gerar('compartilhar')}>
                Enviar
              </Button>
            )}
            <Button variant="primary" icon={<Download className="size-3.5" />} loading={gerando === 'baixar'} onClick={() => void gerar('baixar')}>
              Baixar PDF
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-5 px-5 py-4">
        {falta.length > 0 && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Falta preencher: {falta.join(', ')}.</p>
        )}

        <Secao titulo="Seus dados" dica="Ficam salvos para os próximos contratos.">
          <Field label="Seu nome ou da sua empresa *">
            <input className="input" value={d.contratada.nome} onChange={(e) => setEu('nome', e.target.value)} placeholder="Ex.: XS Sites" />
          </Field>
          <Field label="CPF ou CNPJ *">
            <input className="input" value={d.contratada.documento} onChange={(e) => setEu('documento', e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <input className="input" value={d.contratada.endereco} onChange={(e) => setEu('endereco', e.target.value)} placeholder="Rua, número, bairro" />
          </Field>
          <Field label="Cidade">
            <input className="input" value={d.contratada.cidade} onChange={(e) => setEu('cidade', e.target.value)} placeholder="Ex.: Londrina - PR" />
          </Field>
          <Field label="Chave Pix">
            <input className="input" value={d.contratada.pix} onChange={(e) => setEu('pix', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={d.contratada.email} onChange={(e) => setEu('email', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={d.contratada.telefone} onChange={(e) => setEu('telefone', e.target.value)} inputMode="tel" />
          </Field>
        </Secao>

        <Secao titulo="Cliente" dica={cliente ? 'Puxado da ficha do cliente. O que mudar aqui vale só para este contrato.' : 'O projeto não tem cliente: preencha aqui.'}>
          <Field label="Nome ou razão social *">
            <input className="input" value={d.contratante.nome} onChange={(e) => setCliente('nome', e.target.value)} />
          </Field>
          <Field label="CPF ou CNPJ">
            <input className="input" value={d.contratante.documento} onChange={(e) => setCliente('documento', e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Quem assina pela empresa" hint="Deixe vazio se o cliente é pessoa física.">
            <input className="input" value={d.contratante.representante} onChange={(e) => setCliente('representante', e.target.value)} />
          </Field>
          <Field label="Endereço">
            <input className="input" value={d.contratante.endereco} onChange={(e) => setCliente('endereco', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={d.contratante.email} onChange={(e) => setCliente('email', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={d.contratante.telefone} onChange={(e) => setCliente('telefone', e.target.value)} inputMode="tel" />
          </Field>
        </Secao>

        <Secao titulo="O que será feito">
          <Field label="Nome do projeto" className="sm:col-span-2">
            <input className="input" value={d.projeto.nome} onChange={(e) => set('projeto', { ...d.projeto, nome: e.target.value })} />
          </Field>
          <Field label="Escopo (um item por linha)" className="sm:col-span-2" hint="Veio das tarefas do projeto. O que não estiver aqui fica fora do contrato.">
            <textarea className="input" rows={6} value={d.projeto.escopo} onChange={(e) => set('projeto', { ...d.projeto, escopo: e.target.value })} />
          </Field>
        </Secao>

        <Secao titulo="Valor e prazo">
          <Field label="Valor total *">
            <NumberInput prefix="R$" value={d.valor || null} onChange={(v) => set('valor', v ?? 0)} min={0} />
          </Field>
          <Field label="Forma de pagamento">
            <select className="input" value={d.pagamento.forma} onChange={(e) => set('pagamento', { ...d.pagamento, forma: e.target.value as FormaPagamento })}>
              <option value="50_50">50% de entrada + 50% na entrega</option>
              <option value="avista">À vista, na assinatura</option>
              <option value="parcelado">Parcelado</option>
              <option value="personalizado">Do meu jeito (escrevo abaixo)</option>
            </select>
          </Field>
          {d.pagamento.forma === 'parcelado' && (
            <Field label="Parcelas" hint={d.valor > 0 ? `${n}x de ${reais(d.valor / n)}` : undefined}>
              <NumberInput value={d.pagamento.parcelas} onChange={(v) => set('pagamento', { ...d.pagamento, parcelas: Math.max(2, Math.min(24, Math.round(v ?? 2))) })} min={2} suffix="x" />
            </Field>
          )}
          {d.pagamento.forma === 'personalizado' && (
            <Field label="Como vai ser o pagamento" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={d.pagamento.texto}
                onChange={(e) => set('pagamento', { ...d.pagamento, texto: e.target.value })}
                placeholder="Ex.: R$ 500,00 na assinatura e o restante em 2 parcelas de R$ 500,00 nos dias 10 dos meses seguintes."
              />
            </Field>
          )}
          <Field label="Prazo de entrega" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={d.prazo.tipo}
                onChange={(tipo) => set('prazo', { ...d.prazo, tipo })}
                options={[
                  { id: 'dias', label: 'Em dias úteis' },
                  { id: 'data', label: 'Numa data' },
                ]}
              />
              {d.prazo.tipo === 'dias' ? (
                <div className="w-32">
                  <NumberInput value={d.prazo.dias} onChange={(v) => set('prazo', { ...d.prazo, dias: Math.max(1, Math.round(v ?? 1)) })} min={1} suffix="dias" />
                </div>
              ) : (
                <input type="date" className="input w-44" value={d.prazo.data} onChange={(e) => set('prazo', { ...d.prazo, data: e.target.value })} />
              )}
            </div>
          </Field>
          <Field label="Rodadas de ajustes incluídas">
            <NumberInput value={d.revisoes} onChange={(v) => set('revisoes', Math.max(0, Math.min(10, Math.round(v ?? 0))))} min={0} />
          </Field>
          <Field label="Dias para o cliente aprovar cada etapa">
            <NumberInput value={d.aprovacaoDias} onChange={(v) => set('aprovacaoDias', Math.max(1, Math.min(60, Math.round(v ?? 1))))} min={1} suffix="dias" />
          </Field>
        </Secao>

        <Secao titulo="Domínio, hospedagem e manutenção">
          <Field label="Domínio e hospedagem" className="sm:col-span-2">
            <select className="input" value={d.hospedagem} onChange={(e) => set('hospedagem', e.target.value as Hospedagem)}>
              <option value="cliente">Por conta do cliente (eu configuro)</option>
              <option value="incluso_1_ano">1º ano incluso no valor</option>
              <option value="manutencao">Incluída na manutenção mensal</option>
            </select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2 sm:col-span-2">
            <input type="checkbox" className="accent-[var(--color-go)]" checked={d.manutencao.ativa} onChange={(e) => set('manutencao', { ...d.manutencao, ativa: e.target.checked })} />
            Tem manutenção mensal depois da entrega
          </label>
          {d.manutencao.ativa && (
            <>
              <Field label="Valor por mês">
                <NumberInput prefix="R$" value={d.manutencao.valor || null} onChange={(v) => set('manutencao', { ...d.manutencao, valor: v ?? 0 })} min={0} />
              </Field>
              <Field label="O que a manutenção inclui">
                <input className="input" value={d.manutencao.inclui} onChange={(e) => set('manutencao', { ...d.manutencao, inclui: e.target.value })} />
              </Field>
            </>
          )}
        </Secao>

        <Secao titulo="Detalhes">
          <Field label="Cidade do foro" hint="Onde se resolve uma briga na Justiça (normalmente a sua cidade).">
            <input className="input" value={d.foro} onChange={(e) => set('foro', e.target.value)} />
          </Field>
          <Field label="Cor do contrato">
            <div className="flex flex-wrap gap-2 pt-1">
              {CORES_CONTRATO.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  onClick={() => set('cor', c)}
                  className={clsx('size-7 rounded-full border-2 transition-transform', d.cor === c ? 'scale-110 border-white' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
            <input type="checkbox" className="accent-[var(--color-go)]" checked={d.portfolio} onChange={(e) => set('portfolio', e.target.checked)} />
            Posso mostrar o site no meu portfólio
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
            <input type="checkbox" className="accent-[var(--color-go)]" checked={d.testemunhas} onChange={(e) => set('testemunhas', e.target.checked)} />
            Espaço para 2 testemunhas
          </label>
          <Field label="Cláusulas extras (opcional)" className="sm:col-span-2" hint="Separe cada cláusula com uma linha em branco. Ficam salvas para os próximos contratos.">
            <textarea className="input" rows={3} value={d.extras} onChange={(e) => set('extras', e.target.value)} />
          </Field>
        </Secao>
        <p className="text-2xs text-fg-4 sm:hidden">Modelo de contrato: confira antes de mandar. Em caso de dúvida, consulte um advogado.</p>
      </div>
    </Modal>
  )
}

function Secao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-fg">{titulo}</h3>
        {dica && <p className="text-2xs text-fg-4">{dica}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}
