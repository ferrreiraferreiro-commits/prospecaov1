// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { BASE } from './categoriasBase'

/**
 * Tipos de negócio da busca. Cada um diz o que perguntar ao Google (texto da busca)
 * e quais categorias e pedaços do nome procurar na base aberta (Overture Maps, ver categoriasBase.ts).
 */

export interface Categoria {
  id: string
  nome: string
  grupo: string
  /** Texto da busca no Google */
  google: string
  /** Categorias da base aberta (taxonomia da Overture Maps) */
  base: string[]
  /** Pedaços do nome que também contam na base aberta */
  nomes: string[]
}
const C = (grupo: string, nomeCat: string, google: string): Categoria => ({
  id: nomeCat
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
  nome: nomeCat,
  grupo,
  google,
  base: BASE[nomeCat]?.[0] ?? [],
  nomes: BASE[nomeCat]?.[1] ?? [],
})

const BELEZA = 'Beleza'
const SAUDE = 'Saúde'
const COMIDA = 'Alimentação'
const AUTO = 'Automotivo'
const PETS = 'Pets'
const CASA = 'Casa e construção'
const SERV = 'Serviços'
const EDU = 'Educação'
const ESPORTE = 'Esporte e bem-estar'
const LOJAS = 'Lojas'
const EVENTOS = 'Hospedagem e eventos'

export const CATEGORIAS: Categoria[] = [
  // Beleza
  C(BELEZA, 'Barbearia', 'barbearia'),
  C(BELEZA, 'Salão de beleza', 'salão de beleza'),
  C(BELEZA, 'Clínica de estética', 'clínica de estética'),
  C(BELEZA, 'Manicure e esmalteria', 'esmalteria manicure'),
  C(BELEZA, 'Sobrancelhas e cílios', 'design de sobrancelhas cílios'),
  C(BELEZA, 'Estúdio de tatuagem', 'estúdio de tatuagem'),
  C(BELEZA, 'Depilação', 'depilação'),
  C(BELEZA, 'Loja de cosméticos', 'loja de cosméticos'),

  // Saúde
  C(SAUDE, 'Dentista', 'clínica odontológica dentista'),
  C(SAUDE, 'Clínica médica', 'clínica médica'),
  C(SAUDE, 'Fisioterapia', 'fisioterapia'),
  C(SAUDE, 'Psicólogo', 'psicólogo consultório'),
  C(SAUDE, 'Nutricionista', 'nutricionista'),
  C(SAUDE, 'Fonoaudiologia', 'fonoaudiologia'),
  C(SAUDE, 'Laboratório de exames', 'laboratório de análises clínicas'),
  C(SAUDE, 'Farmácia', 'farmácia'),
  C(SAUDE, 'Ótica', 'ótica'),
  C(SAUDE, 'Clínica veterinária', 'clínica veterinária'),

  // Alimentação
  C(COMIDA, 'Restaurante', 'restaurante'),
  C(COMIDA, 'Pizzaria', 'pizzaria'),
  C(COMIDA, 'Hamburgueria', 'hamburgueria'),
  C(COMIDA, 'Lanchonete', 'lanchonete'),
  C(COMIDA, 'Padaria', 'padaria'),
  C(COMIDA, 'Confeitaria e doceria', 'confeitaria doceria'),
  C(COMIDA, 'Cafeteria', 'cafeteria'),
  C(COMIDA, 'Sorveteria e açaí', 'sorveteria açaí'),
  C(COMIDA, 'Bar', 'bar'),
  C(COMIDA, 'Restaurante japonês', 'restaurante japonês sushi'),
  C(COMIDA, 'Churrascaria', 'churrascaria'),
  C(COMIDA, 'Marmitaria', 'marmitaria marmitex'),
  C(COMIDA, 'Açougue', 'açougue'),
  C(COMIDA, 'Hortifruti', 'hortifruti'),
  C(COMIDA, 'Mercado', 'mercado mercearia'),
  C(COMIDA, 'Distribuidora de bebidas', 'distribuidora de bebidas adega'),

  // Automotivo
  C(AUTO, 'Oficina mecânica', 'oficina mecânica'),
  C(AUTO, 'Auto peças', 'auto peças'),
  C(AUTO, 'Lava-rápido', 'lava rápido estética automotiva'),
  C(AUTO, 'Funilaria e pintura', 'funilaria e pintura automotiva'),
  C(AUTO, 'Borracharia', 'borracharia'),
  C(AUTO, 'Loja de carros', 'loja de carros seminovos'),
  C(AUTO, 'Motos', 'oficina e loja de motos'),
  C(AUTO, 'Autoescola', 'autoescola'),
  C(AUTO, 'Som e acessórios automotivos', 'som automotivo insulfilm'),

  // Pets
  C(PETS, 'Pet shop', 'pet shop'),
  C(PETS, 'Banho e tosa', 'banho e tosa'),
  C(PETS, 'Hotel e creche para cães', 'hotel creche para cachorro'),

  // Casa e construção
  C(CASA, 'Material de construção', 'loja de material de construção'),
  C(CASA, 'Marcenaria', 'marcenaria móveis planejados'),
  C(CASA, 'Vidraçaria', 'vidraçaria'),
  C(CASA, 'Serralheria', 'serralheria'),
  C(CASA, 'Loja de móveis', 'loja de móveis'),
  C(CASA, 'Colchões', 'loja de colchões'),
  C(CASA, 'Eletricista', 'eletricista'),
  C(CASA, 'Encanador', 'encanador desentupidora'),
  C(CASA, 'Ar-condicionado', 'instalação de ar condicionado'),
  C(CASA, 'Dedetizadora', 'dedetizadora'),
  C(CASA, 'Jardinagem e paisagismo', 'jardinagem paisagismo'),
  C(CASA, 'Chaveiro', 'chaveiro'),
  C(CASA, 'Decoração', 'loja de decoração'),

  // Serviços
  C(SERV, 'Advocacia', 'escritório de advocacia'),
  C(SERV, 'Contabilidade', 'escritório de contabilidade'),
  C(SERV, 'Imobiliária', 'imobiliária'),
  C(SERV, 'Arquitetura', 'escritório de arquitetura'),
  C(SERV, 'Engenharia', 'escritório de engenharia'),
  C(SERV, 'Corretora de seguros', 'corretora de seguros'),
  C(SERV, 'Agência de viagens', 'agência de viagens'),
  C(SERV, 'Despachante', 'despachante'),
  C(SERV, 'Gráfica', 'gráfica'),
  C(SERV, 'Fotografia', 'estúdio de fotografia'),
  C(SERV, 'Lavanderia', 'lavanderia'),
  C(SERV, 'Costura e ajustes', 'costureira ajustes de roupa'),
  C(SERV, 'Assistência técnica', 'assistência técnica celular'),

  // Educação
  C(EDU, 'Escola particular', 'escola particular'),
  C(EDU, 'Escola infantil', 'escola de educação infantil'),
  C(EDU, 'Escola de idiomas', 'escola de inglês idiomas'),
  C(EDU, 'Escola de música', 'escola de música'),
  C(EDU, 'Cursos e reforço', 'curso preparatório reforço escolar'),

  // Esporte e bem-estar
  C(ESPORTE, 'Academia', 'academia'),
  C(ESPORTE, 'Pilates', 'estúdio de pilates'),
  C(ESPORTE, 'Crossfit e funcional', 'crossfit treino funcional'),
  C(ESPORTE, 'Artes marciais', 'academia de artes marciais jiu jitsu'),
  C(ESPORTE, 'Yoga', 'yoga'),
  C(ESPORTE, 'Massagem e spa', 'massagem spa'),

  // Lojas
  C(LOJAS, 'Loja de roupas', 'loja de roupas'),
  C(LOJAS, 'Calçados', 'loja de calçados'),
  C(LOJAS, 'Joalheria e relojoaria', 'joalheria relojoaria'),
  C(LOJAS, 'Papelaria', 'papelaria'),
  C(LOJAS, 'Floricultura', 'floricultura'),
  C(LOJAS, 'Celulares', 'loja de celulares'),
  C(LOJAS, 'Informática', 'loja de informática'),
  C(LOJAS, 'Brinquedos', 'loja de brinquedos'),
  C(LOJAS, 'Presentes', 'loja de presentes'),
  C(LOJAS, 'Bicicletaria', 'bicicletaria'),
  C(LOJAS, 'Artigos esportivos', 'loja de artigos esportivos'),
  C(LOJAS, 'Livraria', 'livraria'),
  C(LOJAS, 'Tabacaria', 'tabacaria'),

  // Hospedagem e eventos
  C(EVENTOS, 'Hotel', 'hotel'),
  C(EVENTOS, 'Pousada', 'pousada'),
  C(EVENTOS, 'Salão de festas', 'salão de festas'),
  C(EVENTOS, 'Buffet', 'buffet infantil eventos'),
  C(EVENTOS, 'Artigos para festas', 'loja de artigos para festas'),
]

export const GRUPOS: string[] = [...new Set(CATEGORIAS.map((c) => c.grupo))]

/** Categorias mais pedidas (aparecem primeiro). */
export const POPULARES = ['barbearia', 'salao-de-beleza', 'dentista', 'clinica-de-estetica', 'academia', 'pet-shop', 'oficina-mecanica', 'restaurante', 'pizzaria', 'imobiliaria']

const POR_NOME = new Map(CATEGORIAS.map((c) => [c.nome.toLowerCase(), c]))

/** Acha a categoria pelo nome (ex.: "Barbearia"); texto livre devolve uma categoria só com o nome. */
export function categoriaDe(nicho: string): Categoria {
  const n = nicho.trim()
  return (
    POR_NOME.get(n.toLowerCase()) ?? {
      id: `livre:${n.toLowerCase()}`,
      nome: n,
      grupo: 'Outro',
      google: n,
      base: [],
      nomes: [n],
    }
  )
}
