/**
 * Identificação do responsável pela XS, usada na Política de Privacidade e nos Termos de Uso.
 *
 * TODO(jurídico): preencher TODOS os campos `null` antes de publicar as páginas.
 * Enquanto um campo estiver vazio, a página não mostra nada inventado: no `npm run dev`
 * aparece um aviso "Preencher: …" no lugar; na versão publicada, um texto neutro.
 */
export const LEGAL: {
  controlador: string | null
  documento: string | null
  endereco: string | null
  emailPrivacidade: string | null
  encarregado: string | null
  foro: string | null
  atualizadoEm: string
} = {
  // TODO(jurídico): nome completo (pessoa física) ou razão social (empresa) responsável pela XS Prospecção
  controlador: null,
  // TODO(jurídico): CPF ou CNPJ do responsável
  documento: null,
  // TODO(jurídico): endereço para correspondência
  endereco: null,
  // TODO(jurídico): e-mail que recebe pedidos de privacidade e contato geral (ex.: um endereço só para isso)
  emailPrivacidade: null,
  // TODO(jurídico): nome do encarregado (DPO). Agentes de pequeno porte podem dispensar a indicação
  // (Resolução CD/ANPD nº 2/2022), mas precisam manter o canal de contato acima. Deixe null se não houver.
  encarregado: null,
  // TODO(jurídico): cidade/UF do foro para os Termos de Uso
  foro: null,
  // Data desta versão dos textos. Atualize sempre que mudar o conteúdo das páginas.
  atualizadoEm: '3 de outubro de 2026',
}
