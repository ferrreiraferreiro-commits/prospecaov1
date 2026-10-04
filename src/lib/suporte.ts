import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { withCountry } from './contact'

/** WhatsApp do dono da XS, para renovar o plano (tabela xs_config, editada na tela Contas). */
const useSuporte = create<{ whatsapp: string | null; carregado: boolean }>(() => ({ whatsapp: null, carregado: false }))

let pedido: Promise<void> | null = null

function carregar(): Promise<void> {
  if (!supabase) return Promise.resolve()
  pedido ??= (async () => {
    const { data } = await supabase!.from('xs_config').select('whatsapp_suporte').eq('id', 1).maybeSingle()
    useSuporte.setState({ whatsapp: (data as { whatsapp_suporte: string | null } | null)?.whatsapp_suporte ?? null, carregado: true })
  })()
  return pedido
}

export function useSuporteWhatsApp(): string | null {
  useEffect(() => {
    void carregar()
  }, [])
  return useSuporte((s) => s.whatsapp)
}

export async function salvarSuporteWhatsApp(numero: string | null): Promise<void> {
  if (!supabase) return
  const valor = numero?.trim() ? numero.trim() : null
  const { error } = await supabase.from('xs_config').update({ whatsapp_suporte: valor, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) throw new Error(error.message)
  useSuporte.setState({ whatsapp: valor, carregado: true })
}

/** Link wa.me (abre no celular e no computador) com a mensagem pronta. */
export function suporteUrl(numero: string, texto: string): string {
  return `https://wa.me/${withCountry(numero)}?text=${encodeURIComponent(texto)}`
}
