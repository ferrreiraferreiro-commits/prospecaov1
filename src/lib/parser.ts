import { normalizeKey, statusFromText } from './statuses'
import type { StatusId } from './types'

/** Lead extraído do arquivo, antes de ser salvo. */
export interface ParsedLead {
  /** Número do bloco no arquivo ([001] → 1) */
  index: number
  empresa: string
  nicho: string | null
  telefone: string | null
  whatsapp: string | null
  instagram: string | null
  website: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  avaliacao: number | null
  numero_avaliacoes: number | null
  pasta: string | null
  etapa: string | null
  maps_url: string | null
  observacoes: string | null
  dados_extras: Record<string, string> | null
  status: StatusId
  /** CNPJ já identificado (busca no Maps) */
  cnpj?: string | null
}

export interface ParseResult {
  leads: ParsedLead[]
  /** Metadados do cabeçalho (ex.: Data da Exportação, Total de Leads) */
  meta: Record<string, string>
  /** Quantidade declarada no cabeçalho, quando existir */
  declaredTotal: number | null
  warnings: string[]
}

type Field = Exclude<keyof ParsedLead, 'index' | 'empresa' | 'dados_extras' | 'status' | 'estado' | 'numero_avaliacoes'>

/** Rótulos aceitos para cada campo (normalizados, sem acento). */
const FIELD_ALIASES: Record<string, Field> = {
  categoria_nicho: 'nicho',
  categoria: 'nicho',
  nicho: 'nicho',
  segmento: 'nicho',
  telefone: 'telefone',
  fone: 'telefone',
  celular: 'telefone',
  whatsapp_direto: 'whatsapp',
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  website_oficial: 'website',
  website: 'website',
  site: 'website',
  site_oficial: 'website',
  endereco_completo: 'endereco',
  endereco: 'endereco',
  cidade_regiao: 'cidade',
  cidade: 'cidade',
  avaliacao_google: 'avaliacao',
  avaliacao: 'avaliacao',
  nota_google: 'avaliacao',
  pasta_no_crm: 'pasta',
  pasta: 'pasta',
  etapa_no_funil: 'etapa',
  etapa: 'etapa',
  link_google_maps: 'maps_url',
  google_maps: 'maps_url',
  maps: 'maps_url',
  observacoes: 'observacoes',
  observacao: 'observacoes',
  obs: 'observacoes',
}

/** Valores que significam "sem informação". */
const EMPTY_PATTERNS = [
  /^n[aã]o\s+informad[oa]s?\.?$/i,
  /^n[aã]o\s+possui\b.*$/i,
  /^n[aã]o\s+encontrad[oa]\b.*$/i,
  /^n[aã]o\s+dispon[ií]vel\b.*$/i,
  /^sem\s+(site|website|instagram|whats\s?app|telefone|endere[cç]o|avalia[cç](ão|oes|ões)|observa[cç](ão|oes|ões)|informa[cç](ão|oes|ões)|dados)\b.*$/i,
  /^nenhum[a]?\.?$/i,
  /^n\/?a$/i,
  /^-+$/,
  /^null$/i,
  /^undefined$/i,
]

export function isEmptyValue(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim()
  if (!v) return true
  return EMPTY_PATTERNS.some((re) => re.test(v))
}

function clean(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  return isEmptyValue(v) ? null : v
}

/** "3.8 estrelas (13 avaliações)" → { nota: 3.8, total: 13 } */
export function parseRating(raw: string | null): { nota: number | null; total: number | null } {
  if (!raw || isEmptyValue(raw)) return { nota: null, total: null }
  const nota = raw.match(/(\d+(?:[.,]\d+)?)/)
  const total = raw.match(/\(\s*([\d.]+)\s*(?:avalia|review|opini)/i) ?? raw.match(/([\d.]+)\s*(?:avalia|review|opini)/i)
  const n = nota ? Number(nota[1].replace(',', '.')) : null
  return {
    nota: n !== null && Number.isFinite(n) && n >= 0 && n <= 5 ? n : null,
    total: total ? Number(total[1].replace(/\./g, '')) : null,
  }
}

/** "Mogi das Cruzes - SP" → { cidade: "Mogi das Cruzes", estado: "SP" } */
export function splitCity(raw: string | null): { cidade: string | null; estado: string | null } {
  if (!raw) return { cidade: null, estado: null }
  const m = raw.match(/^(.*?)\s*[-–/,]\s*([A-Za-z]{2})\s*$/)
  if (m) return { cidade: m[1].trim() || null, estado: m[2].toUpperCase() }
  return { cidade: raw.trim(), estado: null }
}

const BLOCK_START = /^\s*\[\s*(\d+)\s*\]\s*(.*?)\s*$/
const KEY_VALUE = /^\s*([^:]{1,60}?)\s*:\s?(.*)$/
const RULE = /^\s*[=\-_*•]{4,}\s*$/

interface RawBlock {
  index: number
  empresa: string
  fields: [string, string][]
}

/** Decodifica o arquivo tentando UTF-8 e, se houver caracteres inválidos, Windows-1252. */
export function decodeFile(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  try {
    return new TextDecoder('windows-1252').decode(buffer)
  } catch {
    return utf8
  }
}

export function parseLeadsTxt(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const meta: Record<string, string> = {}
  const warnings: string[] = []
  const blocks: RawBlock[] = []
  let current: RawBlock | null = null
  let lastKey: string | null = null

  for (const line of lines) {
    if (RULE.test(line)) {
      lastKey = null
      continue
    }
    const start = line.match(BLOCK_START)
    if (start) {
      current = { index: Number(start[1]), empresa: start[2], fields: [] }
      blocks.push(current)
      lastKey = null
      continue
    }
    if (!line.trim()) {
      lastKey = null
      continue
    }
    const kv = line.match(KEY_VALUE)
    if (kv && !/^https?$/i.test(kv[1].trim())) {
      const key = kv[1].trim()
      const value = kv[2].trim()
      if (current) {
        current.fields.push([key, value])
        lastKey = key
      } else {
        meta[key] = value
      }
      continue
    }
    // Linha de continuação (ex.: observação em várias linhas)
    if (current && lastKey) {
      const last = current.fields[current.fields.length - 1]
      last[1] = `${last[1]}\n${line.trim()}`.trim()
    }
  }

  const leads: ParsedLead[] = []
  for (const block of blocks) {
    const values: Partial<Record<Field, string>> = {}
    const extras: Record<string, string> = {}
    let empresa = block.empresa.trim()

    for (const [key, value] of block.fields) {
      const norm = normalizeKey(key)
      if (norm === 'empresa' || norm === 'nome' || norm === 'nome_da_empresa') {
        if (!empresa) empresa = value
        continue
      }
      const field = FIELD_ALIASES[norm]
      if (field) {
        if (values[field] === undefined) values[field] = value
      } else if (!isEmptyValue(value)) {
        extras[key] = value
      }
    }

    if (!empresa) {
      warnings.push(`Bloco [${String(block.index).padStart(3, '0')}] sem nome de empresa — ignorado.`)
      continue
    }

    const rating = parseRating(values.avaliacao ?? null)
    const city = splitCity(clean(values.cidade))
    const etapa = clean(values.etapa)

    leads.push({
      index: block.index,
      empresa,
      nicho: clean(values.nicho),
      telefone: clean(values.telefone),
      whatsapp: clean(values.whatsapp),
      instagram: clean(values.instagram),
      website: clean(values.website),
      endereco: clean(values.endereco),
      cidade: city.cidade,
      estado: city.estado,
      avaliacao: rating.nota,
      numero_avaliacoes: rating.total,
      pasta: clean(values.pasta),
      etapa,
      maps_url: clean(values.maps_url),
      observacoes: clean(values.observacoes),
      dados_extras: Object.keys(extras).length ? extras : null,
      status: statusFromText(etapa) ?? 'novo',
    })
  }

  const totalKey = Object.keys(meta).find((k) => normalizeKey(k).startsWith('total'))
  const declared = totalKey ? Number((meta[totalKey].match(/\d+/) ?? [])[0]) : NaN
  const declaredTotal = Number.isFinite(declared) ? declared : null
  if (declaredTotal !== null && declaredTotal !== leads.length) {
    warnings.push(`O cabeçalho informa ${declaredTotal} registros, mas ${leads.length} foram encontrados.`)
  }
  if (!blocks.length) {
    warnings.push('Nenhum bloco numerado encontrado. O arquivo precisa ter blocos como "[001] NOME DA EMPRESA".')
  }

  return { leads, meta, declaredTotal, warnings }
}
