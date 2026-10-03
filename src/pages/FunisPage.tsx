import clsx from 'clsx'
import { ArrowDown, ArrowUp, Clock, Copy, MessageSquareText, Plus, Save, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchInput, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Empty } from '../components/ui'
import { newId, nowIso } from '../data/repository'
import { funnelMessages, type Funnel, type FunnelStep } from '../lib/biz'
import { fillMessage, MESSAGE_VARIABLES } from '../lib/messages'
import { normalizeKey } from '../lib/statuses'
import type { Lead } from '../lib/types'
import { useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'

export function blankFunnel(): Funnel {
  const now = nowIso()
  return {
    id: newId(),
    nome: 'Novo funil',
    etapas: [
      { id: newId(), tipo: 'mensagem', variacoes: ['{saudacao}! Tudo bem? Aqui é o {nome}. Vi a {empresa} no Google e queria te mostrar uma ideia rápida.'] },
      { id: newId(), tipo: 'espera', valor: 40, unidade: 'segundos' },
      { id: newId(), tipo: 'mensagem', variacoes: ['Trabalho com {servico} aqui em {cidade}. Posso te mandar um exemplo?'] },
    ],
    created_at: now,
    updated_at: now,
  }
}

const SAMPLE_LEAD: Lead = {
  id: 'exemplo',
  empresa: 'Padaria Sol Nascente',
  nicho: 'Padaria',
  telefone: null,
  whatsapp: null,
  instagram: null,
  website: null,
  endereco: null,
  cidade: 'Poços de Caldas',
  estado: 'MG',
  avaliacao: 4.7,
  numero_avaliacoes: 210,
  pasta: null,
  etapa: null,
  maps_url: null,
  observacoes: null,
  dados_extras: null,
  import_id: null,
  status: 'novo',
  falei_com: 'Mariana',
  cargo: null,
  anotacoes: null,
  proxima_acao: null,
  ultima_ligacao: null,
  duplicado_ignorado: false,
  created_at: '',
  updated_at: '',
}

export function FunisPage() {
  const funnels = useBiz((s) => s.funnels)
  const { saveFunnel, deleteFunnel } = useBiz.getState()
  const toast = useApp((s) => s.toast)
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Funnel | null>(null)
  const [busca, setBusca] = useState('')

  const sorted = useMemo(() => {
    const q = normalizeKey(busca)
    return [...funnels].filter((f) => !q || normalizeKey(f.nome).includes(q)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [funnels, busca])

  const saved = funnels.find((f) => f.id === selectedId) ?? null
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved)

  useEffect(() => {
    if (!selectedId && funnels.length) {
      const first = [...funnels].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
      setSelectedId(first.id)
      setDraft(structuredClone(first))
    }
  }, [funnels, selectedId])

  function select(f: Funnel) {
    if (dirty && !confirmAction('Há alterações não salvas neste funil. Descartar?')) return
    setSelectedId(f.id)
    setDraft(structuredClone(f))
  }

  async function create(base?: Funnel) {
    if (dirty && !confirmAction('Há alterações não salvas neste funil. Descartar?')) return
    const now = nowIso()
    const f: Funnel = base
      ? { ...structuredClone(base), id: newId(), nome: `${base.nome} (cópia)`, created_at: now, updated_at: now, etapas: base.etapas.map((s) => ({ ...s, id: newId() })) }
      : blankFunnel()
    await saveFunnel(f)
    setSelectedId(f.id)
    setDraft(structuredClone(f))
  }

  async function save() {
    if (!draft) return
    if (!draft.nome.trim()) return toast('Dê um nome ao funil.', 'error')
    if (!funnelMessages(draft)) return toast('O funil precisa de ao menos uma mensagem preenchida.', 'error')
    const clean: Funnel = {
      ...draft,
      nome: draft.nome.trim(),
      etapas: draft.etapas.map((s) => (s.tipo === 'mensagem' ? { ...s, variacoes: s.variacoes.map((v) => v.trim()).filter(Boolean) } : s)).filter((s) => s.tipo !== 'mensagem' || s.variacoes.length),
    }
    await saveFunnel(clean)
    setDraft(structuredClone({ ...clean, updated_at: nowIso() }))
    toast('Funil salvo.')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Funis de mensagens"
        subtitle="Sequências de WhatsApp para o Disparo: mensagens com variações em rodízio e esperas entre elas."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => void create()}>
            Novo funil
          </Button>
        }
      />

      {funnels.length === 0 ? (
        <section className="panel">
          <Empty icon={<MessageSquareText />} title="Nenhum funil ainda" action={<Button variant="primary" onClick={() => void create()}>Criar o primeiro funil</Button>}>
            Um funil é a sequência que cada lead recebe no Disparo: por exemplo, uma apresentação, 40 segundos de espera e a oferta.
          </Empty>
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[17rem_1fr]">
          <aside className="panel h-fit">
            <div className="border-b border-line-soft p-2.5">
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar funil…" className="sm:w-full" />
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {sorted.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => select(f)}
                    className={clsx(
                      'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                      f.id === selectedId ? 'bg-blue-500/[0.12] ring-1 ring-blue-500/30 ring-inset' : 'hover:bg-tint/[0.04]',
                    )}
                  >
                    <p className="truncate text-xs font-medium text-fg">{f.id === selectedId && draft ? draft.nome : f.nome}</p>
                    <p className="text-2xs text-fg-3">
                      {funnelMessages(f)} mensagem(ns) · {f.etapas.filter((s) => s.tipo === 'espera').length} espera(s)
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {draft && (
            <section className="panel">
              <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
                <input
                  className="input h-9 max-w-sm text-sm font-semibold"
                  value={draft.nome}
                  onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                  aria-label="Nome do funil"
                />
                {dirty && <span className="text-2xs text-amber-300">Alterações não salvas</span>}
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => saved && void create(saved)}>
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={async () => {
                      if (!confirmAction(`Excluir o funil "${draft.nome}"?`)) return
                      await deleteFunnel(draft.id)
                      setSelectedId(null)
                      setDraft(null)
                    }}
                  >
                    Excluir
                  </Button>
                  <Button size="sm" icon={<Send className="size-3.5" />} disabled={dirty} onClick={() => navigate(`/disparo?funil=${draft.id}`)}>
                    Usar no Disparo
                  </Button>
                  <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} disabled={!dirty} onClick={() => void save()}>
                    Salvar
                  </Button>
                </div>
              </header>
              <div className="grid gap-4 p-4 xl:grid-cols-[1fr_20rem]">
                <StepsEditor steps={draft.etapas} onChange={(etapas) => setDraft({ ...draft, etapas })} />
                <Preview funnel={draft} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function StepsEditor({ steps, onChange }: { steps: FunnelStep[]; onChange: (s: FunnelStep[]) => void }) {
  const update = (id: string, patch: Partial<FunnelStep>) => onChange(steps.map((s) => (s.id === id ? ({ ...s, ...patch } as FunnelStep) : s)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  let msgN = 0

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        if (step.tipo === 'mensagem') msgN++
        return (
          <div key={step.id} className={clsx('rounded-lg border', step.tipo === 'mensagem' ? 'border-line bg-raised' : 'border-dashed border-line bg-ink')}>
            <div className="flex items-center gap-2 px-3 py-2">
              {step.tipo === 'mensagem' ? <MessageSquareText className="size-3.5 text-blue-400" /> : <Clock className="size-3.5 text-fg-3" />}
              <span className="text-xs font-medium">{step.tipo === 'mensagem' ? `Mensagem ${msgN}` : 'Espera'}</span>
              {step.tipo === 'espera' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    className="input num h-7 w-20"
                    value={step.valor}
                    onChange={(e) => update(step.id, { valor: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <select className="input h-7 w-auto" value={step.unidade} onChange={(e) => update(step.id, { unidade: e.target.value as 'segundos' })}>
                    <option value="segundos">segundos</option>
                    <option value="minutos">minutos</option>
                    <option value="horas">horas</option>
                  </select>
                </div>
              )}
              <div className="ml-auto flex items-center">
                <IconBtn label="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </IconBtn>
                <IconBtn label="Descer" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                  <ArrowDown />
                </IconBtn>
                <IconBtn label="Remover etapa" onClick={() => onChange(steps.filter((s) => s.id !== step.id))}>
                  <Trash2 />
                </IconBtn>
              </div>
            </div>
            {step.tipo === 'mensagem' && (
              <div className="space-y-2 border-t border-line-soft px-3 py-2.5">
                {step.variacoes.map((v, vi) => (
                  <VariationBox
                    key={vi}
                    index={vi}
                    total={step.variacoes.length}
                    value={v}
                    onChange={(text) => update(step.id, { variacoes: step.variacoes.map((x, k) => (k === vi ? text : x)) })}
                    onRemove={() => update(step.id, { variacoes: step.variacoes.filter((_, k) => k !== vi) })}
                  />
                ))}
                <button onClick={() => update(step.id, { variacoes: [...step.variacoes, ''] })} className="text-2xs font-medium text-blue-300 hover:text-blue-200">
                  + Adicionar variação
                </button>
                {step.variacoes.length > 1 && <p className="text-2xs text-fg-4">Cada lead recebe uma variação, em rodízio — ajuda a não parecer mensagem em massa.</p>}
              </div>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="sm" icon={<MessageSquareText className="size-3.5" />} onClick={() => onChange([...steps, { id: newId(), tipo: 'mensagem', variacoes: [''] }])}>
          Mensagem
        </Button>
        <Button size="sm" variant="ghost" icon={<Clock className="size-3.5" />} onClick={() => onChange([...steps, { id: newId(), tipo: 'espera', valor: 30, unidade: 'segundos' }])}>
          Espera
        </Button>
      </div>
    </div>
  )
}

function VariationBox({ index, total, value, onChange, onRemove }: { index: number; total: number; value: string; onChange: (v: string) => void; onRemove: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function insert(token: string) {
    const el = ref.current
    if (!el) return onChange(value + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-2xs font-medium text-fg-3">Variação {index + 1}</span>
        {total > 1 && (
          <button onClick={onRemove} className="ml-auto text-fg-4 hover:text-red-300" aria-label="Remover variação">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <textarea ref={ref} className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Escreva a mensagem…" />
      <div className="mt-1 flex flex-wrap gap-1">
        {MESSAGE_VARIABLES.map((v) => (
          <button key={v} onClick={() => insert(v)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-3 hover:border-blue-500/50 hover:text-blue-300">
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-fg-4 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  )
}

/** Simulação do WhatsApp com um lead de exemplo. */
function Preview({ funnel }: { funnel: Funnel }) {
  const settings = useApp((s) => s.settings)
  const [variant, setVariant] = useState(0)
  return (
    <div className="h-fit rounded-xl border border-line bg-[#0b141a] p-3 xl:sticky xl:top-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-2xs font-medium text-[#8696a0]">Prévia · Padaria Sol Nascente</p>
        <button onClick={() => setVariant((v) => v + 1)} className="text-[10px] text-[#53bdeb] hover:underline">
          Trocar variação
        </button>
      </div>
      <div className="space-y-1.5">
        {funnel.etapas.map((s) => {
          if (s.tipo === 'espera')
            return (
              <p key={s.id} className="py-0.5 text-center text-[10px] text-[#8696a0]">
                ⏱ {s.valor} {s.unidade}
              </p>
            )
          const vs = s.variacoes.filter((v) => v.trim())
          if (!vs.length) return null
          const text = fillMessage(vs[variant % vs.length], SAMPLE_LEAD, settings)
          return (
            <div key={s.id} className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 text-[12px] leading-[17px] whitespace-pre-wrap text-[#e9edef]">
              {text}
              <span className="mt-0.5 block text-right text-[9px] text-[#ffffff99]">✓✓</span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-[#8696a0]">Variáveis sem dado somem da frase (ex.: sem responsável, "Bom dia, {'{responsavel}'}!" vira "Bom dia!").</p>
    </div>
  )
}
