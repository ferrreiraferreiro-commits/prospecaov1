import { useCallback } from 'react'
import { formatPhone, whatsappChatUrl, whatsappTarget, type WhatsAppDestino } from '../lib/contact'
import { timeHM } from '../lib/dates'
import type { Interaction, Lead } from '../lib/types'
import { useApp } from '../store/useApp'

const PREF_KEY = 'central-prospeccao:whatsapp-destino'
/** Nome fixo da aba: cada lead reaproveita a mesma aba do WhatsApp Web em vez de abrir outra. */
const WA_WINDOW = 'whatsapp-web'

/** Preferência por dispositivo: WhatsApp Web (navegador) ou app do WhatsApp instalado. */
export function getWhatsAppDestino(): WhatsAppDestino {
  try {
    return localStorage.getItem(PREF_KEY) === 'app' ? 'app' : 'web'
  } catch {
    return 'web'
  }
}

export function setWhatsAppDestino(v: WhatsAppDestino) {
  try {
    localStorage.setItem(PREF_KEY, v)
  } catch {
    /* sem armazenamento: fica no padrão */
  }
}

function openUrl(url: string, destino: WhatsAppDestino) {
  if (destino === 'app') {
    window.location.href = url
    return
  }
  const win = window.open(url, WA_WINDOW)
  win?.focus()
}

export function useWhatsApp() {
  const registerCall = useApp((s) => s.registerCall)
  const toast = useApp((s) => s.toast)

  /** Abre a conversa. Com `ligar`, também registra a ligação (data/hora do clique). */
  const open = useCallback(
    async (lead: Lead, opts: { ligar?: boolean } = {}): Promise<Interaction | null> => {
      const target = whatsappTarget(lead)
      if (!target) {
        toast('Este lead não tem WhatsApp nem telefone válido no cadastro.', 'error')
        return null
      }
      const destino = getWhatsAppDestino()
      // window.open precisa acontecer no próprio clique (antes de qualquer await) para não ser bloqueado.
      openUrl(whatsappChatUrl(target.number, destino), destino)
      const origem = target.fromPhone ? ' (pelo telefone — WhatsApp não informado)' : ''
      if (!opts.ligar) {
        toast(`WhatsApp aberto${origem}.`, 'info')
        return null
      }
      const call = await registerCall(lead.id)
      toast(`WhatsApp aberto e ligação registrada às ${timeHM(new Date(call.created_at))}. Clique no ícone de telefone da conversa para ligar.${origem}`)
      return call
    },
    [registerCall, toast],
  )

  return open
}

export function useCopyPhone() {
  const toast = useApp((s) => s.toast)
  return useCallback(
    async (value: string | null, label = 'Número') => {
      if (!value) return
      const text = formatPhone(value) || value
      try {
        await navigator.clipboard.writeText(text)
        toast(`${label} copiado: ${text}`, 'info')
      } catch {
        toast('Não foi possível copiar. Selecione o número manualmente.', 'error')
      }
    },
    [toast],
  )
}
