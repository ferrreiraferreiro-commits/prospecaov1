// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { BadgeCheck, ChevronDown, CircleStop, Megaphone, Play, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { create } from 'zustand'
import { Card, SearchInput, Stat } from '../components/kit'
import { MetaModelo, type EscolhaModelo } from '../components/MetaModelo'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Progress, Spinner, StatusBadge } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { formatPhone } from '../lib/contact'
import { isMobile, leadPhone, phoneKeyBr } from '../lib/disparo'
import { enviosDasCampanhas, metaFetch, numeroDoLead, textoDoModelo, useMetaConexao, valoresParaLead, type CampanhaMeta, type DestinatarioMeta, type EnvioCampanha } from '../lib/meta'
import { normalizeKey, STATUSES } from '../lib/statuses'
import type { StatusId } from '../lib/types'
import { useApp } from '../store/useApp'

/** Quantos envios por pedido ao servidor (a Meta responde rápido; o lote cabe folgado no tempo da função). */
const LOTE = 20

// ---------------------------------------------------------------------------
// Envio (fica rodando mesmo se a pessoa sair desta tela, enquanto a XS estiver aberta)
// ---------------------------------------------------------------------------

interface EnvioState {
  rodando: Record<string, { feitos: number; total: number; falhas: number }>
  parar: Set<string>
  iniciar(c: CampanhaMeta, pendentes: DestinatarioMeta[], aoFim: () => void): Promise<void>
  pausar(id: string): void
}

const useEnvio = create<EnvioState>((set, get) => ({
  rodando: {},
  parar: new Set(),
  async iniciar(c, pendentes, aoFim) {
    if (get().rodando[c.id]) return
    get().parar.delete(c.id)
    set((s) => ({ rodando: { ...s.rodando, [c.id]: { feitos: 0, total: pendentes.length, falhas: 0 } } }))
    const toast = useApp.getState().toast
    try {
      for (let i = 0; i < pendentes.length; i += LOTE) {
        if (get().parar.has(c.id)) break
        const lote = pendentes.slice(i, i + LOTE)
        const r = await metaFetch<{ resultados: { ok: boolean; erro?: string }[] }>(
          {
            acao: 'lote',
            campanhaId: c.id,
            modelo: c.modelo,
            idioma: c.idioma,
            nomes: c.variaveis,
            nomeadas: c.nomeadas,
            itens: lote.map((d) => ({ para: d.telefone, valores: d.valores, texto: d.texto, nome: d.nome })),
          },
          90_000,
        )
        const falhas = r.resultados.filter((x) => !x.ok)
        set((s) => {
          const atual = s.rodando[c.id]
          return { rodando: { ...s.rodando, [c.id]: { ...atual, feitos: atual.feitos + r.resultados.length, falhas: atual.falhas + falhas.length } } }
        })
        // Lote cortado no meio (token vencido, conta bloqueada, limite): para e avisa
        if (r.resultados.length < lote.length) {
          toast(falhas[falhas.length - 1]?.erro ?? 'A Meta parou de aceitar os envios.', 'error')
          break
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'O envio parou.', 'error')
    } finally {
      set((s) => {
        const { [c.id]: _fim, ...resto } = s.rodando
        return { rodando: resto }
      })
      aoFim()
    }
  },
  pausar(id) {
    get().parar.add(id)
  },
}))

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

interface Resumo {
  campanha: CampanhaMeta
  envios: EnvioCampanha[]
  pendentes: DestinatarioMeta[]
  /** Telefones (chave BR) que responderam depois de receber */
  responderam: Set<string>
}

export function MetaDisparoPage() {
  const { carregado, conexao, carregar } = useMetaConexao()
  const rodando = useEnvio((s) => s.rodando)
  const [resumos, setResumos] = useState<Resumo[] | null>(null)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    void carregar()
  }, [carregar])

  const atualizar = useCallback(async () => {
    if (!supabase) return setResumos([])
    const { data } = await supabase.from('meta_campanhas').select('*').order('criado_em', { ascending: false }).limit(50)
    const campanhas = (data ?? []) as CampanhaMeta[]
    const envios = await enviosDasCampanhas(campanhas.map((c) => c.id))
    // Respostas: mensagens que chegaram depois da campanha mais antiga da lista
    const desde = campanhas[campanhas.length - 1]?.criado_em
    const chegadas = new Map<string, string>()
    if (desde) {
      const { data: rec } = await supabase.from('meta_mensagens').select('telefone,em').eq('de_mim', false).gte('em', desde).limit(20000)
      for (const r of (rec ?? []) as { telefone: string; em: string }[]) {
        const k = phoneKeyBr(r.telefone)
        if (!chegadas.has(k) || chegadas.get(k)! < r.em) chegadas.set(k, r.em)
      }
    }
    setResumos(
      campanhas.map((c) => {
        const ev = envios.get(c.id) ?? []
        const feitos = new Set(ev.map((e) => phoneKeyBr(e.telefone)))
        const responderam = new Set(ev.filter((e) => e.status !== 'failed' && (chegadas.get(phoneKeyBr(e.telefone)) ?? '') > e.em).map((e) => phoneKeyBr(e.telefone)))
        return { campanha: c, envios: ev, pendentes: c.destinatarios.filter((d) => !feitos.has(phoneKeyBr(d.telefone))), responderam }
      }),
    )
  }, [])

  const algumRodando = Object.keys(rodando).length > 0
  useEffect(() => {
    void atualizar()
    const t = setInterval(() => document.visibilityState === 'visible' && void atualizar(), algumRodando ? 4000 : 15000)
    return () => clearInterval(t)
  }, [atualizar, algumRodando])

  // Fechar a aba no meio do envio pausa a campanha: avisa antes
  useEffect(() => {
    if (!algumRodando) return
    const f = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [algumRodando])

  const totais = useMemo(() => {
    const ev = (resumos ?? []).flatMap((r) => r.envios)
    return {
      enviados: ev.filter((e) => e.status !== 'failed').length,
      entregues: ev.filter((e) => e.status === 'delivered' || e.status === 'read').length,
      lidos: ev.filter((e) => e.status === 'read').length,
      responderam: (resumos ?? []).reduce((n, r) => n + r.responderam.size, 0),
      falharam: ev.filter((e) => e.status === 'failed').length,
    }
  }, [resumos])

  if (!carregado) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Disparo <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300"><BadgeCheck className="size-3" /> API oficial</span>
          </span>
        }
        subtitle="Campanhas com modelos aprovados pela Meta, pelo número da API oficial. Sem risco de bloqueio por disparo; a Meta cobra cada envio no seu cartão."
        actions={
          <>
            <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void atualizar()}>
              Atualizar
            </Button>
            {!criando && conexao && (
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCriando(true)}>
                Nova campanha
              </Button>
            )}
          </>
        }
      />

      {!conexao && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">Conecte a API oficial da Meta para disparar por ela.</span>
          <Link to="/api-oficial" className="font-medium text-blue-300 hover:text-blue-200">
            Conectar API oficial →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Enviados" value={totais.enviados} />
        <Stat label="Entregues" value={totais.entregues} />
        <Stat label="Lidos" value={totais.lidos} />
        <Stat label="Responderam" value={totais.responderam} tone="go" />
        <Stat label="Falharam" value={totais.falharam} />
      </div>

      {criando && (
        <NovaCampanha
          onCancelar={() => setCriando(false)}
          onCriou={async (c) => {
            setCriando(false)
            await atualizar()
            void useEnvio.getState().iniciar(c, c.destinatarios, () => void atualizar())
          }}
        />
      )}

      {resumos === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : resumos.length === 0 ? (
        !criando && (
          <Card>
            <Empty icon={<Megaphone />} title="Nenhuma campanha ainda">
              Escolha um modelo aprovado e os leads. A XS envia pela API oficial e acompanha entregue, lido e respostas.
            </Empty>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {resumos.map((r) => (
            <CampanhaCard key={r.campanha.id} r={r} rodando={rodando[r.campanha.id]} podeEnviar={!!conexao} onMudou={() => void atualizar()} />
          ))}
        </div>
      )}
    </div>
  )
}

const SITUACAO: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Na fila', cls: 'text-fg-3' },
  accepted: { label: 'Enviado', cls: 'text-fg-2' },
  delivered: { label: 'Entregue', cls: 'text-sky-300' },
  read: { label: 'Lido', cls: 'text-blue-300' },
  respondeu: { label: 'Respondeu', cls: 'text-emerald-300' },
  failed: { label: 'Falhou', cls: 'text-red-300' },
}

function CampanhaCard({ r, rodando, podeEnviar, onMudou }: { r: Resumo; rodando?: { feitos: number; total: number; falhas: number }; podeEnviar: boolean; onMudou: () => void }) {
  const toast = useApp((s) => s.toast)
  const [aberto, setAberto] = useState(false)
  const c = r.campanha
  const ok = r.envios.filter((e) => e.status !== 'failed')
  const falhas = r.envios.filter((e) => e.status === 'failed').length
  const processados = c.total - r.pendentes.length
  const status = rodando ? 'Enviando' : r.pendentes.length === 0 ? 'Concluída' : processados === 0 ? 'Não iniciada' : 'Pausada'

  const porTel = useMemo(() => {
    const m = new Map<string, EnvioCampanha>()
    for (const e of r.envios) m.set(phoneKeyBr(e.telefone), e)
    return m
  }, [r.envios])

  const excluir = async () => {
    if (!window.confirm(`Excluir a campanha "${c.nome}"? As mensagens enviadas continuam nas Conversas.`)) return
    const { error } = (await supabase?.from('meta_campanhas').delete().eq('id', c.id)) ?? { error: null }
    if (error) toast(error.message, 'error')
    onMudou()
  }

  return (
    <article className="panel">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-fg">{c.nome}</p>
          <p className="text-2xs text-fg-3">
            Modelo <b className="font-medium text-fg-2">{c.modelo}</b> · {new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
            <span className={clsx(status === 'Enviando' ? 'text-blue-300' : status === 'Concluída' ? 'text-emerald-300' : 'text-amber-200')}>{status}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {rodando ? (
            <Button size="sm" variant="danger" icon={<CircleStop className="size-3.5" />} onClick={() => useEnvio.getState().pausar(c.id)}>
              Pausar
            </Button>
          ) : (
            r.pendentes.length > 0 && (
              <Button size="sm" variant="primary" disabled={!podeEnviar} icon={<Play className="size-3.5" />} onClick={() => void useEnvio.getState().iniciar(c, r.pendentes, onMudou)}>
                {processados ? `Continuar (${r.pendentes.length})` : 'Enviar'}
              </Button>
            )
          )}
          {!rodando && <Button size="sm" variant="ghost" aria-label="Excluir campanha" icon={<Trash2 className="size-3.5" />} onClick={() => void excluir()} />}
          <Button size="sm" variant="ghost" icon={<ChevronDown className={clsx('size-3.5 transition-transform', aberto && 'rotate-180')} />} onClick={() => setAberto((o) => !o)}>
            Raio-X
          </Button>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <Progress value={rodando ? processados + rodando.feitos : processados} max={c.total} tone={status === 'Concluída' ? 'go' : 'accent'} className="h-1.5 flex-1" />
          <span className="num text-2xs text-fg-3">
            {rodando ? processados + rodando.feitos : processados}/{c.total}
          </span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-fg-3">
          <span><b className="num font-semibold text-fg">{ok.length}</b> enviados</span>
          <span><b className="num font-semibold text-sky-300">{ok.filter((e) => e.status === 'delivered' || e.status === 'read').length}</b> entregues</span>
          <span><b className="num font-semibold text-blue-300">{ok.filter((e) => e.status === 'read').length}</b> lidos</span>
          <span><b className="num font-semibold text-emerald-300">{r.responderam.size}</b> responderam</span>
          <span><b className={clsx('num font-semibold', falhas ? 'text-red-300' : 'text-fg')}>{falhas}</b> falharam</span>
        </dl>
      </div>
      {aberto && (
        <div className="max-h-96 overflow-y-auto border-t border-line-soft">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-2 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {c.destinatarios.map((d) => {
                const k = phoneKeyBr(d.telefone)
                const e = porTel.get(k)
                const s = SITUACAO[r.responderam.has(k) ? 'respondeu' : (e?.status ?? 'pendente')] ?? SITUACAO.accepted
                return (
                  <tr key={d.telefone} className="align-top">
                    <td className="px-4 py-2">
                      <Link to={`/api-oficial/conversas?tel=${d.telefone}`} className="pv font-medium text-fg hover:text-blue-300">
                        {d.nome}
                      </Link>
                      {e?.erro && <p className="mt-0.5 text-2xs text-red-300">{e.erro}</p>}
                    </td>
                    <td className="pv num px-2 py-2 whitespace-nowrap text-fg-2">{formatPhone(d.telefone)}</td>
                    <td className={clsx('px-4 py-2 font-medium whitespace-nowrap', s.cls)}>{s.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Nova campanha
// ---------------------------------------------------------------------------

const STATUS_PADRAO: StatusId[] = ['novo', 'pediu_whatsapp', 'nao_atendeu', 'so_chama']

function NovaCampanha({ onCancelar, onCriou }: { onCancelar: () => void; onCriou: (c: CampanhaMeta) => Promise<void> }) {
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [escolha, setEscolha] = useState<EscolhaModelo>({ modelo: null, campos: [] })
  const [nome, setNome] = useState('')
  const [statuses, setStatuses] = useState<StatusId[]>(STATUS_PADRAO)
  const [nicho, setNicho] = useState('')
  const [cidade, setCidade] = useState('')
  const [soCelular, setSoCelular] = useState(true)
  const [ocultarEnviados, setOcultarEnviados] = useState(true)
  const [busca, setBusca] = useState('')
  const [enviados, setEnviados] = useState<Set<string>>(new Set())
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  // Quem já recebeu algum modelo pela API oficial
  useEffect(() => {
    void supabase
      ?.from('meta_mensagens')
      .select('telefone')
      .eq('de_mim', true)
      .not('modelo', 'is', null)
      .neq('status', 'failed')
      .limit(20000)
      .then(({ data }) => setEnviados(new Set(((data ?? []) as { telefone: string }[]).map((r) => phoneKeyBr(r.telefone)))))
  }, [])

  const nichos = useMemo(() => [...new Set(leads.map((l) => l.nicho).filter(Boolean) as string[])].sort(), [leads])
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade).filter(Boolean) as string[])].sort(), [leads])

  const filtrados = useMemo(() => {
    const q = normalizeKey(busca)
    return leads.filter((l) => {
      const tel = leadPhone(l)
      if (!tel) return false
      if (soCelular && !isMobile(tel)) return false
      if (ocultarEnviados && enviados.has(phoneKeyBr(tel))) return false
      if (statuses.length && !statuses.includes(l.status)) return false
      if (nicho && l.nicho !== nicho) return false
      if (cidade && l.cidade !== cidade) return false
      if (q && !normalizeKey(`${l.empresa} ${l.nicho ?? ''} ${l.cidade ?? ''}`).includes(q)) return false
      return true
    })
  }, [leads, busca, soCelular, ocultarEnviados, enviados, statuses, nicho, cidade])

  const escolhidos = useMemo(() => filtrados.filter((l) => selecionados.has(l.id)), [filtrados, selecionados])

  const criar = async () => {
    const m = escolha.modelo
    if (!m) return toast('Escolha um modelo aprovado.', 'error')
    if (!escolhidos.length) return toast('Selecione ao menos um lead.', 'error')
    if (!supabase) return
    setSalvando(true)
    try {
      // Um destinatário por número (dois leads com o mesmo telefone recebem uma vez só)
      const vistos = new Set<string>()
      const destinatarios: DestinatarioMeta[] = []
      for (const l of escolhidos) {
        const telefone = numeroDoLead(l)
        const k = phoneKeyBr(telefone)
        if (vistos.has(k)) continue
        vistos.add(k)
        const valores = valoresParaLead(escolha.campos, l, settings)
        destinatarios.push({ telefone, nome: l.empresa, lead_id: l.id, valores, texto: textoDoModelo(m, valores) })
      }
      const { data, error } = await supabase
        .from('meta_campanhas')
        .insert({
          nome: nome.trim() || `${m.nome} · ${new Date().toLocaleDateString('pt-BR')}`,
          modelo: m.nome,
          idioma: m.idioma,
          variaveis: m.variaveis,
          nomeadas: m.nomeadas,
          destinatarios,
          total: destinatarios.length,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      toast(`Campanha criada com ${destinatarios.length} lead(s). Enviando…`)
      await onCriou(data as CampanhaMeta)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao criar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card
      title="Nova campanha · API oficial"
      description="Escolha o modelo aprovado e os leads. A XS envia em sequência; deixe a XS aberta até terminar."
      actions={<Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onCancelar} aria-label="Fechar" />}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-fg-3">Nome da campanha</span>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={escolha.modelo ? `${escolha.modelo.nome} · ${new Date().toLocaleDateString('pt-BR')}` : ''} />
          </label>

          <div className="rounded-lg border border-line-soft">
            <div className="space-y-2 border-b border-line-soft p-3">
              <div className="flex flex-wrap gap-1">
                {STATUSES.filter((s) => s.id !== 'numero_incorreto').map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStatuses((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    className={clsx('rounded-md ring-1 ring-inset', statuses.includes(s.id) ? 'opacity-100 ring-blue-500/50' : 'opacity-45 ring-transparent hover:opacity-80')}
                  >
                    <StatusBadge status={s.id} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input h-7 w-auto" value={nicho} onChange={(e) => setNicho(e.target.value)}>
                  <option value="">Todos os nichos</option>
                  {nichos.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <select className="input h-7 w-auto" value={cidade} onChange={(e) => setCidade(e.target.value)}>
                  <option value="">Todas as cidades</option>
                  {cidades.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-fg-2">
                  <input type="checkbox" checked={soCelular} onChange={(e) => setSoCelular(e.target.checked)} /> Só celulares
                </label>
                <label className="flex items-center gap-1.5 text-xs text-fg-2">
                  <input type="checkbox" checked={ocultarEnviados} onChange={(e) => setOcultarEnviados(e.target.checked)} /> Esconder quem já recebeu pela API oficial
                </label>
                <SearchInput value={busca} onChange={setBusca} className="h-7 sm:ml-auto sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={escolhidos.length > 0 && escolhidos.length === filtrados.length}
                onChange={(e) => setSelecionados(e.target.checked ? new Set(filtrados.map((l) => l.id)) : new Set())}
                aria-label="Selecionar todos"
              />
              <span className="text-fg-2">
                <strong className="num text-fg">{escolhidos.length}</strong> de {filtrados.length} lead(s) selecionados
              </span>
            </div>
            <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
              {filtrados.slice(0, 400).map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-tint/[0.025]">
                    <input
                      type="checkbox"
                      checked={selecionados.has(l.id)}
                      onChange={(e) =>
                        setSelecionados((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(l.id)
                          else n.delete(l.id)
                          return n
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="pv block truncate text-xs font-medium">{l.empresa}</span>
                      <span className="block truncate text-2xs text-fg-3">{[l.nicho, l.cidade].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="pv num text-2xs text-fg-3">{formatPhone(leadPhone(l))}</span>
                    <StatusBadge status={l.status} />
                  </label>
                </li>
              ))}
              {filtrados.length === 0 && <li className="px-3 py-8 text-center text-xs text-fg-3">Nenhum lead com esses filtros.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <MetaModelo valor={escolha} onChange={setEscolha} lead={escolhidos[0] ?? filtrados[0] ?? null} />
          <p className="text-2xs leading-4 text-fg-4">
            A Meta cobra cada modelo entregue (marketing custa mais que utilidade). Números repetidos recebem uma vez só.
          </p>
          <Button variant="primary" size="lg" className="w-full" icon={<Send className="size-4" />} loading={salvando} onClick={() => void criar()} disabled={!escolhidos.length || !escolha.modelo}>
            Criar e enviar ({escolhidos.length})
          </Button>
        </div>
      </div>
    </Card>
  )
}
