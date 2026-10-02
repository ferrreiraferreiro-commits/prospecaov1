import { useEffect } from 'react'
import { getAvisosOn, loadFired, saveFired, showSystemNotification } from '../lib/notify'
import { dueReminders } from '../lib/reminders'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'

/**
 * Confere a cada 30 s se chegou a hora de um retorno ou reunião.
 * Mostra um aviso na tela e, se permitido, uma notificação do sistema.
 * Funciona enquanto o site (ou o app instalado) estiver aberto.
 */
export function useReminders() {
  useEffect(() => {
    const tick = () => {
      if (!getAvisosOn()) return
      const { followups, meetings, leads, toast, ready } = useApp.getState()
      if (!ready) return
      const fired = loadFired()
      const due = dueReminders(followups, meetings, leads, fired)
      if (!due.length) return
      for (const r of due) {
        fired.add(r.key)
        const open = () => {
          if (r.leadId) useUi.getState().openLead(r.leadId)
        }
        toast(r.title, 'info', r.leadId ? { label: 'Abrir', run: open } : undefined)
        void showSystemNotification(r.title, r.body, r.key, open)
      }
      saveFired(fired)
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])
}
