// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que o agente guarda em disco (pasta de dados da sessão do WhatsApp, nunca no git).
 * A chave da API fica num arquivo só dela, legível só pelo serviço.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readJson, storageDir, writeJson } from '../store.js'
import { CONFIG_PADRAO, type AgenteConfig, type Atividade, type Conversa, type Dia, type FilaItem, type Licao, type Material, type Pendencia, type Reativar, type Reuniao, type Teste } from './tipos.js'

const ARQ = {
  config: 'agente-config.json',
  conversas: 'agente-conversas.json',
  licoes: 'agente-licoes.json',
  fila: 'agente-fila.json',
  dias: 'agente-dias.json',
  extra: 'agente-extra.json',
  atividade: 'agente-atividade.json',
  testes: 'agente-testes.json',
  chave: 'agente-chave.json',
  materiais: 'agente-materiais.json',
  pendencias: 'agente-pendencias.json',
  reunioes: 'agente-reunioes.json',
  reativar: 'agente-reativar.json',
  lab: 'agente-laboratorio.json',
  diario: 'agente-diario.json',
}

/** O Laboratório: provas, versões do treino, casos de ouro e erro e a entrevista do Xico. */
export interface Lab {
  provas: Prova[]
  versoes: Versao[]
  casos: Caso[]
  entrevista: { mensagens: { de: 'xico' | 'voce'; texto: string }[]; resultado: Record<string, unknown> | null; em: string } | null
}

export interface ResultadoSimulacao {
  persona: string
  nome: string
  categoria: 'cliente' | 'ataque' | 'caso'
  nota: number
  notas: Record<string, number>
  comentario: string
  pontoFraco: string
  barradas: string[]
  conversa: { de: 'lead' | 'agente'; texto: string }[]
  acaoFinal: string
}

export interface Prova {
  id: string
  versao: number
  em: string
  tamanho: number
  estado: 'rodando' | 'pronta' | 'falhou' | 'cancelada'
  feitas: number
  resultados: ResultadoSimulacao[]
  nota: number | null
  porCriterio: Record<string, number>
  resumo: string
  custoUSD: number
}

export interface Versao {
  n: number
  em: string
  motivo: string
  treino: Pick<AgenteConfig, 'negocio' | 'persona' | 'estiloResposta' | 'capacidades' | 'podeFechar'>
  licoes: Licao[]
  materiais: Material[]
}

export interface Caso {
  id: string
  tipo: 'ouro' | 'erro'
  conversaId: string
  empresa: string
  nicho: string
  /** Conversa até antes da mensagem marcada */
  antes: { de: 'lead' | 'agente' | 'voce'; texto: string }[]
  /** A mensagem do agente que você marcou */
  mensagem: string
  em: string
}

/** O que o Professor escreveu sobre o dia (vira o Diário no Caderno). */
export interface DiaDiario {
  resumo: string
  funcionou: string[]
  naoFuncionou: string[]
  erros: string[]
}

export interface Extra {
  /** Telefones (DDD + 8) que já estão no CRM, mandados pelo app */
  conhecidos: string[]
  /** Telefones que você tirou da fila ou que a IA descartou: não voltam na busca */
  descartados: string[]
  /** Primeiro dia de prospecção (a cota sobe a partir dele) */
  desde: string | null
  /** Pausado porque o WhatsApp caiu de forma suspeita (você retoma na tela) */
  pausadoPorRisco: string | null
  ultimoErro: string | null
  /** Dia (AAAA-MM-DD) em que a prospecção freou sozinha (muita gente pediu para parar) */
  freio: string | null
  /** Contatos apagados a pedido (LGPD): nunca mais recebem mensagem */
  apagados: string[]
  /** Chave do Google (a mesma de Buscar empresas), quanto ainda cabe na cota e o que falta o app somar */
  google: { chave: string; restante: number; pendentes: number; atualizadoEm: string | null }
  /** Você parou tudo pelo botão ou pelo WhatsApp ("XS pausar") */
  paradoEm: string | null
  /** Nível descido sozinho e por quê */
  desceuNivel: { em: string; motivo: string } | null
}

/** Junta o que foi salvo com o padrão (campos novos ganham o valor padrão). */
export function completarConfig(salva: Partial<AgenteConfig> | null | undefined): AgenteConfig {
  const s = salva ?? {}
  return {
    ...CONFIG_PADRAO,
    ...s,
    negocio: { ...CONFIG_PADRAO.negocio, ...s.negocio },
    avisos: { ...CONFIG_PADRAO.avisos, ...s.avisos },
    prospeccao: { ...CONFIG_PADRAO.prospeccao, ...s.prospeccao },
    respostas: { ...CONFIG_PADRAO.respostas, ...s.respostas },
    followup: { ...CONFIG_PADRAO.followup, ...s.followup },
    persona: { ...CONFIG_PADRAO.persona, ...s.persona },
    estiloResposta: { ...CONFIG_PADRAO.estiloResposta, ...s.estiloResposta },
    capacidades: { ...migrarCapacidades(s), ...s.capacidades },
    conferencias: { ...CONFIG_PADRAO.conferencias, ...s.conferencias },
    agenda: { ...CONFIG_PADRAO.agenda, ...s.agenda },
    posVenda: { ...CONFIG_PADRAO.posVenda, ...s.posVenda },
    reativacao: { ...CONFIG_PADRAO.reativacao, ...s.reativacao },
  }
}

/** Quem já tinha "pode fechar" ligado continua podendo mandar o Pix e marcar a venda (era o comportamento de antes). */
function migrarCapacidades(s: Partial<AgenteConfig>): Record<string, boolean> {
  if (s.capacidades || s.podeFechar === undefined) return {}
  return s.podeFechar ? { mandar_pix: true, marcar_resultado: true } : { passar_preco: false, negociar: false }
}

const EXTRA_PADRAO: Extra = {
  conhecidos: [],
  descartados: [],
  desde: null,
  pausadoPorRisco: null,
  ultimoErro: null,
  freio: null,
  apagados: [],
  google: { chave: '', restante: 0, pendentes: 0, atualizadoEm: null },
  paradoEm: null,
  desceuNivel: null,
}

export const db = {
  config: completarConfig(readJson<Partial<AgenteConfig>>(ARQ.config, {})),
  conversas: readJson<Conversa[]>(ARQ.conversas, []),
  licoes: readJson<Licao[]>(ARQ.licoes, []),
  fila: readJson<FilaItem[]>(ARQ.fila, []),
  dias: readJson<Record<string, Dia>>(ARQ.dias, {}),
  extra: { ...EXTRA_PADRAO, ...readJson<Partial<Extra>>(ARQ.extra, {}) } as Extra,
  atividade: readJson<Atividade[]>(ARQ.atividade, []),
  testes: readJson<Teste[]>(ARQ.testes, []),
  materiais: readJson<Material[]>(ARQ.materiais, []),
  pendencias: readJson<Pendencia[]>(ARQ.pendencias, []),
  reunioes: readJson<Reuniao[]>(ARQ.reunioes, []),
  reativar: readJson<Reativar[]>(ARQ.reativar, []),
  lab: { provas: [], versoes: [], casos: [], entrevista: null, ...readJson<Partial<Lab>>(ARQ.lab, {}) } as Lab,
  diario: readJson<Record<string, DiaDiario>>(ARQ.diario, {}),
}

let timer: NodeJS.Timeout | null = null

/** Grava tudo (agrupa várias mudanças seguidas numa gravação só). */
export function salvar(agora = false) {
  if (timer) clearTimeout(timer)
  const gravar = () => {
    timer = null
    writeJson(ARQ.config, db.config)
    writeJson(ARQ.conversas, db.conversas)
    writeJson(ARQ.licoes, db.licoes)
    writeJson(ARQ.fila, db.fila)
    writeJson(ARQ.dias, db.dias)
    writeJson(ARQ.extra, db.extra)
    writeJson(ARQ.atividade, db.atividade)
    writeJson(ARQ.testes, db.testes)
    writeJson(ARQ.materiais, db.materiais)
    writeJson(ARQ.pendencias, db.pendencias)
    writeJson(ARQ.reunioes, db.reunioes)
    writeJson(ARQ.reativar, db.reativar)
    writeJson(ARQ.lab, db.lab)
    writeJson(ARQ.diario, db.diario)
  }
  if (agora) gravar()
  else timer = setTimeout(gravar, 500)
}

// ---------------------------------------------------------------- chave da API

export interface Chaves {
  /** Claude (sk-ant-…) */
  anthropic: string
  /** Gemini (Google AI Studio) */
  gemini: string
  /** Grok (xai-…) e o modelo dele */
  xai: string
  xaiModelo: string
}

export function lerChaves(): Chaves {
  const j = readJson<Partial<Chaves> & { chave?: string }>(ARQ.chave, {})
  return { anthropic: j.anthropic ?? j.chave ?? '', gemini: j.gemini ?? '', xai: j.xai ?? '', xaiModelo: j.xaiModelo ?? '' }
}

export function gravarChaves(c: Chaves) {
  const alvo = path.join(storageDir, ARQ.chave)
  const tmp = `${alvo}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...c, chave: c.anthropic }), { mode: 0o600 })
  fs.renameSync(tmp, alvo)
}

export function apagarChave() {
  fs.rmSync(path.join(storageDir, ARQ.chave), { force: true })
}
