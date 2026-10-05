// Testes do gateway do WhatsApp na nuvem:  node --test whatsapp-cloud/gateway.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { MSG_INDISPONIVEL, ajustarResposta, configurar, lerSessoes, lerUsuarios, limparMensagem, origemPermitida, server, usarVerificador, vigiar, type Sessao } from './gateway.ts'

const DONO = '11111111-2222-3333-4444-555555555555'
const OUTRO = '99999999-8888-7777-6666-555555555555'
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-gateway-'))

/** Motor de mentira: guarda o que recebeu e responde como o de verdade */
const recebidos: { method: string; url: string; body: string; origin?: string }[] = []
let waStatus = 'disconnected'
const motor = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  recebidos.push({ method: req.method!, url: req.url!, body: Buffer.concat(chunks).toString(), origin: req.headers.origin })
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/health') return res.end(JSON.stringify({ ok: true, versao: '1.4.0', computador: 'vps-123', acordado: false, whatsapp: { status: waStatus, user: null } }))
  if (req.url === '/whatsapp/status') return res.end(JSON.stringify({ status: waStatus, qrCodeUrl: null, user: null, lastError: 'connect ECONNREFUSED 127.0.0.1:443' }))
  if (req.url === '/whatsapp/teste') return res.writeHead(400).end(JSON.stringify({ error: 'Este número não tem WhatsApp ativo.' }))
  res.end(JSON.stringify({ ok: true }))
})

let base = ''
let sessao: Sessao

before(async () => {
  await new Promise<void>((r) => motor.listen(0, '127.0.0.1', r))
  const porta = (motor.address() as AddressInfo).port
  sessao = { nome: 'principal', motor: `http://127.0.0.1:${porta}`, dados: path.join(dados, 'principal') }
  configurar({ sessoes: new Map([['principal', sessao]]), usuarios: lerUsuarios('gabriel') })
  usarVerificador(async (token) =>
    token === 'token-do-dono-aaaaaaaaaaaa' ? { id: DONO, usuario: 'gabriel' } : token === 'token-de-outro-aaaaaaaaaa' ? { id: OUTRO, usuario: 'ana.web' } : null,
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  server.close()
  motor.close()
})

const comLogin = (token: string, init: RequestInit = {}) => ({ ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

test('configuração: sessões e contas', () => {
  assert.deepEqual([...lerSessoes('principal:3077, ruim:abc, joao:3078').keys()], ['principal', 'joao'])
  const u = lerUsuarios(`${DONO}, ${OUTRO}:joao, Gabriel, x, nome com espaço`)
  assert.equal(u.get(DONO), 'principal')
  assert.equal(u.get(OUTRO), 'joao')
  assert.equal(u.get('gabriel'), 'principal')
  assert.equal(u.size, 3)
})

test('origem: só o site exato e localhost', () => {
  assert.ok(origemPermitida('https://xs-prospeccao.vercel.app'))
  assert.ok(origemPermitida('http://localhost:5180'))
  assert.ok(!origemPermitida('https://xs-prospeccao-falso.vercel.app'))
  assert.ok(!origemPermitida('https://localhost:5180'))
  assert.ok(!origemPermitida(undefined))
})

test('sem login ou com login errado: 401, e o motor não é chamado', async () => {
  const antes = recebidos.length
  assert.equal((await fetch(`${base}/motor/health`)).status, 401)
  assert.equal((await fetch(`${base}/motor/health`, comLogin('token-invalido-aaaaaaaaaaaa'))).status, 401)
  assert.equal(recebidos.length, antes)
})

test('conta liberada pelo id também funciona', async () => {
  configurar({ usuarios: lerUsuarios(OUTRO) })
  assert.equal((await fetch(`${base}/acesso`, comLogin('token-de-outro-aaaaaaaaaa'))).status, 200)
  configurar({ usuarios: lerUsuarios('gabriel') })
})

test('conta fora da lista: 403 no acesso e no motor', async () => {
  const acesso = await fetch(`${base}/acesso`, comLogin('token-de-outro-aaaaaaaaaa'))
  assert.equal(acesso.status, 403)
  assert.deepEqual(await acesso.json(), { permitido: false })
  assert.equal((await fetch(`${base}/motor/health`, comLogin('token-de-outro-aaaaaaaaaa'))).status, 403)
})

test('origem estranha é recusada mesmo com login', async () => {
  const r = await fetch(`${base}/motor/health`, comLogin('token-do-dono-aaaaaaaaaaaa', { headers: { Origin: 'https://site-malicioso.com' } }))
  assert.equal(r.status, 403)
})

test('dono: acesso liberado e /health sem detalhes da máquina', async () => {
  const acesso = await fetch(`${base}/acesso`, comLogin('token-do-dono-aaaaaaaaaaaa', { headers: { Origin: 'https://xs-prospeccao.vercel.app' } }))
  assert.equal(acesso.status, 200)
  assert.equal(acesso.headers.get('access-control-allow-origin'), 'https://xs-prospeccao.vercel.app')
  const h = (await (await fetch(`${base}/motor/health`, comLogin('token-do-dono-aaaaaaaaaaaa'))).json()) as Record<string, any>
  assert.equal(h.ok, true)
  assert.equal(h.nuvem, true)
  assert.equal(h.computador, undefined)
  assert.equal(h.acordado, undefined)
  assert.equal(h.whatsapp.sessaoSalva, false)
})

test('status: erro técnico vira mensagem amigável; sessão salva aparece', async () => {
  fs.mkdirSync(path.join(sessao.dados, 'whatsapp_auth'), { recursive: true })
  fs.writeFileSync(path.join(sessao.dados, 'whatsapp_auth', 'creds.json'), '{}')
  const s = (await (await fetch(`${base}/motor/whatsapp/status`, comLogin('token-do-dono-aaaaaaaaaaaa'))).json()) as Record<string, any>
  assert.equal(s.sessaoSalva, true)
  assert.doesNotMatch(s.lastError, /127\.0\.0\.1|ECONN/)
  fs.rmSync(path.join(sessao.dados, 'whatsapp_auth'), { recursive: true, force: true })
})

test('repassa método, caminho e corpo; não repassa a origem nem o token', async () => {
  const r = await fetch(`${base}/motor/agenda`, comLogin('token-do-dono-aaaaaaaaaaaa', { method: 'POST', body: JSON.stringify({ texto: 'oi' }), headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5180' } }))
  assert.equal(r.status, 200)
  const ultimo = recebidos.at(-1)!
  assert.equal(ultimo.method, 'POST')
  assert.equal(ultimo.url, '/agenda')
  assert.equal(ultimo.body, '{"texto":"oi"}')
  assert.equal(ultimo.origin, undefined)
})

test('erros do motor (mensagens da XS) chegam como estão', async () => {
  const r = await fetch(`${base}/motor/whatsapp/teste`, comLogin('token-do-dono-aaaaaaaaaaaa', { method: 'POST', body: '{}' }))
  assert.equal(r.status, 400)
  assert.equal(((await r.json()) as { error: string }).error, 'Este número não tem WhatsApp ativo.')
})

test('caminhos fora da lista não chegam ao motor', async () => {
  const antes = recebidos.length
  for (const p of ['/motor/../etc/passwd', '/motor/admin', '/motor/whatsapp/qualquer', '/motor/health?x=1#']) {
    const r = await fetch(`${base}${p}`, comLogin('token-do-dono-aaaaaaaaaaaa'))
    assert.ok(r.status === 404 || r.status === 200, p)
  }
  assert.ok(recebidos.slice(antes).every((x) => x.url === '/health'))
})

test('motor fora do ar: 503 com a mensagem amigável', async () => {
  configurar({ sessoes: new Map([['principal', { ...sessao, motor: 'http://127.0.0.1:1' }]]) })
  const r = await fetch(`${base}/motor/health`, comLogin('token-do-dono-aaaaaaaaaaaa'))
  assert.equal(r.status, 503)
  assert.deepEqual(await r.json(), { error: MSG_INDISPONIVEL, offline: true })
  configurar({ sessoes: new Map([['principal', sessao]]) })
})

test('limparMensagem mantém textos normais (inclusive horários)', () => {
  assert.equal(limparMensagem('Enviado às 08:00 com 12 min de atraso.'), 'Enviado às 08:00 com 12 min de atraso.')
  assert.notEqual(limparMensagem('fetch failed: http://127.0.0.1:3077'), 'fetch failed: http://127.0.0.1:3077')
  assert.equal(limparMensagem(''), null)
  assert.deepEqual(ajustarResposta('/disparo/campanhas', [1, 2], sessao), [1, 2])
})

test('vigia: reconecta sessão salva caída; não mexe sem sessão; para QR sem ninguém olhando', async () => {
  waStatus = 'disconnected'
  assert.equal(await vigiar(sessao), null) // sem sessão salva: a pessoa desconectou, fica assim
  fs.mkdirSync(path.join(sessao.dados, 'whatsapp_auth'), { recursive: true })
  fs.writeFileSync(path.join(sessao.dados, 'whatsapp_auth', 'creds.json'), '{}')
  assert.equal(await vigiar(sessao), 'reconectar')
  assert.equal(recebidos.at(-1)!.url, '/whatsapp/conectar')
  assert.equal(await vigiar(sessao), null) // no máximo uma vez por minuto
  fs.rmSync(path.join(sessao.dados, 'whatsapp_auth'), { recursive: true, force: true })
  waStatus = 'qrcode'
  assert.equal(await vigiar(sessao, Date.now() + 10 * 60_000), 'parar-qr')
  assert.equal(recebidos.at(-1)!.url, '/whatsapp/desconectar')
})
