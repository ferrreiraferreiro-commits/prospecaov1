// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Conversas do WhatsApp para a tela Conversas da XS: só texto, só conversas individuais
 * e só o que chega ou sai a partir de agora (nada de histórico antigo do celular).
 * Fotos, áudios e documentos aparecem como um aviso ("Foto — veja no celular").
 */
import { readJson, writeJson } from './store.js'
import { formatBrazilPhone, getSock, isValidBrazilWhatsApp, waEvents, withTimeout, type ReceiptStatus, type WaMessage } from './whatsapp.js'

export interface MensagemConversa {
  id: string
  deMim: boolean
  /** Texto (ou legenda). Vazio quando é só mídia. */
  texto: string
  /** "Foto", "Áudio"… quando não é só texto */
  midia: string | null
  /** ISO */
  em: string
  status: ReceiptStatus | null
}

export interface Conversa {
  telefone: string
  /** Para responder e marcar como lida (pode ser @lid) */
  jid: string | null
  /** Nome que a pessoa usa no WhatsApp */
  nome: string | null
  naoLidas: number
  atualizadaEm: string
  msgs: MensagemConversa[]
}

const FILE = 'conversas.json'
const MAX_CONVERSAS = 400
const MAX_MSGS = 300
/** Mensagem mais velha que isso não entra (nada de histórico antigo) */
const MAX_IDADE_MS = 3 * 86_400_000
/** Cópias de mensagens enviadas por esta sessão (disparo, agenda) chegam como "append": só as recentes */
const MAX_IDADE_APPEND_MS = 10 * 60_000
const MAX_TEXTO = 4096

const conversas: Record<string, Conversa> = readJson<Record<string, Conversa>>(FILE, {})
/** id da mensagem enviada → telefone (para os tiques de entregue/lida) */
const enviadas = new Map<string, string>()
for (const c of Object.values(conversas)) for (const m of c.msgs) if (m.deMim) enviadas.set(m.id, c.telefone)
/** Muda a cada novidade: o app só busca a lista de novo quando ela muda */
let versao = Date.now()

let saveTimer: NodeJS.Timeout | null = null
function salvar() {
  versao++
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    podar()
    writeJson(FILE, conversas)
  }, 1500)
}

function podar() {
  const lista = Object.values(conversas)
  if (lista.length <= MAX_CONVERSAS) return
  lista.sort((a, b) => Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm))
  for (const c of lista.slice(MAX_CONVERSAS)) delete conversas[c.telefone]
}

function desembrulhar(message: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!message || typeof message !== 'object') return null
  const inner =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message
  return inner ? desembrulhar(inner) : message
}

/** Texto e tipo de mídia da mensagem; `null` = não é algo para mostrar (reação, aviso do sistema…). */
export function conteudo(raw: Record<string, any> | null | undefined): { texto: string; midia: string | null } | null {
  const m = desembrulhar(raw)
  if (!m) return null
  const texto =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.interactiveResponseMessage?.body?.text ||
    ''
  const midia = m.imageMessage
    ? 'Foto'
    : m.videoMessage || m.ptvMessage
      ? 'Vídeo'
      : m.audioMessage
        ? 'Áudio'
        : m.documentMessage
          ? 'Documento'
          : m.stickerMessage
            ? 'Figurinha'
            : m.contactMessage || m.contactsArrayMessage
              ? 'Contato'
              : m.locationMessage || m.liveLocationMessage
                ? 'Localização'
                : null
  const t = typeof texto === 'string' ? texto.trim().slice(0, MAX_TEXTO) : ''
  if (!t && !midia) return null
  return { texto: t, midia }
}

function conversaDe(telefone: string): Conversa {
  return (conversas[telefone] ??= { telefone, jid: null, nome: null, naoLidas: 0, atualizadaEm: new Date().toISOString(), msgs: [] })
}

/** Guarda uma mensagem (sem repetir a mesma). Devolve false quando ela não entra. */
export function registrar(m: WaMessage, agora = Date.now()): boolean {
  const idade = agora - m.em * 1000
  if (idade > MAX_IDADE_MS) return false
  if (m.tipo !== 'notify' && !(m.deMim && idade <= MAX_IDADE_APPEND_MS)) return false
  const c0 = conteudo(m.message)
  if (!c0) return false
  const tel = m.telefone.replace(/\D/g, '')
  if (!tel) return false
  const c = conversaDe(tel)
  if (c.msgs.some((x) => x.id === m.id)) return false
  const em = new Date(m.em * 1000).toISOString()
  c.msgs.push({ id: m.id, deMim: m.deMim, texto: c0.texto, midia: c0.midia, em, status: m.deMim ? 'accepted' : null })
  if (m.deMim) enviadas.set(m.id, tel)
  c.msgs.sort((a, b) => Date.parse(a.em) - Date.parse(b.em))
  if (c.msgs.length > MAX_MSGS) c.msgs.splice(0, c.msgs.length - MAX_MSGS)
  if (!m.deMim) {
    c.naoLidas++
    if (m.nome) c.nome = m.nome.slice(0, 80)
  }
  c.jid = m.jid
  if (Date.parse(em) > Date.parse(c.atualizadaEm) || c.msgs.length === 1) c.atualizadaEm = em
  salvar()
  return true
}

function resumo(c: Conversa) {
  const ultima = c.msgs[c.msgs.length - 1] ?? null
  return { telefone: c.telefone, nome: c.nome, naoLidas: c.naoLidas, atualizadaEm: c.atualizadaEm, ultima }
}

export function listarConversas() {
  const lista = Object.values(conversas)
    .filter((c) => c.msgs.length)
    .sort((a, b) => Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm))
    .map(resumo)
  return { versao, conversas: lista }
}

function chave(telefone: string): string {
  const d = formatBrazilPhone(telefone)
  // O WhatsApp às vezes guarda o número sem o nono dígito: procura pelos dois jeitos
  if (conversas[d]) return d
  const sem9 = /^55\d{2}9\d{8}$/.test(d) ? d.slice(0, 4) + d.slice(5) : null
  const com9 = /^55\d{2}\d{8}$/.test(d) ? `${d.slice(0, 4)}9${d.slice(4)}` : null
  return [sem9, com9].find((k) => k && conversas[k]) ?? d
}

export function abrirConversa(telefone: string) {
  const c = conversas[chave(telefone)]
  return { versao, telefone: c?.telefone ?? formatBrazilPhone(telefone), nome: c?.nome ?? null, naoLidas: c?.naoLidas ?? 0, msgs: c?.msgs ?? [] }
}

/** Zera as não lidas e manda o "visto" para o WhatsApp da pessoa. */
export async function marcarLidas(telefone: string) {
  const c = conversas[chave(telefone)]
  if (!c || !c.naoLidas) return { ok: true }
  const pendentes = c.msgs.filter((m) => !m.deMim).slice(-c.naoLidas)
  c.naoLidas = 0
  salvar()
  const s = getSock()
  if (s && c.jid && pendentes.length) {
    await s.readMessages(pendentes.map((m) => ({ remoteJid: c.jid!, id: m.id, fromMe: false }))).catch(() => undefined)
  }
  return { ok: true }
}

type AoEnviar = (telefone: string, texto: string, id: string) => void
const aoEnviar = new Set<AoEnviar>()
/** Quem quer saber das respostas digitadas na tela Conversas (o vendedor para naquela conversa). */
export const conversaEventos = {
  enviouPelaXS: (l: AoEnviar) => (aoEnviar.add(l), () => aoEnviar.delete(l)),
}

/** Resposta digitada na tela Conversas. */
export async function enviarNaConversa(telefone: string, texto: string): Promise<MensagemConversa> {
  const s = getSock()
  if (!s) throw new Error('WhatsApp não está conectado.')
  const t = String(texto ?? '').trim()
  if (!t) throw new Error('Escreva a mensagem.')
  if (t.length > MAX_TEXTO) throw new Error('Mensagem longa demais.')
  const k = chave(telefone)
  let jid = conversas[k]?.jid ?? null
  if (!jid) {
    if (!isValidBrazilWhatsApp(k)) throw new Error('Telefone inválido: use DDD + número.')
    const [contato] = (await withTimeout(s.onWhatsApp(`${k}@s.whatsapp.net`), 15_000, 'Tempo esgotado ao consultar o número.').catch(() => [])) || []
    if (!contato?.exists || !contato.jid) throw new Error('Este número não tem WhatsApp ativo.')
    jid = contato.jid
  }
  const sent = await withTimeout(s.sendMessage(jid, { text: t }), 25_000, 'Tempo esgotado ao enviar a mensagem.')
  const id = sent?.key?.id
  if (!id) throw new Error('O WhatsApp não confirmou o envio.')
  const c = conversaDe(k)
  c.jid = jid
  let msg = c.msgs.find((m) => m.id === id)
  if (!msg) {
    msg = { id, deMim: true, texto: t, midia: null, em: new Date().toISOString(), status: 'accepted' }
    c.msgs.push(msg)
    enviadas.set(id, k)
    if (c.msgs.length > MAX_MSGS) c.msgs.splice(0, c.msgs.length - MAX_MSGS)
  }
  c.naoLidas = 0
  c.atualizadaEm = msg.em
  salvar()
  for (const l of aoEnviar) {
    try {
      l(k, t, id)
    } catch (err) {
      console.error('[conversas] aviso de envio falhou:', err)
    }
  }
  return msg
}

// Entregue / lida: atualiza os tiques da mensagem
waEvents.receipt((id, status) => {
  const tel = enviadas.get(id)
  if (!tel) return
  const m = conversas[tel]?.msgs.find((x) => x.id === id)
  if (!m || !m.deMim) return
  const ordem: (ReceiptStatus | null)[] = [null, 'failed', 'accepted', 'delivered', 'read']
  if (ordem.indexOf(status) > ordem.indexOf(m.status)) {
    m.status = status
    salvar()
  }
})

waEvents.message((m) => void registrar(m))
