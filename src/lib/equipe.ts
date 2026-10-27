// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: turnos ("Entrar em serviço"), números de cada pessoa e quem atende cada conversa.
import { useMemo } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { useAccount } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { phoneKeyBr } from './disparo'
import { STATUS_MAP } from './statuses'

export interface Turno {
  id: string
  membro: string
  inicio: string
  fim: string | null
}

interface TurnoState {
  carregado: boolean
  /** Turnos da equipe nos últimos 31 dias (o dono vê de todos; cada um vê os da equipe) */
  turnos: Turno[]
  carregar(): Promise<void>
  entrar(): Promise<void>
  sair(): Promise<void>
}

const eu = () => useAccount.getState().profile?.user_id ?? null

export const useTurnos = create<TurnoState>((set, get) => ({
  carregado: false,
  turnos: [],
  async carregar() {
    if (!supabase) return set({ carregado: true })
    const desde = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const { data } = await supabase.from('equipe_turnos').select('id,membro,inicio,fim').gte('inicio', desde).order('inicio', { ascending: false }).limit(2000)
    set({ carregado: true, turnos: (data ?? []) as Turno[] })
  },
  async entrar() {
    if (!supabase || turnoAberto(get().turnos, eu())) return
    const { data, error } = await supabase.from('equipe_turnos').insert({}).select('id,membro,inicio,fim').single()
    if (error) throw new Error(error.message)
    set((s) => ({ turnos: [data as Turno, ...s.turnos] }))
  },
  async sair() {
    const aberto = turnoAberto(get().turnos, eu())
    if (!supabase || !aberto) return
    const fim = new Date().toISOString()
    const { error } = await supabase.from('equipe_turnos').update({ fim }).eq('id', aberto.id)
    if (error) throw new Error(error.message)
    set((s) => ({ turnos: s.turnos.map((t) => (t.id === aberto.id ? { ...t, fim } : t)) }))
  },
}))

/** Turno ainda aberto da pessoa (turno esquecido aberto há mais de 14 h não conta). */
export function turnoAberto(turnos: Turno[], membro: string | null): Turno | null {
  if (!membro) return null
  return turnos.find((t) => t.membro === membro && !t.fim && Date.now() - Date.parse(t.inicio) < 14 * 3_600_000) ?? null
}

/** Tempo em serviço desde uma data (ms). */
export function tempoEmServico(turnos: Turno[], membro: string, desde: number): number {
  const agora = Date.now()
  return turnos
    .filter((t) => t.membro === membro)
    .reduce((total, t) => {
      const ini = Math.max(Date.parse(t.inicio), desde)
      const fim = t.fim ? Date.parse(t.fim) : Math.min(agora, Date.parse(t.inicio) + 14 * 3_600_000)
      return total + Math.max(0, fim - ini)
    }, 0)
}

export const formatarHoras = (ms: number) => {
  const min = Math.round(ms / 60_000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

/** É alguém que trabalha na equipe de outra pessoa (não o dono)? */
export function useSouMembro(): boolean {
  return useAccount((s) => !!s.equipe?.dono)
}

/** Está em serviço agora? (o dono e quem não tem equipe estão sempre "em serviço") */
export function useEmServico(): boolean {
  const membro = useSouMembro()
  const id = useAccount((s) => s.profile?.user_id ?? null)
  const turnos = useTurnos((s) => s.turnos)
  return !membro || !!turnoAberto(turnos, id)
}

export const inicioDeHoje = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const inicioDoMes = () => {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Números de uma pessoa desde uma data: o que ela registrou na XS. */
export function useNumeros(pessoa: string, desde: number) {
  const interactions = useApp((s) => s.interactions)
  const meetings = useApp((s) => s.meetings)
  const leads = useApp((s) => s.leads)
  return useMemo(() => {
    const iso = new Date(desde).toISOString()
    const minhas = interactions.filter((i) => i.autor === pessoa && i.created_at >= iso && i.tipo !== 'importacao')
    const respDe = new Map(leads.map((l) => [l.id, l.responsavel ?? null]))
    const vendas = meetings.filter((m) => m.resultado === 'fechou' && m.data >= iso.slice(0, 10) && (respDe.get(m.lead_id) ?? m.autor) === pessoa)
    return {
      /** Leads diferentes em que a pessoa mexeu (ligou, mandou mensagem, mudou status) */
      prospectados: new Set(minhas.map((i) => i.lead_id)).size,
      ligacoes: minhas.filter((i) => i.tipo === 'ligacao').length,
      mensagens: minhas.filter((i) => i.tipo === 'mensagem').length,
      /** Falou com alguém (status de contato: atendeu, pediu WhatsApp, retorno, reunião…) */
      respostas: minhas.filter((i) => i.status && STATUS_MAP[i.status]?.contato).length,
      reunioes: minhas.filter((i) => i.status === 'agendou_reuniao').length,
      vendas: vendas.length,
      valor: vendas.reduce((t, m) => t + (m.valor ?? 0), 0),
    }
  }, [interactions, meetings, leads, pessoa, desde])
}

// ---------------------------------------------------------------- quem atende cada conversa

export type Canal = 'qr' | 'meta'

interface AtendentesState {
  /** `${canal}:${telefone}` → id de quem respondeu por último */
  mapa: Map<string, string>
  carregar(): Promise<void>
  marcar(canal: Canal, telefone: string): void
}

const chave = (canal: Canal, tel: string) => `${canal}:${phoneKeyBr(tel)}`

export const useAtendentes = create<AtendentesState>((set) => ({
  mapa: new Map(),
  async carregar() {
    if (!supabase || !useAccount.getState().equipe?.membros.length) return
    const { data } = await supabase.from('conversa_atendentes').select('canal,telefone,membro').limit(5000)
    set({ mapa: new Map(((data ?? []) as { canal: Canal; telefone: string; membro: string }[]).map((r) => [chave(r.canal, r.telefone), r.membro])) })
  },
  marcar(canal, telefone) {
    const id = eu()
    if (!supabase || !id || !useAccount.getState().equipe?.membros.length) return
    set((s) => ({ mapa: new Map(s.mapa).set(chave(canal, telefone), id) }))
    void supabase.from('conversa_atendentes').upsert({ canal, telefone, membro: id, em: new Date().toISOString() }, { onConflict: 'conta,canal,telefone' })
  },
}))

/** Nome de quem da equipe está atendendo a conversa (vazio sem equipe). */
export function useAtendenteDe(canal: Canal): (tel: string) => string | null {
  const mapa = useAtendentes((s) => s.mapa)
  const equipe = useAccount((s) => s.equipe)
  const profile = useAccount((s) => s.profile)
  return useMemo(() => {
    if (!equipe?.membros.length) return () => null
    const nomes = new Map(equipe.membros.map((m) => [m.id, m.nome ?? m.usuario ?? 'Equipe']))
    if (equipe.dono) nomes.set(equipe.dono.id, equipe.dono.nome ?? 'Dono')
    else if (profile) nomes.set(profile.user_id, profile.nome || 'Você')
    return (tel: string) => {
      const id = mapa.get(chave(canal, tel))
      return id ? (nomes.get(id) ?? null) : null
    }
  }, [mapa, equipe, profile, canal])
}
