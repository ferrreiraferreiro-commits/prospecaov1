import { create } from 'zustand'
import { newId, nowIso, type Repository } from '../data/repository'
import {
  emptyBiz,
  type BizRow,
  type BizSnapshot,
  type BizTable,
  type Client,
  type ClientNote,
  type ClientPayment,
  type Funnel,
  type PricingEstimate,
  type Project,
  type Transaction,
} from '../lib/biz'
import { todayKey } from '../lib/dates'
import type { Lead } from '../lib/types'
import { useApp } from './useApp'

interface BizState extends BizSnapshot {
  ready: boolean
  error: string | null
  init(repo: Repository): Promise<void>

  saveClient(client: Client): Promise<void>
  setClientArchived(id: string, arquivado: boolean): Promise<void>
  deleteClient(id: string): Promise<void>
  /** Cria um cliente a partir de um lead (ou devolve o que já existe). */
  clientFromLead(lead: Lead, extra?: Partial<Client>): Promise<Client>

  savePayment(payment: ClientPayment): Promise<void>
  togglePayment(id: string): Promise<void>
  deletePayment(id: string): Promise<void>

  saveNote(note: ClientNote): Promise<void>
  deleteNote(id: string): Promise<void>

  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>

  saveTransaction(t: Transaction): Promise<void>
  deleteTransaction(id: string): Promise<void>

  saveEstimate(e: PricingEstimate): Promise<void>
  deleteEstimate(id: string): Promise<void>

  saveFunnel(f: Funnel): Promise<void>
  deleteFunnel(id: string): Promise<void>

  restore(biz: BizSnapshot): Promise<void>
}

export function blankClient(patch: Partial<Client> = {}): Client {
  return {
    id: newId(),
    nome: '',
    empresa: null,
    telefone: null,
    email: null,
    documento: null,
    segmento: null,
    origem: null,
    endereco: null,
    website: null,
    tipo: 'avulso',
    valor_mensal: null,
    tags: [],
    arquivado: false,
    lead_id: null,
    observacoes: null,
    created_at: nowIso(),
    ...patch,
  }
}

export function blankProject(patch: Partial<Project> = {}): Project {
  const now = nowIso()
  return {
    id: newId(),
    nome: '',
    descricao: null,
    client_id: null,
    status: 'planejamento',
    prioridade: 'media',
    orcamento: 0,
    prazo: null,
    tarefas: [],
    created_at: now,
    updated_at: now,
    ...patch,
  }
}

export function blankPayment(clientId: string, patch: Partial<ClientPayment> = {}): ClientPayment {
  return {
    id: newId(),
    client_id: clientId,
    project_id: null,
    descricao: '',
    valor: 0,
    status: 'pendente',
    metodo: 'Pix',
    vencimento: todayKey(),
    pago_em: null,
    created_at: nowIso(),
    ...patch,
  }
}

/** Lançamento de receita espelhado de um pagamento pago. */
function transactionForPayment(p: ClientPayment, client: Client | undefined, existing?: Transaction): Transaction {
  return {
    id: existing?.id ?? newId(),
    descricao: `${p.descricao || 'Pagamento'}${client ? ` · ${client.nome}` : ''}`,
    valor: p.valor,
    tipo: 'receita',
    categoria: existing?.categoria ?? 'Sites',
    data: (p.pago_em ?? nowIso()).slice(0, 10),
    status: 'pago',
    payment_id: p.id,
    client_id: p.client_id,
    created_at: existing?.created_at ?? nowIso(),
  }
}

export const useBiz = create<BizState>()((set, get) => {
  let repo: Repository | null = null

  async function persist(work: (r: Repository) => Promise<void>) {
    if (!repo) return
    try {
      await work(repo)
    } catch (err) {
      console.error(err)
      useApp.getState().toast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error')
      try {
        set({ ...(await repo.loadBiz()) })
      } catch {
        /* mantém o estado atual */
      }
    }
  }

  function put<T extends BizTable>(table: T, rows: BizRow<T>[]) {
    set((s) => {
      const list = [...(s[table] as BizRow<T>[])]
      for (const row of rows) {
        const i = list.findIndex((x) => x.id === row.id)
        if (i >= 0) list[i] = row
        else list.push(row)
      }
      return { [table]: list } as Partial<BizState>
    })
    return persist((r) => r.upsertRows(table, rows))
  }

  function drop(table: BizTable, ids: string[]) {
    if (!ids.length) return Promise.resolve()
    const set_ = new Set(ids)
    set((s) => ({ [table]: (s[table] as { id: string }[]).filter((x) => !set_.has(x.id)) }) as Partial<BizState>)
    return persist((r) => r.deleteRows(table, ids))
  }

  /** Mantém o lançamento de receita em sincronia com o status do pagamento. */
  async function syncPaymentTransaction(p: ClientPayment) {
    const existing = get().transactions.find((t) => t.payment_id === p.id)
    if (p.status === 'pago') {
      const client = get().clients.find((c) => c.id === p.client_id)
      await put('transactions', [transactionForPayment(p, client, existing)])
    } else if (existing) {
      await drop('transactions', [existing.id])
    }
  }

  return {
    ...emptyBiz(),
    ready: false,
    error: null,

    async init(r) {
      repo = r
      set({ ready: false, error: null })
      try {
        set({ ...(await r.loadBiz()), ready: true })
      } catch (err) {
        set({ ...emptyBiz(), ready: true, error: err instanceof Error ? err.message : String(err) })
      }
    },

    saveClient: (client) => put('clients', [client]),

    async setClientArchived(id, arquivado) {
      const c = get().clients.find((x) => x.id === id)
      if (c) await put('clients', [{ ...c, arquivado }])
    },

    async deleteClient(id) {
      const s = get()
      // Pagamentos, notas e lançamentos ligados saem juntos; projetos ficam sem cliente.
      const payIds = s.client_payments.filter((p) => p.client_id === id).map((p) => p.id)
      await drop('transactions', s.transactions.filter((t) => t.client_id === id || (t.payment_id && payIds.includes(t.payment_id))).map((t) => t.id))
      await drop('client_payments', payIds)
      await drop('client_notes', s.client_notes.filter((n) => n.client_id === id).map((n) => n.id))
      const orphan = s.projects.filter((p) => p.client_id === id).map((p) => ({ ...p, client_id: null }))
      if (orphan.length) await put('projects', orphan)
      await drop('clients', [id])
    },

    async clientFromLead(lead, extra = {}) {
      const existing = get().clients.find((c) => c.lead_id === lead.id)
      if (existing) return existing
      const client = blankClient({
        nome: lead.falei_com?.trim() || lead.empresa,
        empresa: lead.empresa,
        telefone: lead.whatsapp || lead.telefone,
        documento: lead.cnpj ?? null,
        segmento: lead.nicho,
        origem: 'Prospecção',
        endereco: [lead.endereco, lead.cidade].filter(Boolean).join(' · ') || null,
        website: lead.website,
        lead_id: lead.id,
        ...extra,
      })
      await put('clients', [client])
      return client
    },

    async savePayment(payment) {
      await put('client_payments', [payment])
      await syncPaymentTransaction(payment)
    },

    async togglePayment(id) {
      const p = get().client_payments.find((x) => x.id === id)
      if (!p) return
      const next: ClientPayment = p.status === 'pago' ? { ...p, status: 'pendente', pago_em: null } : { ...p, status: 'pago', pago_em: nowIso() }
      await get().savePayment(next)
    },

    async deletePayment(id) {
      const tx = get().transactions.find((t) => t.payment_id === id)
      if (tx) await drop('transactions', [tx.id])
      await drop('client_payments', [id])
    },

    saveNote: (note) => put('client_notes', [note]),
    deleteNote: (id) => drop('client_notes', [id]),

    saveProject: (project) => put('projects', [{ ...project, updated_at: nowIso() }]),

    async deleteProject(id) {
      const linked = get().client_payments.filter((p) => p.project_id === id).map((p) => ({ ...p, project_id: null }))
      if (linked.length) await put('client_payments', linked)
      await drop('projects', [id])
    },

    async saveTransaction(t) {
      await put('transactions', [t])
      // Editar um lançamento ligado a pagamento atualiza o valor do pagamento
      if (t.payment_id) {
        const p = get().client_payments.find((x) => x.id === t.payment_id)
        if (p && p.valor !== t.valor) await put('client_payments', [{ ...p, valor: t.valor }])
      }
    },

    async deleteTransaction(id) {
      const t = get().transactions.find((x) => x.id === id)
      await drop('transactions', [id])
      // Apagar a receita de um pagamento volta o pagamento para pendente
      if (t?.payment_id) {
        const p = get().client_payments.find((x) => x.id === t.payment_id)
        if (p?.status === 'pago') await put('client_payments', [{ ...p, status: 'pendente', pago_em: null }])
      }
    },

    saveEstimate: (e) => put('pricing_estimates', [e]),
    deleteEstimate: (id) => drop('pricing_estimates', [id]),

    saveFunnel: (f) => put('funnels', [{ ...f, updated_at: nowIso() }]),
    deleteFunnel: (id) => drop('funnels', [id]),

    async restore(biz) {
      if (!repo) return
      await repo.replaceBiz(biz)
      set({ ...emptyBiz(), ...biz })
    },
  }
})
