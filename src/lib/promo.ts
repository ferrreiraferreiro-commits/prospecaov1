// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Semana grátis: até o fim de 19/10/2026 (Brasília) a XS é grátis para todo mundo.
 * As datas das contas foram esticadas no banco (migração 0020); aqui só muda o texto do site.
 * Depois dessa data os textos voltam sozinhos para o teste de 1 dia.
 */
export const GRATIS_ATE = Date.parse('2026-10-19T23:59:59-03:00')
export const GRATIS_ATE_TEXTO = '19/10'

export function semanaGratis(now = Date.now()): boolean {
  return now <= GRATIS_ATE
}
