// Testes do gateway do WhatsApp na nuvem:  node --test whatsapp-cloud/gateway.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  MSG_INDISPONIVEL,
  ajustarResposta,
  configurar,
  contaPodeUsar,
  lerSessoes,
  lerUsuarios,
  limparMensagem,
  origemPermitida,
  server,
  usarVerificador,
  vigiar,
  type Conta,
  type Sessao,
} from './gateway.ts'

const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-gateway-'))
const DONO = '11111111-2222-3333-4444-555555555555'
const ANA = 'aaaaaaaa-0000-4000-8000-000000000001'
const BRUNO = 'bbbbbbbb-0000-4000-8000-000000000002'
const CARLA = 'cccccccc-0000-4000-8000-000000000003'
const VENCIDA = 'dddddddd-0000-4000-8000-000000000004'

const contas: Record<string, Conta> = {
  'token-dono-aaaaaaaaaaaaaaaa': { id: DONO, usuario: 'gabriel', podeUsar: true },
  'token-ana-aaaaaaaaaaaaaaaaa': { id: ANA, usuario: 'ana.web', podeUsar: true },
  'token-bruno-aaaaaaaaaaaaaaa': { id: BRUNO, usuario: 'bruno', podeUsar: true },
  'token-carla-aaaaaaaaaaaaaaa': { id: CARLA, usuario: 'carla', podeUsar: true },
  'token-vencida-aaaaaaaaaaaaa': { id: VENCIDA, usuario: 'vencida', podeUsar: false },
}

/** Motores de mentira: cada um guarda o que recebeu, como o de verdade */
type Recebido = { porta: number; method: string; url: string; body: string; origin?: string }
const recebidos: Recebido[] = []
let waStatus = 'disconnected'
const motores = new Map<number, http.Server>()

function abrirMotor(porta: number): Promise<void> {
  const m = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    recebidos.push({ porta, method: req.method!, url: req.url!, body: Buffer.concat(chunks).toString(), origin: req.headers.origin })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/health') return res.end(JSON.stringify({ ok: true, versao: '1.4.0', computador: 'vps-123', acordado: false, whatsapp: { status: waStatus, user: null } }))
    if (req.url === '/whatsapp/status') return res.end(JSON.stringify({ status: waStatus, qrCodeUrl: null, user: null, lastError: 'connect ECONNREFUSED 127.0.0.1:443' }))
    if (req.url === '/whatsapp/teste') return res.writeHead(400).end(JSON.stringify({ error: 'Este número não tem WhatsApp ativo.' }))
    res.end(JSON.stringify({ ok: true, porta }))
  })
  motores.set(porta, m)
  return new Promise((r) => m.listen(porta, '127.0.0.1', () => r()))
}

/** "systemd" de mentira: liga o motor na porta que o gateway escreveu em portas/<nome>.env */
const ligadosPeloControle: string[] = []
const desligadosPeloControle: string[] = []
const controle = {
  async ligar(nome: string) {
    ligadosPeloControle.push(nome)
    const porta = Number(/XS_PORT=(\d+)/.exec(fs.readFileSync(path.join(dados, 'portas', `${nome}.env`), 'utf8'))![1])
    await abrirMotor(porta)
  },
  async desligar(nome: string) {
    desligadosPeloControle.push(nome)
    const porta = Number(/XS_PORT=(\d+)/.exec(fs.readFileSync(path.join(dados, 'portas', `${nome}.env`), 'utf8'))![1])
    await new Promise((r) => motores.get(porta)?.close(r))
    motores.delete(porta)
  },
}

let base = ''
let principal: Sessao
let portaPrincipal = 0

async function portaLivre(): Promise<number> {
  const s = http.createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const p = (s.address() as AddressInfo).port
  await new Promise((r) => s.close(r))
  return p
}

before(async () => {
  portaPrincipal = await portaLivre()
  await abrirMotor(portaPrincipal)
  principal = { nome: 'principal', motor: `http://127.0.0.1:${portaPrincipal}`, dados: path.join(dados, 'principal'), fixa: true }
  configurar({ dados, sessoes: new Map([['principal', principal]]), usuarios: lerUsuarios('gabriel'), todos: true, max: 2, controle })
  usarVerificador(async (token) => contas[token] ?? null)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  server.close()
  for (const m of motores.values()) m.close()
})

const comLogin = (token: string, init: RequestInit = {}) => ({ ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
const pedir = (token: string, caminho: string, init: RequestInit = {}) => fetch(`${base}${caminho}`, comLogin(token, init))

test('configuração: sessões fixas e contas', () => {
  assert.deepEqual([...lerSessoes('principal:3077, ruim:abc, joao:3078').keys()], ['principal', 'joao'])
  const u = lerUsuarios(`${DONO}, ${ANA}:joao, Gabriel, x, nome com espaço`)
  assert.equal(u.get(DONO), 'principal')
  assert.equal(u.get(ANA), 'joao')
  assert.equal(u.get('gabriel'), 'principal')
  assert.equal(u.size, 3)
})

test('quem pode ganhar WhatsApp na nuvem: plano em dia e recurso do motor', () => {
  const agora = Date.parse('2026-10-05T12:00:00Z')
  const motor = ['motor']
  assert.equal(contaPodeUsar({ plano: 'vitalicio', recursos: motor }, agora), true)
  assert.equal(contaPodeUsar({ plano: 'vitalicio', recursos: [] }, agora), false)
  assert.equal(contaPodeUsar({ plano: 'teste', recursos: motor, teste_ate: '2026-10-06T00:00:00Z' }, agora), true)
  assert.equal(contaPodeUsar({ plano: 'teste', recursos: motor, teste_ate: '2026-10-05T11:00:00Z' }, agora), false)
  assert.equal(contaPodeUsar({ plano: 'ativo', recursos: motor, plano_ate: '2026-11-01T00:00:00Z' }, agora), true)
  assert.equal(contaPodeUsar({ plano: 'ativo', recursos: motor, plano_ate: '2026-10-01T00:00:00Z' }, agora), false)
  assert.equal(contaPodeUsar({ plano: 'ativo', recursos: motor, plano_ate: null }, agora), true)
  assert.equal(contaPodeUsar({ plano: 'cancelado', recursos: motor }, agora), false)
  assert.equal(contaPodeUsar(null, agora), false)
})

test('origem: só o site exato e localhost', () => {
  assert.ok(origemPermitida('https://xs-prospeccao.vercel.app'))
  assert.ok(origemPermitida('http://localhost:5180'))
  assert.ok(!origemPermitida('https://xs-prospeccao-falso.vercel.app'))
  assert.ok(!origemPermitida('https://localhost:5180'))
  assert.ok(!origemPermitida(undefined))
})

test('sem login ou com login errado: 401, e nenhum motor é chamado', async () => {
  const antes = recebidos.length
  assert.equal((await fetch(`${base}/motor/health`)).status, 401)
  assert.equal((await pedir('token-invalido-aaaaaaaaaaaa', '/motor/health')).status, 401)
  assert.equal(recebidos.length, antes)
})

test('origem estranha é recusada mesmo com login', async () => {
  assert.equal((await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/health', { headers: { Origin: 'https://site-malicioso.com' } })).status, 403)
})

test('dono: sessão fixa "principal"; /health sem detalhes da máquina', async () => {
  const acesso = await pedir('token-dono-aaaaaaaaaaaaaaaa', '/acesso', { headers: { Origin: 'https://xs-prospeccao.vercel.app' } })
  assert.equal(acesso.status, 200)
  assert.equal(acesso.headers.get('access-control-allow-origin'), 'https://xs-prospeccao.vercel.app')
  const h = (await (await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/health')).json()) as Record<string, any>
  assert.equal(recebidos.at(-1)!.porta, portaPrincipal)
  assert.equal(h.nuvem, true)
  assert.equal(h.computador, undefined)
  assert.equal(h.acordado, undefined)
  assert.equal(h.whatsapp.sessaoSalva, false)
})

test('cada conta tem o seu Motor: os pedidos da Ana nunca vão para o do Bruno nem para o do dono', async () => {
  assert.equal((await pedir('token-ana-aaaaaaaaaaaaaaaaa', '/acesso')).status, 200)
  const a = (await (await pedir('token-ana-aaaaaaaaaaaaaaaaa', '/motor/agenda', { method: 'POST', body: '{"texto":"da ana"}' })).json()) as { porta: number }
  const b = (await (await pedir('token-bruno-aaaaaaaaaaaaaaa', '/motor/agenda', { method: 'POST', body: '{"texto":"do bruno"}' })).json()) as { porta: number }
  assert.notEqual(a.porta, b.porta)
  assert.notEqual(a.porta, portaPrincipal)
  assert.notEqual(b.porta, portaPrincipal)
  assert.ok(recebidos.filter((r) => r.body.includes('da ana')).every((r) => r.porta === a.porta))
  assert.ok(recebidos.filter((r) => r.body.includes('do bruno')).every((r) => r.porta === b.porta))
  // A mesma conta volta para a mesma sessão (mesma pasta, mesmo WhatsApp)
  const a2 = (await (await pedir('token-ana-aaaaaaaaaaaaaaaaa', '/motor/agenda', { method: 'POST', body: '{}' })).json()) as { porta: number }
  assert.equal(a2.porta, a.porta)
  // Registro em disco, pastas separadas
  const reg = JSON.parse(fs.readFileSync(path.join(dados, 'sessoes.json'), 'utf8')) as Record<string, { nome: string }>
  assert.ok(fs.existsSync(path.join(dados, reg[ANA].nome)))
  assert.notEqual(reg[ANA].nome, reg[BRUNO].nome)
  assert.equal(ligadosPeloControle.length, 2)
})

test('limite de Motores: a terceira conta continua no Motor do computador (403)', async () => {
  assert.equal((await pedir('token-carla-aaaaaaaaaaaaaaa', '/acesso')).status, 403)
  assert.equal((await pedir('token-carla-aaaaaaaaaaaaaaa', '/motor/health')).status, 403)
})

test('plano vencido: não ganha WhatsApp na nuvem', async () => {
  assert.equal((await pedir('token-vencida-aaaaaaaaaaaaa', '/acesso')).status, 403)
})

test('repassa método, caminho e corpo; não repassa a origem nem o token', async () => {
  const r = await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/agenda', { method: 'POST', body: JSON.stringify({ texto: 'oi' }), headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5180' } })
  assert.equal(r.status, 200)
  const ultimo = recebidos.at(-1)!
  assert.equal(ultimo.method, 'POST')
  assert.equal(ultimo.url, '/agenda')
  assert.equal(ultimo.body, '{"texto":"oi"}')
  assert.equal(ultimo.origin, undefined)
})

test('status: erro técnico vira mensagem amigável; sessão salva aparece', async () => {
  fs.mkdirSync(path.join(principal.dados, 'whatsapp_auth'), { recursive: true })
  fs.writeFileSync(path.join(principal.dados, 'whatsapp_auth', 'creds.json'), '{}')
  const s = (await (await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/whatsapp/status')).json()) as Record<string, any>
  assert.equal(s.sessaoSalva, true)
  assert.doesNotMatch(s.lastError, /127\.0\.0\.1|ECONN/)
  fs.rmSync(path.join(principal.dados, 'whatsapp_auth'), { recursive: true, force: true })
})

test('erros do motor (mensagens da XS) chegam como estão', async () => {
  const r = await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/whatsapp/teste', { method: 'POST', body: '{}' })
  assert.equal(r.status, 400)
  assert.equal(((await r.json()) as { error: string }).error, 'Este número não tem WhatsApp ativo.')
})

test('caminhos fora da lista não chegam ao motor', async () => {
  const antes = recebidos.length
  for (const p of ['/motor/../etc/passwd', '/motor/admin', '/motor/whatsapp/qualquer']) {
    assert.equal((await pedir('token-dono-aaaaaaaaaaaaaaaa', p)).status, 404, p)
  }
  assert.equal(recebidos.length, antes)
})

test('vigia: Motor da conta sem WhatsApp e sem uso é desligado e volta no próximo acesso', async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(dados, 'sessoes.json'), 'utf8')) as Record<string, { nome: string; porta: number }>
  const ana: Sessao = { nome: reg[ANA].nome, motor: `http://127.0.0.1:${reg[ANA].porta}`, dados: path.join(dados, reg[ANA].nome), fixa: false }
  assert.equal(await vigiar(ana), null) // acabou de usar
  assert.equal(await vigiar(ana, Date.now() + 31 * 60_000), 'desligar')
  assert.deepEqual(desligadosPeloControle, [ana.nome])
  // Liberou vaga: a Carla agora entra
  assert.equal((await pedir('token-carla-aaaaaaaaaaaaaaa', '/acesso')).status, 200)
  assert.equal((await pedir('token-carla-aaaaaaaaaaaaaaa', '/motor/health')).status, 200)
  // A Ana volta quando houver vaga; o dono (fixa) nunca é desligado
  assert.equal(await vigiar(principal, Date.now() + 999 * 60_000), null)
})

test('vigia: reconecta sessão salva caída; não mexe sem sessão; para QR sem ninguém olhando', async () => {
  waStatus = 'disconnected'
  assert.equal(await vigiar(principal), null)
  fs.mkdirSync(path.join(principal.dados, 'whatsapp_auth'), { recursive: true })
  fs.writeFileSync(path.join(principal.dados, 'whatsapp_auth', 'creds.json'), '{}')
  assert.equal(await vigiar(principal), 'reconectar')
  assert.equal(recebidos.at(-1)!.url, '/whatsapp/conectar')
  assert.equal(await vigiar(principal), null) // no máximo uma vez por minuto
  fs.rmSync(path.join(principal.dados, 'whatsapp_auth'), { recursive: true, force: true })
  waStatus = 'qrcode'
  assert.equal(await vigiar(principal, Date.now() + 10 * 60_000), 'parar-qr')
  assert.equal(recebidos.at(-1)!.url, '/whatsapp/desconectar')
  waStatus = 'disconnected'
})

test('sem sessões automáticas (XS_CLOUD_TODOS desligado): só as fixas usam a nuvem', async () => {
  configurar({ todos: false })
  assert.equal((await pedir('token-bruno-aaaaaaaaaaaaaaa', '/acesso')).status, 403)
  assert.equal((await pedir('token-dono-aaaaaaaaaaaaaaaa', '/acesso')).status, 200)
  configurar({ todos: true })
})

test('motor fora do ar: 503 com a mensagem amigável', async () => {
  configurar({ sessoes: new Map([['principal', { ...principal, motor: 'http://127.0.0.1:1' }]]) })
  const r = await pedir('token-dono-aaaaaaaaaaaaaaaa', '/motor/health')
  assert.equal(r.status, 503)
  assert.deepEqual(await r.json(), { error: MSG_INDISPONIVEL, offline: true })
  configurar({ sessoes: new Map([['principal', principal]]) })
})

test('limparMensagem mantém textos normais (inclusive horários)', () => {
  assert.equal(limparMensagem('Enviado às 08:00 com 12 min de atraso.'), 'Enviado às 08:00 com 12 min de atraso.')
  assert.notEqual(limparMensagem('fetch failed: http://127.0.0.1:3077'), 'fetch failed: http://127.0.0.1:3077')
  assert.equal(limparMensagem(''), null)
  assert.deepEqual(ajustarResposta('/disparo/campanhas', [1, 2], principal), [1, 2])
})
