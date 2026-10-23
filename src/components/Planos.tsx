import clsx from 'clsx'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatPreco, linkCheckout, useAssinatura } from '../lib/assinatura'
import { suporteUrl, useSuporteWhatsApp } from '../lib/suporte'
import { useAccount } from '../store/useAccount'
import { WhatsAppIcon } from './ui'

/**
 * Botão do plano Mensal (o único que a XS vende). Com o checkout da SigiloPay salvo na
 * tela Contas, abre o checkout com a conta junto e o plano libera sozinho quando pagar.
 * Sem checkout, cai no WhatsApp do dono com a mensagem pronta. Sem nenhum dos dois, some.
 */
export function EscolherPlano({ size = 'md', className, titulo }: { size?: 'sm' | 'md'; className?: string; titulo?: ReactNode }) {
  const { checkout, preco } = useAssinatura()
  const suporte = useSuporteWhatsApp()
  const profile = useAccount((s) => s.profile)
  if (!checkout && !suporte) return null
  const renovar = profile?.plano === 'ativo'
  const rotulo = `${renovar ? 'Renovar' : 'Assinar'} Mensal${preco ? ` · ${formatPreco(preco)}` : ''}`
  const classe = clsx(
    'inline-flex items-center gap-1.5 rounded-md bg-go font-semibold text-[#04140c] transition-colors hover:bg-[#4ccb8d]',
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-10 px-4 text-sm',
  )
  const icone = size === 'sm' ? 'size-3.5' : 'size-4'

  let botao: ReactNode
  if (checkout) {
    botao = (
      <a href={linkCheckout(checkout, profile?.user_id)} target="_blank" rel="noreferrer" className={classe}>
        <span className="num">{rotulo}</span> <ArrowUpRight className={icone} />
      </a>
    )
  } else {
    const conta = profile?.email || profile?.usuario || ''
    const texto = `Oi! Tenho interesse em ${renovar ? 'renovar' : 'assinar'} o plano Mensal da XS.${conta ? ` Minha conta: ${conta}` : ''}`
    botao = (
      <a href={suporteUrl(suporte!, texto)} target="_blank" rel="noreferrer" className={classe}>
        <WhatsAppIcon className={icone} /> <span className="num">{rotulo}</span>
      </a>
    )
  }

  const botoes = <div className={clsx('flex flex-wrap gap-1.5', className)}>{botao}</div>
  if (!titulo) return botoes
  return (
    <>
      {titulo}
      {botoes}
    </>
  )
}
