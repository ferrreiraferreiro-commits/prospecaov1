import clsx from 'clsx'
import { Archive, ArchiveRestore, Check, ExternalLink, FolderKanban, Phone, Plus, StickyNote, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { newId, nowIso } from '../data/repository'
import { PAYMENT_METHODS, PROJECT_STATUS, type Client, type ClientNote, type ClientPayment } from '../lib/biz'
import { formatPhone, telHref, websiteHref, whatsappHref } from '../lib/contact'
import { formatDateKey, todayKey } from '../lib/dates'
import { formatMoney } from '../lib/insights'
import { blankPayment, blankProject, useBiz } from '../store/useBiz'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Avatar } from './Avatar'
import { Field, NumberInput, confirmAction } from './kit'
import { Button, Drawer, Segmented, WhatsAppIcon } from './ui'

type Tab = 'dados' | 'pagamentos' | 'projetos' | 'notas'

export function ClientDrawer({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const client = useBiz((s) => s.clients.find((c) => c.id === clientId) ?? null)
  const [tab, setTab] = useState<Tab>('dados')
  useEffect(() => setTab('dados'), [clientId])
  if (!client) return null
  return (
    <Drawer open={!!client} onClose={onClose} width="sm:w-[600px]">
      <header className="flex items-start gap-3 border-b border-line-soft px-5 pt-4 pb-3">
        <Avatar src={null} name={client.nome || '?'} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{client.nome || 'Novo cliente'}</h2>
          <p className="truncate text-xs text-fg-3">
            {[client.empresa, client.segmento].filter(Boolean).join(' · ') || 'Cliente'}
            {client.arquivado && ' · arquivado'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
          <X className="size-4" />
        </button>
      </header>
      <div className="flex items-center gap-2 border-b border-line-soft px-5 py-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'dados', label: 'Dados' },
            { id: 'pagamentos', label: 'Pagamentos' },
            { id: 'projetos', label: 'Projetos' },
            { id: 'notas', label: 'Anotações' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'dados' && <ClientForm key={client.id} client={client} onDeleted={onClose} />}
        {tab === 'pagamentos' && <Payments client={client} />}
        {tab === 'projetos' && <Projects client={client} />}
        {tab === 'notas' && <Notes client={client} />}
      </div>
    </Drawer>
  )
}

function ClientForm({ client, onDeleted }: { client: Client; onDeleted: () => void }) {
  const { saveClient, setClientArchived, deleteClient } = useBiz.getState()
  const toast = useApp((s) => s.toast)
  const openLead = useUi((s) => s.openLead)
  const leadExists = useApp((s) => (client.lead_id ? s.leads.some((l) => l.id === client.lead_id) : false))
  const [draft, setDraft] = useState<Client>(client)
  const [tags, setTags] = useState(client.tags.join(', '))
  const dirty = JSON.stringify({ ...draft, tags: splitTags(tags) }) !== JSON.stringify(client)
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const text = (k: keyof Client) => ({
    value: (draft[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, (e.target.value || null) as never),
  })

  async function save() {
    if (!draft.nome.trim()) return toast('Informe o nome do cliente.', 'error')
    await saveClient({ ...draft, nome: draft.nome.trim(), tags: splitTags(tags) })
    toast('Cliente salvo.')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" icon={<Phone className="size-3.5" />} disabled={!telHref(client.telefone)} onClick={() => window.open(telHref(client.telefone)!, '_self')}>
          {client.telefone ? formatPhone(client.telefone) : 'Sem telefone'}
        </Button>
        {whatsappHref(client.telefone) && (
          <a href={whatsappHref(client.telefone)!} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-go hover:bg-go/10">
            <WhatsAppIcon className="size-3.5" /> WhatsApp
          </a>
        )}
        {websiteHref(client.website) && (
          <a href={websiteHref(client.website)!} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-fg-2 hover:bg-hover">
            <ExternalLink className="size-3.5" /> Site
          </a>
        )}
        {leadExists && (
          <Button size="sm" variant="ghost" onClick={() => openLead(client.lead_id)}>
            Ver lead de origem
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome do cliente *">
          <input className="input" autoFocus={!client.nome} {...text('nome')} value={draft.nome} onChange={(e) => set('nome', e.target.value)} />
        </Field>
        <Field label="Empresa">
          <input className="input" {...text('empresa')} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input className="input" inputMode="tel" {...text('telefone')} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" {...text('email')} />
        </Field>
        <Field label="CPF / CNPJ">
          <input className="input" {...text('documento')} />
        </Field>
        <Field label="Segmento">
          <input className="input" {...text('segmento')} />
        </Field>
        <Field label="Origem">
          <input className="input" placeholder="Prospecção, indicação…" {...text('origem')} />
        </Field>
        <Field label="Site">
          <input className="input" {...text('website')} />
        </Field>
        <Field label="Endereço" className="sm:col-span-2">
          <input className="input" {...text('endereco')} />
        </Field>
        <Field label="Tipo de cliente">
          <Segmented
            value={draft.tipo}
            onChange={(v) => set('tipo', v)}
            options={[
              { id: 'avulso', label: 'Avulso' },
              { id: 'fixo', label: 'Fixo (mensal)' },
            ]}
          />
        </Field>
        <Field label="Valor mensal" hint={draft.tipo === 'fixo' ? 'Entra na receita recorrente.' : 'Só para clientes fixos.'}>
          <NumberInput prefix="R$" value={draft.valor_mensal} onChange={(v) => set('valor_mensal', v)} min={0} />
        </Field>
        <Field label="Etiquetas" hint="Separe por vírgula." className="sm:col-span-2">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="site, manutenção" />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <textarea className="input" rows={3} {...text('observacoes')} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <Button variant="primary" onClick={save} disabled={!dirty}>
          Salvar
        </Button>
        <Button
          variant="ghost"
          icon={client.arquivado ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          onClick={() => {
            void setClientArchived(client.id, !client.arquivado)
            toast(client.arquivado ? 'Cliente reativado.' : 'Cliente arquivado.')
          }}
        >
          {client.arquivado ? 'Reativar' : 'Arquivar'}
        </Button>
        <Button
          variant="danger"
          className="ml-auto"
          icon={<Trash2 className="size-3.5" />}
          onClick={async () => {
            if (!confirmAction(`Excluir ${client.nome}? Pagamentos e anotações dele também serão apagados.`)) return
            await deleteClient(client.id)
            toast('Cliente excluído.')
            onDeleted()
          }}
        >
          Excluir
        </Button>
      </div>
    </div>
  )
}

function splitTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

function Payments({ client }: { client: Client }) {
  const all = useBiz((s) => s.client_payments)
  const projects = useBiz((s) => s.projects)
  const payments = useMemo(
    () => all.filter((p) => p.client_id === client.id).sort((a, b) => (b.vencimento ?? '').localeCompare(a.vencimento ?? '')),
    [all, client.id],
  )
  const { savePayment, togglePayment, deletePayment } = useBiz.getState()
  const toast = useApp((s) => s.toast)
  const [draft, setDraft] = useState<ClientPayment | null>(null)
  const pago = payments.filter((p) => p.status === 'pago').reduce((s, p) => s + p.valor, 0)
  const pendente = payments.filter((p) => p.status === 'pendente').reduce((s, p) => s + p.valor, 0)
  const today = todayKey()

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-line-soft bg-ink px-3 py-2">
          <p className="text-2xs text-fg-3">Recebido</p>
          <p className="num text-base font-semibold text-emerald-300">{formatMoney(pago)}</p>
        </div>
        <div className="rounded-lg border border-line-soft bg-ink px-3 py-2">
          <p className="text-2xs text-fg-3">A receber</p>
          <p className="num text-base font-semibold text-amber-300">{formatMoney(pendente)}</p>
        </div>
      </div>

      {draft ? (
        <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/[0.04] p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Descrição" className="col-span-2">
              <input className="input" autoFocus value={draft.descricao} onChange={(e) => setDraft({ ...draft, descricao: e.target.value })} placeholder="Ex.: Entrada do site" />
            </Field>
            <Field label="Valor">
              <NumberInput prefix="R$" value={draft.valor || null} onChange={(v) => setDraft({ ...draft, valor: v ?? 0 })} min={0} />
            </Field>
            <Field label="Vencimento">
              <input type="date" className="input" value={draft.vencimento ?? ''} onChange={(e) => setDraft({ ...draft, vencimento: e.target.value || null })} />
            </Field>
            <Field label="Forma">
              <select className="input" value={draft.metodo} onChange={(e) => setDraft({ ...draft, metodo: e.target.value })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Projeto">
              <select className="input" value={draft.project_id ?? ''} onChange={(e) => setDraft({ ...draft, project_id: e.target.value || null })}>
                <option value="">Nenhum</option>
                {projects
                  .filter((p) => p.client_id === client.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-2">
            <input
              type="checkbox"
              checked={draft.status === 'pago'}
              onChange={(e) => setDraft({ ...draft, status: e.target.checked ? 'pago' : 'pendente', pago_em: e.target.checked ? nowIso() : null })}
            />
            Já foi pago (lança a receita no Financeiro)
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                if (!(draft.valor > 0)) return toast('Informe o valor.', 'error')
                await savePayment({ ...draft, descricao: draft.descricao.trim() || 'Pagamento' })
                setDraft(null)
                toast('Pagamento salvo.')
              }}
            >
              Salvar pagamento
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDraft(blankPayment(client.id, { valor: client.valor_mensal ?? 0 }))}>
          Novo pagamento
        </Button>
      )}

      {payments.length === 0 && !draft && <p className="py-6 text-center text-xs text-fg-3">Nenhum pagamento lançado para este cliente.</p>}
      <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
        {payments.map((p) => {
          const late = p.status === 'pendente' && p.vencimento && p.vencimento < today
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <button
                onClick={() => void togglePayment(p.id)}
                title={p.status === 'pago' ? 'Marcar como pendente' : 'Marcar como pago'}
                className={clsx(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                  p.status === 'pago' ? 'border-go bg-go text-ink' : 'border-line-strong hover:border-go',
                )}
              >
                {p.status === 'pago' && <Check className="size-3" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-fg">{p.descricao}</p>
                <p className={clsx('text-2xs', late ? 'text-red-300' : 'text-fg-3')}>
                  {p.metodo}
                  {p.vencimento && ` · vence ${formatDateKey(p.vencimento)}`}
                  {late && ' · atrasado'}
                </p>
              </div>
              <span className={clsx('num text-xs font-semibold', p.status === 'pago' ? 'text-emerald-300' : 'text-fg')}>{formatMoney(p.valor)}</span>
              <button onClick={() => setDraft(p)} className="text-2xs text-fg-3 hover:text-fg">
                Editar
              </button>
              <button
                onClick={() => confirmAction('Excluir este pagamento?') && void deletePayment(p.id)}
                className="text-fg-4 hover:text-red-300"
                aria-label="Excluir pagamento"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Projects({ client }: { client: Client }) {
  const allProjects = useBiz((s) => s.projects)
  const projects = useMemo(() => allProjects.filter((p) => p.client_id === client.id), [allProjects, client.id])
  const saveProject = useBiz((s) => s.saveProject)
  const toast = useApp((s) => s.toast)
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        icon={<FolderKanban className="size-3.5" />}
        onClick={async () => {
          await saveProject(blankProject({ nome: `Site ${client.empresa ?? client.nome}`, client_id: client.id, status: 'planejamento' }))
          toast('Projeto criado. Ajuste os detalhes em Projetos.', 'success')
        }}
      >
        Criar projeto para este cliente
      </Button>
      {projects.length === 0 && <p className="py-6 text-center text-xs text-fg-3">Nenhum projeto ligado a este cliente.</p>}
      <ul className="space-y-1.5">
        {projects.map((p) => {
          const st = PROJECT_STATUS.find((s) => s.id === p.status)!
          return (
            <li key={p.id}>
              <Link to={`/projetos?p=${p.id}`} className="flex items-center gap-3 rounded-lg border border-line-soft bg-raised px-3 py-2.5 hover:border-line-strong">
                <span className={clsx('size-2 rounded-full', st.tone)} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.nome}</span>
                <span className="text-2xs text-fg-3">{st.label}</span>
                <span className="num text-xs text-fg-2">{formatMoney(p.orcamento)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Notes({ client }: { client: Client }) {
  const allNotes = useBiz((s) => s.client_notes)
  const notes = useMemo(
    () => allNotes.filter((n) => n.client_id === client.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [allNotes, client.id],
  )
  const { saveNote, deleteNote } = useBiz.getState()
  const [text, setText] = useState('')
  const [lembrete, setLembrete] = useState(false)
  const [data, setData] = useState(todayKey())
  const today = todayKey()

  async function add() {
    if (!text.trim()) return
    const note: ClientNote = {
      id: newId(),
      client_id: client.id,
      texto: text.trim(),
      tipo: lembrete ? 'lembrete' : 'anotacao',
      vencimento: lembrete ? data : null,
      concluido: false,
      created_at: nowIso(),
    }
    await saveNote(note)
    setText('')
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-line-soft bg-ink p-3">
        <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anotação ou lembrete sobre o cliente…" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            <input type="checkbox" checked={lembrete} onChange={(e) => setLembrete(e.target.checked)} /> Lembrete para
          </label>
          {lembrete && <input type="date" className="input h-7 w-auto" value={data} onChange={(e) => setData(e.target.value)} />}
          <Button size="sm" variant="primary" className="ml-auto" icon={<StickyNote className="size-3.5" />} onClick={add} disabled={!text.trim()}>
            Adicionar
          </Button>
        </div>
      </div>
      {notes.length === 0 && <p className="py-6 text-center text-xs text-fg-3">Nenhuma anotação ainda.</p>}
      <ul className="space-y-1.5">
        {notes.map((n) => {
          const late = n.tipo === 'lembrete' && !n.concluido && n.vencimento && n.vencimento < today
          return (
            <li key={n.id} className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-raised px-3 py-2.5">
              {n.tipo === 'lembrete' ? (
                <button
                  onClick={() => void saveNote({ ...n, concluido: !n.concluido })}
                  className={clsx('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border', n.concluido ? 'border-go bg-go text-ink' : 'border-line-strong')}
                  aria-label="Concluir lembrete"
                >
                  {n.concluido && <Check className="size-3" strokeWidth={3} />}
                </button>
              ) : (
                <StickyNote className="mt-0.5 size-4 shrink-0 text-fg-4" />
              )}
              <div className="min-w-0 flex-1">
                <p className={clsx('text-xs whitespace-pre-wrap', n.concluido ? 'text-fg-4 line-through' : 'text-fg')}>{n.texto}</p>
                <p className="mt-0.5 text-2xs text-fg-4">
                  {new Date(n.created_at).toLocaleDateString('pt-BR')}
                  {n.vencimento && (
                    <span className={clsx('ml-1.5', late ? 'text-red-300' : 'text-sky-300')}>· lembrete {formatDateKey(n.vencimento)}</span>
                  )}
                </p>
              </div>
              <button onClick={() => void deleteNote(n.id)} className="text-fg-4 hover:text-red-300" aria-label="Excluir anotação">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

