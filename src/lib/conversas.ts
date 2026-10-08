// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { supabase } from '../data/supabaseClient'
import { waFetch } from './waServico'

/**
 * Conversas do WhatsApp da conta (tela Conversas): só texto, só o que chegou ou saiu depois que
 * o WhatsApp foi conectado na XS. Fotos, áudios e documentos aparecem como aviso ("veja no celular").
 * Sem Supabase (modo local) usa uma demonstração com conversas de exemplo.
 */

export type Recibo = 'accepted' | 'delivered' | 'read' | 'failed'

export interface MensagemConversa {
  id: string
  deMim: boolean
  texto: string
  /** "Foto", "Áudio"… quando a mensagem não é só texto */
  midia: string | null
  em: string
  status: Recibo | null
}

export interface ResumoConversa {
  telefone: string
  nome: string | null
  naoLidas: number
  atualizadaEm: string
  ultima: MensagemConversa | null
}

export interface ListaConversas {
  versao: number
  conversas: ResumoConversa[]
}

export interface ConversaAberta {
  versao: number
  telefone: string
  nome: string | null
  naoLidas: number
  msgs: MensagemConversa[]
}

export interface ConversasApi {
  demo: boolean
  listar(): Promise<ListaConversas>
  abrir(telefone: string): Promise<ConversaAberta>
  enviar(telefone: string, texto: string): Promise<MensagemConversa>
  marcarLidas(telefone: string): Promise<void>
}

const nuvem: ConversasApi = {
  demo: false,
  listar: () => waFetch<ListaConversas>('/conversas', { timeoutMs: 8000 }),
  abrir: (tel) => waFetch<ConversaAberta>(`/conversas/${encodeURIComponent(tel)}`, { timeoutMs: 8000 }),
  enviar: (tel, texto) => waFetch<MensagemConversa>(`/conversas/${encodeURIComponent(tel)}/enviar`, { method: 'POST', json: { texto }, timeoutMs: 30000 }),
  marcarLidas: async (tel) => {
    await waFetch(`/conversas/${encodeURIComponent(tel)}/lidas`, { method: 'POST', json: {}, timeoutMs: 8000 })
  },
}

let demo: Promise<ConversasApi> | null = null

/** Na XS de verdade: o WhatsApp da conta na nuvem. No modo local: a demonstração. */
export function conversasApi(): Promise<ConversasApi> {
  if (supabase) return Promise.resolve(nuvem)
  demo ??= import('./conversasDemo').then((m) => m.conversasDemo)
  return demo
}

/** Só dígitos, com 55 (como o WhatsApp guarda). */
export function telefoneConversa(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? `55${d}` : d
}

/** "Hoje", "Ontem", "segunda-feira" (até 6 dias) ou "12/09/2026" — separador de dias da conversa. */
export function rotuloDia(iso: string, agora = new Date()): string {
  const d = new Date(iso)
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((dia(agora) - dia(d)) / 86_400_000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff > 1 && diff < 7) {
    const s = d.toLocaleDateString('pt-BR', { weekday: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Hora na lista: "14:32" hoje, "Ontem", "seg." na semana, "12/09" antes. */
export function horaCurta(iso: string, agora = new Date()): string {
  const d = new Date(iso)
  const r = rotuloDia(iso, agora)
  if (r === 'Hoje') return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (r === 'Ontem') return 'Ontem'
  const diff = (agora.getTime() - d.getTime()) / 86_400_000
  if (diff < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Texto da última mensagem na lista (mídia vira "Foto", "Áudio"…). */
export function previa(m: MensagemConversa | null): string {
  if (!m) return ''
  if (m.midia) return m.texto ? `${m.midia}: ${m.texto}` : m.midia
  return m.texto
}
