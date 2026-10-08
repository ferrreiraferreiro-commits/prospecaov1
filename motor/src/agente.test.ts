// Testes do Agente IA (sem WhatsApp e sem IA de verdade):  npm --prefix motor test
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-agente-test-${process.pid}`)
process.env.XS_AGENTE = '1'

test('regras: telefone, horário e próxima abertura', async () => {
  const { dentroDoHorario, phoneKey, proximaAbertura } = await import('./agente/regras.js')
  assert.equal(phoneKey('+55 (43) 99912-9525'), '4399129525')
  assert.equal(phoneKey('4399129525'), phoneKey('43999129525'))
  const terca10h = new Date('2026-10-06T10:00:00')
  assert.equal(dentroDoHorario(terca10h, 9, 18, [1, 2, 3, 4, 5, 6]), true)
  assert.equal(dentroDoHorario(new Date('2026-10-04T10:00:00'), 9, 18, [1, 2, 3, 4, 5, 6]), false) // domingo
  assert.equal(dentroDoHorario(new Date('2026-10-06T18:00:00'), 9, 18), false)
  // Mensagem de madrugada: responde quando abrir
  assert.equal(proximaAbertura(new Date('2026-10-06T03:00:00'), 8, 21).toISOString(), new Date('2026-10-06T08:00:00').toISOString())
  // Depois do fim: no dia seguinte
  assert.equal(proximaAbertura(new Date('2026-10-06T22:00:00'), 8, 21).toISOString(), new Date('2026-10-07T08:00:00').toISOString())
})

test('regras: a cota começa em 20 e sobe 5 por semana até o teto', async () => {
  const { cotaDoDia } = await import('./agente/regras.js')
  const p = { porDiaInicial: 20, porDiaMax: 50, aumentoSemana: 5 }
  assert.equal(cotaDoDia(p, null), 20)
  assert.equal(cotaDoDia(p, '2026-10-01', new Date('2026-10-06T10:00:00')), 20)
  assert.equal(cotaDoDia(p, '2026-10-01', new Date('2026-10-09T10:00:00')), 25)
  assert.equal(cotaDoDia(p, '2026-01-01', new Date('2026-10-09T10:00:00')), 50)
})

test('regras: ritmo das abordagens entre 4 e 90 minutos', async () => {
  const { intervaloAbordagemMs, tempoDigitandoMs } = await import('./agente/regras.js')
  const dezHoras = new Date('2026-10-06T10:00:00')
  const ms = intervaloAbordagemMs(dezHoras, 18, 16, 0.5) // 8 h para 16 empresas = 30 min
  assert.equal(ms, 30 * 60_000)
  assert.equal(intervaloAbordagemMs(dezHoras, 18, 500, 0), 4 * 60_000)
  assert.equal(intervaloAbordagemMs(dezHoras, 18, 1, 1), 90 * 60_000)
  assert.ok(tempoDigitandoMs('oi', 0.5) >= 2000)
  assert.ok(tempoDigitandoMs('x'.repeat(2000), 0.5) <= 14_000 * 1.15)
})

test('regras: pedido para parar', async () => {
  const { pediuParaParar } = await import('./agente/regras.js')
  for (const s of ['Para de me mandar mensagem', 'não me mande mais nada', 'me tira dessa lista', 'isso é spam', 'vou denunciar']) assert.equal(pediuParaParar(s), true, s)
  for (const s of ['para quando fica pronto?', 'não tenho site ainda', 'pode mandar o preço', 'para mim tá bom']) assert.equal(pediuParaParar(s), false, s)
})

test('regras: cidade que responde mais sai mais vezes', async () => {
  const { escolherAlvo } = await import('./agente/regras.js')
  const nicho = [{ nome: 'Pizzaria', tax: ['pizza_restaurant'], nomes: [] }]
  const alvos = [
    { id: 'a', uf: 'PR', cidade: 'Londrina', nichos: nicho, ativo: true },
    { id: 'b', uf: 'PR', cidade: 'Maringá', nichos: nicho, ativo: true },
    { id: 'c', uf: 'PR', cidade: 'Cambé', nichos: nicho, ativo: false },
  ]
  const lead = { de: 'lead' as const, id: '1', texto: 'oi', em: '' }
  const conversas = [
    ...Array.from({ length: 10 }, () => ({ origem: 'agente' as const, alvoId: 'a', mensagens: [lead] })),
    ...Array.from({ length: 10 }, () => ({ origem: 'agente' as const, alvoId: 'b', mensagens: [] })),
  ]
  let a = 0
  for (let i = 0; i < 100; i++) if (escolherAlvo(alvos, conversas, i / 100)?.id === 'a') a++
  assert.ok(a > 70, `Londrina saiu ${a} vezes`)
  assert.equal(escolherAlvo([], conversas), null)
})

test('regras: custo da chamada', async () => {
  const { custoUSD } = await import('./agente/regras.js')
  assert.equal(custoUSD('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 0 }), 2)
  assert.equal(custoUSD('claude-haiku-5-5', { input_tokens: 0, output_tokens: 1_000_000 }), 0.5)
  assert.equal(custoUSD('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }), 0.4)
})

test('instruções: oferta, limite de desconto, lições e honestidade entram no texto', async () => {
  const { instrucoes } = await import('./agente/ia.js')
  const { CONFIG_PADRAO } = await import('./agente/tipos.js')
  const cfg = { ...CONFIG_PADRAO, negocio: { ...CONFIG_PADRAO.negocio, seuNome: 'Gabriel', empresa: 'XS Sites', oferta: 'Site completo R$ 1.200', descontoMax: 15 } }
  const t = instrucoes(cfg, [
    { id: '1', tipo: 'conversa', texto: 'Nunca mande áudio', origem: 'voce', ativa: true, em: '' },
    { id: '2', tipo: 'conversa', texto: 'Lição desligada', origem: 'resultado', ativa: false, em: '' },
    { id: '3', tipo: 'busca', texto: 'Evite franquias', origem: 'voce', ativa: true, em: '' },
  ])
  assert.match(t, /assistente comercial de Gabriel, da XS Sites/)
  assert.match(t, /Site completo R\$ 1\.200/)
  assert.match(t, /no máximo 15%/)
  assert.match(t, /Nunca mande áudio/)
  assert.doesNotMatch(t, /Lição desligada/)
  assert.doesNotMatch(t, /Evite franquias/) // critério de busca não vai para a conversa
  assert.match(t, /diga a verdade/)
})

test('agente: configuração é limpa e não liga sem chave', async () => {
  const agente = await import('./agente/agente.js')
  const cfg = agente.salvarConfig({
    negocio: { seuNome: '  Gabriel  ', descontoMax: 500 } as never,
    avisos: { telefone: '(43) 99912-9525', relatorio: true },
    prospeccao: {
      alvos: [
        { id: 'x', uf: 'pr', cidade: 'Londrina', nichos: [{ nome: 'Pizzaria', tax: ['pizza_restaurant'], nomes: [] }], ativo: true },
        { id: 'y', uf: 'PR', cidade: '', nichos: [], ativo: true },
      ],
    } as never,
  })
  assert.equal(cfg.negocio.seuNome, 'Gabriel')
  assert.equal(cfg.negocio.descontoMax, 90)
  assert.equal(cfg.avisos.telefone, '5543999129525')
  assert.equal(cfg.prospeccao.alvos.length, 1)
  assert.equal(cfg.prospeccao.alvos[0].uf, 'PR')
  assert.throws(() => agente.salvarConfig({ ativo: true }), /chave da API/)
  assert.throws(() => agente.salvarConfig({ avisos: { telefone: '123', relatorio: true } }), /DDD/)
  assert.throws(() => agente.salvarConfig({ prospeccao: { inicio: 18, fim: 9 } as never }), /fim/)
})

test('agente: cliente responde, pede para parar, você assume pelo celular', async () => {
  const agente = await import('./agente/agente.js')
  const { db } = await import('./agente/estado.js')
  const base = {
    jid: null, nicho: 'Pizzaria', cidade: 'Londrina', uf: 'PR', endereco: '', site: '', instagram: '', alvoId: null, leadId: null, bruto: { name: 'X' },
    temperatura: 'frio' as const, resumo: '', followups: 1, pendente: false, responderEm: null, ultimaChave: null, avisadoQuente: false,
    criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), sinc: { mensagens: 0, estado: null, lead: false },
  }
  const msg = (texto: string) => ({ id: 'm1', de: 'agente' as const, texto, em: new Date().toISOString() })
  db.conversas.push(
    { ...base, id: 'c1', telefone: '5543999990001', empresa: 'Pizzaria A', origem: 'agente', estado: 'aguardando', mensagens: [msg('Boa tarde! Vi a Pizzaria A…')] },
    { ...base, id: 'c2', telefone: '5543999990002', empresa: 'Pizzaria B', origem: 'agente', estado: 'aguardando', mensagens: [msg('Boa tarde!')] },
    { ...base, id: 'c3', telefone: '5543999990003', empresa: 'Pizzaria C', origem: 'agente', estado: 'conversando', mensagens: [msg('Oi')] },
  )
  db.config.ativo = true
  const key = { remoteJid: 'x@s.whatsapp.net', id: 'k' }

  // 9º dígito diferente: é o mesmo número
  agente.receber('554399990001', 'Oi, quanto custa?', key)
  const c1 = db.conversas.find((c) => c.id === 'c1')!
  assert.equal(c1.estado, 'conversando')
  assert.equal(c1.pendente, true)
  assert.equal(c1.followups, 0)
  assert.equal(agente.estado().hoje.responderam, 1)

  agente.receber('5543999990002', 'para de me mandar mensagem', key)
  const c2 = db.conversas.find((c) => c.id === 'c2')!
  assert.equal(c2.estado, 'optout')
  assert.equal(c2.pendente, false)
  assert.ok(db.extra.descartados.includes('4399990002'))

  agente.saiuPeloCelular('5543999990003', 'Opa, aqui é o Gabriel', 'WA-123')
  const c3 = db.conversas.find((c) => c.id === 'c3')!
  assert.equal(c3.estado, 'humano')
  assert.equal(c3.mensagens.at(-1)!.de, 'voce')
  // Número que nunca conversou com o agente: ignorado
  agente.receber('5511988887777', 'oi', key)
  assert.equal(db.conversas.length, 3)

  // Devolver ao agente: nunca respondeu, então volta a esperar; a última é sua, então ele não responde sozinho
  agente.devolver('c3')
  assert.equal(c3.estado, 'aguardando')
  assert.equal(c3.pendente, false)
  // Quem já respondeu volta para a conversa, e a última mensagem do cliente ganha resposta
  agente.assumir('c1')
  agente.devolver('c1')
  assert.equal(c1.estado, 'conversando')
  assert.equal(c1.pendente, true)
  db.config.ativo = false
})

test('agente: sincronização com o CRM e lições', async () => {
  const agente = await import('./agente/agente.js')
  const pend = agente.pendentesSinc()
  const p1 = pend.find((p) => p.id === 'c1')!
  assert.ok(p1.bruto)
  assert.equal(p1.novas.length, 2)
  agente.marcarSinc([{ id: 'c1', leadId: 'lead-1', mensagens: 2, estado: 'conversando' }])
  assert.equal(agente.pendentesSinc().some((p) => p.id === 'c1'), false)
  assert.equal(agente.definirConhecidos(['43 99999-0001', '4399990001', 'x']).total, 1)

  const l = agente.novaLicao({ tipo: 'conversa', texto: 'Fale do Google Meu Negócio' })
  assert.equal(l.origem, 'voce')
  agente.editarLicao(l.id, { ativa: false })
  assert.equal(agente.listarLicoes().find((x) => x.id === l.id)!.ativa, false)
  agente.apagarLicao(l.id)
  assert.equal(agente.listarLicoes().some((x) => x.id === l.id), false)
  assert.throws(() => agente.novaLicao({ texto: '  ' }), /Escreva/)
})
