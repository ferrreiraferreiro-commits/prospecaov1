// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que o agente pode fazer: cada coisa é uma capacidade com um nível de risco, agrupada em pacotes.
 * O pacote liga várias de uma vez; capacidade irreversível só liga uma a uma (o pacote não liga por você).
 */
import type { AgenteConfig } from './tipos.js'

export type Risco = 'le' | 'crm' | 'mensagem' | 'irreversivel'

export interface Capacidade {
  id: string
  /** Como aparece em "Ele já vem sabendo" */
  nome: string
  pacote: string
  risco: Risco
  descricao: string
  /** Ligada quando você nunca mexeu nela */
  padrao: boolean
}

export interface Pacote {
  id: string
  nome: string
  descricao: string
}

export const PACOTES: Pacote[] = [
  { id: 'prospectar', nome: 'Prospectar sozinho', descricao: 'Acha empresas no Google Maps, escolhe as que combinam e manda a primeira mensagem, devagar.' },
  { id: 'conversar', nome: 'Conversar e qualificar', descricao: 'Responde, consulta o seu material, anota o que o cliente conta e chama você quando precisa.' },
  { id: 'nao_perder', nome: 'Não perder o cliente', descricao: 'Retoma no dia combinado, insiste com jeito em quem sumiu e chama de novo leads parados.' },
  { id: 'agendar', nome: 'Agendar', descricao: 'Vê os seus horários livres, marca, confirma na véspera e registra se a pessoa veio.' },
  { id: 'fechar', nome: 'Fechar venda', descricao: 'Passa preço, negocia dentro do limite, manda o Pix e pede o contrato.' },
  { id: 'pos_venda', nome: 'Pós-venda', descricao: 'Agradece, pede depoimento quando o site vai ao ar e pede indicação.' },
  { id: 'aprender', nome: 'Aprender e evoluir', descricao: 'Reflete sobre as conversas, propõe lições e testes e avisa o que falta no seu material.' },
]

const c = (pacote: string, id: string, nome: string, risco: Risco, descricao: string, padrao = true): Capacidade => ({ id, nome, pacote, risco, descricao, padrao })

export const CAPACIDADES: Capacidade[] = [
  c('prospectar', 'buscar_maps', 'Buscar empresas no Google Maps', 'le', 'Usa a sua chave do Google e a sua cota grátis.'),
  c('prospectar', 'nota_encaixe', 'Dar nota de encaixe para cada empresa', 'le', 'Sem site, celular, boas avaliações: quem combina mais vai primeiro.'),
  c('prospectar', 'cumprimentar', 'Mandar o cumprimento ("Oi, boa tarde!")', 'mensagem', 'Frase pronta e variada, sem IA e sem custo.'),
  c('prospectar', 'apresentar', 'Mandar a apresentação escrita para a empresa', 'mensagem', 'Depois da resposta ou de 2 h sem resposta.'),
  c('prospectar', 'criar_lead', 'Criar o lead no CRM', 'crm', 'Quem ele aborda vira lead, com a conversa no histórico.'),
  c('conversar', 'responder', 'Responder quem escreveu', 'mensagem', 'No horário de respostas.'),
  c('conversar', 'consultar_base', 'Consultar o seu material antes de responder', 'le', 'E citar de onde tirou.'),
  c('conversar', 'anotar_fatos', 'Anotar dado que o cliente informou', 'crm', 'Nome, quem decide, a dor, o orçamento, quando retomar.'),
  c('conversar', 'mover_funil', 'Mudar a temperatura e o status do lead', 'crm', 'Quente, reunião, perdido.'),
  c('conversar', 'chamar_voce', 'Chamar você quando precisar', 'le', 'Quando pedem uma pessoa ou ele não sabe responder.'),
  c('nao_perder', 'retorno_combinado', 'Retomar no dia combinado', 'mensagem', '"Me chama mês que vem": ele chama.'),
  c('nao_perder', 'followup', 'Insistir com jeito em quem sumiu', 'mensagem', 'Nos dias que você escolher em Prospecção.'),
  c('nao_perder', 'reativar_antigos', 'Chamar de novo leads parados no CRM', 'mensagem', 'Leads interessados que ficaram sem conversa.', false),
  c('nao_perder', 'lembrar_voce', 'Lembrar você de quem espera resposta', 'le', 'No seu outro número.'),
  c('agendar', 'ver_horarios', 'Ver os horários livres na agenda', 'le', 'Os horários que você liberou em Ajustes.', false),
  c('agendar', 'marcar_reuniao', 'Marcar conversa com você', 'crm', 'Só num horário livre de verdade.', false),
  c('agendar', 'confirmar_vespera', 'Confirmar na véspera', 'mensagem', 'Uma mensagem curta no dia anterior.', false),
  c('fechar', 'passar_preco', 'Passar preço e condições', 'mensagem', 'Só os preços do seu material.'),
  c('fechar', 'negociar', 'Negociar dentro do desconto máximo', 'mensagem', 'Nunca além do limite que você deu.'),
  c('fechar', 'mandar_portfolio', 'Mandar sites do portfólio', 'mensagem', 'Só os links cadastrados.'),
  c('fechar', 'mandar_pix', 'Mandar a chave Pix', 'irreversivel', 'Só a chave cadastrada em Pagamento.', false),
  c('fechar', 'pedir_contrato', 'Pedir o contrato para você mandar', 'irreversivel', 'Ele avisa você para gerar e mandar o contrato.', false),
  c('fechar', 'marcar_resultado', 'Encerrar o negócio como ganho ou perdido', 'irreversivel', 'Fecha a oportunidade no CRM dizendo por quê.', false),
  c('pos_venda', 'agradecer', 'Agradecer depois da venda', 'mensagem', 'Uma mensagem curta no dia seguinte.', false),
  c('pos_venda', 'pedir_depoimento', 'Pedir depoimento', 'mensagem', 'Nos dias que você escolher em Ajustes.', false),
  c('pos_venda', 'pedir_indicacao', 'Pedir indicação', 'mensagem', 'Indicação é o cliente mais barato que existe.', false),
  c('aprender', 'refletir', 'Refletir sobre as conversas à noite', 'le', 'O Professor lê o dia e escreve o que deu certo e errado.'),
  c('aprender', 'propor_licao', 'Propor lições para o Caderno', 'le', 'Você aprova antes de valer.'),
  c('aprender', 'sugerir_teste', 'Sugerir testes de abordagem', 'le', 'Quando um ramo tem volume e nenhum teste.'),
  c('aprender', 'avisar_lacuna', 'Avisar o que falta no seu material', 'le', 'Pergunta que se repete e o material não responde.'),
]

const POR_ID = new Map(CAPACIDADES.map((x) => [x.id, x]))

/** A capacidade está ligada? (o que você nunca mexeu segue o padrão) */
export function pode(cfg: Pick<AgenteConfig, 'capacidades'>, id: string): boolean {
  const cap = POR_ID.get(id)
  if (!cap) return false
  const v = cfg.capacidades?.[id]
  return typeof v === 'boolean' ? v : cap.padrao
}

/** Liga ou desliga um pacote: as irreversíveis ficam como estão. */
export function ligarPacote(atual: Record<string, boolean>, pacote: string, ligado: boolean): Record<string, boolean> {
  const novo = { ...atual }
  for (const cap of CAPACIDADES) if (cap.pacote === pacote && cap.risco !== 'irreversivel') novo[cap.id] = ligado
  return novo
}

/** Só aceita ids conhecidos e valores sim/não. */
export function limparCapacidades(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!v || typeof v !== 'object') return out
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (POR_ID.has(k) && typeof x === 'boolean') out[k] = x
  return out
}

/** Para a tela: cada pacote com quantas capacidades estão ligadas. */
export function resumoPacotes(cfg: Pick<AgenteConfig, 'capacidades'>) {
  return PACOTES.map((p) => {
    const caps = CAPACIDADES.filter((x) => x.pacote === p.id)
    const ligadas = caps.filter((x) => pode(cfg, x.id)).length
    return { ...p, total: caps.length, ligadas, capacidades: caps.map((x) => ({ ...x, ligada: pode(cfg, x.id) })) }
  })
}

/** "Ele já vem sabendo": as capacidades ligadas, em frases de gente. */
export function jaVemSabendo(cfg: Pick<AgenteConfig, 'capacidades'>): string[] {
  return CAPACIDADES.filter((x) => pode(cfg, x.id)).map((x) => x.nome)
}
