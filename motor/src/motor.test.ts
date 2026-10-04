import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.XS_STORAGE = path.join(os.tmpdir(), `xs-motor-test-${process.pid}`)


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
