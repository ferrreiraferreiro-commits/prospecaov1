// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Modo live: borra nomes, telefones, e-mails, endereços, valores e anotações para
 * mostrar a tela numa live ou gravação sem expor os dados dos leads e clientes.
 *
 * Quem marca o que é sensível é a classe `pv` (ver index.css). Com o modo ligado,
 * <html data-privado> faz o borrão; a escolha fica salva neste navegador.
 */

const KEY = 'xs-prospeccao:modo-live'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function apply(on: boolean) {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.dataset.privado = ''
  else delete document.documentElement.dataset.privado
}

interface PrivacyState {
  on: boolean
  set(on: boolean): void
  toggle(): void
}

export const usePrivacy = create<PrivacyState>()((set, get) => ({
  on: load(),
  set(on) {
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
    apply(on)
    set({ on })
  },
  toggle() {
    get().set(!get().on)
  },
}))

/** Atalho do teclado: Alt + Shift + O (de "ocultar"). */
export const PRIVACY_SHORTCUT = 'Alt + Shift + O'

/**
 * Liga o modo no <html> já ao abrir o app, escuta o atalho e esconde as dicas
 * (atributo title) de quem está borrado, que mostrariam o texto ao passar o mouse.
 */
export function usePrivacyMode() {
  useEffect(() => {
    apply(usePrivacy.getState().on)
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyO') {
        e.preventDefault()
        usePrivacy.getState().toggle()
      }
    }
    const onOver = (e: Event) => {
      if (!usePrivacy.getState().on) return
      const el = (e.target as Element | null)?.closest?.('.pv[title], .pv [title]')
      if (el) el.removeAttribute('title')
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerover', onOver, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerover', onOver, true)
    }
  }, [])
}
