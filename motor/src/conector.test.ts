// Testes do conector da XS para o Claude (MCP), com um cliente MCP de verdade e um Supabase de mentira
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import express from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-conector-test-${process.pid}`)
process.env.XS_AGENTE = '1'

const BOA = 'xs_chave_boa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const chamadas: { acao: string; args: unknown; apikey: unknown }[] = []
let supabase: http.Server
let motor: http.Server
let url = ''

before(async () => {
  supabase = http.createServer(async (req, res) => {
    let b = ''
    for await (const c of req) b += c
    const { p_chave, p_acao, p_args } = JSON.parse(b)
    chamadas.push({ acao: p_acao, args: p_args, apikey: req.headers.apikey })
    res.setHeader('content-type', 'application/json')
    if (p_chave !== BOA) return res.writeHead(400).end(JSON.stringify({ code: '28000', message: 'Chave inválida.' }))
    if (p_acao === 'validar') return res.end(JSON.stringify({ ok: true }))
    if (p_acao === 'lead') return res.end(JSON.stringify({ empresa: 'Pizzaria X', endereco: 'Rua A, 1', instagram: '@pizzariax' }))
    res.end(JSON.stringify({ acao: p_acao, totalLeads: 57 }))
  })
  await new Promise<void>((r) => supabase.listen(0, '127.0.0.1', r))
  process.env.SUPABASE_URL = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`
  process.env.SUPABASE_ANON_KEY = 'anon-publica'

  const conector = await import('./agente/conector.js')
  const app = express()
  app.use(express.json({ limit: '8mb' }))
  app.post('/mcp', (req, res, next) => void conector.atender(req, res).catch(next))
  motor = app.listen(0, '127.0.0.1')
  await new Promise((r) => motor.once('listening', r))
  url = `http://127.0.0.1:${(motor.address() as AddressInfo).port}/mcp`
})
after(() => {
  supabase.close()
  motor.close()
})

async function conectar(chave: string) {
  const cliente = new Client({ name: 'teste', version: '1.0.0' })
  await cliente.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${chave}` } } }))
  return cliente
}

const textoDe = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text).join('')

test('conector: sem chave ou com chave errada não entra', async () => {
  const sem = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' })
  assert.equal(sem.status, 401)
  await assert.rejects(conectar('xs_chave_errada_aaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
})

test('conector: lista as ferramentas e lê o CRM e a XS com a chave do dono', async () => {
  const c = await conectar(BOA)
  const { tools } = await c.listTools()
  const nomes = tools.map((t) => t.name)
  for (const n of ['crm_resumo', 'crm_lead', 'crm_anotar', 'vendedor_painel', 'vendedor_mudar_treino', 'xico_prompt_mestre', 'site_modelos', 'site_salvar']) assert.ok(nomes.includes(n), n)
  assert.equal(tools.find((t) => t.name === 'crm_anotar')?.annotations?.readOnlyHint, false)
  assert.equal(tools.find((t) => t.name === 'crm_resumo')?.annotations?.readOnlyHint, true)

  assert.match(textoDe(await c.callTool({ name: 'crm_resumo', arguments: {} })), /"totalLeads": 57/)
  assert.match(textoDe(await c.callTool({ name: 'crm_lead', arguments: { lead: 'Pizzaria X' } })), /@pizzariax/)
  assert.deepEqual(chamadas.at(-1), { acao: 'lead', args: { lead: 'Pizzaria X' }, apikey: 'anon-publica' })
  assert.match(textoDe(await c.callTool({ name: 'site_modelos', arguments: {} })), /Cantagalo[\s\S]*ALT HUB/)
  assert.match(textoDe(await c.callTool({ name: 'xico_prompt_mestre', arguments: {} })), /# Contexto de trabalho/)

  // Salvar um prompt de site escrito no Claude: aparece na XS, e uma versão nova aponta para a anterior
  const salvo = JSON.parse(textoDe(await c.callTool({ name: 'site_salvar', arguments: { empresa: 'Pizzaria X', texto: '# Site da Pizzaria X\n'.padEnd(80, '.') } })))
  assert.equal(salvo.versao, 1)
  const v2 = JSON.parse(textoDe(await c.callTool({ name: 'site_salvar', arguments: { base: salvo.id, texto: '# Site da Pizzaria X (casual)\n'.padEnd(80, '.'), ajustes: 'mais casual' } })))
  assert.equal(v2.versao, 2)
  assert.match(textoDe(await c.callTool({ name: 'site_ler', arguments: { id: v2.id } })), /casual/)

  // Erro de ferramenta volta como erro legível, sem derrubar a conexão
  const ruim = await c.callTool({ name: 'site_ler', arguments: { id: 'nao-existe' } })
  assert.equal(ruim.isError, true)
  assert.match(textoDe(ruim), /não encontrado/i)
  await c.close()
})
