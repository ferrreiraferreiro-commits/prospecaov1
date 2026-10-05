// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { create } from 'zustand'
import { supabase } from '../data/supabaseClient'

/**
 * Chave do Google (Places API) de cada conta e quantas consultas ela já fez no mês.
 * Fica na tabela busca_google (só o dono lê); no modo local, neste navegador.
 *
 * A cota grátis do Google é de 1.000 consultas por mês (Text Search Enterprise).
 * A XS para em `limite` (950 por padrão) para o usuário nunca ser cobrado.
 */

export const COTA_GRATIS = 1000
export const LIMITE_PADRAO = 950
/** Teto usado na chave de demonstração (sem cartão): ela nunca cobra, quem limita é o Google, por dia. */
export const SEM_TETO = 100000
const LOCAL_KEY = 'xs-prospeccao:busca-google'

export interface GoogleConfig {
  chave: string | null
  limite: number
  mes: string | null
  usadas: number
}

export const mesAtual = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Consultas usadas neste mês (o contador zera sozinho quando o mês vira). */
export const usadasNoMes = (c: GoogleConfig) => (c.mes === mesAtual() ? c.usadas : 0)
export const restantes = (c: GoogleConfig) => Math.max(0, c.limite - usadasNoMes(c))
/** Chave sem cartão: a XS não põe teto no mês. */
export const semTeto = (c: Pick<GoogleConfig, 'limite'>) => c.limite >= SEM_TETO

const VAZIO: GoogleConfig = {
  chave: null,
  limite: LIMITE_PADRAO,
  mes: null,
  usadas: 0,
}

interface Store {
  config: GoogleConfig
  loaded: boolean
  load(): Promise<void>
  save(patch: Partial<GoogleConfig>): Promise<void>
  /** Soma consultas feitas agora ao contador do mês. */
  addUso(calls: number): Promise<void>
}

async function readRemote(): Promise<GoogleConfig> {
  const { data, error } = await supabase!.from('busca_google').select('chave, limite, mes, usadas').maybeSingle()
  if (error) throw error
  return data
    ? {
        chave: data.chave,
        limite: data.limite,
        mes: data.mes,
        usadas: data.usadas,
      }
    : VAZIO
}

export const useGoogleKey = create<Store>()((set, get) => ({
  config: VAZIO,
  loaded: false,

  async load() {
    try {
      if (supabase) set({ config: await readRemote(), loaded: true })
      else
        set({
          config: {
            ...VAZIO,
            ...JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'),
          },
          loaded: true,
        })
    } catch {
      set({ loaded: true })
    }
  },

  async save(patch) {
    const next = { ...get().config, ...patch }
    if (supabase) {
      const { data: s } = await supabase.auth.getSession()
      const uid = s.session?.user.id
      if (!uid) throw new Error('Entre na sua conta para salvar a chave.')
      const { error } = await supabase.from('busca_google').upsert({
        user_id: uid,
        ...next,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(`Não consegui salvar: ${error.message}`)
    } else {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      } catch {
        /* sem armazenamento */
      }
    }
    set({ config: next })
  },

  async addUso(calls) {
    if (!calls) return
    // Relê antes de somar: outra aba pode ter buscado no meio tempo
    let base = get().config
    if (supabase) base = await readRemote().catch(() => base)
    const mes = mesAtual()
    await get().save({
      mes,
      usadas: (base.mes === mes ? base.usadas : 0) + calls,
    })
  },
}))
