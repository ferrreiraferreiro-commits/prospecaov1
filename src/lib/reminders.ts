import { PERIODOS, timeHM, todayKey } from './dates'
import type { Followup, Lead, Meeting } from './types'

export interface Reminder {
  /** Chave única: o mesmo aviso nunca dispara duas vezes */
  key: string
  title: string
  body: string
  leadId: string | null
}

/** Minutos de antecedência para avisar de uma reunião. */
export const MEETING_LEAD_MIN = 10

function minus(hm: string, minutes: number): string {
  const [h, m] = hm.split(':').map(Number)
  const t = Math.max(0, h * 60 + m - minutes)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Avisos que já deveriam ter tocado hoje e ainda não tocaram.
 * - Retorno com horário: na hora marcada.
 * - Retornos por período (manhã/tarde/noite): um aviso só, no início do período.
 * - Reunião com horário: 10 minutos antes.
 * Só olha o dia de hoje — atrasos de outros dias ficam no sino e na tela Hoje.
 */
export function dueReminders(followups: Followup[], meetings: Meeting[], leads: Lead[], fired: Set<string>, now: Date = new Date()): Reminder[] {
  const today = todayKey(now)
  const hm = timeHM(now)
  const name = new Map(leads.map((l) => [l.id, l.empresa]))
  const out: Reminder[] = []

  for (const f of followups) {
    // Só dentro de 2h depois do horário: abrir o app à noite não dispara o retorno da manhã.
    if (f.concluido || f.data !== today || !f.horario || f.horario > hm || f.horario < minus(hm, 120)) continue
    const key = `fu:${f.id}:${f.horario}`
    if (!fired.has(key) && name.has(f.lead_id)) {
      out.push({ key, title: `Retorno agora: ${name.get(f.lead_id)}`, body: f.observacao || `Retorno marcado para ${f.horario}.`, leadId: f.lead_id })
    }
  }

  PERIODOS.forEach((p, i) => {
    const end = PERIODOS[i + 1]?.hora ?? '23:59'
    if (p.hora > hm || hm >= end) return
    const due = followups.filter((f) => !f.concluido && f.data === today && !f.horario && f.periodo === p.id && name.has(f.lead_id))
    const key = `periodo:${today}:${p.id}`
    if (!due.length || fired.has(key)) return
    out.push({
      key,
      title: due.length === 1 ? `Retorno da ${p.label.toLowerCase()}: ${name.get(due[0].lead_id)}` : `${due.length} retornos para a ${p.label.toLowerCase()}`,
      body: due.length === 1 ? due[0].observacao || 'Hora de ligar.' : due.slice(0, 4).map((f) => name.get(f.lead_id)).join(', '),
      leadId: due.length === 1 ? due[0].lead_id : null,
    })
  })

  for (const m of meetings) {
    if (m.data !== today || !m.horario || m.resultado || minus(m.horario, MEETING_LEAD_MIN) > hm || m.horario < minus(hm, 60)) continue
    const key = `reuniao:${m.id}:${m.horario}`
    if (!fired.has(key) && name.has(m.lead_id)) {
      out.push({ key, title: `Reunião às ${m.horario}: ${name.get(m.lead_id)}`, body: m.contato ? `Com ${m.contato}${m.observacao ? ` · ${m.observacao}` : ''}` : m.observacao || 'Prepare o exemplo.', leadId: m.lead_id })
    }
  }
  return out
}
