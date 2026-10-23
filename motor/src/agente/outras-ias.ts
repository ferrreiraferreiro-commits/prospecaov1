// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Gemini (chave grátis do Google AI Studio) e Grok (xAI) para o vendedor, no mesmo formato do Claude:
 * instruções + pedido → JSON validado pelo schema.
 * O Gemini passa por uma escada de modelos: cada modelo tem a sua cota grátis, então quando um esgota o próximo
 * responde. Acabou a escada inteira e tem chave do Grok → o Grok responde.
 */
import { z } from 'zod'
import type { Modelo } from './tipos.js'

export interface ChavesExtras {
  gemini: string
  xai: string
  /** O modelo do Grok escolhido quando a chave foi conectada */
  xaiModelo: string
}

let chaves: () => ChavesExtras = () => ({ gemini: '', xai: '', xaiModelo: '' })
/** O agente diz onde estão as chaves (elas mudam quando você conecta outra). */
export function usarChaves(fn: () => ChavesExtras) {
  chaves = fn
}

export class FalhaIA extends Error {
  constructor(
    message: string,
    /** Chave errada: não adianta tentar de novo até trocar */
    readonly bloqueante = false,
    /** Cota, modelo fora do ar ou resposta torta: vale tentar o próximo da escada */
    readonly tentarOutro = false,
    /** A IA se recusou a responder */
    readonly recusa = false,
  ) {
    super(message)
  }
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const XAI = 'https://api.x.ai/v1'
/** Modelos que a chave grátis alcança, na ordem medida no Xico do PC (core/gemini.py). */
export const ESCADA_GEMINI = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
/** Modelo da escada → até quando ele descansa (cota esgotada ou fora do ar) */
const descanso = new Map<string, number>()
/** Preço do Grok por milhão de tokens (US$), para contar o gasto do dia */
const PRECO_GROK = { entrada: 0.2, saida: 0.5 }

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>
  delete s.$schema
  return s
}

async function lerErro(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } }
    return `${j.error?.status ?? ''} ${j.error?.message ?? ''}`.trim()
  } catch {
    return ''
  }
}

function validar<S extends z.ZodType>(texto: string, schema: S): z.infer<S> {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new FalhaIA('A IA respondeu fora do formato.', false, true)
  }
  const r = schema.safeParse(bruto)
  if (!r.success) throw new FalhaIA('A IA respondeu fora do formato.', false, true)
  return r.data
}

async function gemini<S extends z.ZodType>(chave: string, modelo: string, sistema: string, pedido: string, schema: S, maxTokens: number): Promise<z.infer<S>> {
  const corpo = (comSchema: boolean) => ({
    systemInstruction: {
      parts: [{ text: comSchema ? sistema : `${sistema}\n\nResponda só com um JSON neste formato (JSON Schema):\n${JSON.stringify(jsonSchema(schema))}` }],
    },
    contents: [{ role: 'user', parts: [{ text: pedido }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: Math.max(8192, maxTokens * 2), // o raciocínio do Gemini conta aqui
      ...(comSchema ? { responseJsonSchema: jsonSchema(schema) } : {}),
    },
  })
  const pedir = (comSchema: boolean) =>
    fetch(`${GEMINI}/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify(corpo(comSchema)),
      signal: AbortSignal.timeout(90_000),
    })

  let r: Response
  try {
    r = await pedir(true)
    if (r.status === 400) {
      const msg = await lerErro(r)
      if (/api key|API_KEY/i.test(msg)) throw new FalhaIA('A chave do Gemini foi recusada. Confira a chave em aistudio.google.com/apikey.', true)
      // Schema que este modelo não aceita: manda o formato dentro das instruções
      r = await pedir(false)
    }
  } catch (err) {
    if (err instanceof FalhaIA) throw err
    descanso.set(modelo, Date.now() + 2 * 60_000)
    throw new FalhaIA('Sem resposta do Gemini agora.', false, true)
  }
  if (r.status === 401 || r.status === 403) throw new FalhaIA('A chave do Gemini foi recusada. Confira a chave em aistudio.google.com/apikey.', true)
  if (r.status === 429) {
    descanso.set(modelo, Date.now() + 10 * 60_000)
    throw new FalhaIA(`Cota grátis do ${modelo} esgotada por agora.`, false, true)
  }
  if (r.status === 404) {
    descanso.set(modelo, Date.now() + 24 * 3600_000)
    throw new FalhaIA(`O ${modelo} não existe para esta chave.`, false, true)
  }
  if (!r.ok) {
    descanso.set(modelo, Date.now() + 2 * 60_000)
    throw new FalhaIA(`O Gemini respondeu ${r.status}. ${await lerErro(r)}`.trim(), false, true)
  }

  const j = (await r.json()) as {
    promptFeedback?: { blockReason?: string }
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  }
  const c = j.candidates?.[0]
  if (j.promptFeedback?.blockReason || c?.finishReason === 'SAFETY' || c?.finishReason === 'PROHIBITED_CONTENT') {
    throw new FalhaIA('A IA preferiu não responder esta conversa.', false, false, true)
  }
  const texto = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  if (c?.finishReason === 'MAX_TOKENS' || !texto) throw new FalhaIA('A resposta do Gemini veio incompleta.', false, true)
  return validar(texto, schema)
}

async function grok<S extends z.ZodType>(chave: string, modelo: string, sistema: string, pedido: string, schema: S, maxTokens: number): Promise<{ dados: z.infer<S>; custo: number }> {
  let r: Response
  try {
    r = await fetch(`${XAI}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: pedido },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'resposta', schema: jsonSchema(schema) } },
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    throw new FalhaIA('Sem resposta do Grok agora.')
  }
  if (r.status === 401 || r.status === 403) throw new FalhaIA('A chave do Grok foi recusada (ou está sem crédito em console.x.ai).', true)
  if (r.status === 429) throw new FalhaIA('O Grok está recebendo pedidos demais agora.')
  if (!r.ok) throw new FalhaIA(`O Grok respondeu ${r.status}. ${await lerErro(r)}`.trim())
  const j = (await r.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string; refusal?: string | null } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const custo = ((j.usage?.prompt_tokens ?? 0) * PRECO_GROK.entrada + (j.usage?.completion_tokens ?? 0) * PRECO_GROK.saida) / 1_000_000
  const ch = j.choices?.[0]
  if (ch?.message?.refusal) throw Object.assign(new FalhaIA('A IA preferiu não responder esta conversa.', false, false, true), { uso: { custo } })
  if (ch?.finish_reason === 'length' || !ch?.message?.content) throw Object.assign(new FalhaIA('A resposta do Grok veio incompleta.'), { uso: { custo } })
  return { dados: validar(ch.message.content, schema), custo }
}

/** Uma chamada no Gemini (com a escada) ou no Grok, conforme o modelo escolhido. */
export async function chamarOutra<S extends z.ZodType>(modelo: Modelo, sistema: string, pedido: string, schema: S, maxTokens: number): Promise<{ dados: z.infer<S>; custo: number }> {
  const k = chaves()
  if (modelo !== 'grok') {
    if (!k.gemini && !k.xai) throw new FalhaIA('Falta a chave do Gemini.', true)
    const agora = Date.now()
    const escada = [modelo, ...ESCADA_GEMINI.filter((m) => m !== modelo)].filter((m) => (descanso.get(m) ?? 0) < agora)
    for (const m of k.gemini ? escada : []) {
      try {
        return { dados: await gemini(k.gemini, m, sistema, pedido, schema, maxTokens), custo: 0 }
      } catch (err) {
        if (!(err instanceof FalhaIA) || !err.tentarOutro) throw err
      }
    }
  }
  if (k.xai) return grok(k.xai, k.xaiModelo || 'grok-4-fast-non-reasoning', sistema, pedido, schema, maxTokens)
  if (modelo === 'grok') throw new FalhaIA('Falta a chave do Grok (começa com "xai-", em console.x.ai).', true)
  throw new FalhaIA('A cota grátis do Gemini acabou por agora em todos os modelos. O agente tenta de novo mais tarde.')
}

/** Transcreve um áudio do WhatsApp (só com a chave do Gemini, que entende áudio de graça). */
export async function transcreverAudio(audio: Buffer, mime: string): Promise<string> {
  const k = chaves()
  if (!k.gemini) throw new FalhaIA('A transcrição de áudio usa a chave do Gemini.', true)
  const agora = Date.now()
  for (const m of ESCADA_GEMINI.filter((x) => (descanso.get(x) ?? 0) < agora)) {
    let r: Response
    try {
      r = await fetch(`${GEMINI}/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': k.gemini },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime.split(';')[0] || 'audio/ogg', data: audio.toString('base64') } }, { text: 'Transcreva este áudio em português do Brasil, palavra por palavra. Responda só com a transcrição.' }] }],
          generationConfig: { maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      descanso.set(m, Date.now() + 2 * 60_000)
      continue
    }
    if (r.status === 401 || r.status === 403) throw new FalhaIA('A chave do Gemini foi recusada.', true)
    if (!r.ok) {
      descanso.set(m, Date.now() + (r.status === 429 ? 10 : 2) * 60_000)
      continue
    }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
    const texto = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim()
    if (texto) return texto.slice(0, 2000)
  }
  throw new FalhaIA('Não consegui transcrever o áudio agora.')
}

/** Confere a chave do Gemini sem gastar cota (lista os modelos). */
export async function testarGemini(chave: string): Promise<void> {
  let r: Response
  try {
    r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': chave }, signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new FalhaIA('Sem conexão com o Gemini agora.')
  }
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new FalhaIA('A chave do Gemini foi recusada. Confira a chave em aistudio.google.com/apikey.', true)
  if (!r.ok) throw new FalhaIA(`O Gemini respondeu ${r.status}.`)
}

/** Confere a chave do Grok e escolhe o modelo dele (o mais rápido que a chave alcança). */
export async function testarXai(chave: string): Promise<string> {
  let r: Response
  try {
    r = await fetch(`${XAI}/models`, { headers: { authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new FalhaIA('Sem conexão com o Grok agora.')
  }
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new FalhaIA('A chave do Grok foi recusada (ou está sem crédito em console.x.ai).', true)
  if (!r.ok) throw new FalhaIA(`O Grok respondeu ${r.status}.`)
  const ids = (((await r.json()) as { data?: { id: string }[] }).data ?? []).map((m) => m.id).filter((id) => /^grok/i.test(id) && !/image|vision|imagine/i.test(id))
  const nota = (id: string) => (/fast/.test(id) ? 4 : 0) + (/non-reasoning/.test(id) ? 2 : 0) + (/mini/.test(id) ? 1 : 0) + (/code/.test(id) ? -5 : 0)
  return ids.sort((a, b) => nota(b) - nota(a) || b.localeCompare(a))[0] ?? 'grok-4-fast-non-reasoning'
}
