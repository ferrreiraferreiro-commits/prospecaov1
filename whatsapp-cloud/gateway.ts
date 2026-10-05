// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Gateway do WhatsApp na nuvem (modo WHATSAPP_ENGINE=cloud). Roda na VPS, atrás do Caddy em /whatsapp.
 *
 *   site (navegador) ──HTTPS──▶ Caddy /whatsapp/* ──▶ gateway (127.0.0.1:8092) ──▶ Motor (127.0.0.1:3077)
 *
 * O Motor é o mesmo programa do computador (pasta motor/), ligado com XS_MODO=nuvem e escutando só
 * em 127.0.0.1: a porta dele nunca fica aberta para a internet. Todo pedido aqui precisa do login da
 * pessoa na XS (o token do Supabase), conferido no próprio Supabase, e a conta precisa estar na lista
 * XS_CLOUD_USUARIOS. Nada de importante fica só em memória: sessão do WhatsApp, campanhas e
 * agendamentos são gravados em disco pelo Motor.
 *
 * Sessões: nesta primeira versão há um WhatsApp só ("principal"). Cada conta da lista aponta para uma
 * sessão (uuid:sessao); para ter um WhatsApp por pessoa no futuro, basta subir outro Motor
 * (xs-whatsapp-motor@<sessao>) e acrescentar a sessão em XS_CLOUD_SESSOES.
 *
 * GET  /saude                aberto: o gateway e o Motor estão de pé?
 * GET  /acesso               esta conta usa o WhatsApp na nuvem?
 * *    /motor/<caminho>      repassa ao Motor da sessão da conta (mesmos caminhos do Motor local)
 *
 * Variáveis (arquivo /etc/xs-whatsapp/gateway.env na VPS):
 *   PORT=8092  HOST=127.0.0.1
 *   SUPABASE_URL, SUPABASE_ANON_KEY          para conferir o login
 *   XS_CLOUD_USUARIOS=gabriel[:sessao],…     quem pode usar: usuário de login ou id da conta (sem sessão = "principal")
 *   XS_CLOUD_SESSOES=principal:3077,…        porta do Motor de cada sessão
 *   XS_CLOUD_DADOS=/var/lib/xs-whatsapp      pasta de dados (uma subpasta por sessão)
 *   XS_ORIGINS=https://outro-dominio         origens extras do site (opcional)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8092)
const HOST = process.env.HOST ?? '127.0.0.1'
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const DADOS = process.env.XS_CLOUD_DADOS ?? '/var/lib/xs-whatsapp'
const MAX_CORPO = 8 * 1024 * 1024
const TEMPO_MOTOR_MS = 60_000

export const MSG_INDISPONIVEL = 'O serviço de WhatsApp está temporariamente indisponível. Tente novamente em alguns instantes.'
const MSG_GENERICA = 'Não foi possível concluir agora. Tente novamente em alguns instantes.'

// ---------------------------------------------------------------- configuração

export interface Sessao {
  nome: string
  motor: string
  dados: string
}

const NOME_OK = /^[a-z0-9_-]{1,40}$/

export function lerSessoes(env = process.env.XS_CLOUD_SESSOES ?? 'principal:3077'): Map<string, Sessao> {
  const out = new Map<string, Sessao>()
  for (const item of env.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [nome, porta] = item.split(':')
    if (!NOME_OK.test(nome) || !/^\d{2,5}$/.test(porta ?? '')) continue
    out.set(nome, { nome, motor: `http://127.0.0.1:${porta}`, dados: path.join(DADOS, nome) })
  }
  return out
}

const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Usuário de login da XS (ex.: gabriel). A pessoa não consegue trocar o próprio. */
const USUARIO_OK = /^[a-z0-9][a-z0-9._-]{2,29}$/

/** "conta" ou "conta:sessao" → sessão. Conta = usuário de login (gabriel) ou o id (uuid) da conta. */
export function lerUsuarios(env = process.env.XS_CLOUD_USUARIOS ?? ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const item of env.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [conta, sessao = 'principal'] = item.split(':')
    const k = conta.toLowerCase()
    if ((UUID_OK.test(k) || USUARIO_OK.test(k)) && NOME_OK.test(sessao)) out.set(k, sessao)
  }
  return out
}

let sessoes = lerSessoes()
let usuarios = lerUsuarios()

/** Para os testes */
export function configurar(c: { sessoes?: Map<string, Sessao>; usuarios?: Map<string, string> }) {
  if (c.sessoes) sessoes = c.sessoes
  if (c.usuarios) usuarios = c.usuarios
}

export interface Conta {
  id: string
  usuario: string | null
}

export function sessaoDoUsuario(conta: Conta): Sessao | null {
  const nome = usuarios.get(conta.id.toLowerCase()) ?? (conta.usuario ? usuarios.get(conta.usuario.toLowerCase()) : undefined)
  return (nome && sessoes.get(nome)) || null
}

// ---------------------------------------------------------------- origem (CORS)

const EXTRA_ORIGINS = (process.env.XS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/** O site da XS (endereço exato), localhost para desenvolvimento e os extras do .env. */
export function origemPermitida(origin: string | undefined): boolean {
  if (!origin) return false
  if (EXTRA_ORIGINS.includes(origin)) return true
  try {
    const u = new URL(origin)
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') return true
    return u.origin === 'https://xs-prospeccao.vercel.app'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- login (Supabase)

type Verificador = (token: string) => Promise<Conta | null>

/** Pergunta ao Supabase de quem é o token (e o usuário de login). null = token inválido ou vencido. */
async function verificarNoSupabase(token: string): Promise<Conta | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL/SUPABASE_ANON_KEY não configurados')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error(`supabase ${res.status}`)
  const user = (await res.json()) as { id?: unknown }
  if (typeof user.id !== 'string' || !UUID_OK.test(user.id)) return null
  // O próprio perfil, lido com o login da pessoa (a regra do banco só deixa cada um ler o seu)
  const perfil = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=usuario&user_id=eq.${user.id}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!perfil.ok) throw new Error(`supabase perfil ${perfil.status}`)
  const [p] = (await perfil.json()) as { usuario?: unknown }[]
  return { id: user.id, usuario: typeof p?.usuario === 'string' ? p.usuario : null }
}

let verificar: Verificador = verificarNoSupabase
export function usarVerificador(v: Verificador) {
  verificar = v
}

/** Token já conferido há pouco: não pergunta ao Supabase a cada 6 s */
const cacheLogin = new Map<string, { conta: Conta; ate: number }>()
const CACHE_MS = 60_000

export async function quemE(token: string): Promise<Conta | null> {
  const k = crypto.createHash('sha256').update(token).digest('base64url')
  const c = cacheLogin.get(k)
  if (c && c.ate > Date.now()) return c.conta
  const conta = await verificar(token)
  if (!conta) return null
  if (cacheLogin.size > 2000) cacheLogin.clear()
  cacheLogin.set(k, { conta, ate: Date.now() + CACHE_MS })
  return conta
}

/** Tentativas com token errado por endereço de internet (a cada 10 min) */
const falhasPorIp = new Map<string, number>()
const MAX_FALHAS = 40
setInterval(() => falhasPorIp.clear(), 10 * 60_000).unref()

function ipDe(req: http.IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?'
}

// ---------------------------------------------------------------- respostas

function send(res: http.ServerResponse, status: number, body: unknown) {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body ?? null))
}

async function lerCorpo(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_CORPO) throw new Error('Pedido grande demais.')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Nada de endereço, porta ou erro de programa na tela da pessoa. */
const TECNICO = /127\.0\.0\.1|localhost|::1|\b\d{1,3}(\.\d{1,3}){3}\b|:\d{4,5}\b|\bE[A-Z]{3,}\b|\bat \S+ \(|Unexpected token|JSON|TypeError|ReferenceError|undefined|\bnull\b|https?:\/\//
export function limparMensagem(msg: unknown): string | null {
  if (typeof msg !== 'string' || !msg.trim()) return null
  return TECNICO.test(msg) ? MSG_GENERICA : msg.slice(0, 400)
}

export function credsSalvas(s: Sessao): boolean {
  return fs.existsSync(path.join(s.dados, 'whatsapp_auth', 'creds.json'))
}

/** Ajusta o que o Motor responde: tira detalhes da máquina e diz se há sessão salva (para "Reconectando"). */
export function ajustarResposta(caminho: string, body: unknown, s: Sessao): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const b = { ...(body as Record<string, unknown>) }
  if ('error' in b) b.error = limparMensagem(b.error) ?? MSG_GENERICA
  if (caminho === '/health') {
    delete b.computador
    delete b.acordado
    b.nuvem = true
    if (b.whatsapp && typeof b.whatsapp === 'object') b.whatsapp = { ...(b.whatsapp as object), sessaoSalva: credsSalvas(s) }
  }
  if (caminho.startsWith('/whatsapp/') && 'status' in b) {
    b.lastError = limparMensagem(b.lastError)
    b.sessaoSalva = credsSalvas(s)
  }
  return b
}

// ---------------------------------------------------------------- Motor

const CAMINHO_OK = /^\/(health|whatsapp\/(status|conectar|desconectar|teste)|disparo\/[A-Za-z0-9/_-]{1,120}|agenda(\/[A-Za-z0-9/_-]{1,120})?)$/
const METODOS = new Set(['GET', 'POST', 'DELETE'])

/** Última vez que alguém olhou a tela de conexão de cada sessão (para não deixar QR Code girando à toa) */
const vistoEm = new Map<string, number>()

export async function chamarMotor(s: Sessao, method: string, caminho: string, corpo?: Buffer | string): Promise<{ status: number; body: unknown }> {
  const temCorpo = corpo !== undefined && corpo.length > 0
  const res = await fetch(`${s.motor}${caminho}`, {
    method,
    headers: temCorpo ? { 'Content-Type': 'application/json' } : {},
    body: temCorpo ? corpo : undefined,
    signal: AbortSignal.timeout(TEMPO_MOTOR_MS),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function repassar(req: http.IncomingMessage, res: http.ServerResponse, s: Sessao, caminho: string) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (!METODOS.has(method) || !CAMINHO_OK.test(caminho)) return send(res, 404, { error: 'Não encontrado.' })
  const corpo = method === 'GET' ? undefined : await lerCorpo(req)
  if (caminho.startsWith('/whatsapp/')) vistoEm.set(s.nome, Date.now())
  try {
    const r = await chamarMotor(s, method, caminho, corpo)
    send(res, r.status, ajustarResposta(caminho, r.body, s))
  } catch (err) {
    const tempo = (err as Error).name === 'TimeoutError'
    log(`motor ${s.nome} ${method} ${caminho}: ${tempo ? 'demorou demais' : 'fora do ar'} (${(err as Error).message})`)
    send(res, tempo ? 504 : 503, { error: tempo ? 'O WhatsApp demorou para responder. Tente de novo.' : MSG_INDISPONIVEL, offline: !tempo })
  }
}

// ---------------------------------------------------------------- vigia (reconexão automática)

const ultimaReconexao = new Map<string, number>()
/** QR Code sem ninguém olhando por esse tempo: para de gerar */
const QR_SEM_VER_MS = 4 * 60_000

/**
 * A cada 30 s, para cada sessão: se há sessão salva e o WhatsApp está desconectado (ex.: a internet da
 * VPS caiu na hora de abrir), manda reconectar. QR Code girando sem ninguém na tela é desligado.
 * "Desconectar" na tela apaga a sessão salva, então o vigia não reconecta o que a pessoa desligou.
 */
export async function vigiar(s: Sessao, agora = Date.now()): Promise<'reconectar' | 'parar-qr' | null> {
  let wa: { status?: string }
  try {
    wa = (await chamarMotor(s, 'GET', '/whatsapp/status')).body as { status?: string }
  } catch {
    return null // Motor fora do ar: o systemd reinicia
  }
  const salva = credsSalvas(s)
  if (wa?.status === 'disconnected' && salva && agora - (ultimaReconexao.get(s.nome) ?? 0) > 60_000) {
    ultimaReconexao.set(s.nome, agora)
    log(`vigia ${s.nome}: WhatsApp desconectado com sessão salva, reconectando`)
    await chamarMotor(s, 'POST', '/whatsapp/conectar').catch(() => {})
    return 'reconectar'
  }
  const esperandoQr = wa?.status === 'qrcode' || (wa?.status === 'connecting' && !salva)
  if (esperandoQr && agora - (vistoEm.get(s.nome) ?? 0) > QR_SEM_VER_MS) {
    log(`vigia ${s.nome}: QR Code sem ninguém olhando, parando`)
    await chamarMotor(s, 'POST', '/whatsapp/desconectar').catch(() => {})
    return 'parar-qr'
  }
  return null
}

// ---------------------------------------------------------------- servidor

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`)
}

export const server = http.createServer(async (req, res) => {
  const inicio = Date.now()
  const origin = req.headers.origin
  if (origin && !origemPermitida(origin)) return send(res, 403, { error: 'Origem não autorizada.' })
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()

  let conta: Conta | null = null
  try {
    const url = new URL(req.url ?? '/', 'http://gateway')
    if (url.pathname === '/saude') {
      const motores = await Promise.all(
        [...sessoes.values()].map((s) =>
          chamarMotor(s, 'GET', '/health')
            .then((r) => r.status === 200)
            .catch(() => false),
        ),
      )
      return send(res, 200, { ok: true, motor: motores.every(Boolean) })
    }

    const ip = ipDe(req)
    if ((falhasPorIp.get(ip) ?? 0) >= MAX_FALHAS) return send(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' })
    const token = /^Bearer (\S{20,4096})$/.exec(String(req.headers.authorization ?? ''))?.[1]
    try {
      conta = token ? await quemE(token) : null
    } catch (err) {
      log(`login: não consegui conferir no Supabase (${(err as Error).message})`)
      return send(res, 503, { error: MSG_INDISPONIVEL, offline: true })
    }
    if (!conta) {
      falhasPorIp.set(ip, (falhasPorIp.get(ip) ?? 0) + 1)
      return send(res, 401, { error: 'Entre na sua conta da XS de novo.' })
    }
    const s = sessaoDoUsuario(conta)

    if (url.pathname === '/acesso') return send(res, s ? 200 : 403, { permitido: !!s })
    if (!s) return send(res, 403, { error: 'Sua conta não usa o WhatsApp na nuvem.' })
    if (url.pathname.startsWith('/motor/')) return await repassar(req, res, s, url.pathname.slice('/motor'.length))
    return send(res, 404, { error: 'Não encontrado.' })
  } catch (err) {
    send(res, 400, { error: limparMensagem((err as Error).message) ?? 'Pedido inválido.' })
  } finally {
    // Sem token, sem corpo e sem mensagens: só o caminho, o resultado e de quem foi
    const caminho = (req.url ?? '').split('?')[0]
    if (caminho !== '/saude' && !caminho.endsWith('/health') && !caminho.endsWith('/whatsapp/status'))
      log(`${req.method} ${caminho} → ${res.statusCode} ${Date.now() - inicio}ms${conta ? ` conta ${conta.id.slice(0, 8)}` : ''}`)
  }
})

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.warn('Aviso: SUPABASE_URL/SUPABASE_ANON_KEY vazios — ninguém consegue entrar.')
  if (!usuarios.size) console.warn('Aviso: XS_CLOUD_USUARIOS vazio — nenhuma conta usa o WhatsApp na nuvem ainda.')
  server.requestTimeout = 0
  server.headersTimeout = 30_000
  server.listen(PORT, HOST, () => log(`gateway do WhatsApp na nuvem em http://${HOST}:${PORT} · sessões: ${[...sessoes.keys()].join(', ') || 'nenhuma'} · contas: ${usuarios.size}`))
  setInterval(() => {
    for (const s of sessoes.values()) void vigiar(s)
  }, 30_000).unref()
  const bye = () => {
    server.close()
    process.exit(0)
  }
  process.on('SIGINT', bye)
  process.on('SIGTERM', bye)
}
