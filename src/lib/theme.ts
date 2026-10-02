import { useEffect, useState } from 'react'

export type ThemePref = 'dark' | 'light' | 'system'

const KEY = 'central-prospeccao:tema'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const theme = resolve(pref)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f4f6' : '#08090b')
}

/** Tema escolhido (Escuro / Claro / Sistema), salvo neste dispositivo. */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref)

  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const update = (p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    setPref(p)
  }
  return [pref, update]
}
