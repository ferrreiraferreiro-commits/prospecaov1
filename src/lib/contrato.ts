// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Contrato de criação de site: os dados, o texto das cláusulas e o valor por extenso. Sem desenho
 * (o PDF fica em contratoPdf.ts), para dar para testar o texto sozinho.
 */

export type FormaPagamento = '50_50' | 'avista' | 'parcelado' | 'personalizado'
export type Hospedagem = 'cliente' | 'incluso_1_ano' | 'manutencao'

/** O que é seu e vale para todos os contratos (fica salvo nos Ajustes). */
export interface ContratoPadrao {
  contratada: {
    nome: string
    documento: string
    endereco: string
    cidade: string
    email: string
    telefone: string
    pix: string
  }
  revisoes: number
  /** Dias corridos que o cliente tem para aprovar cada etapa */
  aprovacaoDias: number
  hospedagem: Hospedagem
  portfolio: boolean
  testemunhas: boolean
  /** Cor de destaque do documento (hex) */
  cor: string
  /** Cláusulas suas que entram em todo contrato */
  extras: string
}

export interface ContratoDados extends ContratoPadrao {
  numero: string
  /** AAAA-MM-DD */
  data: string
  contratante: {
    nome: string
    documento: string
    endereco: string
    email: string
    telefone: string
    /** Quem assina pela empresa (quando o contratante é uma empresa) */
    representante: string
  }
  projeto: {
    nome: string
    /** Um item do escopo por linha */
    escopo: string
  }
  valor: number
  pagamento: { forma: FormaPagamento; parcelas: number; texto: string }
  /** Entrega numa data (AAAA-MM-DD) ou em dias úteis */
  prazo: { tipo: 'data' | 'dias'; data: string; dias: number }
  manutencao: { ativa: boolean; valor: number; inclui: string }
  /** Cidade do foro */
  foro: string
}

export const CORES_CONTRATO = ['#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#111827']

export const CONTRATO_PADRAO: ContratoPadrao = {
  contratada: { nome: '', documento: '', endereco: '', cidade: '', email: '', telefone: '', pix: '' },
  revisoes: 2,
  aprovacaoDias: 5,
  hospedagem: 'cliente',
  portfolio: true,
  testemunhas: false,
  cor: CORES_CONTRATO[0],
  extras: '',
}

/** Escopo sugerido quando o projeto ainda não tem tarefas nem descrição. */
export const ESCOPO_SUGERIDO = [
  'Criação do layout exclusivo do site, de acordo com a identidade visual do CONTRATANTE',
  'Site responsivo, adaptado para celular, tablet e computador',
  'Botão de contato direto pelo WhatsApp',
  'Mapa com a localização e informações de contato',
  'Configuração básica para aparecer no Google (SEO local)',
  'Publicação do site no domínio do CONTRATANTE',
].join('\n')

// ---------------------------------------------------------------------------
// Dinheiro e datas
// ---------------------------------------------------------------------------

// Espaço normal no lugar do espaço especial do toLocaleString (fica igual no PDF e na busca)
export const reais = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** 0 a 999 por extenso. */
function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (r < 20) {
    if (r) partes.push(UNIDADES[r])
  } else {
    const d = Math.floor(r / 10)
    const u = r % 10
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
  }
  return partes.join(' e ')
}

/** Número inteiro por extenso (até 999 milhões), do jeito que se escreve em contrato. */
export function inteiroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const grupos: { texto: string; valor: number }[] = []
  if (milhoes) grupos.push({ texto: milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`, valor: milhoes })
  if (milhares) grupos.push({ texto: milhares === 1 ? 'mil' : `${ate999(milhares)} mil`, valor: milhares })
  if (resto) grupos.push({ texto: ate999(resto), valor: resto })
  // "mil e quinhentos", "dois mil e trinta", "um milhão e duzentos mil"; mas "mil duzentos e cinquenta"
  if (grupos.length === 1) return grupos[0].texto
  const ultimo = grupos.pop()!
  const usaE = ultimo.valor < 100 || ultimo.valor % 100 === 0
  return `${grupos.map((g) => g.texto).join(' ')}${usaE ? ' e ' : ' '}${ultimo.texto}`
}

/** "R$ 1.500,00 (mil e quinhentos reais)" */
export function valorPorExtenso(v: number): string {
  const centavosTotal = Math.round(Math.max(0, v) * 100)
  const inteiro = Math.floor(centavosTotal / 100)
  const centavos = centavosTotal % 100
  const partes: string[] = []
  if (inteiro) {
    const t = inteiroPorExtenso(inteiro)
    const de = inteiro % 1_000_000 === 0 ? ' de' : ''
    partes.push(`${t}${de} ${inteiro === 1 ? 'real' : 'reais'}`)
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero real'
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "8 de outubro de 2026" */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return `${d} de ${MESES[m - 1]} de ${a}`
}

const dataCurta = (iso: string) => iso.split('-').reverse().join('/')

/** Número do contrato: ano + sequência curta tirada do projeto (sempre igual para o mesmo projeto). */
export function numeroContrato(projetoId: string, data: string): string {
  let h = 0
  for (const ch of projetoId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `${data.slice(0, 4)}-${String(h % 10000).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Um parágrafo (pode ter uma lista logo depois). */
export interface Paragrafo {
  texto: string
  itens?: string[]
}

export interface Clausula {
  titulo: string
  paragrafos: Paragrafo[]
}

/** "um"/"dois" no fim viram "uma"/"duas" (rodadas, parcelas). */
const feminino = (t: string) => t.replace(/(^| )um$/, '$1uma').replace(/(^| )dois$/, '$1duas')

const ORDINAL = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª', '14ª', '15ª', '16ª']
export const ordinal = (i: number) => ORDINAL[i] ?? `${i + 1}ª`

export const linhasDoEscopo = (escopo: string) =>
  escopo
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim())
    .filter(Boolean)

export function textoPrazo(d: Pick<ContratoDados, 'prazo'>): string {
  return d.prazo.tipo === 'data' && d.prazo.data ? `até ${dataCurta(d.prazo.data)}` : `em até ${Math.max(1, Math.round(d.prazo.dias))} dias úteis`
}

/** Resumo do pagamento em poucas palavras (para o quadro do topo). */
export function resumoPagamento(d: Pick<ContratoDados, 'pagamento' | 'valor'>): string {
  const p = d.pagamento
  if (p.forma === '50_50') return '50% de entrada + 50% na entrega'
  if (p.forma === 'avista') return 'À vista, na assinatura'
  if (p.forma === 'parcelado') return `${Math.max(2, p.parcelas)}x de ${reais(d.valor / Math.max(2, p.parcelas))}`
  return p.texto.trim().split('\n')[0].slice(0, 60) || 'Conforme a cláusula 3ª'
}

function paragrafoPagamento(d: ContratoDados): string {
  const p = d.pagamento
  const metade = d.valor / 2
  switch (p.forma) {
    case '50_50':
      return `O pagamento será feito em duas partes: 50% (${reais(metade)}) como entrada, na assinatura deste contrato, e 50% (${reais(d.valor - metade)}) na entrega do site, antes da publicação.`
    case 'avista':
      return 'O pagamento será feito à vista, na assinatura deste contrato.'
    case 'parcelado': {
      const n = Math.max(2, Math.round(p.parcelas))
      return `O pagamento será feito em ${n} parcelas mensais e iguais de ${reais(d.valor / n)} (${valorPorExtenso(d.valor / n)}), a primeira na assinatura deste contrato e as demais no mesmo dia dos meses seguintes.`
    }
    default:
      return p.texto.trim() || 'O pagamento será feito na forma combinada entre as partes.'
  }
}

/** As cláusulas, na ordem, já com os dados preenchidos. */
export function clausulas(d: ContratoDados): Clausula[] {
  const escopo = linhasDoEscopo(d.projeto.escopo)
  const pix = d.contratada.pix.trim()
  const lista: Clausula[] = [
    {
      titulo: 'Do objeto',
      paragrafos: [
        {
          texto: `Este contrato tem por objeto a prestação, pela CONTRATADA ao CONTRATANTE, do serviço de criação do site "${d.projeto.nome.trim() || 'Site'}"${escopo.length ? ', com o seguinte escopo:' : '.'}`,
          itens: escopo.length ? escopo : undefined,
        },
        { texto: 'Qualquer serviço que não esteja descrito acima não faz parte deste contrato e poderá ser orçado à parte.' },
      ],
    },
    {
      titulo: 'Do prazo de entrega',
      paragrafos: [
        { texto: `A CONTRATADA entregará o site ${textoPrazo(d)}, contados a partir do recebimento ${d.pagamento.forma === 'avista' ? 'do pagamento' : 'da entrada'} e de todos os materiais necessários (textos, logotipo, fotos e informações do negócio).` },
        { texto: 'Atrasos no envio dos materiais ou nas aprovações por parte do CONTRATANTE prorrogam o prazo de entrega pelo mesmo período.' },
      ],
    },
    {
      titulo: 'Do valor e da forma de pagamento',
      paragrafos: [
        { texto: `Pelos serviços descritos neste contrato, o CONTRATANTE pagará à CONTRATADA o valor total de ${reais(d.valor)} (${valorPorExtenso(d.valor)}).` },
        { texto: paragrafoPagamento(d) },
        { texto: `Os pagamentos serão feitos por Pix${pix ? ` (chave: ${pix})` : ''} ou por outro meio combinado entre as partes, que servirá como comprovante de quitação.` },
        { texto: 'O atraso no pagamento suspende o andamento do projeto até a regularização, e o prazo de entrega fica prorrogado pelo mesmo período.' },
      ],
    },
    {
      titulo: 'Das revisões e aprovações',
      paragrafos: [
        {
          texto: `Estão incluídas ${d.revisoes > 0 ? `${d.revisoes} (${feminino(inteiroPorExtenso(d.revisoes))}) ${d.revisoes === 1 ? 'rodada' : 'rodadas'} de ajustes` : 'apenas os ajustes de correção'} sobre o layout e o conteúdo apresentados. Ajustes além disso, ou mudanças no escopo, serão orçados à parte.`,
        },
        {
          texto: `O CONTRATANTE terá até ${d.aprovacaoDias} dias corridos para aprovar cada etapa ou pedir os ajustes. Sem resposta nesse prazo, a etapa será considerada aprovada.`,
        },
      ],
    },
    {
      titulo: 'Das obrigações do CONTRATANTE',
      paragrafos: [
        {
          texto: 'São obrigações do CONTRATANTE:',
          itens: [
            'enviar os materiais e as informações necessárias nos prazos combinados;',
            'garantir que tem o direito de uso dos textos, imagens, marcas e demais materiais que fornecer, respondendo por eles;',
            'fazer os pagamentos nas datas combinadas.',
          ],
        },
      ],
    },
    {
      titulo: 'Das obrigações da CONTRATADA',
      paragrafos: [
        {
          texto: 'São obrigações da CONTRATADA:',
          itens: [
            'executar os serviços com qualidade técnica, entregando o site adaptado para celulares;',
            'manter o CONTRATANTE informado sobre o andamento do projeto;',
            'manter sigilo sobre as informações do CONTRATANTE a que tiver acesso.',
          ],
        },
      ],
    },
    {
      titulo: 'Do domínio e da hospedagem',
      paragrafos: [
        {
          texto:
            d.hospedagem === 'incluso_1_ano'
              ? 'O primeiro ano de domínio e de hospedagem está incluído no valor deste contrato. A partir do segundo ano, a renovação fica a cargo do CONTRATANTE, que pode contar com a orientação da CONTRATADA.'
              : d.hospedagem === 'manutencao'
                ? 'A hospedagem do site está incluída no plano mensal de manutenção enquanto ele estiver ativo. O domínio é registrado em nome do CONTRATANTE.'
                : 'O registro do domínio e a hospedagem ficam por conta do CONTRATANTE, em seu nome. A CONTRATADA orienta a contratação e faz a configuração sem custo adicional.',
        },
      ],
    },
  ]
  if (d.manutencao.ativa && d.manutencao.valor > 0) {
    lista.push({
      titulo: 'Da manutenção mensal',
      paragrafos: [
        {
          texto: `Após a publicação, o CONTRATANTE contrata o plano de manutenção mensal no valor de ${reais(d.manutencao.valor)} (${valorPorExtenso(d.manutencao.valor)}) por mês${d.manutencao.inclui.trim() ? `, que inclui: ${d.manutencao.inclui.trim().replace(/\.$/, '')}.` : '.'}`,
        },
        { texto: 'A manutenção pode ser cancelada por qualquer das partes, por escrito, com aviso prévio de 30 (trinta) dias.' },
      ],
    })
  }
  lista.push(
    {
      titulo: 'Da propriedade e do uso',
      paragrafos: [
        { texto: 'Após o pagamento integral, o CONTRATANTE passa a ter o direito de uso do site e de todo o seu conteúdo.' },
        ...(d.portfolio ? [{ texto: 'A CONTRATADA poderá mostrar o site em seu portfólio, sem divulgar informações sigilosas do CONTRATANTE.' }] : []),
      ],
    },
    {
      titulo: 'Da rescisão',
      paragrafos: [
        { texto: 'Este contrato pode ser rescindido por qualquer das partes, mediante comunicação por escrito.' },
        {
          texto:
            'Se o CONTRATANTE rescindir depois do início dos trabalhos, os valores já pagos não serão devolvidos, pois cobrem o trabalho realizado. Se a CONTRATADA rescindir sem justo motivo, devolverá os valores recebidos por serviços ainda não executados.',
        },
      ],
    },
    {
      titulo: 'Da proteção de dados',
      paragrafos: [{ texto: 'As partes tratarão os dados pessoais a que tiverem acesso de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), apenas para cumprir este contrato.' }],
    },
  )
  const extras = d.extras
    .split('\n\n')
    .map((t) => t.trim())
    .filter(Boolean)
  if (extras.length) lista.push({ titulo: 'Disposições adicionais', paragrafos: extras.map((texto) => ({ texto })) })
  lista.push({
    titulo: 'Do foro',
    paragrafos: [
      { texto: `Fica eleito o foro da comarca de ${d.foro.trim() || d.contratada.cidade.trim() || '________________'} para resolver qualquer questão sobre este contrato.` },
      { texto: 'As partes reconhecem como válida a assinatura deste contrato por meio eletrônico (por exemplo, pelo gov.br) e, por estarem de acordo, assinam este documento.' },
    ],
  })
  return lista
}

/** O que falta preencher para o contrato fazer sentido (vazio = pronto). */
export function faltando(d: ContratoDados): string[] {
  const f: string[] = []
  if (!d.contratada.nome.trim()) f.push('seu nome ou o nome da sua empresa')
  if (!d.contratada.documento.trim()) f.push('seu CPF ou CNPJ')
  if (!d.contratante.nome.trim()) f.push('o nome do cliente')
  if (!(d.valor > 0)) f.push('o valor do projeto')
  return f
}
