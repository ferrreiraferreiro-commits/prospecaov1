/**
 * Busca de empresas da XS (substitui o Motor XS na busca).
 *
 * POST /api/maps { acao: 'buscar', ... }      → repassa para o servidor de busca (base aberta do CNPJ, na VPS)
 * POST /api/maps { acao: 'bairros', cidade }  → bairros com mais empresas na cidade
 * POST /api/maps { acao: 'enriquecer', itens } → confere se o site (domínio do e-mail) está no ar e acha o Instagram
 *
 * Só atende quem está logado com acesso liberado (teste em dia, plano ativo ou vitalício).
 * O endereço e a senha do servidor de busca ficam só aqui (XS_BUSCA_URL / XS_BUSCA_TOKEN na Vercel).
 *
 * Arquivo único de propósito: a Vercel compila cada função sozinha.
 */
import dns from 'node:dns/promises'
import net from 'node:net'

export const config = { maxDuration: 30 }

// ---------------------------------------------------------------------------
// Site e Instagram a partir do domínio do e-mail da empresa
// ---------------------------------------------------------------------------

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (net.isIPv6(address)) {
    const n = address.toLowerCase()
    return n === '::' || n === '::1' || n.startsWith('fc') || n.startsWith('fd') || /^fe[89ab]/.test(n) || n.startsWith('::ffff:')
  }
  return true
}

/** Só endereços públicos (o servidor nunca abre rede interna). */
async function assertSafePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('URL não permitida')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) throw new Error('Destino privado')
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true })
  if (!addrs.length || addrs.some((e) => isPrivateIp(e.address))) throw new Error('Destino privado')
  return url
}

/** Baixa o HTML seguindo até 3 redirecionamentos, conferindo cada destino. Devolve o endereço final e o HTML. */
async function fetchSite(raw: string): Promise<{ url: string; html: string } | null> {
  let url = await assertSafePublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XSProspeccao/1.0)' }, signal: AbortSignal.timeout(3500) })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await assertSafePublicUrl(new URL(loc, url).toString())
      continue
    }
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') ?? 'text/html')) return null
    return { url: url.toString(), html: (await res.text()).slice(0, 800_000) }
  }
  return null
}

const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'sharer'])

export function findInstagram(html: string): string {
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})\/?/gi)) {
    if (!IG_SKIP.has(m[1].toLowerCase())) return `https://www.instagram.com/${m[1]}`
  }
  return ''
}

/** Páginas de domínio estacionado / à venda não contam como site da empresa. */
export function looksParked(html: string): boolean {
  return /domain (is )?for sale|dom[ií]nio (est[aá] )?(à|a) venda|this domain is parked|parked domain|p[aá]gina em constru[cç][aã]o|site em constru[cç][aã]o|coming soon/i.test(html.slice(0, 20_000))
}

interface EnrichItem {
  id: string
  site: string
}

async function enrichOne(it: EnrichItem) {
  try {
    // Com e sem "www." ao mesmo tempo: vale a primeira que responder com uma página
    const page = await Promise.any(
      [`https://${it.site}`, `https://www.${it.site}`].map((u) =>
        fetchSite(u).then((p) => {
          if (!p) throw new Error('sem página')
          return p
        }),
      ),
    ).catch(() => null)
    if (!page || page.html.length < 300 || looksParked(page.html)) return { id: it.id, website: '', instagram: '' }
    return { id: it.id, website: page.url, instagram: findInstagram(page.html) }
  } catch {
    return { id: it.id, website: '', instagram: '' }
  }
}

// ---------------------------------------------------------------------------
// Acesso: usuário logado e com a conta liberada
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function requireAccess(authorization: string | undefined) {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new HttpError(500, 'Servidor sem Supabase configurado.')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Entre na sua conta para buscar.')
  const headers = { apikey: anon, Authorization: authorization }
  const userRes = await fetch(`${url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(6000) })
  if (!userRes.ok) throw new HttpError(401, 'Sua sessão expirou. Entre de novo.')
  const user = (await userRes.json()) as { id: string }
  // RLS: com o token do próprio usuário, só a linha dele volta
  const profRes = await fetch(`${url}/rest/v1/profiles?select=*&user_id=eq.${user.id}`, { headers, signal: AbortSignal.timeout(6000) })
  const [profile] = profRes.ok ? ((await profRes.json()) as { plano: string; teste_ate: string; plano_ate?: string | null }[]) : []
  if (profile?.plano === 'cancelado') throw new HttpError(403, 'Sua assinatura está pausada.')
  if (profile?.plano === 'teste' && Date.parse(profile.teste_ate) <= Date.now()) throw new HttpError(403, 'Seu teste grátis terminou.')
  if (profile?.plano === 'ativo' && profile.plano_ate && Date.parse(profile.plano_ate) <= Date.now()) throw new HttpError(403, 'Seu plano venceu.')
}

/** Chama o servidor de busca na VPS. */
async function busca(pathAndQuery: string, body?: unknown): Promise<unknown> {
  const base = process.env.XS_BUSCA_URL?.replace(/\/+$/, '')
  const token = process.env.XS_BUSCA_TOKEN
  if (!base || !token) throw new HttpError(503, 'A busca ainda não foi configurada (servidor de busca).')
  let res: Response
  try {
    res = await fetch(`${base}${pathAndQuery}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(502, 'O servidor de busca não respondeu. Tente de novo em instantes.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new HttpError(res.status === 401 ? 502 : res.status, data.error || `Falha no servidor de busca (${res.status}).`)
  return data
}

// ---------------------------------------------------------------------------
// Handler (Vercel / Node)
// ---------------------------------------------------------------------------

interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default function handler(req: Req, res: Res) {
  return handle(req, res, { skipAuth: false })
}

/**
 * `skipAuth` só é usado pelo npm run dev no modo local (sem Supabase, sem contas):
 * na Vercel a função publicada é sempre o `handler` acima, que confere o login.
 */
export async function handle(req: Req, res: Res, opts: { skipAuth: boolean }) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  try {
    const auth = req.headers.authorization
    if (!opts.skipAuth) await requireAccess(Array.isArray(auth) ? auth[0] : auth)
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})) as Record<string, unknown>

    if (body.acao === 'enriquecer') {
      const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 12) as EnrichItem[]
      const ok = itens.filter((i) => i && typeof i.site === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(i.site))
      return res.status(200).json({ itens: await Promise.all(ok.map(enrichOne)) })
    }

    if (body.acao === 'bairros') {
      const cidade = String(body.cidade ?? '')
      return res.status(200).json(await busca(`/bairros?cidade=${encodeURIComponent(cidade)}`))
    }

    if (!Array.isArray(body.nichos) || !body.nichos.length) throw new HttpError(400, 'Escolha ao menos um nicho.')
    if (!String(body.cidade ?? '').trim()) throw new HttpError(400, 'Escolha a cidade.')
    const { acao: _a, ...input } = body
    return res.status(200).json(await busca('/buscar', input))
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Falha na busca.'
    return res.status(status).json({ error: message })
  }
}
