import clsx from 'clsx'
import type { ReactNode } from 'react'
import { suporteUrl, useSuporteWhatsApp } from '../lib/suporte'
import { useAccount, type Ciclo } from '../store/useAccount'
import { WhatsAppIcon } from './ui'

const PLANOS: { ciclo: Ciclo; nome: string }[] = [
  { ciclo: 'diario', nome: 'Diário' },
  { ciclo: 'semanal', nome: 'Semanal' },
  { ciclo: 'mensal', nome: 'Mensal' },
  { ciclo: 'trimestral', nome: 'Trimestral' },
]

/**
 * Um botão por plano: abre o WhatsApp do dono da XS com a mensagem pronta
 * ("quero comprar o plano Mensal"). Some se o WhatsApp de suporte não estiver salvo.
 */
export function EscolherPlano({ size = 'md', className, titulo }: { size?: 'sm' | 'md'; className?: string; titulo?: ReactNode }) {
  const suporte = useSuporteWhatsApp()
  const profile = useAccount((s) => s.profile)
  if (!suporte) return null
  const conta = profile?.email || profile?.usuario || ''
  const renovar = profile?.plano === 'ativo'
  const botoes = (
    <div className={clsx('flex flex-wrap gap-1.5', className)}>
      {PLANOS.map((p) => {
        const texto = `Oi! Tenho interesse em ${renovar ? 'renovar' : 'comprar'} o plano ${p.nome} da XS.${conta ? ` Minha conta: ${conta}` : ''}`
        return (
          <a
            key={p.ciclo}
            href={suporteUrl(suporte, texto)}
            target="_blank"
            rel="noreferrer"
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md bg-go font-semibold text-[#04140c] transition-colors hover:bg-[#4ccb8d]',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-10 px-4 text-sm',
            )}
          >
            <WhatsAppIcon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> {p.nome}
          </a>
        )
      })}
    </div>
  )
  if (!titulo) return botoes
  return (
    <>
      {titulo}
      {botoes}
    </>
  )
}
