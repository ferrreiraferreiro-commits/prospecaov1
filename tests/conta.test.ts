import { describe, expect, it } from 'vitest'
import { isBlockReport, parseLeadsAny, parseSheet, splitRows } from '../src/lib/sheet'
import { accessOf, type Profile } from '../src/store/useAccount'

describe('importar planilha', () => {
  it('lê CSV com ponto e vírgula, aspas e colunas extras', () => {
    const csv = 'Nome da empresa;Telefone;Cidade;Segmento;Responsável\n"Padaria Sol; Pães";(35) 99999-0001;Poços de Caldas - MG;Padaria;João\nBarbearia X;3534410000;Campinas/SP;;'
    const r = parseSheet(csv)
    expect(r.warnings).toEqual([])
    expect(r.leads).toHaveLength(2)
    expect(r.leads[0]).toMatchObject({ empresa: 'Padaria Sol; Pães', telefone: '(35) 99999-0001', cidade: 'Poços de Caldas', estado: 'MG', nicho: 'Padaria', status: 'novo' })
    expect(r.leads[0].dados_extras).toEqual({ Responsável: 'João' })
    expect(r.leads[1]).toMatchObject({ cidade: 'Campinas', estado: 'SP', nicho: null, dados_extras: null })
  })

  it('lê linhas coladas da planilha (tabulação)', () => {
    const r = parseLeadsAny('Empresa\tWhatsApp\tInstagram\tSite\nÓtica Bela\t35988887777\t@oticabela\t-\n\t\t\t')
    expect(r.leads).toEqual([expect.objectContaining({ empresa: 'Ótica Bela', whatsapp: '35988887777', instagram: '@oticabela', website: null })])
  })

  it('aceita linha só com telefone e ignora a que não tem nada', () => {
    const r = parseSheet('telefone,cidade\n35999990000,Poços\n,Campinas')
    expect(r.leads.map((l) => l.empresa)).toEqual(['Sem nome (35999990000)'])
    expect(r.warnings[0]).toMatch(/1 linha/)
  })

  it('explica quando falta a linha de títulos', () => {
    expect(parseSheet('Padaria Sol,35999990000\nOutra,3533330000').warnings[0]).toMatch(/primeira linha precisa ter os nomes/)
  })

  it('reconhece o relatório em blocos e manda para o leitor de TXT', () => {
    expect(isBlockReport('cabeçalho\n[001] PADARIA\n  Telefone : 1')).toBe(true)
    expect(isBlockReport('Empresa,Telefone')).toBe(false)
  })

  it('separa CSV com aspas escapadas e quebra de linha dentro da célula', () => {
    expect(splitRows('a,"b ""c""",d\n"x\ny",z', ',')).toEqual([
      ['a', 'b "c"', 'd'],
      ['x\ny', 'z'],
    ])
  })
})

describe('acesso da conta', () => {
  const base: Profile = { user_id: 'u', email: null, nome: null, cidade: null, plano: 'teste', teste_ate: '2026-10-10T12:00:00Z', recursos: [], boas_vindas_feitas: true }
  const now = Date.parse('2026-10-03T12:00:00Z')

  it('teste grátis conta os dias que faltam', () => {
    expect(accessOf(base, now)).toEqual({ ok: true, diasDeTeste: 7 })
  })
  it('teste vencido e conta cancelada bloqueiam', () => {
    expect(accessOf({ ...base, teste_ate: '2026-10-01T00:00:00Z' }, now)).toEqual({ ok: false, motivo: 'teste_acabou' })
    expect(accessOf({ ...base, plano: 'cancelado' }, now)).toEqual({ ok: false, motivo: 'cancelado' })
  })
  it('assinante e vitalício entram sem contagem; sem perfil não bloqueia', () => {
    expect(accessOf({ ...base, plano: 'ativo', teste_ate: '2020-01-01T00:00:00Z' }, now)).toEqual({ ok: true, diasDeTeste: null })
    expect(accessOf(null, now)).toEqual({ ok: true, diasDeTeste: null })
  })
})
