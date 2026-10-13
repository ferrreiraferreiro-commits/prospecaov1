// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { conferirResposta, IgErro, type IgResposta } from './instagram'

/**
 * Conversa com a extensão "XS · Instagram" (extensao-instagram/). A extensão injeta um
 * script nesta página e responde por window.postMessage; ela só repassa consultas de leitura
 * para a aba do Instagram que está logada no Chrome.
 */

export const EXTENSAO_ZIP = '/downloads/xs-instagram.zip'
/** Versão da pasta extensao-instagram/ (o teste confere com o manifest). Mais antiga instalada → aviso para atualizar. */
export const EXTENSAO_VERSAO = '1.1.0'
/** Link da extensão na Chrome Web Store. Preenchido → o instalador vira um botão "Adicionar ao Chrome". */
export const EXTENSAO_LOJA_URL = ''

/** "1.0.0" < "1.1.0" */
export function versaoAntiga(instalada: string, atual = EXTENSAO_VERSAO): boolean {
  const a = instalada.split('.').map(Number)
  const b = atual.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

export interface Navegador {
  nome: string
  /** Endereço da página de extensões (não dá para abrir por link: o usuário cola na barra) */
  extensoes: string
  modoDev: string
  carregar: string
  suportado: boolean
}

/** Navegador atual e os nomes dos botões na página de extensões dele. */
export function navegador(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent, brave = typeof navigator !== 'undefined' && 'brave' in navigator): Navegador {
  const chrome = { nome: 'Chrome', extensoes: 'chrome://extensions', modoDev: 'Modo do desenvolvedor', carregar: 'Carregar sem compactação', suportado: true }
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return { ...chrome, nome: 'celular', suportado: false }
  if (/Firefox\//.test(ua) || (/Safari\//.test(ua) && !/Chrome\//.test(ua))) return { ...chrome, nome: /Firefox/.test(ua) ? 'Firefox' : 'Safari', suportado: false }
  if (/OPR\/|Opera/.test(ua)) return { ...chrome, nome: 'Opera', extensoes: 'opera://extensions' }
  if (/Edg\//.test(ua)) return { ...chrome, nome: 'Edge', extensoes: 'edge://extensions', modoDev: 'Modo de desenvolvedor', carregar: 'Carregar sem pacote' }
  if (brave) return { ...chrome, nome: 'Brave', extensoes: 'brave://extensions' }
  return chrome
}

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
