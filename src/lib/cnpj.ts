import { digits } from './contact'
import type { CnpjInfo, CnpjSocio, Lead } from './types'

/** CNPJ válido pelos dígitos verificadores (14 dígitos, não repetidos). */
export function isValidCnpj(value: string | null | undefined): boolean {
  const d = digits(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const check = (len: number) => {
    let weight = len - 7
    let sum = 0
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * weight--
      if (weight < 2) weight = 9
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return check(12) === Number(d[12]) && check(13) === Number(d[13])
}

/** Primeiro CNPJ válido encontrado num texto (ex.: observações do arquivo). */
export function extractCnpj(text: string | null | undefined): string | null {
  for (const m of (text ?? '').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? []) {
    if (isValidCnpj(m)) return digits(m)
  }
  return null
}

/** "12.345.678/0001-90" */
export function formatCnpj(value: string | null | undefined): string {
  const d = digits(value)
  if (d.length !== 14) return value ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** CNPJ do lead: o salvo, o que veio no arquivo (campo extra) ou um citado nas observações. */
export function leadCnpj(lead: Pick<Lead, 'cnpj' | 'dados_extras' | 'observacoes'>): string | null {
  if (lead.cnpj && isValidCnpj(lead.cnpj)) return digits(lead.cnpj)
  for (const [k, v] of Object.entries(lead.dados_extras ?? {})) {
    if (/cnpj/i.test(k) && isValidCnpj(v)) return digits(v)
  }
  return extractCnpj(lead.observacoes)
}

const RESPONSAVEL_ORDEM = ['socio-administrador', 'administrador', 'titular', 'empresario', 'presidente', 'diretor', 'socio']

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Sócio mais provável de decidir: administrador > titular > diretor > sócio. */
export function pickResponsavel(socios: CnpjSocio[]): CnpjSocio | null {
  if (!socios.length) return null
  const rank = (q: string) => {
    const n = fold(q).replace(/\s+/g, '-')
    const i = RESPONSAVEL_ORDEM.findIndex((r) => n.includes(r))
    return i === -1 ? 99 : i
  }
  return [...socios].sort((a, b) => rank(a.qualificacao) - rank(b.qualificacao))[0]
}

/** Remove sufixos societários e palavras genéricas para comparar nomes de empresa. */
function nameTokens(value: string | null | undefined): string[] {
  return fold(value ?? '')
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|empresa|comercio|servicos?|de|da|do|das|dos|e)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3)
}

/**
 * O CNPJ é desta empresa? Exige nome parecido e, quando os dois lados têm,
 * mesmo telefone (DDD + 8 últimos) e mesma cidade. Sem isso, o sócio não é sugerido.
 */
export function cnpjMatchesLead(
  info: { razao_social: string | null; nome_fantasia: string | null; telefone: string | null; municipio: string | null },
  lead: Pick<Lead, 'empresa' | 'telefone' | 'whatsapp' | 'cidade'>,
): boolean {
  const expected = new Set(nameTokens(lead.empresa))
  if (!expected.size) return false
  const nameOk = [info.razao_social, info.nome_fantasia].some((n) => {
    const tokens = nameTokens(n)
    const shared = tokens.filter((t) => expected.has(t)).length
    return shared >= Math.min(2, expected.size)
  })
  if (!nameOk) return false

  const tail = (v: string | null | undefined) => digits(v).slice(-8)
  const regPhone = tail(info.telefone)
  const leadPhones = [tail(lead.telefone), tail(lead.whatsapp)].filter(Boolean)
  if (regPhone && leadPhones.length && !leadPhones.includes(regPhone)) return false

  const city = fold(lead.cidade ?? '').trim()
  const regCity = fold(info.municipio ?? '').trim()
  if (city && regCity && !city.includes(regCity) && !regCity.includes(city)) return false
  return true
}

interface BrasilApiCnpj {
  razao_social?: string
  nome_fantasia?: string
  descricao_situacao_cadastral?: string
  data_inicio_atividade?: string
  cnae_fiscal_descricao?: string
  municipio?: string
  uf?: string
  ddd_telefone_1?: string
  email?: string | null
  qsa?: { nome_socio?: string; qualificacao_socio?: string }[]
}

const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

export function parseCnpjResponse(data: BrasilApiCnpj, lead: Pick<Lead, 'empresa' | 'telefone' | 'whatsapp' | 'cidade'>, now = new Date()): CnpjInfo {
  const base = {
    razao_social: orNull(data.razao_social),
    nome_fantasia: orNull(data.nome_fantasia),
    situacao: orNull(data.descricao_situacao_cadastral),
    abertura: orNull(data.data_inicio_atividade),
    atividade: orNull(data.cnae_fiscal_descricao),
    municipio: orNull(data.municipio),
    uf: orNull(data.uf),
    telefone: orNull(data.ddd_telefone_1),
    email: orNull(data.email),
    socios: (data.qsa ?? [])
      .map((s) => ({ nome: (s.nome_socio ?? '').trim(), qualificacao: (s.qualificacao_socio ?? '').trim() }))
      .filter((s) => s.nome),
  }
  return { ...base, confere: cnpjMatchesLead(base, lead), consultado_em: now.toISOString() }
}

/** Consulta dados públicos do CNPJ na BrasilAPI (gratuita, sem chave). */
export async function fetchCnpj(cnpj: string, lead: Pick<Lead, 'empresa' | 'telefone' | 'whatsapp' | 'cidade'>): Promise<CnpjInfo> {
  const d = digits(cnpj)
  if (!isValidCnpj(d)) throw new Error('CNPJ inválido. Confira os 14 números.')
  let res: Response
  try {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new Error('Não foi possível consultar agora. Verifique a internet e tente de novo.')
  }
  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita.')
  if (!res.ok) throw new Error('A consulta de CNPJ está indisponível no momento. Tente mais tarde.')
  return parseCnpjResponse((await res.json()) as BrasilApiCnpj, lead)
}

/** "MARIA DA SILVA SOUZA" → "Maria" */
export function firstName(nome: string | null | undefined): string {
  const first = (nome ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}
