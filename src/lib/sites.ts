// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: fila de sites (vendedor manda, desenvolvedor pega) e chat da equipe.
import { useMemo } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { useAccount, type PapelEquipe } from '../store/useAccount'
import type { Lead } from './types'

export type SiteStatus = 'fila' | 'fazendo' | 'pronto'

export interface SitePedido {
  id: string
  lead_id: string
  pedido_por: string | null
  pedido_em: string
  briefing: string | null
  prazo: string | null
  status: SiteStatus
  dev: string | null
  pego_em: string | null
  link: string | null
  pronto_em: string | null
  /** Lead completo (vem junto, assim o desenvolvedor vê mesmo os que entraram na fila depois que ele abriu a XS) */
  lead: Lead | null
}

export const SITE_STATUS: Record<SiteStatus, { label: string; chip: string; dot: string }> = {
  fila: { label: 'Na fila', chip: 'bg-gold/10 text-gold ring-gold/30', dot: 'bg-gold' },
  fazendo: { label: 'Fazendo', chip: 'bg-blue-500/10 text-blue-300 ring-blue-500/30', dot: 'bg-blue-400' },
  pronto: { label: 'Pronto', chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30', dot: 'bg-go' },
}

const eu = () => useAccount.getState().profile?.user_id ?? null

function db() {
  if (!supabase) throw new Error('A fila de sites só funciona com a conta na nuvem.')
  return supabase
}

interface SitesState {
  carregado: boolean
  pedidos: SitePedido[]
  carregar(): Promise<void>
  pedir(leadId: string, briefing: string, prazo: string | null): Promise<void>
  editar(id: string, campos: Partial<Pick<SitePedido, 'briefing' | 'prazo' | 'link'>>): Promise<void>
  pegar(id: string): Promise<void>
  devolver(id: string): Promise<void>
  concluir(id: string, link: string): Promise<void>
  reabrir(id: string): Promise<void>
  cancelar(id: string): Promise<void>
}

const CAMPOS = 'id,lead_id,pedido_por,pedido_em,briefing,prazo,status,dev,pego_em,link,pronto_em,lead:leads(*)'

export const useSites = create<SitesState>((set, get) => {
  /** `soLivre`: só troca se ninguém pegou ainda (dois desenvolvedores clicando juntos) */
  const trocar = async (id: string, campos: Record<string, unknown>, soLivre = false) => {
    let q = db().from('sites_pedidos').update(campos).eq('id', id)
    if (soLivre) q = q.is('dev', null)
    const { data, error } = await q.select(CAMPOS)
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('Alguém já mexeu nesse site. A lista foi atualizada.')
    set((s) => ({ pedidos: s.pedidos.map((p) => (p.id === id ? (data[0] as unknown as SitePedido) : p)) }))
  }
  return {
    carregado: false,
    pedidos: [],
    async carregar() {
      if (!supabase) return set({ carregado: true })
      const { data } = await supabase.from('sites_pedidos').select(CAMPOS).order('pedido_em', { ascending: false }).limit(500)
      set({ carregado: true, pedidos: (data ?? []) as unknown as SitePedido[] })
    },
    async pedir(leadId, briefing, prazo) {
      const { data, error } = await db()
        .from('sites_pedidos')
        .upsert({ lead_id: leadId, briefing: briefing.trim() || null, prazo, status: 'fila', dev: null, pego_em: null, link: null, pronto_em: null, pedido_por: eu(), pedido_em: new Date().toISOString() }, { onConflict: 'conta,lead_id' })
        .select(CAMPOS)
        .single()
      if (error) throw new Error(error.message)
      set((s) => ({ pedidos: [data as unknown as SitePedido, ...s.pedidos.filter((p) => p.lead_id !== leadId)] }))
    },
    editar: (id, campos) => trocar(id, campos),
    pegar: (id) => trocar(id, { dev: eu(), status: 'fazendo', pego_em: new Date().toISOString() }, true),
    devolver: (id) => trocar(id, { dev: null, status: 'fila', pego_em: null }),
    concluir: (id, link) => trocar(id, { status: 'pronto', link: link.trim() || null, pronto_em: new Date().toISOString() }),
    reabrir: (id) => trocar(id, { status: get().pedidos.find((p) => p.id === id)?.dev ? 'fazendo' : 'fila', pronto_em: null }),
    async cancelar(id) {
      const { error } = await db().from('sites_pedidos').delete().eq('id', id)
      if (error) throw new Error(error.message)
      set((s) => ({ pedidos: s.pedidos.filter((p) => p.id !== id) }))
    },
  }
})

export interface Pessoa {
  nome: string
  papel: PapelEquipe
}

/** Nome e cargo de cada pessoa da equipe (o dono incluso), para o chat e a fila de sites. */
export function useQuem(): Map<string, Pessoa> {
  const equipe = useAccount((s) => s.equipe)
  const profile = useAccount((s) => s.profile)
  return useMemo(() => {
    const mapa = new Map<string, Pessoa>()
    if (equipe?.dono) mapa.set(equipe.dono.id, { nome: equipe.dono.nome ?? 'Dono', papel: 'dono' })
    else if (profile) mapa.set(profile.user_id, { nome: profile.nome || profile.usuario || 'Você', papel: 'dono' })
    for (const m of equipe?.membros ?? []) mapa.set(m.id, { nome: m.nome ?? m.usuario ?? 'Sem nome', papel: m.papel })
    return mapa
  }, [equipe, profile])
}

/** Pedido de site de um lead (null = não está na fila). */
export function useSiteDoLead(leadId: string): SitePedido | null {
  const pedidos = useSites((s) => s.pedidos)
  return useMemo(() => pedidos.find((p) => p.lead_id === leadId) ?? null, [pedidos, leadId])
}

// ---------------------------------------------------------------- chat da equipe

export interface MensagemChat {
  id: string
  autor: string | null
  texto: string
  lead_id: string | null
  criado_em: string
}

const VISTO_KEY = 'xs-prospeccao:chat-visto'

function lerVisto(): string {
  try {
    return localStorage.getItem(VISTO_KEY) ?? ''
  } catch {
    return ''
  }
}

interface ChatState {
  carregado: boolean
  mensagens: MensagemChat[]
  visto: string
  carregar(): Promise<void>
  enviar(texto: string): Promise<void>
  apagar(id: string): Promise<void>
  marcarVisto(): void
}

export const useChat = create<ChatState>((set, get) => ({
  carregado: false,
  mensagens: [],
  visto: lerVisto(),
  async carregar() {
    if (!supabase) return set({ carregado: true })
    const { data } = await supabase.from('equipe_chat').select('id,autor,texto,lead_id,criado_em').order('criado_em', { ascending: false }).limit(300)
    set({ carregado: true, mensagens: ((data ?? []) as MensagemChat[]).reverse() })
  },
  async enviar(texto) {
    const t = texto.trim().slice(0, 2000)
    if (!t) return
    const { data, error } = await db().from('equipe_chat').insert({ texto: t, autor: eu() }).select('id,autor,texto,lead_id,criado_em').single()
    if (error) throw new Error(error.message)
    set((s) => ({ mensagens: [...s.mensagens, data as MensagemChat] }))
    get().marcarVisto()
  },
  async apagar(id) {
    const { error } = await db().from('equipe_chat').delete().eq('id', id)
    if (error) throw new Error(error.message)
    set((s) => ({ mensagens: s.mensagens.filter((m) => m.id !== id) }))
  },
  marcarVisto() {
    const ultima = get().mensagens.at(-1)?.criado_em ?? new Date().toISOString()
    try {
      localStorage.setItem(VISTO_KEY, ultima)
    } catch {
      /* sem armazenamento: conta de novo ao recarregar */
    }
    set({ visto: ultima })
  },
}))

/** Mensagens novas no chat que a pessoa ainda não viu (as dela não contam). */
export function useChatNaoLidas(): number {
  const mensagens = useChat((s) => s.mensagens)
  const visto = useChat((s) => s.visto)
  const id = useAccount((s) => s.profile?.user_id)
  return useMemo(() => mensagens.filter((m) => m.criado_em > visto && m.autor !== id).length, [mensagens, visto, id])
}
