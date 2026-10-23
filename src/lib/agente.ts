// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { useEffect } from 'react'
import { phoneKey } from './duplicates'
import { knownKeys, mapsToParsed, type MapsResult } from './mapsSearch'
import { restantes, semTeto, SEM_TETO, useGoogleKey } from '../store/useGoogleKey'
import { useWaServico, waFetch } from './waServico'
import type { StatusId } from './types'
import { useApp } from '../store/useApp'

/**
 * Agente IA de vendas: roda no WhatsApp do dono, na VPS (motor/src/agente). Esta tela só configura,
 * acompanha e treina; quem busca, aborda e responde é o serviço, 24 h. O app leva as conversas para
 * os leads (histórico e status) enquanto está aberto.
 */

export type Modelo = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5' | 'gemini-2.5-flash' | 'gemini-3.5-flash' | 'grok'

export const MODELOS: { id: Modelo; nome: string; nota: string; custo: string }[] = [
  { id: 'claude-haiku-5-5', nome: 'Haiku 5.5', nota: 'O mais barato. Bom para atender e qualificar.', custo: '~US$ 1 por 1.000 respostas' },
  { id: 'claude-sonnet-5-5', nome: 'Sonnet 5.5', nota: 'Vende melhor: negocia e contorna objeções.', custo: '~US$ 13 por 1.000 respostas' },
  { id: 'claude-opus-5-5', nome: 'Opus 5.5', nota: 'O mais capaz, e o mais caro.', custo: '~US$ 26 por 1.000 respostas' },
  { id: 'gemini-2.5-flash', nome: 'Gemini 2.5 Flash', nota: 'Chave grátis do Google AI Studio. Quando a cota de um modelo acaba, usa outro.', custo: 'Grátis (com limite por dia)' },
  { id: 'gemini-3.5-flash', nome: 'Gemini 3.5 Flash', nota: 'Gemini mais novo, mesma chave grátis.', custo: 'Grátis (com limite por dia)' },
  { id: 'grok', nome: 'Grok', nota: 'Chave xai- do console.x.ai. Também é a reserva quando o Gemini esgota.', custo: '~US$ 1 por 1.000 respostas' },
]

export interface NichoBusca {
  nome: string
  /** Texto da busca no Google Maps */
  busca?: string
  tax: string[]
  nomes: string[]
}

export interface Alvo {
  id: string
  uf: string
  cidade: string
  nichos: NichoBusca[]
  ativo: boolean
  caixa?: [number, number, number, number]
}

export interface AgenteConfig {
  ativo: boolean
  modelo: Modelo
  negocio: {
    seuNome: string
    empresa: string
    apresentacao: string
    oferta: string
    pagamento: string
    descontoMax: number
    portfolio: string
    objecoes: string
    estilo: string
    regras: string
  }
  podeFechar: boolean
  avisos: { telefone: string; relatorio: boolean }
  prospeccao: {
    ativa: boolean
    alvos: Alvo[]
    porDiaInicial: number
    porDiaMax: number
    aumentoSemana: number
    soSemSite: boolean
    /** Primeiro só "Oi, boa tarde!"; a apresentação vem depois da resposta (motor mais novo) */
    cumprimentarPrimeiro?: boolean
    criterios: string
    dias: number[]
    inicio: number
    fim: number
  }
  respostas: { inicio: number; fim: number }
  followup: { ativo: boolean; dias: number[] }
  responderDisparos: boolean
  limiteDiaUSD: number
}

/** A conversa do vendedor com um número, para a tela Conversas. */
export interface ConversaDoAgente {
  id: string
  estado: Estado
  temperatura: 'frio' | 'morno' | 'quente'
  resumo: string
  origem: string
  fatos: { chave: string; valor: string; em: string }[]
  pendente: boolean
  pendencia: { id: string; tipo: string; texto: string; motivo: string; mensagens: string[] } | null
  doAgente: { waId: string; trace: { agente: string; fontes: string[]; conferencias: number; reescritas: number; barradas: string[] } | null }[]
}

export interface MapaAgente {
  id: string
  telefone: string
  estado: Estado
  temperatura: 'frio' | 'morno' | 'quente'
  aguardando: boolean
}

export type Estado = 'aguardando' | 'conversando' | 'quente' | 'humano' | 'reuniao' | 'fechado' | 'perdido' | 'optout' | 'sem_resposta'

export const ESTADO: Record<Estado, { label: string; cls: string }> = {
  aguardando: { label: 'Aguardando resposta', cls: 'bg-tint/[0.05] text-fg-2 ring-line' },
  conversando: { label: 'Conversando', cls: 'bg-blue-500/10 text-blue-300 ring-blue-500/25' },
  quente: { label: 'Quente', cls: 'bg-amber-400/10 text-amber-300 ring-amber-400/25' },
  humano: { label: 'Com você', cls: 'bg-red-500/10 text-red-300 ring-red-500/25' },
  reuniao: { label: 'Reunião', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' },
  fechado: { label: 'Venda', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  perdido: { label: 'Perdido', cls: 'bg-tint/[0.04] text-fg-3 ring-line' },
  optout: { label: 'Não quer mensagens', cls: 'bg-tint/[0.04] text-fg-3 ring-line' },
  sem_resposta: { label: 'Sem resposta', cls: 'bg-tint/[0.04] text-fg-4 ring-line' },
}

export interface Dia {
  abordados: number
  semWhatsApp: number
  responderam: number
  enviadas: number
  quentes: number
  reunioes: number
  vendas: number
  optouts: number
  custoUSD: number
}

export interface EstadoAgente {
  disponivel: boolean
  ativo: boolean
  temChave: boolean
  chaveFinal: string | null
  chaveRecusada: boolean
  pausadoPorRisco: string | null
  ultimoErro: string | null
  whatsapp: 'disconnected' | 'connecting' | 'qrcode' | 'connected'
  modelo: Modelo
  hoje: Dia
  cotaHoje: number
  proximaAbordagem: string | null
  fila: number
  mes: { custoUSD: number; abordados: number; responderam: number; reunioes: number; vendas: number }
  contagem: Partial<Record<Estado, number>>
  licoes: number
  /** Motor mais novo (fase 0 da IA nova) */
  piloto?: number
  paradoEm?: string | null
  pendencias?: number
  google?: { temChave: boolean; restante: number; atualizadoEm: string | null }
}

export interface Mensagem {
  id: string
  de: 'lead' | 'agente' | 'voce'
  texto: string
  em: string
  nota?: 'bom' | 'ruim'
  correcao?: string
}

export interface ConversaResumo {
  id: string
  empresa: string
  telefone: string
  nicho: string
  cidade: string
  origem: 'agente' | 'disparo'
  estado: Estado
  temperatura: 'frio' | 'morno' | 'quente'
  resumo: string
  total: number
  ultima: { de: Mensagem['de']; texto: string; em: string } | null
  pendente: boolean
  atualizadaEm: string
}

export interface Conversa extends Omit<ConversaResumo, 'total' | 'ultima'> {
  uf: string
  endereco: string
  site: string
  instagram: string
  leadId: string | null
  mensagens: Mensagem[]
  followups: number
  criadaEm: string
}

export interface Licao {
  id: string
  tipo: 'conversa' | 'busca'
  texto: string
  origem: 'voce' | 'correcao' | 'resultado'
  ativa: boolean
  em: string
}

export interface FilaItem {
  id: string
  telefone: string
  empresa: string
  nicho: string
  cidade: string
  uf: string
  endereco: string
  site: string
  instagram: string
  alvoId: string
  em: string
  /** Nota de encaixe (0 a 100) e por quê */
  encaixe?: number | null
  encaixeMotivos?: string[]
}

export interface Atividade {
  em: string
  tipo: 'abordou' | 'respondeu' | 'followup' | 'quente' | 'reuniao' | 'venda' | 'humano' | 'optout' | 'busca' | 'aviso' | 'erro' | 'licao'
  texto: string
  conversa?: string
}

export interface Numeros {
  abordados: number
  responderam: number
  quentes: number
  reunioes: number
  vendas: number
  pediramParar: number
  taxaResposta: number
}

export interface TesteView {
  id: string
  nome: string
  alvo: Alvo
  estado: 'rodando' | 'pausado' | 'encerrado'
  porVariante: number
  criadoEm: string
  encerradoEm: string | null
  conclusao: string
  abordados: number
  meta: number
  variantes: ({ id: string; nome: string; angulo: string } & Numeros)[]
  total: Numeros
  /** Quem está ganhando e com que certeza (motor mais novo) */
  analise?: { lider: string | null; confianca: 'poucos_dados' | 'baixa' | 'media' | 'alta'; texto: string }
}

export type NumerosRamo = { ramo: string } & Numeros

export interface RespostaSimulada {
  mensagens: string[]
  acao: 'continuar' | 'aguardar' | 'chamar_dono' | 'reuniao_marcada' | 'venda_fechada' | 'perdido' | 'optout'
  temperatura: 'frio' | 'morno' | 'quente'
  resumo: string
  aviso_dono: string
}

export const ACAO: Record<RespostaSimulada['acao'], string> = {
  continuar: 'Segue a conversa',
  aguardar: 'Não responderia agora',
  chamar_dono: 'Chamaria você',
  reuniao_marcada: 'Reunião marcada',
  venda_fechada: 'Venda fechada',
  perdido: 'Cliente recusou',
  optout: 'Pediu para parar',
}

/** Pedido ao agente (pelo gateway do WhatsApp da XS). A IA pode levar alguns segundos. */
export const ag = <T>(path: string, init: { method?: string; json?: unknown; timeoutMs?: number } = {}) => waFetch<T>(`/agente${path}`, { timeoutMs: 45000, ...init })

// ---------------------------------------------------------------------------
// Sincronização com os leads
// ---------------------------------------------------------------------------

interface PendenteSinc {
  id: string
  leadId: string | null
  telefone: string
  empresa: string
  origem: 'agente' | 'disparo'
  bruto: MapsResult | null
  estado: Estado
  estadoAnterior: Estado | null
  temperatura: string
  resumo: string
  total: number
  novas: { de: Mensagem['de']; texto: string; em: string }[]
}

const QUEM: Record<Mensagem['de'], string> = { lead: 'Cliente', agente: 'Agente IA', voce: 'Você' }

const STATUS_DO_ESTADO: Partial<Record<Estado, StatusId>> = {
  quente: 'cliente_potencial',
  reuniao: 'agendou_reuniao',
  perdido: 'nao_tem_interesse',
  optout: 'nao_tem_interesse',
}

function acharLead(telefone: string, leadId: string | null): string | null {
  const leads = useApp.getState().leads
  if (leadId && leads.some((l) => l.id === leadId)) return leadId
  const k = phoneKey(telefone)
  return (k && leads.find((l) => phoneKey(l.whatsapp) === k || phoneKey(l.telefone) === k)?.id) || null
}

/** Leva as conversas do agente para os leads: cria o lead (empresa nova), histórico e status. */
export async function syncAgente(): Promise<number> {
  const app = useApp.getState()
  if (!app.ready || app.loadError || !app.repo) return 0
  const pend = await waFetch<PendenteSinc[]>('/agente/sinc', { timeoutMs: 8000 })
  const itens: { id: string; leadId: string | null; mensagens: number; estado: Estado }[] = []
  for (const p of pend) {
    let leadId = acharLead(p.telefone, p.leadId)
    if (!leadId && p.bruto) {
      await app.importLeads([mapsToParsed(p.bruto, 0)], `Agente IA · ${p.bruto.niche} · ${p.bruto.city}`)
      leadId = acharLead(p.telefone, null)
    }
    if (leadId) {
      const state = useApp.getState()
      // A primeira abordagem entra como mensagem enviada; o resto da conversa como anotação
      let novas = p.novas
      if (p.estadoAnterior === null && p.origem === 'agente' && novas[0]?.de === 'agente') {
        const fim = novas.findIndex((m) => m.de !== 'agente')
        const primeiras = fim < 0 ? novas : novas.slice(0, fim)
        await state.logMessage(leadId, primeiras.map((m) => m.texto).join('\n\n'), 'Agente IA')
        novas = novas.slice(primeiras.length)
      }
      if (novas.length) await state.addNote(leadId, `WhatsApp (Agente IA):\n${novas.map((m) => `${QUEM[m.de]}: ${m.texto}`).join('\n')}`)
      if (p.estado !== p.estadoAnterior) {
        const status = STATUS_DO_ESTADO[p.estado]
        if (status) await state.saveOutcome({ leadId, mode: 'status', status, observacao: p.resumo ? `Agente IA: ${p.resumo}` : null })
        if (p.estado === 'fechado') {
          await state.setStatus2(leadId, 'Fechado')
          await state.addNote(leadId, `Agente IA: venda fechada. ${p.resumo}`.trim())
        }
        if (p.estado === 'humano') await state.addNote(leadId, `Agente IA passou a conversa para você. ${p.resumo}`.trim())
      }
    }
    itens.push({ id: p.id, leadId, mensagens: p.total, estado: p.estado })
  }
  if (itens.length) await waFetch('/agente/sinc', { method: 'POST', json: { itens } })
  return itens.length
}

let conhecidosEnviados = -1

/** Telefones dos leads: o agente não aborda quem já está no CRM. */
async function enviarConhecidos() {
  const { leads, ready } = useApp.getState()
  if (!ready || leads.length === conhecidosEnviados) return
  await waFetch('/agente/conhecidos', { method: 'POST', json: { telefones: knownKeys(leads).phones }, timeoutMs: 15000 })
  conhecidosEnviados = leads.length
}

/**
 * Leva a chave do Google (a mesma de "Buscar empresas") para o vendedor e soma ao contador do mês as
 * consultas que ele fez. Motor antigo responde 404: ignora.
 */
async function sincronizarGoogle() {
  const g = useGoogleKey.getState()
  if (!g.loaded) await g.load()
  const c = useGoogleKey.getState().config
  const r = await waFetch<{ pendentes: number }>('/agente/google', { method: 'POST', json: { chave: c.chave ?? '', restante: semTeto(c) ? SEM_TETO : restantes(c) }, timeoutMs: 8000 })
  if (r.pendentes > 0) {
    await useGoogleKey.getState().addUso(r.pendentes)
    await waFetch('/agente/google', { method: 'POST', json: { ack: r.pendentes }, timeoutMs: 8000 })
  }
}

/** A cada 1 min, com a aba aberta e o agente disponível (só no WhatsApp do dono). */
export function useAgenteSync() {
  const disponivel = useWaServico((s) => !!s.online && !!s.health?.agente)
  useEffect(() => {
    if (!disponivel) return
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        await enviarConhecidos()
        await sincronizarGoogle().catch(() => undefined)
        await syncAgente()
      } catch {
        /* serviço ocupado ou fora do ar: tenta de novo depois */
      } finally {
        busy = false
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 60_000)
    return () => clearInterval(id)
  }, [disponivel])
}
