/**
 * Regras puras da base aberta do CNPJ (Receita Federal): leitura das linhas,
 * telefone, e-mail e nomes. Usadas pelo importador, pelo servidor e pelos testes.
 */

/** Linha dos arquivos da Receita: campos entre aspas, separados por ";". */
export function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Aspas duplas dentro de campo ("") viram uma só
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ';' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** Maiúsculas, sem acento e com espaços simples (para comparar nomes de cidade, bairro…). */
export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o'])
const KEEP_UPPER = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S/A', 'MEI', 'II', 'III', 'IV', 'CIA', 'DR', 'DRA'])

/** "CLINICA SORRISO LEVE LTDA" → "Clinica Sorriso Leve LTDA" (a Receita grava tudo em maiúsculas). */
export function titleCase(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (KEEP_UPPER.has(w.toUpperCase().replace(/\.$/, ''))) return w.toUpperCase()
      const lower = w.toLowerCase()
      if (i > 0 && SMALL.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/**
 * Razão social sem documento: no MEI/empresário individual a Receita grava o CPF
 * no fim ("MARIA DA SILVA 12345678901") ou o CNPJ básico no começo ("12.345.678 MARIA…").
 * CPF é dado pessoal e nunca sai daqui.
 */
export function cleanName(s: string | null | undefined): string {
  return (
    String(s ?? '')
      // CNPJ básico no começo: "12.345.678 MARIA…"
      .replace(/^\s*\d{2}\.?\d{3}\.?\d{3}\s+/, '')
      // Qualquer CPF, em qualquer lugar e formato ("CPF 123…", "- CPF123…", "/123.456.789-01")
      .replace(/[\s\-/]*(?:CPF[\s:.\-]*)?(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/gi, ' ')
      .replace(/\bCPF\b[\s:.\-]*/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-/]+|[\s\-/]+$/g, '')
  )
}

/** Nome fantasia que não é nome ("S/N", "NAO TEM", "*****"): usa a razão social no lugar. */
export function isJunkName(s: string | null | undefined): boolean {
  const n = norm(s)
  return n.replace(/[^A-Z]/g, '').length < 3 || /^(S N|SN|SEM NOME|NAO TEM|NAO POSSUI|NAO HA|NENHUM|NENHUMA|NAO INFORMADO|XXX+|ME|EPP)$/.test(n)
}

/**
 * A Receita guarda só 8 dígitos do telefone: o celular perde o 9 da frente.
 * Número de 8 dígitos começando com 6–9 é celular e ganha o 9 de volta.
 * Devolve 55 + DDD + número, ou null se o número não serve.
 */
export function phoneOf(ddd: string, num: string): { phone: string; mobile: boolean } | null {
  const d = String(ddd ?? '').replace(/\D/g, '').replace(/^0+/, '')
  const n = String(num ?? '').replace(/\D/g, '')
  if (d.length !== 2 || Number(d) < 11) return null
  if (n.length === 9 && n.startsWith('9')) return { phone: `55${d}${n}`, mobile: true }
  if (n.length !== 8 || /^(\d)\1{7}$/.test(n)) return null
  const mobile = /^[6-9]/.test(n)
  return { phone: `55${d}${mobile ? '9' : ''}${n}`, mobile }
}

/** 0 = sem e-mail · 1 = e-mail gratuito (provavelmente sem site) · 2 = domínio próprio (provavelmente com site) · 3 = parece ser do contador */
export type EmailKind = 0 | 1 | 2 | 3

const FREE_MAIL =
  /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|rocketmail|bol|uol|terra|ig|globo|globomail|icloud|me|r7|zipmail|oi|aol|protonmail|proton)\.(com|com\.br|br|net)$/i
const ACCOUNTANT = /contab|contador|cont[aá]bil|assessoria|escritorio|escrit[oó]rio|fiscal|tributar|consultoria/i

export function emailKind(email: string | null | undefined): EmailKind {
  const e = String(email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 0
  if (FREE_MAIL.test(e)) return 1
  const domain = e.split('@')[1]
  return ACCOUNTANT.test(domain) ? 3 : 2
}

/** Domínio do e-mail próprio, candidato a site da empresa ("contato@clinicax.com.br" → "clinicax.com.br"). */
export function emailDomain(email: string | null | undefined): string {
  return emailKind(email) === 2 ? String(email).trim().toLowerCase().split('@')[1] : ''
}

/** Endereço legível a partir dos campos da Receita. */
export function addressOf(f: { tipo: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }): string {
  const rua = titleCase(`${f.tipo} ${f.logradouro}`.trim())
  const num = f.numero && f.numero !== 'S/N' ? f.numero : 's/n'
  const parts = [rua ? `${rua}, ${num}` : '', titleCase(f.bairro), [titleCase(f.cidade), f.uf].filter(Boolean).join(' - ')]
  return parts.filter(Boolean).join(' - ')
}
