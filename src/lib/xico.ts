// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { monthKey, summarize } from './biz'
import { CATEGORIAS } from './categorias'
import { todayKey } from './dates'
import { STATUS_MAP } from './statuses'
import type { Lead } from './types'
import { useApp } from '../store/useApp'
import { useBiz } from '../store/useBiz'

/**
 * Xico, o assistente do dono. A conversa e a IA ficam no servidor (motor/src/agente/xico.ts); as
 * ferramentas do CRM rodam aqui, porque os leads, clientes, projetos e o financeiro estão carregados
 * no app. Quando o Xico pede uma delas, o app executa e devolve o resultado.
 */

export interface MensagemXico {
  id: string
  de: 'voce' | 'xico' | 'nota'
  texto: string
  em: string
  acoes?: string[]
}

export interface PropostaXico {
  id: string
  titulo: string
  detalhe: string
  em: string
}

export interface Lembranca {
  id: string
  texto: string
  em: string
}

export interface ChamadaApp {
  id: string
  name: string
  input: Record<string, unknown>
}

/** Prompt de site de um cliente (sem o texto: ele vem ao abrir). */
export interface PromptSiteResumo {
  id: string
  empresa: string
  versao: number
  origem: string
  ajustes: string
  incompleto: boolean
  em: string
  tamanho: number
}

export interface EstadoXico {
  estado: 'livre' | 'pensando' | 'esperando_app'
  fazendo: string
  chamadasApp: ChamadaApp[]
  mensagens: MensagemXico[]
  propostas: PropostaXico[]
  memoria: Lembranca[]
  prompts: PromptSiteResumo[]
  temChave: boolean
}

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

function acharLead(ref: unknown): Lead {
  const leads = useApp.getState().leads
  const r = norm(ref)
  const lead = leads.find((l) => l.id === ref) ?? leads.find((l) => norm(l.empresa) === r) ?? leads.find((l) => norm(l.empresa).includes(r))
  if (!lead) throw new Error(`Não achei lead com "${String(ref)}".`)
  return lead
}

const resumoLead = (l: Lead) => ({
  id: l.id,
  empresa: l.empresa,
  nicho: l.nicho,
  cidade: l.cidade,
  telefone: l.whatsapp || l.telefone,
  status: STATUS_MAP[l.status]?.label ?? l.status,
  status2: l.status2 ?? null,
  ultimaLigacao: l.ultima_ligacao,
  proximaAcao: l.proxima_acao,
})

/** As ferramentas do CRM que o Xico pode pedir. O que volta é texto (JSON) para ele ler. */
export async function executarNoApp(nome: string, e: Record<string, unknown>): Promise<string> {
  const app = useApp.getState()
  const biz = useBiz.getState()
  if (!app.ready) throw new Error('Os leads ainda estão carregando.')
  const hoje = todayKey()
  switch (nome) {
    case 'crm_resumo': {
      const porStatus: Record<string, number> = {}
      for (const l of app.leads) {
        const k = STATUS_MAP[l.status]?.label ?? l.status
        porStatus[k] = (porStatus[k] ?? 0) + 1
      }
      const abertos = app.followups.filter((f) => !f.concluido)
      const nome = (id: string) => app.leads.find((l) => l.id === id)?.empresa ?? '?'
      const clientes = biz.clients.filter((c) => !c.arquivado)
      return JSON.stringify({
        hoje,
        leads: { total: app.leads.length, porStatus },
        retornosHoje: abertos.filter((f) => f.data === hoje).map((f) => `${nome(f.lead_id)}${f.horario ? ` às ${f.horario}` : ''}`),
        retornosAtrasados: abertos.filter((f) => f.data < hoje).map((f) => `${nome(f.lead_id)} (${f.data})`),
        proximasReunioes: app.meetings
          .filter((m) => m.data >= hoje && !m.resultado)
          .sort((a, b) => a.data.localeCompare(b.data))
          .slice(0, 10)
          .map((m) => `${m.data}${m.horario ? ` ${m.horario}` : ''}: ${nome(m.lead_id)}`),
        clientes: { ativos: clientes.length, fixos: clientes.filter((c) => c.tipo === 'fixo').length, mensalidades: clientes.reduce((s, c) => s + (c.tipo === 'fixo' ? (c.valor_mensal ?? 0) : 0), 0) },
        projetosEmAndamento: biz.projects.filter((p) => !['concluido', 'cancelado'].includes(p.status)).length,
        financeiroDoMes: summarize(biz.transactions, biz.client_payments, monthKey(hoje)),
      })
    }
    case 'crm_leads': {
      const q = norm(e.busca)
      const status = norm(e.status)
      const limite = Math.min(100, Math.max(1, Number(e.limite) || 20))
      const achados = app.leads.filter(
        (l) => (!q || norm(`${l.empresa} ${l.cidade} ${l.nicho} ${l.telefone} ${l.whatsapp}`).includes(q)) && (!status || l.status === status || norm(STATUS_MAP[l.status]?.label).includes(status)),
      )
      return JSON.stringify({ total: achados.length, leads: achados.slice(0, limite).map(resumoLead) })
    }
    case 'crm_lead': {
      const l = acharLead(e.lead)
      return JSON.stringify({
        ...resumoLead(l),
        endereco: l.endereco,
        site: l.website,
        instagram: l.instagram,
        avaliacao: l.avaliacao,
        faleiCom: l.falei_com,
        anotacoes: l.anotacoes,
        historico: app.interactions
          .filter((i) => i.lead_id === l.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 15)
          .map((i) => `${i.created_at.slice(0, 16)} ${i.tipo}${i.status ? ` (${STATUS_MAP[i.status]?.label ?? i.status})` : ''}: ${i.observacao ?? ''}`),
        retornos: app.followups.filter((f) => f.lead_id === l.id && !f.concluido).map((f) => `${f.data} ${f.horario ?? ''} ${f.observacao ?? ''}`.trim()),
        reunioes: app.meetings.filter((m) => m.lead_id === l.id).map((m) => `${m.data} ${m.horario ?? ''} ${m.resultado ?? 'sem resultado'}`.trim()),
      })
    }
    case 'crm_clientes':
      return JSON.stringify(
        biz.clients
          .filter((c) => !c.arquivado)
          .map((c) => {
            const pend = biz.client_payments.filter((p) => p.client_id === c.id && p.status === 'pendente')
            return {
              nome: c.nome,
              empresa: c.empresa,
              tipo: c.tipo,
              valorMensal: c.valor_mensal,
              segmento: c.segmento,
              pendente: pend.reduce((s, p) => s + p.valor, 0),
              pagamentosPendentes: pend.map((p) => `${p.descricao}: R$ ${p.valor}${p.vencimento ? ` (vence ${p.vencimento})` : ''}`),
            }
          }),
      )
    case 'crm_projetos': {
      const cliente = (id: string | null) => biz.clients.find((c) => c.id === id)?.nome ?? null
      return JSON.stringify({
        abertos: biz.projects
          .filter((p) => !['concluido', 'cancelado'].includes(p.status))
          .map((p) => ({ nome: p.nome, cliente: cliente(p.client_id), status: p.status, prioridade: p.prioridade, prazo: p.prazo, orcamento: p.orcamento, tarefasAbertas: p.tarefas.filter((t) => !t.feito).map((t) => t.texto) })),
        concluidos: biz.projects.filter((p) => p.status === 'concluido').length,
      })
    }
    case 'crm_financeiro': {
      const mes = /^\d{4}-\d{2}$/.test(String(e.mes ?? '')) ? String(e.mes) : monthKey(hoje)
      return JSON.stringify({
        mes,
        ...summarize(biz.transactions, biz.client_payments, mes),
        lancamentos: biz.transactions
          .filter((t) => monthKey(t.data) === mes)
          .sort((a, b) => b.data.localeCompare(a.data))
          .slice(0, 20)
          .map((t) => `${t.data} ${t.tipo} ${t.status}: ${t.descricao} R$ ${t.valor} (${t.categoria})`),
      })
    }
    case 'crm_anotar': {
      const l = acharLead(e.lead)
      const t = String(e.texto ?? '').trim()
      if (!t) throw new Error('Anotação vazia.')
      await app.addNote(l.id, `Xico: ${t}`)
      return `Anotado em ${l.empresa}.`
    }
    case 'crm_agendar_retorno': {
      const l = acharLead(e.lead)
      const data = String(e.data ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data precisa ser AAAA-MM-DD.')
      const horario = /^\d{2}:\d{2}$/.test(String(e.horario ?? '')) ? String(e.horario) : null
      await app.scheduleFollowup(l.id, { data, horario, periodo: null, observacao: e.observacao ? String(e.observacao) : null })
      return `Retorno de ${l.empresa} agendado para ${data}${horario ? ` às ${horario}` : ''}.`
    }
    case 'tipos_de_negocio': {
      const q = norm(e.busca)
      return JSON.stringify(
        CATEGORIAS.filter((c) => (c.base.length || c.nomes.length) && norm(`${c.nome} ${c.grupo}`).includes(q))
          .slice(0, 10)
          .map((c) => ({ nome: c.nome, tax: c.base, nomes: c.nomes })),
      )
    }
  }
  throw new Error('Ferramenta desconhecida no app.')
}
