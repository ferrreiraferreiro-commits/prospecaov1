// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que o agente já sabe antes de qualquer treino: o Método XS (venda consultiva para pequeno negócio
 * brasileiro), as objeções que mais aparecem e um roteiro por ramo. O treino do dono vem por cima.
 */

export const METODO_XS = `## Método XS (como vender para pequeno negócio brasileiro pelo WhatsApp)
1. Abrir: curto, pessoal, com algo concreto da empresa (o ramo, o bairro, a nota no Google) e uma pergunta fácil.
2. Entender antes de oferecer: descubra, uma pergunta por mensagem, como os clientes acham a empresa hoje, quem decide, se o dinheiro existe e se é a hora. Anote o que a pessoa contar.
3. Valor ligado ao que a pessoa disse: nada de lista genérica de benefícios.
4. Proposta simples: o pacote que combina, com um exemplo do mesmo ramo quando houver.
5. Próximo passo: toda mensagem que não encerra a conversa termina com um passo claro e fácil (pergunta ou proposta de horário).
- Leia os sinais: resposta curta e fria pede menos texto e pergunta mais fácil; pergunta sobre preço, prazo ou como funciona é interesse.
- Etiqueta daqui: "bom dia/boa tarde" antes de tudo, chame pelo primeiro nome quando souber, nada de "prezado", "você" por padrão e "senhor/senhora" só se o cliente usar.
- Pagamento do jeito daqui: Pix à vista, entrada e saldo, parcelamento no cartão (só o que estiver no material).
- Respeite o tempo da pessoa: dono de pequeno negócio responde entre um cliente e outro.`

export const OBJECOES_BR: { nome: string; resposta: string }[] = [
  { nome: 'Tá caro', resposta: 'Entenda o porquê antes de baixar preço. Compare com o valor de um cliente novo por mês. Se puder, ofereça uma condição dentro do limite (entrada e saldo, parcelado). Sem pressão.' },
  { nome: 'Vou ver com meu sócio / minha esposa', resposta: 'Ótimo sinal: respeite. Ofereça um resumo curto para a pessoa mostrar e combine quando retomar.' },
  { nome: 'Me chama mês que vem', resposta: 'Combine o dia ("posso te chamar dia 5?") e anote como retorno combinado. Não insista agora.' },
  { nome: 'Já tenho Instagram', resposta: 'Concorde que é ótimo. O site soma: aparece no Google quando procuram o ramo na cidade, passa confiança e não depende do algoritmo.' },
  { nome: 'Meu sobrinho faz', resposta: 'Sem desmerecer ninguém. Pergunte se já está no ar e se aparece no Google. Fale do que vem junto (domínio, ajustes, suporte), só o que estiver no material.' },
  { nome: 'Quanto fica no Pix?', resposta: 'Responda direto com o valor à vista do material e emende uma pergunta.' },
  { nome: 'Parcela no cartão?', resposta: 'Só as condições do material. Se não houver, diga que vai confirmar com o dono.' },
  { nome: 'Manda um áudio', resposta: 'Diga com gentileza que por aqui você responde por escrito e que o dono pode ligar se a pessoa preferir (chame o dono).' },
  { nome: 'Manda por e-mail / manda as informações', resposta: 'Mande aqui mesmo um resumo curto e uma pergunta.' },
  { nome: 'Não tenho interesse', resposta: 'Agradeça e respeite. No máximo uma pergunta leve do porquê; no segundo não, encerre.' },
  { nome: 'Agora não, estou atendendo', resposta: 'Peça desculpa pelo horário e pergunte qual é a melhor hora para falar.' },
  { nome: 'Isso é golpe?', resposta: 'Diga com calma quem é, de onde veio o contato (Google Maps) e que não pede nenhum dado pessoal. Ofereça o portfólio e o dono para falar.' },
]

export interface Roteiro {
  ramo: string
  dor: string
  argumento: string
  abertura: string
  horario: string
  cuidado: string
}

const R = (ramo: string, padrao: RegExp, dor: string, argumento: string, abertura: string, horario: string, cuidado: string) => ({ padrao, roteiro: { ramo, dor, argumento, abertura, horario, cuidado } })

/** Roteiros por ramo: o primeiro padrão que bate com o tipo de negócio vale. */
const ROTEIROS = [
  R('Beleza', /barbear|sal[aã]o|cabele|est[eé]tic|manicure|unha|sobrancelha|depila|maquia|spa\b|massag|lash|c[ií]lio/i, 'Horário vago e cliente que some; agenda no papel ou no WhatsApp lotado.', 'Página com serviços, preços e um botão que leva direto para o WhatsApp de agendamento; aparece em "barbearia perto de mim".', 'Pergunte como os clientes marcam horário hoje.', 'Manhã (antes das 10 h) ou início da tarde; evite sábado.', 'Fotos de trabalhos vendem mais que texto.'),
  R('Saúde', /dentist|odonto|cl[ií]nica|m[eé]dic|fisio|psic[oó]log|nutri|fono|pediatr|dermat|ortop|laborat|terapeut|quiropra/i, 'Paciente novo escolhe pela confiança e pela avaliação no Google.', 'Site passa credibilidade, explica tratamentos e leva para o agendamento; fortalece a busca local.', 'Pergunte como os pacientes novos chegam hoje.', 'Entre 8 h e 10 h ou depois das 17 h.', 'Nada de promessa de resultado de tratamento.'),
  R('Alimentação', /pizza|restaurante|lanche|hamburg|burger|a[cç]a[ií]|padaria|marmit|churrasc|sushi|japon|pastel|sorvet|doce|confeit|caf[eé]|bar\b|boteco|espetinho|esfiha|cervej|food|delivery/i, 'Taxa alta dos aplicativos de entrega e cardápio espalhado em fotos.', 'Cardápio online com pedido direto no WhatsApp, sem taxa por pedido; aparece quando procuram o prato na cidade.', 'Pergunte se recebem pedido pelo WhatsApp ou só por aplicativo.', 'Entre 14 h e 17 h (fora do almoço e do jantar).', 'Nunca aborde no horário de pico.'),
  R('Automotivo', /oficina|mec[aâ]nic|auto ?pe[cç]|funilar|pintura autom|lava ?(r[aá]pido|jato|car)|borrachar|auto ?el[eé]tric|insulfilm|som automotivo|guincho|centro automotivo/i, 'Cliente desconfiado de oficina e que procura no Google na hora do problema.', 'Site com serviços, fotos da oficina e avaliações gera confiança e pedidos de orçamento pelo WhatsApp.', 'Pergunte como os clientes novos acham a oficina.', 'Manhã cedo ou fim da tarde.', 'Fale de orçamento e confiança, não de "design".'),
  R('Pets', /pet|veterin|banho e tosa|canil|adestr|agropecu/i, 'Tutor procura banho e tosa perto de casa e quer ver o lugar antes.', 'Site com serviços, fotos e agendamento pelo WhatsApp; aparece em "pet shop perto de mim".', 'Pergunte como marcam banho e tosa hoje.', 'Meio da manhã ou meio da tarde.', 'Fotos dos pets atendidos ajudam muito.'),
  R('Fitness', /academia|crossfit|pilates|personal|est[uú]dio|funcional|muay|jiu|luta|dan[cç]a|yoga|nata[cç][aã]o/i, 'Aluno novo compara planos e quer aula experimental.', 'Página com planos, horários e botão de aula experimental no WhatsApp.', 'Pergunte como o aluno novo conhece a academia hoje.', 'Entre 10 h e 16 h (fora dos horários de treino).', 'Planos e preços do cliente só se ele contar.'),
  R('Imóveis', /imobili|corretor|im[oó]ve|condom[ií]nio|loteament/i, 'Imóveis espalhados em portais que cobram caro.', 'Vitrine própria de imóveis com contato direto, sem depender só de portal.', 'Pergunte onde anunciam os imóveis hoje.', 'Manhã ou depois das 14 h.', 'Fale de captação de clientes, não de beleza do site.'),
  R('Serviços profissionais', /advoga|contab|contador|consultor|arquitet|engenh|despachant|seguro|corretora|tradu|assessoria|marketing/i, 'Cliente escolhe por autoridade e indicação.', 'Site que mostra especialidades e passa autoridade; recebe contatos qualificados.', 'Pergunte de onde vem a maioria dos clientes hoje.', 'Horário comercial, evite segunda cedo.', 'Linguagem um pouco mais formal.'),
  R('Casa e construção', /constru|material de constr|marcen|vidra[cç]|eletricist|encanad|pedreir|reforma|pintor|serralh|gesso|piso|telha|ar condicionado|climatiza|dedetiz|jardinag|piscina|m[oó]veis planejados|limpeza/i, 'Orçamento perdido porque o cliente não vê trabalhos anteriores.', 'Site com portfólio de obras e pedido de orçamento direto no WhatsApp.', 'Pergunte como mostram os trabalhos já feitos.', 'Fim da tarde (durante o dia estão em obra).', 'Fotos de antes e depois vendem.'),
  R('Educação', /escola|curso|idioma|ingl[eê]s|refor[cç]o|creche|faculdade|autoescola|m[uú]sica|inform[aá]tica/i, 'Matrícula decidida pela comparação e pela confiança dos pais.', 'Site com cursos, turmas e matrícula pelo WhatsApp.', 'Pergunte como funciona a matrícula hoje.', 'Manhã ou início da tarde.', 'Fale com quem decide (direção, coordenação).'),
  R('Varejo', /loja|moda|roupa|cal[cç]ad|boutique|[oó]tica|presente|papelaria|cosm[eé]tic|perfum|joalh|bijou|brinquedo|eletr[oô]nic|celular|inform[aá]tica|floricult|farm[aá]cia/i, 'Vende só para quem passa na porta ou segue no Instagram.', 'Catálogo online com pedido pelo WhatsApp; aparece quando procuram o produto na cidade.', 'Pergunte se já vendem pelo WhatsApp.', 'Meio da manhã ou meio da tarde, evite sábado.', 'Fale de vender mais, não de ter um site bonito.'),
  R('Hospedagem e eventos', /hotel|pousada|hostel|chal[eé]|buffet|festa|evento|fot[oó]graf|decora[cç]|cerimonial|dj\b|sal[aã]o de festa/i, 'Comissão alta de plataformas e cliente que quer ver o espaço.', 'Site com fotos, pacotes e reserva ou orçamento direto, sem comissão.', 'Pergunte como chegam as reservas ou orçamentos hoje.', 'Durante a semana, horário comercial.', 'Fotos de qualidade são o centro.'),
]

const GERAL: Roteiro = {
  ramo: 'Geral',
  dor: 'Cliente que procura no Google e não acha a empresa.',
  argumento: 'Site simples que aparece na busca da cidade, passa confiança e leva o contato para o WhatsApp.',
  abertura: 'Pergunte como os clientes novos acham a empresa hoje.',
  horario: 'Meio da manhã ou meio da tarde.',
  cuidado: 'Ligue o valor ao que a pessoa contar.',
}

/** O roteiro do ramo de um tipo de negócio. */
export function roteiroDe(nicho: string): Roteiro {
  return ROTEIROS.find((r) => r.padrao.test(nicho ?? ''))?.roteiro ?? GERAL
}

export const TODOS_ROTEIROS: Roteiro[] = [...ROTEIROS.map((r) => r.roteiro), GERAL]

/** Bloco do roteiro do ramo para as instruções, com o que ele aprendeu sobre esse ramo. */
export function blocoRoteiro(nicho: string, aprendido: string[] = [], numeros = ''): string {
  if (!nicho) return ''
  const r = roteiroDe(nicho)
  return `\n## Roteiro do ramo (${r.ramo})
- Dor típica: ${r.dor}
- O que costuma funcionar: ${r.argumento}
- Boa pergunta para abrir: ${r.abertura}
- Cuidado: ${r.cuidado}${numeros ? `\n- Números reais deste ramo: ${numeros}` : ''}${aprendido.length ? `\n- Aprendido com as suas conversas neste ramo:\n${aprendido.map((a) => `  - ${a}`).join('\n')}` : ''}\n`
}

export const TONS = {
  caloroso: { nome: 'Próximo e caloroso', texto: 'Conversa como gente, puxa assunto, tranquiliza. Bom para quem vende no dia a dia.' },
  objetivo: { nome: 'Objetivo e cordial', texto: 'Vai direto ao ponto sem ser seco, e sempre indica o próximo passo.' },
  curto: { nome: 'Curto e prático', texto: 'Frases curtas, pergunta só o essencial e chama uma pessoa cedo.' },
} as const
