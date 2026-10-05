import { useCallback } from 'react'
import { formatPhone, whatsappChatUrl, whatsappTarget, type WhatsAppDestino } from '../lib/contact'
import { timeHM } from '../lib/dates'
import { waFetch } from '../lib/waServico'
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

/**
 * Abre a conversa com a mensagem já escrita — a pessoa confere e aperta enviar no WhatsApp.
 * Registra no histórico do lead. Nada é enviado automaticamente.
 */
export function useSendMessage() {
  const logMessage = useApp((s) => s.logMessage)
  const toast = useApp((s) => s.toast)
  return useCallback(
    (lead: Lead, text: string, modelo?: string | null): boolean => {
      const target = whatsappTarget(lead)
      if (!target) {
        toast('Este lead não tem WhatsApp nem telefone válido no cadastro.', 'error')
        return false
      }
      const destino = getWhatsAppDestino()
      openUrl(whatsappChatUrl(target.number, destino, text.trim()), destino) // ainda dentro do clique
      void logMessage(lead.id, text, modelo)
      return true
    },
    [logMessage, toast],
  )
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

/**
 * Manda a mensagem na hora pelo WhatsApp conectado na XS (sem abrir o WhatsApp).
 * Registra no histórico do lead como as mensagens abertas no WhatsApp.
 */
export function useSendNow() {
  const logMessage = useApp((s) => s.logMessage)
  const toast = useApp((s) => s.toast)
  return useCallback(
    async (lead: Lead, text: string, modelo?: string | null): Promise<boolean> => {
      const target = whatsappTarget(lead)
      if (!target) {
        toast('Este lead não tem WhatsApp nem telefone válido no cadastro.', 'error')
        return false
      }
      try {
        await waFetch('/whatsapp/teste', { method: 'POST', json: { telefone: target.number, texto: text.trim() }, timeoutMs: 45_000 })
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Não foi possível enviar pelo WhatsApp.', 'error')
        return false
      }
      await logMessage(lead.id, text, modelo ? `${modelo} · enviada pela XS` : 'Enviada pela XS')
      toast(`Mensagem enviada para ${lead.empresa}.`)
      return true
    },
    [logMessage, toast],
  )
}
