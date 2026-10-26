// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import type { ConversaAberta, ConversasApi, ListaConversas, MensagemConversa, Recibo, ResumoConversa } from './conversas'
import { fillMessage } from './messages'
import type { Lead, Settings } from './types'

/**
 * API oficial do WhatsApp (Meta): área separada do WhatsApp da XS (QR code).
 * O app fala com api/meta.ts (envios, modelos, conexão) e lê as mensagens direto do Supabase
 * (tabela meta_mensagens, que o webhook da Meta preenche).
 */

export interface MetaConexao {
  gancho: string
  verificacao: string
  numero_id: string
  waba_id: string
  numero: string | null
  nome_verificado: string | null
  webhook_ok_em: string | null
  atualizado_em: string
}

/** Mesmo formato que api/meta.ts devolve em { acao: 'modelos' }. */
export interface ModeloMeta {
  nome: string
  idioma: string
  categoria: string
  variaveis: string[]
  nomeadas: boolean
  cabecalho: string | null
  corpo: string
  rodape: string | null
  botoes: string[]
  suportado: boolean
  motivo: string | null
}

export const webhookUrl = (gancho: string) => `${window.location.origin}/api/meta?c=${gancho}`

/** Pedido a api/meta.ts com o login da pessoa. */
export async function metaFetch<T>(json: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token) throw new Error('Entre na sua conta da XS.')
  let r: Response
  try {
    r = await fetch('/api/meta', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new Error('Sem resposta do servidor. Confira a internet e tente de novo.')
  }
  const corpo = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(corpo.error || `Falha (${r.status}).`)
  return corpo
}

const COLUNAS = 'gancho,verificacao,numero_id,waba_id,numero,nome_verificado,webhook_ok_em,atualizado_em'

interface MetaState {
  carregado: boolean
  conexao: MetaConexao | null
  carregar(): Promise<void>
}

/** Conexão da API oficial da conta logada (null = ainda não conectou). */
export const useMetaConexao = create<MetaState>((set) => ({
  carregado: false,
  conexao: null,
  async carregar() {
    if (!supabase) return set({ carregado: true, conexao: null })
    const { data } = await supabase.from('meta_conexoes').select(COLUNAS).maybeSingle()
    set({ carregado: true, conexao: (data as MetaConexao | null) ?? null })
  },
}))

// ---------------------------------------------------------------------------
// Modelos: variáveis e prévia
// ---------------------------------------------------------------------------

/** Valor sugerido para cada variável do modelo (o usuário troca na tela). */
export function sugestaoVariavel(nome: string, i: number): string {
  const n = nome.toLowerCase()
  if (/nome|empresa|negocio|loja/.test(n)) return '{empresa}'
  if (/cidade/.test(n)) return '{cidade}'
  if (/respons|contato|dono/.test(n)) return '{responsavel}'
  if (/sauda/.test(n)) return '{saudacao}'
  if (/nicho|ramo|segmento/.test(n)) return '{nicho}'
  return i === 0 ? '{empresa}' : ''
}

/** Valores das variáveis para um lead: cada campo aceita {empresa}, {cidade}… como nos Modelos de mensagem. */
export function valoresParaLead(campos: string[], lead: Lead | null, settings: Settings): string[] {
  return campos.map((c) => (lead ? fillMessage(c, lead, settings) : c).trim())
}

/** Texto do modelo com as variáveis preenchidas (o que vai para o histórico e a conversa). */
export function textoDoModelo(m: Pick<ModeloMeta, 'cabecalho' | 'corpo' | 'rodape' | 'variaveis'>, valores: string[]): string {
  const corpo = m.corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, nome: string) => {
    const i = m.variaveis.indexOf(nome)
    return (i >= 0 && valores[i]) || `{{${nome}}}`
  })
  return [m.cabecalho, corpo, m.rodape].filter(Boolean).join('\n\n')
}

/** Mensagem livre só vale até 24 h depois da última mensagem DA PESSOA (regra da Meta). */
export function janelaAberta(msgs: Pick<MensagemConversa, 'deMim' | 'em'>[], agora = Date.now()): boolean {
  for (let i = msgs.length - 1; i >= 0; i--) if (!msgs[i].deMim) return agora - Date.parse(msgs[i].em) < 24 * 3600_000
  return false
}

// ---------------------------------------------------------------------------
// Conversas (mesma interface da tela Conversas do WhatsApp da XS)
// ---------------------------------------------------------------------------

interface LinhaMsg {
  id: string
  telefone: string
  nome: string | null
  de_mim: boolean
  texto: string
  midia: string | null
  status: string | null
  lida: boolean
  em: string
}

const paraMsg = (l: LinhaMsg): MensagemConversa => ({ id: l.id, deMim: l.de_mim, texto: l.texto, midia: l.midia, em: l.em, status: (l.status as Recibo | null) ?? null })

/** Versão = id + status da mensagem mais nova; muda quando chega ou atualiza algo. */
const versaoDe = (linhas: LinhaMsg[]) => {
  let h = linhas.length
  for (const l of linhas.slice(0, 50)) for (const ch of l.id + (l.status ?? '')) h = (h * 31 + ch.charCodeAt(0)) | 0
  return h
}

export const metaConversasApi: ConversasApi = {
  demo: false,
  async listar(): Promise<ListaConversas> {
    if (!supabase) return { versao: 0, conversas: [] }
    const { data, error } = await supabase.from('meta_mensagens').select('id,telefone,nome,de_mim,texto,midia,status,lida,em').order('em', { ascending: false }).limit(3000)
    if (error) throw new Error(error.message)
    const linhas = (data ?? []) as LinhaMsg[]
    const porTel = new Map<string, ResumoConversa>()
    for (const l of linhas) {
      let c = porTel.get(l.telefone)
      if (!c) {
        c = { telefone: l.telefone, nome: null, naoLidas: 0, atualizadaEm: l.em, ultima: paraMsg(l) }
        porTel.set(l.telefone, c)
      }
      if (!c.nome && l.nome && !l.de_mim) c.nome = l.nome
      if (!l.de_mim && !l.lida) c.naoLidas++
    }
    return { versao: versaoDe(linhas), conversas: [...porTel.values()] }
  },
  async abrir(telefone: string): Promise<ConversaAberta> {
    if (!supabase) return { versao: 0, telefone, nome: null, naoLidas: 0, msgs: [] }
    const { data, error } = await supabase
      .from('meta_mensagens')
      .select('id,telefone,nome,de_mim,texto,midia,status,lida,em')
      .eq('telefone', telefone)
      .order('em', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    const linhas = (data ?? []) as LinhaMsg[]
    return {
      versao: versaoDe(linhas),
      telefone,
      nome: linhas.find((l) => !l.de_mim && l.nome)?.nome ?? null,
      naoLidas: linhas.filter((l) => !l.de_mim && !l.lida).length,
      msgs: linhas.reverse().map(paraMsg),
    }
  },
  async enviar(telefone: string, texto: string): Promise<MensagemConversa> {
    return metaFetch<MensagemConversa>({ acao: 'texto', para: telefone, texto })
  },
  async marcarLidas(telefone: string): Promise<void> {
    await supabase?.from('meta_mensagens').update({ lida: true }).eq('telefone', telefone).eq('de_mim', false).eq('lida', false)
  },
}

// ---------------------------------------------------------------------------
// Disparo (campanhas por modelo aprovado)
// ---------------------------------------------------------------------------

export interface DestinatarioMeta {
  telefone: string
  nome: string
  lead_id: string | null
  valores: string[]
  texto: string
}

export interface CampanhaMeta {
  id: string
  nome: string
  modelo: string
  idioma: string
  variaveis: string[]
  nomeadas: boolean
  destinatarios: DestinatarioMeta[]
  total: number
  criado_em: string
}

export interface EnvioCampanha {
  telefone: string
  status: string | null
  erro: string | null
  em: string
}

/** Envios já feitos de cada campanha (mensagens com campanha_id). */
export async function enviosDasCampanhas(ids: string[]): Promise<Map<string, EnvioCampanha[]>> {
  const out = new Map<string, EnvioCampanha[]>()
  if (!supabase || !ids.length) return out
  const { data } = await supabase.from('meta_mensagens').select('campanha_id,telefone,status,erro,em').in('campanha_id', ids).limit(20000)
  for (const r of (data ?? []) as (EnvioCampanha & { campanha_id: string })[]) {
    const l = out.get(r.campanha_id) ?? []
    l.push(r)
    out.set(r.campanha_id, l)
  }
  return out
}

interface ModelosState {
  modelos: ModeloMeta[] | null
  erro: string | null
  carregando: boolean
  carregar(forcar?: boolean): Promise<void>
}

/** Modelos aprovados da conta (busca na Meta uma vez por sessão; "Atualizar" força). */
export const useModelosMeta = create<ModelosState>((set, get) => ({
  modelos: null,
  erro: null,
  carregando: false,
  async carregar(forcar = false) {
    if (get().carregando || (get().modelos && !forcar)) return
    set({ carregando: true, erro: null })
    try {
      const r = await metaFetch<{ modelos: ModeloMeta[] }>({ acao: 'modelos' })
      set({ modelos: r.modelos, carregando: false })
    } catch (err) {
      set({ erro: err instanceof Error ? err.message : 'Falha ao buscar os modelos.', carregando: false })
    }
  },
}))

/** Número do lead no formato da Meta (só dígitos, com 55). */
export function numeroDoLead(l: Pick<Lead, 'whatsapp' | 'telefone'>): string {
  const d = (l.whatsapp || l.telefone || '').replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? `55${d}` : d
}
