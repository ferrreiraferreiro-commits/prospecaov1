import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from '../src/data/localRepository'
import { addDays, todayKey } from '../src/lib/dates'
import { parseLeadsTxt } from '../src/lib/parser'
import { buildIndex, buildTodayPlan, computeMetrics, matchesQuick } from '../src/lib/selectors'
import { useApp } from '../src/store/useApp'

// localStorage em memória para rodar o repositório local no Node
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

const sample = readFileSync(new URL('./fixtures/relatorio_exemplo.txt', import.meta.url), 'utf-8')

async function freshApp() {
  mem.clear()
  await useApp.getState().init(new LocalRepository())
  await useApp.getState().importLeads(parseLeadsTxt(sample).leads, 'relatorio.txt')
  return useApp.getState().leads
}

describe('fluxo de prospecção (store + repositório local)', () => {
  beforeEach(async () => {
    await freshApp()
  })

  it('importa preservando ordem e dados', () => {
    const { leads, imports } = useApp.getState()
    expect(leads.map((l) => l.empresa)).toEqual(['COMERCIAL RAMOS', 'EMPÓRIO MÉDICO - ARTIGOS MÉDICOS E ORTOPÉDICOS', 'COMERCIAL RAMOS'])
    expect(imports[0]).toMatchObject({ arquivo: 'relatorio.txt', quantidade_leads: 3 })
    expect(leads.every((l) => l.status === 'novo' && l.website === null && l.instagram === null)).toBe(true)
  })

  it('"Liguei" registra a ligação na hora e o resultado atualiza a mesma ligação', async () => {
    const lead = useApp.getState().leads[1]
    const call = await useApp.getState().registerCall(lead.id)
    expect(useApp.getState().leads[1].ultima_ligacao).toBe(call.created_at)

    await useApp.getState().saveOutcome({
      leadId: lead.id,
      mode: 'call',
      callId: call.id,
      status: 'follow_up',
      falei_com: 'Carla',
      cargo: 'Sócia',
      observacao: 'Pediu para ligar amanhã à tarde',
      followup: { data: addDays(todayKey(), 1), horario: null, periodo: 'tarde' },
    })

    const s = useApp.getState()
    const calls = s.interactions.filter((i) => i.tipo === 'ligacao')
    expect(calls).toHaveLength(1) // não duplicou
    expect(calls[0]).toMatchObject({ id: call.id, status: 'follow_up', falei_com: 'Carla', cargo: 'Sócia' })
    expect(s.leads[1]).toMatchObject({ status: 'follow_up', falei_com: 'Carla', cargo: 'Sócia' })
    expect(s.followups).toHaveLength(1)
    expect(s.interactions.some((i) => i.tipo === 'followup' && /Retorno agendado/.test(i.observacao ?? ''))).toBe(true)

    // Persistiu no navegador
    const reloaded = await new LocalRepository().load()
    expect(reloaded.followups).toHaveLength(1)
    expect(reloaded.interactions.find((i) => i.id === call.id)?.status).toBe('follow_up')

    // Amanhã ele aparece na lista "Para ligar" e na tela Hoje
    const tomorrow = addDays(todayKey(), 1)
    const index = buildIndex(s.followups, s.meetings, s.interactions)
    expect(matchesQuick('para_ligar', s.leads[1], index, new Set(), tomorrow)).toBe(true)
    const plan = buildTodayPlan(s.leads, s.interactions, index, s.meetings, tomorrow)
    expect(plan.followups.map((f) => f.lead.id)).toEqual([lead.id])
  })

  it('ligar de novo conclui o retorno pendente e mantém o histórico', async () => {
    const lead = useApp.getState().leads[0]
    await useApp.getState().saveOutcome({ leadId: lead.id, mode: 'call', status: 'so_chama', followup: { data: todayKey(), horario: '15:00', periodo: null } })
    await useApp.getState().saveOutcome({ leadId: lead.id, mode: 'call', status: 'falei_responsavel', falei_com: 'João', observacao: 'Pediu para chamar amanhã.' })
    const s = useApp.getState()
    expect(s.interactions.filter((i) => i.tipo === 'ligacao').map((i) => i.status)).toEqual(['so_chama', 'falei_responsavel'])
    expect(s.followups.every((f) => f.concluido)).toBe(true)
  })

  it('reunião conta no indicador e entra na agenda', async () => {
    const lead = useApp.getState().leads[2]
    await useApp.getState().saveOutcome({
      leadId: lead.id,
      mode: 'call',
      status: 'agendou_reuniao',
      falei_com: 'Paulo',
      meeting: { data: addDays(todayKey(), 2), horario: '10:00', contato: null, observacao: 'Online' },
    })
    const s = useApp.getState()
    expect(s.meetings[0]).toMatchObject({ contato: 'Paulo', horario: '10:00' })
    const m = computeMetrics(s.leads, s.interactions, s.followups, s.meetings)
    expect(m).toMatchObject({ ligacoes: 1, atenderam: 1, reunioes: 1, trabalhados: 1, naoTrabalhados: 2 })
    expect(m.hoje).toEqual({ ligacoes: 1, atenderam: 1, reunioes: 1 })
  })

  it('desfazer ligação remove o registro e restaura a última ligação', async () => {
    const lead = useApp.getState().leads[0]
    const call = await useApp.getState().registerCall(lead.id)
    await useApp.getState().discardCall(call.id)
    const s = useApp.getState()
    expect(s.interactions).toHaveLength(0)
    expect(s.leads[0].ultima_ligacao).toBeNull()
  })

  it('mudança de status sem ligação vira histórico, não ligação', async () => {
    const lead = useApp.getState().leads[0]
    await useApp.getState().saveOutcome({ leadId: lead.id, mode: 'status', status: 'nao_tem_interesse' })
    const s = useApp.getState()
    expect(s.interactions).toHaveLength(1)
    expect(s.interactions[0]).toMatchObject({ tipo: 'status', status: 'nao_tem_interesse', observacao: 'Novo → Não tem interesse' })
    expect(computeMetrics(s.leads, s.interactions, s.followups, s.meetings).ligacoes).toBe(0)
  })

  it('excluir lead apaga o histórico dele', async () => {
    const lead = useApp.getState().leads[0]
    await useApp.getState().saveOutcome({ leadId: lead.id, mode: 'call', status: 'so_chama' })
    await useApp.getState().deleteLeads([lead.id])
    const reloaded = await new LocalRepository().load()
    expect(reloaded.leads).toHaveLength(2)
    expect(reloaded.interactions).toHaveLength(0)
  })
})

describe('clique duplo', () => {
  it('dois cliques seguidos registram uma única ligação', async () => {
    await freshApp()
    const lead = useApp.getState().leads[0]
    const a = await useApp.getState().registerCall(lead.id)
    const b = await useApp.getState().registerCall(lead.id)
    expect(b.id).toBe(a.id)
    expect(useApp.getState().interactions.filter((i) => i.tipo === 'ligacao')).toHaveLength(1)
  })
})

describe('Status 2 e roteiro nas ligações', () => {
  it('Status 2 é salvo no lead, vira histórico e pode ser removido', async () => {
    await freshApp()
    const lead = useApp.getState().leads[0]
    await useApp.getState().setStatus2(lead.id, 'Mensagem enviada')
    await useApp.getState().setStatus2(lead.id, 'Mensagem enviada') // repetido: ignorado
    expect(useApp.getState().leads[0].status2).toBe('Mensagem enviada')
    expect(useApp.getState().leads[0].status).toBe('novo') // status principal intacto
    await useApp.getState().setStatus2(lead.id, null)
    const logs = useApp.getState().interactions.filter((i) => i.tipo === 'status2').map((i) => i.observacao)
    expect(logs).toEqual(['Status 2: Mensagem enviada', 'Status 2 removido (era “Mensagem enviada”)'])
    const reloaded = await new LocalRepository().load()
    expect(reloaded.leads[0].status2).toBeNull()
  })

  it('cada ligação guarda o roteiro em uso', async () => {
    await freshApp()
    const s = useApp.getState()
    await s.saveSettings({ ...s.settings, roteiros: [{ id: 'r1', nome: 'A', secoes: [], objecoes: [] }, { id: 'r2', nome: 'B', secoes: [], objecoes: [] }], roteiro_ativo: 'r2' })
    const call = await useApp.getState().registerCall(s.leads[0].id)
    expect(call.roteiro_id).toBe('r2')
  })
})
