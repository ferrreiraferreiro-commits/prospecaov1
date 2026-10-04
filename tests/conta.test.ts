import { describe, expect, it } from 'vitest'
import { isBlockReport, parseLeadsAny, parseSheet, splitRows } from '../src/lib/sheet'
import { accessOf, planInfo, type Profile } from '../src/store/useAccount'
import { escolhaAtual, fimSugerido, gerarSenha, loginDe, recebidoNoMes, somarCiclo } from '../src/lib/admin'
import { isLegacyEmail, signIn, SO_EMAIL, toAuthPassword } from '../src/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    expect(accessOf(base, now)).toEqual({ ok: true, diasDeTeste: 7, horasDeTeste: 168 })
    expect(accessOf({ ...base, teste_ate: '2026-10-03T21:30:00Z' }, now)).toEqual({ ok: true, diasDeTeste: 1, horasDeTeste: 10 })
  })
  it('teste vencido e conta cancelada bloqueiam', () => {
    expect(accessOf({ ...base, teste_ate: '2026-10-01T00:00:00Z' }, now)).toEqual({ ok: false, motivo: 'teste_acabou' })
    expect(accessOf({ ...base, plano: 'cancelado' }, now)).toEqual({ ok: false, motivo: 'cancelado' })
  })
  it('assinante e vitalício entram sem contagem; sem perfil não bloqueia', () => {
    expect(accessOf({ ...base, plano: 'ativo', teste_ate: '2020-01-01T00:00:00Z' }, now)).toEqual({ ok: true, diasDeTeste: null, horasDeTeste: null })
    expect(accessOf(null, now)).toEqual({ ok: true, diasDeTeste: null, horasDeTeste: null })
  })
  it('plano pago bloqueia depois de vencer', () => {
    const mensal: Profile = { ...base, plano: 'ativo', ciclo: 'mensal', plano_ate: '2026-11-03T12:00:00Z' }
    expect(accessOf(mensal, now)).toEqual({ ok: true, diasDeTeste: null, horasDeTeste: null })
    expect(accessOf({ ...mensal, plano_ate: '2026-10-03T11:00:00Z' }, now)).toEqual({ ok: false, motivo: 'plano_venceu' })
  })
})

describe('plano no menu do perfil', () => {
  const base: Profile = { user_id: 'u', email: null, nome: null, cidade: null, plano: 'teste', teste_ate: '2026-10-04T12:00:00Z', recursos: [], boas_vindas_feitas: true }
  const now = Date.parse('2026-10-03T12:00:00Z')

  it('mostra o nome do plano e quando acaba', () => {
    expect(planInfo(base, now)).toEqual({ nome: 'Teste grátis', ate: '2026-10-04T12:00:00Z', dias: 1 })
    expect(planInfo({ ...base, plano: 'vitalicio' }, now)).toEqual({ nome: 'Vitalício', ate: null, dias: null })
    expect(planInfo({ ...base, plano: 'ativo', ciclo: 'trimestral', plano_ate: '2027-01-03T12:00:00Z' }, now)).toEqual({ nome: 'Trimestral', ate: '2027-01-03T12:00:00Z', dias: 92 })
    expect(planInfo({ ...base, plano: 'ativo', ciclo: 'semanal', plano_ate: '2026-10-10T12:00:00Z' }, now)?.nome).toBe('Semanal')
    expect(planInfo({ ...base, plano: 'ativo', ciclo: 'diario' }, now)).toEqual({ nome: 'Diário', ate: null, dias: null })
    expect(planInfo({ ...base, plano: 'ativo' }, now)?.nome).toBe('Assinatura')
    expect(planInfo(null, now)).toBeNull()
  })
})

describe('tela Contas', () => {
  const now = new Date('2026-10-04T15:00:00')

  it('soma o ciclo escolhido', () => {
    expect(somarCiclo('diario', now)).toEqual(new Date('2026-10-05T15:00:00'))
    expect(somarCiclo('semanal', now)).toEqual(new Date('2026-10-11T15:00:00'))
    expect(somarCiclo('mensal', now)).toEqual(new Date('2026-11-04T15:00:00'))
    expect(somarCiclo('trimestral', now)).toEqual(new Date('2027-01-04T15:00:00'))
  })
  it('renova a partir do fim atual quando o plano ainda está em dia', () => {
    const emDia = { plano: 'ativo' as const, plano_ate: '2026-10-10T15:00:00' }
    expect(fimSugerido('mensal', emDia, now)).toEqual(new Date('2026-11-10T15:00:00'))
    expect(fimSugerido('mensal', { ...emDia, plano_ate: '2026-10-01T15:00:00' }, now)).toEqual(new Date('2026-11-04T15:00:00'))
    expect(fimSugerido('semanal', { plano: 'teste', plano_ate: null }, now)).toEqual(new Date('2026-10-11T15:00:00'))
    expect(fimSugerido('teste', emDia, now)).toEqual(new Date('2026-10-05T15:00:00'))
    expect(fimSugerido('vitalicio', emDia, now)).toBeNull()
    expect(fimSugerido('cancelado', emDia, now)).toBeNull()
  })
  it('mostra o login sem o domínio interno', () => {
    expect(loginDe('gabriel@prospeccao.local')).toBe('gabriel')
    expect(loginDe('ana@gmail.com')).toBe('ana@gmail.com')
    expect(escolhaAtual({ plano: 'ativo', ciclo: 'trimestral' })).toBe('trimestral')
    expect(escolhaAtual({ plano: 'vitalicio', ciclo: null })).toBe('vitalicio')
  })
})

describe('login só por e-mail, senha e pagamentos', () => {
  const fakeClient = (senhaCerta: string) => {
    const tentativas: { email: string; password: string }[] = []
    const client = {
      auth: {
        signInWithPassword: async (c: { email: string; password: string }) => {
          tentativas.push(c)
          return { error: c.password === senhaCerta ? null : { message: 'Invalid login credentials' } }
        },
      },
    } as unknown as SupabaseClient
    return { client, tentativas }
  }

  it('recusa nome de usuário e o e-mail interno antigo', async () => {
    const { client, tentativas } = fakeClient('x')
    expect(await signIn(client, 'gabriel', '123')).toBe(SO_EMAIL)
    expect(await signIn(client, 'gabriel@prospeccao.local', '123')).toBe(SO_EMAIL)
    expect(tentativas).toHaveLength(0)
    expect(isLegacyEmail('Gabriel@prospeccao.local')).toBe(true)
    expect(isLegacyEmail('gabriel@gmail.com')).toBe(false)
  })
  it('conta antiga com e-mail novo ainda entra com a senha de sempre', async () => {
    const { client, tentativas } = fakeClient(toAuthPassword('minhasenha'))
    expect(await signIn(client, ' Gabriel@Gmail.com ', 'minhasenha')).toBeNull()
    expect(tentativas.map((t) => t.email)).toEqual(['gabriel@gmail.com', 'gabriel@gmail.com'])
    expect(await signIn(fakeClient('outra').client, 'a@b.com', 'errada')).toBe('E-mail ou senha incorretos.')
  })
  it('gera senha provisória fácil de ditar', () => {
    const s = gerarSenha()
    expect(s).toMatch(/^[a-hjkmnp-z2-9]{8}$/)
  })
  it('soma o que entrou no mês', () => {
    const now = new Date('2026-10-20T12:00:00')
    const pags = [
      { valor: 50, pago_em: new Date('2026-10-01T10:00:00').toISOString() },
      { valor: 29.9, pago_em: new Date('2026-10-19T10:00:00').toISOString() },
      { valor: 100, pago_em: new Date('2026-09-30T10:00:00').toISOString() },
    ]
    expect(recebidoNoMes(pags, now)).toBeCloseTo(79.9)
  })
})
