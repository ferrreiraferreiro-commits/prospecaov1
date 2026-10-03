import clsx from 'clsx'
import { CalendarDays, Check, FolderKanban, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Field, NumberInput, SearchInput, Stat, confirmAction } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Modal, Progress } from '../components/ui'
import { newId } from '../data/repository'
import { PROJECT_PRIORITY, PROJECT_STATUS, projectProgress, type Project, type ProjectStatus } from '../lib/biz'
import { formatDateKeyShort, todayKey } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { normalizeKey } from '../lib/statuses'
import { blankPayment, blankProject, useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'

export function ProjetosPage() {
  const projects = useBiz((s) => s.projects)
  const clients = useBiz((s) => s.clients)
  const saveProject = useBiz((s) => s.saveProject)
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [editing, setEditing] = useState<Project | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<ProjectStatus | null>(null)

  // Abre direto pelo link ?p=<id> (vindo da ficha do cliente)
  useEffect(() => {
    const id = params.get('p')
    if (!id) return
    const p = projects.find((x) => x.id === id)
    if (p) setEditing(p)
    setParams({}, { replace: true })
  }, [params, projects, setParams])

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.nome])), [clients])
  const visiveis = useMemo(() => {
    const q = normalizeKey(busca)
    return projects.filter((p) => !q || normalizeKey(`${p.nome} ${p.client_id ? clientName.get(p.client_id) ?? '' : ''}`).includes(q))
  }, [projects, busca, clientName])

  const ativos = projects.filter((p) => p.status === 'em_andamento' || p.status === 'planejamento' || p.status === 'revisao')
  const today = todayKey()
  const atrasados = ativos.filter((p) => p.prazo && p.prazo < today).length
  const carteira = ativos.reduce((s, p) => s + p.orcamento, 0)
  const concluidos = projects.filter((p) => p.status === 'concluido').length

  function move(id: string, status: ProjectStatus) {
    const p = projects.find((x) => x.id === id)
    if (p && p.status !== status) void saveProject({ ...p, status })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projetos"
        subtitle="Arraste os cartões entre as colunas para mudar a etapa."
        actions={
          <>
            <SearchInput value={busca} onChange={setBusca} placeholder="Buscar projeto ou cliente…" />
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(blankProject({ status: 'planejamento' }))}>
              Novo projeto
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Em andamento" value={ativos.length} icon={<FolderKanban />} />
        <Stat label="Carteira ativa" value={formatMoney(carteira)} tone="blue" hint="Orçamento dos projetos abertos" />
        <Stat label="Prazo vencido" value={atrasados} tone={atrasados ? 'bad' : 'default'} icon={<CalendarDays />} />
        <Stat label="Concluídos" value={concluidos} tone="go" />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[1100px] grid-cols-5 gap-2.5">
          {PROJECT_STATUS.map((col) => {
            const items = visiveis.filter((p) => p.status === col.id).sort((a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999'))
            const total = items.reduce((s, p) => s + p.orcamento, 0)
            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(col.id)
                }}
                onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={() => {
                  if (dragId) move(dragId, col.id)
                  setDragId(null)
                  setOver(null)
                }}
                className={clsx('flex min-h-[420px] flex-col rounded-[10px] border bg-panel/60 transition-colors', over === col.id ? 'border-blue-500/50 bg-blue-500/[0.04]' : 'border-line-soft')}
              >
                <header className="flex items-center gap-2 px-3 py-2.5">
                  <span className={clsx('size-2 rounded-full', col.tone)} />
                  <h2 className="text-xs font-semibold">{col.label}</h2>
                  <span className="num rounded bg-tint/[0.06] px-1.5 text-2xs leading-[18px] text-fg-2">{items.length}</span>
                  {total > 0 && <span className="num ml-auto text-2xs text-fg-4">{formatMoney(total)}</span>}
                </header>
                <div className="flex-1 space-y-1.5 px-2 pb-2">
                  {items.map((p) => {
                    const prog = projectProgress(p)
                    const late = p.prazo && p.prazo < today && p.status !== 'concluido' && p.status !== 'cancelado'
                    return (
                      <article
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setEditing(p)}
                        className={clsx(
                          'group cursor-pointer rounded-lg border border-line-soft bg-raised p-2.5 transition-colors hover:border-line-strong',
                          dragId === p.id && 'opacity-40',
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <p className="min-w-0 flex-1 text-xs leading-4 font-medium text-fg">{p.nome}</p>
                          <GripVertical className="size-3.5 shrink-0 text-fg-4 opacity-0 group-hover:opacity-100" />
                        </div>
                        {p.client_id && <p className="mt-0.5 truncate text-2xs text-fg-3">{clientName.get(p.client_id) ?? 'Cliente removido'}</p>}
                        {p.tarefas.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={prog} max={100} tone={prog === 100 ? 'go' : 'accent'} className="flex-1" />
                            <span className="num text-[10px] text-fg-3">
                              {p.tarefas.filter((t) => t.feito).length}/{p.tarefas.length}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2 text-2xs">
                          <span className={PROJECT_PRIORITY[p.prioridade].cls}>{PROJECT_PRIORITY[p.prioridade].label}</span>
                          {p.prazo && <span className={clsx('num', late ? 'text-red-300' : 'text-fg-3')}>· {formatDateKeyShort(p.prazo)}</span>}
                          {p.orcamento > 0 && <span className="num ml-auto text-fg-2">{formatMoney(p.orcamento)}</span>}
                        </div>
                      </article>
                    )
                  })}
                  {items.length === 0 && <p className="px-2 py-6 text-center text-2xs text-fg-4">Solte um projeto aqui</p>}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {editing && <ProjectModal key={editing.id} project={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const clients = useBiz((s) => s.clients)
  const exists = useBiz((s) => s.projects.some((p) => p.id === project.id))
  const { saveProject, deleteProject, savePayment } = useBiz.getState()
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<Project>(project)
  const [task, setTask] = useState('')
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setD((x) => ({ ...x, [k]: v }))

  async function save(close = true) {
    if (!d.nome.trim()) {
      toast('Dê um nome ao projeto.', 'error')
      return false
    }
    await saveProject({ ...d, nome: d.nome.trim() })
    if (close) {
      toast('Projeto salvo.')
      onClose()
    }
    return true
  }

  function addTask() {
    if (!task.trim()) return
    set('tarefas', [...d.tarefas, { id: newId(), texto: task.trim(), feito: false }])
    setTask('')
  }

  async function cobrar(fracao: number) {
    if (!d.client_id) return toast('Escolha o cliente do projeto antes de lançar a cobrança.', 'error')
    if (!(d.orcamento > 0)) return toast('Informe o orçamento do projeto.', 'error')
    if (!(await save(false))) return
    await savePayment(
      blankPayment(d.client_id, {
        project_id: d.id,
        valor: Math.round(d.orcamento * fracao * 100) / 100,
        descricao: fracao === 1 ? `${d.nome}` : `${d.nome} · entrada ${Math.round(fracao * 100)}%`,
      }),
    )
    toast('Cobrança lançada como pendente na ficha do cliente.')
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={exists ? 'Editar projeto' : 'Novo projeto'}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (!confirmAction('Excluir este projeto?')) return
                await deleteProject(project.id)
                toast('Projeto excluído.')
                onClose()
              }}
            >
              Excluir
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              Salvar projeto
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <Field label="Nome do projeto *" className="sm:col-span-2">
          <input className="input" autoFocus value={d.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Site institucional da Padaria Sol" />
        </Field>
        <Field label="Cliente">
          <select className="input" value={d.client_id ?? ''} onChange={(e) => set('client_id', e.target.value || null)}>
            <option value="">Sem cliente</option>
            {clients
              .filter((c) => !c.arquivado || c.id === d.client_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Etapa">
          <select className="input" value={d.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {PROJECT_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orçamento">
          <NumberInput prefix="R$" value={d.orcamento || null} onChange={(v) => set('orcamento', v ?? 0)} min={0} />
        </Field>
        <Field label="Prazo">
          <input type="date" className="input" value={d.prazo ?? ''} onChange={(e) => set('prazo', e.target.value || null)} />
        </Field>
        <Field label="Prioridade" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PROJECT_PRIORITY) as Project['prioridade'][]).map((p) => (
              <button
                key={p}
                onClick={() => set('prioridade', p)}
                className={clsx(
                  'h-7 rounded-md border px-3 text-xs font-medium transition-colors',
                  d.prioridade === p ? 'border-blue-500/50 bg-blue-500/10 text-fg' : 'border-line text-fg-3 hover:text-fg-2',
                )}
              >
                {PROJECT_PRIORITY[p].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Descrição / escopo" className="sm:col-span-2">
          <textarea className="input" rows={3} value={d.descricao ?? ''} onChange={(e) => set('descricao', e.target.value || null)} />
        </Field>

        <div className="sm:col-span-2">
          <p className="label">Tarefas {d.tarefas.length > 0 && `· ${projectProgress(d)}% concluído`}</p>
          <ul className="space-y-1">
            {d.tarefas.map((t) => (
              <li key={t.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-tint/[0.03]">
                <button
                  onClick={() => set('tarefas', d.tarefas.map((x) => (x.id === t.id ? { ...x, feito: !x.feito } : x)))}
                  className={clsx('flex size-4 shrink-0 items-center justify-center rounded border', t.feito ? 'border-go bg-go text-ink' : 'border-line-strong')}
                  aria-label="Marcar tarefa"
                >
                  {t.feito && <Check className="size-3" strokeWidth={3} />}
                </button>
                <span className={clsx('flex-1 text-xs', t.feito ? 'text-fg-4 line-through' : 'text-fg')}>{t.texto}</span>
                <button onClick={() => set('tarefas', d.tarefas.filter((x) => x.id !== t.id))} className="text-fg-4 opacity-0 group-hover:opacity-100 hover:text-red-300" aria-label="Remover tarefa">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-1.5">
            <input
              className="input"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTask())}
              placeholder="Nova tarefa (Enter para adicionar)"
            />
            <Button onClick={addTask} disabled={!task.trim()}>
              Adicionar
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-line-soft bg-ink p-3 sm:col-span-2">
          <p className="text-xs font-medium text-fg">Cobrança</p>
          <p className="mt-0.5 text-2xs text-fg-3">Lança um pagamento pendente na ficha do cliente. Quando marcado como pago, vira receita no Financeiro.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void cobrar(0.5)}>
              Entrada de 50%
            </Button>
            <Button size="sm" onClick={() => void cobrar(1)}>
              Valor total
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
