import type { StatusCustom, StatusId } from './types'

export type Tone = 'neutral' | 'muted' | 'yellow' | 'orange' | 'red' | 'blue' | 'sky' | 'teal' | 'green' | 'gold'

export interface StatusDef {
  id: StatusId
  label: string
  /** Rótulo usado no painel "Como foi a ligação?" */
  callLabel: string
  tone: Tone
  /** A pessoa atendeu (conta como contato). */
  contato: boolean
  /** Resultado de uma tentativa sem conversa. */
  semResposta: boolean
}

export const STATUSES: StatusDef[] = [
  { id: 'novo', label: 'Novo', callLabel: 'Novo', tone: 'neutral', contato: false, semResposta: false },
  { id: 'so_chama', label: 'Só chama', callLabel: 'Só chamou', tone: 'yellow', contato: false, semResposta: true },
  { id: 'nao_atendeu', label: 'Não atendeu', callLabel: 'Não atendeu', tone: 'yellow', contato: false, semResposta: true },
  { id: 'nao_completou', label: 'Não completou', callLabel: 'Não completou', tone: 'orange', contato: false, semResposta: true },
  { id: 'numero_incorreto', label: 'Número incorreto', callLabel: 'Número incorreto', tone: 'red', contato: false, semResposta: false },
  { id: 'falei_responsavel', label: 'Falei com responsável', callLabel: 'Falei com alguém', tone: 'blue', contato: true, semResposta: false },
  { id: 'pediu_whatsapp', label: 'Pediu WhatsApp', callLabel: 'Pediu WhatsApp', tone: 'teal', contato: true, semResposta: false },
  { id: 'follow_up', label: 'Retorno', callLabel: 'Pediu retorno', tone: 'sky', contato: true, semResposta: false },
  { id: 'agendou_reuniao', label: 'Agendou reunião', callLabel: 'Agendou reunião', tone: 'green', contato: true, semResposta: false },
  { id: 'nao_tem_interesse', label: 'Não tem interesse', callLabel: 'Não tem interesse', tone: 'muted', contato: true, semResposta: false },
  { id: 'cliente_potencial', label: 'Cliente potencial', callLabel: 'Cliente potencial', tone: 'gold', contato: true, semResposta: false },
  { id: 'finalizado', label: 'Finalizado', callLabel: 'Finalizado', tone: 'muted', contato: false, semResposta: false },
]

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<StatusId, StatusDef>

/** Nomes e cores originais (para restaurar). */
export const STATUS_DEFAULTS: Record<StatusId, Pick<StatusDef, 'label' | 'callLabel' | 'tone'>> = Object.fromEntries(
  STATUSES.map((s) => [s.id, { label: s.label, callLabel: s.callLabel, tone: s.tone }]),
) as Record<StatusId, Pick<StatusDef, 'label' | 'callLabel' | 'tone'>>

export const TONES: Tone[] = ['neutral', 'muted', 'yellow', 'orange', 'red', 'blue', 'sky', 'teal', 'green', 'gold']

let hidden = new Set<StatusId>()

/**
 * Aplica a personalização salva em Roteiros → Status (nomes, cores, ocultos).
 * Os objetos de STATUSES/STATUS_MAP são atualizados no lugar, então todas as telas leem o nome novo.
 */
export function applyStatusCustom(custom: Partial<Record<StatusId, StatusCustom>> | null | undefined) {
  hidden = new Set()
  for (const s of STATUSES) {
    const base = STATUS_DEFAULTS[s.id]
    const c = custom?.[s.id]
    s.label = c?.label?.trim() || base.label
    s.callLabel = c?.callLabel?.trim() || base.callLabel
    s.tone = c?.tone && (TONES as string[]).includes(c.tone) ? (c.tone as Tone) : base.tone
    if (c?.oculto && s.id !== 'novo') hidden.add(s.id)
  }
}

/** Resultados de ligação visíveis, na ordem dos atalhos 1–0. */
export function visibleCallResults(): StatusId[] {
  return CALL_RESULTS.filter((id) => !hidden.has(id))
}

/** Resultados oferecidos após uma ligação, na ordem dos atalhos 1–0. */
export const CALL_RESULTS: StatusId[] = [
  'so_chama',
  'nao_atendeu',
  'nao_completou',
  'numero_incorreto',
  'falei_responsavel',
  'pediu_whatsapp',
  'follow_up',
  'agendou_reuniao',
  'nao_tem_interesse',
  'cliente_potencial',
]

export const SEM_RESPOSTA: StatusId[] = STATUSES.filter((s) => s.semResposta).map((s) => s.id)

export function isContato(status: StatusId | null | undefined): boolean {
  return !!status && STATUS_MAP[status]?.contato === true
}

export function statusFromText(text: string | null): StatusId | null {
  if (!text) return null
  const norm = normalizeKey(text)
  const hit = STATUSES.find((s) => normalizeKey(s.label) === norm || normalizeKey(s.callLabel) === norm || s.id === norm)
  return hit?.id ?? null
}

export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Classes Tailwind por tom — fundo discreto, texto tingido, ponto colorido. */
export const TONE_CLASSES: Record<Tone, { chip: string; dot: string; bar: string }> = {
  neutral: { chip: 'bg-tint/[0.04] text-zinc-300 ring-tint/10', dot: 'bg-zinc-400', bar: 'bg-zinc-500' },
  muted: { chip: 'bg-tint/[0.03] text-zinc-500 ring-tint/[0.07]', dot: 'bg-zinc-600', bar: 'bg-zinc-700' },
  yellow: { chip: 'bg-yellow-400/[0.07] text-yellow-200/80 ring-yellow-300/15', dot: 'bg-yellow-300/70', bar: 'bg-yellow-300/60' },
  orange: { chip: 'bg-orange-400/[0.08] text-orange-300 ring-orange-300/15', dot: 'bg-orange-400', bar: 'bg-orange-400' },
  red: { chip: 'bg-red-500/[0.09] text-red-300 ring-red-400/20', dot: 'bg-red-400', bar: 'bg-red-400' },
  blue: { chip: 'bg-blue-500/[0.10] text-blue-300 ring-blue-400/20', dot: 'bg-blue-400', bar: 'bg-blue-400' },
  sky: { chip: 'bg-sky-400/[0.09] text-sky-300 ring-sky-300/20', dot: 'bg-sky-300', bar: 'bg-sky-300' },
  teal: { chip: 'bg-teal-400/[0.08] text-teal-300 ring-teal-300/20', dot: 'bg-teal-300', bar: 'bg-teal-300' },
  green: { chip: 'bg-emerald-400/[0.10] text-emerald-300 ring-emerald-300/25', dot: 'bg-emerald-400', bar: 'bg-emerald-400' },
  gold: { chip: 'bg-amber-400/[0.10] text-amber-300 ring-amber-300/25', dot: 'bg-amber-300', bar: 'bg-amber-300' },
}
