// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Agente IA de vendas: o que ele guarda (configuração, conversas, lições, fila de empresas, números do dia).
 */

export type Modelo = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5' | 'gemini-2.5-flash' | 'gemini-3.5-flash' | 'grok'

/** Preço por milhão de tokens (US$), para mostrar o gasto. Gemini com chave grátis não cobra. */
export const MODELOS: Record<Modelo, { nome: string; entrada: number; saida: number }> = {
  'claude-haiku-5-5': { nome: 'Haiku 5.5', entrada: 0.1, saida: 0.5 },
  'claude-sonnet-5-5': { nome: 'Sonnet 5.5', entrada: 2, saida: 10 },
  'claude-opus-5-5': { nome: 'Opus 5.5', entrada: 4, saida: 20 },
  'gemini-2.5-flash': { nome: 'Gemini 2.5 Flash (grátis)', entrada: 0, saida: 0 },
  'gemini-3.5-flash': { nome: 'Gemini 3.5 Flash (grátis)', entrada: 0, saida: 0 },
  grok: { nome: 'Grok (xAI)', entrada: 0.2, saida: 0.5 },
}

export type Provedor = 'anthropic' | 'gemini' | 'xai'
export const provedorDe = (m: Modelo): Provedor => (m.startsWith('gemini') ? 'gemini' : m === 'grok' ? 'xai' : 'anthropic')

/** Tipo de negócio da busca (o app manda pronto, do catálogo de categorias). */
export interface NichoBusca {
  nome: string
  /** Texto da busca no Google Maps (ex.: "barbearia"); sem ele, usa o nome */
  busca?: string
  /** Campos da antiga base aberta (guardados só para não perder cidades já cadastradas) */
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
  /** Caixa da cidade no mapa (sul, norte, oeste, leste), achada na primeira busca */
  caixa?: [number, number, number, number]
}

/**
 * Níveis de piloto: quanta liberdade o agente tem.
 * 1 Rascunho (tudo espera você) · 2 Copiloto (preço, desconto e agenda esperam você) ·
 * 3 Piloto (conversa sozinho, chama você para fechar) · 4 Piloto automático (fecha dentro dos limites)
 */
export type Piloto = 1 | 2 | 3 | 4

export type Tom = 'caloroso' | 'objetivo' | 'curto'

/** eu = escreve como se fosse você, em primeira pessoa (padrão) · assistente = se apresenta como seu assistente */
export type FalarComo = 'eu' | 'assistente'

/** Quem da equipe escreveu a mensagem. */
export type NomeAgente = 'cumprimento' | 'abridor' | 'vendedor' | 'fechador' | 'agendador' | 'recuperador' | 'reativador' | 'posvenda'

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
  /** Escreve como você (padrão) ou se apresenta como seu assistente */
  falarComo: FalarComo
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
    /**
     * Abordagem em dois passos, como o dono faz: primeiro só "Oi, boa tarde! Tudo bem?"; a apresentação
     * vem depois da resposta (automática ou da pessoa), ou depois de 2 h sem resposta.
     */
    cumprimentarPrimeiro: boolean
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
  piloto: Piloto
  /** Nome para o seu time, jeito de falar e as regras da casa */
  persona: { nome: string; tom: Tom; regrasCasa: string }
  /** Várias mensagens curtas (como gente digita) e o tamanho máximo de cada uma */
  estiloResposta: { variasBolhas: boolean; maxBolha: number }
  /** O que ele pode fazer (capacidades.ts); o que não está aqui segue o padrão */
  capacidades: Record<string, boolean>
  /** Conferências que você liga (as de segurança não têm interruptor) */
  conferencias: { revisorTom: boolean; assuntosProibidos: boolean; proibidos: string; manipulacao: boolean; transcreverAudio: boolean }
  /** Horários em que ele pode marcar conversa com você */
  agenda: { dias: number[]; inicio: number; fim: number; duracaoMin: number; antecedenciaH: number; como: string }
  /** Dias depois da venda para pedir depoimento e indicação */
  posVenda: { depoimentoDias: number; indicacaoDias: number }
  /** Leads parados no CRM que ele pode chamar de novo */
  reativacao: { diasParado: number; porDia: number }
  /** Links que ele pode mandar além dos do material (um por linha) */
  linksPermitidos: string
  /** Lições de confiança alta entram sozinhas no Caderno (as outras esperam você) */
  autoAprovarLicoes: boolean
  /** Somar padrões anônimos (sem texto de conversa) para melhorar o "já vem treinado" */
  inteligenciaXS: boolean
  /** Modo férias: até essa data (AAAA-MM-DD) ele não aborda nem faz follow-up */
  feriasAte: string | null
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
  falarComo: 'eu',
  avisos: { telefone: '', relatorio: true },
  prospeccao: {
    ativa: false,
    alvos: [],
    porDiaInicial: 20,
    porDiaMax: 50,
    aumentoSemana: 5,
    soSemSite: true,
    cumprimentarPrimeiro: true,
    criterios: '',
    dias: [1, 2, 3, 4, 5, 6],
    inicio: 9,
    fim: 18,
  },
  respostas: { inicio: 8, fim: 21 },
  followup: { ativo: true, dias: [2, 5] },
  responderDisparos: true,
  limiteDiaUSD: 3,
  piloto: 2,
  persona: { nome: 'Atendente IA', tom: 'caloroso', regrasCasa: '' },
  estiloResposta: { variasBolhas: true, maxBolha: 600 },
  capacidades: {},
  conferencias: { revisorTom: false, assuntosProibidos: true, proibidos: '', manipulacao: true, transcreverAudio: false },
  agenda: { dias: [1, 2, 3, 4, 5], inicio: 9, fim: 18, duracaoMin: 30, antecedenciaH: 3, como: 'Chamada de vídeo ou ligação pelo WhatsApp' },
  posVenda: { depoimentoDias: 15, indicacaoDias: 30 },
  reativacao: { diasParado: 30, porDia: 5 },
  linksPermitidos: '',
  autoAprovarLicoes: false,
  inteligenciaXS: false,
  feriasAte: null,
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
  /** Resposta automática (WhatsApp Business): não conta como resposta e o agente não responde */
  auto?: boolean
  /** Por que essa mensagem saiu: quem escreveu, fontes, conferências e reescritas */
  trace?: Trace
  /** O cliente tentou mandar o assistente ignorar as instruções */
  manipulacao?: boolean
}

export interface Trace {
  agente: NomeAgente
  /** Materiais da base consultados */
  fontes: string[]
  /** Quantas conferências passaram */
  conferencias: number
  reescritas: number
  /** Motivos das conferências que barraram antes da versão final */
  barradas: string[]
  /** Você aprovou (e talvez editou) antes de sair */
  aprovadaPorVoce?: boolean
  editada?: boolean
}

/** Algo que o cliente contou e vale lembrar (a ficha do cliente). */
export interface Fato {
  chave: 'nome_contato' | 'decisor' | 'dor' | 'orcamento' | 'interesse' | 'retomar_em' | 'canal_atual' | 'objecao' | 'outro'
  valor: string
  em: string
}

export interface Conversa {
  id: string
  telefone: string
  jid: string | null
  /** agente = ele abordou; disparo = respondeu a um Disparo; manual = você entregou pela tela Conversas; reativacao = lead antigo do CRM */
  origem: 'agente' | 'disparo' | 'manual' | 'reativacao'
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
  /** Só mandou o cumprimento: a apresentação vai depois da resposta (ou depois de 2 h) */
  apresentar?: boolean
  /** Último lembrete para você de que o cliente está esperando (conversa com você) */
  lembradoEm?: string | null
  /** Ficha do cliente: o que ele contou */
  fatos?: Fato[]
  /** Combinou de retomar nesse dia (AAAA-MM-DD) */
  retomarEm?: string | null
  /** Há uma mensagem esperando você na fila "Precisa de você" (id da pendência) */
  aguardandoVoce?: string | null
  fechadoEm?: string | null
  posVenda?: { depoimento?: string; indicacao?: string; agradeceu?: string }
  /** Já passou pelo Professor (reflexão da noite) */
  refletidaEm?: string | null
  /** Você marcou como caso de ouro (perfeita) ou de erro */
  caso?: 'ouro' | 'erro' | null
  /** Nota de encaixe que o Caçador deu (0 a 100) */
  encaixe?: number
  criadaEm: string
  atualizadaEm: string
  sinc: { mensagens: number; estado: Estado | null; lead: boolean }
}

/** Uma nota do Caderno: o que ele aprendeu. Só as ativas entram nas conversas. */
export interface Licao {
  id: string
  /** conversa = como falar; busca = que empresas abordar */
  tipo: 'conversa' | 'busca'
  texto: string
  origem: 'voce' | 'correcao' | 'resultado' | 'professor' | 'obsidian' | 'teste'
  ativa: boolean
  em: string
  titulo?: string
  /** geral, ramo:<Ramo> ou etapa:<abertura|objecao|preco|fechamento|followup> */
  escopo?: string
  confianca?: 'baixa' | 'media' | 'alta'
  /** Conversas que provam a lição */
  provas?: string[]
  /** proposta = espera você aprovar; arquivada = saiu (mas fica guardada) */
  status?: 'proposta' | 'ativa' | 'arquivada'
  /** Quando revisar se ainda vale (AAAA-MM-DD) */
  revisarEm?: string | null
}

/** Material que ele consulta antes de responder (a base de conhecimento). */
export interface Material {
  id: string
  titulo: string
  tipo: 'precos' | 'faq' | 'portfolio' | 'politica' | 'contrato' | 'pagamento' | 'outro'
  texto: string
  ativo: boolean
  atualizadoEm: string
}

export type TipoPendencia = 'aprovar' | 'barrada' | 'pessoa' | 'contrato' | 'lacuna' | 'licao' | 'teste' | 'nivel' | 'reuniao'

/** Item da fila "Precisa de você". */
export interface Pendencia {
  id: string
  tipo: TipoPendencia
  texto: string
  conversaId?: string | null
  empresa?: string
  motivo?: string
  /** Mensagens prontas esperando aprovação */
  rascunho?: { mensagens: string[]; acao: string; agente: NomeAgente; fontes: string[]; reescritas: number; barradas: string[]; dados?: Record<string, unknown> }
  /** Lição proposta (tipo licao) ou edição vinda do Obsidian */
  licao?: Partial<Licao> & { texto: string }
  /** Teste proposto pelo Analista */
  teste?: { nome: string; ramo: string; variantes: { nome: string; angulo: string }[] }
  criadaEm: string
  prazo?: string | null
  resolvidaEm?: string | null
  resultado?: 'aprovada' | 'editada' | 'descartada' | 'substituida' | 'feita'
}

export interface Reuniao {
  id: string
  conversaId: string
  empresa: string
  telefone: string
  inicio: string
  fim: string
  estado: 'marcada' | 'confirmada' | 'cancelada' | 'veio' | 'faltou'
  criadaEm: string
  confirmacaoEnviada?: boolean
  /** Já foi para o CRM */
  sinc?: boolean
}

/** Lead parado no CRM que o app mandou para ele chamar de novo. */
export interface Reativar {
  leadId: string
  telefone: string
  empresa: string
  nicho: string
  cidade: string
  resumo: string
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
  /** Mensagens que o Conferente barrou e o agente reescreveu ou que ficaram para você */
  barradas?: number
  reescritas?: number
  reativados?: number
  professor?: boolean
  analista?: boolean
}

export const DIA_VAZIO: Dia = { abordados: 0, semWhatsApp: 0, responderam: 0, enviadas: 0, quentes: 0, reunioes: 0, vendas: 0, optouts: 0, custoUSD: 0, relatorio: false }

export interface Atividade {
  em: string
  tipo: 'abordou' | 'respondeu' | 'followup' | 'quente' | 'reuniao' | 'venda' | 'humano' | 'optout' | 'busca' | 'aviso' | 'erro' | 'licao' | 'barrada' | 'pendencia' | 'prova' | 'nivel'
  texto: string
  conversa?: string
}
