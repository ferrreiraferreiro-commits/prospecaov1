// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { conferirResposta, IgErro, type IgResposta } from './instagram'

/**
 * Conversa com a extensão "XS · Instagram" (extensao-instagram/). A extensão injeta um
 * script nesta página e responde por window.postMessage; ela só repassa consultas de leitura
 * para a aba do Instagram que está logada no Chrome.
 */

export const EXTENSAO_ZIP = '/downloads/xs-instagram.zip'

export interface EstadoExtensao {
  versao: string
  instagram: { aba: boolean; logado: boolean; usuario?: string | null; nome?: string | null; erro?: string }
}

interface Mensagem {
  canal?: string
  tipo?: string
  id?: string
  versao?: string
  ok?: boolean
  erro?: string
}

let versao: string | null = null
const pendentes = new Map<string, (r: IgResposta & Record<string, unknown>) => void>()
const ouvintesVersao = new Set<(v: string) => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return
    const m = e.data as Mensagem | null
    if (!m || m.canal !== 'xs-ig') return
    if (m.tipo === 'oi' && m.versao) {
      versao = m.versao
      for (const f of ouvintesVersao) f(m.versao)
    }
    if (m.tipo === 'resposta' && m.id) {
      pendentes.get(m.id)?.(m as IgResposta & Record<string, unknown>)
      pendentes.delete(m.id)
    }
  })
}

const postar = (msg: Record<string, unknown>) => window.postMessage({ canal: 'xs-ig', ...msg }, window.location.origin)

/** Versão da extensão instalada (null se não está instalada neste navegador). */
export function detectarExtensao(ms = 900): Promise<string | null> {
  if (versao) return Promise.resolve(versao)
  return new Promise((resolve) => {
    const pronto = (v: string) => {
      clearTimeout(t)
      ouvintesVersao.delete(pronto)
      resolve(v)
    }
    const t = setTimeout(() => {
      ouvintesVersao.delete(pronto)
      resolve(versao)
    }, ms)
    ouvintesVersao.add(pronto)
    postar({ tipo: 'ola' })
  })
}

function pedir<T>(cmd: string, args: Record<string, unknown> = {}, ms = 60_000): Promise<T & IgResposta> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      pendentes.delete(id)
      resolve({ ok: false, erro: 'A extensão não respondeu. Confira se ela está ativa no Chrome.' } as T & IgResposta)
    }, ms)
    pendentes.set(id, (r) => {
      clearTimeout(t)
      resolve(r as T & IgResposta)
    })
    postar({ tipo: 'pedido', id, cmd, args })
  })
}

export async function estadoExtensao(abrir: boolean): Promise<EstadoExtensao> {
  const r = await pedir<EstadoExtensao>('estado', { abrir }, 45_000)
  if (!r.ok) throw new IgErro('extensao', r.erro || 'A extensão não respondeu.')
  return r
}

export async function abrirInstagram(): Promise<void> {
  await pedir('abrir', {}, 10_000)
}

/** Consulta de leitura no Instagram (pela aba logada). Devolve o JSON ou lança IgErro. */
export async function igGet(caminho: string): Promise<unknown> {
  return conferirResposta(await pedir('ig', { metodo: 'GET', caminho }))
}

export async function igPost(caminho: string, corpo: Record<string, string>): Promise<unknown> {
  return conferirResposta(await pedir('ig', { metodo: 'POST', caminho, corpo }))
}
