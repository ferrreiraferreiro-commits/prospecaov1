import { firstName, pickResponsavel } from './cnpj'
import { titleCase } from './script'
import type { Interaction, Lead, MessageTemplate, Settings } from './types'

export const DEFAULT_MESSAGES: MessageTemplate[] = [
  {
    id: 'pos_ligacao',
    nome: 'Depois da ligação',
    variacoes: [
      '{saudacao}, {responsavel}! Aqui é o {nome}, falamos agora há pouco por telefone. Como combinado, segue um exemplo de site para {nicho}. Qualquer dúvida é só me chamar por aqui.',
      '{saudacao}, {responsavel}! É o {nome}, da ligação de agora. Te mando aqui o exemplo que comentei, de site para {nicho}. Fico à disposição!',
    ],
  },
  {
    id: 'primeiro_contato',
    nome: 'Primeiro contato',
    variacoes: [
      '{saudacao}! Tudo bem? Aqui é o {nome}. Encontrei a {empresa} no Google e vi que vocês ainda não têm um site próprio. Trabalho com {servico} aqui em {cidade}. Posso te mostrar um exemplo rápido, sem compromisso?',
      '{saudacao}, tudo certo? Sou o {nome}, trabalho com {servico} para empresas de {cidade}. Vi a {empresa} no Google Maps, com ótimas avaliações, mas sem site. Posso te mandar uma ideia de como ficaria?',
    ],
  },
  {
    id: 'retorno',
    nome: 'Tentativa de retorno',
    variacoes: [
      '{saudacao}, {responsavel}! Aqui é o {nome}. Tentei te ligar e não consegui falar. Qual o melhor horário pra eu te ligar rapidinho?',
      '{saudacao}! É o {nome}, tentei contato por telefone com a {empresa}. Quando fica bom pra conversarmos 5 minutos?',
    ],
  },
]

export function getMessages(settings: Settings): MessageTemplate[] {
  return settings.mensagens?.length ? settings.mensagens : DEFAULT_MESSAGES
}

/** "Bom dia" até 11:59, "Boa tarde" até 17:59, depois "Boa noite". */
export function saudacao(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Nome de quem decide: quem atendeu a ligação ou, se o CNPJ conferir com o lead,
 * o sócio responsável. Nunca inventa — sem dado, volta vazio.
 */
export function responsavelDoLead(lead: Lead): string {
  if (lead.falei_com?.trim()) return firstName(lead.falei_com)
  if (lead.cnpj_info?.confere) return firstName(pickResponsavel(lead.cnpj_info.socios)?.nome)
  // Exportações que já trazem o responsável (ex.: "Responsável : Maria Souza")
  for (const [k, v] of Object.entries(lead.dados_extras ?? {})) {
    if (/respons|s[oó]cio|propriet/i.test(k) && v.trim()) return firstName(v)
  }
  return ''
}

export const MESSAGE_VARIABLES = ['{saudacao}', '{responsavel}', '{empresa}', '{cidade}', '{nicho}', '{nome}', '{servico}'] as const

/**
 * Preenche as variáveis. Uma variável sem valor some junto com a vírgula/espaço
 * que sobraria ("Bom dia, {responsavel}!" sem nome vira "Bom dia!").
 */
export function fillMessage(text: string, lead: Lead, settings: Settings, now: Date = new Date()): string {
  const vars: Record<string, string> = {
    saudacao: saudacao(now),
    responsavel: responsavelDoLead(lead),
    empresa: titleCase(lead.empresa),
    cidade: lead.cidade ?? '',
    nicho: (lead.nicho ?? '').toLowerCase(),
    nome: settings.nome_vendedor.trim().split(/\s+/)[0] ?? '',
    servico: settings.servico.trim() || 'desenvolvimento de sites',
  }
  const filled = text.replace(/\{\s*(\w+)\s*\}/g, (m, key: string) => (key in vars ? vars[key] : m))
  return filled
    .replace(/\b(de|da|do|em|para)[ \t]+(?=[.,!?]|$)/gm, '') // "site para ." → "site ."
    .replace(/,[ \t]*([!?.,])/g, '$1') // "Bom dia, !" → "Bom dia!"
    .replace(/[ \t]+([!?.,])/g, '$1') // "site ." → "site."
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Variação usada para este lead: sempre a mesma por lead, distribuída em rodízio. */
export function pickVariation(template: MessageTemplate, leadId: string): string {
  return variationsOf(template)[variationIndex(template, leadId)] ?? ''
}

/** Variações preenchidas do modelo (ignora as vazias). */
export function variationsOf(template: MessageTemplate): string[] {
  return template.variacoes.map((v) => v.trim()).filter(Boolean)
}

export function variationIndex(template: MessageTemplate, leadId: string): number {
  const n = variationsOf(template).length
  if (!n) return 0
  let hash = 0
  for (let i = 0; i < leadId.length; i++) hash = (hash * 31 + leadId.charCodeAt(i)) >>> 0
  return hash % n
}

/** Data/hora da última mensagem registrada para o lead. */
export function lastMessageAt(interactions: Interaction[], leadId: string): string | null {
  let last: string | null = null
  for (const i of interactions) {
    if (i.lead_id === leadId && i.tipo === 'mensagem' && (!last || i.created_at > last)) last = i.created_at
  }
  return last
}
