import type { Lead, Objection, Roteiro, ScriptSection, Settings } from './types'

export const DEFAULT_SCRIPT: ScriptSection[] = [
  {
    id: 'abertura',
    titulo: 'Abertura',
    texto: 'Oi, tudo bem? Aqui é o {nome}. Posso falar com quem cuida da parte digital da {empresa}?',
  },
  {
    id: 'apresentacao',
    titulo: 'Apresentação',
    texto:
      'Prazer! Eu trabalho com {servico} para empresas aqui da região de {cidade}. É bem rápido, não vou tomar seu tempo.',
  },
  {
    id: 'pergunta',
    titulo: 'Pergunta',
    texto: 'Hoje vocês já usam algum site ou trabalham mais pelo Instagram e WhatsApp?',
  },
  {
    id: 'descoberta',
    titulo: 'Descoberta',
    texto: [
      '- Vocês recebem clientes pelo Google?',
      '- Alguém cuida da parte digital hoje?',
      '- Vocês já tiveram site?',
      '- O Instagram é o principal canal?',
      '- Chegam muitos contatos pelo WhatsApp?',
    ].join('\n'),
  },
  {
    id: 'proposta',
    titulo: 'Proposta',
    texto: [
      '- Quem procura {nicho} no Google costuma decidir pelo que encontra primeiro. Um site simples faz vocês aparecerem com mais confiança.',
      '- A ideia é uma página direta: o que vocês fazem, onde ficam, avaliações e um botão que leva pro WhatsApp.',
      '- Não substitui o Instagram — ele continua sendo o canal de vocês. O site só ajuda quem chega pelo Google.',
    ].join('\n'),
  },
  {
    id: 'fechamento',
    titulo: 'Fechamento',
    texto: [
      '- Posso montar uma ideia para vocês verem como ficaria?',
      '- Posso te mostrar um exemplo, sem compromisso?',
      '- Qual o melhor horário para eu te mostrar em 10 minutos?',
    ].join('\n'),
  },
]

export const DEFAULT_OBJECTIONS: Objection[] = [
  {
    id: 'sem_interesse',
    titulo: 'Não tenho interesse',
    resposta:
      'Tranquilo, entendo. Só pra eu não te ligar à toa depois: hoje os clientes chegam mais por indicação ou pelo Google?',
  },
  {
    id: 'instagram',
    titulo: 'Já uso Instagram',
    resposta:
      'Faz sentido, e o Instagram continua sendo o principal. O site só pega quem pesquisa no Google e ainda não segue vocês.',
  },
  {
    id: 'ja_tem_site',
    titulo: 'Já tenho site',
    resposta: 'Ah, legal! E ele traz cliente pra vocês hoje, ou fica mais parado?',
  },
  {
    id: 'caro',
    titulo: 'Está caro',
    resposta:
      'Entendo. Dá pra começar com algo enxuto, só o essencial. Se trouxer um ou dois clientes, ele já se paga.',
  },
  {
    id: 'agora_nao',
    titulo: 'Agora não',
    resposta: 'Sem problema. Qual seria um momento melhor? Te ligo no dia que você preferir.',
  },
  {
    id: 'whatsapp',
    titulo: 'Me manda no WhatsApp',
    resposta: 'Claro. Pra eu te mandar algo mais certeiro, posso só te perguntar uma coisa antes?',
  },
  {
    id: 'nao_responsavel',
    titulo: 'Não sou o responsável',
    resposta: 'Sem problema! Qual o nome de quem cuida disso? E qual o melhor horário pra falar com ele?',
  },
]

export const DEFAULT_ROTEIRO_ID = 'padrao'

/** Lista de roteiros. Sem nenhum salvo, usa o roteiro único legado (ou o padrão). */
export function getRoteiros(settings: Settings): Roteiro[] {
  if (settings.roteiros?.length) return settings.roteiros
  return [
    {
      id: DEFAULT_ROTEIRO_ID,
      nome: 'Roteiro padrão',
      secoes: settings.roteiro?.length ? settings.roteiro : DEFAULT_SCRIPT,
      objecoes: settings.objecoes?.length ? settings.objecoes : DEFAULT_OBJECTIONS,
    },
  ]
}

export function getActiveRoteiro(settings: Settings): Roteiro {
  const all = getRoteiros(settings)
  return all.find((r) => r.id === settings.roteiro_ativo) ?? all[0]
}

export function getScript(settings: Settings): ScriptSection[] {
  return getActiveRoteiro(settings).secoes
}

export function getObjections(settings: Settings): Objection[] {
  return getActiveRoteiro(settings).objecoes
}

/** Substitui {nome}, {empresa}, {cidade}, {nicho}, {servico}. */
export function fillTemplate(text: string, lead: Lead, settings: Settings): string {
  const vars: Record<string, string> = {
    nome: settings.nome_vendedor.trim().split(/\s+/)[0] || '[seu nome]',
    servico: settings.servico.trim() || 'desenvolvimento de sites',
    empresa: titleCase(lead.empresa),
    cidade: lead.cidade ?? 'sua região',
    nicho: (lead.nicho ?? 'o serviço de vocês').toLowerCase(),
  }
  return text.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m)
}

export interface ScriptBlock {
  kind: 'text' | 'list'
  lines: string[]
}

/** Agrupa linhas "- item" em listas e o resto em parágrafos. */
export function toBlocks(text: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const isItem = /^[-•*]\s+/.test(line)
    const content = line.replace(/^[-•*]\s+/, '')
    const last = blocks[blocks.length - 1]
    const kind = isItem ? 'list' : 'text'
    if (last && last.kind === kind && kind === 'list') last.lines.push(content)
    else blocks.push({ kind, lines: [content] })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Contexto do lead para a ligação
// ---------------------------------------------------------------------------

export type InsightTone = 'gold' | 'green' | 'blue' | 'neutral' | 'red'

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  detail?: string
}

export function leadInsights(lead: Lead): Insight[] {
  const out: Insight[] = []
  if (!lead.website) {
    out.push({
      id: 'sem_site',
      tone: 'gold',
      title: 'Este negócio não possui site identificado.',
      detail: 'Principal gancho da ligação.',
    })
  } else {
    out.push({ id: 'com_site', tone: 'neutral', title: 'Já possui site.', detail: 'Pergunte se ele traz clientes hoje.' })
  }

  if (lead.avaliacao !== null) {
    const total = lead.numero_avaliacoes ?? 0
    if (lead.avaliacao >= 4.5 && total >= 10) {
      out.push({ id: 'bem_avaliada', tone: 'green', title: 'Empresa bem avaliada no Google.', detail: `${fmtRating(lead.avaliacao)} ★ · ${total} avaliações` })
    } else if (lead.avaliacao >= 4.5) {
      out.push({ id: 'boa_nota_poucas', tone: 'green', title: 'Boa nota, poucas avaliações.', detail: `${fmtRating(lead.avaliacao)} ★ · ${total} avaliações` })
    } else if (lead.avaliacao < 4) {
      out.push({ id: 'nota_baixa', tone: 'neutral', title: 'Nota abaixo de 4 no Google.', detail: `${fmtRating(lead.avaliacao)} ★ · ${total} avaliações — evite citar a nota.` })
    } else {
      out.push({ id: 'nota_media', tone: 'neutral', title: 'Avaliação Google', detail: `${fmtRating(lead.avaliacao)} ★ · ${total} avaliações` })
    }
  }

  if (lead.instagram) out.push({ id: 'instagram', tone: 'blue', title: 'Tem Instagram.', detail: 'Dê uma olhada antes de ligar.' })
  if (lead.whatsapp) out.push({ id: 'whatsapp', tone: 'neutral', title: 'WhatsApp disponível.', detail: 'Bom para enviar o exemplo depois.' })
  return out
}

/** Frase de abertura sugerida para este lead, baseada só nos dados existentes. */
export function leadHooks(lead: Lead, settings: Settings): string[] {
  const hooks: string[] = []
  if (!lead.website) {
    hooks.push('Eu encontrei vocês pelo Google e percebi que vocês ainda não têm um site próprio…')
  } else {
    hooks.push('Eu vi o site de vocês e queria entender: hoje ele traz clientes ou fica mais parado?')
  }
  if (lead.avaliacao !== null && lead.avaliacao >= 4.5 && (lead.numero_avaliacoes ?? 0) >= 5) {
    hooks.push(
      `Vi que vocês são muito bem avaliados, ${fmtRating(lead.avaliacao)} estrelas no Google. Quem pesquisa já encontra uma boa reputação — falta só um lugar pra converter isso em contato.`,
    )
  }
  if (lead.instagram && !lead.website) {
    hooks.push('Vi que vocês estão no Instagram. O site ajudaria quem chega pelo Google e não segue vocês ainda.')
  }
  return hooks.map((h) => fillTemplate(h, lead, settings))
}

export function fmtRating(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "COMERCIAL RAMOS" → "Comercial Ramos" para soar natural no roteiro. */
export function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para'])
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
}
