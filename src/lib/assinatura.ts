// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'

/**
 * Plano Mensal vendido pela SigiloPay (tabela xs_config, editado na tela Contas).
 * O pagamento libera a conta sozinho: o aviso da SigiloPay chega em /api/sigilopay.
 */
export interface Assinatura {
  /** Link do checkout da oferta mensal na SigiloPay. Vazio = ainda não configurado. */
  checkout: string | null
  /** Preço que aparece nos botões e na página /assinar. */
  preco: number | null
}

const useAssinaturaStore = create<Assinatura & { carregado: boolean }>(() => ({ checkout: null, preco: null, carregado: false }))

let pedido: Promise<void> | null = null

function carregar(): Promise<void> {
  if (!supabase) return Promise.resolve()
  pedido ??= (async () => {
    // Consulta separada: se algo falhar aqui, o resto do xs_config continua funcionando
    const { data } = await supabase!.from('xs_config').select('checkout_mensal,preco_mensal').eq('id', 1).maybeSingle()
    const d = data as { checkout_mensal: string | null; preco_mensal: number | string | null } | null
    useAssinaturaStore.setState({
      checkout: d?.checkout_mensal && checkoutValido(d.checkout_mensal) ? d.checkout_mensal : null,
      preco: d?.preco_mensal != null ? Number(d.preco_mensal) : null,
      carregado: true,
    })
  })()
  return pedido
}

export function useAssinatura(): Assinatura & { carregado: boolean } {
  useEffect(() => {
    void carregar()
  }, [])
  const checkout = useAssinaturaStore((s) => s.checkout)
  const preco = useAssinaturaStore((s) => s.preco)
  const carregado = useAssinaturaStore((s) => s.carregado)
  return { checkout, preco, carregado }
}

export function checkoutValido(link: string): boolean {
  try {
    return new URL(link.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Link do checkout com a conta junto (?xs=<id>). A SigiloPay devolve esse endereço no
 * aviso de pagamento, então o plano cai na conta certa mesmo se a pessoa usar outro e-mail.
 */
export function linkCheckout(checkout: string, userId?: string | null): string {
  const u = new URL(checkout.trim())
  if (userId && userId !== 'local') u.searchParams.set('xs', userId)
  return u.toString()
}

/** "R$ 49,90" */
export function formatPreco(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export async function salvarAssinatura(checkout: string | null, preco: number | null): Promise<void> {
  if (!supabase) return
  const link = checkout?.trim() ? checkout.trim() : null
  if (link && !checkoutValido(link)) throw new Error('Cole o link completo do checkout (começa com https://).')
  if (preco != null && !(preco > 0)) throw new Error('O preço precisa ser maior que zero.')
  const { error } = await supabase.from('xs_config').update({ checkout_mensal: link, preco_mensal: preco, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) throw new Error(error.message)
  useAssinaturaStore.setState({ checkout: link, preco, carregado: true })
}

// ---------------------------------------------------------------------------
// Só o dono (tela Contas)
// ---------------------------------------------------------------------------

export interface SigiloStatus {
  token_salvo: boolean
  ultimo_aviso: string | null
}

export async function statusSigilo(): Promise<SigiloStatus> {
  if (!supabase) return { token_salvo: false, ultimo_aviso: null }
  const { data, error } = await supabase.rpc('admin_sigilopay_status')
  if (error) throw new Error(error.message)
  const linha = (Array.isArray(data) ? data[0] : data) as SigiloStatus | undefined
  return linha ?? { token_salvo: false, ultimo_aviso: null }
}

export async function salvarTokenSigilo(token: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_sigilopay_token', { token })
  if (error) throw new Error(error.message)
}

/** Pagamento que chegou pela SigiloPay mas ainda não achou conta (e-mail diferente / sem conta). */
export interface PagamentoSemConta {
  id: string
  email: string | null
  nome: string | null
  valor: number | null
  recebido_em: string
}

export async function pagamentosSemConta(): Promise<PagamentoSemConta[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('sigilopay_eventos')
    .select('id,email,nome,valor,recebido_em')
    .eq('situacao', 'sem_conta')
    .order('recebido_em', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as PagamentoSemConta[]).map((p) => ({ ...p, valor: p.valor == null ? null : Number(p.valor) }))
}
