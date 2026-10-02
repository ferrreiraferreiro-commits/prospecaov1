import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from '../src/data/localRepository'
import { consecutiveNoAnswer, nextAttempt } from '../src/lib/attempts'
import { cnpjMatchesLead, extractCnpj, formatCnpj, isValidCnpj, leadCnpj, parseCnpjResponse, pickResponsavel } from '../src/lib/cnpj'
import { whatsappChatUrl } from '../src/lib/contact'
import { phoneKey } from '../src/lib/duplicates'
import { contactByHour, meetingStats, needsResult } from '../src/lib/insights'
import { fillMessage, pickVariation, responsavelDoLead, saudacao } from '../src/lib/messages'
import { dueReminders } from '../src/lib/reminders'
import { buildIndex, buildTodayPlan, isHot, opportunityScore, sortLeads, todayQueue } from '../src/lib/selectors'
import { DEFAULT_SETTINGS, type Followup, type Interaction, type Lead, type Meeting, type StatusId } from '../src/lib/types'
import { useApp } from '../src/store/useApp'

const TODAY = '2026-10-01' // quinta-feira

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
    created_at: `2026-09-30T10:00:00.00${id.length}Z`,
    updated_at: '2026-09-30T10:00:00.000Z',
    ...patch,
  }
}

const local = (day: string, hm = '12:00') => new Date(`${day}T${hm}:00`)
let seq = 0
function call(leadId: string, status: StatusId | null, day = TODAY, hm = '12:00'): Interaction {
  seq++
  return { id: `c${seq}`, lead_id: leadId, tipo: 'ligacao', status, falei_com: null, cargo: null, observacao: null, created_at: new Date(local(day, hm).getTime() + seq).toISOString() }
}

const settings = { ...DEFAULT_SETTINGS, nome_vendedor: 'Gabriel Yamashita', servico: 'sites' }

describe('telefone: nono dígito', () => {
  it('celular com e sem o 9 extra contam como o mesmo número', () => {
    expect(phoneKey('5511974487416')).toBe(phoneKey('(11) 7448-7416'))
    expect(phoneKey('+55 11 97448-7416')).toBe('1174487416')
    expect(phoneKey('551147268618')).toBe('1147268618')
    expect(phoneKey('11974487416')).not.toBe(phoneKey('21974487416')) // DDD diferente
  })
})

describe('WhatsApp com mensagem pronta', () => {
  it('coloca o texto codificado no link', () => {
    expect(whatsappChatUrl('5511974487416', 'web', 'Oi, tudo bem?')).toBe('https://web.whatsapp.com/send?phone=5511974487416&text=Oi%2C%20tudo%20bem%3F')
    expect(whatsappChatUrl('5511974487416', 'app')).toBe('whatsapp://send?phone=5511974487416')
  })
})

describe('mensagens', () => {
  const l = lead('1', { empresa: 'PADARIA BOM PÃO', cidade: 'Mogi das Cruzes', nicho: 'Padaria' })

  it('preenche variáveis e some com o responsável quando não existe', () => {
    const text = fillMessage('{saudacao}, {responsavel}! Aqui é o {nome}. Vi a {empresa} em {cidade}.', l, settings, local(TODAY, '09:30'))
    expect(text).toBe('Bom dia! Aqui é o Gabriel. Vi a Padaria Bom Pão em Mogi das Cruzes.')
  })

  it('usa quem atendeu como responsável e remove preposição solta', () => {
    const withContact = { ...l, falei_com: 'CARLA souza', nicho: null }
    expect(fillMessage('{saudacao}, {responsavel}! Exemplo de site para {nicho}.', withContact, settings, local(TODAY, '15:00'))).toBe('Boa tarde, Carla! Exemplo de site.')
  })

  it('saudação pela hora', () => {
    expect(saudacao(local(TODAY, '11:59'))).toBe('Bom dia')
    expect(saudacao(local(TODAY, '12:00'))).toBe('Boa tarde')
    expect(saudacao(local(TODAY, '18:00'))).toBe('Boa noite')
  })

  it('variação é sempre a mesma para o mesmo lead e se distribui entre leads', () => {
    const t = { id: 't', nome: 'T', variacoes: ['A', 'B', ' ', 'C'] }
    expect(pickVariation(t, 'lead-x')).toBe(pickVariation(t, 'lead-x'))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pickVariation(t, `lead-${i}`)))
    expect([...seen].sort()).toEqual(['A', 'B', 'C'])
  })

  it('responsável vindo do arquivo ou do CNPJ conferido', () => {
    expect(responsavelDoLead(lead('2', { dados_extras: { 'Responsável': 'MARIA DE LOURDES' } }))).toBe('Maria')
    const info = { razao_social: 'X', nome_fantasia: null, situacao: null, abertura: null, atividade: null, municipio: null, uf: null, telefone: null, email: null, socios: [{ nome: 'JOAO PEREIRA', qualificacao: 'Sócio-Administrador' }], consultado_em: '' }
    expect(responsavelDoLead(lead('3', { cnpj_info: { ...info, confere: true } }))).toBe('Joao')
    expect(responsavelDoLead(lead('3', { cnpj_info: { ...info, confere: false } }))).toBe('')
  })
})

describe('CNPJ', () => {
  it('valida dígitos verificadores e formata', () => {
    expect(isValidCnpj('19.131.243/0001-97')).toBe(true)
    expect(isValidCnpj('19.131.243/0001-98')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(formatCnpj('19131243000197')).toBe('19.131.243/0001-97')
    expect(extractCnpj('CNPJ: 19.131.243/0001-97 - Matriz')).toBe('19131243000197')
    expect(leadCnpj(lead('1', { dados_extras: { CNPJ: '19.131.243/0001-97' } }))).toBe('19131243000197')
  })

  it('sócio administrador vem antes de sócio comum', () => {
    expect(pickResponsavel([{ nome: 'A', qualificacao: 'Sócio' }, { nome: 'B', qualificacao: 'Sócio-Administrador' }])?.nome).toBe('B')
  })

  it('só confere quando nome, telefone e cidade batem', () => {
    const l = lead('1', { empresa: 'PADARIA BOM PÃO LTDA', telefone: '5511974487416', cidade: 'Mogi das Cruzes' })
    const base = { razao_social: 'BOM PAO PADARIA E CONFEITARIA LTDA', nome_fantasia: null, telefone: '1174487416', municipio: 'MOGI DAS CRUZES' }
    expect(cnpjMatchesLead(base, l)).toBe(true)
    expect(cnpjMatchesLead({ ...base, telefone: '1133334444' }, l)).toBe(false)
    expect(cnpjMatchesLead({ ...base, municipio: 'SAO PAULO' }, l)).toBe(false)
    expect(cnpjMatchesLead({ ...base, razao_social: 'OFICINA DO ZE LTDA' }, l)).toBe(false)
  })

  it('lê a resposta da BrasilAPI', () => {
    const info = parseCnpjResponse(
      { razao_social: 'BOM PAO PADARIA LTDA', municipio: 'MOGI DAS CRUZES', ddd_telefone_1: '1174487416', qsa: [{ nome_socio: 'MARIA SOUZA', qualificacao_socio: 'Sócio-Administrador' }] },
      lead('1', { empresa: 'Padaria Bom Pão', telefone: '5511974487416', cidade: 'Mogi das Cruzes' }),
    )
    expect(info).toMatchObject({ razao_social: 'BOM PAO PADARIA LTDA', confere: true, socios: [{ nome: 'MARIA SOUZA', qualificacao: 'Sócio-Administrador' }] })
  })
})

describe('tentativas automáticas', () => {
  it('conta só as tentativas seguidas sem resposta', () => {
    const calls = [call('a', 'nao_atendeu', '2026-09-27'), call('a', 'falei_responsavel', '2026-09-28'), call('a', 'so_chama', '2026-09-29'), call('a', 'nao_atendeu', '2026-09-30'), call('a', null)]
    expect(consecutiveNoAnswer(calls)).toBe(2)
    expect(consecutiveNoAnswer(calls, calls[3].id)).toBe(1)
  })

  it('próxima tentativa no dia seguinte, no período oposto, pulando domingo', () => {
    expect(nextAttempt(local(TODAY, '10:00'))).toEqual({ data: '2026-10-02', periodo: 'tarde' })
    expect(nextAttempt(local(TODAY, '15:00'))).toEqual({ data: '2026-10-02', periodo: 'manha' })
    expect(nextAttempt(local('2026-10-03', '10:00'))).toEqual({ data: '2026-10-05', periodo: 'tarde' }) // sábado → segunda
  })

  it('lead que esgotou as tentativas sai da fila do dia', () => {
    const leads = [lead('a', { status: 'nao_atendeu' }), lead('b', { status: 'nao_atendeu' })]
    const calls = [...['2026-09-25', '2026-09-26', '2026-09-27'].map((d) => call('a', 'nao_atendeu', d)), call('b', 'nao_atendeu', '2026-09-27')]
    const plan = buildTodayPlan(leads, calls, buildIndex([], [], calls), [], TODAY, 3)
    expect(plan.esgotados.map((e) => e.lead.id)).toEqual(['a'])
    expect(todayQueue(plan)).toEqual(['b'])
  })
})

describe('prioridade inteligente', () => {
  it('sem site + bem avaliado + muitas avaliações vem primeiro', () => {
    const quente = lead('q', { avaliacao: 4.8, numero_avaliacoes: 120 })
    const comSite = lead('s', { avaliacao: 4.8, numero_avaliacoes: 120, website: 'x.com' })
    const fraco = lead('f', { avaliacao: 3.2, numero_avaliacoes: 3 })
    expect(opportunityScore(quente)).toBe(8)
    expect(isHot(quente)).toBe(true)
    expect(isHot(comSite)).toBe(false)
    const idx = buildIndex([], [], [])
    expect(sortLeads([fraco, comSite, quente], 'prioridade', idx, TODAY).map((l) => l.id)).toEqual(['q', 's', 'f'])
    expect(sortLeads([fraco, comSite, quente], 'oportunidade', idx, TODAY)[0].id).toBe('q')
  })
})

describe('melhor horário', () => {
  it('taxa de atendimento por dia e faixa, com amostra mínima', () => {
    // quinta 10h: 5 ligações, 4 atenderam. quinta 15h: 5, 1 atendeu.
    const calls = [
      ...Array.from({ length: 4 }, () => call('a', 'falei_responsavel', TODAY, '10:15')),
      call('a', 'nao_atendeu', TODAY, '10:40'),
      call('a', 'falei_responsavel', TODAY, '15:10'),
      ...Array.from({ length: 4 }, () => call('a', 'nao_atendeu', TODAY, '15:20')),
      call('a', null, TODAY, '16:00'), // sem resultado não conta
    ]
    const s = contactByHour(calls)
    expect(s.total).toEqual({ ligacoes: 10, atenderam: 5 })
    expect(s.best).toEqual({ day: 4, hour: 10, rate: 0.8, ligacoes: 5 })
    expect(s.days).not.toContain(0) // domingo só aparece com dado
  })
})

describe('reuniões e vendas', () => {
  const m = (id: string, data: string, patch: Partial<Meeting> = {}): Meeting => ({ id, lead_id: 'a', data, horario: '10:00', contato: null, observacao: null, created_at: '2026-09-20T10:00:00.000Z', ...patch })

  it('resume realizadas, no-show, fechadas e faturamento', () => {
    const list = [
      m('1', '2026-09-25', { resultado: 'fechou', valor: 1500 }),
      m('2', '2026-09-26', { resultado: 'fechou', valor: 900 }),
      m('3', '2026-09-27', { resultado: 'perdeu' }),
      m('4', '2026-09-28', { resultado: 'nao_compareceu' }),
      m('5', '2026-09-29'),
      m('6', '2026-10-05'),
    ]
    const s = meetingStats(list, null, local(TODAY, '09:00'))
    expect(s).toMatchObject({ agendadas: 6, realizadas: 3, fechadas: 2, naoCompareceu: 1, semResultado: 1, faturamento: 2400, ticketMedio: 1200 })
    expect(s.taxaFechamento).toBeCloseTo(2 / 3)
    expect(s.taxaComparecimento).toBeCloseTo(3 / 4)
  })

  it('reunião de hoje só pede resultado depois do horário', () => {
    expect(needsResult(m('x', TODAY, { horario: '14:00' }), local(TODAY, '13:00'))).toBe(false)
    expect(needsResult(m('x', TODAY, { horario: '14:00' }), local(TODAY, '14:30'))).toBe(true)
    expect(needsResult(m('x', '2026-09-30', { resultado: 'realizada' }), local(TODAY))).toBe(false)
  })
})

describe('avisos', () => {
  const leads = [lead('a'), lead('b')]
  const f = (id: string, patch: Partial<Followup>): Followup => ({ id, lead_id: 'a', data: TODAY, horario: null, periodo: null, observacao: null, concluido: false, created_at: '', ...patch })

  it('retorno com horário avisa na hora (até 2h depois) e uma vez só', () => {
    const fus = [f('1', { horario: '14:30' })]
    expect(dueReminders(fus, [], leads, new Set(), local(TODAY, '14:29'))).toHaveLength(0)
    const due = dueReminders(fus, [], leads, new Set(), local(TODAY, '14:31'))
    expect(due).toHaveLength(1)
    expect(dueReminders(fus, [], leads, new Set([due[0].key]), local(TODAY, '14:32'))).toHaveLength(0)
    expect(dueReminders(fus, [], leads, new Set(), local(TODAY, '17:00'))).toHaveLength(0)
  })

  it('retornos por período viram um aviso só, e reunião avisa 10 min antes', () => {
    const fus = [f('1', { periodo: 'tarde' }), f('2', { periodo: 'tarde', lead_id: 'b' })]
    const due = dueReminders(fus, [], leads, new Set(), local(TODAY, '14:05'))
    expect(due).toHaveLength(1)
    expect(due[0].title).toBe('2 retornos para a tarde')
    const meeting: Meeting = { id: 'm', lead_id: 'a', data: TODAY, horario: '16:00', contato: 'Carla', observacao: null, created_at: '' }
    expect(dueReminders([], [meeting], leads, new Set(), local(TODAY, '15:49'))).toHaveLength(0)
    expect(dueReminders([], [meeting], leads, new Set(), local(TODAY, '15:51'))[0].title).toContain('Reunião às 16:00')
  })
})

// ---------------------------------------------------------------------------
// Ações do store
// ---------------------------------------------------------------------------

const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('store: mensagem, reunião e CNPJ', () => {
  beforeEach(async () => {
    mem.clear()
    await useApp.getState().init(new LocalRepository())
    await useApp.getState().importLeads([{ index: 1, ...lead('x'), status: 'pediu_whatsapp' }], 'teste.txt')
  })

  it('mensagem vai para o histórico e marca Status 2 vazio', async () => {
    const id = useApp.getState().leads[0].id
    await useApp.getState().logMessage(id, 'Oi!', 'Depois da ligação')
    const s = useApp.getState()
    expect(s.interactions.find((i) => i.tipo === 'mensagem')?.observacao).toBe('[Depois da ligação] Oi!')
    expect(s.leads[0].status2).toBe('Mensagem enviada')
    // persiste no repositório local
    const reloaded = await new LocalRepository().load()
    expect(reloaded.interactions.some((i) => i.tipo === 'mensagem')).toBe(true)
  })

  it('resultado da reunião salva valor e vira Status 2 "Fechado"', async () => {
    const id = useApp.getState().leads[0].id
    await useApp.getState().saveOutcome({ leadId: id, mode: 'call', status: 'agendou_reuniao', meeting: { data: '2026-09-29', horario: '10:00', contato: 'Ana', observacao: null } })
    const meetingId = useApp.getState().meetings[0].id
    await useApp.getState().setMeetingResult(meetingId, 'fechou', 1800)
    const s = useApp.getState()
    expect(s.meetings[0]).toMatchObject({ resultado: 'fechou', valor: 1800 })
    expect(s.leads[0].status2).toBe('Fechado')
    expect((await new LocalRepository().load()).meetings[0].valor).toBe(1800)
  })

  it('CNPJ consultado fica no lead', async () => {
    const id = useApp.getState().leads[0].id
    const info = parseCnpjResponse({ razao_social: 'EMPRESA X LTDA' }, useApp.getState().leads[0])
    await useApp.getState().saveCnpj(id, '19131243000197', info)
    expect(useApp.getState().leads[0]).toMatchObject({ cnpj: '19131243000197', cnpj_info: { razao_social: 'EMPRESA X LTDA' } })
  })
})
