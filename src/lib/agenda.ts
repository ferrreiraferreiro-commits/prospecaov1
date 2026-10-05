import { waFetch } from './waServico'
import { saudacao } from './messages'
import { useApp } from '../store/useApp'

export type AgendaStatus = 'agendado' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'

export interface Agendamento {
  id: string
  leadId: string | null
  nome: string
  telefone: string
  texto: string
  quando: string
  status: AgendaStatus
  erro: string | null
  enviadoEm: string | null
  messageId: string | null
  entrega: 'aceito' | 'entregue' | 'lido' | null
  respostas: { em: string; texto: string }[]
  criadoEm: string
  sincEnvio: boolean
  sincRespostas: number
}

/** "2026-10-04" + "08:00" no fuso do computador → ISO. */
export function toIso(date: string, time: string): string {
  return new Date(`${date}T${time || '08:00'}:00`).toISOString()
}

export function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

/** "daqui a 9 h", "em 2 dias", "há 5 min" */
export function relativeTo(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  const txt = min < 1 ? 'agora' : min < 60 ? `${min} min` : min < 60 * 36 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dias`
  if (txt === 'agora') return 'agora'
  return diff >= 0 ? `daqui a ${txt}` : `há ${txt}`
}

/** Atalhos de horário: hoje 18h, amanhã 8h… (pula os que já passaram). */
export function quickTimes(now = new Date()): { label: string; iso: string }[] {
  const at = (days: number, h: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(h, 0, 0, 0)
    return d
  }
  const nextMonday = (() => {
    const d = at(1, 9)
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
    return d
  })()
  return [
    { label: 'Daqui a 1 h', d: new Date(now.getTime() + 3_600_000) },
    { label: 'Hoje 18:00', d: at(0, 18) },
    { label: 'Amanhã 08:00', d: at(1, 8) },
    { label: 'Amanhã 14:00', d: at(1, 14) },
    { label: 'Segunda 09:00', d: nextMonday },
  ]
    .filter((x) => x.d.getTime() > now.getTime() + 60_000)
    .map((x) => ({ label: x.label, iso: x.d.toISOString() }))
}

/** Leva envios e respostas dos agendamentos para o histórico dos leads (uma vez só). */
export async function syncAgenda(): Promise<number> {
  const list = await waFetch<Agendamento[]>('/agenda', { timeoutMs: 6000 })
  const app = useApp.getState()
  const exists = new Set(app.leads.map((l) => l.id))
  const itens: { id: string; envio: boolean; respostas: number }[] = []
  for (const a of list) {
    const terminou = a.status === 'enviado' || a.status === 'falhou'
    const precisaEnvio = terminou && !a.sincEnvio
    const novas = a.respostas.slice(a.sincRespostas)
    if (!precisaEnvio && !novas.length) continue
    if (a.leadId && exists.has(a.leadId)) {
      if (precisaEnvio && a.status === 'enviado') {
        const texto = a.texto.replace(/\{\s*saudacao\s*\}/gi, saudacao(new Date(a.enviadoEm ?? a.quando)))
        await app.logMessage(a.leadId, texto, 'Agendada')
      }
      if (precisaEnvio && a.status === 'falhou') await app.addNote(a.leadId, `Mensagem agendada não enviada: ${a.erro ?? 'falha no envio'}`)
      for (const r of novas) await app.addNote(a.leadId, `Respondeu no WhatsApp (${new Date(r.em).toLocaleString('pt-BR')}): "${r.texto}"`)
    }
    itens.push({ id: a.id, envio: precisaEnvio || a.sincEnvio, respostas: a.respostas.length })
  }
  if (itens.length) await waFetch('/agenda/sincronizado', { method: 'POST', json: { itens } })
  return itens.length
}
