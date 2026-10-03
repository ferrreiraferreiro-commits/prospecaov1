/**
 * Servidor de busca da XS (roda na VPS): procura empresas na base aberta do CNPJ.
 *
 *   XS_BUSCA_TOKEN=… node busca/servidor.ts
 *
 * Só a função /api/maps da Vercel conversa com ele (senha em XS_BUSCA_TOKEN).
 * O login do usuário é conferido lá; aqui só entra quem tem a senha.
 *
 * POST /buscar   { cidade, uf, nichos[], bairros?[], filtros, meta, conhecidos? }
 * GET  /bairros?cidade=…&uf=…   bairros com mais empresas (para sugerir)
 * GET  /saude                   mês da base e total de empresas (aberto)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { cleanName, isJunkName, norm, titleCase } from './lib.ts'
import { resolveNiche, type Niche } from './nichos.ts'

const DB_FILE = path.resolve(process.env.XS_DADOS ?? 'dados', 'busca.db')
const TOKEN = process.env.XS_BUSCA_TOKEN ?? ''
const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '127.0.0.1'

type Mode = 1 | 0 | -1

export interface BuscaInput {
  cidade: string
  uf?: string
  nichos: string[]
  bairros?: string[]
  filtros?: { telefone?: Mode; celular?: Mode; site?: Mode }
  meta?: number
  conhecidos?: { telefones?: string[]; cnpjs?: string[] }
  /** true = pula quem já está nos leads; false = traz marcado como "já na lista" */
  pular?: boolean
}

// ---------------------------------------------------------------------------
// Banco (reabre sozinho quando o importador troca o arquivo)
// ---------------------------------------------------------------------------

let db: DatabaseSync | null = null
let dbStamp = 0
let cnaeTable: { cod: string; desc_n: string }[] = []
let qualifs = new Map<string, string>()

function getDb(): DatabaseSync {
  const stamp = fs.statSync(DB_FILE).mtimeMs
  if (!db || stamp !== dbStamp) {
    db?.close()
    db = new DatabaseSync(DB_FILE, { readOnly: true })
    dbStamp = stamp
    cnaeTable = db.prepare('SELECT cod, desc_n FROM cnae').all() as typeof cnaeTable
    qualifs = new Map((db.prepare('SELECT cod, descricao FROM qualificacao').all() as { cod: string; descricao: string }[]).map((q) => [q.cod, q.descricao]))
  }
  return db
}

/** Mesma chave de telefone que o app usa para achar duplicados (DDD + 8 últimos dígitos). */
export function phoneKey(tel: string | null | undefined): string | null {
  let d = String(tel ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return `${d.slice(0, 2)}${d.slice(-8)}`
  return d.slice(-8)
}

/** "Campinas, SP" / "Campinas - SP" / "Campinas" → nome + UF. */
export function parseCidade(raw: string, uf?: string): { nome: string; uf: string } {
  const m = /^(.*?)[\s,\-–/]+([A-Za-z]{2})$/.exec(raw.trim())
  if (m && !uf) return { nome: norm(m[1]), uf: m[2].toUpperCase() }
  return { nome: norm(raw), uf: (uf ?? '').toUpperCase() }
}

// Quem atender: sócio-administrador primeiro
const ROLE_ORDER = ['49', '05', '50', '65', '16', '10', '22']

const passes = (mode: Mode | undefined, has: boolean) => !mode || (mode === 1 ? has : !has)

interface Row {
  cnpj: string
  basico: string
  fantasia: string
  cnae: string
  uf: string
  mun: number
  bairro: string
  endereco: string
  cep: string
  tel: string | null
  cel: number
  tel2: string | null
  email: string | null
  email_tipo: number
  inicio: string
  razao: string | null
  porte: string | null
  natureza: string | null
}

export function buscar(input: BuscaInput) {
  const t0 = Date.now()
  const d = getDb()
  const meta = Math.max(1, Math.min(500, Math.round(input.meta ?? 30)))
  const { nome, uf } = parseCidade(input.cidade, input.uf)
  const muns = d.prepare('SELECT cod, nome FROM municipio WHERE nome_n = ?').all(nome) as { cod: number; nome: string }[]
  if (!muns.length) throw new HttpError(404, `Não achei a cidade "${input.cidade}". Escreva como "Campinas, SP".`)
  const munNome = new Map(muns.map((m) => [m.cod, m.nome]))
  const ufFilter = uf ? 'e.uf = ? AND ' : ''
  const munIn = `e.mun IN (${muns.map(() => '?').join(',')})`
  const bairros = (input.bairros ?? []).map(norm).filter(Boolean).slice(0, 20)
  const bairroSql = bairros.length ? ` AND (${bairros.map(() => 'e.bairro_n LIKE ?').join(' OR ')})` : ''
  const baseParams = [...(uf ? [uf] : []), ...muns.map((m) => m.cod), ...bairros.map((b) => `%${b}%`)]

  const knownPhones = new Set(input.conhecidos?.telefones ?? [])
  const knownCnpjs = new Set((input.conhecidos?.cnpjs ?? []).map((c) => c.replace(/\D/g, '')))
  const f = input.filtros ?? {}
  const seen = new Set<string>()
  const picked: (Row & { nicho: string; recurring: boolean })[] = []
  let found = 0
  let blocked = 0
  let fresh = 0

  const niches = [...new Set(input.nichos.map((n) => n.trim()).filter(Boolean))].slice(0, 10)
  if (!niches.length) throw new HttpError(400, 'Escolha ao menos um nicho.')

  for (const label of niches) {
    const niche: Niche = resolveNiche(label, cnaeTable)
    const cnaeSql = niche.cnaes.length ? ` AND e.cnae IN (${niche.cnaes.map(() => '?').join(',')})` : ''
    // Celular primeiro (vira WhatsApp), depois as empresas mais novas (mais chance de ainda não ter site)
    const sql = `SELECT e.*, p.razao, p.porte, p.natureza FROM est e LEFT JOIN empresa p ON p.basico = e.basico
      WHERE ${ufFilter}${munIn}${bairroSql}${cnaeSql}
      ORDER BY e.cel DESC, e.inicio DESC LIMIT ${niche.cnaes.length ? 20000 : 200000}`
    const list = d.prepare(sql).all(...baseParams, ...niche.cnaes) as unknown as Row[]
    for (const r of list) {
      if (niche.nome && !niche.nome.test(norm(`${r.fantasia} ${r.razao ?? ''}`))) continue
      found++
      if (seen.has(r.cnpj)) continue
      if (!passes(f.telefone, !!r.tel) || !passes(f.celular, r.cel === 1) || !passes(f.site, r.email_tipo === 2)) continue
      const known = knownCnpjs.has(r.cnpj) || [r.tel, r.tel2].some((t) => {
        const k = phoneKey(t)
        return !!k && knownPhones.has(k)
      })
      if (known && input.pular !== false) {
        blocked++
        continue
      }
      seen.add(r.cnpj)
      picked.push({ ...r, nicho: label, recurring: known })
      if (!known) fresh++
      if (fresh >= meta) break
    }
    if (fresh >= meta) break
  }

  const socios = d.prepare('SELECT nome, qualif FROM socio WHERE basico = ?')
  const results = picked.map((r) => {
    const people = (socios.all(r.basico) as { nome: string; qualif: string }[]).sort((a, b) => {
      const ra = ROLE_ORDER.indexOf(a.qualif)
      const rb = ROLE_ORDER.indexOf(b.qualif)
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb)
    })
    // Empresário individual (MEI) não tem quadro de sócios: o responsável é o próprio titular
    const titular = !people.length && r.natureza === '2135' && r.razao ? { nome: cleanName(r.razao), cargo: 'Titular (empresário individual)' } : null
    const resp = people[0] ? { nome: people[0].nome, cargo: qualifs.get(people[0].qualif) ?? '' } : titular
    const cidade = titleCase(munNome.get(r.mun) ?? '')
    const domain = r.email_tipo === 2 && r.email ? r.email.split('@')[1] : ''
    return {
      id: r.cnpj,
      name: titleCase(cleanName(isJunkName(r.fantasia) ? r.razao : r.fantasia) || 'Sem nome'),
      niche: r.nicho,
      phone: r.tel ?? '',
      phone2: r.tel2 ?? '',
      email: r.email ?? '',
      siteGuess: domain,
      website: '',
      instagram: '',
      address: [r.endereco, titleCase(r.bairro), cidade && `${cidade} - ${r.uf}`].filter(Boolean).join(' - '),
      neighborhood: titleCase(r.bairro),
      city: cidade,
      state: r.uf,
      cep: r.cep,
      rating: 0,
      reviewsCount: 0,
      lat: 0,
      lng: 0,
      mapsUrl: '',
      cnpj: r.cnpj,
      razao: titleCase(cleanName(r.razao)),
      openedAt: /^\d{8}$/.test(r.inicio) ? `${r.inicio.slice(0, 4)}-${r.inicio.slice(4, 6)}-${r.inicio.slice(6, 8)}` : '',
      responsibleName: resp ? titleCase(resp.nome) : '',
      responsibleRole: resp?.cargo ?? '',
      enrichmentConfidence: resp ? 'confirmed' : 'not_found',
      enrichmentSource: 'Receita Federal · dados abertos do CNPJ',
      hasWhatsapp: r.cel === 1,
      recurring: r.recurring,
    }
  })
  const mes = (d.prepare("SELECT valor FROM meta WHERE chave = 'mes'").get() as { valor: string } | undefined)?.valor ?? ''
  return { results, stats: { found, approved: results.filter((r) => !r.recurring).length, blocked, recurring: blocked + results.filter((r) => r.recurring).length, mes, elapsedMs: Date.now() - t0 } }
}

export function bairrosDe(cidade: string, ufIn?: string) {
  const d = getDb()
  const { nome, uf } = parseCidade(cidade, ufIn)
  const muns = (d.prepare('SELECT cod FROM municipio WHERE nome_n = ?').all(nome) as { cod: number }[]).map((m) => m.cod)
  if (!muns.length) return []
  const rows = d
    .prepare(`SELECT bairro, COUNT(*) n FROM est WHERE ${uf ? 'uf = ? AND ' : ''}mun IN (${muns.map(() => '?').join(',')}) AND bairro <> '' GROUP BY bairro_n ORDER BY n DESC LIMIT 300`)
    .all(...(uf ? [uf] : []), ...muns) as { bairro: string; n: number }[]
  return rows.map((r) => ({ nome: titleCase(r.bairro), empresas: r.n }))
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
    if (size > 4_000_000) throw new HttpError(413, 'Pedido grande demais.')
    chunks.push(c as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  try {
    if (url.pathname === '/saude') {
      const d = getDb()
      const get = (k: string) => (d.prepare('SELECT valor FROM meta WHERE chave = ?').get(k) as { valor: string } | undefined)?.valor
      return send(res, 200, { ok: true, mes: get('mes'), ativos: Number(get('ativos') ?? 0) })
    }
    if (!authorized(req)) return send(res, 401, { error: 'Não autorizado.' })
    if (url.pathname === '/buscar' && req.method === 'POST') return send(res, 200, buscar((await readJson(req)) as BuscaInput))
    if (url.pathname === '/bairros') return send(res, 200, { bairros: bairrosDe(url.searchParams.get('cidade') ?? '', url.searchParams.get('uf') ?? undefined) })
    return send(res, 404, { error: 'Não encontrado.' })
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    if (status === 500) console.error(err)
    return send(res, status, { error: err instanceof Error ? err.message : 'Erro.' })
  }
})

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (TOKEN.length < 24) {
    console.error('Defina XS_BUSCA_TOKEN (24+ caracteres).')
    process.exit(1)
  }
  server.listen(PORT, HOST, () => console.log(`busca da XS em http://${HOST}:${PORT} · banco ${DB_FILE}`))
}
