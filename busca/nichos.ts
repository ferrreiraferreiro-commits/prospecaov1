import { norm } from './lib.ts'

/**
 * Nicho (como o usuário escreve) → atividades da Receita (CNAE).
 * `nome`: quando a Receita não separa o nicho (pizzaria fica em "restaurantes"),
 * filtra também pelo nome fantasia/razão social.
 */
export interface Niche {
  cnaes: string[]
  nome?: RegExp
}

const RESTAURANTES = ['5611201', '5611203', '5620104']

export const NICHES: Record<string, Niche> = {
  BARBEARIA: { cnaes: ['9602501'], nome: /BARB/ },
  'SALAO DE BELEZA': { cnaes: ['9602501', '9602502'] },
  CABELEIREIRO: { cnaes: ['9602501'] },
  MANICURE: { cnaes: ['9602501'] },
  'CLINICA ODONTOLOGICA': { cnaes: ['8630504'] },
  DENTISTA: { cnaes: ['8630504'] },
  ODONTOLOGIA: { cnaes: ['8630504'] },
  'CLINICA DE ESTETICA': { cnaes: ['9602502'] },
  ESTETICA: { cnaes: ['9602502'] },
  ACADEMIA: { cnaes: ['9313100'] },
  'PET SHOP': { cnaes: ['4789004', '9609208'] },
  'BANHO E TOSA': { cnaes: ['9609208'] },
  'CLINICA VETERINARIA': { cnaes: ['7500100'] },
  VETERINARIO: { cnaes: ['7500100'] },
  'OFICINA MECANICA': { cnaes: ['4520001', '4520002', '4520003'] },
  'LAVA JATO': { cnaes: ['4520005'] },
  'LAVA RAPIDO': { cnaes: ['4520005'] },
  RESTAURANTE: { cnaes: ['5611201'] },
  PIZZARIA: { cnaes: RESTAURANTES, nome: /PIZZ/ },
  HAMBURGUERIA: { cnaes: RESTAURANTES, nome: /BURG|LANCH/ },
  LANCHONETE: { cnaes: ['5611203'] },
  'BAR': { cnaes: ['5611204', '5611205'] },
  PADARIA: { cnaes: ['1091102', '4721102'] },
  CONFEITARIA: { cnaes: ['1091102', '4721102'], nome: /CONFEIT|DOCE|BOLO|CAKE/ },
  IMOBILIARIA: { cnaes: ['6821801', '6821802', '6822600'] },
  'CORRETOR DE IMOVEIS': { cnaes: ['6821801', '6821802'] },
  'ESCRITORIO DE ADVOCACIA': { cnaes: ['6911701'] },
  ADVOGADO: { cnaes: ['6911701'] },
  CONTABILIDADE: { cnaes: ['6920601'] },
  CONTADOR: { cnaes: ['6920601'] },
  'LOJA DE ROUPAS': { cnaes: ['4781400'] },
  OTICA: { cnaes: ['4774100'] },
  'AUTO ESCOLA': { cnaes: ['8599601'] },
  AUTOESCOLA: { cnaes: ['8599601'] },
  'ESTUDIO DE TATUAGEM': { cnaes: ['9609206'] },
  TATUAGEM: { cnaes: ['9609206'] },
  FISIOTERAPIA: { cnaes: ['8650004'] },
  PSICOLOGO: { cnaes: ['8650003'] },
  PSICOLOGIA: { cnaes: ['8650003'] },
  NUTRICIONISTA: { cnaes: ['8650002'] },
  'CLINICA MEDICA': { cnaes: ['8630503', '8630502'] },
  FARMACIA: { cnaes: ['4771701', '4771702'] },
  ESCOLA: { cnaes: ['8513900', '8512100', '8511200'] },
  CRECHE: { cnaes: ['8511200', '8512100'] },
  HOTEL: { cnaes: ['5510801'] },
  POUSADA: { cnaes: ['5510801', '5590699'], nome: /POUSAD/ },
  'MATERIAL DE CONSTRUCAO': { cnaes: ['4744001', '4744005', '4744099'] },
  MERCADO: { cnaes: ['4712100', '4711302'] },
  ACOUGUE: { cnaes: ['4722901'] },
  FLORICULTURA: { cnaes: ['4789002'] },
  'LOJA DE CALCADOS': { cnaes: ['4782201'] },
  JOALHERIA: { cnaes: ['4783101'] },
  'ASSISTENCIA TECNICA': { cnaes: ['9511800', '9512600', '9521500'] },
  INFORMATICA: { cnaes: ['4751201', '9511800'] },
  GRAFICA: { cnaes: ['1813001', '1813099'] },
  FOTOGRAFO: { cnaes: ['7420001', '7420004'] },
  BUFFET: { cnaes: ['5620102'] },
  'ENERGIA SOLAR': { cnaes: ['4321500', '4742300'], nome: /SOLAR|ENERG/ },
  'CLINICA DE ACUPUNTURA': { cnaes: ['8690903'] },
}

const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'LOJA', 'CLINICA', 'SERVICOS', 'SERVICO'])

/**
 * Resolve um nicho digitado: primeiro o mapa acima; depois as atividades cujo nome
 * tem todas as palavras; por fim, só o nome da empresa.
 */
export function resolveNiche(label: string, cnaeTable: { cod: string; desc_n: string }[]): Niche {
  const key = norm(label)
  if (NICHES[key]) return NICHES[key]
  // Plural simples: "barbearias" → "BARBEARIA"
  const singular = key.replace(/S\b/g, '')
  if (NICHES[singular]) return NICHES[singular]
  const words = singular.split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
  if (words.length) {
    const hits = cnaeTable.filter((c) => words.every((w) => c.desc_n.includes(w.slice(0, Math.max(4, w.length - 2))))).map((c) => c.cod)
    if (hits.length && hits.length <= 15) return { cnaes: hits }
  }
  // Nada na tabela: procura pelo nome (ex.: "hamburgueria artesanal")
  const word = words.sort((a, b) => b.length - a.length)[0] ?? key
  return { cnaes: [], nome: new RegExp(word.slice(0, Math.max(4, word.length - 1))) }
}
