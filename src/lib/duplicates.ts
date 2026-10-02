import { digits } from './contact'
import { normalizeKey } from './statuses'

/** Campos mínimos usados na comparação. */
export interface DupCandidate {
  id: string
  empresa: string
  telefone: string | null
  endereco: string | null
  maps_url: string | null
}

export type DupReason = 'telefone' | 'maps' | 'nome_endereco'

export interface DupMatch {
  otherId: string
  reasons: DupReason[]
}

export const DUP_REASON_LABEL: Record<DupReason, string> = {
  telefone: 'mesmo telefone',
  maps: 'mesmo local no Maps',
  nome_endereco: 'mesmo nome e endereço',
}

/**
 * Telefone comparável: DDD + últimos 8 dígitos. Ignora o DDI e o nono dígito,
 * então "(11) 97448-7416" e "(11) 7448-7416" contam como o mesmo número.
 */
export function phoneKey(tel: string | null): string | null {
  let d = digits(tel)
  if (d.length < 8) return null
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length === 10 || d.length === 11) return `${d.slice(0, 2)}${d.slice(-8)}`
  return d.slice(-8)
}

/** Identificador do lugar no Google Maps (place id / feature id), ignorando parâmetros de sessão. */
export function mapsKey(url: string | null): string | null {
  if (!url) return null
  const feature = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)
  if (feature) return feature[1].toLowerCase()
  const place = url.match(/(ChIJ[\w-]{10,})/)
  if (place) return place[1]
  const cid = url.match(/[?&]cid=(\d+)/)
  if (cid) return `cid:${cid[1]}`
  return url.split('?')[0].replace(/\/$/, '').toLowerCase()
}

/** Nome + endereço só é usado quando o endereço existe — nome igual sozinho não é duplicidade. */
export function nameAddressKey(empresa: string, endereco: string | null): string | null {
  if (!endereco) return null
  return `${normalizeKey(empresa)}|${normalizeKey(endereco)}`
}

function keysOf(c: DupCandidate): [DupReason, string][] {
  const out: [DupReason, string][] = []
  const p = phoneKey(c.telefone)
  if (p) out.push(['telefone', `t:${p}`])
  const m = mapsKey(c.maps_url)
  if (m) out.push(['maps', `m:${m}`])
  const n = nameAddressKey(c.empresa, c.endereco)
  if (n) out.push(['nome_endereco', `n:${n}`])
  return out
}

/** Índice para checar candidatos novos contra a base existente. */
export function buildDupIndex(items: DupCandidate[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const item of items) {
    for (const [, key] of keysOf(item)) {
      const list = index.get(key)
      if (list) list.push(item.id)
      else index.set(key, [item.id])
    }
  }
  return index
}

export function findMatches(candidate: DupCandidate, index: Map<string, string[]>): DupMatch[] {
  const byId = new Map<string, Set<DupReason>>()
  for (const [reason, key] of keysOf(candidate)) {
    for (const otherId of index.get(key) ?? []) {
      if (otherId === candidate.id) continue
      const set = byId.get(otherId) ?? new Set<DupReason>()
      set.add(reason)
      byId.set(otherId, set)
    }
  }
  return [...byId].map(([otherId, reasons]) => ({ otherId, reasons: [...reasons] }))
}

/** Mapa leadId → possíveis duplicados dentro da própria lista. */
export function detectDuplicates(items: DupCandidate[]): Map<string, DupMatch[]> {
  const index = buildDupIndex(items)
  const result = new Map<string, DupMatch[]>()
  for (const item of items) {
    const matches = findMatches(item, index)
    if (matches.length) result.set(item.id, matches)
  }
  return result
}
