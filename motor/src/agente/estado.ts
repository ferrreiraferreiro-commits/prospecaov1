// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que o agente guarda em disco (pasta de dados da sessão do WhatsApp, nunca no git).
 * A chave da API fica num arquivo só dela, legível só pelo serviço.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readJson, storageDir, writeJson } from '../store.js'
import { CONFIG_PADRAO, type AgenteConfig, type Atividade, type Conversa, type Dia, type FilaItem, type Licao, type Teste } from './tipos.js'

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
  }
}

export const db = {
  config: completarConfig(readJson<Partial<AgenteConfig>>(ARQ.config, {})),
  conversas: readJson<Conversa[]>(ARQ.conversas, []),
  licoes: readJson<Licao[]>(ARQ.licoes, []),
  fila: readJson<FilaItem[]>(ARQ.fila, []),
  dias: readJson<Record<string, Dia>>(ARQ.dias, {}),
  extra: { conhecidos: [], descartados: [], desde: null, pausadoPorRisco: null, ultimoErro: null, freio: null, ...readJson<Partial<Extra>>(ARQ.extra, {}) } as Extra,
  atividade: readJson<Atividade[]>(ARQ.atividade, []),
  testes: readJson<Teste[]>(ARQ.testes, []),
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
