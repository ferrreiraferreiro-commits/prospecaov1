import { useEffect, useState } from 'react'

/** Evento que o Chrome/Edge/Android dispara quando o site pode virar app instalado. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()

/** Chamado uma vez no início: registra o service worker e guarda o convite de instalação. */
export function setupPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPrompt
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker não registrado', err))
    })
  }
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** [pode instalar agora?, instalar] */
export function useInstall(): [boolean, () => Promise<boolean>] {
  const [can, setCan] = useState(!!deferred)
  useEffect(() => {
    const l = () => setCan(!!deferred)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    setCan(false)
    return outcome === 'accepted'
  }
  return [can, install]
}

export type Navegador = 'brave' | 'edge' | 'chrome' | 'samsung' | 'firefox' | 'safari' | 'outro'

export async function detectarNavegador(): Promise<Navegador> {
  const ua = navigator.userAgent
  const brave = (navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave
  if (brave && (await brave.isBrave().catch(() => false))) return 'brave'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Edg\//.test(ua)) return 'edge'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'outro'
}

export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

/** O app já está instalado neste aparelho? (Chrome/Edge; nos outros responde false) */
export async function appJaInstalado(): Promise<boolean> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
  if (!nav.getInstalledRelatedApps) return false
  try {
    return (await nav.getInstalledRelatedApps()).length > 0
  } catch {
    return false
  }
}
