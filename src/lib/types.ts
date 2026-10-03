import type { PricingSettings } from './biz'

export type StatusId =
  | 'novo'
  | 'so_chama'
  | 'nao_atendeu'
  | 'numero_incorreto'
  | 'nao_completou'
  | 'falei_responsavel'
  | 'pediu_whatsapp'
  | 'follow_up'
  | 'agendou_reuniao'
  | 'nao_tem_interesse'
  | 'cliente_potencial'
  | 'finalizado'

export type Periodo = 'manha' | 'tarde' | 'noite'

export interface Lead {
  id: string
  // Dados importados — nunca alterados pelo sistema
  empresa: string
  nicho: string | null
  telefone: string | null
  whatsapp: string | null
  instagram: string | null
  website: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  avaliacao: number | null
  numero_avaliacoes: number | null
  pasta: string | null
  etapa: string | null
  maps_url: string | null
  observacoes: string | null
  dados_extras: Record<string, string> | null
  import_id: string | null
  /** CNPJ (do arquivo ou informado à mão) e o resultado da consulta pública */
  cnpj?: string | null
  cnpj_info?: CnpjInfo | null
  // Trabalho de prospecção
  status: StatusId
  /** Segunda categoria de status (ex.: "Mensagem enviada"), livre e configurável */
  status2?: string | null
  falei_com: string | null
  cargo: string | null
  anotacoes: string | null
  proxima_acao: string | null
  ultima_ligacao: string | null
  duplicado_ignorado: boolean
  created_at: string
  updated_at: string
}

export type InteractionTipo = 'ligacao' | 'status' | 'status2' | 'followup' | 'reuniao' | 'nota' | 'importacao' | 'mensagem'

export interface Interaction {
  id: string
  lead_id: string
  tipo: InteractionTipo
  /** Resultado da ligação / novo status. `null` em uma ligação ainda sem resultado. */
  status: StatusId | null
  falei_com: string | null
  cargo: string | null
  observacao: string | null
  /** Roteiro ativo quando a ligação foi registrada (para comparar roteiros) */
  roteiro_id?: string | null
  created_at: string
}

export interface Followup {
  id: string
  lead_id: string
  /** YYYY-MM-DD (data local) */
  data: string
  /** HH:mm — quando o horário é específico */
  horario: string | null
  periodo: Periodo | null
  observacao: string | null
  concluido: boolean
  created_at: string
}

export type MeetingResultado = 'realizada' | 'nao_compareceu' | 'fechou' | 'perdeu'

export interface Meeting {
  id: string
  lead_id: string
  data: string
  horario: string | null
  contato: string | null
  observacao: string | null
  /** O que aconteceu na reunião (vazio = ainda não registrado) */
  resultado?: MeetingResultado | null
  /** Valor fechado em reais, quando `resultado = 'fechou'` */
  valor?: number | null
  resultado_em?: string | null
  created_at: string
}

export interface CnpjSocio {
  nome: string
  qualificacao: string
}

/** Dados públicos do CNPJ (BrasilAPI). `confere` diz se nome/telefone/cidade batem com o lead. */
export interface CnpjInfo {
  razao_social: string | null
  nome_fantasia: string | null
  situacao: string | null
  abertura: string | null
  atividade: string | null
  municipio: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  socios: CnpjSocio[]
  confere: boolean
  consultado_em: string
}

/** Modelo de mensagem de WhatsApp. Cada variação é usada em rodízio entre os leads. */
export interface MessageTemplate {
  id: string
  nome: string
  variacoes: string[]
}

export interface ImportRecord {
  id: string
  arquivo: string
  quantidade_leads: number
  data_importacao: string
}

export interface ScriptSection {
  id: string
  titulo: string
  /** Linhas começando com "- " viram itens de lista. */
  texto: string
}

export interface Objection {
  id: string
  titulo: string
  resposta: string
}

export interface Roteiro {
  id: string
  nome: string
  secoes: ScriptSection[]
  objecoes: Objection[]
}

export interface Settings {
  meta_diaria: number
  nome_vendedor: string
  servico: string
  /** Legado (roteiro único) — convertido para `roteiros` ao carregar */
  roteiro: ScriptSection[] | null
  objecoes: Objection[] | null
  roteiros: Roteiro[] | null
  roteiro_ativo: string | null
  /** Opções do Status 2 */
  status2_opcoes: string[] | null
  /** Foto do avatar (data URL pequena) */
  avatar: string | null
  /** Métricas contam a partir desta data (botão "Zerar contadores") */
  metricas_desde: string | null
  /** Mensagens prontas de WhatsApp */
  mensagens: MessageTemplate[] | null
  /** Agenda sozinho a próxima tentativa depois de "Não atendeu" */
  auto_tentativas: boolean
  /** Tentativas seguidas sem resposta antes de sugerir encerrar */
  max_tentativas: number
  /** Custos e margens padrão da Precificação */
  precificacao: PricingSettings | null
  /** Nomes, cores e visibilidade personalizados do Status 1 */
  status1: Partial<Record<StatusId, StatusCustom>> | null
}

/** Personalização de um status principal (os ids e as regras continuam fixos). */
export interface StatusCustom {
  label?: string
  callLabel?: string
  tone?: string
  /** Some do painel "Como foi a ligação?" */
  oculto?: boolean
}

export interface Snapshot {
  leads: Lead[]
  interactions: Interaction[]
  followups: Followup[]
  meetings: Meeting[]
  imports: ImportRecord[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  meta_diaria: 50,
  nome_vendedor: '',
  servico: 'desenvolvimento de sites',
  roteiro: null,
  objecoes: null,
  roteiros: null,
  roteiro_ativo: null,
  status2_opcoes: null,
  avatar: null,
  metricas_desde: null,
  mensagens: null,
  auto_tentativas: true,
  max_tentativas: 5,
  precificacao: null,
  status1: null,
}
