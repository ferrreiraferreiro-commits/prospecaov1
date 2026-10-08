// Testes do Xico (o assistente do dono) com uma IA de mentira:  npm --prefix motor test
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-xico-test-${process.pid}`)
process.env.XS_AGENTE = '1'

/** IA de mentira: responde na ordem da fila e guarda o que recebeu. */
const recebidos: any[] = []
const fila: unknown[][] = []
let servidor: http.Server

before(async () => {
  servidor = http.createServer(async (req, res) => {
    let b = ''
    for await (const c of req) b += c
    res.setHeader('content-type', 'application/json')
    if (req.method === 'GET') return res.end(JSON.stringify({ id: 'claude-opus-5-5', type: 'model', display_name: 'Opus', created_at: '2026-01-01T00:00:00Z' }))
    const body = JSON.parse(b)
    recebidos.push({ headers: req.headers, body })
    const content = fila.shift() ?? [{ type: 'text', text: 'ok' }]
    if (body.stream) {
      // Resposta em partes (SSE), só texto
      const texto = content.map((c: any) => c.text ?? '').join('')
      const ev = (tipo: string, dados: unknown) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`
      res.setHeader('content-type', 'text/event-stream')
      return res.end(
        ev('message_start', { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } }) +
          ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
          ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: texto } }) +
          ev('content_block_stop', { type: 'content_block_stop', index: 0 }) +
          ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } }) +
          ev('message_stop', { type: 'message_stop' }),
      )
    }
    res.end(
      JSON.stringify({
        id: 'msg',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_reason: content.some((c: any) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        content,
        usage: { input_tokens: 1000, output_tokens: 100 },
      }),
    )
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})
after(() => servidor.close())

async function esperarLivre(xico: typeof import('./agente/xico.js')) {
  for (let i = 0; i < 100 && xico.ver().estado === 'pensando'; i++) await new Promise((r) => setTimeout(r, 20))
  return xico.ver()
}

test('ferramentas: nomes únicos, descrição e schema de objeto, em ordem fixa', async () => {
  const { _ferramentas } = await import('./agente/xico.js')
  const nomes = _ferramentas.map((t) => t.name)
  assert.equal(new Set(nomes).size, nomes.length)
  assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b)))
  for (const t of _ferramentas) {
    assert.ok(t.description && t.description.length > 10, t.name)
    assert.equal((t.input_schema as { type: string }).type, 'object', t.name)
    assert.match(t.name, /^[a-z_]{3,64}$/)
  }
})

test('mudanças pequenas valem na hora; preço e ligar viram proposta que você confirma', async () => {
  const agente = await import('./agente/agente.js')
  const xico = await import('./agente/xico.js')
  agente.salvarConfig({ negocio: { ...agente.lerConfig().negocio, oferta: 'Site R$ 900', seuNome: 'Gabriel' } })

  assert.match(await xico._executar('mudar_treino', { campo: 'estilo', valor: 'Informal, sem emoji' }), /atualizado/)
  assert.equal(agente.lerConfig().negocio.estilo, 'Informal, sem emoji')

  assert.match(await xico._executar('mudar_treino', { campo: 'oferta', valor: 'Site R$ 1.100' }), /Proposta criada/)
  assert.equal(agente.lerConfig().negocio.oferta, 'Site R$ 900')
  // Enquanto a proposta espera, outra mudança pequena não pode ser desfeita ao confirmar
  await xico._executar('mudar_treino', { campo: 'regras', valor: 'Nunca prometa 1º lugar no Google' })
  const [p] = xico.ver().propostas
  xico.decidir(p.id, true)
  assert.equal(agente.lerConfig().negocio.oferta, 'Site R$ 1.100')
  assert.equal(agente.lerConfig().negocio.regras, 'Nunca prometa 1º lugar no Google')
  assert.equal(agente.lerConfig().negocio.estilo, 'Informal, sem emoji')

  // Desligar vale na hora; ligar a prospecção espera confirmação
  assert.match(await xico._executar('mudar_operacao', { acao: 'ligar_prospeccao' }), /Proposta/)
  assert.equal(agente.lerConfig().prospeccao.ativa, false)
  const lp = xico.ver().propostas.find((x) => x.titulo === 'Ligar a prospecção')!
  xico.decidir(lp.id, false)
  assert.equal(agente.lerConfig().prospeccao.ativa, false)
  assert.equal(xico.ver().propostas.length, 0)
})

test('cidades: exige nichos do catálogo; ritmo vira proposta só com o que muda', async () => {
  const agente = await import('./agente/agente.js')
  const xico = await import('./agente/xico.js')
  await assert.rejects(xico._executar('mudar_cidades', { adicionar: [{ uf: 'PR', cidade: 'Londrina', nichos: [{ nome: 'Pizzaria', tax: [], nomes: [] }] }] }), /tipos_de_negocio/)
  await xico._executar('mudar_cidades', { adicionar: [{ uf: 'pr', cidade: 'Londrina', nichos: [{ nome: 'Pizzaria', tax: ['pizza_restaurant'], nomes: ['pizzaria'] }] }] })
  await xico._executar('mudar_ritmo', { porDiaInicial: 15 })
  for (const p of xico.ver().propostas) xico.decidir(p.id, true)
  const pr = agente.lerConfig().prospeccao
  assert.equal(pr.alvos.length, 1)
  assert.equal(pr.alvos[0].uf, 'PR')
  assert.equal(pr.porDiaInicial, 15)
  assert.equal(pr.porDiaMax, 50)
})

test('memória: lembrar, apagar (e ele fica sabendo que você apagou)', async () => {
  const xico = await import('./agente/xico.js')
  await xico._executar('lembrar', { texto: 'Prefere fechar venda por ligação' })
  const m = xico.ver().memoria.find((x) => x.texto.includes('ligação'))!
  xico.apagarLembranca(m.id)
  assert.equal(xico.ver().memoria.length, 0)
})

test('conversa: o Xico pede o CRM ao app, recebe e responde; o histórico só cresce', async () => {
  const agente = await import('./agente/agente.js')
  const xico = await import('./agente/xico.js')
  await agente.trocarChave('sk-ant-teste-aaaaaaaaaaaaaaaaaaaaaaaa')
  fila.push(
    [
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'text', text: 'Deixa eu ver o CRM.' },
      { type: 'tool_use', id: 'tu_1', name: 'crm_resumo', input: {} },
      { type: 'tool_use', id: 'tu_2', name: 'ver_memoria', input: {} },
    ],
    [{ type: 'text', text: 'Você tem 3 retornos atrasados. Quer que eu liste?' }],
  )
  await xico.mensagem('como tá meu dia?')
  let v = await esperarLivre(xico)
  assert.equal(v.estado, 'esperando_app')
  assert.deepEqual(
    v.chamadasApp.map((c) => c.name),
    ['crm_resumo'],
  )
  v = xico.responderApp([{ tool_use_id: 'tu_1', content: '{"retornosAtrasados":3}' }])
  v = await esperarLivre(xico)
  assert.equal(v.estado, 'livre')
  assert.deepEqual(
    v.mensagens.filter((m) => m.de !== 'nota').map((m) => m.texto),
    ['como tá meu dia?', 'Deixa eu ver o CRM.', 'Você tem 3 retornos atrasados. Quer que eu liste?'],
  )
  assert.deepEqual(v.mensagens.at(-1)!.acoes, ['Olhou o CRM', 'Olhou a memória'])

  const [primeira, segunda] = recebidos.slice(-2)
  // Mesmas instruções e ferramentas nas duas chamadas; a segunda começa exatamente com a primeira
  assert.deepEqual(primeira.body.system, segunda.body.system)
  assert.deepEqual(primeira.body.tools, segunda.body.tools)
  assert.deepEqual(segunda.body.messages.slice(0, primeira.body.messages.length), primeira.body.messages)
  // O raciocínio volta igual, e os dois resultados vão juntos numa mensagem só
  assert.deepEqual(segunda.body.messages.at(-2).content[0], { type: 'thinking', thinking: '', signature: 'sig-1' })
  assert.deepEqual(
    segunda.body.messages.at(-1).content.map((c: any) => c.tool_use_id),
    ['tu_2', 'tu_1'],
  )
  assert.equal(segunda.body.thinking.block_binding.prefix_mismatch_behavior, 'drop_block')
  assert.match(String(segunda.headers['anthropic-beta']), /thinking-binding-controls-2026-08-01/)
  assert.match(primeira.body.messages[0].content[0].text, /Nome do dono: Gabriel/)

  // Próxima mensagem: entra depois de tudo, sem mexer no que já foi
  fila.push([{ type: 'text', text: 'Beleza.' }])
  await xico.mensagem('lista sim')
  await esperarLivre(xico)
  const terceira = recebidos.at(-1)
  assert.deepEqual(terceira.body.messages.slice(0, segunda.body.messages.length + 1).slice(0, -1), segunda.body.messages)
  assert.equal(terceira.body.messages.at(-1).role, 'user')
  assert.equal(terceira.body.messages.at(-1).content.at(-1).text, 'lista sim')
})

test('teste de abordagens: vira proposta, cria o teste e conta cada abordagem', async () => {
  const agente = await import('./agente/agente.js')
  const xico = await import('./agente/xico.js')
  const { db } = await import('./agente/estado.js')
  const nicho = { nome: 'Restaurante', tax: ['restaurant'], nomes: ['restaurante'] }
  await assert.rejects(xico._executar('criar_teste', { uf: 'PR', cidade: 'Londrina', nichos: [nicho], variantes: [{ nome: 'A', angulo: 'iFood' }] }), /2 abordagens/)
  assert.match(
    await xico._executar('criar_teste', { nome: 'Restaurantes', uf: 'PR', cidade: 'Londrina', nichos: [nicho], porVariante: 10, variantes: [{ nome: 'A', angulo: 'Fala da taxa do iFood' }, { nome: 'B', angulo: 'Mostra um site de exemplo' }] }),
    /Proposta criada/,
  )
  assert.equal(agente.listarTestes().length, 0)
  const p = xico.ver().propostas.find((x) => x.titulo.startsWith('Teste'))!
  assert.match(p.detalhe, /10 empresas por abordagem/)
  xico.decidir(p.id, true)
  const [t] = agente.listarTestes()
  assert.equal(t.estado, 'rodando')
  assert.equal(t.meta, 20)
  assert.equal(agente.lerConfig().prospeccao.ativa, true) // a proposta ligou a prospecção

  // Simula conversas do teste: A com 2 (1 respondeu, quente), B com 1
  const msg = (de: 'lead' | 'agente') => ({ id: de, de, texto: 'x', em: new Date().toISOString() })
  const base = { telefone: '5543999990100', jid: null, origem: 'agente' as const, empresa: 'R', nicho: 'Restaurante', cidade: 'Londrina', uf: 'PR', endereco: '', site: '', instagram: '', alvoId: null, leadId: null, bruto: null, temperatura: 'frio' as const, resumo: '', followups: 0, pendente: false, responderEm: null, ultimaChave: null, avisadoQuente: false, criadaEm: '', atualizadaEm: '', sinc: { mensagens: 0, estado: null, lead: true } }
  const [a, b] = t.variantes
  db.conversas.push(
    { ...base, id: 't1', testeId: t.id, variante: a.id, estado: 'quente', mensagens: [msg('agente'), msg('lead')] },
    { ...base, id: 't2', testeId: t.id, variante: a.id, estado: 'aguardando', mensagens: [msg('agente')] },
    { ...base, id: 't3', testeId: t.id, variante: b.id, estado: 'aguardando', mensagens: [msg('agente')] },
  )
  const [r] = agente.listarTestes()
  assert.equal(r.abordados, 3)
  const va = r.variantes.find((v) => v.id === a.id)!
  assert.equal(va.abordados, 2)
  assert.equal(va.responderam, 1)
  assert.equal(va.quentes, 1)
  assert.equal(va.taxaResposta, 50)
  assert.ok(agente.numerosPorRamo().some((x) => x.ramo === 'Restaurante' && x.abordados >= 3))

  // Adotar a vencedora vira lição; encerrar guarda a conclusão
  assert.match(await xico._executar('adotar_abordagem', { teste: t.id, variante: a.id }), /Adotado/)
  assert.ok(agente.listarLicoes().some((l) => l.texto.includes('Fala da taxa do iFood')))
  await xico._executar('mudar_teste', { id: t.id, estado: 'encerrado', conclusao: 'iFood conversa mais' })
  assert.equal(agente.listarTestes()[0].estado, 'encerrado')

  // O prompt para o Claude junta treino, lições, números e testes
  const pc = xico.promptParaClaude()
  for (const trecho of ['# Contexto de trabalho: Gabriel', 'Site R$ 1.100', 'Fala da taxa do iFood', 'Restaurante:', 'iFood conversa mais']) assert.ok(pc.includes(trecho), trecho)
})

test('prompt de site: segue os exemplos, guarda versões e ajusta', async () => {
  const xico = await import('./agente/xico.js')
  fila.push([{ type: 'text', text: '# Site da Pizzaria X\nQuero que você desenvolva…' }], [{ type: 'text', text: '# Site da Pizzaria X (casual)\nQuero que você desenvolva…' }])
  const r1 = await xico._executar('prompt_de_site', { empresa: 'Pizzaria X', ramo: 'Pizzaria', cidade: 'Londrina', uf: 'pr', estilo: 'moderno', demonstracao: true })
  assert.match(r1, /versão 1/)
  const pedido1 = recebidos.at(-1).body
  assert.match(pedido1.system[0].text, /EXEMPLO 1: Restaurante\/bar com cardápio/)
  assert.match(pedido1.system[0].text, /EXEMPLO 2: Academia/)
  assert.match(pedido1.messages[0].content, /Estilo desejado: moderno/)
  assert.match(pedido1.messages[0].content, /Demonstração: sim/)
  const [p1] = xico.ver().prompts
  const r2 = await xico._executar('prompt_de_site', { empresa: '', base: p1.id, estilo: 'casual', ajustes: 'Mais casual, cores verde e preto' })
  assert.match(r2, /versão 2/)
  const pedido2 = recebidos.at(-1).body.messages[0].content
  assert.match(pedido2, /Este é o prompt atual/)
  assert.match(pedido2, /Mais casual, cores verde e preto/)
  assert.match(pedido2, /Empresa: Pizzaria X/) // o nome continua da versão anterior
  assert.match(pedido2, /Demonstração: sim/)
  const v2 = xico.verPrompt(xico.ver().prompts[0].id)
  assert.equal(v2.versao, 2)
  assert.equal(v2.origem, p1.id)
  assert.match(v2.texto, /casual/)
})

test('conversa: não aceita mensagem nova enquanto responde nem resultados fora de hora', async () => {
  const xico = await import('./agente/xico.js')
  assert.throws(() => xico.responderApp([]), /não está esperando/)
  fila.push([{ type: 'tool_use', id: 'tu_9', name: 'crm_clientes', input: {} }])
  await xico.mensagem('meus clientes?')
  await esperarLivre(xico)
  await assert.rejects(xico.mensagem('oi'), /ainda está respondendo/)
  fila.push([{ type: 'text', text: 'Você tem 2 clientes.' }])
  xico.responderApp([{ tool_use_id: 'tu_9', content: '[]' }])
  assert.equal((await esperarLivre(xico)).estado, 'livre')
})
