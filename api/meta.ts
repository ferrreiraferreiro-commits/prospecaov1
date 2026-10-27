// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * API oficial do WhatsApp (Meta / WhatsApp Cloud API) — segunda forma de usar o WhatsApp na XS,
 * separada do WhatsApp da XS (QR code, na VPS). Cada conta liga o próprio app da Meta e a Meta cobra a pessoa.
 *
 * Webhook (a Meta chama, sem login):
 *   GET  /api/meta?c=<gancho>&hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  → devolve o challenge
 *   POST /api/meta?c=<gancho>  (X-Hub-Signature-256)  → meta_receber confere a assinatura e grava
 *
 * App (POST com o login da pessoa):
 *   { acao: 'conectar', numeroId, wabaId, token, segredo }   → testa na Meta, assina o webhook e salva
 *   { acao: 'modelos' }                                      → modelos aprovados da conta
 *   { acao: 'texto', para, texto }                           → mensagem livre (só até 24 h depois da última dele)
 *   { acao: 'modelo', para, modelo, idioma, variaveis, … }   → um modelo aprovado
 *   { acao: 'lote', campanhaId, modelo, idioma, itens }      → até 20 modelos de uma campanha
 *
 * O token da Meta nunca vai para o navegador: só esta função lê (meta_credenciais, com o login da pessoa).
 * Arquivo único de propósito: a Vercel compila cada função sozinha.
 */

export const config = { maxDuration: 60 }

const GRAPH = 'https://graph.facebook.com/v23.0'

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// Regras puras (exportadas para os testes)
// ---------------------------------------------------------------------------

/** Só dígitos, com 55 quando vier sem o país (10 ou 11 dígitos). */
export function numeroMeta(tel: string): string {
  const d = String(tel ?? '').replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? `55${d}` : d
}

/** Erro da Graph API em português (o código vem em error.code). */
export function erroMeta(code: number | undefined, msg?: string): string {
  switch (code) {
    case 190:
      return 'O token da Meta venceu ou foi trocado. Gere um token permanente e conecte de novo em API oficial → Conexão.'
    case 10:
    case 200:
      return 'O token não tem permissão para este número. Dê ao usuário do sistema as permissões whatsapp_business_messaging e whatsapp_business_management.'
    case 100:
      return 'A Meta não aceitou os dados (confira o ID do número e o ID da conta Business).'
    case 131047:
      return 'Passaram 24 h desde a última mensagem dessa pessoa. Pela regra da Meta, agora só dá para mandar um modelo aprovado.'
    case 131026:
      return 'A Meta não conseguiu entregar: o número não tem WhatsApp ou não aceita mensagens de empresas.'
    case 131030:
      return 'Este número não está na lista de teste do app da Meta. Adicione-o no painel da Meta ou use um número de produção.'
    case 131042:
      return 'A conta da Meta está com problema de pagamento. Confira o cartão no Gerenciador do WhatsApp.'
    case 131031:
    case 368:
      return 'A Meta bloqueou temporariamente esta conta do WhatsApp Business.'
    case 131056:
      return 'Muitas mensagens para o mesmo número em pouco tempo. Espere um pouco.'
    case 130429:
    case 131048:
    case 80007:
      return 'A Meta limitou os envios agora (limite da conta). Tente mais tarde.'
    case 132000:
      return 'O número de variáveis não bate com o modelo aprovado.'
    case 132001:
      return 'Esse modelo não existe nesse idioma ou ainda não foi aprovado.'
    case 132015:
    case 132016:
      return 'Esse modelo foi pausado ou desativado pela Meta.'
    case 131009:
      return 'A Meta recusou algum dado da mensagem.'
    default:
      return msg ? `A Meta recusou: ${msg}` : 'A Meta não respondeu como esperado.'
  }
}

export interface ModeloMeta {
  nome: string
  idioma: string
  categoria: string
  /** Nomes das variáveis do corpo, na ordem em que aparecem ("1", "2"… ou nomes) */
  variaveis: string[]
  nomeadas: boolean
  cabecalho: string | null
  corpo: string
  rodape: string | null
  botoes: string[]
  /** Modelos com foto/vídeo no cabeçalho ou variável em botão/cabeçalho ainda não saem pela XS */
  suportado: boolean
  motivo: string | null
}

interface ComponenteBruto {
  type?: string
  format?: string
  text?: string
  buttons?: { type?: string; text?: string; url?: string }[]
}

const VAR = /\{\{\s*([\w]+)\s*\}\}/g
const TEM_VAR = /\{\{\s*\w+\s*\}\}/

export function variaveisDoTexto(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(VAR)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

export function lerModelo(t: { name?: string; language?: string; category?: string; status?: string; parameter_format?: string; components?: ComponenteBruto[] }): ModeloMeta {
  const comps = t.components ?? []
  const header = comps.find((c) => c.type === 'HEADER')
  const body = comps.find((c) => c.type === 'BODY')
  const footer = comps.find((c) => c.type === 'FOOTER')
  const buttons = comps.find((c) => c.type === 'BUTTONS')?.buttons ?? []
  const corpo = body?.text ?? ''
  const variaveis = variaveisDoTexto(corpo)
  let motivo: string | null = null
  if (header && header.format && header.format !== 'TEXT') motivo = 'Tem foto, vídeo ou documento no cabeçalho.'
  else if (header?.text && variaveisDoTexto(header.text).length) motivo = 'Tem variável no cabeçalho.'
  else if (buttons.some((b) => (b.url && TEM_VAR.test(b.url)) || b.type === 'COPY_CODE' || b.type === 'OTP' || b.type === 'FLOW')) motivo = 'Tem botão com variável, código ou formulário.'
  else if (comps.some((c) => c.type === 'CAROUSEL' || c.type === 'LIMITED_TIME_OFFER')) motivo = 'É um carrossel ou oferta.'
  return {
    nome: t.name ?? '',
    idioma: t.language ?? 'pt_BR',
    categoria: t.category ?? '',
    variaveis,
    nomeadas: t.parameter_format === 'NAMED' || variaveis.some((v) => !/^\d+$/.test(v)),
    cabecalho: header?.format === 'TEXT' ? (header.text ?? null) : null,
    corpo,
    rodape: footer?.text ?? null,
    botoes: buttons.map((b) => b.text ?? '').filter(Boolean),
    suportado: !motivo,
    motivo,
  }
}

/** Corpo do envio de um modelo: variáveis do corpo na ordem de `nomes`. */
export function payloadModelo(para: string, modelo: string, idioma: string, nomes: string[], valores: string[], nomeadas: boolean) {
  const params = nomes.map((n, i) => ({
    type: 'text',
    ...(nomeadas ? { parameter_name: n } : {}),
    // A Meta recusa variável vazia, com quebra de linha ou com mais de 4 espaços seguidos
    text: (valores[i] ?? '').replace(/\s*\n+\s*/g, ' ').replace(/ {4,}/g, '   ').trim() || '-',
  }))
  return {
    messaging_product: 'whatsapp',
    to: numeroMeta(para),
    type: 'template',
    template: { name: modelo, language: { code: idioma }, ...(params.length ? { components: [{ type: 'body', parameters: params }] } : {}) },
  }
}

// ---------------------------------------------------------------------------
// Meta (Graph API) e Supabase
// ---------------------------------------------------------------------------

interface RespostaMeta {
  error?: { code?: number; message?: string; error_user_msg?: string }
  [k: string]: unknown
}

async function graph<T = RespostaMeta>(token: string, caminho: string, init?: { method?: string; json?: unknown }): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${GRAPH}${caminho}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(502, 'A Meta não respondeu agora. Tente de novo em instantes.')
  }
  const corpo = (await r.json().catch(() => ({}))) as RespostaMeta
  if (!r.ok || corpo.error) throw new HttpError(r.status === 401 ? 400 : 422, erroMeta(corpo.error?.code, corpo.error?.error_user_msg || corpo.error?.message))
  return corpo as T
}

function supa() {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new HttpError(500, 'Servidor sem Supabase configurado.')
  return { url, anon }
}

async function rpc<T>(nome: string, args: unknown, authorization?: string): Promise<T> {
  const { url, anon } = supa()
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: authorization ?? `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  })
  const corpo = (await r.json().catch(() => null)) as T & { code?: string; message?: string }
  if (!r.ok) {
    const e = new HttpError(corpo?.code === '28000' ? 401 : corpo?.code === 'P0002' ? 404 : 500, corpo?.message || 'Falha no banco.')
    throw e
  }
  return corpo
}

/** Login da pessoa com a conta liberada (mesma regra de api/maps.ts). */
async function exigirAcesso(authorization: string | undefined): Promise<{ userId: string; authorization: string }> {
  const { url, anon } = supa()
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Entre na sua conta.')
  const headers = { apikey: anon, Authorization: authorization }
  const userRes = await fetch(`${url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(6000) })
  if (!userRes.ok) throw new HttpError(401, 'Sua sessão expirou. Entre de novo.')
  const user = (await userRes.json()) as { id: string }
  // Plano e conta que valem (os do dono, se a pessoa está numa equipe)
  const profRes = await fetch(`${url}/rest/v1/rpc/meu_acesso`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(6000) })
  const [p] = profRes.ok ? ((await profRes.json()) as { conta: string; plano: string; teste_ate: string; plano_ate?: string | null }[]) : []
  if (p?.plano === 'cancelado') throw new HttpError(403, 'Sua assinatura está pausada.')
  if (p?.plano === 'teste' && Date.parse(p.teste_ate) <= Date.now()) throw new HttpError(403, 'Seu teste grátis terminou.')
  if (p?.plano === 'ativo' && p.plano_ate && Date.parse(p.plano_ate) <= Date.now()) throw new HttpError(403, 'Seu plano venceu.')
  return { userId: p?.conta ?? user.id, authorization }
}

async function credenciais(authorization: string) {
  const [c] = await rpc<{ numero_id: string; waba_id: string; token: string }[]>('meta_credenciais', {}, authorization)
  if (!c) throw new HttpError(409, 'Conecte a API oficial primeiro (API oficial → Conexão).')
  return c
}

interface Linha {
  id: string
  telefone: string
  de_mim: boolean
  texto: string
  midia: string | null
  status: string | null
  em: string
}

/** Grava a mensagem enviada (com o login da pessoa: a regra do banco só deixa gravar na própria conta). */
async function gravarEnvio(authorization: string, userId: string, linha: Record<string, unknown>): Promise<Linha> {
  const { url, anon } = supa()
  const r = await fetch(`${url}/rest/v1/meta_mensagens?select=id,telefone,de_mim,texto,midia,status,em`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: authorization, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, de_mim: true, status: 'accepted', ...linha }),
    signal: AbortSignal.timeout(8000),
  })
  const [row] = r.ok ? ((await r.json()) as Linha[]) : []
  // A Meta já aceitou: mesmo se o registro falhar, a mensagem saiu
  return row ?? { id: String(linha.wamid ?? Date.now()), telefone: String(linha.telefone), de_mim: true, texto: String(linha.texto ?? ''), midia: null, status: 'accepted', em: new Date().toISOString() }
}

const paraApp = (l: Linha) => ({ id: l.id, deMim: l.de_mim, texto: l.texto, midia: l.midia, em: l.em, status: l.status, telefone: l.telefone })

interface EnvioMeta {
  contacts?: { wa_id?: string }[]
  messages?: { id?: string }[]
}

async function enviarModelo(
  cred: { numero_id: string; token: string },
  acesso: { userId: string; authorization: string },
  e: { para: string; modelo: string; idioma: string; nomes: string[]; valores: string[]; nomeadas: boolean; texto: string; nome?: string; campanhaId?: string },
) {
  const r = await graph<EnvioMeta>(cred.token, `/${cred.numero_id}/messages`, {
    method: 'POST',
    json: payloadModelo(e.para, e.modelo, e.idioma, e.nomes, e.valores, e.nomeadas),
  })
  return gravarEnvio(acesso.authorization, acesso.userId, {
    // A Meta devolve o número como o WhatsApp guarda (com ou sem o nono dígito): a conversa fica junta
    telefone: r.contacts?.[0]?.wa_id ?? numeroMeta(e.para),
    nome: e.nome ?? null,
    texto: e.texto.slice(0, 4096),
    modelo: e.modelo,
    wamid: r.messages?.[0]?.id ?? null,
    campanha_id: e.campanhaId ?? null,
  })
}

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map((x) => (typeof x === 'string' ? x.slice(0, 1000) : '')) : [])

// ---------------------------------------------------------------------------
// Handler (Vercel / Node)
// ---------------------------------------------------------------------------

interface Req extends AsyncIterable<unknown> {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
  send(body: string): void
  setHeader(name: string, value: string): void
}

const header = (req: Req, nome: string) => {
  const v = req.headers[nome]
  return Array.isArray(v) ? v[0] : v
}

/** Corpo exato que a Meta mandou (a assinatura é sobre esses bytes). */
async function corpoBruto(req: Req): Promise<string> {
  if (typeof req.body === 'string') return req.body
  const partes: Buffer[] = []
  for await (const p of req) partes.push(Buffer.isBuffer(p) ? p : Buffer.from(String(p)))
  if (partes.length) return Buffer.concat(partes).toString('utf8')
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  return req.body ? JSON.stringify(req.body) : ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: Req, res: Res) {
  const q = new URL(req.url ?? '/', 'http://xs').searchParams
  const gancho = q.get('c')

  // ---- Webhook da Meta
  if (gancho !== null) {
    if (!UUID.test(gancho)) return res.status(404).json({ error: 'Conta não encontrada.' })
    try {
      if (req.method === 'GET') {
        const ok = q.get('hub.mode') === 'subscribe' && (await rpc<boolean>('meta_verificar', { p_gancho: gancho, p_token: q.get('hub.verify_token') ?? '' }))
        if (!ok) return res.status(403).json({ error: 'Token de verificação não confere.' })
        res.setHeader('Content-Type', 'text/plain')
        return res.status(200).send(q.get('hub.challenge') ?? '')
      }
      if (req.method === 'POST') {
        const corpo = await corpoBruto(req)
        await rpc('meta_receber', { p_gancho: gancho, p_corpo: corpo, p_assinatura: header(req, 'x-hub-signature-256') ?? null })
        return res.status(200).json({ ok: true })
      }
      return res.status(405).json({ error: 'Use GET ou POST.' })
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      return res.status(status).json({ error: err instanceof Error ? err.message : 'Falha.' })
    }
  }

  // ---- App da XS
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  try {
    const acesso = await exigirAcesso(header(req, 'authorization'))
    const raw = req.body ?? (await corpoBruto(req))
    const body = (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw) as Record<string, unknown>

    if (body.acao === 'conectar') {
      const numeroId = texto(body.numeroId, 40)
      const wabaId = texto(body.wabaId, 40)
      const token = texto(body.token, 1000)
      const segredo = texto(body.segredo, 100)
      if (!/^\d{6,25}$/.test(numeroId)) throw new HttpError(400, 'O ID do número de telefone tem só números (fica em WhatsApp → Configuração da API).')
      if (!/^\d{6,25}$/.test(wabaId)) throw new HttpError(400, 'O ID da conta do WhatsApp Business tem só números.')
      if (token.length < 50) throw new HttpError(400, 'Esse token parece incompleto. Copie o token inteiro.')
      if (!/^[0-9a-f]{32}$/i.test(segredo)) throw new HttpError(400, 'A chave secreta do app tem 32 letras e números (Configurações do app → Básico).')
      const numero = await graph<{ display_phone_number?: string; verified_name?: string }>(token, `/${numeroId}?fields=display_phone_number,verified_name`)
      await graph(token, `/${wabaId}/message_templates?limit=1`)
      // Faz a conta Business mandar os avisos (mensagens e status) para o app da pessoa
      await graph(token, `/${wabaId}/subscribed_apps`, { method: 'POST' })
      await rpc('meta_salvar', { p_numero_id: numeroId, p_waba_id: wabaId, p_token: token, p_segredo: segredo, p_numero: numero.display_phone_number ?? null, p_nome: numero.verified_name ?? null }, acesso.authorization)
      return res.status(200).json({ ok: true, numero: numero.display_phone_number ?? null, nome: numero.verified_name ?? null })
    }

    const cred = await credenciais(acesso.authorization)

    if (body.acao === 'modelos') {
      const r = await graph<{ data?: Parameters<typeof lerModelo>[0][] }>(cred.token, `/${cred.waba_id}/message_templates?fields=name,language,status,category,components,parameter_format&limit=200`)
      const modelos = (r.data ?? []).filter((t) => t.status === 'APPROVED').map(lerModelo)
      return res.status(200).json({ modelos })
    }

    if (body.acao === 'texto') {
      const para = numeroMeta(texto(body.para, 30))
      const msg = typeof body.texto === 'string' ? body.texto.trim().slice(0, 4096) : ''
      if (para.length < 10) throw new HttpError(400, 'Número inválido.')
      if (!msg) throw new HttpError(400, 'Escreva a mensagem.')
      const r = await graph<EnvioMeta>(cred.token, `/${cred.numero_id}/messages`, {
        method: 'POST',
        json: { messaging_product: 'whatsapp', to: para, type: 'text', text: { body: msg, preview_url: false } },
      })
      const linha = await gravarEnvio(acesso.authorization, acesso.userId, { telefone: r.contacts?.[0]?.wa_id ?? para, texto: msg, wamid: r.messages?.[0]?.id ?? null })
      return res.status(200).json(paraApp(linha))
    }

    if (body.acao === 'modelo') {
      const modelo = texto(body.modelo, 512)
      const para = texto(body.para, 30)
      if (!modelo) throw new HttpError(400, 'Escolha o modelo.')
      if (numeroMeta(para).length < 10) throw new HttpError(400, 'Número inválido.')
      const linha = await enviarModelo(cred, acesso, {
        para,
        modelo,
        idioma: texto(body.idioma, 15) || 'pt_BR',
        nomes: lista(body.nomes, 20),
        valores: lista(body.valores, 20),
        nomeadas: body.nomeadas === true,
        texto: texto(body.texto, 4096),
        nome: texto(body.nome, 120) || undefined,
      })
      return res.status(200).json(paraApp(linha))
    }

    if (body.acao === 'lote') {
      const modelo = texto(body.modelo, 512)
      const campanhaId = texto(body.campanhaId, 40)
      if (!modelo || !UUID.test(campanhaId)) throw new HttpError(400, 'Campanha inválida.')
      const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 20) as Record<string, unknown>[]
      const base = { modelo, idioma: texto(body.idioma, 15) || 'pt_BR', nomes: lista(body.nomes, 20), nomeadas: body.nomeadas === true, campanhaId }
      const resultados: { para: string; ok: boolean; erro?: string }[] = []
      for (const it of itens) {
        const para = texto(it.para, 30)
        try {
          await enviarModelo(cred, acesso, { ...base, para, valores: lista(it.valores, 20), texto: texto(it.texto, 4096), nome: texto(it.nome, 120) || undefined })
          resultados.push({ para, ok: true })
        } catch (err) {
          const erro = err instanceof Error ? err.message : 'Falhou.'
          resultados.push({ para, ok: false, erro })
          // Fica registrado na campanha (e na conversa) para não tentar de novo sem querer
          await gravarEnvio(acesso.authorization, acesso.userId, { telefone: numeroMeta(para), nome: texto(it.nome, 120) || null, texto: texto(it.texto, 4096), modelo, campanha_id: campanhaId, status: 'failed', erro }).catch(() => undefined)
          // Token vencido ou conta bloqueada: não adianta continuar o lote
          if (err instanceof HttpError && /token|bloqueou|pagamento|limitou/.test(err.message)) break
        }
      }
      return res.status(200).json({ resultados })
    }

    throw new HttpError(400, 'Ação desconhecida.')
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error && err.name !== 'AbortError' && err.name !== 'TimeoutError' ? err.message : 'A Meta demorou demais para responder.'
    return res.status(status).json({ error: message })
  }
}
