import { todayKey } from './dates'

const PREF_KEY = 'central-prospeccao:avisos'
const FIRED_KEY = 'central-prospeccao:avisados'

/** Avisos de retorno/reunião ligados neste dispositivo (padrão: sim). */
export function getAvisosOn(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setAvisosOn(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* sem armazenamento */
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Avisos já mostrados hoje (zera na virada do dia). */
export function loadFired(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? 'null') as { dia: string; keys: string[] } | null
    return raw && raw.dia === todayKey() ? new Set(raw.keys) : new Set()
  } catch {
    return new Set()
  }
}

export function saveFired(keys: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ dia: todayKey(), keys: [...keys] }))
  } catch {
    /* sem armazenamento */
  }
}

/**
 * Notificação do sistema (aparece mesmo com o navegador minimizado, desde que o site esteja aberto).
 * No celular o construtor `Notification` não existe — usa o service worker.
 */
export async function showSystemNotification(title: string, body: string, tag: string, onClick?: () => void) {
  if (notificationPermission() !== 'granted') return
  try {
    const n = new Notification(title, { body, tag, icon: '/icons/icon-192.png' })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  } catch {
    const reg = await navigator.serviceWorker?.ready
    await reg?.showNotification(title, { body, tag, icon: '/icons/icon-192.png' })
  }
}
