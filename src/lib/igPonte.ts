// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { conferirResposta, IgErro, type IgPagina, type IgResposta } from './instagram'

/**
 * Conversa com a extensão "XS · Instagram" (extensao-instagram/). A extensão injeta um
 * script nesta página e responde por window.postMessage; ela só repassa consultas de leitura
 * para a aba do Instagram que está logada no Chrome.
 */

export const EXTENSAO_ZIP = '/downloads/xs-instagram.zip'
/** Versão da pasta extensao-instagram/ (o teste confere com o manifest). Mais antiga instalada → aviso para atualizar. */
export const EXTENSAO_VERSAO = '1.2.0'
/** Primeira versão que lê o perfil pela página (quando a leitura rápida é barrada) */
export const PAGINA_DESDE = '1.2.0'
/** Link da extensão na Chrome Web Store. Preenchido → o instalador vira um botão "Adicionar ao Chrome". */
export const EXTENSAO_LOJA_URL = ''

/** "1.0.0" < "1.1.0" */
export function versaoAntiga(instalada: string, atual = EXTENSAO_VERSAO): boolean {
  const a = instalada.split('.').map(Number)
  const b = atual.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

export type NavegadorId = 'brave' | 'chrome' | 'edge' | 'opera'

export interface Navegador {
  id: NavegadorId
  nome: string
  /** Endereço da página de extensões (não dá para abrir por link: o usuário cola na barra) */
  extensoes: string
  /** Caminho pelo menu do navegador até a página de extensões */
  menu: string
  modoDev: string
  ondeModoDev: string
  carregar: string
  suportado: boolean
}

/** Nomes e caminhos da página de extensões de cada navegador. */
export const NAVEGADORES: Record<NavegadorId, Omit<Navegador, 'suportado'>> = {
  brave: {
    id: 'brave',
    nome: 'Brave',
    extensoes: 'brave://extensions',
    menu: '☰ (três risquinhos, no canto de cima à direita) → Extensões',
    modoDev: 'Modo do desenvolvedor',
    ondeModoDev: 'no canto de cima, à direita',
    carregar: 'Carregar sem compactação',
  },
  chrome: {
    id: 'chrome',
    nome: 'Chrome',
    extensoes: 'chrome://extensions',
    menu: '⋮ (três pontinhos, no canto de cima à direita) → Extensões → Gerenciar extensões',
    modoDev: 'Modo do desenvolvedor',
    ondeModoDev: 'no canto de cima, à direita',
    carregar: 'Carregar sem compactação',
  },
  edge: {
    id: 'edge',
    nome: 'Edge',
    extensoes: 'edge://extensions',
    menu: '··· (três pontinhos, no canto de cima à direita) → Extensões → Gerenciar extensões',
    modoDev: 'Modo de desenvolvedor',
    ondeModoDev: 'no menu da esquerda, embaixo',
    carregar: 'Carregar sem pacote',
  },
  opera: {
    id: 'opera',
    nome: 'Opera',
    extensoes: 'opera://extensions',
    menu: 'atalho Ctrl + Shift + E',
    modoDev: 'Modo de desenvolvedor',
    ondeModoDev: 'no canto de cima, à direita',
    carregar: 'Carregar sem compactação',
  },
}

/** Navegador atual e os nomes dos botões na página de extensões dele. */
export function navegador(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent, brave = typeof navigator !== 'undefined' && 'brave' in navigator): Navegador {
  const ok = (id: NavegadorId): Navegador => ({ ...NAVEGADORES[id], suportado: true })
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return { ...ok('chrome'), nome: 'celular', suportado: false }
  if (/Firefox\//.test(ua) || (/Safari\//.test(ua) && !/Chrome\//.test(ua))) return { ...ok('chrome'), nome: /Firefox/.test(ua) ? 'Firefox' : 'Safari', suportado: false }
  if (/OPR\/|Opera/.test(ua)) return ok('opera')
  if (/Edg\//.test(ua)) return ok('edge')
  if (brave) return ok('brave')
  return ok('chrome')
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

/**
 * Perfil pela página dele (como quando a pessoa abre o perfil). Usado quando o Instagram
 * barra a leitura rápida. Precisa da extensão 1.2.0 ou mais nova.
 */
export async function igPerfilPagina(usuario: string): Promise<IgPagina> {
  const r = await pedir<{ user?: Record<string, unknown> | null; posts?: number[]; meta?: string; naoExiste?: boolean }>('perfil', { usuario })
  if (!r.ok) throw new IgErro('extensao', r.erro || 'A extensão não respondeu.')
  const detalhe = `página ${r.status ?? '?'}`
  if (/\/accounts\/login/.test(r.url ?? '')) throw new IgErro('login', 'O Instagram pediu login. Entre numa conta na aba do Instagram e continue.', detalhe)
  if (/\/challenge\//.test(r.url ?? '')) throw new IgErro('verificacao', 'O Instagram pediu uma verificação na conta. Resolva na aba do Instagram e continue.', detalhe)
  if (r.status === 429) throw new IgErro('limite', 'O Instagram pediu uma pausa (muitas consultas seguidas).', detalhe)
  if (r.status === 404 || r.naoExiste) throw new IgErro('nao_existe', 'Perfil não encontrado.', detalhe)
  if (!r.status || r.status >= 400) throw new IgErro('falha', `O Instagram respondeu ${r.status ?? 'sem status'} na página do perfil.`, detalhe)
  return { user: r.user ?? null, posts: r.posts ?? [], meta: r.meta ?? '' }
}
