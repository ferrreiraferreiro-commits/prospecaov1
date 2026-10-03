import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, Copy, FilePlus2, ListChecks, MessageSquareQuote, Plus, RotateCcw, Save, ScrollText, Tags, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Segmented } from '../components/ui'
import { newId } from '../data/repository'
import { DEFAULT_OBJECTIONS, DEFAULT_SCRIPT, fillTemplate, getActiveRoteiro, getRoteiros, toBlocks } from '../lib/script'
import { statsByRoteiro } from '../lib/selectors'
import { DEFAULT_STATUS2, getStatus2Options } from '../lib/status2'
import { CALL_RESULTS, STATUS_DEFAULTS, STATUSES, TONE_CLASSES, TONES, type Tone } from '../lib/statuses'
import type { Lead, Objection, Roteiro, ScriptSection, Settings, StatusCustom, StatusId } from '../lib/types'
import { useApp } from '../store/useApp'

type Aba = 'roteiros' | 'status'

export function RoteirosPage() {
  const [params, setParams] = useSearchParams()
  const aba: Aba = params.get('aba') === 'status' ? 'status' : 'roteiros'
  return (
    <div className="space-y-4">
      <PageHeader
        title="Roteiros"
        subtitle="O que falar em cada ligação, as respostas para as objeções e os status de acompanhamento."
        actions={
          <Segmented
            value={aba}
            onChange={(v) => setParams(v === 'status' ? { aba: 'status' } : {}, { replace: true })}
            options={[
              {
                id: 'roteiros',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ScrollText className="size-3.5" /> Roteiros de ligação
                  </span>
                ),
              },
              {
                id: 'status',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Tags className="size-3.5" /> Status
                  </span>
                ),
              },
            ]}
          />
        }
      />
      {aba === 'roteiros' ? <RoteirosEditor /> : <StatusEditor />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Roteiros
// ---------------------------------------------------------------------------

const SCRIPT_VARS = ['{nome}', '{empresa}', '{cidade}', '{nicho}', '{servico}']

function blankRoteiro(nome: string, fromDefault: boolean): Roteiro {
  return {
    id: newId(),
    nome,
    secoes: fromDefault ? structuredClone(DEFAULT_SCRIPT).map((s) => ({ ...s, id: newId() })) : [{ id: newId(), titulo: 'Abertura', texto: '' }],
    objecoes: fromDefault ? structuredClone(DEFAULT_OBJECTIONS).map((o) => ({ ...o, id: newId() })) : [],
  }
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

function RoteirosEditor() {
  const settings = useApp((s) => s.settings)
  const interactions = useApp((s) => s.interactions)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)

  const saved = getRoteiros(settings)
  const [list, setList] = useState<Roteiro[]>(() => structuredClone(saved))
  const [ativoId, setAtivoId] = useState(() => getActiveRoteiro(settings).id)
  const [selectedId, setSelectedId] = useState(ativoId)
  const [tab, setTab] = useState<'etapas' | 'objecoes' | 'previa'>('etapas')
  const [newMenu, setNewMenu] = useState(false)
  const dirty = JSON.stringify(list) !== JSON.stringify(saved) || ativoId !== getActiveRoteiro(settings).id

  const selected = list.find((r) => r.id === selectedId) ?? list[0]
  const stats = useMemo(() => new Map(statsByRoteiro(interactions, saved[0]?.id ?? '', settings.metricas_desde).map((s) => [s.roteiroId, s])), [interactions, saved, settings.metricas_desde])

  function update(patch: Partial<Roteiro>) {
    setList((l) => l.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)))
  }
  const setSecoes = (secoes: ScriptSection[]) => update({ secoes })
  const setObjecoes = (objecoes: Objection[]) => update({ objecoes })

  async function persist(nextList: Roteiro[], nextAtivo: string, message: string) {
    const clean = nextList.map((r) => ({
      ...r,
      nome: r.nome.trim() || 'Sem nome',
      secoes: r.secoes.filter((s) => s.titulo.trim() || s.texto.trim()),
      objecoes: r.objecoes.filter((o) => o.titulo.trim() && o.resposta.trim()),
    }))
    await saveSettings({ ...settings, roteiros: clean, roteiro_ativo: nextAtivo, roteiro: null, objecoes: null })
    setList(structuredClone(clean))
    toast(message)
  }

  function add(kind: 'padrao' | 'branco' | 'copia') {
    const r =
      kind === 'copia'
        ? { ...structuredClone(selected), id: newId(), nome: `${selected.nome} (cópia)` }
        : blankRoteiro(`Roteiro ${list.length + 1}`, kind === 'padrao')
    setList((l) => [...l, r])
    setSelectedId(r.id)
    setTab('etapas')
    setNewMenu(false)
  }

  async function remove() {
    if (list.length <= 1) return
    if (!confirmAction(`Excluir o roteiro "${selected.nome}"? As ligações feitas com ele continuam no histórico.`)) return
    const next = list.filter((r) => r.id !== selected.id)
    const nextAtivo = ativoId === selected.id ? next[0].id : ativoId
    setAtivoId(nextAtivo)
    setSelectedId(next[0].id)
    await persist(next, nextAtivo, 'Roteiro excluído.')
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
      {/* Lista */}
      <aside className="panel h-fit">
        <div className="relative border-b border-line-soft p-2.5">
          <Button variant="primary" className="w-full" icon={<Plus className="size-3.5" />} onClick={() => setNewMenu((o) => !o)}>
            Novo roteiro
          </Button>
          {newMenu && (
            <div className="anim-rise absolute inset-x-2.5 top-full z-10 mt-1 rounded-lg border border-line bg-raised p-1 shadow-xl">
              <MenuOption icon={<FilePlus2 />} title="Em branco" detail="Começa só com a abertura" onClick={() => add('branco')} />
              <MenuOption icon={<ScrollText />} title="A partir do padrão" detail="Etapas e objeções prontas para ajustar" onClick={() => add('padrao')} />
              <MenuOption icon={<Copy />} title={`Cópia de "${selected.nome}"`} detail="Para testar uma variação" onClick={() => add('copia')} />
            </div>
          )}
        </div>
        <ul className="space-y-1 p-1.5">
          {list.map((r) => {
            const st = stats.get(r.id)
            return (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={clsx(
                    'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                    r.id === selected.id ? 'bg-blue-500/[0.12] ring-1 ring-blue-500/30 ring-inset' : 'hover:bg-tint/[0.04]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">{r.nome || 'Sem nome'}</span>
                    {r.id === ativoId && <span className="rounded bg-go/15 px-1.5 text-[10px] leading-4 font-medium text-emerald-300">em uso</span>}
                  </div>
                  <p className="mt-0.5 text-2xs text-fg-3">
                    {r.secoes.length} etapa(s) · {r.objecoes.length} objeção(ões)
                  </p>
                  {st && st.ligacoes > 0 ? (
                    <p className="num mt-1 text-2xs text-fg-2">
                      {st.ligacoes} ligações · {pct(st.taxaContato)} atenderam · {st.reunioes} reuniões
                    </p>
                  ) : (
                    <p className="mt-1 text-2xs text-fg-4">Ainda sem ligações</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-line-soft px-3 py-2.5 text-2xs text-fg-4">Os números mostram qual roteiro faz mais gente atender e marcar reunião.</p>
      </aside>

      {/* Editor */}
      <section className="panel min-w-0">
        <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <input className="input h-9 max-w-xs text-sm font-semibold" value={selected.nome} onChange={(e) => update({ nome: e.target.value })} aria-label="Nome do roteiro" />
          {selected.id === ativoId ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
              <Check className="size-3.5" /> Em uso nas ligações
            </span>
          ) : (
            <Button size="sm" variant="go" icon={<Check className="size-3.5" />} onClick={() => setAtivoId(selected.id)}>
              Usar nas ligações
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() =>
                confirmAction('Trocar o texto deste roteiro pelo padrão?') &&
                update({ secoes: structuredClone(DEFAULT_SCRIPT).map((s) => ({ ...s, id: newId() })), objecoes: structuredClone(DEFAULT_OBJECTIONS).map((o) => ({ ...o, id: newId() })) })
              }
            >
              Texto padrão
            </Button>
            {list.length > 1 && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => void remove()}>
                Excluir
              </Button>
            )}
          </div>
        </header>

        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'etapas', label: `Etapas (${selected.secoes.length})` },
              { id: 'objecoes', label: `Objeções (${selected.objecoes.length})` },
              { id: 'previa', label: 'Prévia' },
            ]}
          />
        </div>

        <div className="p-4">
          {tab === 'etapas' && (
            <div className="space-y-2.5">
              <p className="text-2xs text-fg-3">
                Escreva como você fala. Linhas começando com <code className="rounded bg-tint/[0.06] px-1 text-fg-2">- </code> viram tópicos na hora da ligação.
              </p>
              {selected.secoes.map((sec, i) => (
                <ItemCard
                  key={sec.id}
                  index={i + 1}
                  title={sec.titulo}
                  titlePlaceholder="Nome da etapa"
                  onTitle={(t) => setSecoes(selected.secoes.map((s) => (s.id === sec.id ? { ...s, titulo: t } : s)))}
                  text={sec.texto}
                  textPlaceholder="O que falar nesta etapa…"
                  onText={(t) => setSecoes(selected.secoes.map((s) => (s.id === sec.id ? { ...s, texto: t } : s)))}
                  onUp={i > 0 ? () => setSecoes(move(selected.secoes, i, -1)) : undefined}
                  onDown={i < selected.secoes.length - 1 ? () => setSecoes(move(selected.secoes, i, 1)) : undefined}
                  onRemove={() => setSecoes(selected.secoes.filter((s) => s.id !== sec.id))}
                  vars
                />
              ))}
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setSecoes([...selected.secoes, { id: newId(), titulo: '', texto: '' }])}>
                Adicionar etapa
              </Button>
            </div>
          )}

          {tab === 'objecoes' && (
            <div className="space-y-2.5">
              <p className="text-2xs text-fg-3">O que o cliente costuma dizer e a sua resposta. Na ligação elas ficam a um clique.</p>
              {selected.objecoes.map((o, i) => (
                <ItemCard
                  key={o.id}
                  index={i + 1}
                  title={o.titulo}
                  titlePlaceholder='O cliente diz… (ex.: "Está caro")'
                  onTitle={(t) => setObjecoes(selected.objecoes.map((x) => (x.id === o.id ? { ...x, titulo: t } : x)))}
                  text={o.resposta}
                  textPlaceholder="Sua resposta…"
                  onText={(t) => setObjecoes(selected.objecoes.map((x) => (x.id === o.id ? { ...x, resposta: t } : x)))}
                  onUp={i > 0 ? () => setObjecoes(move(selected.objecoes, i, -1)) : undefined}
                  onDown={i < selected.objecoes.length - 1 ? () => setObjecoes(move(selected.objecoes, i, 1)) : undefined}
                  onRemove={() => setObjecoes(selected.objecoes.filter((x) => x.id !== o.id))}
                  vars
                />
              ))}
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setObjecoes([...selected.objecoes, { id: newId(), titulo: '', resposta: '' }])}>
                Adicionar objeção
              </Button>
            </div>
          )}

          {tab === 'previa' && <Preview roteiro={selected} />}
        </div>

        <footer className="sticky bottom-16 flex items-center justify-end gap-3 rounded-b-[10px] border-t border-line-soft bg-panel px-4 py-3 lg:bottom-0">
          {dirty && <span className="text-2xs text-amber-300">Alterações não salvas</span>}
          <Button variant="primary" icon={<Save className="size-3.5" />} disabled={!dirty} onClick={() => void persist(list, ativoId, 'Roteiros salvos.')}>
            Salvar roteiros
          </Button>
        </footer>
      </section>
    </div>
  )
}

function MenuOption({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-tint/[0.05]">
      <span className="mt-0.5 text-blue-400 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-fg">{title}</span>
        <span className="block text-2xs text-fg-3">{detail}</span>
      </span>
    </button>
  )
}

/** Cartão de etapa/objeção: título, texto, variáveis e ordem. */
function ItemCard({
  index,
  title,
  titlePlaceholder,
  onTitle,
  text,
  textPlaceholder,
  onText,
  onUp,
  onDown,
  onRemove,
  vars,
}: {
  index: number
  title: string
  titlePlaceholder: string
  onTitle: (v: string) => void
  text: string
  textPlaceholder: string
  onText: (v: string) => void
  onUp?: () => void
  onDown?: () => void
  onRemove: () => void
  vars?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function insert(token: string) {
    const el = ref.current
    if (!el) return onText(text + token)
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    onText(text.slice(0, start) + token + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <div className="rounded-lg border border-line-soft bg-raised">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="num flex size-5 shrink-0 items-center justify-center rounded bg-blue-500/15 text-[10px] font-semibold text-blue-300">{index}</span>
        <input className="input h-7 font-medium" value={title} onChange={(e) => onTitle(e.target.value)} placeholder={titlePlaceholder} aria-label="Título" />
        <div className="flex shrink-0 items-center">
          <IconBtn label="Subir" onClick={onUp}>
            <ArrowUp />
          </IconBtn>
          <IconBtn label="Descer" onClick={onDown}>
            <ArrowDown />
          </IconBtn>
          <IconBtn label="Remover" onClick={onRemove}>
            <X />
          </IconBtn>
        </div>
      </div>
      <div className="px-3 pt-2 pb-2.5">
        <textarea
          ref={ref}
          className="input resize-y"
          rows={Math.min(8, Math.max(2, text.split('\n').length + 1))}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder={textPlaceholder}
        />
        {vars && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SCRIPT_VARS.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-3 hover:border-blue-500/50 hover:text-blue-300">
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-fg-4 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-25 [&_svg]:size-3.5"
    >
      {children}
    </button>
  )
}

const SAMPLE: Lead = {
  id: 'exemplo',
  empresa: 'PADARIA SOL NASCENTE',
  nicho: 'Padaria',
  telefone: null,
  whatsapp: null,
  instagram: null,
  website: null,
  endereco: null,
  cidade: 'Poços de Caldas',
  estado: 'MG',
  avaliacao: null,
  numero_avaliacoes: null,
  pasta: null,
  etapa: null,
  maps_url: null,
  observacoes: null,
  dados_extras: null,
  import_id: null,
  status: 'novo',
  falei_com: null,
  cargo: null,
  anotacoes: null,
  proxima_acao: null,
  ultima_ligacao: null,
  duplicado_ignorado: false,
  created_at: '',
  updated_at: '',
}

/** Como o roteiro aparece no Modo Ligação, com um lead de exemplo. */
function Preview({ roteiro }: { roteiro: Roteiro }) {
  const settings = useApp((s) => s.settings)
  const [step, setStep] = useState(0)
  const [obj, setObj] = useState<string | null>(null)
  const secoes = roteiro.secoes.filter((s) => s.titulo.trim() || s.texto.trim())
  const objecao = roteiro.objecoes.find((o) => o.id === obj)
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
      <div>
        <p className="mb-2 text-2xs text-fg-3">Exemplo com "Padaria Sol Nascente, Poços de Caldas". Clique numa etapa para destacá-la, como no Modo Ligação.</p>
        <ol className="space-y-2">
          {secoes.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setStep(i)}
                className={clsx(
                  'w-full rounded-lg border px-4 py-3 text-left transition-all',
                  i === step ? 'border-blue-500/40 bg-blue-500/[0.07]' : 'border-line-soft opacity-55 hover:opacity-80',
                )}
              >
                <p className="text-2xs font-semibold tracking-wide text-blue-300 uppercase">{s.titulo || `Etapa ${i + 1}`}</p>
                <div className={clsx('mt-1 space-y-1.5', i === step ? 'text-[15px] leading-6 text-fg' : 'text-xs text-fg-2')}>
                  {toBlocks(fillTemplate(s.texto, SAMPLE, settings)).map((b, k) =>
                    b.kind === 'list' ? (
                      <ul key={k} className="list-disc space-y-0.5 pl-5">
                        {b.lines.map((l, x) => (
                          <li key={x}>{l}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={k}>{b.lines.join(' ')}</p>
                    ),
                  )}
                </div>
              </button>
            </li>
          ))}
          {!secoes.length && <p className="py-8 text-center text-xs text-fg-3">Este roteiro ainda não tem etapas.</p>}
        </ol>
      </div>
      <div className="h-fit rounded-lg border border-line-soft bg-ink p-3">
        <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold text-fg-2">
          <MessageSquareQuote className="size-3.5" /> Objeções
        </p>
        <div className="flex flex-wrap gap-1">
          {roteiro.objecoes
            .filter((o) => o.titulo.trim())
            .map((o) => (
              <button
                key={o.id}
                onClick={() => setObj(obj === o.id ? null : o.id)}
                className={clsx('rounded-md border px-2 py-1 text-2xs', obj === o.id ? 'border-blue-500/50 bg-blue-500/10 text-fg' : 'border-line text-fg-3 hover:text-fg')}
              >
                {o.titulo}
              </button>
            ))}
        </div>
        {objecao && <p className="mt-2.5 rounded-md bg-raised p-2.5 text-xs leading-5 text-fg">{fillTemplate(objecao.resposta, SAMPLE, settings)}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status 1 e Status 2
// ---------------------------------------------------------------------------

function StatusEditor() {
  return (
    <div className="grid items-start gap-3 2xl:grid-cols-[1.35fr_1fr]">
      <Status1Editor />
      <Status2Editor />
    </div>
  )
}

type Draft1 = Record<StatusId, { label: string; callLabel: string; tone: Tone; oculto: boolean }>

function currentStatus1(custom: Settings['status1']): Draft1 {
  return Object.fromEntries(STATUSES.map((st) => [st.id, { label: st.label, callLabel: st.callLabel, tone: st.tone, oculto: !!custom?.[st.id]?.oculto }])) as Draft1
}

const TONE_NAME: Record<Tone, string> = {
  neutral: 'Cinza',
  muted: 'Apagado',
  yellow: 'Amarelo',
  orange: 'Laranja',
  red: 'Vermelho',
  blue: 'Azul',
  sky: 'Céu',
  teal: 'Verde-água',
  green: 'Verde',
  gold: 'Dourado',
}

/** Status principal: os 12 resultados de ligação. Dá para renomear, trocar a cor e esconder da ligação. */
function Status1Editor() {
  const settings = useApp((s) => s.settings)
  const leads = useApp((s) => s.leads)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const saved = useMemo(() => currentStatus1(settings.status1), [settings.status1])
  const [draft, setDraft] = useState<Draft1>(saved)
  const [colorFor, setColorFor] = useState<StatusId | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const uso = useMemo(() => {
    const m = new Map<StatusId, number>()
    for (const l of leads) m.set(l.status, (m.get(l.status) ?? 0) + 1)
    return m
  }, [leads])
  const set = (id: StatusId, patch: Partial<Draft1[StatusId]>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  async function save() {
    // Só guarda o que difere do original
    const custom: Partial<Record<StatusId, StatusCustom>> = {}
    for (const st of STATUSES) {
      const d = draft[st.id]
      const base = STATUS_DEFAULTS[st.id]
      const c: StatusCustom = {}
      if (d.label.trim() && d.label.trim() !== base.label) c.label = d.label.trim()
      if (d.callLabel.trim() && d.callLabel.trim() !== base.callLabel) c.callLabel = d.callLabel.trim()
      if (d.tone !== base.tone) c.tone = d.tone
      if (d.oculto) c.oculto = true
      if (Object.keys(c).length) custom[st.id] = c
    }
    const next = Object.keys(custom).length ? custom : null
    await saveSettings({ ...settings, status1: next })
    setDraft(currentStatus1(next))
    toast('Status 1 salvo.')
  }

  return (
    <section className="panel">
      <header className="border-b border-line-soft px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Tags className="size-4 text-blue-400" /> Status 1 · resultado da ligação
        </h2>
        <p className="mt-0.5 text-xs text-fg-3">
          O status principal do lead. Renomeie, troque a cor e escolha quais aparecem em "Como foi a ligação?". As regras (atendeu, sem resposta, retorno) continuam as mesmas.
        </p>
      </header>
      <div className="hidden grid-cols-[1.2fr_1.2fr_9rem_5.5rem_3rem] gap-2 border-b border-line-soft px-4 py-1.5 text-[10px] font-medium text-fg-4 uppercase sm:grid">
        <span>Nome do status</span>
        <span>Botão na ligação</span>
        <span>Cor</span>
        <span>Na ligação</span>
        <span className="text-right">Leads</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {STATUSES.map((st) => {
          const d = draft[st.id]
          const inCall = CALL_RESULTS.includes(st.id)
          return (
            <li key={st.id} className="grid grid-cols-2 items-center gap-2 px-4 py-2 sm:grid-cols-[1.2fr_1.2fr_9rem_5.5rem_3rem]">
              <input className="input h-8" value={d.label} onChange={(e) => set(st.id, { label: e.target.value })} aria-label="Nome do status" placeholder={STATUS_DEFAULTS[st.id].label} />
              {inCall ? (
                <input
                  className="input h-8"
                  value={d.callLabel}
                  onChange={(e) => set(st.id, { callLabel: e.target.value })}
                  aria-label="Texto do botão na ligação"
                  placeholder={STATUS_DEFAULTS[st.id].callLabel}
                />
              ) : (
                <span className="text-2xs text-fg-4">{st.id === 'novo' ? 'Status de entrada' : 'Só pela ficha do lead'}</span>
              )}
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setColorFor(colorFor === st.id ? null : st.id)}
                  className={clsx('inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-[5px] px-2 text-2xs font-medium ring-1 ring-inset', TONE_CLASSES[d.tone].chip)}
                  title="Trocar a cor"
                >
                  <span className={clsx('size-1.5 shrink-0 rounded-full', TONE_CLASSES[d.tone].dot)} />
                  <span className="truncate">{d.label || STATUS_DEFAULTS[st.id].label}</span>
                </button>
                {colorFor === st.id && (
                  <div className="anim-rise absolute top-full left-0 z-20 mt-1 grid w-44 grid-cols-5 gap-1 rounded-lg border border-line bg-raised p-2 shadow-xl">
                    {TONES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        title={TONE_NAME[t]}
                        aria-label={TONE_NAME[t]}
                        onClick={() => {
                          set(st.id, { tone: t })
                          setColorFor(null)
                        }}
                        className={clsx('flex size-7 items-center justify-center rounded-md ring-1 ring-inset', TONE_CLASSES[t].chip, d.tone === t && 'ring-2 ring-fg')}
                      >
                        <span className={clsx('size-2.5 rounded-full', TONE_CLASSES[t].dot)} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {inCall ? (
                <label className="flex items-center gap-1.5 text-2xs text-fg-2">
                  <input type="checkbox" checked={!d.oculto} onChange={(e) => set(st.id, { oculto: !e.target.checked })} />
                  {d.oculto ? 'Oculto' : 'Aparece'}
                </label>
              ) : (
                <span />
              )}
              <span className="num text-right text-2xs text-fg-3">{uso.get(st.id) ?? 0}</span>
            </li>
          )
        })}
      </ul>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => setDraft(Object.fromEntries(STATUSES.map((st) => [st.id, { ...STATUS_DEFAULTS[st.id], oculto: false }])) as Draft1)}
        >
          Nomes e cores originais
        </Button>
        <span className="ml-auto text-2xs text-amber-300">{dirty ? 'Alterações não salvas' : ''}</span>
        <Button variant="primary" icon={<Save className="size-3.5" />} disabled={!dirty} onClick={() => void save()}>
          Salvar Status 1
        </Button>
      </footer>
    </section>
  )
}

/** Status 2: acompanhamento depois da ligação, lista livre. */
function Status2Editor() {
  const settings = useApp((s) => s.settings)
  const leads = useApp((s) => s.leads)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const saved = getStatus2Options(settings)
  const [list, setList] = useState<string[]>(saved)
  const [novo, setNovo] = useState('')
  const dirty = JSON.stringify(list) !== JSON.stringify(saved)
  const uso = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) if (l.status2) m.set(l.status2, (m.get(l.status2) ?? 0) + 1)
    return m
  }, [leads])

  function add() {
    const v = novo.trim()
    if (!v) return
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return toast('Esse status já existe.', 'error')
    setList([...list, v])
    setNovo('')
  }

  async function save() {
    const clean = [...new Set(list.map((x) => x.trim()).filter(Boolean))]
    await saveSettings({ ...settings, status2_opcoes: clean.length ? clean : null })
    setList(clean.length ? clean : DEFAULT_STATUS2)
    toast('Status 2 salvo.')
  }

  return (
    <section className="panel">
      <header className="border-b border-line-soft px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <ListChecks className="size-4 text-blue-400" /> Status 2 · acompanhamento
        </h2>
        <p className="mt-0.5 text-xs text-fg-3">
          O segundo status do lead, para o que acontece depois da ligação (mensagem enviada, proposta, negociação…). Aparece ao lado do status principal e nos filtros.
        </p>
      </header>
      <ul className="divide-y divide-line-soft">
        {list.map((s, i) => (
          <li key={i} className="flex items-center gap-2 px-4 py-2">
            <span className="num w-5 text-2xs text-fg-4">{i + 1}</span>
            <input className="input h-8" value={s} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Status ${i + 1}`} />
            <span className="num w-20 shrink-0 text-right text-2xs text-fg-3">{uso.get(s) ? `${uso.get(s)} lead(s)` : '—'}</span>
            <IconBtn label="Subir" onClick={i > 0 ? () => setList(move(list, i, -1)) : undefined}>
              <ArrowUp />
            </IconBtn>
            <IconBtn label="Descer" onClick={i < list.length - 1 ? () => setList(move(list, i, 1)) : undefined}>
              <ArrowDown />
            </IconBtn>
            <IconBtn label="Remover" onClick={() => setList(list.filter((_, j) => j !== i))}>
              <Trash2 />
            </IconBtn>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5 border-t border-line-soft px-4 py-3">
        <input className="input" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Novo status (ex.: Pediu orçamento)" />
        <Button icon={<Plus className="size-3.5" />} onClick={add} disabled={!novo.trim()}>
          Adicionar
        </Button>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setList(DEFAULT_STATUS2)}>
          Restaurar padrão
        </Button>
        <span className="ml-auto text-2xs text-fg-4">{dirty ? <span className="text-amber-300">Alterações não salvas</span> : 'Leads que já usam um status removido continuam com ele.'}</span>
        <Button variant="primary" icon={<Save className="size-3.5" />} disabled={!dirty} onClick={() => void save()}>
          Salvar Status 2
        </Button>
      </footer>
    </section>
  )
}
