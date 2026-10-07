// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import type { ConversaAberta, ConversasApi, ListaConversas, MensagemConversa, Recibo } from './conversas'

/**
 * Demonstração da tela Conversas para o modo local (sem login): empresas e números fictícios.
 * Responder funciona: a mensagem vai de "enviada" a "lida" e, às vezes, chega uma resposta.
 */

interface ConversaDemo {
  telefone: string
  nome: string
  naoLidas: number
  msgs: MensagemConversa[]
}

let seq = 0
const id = () => `demo-${++seq}`
const minAtras = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

function m(deMim: boolean, texto: string, min: number, status: Recibo | null = deMim ? 'read' : null, midia: string | null = null): MensagemConversa {
  return { id: id(), deMim, texto, midia, em: minAtras(min), status }
}

const conversas: ConversaDemo[] = [
  {
    telefone: '5543999120481',
    nome: 'Rafael · Barbearia Dom Corte',
    naoLidas: 2,
    msgs: [
      m(true, 'Boa tarde, tudo certo? Vi a Barbearia Dom Corte no Google Maps, com ótimas avaliações, mas sem site. Posso te mandar uma ideia de como ficaria?', 190),
      m(false, 'Boa tarde! Pode mandar sim', 152),
      m(true, 'Show! Montei um exemplo rápido com agendamento online e as fotos do Instagram de vocês. Quer que eu te mostre numa ligação de 10 minutos?', 148),
      m(false, '', 9, null, 'Áudio'),
      m(false, 'Amanhã depois das 14h pode ser? Quanto fica mais ou menos?', 8),
    ],
  },
  {
    telefone: '5543998347712',
    nome: 'Clínica Sorriso Pleno',
    naoLidas: 1,
    msgs: [
      m(true, 'Bom dia! Trabalho com criação de sites para clínicas aqui de Londrina. Vi que vocês ainda não têm site. Posso te mandar um exemplo?', 60 * 26),
      m(false, 'Bom dia. Quem cuida disso é a Dra. Paula, vou passar pra ela', 60 * 25),
      m(true, 'Perfeito, obrigado! Fico no aguardo', 60 * 25 - 3),
      m(false, 'Ela pediu pra você mandar o portfólio por aqui', 34),
    ],
  },
  {
    telefone: '5543991580236',
    nome: 'Pet Shop Amigo Fiel',
    naoLidas: 0,
    msgs: [
      m(true, 'Oi, tudo bem? Vi o Pet Shop Amigo Fiel no Maps. Vocês já pensaram em ter um site com banho e tosa agendado online?', 60 * 5),
      m(false, '', 60 * 4, null, 'Foto'),
      m(false, 'Esse é o nosso cartão, tem o Instagram ali. Já temos um site antigo mas ninguém mexe', 60 * 4 - 1),
      m(true, 'Entendi! Dá pra aproveitar o domínio e deixar tudo novo, rápido no celular. Te mando 2 modelos ainda hoje', 60 * 4 - 6, 'delivered'),
    ],
  },
  {
    telefone: '5543996642019',
    nome: 'Doceria Bom Bocado',
    naoLidas: 0,
    msgs: [
      m(true, 'Boa noite! Vi a Doceria Bom Bocado no Google Maps. Posso te mandar uma ideia de site com cardápio e pedidos pelo WhatsApp?', 60 * 50),
      m(false, 'Agora não, obrigada', 60 * 49),
      m(true, 'Sem problema! Se mudar de ideia, é só chamar 😊', 60 * 49 - 2),
    ],
  },
  {
    telefone: '5543988201775',
    nome: 'Oficina Motors Centro',
    naoLidas: 0,
    msgs: [m(true, 'Bom dia, tudo bem? Vi a oficina no Google Maps e montei uma ideia de site para vocês aparecerem mais nas buscas. Posso te mostrar?', 60 * 72 + 30, 'delivered')],
  },
]

let versao = 1

function resumo(c: ConversaDemo) {
  const ultima = c.msgs[c.msgs.length - 1] ?? null
  return { telefone: c.telefone, nome: c.nome, naoLidas: c.naoLidas, atualizadaEm: ultima?.em ?? new Date(0).toISOString(), ultima }
}

function achar(tel: string) {
  return conversas.find((c) => c.telefone === tel)
}

const RESPOSTAS = ['Pode mandar sim 👍', 'Legal, vou dar uma olhada e te falo', 'Quanto custa mais ou menos?', 'Show, manda o exemplo']

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const conversasDemo: ConversasApi = {
  demo: true,
  async listar(): Promise<ListaConversas> {
    return { versao, conversas: conversas.map(resumo).sort((a, b) => Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm)) }
  },
  async abrir(tel): Promise<ConversaAberta> {
    const c = achar(tel)
    return { versao, telefone: tel, nome: c?.nome ?? null, naoLidas: c?.naoLidas ?? 0, msgs: c ? c.msgs.map((x) => ({ ...x })) : [] }
  },
  async enviar(tel, texto) {
    await pausa(350)
    let c = achar(tel)
    if (!c) {
      c = { telefone: tel, nome: '', naoLidas: 0, msgs: [] }
      conversas.push(c)
    }
    const msg: MensagemConversa = { id: id(), deMim: true, texto: texto.trim(), midia: null, em: new Date().toISOString(), status: 'accepted' }
    c.msgs.push(msg)
    c.naoLidas = 0
    versao++
    const conversa = c
    // Tiques: entregue e lida; às vezes a pessoa responde
    setTimeout(() => ((msg.status = 'delivered'), versao++), 1200)
    setTimeout(() => ((msg.status = 'read'), versao++), 3000)
    if (Math.random() < 0.6) {
      setTimeout(() => {
        conversa.msgs.push({ id: id(), deMim: false, texto: RESPOSTAS[seq % RESPOSTAS.length], midia: null, em: new Date().toISOString(), status: null })
        conversa.naoLidas++
        versao++
      }, 5500)
    }
    return { ...msg }
  },
  async marcarLidas(tel) {
    const c = achar(tel)
    if (c && c.naoLidas) {
      c.naoLidas = 0
      versao++
    }
  },
}
