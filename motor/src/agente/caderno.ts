// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * O Caderno: a memória do negócio em notas Markdown no formato do Obsidian (frontmatter + [[links]]).
 * Sai como lista de arquivos ou .zip; o que você edita no Obsidian volta como proposta.
 */
import { OBJECOES_BR, TODOS_ROTEIROS, TONS } from './metodo.js'
import { calcularPadroes, NOME_FAIXA } from './padroes.js'
import type { Licao } from './tipos.js'
import type { AgenteIA } from './adaptador.js'

export interface Arquivo {
  caminho: string
  conteudo: string
}

const limpo = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '').trim().slice(0, 80) || 'sem título'
const front = (o: Record<string, unknown>) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v ?? ''}`).join('\n')}\n---\n`

/** Todas as notas do Caderno (sem telefone nem dado de cliente). */
export function arquivosDoCaderno(a: AgenteIA): Arquivo[] {
  const cfg = a.cfg
  const out: Arquivo[] = []
  const pad = calcularPadroes(a.d.conversas)
  const ativas = a.d.licoes.filter((l) => l.status !== 'arquivada')
  out.push({
    caminho: 'Início.md',
    conteudo: `# Caderno do vendedor\n\nNível de piloto: ${cfg.piloto} · Jeito: ${TONS[cfg.persona.tom].nome} · Lições valendo: ${ativas.filter((l) => l.ativa).length}\n\nResposta geral: ${pad.total.taxa}% (${pad.total.abordados} conversas)${pad.melhorHora !== null ? ` · melhor hora: ${pad.melhorHora}h` : ''}\n\n- [[Persona]]\n- [[Regras da casa]]\n- Pastas: Ramos, Objeções, Lições, Funciona, Não funciona, Erros, Base, Diário\n`,
  })
  out.push({ caminho: 'Persona.md', conteudo: `${front({ tipo: 'persona' })}# ${cfg.persona.nome}\n\n${TONS[cfg.persona.tom].texto}\n\n## Jeito de falar\n${cfg.negocio.estilo || '(vazio)'}\n` })
  out.push({ caminho: 'Regras da casa.md', conteudo: `${front({ tipo: 'regras' })}# Regras da casa\n\n${cfg.persona.regrasCasa || '(vazio)'}\n\n## Regras extras\n${cfg.negocio.regras || '(vazio)'}\n` })
  for (const r of TODOS_ROTEIROS) {
    const doRamo = ativas.filter((l) => l.escopo?.toLowerCase().startsWith(`ramo:${r.ramo.toLowerCase()}`))
    const nums = pad.porRamo.filter((x) => r.ramo === 'Geral' || x.ramo.toLowerCase().includes(r.ramo.toLowerCase().slice(0, 5)))
    out.push({
      caminho: `Ramos/${limpo(r.ramo)}.md`,
      conteudo: `${front({ tipo: 'ramo' })}# ${r.ramo}\n\n- Dor: ${r.dor}\n- Funciona: ${r.argumento}\n- Abrir com: ${r.abertura}\n- Horário: ${r.horario}\n- Cuidado: ${r.cuidado}\n${nums.length ? `\n## Números\n${nums.map((x) => `- ${x.ramo}: ${x.taxa}% de ${x.abordados}${x.melhorFaixa ? `, melhor de ${NOME_FAIXA[x.melhorFaixa]}` : ''}`).join('\n')}\n` : ''}${doRamo.length ? `\n## Lições\n${doRamo.map((l) => `- [[Lições/${limpo(l.titulo || l.texto)}]]`).join('\n')}\n` : ''}`,
    })
  }
  for (const o of OBJECOES_BR) out.push({ caminho: `Objeções/${limpo(o.nome)}.md`, conteudo: `${front({ tipo: 'objecao' })}# ${o.nome}\n\n${o.resposta}\n` })
  for (const l of ativas) out.push({ caminho: `Lições/${limpo(l.titulo || l.texto)}.md`, conteudo: notaDeLicao(l) })
  for (const [dia, d] of Object.entries(a.d.diario)) {
    out.push({ caminho: `Diário/${dia}.md`, conteudo: `${front({ tipo: 'diario', dia })}# ${dia}\n\n${d.resumo}\n\n## Funcionou\n${d.funcionou.map((x) => `- ${x}`).join('\n') || '-'}\n\n## Não funcionou\n${d.naoFuncionou.map((x) => `- ${x}`).join('\n') || '-'}\n\n## Erros\n${d.erros.map((x) => `- ${x}`).join('\n') || '-'}\n` })
    d.funcionou.forEach((x, i) => out.push({ caminho: `Funciona/${dia} ${i + 1}.md`, conteudo: `${front({ tipo: 'funciona', dia })}${x}\n\nVer [[Diário/${dia}]].\n` }))
    d.naoFuncionou.forEach((x, i) => out.push({ caminho: `Não funciona/${dia} ${i + 1}.md`, conteudo: `${front({ tipo: 'nao_funciona', dia })}${x}\n\nVer [[Diário/${dia}]].\n` }))
    d.erros.forEach((x, i) => out.push({ caminho: `Erros/${dia} ${i + 1}.md`, conteudo: `${front({ tipo: 'erro', dia })}${x}\n\nVer [[Diário/${dia}]].\n` }))
  }
  for (const m of a.d.materiais) out.push({ caminho: `Base/${limpo(m.titulo)}.md`, conteudo: `${front({ tipo: 'material', id: m.id, categoria: m.tipo, atualizado: m.atualizadoEm.slice(0, 10) })}# ${m.titulo}\n\n${m.texto}\n` })
  return out
}

function notaDeLicao(l: Licao): string {
  return `${front({ tipo: 'licao', id: l.id, escopo: l.escopo ?? 'geral', confianca: l.confianca ?? 'media', status: l.status ?? 'ativa', revisar_em: l.revisarEm ?? '', provas: l.provas?.length ?? 0 })}# ${l.titulo || 'Lição'}\n\n${l.texto}\n`
}

/** Nota editada no Obsidian volta como proposta (lição ou material). */
export function importarNota(a: AgenteIA, caminho: string, conteudo: string) {
  const fm = Object.fromEntries((conteudo.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').split('\n').map((l) => [l.split(':')[0].trim(), l.slice(l.indexOf(':') + 1).trim()]))
  const corpo = conteudo.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^#.*\n+/, '').trim()
  if (!corpo) throw new Error('Nota vazia.')
  if (fm.tipo === 'material' || caminho.startsWith('Base/')) {
    const m = a.d.materiais.find((x) => x.id === fm.id)
    return a.pendencia({ tipo: 'lacuna', texto: `Material "${m?.titulo ?? caminho}" editado no Obsidian. Responda com o texto para aplicar.`, motivo: corpo.slice(0, 2000) })
  }
  const atual = a.d.licoes.find((x) => x.id === fm.id)
  return a.pendencia({ tipo: 'licao', texto: atual ? 'Lição editada no Obsidian.' : 'Lição nova vinda do Obsidian.', motivo: corpo.slice(0, 400), licao: { ...(atual ?? {}), id: atual?.id, texto: corpo.slice(0, 400), origem: 'obsidian', escopo: fm.escopo || atual?.escopo || 'geral' } })
}

// ---------------------------------------------------------------- .zip (sem compressão)

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(b: Buffer) {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Monta um .zip com as notas (pasta "Caderno XS/"). */
export function zipDoCaderno(arquivos: Arquivo[]): Buffer {
  const partes: Buffer[] = []
  const central: Buffer[] = []
  let off = 0
  for (const f of arquivos) {
    const nome = Buffer.from(`Caderno XS/${f.caminho}`, 'utf8')
    const dados = Buffer.from(f.conteudo, 'utf8')
    const crc = crc32(dados)
    const loc = Buffer.alloc(30)
    loc.writeUInt32LE(0x04034b50, 0)
    loc.writeUInt16LE(20, 4)
    loc.writeUInt16LE(0x0800, 6)
    loc.writeUInt32LE(crc, 14)
    loc.writeUInt32LE(dados.length, 18)
    loc.writeUInt32LE(dados.length, 22)
    loc.writeUInt16LE(nome.length, 26)
    partes.push(loc, nome, dados)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(dados.length, 20)
    cen.writeUInt32LE(dados.length, 24)
    cen.writeUInt16LE(nome.length, 28)
    cen.writeUInt32LE(off, 42)
    central.push(cen, nome)
    off += 30 + nome.length + dados.length
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(arquivos.length, 8)
  fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(tamCentral, 12)
  fim.writeUInt32LE(off, 16)
  return Buffer.concat([...partes, ...central, fim])
}
