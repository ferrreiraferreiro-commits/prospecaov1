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
const buscaPedidos: { corpo: { textQuery: string }; chave: unknown }[] = []
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
    if (p_acao === 'importar_leads') return res.end(JSON.stringify({ ok: true, salvos: p_args.leads.length, jaExistiam: 0, ids: p_args.leads.map((_: unknown, i: number) => `id-${i}`) }))
    if (p_acao === 'leads_ids' || (p_acao === 'leads' && p_args.busca === 'academia'))
      return res.end(JSON.stringify({ leads: [{ id: 'id-0', empresa: 'Academia Força', telefone: '(11) 98765-4321' }, { id: 'id-1', empresa: 'Sem Fone', telefone: null }] }))
    if (p_acao === 'mudar_status') return res.end(JSON.stringify({ ok: true, lead: p_args.lead, status: p_args.status }))
    res.end(JSON.stringify({ acao: p_acao, totalLeads: 57 }))
  })
  await new Promise<void>((r) => supabase.listen(0, '127.0.0.1', r))
  process.env.SUPABASE_URL = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`
  process.env.SUPABASE_ANON_KEY = 'anon-publica'

  // Google Maps e mapa de mentira (a busca de verdade usa a chave do dono)
  const fetchReal = globalThis.fetch
  const cidade = [{ longText: 'Suzano', types: ['administrative_area_level_2'] }, { shortText: 'SP', types: ['administrative_area_level_1'] }]
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const u = String(entrada)
    if (u.startsWith('https://nominatim.openstreetmap.org/')) return new Response(JSON.stringify([{ boundingbox: ['-23.6', '-23.4', '-46.4', '-46.2'] }]))
    if (u.startsWith('https://places.googleapis.com/')) {
      buscaPedidos.push({ corpo: JSON.parse(String(init?.body)), chave: (init?.headers as Record<string, string>)['X-Goog-Api-Key'] })
      return new Response(
        JSON.stringify({
          places: [
            { id: 'p1', displayName: { text: 'Academia Força' }, nationalPhoneNumber: '(11) 98765-4321', websiteUri: 'https://instagram.com/forca', formattedAddress: 'Rua B, 2', addressComponents: cidade },
            { id: 'p2', displayName: { text: 'Fixo Sem Celular' }, nationalPhoneNumber: '(11) 3333-4444', formattedAddress: 'Rua C, 3', addressComponents: cidade },
          ],
        }),
      )
    }
    return fetchReal(entrada, init)
  }) as typeof fetch

  const conector = await import('./agente/conector.js')
  ;(await import('./agente/agente.js')).definirGoogle({ chave: 'AIzaChaveDeTesteAaaaaaaaaaaaaaaaaaaaaaaaaa', restante: 900 })
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

test('conector: busca empresas, salva no CRM, muda status, monta disparo e liga/desliga o vendedor', async () => {
  const c = await conectar(BOA)
  const nomes = (await c.listTools()).tools.map((t) => t.name)
  for (const n of ['leads_buscar', 'leads_salvar', 'crm_mudar_status', 'disparo_criar', 'disparo_iniciar', 'disparo_pausar', 'vendedor_ligar', 'vendedor_desligar']) assert.ok(nomes.includes(n), n)

  // tipo de negócio desconhecido volta erro legível
  const ruim = await c.callTool({ name: 'leads_buscar', arguments: { cidade: 'Suzano', uf: 'SP', tipos: ['nave espacial'] } })
  assert.equal(ruim.isError, true)
  assert.match(textoDe(ruim), /leads_tipos/)

  // busca: manda cidade, UF, categorias do catálogo e "sem site"; só fica quem tem celular
  const achou = JSON.parse(textoDe(await c.callTool({ name: 'leads_buscar', arguments: { cidade: 'Suzano', uf: 'sp', tipos: ['academia'], quantidade: 10 } })))
  const pedido = buscaPedidos.at(-1)!
  assert.equal(pedido.chave, 'AIzaChaveDeTesteAaaaaaaaaaaaaaaaaaaaaaaaaa')
  assert.match(pedido.corpo.textQuery, /academia em Suzano, SP/i)
  assert.equal(achou.total, 1)
  assert.equal(achou.empresas[0].empresa, 'Academia Força')

  // salvar no CRM pelo id da busca, só a escolhida pelo número
  const salvo = JSON.parse(textoDe(await c.callTool({ name: 'leads_salvar', arguments: { busca: achou.busca, numeros: [1] } })))
  assert.equal(salvo.salvos, 1)
  assert.equal((chamadas.at(-1)!.args as { leads: { empresa: string }[] }).leads[0].empresa, 'Academia Força')

  // mudar status com valor fora da lista é recusado antes de ir ao banco
  assert.equal((await c.callTool({ name: 'crm_mudar_status', arguments: { lead: 'X', status: 'inventado' } })).isError, true)
  assert.match(textoDe(await c.callTool({ name: 'crm_mudar_status', arguments: { lead: 'Academia Força', status: 'follow_up' } })), /follow_up/)

  // disparo em rascunho, do jeito do dono: cumprimento, espera até responder, mensagem com {empresa}
  const disparo = JSON.parse(textoDe(await c.callTool({ name: 'disparo_criar', arguments: { nome: 'Academias Suzano', busca: 'academia', mensagem: 'Vi no Google Maps que a {empresa} não tem site…' } })))
  assert.equal(disparo.status, 'rascunho')
  assert.equal(disparo.total ?? disparo.destinatarios ?? 1, 1)
  const detalhe = JSON.parse(textoDe(await c.callTool({ name: 'disparo_ver', arguments: { id: disparo.id } })))
  assert.match(JSON.stringify(detalhe), /Academias Suzano/)

  // iniciar sem WhatsApp conectado: erro claro, nada enviado
  const iniciar = await c.callTool({ name: 'disparo_iniciar', arguments: { id: disparo.id } })
  assert.equal(iniciar.isError, true)
  assert.match(textoDe(iniciar), /WhatsApp/)

  // ligar o vendedor sem chave da API: erro claro; desligar funciona
  assert.equal((await c.callTool({ name: 'vendedor_ligar', arguments: {} })).isError, true)
  assert.match(textoDe(await c.callTool({ name: 'vendedor_desligar', arguments: {} })), /desligado/)
  await c.close()
})
