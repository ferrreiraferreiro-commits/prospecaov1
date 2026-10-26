// Testes do Conferente, da busca do Google e da tela Conversas (sem WhatsApp e sem IA de verdade)
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-conferente-test-${process.pid}`)
process.env.XS_AGENTE = '1'

const terca15h = new Date('2026-10-06T15:00:00')

async function contexto(extra: Record<string, unknown> = {}) {
  return {
    agora: terca15h,
    mensagens: [{ de: 'lead' as const, texto: 'quanto custa?', em: terca15h.toISOString() }],
    estado: 'conversando',
    proativa: false,
    bloqueado: false,
    ritmo: null,
    nicho: 'Barbearia',
    enviadosOutros: [],
    maxBolha: 600,
    material: 'Site completo R$ 1.200 à vista ou 3x de R$ 420. Prazo de 7 dias úteis. Portfólio: barbeariadoze.com.br. Pix: pix@xssites.com.br',
    descontoMax: 10,
    linksPermitidos: ['barbeariadoze.com.br'],
    podePreco: true,
    podePix: false,
    dono: 'Gabriel',
    proibidos: [],
    ...extra,
  }
}

test('conferente: preço, desconto, prazo e link só do material', async () => {
  const { conferir } = await import('./agente/conferente.js')
  const ok = (t: string, extra = {}) => conferir({ mensagens: [t], acao: 'continuar' }, contexto(extra) as never)
  const c = await contexto()
  assert.equal(conferir({ mensagens: ['O site completo sai R$ 1.200 à vista. Quer ver um exemplo?'], acao: 'continuar' }, c).ok, true)
  // Desconto dentro do limite sobre um preço do material passa
  assert.equal(conferir({ mensagens: ['Consigo fazer por R$ 1.100 no Pix.'], acao: 'continuar' }, c).ok, true)
  const caro = conferir({ mensagens: ['Faço por R$ 800, fechado?'], acao: 'continuar' }, c)
  assert.equal(caro.ok, false)
  assert.equal(!caro.ok && caro.id, 'preco')
  assert.equal(!conferir({ mensagens: ['Dou 30% de desconto hoje!'], acao: 'continuar' }, c).ok, true)
  assert.equal(!conferir({ mensagens: ['Fica pronto em 2 dias.'], acao: 'continuar' }, c).ok, true)
  const link = conferir({ mensagens: ['Olha esse: pizzariadamaria.com.br'], acao: 'continuar' }, c)
  assert.equal(!link.ok && link.id, 'link')
  assert.equal(conferir({ mensagens: ['Olha esse: barbeariadoze.com.br'], acao: 'continuar' }, c).ok, true)
  void ok
})

test('conferente: parar, robô, promessa, bastidor, Pix e formatação', async () => {
  const { conferir } = await import('./agente/conferente.js')
  const base = await contexto()
  const r = (t: string, ctx = base, acao = 'continuar') => conferir({ mensagens: [t], acao }, ctx)
  const id = (x: ReturnType<typeof conferir>) => (x.ok ? null : x.id)
  assert.equal(id(r('Oi!', { ...base, estado: 'optout' })), 'parar')
  assert.equal(id(r('Oi!', { ...base, mensagens: [{ de: 'lead', texto: 'para de me mandar mensagem', em: '' }] })), 'parar')
  assert.equal(id(r('Oi!', { ...base, bloqueado: true })), 'lgpd')
  assert.equal(id(r('Oi!', { ...base, agora: new Date('2026-10-06T22:00:00') })), 'horario')
  // Abordagem de restaurante no almoço espera; resposta não
  assert.equal(id(r('Oi!', { ...base, proativa: true, nicho: 'Pizzaria', agora: new Date('2026-10-06T12:30:00') })), 'horario')
  assert.equal(id(r('Não sou robô não, sou o Gabriel!')), 'robo')
  assert.equal(id(r('Claro, me conta mais.', { ...base, mensagens: [{ de: 'lead', texto: 'vc é robô?', em: '' }] })), 'robo')
  assert.equal(r('Sou o assistente virtual do Gabriel, posso chamar ele se preferir.', { ...base, mensagens: [{ de: 'lead', texto: 'vc é robô?', em: '' }] }).ok, true)
  // Escrevendo como o dono: não responde se é robô (nem nega); só passa a conversa para o dono
  const comoDono = { ...base, comoDono: true, mensagens: [{ de: 'lead' as const, texto: 'vc é robô?', em: '' }] }
  assert.equal(id(r('Sou o assistente virtual do Gabriel.', comoDono)), 'robo')
  assert.equal(id(r('Não sou robô não!', { ...base, comoDono: true })), 'robo')
  assert.equal(conferir({ mensagens: [], acao: 'chamar_dono' }, comoDono).ok, true)
  assert.equal(r('Claro, me conta mais.', { ...base, comoDono: true }).ok, true)
  assert.equal(id(r('Com o site você fica em primeiro lugar no Google!')), 'promessa')
  assert.equal(id(r('Vou usar a ação chamar_dono agora')), 'bastidor')
  assert.equal(id(r('Pode mandar no Pix pix@xssites.com.br')), 'sensivel')
  assert.equal(id(r('Me passa seu CPF para eu montar o contrato?')), 'sensivel')
  assert.equal(id(r('**Pacote completo** com tudo')), 'formato')
  assert.equal(id(r('Vou pedir para o Gabriel te ligar amanhã.')), 'pessoa')
  assert.equal(r('Vou pedir para o Gabriel te ligar amanhã.', base, 'chamar_dono').ok, true)
  assert.equal(id(r('Tenho horário quinta às 15h, pode ser?')), 'agenda')
  assert.equal(id(r('Com certeza o Bolsonaro ia gostar do seu site', { ...base, proibidos: [] })), 'proibidos')
})

test('conferente: texto repetido, segundo não e níveis de piloto', async () => {
  const { conferir, precisaAprovacao, parecenca, feriadoNacional } = await import('./agente/conferente.js')
  const base = await contexto()
  const igual = 'Oi! Vi que a sua barbearia tem ótimas avaliações no Google e ainda não tem site. Posso te mostrar uma ideia?'
  const rep = conferir({ mensagens: [igual], acao: 'continuar' }, { ...base, enviadosOutros: [igual.replace('Oi!', 'Olá!')] })
  assert.equal(!rep.ok && rep.id, 'repetido')
  assert.ok(parecenca('a b c dddd eeee ffff', 'zzz yyy xxx') < 0.2)
  const doisNaos = { ...base, mensagens: [{ de: 'lead' as const, texto: 'não tenho interesse', em: '' }, { de: 'agente' as const, texto: 'Posso saber por quê?', em: '' }, { de: 'lead' as const, texto: 'não quero, obrigado', em: '' }] }
  assert.equal(conferir({ mensagens: ['Mas olha, tem uma promoção?'], acao: 'continuar' }, doisNaos).ok, false)
  assert.equal(conferir({ mensagens: ['Tudo bem, obrigado pela atenção!'], acao: 'perdido' }, doisNaos).ok, true)
  assert.ok(precisaAprovacao(1, { mensagens: ['Oi'], acao: 'continuar' }))
  assert.ok(precisaAprovacao(2, { mensagens: ['Sai R$ 1.200'], acao: 'continuar' }))
  assert.equal(precisaAprovacao(2, { mensagens: ['Me conta como os clientes te acham?'], acao: 'continuar' }), null)
  assert.ok(precisaAprovacao(3, { mensagens: ['Fechado!'], acao: 'venda_fechada' }))
  assert.equal(precisaAprovacao(4, { mensagens: ['Fechado!'], acao: 'venda_fechada' }), null)
  assert.equal(feriadoNacional(new Date('2026-04-03T10:00:00')), true) // Sexta-feira Santa
  assert.equal(feriadoNacional(new Date('2026-11-20T10:00:00')), true)
  assert.equal(feriadoNacional(new Date('2026-10-06T10:00:00')), false)
})

test('google: resultado, celular, nota de encaixe e base de conhecimento', async () => {
  const { paraResultado, notaEncaixe } = await import('./agente/google.js')
  const r = paraResultado({ id: 'x', displayName: { text: 'Barbearia do Zé' }, nationalPhoneNumber: '(43) 99912-0000', websiteUri: 'https://instagram.com/ze', rating: 4.8, userRatingCount: 120, addressComponents: [{ longText: 'Londrina', types: ['administrative_area_level_2'] }] }, 'Barbearia')
  assert.equal(r.phone, '5543999120000')
  assert.equal(r.hasWhatsapp, true)
  assert.equal(r.website, '')
  assert.match(r.instagram, /instagram/)
  const n = notaEncaixe(r)
  assert.ok(n.nota >= 85, String(n.nota))
  assert.ok(notaEncaixe({ ...r, website: 'https://ze.com.br', reviewsCount: 5000 }).nota < n.nota)
  const { buscarTrechos } = await import('./agente/base.js')
  const mats = [
    { id: '1', titulo: 'Preços', tipo: 'precos' as const, texto: 'Site completo R$ 1.200.', ativo: true, atualizadoEm: '' },
    { id: '2', titulo: 'Hospedagem', tipo: 'politica' as const, texto: 'A hospedagem do primeiro ano está inclusa.', ativo: true, atualizadoEm: '' },
  ]
  assert.equal(buscarTrechos(mats, 'a hospedagem tá inclusa?')[0].titulo, 'Hospedagem')
  assert.ok(buscarTrechos(mats, 'quanto custa?').some((t) => t.titulo === 'Preços'))
})

test('conversas: entregar ao vendedor, assumir pela XS e mapa', async () => {
  const agente = await import('./agente/agente.js')
  const { db } = await import('./agente/estado.js')
  const c = agente.entregarAoAgente('43 99977-0001', 'Pet Shop Amigo')
  assert.ok(c)
  assert.equal(db.conversas.find((x) => x.id === c!.id)!.origem, 'manual')
  assert.ok(agente.mapaConversas().some((m) => m.id === c!.id))
  agente.saiuPelaXS('5543999770001', 'Oi, aqui é o Gabriel', 'WA-XS-1')
  assert.equal(db.conversas.find((x) => x.id === c!.id)!.estado, 'humano')
  assert.equal(agente.conversaPorTelefone('43999770001')!.estado, 'humano')
  // Chave do Google: só aceita chave com cara de chave; consultas feitas voltam para o app somar
  assert.equal(agente.definirGoogle({ chave: 'errada', restante: 100 }).temChave, false)
  const g = agente.definirGoogle({ chave: 'AIzaChaveDeTesteAaaaaaaaaaaaaaaaaaaaaaaaaa', restante: 100 })
  assert.equal(g.temChave, true)
  assert.equal(g.restante, 100)
  db.extra.google.pendentes = 3
  assert.equal(agente.definirGoogle({ ack: 3 }).pendentes, 0)
})
