/**
 * Disparo de WhatsApp em campanhas: fila, intervalo aleatório entre leads,
 * trava de duplicidade, confirmações de entrega e respostas recebidas.
 *
 * Diferenças intencionais: uma campanha por vez (mais seguro para o número) e o
 * estado fica em motor/storage/*.json — os leads continuam no XS Prospecção.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { readJson, writeJson } from './store.js'
import { formatBrazilPhone, getSock, getWa, isValidBrazilWhatsApp, receiptOf, samePhone, waEvents, withTimeout, type ReceiptStatus } from './whatsapp.js'

export type Step = { tipo: 'mensagem' } | { tipo: 'espera'; ms: number }

export type RecipientStatus = 'pendente' | 'enviando' | 'aceito' | 'entregue' | 'lido' | 'respondeu' | 'falhou' | 'ignorado'

export interface Recipient {
  id: string
  leadId: string
  nome: string
  telefone: string
  /** Um texto por etapa de mensagem, já preenchido pelo app ({saudacao} é resolvida na hora do envio) */
  textos: string[]
  status: RecipientStatus
  messageIds: string[]
  enviadas: number
  erro: string | null
  respostas: { em: string; texto: string }[]
  processadoEm: string | null
  /** O app já registrou o envio no histórico do lead */
  sincEnvio: boolean
  /** Quantas respostas o app já registrou */
  sincRespostas: number
}

export type CampaignStatus = 'rascunho' | 'fila' | 'enviando' | 'pausada' | 'concluida' | 'cancelada'

export interface LogEntry {
  em: string
  nivel: 'info' | 'sucesso' | 'aviso' | 'erro' | 'resposta'
  msg: string
  detalhe?: string
  leadId?: string
}

export interface Campaign {
  id: string
  nome: string
  funil: string
  etapas: Step[]
  destinatarios: Recipient[]
  delayMin: number
  delayMax: number
  permitirRepetidos: boolean
  status: CampaignStatus
  cursor: number
  etapaAtual: number
  proximoEnvio: string | null
  ultimoIntervaloMin: number | null
  criadaEm: string
  atualizadaEm: string
  logs: LogEntry[]
}

const FILE = 'campanhas.json'
const SENT_FILE = 'telefones-disparados.json'

const campaigns: Campaign[] = readJson<Campaign[]>(FILE, [])
/** Trava global: telefone (DDD + 8 últimos) → quando e por qual campanha recebeu */
const sent: Record<string, { campanha: string; em: string }> = readJson(SENT_FILE, {})

let safetyHold = false
let workerId: string | null = null
let saveTimer: NodeJS.Timeout | null = null

function save(now = false) {
  if (saveTimer) clearTimeout(saveTimer)
  const write = () => {
    saveTimer = null
    writeJson(FILE, campaigns)
    writeJson(SENT_FILE, sent)
  }
  if (now) write()
  else saveTimer = setTimeout(write, 400)
}

function touch(c: Campaign) {
  c.atualizadaEm = new Date().toISOString()
  save()
}

function log(c: Campaign, nivel: LogEntry['nivel'], msg: string, detalhe?: string, leadId?: string) {
  c.logs.push({ em: new Date().toISOString(), nivel, msg, detalhe, leadId })
  if (c.logs.length > 600) c.logs.splice(0, c.logs.length - 600)
  touch(c)
}

const phoneKey = (p: string) => {
  const d = p.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d
}

// Ao abrir o motor, nada volta a enviar sozinho: campanhas interrompidas ficam pausadas.
for (const c of campaigns) {
  if (c.status === 'enviando' || c.status === 'fila') {
    c.status = 'pausada'
    c.proximoEnvio = null
    for (const r of c.destinatarios) if (r.status === 'enviando') r.status = 'pendente'
    log(c, 'aviso', 'Campanha pausada porque o motor foi reiniciado', 'O ponto onde parou foi preservado. Confira o WhatsApp e retome manualmente.')
  }
}
save(true)

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function summary(c: Campaign) {
  const count = (s: RecipientStatus[]) => c.destinatarios.filter((r) => s.includes(r.status)).length
  return {
    id: c.id,
    nome: c.nome,
    funil: c.funil,
    status: c.status,
    total: c.destinatarios.length,
    processados: c.cursor,
    aceitos: count(['aceito', 'entregue', 'lido', 'respondeu']),
    entregues: count(['entregue', 'lido', 'respondeu']),
    lidos: count(['lido', 'respondeu']),
    responderam: count(['respondeu']),
    falharam: count(['falhou']),
    ignorados: count(['ignorado']),
    delayMin: c.delayMin,
    delayMax: c.delayMax,
    proximoEnvio: c.proximoEnvio,
    ultimoIntervaloMin: c.ultimoIntervaloMin,
    criadaEm: c.criadaEm,
    atualizadaEm: c.atualizadaEm,
    pendentesSync: c.destinatarios.filter(needsSync).length,
  }
}

export function needsSync(r: Recipient): boolean {
  return (!!r.processadoEm && !r.sincEnvio) || r.respostas.length > r.sincRespostas
}

export function listCampaigns() {
  return campaigns
    .slice()
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
    .map(summary)
}

export function getCampaign(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id)
}

export function runningCount(): number {
  return campaigns.filter((c) => c.status === 'enviando').length
}

/** Telefones que já receberam disparo (chave DDD + 8 últimos). */
export function sentPhones(): string[] {
  return Object.keys(sent)
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export interface NewCampaign {
  nome: string
  funil: string
  etapas: Step[]
  destinatarios: { leadId: string; nome: string; telefone: string; textos: string[] }[]
  delayMin: number
  delayMax: number
  permitirRepetidos?: boolean
}

export function createCampaign(input: NewCampaign): Campaign {
  const nome = String(input.nome || '').trim()
  if (!nome) throw new Error('Dê um nome à campanha.')
  const etapas = (Array.isArray(input.etapas) ? input.etapas : []).filter((s) => s?.tipo === 'mensagem' || (s?.tipo === 'espera' && Number(s.ms) > 0))
  const msgs = etapas.filter((s) => s.tipo === 'mensagem').length
  if (!msgs) throw new Error('O funil precisa ter ao menos uma mensagem.')
  const delayMin = Math.trunc(Number(input.delayMin))
  const delayMax = Math.trunc(Number(input.delayMax))
  if (!(delayMin >= 1 && delayMax <= 60 && delayMin <= delayMax)) throw new Error('O intervalo entre leads deve ficar entre 1 e 60 minutos (mínimo ≤ máximo).')
  const seen = new Set<string>()
  const destinatarios: Recipient[] = []
  for (const d of input.destinatarios ?? []) {
    const tel = formatBrazilPhone(d.telefone)
    const key = phoneKey(tel)
    if (!key || seen.has(key)) continue
    seen.add(key)
    destinatarios.push({
      id: randomUUID(),
      leadId: String(d.leadId),
      nome: String(d.nome || 'Lead'),
      telefone: tel,
      textos: (d.textos ?? []).map(String).slice(0, msgs),
      status: 'pendente',
      messageIds: [],
      enviadas: 0,
      erro: null,
      respostas: [],
      processadoEm: null,
      sincEnvio: false,
      sincRespostas: 0,
    })
  }
  if (!destinatarios.length) throw new Error('Nenhum destinatário com telefone válido.')
  const now = new Date().toISOString()
  const c: Campaign = {
    id: randomUUID(),
    nome,
    funil: String(input.funil || ''),
    etapas,
    destinatarios,
    delayMin,
    delayMax,
    permitirRepetidos: input.permitirRepetidos === true,
    status: 'rascunho',
    cursor: 0,
    etapaAtual: 0,
    proximoEnvio: null,
    ultimoIntervaloMin: null,
    criadaEm: now,
    atualizadaEm: now,
    logs: [],
  }
  campaigns.push(c)
  log(c, 'info', `Campanha criada com ${destinatarios.length} destinatário(s)`, `Intervalo sorteado entre ${delayMin} e ${delayMax} minutos após cada lead.`)
  return c
}

export function startCampaign(id: string, confirmResume: boolean) {
  const c = getCampaign(id)
  if (!c) throw new Error('Campanha não encontrada.')
  if (!['rascunho', 'pausada'].includes(c.status)) throw new Error('Só dá para iniciar campanhas em rascunho ou pausadas.')
  if (c.status === 'pausada' && !confirmResume) throw new Error('Confirme a retomada da campanha pausada.')
  if (getWa().status !== 'connected') throw new Error('Conecte o WhatsApp antes de iniciar.')
  safetyHold = false
  c.status = 'fila'
  log(c, 'info', c.cursor ? `Retomada a partir do lead ${c.cursor + 1}` : 'Campanha na fila de envio')
  pump()
}

export function pauseCampaign(id: string) {
  const c = getCampaign(id)
  if (!c) throw new Error('Campanha não encontrada.')
  if (!['enviando', 'fila'].includes(c.status)) throw new Error('A campanha não está enviando.')
  c.status = 'pausada'
  c.proximoEnvio = null
  log(c, 'aviso', 'Campanha pausada por você')
}

export function deleteCampaign(id: string) {
  const i = campaigns.findIndex((c) => c.id === id)
  if (i < 0) throw new Error('Campanha não encontrada.')
  if (campaigns[i].status === 'enviando') throw new Error('Pause a campanha antes de excluir.')
  campaigns.splice(i, 1)
  save(true)
}

/** O app registrou estes resultados no histórico dos leads. */
export function markSynced(id: string, items: { id: string; envio: boolean; respostas: number }[]) {
  const c = getCampaign(id)
  if (!c) return
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const r of c.destinatarios) {
    const it = byId.get(r.id)
    if (!it) continue
    if (it.envio) r.sincEnvio = true
    r.sincRespostas = Math.max(r.sincRespostas, Math.min(it.respostas, r.respostas.length))
  }
  touch(c)
}

// ---------------------------------------------------------------------------
// Worker (uma campanha por vez)
// ---------------------------------------------------------------------------

function pump() {
  if (workerId || safetyHold) return
  if (getWa().status !== 'connected') return
  const next = campaigns.filter((c) => c.status === 'fila').sort((a, b) => a.atualizadaEm.localeCompare(b.atualizadaEm))[0]
  if (!next) return
  workerId = next.id
  next.status = 'enviando'
  touch(next)
  void runCampaign(next).finally(() => {
    workerId = null
    setTimeout(pump, 500)
  })
}

const isActive = (c: Campaign) => c.status === 'enviando' && getWa().status === 'connected' && !safetyHold

async function waitActive(c: Campaign, ms: number): Promise<boolean> {
  let left = Math.max(0, ms)
  while (left > 0) {
    if (!isActive(c)) return false
    const slice = Math.min(1000, left)
    await new Promise((r) => setTimeout(r, slice))
    left -= slice
  }
  return isActive(c)
}

function greeting(now = new Date()): string {
  const h = now.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Resolve {saudacao} na hora do envio e limpa sobras de pontuação. */
export function finalizeText(text: string, now = new Date()): string {
  return text
    .replace(/\{\s*saudacao\s*\}/gi, greeting(now))
    .replace(/,[ \t]*([!?.,])/g, '$1')
    .replace(/[ \t]+([!?.,])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Quando o WhatsApp cai no meio: volta para a fila (ou pausa, se foi um risco). */
function suspend(c: Campaign) {
  if (c.status !== 'enviando') return
  c.proximoEnvio = null
  if (safetyHold) {
    c.status = 'pausada'
    log(c, 'aviso', 'Pausada por segurança: o WhatsApp desconectou de forma suspeita', 'Confira a conta e retome manualmente.')
  } else {
    c.status = 'fila'
    log(c, 'aviso', 'Conexão com o WhatsApp perdida', 'A campanha continua de onde parou quando o WhatsApp reconectar.')
  }
}

async function runCampaign(c: Campaign) {
  try {
    const msgSteps = c.etapas.filter((s) => s.tipo === 'mensagem').length
    while (c.cursor < c.destinatarios.length) {
      if (!isActive(c)) return suspend(c)
      const r = c.destinatarios[c.cursor]
      c.proximoEnvio = null
      const finish = (status: RecipientStatus, erro: string | null = null) => {
        r.status = status
        r.erro = erro
        r.processadoEm = new Date().toISOString()
        c.cursor++
        c.etapaAtual = 0
        touch(c)
      }

      if (!isValidBrazilWhatsApp(r.telefone)) {
        finish('falhou', 'Telefone inválido (precisa de DDD + número).')
        log(c, 'erro', `${r.nome}: telefone inválido`, undefined, r.leadId)
        continue
      }
      const key = phoneKey(r.telefone)
      const prev = sent[key]
      if (prev && prev.campanha !== c.id && !c.permitirRepetidos) {
        finish('ignorado', 'Este número já recebeu um disparo antes.')
        log(c, 'info', `${r.nome}: ignorado (já recebeu disparo)`, `Trava de duplicidade: enviado em ${new Date(prev.em).toLocaleString('pt-BR')}.`, r.leadId)
        continue
      }

      const sock = getSock()
      if (!sock) return suspend(c)
      const [contact] = (await withTimeout(sock.onWhatsApp(`${r.telefone}@s.whatsapp.net`), 15_000, 'Tempo esgotado ao consultar o número.').catch(() => [])) || []
      if (!contact?.exists || !contact.jid) {
        finish('falhou', 'O número não tem WhatsApp (fixo ou inativo).')
        log(c, 'erro', `${r.nome}: número sem WhatsApp`, undefined, r.leadId)
        continue
      }

      r.status = 'enviando'
      let msgIndex = c.etapas.slice(0, c.etapaAtual).filter((s) => s.tipo === 'mensagem').length
      let ok = true
      for (let i = c.etapaAtual; i < c.etapas.length; i++) {
        if (!isActive(c)) {
          r.status = 'pendente'
          return suspend(c)
        }
        const step = c.etapas[i]
        if (step.tipo === 'espera') {
          if (!(await waitActive(c, step.ms))) {
            r.status = 'pendente'
            return suspend(c)
          }
        } else {
          const text = finalizeText(r.textos[msgIndex] ?? '')
          msgIndex++
          if (text) {
            try {
              const s = getSock()
              if (!s) throw new Error('WhatsApp desconectado.')
              const res = await withTimeout(s.sendMessage(contact.jid, { text }), 25_000, 'Tempo esgotado ao enviar.')
              const mid = res?.key?.id
              if (!mid) throw new Error('O WhatsApp não confirmou o envio.')
              if (receiptOf(mid) === 'failed') throw new Error('O WhatsApp rejeitou a mensagem.')
              r.messageIds.push(mid)
              r.enviadas++
              sent[key] = { campanha: c.id, em: new Date().toISOString() }
              await new Promise((res2) => setTimeout(res2, 1500))
            } catch (err) {
              ok = false
              log(c, 'erro', `${r.nome}: falha no envio`, (err as Error).message, r.leadId)
              break
            }
          }
        }
        c.etapaAtual = i + 1
        touch(c)
      }

      if (ok && r.enviadas > 0) {
        const already = r.status as RecipientStatus
        finish(already === 'respondeu' ? 'respondeu' : rankStatus(r))
        log(c, 'sucesso', `${r.nome}: ${r.enviadas}/${msgSteps} mensagem(ns) aceitas pelo WhatsApp`, 'A entrega é confirmada quando o aparelho do destinatário recebe.', r.leadId)
      } else {
        finish('falhou', r.erro ?? 'Falha ao enviar as mensagens do funil.')
        continue
      }

      // Intervalo sorteado antes do próximo lead
      if (c.cursor < c.destinatarios.length && isActive(c)) {
        const min = c.delayMin === c.delayMax ? c.delayMin : randomInt(c.delayMin, c.delayMax + 1)
        c.ultimoIntervaloMin = min
        c.proximoEnvio = new Date(Date.now() + min * 60_000).toISOString()
        log(c, 'info', `Próximo envio em ${min} min`, `Faixa da campanha: ${c.delayMin}–${c.delayMax} min.`)
        if (!(await waitActive(c, min * 60_000))) {
          c.proximoEnvio = null
          return suspend(c)
        }
        c.proximoEnvio = null
      }
    }
    if (c.status === 'enviando') {
      c.status = 'concluida'
      c.proximoEnvio = null
      log(c, 'sucesso', 'Campanha concluída', 'Todos os destinatários foram processados.')
    }
  } catch (err) {
    console.error('[disparo] erro inesperado:', err)
    if (c.status === 'enviando') {
      c.status = 'pausada'
      log(c, 'erro', 'Campanha pausada por um erro inesperado no motor', (err as Error).message)
    }
  } finally {
    save(true)
  }
}

const RANK: Record<string, number> = { failed: -1, accepted: 1, delivered: 2, read: 3 }

/** Status do destinatário a partir das confirmações de cada mensagem. */
function rankStatus(r: Recipient): RecipientStatus {
  if (r.status === 'respondeu') return 'respondeu'
  const states = r.messageIds.map((id) => receiptOf(id) ?? 'accepted')
  if (!states.length) return 'aceito'
  if (states.every((s) => s === 'read')) return 'lido'
  if (states.every((s) => RANK[s] >= 2)) return 'entregue'
  return 'aceito'
}

// ---------------------------------------------------------------------------
// Eventos do WhatsApp
// ---------------------------------------------------------------------------

waEvents.connected(() => pump())

waEvents.risk(({ reason, statusCode }) => {
  safetyHold = true
  for (const c of campaigns) {
    if (c.status === 'enviando' || c.status === 'fila') {
      c.status = 'pausada'
      c.proximoEnvio = null
      log(c, 'aviso', 'Pausada por segurança', `${reason}${statusCode ? ` (código ${statusCode})` : ''} Retome manualmente depois de conferir a conta.`)
    }
  }
})

waEvents.receipt((messageId: string, _status: ReceiptStatus) => {
  for (const c of campaigns) {
    const r = c.destinatarios.find((x) => x.messageIds.includes(messageId))
    if (!r) continue
    if (['aceito', 'entregue', 'lido'].includes(r.status)) {
      const next = rankStatus(r)
      if (next !== r.status) {
        r.status = next
        touch(c)
      }
    }
    return
  }
})

waEvents.incoming((phone: string, text: string) => {
  for (const c of campaigns) {
    for (const r of c.destinatarios) {
      if (!r.enviadas || !samePhone(r.telefone, phone)) continue
      r.status = 'respondeu'
      r.respostas.push({ em: new Date().toISOString(), texto: text.slice(0, 1000) })
      log(c, 'resposta', `${r.nome} respondeu`, text.slice(0, 300) || '[mensagem sem texto]', r.leadId)
    }
  }
})
