/**
 * Sessão do WhatsApp (Baileys): conexão por QR Code, envio, confirmações de
 * entrega e mensagens recebidas.
 */
import fs from 'node:fs'
import path from 'node:path'
import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { storageDir } from './store.js'

export type WaStatus = 'disconnected' | 'connecting' | 'qrcode' | 'connected'
export type ReceiptStatus = 'accepted' | 'delivered' | 'read' | 'failed'

// O libsignal imprime sessões inteiras no console; esses avisos carregam material criptográfico.
const info = console.info.bind(console)
const warn = console.warn.bind(console)
console.info = (first?: unknown, ...rest: unknown[]) => {
  if (typeof first === 'string' && first.startsWith('Closing session:')) return
  info(first, ...rest)
}
console.warn = (first?: unknown, ...rest: unknown[]) => {
  if (typeof first === 'string' && first.startsWith('Closing open session in favor of incoming prekey bundle')) return
  warn(first, ...rest)
}

const authFolder = path.join(storageDir, 'whatsapp_auth')

let sock: WASocket | null = null
let status: WaStatus = 'disconnected'
let qrDataUrl: string | null = null
let user: { id: string; name: string } | null = null
let generation = 0
let initPromise: Promise<void> | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let lastError: string | null = null

type Listener<A extends unknown[]> = (...args: A) => void | Promise<void>
const onConnected = new Set<Listener<[]>>()
const onRisk = new Set<Listener<[{ statusCode?: number; reason: string }]>>()
const onReceipt = new Set<Listener<[string, ReceiptStatus]>>()
const onIncoming = new Set<Listener<[string, string]>>()
const recentReceipts = new Map<string, ReceiptStatus>()

function emit<A extends unknown[]>(set: Set<Listener<A>>, ...args: A) {
  for (const l of set) Promise.resolve(l(...args)).catch((err) => console.error('[whatsapp] listener falhou:', err))
}

export const waEvents = {
  connected: (l: Listener<[]>) => (onConnected.add(l), () => onConnected.delete(l)),
  risk: (l: Listener<[{ statusCode?: number; reason: string }]>) => (onRisk.add(l), () => onRisk.delete(l)),
  receipt: (l: Listener<[string, ReceiptStatus]>) => (onReceipt.add(l), () => onReceipt.delete(l)),
  incoming: (l: Listener<[string, string]>) => (onIncoming.add(l), () => onIncoming.delete(l)),
}

export function getWa() {
  return { status, qrCodeUrl: qrDataUrl, user, lastError }
}

export function getSock(): WASocket | null {
  return status === 'connected' ? sock : null
}

export function receiptOf(messageId: string): ReceiptStatus | undefined {
  return recentReceipts.get(messageId)
}

/** Quedas transitórias (408/428/503/515) reconectam sozinhas; o resto é risco e pausa os disparos. */
export function classifyRisk(code?: number): { statusCode?: number; reason: string } | null {
  if (code !== undefined && [408, 428, 503, 515].includes(code)) return null
  const reasons: Record<number, string> = {
    401: 'Sessão encerrada ou credenciais revogadas.',
    403: 'Acesso recusado pelo WhatsApp; possível restrição da conta.',
    405: 'Sessão rejeitada pelo WhatsApp.',
    406: 'Sessão incompatível ou rejeitada.',
    411: 'Incompatibilidade de dispositivos vinculados.',
    440: 'Sessão substituída por outra conexão.',
    500: 'Sessão inválida ou corrompida.',
  }
  return { statusCode: code, reason: (code !== undefined && reasons[code]) || 'O WhatsApp encerrou a sessão por um motivo inesperado.' }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  status = 'connecting'
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, 3000)
}

function phoneJid(...candidates: (string | null | undefined)[]): string | null {
  return candidates.find((j) => j?.endsWith('@s.whatsapp.net')) ?? null
}

/** Texto legível dos formatos de mensagem mais comuns. */
export function extractText(message: Record<string, any> | null | undefined): string {
  if (!message || typeof message !== 'object') return ''
  const wrapped =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message
  if (wrapped) return extractText(wrapped)
  const v =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.interactiveResponseMessage?.body?.text
  if (typeof v === 'string') return v.trim()
  if (message.audioMessage) return '[áudio]'
  if (message.imageMessage) return '[imagem]'
  if (message.stickerMessage) return '[figurinha]'
  return ''
}

export async function connect(): Promise<void> {
  if (sock) return
  if (initPromise) return initPromise
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const gen = ++generation
  initPromise = (async () => {
    try {
      status = 'connecting'
      qrDataUrl = null
      lastError = null
      const { state, saveCreds } = await useMultiFileAuthState(authFolder)
      if (gen !== generation) return
      const s = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), browser: ['XS Prospecção', 'Chrome', '1.0'], markOnlineOnConnect: false })
      sock = s
      s.ev.on('creds.update', saveCreds)

      s.ev.on('messages.update', (updates) => {
        if (gen !== generation) return
        for (const u of updates) {
          const raw = u.update.status
          if (!u.key.id || raw === null || raw === undefined) continue
          const st: ReceiptStatus = raw >= 4 ? 'read' : raw >= 3 ? 'delivered' : raw >= 2 ? 'accepted' : 'failed'
          recentReceipts.set(u.key.id, st)
          if (recentReceipts.size > 10_000) recentReceipts.delete(recentReceipts.keys().next().value!)
          emit(onReceipt, u.key.id, st)
        }
      })

      s.ev.on('messages.upsert', async (m) => {
        if (gen !== generation || !Array.isArray(m?.messages)) return
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue
          const key = msg.key as typeof msg.key & { participantAlt?: string; remoteJidAlt?: string }
          let jid = phoneJid(key.participantAlt, key.remoteJidAlt, key.participant, key.remoteJid)
          if (!jid && key.remoteJid?.endsWith('@lid')) {
            try {
              const pn = await (s as any).signalRepository?.lidMapping?.getPNForLID(key.remoteJid)
              if (pn) jid = String(pn).endsWith('@s.whatsapp.net') ? String(pn) : `${pn}@s.whatsapp.net`
            } catch {
              /* sem mapeamento */
            }
          }
          if (!jid) continue
          emit(onIncoming, jid.split('@')[0].split(':')[0], extractText(msg.message as Record<string, any>))
        }
      })

      s.ev.on('connection.update', async (update) => {
        if (gen !== generation || sock !== s) return
        const { connection, lastDisconnect, qr } = update
        if (qr) {
          status = 'qrcode'
          qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 }).catch(() => null)
        }
        if (connection === 'close') {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
          const risk = classifyRisk(code)
          sock = null
          qrDataUrl = null
          user = null
          if (risk) {
            lastError = risk.reason
            emit(onRisk, risk)
          }
          if (code !== DisconnectReason.loggedOut) scheduleReconnect()
          else {
            status = 'disconnected'
            fs.rmSync(authFolder, { recursive: true, force: true })
          }
        } else if (connection === 'open') {
          status = 'connected'
          qrDataUrl = null
          lastError = null
          user = { id: s.user?.id ? s.user.id.split(':')[0] : '', name: s.user?.name || (s.user as { notify?: string })?.notify || 'Meu WhatsApp' }
          console.log(`[whatsapp] conectado como ${user.name} (${user.id})`)
          emit(onConnected)
        }
      })
    } catch (err) {
      if (gen === generation) {
        console.error('[whatsapp] falha ao iniciar:', err)
        status = 'disconnected'
        lastError = (err as Error).message
        sock = null
      }
    }
  })().finally(() => {
    initPromise = null
  })
  return initPromise
}

export async function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  generation++
  const s = sock
  sock = null
  if (s) {
    await s.logout().catch(() => undefined)
    s.end(undefined)
  }
  status = 'disconnected'
  qrDataUrl = null
  user = null
  fs.rmSync(authFolder, { recursive: true, force: true })
}

/** Reconecta sozinho ao abrir o motor, se já houver uma sessão salva. */
export function resumeStoredSession() {
  if (fs.existsSync(path.join(authFolder, 'creds.json'))) void connect()
}

export function shutdown() {
  generation++
  sock?.end(undefined)
  sock = null
}

/** 55 + DDD + número; respeita um "+" explícito de outro país (será rejeitado). */
export function formatBrazilPhone(phone: string): string {
  const raw = String(phone || '').trim()
  let d = raw.replace(/\D/g, '')
  if (!d) return ''
  if (!raw.startsWith('+') && !d.startsWith('55') && d.length <= 11) d = `55${d}`
  return d
}

export function isValidBrazilWhatsApp(phone: string): boolean {
  return /^55\d{10,11}$/.test(phone)
}

/** Compara telefones brasileiros ignorando o nono dígito (DDD + 8 últimos). */
export function samePhone(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  const db = b.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (da === db) return true
  return da.length >= 10 && db.length >= 10 && da.slice(0, 2) === db.slice(0, 2) && da.slice(-8) === db.slice(-8)
}

export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout
  return Promise.race([p, new Promise<never>((_, reject) => (t = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(t))
}

/** Envio avulso (teste). Confere se o número tem WhatsApp antes. */
export async function sendText(phone: string, text: string): Promise<{ messageId: string; jid: string }> {
  const s = getSock()
  if (!s) throw new Error('WhatsApp não está conectado.')
  const formatted = formatBrazilPhone(phone)
  if (!isValidBrazilWhatsApp(formatted)) throw new Error('Telefone inválido: use DDD + número.')
  const [contact] = (await withTimeout(s.onWhatsApp(`${formatted}@s.whatsapp.net`), 15_000, 'Tempo esgotado ao consultar o número.').catch(() => [])) || []
  if (!contact?.exists || !contact.jid) throw new Error('Este número não tem WhatsApp ativo.')
  const sent = await withTimeout(s.sendMessage(contact.jid, { text }), 25_000, 'Tempo esgotado ao enviar a mensagem.')
  if (!sent?.key?.id) throw new Error('O WhatsApp não confirmou o envio.')
  return { messageId: sent.key.id, jid: contact.jid }
}
