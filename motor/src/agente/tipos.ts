// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Agente IA de vendas: o que ele guarda (configuração, conversas, lições, fila de empresas, números do dia).
 */

export type Modelo = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'

/** Preço por milhão de tokens (US$), para mostrar o gasto. */
export const MODELOS: Record<Modelo, { nome: string; entrada: number; saida: number }> = {
  'claude-haiku-5-5': { nome: 'Haiku 5.5', entrada: 0.1, saida: 0.5 },
  'claude-sonnet-5-5': { nome: 'Sonnet 5.5', entrada: 2, saida: 10 },
  'claude-opus-5-5': { nome: 'Opus 5.5', entrada: 4, saida: 20 },
}

/** Tipo de negócio como a base aberta entende (o app manda pronto, do catálogo de categorias). */
export interface NichoBusca {
  nome: string
  tax: string[]
  nomes: string[]
}

/** Onde o agente procura empresas: uma cidade e os tipos de negócio. */
export interface Alvo {
  id: string
  uf: string
  cidade: string
  nichos: NichoBusca[]
  ativo: boolean
}

export interface AgenteConfig {
  /** Chave geral: desligado, o agente não busca, não aborda e não responde */
  ativo: boolean
  modelo: Modelo
  negocio: {
    seuNome: string
    empresa: string
    /** Como o agente se apresenta na primeira mensagem */
    apresentacao: string
    /** Pacotes, preços, o que vem incluso, prazo */
    oferta: string
    /** Pix e condições de pagamento */
    pagamento: string
    /** Desconto máximo que o agente pode dar sozinho (%) */
    descontoMax: number
    portfolio: string
    objecoes: string
    /** Jeito de falar */
    estilo: string
    /** Regras extras do dono */
    regras: string
  }
  /** Pode passar preço, negociar dentro do limite e mandar o Pix */
  podeFechar: boolean
  avisos: {
    /** Outro número do dono, que recebe os avisos */
    telefone: string
    relatorio: boolean
  }
  prospeccao: {
    ativa: boolean
    alvos: Alvo[]
    porDiaInicial: number
    porDiaMax: number
    /** Quantas abordagens a mais por dia a cada semana sem problema no número */
    aumentoSemana: number
    soSemSite: boolean
    /** Critérios em texto livre para escolher as empresas (o agente filtra a fila com eles) */
    criterios: string
    /** 0 = domingo … 6 = sábado */
    dias: number[]
    inicio: number
    fim: number
  }
  /** Horário em que ele responde quem escreveu (todos os dias) */
  respostas: { inicio: number; fim: number }
  followup: { ativo: boolean; dias: number[] }
  /** Também conversa com quem respondeu aos Disparos */
  responderDisparos: boolean
  /** Teto de gasto com IA por dia (US$): passou, o agente para até o dia seguinte */
  limiteDiaUSD: number
}

export const CONFIG_PADRAO: AgenteConfig = {
  ativo: false,
  modelo: 'claude-opus-5-5',
  negocio: {
    seuNome: '',
    empresa: '',
    apresentacao: '',
    oferta: '',
    pagamento: '',
    descontoMax: 10,
    portfolio: '',
    objecoes: '',
    estilo: '',
    regras: '',
  },
  podeFechar: true,
  avisos: { telefone: '', relatorio: true },
  prospeccao: {
    ativa: false,
    alvos: [],
    porDiaInicial: 20,
    porDiaMax: 50,
    aumentoSemana: 5,
    soSemSite: true,
    criterios: '',
    dias: [1, 2, 3, 4, 5, 6],
    inicio: 9,
    fim: 18,
  },
  respostas: { inicio: 8, fim: 21 },
  followup: { ativo: true, dias: [2, 5] },
  responderDisparos: true,
  limiteDiaUSD: 3,
}

/** Empresa achada na busca, esperando a vez de ser abordada. `bruto` vai para o app criar o lead. */
export interface FilaItem {
  id: string
  telefone: string
  empresa: string
  nicho: string
  cidade: string
  uf: string
  endereco: string
  site: string
  instagram: string
  alvoId: string
  bruto: Record<string, unknown>
  em: string
  /** Empresa buscada para um teste de abordagens */
  testeId?: string
}

/** Um jeito de abordar, num teste: o ângulo vai para a IA ao escrever a primeira mensagem. */
export interface Variante {
  id: string
  nome: string
  angulo: string
}

/**
 * Teste de abordagens: empresas de um ramo/cidade divididas entre 2 a 4 abordagens, para ver qual
 * conversa e vende mais (e se o ramo vale a pena). Tem prioridade sobre a prospecção normal até
 * abordar `porVariante` empresas em cada abordagem.
 */
export interface Teste {
  id: string
  nome: string
  alvo: Alvo
  variantes: Variante[]
  porVariante: number
  estado: 'rodando' | 'pausado' | 'encerrado'
  criadoEm: string
  encerradoEm: string | null
  conclusao: string
}

export type Estado =
  /** Abordado, esperando a primeira resposta */
  | 'aguardando'
  | 'conversando'
  | 'quente'
  /** Você assumiu (ou o agente chamou você): ele não responde mais */
  | 'humano'
  | 'reuniao'
  | 'fechado'
  | 'perdido'
  | 'optout'
  | 'sem_resposta'

export const ESTADOS_ATIVOS: Estado[] = ['aguardando', 'conversando', 'quente', 'reuniao']

export interface Mensagem {
  id: string
  /** lead = a empresa; agente = a IA; voce = você (pelo celular, pela XS ou por um funil) */
  de: 'lead' | 'agente' | 'voce'
  texto: string
  em: string
  waId?: string
  /** Sua avaliação da mensagem do agente */
  nota?: 'bom' | 'ruim'
  /** Como você teria respondido */
  correcao?: string
}

export interface Conversa {
  id: string
  telefone: string
  jid: string | null
  origem: 'agente' | 'disparo'
  empresa: string
  nicho: string
  cidade: string
  uf: string
  endereco: string
  site: string
  instagram: string
  alvoId: string | null
  /** Teste de abordagens e a abordagem usada (quando veio de um teste) */
  testeId?: string | null
  variante?: string | null
  /** Lead do CRM (quando já existe ou depois que o app sincronizou) */
  leadId: string | null
  bruto: Record<string, unknown> | null
  estado: Estado
  temperatura: 'frio' | 'morno' | 'quente'
  resumo: string
  mensagens: Mensagem[]
  followups: number
  /** Há mensagem do lead esperando resposta; responde a partir de `responderEm` */
  pendente: boolean
  responderEm: string | null
  /** Chave da última mensagem recebida (para marcar como lida antes de responder) */
  ultimaChave: unknown
  avisadoQuente: boolean
  criadaEm: string
  atualizadaEm: string
  sinc: { mensagens: number; estado: Estado | null; lead: boolean }
}

export interface Licao {
  id: string
  /** conversa = como falar; busca = que empresas abordar */
  tipo: 'conversa' | 'busca'
  texto: string
  origem: 'voce' | 'correcao' | 'resultado'
  ativa: boolean
  em: string
}

export interface Dia {
  abordados: number
  semWhatsApp: number
  responderam: number
  enviadas: number
  quentes: number
  reunioes: number
  vendas: number
  optouts: number
  custoUSD: number
  relatorio: boolean
}

export const DIA_VAZIO: Dia = { abordados: 0, semWhatsApp: 0, responderam: 0, enviadas: 0, quentes: 0, reunioes: 0, vendas: 0, optouts: 0, custoUSD: 0, relatorio: false }

export interface Atividade {
  em: string
  tipo: 'abordou' | 'respondeu' | 'followup' | 'quente' | 'reuniao' | 'venda' | 'humano' | 'optout' | 'busca' | 'aviso' | 'erro' | 'licao'
  texto: string
  conversa?: string
}
