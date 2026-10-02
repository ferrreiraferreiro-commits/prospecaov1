import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeFile, isEmptyValue, parseLeadsTxt, parseRating, splitCity } from '../src/lib/parser'

const sample = readFileSync(new URL('./fixtures/relatorio_exemplo.txt', import.meta.url), 'utf-8')

describe('parseLeadsTxt — arquivo real de exportação', () => {
  const result = parseLeadsTxt(sample)

  it('encontra os 3 blocos numerados', () => {
    expect(result.leads).toHaveLength(3)
    expect(result.declaredTotal).toBe(3)
    expect(result.warnings).toEqual([])
    expect(result.leads.map((l) => l.index)).toEqual([1, 2, 3])
  })

  it('lê o cabeçalho', () => {
    expect(result.meta['Data da Exportação']).toBe('01/10/2026 às 20:14:02')
  })

  it('mapeia todos os campos do primeiro lead', () => {
    const l = result.leads[0]
    expect(l.empresa).toBe('COMERCIAL RAMOS')
    expect(l.nicho).toBe('Fornecedor de Artigos Hospitalares')
    expect(l.telefone).toBe('551147268618')
    expect(l.whatsapp).toBe('https://wa.me/551147268618')
    expect(l.cidade).toBe('Mogi das Cruzes')
    expect(l.estado).toBe('SP')
    expect(l.avaliacao).toBe(3.8)
    expect(l.numero_avaliacoes).toBe(13)
    expect(l.pasta).toBe('Geral')
    expect(l.etapa).toBe('NOVO')
    expect(l.status).toBe('novo')
    expect(l.observacoes).toBe('Origem: Prospecção Google Maps')
    expect(l.maps_url).toMatch(/^https:\/\/www\.google\.com\/maps\/place\/Comercial\+Ramos\/data=.*rclk=1$/)
  })

  it('trata "Não informado" e "Sem site oficial" como ausência', () => {
    const l = result.leads[0]
    expect(l.instagram).toBeNull()
    expect(l.website).toBeNull()
    expect(l.endereco).toBeNull()
  })

  it('lê nota inteira ("5 estrelas")', () => {
    expect(result.leads[1].avaliacao).toBe(5)
    expect(result.leads[1].numero_avaliacoes).toBe(16)
  })

  it('mantém leads com o mesmo nome', () => {
    expect(result.leads[0].empresa).toBe(result.leads[2].empresa)
    expect(result.leads[0].telefone).not.toBe(result.leads[2].telefone)
  })
})

describe('parser — robustez', () => {
  it('aceita campos faltando, ordem diferente, CRLF e observação em várias linhas', () => {
    const txt = [
      '[1] PADARIA BOM PÃO',
      '  Telefone : (11) 98888-7777',
      '  Website Oficial : www.bompao.com.br',
      '  Instagram : @padariabompao',
      '  Observações : Linha um',
      '  continua aqui',
      '',
      '[2] OFICINA X',
      '  Avaliação Google : 4,7 estrelas (1.234 avaliações)',
      '  Cidade / Região : Suzano/SP',
      '  Horário : 8h às 18h',
    ].join('\r\n')
    const r = parseLeadsTxt(txt)
    expect(r.leads).toHaveLength(2)
    expect(r.leads[0].website).toBe('www.bompao.com.br')
    expect(r.leads[0].instagram).toBe('@padariabompao')
    expect(r.leads[0].observacoes).toBe('Linha um\ncontinua aqui')
    expect(r.leads[0].nicho).toBeNull()
    expect(r.leads[1].avaliacao).toBe(4.7)
    expect(r.leads[1].numero_avaliacoes).toBe(1234)
    expect(r.leads[1].cidade).toBe('Suzano')
    expect(r.leads[1].estado).toBe('SP')
    expect(r.leads[1].dados_extras).toEqual({ Horário: '8h às 18h' })
  })

  it('avisa quando não há blocos', () => {
    const r = parseLeadsTxt('arquivo qualquer\nsem blocos')
    expect(r.leads).toHaveLength(0)
    expect(r.warnings[0]).toMatch(/Nenhum bloco/)
  })

  it('reconhece etapa existente como status', () => {
    const r = parseLeadsTxt('[1] A\n Etapa no Funil : Follow-up\n')
    expect(r.leads[0].status).toBe('follow_up')
  })

  it('valores vazios', () => {
    for (const v of ['Não informado', 'nao informado', 'Sem site oficial', 'Sem Instagram', 'N/A', '-', '', 'Nenhum']) {
      expect(isEmptyValue(v)).toBe(true)
    }
    for (const v of ['@loja', 'https://site.com', 'Rua A, 10']) expect(isEmptyValue(v)).toBe(false)
  })

  it('helpers de avaliação e cidade', () => {
    expect(parseRating('Não informado')).toEqual({ nota: null, total: null })
    expect(parseRating('4.9 estrelas (32 avaliações)')).toEqual({ nota: 4.9, total: 32 })
    expect(splitCity('São Paulo')).toEqual({ cidade: 'São Paulo', estado: null })
  })

  it('decodifica Windows-1252 quando o UTF-8 falha', () => {
    const bytes = new Uint8Array([0x5b, 0x31, 0x5d, 0x20, 0x45, 0x4d, 0x50, 0xd3, 0x52, 0x49, 0x4f]) // "[1] EMPÓRIO"
    expect(decodeFile(bytes.buffer)).toBe('[1] EMPÓRIO')
  })
})
