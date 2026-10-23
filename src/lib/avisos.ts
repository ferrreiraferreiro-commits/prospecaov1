// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'
import { useAccount } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { showSystemNotification } from './notify'

/** Aviso que o dono da XS manda para todas as contas (tabela avisos_xs). Aparece no sininho. */
export interface Aviso {
  id: string
  titulo: string
  texto: string
  link: string | null
  criado_em: string
}

interface AvisosState {
  lista: Aviso[]
  /** Muda quando alguém pede para abrir o sininho (ex.: botão "Ver" do aviso na tela). */
  abrirSino: number
}

export const useAvisosStore = create<AvisosState>(() => ({ lista: [], abrirSino: 0 }))

const NOTIFICADOS_KEY = 'xs-prospeccao:avisos-notificados'
/** Conta que nunca abriu o sininho: avisos dos últimos 7 dias contam como novos. */
const JANELA_NOVOS = 7 * 86_400_000

function loadNotificados(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFICADOS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveNotificados(ids: Set<string>) {
  try {
    localStorage.setItem(NOTIFICADOS_KEY, JSON.stringify([...ids].slice(-50)))
  } catch {
    /* sem armazenamento */
  }
}

/** Aviso ainda não visto pela conta (chegou depois da última vez que ela abriu o sininho). */
export function avisoNovo(aviso: Aviso, vistosEm: string | null | undefined): boolean {
  const base = vistosEm ? Date.parse(vistosEm) : Date.now() - JANELA_NOVOS
  return Date.parse(aviso.criado_em) > base
}

export function useAvisosNovos(): Aviso[] {
  const lista = useAvisosStore((s) => s.lista)
  const vistosEm = useAccount((s) => s.profile?.avisos_vistos_em)
  return lista.filter((a) => avisoNovo(a, vistosEm))
}

async function carregar() {
  if (!supabase) return
  const { data, error } = await supabase.from('avisos_xs').select('id,titulo,texto,link,criado_em').order('criado_em', { ascending: false }).limit(20)
  if (error || !data) return
  const lista = data as Aviso[]
  useAvisosStore.setState({ lista })

  // Aviso novo que este aparelho ainda não mostrou: aviso na tela e notificação do sistema
  const vistosEm = useAccount.getState().profile?.avisos_vistos_em
  const notificados = loadNotificados()
  const novos = lista.filter((a) => avisoNovo(a, vistosEm) && !notificados.has(a.id))
  if (!novos.length) return
  for (const a of novos.slice(0, 3).reverse()) {
    const ver = () => useAvisosStore.setState((s) => ({ abrirSino: s.abrirSino + 1 }))
    useApp.getState().toast(`Aviso da XS: ${a.titulo}`, 'info', { label: 'Ver', run: ver })
    void showSystemNotification(a.titulo, a.texto || 'Novo aviso da XS', `aviso-${a.id}`, ver)
  }
  for (const a of novos) notificados.add(a.id)
  saveNotificados(notificados)
}

/** Busca os avisos ao abrir o app, a cada 2 minutos e quando a pessoa volta para a aba. */
export function useAvisos() {
  const logado = useAccount((s) => !!s.profile && s.profile.user_id !== 'local')
  useEffect(() => {
    if (!supabase || !logado) return
    void carregar()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, 120_000)
    const voltou = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', voltou)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', voltou)
    }
  }, [logado])
}

/** Abriu o sininho: tudo o que está na lista passa a ser "visto" (em todos os aparelhos da conta). */
export async function marcarAvisosVistos() {
  const { profile } = useAccount.getState()
  const ultimo = useAvisosStore.getState().lista[0]?.criado_em
  if (!supabase || !profile || profile.user_id === 'local' || !ultimo) return
  // Usa a hora do próprio aviso (relógio do servidor), não a do computador
  if (profile.avisos_vistos_em && Date.parse(profile.avisos_vistos_em) >= Date.parse(ultimo)) return
  useAccount.setState({ profile: { ...profile, avisos_vistos_em: ultimo } })
  await supabase.from('profiles').update({ avisos_vistos_em: ultimo }).eq('user_id', profile.user_id)
}

/** Aceita "xs-prospeccao.vercel.app/assinar" e completa com https://. Vazio = sem link. */
export function normalizarLink(link: string): string | null {
  const t = link.trim()
  if (!t) return null
  const comProtocolo = /^[a-z]+:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(comProtocolo)
    if (u.protocol !== 'https:') throw new Error()
    return u.toString()
  } catch {
    throw new Error('O link precisa começar com https://')
  }
}

/** Só o dono da XS (o banco confere de novo). */
export async function publicarAviso(titulo: string, texto: string, link: string): Promise<void> {
  if (!supabase) return
  const t = titulo.trim()
  if (!t) throw new Error('Escreva o título do aviso.')
  if (t.length > 120) throw new Error('Título muito longo (até 120 letras).')
  if (texto.trim().length > 2000) throw new Error('Texto muito longo (até 2.000 letras).')
  const { data, error } = await supabase
    .from('avisos_xs')
    .insert({ titulo: t, texto: texto.trim(), link: normalizarLink(link) })
    .select('id,titulo,texto,link,criado_em')
    .single()
  if (error) throw new Error(error.code === '42501' ? 'Só o dono da XS pode mandar avisos.' : error.message)
  const aviso = data as Aviso
  useAvisosStore.setState((s) => ({ lista: [aviso, ...s.lista] }))
  // Quem mandou já viu: não recebe o próprio aviso como novo
  const notificados = loadNotificados()
  notificados.add(aviso.id)
  saveNotificados(notificados)
  await marcarAvisosVistos()
}

export async function apagarAviso(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('avisos_xs').delete().eq('id', id)
  if (error) throw new Error(error.message)
  useAvisosStore.setState((s) => ({ lista: s.lista.filter((a) => a.id !== id) }))
}
