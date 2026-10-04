// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Ponte do Motor WhatsApp XS (roda na VPS, ao lado da busca, atrás do Caddy em /ponte).
 *
 * O motor, no computador da pessoa, fica perguntando "tem pedido para mim?" (POST /motor/esperar).
 * O site manda o pedido para cá (POST /pedido); a ponte entrega ao motor e devolve a resposta dele.
 * Assim o navegador nunca chama 127.0.0.1 e não pede permissão nenhuma (Chrome, Brave, Edge…).
 *
 * A chave do motor é gerada por ele e fica guardada na conta da pessoa (tabela `motores` no Supabase):
 * ela é o endereço e a senha ao mesmo tempo. Nada é gravado em disco aqui.
 *
 *   PORT=8090 node busca/ponte.ts
 *
 * POST /motor/esperar     (motor) segura até 25 s; devolve os pedidos que chegarem
 * POST /motor/responder   (motor) { id, status, body }
 * POST /pedido            (site)  { method, path, body?, timeoutMs? } → a resposta do motor
 * GET  /saude                     aberto
 * Todas as chamadas, menos /saude, levam o cabeçalho X-Motor-Chave.
 */
import crypto from 'node:crypto'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8090)
const HOST = process.env.HOST ?? '127.0.0.1'
/** Quanto o pedido do motor fica parado esperando trabalho */
const ESPERA_MS = 25_000
/** Motor que não perguntou nada nesse tempo está desligado */
const VISTO_MS = 40_000
const MAX_CORPO = 4 * 1024 * 1024
const MAX_MOTORES = 5000
const CHAVE_OK = /^[A-Za-z0-9_-]{32,64}$/
const CAMINHO_OK = /^\/[A-Za-z0-9/_.-]*$/
const METODOS = new Set(['GET', 'POST', 'DELETE'])

interface Pedido {
  id: string
  method: string
  path: string
  body?: unknown
}

interface Motor {
  vistoEm: number
  espera: http.ServerResponse | null
  esperaTimer: NodeJS.Timeout | null
  fila: Pedido[]
  pendentes: Map<string, { res: http.ServerResponse; timer: NodeJS.Timeout }>
}

const motores = new Map<string, Motor>()

function idDa(chave: string): string {
  return crypto.createHash('sha256').update(chave).digest('base64url')
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body ?? null))
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_CORPO) throw new Error('Pedido grande demais.')
    chunks.push(c as Buffer)
  }
  if (!size) return {}
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/**
 * Site da XS (Vercel) e o app rodando no próprio computador durante o desenvolvimento.
 * Só o endereço exato: qualquer pessoa pode criar "xs-prospeccao-outra-coisa.vercel.app".
 */
export function origemPermitida(origin: string | undefined): boolean {
  if (!origin) return false
  try {
    const u = new URL(origin)
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') return true
    return u.origin === 'https://xs-prospeccao.vercel.app'
  } catch {
    return false
  }
}

/** Quantos motores novos um mesmo endereço de internet pode abrir a cada 10 minutos */
const NOVOS_POR_IP = 20
const novosPorIp = new Map<string, number>()
setInterval(() => novosPorIp.clear(), 10 * 60_000).unref()

/** O Caddy, na frente da ponte, põe o IP de quem chamou em X-Forwarded-For. */
function ipDe(req: http.IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?'
}

/** Abre a vaga de um motor novo. Ponte cheia: libera primeiro quem está desligado. */
export function abrirVaga(id: string, ip: string): Motor | null {
  const usados = novosPorIp.get(ip) ?? 0
  if (usados >= NOVOS_POR_IP) return null
  if (motores.size >= MAX_MOTORES) {
    for (const [outro, m] of motores) if (!online(m) && !m.pendentes.size) motores.delete(outro)
    if (motores.size >= MAX_MOTORES) return null
  }
  novosPorIp.set(ip, usados + 1)
  const m: Motor = { vistoEm: Date.now(), espera: null, esperaTimer: null, fila: [], pendentes: new Map() }
  motores.set(id, m)
  return m
}

function online(m: Motor | undefined): boolean {
  return !!m && (!!m.espera || Date.now() - m.vistoEm < VISTO_MS)
}

/** Manda para o motor tudo o que está na fila, se ele estiver esperando. */
function entregar(m: Motor) {
  if (!m.espera || !m.fila.length) return
  const lote = m.fila.splice(0)
  if (m.esperaTimer) clearTimeout(m.esperaTimer)
  const res = m.espera
  m.espera = null
  m.esperaTimer = null
  send(res, 200, lote)
}

function esperar(m: Motor, res: http.ServerResponse) {
  m.vistoEm = Date.now()
  // Motor reaberto ou dois abertos com a mesma chave: o pedido antigo sai vazio
  if (m.espera) send(m.espera, 200, [])
  if (m.esperaTimer) clearTimeout(m.esperaTimer)
  m.espera = res
  m.esperaTimer = setTimeout(() => {
    if (m.espera === res) {
      m.espera = null
      m.esperaTimer = null
      m.vistoEm = Date.now()
      send(res, 200, [])
    }
  }, ESPERA_MS)
  res.on('close', () => {
    if (m.espera === res) {
      m.espera = null
      if (m.esperaTimer) clearTimeout(m.esperaTimer)
      m.esperaTimer = null
    }
    // Conexão caiu sem resposta (motor fechado): 5 s para ele voltar, depois conta como desligado
    if (!res.writableEnded) m.vistoEm = Math.min(m.vistoEm, Date.now() - VISTO_MS + 5_000)
  })
  entregar(m)
}

function pedir(m: Motor, body: Record<string, unknown>, res: http.ServerResponse) {
  const method = String(body.method ?? 'GET').toUpperCase()
  const path = String(body.path ?? '')
  if (!METODOS.has(method) || !CAMINHO_OK.test(path)) return send(res, 400, { error: 'Pedido inválido.' })
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 15_000, 1_000), 60_000)
  const p: Pedido = { id: crypto.randomUUID(), method, path, ...(body.body !== undefined ? { body: body.body } : {}) }
  const timer = setTimeout(() => {
    m.pendentes.delete(p.id)
    m.fila = m.fila.filter((x) => x.id !== p.id)
    send(res, 504, { error: 'O Motor WhatsApp XS demorou para responder. Ele está aberto?' })
  }, timeoutMs)
  m.pendentes.set(p.id, { res, timer })
  // O site desistiu (fechou a aba, tempo esgotado do lado dele): não entrega mais
  res.on('close', () => {
    if (!res.writableEnded && m.pendentes.delete(p.id)) {
      clearTimeout(timer)
      m.fila = m.fila.filter((x) => x.id !== p.id)
    }
  })
  m.fila.push(p)
  entregar(m)
}

function responder(m: Motor, body: Record<string, unknown>) {
  const id = String(body.id ?? '')
  const pendente = m.pendentes.get(id)
  if (!pendente) return
  m.pendentes.delete(id)
  clearTimeout(pendente.timer)
  const status = Number(body.status)
  send(pendente.res, Number.isInteger(status) && status >= 200 && status < 600 ? status : 502, body.body)
}

// Esquece motores que sumiram há mais de 10 minutos
setInterval(() => {
  const limite = Date.now() - 10 * 60_000
  for (const [id, m] of motores) if (!m.espera && !m.pendentes.size && m.vistoEm < limite) motores.delete(id)
}, 60_000).unref()

export const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  if (origemPermitida(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Motor-Chave')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()
  try {
    const url = new URL(req.url ?? '/', 'http://ponte')
    if (url.pathname === '/saude') return send(res, 200, { ok: true, motores: [...motores.values()].filter(online).length })
    if (req.method !== 'POST') return send(res, 404, { error: 'Não encontrado.' })

    const chave = String(req.headers['x-motor-chave'] ?? '')
    if (!CHAVE_OK.test(chave)) return send(res, 401, { error: 'Chave do motor inválida.' })
    const id = idDa(chave)
    const body = await readJson(req)

    if (url.pathname === '/pedido') {
      const m = motores.get(id)
      if (!online(m)) return send(res, 503, { error: 'O Motor WhatsApp XS não está aberto.', offline: true })
      return pedir(m!, body, res)
    }
    if (url.pathname === '/motor/esperar' || url.pathname === '/motor/responder') {
      const m = motores.get(id) ?? abrirVaga(id, ipDe(req))
      if (!m) return send(res, 503, { error: 'Ponte cheia, tente de novo em alguns minutos.' })
      if (url.pathname === '/motor/esperar') return esperar(m, res)
      responder(m, body)
      return send(res, 200, { ok: true })
    }
    return send(res, 404, { error: 'Não encontrado.' })
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : 'Pedido inválido.' })
  }
})

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  server.requestTimeout = 0
  server.headersTimeout = 30_000
  server.listen(PORT, HOST, () => console.log(`ponte do motor em http://${HOST}:${PORT}`))
}
