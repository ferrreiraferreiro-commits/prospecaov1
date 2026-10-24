// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Rotinas que rodam sozinhas (chame `rodarRotinas` a cada minuto): retorno combinado, follow-up,
 * confirmação na véspera, pós-venda e, à noite, o Professor (reflexão → lições e Diário).
 * Uma ação por chamada, para não atropelar o ritmo do número.
 */
import * as ia from './ia.js'
import { posVenda, reflexao } from './ia-apoio.js'
import { pode } from './capacidades.js'
import { calcularPadroes, rotuloHorario } from './padroes.js'
import { dentroDoHorario, diaDe, respondeu } from './regras.js'
import type { Conversa } from './tipos.js'
import type { AgenteIA, Pronto } from './adaptador.js'

const DIA = 86_400_000
const estados = (c: Conversa, ...e: Conversa['estado'][]) => e.includes(c.estado)

/** Uma ação por vez, na ordem de importância. Devolve o que fez (ou null). */
export async function rodarRotinas(a: AgenteIA, t = new Date()): Promise<string | null> {
  const cfg = a.cfg
  if (!cfg.ativo) return null
  const ferias = !!cfg.feriasAte && diaDe(t) <= cfg.feriasAte
  const horarioBom = dentroDoHorario(t, cfg.prospeccao.inicio, cfg.prospeccao.fim, cfg.prospeccao.dias)
  if (horarioBom && !ferias) {
    for (const f of [retornoCombinado, confirmarVespera, posVendaJob, followup]) {
      const r = await f(a, t)
      if (r) return r
    }
  }
  if (t.getHours() >= Math.min(22, cfg.respostas.fim)) return professor(a, t)
  return null
}

async function proativa(a: AgenteIA, c: Conversa, mensagens: string[], agente: Parameters<AgenteIA['sair']>[2]['agente'], t: Date): Promise<boolean> {
  const refazer = async (atual: Pronto, motivo: string) => {
    const n = await a.comIA(() => ia.reescrever(a.ctx(), c, atual, motivo, t, a.apoioPara(c, c.resumo, false)))
    return n ? { mensagens: n.mensagens.slice(0, 1), acao: 'continuar' } : null
  }
  return (await a.sair(c, { mensagens, acao: 'continuar' }, { agente, proativa: true, maxBolhas: 1, refazer })) === 'enviada'
}

/** "Me chama mês que vem": chama no dia combinado. */
async function retornoCombinado(a: AgenteIA, t: Date) {
  if (!pode(a.cfg, 'retorno_combinado')) return null
  const hoje = diaDe(t)
  const c = a.d.conversas.find((x) => x.retomarEm && x.retomarEm <= hoje && !x.aguardandoVoce && estados(x, 'aguardando', 'conversando', 'quente', 'perdido', 'sem_resposta') && x.mensagens.at(-1)?.de !== 'lead')
  if (!c) return null
  c.retomarEm = null
  const r = await a.comIA(() => ia.followup(a.ctx(), { ...c, retomarCombinado: true }, 1, t, a.apoioPara(c, c.resumo, false)))
  if (r?.mensagens.length && (await proativa(a, c, r.mensagens, 'recuperador', t))) return `Retomou com ${c.empresa} no dia combinado`
  a.salvar()
  return null
}

/** Quem sumiu: tenta de novo nos dias escolhidos (resposta automática não conta). */
async function followup(a: AgenteIA, t: Date) {
  const dias = a.cfg.followup.dias.filter((d) => d > 0)
  if (!a.cfg.followup.ativo || !pode(a.cfg, 'followup') || !dias.length) return null
  const c = a.d.conversas.find((x) => {
    if (x.aguardandoVoce || x.retomarEm || !estados(x, 'aguardando', 'conversando', 'quente') || x.followups >= dias.length) return false
    const ultima = x.mensagens.filter((m) => !m.auto).at(-1)
    return !!ultima && ultima.de !== 'lead' && t.getTime() - Date.parse(ultima.em) >= dias[x.followups] * DIA
  })
  if (!c) return null
  c.followups++
  const r = await a.comIA(() => ia.followup(a.ctx(), c, dias.length, t, a.apoioPara(c, c.resumo, false)))
  if (r?.mensagens.length && (await proativa(a, c, r.mensagens, 'recuperador', t))) return `Follow-up ${c.followups} para ${c.empresa}`
  a.salvar()
  return null
}

/** Confirma na véspera a conversa marcada (frase pronta, sem IA). */
export async function confirmarVespera(a: AgenteIA, t: Date) {
  if (!pode(a.cfg, 'confirmar_vespera')) return null
  const amanha = diaDe(new Date(t.getTime() + DIA))
  const r = a.d.reunioes.find((x) => x.estado === 'marcada' && !x.confirmacaoEnviada && diaDe(new Date(x.inicio)) === amanha)
  const c = r && a.d.conversas.find((x) => x.id === r.conversaId)
  if (!r || !c) return null
  r.confirmacaoEnviada = true
  const nome = c.fatos?.find((f) => f.chave === 'nome_contato')?.valor
  const quando = rotuloHorario(new Date(r.inicio)).replace(/^\S+ \(\d+\/\d+\) /, '')
  const frases = [`Oi${nome ? `, ${nome}` : ''}! Passando para confirmar nossa conversa amanhã ${quando}. Tudo certo?`, `${nome ? `${nome}, ` : ''}lembrando da nossa conversa de amanhã ${quando}. Continua bom para você?`]
  if (await proativa(a, c, [frases[Math.floor(Math.random() * frases.length)]], 'agendador', t)) return `Confirmou a conversa de amanhã com ${c.empresa}`
  return null
}

/** Depois da venda: agradece, pede depoimento e pede indicação, cada um uma vez. */
export async function posVendaJob(a: AgenteIA, t: Date) {
  const cfg = a.cfg
  for (const c of a.d.conversas) {
    if (c.estado !== 'fechado' || !c.fechadoEm || c.aguardandoVoce) continue
    const dias = (t.getTime() - Date.parse(c.fechadoEm)) / DIA
    c.posVenda ??= {}
    const tipo = !c.posVenda.agradeceu && dias >= 1 && pode(cfg, 'agradecer') ? 'agradecer' : !c.posVenda.depoimento && dias >= cfg.posVenda.depoimentoDias && pode(cfg, 'pedir_depoimento') ? 'depoimento' : !c.posVenda.indicacao && dias >= cfg.posVenda.indicacaoDias && pode(cfg, 'pedir_indicacao') ? 'indicacao' : null
    if (!tipo) continue
    c.posVenda[tipo === 'agradecer' ? 'agradeceu' : tipo] = new Date().toISOString()
    const r = await a.comIA(() => posVenda(a.ctx(), c, tipo, t))
    if (r?.mensagens.length && (await proativa(a, c, r.mensagens, 'posvenda', t))) return `Pós-venda (${tipo}) com ${c.empresa}`
    a.salvar()
    return null
  }
  return null
}

/** À noite: lê as conversas encerradas, escreve o Diário e propõe lições (você aprova). */
export async function professor(a: AgenteIA, t: Date) {
  if (!pode(a.cfg, 'refletir')) return null
  const c = a.d.conversas.find(
    (x) => !x.refletidaEm && x.id !== 'simulacao' && x.mensagens.filter((m) => m.de === 'lead' && !m.auto).length >= 2 && (estados(x, 'fechado', 'perdido', 'reuniao', 'optout', 'sem_resposta') || t.getTime() - Date.parse(x.atualizadaEm) > 7 * DIA),
  )
  if (!c) return null
  c.refletidaEm = new Date().toISOString()
  const resultado = { fechado: 'venda fechada', perdido: 'o cliente recusou', reuniao: 'conversa marcada', optout: 'pediu para parar', sem_resposta: 'sumiu' }[c.estado as string] ?? 'conversa parada há 7 dias'
  const r = await a.comIA(() => reflexao(a.ctx(), c, resultado))
  if (!r) return null
  const dia = diaDe(t)
  const d = (a.d.diario[dia] ??= { resumo: '', funcionou: [], naoFuncionou: [], erros: [] })
  if (r.funcionou) d.funcionou.push(`${c.empresa}: ${r.funcionou}`)
  if (r.naoFuncionou) d.naoFuncionou.push(`${c.empresa}: ${r.naoFuncionou}`)
  if (r.erro) d.erros.push(`${c.empresa}: ${r.erro}`)
  const p = calcularPadroes(a.d.conversas)
  d.resumo = `${a.d.conversas.filter((x) => diaDe(new Date(x.atualizadaEm)) === dia).length} conversas hoje; resposta geral ${p.total.taxa}%.`
  if (r.licao && pode(a.cfg, 'propor_licao')) {
    const auto = a.cfg.autoAprovarLicoes && r.licao.confianca === 'alta'
    a.novaLicao({ titulo: r.licao.titulo, texto: r.licao.texto, escopo: r.licao.escopo, confianca: r.licao.confianca, origem: 'professor', provas: [c.id], status: auto ? 'ativa' : 'proposta' })
  }
  a.salvar()
  return `Professor refletiu sobre ${c.empresa}`
}

/** Números para a tela (fase 6): resposta por hora, dia e ramo. */
export function painelPadroes(a: AgenteIA) {
  const p = calcularPadroes(a.d.conversas)
  const conversas = a.d.conversas.filter((c) => c.id !== 'simulacao')
  return { ...p, conversas: conversas.length, responderam: conversas.filter(respondeu).length, vendas: conversas.filter((c) => c.estado === 'fechado').length }
}
