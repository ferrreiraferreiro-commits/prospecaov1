// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'

/** Link da comunidade da XS no WhatsApp (tabela xs_config, editado na tela Contas). Vazio = não aparece. */
const useComunidadeStore = create<{ link: string | null }>(() => ({ link: null }))

let pedido: Promise<void> | null = null

function carregar(): Promise<void> {
  if (!supabase) return Promise.resolve()
  pedido ??= (async () => {
    // Consulta separada da do WhatsApp de suporte: se algo falhar aqui, a renovação continua funcionando
    const { data } = await supabase!.from('xs_config').select('whatsapp_comunidade').eq('id', 1).maybeSingle()
    const link = (data as { whatsapp_comunidade: string | null } | null)?.whatsapp_comunidade ?? null
    useComunidadeStore.setState({ link: link && linkComunidadeValido(link) ? link : null })
  })()
  return pedido
}

export function useComunidade(): string | null {
  useEffect(() => {
    void carregar()
  }, [])
  return useComunidadeStore((s) => s.link)
}

/** Convite de grupo/comunidade (chat.whatsapp.com) ou canal (whatsapp.com/channel). */
export function linkComunidadeValido(link: string): boolean {
  try {
    const u = new URL(link.trim())
    return u.protocol === 'https:' && (u.hostname === 'chat.whatsapp.com' || (u.hostname.replace(/^www\./, '') === 'whatsapp.com' && u.pathname.startsWith('/channel/')))
  } catch {
    return false
  }
}

export async function salvarComunidade(link: string | null): Promise<void> {
  if (!supabase) return
  const valor = link?.trim() ? link.trim() : null
  if (valor && !linkComunidadeValido(valor)) throw new Error('Cole o link de convite do WhatsApp (começa com https://chat.whatsapp.com/).')
  const { error } = await supabase.from('xs_config').update({ whatsapp_comunidade: valor, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) throw new Error(error.message)
  useComunidadeStore.setState({ link: valor })
}
