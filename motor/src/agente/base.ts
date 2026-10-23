// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O que ele consulta antes de responder: os materiais do dono quebrados em trechos e uma busca simples
 * por palavras (sem acento, com peso maior para as palavras raras). Puro, sem disco.
 */
import type { AgenteConfig, Material } from './tipos.js'

export interface Trecho {
  materialId: string
  titulo: string
  tipo: Material['tipo']
  texto: string
}

/** Tabela de preços com mais de 90 dias não vale para preço (pede para você confirmar). */
export const DIAS_PRECO_VELHO = 90

export const TIPO_MATERIAL: Record<Material['tipo'], string> = {
  precos: 'Preços e pacotes',
  faq: 'Perguntas frequentes',
  portfolio: 'Portfólio',
  politica: 'Política (prazo, garantia, hospedagem, alterações)',
  contrato: 'Contrato',
  pagamento: 'Pagamento',
  outro: 'Outro',
}

const PARADAS = new Set(
  'que para com uma por mais como mas dos das nos nas num numa ele ela isso esse essa este esta aqui voce voces vcs tem ter sao foi ser seu sua seus suas meu minha nao sim pra pro tambem muito qual quais quando onde quem ate sobre entre depois antes ainda ja so bem tudo todo toda cada'.split(' '),
)

const termos = (t: string) =>
  (
    String(t ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? []
  )
    .filter((p) => !PARADAS.has(p))
    // "precos", "preco" e "precinho" contam igual
    .map((p) => (p.length > 5 ? p.slice(0, 5) : p))

/** Os materiais de verdade mais o treino antigo (oferta, pagamento, portfólio, objeções) como materiais. */
export function materiaisComTreino(materiais: Material[], cfg: Pick<AgenteConfig, 'negocio'>): Material[] {
  const n = cfg.negocio
  const antigo = (id: string, titulo: string, tipo: Material['tipo'], texto: string): Material[] => (texto.trim() ? [{ id, titulo, tipo, texto, ativo: true, atualizadoEm: '' }] : [])
  return [
    ...antigo('treino-oferta', 'O que você vende', 'precos', n.oferta),
    ...antigo('treino-pagamento', 'Pagamento', 'pagamento', n.pagamento),
    ...antigo('treino-portfolio', 'Portfólio', 'portfolio', n.portfolio),
    ...antigo('treino-objecoes', 'Objeções e respostas', 'faq', n.objecoes),
    ...materiais.filter((m) => m.ativo),
  ]
}

/** Quebra um material em trechos de até ~700 caracteres, por parágrafo. */
export function trechosDe(m: Material): Trecho[] {
  const partes = m.texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const out: Trecho[] = []
  let atual = ''
  for (const p of partes) {
    if (atual && (atual + '\n\n' + p).length > 700) {
      out.push({ materialId: m.id, titulo: m.titulo, tipo: m.tipo, texto: atual })
      atual = p
    } else atual = atual ? `${atual}\n\n${p}` : p
  }
  if (atual) out.push({ materialId: m.id, titulo: m.titulo, tipo: m.tipo, texto: atual.slice(0, 1500) })
  return out
}

/** Os trechos que mais combinam com a pergunta (preços sempre entram quando o assunto é dinheiro). */
export function buscarTrechos(materiais: Material[], consulta: string, n = 5): Trecho[] {
  const todos = materiais.flatMap(trechosDe)
  if (!todos.length) return []
  const docs = todos.map((t) => new Set(termos(`${t.titulo} ${t.texto}`)))
  const df = new Map<string, number>()
  for (const d of docs) for (const p of d) df.set(p, (df.get(p) ?? 0) + 1)
  const q = [...new Set(termos(consulta))]
  const notas = todos.map((t, i) => {
    let s = 0
    for (const p of q) if (docs[i].has(p)) s += Math.log(1 + todos.length / (df.get(p) ?? 1))
    return { t, s }
  })
  const dinheiro = /pre[cç]o|valor|quanto|custa|pix|pag|parcel|desconto|caro|barato|or[cç]amento/i.test(consulta)
  const escolhidos = notas
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t)
  if (dinheiro)
    for (const t of todos)
      if ((t.tipo === 'precos' || t.tipo === 'pagamento') && !escolhidos.includes(t) && escolhidos.length < n + 2) escolhidos.push(t)
  return escolhidos
}

/** Material de preço velho (mais de 90 dias sem atualizar)? */
export function precoVelho(m: Material, agora = new Date()): boolean {
  return m.tipo === 'precos' && !!m.atualizadoEm && agora.getTime() - Date.parse(m.atualizadoEm) > DIAS_PRECO_VELHO * 86_400_000
}

/** Todo o texto que vale para conferir preço, prazo, links e promessas (sem tabela de preço velha). */
export function textoDoMaterial(materiais: Material[], agora = new Date()): string {
  return materiais
    .filter((m) => !precoVelho(m, agora))
    .map((m) => `${m.titulo}\n${m.texto}`)
    .join('\n\n')
}

/** Passo a passo da base vazia: o que mais falta, na ordem. */
export function proximosPassos(materiais: Material[]): { tipo: Material['tipo']; texto: string; feito: boolean }[] {
  const tem = (t: Material['tipo']) => materiais.some((m) => m.ativo && m.tipo === t && m.texto.trim())
  return [
    { tipo: 'precos', texto: 'Preços e pacotes: o que vem em cada um e o prazo', feito: tem('precos') },
    { tipo: 'faq', texto: 'As 5 perguntas que mais se repetem e as suas respostas', feito: tem('faq') },
    { tipo: 'portfolio', texto: 'Portfólio: links de sites que você já fez, por ramo', feito: tem('portfolio') },
    { tipo: 'politica', texto: 'Política: prazo, garantia, hospedagem, domínio, alterações', feito: tem('politica') },
    { tipo: 'pagamento', texto: 'Pagamento: Pix, entrada e saldo, parcelamento', feito: tem('pagamento') },
  ]
}
