// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Liga o motor à XS pela internet, sem o navegador precisar chamar 127.0.0.1 (que o Chrome e o
 * Brave bloqueiam sem permissão). O motor pergunta à ponte (na VPS da XS) se há pedidos do site,
 * executa cada um no próprio servidor local e devolve a resposta.
 *
 * A chave fica em ponte.json, na pasta de dados. Na primeira vez o motor abre o navegador em
 * /motor/conectar para a pessoa ligar este computador à conta dela.
 */
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { readJson, writeJson } from './store.js'

const SITE = (process.env.XS_SITE ?? 'https://xs-prospeccao.vercel.app').replace(/\/+$/, '')
/** Usada se o site não responder com o endereço da ponte (motor.json) */
const PONTE_PADRAO = 'https://109-110-184-199.sslip.io/ponte'
const CHAVE_OK = /^[A-Za-z0-9_-]{32,64}$/

interface PonteConfig {
  chave: string
  /** Já recebeu algum pedido do site: está ligado a uma conta */
  pareado?: boolean
}

interface Pedido {
  id: string
  method: string
  path: string
  body?: unknown
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lerConfig(): PonteConfig {
  const c = readJson<Partial<PonteConfig>>('ponte.json', {})
  if (c.chave && CHAVE_OK.test(c.chave)) return { chave: c.chave, pareado: !!c.pareado }
  const nova: PonteConfig = { chave: crypto.randomBytes(32).toString('base64url') }
  writeJson('ponte.json', nova)
  return nova
}

/** O endereço da ponte vem do site, para poder mudar de servidor sem trocar o motor. */
async function enderecoDaPonte(): Promise<string> {
  if (process.env.XS_PONTE) return process.env.XS_PONTE.replace(/\/+$/, '')
  try {
    const res = await fetch(`${SITE}/motor.json`, { signal: AbortSignal.timeout(8000) })
    const data = (await res.json()) as { ponte?: unknown }
    if (typeof data.ponte === 'string' && data.ponte.startsWith('https://')) return data.ponte.replace(/\/+$/, '')
  } catch {
    /* sem internet ou site fora: usa o padrão */
  }
  return PONTE_PADRAO
}

export function linkDeConexao(chave: string): string {
  return `${SITE}/motor/conectar#${chave}`
}

function abrirNoNavegador(url: string) {
  if (process.platform === 'win32') execFile('rundll32', ['url.dll,FileProtocolHandler', url], () => {})
  else if (process.platform === 'darwin') execFile('open', [url], () => {})
  else execFile('xdg-open', [url], () => {})
}

async function executar(port: number, p: Pedido): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${p.path}`, {
      method: p.method,
      headers: p.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    return { status: 502, body: { error: 'Falha no Motor WhatsApp XS.' } }
  }
}

/** Começa a atender os pedidos do site. Roda para sempre, reconectando sozinho. */
export function iniciarPonte(port: number, versao: string) {
  const cfg = lerConfig()
  const link = linkDeConexao(cfg.chave)

  void (async () => {
    const ponte = await enderecoDaPonte()
    const headers = { 'Content-Type': 'application/json', 'X-Motor-Chave': cfg.chave }

    if (!cfg.pareado) {
      console.log('')
      console.log('  Falta ligar este motor à sua conta da XS. Abrindo o navegador…')
      console.log('  Se não abrir, copie este endereço no navegador em que você usa a XS:')
      console.log(`  ${link}`)
      // Dá tempo do primeiro "esperar" chegar na ponte antes de a página procurar o motor
      setTimeout(() => abrirNoNavegador(link), 2500)
    }

    const atender = async (p: Pedido) => {
      const resposta = await executar(port, p)
      if (!cfg.pareado) {
        cfg.pareado = true
        writeJson('ponte.json', cfg)
        console.log('  ✓ Motor ligado à sua conta da XS.')
      }
      await fetch(`${ponte}/motor/responder`, { method: 'POST', headers, body: JSON.stringify({ id: p.id, ...resposta }), signal: AbortSignal.timeout(20_000) }).catch(() => {})
    }

    let falhas = 0
    for (;;) {
      try {
        const res = await fetch(`${ponte}/motor/esperar`, { method: 'POST', headers, body: JSON.stringify({ versao }), signal: AbortSignal.timeout(40_000) })
        if (!res.ok) throw new Error(`ponte ${res.status}`)
        const pedidos = (await res.json()) as Pedido[]
        if (falhas >= 2) console.log('  ✓ Conectado à XS de novo.')
        falhas = 0
        for (const p of Array.isArray(pedidos) ? pedidos : []) void atender(p)
      } catch {
        falhas++
        if (falhas === 2) console.log('  Sem conexão com a XS (a internet caiu?). Tentando de novo sozinho…')
        await sleep(Math.min(30_000, 1500 * falhas))
      }
    }
  })()
}
