import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-motor-test-${process.pid}`)

const { classifyExternalLinks, extractBrazilPhone, extractCnpj, isValidCnpj, looksLikeMobile, matchesCompanyIdentity, normalizeBrazilPhone, selectResponsible } = await import('./enrich.js')
const { buildCoverageCenters, buildBalancedCoverageCenters, extractCoordinates, getCandidateTarget, isInsideRadius, mapsKey, parseCardLocation, phoneKey, selectDiversifiedSectorCards } = await import('./maps.js')

test('telefone: tronco 0, DDD, celular e lixo', () => {
  assert.equal(normalizeBrazilPhone('03537153269'), '553537153269')
  assert.equal(normalizeBrazilPhone('+55 (35) 99876-5432'), '5535998765432')
  assert.equal(normalizeBrazilPhone('3715-3269'), '')
  assert.equal(extractBrazilPhone('Ligue (35) 3715-3269 hoje'), '553537153269')
  assert.equal(extractBrazilPhone('R. Pernambuco, 735 - Centro, 37701-730'), '')
  assert.ok(looksLikeMobile('5535998765432'))
  assert.ok(!looksLikeMobile('553537153269'))
})

test('links: site, Instagram de perfil e limpeza de rastreio', () => {
  const r = classifyExternalLinks([
    'https://www.google.com/url?q=https://padaria.com.br/?utm_source=gmb&rwg_token=abc',
    'https://instagram.com/',
    'https://www.instagram.com/padariasol?igsh=xyz',
    'https://facebook.com/padaria',
  ])
  assert.equal(r.website, 'https://padaria.com.br/')
  assert.equal(r.instagram, 'https://www.instagram.com/padariasol')
})

test('CNPJ: validação, extração e responsável', () => {
  assert.ok(isValidCnpj('11.222.333/0001-81'))
  assert.ok(!isValidCnpj('11.111.111/1111-11'))
  assert.equal(extractCnpj('CNPJ 11.222.333/0001-81 · todos os direitos'), '11222333000181')
  const resp = selectResponsible([
    { nome_socio: 'Ana', qualificacao_socio: 'Sócio' },
    { nome_socio: 'Bruno', qualificacao_socio: 'Sócio-Administrador' },
  ])
  assert.equal(resp.name, 'Bruno')
  const data = { razao_social: 'PADARIA SOL NASCENTE LTDA', ddd_telefone_1: '3537153269', municipio: 'POCOS DE CALDAS' }
  assert.ok(matchesCompanyIdentity(data, { name: 'Padaria Sol Nascente', phone: '553537153269', city: 'Poços de Caldas' }))
  assert.ok(!matchesCompanyIdentity(data, { name: 'Padaria Sol Nascente', phone: '5511999990000', city: 'Poços de Caldas' }))
  assert.ok(!matchesCompanyIdentity(data, { name: 'Barbearia Lima', phone: '', city: '' }))
})

test('cobertura: 19 pontos até 5 km, 41 acima, centro primeiro', () => {
  assert.equal(buildCoverageCenters(-21.79, -46.56, 5).length, 19)
  assert.equal(buildCoverageCenters(-21.79, -46.56, 20).length, 41)
  const balanced = buildBalancedCoverageCenters(-21.79, -46.56, 20)
  assert.equal(balanced.length, 41)
  assert.equal(balanced[0].label, 'centro')
})

test('amostra diversificada e meta de candidatos', () => {
  const items = Array.from({ length: 30 }, (_, i) => i)
  const picked = selectDiversifiedSectorCards(items, 6, 0)
  assert.equal(picked.length, 6)
  assert.ok(picked.some((x) => x >= 20), 'pega também do fim da lista')
  assert.equal(getCandidateTarget(30, { phone: 0, website: 0, instagram: 0 }), 90)
  assert.ok(getCandidateTarget(30, { phone: 1, website: -1, instagram: 0 }) > 90)
})

test('coordenadas, raio e identidade do lugar', () => {
  const href = 'https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x94c9dcee4ccabf6f:0x242bc92aa9f9d2c8!8m2!3d-21.784257!4d-46.566322'
  const c = extractCoordinates(href)
  assert.deepEqual(c, { lat: -21.784257, lng: -46.566322 })
  assert.ok(isInsideRadius({ lat: -21.79, lng: -46.5648 }, c, 3))
  assert.ok(!isInsideRadius({ lat: -23.55, lng: -46.63 }, c, 10))
  assert.equal(mapsKey(href), '0x94c9dcee4ccabf6f:0x242bc92aa9f9d2c8')
  assert.equal(phoneKey('5535998765432'), '3598765432')
  assert.equal(phoneKey('(35) 9876-5432'), '3598765432', 'nono dígito não engana')
  assert.deepEqual(parseCardLocation('Barbearia X\nBarbearia · Centro, Poços de Caldas - MG', 'Outra', ''), { city: 'Poços de Caldas', state: 'MG' })
})

test('disparo: {saudacao} resolvida na hora e pontuação limpa', async () => {
  const { finalizeText } = await import('./disparo.js')
  const manha = new Date('2026-10-02T09:00:00')
  assert.equal(finalizeText('{saudacao}, tudo bem?', manha), 'Bom dia, tudo bem?')
  assert.equal(finalizeText('{saudacao} , !', new Date('2026-10-02T20:00:00')), 'Boa noite!')
})

test('agenda: valida telefone, texto e data; cancela e apaga', async () => {
  const { createAgenda, cancelAgenda, deleteAgenda, listAgenda, updateAgenda } = await import('./agenda.js')
  assert.throws(() => createAgenda({ telefone: '123', texto: 'oi', quando: '2026-10-04T08:00:00' }), /Telefone inválido/)
  assert.throws(() => createAgenda({ telefone: '35998765432', texto: '  ', quando: '2026-10-04T08:00:00' }), /Escreva a mensagem/)
  assert.throws(() => createAgenda({ telefone: '35998765432', texto: 'oi', quando: 'amanhã' }), /Data e hora inválidas/)
  const a = createAgenda({ telefone: '(35) 99876-5432', texto: '{saudacao}!', quando: '2099-01-01T08:00:00Z', nome: 'Teste' })
  assert.equal(a.telefone, '5535998765432')
  assert.equal(a.status, 'agendado')
  const b = updateAgenda(a.id, { texto: 'Oi de novo' })
  assert.equal(b.texto, 'Oi de novo')
  cancelAgenda(a.id)
  assert.equal(listAgenda().find((x) => x.id === a.id)?.status, 'cancelado')
  deleteAgenda(a.id)
  assert.equal(listAgenda().some((x) => x.id === a.id), false)
})
