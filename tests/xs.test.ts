import { describe, expect, it } from 'vitest'
import { calcPrice, DEFAULT_PRICING, funnelMessages, lastMonths, summarize, type ClientPayment, type Funnel, type Transaction } from '../src/lib/biz'
import { buildCampaignPayload, isMobile, phoneKeyBr } from '../src/lib/disparo'
import { knownKeys, mapsToParsed, type MapsResult } from '../src/lib/mapsSearch'
import { fillMessage } from '../src/lib/messages'
import { DEFAULT_SETTINGS, type Lead } from '../src/lib/types'

function lead(patch: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    empresa: 'PADARIA SOL NASCENTE',
    nicho: 'Padaria',
    telefone: '(35) 99876-5432',
    whatsapp: null,
    instagram: null,
    website: null,
    endereco: null,
    cidade: 'Poços de Caldas',
    estado: 'MG',
    avaliacao: null,
    numero_avaliacoes: null,
    pasta: null,
    etapa: null,
    maps_url: null,
    observacoes: null,
    dados_extras: null,
    import_id: null,
    status: 'novo',
    falei_com: null,
    cargo: null,
    anotacoes: null,
    proxima_acao: null,
    ultima_ligacao: null,
    duplicado_ignorado: false,
    created_at: '',
    updated_at: '',
    ...patch,
  }
}

describe('Precificação', () => {
  it('imposto, taxa e margem saem do preço final (markup divisor)', () => {
    const r = calcPrice(DEFAULT_PRICING, { horas: 20, custos_diretos: 100, imposto: 6, taxa_cartao: 4, margem: 30 })
    expect(r.custo_hora).toBeCloseTo(21.875)
    expect(r.custo_total).toBeCloseTo(537.5)
    expect(r.preco_final).toBeCloseTo(537.5 / 0.6)
    // o lucro é exatamente a margem sobre o preço
    expect(r.lucro / r.preco_final).toBeCloseTo(0.3)
  })
})

describe('Financeiro', () => {
  const tx = (p: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(),
    descricao: 'x',
    valor: 100,
    tipo: 'receita',
    categoria: 'Sites',
    data: '2026-10-05',
    status: 'pago',
    payment_id: null,
    client_id: null,
    created_at: '',
    ...p,
  })
  const pay = (p: Partial<ClientPayment>): ClientPayment => ({
    id: 'p',
    client_id: 'c',
    project_id: null,
    descricao: '',
    valor: 500,
    status: 'pendente',
    metodo: 'Pix',
    vencimento: '2026-10-20',
    pago_em: null,
    created_at: '',
    ...p,
  })

  it('resumo do mês separa pago, pendente e o que é de outro mês', () => {
    const s = summarize(
      [tx({ valor: 1000 }), tx({ tipo: 'despesa', valor: 300 }), tx({ tipo: 'despesa', valor: 50, status: 'pendente' }), tx({ valor: 999, data: '2026-09-30' })],
      [pay({}), pay({ id: 'q', vencimento: '2026-11-10' })],
      '2026-10',
    )
    expect(s).toEqual({ receitas: 1000, despesas: 300, saldo: 700, aReceber: 500, aPagar: 50 })
  })

  it('últimos meses em ordem, virando o ano', () => {
    expect(lastMonths(3, new Date(2026, 0, 15))).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('Busca no Maps → leads', () => {
  const result: MapsResult = {
    id: '0x1:0x2',
    name: 'Barbearia Lima',
    niche: 'barbearia',
    phone: '5535997577655',
    website: '',
    instagram: '',
    address: 'R. Cel. Virgílio Silva, 1840',
    city: 'Poços de Caldas',
    state: 'MG',
    rating: 5,
    reviewsCount: 43,
    lat: -21.8,
    lng: -46.56,
    mapsUrl: 'https://www.google.com/maps/place/X/data=!1s0x1:0x2',
    cnpj: '11222333000181',
    responsibleName: 'JOAO LIMA',
    responsibleRole: 'Sócio-Administrador',
    enrichmentConfidence: 'confirmed',
    enrichmentSource: 'BrasilAPI',
    hasWhatsapp: true,
    recurring: false,
  }

  it('vira lead novo com WhatsApp, CNPJ e responsável confirmado', () => {
    const p = mapsToParsed(result, 0)
    expect(p).toMatchObject({ empresa: 'Barbearia Lima', nicho: 'Barbearia', telefone: '5535997577655', whatsapp: '5535997577655', website: null, cnpj: '11222333000181', status: 'novo' })
    expect(p.dados_extras?.['Responsável']).toBe('JOAO LIMA')
  })

  it('CNPJ não confirmado não vira responsável nem CNPJ do lead', () => {
    const p = mapsToParsed({ ...result, enrichmentConfidence: 'review', responsibleName: '' }, 0)
    expect(p.cnpj).toBeNull()
    expect(p.dados_extras?.['Responsável']).toBeUndefined()
    expect(p.dados_extras?.['CNPJ (conferir)']).toBeTruthy()
  })

  it('chaves conhecidas usam DDD + 8 dígitos e o lugar do Maps', () => {
    const k = knownKeys([lead({ telefone: '(35) 9757-7655', maps_url: result.mapsUrl })])
    expect(k.phones).toContain('3597577655')
    expect(k.maps).toContain('cid:2')
  })
})

describe('Disparo', () => {
  const funnel: Funnel = {
    id: 'f',
    nome: 'Primeiro contato',
    etapas: [
      { id: 'a', tipo: 'mensagem', variacoes: ['{saudacao}! Vi a {empresa} em {cidade}.', 'Oi, {saudacao}! Tudo bem na {empresa}?'] },
      { id: 'b', tipo: 'espera', valor: 30, unidade: 'segundos' },
      { id: 'c', tipo: 'mensagem', variacoes: ['Posso mandar um exemplo?', ''] },
      { id: 'd', tipo: 'mensagem', variacoes: ['   '] },
    ],
    created_at: '',
    updated_at: '',
  }

  it('conta só mensagens preenchidas', () => {
    expect(funnelMessages(funnel)).toBe(2)
  })

  it('monta etapas, rodízio de variações e deixa {saudacao} para a hora do envio', () => {
    const { etapas, destinatarios } = buildCampaignPayload(funnel, [lead(), lead({ id: 'l2', empresa: 'Pet Shop Amigo' })], DEFAULT_SETTINGS)
    expect(etapas).toEqual([{ tipo: 'mensagem' }, { tipo: 'espera', ms: 30_000 }, { tipo: 'mensagem' }])
    expect(destinatarios[0].textos[0]).toBe('{saudacao}! Vi a Padaria Sol Nascente em Poços de Caldas.')
    expect(destinatarios[1].textos[0]).toBe('Oi, {saudacao}! Tudo bem na Pet Shop Amigo?')
    expect(destinatarios[0].telefone).toBe('35998765432')
  })

  it('celular e chave de telefone', () => {
    expect(isMobile('35998765432')).toBe(true)
    expect(isMobile('5535998765432')).toBe(true)
    expect(isMobile('3537153269')).toBe(false)
    expect(phoneKeyBr('5535998765432')).toBe(phoneKeyBr('3598765432'))
  })

  it('fillMessage mantém variáveis pedidas', () => {
    expect(fillMessage('{saudacao}, {empresa}', lead(), DEFAULT_SETTINGS, new Date(), ['saudacao'])).toBe('{saudacao}, Padaria Sol Nascente')
  })
})
