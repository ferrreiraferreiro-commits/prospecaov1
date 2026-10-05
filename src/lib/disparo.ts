import { useEffect } from 'react'
import { stepDelayMs, type Funnel } from './biz'
import { digits } from './contact'
import { fillMessage, saudacao } from './messages'
import { syncAgenda } from './agenda'
import { waFetch, useWaServico } from './waServico'
import type { Lead, Settings } from './types'
import { useApp } from '../store/useApp'

export type RecipientStatus = 'pendente' | 'enviando' | 'aceito' | 'entregue' | 'lido' | 'respondeu' | 'falhou' | 'ignorado'
export type CampaignStatus = 'rascunho' | 'fila' | 'enviando' | 'pausada' | 'concluida' | 'cancelada'

export interface CampaignSummary {
  id: string
  nome: string
  funil: string
  status: CampaignStatus
  total: number
  processados: number
  aceitos: number
  entregues: number
  lidos: number
  responderam: number
  falharam: number
  ignorados: number
  delayMin: number
  delayMax: number
  proximoEnvio: string | null
  ultimoIntervaloMin: number | null
  criadaEm: string
  atualizadaEm: string
  pendentesSync: number
}

export interface CampaignRecipient {
  id: string
  leadId: string
  nome: string
  telefone: string
  textos: string[]
  status: RecipientStatus
  enviadas: number
  erro: string | null
  respostas: { em: string; texto: string }[]
  processadoEm: string | null
  sincEnvio: boolean
  sincRespostas: number
}

export interface CampaignDetail {
  id: string
  nome: string
  destinatarios: CampaignRecipient[]
  logs: { em: string; nivel: 'info' | 'sucesso' | 'aviso' | 'erro' | 'resposta'; msg: string; detalhe?: string; leadId?: string }[]
  resumo: CampaignSummary
}

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-tint/[0.05] text-fg-2 ring-line' },
  fila: { label: 'Na fila', cls: 'bg-sky-500/10 text-sky-300 ring-sky-500/25' },
  enviando: { label: 'Enviando', cls: 'bg-blue-500/15 text-blue-300 ring-blue-500/30' },
  pausada: { label: 'Pausada', cls: 'bg-amber-400/10 text-amber-300 ring-amber-400/25' },
  concluida: { label: 'Concluída', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-500/10 text-red-300 ring-red-500/25' },
}

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; cls: string }> = {
  pendente: { label: 'Na fila', cls: 'text-fg-3' },
  enviando: { label: 'Enviando…', cls: 'text-blue-300' },
  aceito: { label: 'Enviado', cls: 'text-fg-2' },
  entregue: { label: 'Entregue', cls: 'text-sky-300' },
  lido: { label: 'Lido', cls: 'text-blue-300' },
  respondeu: { label: 'Respondeu', cls: 'text-emerald-300' },
  falhou: { label: 'Falhou', cls: 'text-red-300' },
  ignorado: { label: 'Ignorado', cls: 'text-fg-4' },
}

/** Telefone para WhatsApp: o campo WhatsApp do lead, senão o telefone. */
export function leadPhone(lead: Pick<Lead, 'whatsapp' | 'telefone'>): string {
  return digits(lead.whatsapp) || digits(lead.telefone)
}

/** Celular brasileiro (DDD + 9 + 8 dígitos), com ou sem 55. */
export function isMobile(phone: string): boolean {
  const d = phone.replace(/^55(?=\d{11}$)/, '')
  return d.length === 11 && d[2] === '9'
}

export function phoneKeyBr(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d
}

/** Etapas do funil para o WhatsApp da XS + textos de cada lead (variações em rodízio, {saudacao} fica para a hora do envio). */
export function buildCampaignPayload(funnel: Funnel, leads: Lead[], settings: Settings) {
  const etapas = funnel.etapas
    .filter((s) => (s.tipo === 'mensagem' ? s.variacoes.some((v) => v.trim()) : true))
    .map((s) => (s.tipo === 'mensagem' ? { tipo: 'mensagem' as const } : { tipo: 'espera' as const, ms: stepDelayMs(s) }))
  const msgSteps = funnel.etapas.filter((s): s is Extract<typeof s, { tipo: 'mensagem' }> => s.tipo === 'mensagem' && s.variacoes.some((v) => v.trim()))
  const destinatarios = leads.map((lead, i) => ({
    leadId: lead.id,
    nome: lead.empresa,
    telefone: leadPhone(lead),
    textos: msgSteps.map((step) => {
      const vs = step.variacoes.map((v) => v.trim()).filter(Boolean)
      return fillMessage(vs[i % vs.length], lead, settings, new Date(), ['saudacao'])
    }),
  }))
  return { etapas, destinatarios }
}

/**
 * Leva os resultados dos disparos para o histórico dos leads (uma vez só):
 * o envio vira "mensagem" e cada resposta vira uma anotação.
 */
export async function syncCampaigns(): Promise<number> {
  const list = await waFetch<CampaignSummary[]>('/disparo/campanhas', { timeoutMs: 6000 })
  let total = 0
  for (const c of list.filter((x) => x.pendentesSync > 0)) {
    const detail = await waFetch<CampaignDetail>(`/disparo/campanhas/${c.id}`)
    const app = useApp.getState()
    const exists = new Set(app.leads.map((l) => l.id))
    const itens: { id: string; envio: boolean; respostas: number }[] = []
    for (const r of detail.destinatarios) {
      const precisaEnvio = !!r.processadoEm && !r.sincEnvio
      const novasRespostas = r.respostas.slice(r.sincRespostas)
      if (!precisaEnvio && !novasRespostas.length) continue
      if (exists.has(r.leadId)) {
        if (precisaEnvio && r.enviadas > 0) await app.logMessage(r.leadId, r.textos.join('\n\n').replace(/\{\s*saudacao\s*\}/gi, saudacao(new Date(r.processadoEm!))), `Disparo: ${detail.nome}`)
        if (precisaEnvio && r.status === 'falhou') await app.addNote(r.leadId, `Disparo "${detail.nome}" não enviado: ${r.erro ?? 'falha no envio'}`)
        for (const resp of novasRespostas) await app.addNote(r.leadId, `Respondeu no WhatsApp (${new Date(resp.em).toLocaleString('pt-BR')}): "${resp.texto}"`)
      }
      itens.push({ id: r.id, envio: precisaEnvio || r.sincEnvio, respostas: r.respostas.length })
      total++
    }
    if (itens.length) await waFetch(`/disparo/campanhas/${c.id}/sincronizado`, { method: 'POST', json: { itens } })
  }
  return total
}

/** Sincroniza em segundo plano enquanto o WhatsApp da XS responde (a cada 20 s). */
export function useDisparoSync() {
  const online = useWaServico((s) => s.online)
  useEffect(() => {
    if (!online) return
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        await syncCampaigns()
        await syncAgenda()
      } catch {
        /* serviço ocupado ou fora do ar: tenta de novo depois */
      } finally {
        busy = false
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 20_000)
    return () => clearInterval(id)
  }, [online])
}
