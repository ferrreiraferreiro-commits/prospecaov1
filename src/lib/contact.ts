/** Helpers para exibir e abrir os contatos do lead — sem alterar o dado salvo. */

export function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/** Número com DDI 55 quando vier só com DDD + número. */
export function withCountry(value: string | null | undefined): string {
  const d = digits(value)
  if (!d) return ''
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) return `55${d}`
  return d
}

/** "+55 (11) 4726-8618" / "+55 (11) 97448-7416" */
export function formatPhone(value: string | null | undefined): string {
  const d = withCountry(value)
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const num = d.slice(4)
    const head = num.length === 9 ? num.slice(0, 5) : num.slice(0, 4)
    const tail = num.slice(head.length)
    return `(${ddd}) ${head}-${tail}`
  }
  return value ?? ''
}

export function telHref(value: string | null | undefined): string | null {
  const d = withCountry(value)
  return d ? `tel:+${d}` : null
}

/** Só usa o WhatsApp informado no arquivo — nunca deduz a partir do telefone. */
export function whatsappHref(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null
  if (/^https?:\/\//i.test(whatsapp)) return whatsapp
  const d = withCountry(whatsapp)
  return d ? `https://wa.me/${d}` : null
}

/** Número válido para WhatsApp: DDI + DDD + número (BR: 55 + 10 ou 11 dígitos). */
function validWaNumber(d: string): boolean {
  if (d.startsWith('55')) return d.length === 12 || d.length === 13
  return d.length >= 10 && d.length <= 15
}

/** Extrai o número de "https://wa.me/5511…", "api.whatsapp.com/send?phone=…" ou de um número solto. */
export function whatsappDigits(value: string | null | undefined): string {
  if (!value) return ''
  const m = value.match(/wa\.me\/(\d+)/i) ?? value.match(/[?&]phone=(\d+)/i)
  return withCountry(m ? m[1] : value)
}

export interface WhatsAppTarget {
  number: string
  /** true quando o lead não tem WhatsApp informado e usamos o telefone */
  fromPhone: boolean
}

/** Número para abrir o WhatsApp: o WhatsApp do cadastro ou, na falta dele, o telefone. */
export function whatsappTarget(lead: { whatsapp: string | null; telefone: string | null }): WhatsAppTarget | null {
  const wa = whatsappDigits(lead.whatsapp)
  if (wa && validWaNumber(wa)) return { number: wa, fromPhone: false }
  const tel = withCountry(lead.telefone)
  if (tel && validWaNumber(tel)) return { number: tel, fromPhone: true }
  return null
}

export type WhatsAppDestino = 'web' | 'app'

/** Link da conversa; com `text`, a mensagem já chega escrita (a pessoa só aperta enviar). */
export function whatsappChatUrl(number: string, destino: WhatsAppDestino, text?: string | null): string {
  const base = destino === 'app' ? `whatsapp://send?phone=${number}` : `https://web.whatsapp.com/send?phone=${number}`
  return text ? `${base}&text=${encodeURIComponent(text)}` : base
}

export function instagramHref(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (/instagram\.com/i.test(v)) return `https://${v.replace(/^\/+/, '')}`
  const handle = v.replace(/^@/, '').split(/[\s/?]/)[0]
  return handle ? `https://instagram.com/${handle}` : null
}

export function instagramHandle(value: string | null | undefined): string {
  if (!value) return ''
  const m = value.match(/instagram\.com\/([^/?#\s]+)/i)
  if (m) return `@${m[1]}`
  return value.startsWith('@') ? value : `@${value}`
}

export function websiteHref(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export function websiteLabel(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

export function mapsHref(mapsUrl: string | null | undefined, empresa?: string, cidade?: string | null): string | null {
  if (mapsUrl) return mapsUrl
  if (empresa) {
    const q = [empresa, cidade].filter(Boolean).join(' ')
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }
  return null
}
