import { isEmptyValue, parseLeadsTxt, parseRating, splitCity, type ParsedLead, type ParseResult } from './parser'

/**
 * Leads de planilha: arquivo CSV (Excel/Google Planilhas → "Salvar como CSV") ou
 * linhas copiadas da planilha e coladas (chegam separadas por tabulação).
 * A primeira linha precisa ter os nomes das colunas; o que não for reconhecido
 * vira "dados extras" do lead.
 */

type Col = 'empresa' | 'telefone' | 'whatsapp' | 'nicho' | 'cidade' | 'estado' | 'endereco' | 'website' | 'instagram' | 'avaliacao' | 'numero_avaliacoes' | 'maps_url' | 'observacoes' | 'cnpj'

const HEADERS: Record<Col, string[]> = {
  empresa: ['empresa', 'nome', 'nome da empresa', 'nome fantasia', 'razao social', 'cliente', 'estabelecimento', 'negocio', 'lead', 'name', 'title', 'company'],
  telefone: ['telefone', 'fone', 'tel', 'celular', 'numero', 'telefone 1', 'phone', 'phone number'],
  whatsapp: ['whatsapp', 'whats', 'zap', 'wpp', 'whatsapp 1'],
  nicho: ['nicho', 'categoria', 'segmento', 'ramo', 'area', 'tipo', 'category'],
  cidade: ['cidade', 'municipio', 'cidade/uf', 'city'],
  estado: ['estado', 'uf', 'state'],
  endereco: ['endereco', 'endereco completo', 'logradouro', 'rua', 'address'],
  website: ['site', 'website', 'url', 'web', 'pagina', 'link do site'],
  instagram: ['instagram', 'insta', 'ig', '@'],
  avaliacao: ['avaliacao', 'nota', 'estrelas', 'rating'],
  numero_avaliacoes: ['avaliacoes', 'numero de avaliacoes', 'qtd avaliacoes', 'total de avaliacoes', 'reviews'],
  maps_url: ['maps', 'google maps', 'link maps', 'link do maps', 'link google maps'],
  observacoes: ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios'],
  cnpj: ['cnpj'],
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_*:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const LOOKUP = new Map<string, Col>(Object.entries(HEADERS).flatMap(([col, names]) => names.map((n) => [n, col as Col])))

/** O texto parece o relatório em blocos "[001] EMPRESA"? */
export function isBlockReport(text: string): boolean {
  return /^\s*\[\s*\d+\s*\]\s*\S/m.test(text)
}

function detectDelimiter(firstLine: string): string {
  const counts = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length - 1] as const)
  const best = counts.sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

/** CSV com aspas ("a; b" e "" como aspas escapadas). */
export function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export function parseSheet(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const rows = splitRows(clean, detectDelimiter(firstLine))
  const empty: ParseResult = { leads: [], meta: {}, declaredTotal: null, warnings: [] }
  if (rows.length < 2) return { ...empty, warnings: ['A planilha precisa de uma linha com os nomes das colunas e pelo menos um lead.'] }

  const header = rows[0].map((h) => h.trim())
  const cols = header.map((h) => LOOKUP.get(norm(h)) ?? null)
  // Duas colunas com o mesmo papel: vale a primeira
  const seen = new Set<Col>()
  cols.forEach((c, i) => {
    if (c && seen.has(c)) cols[i] = null
    else if (c) seen.add(c)
  })
  if (!seen.has('empresa') && !seen.has('telefone')) {
    return { ...empty, warnings: ['Não achei as colunas de empresa ou telefone. A primeira linha precisa ter os nomes, por exemplo: Empresa, Telefone, Cidade.'] }
  }

  const leads: ParsedLead[] = []
  let skipped = 0
  rows.slice(1).forEach((cells) => {
    const get = (col: Col) => {
      const i = cols.indexOf(col)
      const v = i >= 0 ? (cells[i] ?? '').trim() : ''
      return isEmptyValue(v) ? null : v
    }
    const telefone = get('telefone')
    const empresa = get('empresa') ?? (telefone ? `Sem nome (${telefone})` : null)
    if (!empresa) {
      skipped++
      return
    }
    let cidade = get('cidade')
    let estado = get('estado')
    if (cidade && !estado) ({ cidade, estado } = splitCity(cidade))
    const nota = get('avaliacao')
    const rating = parseRating(nota)
    const total = get('numero_avaliacoes')
    const extras: Record<string, string> = {}
    cols.forEach((c, i) => {
      const v = (cells[i] ?? '').trim()
      if (!c && header[i] && !isEmptyValue(v)) extras[header[i]] = v
    })
    leads.push({
      index: leads.length + 1,
      empresa,
      nicho: get('nicho'),
      telefone,
      whatsapp: get('whatsapp'),
      instagram: get('instagram'),
      website: get('website'),
      endereco: get('endereco'),
      cidade,
      estado: estado ? estado.toUpperCase().slice(0, 2) : null,
      avaliacao: rating.nota ?? (nota && Number.isFinite(Number(nota.replace(',', '.'))) ? Number(nota.replace(',', '.')) : null),
      numero_avaliacoes: rating.total ?? (total ? Number(total.replace(/\D/g, '')) || null : null),
      pasta: null,
      etapa: null,
      maps_url: get('maps_url'),
      observacoes: get('observacoes'),
      dados_extras: Object.keys(extras).length ? extras : null,
      status: 'novo',
      cnpj: get('cnpj'),
    })
  })
  const warnings = skipped ? [`${skipped} linha(s) sem empresa nem telefone foram ignoradas.`] : []
  if (!leads.length) warnings.unshift('Nenhuma linha com empresa ou telefone.')
  return { leads, meta: {}, declaredTotal: null, warnings }
}

/** Lê qualquer formato aceito: relatório em blocos (TXT) ou planilha (CSV/colado). */
export function parseLeadsAny(text: string): ParseResult {
  return isBlockReport(text) ? parseLeadsTxt(text) : parseSheet(text)
}
