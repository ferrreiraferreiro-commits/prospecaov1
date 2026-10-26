import { describe, expect, it } from 'vitest'
import { erroMeta, lerModelo, numeroMeta, payloadModelo, variaveisDoTexto } from '../api/meta'
import { janelaAberta, numeroDoLead, textoDoModelo } from '../src/lib/meta'

describe('API oficial (Meta)', () => {
  it('número no formato da Meta', () => {
    expect(numeroMeta('(43) 99999-8888')).toBe('5543999998888')
    expect(numeroMeta('5543999998888')).toBe('5543999998888')
    expect(numeroDoLead({ whatsapp: null, telefone: '43 3333-4444' })).toBe('554333334444')
  })

  it('lê as variáveis do corpo, numeradas ou com nome', () => {
    expect(variaveisDoTexto('Oi {{1}}, tudo bem? Vi a {{2}} em {{1}}')).toEqual(['1', '2'])
    expect(variaveisDoTexto('Olá {{ nome_empresa }}')).toEqual(['nome_empresa'])
  })

  it('marca modelos que a XS ainda não envia', () => {
    const ok = lerModelo({ name: 'oi', language: 'pt_BR', category: 'MARKETING', components: [{ type: 'BODY', text: 'Oi {{1}}' }, { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero' }] }] })
    expect(ok.suportado).toBe(true)
    expect(ok.botoes).toEqual(['Quero'])
    const foto = lerModelo({ name: 'f', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'x' }] })
    expect(foto.suportado).toBe(false)
    const url = lerModelo({ name: 'u', components: [{ type: 'BODY', text: 'x' }, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://a.com/{{1}}' }] }] })
    expect(url.suportado).toBe(false)
    const nomeado = lerModelo({ name: 'n', parameter_format: 'NAMED', components: [{ type: 'BODY', text: 'Oi {{empresa}}' }] })
    expect(nomeado.nomeadas).toBe(true)
  })

  it('monta o envio do modelo sem variável vazia nem quebra de linha', () => {
    const p = payloadModelo('43999998888', 'oi', 'pt_BR', ['1', '2'], ['Padaria\nDo Zé', ''], false)
    expect(p.to).toBe('5543999998888')
    expect(p.template.components?.[0].parameters).toEqual([
      { type: 'text', text: 'Padaria Do Zé' },
      { type: 'text', text: '-' },
    ])
    const n = payloadModelo('5543999998888', 'n', 'pt_BR', ['empresa'], ['X'], true)
    expect(n.template.components?.[0].parameters[0]).toEqual({ type: 'text', parameter_name: 'empresa', text: 'X' })
    expect(payloadModelo('5543999998888', 'hello_world', 'en_US', [], [], false).template).not.toHaveProperty('components')
  })

  it('prévia do modelo com os valores', () => {
    expect(textoDoModelo({ cabecalho: null, corpo: 'Oi {{1}}, de {{2}}', rodape: 'XS', variaveis: ['1', '2'] }, ['Ana', ''])).toBe('Oi Ana, de {{2}}\n\nXS')
  })

  it('janela de 24 h conta da última mensagem DA PESSOA', () => {
    const agora = Date.parse('2026-10-26T12:00:00Z')
    expect(janelaAberta([], agora)).toBe(false)
    expect(janelaAberta([{ deMim: false, em: '2026-10-26T01:00:00Z' }, { deMim: true, em: '2026-10-26T11:00:00Z' }], agora)).toBe(true)
    expect(janelaAberta([{ deMim: false, em: '2026-10-25T11:00:00Z' }, { deMim: true, em: '2026-10-26T11:00:00Z' }], agora)).toBe(false)
  })

  it('erros da Meta em português', () => {
    expect(erroMeta(131047)).toMatch(/24 h/)
    expect(erroMeta(190)).toMatch(/token/)
    expect(erroMeta(999, 'x')).toBe('A Meta recusou: x')
  })
})
