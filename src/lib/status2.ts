import type { Settings } from './types'

/** Opções padrão do Status 2 — acompanhamento depois da ligação. Editáveis em Ajustes. */
export const DEFAULT_STATUS2 = [
  'Mensagem enviada',
  'Exemplo enviado',
  'Proposta enviada',
  'Aguardando resposta',
  'Em negociação',
  'Fechado',
  'Perdido',
]

export function getStatus2Options(settings: Settings): string[] {
  return settings.status2_opcoes?.length ? settings.status2_opcoes : DEFAULT_STATUS2
}
