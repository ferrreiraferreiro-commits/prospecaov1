// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O Conferente: antes de cada mensagem sair, o sistema confere, nesta ordem. A primeira conferência
 * que barra interrompe as outras e devolve o motivo para o agente reescrever. Tudo aqui é regra pura
 * (sem WhatsApp e sem IA); a conferência de promessas pode pedir uma segunda opinião à IA (agente.ts).
 */
import { pediuParaParar, recusou } from './regras.js'
import type { Mensagem, Piloto } from './tipos.js'

export interface Conferencia {
  id: string
  titulo: string
  oQueFaz: string
  /** Por que não tem interruptor (ou o limite que você ajusta) */
  porque: string
  fixa: boolean
  tipo: 'regra' | 'ia'
}

/** A lista que aparece na tela, na ordem em que roda. */
export const CONFERENCIAS: Conferencia[] = [
  { id: 'parar', titulo: 'Respeitar quem pediu para parar', oQueFaz: 'Se a pessoa disse "para de mandar", "me tira da lista", "SAIR" ou parecido, nada sai para ela.', porque: 'Quem pediu para parar tem o direito de ser deixado em paz, e insistir é o que mais bloqueia número.', fixa: true, tipo: 'regra' },
  { id: 'lgpd', titulo: 'Dados apagados e base legal', oQueFaz: 'Contato apagado a pedido ou na sua lista de bloqueio não recebe mensagem.', porque: 'É exigência da LGPD: escrever para quem foi apagado desfaz o apagamento.', fixa: true, tipo: 'regra' },
  { id: 'horario', titulo: 'Horário e dia certos', oQueFaz: 'Nunca entre 21 h e 8 h. Abordagem e follow-up também não saem em feriado nacional nem no horário de pico de restaurante.', porque: 'Você escolhe os horários dentro desse limite. Mensagem de vendedor de madrugada é motivo de denúncia.', fixa: true, tipo: 'regra' },
  { id: 'ritmo', titulo: 'Ritmo de envio e saúde do número', oQueFaz: 'Cota do dia, intervalo entre abordagens, limite de mensagens por conversa e freio quando muita gente pede para parar.', porque: 'É o que impede o número de ser bloqueado, e o número é o seu negócio.', fixa: true, tipo: 'regra' },
  { id: 'repetido', titulo: 'Nada de texto repetido', oQueFaz: 'Compara com o que já saiu para todo mundo e com a própria conversa. Frase quase igual é barrada.', porque: 'Texto idêntico em massa é o gatilho de spam do WhatsApp.', fixa: true, tipo: 'regra' },
  { id: 'formato', titulo: 'Jeito de WhatsApp', oQueFaz: 'Sem asterisco, lista, título ou link encurtado; bolha dentro do tamanho máximo; no máximo 3 bolhas e 1 emoji por bolha.', porque: 'Formatação de robô denuncia o robô e derruba a resposta.', fixa: true, tipo: 'regra' },
  { id: 'bastidor', titulo: 'Não falar a nossa língua com o cliente', oQueFaz: 'Barra nome de ferramenta, código de erro, "modelo de linguagem" e pedaços das instruções.', porque: 'Vazamento de bastidor queima a conversa na hora.', fixa: true, tipo: 'regra' },
  { id: 'preco', titulo: 'Preço, prazo e desconto só do material', oQueFaz: 'Todo valor em R$, porcentagem ou prazo precisa estar no seu material ou dentro do desconto máximo.', porque: 'Preço inventado vira prejuízo ou briga, e quem paga é você.', fixa: true, tipo: 'regra' },
  { id: 'promessa', titulo: 'Promessas conferidas', oQueFaz: '"Fica em primeiro no Google", "dobra suas vendas", "garantia de 1 ano": sem fonte no material, não sai.', porque: 'Promessa sem lastro é propaganda enganosa (Código de Defesa do Consumidor).', fixa: true, tipo: 'regra' },
  { id: 'link', titulo: 'Link só da lista permitida', oQueFaz: 'Só sai link do portfólio, do pagamento e dos que você cadastrou.', porque: 'Link inventado vai para página que não existe ou para um golpe.', fixa: true, tipo: 'regra' },
  { id: 'pessoa', titulo: 'Não prometer pessoa que não foi chamada', oQueFaz: '"Vou pedir para o responsável te ligar" só sai se ele chamou você de verdade nesta resposta.', porque: 'O cliente fica esperando uma ligação que ninguém sabe que precisa fazer.', fixa: true, tipo: 'regra' },
  { id: 'agenda', titulo: 'Não prometer agenda sem olhar a agenda', oQueFaz: 'Dia e hora só saem se ele consultou os horários livres e o horário está livre.', porque: 'Horário prometido e ocupado é cliente perdido.', fixa: true, tipo: 'regra' },
  { id: 'sensivel', titulo: 'Não pedir o que não deve', oQueFaz: 'Nunca pede CPF, senha, cartão ou código. Pix só com a capacidade ligada e só a chave cadastrada.', porque: 'É o padrão de golpe que o brasileiro aprendeu a temer.', fixa: true, tipo: 'regra' },
  { id: 'robo', titulo: 'Nunca mentir se perguntam se é robô', oQueFaz: 'Escrevendo como você, ele não responde essa pergunta: para e passa a conversa para você responder. Como assistente, diz que é o assistente virtual.', porque: 'Mentir para o cliente queima o seu nome; quem decide o que dizer é você.', fixa: true, tipo: 'regra' },
  { id: 'insistir', titulo: 'Não insistir depois de um não', oQueFaz: 'Depois de uma recusa clara, cabe uma pergunta leve. No segundo não, a conversa encerra.', porque: 'Insistência gera denúncia e mancha o seu nome.', fixa: true, tipo: 'regra' },
  { id: 'robo_robo', titulo: 'Parar conversa de robô com robô', oQueFaz: 'Atendente automático do outro lado ou mensagens se repetindo: ele para e marca para você.', porque: 'Dois robôs conversando gastam dinheiro e mandam dezenas de mensagens.', fixa: true, tipo: 'regra' },
  { id: 'proibidos', titulo: 'Assuntos proibidos', oQueFaz: 'Política, falar mal de concorrente e os temas que você escrever.', porque: 'Você liga ou desliga.', fixa: false, tipo: 'regra' },
  { id: 'tom', titulo: 'Revisor de tom', oQueFaz: 'Uma IA barata lê a mensagem e responde: soa como gente?', porque: 'Você liga ou desliga. Custa +1 consulta por mensagem.', fixa: false, tipo: 'ia' },
]

export const TITULO = new Map(CONFERENCIAS.map((x) => [x.id, x.titulo]))

export interface Rascunho {
  mensagens: string[]
  acao: string
  /** Horários que o agente recebeu como livres nesta resposta (vazio = não consultou a agenda) */
  horariosOferecidos?: string[]
}

export interface ContextoConferencia {
  agora: Date
  mensagens: Pick<Mensagem, 'de' | 'texto' | 'auto' | 'em'>[]
  estado: string
  /** Mensagem que ele mesmo puxa (abordagem, follow-up, reativação, pós-venda), não resposta */
  proativa: boolean
  /** Número na lista de bloqueio ou apagado a pedido */
  bloqueado: boolean
  /** Motivo de ritmo que barra (null = ok) */
  ritmo: string | null
  /** Ramo da empresa (horário de pico de comida) */
  nicho: string
  /** Últimos textos enviados para outras pessoas */
  enviadosOutros: string[]
  maxBolha: number
  /** Tudo o que o material diz (oferta, preços, pagamento, portfólio, políticas) */
  material: string
  descontoMax: number
  linksPermitidos: string[]
  podePreco: boolean
  podePix: boolean
  /** Nome do dono (para "vou pedir pro Gabriel te ligar") */
  dono: string
  /** Escreve como o próprio dono (não se apresenta como assistente) */
  comoDono?: boolean
  proibidos: string[] | null
}

export type Resultado = { ok: true; passou: string[] } | { ok: false; id: string; titulo: string; motivo: string; passou: string[] }

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

export const normal = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Feriados nacionais (fixos + Sexta-feira Santa). */
export function feriadoNacional(d: Date): boolean {
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].includes(md)) return true
  const pascoa = domingoDePascoa(d.getFullYear())
  const sexta = new Date(pascoa)
  sexta.setDate(pascoa.getDate() - 2)
  return sexta.getMonth() === d.getMonth() && sexta.getDate() === d.getDate()
}

function domingoDePascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

const RAMO_COMIDA = /restaurante|pizzaria|pizza|lanchonete|lanche|hamburgu|burger|\bbar\b|boteco|padaria|a[cç]a[ií]|sorveteria|marmit|churrascaria|cafeteria|delivery|pastelaria|sushi|japones|espetinho|esfiha|esfirra|confeitaria|doceria|cervejaria|choperia/i

/** Palavras (3+ letras) de um texto, sem acento. */
function palavras(t: string): string[] {
  return normal(t).match(/[a-z0-9]{3,}/g) ?? []
}

/** Parecença entre dois textos (0 a 1), por pares de palavras. */
export function parecenca(a: string, b: string): number {
  const pares = (t: string) => {
    const p = palavras(t)
    const s = new Set<string>()
    for (let i = 0; i < p.length - 1; i++) s.add(`${p[i]} ${p[i + 1]}`)
    if (p.length === 1) s.add(p[0])
    return s
  }
  const x = pares(a)
  const y = pares(b)
  if (!x.size || !y.size) return 0
  let comum = 0
  for (const v of x) if (y.has(v)) comum++
  return comum / Math.min(x.size, y.size)
}

const EMOJI = /\p{Extended_Pictographic}/gu
const ENCURTADOR = /\b(bit\.ly|tinyurl\.com|cutt\.ly|t\.co|goo\.gl|is\.gd|ow\.ly|rebrand\.ly|encurtador\.com\.br|shorturl\.at)\b/i
const URL = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com\.br|com|net|net\.br|org|org\.br|app|site|online|store|io|me|link|vercel\.app)(?:\/[^\s<>"')]*)?)/gi

/** Links de um texto, só o "domínio/caminho" sem protocolo e sem barra no fim. */
export function linksDe(t: string): string[] {
  const s = String(t ?? '')
  // O domínio de um e-mail (pix@empresa.com.br) não é link
  return [...s.matchAll(URL)].filter((m) => s[(m.index ?? 0) - 1] !== '@').map((m) => m[0]).map((u) =>
    u
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/[.,;:!?]+$/, '')
      .replace(/\/+$/, '')
      .toLowerCase(),
  )
}

/** Valores em reais de um texto, em centavos. */
export function valoresEmReais(t: string): number[] {
  const out: number[] = []
  const re = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?|(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s?(?:reais|conto|pila)\b|(\d+(?:,\d+)?)\s?mil\s?reais/gi
  for (const m of String(t ?? '').matchAll(re)) {
    if (m[5]) {
      out.push(Math.round(Number(m[5].replace(',', '.')) * 1000 * 100))
      continue
    }
    const inteiro = (m[1] ?? m[3] ?? '').replace(/\./g, '')
    const cent = m[2] ?? m[4] ?? '00'
    if (inteiro) out.push(Number(inteiro) * 100 + Number(cent))
  }
  return out
}

/** Porcentagens de um texto. */
export function porcentagens(t: string): number[] {
  return [...String(t ?? '').matchAll(/(\d{1,3}(?:,\d+)?)\s?(?:%|por\s?cento)/gi)].map((m) => Number(m[1].replace(',', '.')))
}

/** Prazos ("7 dias", "2 semanas", "48 horas") de um texto, normalizados. */
export function prazos(t: string): string[] {
  return [...normal(t).matchAll(/(\d{1,3})\s?(dias?|semanas?|meses|mes|horas?)\b(\s?uteis)?/g)].map((m) => `${Number(m[1])} ${m[2].replace(/s$/, '').replace('mese', 'mes')}`)
}

const PIX_CHAVE = /\b(?:[\w.+-]+@[\w-]+\.[\w.]+|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi

/** Chaves Pix (e-mail, CPF, CNPJ, telefone, aleatória) de um texto, só dígitos/letras. */
export function chavesPix(t: string): string[] {
  return (String(t ?? '').match(PIX_CHAVE) ?? []).map((k) => k.toLowerCase().replace(/[^a-z0-9@.]/g, ''))
}

const BASTIDOR =
  /\b(chamar_dono|venda_fechada|reuniao_marcada|marcar_reuniao|pedir_contrato|aviso_dono|optout|temperatura|acao|json|prompt|system|instru[cç](ao|oes) do sistema|modelo de linguagem|language model|large language|llm|token|anthropic|openai|chatgpt|gemini|claude|undefined|null|nan|\[object)\b|\{\{|\}\}|erro\s?(4|5)\d\d\b|stack trace|traceback/i

const PESSOA = (dono: string) =>
  new RegExp(
    `vou (pedir|chamar|avisar|passar|falar com|acionar)[^.?!]{0,40}(respons[aá]vel|dono|gerente|especialista|equipe|time|atendente|algu[eé]m${dono ? `|${dono.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ''})|(ele|ela|algu[eé]m|nossa equipe|o respons[aá]vel)\\s+(vai|ir[aá]|j[aá] vai)\\s+(te |lhe )?(ligar|chamar|retornar|entrar em contato|falar com voc)`,
    'i',
  )

const HORA_MARCADA = /\b(\d{1,2})\s?(?:h|:\d{2}|horas)\b/gi
const FALA_DE_AGENDA = /(tenho|temos|tem)\s+(um\s+)?hor[aá]rio|hor[aá]rio\s+(livre|dispon[ií]vel)|(agendei|marquei|est[aá] marcad[oa]|fica marcad[oa]|confirmad[oa] para)|\b(amanh[aã]|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)\b[^.?!]{0,25}\b\d{1,2}\s?(h|:\d{2})/i

const SENSIVEL = /(manda|mande|envia|envie|informa|informe|passa|passe|digita|digite|qual [eé]|preciso d[oe])[^.?!]{0,30}\b(cpf|senha|n[uú]mero do cart[aã]o|cart[aã]o de cr[eé]dito|cvv|c[oó]digo de (verifica[cç][aã]o|seguran[cç]a)|c[oó]digo que (chegou|recebeu))/i

const PERGUNTOU_ROBO = /\b(e|eh|é|vc e|voce e|vc é|você é|to falando com|tô falando com|isso e|isso é|falo com)\s+(um\s+|uma\s+)?(robo|robô|bot|ia\b|inteligencia artificial|inteligência artificial|maquina|máquina|atendente virtual|atendimento automatico|automático|automatico|pessoa de verdade|humano)|\b(robo|robô|bot)\s*\?/i
const NEGA_ROBO = /n[aã]o sou (um |uma )?(rob[oô]|bot|ia|m[aá]quina|intelig[eê]ncia artificial|assistente virtual)|sou (um |uma )?(humano|humana|pessoa de verdade|pessoa real)|sou de verdade/i
const ADMITE = /assistente|virtual|\bia\b|intelig[eê]ncia artificial|autom[aá]tic|rob[oô]|\bbot\b/i

const PROMESSA = /(garant(o|imos|ia|ido|ida)|primeir[oa] (lugar|p[aá]gina|resultado)|topo do google|1[ºo°] (lugar|no google)|dobr(a|ar|o) (as |suas |seu )?(vendas|clientes|faturamento)|triplic|resultado garantido|100\s?% (garantido|seguro)|sem (nenhum )?risco|vital[ií]ci[oa]|para sempre|nunca (sai|cai) do ar)/i

const MENU_ROBO = /(digite|escolha|selecione|responda com)\s+(o n[uú]mero|uma das op[cç][oõ]es|a op[cç][aã]o|\d)|\b1\s?[-–).]\s?\w+[\s\S]{0,80}\b2\s?[-–).]\s?\w+/i

const POLITICA = /\b(bolsonaro|lula|pt\b|psdb|pl\b|elei[cç][aã]o|eleitoral|partido|esquerdista|direitista|comunista|petista|bolsonarista)\b/i
const FALA_MAL = /(concorr[eê]ncia|concorrente|outr[oa]s? (empresas?|ag[eê]ncias?))[^.?!]{0,40}\b(p[eé]ssim|ruim|lixo|golp|enganad|amador|porcaria)/i

const ultimaDoCliente = (ms: ContextoConferencia['mensagens']) => ms.filter((m) => m.de === 'lead' && !m.auto).at(-1)

// ---------------------------------------------------------------------------
// As conferências
// ---------------------------------------------------------------------------

type Check = (r: Rascunho, c: ContextoConferencia) => string | null

const CHECKS: [string, Check][] = [
  [
    'parar',
    (_r, c) => (c.estado === 'optout' || c.mensagens.some((m) => m.de === 'lead' && pediuParaParar(m.texto)) ? 'A pessoa pediu para não receber mais mensagens. Não mande nada para ela.' : null),
  ],
  ['lgpd', (_r, c) => (c.bloqueado ? 'Este contato está apagado a pedido ou na lista de bloqueio. Nada pode sair para ele.' : null)],
  [
    'horario',
    (_r, c) => {
      const h = c.agora.getHours()
      if (h >= 21 || h < 8) return 'Agora é fora do horário (entre 21 h e 8 h). Espere o horário abrir.'
      if (c.proativa && feriadoNacional(c.agora)) return 'Hoje é feriado nacional: abordagem e follow-up esperam o próximo dia útil.'
      const hm = h + c.agora.getMinutes() / 60
      if (c.proativa && RAMO_COMIDA.test(c.nicho) && ((hm >= 11.5 && hm < 14) || (hm >= 18.5 && hm < 21))) return 'É horário de pico de restaurante: espere o movimento passar.'
      return null
    },
  ],
  ['ritmo', (_r, c) => c.ritmo],
  [
    'repetido',
    (r, c) => {
      const nossas = c.mensagens.filter((m) => m.de !== 'lead').map((m) => m.texto)
      for (const t of r.mensagens) {
        if (t.length >= 30 && c.enviadosOutros.some((o) => parecenca(t, o) >= 0.8)) return `A mensagem "${t.slice(0, 60)}…" está quase igual a uma que já saiu para outra pessoa. Escreva do zero, com algo desta empresa.`
        if (t.length >= 20 && nossas.some((o) => parecenca(t, o) >= 0.85)) return `A mensagem "${t.slice(0, 60)}…" repete o que já foi dito nesta conversa. Diga algo novo ou mais curto.`
      }
      return null
    },
  ],
  [
    'formato',
    (r, c) => {
      if (r.mensagens.length > 3) return 'Mande no máximo 3 bolhas.'
      for (const t of r.mensagens) {
        if (t.length > c.maxBolha) return `Uma bolha passou de ${c.maxBolha} caracteres. Corte e divida em mensagens curtas.`
        if (/\*\*?[^*\n]+\*\*?|__[^_]+__|^#{1,6}\s|^\s*[-•]\s|^\s*\d+[.)]\s.+\n\s*\d+[.)]\s|```/m.test(t)) return 'Tire a formatação (asterisco, título, lista). Escreva como gente escreve no WhatsApp.'
        if (ENCURTADOR.test(t)) return 'Não use link encurtado.'
        if ((t.match(EMOJI) ?? []).length > 1) return 'No máximo 1 emoji por bolha.'
      }
      return null
    },
  ],
  ['bastidor', (r) => (r.mensagens.some((t) => BASTIDOR.test(t)) ? 'A mensagem tem palavra de bastidor (nome de ferramenta, sistema, código ou "modelo de linguagem"). Escreva só para o cliente.' : null)],
  [
    'preco',
    (r, c) => {
      const texto = r.mensagens.join('\n')
      const valores = valoresEmReais(texto)
      if (valores.length && !c.podePreco) return 'Você não pode passar preço. Diga que vai confirmar os valores com o dono e chame-o.'
      const doMaterial = new Set(valoresEmReais(c.material))
      const fora = valores.filter((v) => !doMaterial.has(v))
      if (fora.length) {
        // Desconto dentro do limite sobre um preço do material também vale
        const ok = fora.every((v) => [...doMaterial].some((p) => v < p && v >= p * (1 - c.descontoMax / 100) - 1))
        if (!ok) return `O valor R$ ${(fora[0] / 100).toFixed(2).replace('.', ',')} não está no material (nem dentro do desconto máximo de ${c.descontoMax}%). Use só os preços do material.`
      }
      const pcts = porcentagens(texto)
      const pctMaterial = new Set(porcentagens(c.material))
      const pctFora = pcts.find((p) => p > c.descontoMax && !pctMaterial.has(p))
      if (pctFora !== undefined) return `${pctFora}% passa do desconto máximo (${c.descontoMax}%). Não ofereça mais que isso.`
      const prazosMat = new Set(prazos(c.material))
      const prazoFora = prazos(texto).find((p) => !prazosMat.has(p))
      if (prazoFora && /entreg|pront|fica pronto|no ar|prazo|leva/i.test(texto)) return `O prazo "${prazoFora}" não está no material. Use só os prazos do material ou diga que vai confirmar.`
      return null
    },
  ],
  [
    'promessa',
    (r, c) => {
      const t = r.mensagens.join('\n')
      const m = t.match(PROMESSA)
      if (!m) return null
      const termo = normal(m[0]).split(/\s+/)[0].slice(0, 6)
      return normal(c.material).includes(termo) ? null : `"${m[0]}" é uma promessa que o material não sustenta. Tire a promessa ou fale só do que está no material.`
    },
  ],
  [
    'link',
    (r, c) => {
      const permitidos = c.linksPermitidos.map((l) => l.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase())
      const fora = linksDe(r.mensagens.join('\n')).find((l) => !permitidos.some((p) => p && (l === p || l.startsWith(`${p}/`) || p.startsWith(`${l}/`))))
      return fora ? `O link "${fora}" não está na lista permitida (portfólio, pagamento ou os links que o dono cadastrou). Tire o link.` : null
    },
  ],
  ['pessoa', (r, c) => (r.acao !== 'chamar_dono' && r.mensagens.some((t) => PESSOA(c.dono).test(t)) ? 'Você prometeu que alguém vai falar com o cliente, mas não chamou o dono. Use a ação de chamar o dono ou tire a promessa.' : null)],
  [
    'agenda',
    (r) => {
      const t = r.mensagens.join('\n')
      if (!FALA_DE_AGENDA.test(t)) return null
      const livres = r.horariosOferecidos ?? []
      if (!livres.length) return 'Você falou de horário marcado sem consultar a agenda. Pergunte qual período é melhor para a pessoa e chame o dono, sem prometer dia e hora.'
      const horas = [...t.matchAll(HORA_MARCADA)].map((m) => Number(m[1]))
      const horasLivres = new Set(livres.map((l) => Number((l.match(/(\d{1,2})[:h]/) ?? [])[1])))
      const fora = horas.find((h) => !horasLivres.has(h))
      return fora !== undefined ? `${fora} h não está entre os horários livres. Ofereça só: ${livres.join('; ')}.` : null
    },
  ],
  [
    'sensivel',
    (r, c) => {
      const t = r.mensagens.join('\n')
      if (SENSIVEL.test(t)) return 'Nunca peça CPF, senha, cartão ou código. Tire esse pedido.'
      const chaves = /pix/i.test(t) ? chavesPix(t) : []
      if (!chaves.length) return null
      if (!c.podePix) return 'Você não pode mandar chave Pix. Diga que o dono vai mandar os dados de pagamento e chame-o.'
      const doMaterial = new Set(chavesPix(c.material))
      return chaves.some((k) => !doMaterial.has(k)) ? 'Essa chave Pix não é a cadastrada em Pagamento. Use só a chave cadastrada.' : null
    },
  ],
  [
    'robo',
    (r, c) => {
      const t = r.mensagens.join('\n')
      const ultima = ultimaDoCliente(c.mensagens)
      const perguntou = !!ultima && PERGUNTOU_ROBO.test(ultima.texto)
      // Escrevendo como o dono: quem responde se é robô é o próprio dono, nunca a IA (nem negando, nem fingindo)
      if (c.comoDono) {
        if (NEGA_ROBO.test(t)) return 'Você não pode dizer que não é robô. Não mande nada e chame o dono.'
        return perguntou && (r.mensagens.length || r.acao !== 'chamar_dono') ? 'O cliente perguntou se é robô. Quem responde é o dono: não mande nada e chame o dono.' : null
      }
      if (NEGA_ROBO.test(t)) return 'Você negou ser um assistente. Não pode: diga que é o assistente virtual e que pode chamar o dono.'
      if (perguntou && r.mensagens.length && !ADMITE.test(t)) return 'O cliente perguntou se é robô. Responda com a verdade: você é o assistente virtual e pode chamar o dono.'
      return null
    },
  ],
  [
    'insistir',
    (r, c) => {
      const reais = c.mensagens.filter((m) => m.de === 'lead' && !m.auto)
      const ultima = reais.at(-1)
      if (!ultima || !recusou(ultima.texto) || !r.mensagens.length) return null
      const naos = reais.filter((m) => recusou(m.texto)).length
      if (naos >= 2) return r.acao === 'perdido' && r.mensagens.length <= 1 && !r.mensagens.join('').includes('?') ? null : 'É o segundo não. Agradeça em uma frase, sem pergunta, e encerre a conversa como perdida.'
      if (r.mensagens.length > 1) return 'Depois de um não, mande no máximo uma bolha curta (uma pergunta leve do porquê ou um agradecimento).'
      return null
    },
  ],
  [
    'robo_robo',
    (_r, c) => {
      const doCliente = c.mensagens.filter((m) => m.de === 'lead').slice(-4)
      if (doCliente.length >= 3 && doCliente.slice(-3).every((m, _i, a) => parecenca(m.texto, a[0].texto) >= 0.9)) return 'O outro lado está mandando a mesma mensagem de novo: parece um robô. Pare e chame o dono.'
      const ultima = c.mensagens.filter((m) => m.de === 'lead').at(-1)
      if (ultima && !ultima.auto && MENU_ROBO.test(ultima.texto) && c.mensagens.filter((m) => m.de === 'lead' && MENU_ROBO.test(m.texto)).length >= 2) return 'O outro lado é um atendimento automático com menu. Pare e chame o dono.'
      return null
    },
  ],
  [
    'proibidos',
    (r, c) => {
      if (!c.proibidos) return null
      const t = r.mensagens.join('\n')
      if (POLITICA.test(t)) return 'Não fale de política.'
      if (FALA_MAL.test(t)) return 'Não fale mal de concorrente.'
      const tema = c.proibidos.find((p) => p.length >= 3 && normal(t).includes(normal(p)))
      return tema ? `"${tema}" é um assunto proibido pelo dono.` : null
    },
  ],
]

/** Roda as conferências em ordem; a primeira que barra para tudo. */
export function conferir(r: Rascunho, c: ContextoConferencia): Resultado {
  const passou: string[] = []
  for (const [id, fn] of CHECKS) {
    const motivo = fn(r, c)
    if (motivo) return { ok: false, id, titulo: TITULO.get(id) ?? id, motivo, passou }
    passou.push(id)
  }
  return { ok: true, passou }
}

/** Só as conferências legais (você editou a mensagem: o resto é responsabilidade sua). */
export function conferirLegal(r: Rascunho, c: ContextoConferencia): Resultado {
  const passou: string[] = []
  for (const [id, fn] of CHECKS.filter(([id]) => id === 'parar' || id === 'lgpd' || id === 'horario')) {
    const motivo = fn(r, { ...c, proativa: false })
    if (motivo) return { ok: false, id, titulo: TITULO.get(id) ?? id, motivo, passou }
    passou.push(id)
  }
  return { ok: true, passou }
}

// ---------------------------------------------------------------------------
// Antes de o assistente ler
// ---------------------------------------------------------------------------

const MANIPULACAO =
  /(ignor[ea]|esque[cç]a|desconsider[ea])\s+(todas?\s+)?(as\s+|suas\s+)?(instru[cç][oõ]es|regras|ordens|o que (te )?disseram)|voc[eê] agora [eé]|a partir de agora (voc[eê]|vc) ([eé]|vai ser)|modo (desenvolvedor|developer|dan|deus)|jailbreak|system prompt|prompt do sistema|finja (que|ser)|fa[cç]a de conta que (voc[eê]|vc) [eé]|me (d[eê]|passa|mostre?) (o seu|seu|as suas|suas) (prompt|instru[cç][oõ]es|regras)|repita (tudo|as instru)|\[(system|sistema|admin)\]|<\/?(system|instru)/i

/** Tentativa de fazer o assistente ignorar as instruções (regra, sem custo). */
export function pareceManipulacao(texto: string): boolean {
  return MANIPULACAO.test(String(texto ?? ''))
}

// ---------------------------------------------------------------------------
// Níveis de piloto
// ---------------------------------------------------------------------------

const FALA_DINHEIRO = /R\$|\breais\b|%|\bpix\b|desconto|parcel|entrada de/i

/** A mensagem pronta precisa da sua aprovação antes de sair, neste nível? */
export function precisaAprovacao(piloto: Piloto, r: Rascunho): string | null {
  if (piloto <= 1) return 'Modo Rascunho: toda mensagem espera você.'
  const t = r.mensagens.join('\n')
  const fechamento = ['venda_fechada', 'pedir_contrato'].includes(r.acao) || chavesPix(t).length > 0
  if (piloto === 2) {
    if (fechamento || FALA_DINHEIRO.test(t)) return 'Copiloto: preço, desconto e pagamento esperam você.'
    if (FALA_DE_AGENDA.test(t) || ['marcar_reuniao', 'reuniao_marcada'].includes(r.acao)) return 'Copiloto: agenda espera você.'
    return null
  }
  if (piloto === 3 && fechamento) return 'Piloto: fechar a venda espera você.'
  return null
}

/** O que falta para subir de nível (a XS sugere, você sobe). */
export function requisitosNivel(nivel: Piloto, d: { notaProva: number | null; conversasSemBarrar: number; vendasOuReunioes: number; podeFechar: boolean }): string[] {
  const faltam: string[] = []
  if (nivel >= 3) {
    const minimo = nivel === 4 ? 90 : 85
    if (d.notaProva === null || d.notaProva < minimo) faltam.push(`Passar na prova do Laboratório com nota ${minimo} ou mais (última: ${d.notaProva ?? 'nenhuma'}).`)
  }
  if (nivel === 4) {
    if (!d.podeFechar) faltam.push('Ligar as capacidades "Mandar a chave Pix" ou "Pedir o contrato" no pacote Fechar venda.')
  }
  return faltam
}
