// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// API oficial: mensagens agendadas e funis. Tudo vai para a fila no servidor (meta_fila), que o
// Supabase roda a cada minuto (pg_cron → api/meta.ts?fila=1): funciona com a XS fechada.
import { BadgeCheck, CalendarClock, RefreshCw, Workflow, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Field, Pill, PILL, SearchInput } from '../components/kit'
import { camposIniciais, MetaModelo, type EscolhaModelo } from '../components/MetaModelo'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Segmented, Spinner } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { stepDelayMs, type Funnel } from '../lib/biz'
import { formatPhone } from '../lib/contact'
import { numeroDoLead, textoDoModelo, useMetaConexao, valoresParaLead } from '../lib/meta'
import { fillMessage } from '../lib/messages'
import { STATUSES } from '../lib/statuses'
import type { Lead, Settings } from '../lib/types'
import { useApp } from '../store/useApp'
import { useBiz } from '../store/useBiz'

interface ItemFila {
  id: string
  telefone: string
  nome: string | null
  tipo: 'texto' | 'modelo'
  texto: string
  modelo: string | null
  origem: string
  funil: string | null
  enviar_em: string
  status: 'pendente' | 'enviando' | 'enviada' | 'falhou' | 'cancelada' | 'fora_janela' | 'bloqueado'
  erro: string | null
}

const STATUS_FILA: Record<ItemFila['status'], { label: string; tom: keyof typeof PILL }> = {
  pendente: { label: 'Na fila', tom: 'blue' },
  enviando: { label: 'Enviando', tom: 'blue' },
  enviada: { label: 'Enviada', tom: 'go' },
  falhou: { label: 'Falhou', tom: 'bad' },
  cancelada: { label: 'Cancelada', tom: 'neutral' },
  fora_janela: { label: 'Fora das 24 h', tom: 'gold' },
  bloqueado: { label: 'Pediu para sair', tom: 'neutral' },
}

type Linha = Omit<ItemFila, 'id' | 'status' | 'erro' | 'origem' | 'funil'> & {
  numero_id: string | null
  lead_id: string | null
  idioma: string | null
  nomes: string[]
  valores: string[]
  nomeadas: boolean
  origem: 'agenda' | 'funil'
  funil: string | null
}

const daquiAUmaHora = () => {
  const d = new Date(Date.now() + 3_600_000 - new Date().getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

/** Linha da fila com um modelo aprovado. */
function linhaModelo(escolha: EscolhaModelo, lead: Lead | null, settings: Settings): Pick<Linha, 'tipo' | 'texto' | 'modelo' | 'idioma' | 'nomes' | 'valores' | 'nomeadas'> {
  const m = escolha.modelo!
  const valores = valoresParaLead(escolha.campos, lead, settings)
  return { tipo: 'modelo', texto: textoDoModelo(m, valores), modelo: m.nome, idioma: m.idioma, nomes: m.variaveis, valores, nomeadas: m.nomeadas }
}

async function enfileirar(linhas: Linha[]) {
  if (!supabase) throw new Error('A API oficial precisa da sua conta da XS.')
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('meta_fila').insert(linhas.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
}

export function MetaAgendaPage() {
  const { carregado, conexao, carregar } = useMetaConexao()
  const toast = useApp((s) => s.toast)
  const [aba, setAba] = useState<'agendar' | 'funil'>('agendar')
  const [itens, setItens] = useState<ItemFila[] | null>(null)
  const [filtro, setFiltro] = useState<'fila' | 'enviadas' | 'problemas'>('fila')

  const ler = useCallback(async () => {
    if (!supabase) return setItens([])
    const { data } = await supabase.from('meta_fila').select('id,telefone,nome,tipo,texto,modelo,origem,funil,enviar_em,status,erro').order('enviar_em', { ascending: false }).limit(400)
    setItens((data ?? []) as ItemFila[])
  }, [])

  useEffect(() => {
    void carregar()
    void ler()
    const t = setInterval(() => void ler(), 30_000)
    return () => clearInterval(t)
  }, [carregar, ler])

  const visiveis = useMemo(
    () =>
      (itens ?? []).filter((i) =>
        filtro === 'fila' ? i.status === 'pendente' || i.status === 'enviando' : filtro === 'enviadas' ? i.status === 'enviada' : !['pendente', 'enviando', 'enviada'].includes(i.status),
      ),
    [itens, filtro],
  )

  const cancelar = async (ids: string[]) => {
    if (!supabase || !ids.length) return
    const { error } = await supabase.from('meta_fila').update({ status: 'cancelada' }).in('id', ids).eq('status', 'pendente')
    if (error) return toast(error.message, 'error')
    toast(ids.length === 1 ? 'Envio cancelado.' : `${ids.length} envios cancelados.`)
    await ler()
  }

  if (!carregado) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Agendadas e funis <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300"><BadgeCheck className="size-3" /> API oficial</span>
          </span>
        }
        subtitle="Saem sozinhas na hora marcada, mesmo com a XS fechada. Texto livre só vai para quem respondeu nas últimas 24 h; fora disso, use um modelo aprovado. Quem responde “SAIR” não recebe mais nada."
      />

      {!conexao ? (
        <Empty icon={<CalendarClock className="h-5 w-5" />} title="Conecte a API oficial primeiro">
          Vá em API oficial → Conexão.
        </Empty>
      ) : (
        <>
          <Card
            title={<Segmented value={aba} onChange={setAba} options={[{ id: 'agendar', label: 'Agendar mensagem' }, { id: 'funil', label: 'Iniciar funil' }]} />}
          >
            {aba === 'agendar' ? <Agendar numeroId={conexao.numero_id} onFeito={ler} /> : <IniciarFunil numeroId={conexao.numero_id} onFeito={ler} />}
          </Card>

          <Card
            title={<Segmented value={filtro} onChange={setFiltro} options={[{ id: 'fila', label: 'Na fila' }, { id: 'enviadas', label: 'Enviadas' }, { id: 'problemas', label: 'Não saíram' }]} />}
            actions={
              <>
                {filtro === 'fila' && visiveis.some((i) => i.status === 'pendente') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.confirm('Cancelar todos os envios que ainda estão na fila?') && void cancelar(visiveis.filter((i) => i.status === 'pendente').map((i) => i.id))}
                  >
                    Cancelar todos
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => void ler()} aria-label="Atualizar" />
              </>
            }
            bodyClass="px-0 py-0"
          >
            {itens === null ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !visiveis.length ? (
              <p className="px-4 py-6 text-center text-xs text-fg-3">Nada aqui.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {visiveis.slice(0, 200).map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="pv font-medium text-fg">{i.nome || formatPhone(i.telefone)}</span>
                        <Pill className={PILL[STATUS_FILA[i.status].tom]}>{STATUS_FILA[i.status].label}</Pill>
                        {i.funil && <span className="text-2xs text-fg-4">Funil {i.funil}</span>}
                        {i.modelo && <span className="text-2xs text-fg-4">Modelo {i.modelo}</span>}
                      </p>
                      <p className="pv mt-0.5 line-clamp-2 text-fg-3">{i.texto}</p>
                      {i.erro && <p className="mt-0.5 text-2xs text-red-300">{i.erro}</p>}
                    </div>
                    <span className="num shrink-0 text-2xs text-fg-3">{new Date(i.enviar_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {i.status === 'pendente' && (
                      <button onClick={() => void cancelar([i.id])} className="shrink-0 rounded p-0.5 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Cancelar envio">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Agendar({ numeroId, onFeito }: { numeroId: string; onFeito: () => Promise<void> }) {
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [busca, setBusca] = useState('')
  const [lead, setLead] = useState<Lead | null>(null)
  const [numero, setNumero] = useState('')
  const [quando, setQuando] = useState(daquiAUmaHora)
  const [tipo, setTipo] = useState<'texto' | 'modelo'>('modelo')
  const [texto, setTexto] = useState('')
  const [escolha, setEscolha] = useState<EscolhaModelo>({ modelo: null, campos: camposIniciais(null) })
  const [salvando, setSalvando] = useState(false)

  const achados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? leads.filter((l) => l.empresa.toLowerCase().includes(q) && numeroDoLead(l).length >= 12).slice(0, 6) : []
  }, [leads, busca])

  const telefone = lead ? numeroDoLead(lead) : numero.replace(/\D/g, '').replace(/^(\d{10,11})$/, '55$1')

  const salvar = async () => {
    if (telefone.length < 12) return toast('Escolha um lead com WhatsApp ou digite o número.', 'error')
    if (tipo === 'texto' && !texto.trim()) return toast('Escreva a mensagem.', 'error')
    if (tipo === 'modelo' && !escolha.modelo) return toast('Escolha o modelo.', 'error')
    setSalvando(true)
    try {
      const conteudo = tipo === 'modelo' ? linhaModelo(escolha, lead, settings) : { tipo: 'texto' as const, texto: lead ? fillMessage(texto, lead, settings) : texto, modelo: null, idioma: null, nomes: [], valores: [], nomeadas: false }
      await enfileirar([{ ...conteudo, numero_id: numeroId, telefone, nome: lead?.empresa ?? null, lead_id: lead?.id ?? null, enviar_em: new Date(quando).toISOString(), origem: 'agenda', funil: null }])
      toast('Mensagem agendada.')
      setTexto('')
      setLead(null)
      setNumero('')
      await onFeito()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não deu para agendar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Para quem">
          {lead ? (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="pv font-medium">{lead.empresa}</span>
              <span className="pv text-xs text-fg-3">{formatPhone(telefone)}</span>
              <button onClick={() => setLead(null)} className="text-fg-4 hover:text-fg" aria-label="Trocar">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar lead pelo nome" className="sm:w-full" />
              {achados.map((l) => (
                <button key={l.id} onClick={() => (setLead(l), setBusca(''))} className="pv block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-hover">
                  {l.empresa} · {formatPhone(numeroDoLead(l))}
                </button>
              ))}
              <input className="input h-8 text-xs" placeholder="Ou digite o número com DDD" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
          )}
        </Field>
        <Field label="Quando">
          <input type="datetime-local" className="input h-8" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </Field>
      </div>
      <Segmented value={tipo} onChange={setTipo} options={[{ id: 'modelo', label: 'Modelo aprovado' }, { id: 'texto', label: 'Texto livre' }]} />
      {tipo === 'modelo' ? (
        <MetaModelo valor={escolha} onChange={setEscolha} lead={lead} compacto />
      ) : (
        <textarea className="input min-h-20 text-[13px]" placeholder="Pode usar {empresa}, {saudacao}, {responsavel}…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      )}
      <Button variant="primary" icon={<CalendarClock className="size-3.5" />} loading={salvando} onClick={() => void salvar()}>
        Agendar
      </Button>
    </div>
  )
}

/** Monta os envios do funil para um lead: modelo (opcional) na hora de começar, depois cada mensagem após as esperas. */
function envios(f: Funnel, lead: Lead, inicio: number, escolha: EscolhaModelo | null, settings: Settings, numeroId: string): Linha[] {
  const base = { numero_id: numeroId, telefone: numeroDoLead(lead), nome: lead.empresa, lead_id: lead.id, origem: 'funil' as const, funil: f.nome }
  const out: Linha[] = []
  let t = inicio
  if (escolha?.modelo) out.push({ ...base, ...linhaModelo(escolha, lead, settings), enviar_em: new Date(t).toISOString() })
  let n = 0
  for (const passo of f.etapas) {
    if (passo.tipo === 'espera') {
      t += stepDelayMs(passo)
      continue
    }
    const vars = passo.variacoes.filter((v) => v.trim())
    if (!vars.length) continue
    const texto = fillMessage(vars[(lead.id.charCodeAt(0) + n++) % vars.length], lead, settings)
    out.push({ ...base, tipo: 'texto', texto, modelo: null, idioma: null, nomes: [], valores: [], nomeadas: false, enviar_em: new Date(t).toISOString() })
  }
  return out
}

function IniciarFunil({ numeroId, onFeito }: { numeroId: string; onFeito: () => Promise<void> }) {
  const funnels = useBiz((s) => s.funnels)
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [funilId, setFunilId] = useState('')
  const [status, setStatus] = useState('novo')
  const [quando, setQuando] = useState(daquiAUmaHora)
  const [comModelo, setComModelo] = useState(true)
  const [escolha, setEscolha] = useState<EscolhaModelo>({ modelo: null, campos: camposIniciais(null) })
  const [salvando, setSalvando] = useState(false)

  const funil = funnels.find((f) => f.id === funilId) ?? null
  const alvo = useMemo(() => leads.filter((l) => (status === '*' || l.status === status) && numeroDoLead(l).length >= 12).slice(0, 500), [leads, status])

  const iniciar = async () => {
    if (!funil) return toast('Escolha o funil.', 'error')
    if (!alvo.length) return toast('Nenhum lead com WhatsApp nesse status.', 'error')
    if (comModelo && !escolha.modelo) return toast('Escolha o modelo do primeiro envio (ou desmarque).', 'error')
    if (!window.confirm(`Colocar ${alvo.length} lead(s) no funil “${funil.nome}”?`)) return
    setSalvando(true)
    try {
      const inicio = new Date(quando).getTime()
      // 20 s entre um lead e outro, para não sair tudo no mesmo segundo
      const linhas = alvo.flatMap((l, i) => envios(funil, l, inicio + i * 20_000, comModelo ? escolha : null, settings, numeroId))
      await enfileirar(linhas)
      toast(`Funil iniciado: ${linhas.length} envios na fila.`)
      await onFeito()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não deu para iniciar o funil.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (!funnels.length) return <p className="text-xs text-fg-3">Crie um funil em WhatsApp → Funis primeiro. Ele serve aqui também.</p>

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Funil">
          <select className="input h-8" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
            <option value="">Escolha…</option>
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Leads com status" hint={`${alvo.length} com WhatsApp${alvo.length === 500 ? ' (máximo de uma vez)' : ''}`}>
          <select className="input h-8" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="*">Todos</option>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Começar em">
          <input type="datetime-local" className="input h-8" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-2">
        <input type="checkbox" checked={comModelo} onChange={(e) => setComModelo(e.target.checked)} />
        Abrir a conversa com um modelo aprovado (recomendado: quem nunca falou com você só recebe modelo)
      </label>
      {comModelo && <MetaModelo valor={escolha} onChange={setEscolha} lead={null} compacto />}
      <p className="text-2xs text-fg-4">As mensagens do funil são texto livre: saem só para quem respondeu nas últimas 24 h. As outras aparecem em “Não saíram”.</p>
      <Button variant="primary" icon={<Workflow className="size-3.5" />} loading={salvando} disabled={!funil} onClick={() => void iniciar()}>
        Iniciar funil
      </Button>
    </div>
  )
}
