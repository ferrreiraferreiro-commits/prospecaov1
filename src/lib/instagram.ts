// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { digits } from './contact'
import { phoneKey } from './duplicates'
import type { Mode } from './mapsSearch'
import type { ParsedLead } from './parser'
import { normalizeKey } from './statuses'
import type { Lead } from './types'

/**
 * Busca de leads no Instagram: o que se lê das respostas do Instagram (sem rede aqui).
 * As consultas passam pela extensão "XS · Instagram", na conta que está aberta no Chrome.
 */

export type IgFonte = 'palavra' | 'hashtag' | 'seguidores' | 'lista'

export const FONTE_LABEL: Record<IgFonte, string> = {
  palavra: 'Palavra-chave',
  hashtag: 'Hashtag',
  seguidores: 'Seguidores de um perfil',
  lista: 'Lista de @',
}

/** Perfil que apareceu numa busca, antes de abrir. */
export interface IgCandidato {
  usuario: string
  pk: string | null
  nome: string | null
  privado: boolean | null
}

/** Perfil aberto, com o que interessa para virar lead. */
export interface IgPerfil {
  usuario: string
  id: string | null
  nome: string
  bio: string
  categoria: string | null
  seguidores: number
  seguindo: number
  /** null = não deu para saber (leitura pela página) */
  posts: number | null
  /** ISO do post mais recente (null quando não dá para ver) */
  ultimoPost: string | null
  /** Conta comercial ou de criador (null = não deu para saber) */
  comercial: boolean | null
  privado: boolean
  verificado: boolean
  /** Só dígitos, com DDD (sem o 55) */
  telefone: string | null
  /** O número tem WhatsApp confirmado (link wa.me ou "WhatsApp" escrito na bio) */
  whatsapp: boolean
  email: string | null
  /** Site próprio (link de bio, WhatsApp e redes sociais não contam) */
  site: string | null
  /** Primeiro link da bio, qualquer que seja */
  linkBio: string | null
  endereco: string | null
  cidade: string | null
  cep: string | null
}

export interface IgFiltros {
  /** Só contas comerciais ou de criador */
  comercial: boolean
  /** Precisa de telefone ou WhatsApp */
  contato: boolean
  site: Mode
  /** Postou nos últimos N dias (0 = tanto faz) */
  ativoDias: number
  seguidoresMin: number
  /** 0 = sem limite */
  seguidoresMax: number
  /** Só quem cita a cidade (endereço, bio ou nome) */
  soCidade: boolean
}

export const FILTROS_PADRAO: IgFiltros = {
  comercial: true,
  contato: true,
  site: -1,
  ativoDias: 90,
  seguidoresMin: 0,
  seguidoresMax: 0,
  soCidade: false,
}

export type Motivo = 'privado' | 'pessoal' | 'sem_contato' | 'tem_site' | 'sem_site' | 'parado' | 'seguidores' | 'fora_cidade' | 'ja_lead' | 'nao_existe' | 'falha'

export const MOTIVO_LABEL: Record<Motivo, string> = {
  privado: 'Perfil privado',
  pessoal: 'Conta pessoal',
  sem_contato: 'Sem telefone',
  tem_site: 'Já tem site',
  sem_site: 'Sem site',
  parado: 'Parado há tempo',
  seguidores: 'Fora da faixa de seguidores',
  fora_cidade: 'Fora da cidade',
  ja_lead: 'Já está nos leads',
  nao_existe: 'Perfil não existe',
  falha: 'Não abriu',
}

// ---------------------------------------------------------------------------
// Leitura das respostas
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const numOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const USUARIO_VALIDO = /^[a-z0-9._]{1,30}$/

/** "@Loja.X", "instagram.com/loja.x/", "https://www.instagram.com/loja.x?igsh=…" → "loja.x" */
export function usuarioDe(texto: string | null | undefined): string | null {
  if (!texto) return null
  const t = texto.trim()
  const link = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  const u = (link ? link[1] : t.replace(/^@/, '').split(/[\s/?#,;]/)[0]).toLowerCase()
  if (!USUARIO_VALIDO.test(u) || ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct'].includes(u)) return null
  return u
}

/** Lista colada (um por linha, vírgula ou espaço) → usuários únicos. */
export function lerLista(texto: string): string[] {
  const out = new Set<string>()
  for (const parte of texto.split(/[\n,;\s]+/)) {
    const u = usuarioDe(parte)
    if (u) out.add(u)
  }
  return [...out]
}

/**
 * Todos os perfis que aparecem numa resposta do Instagram (busca, hashtag, seguidores…).
 * Procura em qualquer lugar da resposta: o formato muda com frequência, o perfil não.
 */
export function coletarPerfis(resposta: unknown): IgCandidato[] {
  const achados = new Map<string, IgCandidato>()
  const visitar = (v: unknown, prof: number) => {
    if (prof > 14 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (const x of v) visitar(x, prof + 1)
      return
    }
    const o = v as Json
    const u = typeof o.username === 'string' ? o.username.toLowerCase() : null
    if (u && USUARIO_VALIDO.test(u) && (o.pk != null || o.id != null || o.pk_id != null || 'full_name' in o)) {
      const atual = achados.get(u)
      const pk = o.pk ?? o.pk_id ?? o.id
      achados.set(u, {
        usuario: u,
        pk: atual?.pk ?? (pk != null ? String(pk) : null),
        nome: atual?.nome ?? str(o.full_name),
        privado: atual?.privado ?? (typeof o.is_private === 'boolean' ? o.is_private : null),
      })
    }
    for (const x of Object.values(o)) if (x && typeof x === 'object') visitar(x, prof + 1)
  }
  visitar(resposta, 0)
  return [...achados.values()]
}

/** Hashtags que a busca sugeriu (busca por palavra-chave). */
export function coletarHashtags(resposta: unknown): string[] {
  const lista = obj(resposta)?.hashtags
  if (!Array.isArray(lista)) return []
  return lista
    .map((h) => str(obj(obj(h)?.hashtag)?.name))
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase())
}

/** Primeiro valor de uma chave em qualquer lugar da resposta (ex.: "next_max_id"). */
export function acharChave(resposta: unknown, chave: string): unknown {
  let achado: unknown
  const visitar = (v: unknown, prof: number): boolean => {
    if (prof > 10 || !v || typeof v !== 'object') return false
    if (Array.isArray(v)) return v.some((x) => visitar(x, prof + 1))
    const o = v as Json
    if (chave in o && o[chave] != null && o[chave] !== '') {
      achado = o[chave]
      return true
    }
    return Object.values(o).some((x) => visitar(x, prof + 1))
  }
  visitar(resposta, 0)
  return achado
}

// ---------------------------------------------------------------------------
// Telefone, WhatsApp e site
// ---------------------------------------------------------------------------

/** Número do Brasil só com DDD + número (10 ou 11 dígitos). */
export function telefoneBr(texto: string | null | undefined): string | null {
  let d = digits(texto)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1)
  if (d.length !== 10 && d.length !== 11) return null
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99 || d[2] === '0') return null
  if (d.length === 11 && d[2] !== '9') return null
  return d
}

export function ehCelular(tel: string | null): boolean {
  return !!tel && tel.length === 11 && tel[2] === '9'
}

/** Telefones escritos na bio: "(43) 99999-8888", "43 9 9999 8888", "+55 43 99999-8888". */
export function telefonesNoTexto(texto: string): string[] {
  const out: string[] = []
  const re = /(?:\+?55[\s.-]*)?\(?\b\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}\b/g
  for (const m of texto.match(re) ?? []) {
    const t = telefoneBr(m)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Número de um link de WhatsApp (wa.me, api.whatsapp.com, whatsapp://). */
export function telefoneDoWhatsApp(link: string | null | undefined): string | null {
  if (!link) return null
  const m = link.match(/wa\.me\/(?:send\?phone=)?\+?(\d{10,13})/i) ?? link.match(/whatsapp\.com\/send\/?\?phone=\+?(\d{10,13})/i) ?? link.match(/phone=\+?(\d{10,13})/i)
  return m ? telefoneBr(m[1]) : null
}

const NAO_E_SITE = [
  'instagram.com',
  'facebook.com',
  'fb.me',
  'fb.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
  'threads.net',
  'wa.me',
  'whatsapp.com',
  'wa.link',
  'linktr.ee',
  'linktree',
  'beacons.ai',
  'bio.site',
  'bio.link',
  'linkin.bio',
  'lnk.bio',
  'taplink',
  'campsite.bio',
  'msha.ke',
  'carrd.co',
  'linkbio',
  'allmylinks',
  'solo.to',
  'hoo.be',
  'tap.bio',
  'ifood.com.br',
  'goo.gl',
  'g.page',
  'maps.app.goo.gl',
  'google.com',
  'bit.ly',
  'linklist.bio',
  'agendapro',
  'calendly.com',
  'shopee.com',
  'mercadolivre.com',
  'pinterest.com',
  'spotify.com',
]

/** Link que é um site de verdade do negócio (não agregador de links, rede social ou WhatsApp). */
export function siteProprio(url: string | null | undefined): string | null {
  const u = str(url)
  if (!u) return null
  const host = u
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/)[0]
    .toLowerCase()
    .replace(/^www\./, '')
  if (!host.includes('.') || NAO_E_SITE.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d))) return null
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/** Resposta de /api/v1/users/web_profile_info/ → perfil (null se não veio perfil). */
export function lerPerfil(resposta: unknown): IgPerfil | null {
  const r = obj(resposta)
  const u = obj(obj(r?.data)?.user) ?? obj(r?.user)
  const usuario = str(u?.username)?.toLowerCase()
  if (!u || !usuario) return null

  const bio = str(u.biography) ?? ''
  const links: string[] = []
  for (const l of Array.isArray(u.bio_links) ? u.bio_links : []) {
    const url = str(obj(l)?.url) ?? str(obj(l)?.lynx_url)
    if (url) links.push(url)
  }
  const externo = str(u.external_url)
  if (externo && !links.includes(externo)) links.unshift(externo)

  // Telefone: o botão de contato do perfil comercial, depois o WhatsApp dos links, depois a bio
  const doBotao = telefoneBr(str(u.business_phone_number) ?? str(u.public_phone_number) ?? null)
  const doZap = links.map(telefoneDoWhatsApp).find(Boolean) ?? telefoneDoWhatsApp(bio)
  const daBio = telefonesNoTexto(bio)
  const telefone = doBotao ?? doZap ?? daBio[0] ?? null
  const zapNaBio = /whats|wpp|zap\b|zapzap|📲|📱/i.test(bio)
  const whatsapp = !!telefone && (telefone === doZap || (zapNaBio && ehCelular(telefone)) || (str(u.business_contact_method) === 'WHATSAPP' && telefone === doBotao))

  let endereco: string | null = null
  let cidade: string | null = null
  let cep: string | null = null
  const end = str(u.business_address_json)
  if (end) {
    try {
      const a = JSON.parse(end) as Json
      endereco = str(a.street_address)
      cidade = str(a.city_name)
      cep = str(a.zip_code)
    } catch {
      /* endereço em formato inesperado */
    }
  }

  const midia = obj(u.edge_owner_to_timeline_media)
  const edges = Array.isArray(midia?.edges) ? midia.edges : []
  const datas = edges.map((e) => num(obj(obj(e)?.node)?.taken_at_timestamp)).filter((t) => t > 0)
  const ultimo = datas.length ? Math.max(...datas) : 0

  return {
    usuario,
    id: str(u.id) ?? (u.pk != null ? String(u.pk) : null),
    nome: str(u.full_name) ?? '',
    bio,
    categoria: str(u.business_category_name) ?? str(u.category_name) ?? str(u.category),
    seguidores: num(obj(u.edge_followed_by)?.count) || num(u.follower_count),
    seguindo: num(obj(u.edge_follow)?.count) || num(u.following_count),
    posts: numOuNull(midia?.count) ?? numOuNull(u.media_count) ?? numOuNull(u.all_media_count),
    ultimoPost: ultimo ? new Date(ultimo * 1000).toISOString() : null,
    comercial: 'is_business_account' in u || 'is_professional_account' in u ? u.is_business_account === true || u.is_professional_account === true : null,
    privado: u.is_private === true,
    verificado: u.is_verified === true,
    telefone,
    whatsapp,
    email: str(u.business_email) ?? str(u.public_email) ?? bio.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
    site: links.map(siteProprio).find(Boolean) ?? null,
    linkBio: links[0] ?? null,
    endereco,
    cidade,
    cep,
  }
}

/** "268M seguidores, seguindo 195, 32K posts" → números (meta da página do perfil). */
export function contarMeta(meta: string, palavra: RegExp): number | null {
  const m = meta.match(new RegExp(`([\\d.,]+)\\s*(mil|[KkMm])?\\s*(?:${palavra.source})`, 'i'))
  if (!m) return null
  const mult = !m[2] ? 1 : /^(k|mil)$/i.test(m[2]) ? 1000 : 1_000_000
  // "1,670" e "1.670" são milhar; "1.5" ou "1,5" com K/M são decimais
  const n = m[2] ? Number(m[1].replace(',', '.')) : Number(m[1].replace(/[.,]/g, ''))
  return Number.isFinite(n) ? Math.round(n * mult) : null
}

export interface IgPagina {
  user: Record<string, unknown> | null
  posts?: number[]
  meta?: string
}

/** Perfil lido pela página dele (extensão, comando "perfil") → mesmo formato da consulta rápida. */
export function lerPerfilPagina(r: IgPagina): IgPerfil | null {
  if (!r.user) return null
  const meta = r.meta ?? ''
  const user: Json = { ...r.user }
  if (numOuNull(user.follower_count) == null) user.follower_count = contarMeta(meta, /seguidores|followers/) ?? 0
  if (numOuNull(user.media_count) == null && numOuNull(user.all_media_count) == null) user.media_count = contarMeta(meta, /posts|publica[çc][õo]es/)
  const posts = r.posts ?? []
  if (posts.length) user.edge_owner_to_timeline_media = { count: user.media_count ?? posts.length, edges: posts.map((t) => ({ node: { taken_at_timestamp: t } })) }
  return lerPerfil({ data: { user } })
}

/** Por que o perfil não serve (null = serve). */
export function motivoDescarte(p: IgPerfil, f: IgFiltros, cidade: string, agora = Date.now()): Motivo | null {
  if (p.privado) return 'privado'
  if (f.comercial && p.comercial === false) return 'pessoal'
  if (f.contato && !p.telefone) return 'sem_contato'
  if (f.site === -1 && p.site) return 'tem_site'
  if (f.site === 1 && !p.site) return 'sem_site'
  if (f.ativoDias > 0) {
    // Sem post nenhum também conta como parado; sem a data (leitura pela página), deixa passar
    if (p.ultimoPost ? (agora - Date.parse(p.ultimoPost)) / 86_400_000 > f.ativoDias : p.posts === 0) return 'parado'
  }
  if (p.seguidores < f.seguidoresMin || (f.seguidoresMax > 0 && p.seguidores > f.seguidoresMax)) return 'seguidores'
  if (f.soCidade && cidade.trim()) {
    const c = normalizeKey(cidade.split(',')[0])
    const onde = normalizeKey(`${p.cidade ?? ''} ${p.endereco ?? ''} ${p.bio} ${p.nome} ${p.usuario}`)
    if (c && !onde.includes(c) && !onde.includes(c.replace(/\s+/g, ''))) return 'fora_cidade'
  }
  return null
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/** "@loja.x" de um lead (campo Instagram), para não trazer o mesmo perfil duas vezes. */
export function usuarioDoLead(lead: Pick<Lead, 'instagram'>): string | null {
  return usuarioDe(lead.instagram)
}

/** Usuários e telefones dos leads que já existem. */
export function chavesDosLeads(leads: Pick<Lead, 'instagram' | 'telefone' | 'whatsapp'>[]): { usuarios: Set<string>; telefones: Set<string> } {
  const usuarios = new Set<string>()
  const telefones = new Set<string>()
  for (const l of leads) {
    const u = usuarioDoLead(l)
    if (u) usuarios.add(u)
    for (const t of [l.telefone, l.whatsapp]) {
      const k = phoneKey(t)
      if (k) telefones.add(k)
    }
  }
  return { usuarios, telefones }
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** Origem gravada nos leads do Instagram (o acompanhamento conta por ela). */
export const ORIGEM_INSTAGRAM = 'Instagram'
export const CHAVE_BUSCA = 'Busca no Instagram'

export function perfilParaLead(p: IgPerfil, ctx: { nicho: string; busca: string }, index = 0): ParsedLead {
  const extras: Record<string, string> = {
    Origem: ORIGEM_INSTAGRAM,
    [CHAVE_BUSCA]: ctx.busca,
    Seguidores: p.seguidores.toLocaleString('pt-BR'),
  }
  if (p.categoria) extras['Categoria no Instagram'] = p.categoria
  if (p.bio) extras['Bio do Instagram'] = p.bio
  if (p.email) extras['E-mail'] = p.email
  if (p.linkBio && p.linkBio !== p.site) extras['Link na bio'] = p.linkBio
  if (p.ultimoPost) extras['Último post'] = dataBr(p.ultimoPost)
  if (p.cep) extras.CEP = p.cep
  const [cidade, estado] = (p.cidade ?? '').split(',').map((s) => s.trim())
  return {
    index: index + 1,
    empresa: p.nome || `@${p.usuario}`,
    nicho: ctx.nicho || p.categoria || null,
    telefone: p.telefone,
    whatsapp: p.whatsapp ? p.telefone : null,
    instagram: `https://instagram.com/${p.usuario}`,
    website: p.site,
    endereco: p.endereco,
    cidade: cidade || null,
    estado: estado || null,
    avaliacao: null,
    numero_avaliacoes: null,
    pasta: null,
    etapa: null,
    maps_url: null,
    observacoes: null,
    dados_extras: extras,
    status: 'novo',
  }
}

/** Busca que gerou o lead (ex.: "Palavra-chave: manicure"), ou null se não veio do Instagram. */
export function buscaDoLead(lead: Pick<Lead, 'dados_extras'>): string | null {
  const e = lead.dados_extras
  if (e?.Origem !== ORIGEM_INSTAGRAM) return null
  return e[CHAVE_BUSCA] ?? 'Instagram'
}

// ---------------------------------------------------------------------------
// Erros do Instagram
// ---------------------------------------------------------------------------

export type IgErroTipo = 'login' | 'limite' | 'verificacao' | 'nao_existe' | 'extensao' | 'falha'

export class IgErro extends Error {
  constructor(
    readonly tipo: IgErroTipo,
    message: string,
    /** O que o Instagram respondeu de fato (para o registro) */
    readonly detalhe = '',
  ) {
    super(message)
  }
}

export interface IgResposta {
  ok: boolean
  status?: number
  json?: unknown
  texto?: string
  url?: string
  erro?: string
}

/** Lê a resposta da extensão e devolve o JSON, ou lança o erro certo. */
export function conferirResposta(r: IgResposta): unknown {
  if (!r.ok) throw new IgErro('extensao', r.erro || 'A extensão não respondeu.')
  const j = obj(r.json)
  const msg = String(j?.message ?? '')
  const detalhe = `${r.status ?? '?'}${msg ? ` ${msg}` : ''}`.slice(0, 160)
  if (/\/accounts\/login|\/challenge\//.test(r.url ?? '') && !j) throw new IgErro('login', 'O Instagram desta aba não está logado. Entre numa conta e continue.', detalhe)
  if (j?.require_login === true || (r.status === 401 && /login/i.test(msg))) throw new IgErro('login', 'O Instagram pediu login. Entre numa conta na aba do Instagram e continue.', detalhe)
  if (/checkpoint|challenge/i.test(msg) || j?.checkpoint_url || j?.challenge) throw new IgErro('verificacao', 'O Instagram pediu uma verificação na conta. Resolva na aba do Instagram e continue.', detalhe)
  if (r.status === 429 || /wait a few minutes|aguarde alguns minutos|try again later|tente novamente mais tarde|feedback_required|rate.?limit|spam/i.test(msg))
    throw new IgErro('limite', 'O Instagram pediu uma pausa (muitas consultas seguidas).', detalhe)
  if (r.status === 404) throw new IgErro('nao_existe', 'Perfil não encontrado.')
  if (!r.status || r.status >= 400 || !j) throw new IgErro('falha', `O Instagram respondeu ${r.status ?? 'sem status'}${msg ? `: ${msg}` : ''}.`, detalhe)
  if (j.status === 'fail') throw new IgErro('falha', msg || 'O Instagram recusou a consulta.', detalhe)
  return j
}

/** Espera entre consultas, em ms, para cada velocidade. */
export type Velocidade = 'rapida' | 'normal' | 'cuidadosa'
export const ESPERA: Record<Velocidade, [number, number]> = {
  rapida: [900, 2200],
  normal: [2500, 5500],
  cuidadosa: [7000, 14000],
}
export const VELOCIDADE_LABEL: Record<Velocidade, { label: string; hint: string }> = {
  rapida: { label: 'Rápida', hint: '~1 a 2 s por perfil' },
  normal: { label: 'Normal', hint: '~3 a 5 s por perfil' },
  cuidadosa: { label: 'Cuidadosa', hint: '~7 a 14 s por perfil' },
}
