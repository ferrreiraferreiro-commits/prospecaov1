import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatPhone, instagramHref, telHref, websiteHref, whatsappHref } from '../src/lib/contact'
import { addDays, formatRelative } from '../src/lib/dates'
import { detectDuplicates, mapsKey } from '../src/lib/duplicates'
import { parseLeadsTxt } from '../src/lib/parser'
import { buildIndex, buildTodayPlan, computeMetrics, matchesQuick, matchesSearch, todayQueue } from '../src/lib/selectors'
import { fillTemplate, leadHooks, leadInsights, titleCase } from '../src/lib/script'
import { DEFAULT_SETTINGS, type Followup, type Interaction, type Lead, type Meeting, type StatusId } from '../src/lib/types'

const TODAY = '2026-10-01'

function lead(id: string, patch: Partial<Lead> = {}): Lead {
  return {
    id,
    empresa: `EMPRESA ${id}`,
    nicho: null,
    telefone: null,
    whatsapp: null,
    instagram: null,
    website: null,
    endereco: null,
    cidade: null,
    estado: null,
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
    created_at: `2026-09-30T10:00:0${id.length}.000Z`,
    updated_at: '2026-09-30T10:00:00.000Z',
    ...patch,
  }
}

const at = (day: string, hm = '12:00') => new Date(`${day}T${hm}:00`).toISOString()

function call(leadId: string, status: StatusId | null, day = TODAY): Interaction {
  return { id: `c-${leadId}-${Math.random()}`, lead_id: leadId, tipo: 'ligacao', status, falei_com: null, cargo: null, observacao: null, created_at: at(day) }
}

function fu(leadId: string, data: string, concluido = false): Followup {
  return { id: `f-${leadId}-${data}`, lead_id: leadId, data, horario: null, periodo: 'tarde', observacao: null, concluido, created_at: at(TODAY) }
}

describe('duplicidade', () => {
  it('o arquivo real não tem duplicados (mesmo nome, telefone e Maps diferentes)', () => {
    const parsed = parseLeadsTxt(readFileSync(new URL('./fixtures/relatorio_exemplo.txt', import.meta.url), 'utf-8'))
    const items = parsed.leads.map((p, i) => ({ ...p, id: String(i) }))
    expect(detectDuplicates(items).size).toBe(0)
  })

  it('detecta por telefone (com e sem DDI), Maps e nome+endereço', () => {
    const items = [
      { id: 'a', empresa: 'X', telefone: '551147268618', endereco: null, maps_url: null },
      { id: 'b', empresa: 'Y', telefone: '(11) 4726-8618', endereco: null, maps_url: null },
      { id: 'c', empresa: 'Z', telefone: null, endereco: null, maps_url: 'https://www.google.com/maps/place/Z/data=!4m7!3m6!1s0x94cd:0xaf2c!8m2?authuser=0' },
      { id: 'd', empresa: 'W', telefone: null, endereco: null, maps_url: 'https://www.google.com/maps/place/Z/data=!4m7!3m6!1s0x94cd:0xaf2c!8m2?authuser=1&hl=en' },
      { id: 'e', empresa: 'Loja Boa', telefone: null, endereco: 'Rua A, 10', maps_url: null },
      { id: 'f', empresa: 'LOJA BOA', telefone: null, endereco: 'rua a 10', maps_url: null },
      { id: 'g', empresa: 'Loja Boa', telefone: null, endereco: null, maps_url: null },
    ]
    const d = detectDuplicates(items)
    expect(d.get('a')?.[0]).toEqual({ otherId: 'b', reasons: ['telefone'] })
    expect(d.get('c')?.[0].reasons).toEqual(['maps'])
    expect(d.get('e')?.[0]).toEqual({ otherId: 'f', reasons: ['nome_endereco'] })
    expect(d.has('g')).toBe(false)
  })

  it('mapsKey ignora parâmetros de sessão', () => {
    expect(mapsKey('https://www.google.com/maps/place/A/data=!1s0xABC:0xDEF!8m2?hl=pt')).toBe('cid:3567')
  })

  it('mapsKey reconhece o mesmo lugar no link antigo (feature id) e no da Places API (cid)', () => {
    const antigo = 'https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x94c9dcee4ccabf6f:0x242bc92aa9f9d2c8!8m2'
    const novo = `https://maps.google.com/?cid=${BigInt('0x242bc92aa9f9d2c8')}`
    expect(mapsKey(antigo)).toBe(mapsKey(novo))
  })
})

describe('métricas', () => {
  it('conta ligações, contatos, reuniões, hoje e ontem', () => {
    const leads = [lead('1', { status: 'agendou_reuniao' }), lead('2', { status: 'so_chama' }), lead('3'), lead('4', { status: 'numero_incorreto' })]
    const interactions = [
      call('1', 'so_chama', addDays(TODAY, -1)),
      call('1', 'agendou_reuniao'),
      call('2', 'so_chama'),
      call('4', 'numero_incorreto', addDays(TODAY, -1)),
    ]
    const meetings: Meeting[] = [{ id: 'm', lead_id: '1', data: addDays(TODAY, 2), horario: '10:00', contato: 'João', observacao: null, created_at: at(TODAY) }]
    const m = computeMetrics(leads, interactions, [fu('2', TODAY)], meetings, TODAY)
    expect(m.totalLeads).toBe(4)
    expect(m.trabalhados).toBe(3)
    expect(m.naoTrabalhados).toBe(1)
    expect(m.ligacoes).toBe(4)
    expect(m.atenderam).toBe(1)
    expect(m.reunioes).toBe(1)
    expect(m.hoje).toEqual({ ligacoes: 2, atenderam: 1, reunioes: 1 })
    expect(m.ontem).toEqual({ ligacoes: 2, atenderam: 0, reunioes: 0 })
    expect(m.taxaContato).toBe(0.25)
    expect(m.taxaReuniao).toBe(1)
    expect(m.numerosIncorretos).toBe(1)
    expect(m.followupsHoje).toBe(1)
  })

  it('ligação sem resultado conta como ligação, não como contato', () => {
    const m = computeMetrics([lead('1')], [call('1', null)], [], [], TODAY)
    expect(m.ligacoes).toBe(1)
    expect(m.atenderam).toBe(0)
    expect(m.trabalhados).toBe(1)
  })
})

describe('tela Hoje', () => {
  it('separa retornos, tentar novamente, novos e reuniões', () => {
    const leads = [
      lead('1', { status: 'follow_up' }),
      lead('2', { status: 'follow_up' }),
      lead('3', { status: 'so_chama', ultima_ligacao: at(addDays(TODAY, -1)) }),
      lead('4', { status: 'so_chama', ultima_ligacao: at(TODAY) }),
      lead('5'),
      lead('6', { status: 'agendou_reuniao' }),
      lead('7', { status: 'follow_up' }),
    ]
    const followups = [fu('1', TODAY), fu('2', addDays(TODAY, -2)), fu('7', addDays(TODAY, 3))]
    const meetings: Meeting[] = [{ id: 'm', lead_id: '6', data: TODAY, horario: '15:00', contato: null, observacao: null, created_at: at(TODAY) }]
    const interactions = [call('3', 'so_chama', addDays(TODAY, -1)), call('4', 'so_chama')]
    const index = buildIndex(followups, meetings, interactions)
    const plan = buildTodayPlan(leads, interactions, index, meetings, TODAY)

    expect(plan.followups.map((f) => [f.lead.id, f.atrasado])).toEqual([
      ['2', true],
      ['1', false],
    ])
    expect(plan.tentarNovamente.map((t) => t.lead.id)).toEqual(['3'])
    expect(plan.novos.map((l) => l.id)).toEqual(['5'])
    expect(plan.reunioesHoje.map((r) => r.lead.id)).toEqual(['6'])
    expect(plan.feitasHoje.map((f) => f.lead.id)).toEqual(['4'])
    expect(todayQueue(plan)).toEqual(['2', '1', '3', '5'])
  })

  it('follow-up aparece em "Para ligar" quando chega o dia', () => {
    const l = lead('1', { status: 'follow_up' })
    const index = buildIndex([fu('1', addDays(TODAY, 1))], [], [])
    expect(matchesQuick('para_ligar', l, index, new Set(), TODAY)).toBe(false)
    expect(matchesQuick('para_ligar', l, index, new Set(), addDays(TODAY, 1))).toBe(true)
    expect(matchesQuick('follow_up', l, index, new Set(), TODAY)).toBe(true)
  })
})

describe('busca', () => {
  it('encontra por nome sem acento, cidade e trecho do telefone', () => {
    const l = lead('1', { empresa: 'EMPÓRIO MÉDICO', cidade: 'Mogi das Cruzes', telefone: '5511974487416' })
    expect(matchesSearch(l, 'emporio')).toBe(true)
    expect(matchesSearch(l, 'mogi')).toBe(true)
    expect(matchesSearch(l, '97448')).toBe(true)
    expect(matchesSearch(l, 'padaria')).toBe(false)
  })
})

describe('contatos', () => {
  it('formata e gera links sem inventar dados', () => {
    expect(formatPhone('551147268618')).toBe('(11) 4726-8618')
    expect(formatPhone('5511974487416')).toBe('(11) 97448-7416')
    expect(telHref('11974487416')).toBe('tel:+5511974487416')
    expect(whatsappHref('https://wa.me/551147268618')).toBe('https://wa.me/551147268618')
    expect(whatsappHref(null)).toBeNull()
    expect(instagramHref('@loja')).toBe('https://instagram.com/loja')
    expect(websiteHref('loja.com.br')).toBe('https://loja.com.br')
  })

  it('formatRelative', () => {
    const now = new Date(`${TODAY}T20:00:00`)
    expect(formatRelative(at(TODAY, '14:32'), now)).toBe('hoje 14:32')
    expect(formatRelative(at(addDays(TODAY, -1), '16:51'), now)).toBe('ontem 16:51')
  })
})

describe('roteiro', () => {
  it('adapta o contexto ao lead sem site e bem avaliado', () => {
    const l = lead('1', { empresa: 'CIRÚRGICA ORTOMED BERTIOGA', avaliacao: 4.9, numero_avaliacoes: 32 })
    const insights = leadInsights(l).map((i) => i.id)
    expect(insights).toContain('sem_site')
    expect(insights).toContain('bem_avaliada')
    expect(leadHooks(l, DEFAULT_SETTINGS)[0]).toMatch(/ainda não têm um site próprio/)
    expect(titleCase('COMERCIAL RAMOS DE MOGI')).toBe('Comercial Ramos de Mogi')
    expect(fillTemplate('Falo com a {empresa}? Sou {nome}.', l, { ...DEFAULT_SETTINGS, nome_vendedor: 'Gabriel' })).toBe(
      'Falo com a Cirúrgica Ortomed Bertioga? Sou Gabriel.',
    )
  })
})

describe('WhatsApp', () => {
  it('monta o número com +55 e prefere o WhatsApp do cadastro', async () => {
    const { whatsappTarget, whatsappChatUrl, whatsappDigits } = await import('../src/lib/contact')
    expect(whatsappDigits('https://wa.me/551147268618')).toBe('551147268618')
    expect(whatsappTarget({ whatsapp: 'https://wa.me/5511974487416', telefone: '1140000000' })).toEqual({ number: '5511974487416', fromPhone: false })
    expect(whatsappTarget({ whatsapp: null, telefone: '(11) 96843-1637' })).toEqual({ number: '5511968431637', fromPhone: true })
    expect(whatsappTarget({ whatsapp: 'Não informado', telefone: '123' })).toBeNull()
    expect(whatsappChatUrl('5511968431637', 'web')).toBe('https://web.whatsapp.com/send?phone=5511968431637')
    expect(whatsappChatUrl('5511968431637', 'app')).toBe('whatsapp://send?phone=5511968431637')
  })
})

describe('zerar contadores e roteiros', () => {
  it('métricas contam só a partir de metricas_desde, sem apagar nada', async () => {
    const { statsByRoteiro } = await import('../src/lib/selectors')
    const leads = [lead('1', { status: 'falei_responsavel' })]
    const old = { ...call('1', 'falei_responsavel', addDays(TODAY, -3)), roteiro_id: 'a' }
    const novo = { ...call('1', 'agendou_reuniao'), roteiro_id: 'b' }
    const since = at(addDays(TODAY, -1))
    const all = computeMetrics(leads, [old, novo], [], [], TODAY)
    const reset = computeMetrics(leads, [old, novo], [], [], TODAY, since)
    expect(all.ligacoes).toBe(2)
    expect(reset.ligacoes).toBe(1)
    expect(reset.trabalhados).toBe(1) // estado dos leads não muda
    const porRoteiro = statsByRoteiro([old, novo], 'a')
    expect(porRoteiro.find((r) => r.roteiroId === 'b')).toMatchObject({ ligacoes: 1, atenderam: 1, reunioes: 1, taxaReuniao: 1 })
    expect(statsByRoteiro([old, novo], 'a', since).map((r) => r.roteiroId)).toEqual(['b'])
  })

  it('roteiro legado vira o "Roteiro padrão" e o ativo é respeitado', async () => {
    const { getRoteiros, getActiveRoteiro } = await import('../src/lib/script')
    const legado = { ...DEFAULT_SETTINGS, roteiro: [{ id: 'x', titulo: 'Oi', texto: 'Olá' }] }
    expect(getRoteiros(legado)).toHaveLength(1)
    expect(getRoteiros(legado)[0]).toMatchObject({ id: 'padrao', nome: 'Roteiro padrão' })
    expect(getRoteiros(legado)[0].secoes[0].texto).toBe('Olá')
    const dois = {
      ...DEFAULT_SETTINGS,
      roteiros: [
        { id: 'r1', nome: 'A', secoes: [], objecoes: [] },
        { id: 'r2', nome: 'B', secoes: [], objecoes: [] },
      ],
      roteiro_ativo: 'r2',
    }
    expect(getActiveRoteiro(dois).nome).toBe('B')
    expect(getActiveRoteiro({ ...dois, roteiro_ativo: 'apagado' }).nome).toBe('A')
  })

  it('{nome} usa só o primeiro nome', () => {
    const l = lead('1')
    expect(fillTemplate('Aqui é o {nome}.', l, { ...DEFAULT_SETTINGS, nome_vendedor: 'Gabriel Yamashita Marcelino' })).toBe('Aqui é o Gabriel.')
  })
})
