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

test('regras: resposta automática, hora de pico e saúde do número', async () => {
  const { pareceAutomatica, boaHoraPara, saudeDoNumero, precisaFrear } = await import('./agente/regras.js')
  for (const s of [
    'Olá! Obrigado por entrar em contato com a Pizzaria Bella. Em breve retornaremos.',
    'Esta é uma mensagem automática.',
    'Nosso horário de atendimento é de terça a domingo, das 18h às 23h.',
    'Digite 1 para fazer pedido, 2 para falar com atendente',
  ])
    assert.equal(pareceAutomatica(s, 5), true, s)
  // Saudação de robô só conta se chegar quase na hora
  assert.equal(pareceAutomatica('Seja bem-vindo! Como podemos ajudar?', 4), true)
  assert.equal(pareceAutomatica('Seja bem-vindo! Como podemos ajudar?', 300), false)
  for (const s of ['Oi, quanto custa?', 'Já tenho site', 'quem é?']) assert.equal(pareceAutomatica(s, 3), false, s)
  // Muito tempo depois: é gente
  assert.equal(pareceAutomatica('Obrigado pelo contato, vou pensar', 3600), false)

  assert.equal(boaHoraPara('Pizzaria', new Date('2026-10-06T12:30:00')), false)
  assert.equal(boaHoraPara('Restaurante', new Date('2026-10-06T19:00:00')), false)
  assert.equal(boaHoraPara('Restaurante', new Date('2026-10-06T15:00:00')), true)
  assert.equal(boaHoraPara('Barbearia', new Date('2026-10-06T12:30:00')), true)

  assert.equal(saudeDoNumero([{ abordados: 100, optouts: 3 }]).ruim, false)
  assert.equal(saudeDoNumero([{ abordados: 60, optouts: 5 }]).ruim, true)
  assert.equal(saudeDoNumero([{ abordados: 10, optouts: 2 }]).ruim, false) // poucos dados
  assert.equal(precisaFrear({ abordados: 20, optouts: 2 }), false)
  assert.equal(precisaFrear({ abordados: 20, optouts: 3 }), true)
  assert.equal(precisaFrear({ abordados: 50, optouts: 3 }), false)
})

test('regras: análise do teste de abordagens', async () => {
  const { analisarTeste } = await import('./agente/regras.js')
  const v = (id: string, abordados: number, responderam: number) => ({ id, nome: id.toUpperCase(), abordados, responderam, quentes: 0, vendas: 0 })
  assert.equal(analisarTeste([v('a', 5, 3), v('b', 15, 1)]).confianca, 'poucos_dados')
  const clara = analisarTeste([v('a', 30, 12), v('b', 30, 2)])
  assert.equal(clara.confianca, 'alta')
  assert.equal(clara.lider, 'a')
  const empate = analisarTeste([v('a', 15, 4), v('b', 15, 3)])
  assert.equal(empate.confianca, 'baixa')
  assert.equal(empate.lider, null)
})

test('agente: resposta automática não conta como resposta e não gasta IA', async () => {
  const agente = await import('./agente/agente.js')
  const { db } = await import('./agente/estado.js')
  const agora = new Date().toISOString()
  db.conversas.push({
    id: 'auto1', telefone: '5543999990009', empresa: 'Bar do Zé', origem: 'agente', estado: 'aguardando',
    jid: null, nicho: 'Bar', cidade: 'Londrina', uf: 'PR', endereco: '', site: '', instagram: '', alvoId: null, leadId: null, bruto: { neighborhood: 'Centro', rating: 4.7, reviewsCount: 120 },
    temperatura: 'frio', resumo: '', followups: 1, pendente: false, responderEm: null, ultimaChave: null, avisadoQuente: false,
    criadaEm: agora, atualizadaEm: agora, sinc: { mensagens: 0, estado: null, lead: false },
    mensagens: [{ id: 'm1', de: 'agente', texto: 'Boa tarde!', em: agora }],
  })
  db.config.ativo = true
  const antes = agente.estado().hoje.responderam
  agente.receber('5543999990009', 'Olá! Obrigado pelo contato. Em breve retornaremos.', { remoteJid: 'x@s.whatsapp.net', id: 'k2' })
  const c = db.conversas.find((x) => x.id === 'auto1')!
  assert.equal(c.estado, 'aguardando')
  assert.equal(c.pendente, false)
  assert.equal(c.followups, 1)
  assert.equal(c.mensagens.at(-1)!.auto, true)
  assert.equal(agente.estado().hoje.responderam, antes)
  // Minutos depois a pessoa responde de verdade
  c.mensagens.at(-1)!.em = new Date(Date.now() - 5 * 60_000).toISOString()
  agente.receber('5543999990009', 'Oi, é sobre o quê?', { remoteJid: 'x@s.whatsapp.net', id: 'k3' })
  assert.equal(c.estado, 'conversando')
  assert.equal(c.pendente, true)
  assert.equal(agente.estado().hoje.responderam, antes + 1)
  // Os detalhes da busca vão para a IA
  assert.match(agente.detalhesDoBruto(c.bruto), /Bairro: Centro[\s\S]*4,7 \(120 avaliações\)/)
  db.config.ativo = false
})

test('regras: cumprimento do primeiro passo e recusa clara', async () => {
  const { cumprimento, recusou } = await import('./agente/regras.js')
  const tarde = new Date('2026-10-06T15:00:00')
  const frases = new Set(Array.from({ length: 20 }, (_, i) => cumprimento('Pizzaria Sol', tarde, i / 20)))
  assert.ok(frases.size >= 5, 'varia a frase')
  for (const f of frases) assert.match(f, /boa tarde/i)
  assert.ok([...frases].some((f) => f.includes('Pizzaria Sol')))
  // Nome comprido não entra no cumprimento
  assert.ok(Array.from({ length: 20 }, (_, i) => cumprimento('Restaurante e Pizzaria Sabor da Terra Ltda', tarde, i / 20)).every((f) => !f.includes('Ltda')))
  for (const s of ['Não tenho interesse', 'nao quero, obrigado', 'Já temos site', 'sem interesse']) assert.equal(recusou(s), true, s)
  for (const s of ['Boa tarde! Quem é?', 'Oi, tudo bem', 'quero saber o preço', 'não tenho site ainda']) assert.equal(recusou(s), false, s)
})

test('agente: cumprimento primeiro, apresentação depois da resposta automática', async () => {
  const agente = await import('./agente/agente.js')
  const { db } = await import('./agente/estado.js')
  const agora = new Date().toISOString()
  db.conversas.push({
    id: 'dois1', telefone: '5543999990077', empresa: 'Pizzaria Sol', origem: 'agente', estado: 'aguardando', apresentar: true,
    jid: null, nicho: 'Pizzaria', cidade: 'Londrina', uf: 'PR', endereco: '', site: '', instagram: '', alvoId: null, leadId: null, bruto: null,
    temperatura: 'frio', resumo: '', followups: 0, pendente: false, responderEm: null, ultimaChave: null, avisadoQuente: false,
    criadaEm: agora, atualizadaEm: agora, sinc: { mensagens: 0, estado: null, lead: false },
    mensagens: [{ id: 'm1', de: 'agente', texto: 'Oi, boa tarde! Tudo bem?', em: agora }],
  })
  db.config.ativo = true
  const antes = agente.estado().hoje.responderam
  const key = { remoteJid: 'x@s.whatsapp.net', id: 'k9' }
  agente.receber('5543999990077', 'Olá! Obrigado por entrar em contato com a Pizzaria Sol.', key)
  // A segunda mensagem automática não tem frase de robô, mas chegou logo depois
  agente.receber('5543999990077', 'Funcionamos de terça a domingo, das 18h às 23h. Peça pelo link abaixo!', key)
  const c = db.conversas.find((x) => x.id === 'dois1')!
  assert.deepEqual(c.mensagens.slice(1).map((m) => m.auto), [true, true])
  assert.equal(c.estado, 'aguardando')
  assert.equal(c.pendente, true, 'a apresentação vai sair')
  assert.equal(agente.estado().hoje.responderam, antes, 'resposta automática não conta')
  // Com o padrão ligado, a configuração mantém o cumprimento primeiro
  assert.equal(agente.lerConfig().prospeccao.cumprimentarPrimeiro, true)
  db.config.ativo = false
})
