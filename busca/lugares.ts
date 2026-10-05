// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Busca na base aberta de comércios (Overture Maps), na VPS: grátis, sem limite, em milissegundos.
 * A base é montada pelo lugares-importar.ts (todo mês, quando sai versão nova).
 *
 *   XS_BUSCA_TOKEN=… PORT=8091 node busca/lugares.ts
 *
 * Só a função /api/maps da Vercel conversa com ele (mesma senha da busca antiga). O login do
 * usuário é conferido lá. No Caddy fica em /lugares/* (instalar-lugares.sh).
 *
 * POST /buscar  { uf, cidade, nichos[{ nome, tax[], nomes[] }], caixas?, filtros, meta, conhecidos?, pular? }
 * GET  /saude   versão da base e total de lugares (aberto)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DADOS = path.resolve(process.env.XS_DADOS ?? 'dados')
const DB_FILE = path.join(DADOS, 'lugares.db')
const INFO_FILE = path.join(DADOS, 'lugares.json')
const TOKEN = process.env.XS_BUSCA_TOKEN ?? ''
const PORT = Number(process.env.PORT ?? 8091)
const HOST = process.env.HOST ?? '127.0.0.1'

type Mode = 1 | 0 | -1

export interface NichoBase {
  nome: string
  /** Categorias da Overture */
  tax: string[]
  /** Pedaços do nome (sem acento) */
  nomes: string[]
}

export interface LugaresInput {
  uf: string
  cidade: string
  nichos: NichoBase[]
  /** Bairros como caixas no mapa: [sul, norte, oeste, leste] */
  caixas?: [number, number, number, number][]
  filtros?: { telefone?: Mode; celular?: Mode; site?: Mode }
  meta?: number
  conhecidos?: { telefones?: string[] }
  pular?: boolean
}

interface Row {
  id: string
  nome: string
  nome_n: string
  tax: string | null
  tel: string | null
  tel2: string | null
  site: string | null
  insta: string | null
  face: string | null
  email: string | null
  endereco: string | null
  cep: string | null
  cidade: string
  uf: string
  lat: number
  lng: number
  conf: number
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

export const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** DDD + últimos 8 dígitos (igual ao phoneKey do app). */
export function phoneKey(tel: string | null | undefined): string | null {
  let d = String(tel ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return `${d.slice(0, 2)}${d.slice(-8)}`
  return d.slice(-8)
}

const isMobile = (p: string | null) => !!p && p.length === 13 && p[4] === '9'
const passes = (mode: Mode | undefined, has: boolean) => !mode || (mode === 1 ? has : !has)
const TAX_RE = /^[a-z_]{2,60}$/

/** Monta a consulta: categorias pelo índice e, se houver, pedaços do nome. */
export function plan(input: LugaresInput) {
  const tax = [...new Set(input.nichos.flatMap((n) => n.tax).filter((t) => TAX_RE.test(t)))].slice(0, 200)
  const nomes = [
    ...new Set(
      input.nichos
        .flatMap((n) => n.nomes)
        .map(norm)
        .filter((n) => n.length >= 3),
    ),
  ].slice(0, 40)
  const cidade = norm(input.cidade)
  const uf = String(input.uf ?? '').toUpperCase()
  return { tax, nomes, cidades: [cidade, `${cidade} ${uf.toLowerCase()}`], uf }
}

/** Em qual nicho da busca o lugar entra (categoria primeiro, depois o nome). */
export function nichoDo(r: Pick<Row, 'tax' | 'nome_n'>, nichos: NichoBase[]): string {
  const porTax = nichos.find((n) => r.tax && n.tax.includes(r.tax))
  if (porTax) return porTax.nome
  const porNome = nichos.find((n) => n.nomes.some((x) => ` ${r.nome_n} `.includes(norm(x))))
  return (porNome ?? nichos[0])?.nome ?? ''
}

const dentro = (r: Pick<Row, 'lat' | 'lng'>, c: [number, number, number, number]) => r.lat >= c[0] && r.lat <= c[1] && r.lng >= c[2] && r.lng <= c[3]

export function toResult(r: Row, nicho: string) {
  const phone = r.tel ?? ''
  return {
    id: `ov:${r.id}`,
    name: r.nome,
    niche: nicho,
    phone,
    phone2: r.tel2 ?? undefined,
    website: r.site ?? '',
    instagram: r.insta ?? '',
    facebook: r.face ?? '',
    email: r.email ?? undefined,
    address: [r.endereco, `${r.cidade} - ${r.uf}`].filter(Boolean).join(' - '),
    city: r.cidade,
    state: r.uf,
    cep: r.cep ?? undefined,
    rating: 0,
    reviewsCount: 0,
    lat: r.lat,
    lng: r.lng,
    mapsUrl: '',
    neighborhood: '',
    cnpj: '',
    responsibleName: '',
    responsibleRole: '',
    enrichmentConfidence: 'not_found' as const,
    enrichmentSource: 'Base aberta (Overture Maps)',
    hasWhatsapp: isMobile(phone),
    recurring: false,
    source: 'base' as const,
    confidence: r.conf,
  }
}

/**
 * Escolhe os `meta` melhores: celular (WhatsApp) primeiro, depois telefone, depois os mais
 * confiáveis; e reparte igual entre os tipos de negócio pedidos (um de cada vez).
 */
export function pick<T extends { niche: string; hasWhatsapp: boolean; phone: string; confidence: number }>(pool: T[], meta: number): T[] {
  const score = (r: T) => (r.hasWhatsapp ? 2 : r.phone ? 1 : 0)
  const sorted = [...pool].sort((a, b) => score(b) - score(a) || b.confidence - a.confidence)
  const porNicho = new Map<string, T[]>()
  for (const r of sorted) {
    const fila = porNicho.get(r.niche)
    if (fila) fila.push(r)
    else porNicho.set(r.niche, [r])
  }
  const filas = [...porNicho.values()]
  const out: T[] = []
  for (let i = 0; out.length < meta && filas.some((f) => i < f.length); i++) for (const f of filas) if (i < f.length && out.length < meta) out.push(f[i])
  return out.sort((a, b) => score(b) - score(a) || b.confidence - a.confidence)
}

// ---------------------------------------------------------------------------
// Banco (reabre sozinho quando o importador troca o arquivo)
// ---------------------------------------------------------------------------

let db: DatabaseSync | null = null
let dbStamp = 0

function getDb(): DatabaseSync {
  if (!fs.existsSync(DB_FILE)) throw new HttpError(503, 'A base aberta ainda está sendo importada. Tente de novo em alguns minutos.')
  const stamp = fs.statSync(DB_FILE).mtimeMs
  if (!db || stamp !== dbStamp) {
    db?.close()
    db = new DatabaseSync(DB_FILE, { readOnly: true })
    dbStamp = stamp
  }
  return db
}

export function buscar(input: LugaresInput, d: DatabaseSync = getDb()) {
  const started = Date.now()
  if (!Array.isArray(input.nichos) || !input.nichos.length) throw new HttpError(400, 'Escolha ao menos um tipo de negócio.')
  if (!input.cidade || !/^[A-Z]{2}$/i.test(input.uf ?? '')) throw new HttpError(400, 'Escolha a cidade.')
  const meta = Math.max(5, Math.min(500, Math.round(Number(input.meta) || 40)))
  const { tax, nomes, cidades, uf } = plan(input)
  if (!tax.length && !nomes.length) throw new HttpError(400, 'Tipo de negócio sem categoria na base.')

  const where: string[] = []
  const params: (string | number)[] = [uf, ...cidades]
  if (tax.length) {
    where.push(`tax IN (${tax.map(() => '?').join(',')})`)
    params.push(...tax)
  }
  for (const n of nomes) {
    where.push(`(' ' || nome_n || ' ') LIKE ?`)
    params.push(`% ${n}%`)
  }
  const rows = d.prepare(`SELECT * FROM lugares WHERE uf = ? AND cidade_n IN (?, ?) AND (${where.join(' OR ')}) ORDER BY conf DESC LIMIT 20000`).all(...params) as unknown as Row[]

  const caixas = (input.caixas ?? []).filter((c) => Array.isArray(c) && c.length === 4 && c.every(Number.isFinite)).slice(0, 20)
  const known = new Set(input.conhecidos?.telefones ?? [])
  const seen = new Set<string>()
  const f = input.filtros ?? {}
  let found = 0
  let recurring = 0
  let blocked = 0
  const pool: ReturnType<typeof toResult>[] = []
  const again: ReturnType<typeof toResult>[] = []
  for (const r of rows) {
    if (caixas.length && !caixas.some((c) => dentro(r, c))) continue
    // Mesmo telefone ou mesmo nome = o mesmo lugar vindo de duas fontes
    const pk = phoneKey(r.tel)
    const dup = pk ?? `n:${r.nome_n}`
    if (seen.has(dup)) continue
    seen.add(dup)
    found++
    if (!passes(f.telefone, !!r.tel) || !passes(f.celular, isMobile(r.tel)) || !passes(f.site, !!r.site)) continue
    const res = toResult(r, nichoDo(r, input.nichos))
    if (pk && known.has(pk)) {
      recurring++
      if (input.pular !== false) {
        blocked++
        continue
      }
      res.recurring = true
      again.push(res)
      continue
    }
    pool.push(res)
  }
  const fresh = pick(pool, meta)
  return {
    results: [...fresh, ...again],
    stats: {
      found,
      approved: fresh.length,
      recurring,
      blocked,
      elapsedMs: Date.now() - started,
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authorized(req: http.IncomingMessage): boolean {
  const got = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))
  const want = Buffer.from(TOKEN)
  return TOKEN.length >= 24 && got.length === want.length && crypto.timingSafeEqual(got, want)
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 2_000_000) throw new HttpError(413, 'Pedido grande demais.')
    chunks.push(c as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  try {
    if (url.pathname === '/saude') {
      const info = fs.existsSync(INFO_FILE) ? JSON.parse(fs.readFileSync(INFO_FILE, 'utf8')) : null
      return send(res, 200, { ok: !!info, ...(info ?? { importando: true }) })
    }
    if (!authorized(req)) return send(res, 401, { error: 'Não autorizado.' })
    // /lugares/buscar quando chamado direto (sem o Caddy tirar o prefixo)
    if ((url.pathname === '/buscar' || url.pathname === '/lugares/buscar') && req.method === 'POST') return send(res, 200, buscar((await readJson(req)) as LugaresInput))
    return send(res, 404, { error: 'Não encontrado.' })
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    if (status === 500) console.error(err)
    return send(res, status, {
      error: err instanceof Error ? err.message : 'Erro.',
    })
  }
})

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (TOKEN.length < 24) {
    console.error('Defina XS_BUSCA_TOKEN (24+ caracteres).')
    process.exit(1)
  }
  server.listen(PORT, HOST, () => console.log(`lugares da XS em http://${HOST}:${PORT} · banco ${DB_FILE}`))
}
