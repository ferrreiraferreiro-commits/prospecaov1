import clsx from 'clsx'
import { ChevronDown, CircleStop, Megaphone, Play, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Field, Pill, SearchInput, Stat } from '../components/kit'
import { MotorOffline } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty, Progress, StatusBadge } from '../components/ui'
import { funnelMessages } from '../lib/biz'
import { formatPhone } from '../lib/contact'
import {
  buildCampaignPayload,
  CAMPAIGN_STATUS,
  isMobile,
  leadPhone,
  phoneKeyBr,
  RECIPIENT_STATUS,
  syncCampaigns,
  type CampaignDetail,
  type CampaignSummary,
} from '../lib/disparo'
import { motorFetch, useMotor } from '../lib/motor'
import { normalizeKey, STATUSES } from '../lib/statuses'
import type { StatusId } from '../lib/types'
import { useApp } from '../store/useApp'
import { useBiz } from '../store/useBiz'

export function DisparoPage() {
  const online = useMotor((s) => s.online)
  const wa = useMotor((s) => s.health?.whatsapp)
  const toast = useApp((s) => s.toast)
  const [params] = useSearchParams()
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [creating, setCreating] = useState(() => !!params.get('funil'))

  const refresh = useCallback(async () => {
    try {
      setCampaigns(await motorFetch<CampaignSummary[]>('/disparo/campanhas', { timeoutMs: 6000 }))
    } catch {
      /* motor desligado */
    }
  }, [])

  const anyActive = campaigns.some((c) => c.status === 'enviando' || c.status === 'fila')
  useEffect(() => {
    if (!online) return
    void refresh()
    const id = setInterval(() => void refresh(), anyActive ? 3000 : 10000)
    return () => clearInterval(id)
  }, [online, anyActive, refresh])

  const totals = useMemo(
    () => ({
      enviados: campaigns.reduce((s, c) => s + c.aceitos, 0),
      entregues: campaigns.reduce((s, c) => s + c.entregues, 0),
      responderam: campaigns.reduce((s, c) => s + c.responderam, 0),
      falharam: campaigns.reduce((s, c) => s + c.falharam, 0),
    }),
    [campaigns],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Disparo"
        subtitle="Campanhas de WhatsApp com intervalo aleatório entre leads, trava de duplicidade e acompanhamento de entrega e respostas."
        actions={
          <>
            <Button
              icon={<RefreshCw className="size-3.5" />}
              disabled={!online}
              onClick={async () => {
                await refresh()
                const n = await syncCampaigns().catch(() => 0)
                toast(n ? `${n} resultado(s) levados ao histórico dos leads.` : 'Status atualizado.', 'info')
              }}
            >
              Atualizar status
            </Button>
            {!creating && (
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                Nova campanha
              </Button>
            )}
          </>
        }
      />

      {online === false && <MotorOffline feature="O disparo" />}
      {online && wa?.status !== 'connected' && (
        <div className="panel flex flex-wrap items-center gap-3 border-amber-400/25 px-4 py-3 text-xs">
          <span className="size-2 rounded-full bg-amber-400" />
          <span className="flex-1 text-fg-2">O WhatsApp não está conectado. Você pode montar campanhas, mas elas só enviam depois de conectar.</span>
          <Link to="/whatsapp" className="font-medium text-blue-300 hover:text-blue-200">
            Conectar WhatsApp →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Enviados" value={totals.enviados} icon={<Send />} />
        <Stat label="Entregues" value={totals.entregues} tone="blue" hint={totals.enviados ? `${Math.round((totals.entregues / totals.enviados) * 100)}% dos enviados` : undefined} />
        <Stat label="Responderam" value={totals.responderam} tone="go" hint={totals.enviados ? `${Math.round((totals.responderam / totals.enviados) * 100)}% de resposta` : undefined} />
        <Stat label="Falharam" value={totals.falharam} tone={totals.falharam ? 'bad' : 'default'} hint="Sem WhatsApp ou número inválido" />
      </div>

      {creating && (
        <NewCampaign
          initialFunnel={params.get('funil')}
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await refresh()
          }}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold">Campanhas</h2>
        {campaigns.length === 0 ? (
          <div className="panel">
            <Empty icon={<Megaphone />} title={online ? 'Nenhuma campanha ainda' : 'Ligue o Motor XS para ver as campanhas'}>
              Monte um funil em Funis, escolha os leads e crie a campanha aqui.
            </Empty>
          </div>
        ) : (
          campaigns.map((c) => <CampaignCard key={c.id} c={c} onChange={refresh} />)
        )}
      </section>
    </div>
  )
}

function useCountdown(iso: string | null): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!iso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [iso])
  if (!iso) return null
  const left = Math.max(0, Date.parse(iso) - now)
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function CampaignCard({ c, onChange }: { c: CampaignSummary; onChange: () => Promise<void> }) {
  const toast = useApp((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const countdown = useCountdown(c.status === 'enviando' ? c.proximoEnvio : null)
  const st = CAMPAIGN_STATUS[c.status]

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await motorFetch<CampaignDetail>(`/disparo/campanhas/${c.id}`))
    } catch {
      /* ignora */
    }
  }, [c.id])

  useEffect(() => {
    if (open) void loadDetail()
  }, [open, loadDetail, c.atualizadaEm])

  async function act(path: string, body?: unknown, method = 'POST') {
    setBusy(true)
    try {
      await motorFetch(`/disparo/campanhas/${c.id}${path}`, { method, json: body })
      await onChange()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold">{c.nome}</h3>
            <Pill className={st.cls}>{st.label}</Pill>
          </div>
          <p className="mt-0.5 text-2xs text-fg-3">
            Funil {c.funil || '—'} · intervalo {c.delayMin}–{c.delayMax} min · criada {new Date(c.criadaEm).toLocaleDateString('pt-BR')}
            {countdown && <span className="text-blue-300"> · próximo envio em {countdown}</span>}
            {c.status === 'enviando' && !countdown && <span className="text-blue-300"> · enviando agora</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(c.status === 'rascunho' || c.status === 'pausada') && (
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              icon={<Play className="size-3.5" />}
              onClick={() => {
                if (c.status === 'pausada' && !window.confirm('Retomar a campanha de onde parou?')) return
                void act('/iniciar', { confirmar: true })
              }}
            >
              {c.status === 'pausada' ? 'Retomar' : 'Iniciar'}
            </Button>
          )}
          {(c.status === 'enviando' || c.status === 'fila') && (
            <Button size="sm" variant="danger" loading={busy} icon={<CircleStop className="size-3.5" />} onClick={() => void act('/pausar')}>
              Pausar
            </Button>
          )}
          {c.status !== 'enviando' && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Excluir campanha"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => window.confirm(`Excluir a campanha "${c.nome}"? Os números que já receberam continuam protegidos contra repetição.`) && void act('', undefined, 'DELETE')}
            />
          )}
          <Button size="sm" variant="ghost" icon={<ChevronDown className={clsx('size-3.5 transition-transform', open && 'rotate-180')} />} onClick={() => setOpen((o) => !o)}>
            Raio-X
          </Button>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <Progress value={c.processados} max={c.total} tone={c.status === 'concluida' ? 'go' : 'accent'} className="h-1.5 flex-1" />
          <span className="num text-2xs text-fg-3">
            {c.processados}/{c.total}
          </span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs">
          <Count label="enviados" n={c.aceitos} />
          <Count label="entregues" n={c.entregues} cls="text-sky-300" />
          <Count label="lidos" n={c.lidos} cls="text-blue-300" />
          <Count label="responderam" n={c.responderam} cls="text-emerald-300" />
          <Count label="falharam" n={c.falharam} cls={c.falharam ? 'text-red-300' : undefined} />
          <Count label="ignorados (já receberam)" n={c.ignorados} />
        </dl>
      </div>
      {open && detail && (
        <div className="grid gap-3 border-t border-line-soft p-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="max-h-96 overflow-y-auto rounded-lg border border-line-soft">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line-soft text-left text-2xs text-fg-3">
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-2 py-2 font-medium">Telefone</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {detail.destinatarios.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium text-fg">{r.nome}</p>
                      {r.respostas.map((resp, i) => (
                        <p key={i} className="mt-1 rounded bg-emerald-500/10 px-2 py-1 text-2xs text-emerald-200">
                          “{resp.texto || '…'}”
                        </p>
                      ))}
                      {r.erro && <p className="mt-0.5 text-2xs text-red-300">{r.erro}</p>}
                    </td>
                    <td className="num px-2 py-2 whitespace-nowrap text-fg-2">{formatPhone(r.telefone)}</td>
                    <td className={clsx('px-3 py-2 font-medium whitespace-nowrap', RECIPIENT_STATUS[r.status].cls)}>{RECIPIENT_STATUS[r.status].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-line-soft bg-ink p-3">
            <p className="mb-2 text-2xs font-semibold text-fg-3">Registro</p>
            <ul className="space-y-1.5">
              {detail.logs
                .slice()
                .reverse()
                .slice(0, 120)
                .map((l, i) => (
                  <li key={i} className="text-2xs">
                    <span className="num text-fg-4">{new Date(l.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                    <span
                      className={clsx({
                        'text-fg-2': l.nivel === 'info',
                        'text-emerald-300': l.nivel === 'sucesso' || l.nivel === 'resposta',
                        'text-amber-300': l.nivel === 'aviso',
                        'text-red-300': l.nivel === 'erro',
                      })}
                    >
                      {l.msg}
                    </span>
                    {l.detalhe && <span className="block pl-9 text-fg-4">{l.detalhe}</span>}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  )
}

function Count({ label, n, cls }: { label: string; n: number; cls?: string }) {
  return (
    <span className="text-fg-3">
      <span className={clsx('num font-semibold', cls ?? 'text-fg')}>{n}</span> {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Nova campanha
// ---------------------------------------------------------------------------

const DEFAULT_STATUSES: StatusId[] = ['novo', 'pediu_whatsapp', 'nao_atendeu', 'so_chama']

function NewCampaign({ initialFunnel, onCancel, onCreated }: { initialFunnel: string | null; onCancel: () => void; onCreated: () => Promise<void> }) {
  const leads = useApp((s) => s.leads)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const funnels = useBiz((s) => s.funnels)
  const usable = funnels.filter((f) => funnelMessages(f) > 0)
  const [funnelId, setFunnelId] = useState(() => (initialFunnel && usable.some((f) => f.id === initialFunnel) ? initialFunnel : (usable[0]?.id ?? '')))
  const funnel = usable.find((f) => f.id === funnelId) ?? null
  const [nome, setNome] = useState('')
  const [delayMin, setDelayMin] = useState(6)
  const [delayMax, setDelayMax] = useState(12)
  const [statuses, setStatuses] = useState<StatusId[]>(DEFAULT_STATUSES)
  const [nicho, setNicho] = useState('')
  const [cidade, setCidade] = useState('')
  const [soCelular, setSoCelular] = useState(true)
  const [ocultarEnviados, setOcultarEnviados] = useState(true)
  const [busca, setBusca] = useState('')
  const [enviados, setEnviados] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [startNow, setStartNow] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    motorFetch<string[]>('/disparo/enviados')
      .then((list) => setEnviados(new Set(list)))
      .catch(() => undefined)
  }, [])

  const nichos = useMemo(() => [...new Set(leads.map((l) => l.nicho).filter(Boolean) as string[])].sort(), [leads])
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade).filter(Boolean) as string[])].sort(), [leads])

  const filtered = useMemo(() => {
    const q = normalizeKey(busca)
    return leads.filter((l) => {
      const phone = leadPhone(l)
      if (!phone) return false
      if (soCelular && !isMobile(phone)) return false
      if (ocultarEnviados && enviados.has(phoneKeyBr(phone))) return false
      if (statuses.length && !statuses.includes(l.status)) return false
      if (nicho && l.nicho !== nicho) return false
      if (cidade && l.cidade !== cidade) return false
      if (q && !normalizeKey(`${l.empresa} ${l.nicho ?? ''} ${l.cidade ?? ''}`).includes(q)) return false
      return true
    })
  }, [leads, busca, soCelular, ocultarEnviados, enviados, statuses, nicho, cidade])

  // A seleção acompanha os filtros (só ids visíveis contam)
  const chosen = useMemo(() => filtered.filter((l) => selected.has(l.id)), [filtered, selected])
  const preview = useMemo(() => {
    const lead = chosen[0] ?? filtered[0]
    if (!funnel || !lead) return null
    const { destinatarios } = buildCampaignPayload(funnel, [lead], settings)
    return { lead, textos: destinatarios[0].textos.map((t) => t.replace(/\{\s*saudacao\s*\}/gi, 'Bom dia')) }
  }, [funnel, chosen, filtered, settings])

  async function create() {
    if (!funnel) return toast('Escolha um funil com mensagem.', 'error')
    if (!chosen.length) return toast('Selecione ao menos um lead.', 'error')
    if (delayMin < 1 || delayMax > 60 || delayMin > delayMax) return toast('Intervalo entre 1 e 60 minutos, mínimo menor ou igual ao máximo.', 'error')
    setSaving(true)
    try {
      const payload = buildCampaignPayload(funnel, chosen, settings)
      const created = await motorFetch<CampaignSummary>('/disparo/campanhas', {
        method: 'POST',
        json: { nome: nome.trim() || `${funnel.nome} · ${new Date().toLocaleDateString('pt-BR')}`, funil: funnel.nome, delayMin, delayMax, ...payload },
      })
      if (startNow) {
        await motorFetch(`/disparo/campanhas/${created.id}/iniciar`, { method: 'POST', json: {} }).catch((err) => toast(err instanceof Error ? err.message : 'Campanha criada, mas não iniciou.', 'error'))
      }
      toast(`Campanha criada com ${created.total} lead(s).`)
      await onCreated()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao criar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!usable.length) {
    return (
      <Card title="Nova campanha" actions={<Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onCancel} aria-label="Fechar" />}>
        <Empty icon={<Megaphone />} title="Crie um funil primeiro" action={<Link to="/funis" className="text-xs font-medium text-blue-300">Ir para Funis →</Link>}>
          A campanha envia as mensagens de um funil para cada lead escolhido.
        </Empty>
      </Card>
    )
  }

  return (
    <Card title="Nova campanha" description="Escolha o funil, os leads e o intervalo. O motor envia um lead por vez." actions={<Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onCancel} aria-label="Fechar" />}>
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <Field label="Nome da campanha">
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={funnel ? `${funnel.nome} · ${new Date().toLocaleDateString('pt-BR')}` : ''} />
            </Field>
            <Field label="Funil">
              <select className="input" value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
                {usable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({funnelMessages(f)} msg)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Intervalo mín.">
              <input type="number" min={1} max={60} className="input num w-20" value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value) || 1)} />
            </Field>
            <Field label="máx. (min)">
              <input type="number" min={1} max={60} className="input num w-20" value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value) || 1)} />
            </Field>
          </div>

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
                  <input type="checkbox" checked={ocultarEnviados} onChange={(e) => setOcultarEnviados(e.target.checked)} /> Esconder quem já recebeu disparo
                </label>
                <SearchInput value={busca} onChange={setBusca} className="h-7 sm:ml-auto sm:w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={chosen.length > 0 && chosen.length === filtered.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((l) => l.id)) : new Set())}
                aria-label="Selecionar todos"
              />
              <span className="text-fg-2">
                <strong className="num text-fg">{chosen.length}</strong> de {filtered.length} lead(s) selecionados
              </span>
            </div>
            <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
              {filtered.slice(0, 400).map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-tint/[0.025]">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(l.id)
                          else n.delete(l.id)
                          return n
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{l.empresa}</span>
                      <span className="block truncate text-2xs text-fg-3">{[l.nicho, l.cidade].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="num text-2xs text-fg-3">{formatPhone(leadPhone(l))}</span>
                    <StatusBadge status={l.status} />
                  </label>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-8 text-center text-xs text-fg-3">Nenhum lead com esses filtros.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-[#0b141a] p-3">
            <p className="mb-2 text-2xs font-medium text-[#8696a0]">Prévia{preview ? ` · ${preview.lead.empresa}` : ''}</p>
            {preview ? (
              <div className="space-y-1.5">
                {preview.textos.map((t, i) => (
                  <div key={i} className="ml-auto max-w-[94%] rounded-lg rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 text-[12px] leading-[17px] whitespace-pre-wrap text-[#e9edef]">
                    {t}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-2xs text-[#8696a0]">Selecione leads para ver a mensagem.</p>
            )}
          </div>
          <p className="text-2xs text-fg-4">
            Estimativa: {chosen.length ? `${Math.round((chosen.length * (delayMin + delayMax)) / 2 / 60)}–${Math.ceil((chosen.length * delayMax) / 60)} h` : '—'} para {chosen.length} lead(s). Números que já receberam disparo são pulados.
          </p>
          <label className="flex items-center gap-2 text-xs text-fg-2">
            <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} /> Começar a enviar assim que criar
          </label>
          <Button variant="primary" size="lg" className="w-full" icon={<Send className="size-4" />} loading={saving} onClick={() => void create()} disabled={!chosen.length}>
            Criar campanha ({chosen.length})
          </Button>
        </div>
      </div>
    </Card>
  )
}
