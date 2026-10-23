// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Agente IA de vendas: roda no WhatsApp do dono (sessão "principal", XS_AGENTE=1), 24 h na VPS.
 *
 *  - Busca empresas na base aberta (cidades e tipos de negócio que você escolher), filtra e põe na fila.
 *  - Aborda algumas por dia (a cota sobe devagar), com a primeira mensagem escrita para cada empresa.
 *  - Responde quem responde, faz follow-up de quem sumiu e fecha a venda ou chama você.
 *  - Avisa no seu outro número: lead quente, reunião, venda, quem precisa de você e o resumo do dia.
 *  - Aprende: suas correções e o resultado das conversas viram lições que entram nas próximas.
 *
 * Uma ação por vez (ciclo a cada 15 s). Você responder pelo celular = o agente para naquela conversa.
 */
import { randomUUID } from 'node:crypto'
import type { WAMessageKey } from '@whiskeysockets/baileys'
import { recipientByPhone, sentPhones } from '../disparo.js'
import { formatBrazilPhone, getSock, getWa, isValidBrazilWhatsApp, registerSent, samePhone, sendText, sentByThisMotor, waEvents, withTimeout } from '../whatsapp.js'
import { completarConfig, db, gravarChaves, lerChaves, salvar } from './estado.js'
import * as ia from './ia.js'
import { testarGemini, testarXai, usarChaves } from './outras-ias.js'
import {
  analisarTeste,
  boaHoraPara,
  cotaDoDia,
  cumprimento,
  dentroDoHorario,
  diaDe,
  escolherAlvo,
  esperaRespostaMs,
  intervaloAbordagemMs,
  pareceAutomatica,
  pediuParaParar,
  phoneKey,
  precisaFrear,
  proximaAbertura,
  respondeu,
  saudeDoNumero,
  tempoDigitandoMs,
} from './regras.js'
import {
  DIA_VAZIO,
  ESTADOS_ATIVOS,
  MODELOS,
  type AgenteConfig,
  type Alvo,
  type Atividade,
  type Conversa,
  type Dia,
  type Estado,
  type FilaItem,
  type Licao,
  type Mensagem,
  type Modelo,
  type NichoBusca,
  type Teste,
  type Variante,
  provedorDe,
  type Provedor,
} from './tipos.js'

/** Só a sessão do dono liga o agente (no systemd: /etc/xs-whatsapp/motor-principal.env). */
export const AGENTE_LIGADO = process.env.XS_AGENTE === '1'
const BUSCA_URL = (process.env.XS_BUSCA_URL ?? 'http://127.0.0.1:8091').replace(/\/+$/, '')
const BUSCA_TOKEN = process.env.XS_BUSCA_TOKEN ?? ''

/** Mensagens do agente numa conversa no mesmo dia antes de parar e chamar você (evita conversa sem fim com outro robô) */
const MAX_POR_CONVERSA_DIA = 30
/** Lições automáticas ativas de cada tipo (as suas não entram na conta) */
const MAX_LICOES_AUTO = 40

const chaves = lerChaves()
usarChaves(() => chaves)
/** A chave da IA do modelo escolhido (Claude, Gemini ou Grok) */
let chave = ''
function chaveDe(modelo: Modelo) {
  const p = provedorDe(modelo)
  // Gemini sem chave mas com Grok: o Grok responde sozinho
  return p === 'gemini' ? chaves.gemini || chaves.xai : p === 'xai' ? chaves.xai : chaves.anthropic
}
function atualizarChave() {
  chave = chaveDe(db.config.modelo)
}
atualizarChave()
/** A IA recusou a chave (ou acabou o crédito): para até você trocar a chave */
let chaveRecusada = false
let proximaAbordagem = 0
let proximoFollowup = 0
let avisouLimite = ''

const iso = () => new Date().toISOString()
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function hoje(d = new Date()): Dia {
  const k = diaDe(d)
  return (db.dias[k] ??= { ...DIA_VAZIO })
}

function registrar(tipo: Atividade['tipo'], texto: string, conversa?: string) {
  db.atividade.push({ em: iso(), tipo, texto, conversa })
  if (db.atividade.length > 500) db.atividade.splice(0, db.atividade.length - 500)
  if (tipo === 'erro') db.extra.ultimoErro = texto
  salvar()
}

const ctx = (): ia.Contexto => ({ chave, cfg: db.config, licoes: db.licoes })

/** Para o Xico (o assistente do dono): a mesma chave e o mesmo caixa de gasto do dia. */
export const chaveDaApi = () => chave
/** O chat do Xico da XS usa ferramentas do Claude: precisa da chave da Anthropic mesmo com o vendedor no Gemini. */
export const chaveAnthropic = () => chaves.anthropic
export const modeloClaude = (): Modelo => (provedorDe(db.config.modelo) === 'anthropic' ? db.config.modelo : 'claude-opus-5-5')
export function registrarGasto(custo: number) {
  hoje().custoUSD += custo
  salvar()
}

/** Chama a IA, conta o gasto e transforma falha em registro (devolve null). */
async function comIA<T>(fn: () => Promise<{ dados: T; uso: ia.Uso }>, oQue: string): Promise<T | null> {
  try {
    const r = await fn()
    hoje().custoUSD += r.uso.custo
    db.extra.ultimoErro = null
    salvar()
    return r.dados
  } catch (err) {
    const uso = (err as { uso?: ia.Uso }).uso
    if (uso) hoje().custoUSD += uso.custo
    const e = err instanceof ia.ErroIA ? err : new ia.ErroIA((err as Error).message)
    if (e.bloqueante) {
      chaveRecusada = true
      void avisarDono(`⚠️ O agente parou: ${e.message}`)
    }
    registrar('erro', `${oQue}: ${e.message}`)
    return null
  }
}

function porTelefone(phone: string): Conversa | undefined {
  return db.conversas
    .filter((c) => samePhone(c.telefone, phone))
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))[0]
}

const limparTexto = (t: string) =>
  String(t ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 1200)

/** Manda os balões como gente: marca como lida, "digitando…" proporcional ao texto, pausa entre eles. */
async function enviar(c: Conversa, textos: string[], de: Mensagem['de'] = 'agente'): Promise<number> {
  const sock = getSock()
  if (!sock) throw new Error('WhatsApp desconectado.')
  const jid = c.jid ?? `${c.telefone}@s.whatsapp.net`
  if (c.ultimaChave) {
    await sock.readMessages([c.ultimaChave as WAMessageKey]).catch(() => undefined)
    c.ultimaChave = null
  }
  let n = 0
  for (const bruto of textos) {
    const texto = limparTexto(bruto)
    if (!texto) continue
    if (de === 'agente') {
      await sock.sendPresenceUpdate('composing', jid).catch(() => undefined)
      await dormir(tempoDigitandoMs(texto))
      await sock.sendPresenceUpdate('paused', jid).catch(() => undefined)
    }
    const s = getSock()
    if (!s) throw new Error('WhatsApp desconectado.')
    const res = await withTimeout(s.sendMessage(jid, { text: texto }), 25_000, 'Tempo esgotado ao enviar.')
    const id = res?.key?.id
    if (!id) throw new Error('O WhatsApp não confirmou o envio.')
    registerSent(id)
    c.mensagens.push({ id: randomUUID(), de, texto, em: iso(), waId: id })
    c.atualizadaEm = iso()
    hoje().enviadas++
    n++
    salvar()
    await dormir(800 + Math.random() * 1500)
  }
  return n
}

/** Aviso no outro número do dono. */
async function avisarDono(texto: string) {
  const tel = db.config.avisos.telefone
  if (!tel || !getSock()) return
  try {
    await sendText(tel, `🤖 Agente XS\n${texto}`)
  } catch (err) {
    db.atividade.push({ em: iso(), tipo: 'erro', texto: `Não consegui avisar no seu número: ${(err as Error).message}` })
  }
}

const link = (c: Conversa) => `wa.me/${c.telefone}`

/** O que mais a busca trouxe e ajuda a personalizar a conversa (bairro, categoria, nota, responsável). */
export function detalhesDoBruto(bruto: Record<string, unknown> | null | undefined): string {
  if (!bruto) return ''
  const s = (k: string) => (typeof bruto[k] === 'string' ? (bruto[k] as string).trim() : '')
  const n = (k: string) => (typeof bruto[k] === 'number' && Number.isFinite(bruto[k]) ? (bruto[k] as number) : 0)
  const nota = n('rating')
  const avaliacoes = n('reviewsCount')
  return [
    s('neighborhood') && `Bairro: ${s('neighborhood')}`,
    s('category') && s('category').toLowerCase() !== s('niche').toLowerCase() && `Categoria no Google: ${s('category')}`,
    nota > 0 && `Nota no Google: ${nota.toFixed(1).replace('.', ',')}${avaliacoes ? ` (${avaliacoes} avaliações)` : ''}`,
    s('facebook') && 'Tem página no Facebook',
    s('responsibleName') && bruto.enrichmentConfidence === 'confirmed' && `Responsável: ${s('responsibleName')}${s('responsibleRole') ? ` (${s('responsibleRole')})` : ''}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const comDetalhes = (c: Conversa) => ({ ...c, detalhes: detalhesDoBruto(c.bruto) })

// ---------------------------------------------------------------------------
// Aprendizado
// ---------------------------------------------------------------------------

function guardarLicao(tipo: Licao['tipo'], texto: string, origem: Licao['origem']): Licao | null {
  const t = texto.trim()
  if (!t) return null
  const l: Licao = { id: randomUUID(), tipo, texto: t.slice(0, 400), origem, ativa: true, em: iso() }
  db.licoes.push(l)
  // Só as automáticas mais novas ficam ativas; as que você escreveu nunca saem sozinhas
  const auto = db.licoes.filter((x) => x.tipo === tipo && x.ativa && x.origem !== 'voce')
  for (const velha of auto.slice(0, Math.max(0, auto.length - MAX_LICOES_AUTO))) velha.ativa = false
  registrar('licao', `Aprendeu: ${l.texto}`)
  return l
}

/** Fim de conversa com troca de verdade: vale tirar uma lição. */
async function aprenderCom(c: Conversa, resultado: string) {
  if (c.mensagens.filter((m) => m.de === 'lead').length < 2 || !chave || chaveRecusada) return
  const r = await comIA(() => ia.licaoDoResultado(ctx(), c, resultado), 'Lição da conversa')
  if (r?.licao) guardarLicao('conversa', r.licao, 'resultado')
}

// ---------------------------------------------------------------------------
// Mensagens que chegam e que saem
// ---------------------------------------------------------------------------

/** Quem respondeu a um Disparo vira conversa do agente (com as mensagens da campanha no histórico). */
function daCampanha(phone: string): Conversa | undefined {
  const r = recipientByPhone(phone)
  if (!r) return undefined
  const agora = iso()
  const c = novaConversa({ telefone: formatBrazilPhone(phone), empresa: r.nome, origem: 'disparo', leadId: r.leadId })
  c.mensagens = r.textos.map((texto) => ({ id: randomUUID(), de: 'voce' as const, texto, em: agora }))
  c.sinc.mensagens = c.mensagens.length
  db.conversas.push(c)
  registrar('aviso', `${c.empresa} respondeu ao disparo "${r.campanha}": o agente assumiu a conversa`, c.id)
  return c
}

function novaConversa(p: Partial<Conversa> & Pick<Conversa, 'telefone' | 'empresa' | 'origem'>): Conversa {
  const agora = iso()
  return {
    id: randomUUID(),
    jid: null,
    nicho: '',
    cidade: '',
    uf: '',
    endereco: '',
    site: '',
    instagram: '',
    alvoId: null,
    leadId: null,
    bruto: null,
    estado: 'aguardando',
    temperatura: 'frio',
    resumo: '',
    mensagens: [],
    followups: 0,
    pendente: false,
    responderEm: null,
    ultimaChave: null,
    avisadoQuente: false,
    criadaEm: agora,
    atualizadaEm: agora,
    sinc: { mensagens: 0, estado: null, lead: !!p.leadId },
    ...p,
  }
}

/** Mensagem do cliente (exportada para os testes). */
export function receber(phone: string, texto: string, key: WAMessageKey) {
  const cfg = db.config
  if (cfg.avisos.telefone && samePhone(phone, cfg.avisos.telefone)) return
  const c = porTelefone(phone) ?? (cfg.ativo && cfg.responderDisparos ? daCampanha(phone) : undefined)
  if (!c) return
  // Resposta automática do WhatsApp Business antes de qualquer resposta de verdade: guarda, mas não
  // conta como resposta, não gasta IA e não zera o follow-up (a pessoa ainda não viu a mensagem)
  const nossa = c.mensagens.filter((m) => m.de !== 'lead').at(-1)
  const segundos = nossa ? (Date.now() - Date.parse(nossa.em)) / 1000 : Infinity
  const anterior = c.mensagens.at(-1)
  // Muita empresa manda 2 ou 3 mensagens automáticas seguidas (saudação, depois "sobre a empresa"):
  // o que chega até 30 s depois de uma automática também é automático (gente demora mais para digitar)
  const emSequencia = !!anterior?.auto && Date.now() - Date.parse(anterior.em) < 30_000
  if (!respondeu(c) && c.estado === 'aguardando' && !pediuParaParar(texto) && (emSequencia || pareceAutomatica(texto, segundos))) {
    c.mensagens.push({ id: randomUUID(), de: 'lead', texto: texto || '[mensagem sem texto]', em: iso(), auto: true })
    c.ultimaChave = key
    c.atualizadaEm = iso()
    // Só mandou o cumprimento: a resposta automática é a deixa para a apresentação (espera as outras chegarem)
    if (c.apresentar && cfg.ativo) {
      c.pendente = true
      c.responderEm = new Date(Date.now() + 60_000 + Math.random() * 60_000).toISOString()
    }
    if (!emSequencia) registrar('aviso', `${c.empresa} mandou uma resposta automática (não conta como resposta)`, c.id)
    else salvar()
    return
  }
  if (c.origem === 'agente' && !respondeu(c)) hoje().responderam++
  c.mensagens.push({ id: randomUUID(), de: 'lead', texto: texto || '[mensagem sem texto]', em: iso() })
  c.ultimaChave = key
  c.followups = 0
  c.atualizadaEm = iso()
  if (c.estado === 'optout') return salvar()
  if (pediuParaParar(texto)) return void optout(c)
  if (c.estado === 'fechado') {
    void avisarDono(`💬 ${c.empresa} (venda fechada) mandou mensagem:\n"${texto.slice(0, 300)}"\n${link(c)}`)
    return salvar()
  }
  if (c.estado === 'humano') return salvar()
  if (c.estado === 'aguardando' || c.estado === 'perdido' || c.estado === 'sem_resposta') c.estado = 'conversando'
  if (cfg.ativo) {
    c.pendente = true
    c.responderEm = new Date(Date.now() + esperaRespostaMs()).toISOString()
  }
  salvar()
}

/** Você mandou mensagem pelo celular para alguém em conversa com o agente: ele para ali. */
export function saiuPeloCelular(phone: string, texto: string, waId: string) {
  if (sentByThisMotor(waId)) return
  const c = porTelefone(phone)
  if (!c || c.mensagens.some((m) => m.waId === waId)) return
  c.mensagens.push({ id: randomUUID(), de: 'voce', texto: texto || '[mídia]', em: iso(), waId })
  c.pendente = false
  c.atualizadaEm = iso()
  if (c.estado !== 'optout' && c.estado !== 'fechado' && c.estado !== 'humano') {
    c.estado = 'humano'
    registrar('humano', `Você respondeu ${c.empresa} pelo celular: o agente parou nessa conversa`, c.id)
  }
  salvar()
}

async function optout(c: Conversa, despedida?: string[]) {
  c.estado = 'optout'
  c.pendente = false
  hoje().optouts++
  db.extra.descartados.push(phoneKey(c.telefone))
  registrar('optout', `${c.empresa} pediu para não receber mais mensagens`, c.id)
  frearSePreciso()
  if (db.config.ativo && getSock()) await enviar(c, (despedida?.length ? despedida : ['Tudo bem, não vou mais te mandar mensagens. Desculpe o incômodo e um ótimo dia!']).slice(0, 1)).catch(() => undefined)
  salvar()
}

/**
 * Muita gente pedindo para parar no mesmo dia é o sinal que mais leva a bloqueio do número: a
 * prospecção para até amanhã (conversas em andamento continuam) e você recebe um aviso.
 */
function frearSePreciso(t = new Date()) {
  const d = hoje(t)
  if (db.extra.freio === diaDe(t) || !db.config.prospeccao.ativa || !precisaFrear(d)) return
  db.extra.freio = diaDe(t)
  registrar('aviso', `Freio de segurança: ${d.optouts} pessoas pediram para parar hoje (de ${d.abordados} abordadas). A prospecção para até amanhã para proteger o número.`)
  void avisarDono(`🛑 Freio de segurança: ${d.optouts} pessoas pediram para parar hoje (de ${d.abordados} abordadas). Parei de abordar empresas novas até amanhã para proteger o número; as conversas continuam. Vale revisar a primeira mensagem com o Xico.`)
}

// ---------------------------------------------------------------------------
// Responder, follow-up, prospectar, resumo do dia
// ---------------------------------------------------------------------------

async function aplicar(c: Conversa, d: ia.RespostaIA, apresentou = false) {
  c.temperatura = d.temperatura
  if (d.resumo.trim()) c.resumo = d.resumo.trim()
  if (d.acao === 'aguardar') return salvar()
  if (d.acao === 'optout') return optout(c, d.mensagens)
  if (d.mensagens.length) await enviar(c, d.mensagens.slice(0, 3))
  const aviso = (d.aviso_dono || d.resumo).trim()
  switch (d.acao) {
    case 'chamar_dono':
      c.estado = 'humano'
      registrar('humano', `${c.empresa} precisa de você: ${aviso}`, c.id)
      await avisarDono(`🙋 ${c.empresa} precisa de você.\n${aviso}\n${link(c)}`)
      break
    case 'reuniao_marcada':
      c.estado = 'reuniao'
      hoje().reunioes++
      registrar('reuniao', `Reunião com ${c.empresa}: ${aviso}`, c.id)
      await avisarDono(`📅 Reunião marcada com ${c.empresa}.\n${aviso}\n${link(c)}`)
      void aprenderCom(c, 'reunião marcada')
      break
    case 'venda_fechada':
      c.estado = 'fechado'
      hoje().vendas++
      registrar('venda', `Venda: ${c.empresa} fechou. ${aviso}`, c.id)
      await avisarDono(`💰 Venda! ${c.empresa} fechou. Confira o pagamento.\n${aviso}\n${link(c)}`)
      void aprenderCom(c, 'venda fechada')
      break
    case 'perdido':
      c.estado = 'perdido'
      registrar('respondeu', `${c.empresa} recusou`, c.id)
      void aprenderCom(c, 'o cliente recusou')
      break
    default:
      if (d.temperatura === 'quente' && c.estado !== 'reuniao') {
        c.estado = 'quente'
        if (!c.avisadoQuente) {
          c.avisadoQuente = true
          hoje().quentes++
          registrar('quente', `${c.empresa} esquentou: ${aviso}`, c.id)
          await avisarDono(`🔥 ${c.empresa} esquentou.\n${aviso}\nO agente continua a conversa; se quiser assumir, é só responder pelo celular.\n${link(c)}`)
        }
      } else if (c.estado === 'aguardando' && respondeu(c)) c.estado = 'conversando'
      registrar('respondeu', apresentou ? `Mandou a apresentação para ${c.empresa}` : `Respondeu ${c.empresa}`, c.id)
  }
  salvar()
}

async function responderPendente(t: Date): Promise<boolean> {
  const cfg = db.config
  const c = db.conversas
    .filter((x) => x.pendente && ESTADOS_ATIVOS.includes(x.estado) && Date.parse(x.responderEm ?? '') <= t.getTime())
    .sort((a, b) => (a.responderEm ?? '').localeCompare(b.responderEm ?? ''))[0]
  if (!c) return false
  if (!dentroDoHorario(t, cfg.respostas.inicio, cfg.respostas.fim)) {
    c.responderEm = proximaAbertura(t, cfg.respostas.inicio, cfg.respostas.fim).toISOString()
    salvar()
    return false
  }
  // O funil do disparo ainda está mandando as mensagens dele para essa pessoa
  if (c.origem === 'disparo' && recipientByPhone(c.telefone)?.enviando) {
    c.responderEm = new Date(t.getTime() + 5 * 60_000).toISOString()
    return false
  }
  const dia = diaDe(t)
  if (c.mensagens.filter((m) => m.de === 'agente' && diaDe(new Date(m.em)) === dia).length >= MAX_POR_CONVERSA_DIA) {
    c.estado = 'humano'
    c.pendente = false
    registrar('humano', `Conversa longa demais com ${c.empresa} hoje: o agente parou e chamou você`, c.id)
    await avisarDono(`🙋 A conversa com ${c.empresa} passou de ${MAX_POR_CONVERSA_DIA} mensagens hoje. Dê uma olhada.\n${link(c)}`)
    return true
  }
  const total = c.mensagens.length
  // Só mandou o cumprimento: a vez agora é da apresentação (com o ângulo do teste, se for de um)
  const apresentar = !!c.apresentar
  const angulo = apresentar && c.testeId ? (db.testes.find((x) => x.id === c.testeId)?.variantes.find((v) => v.id === c.variante)?.angulo ?? '') : ''
  const r = await comIA(
    () => (apresentar ? ia.apresentacao(ctx(), comDetalhes(c), t, angulo) : ia.responder(ctx(), comDetalhes(c), t)),
    `${apresentar ? 'Apresentação' : 'Resposta'} para ${c.empresa}`,
  )
  if (!r) {
    c.responderEm = new Date(Date.now() + 2 * 60_000).toISOString()
    return true
  }
  // Chegou mensagem nova enquanto a IA pensava: pensa de novo com tudo
  if (c.mensagens.slice(total).some((m) => m.de === 'lead')) {
    c.responderEm = new Date(Date.now() + 5000).toISOString()
    return true
  }
  // Você assumiu enquanto a IA pensava
  if (!c.pendente || !ESTADOS_ATIVOS.includes(c.estado)) return true
  c.pendente = false
  c.responderEm = null
  if (apresentar) c.apresentar = false
  await aplicar(c, r, apresentar)
  return true
}

/**
 * Cumprimentou e ninguém respondeu (nem a resposta automática) em 2 h: manda a apresentação mesmo
 * assim, dentro do horário de prospecção.
 */
function apresentarSemResposta(t: Date): boolean {
  const p = db.config.prospeccao
  if (!dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  const c = db.conversas.find((x) => x.apresentar && !x.pendente && x.estado === 'aguardando' && t.getTime() - Date.parse(x.mensagens.at(-1)?.em ?? x.criadaEm) > 2 * 3_600_000)
  if (!c) return false
  c.pendente = true
  c.responderEm = new Date(t.getTime()).toISOString()
  salvar()
  return false // quem manda é o responderPendente, no próximo ciclo
}

async function fazerFollowup(t: Date): Promise<boolean> {
  const cfg = db.config
  const p = cfg.prospeccao
  const dias = cfg.followup.dias.filter((d) => d > 0)
  if (!cfg.followup.ativo || !dias.length || t.getTime() < proximoFollowup || !dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  let alvo: Conversa | null = null
  for (const c of db.conversas) {
    // Ainda falta a apresentação: o follow-up só começa depois dela
    if (c.pendente || c.apresentar || !['aguardando', 'conversando', 'quente'].includes(c.estado)) continue
    // Resposta automática não conta: o follow-up segue o relógio da nossa última mensagem
    const ultima = c.mensagens.filter((m) => !m.auto).at(-1)
    if (!ultima || ultima.de === 'lead') continue
    const desde = t.getTime() - Date.parse(ultima.em)
    if (c.followups >= dias.length) {
      // Acabaram as tentativas e passaram mais 3 dias sem resposta
      if (desde > 3 * 86_400_000) {
        c.estado = 'sem_resposta'
        salvar()
      }
      continue
    }
    if (desde >= dias[c.followups] * 86_400_000 && (!alvo || c.atualizadaEm < alvo.atualizadaEm)) alvo = c
  }
  if (!alvo) return false
  const c = alvo
  const r = await comIA(() => ia.followup(ctx(), comDetalhes(c), dias.length, t), `Follow-up para ${c.empresa}`)
  proximoFollowup = Date.now() + (3 + Math.random() * 3) * 60_000
  if (!r) return true
  c.followups++
  c.atualizadaEm = iso()
  if (r.mensagens.length) {
    await enviar(c, r.mensagens.slice(0, 1))
    registrar('followup', `Follow-up ${c.followups} para ${c.empresa}`, c.id)
  }
  salvar()
  return true
}

function bloqueados(): Set<string> {
  return new Set([...db.extra.conhecidos, ...db.extra.descartados, ...sentPhones(), ...db.conversas.map((c) => phoneKey(c.telefone))])
}

interface ResultadoBase {
  name: string
  niche: string
  phone: string
  website: string
  instagram: string
  address: string
  city: string
  state: string
}

/** Busca mais empresas para a fila numa cidade/nicho (sorteado pelos resultados, ou o que você escolher). */
async function reabastecer(alvoEscolhido?: Alvo, testeId?: string): Promise<{ achadas: number; mantidas: FilaItem[] }> {
  const p = db.config.prospeccao
  const alvo = alvoEscolhido ?? escolherAlvo(p.alvos, db.conversas)
  if (!alvo) throw new Error('Cadastre ao menos uma cidade com tipos de negócio em Prospecção.')
  if (!BUSCA_TOKEN) throw new Error('A busca de empresas não está configurada neste servidor.')
  const conhecidos = [...bloqueados(), ...db.fila.map((f) => phoneKey(f.telefone))]
  let res: Response
  try {
    res = await fetch(`${BUSCA_URL}/buscar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BUSCA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uf: alvo.uf,
        cidade: alvo.cidade,
        nichos: alvo.nichos,
        filtros: { celular: 1, site: p.soSemSite ? -1 : 0 },
        meta: 40,
        conhecidos: { telefones: conhecidos },
        pular: true,
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error('A busca de empresas não respondeu agora.')
  }
  const data = (await res.json().catch(() => ({}))) as { results?: ResultadoBase[]; error?: string }
  if (!res.ok) throw new Error(data.error || 'A busca de empresas falhou.')
  const agora = iso()
  let itens: FilaItem[] = (data.results ?? [])
    .map((r) => ({
      id: randomUUID(),
      telefone: formatBrazilPhone(r.phone),
      empresa: r.name,
      nicho: r.niche,
      cidade: r.city || alvo.cidade,
      uf: r.state || alvo.uf,
      endereco: r.address ?? '',
      site: r.website ?? '',
      instagram: r.instagram ?? '',
      alvoId: alvo.id,
      bruto: r as unknown as Record<string, unknown>,
      em: agora,
      ...(testeId ? { testeId } : {}),
    }))
    .filter((f) => isValidBrazilWhatsApp(f.telefone))
  const achadas = itens.length
  const temCriterio = !!p.criterios.trim() || db.licoes.some((l) => l.ativa && l.tipo === 'busca')
  if (itens.length && temCriterio && chave && !chaveRecusada) {
    const r = await comIA(() => ia.filtrarEmpresas(ctx(), itens), 'Filtrar empresas')
    if (r) {
      const manter = new Set(r.manter)
      for (const [i, f] of itens.entries()) if (!manter.has(i)) db.extra.descartados.push(phoneKey(f.telefone))
      itens = itens.filter((_, i) => manter.has(i))
    }
  }
  db.fila.push(...itens)
  if (db.fila.length > 300) db.fila.splice(0, db.fila.length - 300)
  const nomes = alvo.nichos.map((n) => n.nome).join(', ')
  registrar('busca', `Buscou ${nomes} em ${alvo.cidade}: ${itens.length} empresa(s) nova(s) na fila${achadas > itens.length ? ` (${achadas - itens.length} fora dos seus critérios)` : ''}`)
  return { achadas, mantidas: itens }
}

export interface EmpresaAchada {
  empresa: string
  nicho: string
  telefone: string
  site: string
  instagram: string
  endereco: string
  cidade: string
  uf: string
}

/**
 * Busca empresas na base aberta para o dono escolher (conector do Claude/Jarvis).
 * Não mexe na fila do vendedor; pula quem já foi abordado ou descartado.
 */
export async function buscarEmpresas(p: { uf: string; cidade: string; nichos: NichoBusca[]; quantidade: number; soSemSite: boolean }): Promise<EmpresaAchada[]> {
  if (!BUSCA_TOKEN) throw new Error('A busca de empresas não está configurada neste servidor.')
  let res: Response
  try {
    res = await fetch(`${BUSCA_URL}/buscar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BUSCA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uf: p.uf,
        cidade: p.cidade,
        nichos: p.nichos,
        filtros: { celular: 1, site: p.soSemSite ? -1 : 0 },
        meta: p.quantidade,
        conhecidos: { telefones: [...bloqueados()] },
        pular: true,
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error('A busca de empresas não respondeu agora.')
  }
  const data = (await res.json().catch(() => ({}))) as { results?: ResultadoBase[]; error?: string }
  if (!res.ok) throw new Error(data.error || 'A busca de empresas falhou.')
  return (data.results ?? [])
    .map((r) => ({
      empresa: r.name,
      nicho: r.niche,
      telefone: formatBrazilPhone(r.phone),
      site: r.website ?? '',
      instagram: r.instagram ?? '',
      endereco: r.address ?? '',
      cidade: r.city || p.cidade,
      uf: r.state || p.uf,
    }))
    .filter((e) => isValidBrazilWhatsApp(e.telefone))
    .slice(0, p.quantidade)
}

/** Teste que ainda precisa abordar empresas (o mais antigo primeiro). */
function testeAtivo(): Teste | undefined {
  return db.testes.find((t) => t.estado === 'rodando' && db.conversas.filter((c) => c.testeId === t.id).length < t.porVariante * t.variantes.length)
}

/** Abordagem do teste com menos empresas até agora (divide igual). */
function proximaVariante(t: Teste): Variante {
  const usadas = (v: Variante) => db.conversas.filter((c) => c.testeId === t.id && c.variante === v.id).length
  return t.variantes.reduce((menor, v) => (usadas(v) < usadas(menor) ? v : menor), t.variantes[0])
}

/**
 * Posição do próximo da fila: primeiro quem está em boa hora (restaurante não no meio do almoço).
 * -2 = só sobrou empresa em hora ruim (melhor esperar); -1 = não tem ninguém.
 */
function indiceNaFila(t: Date, deste: (f: FilaItem) => boolean): number {
  const i = db.fila.findIndex((f) => deste(f) && boaHoraPara(f.nicho, t))
  if (i >= 0) return i
  return db.fila.some(deste) ? -2 : -1
}

async function proximoDaFila(t = new Date()): Promise<FilaItem | 'espera' | null> {
  // Teste rodando: as empresas dele vêm antes da prospecção normal
  const teste = testeAtivo()
  for (let tentativa = 0; teste && tentativa < 2; tentativa++) {
    const fora = bloqueados()
    let i: number
    while ((i = indiceNaFila(t, (f) => f.testeId === teste.id)) >= 0) {
      const [it] = db.fila.splice(i, 1)
      if (!fora.has(phoneKey(it.telefone)) && isValidBrazilWhatsApp(it.telefone)) return it
    }
    // Empresas do teste só em hora ruim agora: segue a prospecção normal e volta ao teste depois
    if (i === -2) break
    const r = await reabastecer(teste.alvo, teste.id).catch((err) => {
      registrar('erro', `Busca do teste "${teste.nome}": ${(err as Error).message}`)
      return null
    })
    if (!r?.mantidas.length) {
      teste.estado = 'pausado'
      registrar('aviso', `Teste "${teste.nome}" pausado: acabaram as empresas novas de ${teste.alvo.nichos.map((n) => n.nome).join(', ')} em ${teste.alvo.cidade}.`)
      break
    }
  }
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const fora = bloqueados()
    let i: number
    while ((i = indiceNaFila(t, (f) => !f.testeId)) >= 0) {
      const [it] = db.fila.splice(i, 1)
      if (!fora.has(phoneKey(it.telefone)) && isValidBrazilWhatsApp(it.telefone)) return it
    }
    if (i === -2) return 'espera'
    if (!db.config.prospeccao.alvos.some((a) => a.ativo)) return null
    const r = await reabastecer().catch((err) => {
      registrar('erro', `Busca de empresas: ${(err as Error).message}`)
      return null
    })
    if (!r) return null
  }
  return null
}

async function prospectar(t: Date): Promise<boolean> {
  const p = db.config.prospeccao
  if (!p.ativa || t.getTime() < proximaAbordagem || !dentroDoHorario(t, p.inicio, p.fim, p.dias)) return false
  if (db.extra.freio === diaDe(t)) return false
  const dia = hoje(t)
  const cota = cotaHoje(t)
  if (dia.abordados >= cota) return false
  const item = await proximoDaFila(t)
  if (item === 'espera') {
    proximaAbordagem = Date.now() + 15 * 60_000
    return false
  }
  if (!item) {
    proximaAbordagem = Date.now() + 30 * 60_000
    registrar('aviso', 'Sem empresas novas para abordar nas cidades e tipos de negócio escolhidos. Adicione mais em Prospecção.')
    return false
  }
  db.extra.desde ??= diaDe(t)
  const sock = getSock()
  if (!sock) return false
  const consulta = await withTimeout(sock.onWhatsApp(`${item.telefone}@s.whatsapp.net`), 15_000, 'Tempo esgotado ao consultar o número.').catch(() => null)
  // Falha na consulta (rede, WhatsApp lento) não quer dizer que o número não tem WhatsApp: volta para a fila
  if (!consulta) {
    db.fila.unshift(item)
    proximaAbordagem = Date.now() + 2 * 60_000
    return false
  }
  const [contato] = consulta
  if (!contato?.exists || !contato.jid) {
    dia.semWhatsApp++
    db.extra.descartados.push(phoneKey(item.telefone))
    proximaAbordagem = Date.now() + 20_000
    salvar()
    return true
  }
  const lead = { empresa: item.empresa, nicho: item.nicho, cidade: item.cidade, uf: item.uf, endereco: item.endereco, site: item.site, instagram: item.instagram }
  const teste = item.testeId ? db.testes.find((x) => x.id === item.testeId && x.estado === 'rodando') : undefined
  const variante = teste ? proximaVariante(teste) : undefined
  // Do jeito do dono: primeiro só o cumprimento (sem IA); a apresentação vem depois da resposta
  const doisPassos = p.cumprimentarPrimeiro
  const r = doisPassos
    ? { mensagens: [cumprimento(item.empresa, t)] }
    : await comIA(() => ia.abordagem(ctx(), { ...lead, detalhes: detalhesDoBruto(item.bruto) }, t, variante?.angulo), `Abordagem de ${item.empresa}`)
  if (!r?.mensagens.length) {
    db.fila.unshift(item)
    proximaAbordagem = Date.now() + 5 * 60_000
    return true
  }
  const c = novaConversa({
    ...lead,
    telefone: item.telefone,
    jid: contato.jid,
    origem: 'agente',
    alvoId: item.alvoId,
    bruto: item.bruto,
    testeId: teste?.id ?? null,
    variante: variante?.id ?? null,
    ...(doisPassos ? { apresentar: true } : {}),
  })
  db.conversas.push(c)
  try {
    await enviar(c, r.mensagens.slice(0, 2))
  } catch (err) {
    if (!c.mensagens.length) db.conversas.splice(db.conversas.indexOf(c), 1)
    registrar('erro', `Não consegui mandar para ${item.empresa}: ${(err as Error).message}`)
    proximaAbordagem = Date.now() + 5 * 60_000
    return true
  }
  dia.abordados++
  registrar('abordou', `Abordou ${c.empresa} (${[c.nicho, c.cidade].filter(Boolean).join(', ')})${teste && variante ? ` · teste "${teste.nome}", abordagem ${variante.nome}` : ''}`, c.id)
  proximaAbordagem = Date.now() + intervaloAbordagemMs(t, p.fim, cota - dia.abordados)
  salvar()
  return true
}

/** Os últimos `n` dias (sem hoje), para medir a saúde do número. */
function ultimosDias(t: Date, n = 7): Dia[] {
  return Array.from({ length: n }, (_, i) => db.dias[diaDe(new Date(t.getTime() - (i + 1) * 86_400_000))]).filter((d): d is Dia => !!d)
}

/** Cota de hoje. Semana com muita gente pedindo para parar: a cota não sobe (fica na da semana anterior). */
function cotaHoje(t = new Date()): number {
  const p = db.config.prospeccao
  const saude = saudeDoNumero(ultimosDias(t))
  return saude.ruim ? cotaDoDia(p, db.extra.desde, new Date(t.getTime() - 7 * 86_400_000)) : cotaDoDia(p, db.extra.desde, t)
}

/** Conversa que o agente passou para você e o cliente está esperando resposta há mais de 2 h: lembra uma vez. */
async function lembrarDono(t: Date): Promise<boolean> {
  const cfg = db.config
  if (!cfg.avisos.telefone || !dentroDoHorario(t, cfg.respostas.inicio, cfg.respostas.fim)) return false
  const c = db.conversas.find((x) => {
    const ultima = x.mensagens.at(-1)
    return x.estado === 'humano' && ultima?.de === 'lead' && !ultima.auto && t.getTime() - Date.parse(ultima.em) > 2 * 3_600_000 && (!x.lembradoEm || x.lembradoEm < ultima.em)
  })
  if (!c) return false
  c.lembradoEm = iso()
  salvar()
  const ultima = c.mensagens.at(-1)!
  await avisarDono(`⏰ ${c.empresa} está esperando você responder desde ${new Date(ultima.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}:\n"${ultima.texto.slice(0, 200)}"\n${link(c)}`)
  return true
}

/**
 * Teste que já abordou todas as empresas e deu 3 dias para responderem: encerra sozinho com a
 * conclusão dos números e avisa você (o Xico vê no próximo papo).
 */
async function concluirTestes(t: Date): Promise<boolean> {
  for (const teste of db.testes) {
    if (teste.estado !== 'rodando') continue
    const deste = db.conversas.filter((c) => c.testeId === teste.id)
    if (deste.length < teste.porVariante * teste.variantes.length) continue
    const ultima = Math.max(...deste.map((c) => Date.parse(c.criadaEm)))
    if (t.getTime() - ultima < 3 * 86_400_000) continue
    const a = analiseDoTeste(teste)
    teste.estado = 'encerrado'
    teste.encerradoEm = iso()
    teste.conclusao = `Automática: ${a.texto}`
    for (const f of db.fila) if (f.testeId === teste.id) delete f.testeId
    registrar('aviso', `Teste "${teste.nome}" terminou. ${a.texto}`)
    await avisarDono(`🧪 Teste "${teste.nome}" terminou.\n${a.texto}\nPeça ao Xico para adotar a vencedora ou montar outro teste.`)
    return true
  }
  return false
}

async function resumoDoDia(t: Date) {
  const cfg = db.config
  if (!cfg.avisos.relatorio || !cfg.avisos.telefone || t.getHours() < cfg.prospeccao.fim) return
  const d = hoje(t)
  if (d.relatorio) return
  d.relatorio = true
  salvar()
  if (!d.abordados && !d.enviadas) return
  const esperando = db.conversas.filter((c) => c.estado === 'humano' && c.mensagens.at(-1)?.de === 'lead').length
  const pct = d.abordados ? ` (${Math.round((d.responderam / d.abordados) * 100)}%)` : ''
  await avisarDono(
    [
      '📊 Resumo de hoje',
      `Empresas abordadas: ${d.abordados}`,
      `Responderam: ${d.responderam}${pct}`,
      `Esquentaram: ${d.quentes}`,
      `Reuniões: ${d.reunioes}`,
      `Vendas: ${d.vendas}`,
      `Pediram para parar: ${d.optouts}`,
      `Gasto com IA: US$ ${d.custoUSD.toFixed(2)}`,
      esperando ? `\n🙋 ${esperando} conversa(s) esperando você responder.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

let ocupado = false

async function ciclo() {
  const cfg = db.config
  if (ocupado || !cfg.ativo || !chave || chaveRecusada || db.extra.pausadoPorRisco || getWa().status !== 'connected') return
  ocupado = true
  try {
    const t = new Date()
    if (hoje(t).custoUSD >= cfg.limiteDiaUSD) {
      if (avisouLimite !== diaDe(t)) {
        avisouLimite = diaDe(t)
        registrar('aviso', `Chegou no limite de gasto do dia (US$ ${cfg.limiteDiaUSD.toFixed(2)}). O agente volta amanhã.`)
        await avisarDono(`⏸️ O agente chegou no limite de gasto de hoje (US$ ${cfg.limiteDiaUSD.toFixed(2)}) e volta amanhã. Dá para aumentar o limite na XS.`)
      }
      return
    }
    apresentarSemResposta(t)
    if (await responderPendente(t)) return
    if (await fazerFollowup(t)) return
    if (await prospectar(t)) return
    if (await lembrarDono(t)) return
    if (await concluirTestes(t)) return
    await resumoDoDia(t)
  } catch (err) {
    registrar('erro', (err as Error).message)
  } finally {
    ocupado = false
  }
}

if (AGENTE_LIGADO) {
  waEvents.incoming((phone, texto, info) => {
    if (!info.grupo) receber(phone, texto, info.key)
  })
  // Espera um pouco: o envio do próprio motor registra o id logo depois do evento
  waEvents.outgoing((phone, texto, id) => void setTimeout(() => saiuPeloCelular(phone, texto, id), 4000))
  waEvents.risk(({ reason }) => {
    db.extra.pausadoPorRisco = iso()
    // A cota volta ao começo: o número precisa de calma depois de um problema
    db.extra.desde = diaDe()
    registrar('aviso', `Agente pausado por segurança: ${reason} Confira o WhatsApp e retome na tela do Agente.`)
  })
  setInterval(() => void ciclo(), 15_000).unref()
}

// ---------------------------------------------------------------------------
// O que a tela do Agente usa
// ---------------------------------------------------------------------------

export function estado() {
  const t = new Date()
  const mes = diaDe(t).slice(0, 7)
  const doMes = Object.entries(db.dias).filter(([k]) => k.startsWith(mes))
  const soma = (f: keyof Dia) => doMes.reduce((s, [, d]) => s + Number(d[f] || 0), 0)
  const contagem: Partial<Record<Estado, number>> = {}
  for (const c of db.conversas) contagem[c.estado] = (contagem[c.estado] ?? 0) + 1
  return {
    disponivel: AGENTE_LIGADO,
    ativo: db.config.ativo,
    temChave: !!chave,
    chaveFinal: chave ? chave.slice(-4) : null,
    provedor: provedorDe(db.config.modelo),
    chaveRecusada,
    pausadoPorRisco: db.extra.pausadoPorRisco,
    ultimoErro: db.extra.ultimoErro,
    whatsapp: getWa().status,
    modelo: db.config.modelo,
    hoje: hoje(t),
    cotaHoje: cotaHoje(t),
    freioHoje: db.extra.freio === diaDe(t),
    saude: saudeDoNumero(ultimosDias(t)),
    proximaAbordagem: proximaAbordagem > Date.now() ? new Date(proximaAbordagem).toISOString() : null,
    fila: db.fila.length,
    mes: { custoUSD: soma('custoUSD'), abordados: soma('abordados'), responderam: soma('responderam'), reunioes: soma('reunioes'), vendas: soma('vendas') },
    contagem,
    licoes: db.licoes.filter((l) => l.ativa).length,
  }
}

const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
const horas = (v: unknown, padrao: number) => Math.round(num(v, 0, 24, padrao))

function limparAlvo(a: Partial<Alvo>): Alvo | null {
  const uf = txt(a.uf, 2).toUpperCase()
  const cidade = txt(a.cidade, 80)
  const nichos = (Array.isArray(a.nichos) ? a.nichos : [])
    .slice(0, 30)
    .map((n) => ({
      nome: txt(n?.nome, 80),
      tax: (Array.isArray(n?.tax) ? n.tax : []).map((x) => txt(x, 60)).filter(Boolean).slice(0, 40),
      nomes: (Array.isArray(n?.nomes) ? n.nomes : []).map((x) => txt(x, 60)).filter(Boolean).slice(0, 20),
    }))
    .filter((n) => n.nome && (n.tax.length || n.nomes.length))
  if (!/^[A-Z]{2}$/.test(uf) || !cidade || !nichos.length) return null
  return { id: txt(a.id, 60) || randomUUID(), uf, cidade, nichos, ativo: a.ativo !== false }
}

export function lerConfig(): AgenteConfig {
  return db.config
}

/** Salva o que veio da tela (só os campos conhecidos, com limites). */
export function salvarConfig(body: Partial<AgenteConfig>): AgenteConfig {
  const atual = db.config
  const b = completarConfig({ ...atual, ...body, negocio: { ...atual.negocio, ...body.negocio }, prospeccao: { ...atual.prospeccao, ...body.prospeccao } })
  const n = b.negocio
  const p = b.prospeccao
  const nova: AgenteConfig = {
    ativo: b.ativo === true,
    modelo: (Object.keys(MODELOS) as Modelo[]).includes(b.modelo) ? b.modelo : atual.modelo,
    negocio: {
      seuNome: txt(n.seuNome, 80),
      empresa: txt(n.empresa, 80),
      apresentacao: txt(n.apresentacao, 600),
      oferta: txt(n.oferta, 6000),
      pagamento: txt(n.pagamento, 1500),
      descontoMax: num(n.descontoMax, 0, 90, 10),
      portfolio: txt(n.portfolio, 2000),
      objecoes: txt(n.objecoes, 6000),
      estilo: txt(n.estilo, 2000),
      regras: txt(n.regras, 3000),
    },
    podeFechar: b.podeFechar !== false,
    avisos: { telefone: formatBrazilPhone(txt(b.avisos.telefone, 30)), relatorio: b.avisos.relatorio !== false },
    prospeccao: {
      ativa: p.ativa === true,
      alvos: (Array.isArray(p.alvos) ? p.alvos : []).slice(0, 50).map(limparAlvo).filter((a): a is Alvo => !!a),
      porDiaInicial: Math.round(num(p.porDiaInicial, 1, 200, 20)),
      porDiaMax: Math.round(num(p.porDiaMax, 1, 300, 50)),
      aumentoSemana: Math.round(num(p.aumentoSemana, 0, 50, 5)),
      soSemSite: p.soSemSite !== false,
      cumprimentarPrimeiro: p.cumprimentarPrimeiro !== false,
      criterios: txt(p.criterios, 2000),
      dias: [...new Set((Array.isArray(p.dias) ? p.dias : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      inicio: horas(p.inicio, 9),
      fim: horas(p.fim, 18),
    },
    respostas: { inicio: horas(b.respostas.inicio, 8), fim: horas(b.respostas.fim, 21) },
    followup: {
      ativo: b.followup.ativo !== false,
      dias: (Array.isArray(b.followup.dias) ? b.followup.dias : []).map((d) => num(d, 0.5, 30, 2)).slice(0, 5),
    },
    responderDisparos: b.responderDisparos !== false,
    limiteDiaUSD: num(b.limiteDiaUSD, 0.1, 100, 3),
  }
  if (nova.avisos.telefone && !isValidBrazilWhatsApp(nova.avisos.telefone)) throw new Error('O número para avisos precisa ter DDD + número.')
  if (nova.prospeccao.fim <= nova.prospeccao.inicio || nova.respostas.fim <= nova.respostas.inicio) throw new Error('O horário de fim precisa ser depois do início.')
  if (nova.ativo && !chaveDe(nova.modelo)) throw new Error(`Coloque a chave da API (${MODELOS[nova.modelo].nome}) antes de ligar o agente.`)
  if (nova.ativo && !nova.negocio.oferta) throw new Error('Preencha "O que você vende" no Treino antes de ligar o agente.')
  if (nova.ativo && !atual.ativo) registrar('aviso', 'Agente ligado')
  if (!nova.ativo && atual.ativo) registrar('aviso', 'Agente desligado')
  if (nova.modelo !== atual.modelo) registrar('aviso', `IA do agente: ${MODELOS[nova.modelo].nome}`)
  db.config = nova
  atualizarChave()
  salvar(true)
  return nova
}

const NOME_PROVEDOR: Record<Provedor, string> = { anthropic: 'do Claude', gemini: 'do Gemini', xai: 'do Grok' }

/** Conecta uma chave. Descobre de quem ela é pelo começo (sk-ant- = Claude, xai- = Grok, outra = Gemini). */
export async function trocarChave(nova: string, provedor?: Provedor) {
  const k = txt(nova, 300)
  const p: Provedor = provedor ?? (k.startsWith('sk-ant-') ? 'anthropic' : k.startsWith('xai-') ? 'xai' : 'gemini')
  try {
    if (p === 'anthropic') {
      if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) throw new Error('Isso não parece uma chave do Claude (ela começa com "sk-ant-").')
      await ia.testarChave(k, provedorDe(db.config.modelo) === 'anthropic' ? db.config.modelo : 'claude-haiku-5-5')
      chaves.anthropic = k
    } else if (p === 'xai') {
      if (!/^xai-[A-Za-z0-9_-]{20,}$/.test(k)) throw new Error('A chave do Grok começa com "xai-" (console.x.ai → API Keys).')
      chaves.xaiModelo = await testarXai(k)
      chaves.xai = k
    } else {
      if (!/^[A-Za-z0-9_.-]{30,}$/.test(k)) throw new Error('Isso não parece uma chave do Gemini (aistudio.google.com/apikey).')
      await testarGemini(k)
      chaves.gemini = k
    }
  } catch (err) {
    throw new Error((err as Error).message)
  }
  gravarChaves(chaves)
  atualizarChave()
  chaveRecusada = false
  db.extra.ultimoErro = null
  registrar('aviso', `Chave ${NOME_PROVEDOR[p]} conectada`)
}

/** Tira a chave da IA escolhida agora (ou a de um provedor). Sem chave para o modelo, o agente desliga. */
export function removerChave(provedor: Provedor = provedorDe(db.config.modelo)) {
  if (provedor === 'anthropic') chaves.anthropic = ''
  else if (provedor === 'xai') chaves.xai = chaves.xaiModelo = ''
  else chaves.gemini = ''
  gravarChaves(chaves)
  atualizarChave()
  if (!chave) db.config.ativo = false
  registrar('aviso', `Chave ${NOME_PROVEDOR[provedor]} removida${chave ? '' : ': agente desligado'}`)
}

/** Qual IA o agente usa e quais chaves estão conectadas (sem mostrar as chaves). */
export function infoIA() {
  const fim = (k: string) => (k ? `…${k.slice(-4)}` : null)
  return {
    modelo: db.config.modelo,
    nome: MODELOS[db.config.modelo].nome,
    provedor: provedorDe(db.config.modelo),
    chaves: { claude: fim(chaves.anthropic), gemini: fim(chaves.gemini), grok: fim(chaves.xai) },
    modeloDoGrok: chaves.xai ? chaves.xaiModelo : null,
    opcoes: Object.entries(MODELOS).map(([id, m]) => ({ id, nome: m.nome })),
  }
}

export function retomar() {
  db.extra.pausadoPorRisco = null
  db.extra.freio = null
  chaveRecusada = false
  registrar('aviso', 'Agente retomado')
}

const resumoConversa = (c: Conversa) => {
  const ultima = c.mensagens.at(-1)
  return {
    id: c.id,
    empresa: c.empresa,
    telefone: c.telefone,
    nicho: c.nicho,
    cidade: c.cidade,
    origem: c.origem,
    estado: c.estado,
    temperatura: c.temperatura,
    resumo: c.resumo,
    total: c.mensagens.length,
    ultima: ultima ? { de: ultima.de, texto: ultima.texto.slice(0, 160), em: ultima.em } : null,
    pendente: c.pendente,
    atualizadaEm: c.atualizadaEm,
  }
}

export function listarConversas() {
  return db.conversas
    .slice()
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
    .slice(0, 500)
    .map(resumoConversa)
}

function achar(id: string): Conversa {
  const c = db.conversas.find((x) => x.id === id)
  if (!c) throw new Error('Conversa não encontrada.')
  return c
}

export function verConversa(id: string) {
  const { ultimaChave: _k, bruto: _b, ...c } = achar(id)
  return c
}

export function assumir(id: string) {
  const c = achar(id)
  c.estado = 'humano'
  c.pendente = false
  registrar('humano', `Você assumiu a conversa com ${c.empresa}`, c.id)
  return verConversa(id)
}

/** Devolve ao agente; se a última mensagem é do cliente, ele responde em instantes. */
export function devolver(id: string) {
  const c = achar(id)
  c.estado = respondeu(c) ? (c.temperatura === 'quente' ? 'quente' : 'conversando') : 'aguardando'
  if (c.mensagens.at(-1)?.de === 'lead') {
    c.pendente = true
    c.responderEm = new Date(Date.now() + 5000).toISOString()
  }
  registrar('aviso', `Conversa com ${c.empresa} devolvida ao agente`, c.id)
  return verConversa(id)
}

/** Você marca o resultado à mão. */
export function marcar(id: string, estadoNovo: Estado) {
  const c = achar(id)
  if (!['perdido', 'fechado', 'reuniao', 'optout', 'humano'].includes(estadoNovo)) throw new Error('Resultado inválido.')
  if (c.estado === estadoNovo) return verConversa(id)
  c.estado = estadoNovo
  c.pendente = false
  if (estadoNovo === 'fechado') {
    hoje().vendas++
    void aprenderCom(c, 'venda fechada')
  }
  if (estadoNovo === 'reuniao') hoje().reunioes++
  if (estadoNovo === 'perdido') void aprenderCom(c, 'o cliente recusou')
  if (estadoNovo === 'optout') db.extra.descartados.push(phoneKey(c.telefone))
  registrar('aviso', `${c.empresa}: marcado como ${estadoNovo}`, c.id)
  return verConversa(id)
}

/** Você responde pela XS (sai pelo WhatsApp do agente) e assume a conversa. */
export async function enviarComoVoce(id: string, texto: string) {
  const c = achar(id)
  const t = txt(texto, 1500)
  if (!t) throw new Error('Escreva a mensagem.')
  if (getWa().status !== 'connected') throw new Error('Conecte o WhatsApp antes.')
  c.pendente = false
  c.estado = c.estado === 'optout' || c.estado === 'fechado' ? c.estado : 'humano'
  await enviar(c, [t], 'voce')
  return verConversa(id)
}

/** 👍/👎 numa mensagem do agente, com o jeito que você teria escrito: vira lição. */
export async function avaliar(id: string, msgId: string, nota: 'bom' | 'ruim', correcao: string) {
  const c = achar(id)
  const i = c.mensagens.findIndex((m) => m.id === msgId)
  if (i < 0 || c.mensagens[i].de !== 'agente') throw new Error('Mensagem não encontrada.')
  if (nota !== 'bom' && nota !== 'ruim') throw new Error('Avaliação inválida.')
  c.mensagens[i].nota = nota
  c.mensagens[i].correcao = txt(correcao, 1500) || undefined
  salvar()
  if (!chave) throw new Error('Coloque a chave da API para o agente aprender com a avaliação.')
  const r = await comIA(() => ia.licaoDaCorrecao(ctx(), c, i, nota, correcao), 'Lição da avaliação')
  return { licao: r?.licao ? guardarLicao('conversa', r.licao, 'correcao') : null, conversa: verConversa(id) }
}

export function listarLicoes() {
  return db.licoes.slice().sort((a, b) => b.em.localeCompare(a.em))
}

export function novaLicao(body: { tipo?: unknown; texto?: unknown }) {
  const tipo = body.tipo === 'busca' ? 'busca' : 'conversa'
  const l = guardarLicao(tipo, txt(body.texto, 400), 'voce')
  if (!l) throw new Error('Escreva a lição.')
  return l
}

export function editarLicao(id: string, body: { texto?: unknown; ativa?: unknown }) {
  const l = db.licoes.find((x) => x.id === id)
  if (!l) throw new Error('Lição não encontrada.')
  if (typeof body.texto === 'string' && body.texto.trim()) l.texto = txt(body.texto, 400)
  if (typeof body.ativa === 'boolean') l.ativa = body.ativa
  salvar()
  return l
}

export function apagarLicao(id: string) {
  db.licoes = db.licoes.filter((l) => l.id !== id)
  salvar()
}

export function listarFila() {
  return db.fila.slice(0, 150).map(({ bruto: _b, ...f }) => f)
}

/** Tira uma empresa da fila (ela não volta). Com motivo, vira critério de busca. */
export async function descartarDaFila(id: string, motivo: string) {
  const i = db.fila.findIndex((f) => f.id === id)
  if (i < 0) throw new Error('Empresa não está mais na fila.')
  const [f] = db.fila.splice(i, 1)
  db.extra.descartados.push(phoneKey(f.telefone))
  salvar()
  if (!txt(motivo, 500) || !chave) return { licao: null }
  const r = await comIA(() => ia.licaoDaBusca(ctx(), f, motivo), 'Critério de busca')
  return { licao: r?.licao ? guardarLicao('busca', r.licao, 'correcao') : null }
}

/** Busca agora (para ver o que viria): numa cidade escolhida ou sorteada. */
export async function buscarAgora(alvoId?: string) {
  const alvo = alvoId ? db.config.prospeccao.alvos.find((a) => a.id === alvoId) : undefined
  if (alvoId && !alvo) throw new Error('Cidade não encontrada em Prospecção.')
  const r = await reabastecer(alvo)
  return { achadas: r.achadas, novas: r.mantidas.length, fila: listarFila() }
}

// ---------------------------------------------------------------------------
// Testes de abordagens e números por ramo
// ---------------------------------------------------------------------------

export interface Numeros {
  abordados: number
  responderam: number
  quentes: number
  reunioes: number
  vendas: number
  pediramParar: number
  /** % que respondeu */
  taxaResposta: number
}

const QUENTE: Estado[] = ['quente', 'reuniao', 'fechado']

/** Contas de um grupo de conversas abordadas pelo agente. */
export function numerosDe(lista: Conversa[]): Numeros {
  const abordados = lista.length
  const responderam = lista.filter(respondeu).length
  return {
    abordados,
    responderam,
    quentes: lista.filter((c) => c.avisadoQuente || QUENTE.includes(c.estado)).length,
    reunioes: lista.filter((c) => c.estado === 'reuniao').length,
    vendas: lista.filter((c) => c.estado === 'fechado').length,
    pediramParar: lista.filter((c) => c.estado === 'optout').length,
    taxaResposta: abordados ? Math.round((responderam / abordados) * 100) : 0,
  }
}

/** Como cada ramo (tipo de negócio) está indo, só com o que o agente abordou. */
export function numerosPorRamo() {
  const grupos = new Map<string, Conversa[]>()
  for (const c of db.conversas) {
    if (c.origem !== 'agente') continue
    const k = c.nicho || 'Sem ramo'
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  return [...grupos.entries()].map(([ramo, lista]) => ({ ramo, ...numerosDe(lista) })).sort((a, b) => b.abordados - a.abordados)
}

/** Quem está ganhando o teste e com que certeza. */
function analiseDoTeste(t: Teste) {
  const deste = db.conversas.filter((c) => c.testeId === t.id)
  return analisarTeste(t.variantes.map((v) => ({ id: v.id, nome: v.nome, ...numerosDe(deste.filter((c) => c.variante === v.id)) })))
}

function verTeste(t: Teste) {
  const deste = db.conversas.filter((c) => c.testeId === t.id)
  return {
    analise: analiseDoTeste(t),
    ...t,
    abordados: deste.length,
    meta: t.porVariante * t.variantes.length,
    variantes: t.variantes.map((v) => ({ ...v, ...numerosDe(deste.filter((c) => c.variante === v.id)) })),
    total: numerosDe(deste),
  }
}

export function listarTestes() {
  return db.testes
    .slice()
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map(verTeste)
}

/** Cria um teste (a prospecção precisa estar ligada para ele rodar). */
export function criarTeste(body: { nome?: unknown; alvo?: Partial<Alvo>; variantes?: { nome?: unknown; angulo?: unknown }[]; porVariante?: unknown }) {
  const alvo = limparAlvo({ ...body.alvo, id: randomUUID(), ativo: true })
  if (!alvo) throw new Error('O teste precisa de cidade, UF e tipos de negócio da busca.')
  const variantes = (Array.isArray(body.variantes) ? body.variantes : [])
    .slice(0, 4)
    .map((v, i) => ({ id: randomUUID().slice(0, 8), nome: txt(v.nome, 60) || String.fromCharCode(65 + i), angulo: txt(v.angulo, 800) }))
    .filter((v) => v.angulo)
  if (variantes.length < 2) throw new Error('O teste precisa de pelo menos 2 abordagens, cada uma com o seu ângulo.')
  const t: Teste = {
    id: randomUUID(),
    nome: txt(body.nome, 80) || `${alvo.nichos.map((n) => n.nome).join(', ')} em ${alvo.cidade}`,
    alvo,
    variantes,
    porVariante: Math.round(num(body.porVariante, 3, 100, 15)),
    estado: 'rodando',
    criadoEm: iso(),
    encerradoEm: null,
    conclusao: '',
  }
  db.testes.push(t)
  registrar('aviso', `Teste criado: "${t.nome}" (${variantes.length} abordagens, ${t.porVariante} empresas cada)`)
  return verTeste(t)
}

export function mudarTeste(id: string, body: { estado?: unknown; conclusao?: unknown }) {
  const t = db.testes.find((x) => x.id === id)
  if (!t) throw new Error('Teste não encontrado.')
  if (body.estado === 'rodando' || body.estado === 'pausado' || body.estado === 'encerrado') {
    t.estado = body.estado
    t.encerradoEm = body.estado === 'encerrado' ? iso() : null
    // Empresas buscadas para o teste que não foram usadas voltam a ser da prospecção normal
    if (body.estado === 'encerrado') for (const f of db.fila) if (f.testeId === t.id) delete f.testeId
  }
  if (typeof body.conclusao === 'string') t.conclusao = txt(body.conclusao, 1500)
  registrar('aviso', `Teste "${t.nome}": ${t.estado}`)
  return verTeste(t)
}

const leadDeTeste = (l: Partial<Conversa> = {}) => ({
  empresa: txt(l.empresa, 120) || 'Pizzaria Bella Massa',
  nicho: txt(l.nicho, 80) || 'Pizzaria',
  cidade: txt(l.cidade, 80) || 'Londrina',
  uf: txt(l.uf, 2) || 'PR',
  endereco: txt(l.endereco, 200),
  site: txt(l.site, 200),
  instagram: txt(l.instagram, 200),
})

function exigirChave() {
  if (!chave) throw new Error('Coloque a chave da API primeiro.')
}

/** Treino: mostra a primeira mensagem que ele mandaria para uma empresa (não envia nada). */
export async function simularAbordagem(lead: Partial<Conversa>) {
  exigirChave()
  const r = await comIA(() => ia.abordagem(ctx(), leadDeTeste(lead)), 'Simulação')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu.')
  return r
}

function mensagensDeTeste(mensagens: { de?: unknown; texto?: unknown }[]): Mensagem[] {
  const agora = Date.now()
  return (Array.isArray(mensagens) ? mensagens : []).slice(-40).map((m, i, all) => ({
    id: String(i),
    de: m.de === 'lead' ? 'lead' : 'agente',
    texto: txt(m.texto, 1500),
    em: new Date(agora - (all.length - i) * 60_000).toISOString(),
  }))
}

/** Treino: você faz o papel do cliente e vê como ele responde (não envia nada). */
export async function simularConversa(lead: Partial<Conversa>, mensagens: { de?: unknown; texto?: unknown }[]) {
  exigirChave()
  const r = await comIA(() => ia.responder(ctx(), { ...leadDeTeste(lead), mensagens: mensagensDeTeste(mensagens), resumo: '' }), 'Simulação')
  if (!r) throw new Error(db.extra.ultimoErro ?? 'A IA não respondeu.')
  return r
}

/** Treino: avaliação de uma resposta do simulador (a mensagem `indice`) vira lição. */
export async function avaliarSimulacao(mensagens: { de?: unknown; texto?: unknown }[], indice: number, nota: 'bom' | 'ruim', correcao: string) {
  exigirChave()
  const msgs = mensagensDeTeste(mensagens)
  const i = Math.trunc(Number(indice))
  if (!(i >= 0 && i < msgs.length) || msgs[i].de !== 'agente') throw new Error('Mensagem não encontrada.')
  if (nota !== 'bom' && nota !== 'ruim') throw new Error('Avaliação inválida.')
  const r = await comIA(() => ia.licaoDaCorrecao(ctx(), { mensagens: msgs }, i, nota, correcao), 'Lição da avaliação')
  return { licao: r?.licao ? guardarLicao('conversa', r.licao, 'correcao') : null }
}

export function atividade() {
  return db.atividade.slice(-200).reverse()
}

// ---------------------------------------------------------------------------
// Sincronização com o CRM (o app leva para os leads quando está aberto)
// ---------------------------------------------------------------------------

export function pendentesSinc() {
  return db.conversas
    .filter((c) => (!c.sinc.lead && !c.leadId) || c.mensagens.length > c.sinc.mensagens || c.estado !== c.sinc.estado)
    .slice(0, 40)
    .map((c) => ({
      id: c.id,
      leadId: c.leadId,
      telefone: c.telefone,
      empresa: c.empresa,
      origem: c.origem,
      bruto: c.leadId ? null : c.bruto,
      estado: c.estado,
      estadoAnterior: c.sinc.estado,
      temperatura: c.temperatura,
      resumo: c.resumo,
      total: c.mensagens.length,
      novas: c.mensagens.slice(c.sinc.mensagens).map(({ de, texto, em }) => ({ de, texto, em })),
    }))
}

export function marcarSinc(itens: { id?: unknown; leadId?: unknown; mensagens?: unknown; estado?: unknown }[]) {
  for (const it of Array.isArray(itens) ? itens : []) {
    const c = db.conversas.find((x) => x.id === it.id)
    if (!c) continue
    if (typeof it.leadId === 'string' && it.leadId) c.leadId = it.leadId
    c.sinc = {
      lead: c.sinc.lead || !!c.leadId,
      mensagens: Math.min(c.mensagens.length, Math.max(c.sinc.mensagens, Number(it.mensagens) || 0)),
      estado: typeof it.estado === 'string' ? (it.estado as Estado) : c.sinc.estado,
    }
  }
  salvar()
}

/** Telefones que já estão no CRM: o agente não aborda (o app manda ao sincronizar). */
export function definirConhecidos(telefones: unknown) {
  const lista = (Array.isArray(telefones) ? telefones : []).map((t) => phoneKey(String(t))).filter((k) => k.length >= 10)
  db.extra.conhecidos = [...new Set(lista)].slice(0, 200_000)
  salvar()
  return { total: db.extra.conhecidos.length }
}
