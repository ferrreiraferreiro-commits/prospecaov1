/**
 * Agendamentos de WhatsApp: "manda esta mensagem para tal pessoa amanhã às 8h".
 * Fica em motor/storage/agendamentos.json e é enviado pelo próprio motor no horário,
 * desde que o computador esteja ligado e o WhatsApp conectado.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { finalizeText } from './disparo.js'
import { setKeepAwake } from './keepAwake.js'
import { readJson, writeJson } from './store.js'
import { formatBrazilPhone, getWa, isValidBrazilWhatsApp, samePhone, sendText, waEvents } from './whatsapp.js'

export type AgendaStatus = 'agendado' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'

export interface Agendamento {
  id: string
  /** Lead do app (opcional — pode ser só um número) */
  leadId: string | null
  nome: string
  telefone: string
  texto: string
  /** ISO: quando enviar */
  quando: string
  status: AgendaStatus
  erro: string | null
  enviadoEm: string | null
  messageId: string | null
  entrega: 'aceito' | 'entregue' | 'lido' | null
  respostas: { em: string; texto: string }[]
  criadoEm: string
  /** O app já registrou o envio / as respostas no histórico do lead */
  sincEnvio: boolean
  sincRespostas: number
}

const FILE = 'agendamentos.json'
const list: Agendamento[] = readJson<Agendamento[]>(FILE, [])

// Envio interrompido no meio (motor fechado): volta para a fila
for (const a of list) if (a.status === 'enviando') a.status = 'agendado'

function save() {
  writeJson(FILE, list)
  setKeepAwake('agenda', list.some((a) => a.status === 'agendado'))
}
save()

export function listAgenda(): Agendamento[] {
  return [...list].sort((a, b) => a.quando.localeCompare(b.quando))
}

function validate(input: { telefone?: string; texto?: string; quando?: string }) {
  const telefone = formatBrazilPhone(String(input.telefone ?? ''))
  if (!isValidBrazilWhatsApp(telefone)) throw new Error('Telefone inválido: use DDD + número.')
  const texto = String(input.texto ?? '').trim()
  if (!texto) throw new Error('Escreva a mensagem.')
  if (texto.length > 4000) throw new Error('Mensagem muito longa (máx. 4000 caracteres).')
  const when = new Date(String(input.quando ?? ''))
  if (Number.isNaN(when.getTime())) throw new Error('Data e hora inválidas.')
  return { telefone, texto, quando: when.toISOString() }
}

export function createAgenda(input: { leadId?: string | null; nome?: string; telefone?: string; texto?: string; quando?: string }): Agendamento {
  const v = validate(input)
  const a: Agendamento = {
    id: randomUUID(),
    leadId: input.leadId ? String(input.leadId) : null,
    nome: String(input.nome ?? '').trim() || v.telefone,
    ...v,
    status: 'agendado',
    erro: null,
    enviadoEm: null,
    messageId: null,
    entrega: null,
    respostas: [],
    criadoEm: new Date().toISOString(),
    sincEnvio: false,
    sincRespostas: 0,
  }
  list.push(a)
  save()
  return a
}

export function updateAgenda(id: string, patch: { texto?: string; quando?: string; telefone?: string; nome?: string }): Agendamento {
  const a = list.find((x) => x.id === id)
  if (!a) throw new Error('Agendamento não encontrado.')
  if (a.status !== 'agendado' && a.status !== 'falhou' && a.status !== 'cancelado') throw new Error('Este agendamento já foi enviado.')
  const v = validate({ telefone: patch.telefone ?? a.telefone, texto: patch.texto ?? a.texto, quando: patch.quando ?? a.quando })
  Object.assign(a, v, { nome: patch.nome?.trim() || a.nome, status: 'agendado', erro: null })
  save()
  return a
}

export function cancelAgenda(id: string) {
  const a = list.find((x) => x.id === id)
  if (!a) throw new Error('Agendamento não encontrado.')
  if (a.status === 'enviado' || a.status === 'enviando') throw new Error('Este agendamento já foi enviado.')
  a.status = 'cancelado'
  save()
}

export function deleteAgenda(id: string) {
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) throw new Error('Agendamento não encontrado.')
  if (list[i].status === 'enviando') throw new Error('Aguarde terminar o envio.')
  list.splice(i, 1)
  save()
}

export function markAgendaSynced(items: { id: string; envio: boolean; respostas: number }[]) {
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const a of list) {
    const it = byId.get(a.id)
    if (!it) continue
    if (it.envio) a.sincEnvio = true
    a.sincRespostas = Math.max(a.sincRespostas, Math.min(it.respostas, a.respostas.length))
  }
  save()
}

export function agendaPending(): number {
  return list.filter((a) => a.status === 'agendado').length
}

// ---------------------------------------------------------------------------
// Relógio: a cada 15 s envia o que venceu (um de cada vez, com uma pausa entre eles)
// ---------------------------------------------------------------------------

let busy = false

async function tick() {
  if (busy || getWa().status !== 'connected') return
  const due = listAgenda().filter((a) => a.status === 'agendado' && a.quando <= new Date().toISOString())
  if (!due.length) return
  busy = true
  try {
    for (const a of due) {
      if (getWa().status !== 'connected') break
      a.status = 'enviando'
      save()
      try {
        const sent = await sendText(a.telefone, finalizeText(a.texto))
        a.status = 'enviado'
        a.enviadoEm = new Date().toISOString()
        a.messageId = sent.messageId
        a.entrega = 'aceito'
        a.erro = null
        const atraso = Date.now() - Date.parse(a.quando)
        if (atraso > 10 * 60_000) a.erro = `Enviado com ${Math.round(atraso / 60_000)} min de atraso (o motor ou o WhatsApp estava desligado no horário).`
        console.log(`[agenda] enviado para ${a.nome}`)
      } catch (err) {
        const msg = (err as Error).message
        if (getWa().status !== 'connected') {
          a.status = 'agendado' // caiu a conexão: tenta de novo quando voltar
        } else {
          a.status = 'falhou'
          a.erro = msg
          a.enviadoEm = new Date().toISOString()
        }
      }
      save()
      // Vários no mesmo horário: espaça 20–45 s para não parecer disparo em massa
      if (due.indexOf(a) < due.length - 1) await new Promise((r) => setTimeout(r, randomInt(20_000, 45_001)))
    }
  } finally {
    busy = false
  }
}

setInterval(() => void tick(), 15_000).unref()
waEvents.connected(() => void tick())

waEvents.receipt((messageId, status) => {
  const a = list.find((x) => x.messageId === messageId)
  if (!a) return
  const rank = { aceito: 1, entregue: 2, lido: 3 } as const
  const next = status === 'read' ? 'lido' : status === 'delivered' ? 'entregue' : status === 'accepted' ? 'aceito' : null
  if (next && (!a.entrega || rank[next] > rank[a.entrega])) {
    a.entrega = next
    save()
  }
})

waEvents.incoming((phone, text) => {
  let changed = false
  for (const a of list) {
    if (a.status !== 'enviado' || !samePhone(a.telefone, phone)) continue
    // Só conta respostas que chegaram depois do envio (até 7 dias)
    if (!a.enviadoEm || Date.now() - Date.parse(a.enviadoEm) > 7 * 86_400_000) continue
    a.respostas.push({ em: new Date().toISOString(), texto: text.slice(0, 1000) })
    changed = true
  }
  if (changed) save()
})

