/**
 * Gestão (módulos vindos do Caldeira Nexus): clientes, pagamentos, projetos,
 * financeiro, precificação e funis de mensagens.
 */

export type ClientTipo = 'fixo' | 'avulso'

export interface Client {
  id: string
  nome: string
  empresa: string | null
  telefone: string | null
  email: string | null
  documento: string | null
  segmento: string | null
  origem: string | null
  endereco: string | null
  website: string | null
  tipo: ClientTipo
  /** Valor mensal (clientes fixos) */
  valor_mensal: number | null
  tags: string[]
  arquivado: boolean
  /** Lead de origem, quando o cliente veio da prospecção */
  lead_id: string | null
  observacoes: string | null
  created_at: string
}

export type PaymentStatus = 'pago' | 'pendente'

export interface ClientPayment {
  id: string
  client_id: string
  project_id: string | null
  descricao: string
  valor: number
  status: PaymentStatus
  metodo: string
  /** YYYY-MM-DD */
  vencimento: string | null
  pago_em: string | null
  created_at: string
}

export interface ClientNote {
  id: string
  client_id: string
  texto: string
  tipo: 'anotacao' | 'lembrete'
  /** YYYY-MM-DD (lembretes) */
  vencimento: string | null
  concluido: boolean
  created_at: string
}

export type ProjectStatus = 'planejamento' | 'em_andamento' | 'revisao' | 'concluido' | 'cancelado'
export type ProjectPriority = 'baixa' | 'media' | 'alta' | 'urgente'

export interface ProjectTask {
  id: string
  texto: string
  feito: boolean
}

export interface Project {
  id: string
  nome: string
  descricao: string | null
  client_id: string | null
  status: ProjectStatus
  prioridade: ProjectPriority
  orcamento: number
  /** YYYY-MM-DD */
  prazo: string | null
  tarefas: ProjectTask[]
  created_at: string
  updated_at: string
}

export type TransactionTipo = 'receita' | 'despesa'

export interface Transaction {
  id: string
  descricao: string
  valor: number
  tipo: TransactionTipo
  categoria: string
  /** YYYY-MM-DD */
  data: string
  status: PaymentStatus
  /** Pagamento de cliente que gerou esta receita (fica em sincronia com ele) */
  payment_id: string | null
  client_id: string | null
  created_at: string
}

export interface PricingSettings {
  custos_fixos: number
  horas_mes: number
  imposto: number
  taxa_cartao: number
  margem: number
}

export interface PricingEstimate {
  id: string
  nome: string
  cliente: string | null
  horas: number
  custos_diretos: number
  imposto: number
  taxa_cartao: number
  margem: number
  preco_final: number
  valor_hora: number
  lucro: number
  observacoes: string | null
  created_at: string
}

export type FunnelStep =
  | { id: string; tipo: 'mensagem'; variacoes: string[] }
  | { id: string; tipo: 'espera'; valor: number; unidade: 'segundos' | 'minutos' | 'horas' }

export interface Funnel {
  id: string
  nome: string
  etapas: FunnelStep[]
  created_at: string
  updated_at: string
}

export interface BizSnapshot {
  clients: Client[]
  client_payments: ClientPayment[]
  client_notes: ClientNote[]
  projects: Project[]
  transactions: Transaction[]
  pricing_estimates: PricingEstimate[]
  funnels: Funnel[]
}

export type BizTable = keyof BizSnapshot
export type BizRow<T extends BizTable> = BizSnapshot[T][number]

/** Em ordem de dependência (chaves estrangeiras): cliente → projeto → pagamento → lançamento. */
export const BIZ_TABLES: BizTable[] = ['clients', 'projects', 'client_payments', 'client_notes', 'transactions', 'pricing_estimates', 'funnels']

export function emptyBiz(): BizSnapshot {
  return { clients: [], client_payments: [], client_notes: [], projects: [], transactions: [], pricing_estimates: [], funnels: [] }
}

export const DEFAULT_PRICING: PricingSettings = { custos_fixos: 3500, horas_mes: 160, imposto: 6, taxa_cartao: 3.5, margem: 30 }

export const PROJECT_STATUS: { id: ProjectStatus; label: string; tone: string }[] = [
  { id: 'planejamento', label: 'Planejamento', tone: 'bg-zinc-400' },
  { id: 'em_andamento', label: 'Em andamento', tone: 'bg-accent' },
  { id: 'revisao', label: 'Revisão', tone: 'bg-amber-400' },
  { id: 'concluido', label: 'Concluído', tone: 'bg-go' },
  { id: 'cancelado', label: 'Cancelado', tone: 'bg-bad' },
]

export const PROJECT_PRIORITY: Record<ProjectPriority, { label: string; cls: string }> = {
  baixa: { label: 'Baixa', cls: 'text-fg-3' },
  media: { label: 'Média', cls: 'text-sky-300' },
  alta: { label: 'Alta', cls: 'text-amber-300' },
  urgente: { label: 'Urgente', cls: 'text-red-300' },
}

export const PAYMENT_METHODS = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro']

export const INCOME_CATEGORIES = ['Sites', 'Manutenção', 'Tráfego', 'Design', 'Consultoria', 'Outros']
export const EXPENSE_CATEGORIES = ['Ferramentas', 'Hospedagem', 'Anúncios', 'Impostos', 'Equipe', 'Escritório', 'Outros']

// ---------------------------------------------------------------------------
// Precificação
// ---------------------------------------------------------------------------

export interface PriceInput {
  horas: number
  custos_diretos: number
  imposto: number
  taxa_cartao: number
  margem: number
}

export interface PriceResult {
  /** Custo da hora (custos fixos ÷ horas trabalhadas no mês) */
  custo_hora: number
  custo_total: number
  preco_final: number
  impostos_taxas: number
  lucro: number
  valor_hora: number
}

/**
 * Preço = custo ÷ (1 − impostos − taxa − margem). Assim o imposto, a taxa e a
 * margem saem do preço final, e não do custo (markup divisor).
 */
export function calcPrice(settings: PricingSettings, input: PriceInput): PriceResult {
  const custo_hora = settings.horas_mes > 0 ? settings.custos_fixos / settings.horas_mes : 0
  const custo_total = custo_hora * Math.max(0, input.horas) + Math.max(0, input.custos_diretos)
  const deducoes = (input.imposto + input.taxa_cartao + input.margem) / 100
  const divisor = Math.max(0.05, 1 - deducoes)
  const preco_final = custo_total / divisor
  const impostos_taxas = preco_final * ((input.imposto + input.taxa_cartao) / 100)
  const lucro = preco_final - custo_total - impostos_taxas
  const valor_hora = input.horas > 0 ? preco_final / input.horas : 0
  return { custo_hora, custo_total, preco_final, impostos_taxas, lucro, valor_hora }
}

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export interface FinanceSummary {
  receitas: number
  despesas: number
  saldo: number
  aReceber: number
  aPagar: number
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function summarize(transactions: Transaction[], payments: ClientPayment[], month?: string): FinanceSummary {
  const inMonth = (d: string) => !month || monthKey(d) === month
  let receitas = 0
  let despesas = 0
  let aPagar = 0
  for (const t of transactions) {
    if (!inMonth(t.data)) continue
    if (t.status === 'pago') {
      if (t.tipo === 'receita') receitas += t.valor
      else despesas += t.valor
    } else if (t.tipo === 'despesa') aPagar += t.valor
  }
  const aReceber =
    payments.filter((p) => p.status === 'pendente' && (!month || !p.vencimento || monthKey(p.vencimento) <= month)).reduce((s, p) => s + p.valor, 0) +
    transactions.filter((t) => t.tipo === 'receita' && t.status === 'pendente' && !t.payment_id && inMonth(t.data)).reduce((s, t) => s + t.valor, 0)
  return { receitas, despesas, saldo: receitas - despesas, aReceber, aPagar }
}

/** Últimos `n` meses (YYYY-MM), do mais antigo para o atual. */
export function lastMonths(n: number, from = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function monthLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = key.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: style === 'short' ? 'short' : 'long' }).replace('.', '')
  return style === 'long' ? `${label.charAt(0).toUpperCase()}${label.slice(1)} de ${y}` : label
}

// ---------------------------------------------------------------------------
// Funis
// ---------------------------------------------------------------------------

export function funnelMessages(f: Funnel): number {
  return f.etapas.filter((s) => s.tipo === 'mensagem' && s.variacoes.some((v) => v.trim())).length
}

export function stepDelayMs(step: Extract<FunnelStep, { tipo: 'espera' }>): number {
  const v = Number.isFinite(step.valor) && step.valor > 0 ? step.valor : 5
  return v * (step.unidade === 'horas' ? 3_600_000 : step.unidade === 'minutos' ? 60_000 : 1000)
}

export function projectProgress(p: Project): number {
  if (!p.tarefas.length) return p.status === 'concluido' ? 100 : 0
  return Math.round((p.tarefas.filter((t) => t.feito).length / p.tarefas.length) * 100)
}
