import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanName, emailKind, isJunkName, norm, phoneOf, splitLine, titleCase } from '../busca/lib'
import { resolveNiche } from '../busca/nichos'
import { markSharedDomains, SCHEMA } from '../busca/schema'

describe('base do CNPJ: limpeza dos dados', () => {
  it('lê a linha da Receita (aspas e ; dentro do campo)', () => {
    expect(splitLine('"A";"B;C";"D""E";""')).toEqual(['A', 'B;C', 'D"E', ''])
  })

  it('devolve o 9 do celular que a Receita corta e tira o 0 do DDD', () => {
    expect(phoneOf('019', '98123456')).toEqual({ phone: '5519998123456', mobile: true })
    expect(phoneOf('19', '32321111')).toEqual({ phone: '551932321111', mobile: false })
    expect(phoneOf('', '32321111')).toBeNull()
    expect(phoneOf('19', '1234')).toBeNull()
    expect(phoneOf('19', '00000000')).toBeNull()
  })

  it('separa e-mail grátis, domínio próprio e e-mail de contador', () => {
    expect(emailKind('')).toBe(0)
    expect(emailKind('dra.ana@gmail.com')).toBe(1)
    expect(emailKind('contato@bol.com.br')).toBe(1)
    expect(emailKind('contato@clinicasorriso.com.br')).toBe(2)
    expect(emailKind('fiscal@contabilidadexyz.com.br')).toBe(3)
  })

  it('nunca deixa CPF no nome (todos os formatos vistos na base)', () => {
    expect(cleanName('JORGE PEDROSA CPF 11122233344 ME')).toBe('JORGE PEDROSA ME')
    expect(cleanName('JOAQUIM LIMA - CPF11122233344')).toBe('JOAQUIM LIMA')
    expect(cleanName('ROOSEVELT GOMES /11122233344')).toBe('ROOSEVELT GOMES')
    expect(cleanName('MARIA SILVA 111.222.333-44')).toBe('MARIA SILVA')
    expect(cleanName('MARIA SILVA 11122233344')).toBe('MARIA SILVA')
    expect(cleanName('12.345.678 MARIA SILVA')).toBe('MARIA SILVA')
    expect(cleanName('PADARIA 2000 LTDA')).toBe('PADARIA 2000 LTDA')
  })

  it('nome fantasia que não é nome cai para a razão social', () => {
    for (const junk of ['S/N', 's/n', 'NAO TEM', '*****', '', 'ME']) expect(isJunkName(junk)).toBe(true)
    for (const ok of ['PET CAMP', 'DOG CLUB RESORT', 'ABC']) expect(isJunkName(ok)).toBe(false)
  })

  it('e-mail de provedor/contador usado por várias empresas não conta como site próprio', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(SCHEMA)
    const ins = db.prepare('INSERT INTO est (cnpj, basico, email, email_tipo) VALUES (?, ?, ?, 2)')
    for (let i = 0; i < 6; i++) ins.run(`0000000${i}000100`, `0000000${i}`, `cliente${i}@provedorlocal.com.br`)
    ins.run('99999999000100', '99999999', 'contato@clinicapropria.com.br')
    ins.run('99999999000200', '99999999', 'filial@clinicapropria.com.br')
    expect(markSharedDomains(db)).toBe(6)
    const tipos = db.prepare('SELECT email, email_tipo FROM est ORDER BY cnpj').all() as { email: string; email_tipo: number }[]
    expect(tipos.filter((t) => t.email_tipo === 2).map((t) => t.email)).toEqual(['contato@clinicapropria.com.br', 'filial@clinicapropria.com.br'])
    db.close()
  })

  it('formata nomes que vêm em maiúsculas', () => {
    expect(titleCase('CLINICA SORRISO DE CAMPINAS LTDA')).toBe('Clinica Sorriso de Campinas LTDA')
    expect(norm('Poços de Caldas')).toBe('POCOS DE CALDAS')
  })

  it('traduz nichos para as atividades da Receita', () => {
    const table = [{ cod: '7500100', desc_n: norm('Atividades veterinárias') }]
    expect(resolveNiche('Pizzaria', table).nome?.test('PIZZARIA BELLA')).toBe(true)
    expect(resolveNiche('barbearias', table).cnaes).toEqual(['9602501'])
    expect(resolveNiche('Clínica odontológica', table).cnaes).toEqual(['8630504'])
    expect(resolveNiche('atividade veterinária', table).cnaes).toEqual(['7500100'])
    expect(resolveNiche('hamburgueria artesanal xyz', table).nome).toBeInstanceOf(RegExp)
  })
})

// ---------------------------------------------------------------------------
// Servidor de busca com um banco pequeno
// ---------------------------------------------------------------------------

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-busca-'))
const TOKEN = 'teste-teste-teste-teste-123'
let mod: typeof import('../busca/servidor')
let base = ''

beforeAll(async () => {
  const db = new DatabaseSync(path.join(dir, 'busca.db'))
  db.exec(SCHEMA)
  db.exec(`
    INSERT INTO meta VALUES ('mes', '2026-09'), ('ativos', '6');
    INSERT INTO municipio VALUES (6291, 'CAMPINAS', 'CAMPINAS'), (5035, 'POCOS DE CALDAS', 'POCOS DE CALDAS');
    INSERT INTO cnae VALUES ('8630504', 'Atividade odontológica', 'ATIVIDADE ODONTOLOGICA'), ('5611201', 'Restaurantes e similares', 'RESTAURANTES E SIMILARES');
    INSERT INTO qualificacao VALUES ('49', 'Sócio-Administrador'), ('22', 'Sócio');
  `)
  const est = db.prepare('INSERT INTO est VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  // cnpj, basico, fantasia, cnae, cnaes2, uf, mun, bairro, bairro_n, endereco, cep, tel, cel, tel2, email, email_tipo, inicio, matriz
  est.run('11111111000101', '11111111', '', '8630504', '', 'SP', 6291, 'CAMBUI', 'CAMBUI', 'Rua A, 1', '13000000', '5519991110000', 1, null, 'dra@gmail.com', 1, '20240101', 1)
  est.run('22222222000102', '22222222', 'CLINICA B', '8630504', '', 'SP', 6291, 'CENTRO', 'CENTRO', 'Rua B, 2', '13000001', '551932321111', 0, null, 'contato@clinicab.com.br', 2, '20100101', 1)
  est.run('33333333000103', '33333333', 'CLINICA C', '8630504', '', 'SP', 6291, 'CENTRO', 'CENTRO', 'Rua C, 3', '13000002', null, 0, null, null, 0, '20200101', 1)
  est.run('44444444000104', '44444444', 'CLINICA D', '8630504', '', 'MG', 5035, 'CENTRO', 'CENTRO', 'Rua D, 4', '37700000', '553537151111', 0, null, null, 0, '20200101', 1)
  est.run('55555555000105', '55555555', 'PIZZARIA BELLA', '5611201', '', 'SP', 6291, 'CENTRO', 'CENTRO', 'Rua E, 5', '13000003', '551933331111', 0, null, null, 0, '20220101', 1)
  est.run('66666666000106', '66666666', 'CANTINA X', '5611201', '', 'SP', 6291, 'CENTRO', 'CENTRO', 'Rua F, 6', '13000004', '551933332222', 0, null, null, 0, '20220101', 1)
  db.exec(`
    INSERT INTO empresa VALUES ('11111111', 'MARIA SOUZA', '2135', '01'), ('22222222', 'CLINICA B LTDA', '2062', '03');
    INSERT INTO socio VALUES ('22222222', 'PEDRO SOCIO', '22'), ('22222222', 'JOAO ADMIN', '49');
  `)
  db.close()
  process.env.XS_DADOS = dir
  process.env.XS_BUSCA_TOKEN = TOKEN
  mod = await import('../busca/servidor')
  await new Promise<void>((r) => mod.server.listen(0, '127.0.0.1', () => r()))
  const addr = mod.server.address() as { port: number }
  base = `http://127.0.0.1:${addr.port}`
})

afterAll(() => {
  mod?.server.close()
})

describe('busca na base do CNPJ', () => {
  it('acha os dentistas da cidade certa: celular primeiro, depois as mais novas', () => {
    const r = mod.buscar({ cidade: 'Campinas, SP', nichos: ['Dentista'], meta: 10 })
    expect(r.results.map((x) => x.cnpj)).toEqual(['11111111000101', '33333333000103', '22222222000102'])
    expect(r.results[0]).toMatchObject({ name: 'Maria Souza', hasWhatsapp: true, phone: '5519991110000', city: 'Campinas', state: 'SP' })
  })

  it('aplica os filtros de telefone, celular e site (pelo e-mail)', () => {
    const ids = (filtros: object) => mod.buscar({ cidade: 'Campinas, SP', nichos: ['Dentista'], filtros, meta: 10 }).results.map((x) => x.cnpj.slice(0, 1))
    expect(ids({ celular: 1 })).toEqual(['1'])
    expect(ids({ site: -1 })).toEqual(['1', '3'])
    expect(ids({ site: 1 })).toEqual(['2'])
    expect(ids({ telefone: 1 })).toEqual(['1', '2'])
  })

  it('pula quem já está nos leads (telefone ou CNPJ)', () => {
    const r = mod.buscar({ cidade: 'Campinas, SP', nichos: ['Dentista'], meta: 10, conhecidos: { telefones: ['1991110000'], cnpjs: ['22.222.222/0001-02'] } })
    expect(r.results.map((x) => x.cnpj)).toEqual(['33333333000103'])
    expect(r.stats.blocked).toBe(2)
  })

  it('responsável: sócio-administrador primeiro; no MEI, o titular', () => {
    const r = mod.buscar({ cidade: 'Campinas', uf: 'SP', nichos: ['Dentista'], meta: 10 })
    expect(r.results[0]).toMatchObject({ responsibleName: 'Maria Souza', responsibleRole: 'Titular (empresário individual)' })
    expect(r.results.find((x) => x.cnpj === '22222222000102')).toMatchObject({ responsibleName: 'Joao Admin', responsibleRole: 'Sócio-Administrador', siteGuess: 'clinicab.com.br' })
  })

  it('filtra por bairro e acha pizzaria pelo nome', () => {
    expect(mod.buscar({ cidade: 'Campinas, SP', nichos: ['Dentista'], bairros: ['Cambuí'], meta: 10 }).results).toHaveLength(1)
    expect(mod.buscar({ cidade: 'Campinas, SP', nichos: ['Pizzaria'], meta: 10 }).results.map((x) => x.name)).toEqual(['Pizzaria Bella'])
  })

  it('avisa quando a cidade não existe', () => {
    expect(() => mod.buscar({ cidade: 'Cidade Inventada, SP', nichos: ['Dentista'] })).toThrow(/Não achei a cidade/)
  })

  it('HTTP: saúde aberta, busca só com a senha', async () => {
    expect(await (await fetch(`${base}/saude`)).json()).toMatchObject({ ok: true, mes: '2026-09' })
    const body = JSON.stringify({ cidade: 'Campinas, SP', nichos: ['Dentista'] })
    expect((await fetch(`${base}/buscar`, { method: 'POST', body })).status).toBe(401)
    expect((await fetch(`${base}/buscar`, { method: 'POST', body, headers: { Authorization: 'Bearer errada-errada-errada-errada' } })).status).toBe(401)
    const ok = await fetch(`${base}/buscar`, { method: 'POST', body, headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { results: unknown[] }).results).toHaveLength(3)
  })
})
