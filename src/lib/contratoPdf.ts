// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Desenha o contrato em PDF de verdade (texto selecionável, A4), no navegador. A biblioteca (jsPDF)
 * só é baixada quando alguém gera um contrato.
 */
import type { jsPDF as JsPDF } from 'jspdf'
import { clausulas, dataPorExtenso, ordinal, reais, resumoPagamento, textoPrazo, type ContratoDados } from './contrato'

const A4 = { w: 210, h: 297 }
const M = 20 // margem lateral
const TOPO = 18
const LIMITE = 274 // onde o texto para (o rodapé vem depois)
const PT = 0.3528 // 1 pt em mm
const LHF = 1.42

const TINTA = '#1f2430'
const CINZA = '#5b6271'
const CLARO = '#8a909c'
const FUNDO = '#f4f5f7'
const LINHA = '#dfe2e7'

const nomeArquivo = (d: ContratoDados) =>
  `Contrato ${d.numero} - ${d.contratante.nome || 'cliente'}`
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + '.pdf'

/** Monta o PDF. Devolve o documento (para ver, baixar ou compartilhar) e o nome do arquivo. */
export async function gerarContratoPdf(d: ContratoDados, jsPDFCtor?: typeof JsPDF): Promise<{ doc: JsPDF; nome: string }> {
  const Ctor = jsPDFCtor ?? (await import('jspdf')).jsPDF
  const doc = new Ctor({ unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(LHF)
  doc.setProperties({
    title: `Contrato de prestação de serviços · ${d.projeto.nome || 'Site'}`,
    subject: `Contrato nº ${d.numero}`,
    author: d.contratada.nome,
    creator: d.contratada.nome || 'XS Prospecção',
  })

  const W = A4.w - 2 * M
  const cor = /^#[0-9a-f]{6}$/i.test(d.cor) ? d.cor : '#1d4ed8'
  let y = TOPO

  const fonte = (tam: number, estilo: 'normal' | 'bold' = 'normal', c = TINTA) => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(tam)
    doc.setTextColor(c)
  }
  const alturaLinha = (tam: number) => tam * PT * LHF
  /** Garante espaço; se não couber, vai para a próxima página. */
  const caber = (h: number) => {
    if (y + h <= LIMITE) return
    doc.addPage()
    faixa()
    y = TOPO + 4
  }
  const faixa = () => {
    doc.setFillColor(cor)
    doc.rect(0, 0, A4.w, 2.4, 'F')
  }

  /** Parágrafo justificado, quebrando entre páginas. */
  const paragrafo = (texto: string, x: number, largura: number, tam = 9.5, c = TINTA, justificar = true) => {
    fonte(tam, 'normal', c)
    // "R$" nunca fica sozinho no fim da linha
    const linhas = doc.splitTextToSize(texto.replace(/R\$ /g, 'R$ '), largura) as string[]
    const lh = alturaLinha(tam)
    let i = 0
    while (i < linhas.length) {
      caber(lh)
      const cabem = Math.max(1, Math.floor((LIMITE - y) / lh))
      const pedaco = linhas.slice(i, i + cabem)
      fonte(tam, 'normal', c)
      doc.text(pedaco, x, y + tam * PT * 0.8, justificar && pedaco.length > 1 ? { align: 'justify', maxWidth: largura } : {})
      y += pedaco.length * lh
      i += pedaco.length
    }
  }

  // ------------------------------------------------------------- cabeçalho
  faixa()
  fonte(8.5, 'bold', cor)
  doc.text((d.contratada.nome || 'Contratada').toUpperCase(), M, y, { charSpace: 0.35 })
  fonte(8, 'normal', CLARO)
  doc.text(`Contrato nº ${d.numero}`, A4.w - M, y, { align: 'right' })
  y += 10
  fonte(18, 'bold')
  doc.text('Contrato de Prestação de Serviços', M, y)
  y += 6.5
  fonte(10.5, 'normal', CINZA)
  doc.text(`Criação de site · ${d.projeto.nome || 'Site'}`, M, y)
  y += 6
  doc.setDrawColor(LINHA)
  doc.setLineWidth(0.3)
  doc.line(M, y, A4.w - M, y)
  y += 6

  // ------------------------------------------------------------- partes
  const larguraParte = (W - 6) / 2
  const parte = (rotulo: string, nome: string, linhas: string[]) => {
    const corpo = linhas.filter(Boolean).flatMap((l) => {
      fonte(8.5)
      return doc.splitTextToSize(l, larguraParte - 10) as string[]
    })
    fonte(10.5, 'bold')
    const nomeLinhas = doc.splitTextToSize(nome || '—', larguraParte - 10) as string[]
    return { rotulo, nomeLinhas, corpo, altura: 7 + 4 + nomeLinhas.length * alturaLinha(10.5) + 1.5 + corpo.length * alturaLinha(8.5) + 4 }
  }
  const ct = d.contratante
  const cd = d.contratada
  const partes = [
    parte('CONTRATADA', cd.nome, [cd.documento && `CPF/CNPJ: ${cd.documento}`, cd.endereco, [cd.email, cd.telefone].filter(Boolean).join(' · ')]),
    parte('CONTRATANTE', ct.nome, [
      ct.documento && `CPF/CNPJ: ${ct.documento}`,
      ct.representante && `Representado por: ${ct.representante}`,
      ct.endereco,
      [ct.email, ct.telefone].filter(Boolean).join(' · '),
    ]),
  ]
  const alturaPartes = Math.max(...partes.map((p) => p.altura))
  partes.forEach((p, i) => {
    const x = M + i * (larguraParte + 6)
    doc.setFillColor(FUNDO)
    doc.roundedRect(x, y, larguraParte, alturaPartes, 2, 2, 'F')
    doc.setFillColor(cor)
    doc.rect(x, y + 3, 0.9, alturaPartes - 6, 'F')
    let yy = y + 7
    fonte(7, 'bold', cor)
    doc.text(p.rotulo, x + 5, yy, { charSpace: 0.4 })
    yy += 5
    fonte(10.5, 'bold')
    doc.text(p.nomeLinhas, x + 5, yy)
    yy += p.nomeLinhas.length * alturaLinha(10.5) + 0.5
    fonte(8.5, 'normal', CINZA)
    if (p.corpo.length) doc.text(p.corpo, x + 5, yy)
  })
  y += alturaPartes + 6

  paragrafo(
    'As partes acima identificadas têm entre si justo e acertado este Contrato de Prestação de Serviços de criação de site, que se regerá pelas cláusulas e condições a seguir.',
    M,
    W,
    9.5,
    CINZA,
  )
  y += 4

  // ------------------------------------------------------------- resumo
  const resumo: [string, string][] = [
    ['VALOR TOTAL', reais(d.valor)],
    ['PAGAMENTO', resumoPagamento(d)],
    ['PRAZO DE ENTREGA', textoPrazo(d).replace(/^em /, '').replace(/^até /, 'Até ')],
    ['REVISÕES', d.revisoes > 0 ? `${d.revisoes} ${d.revisoes === 1 ? 'rodada' : 'rodadas'} de ajustes` : 'Só correções'],
  ]
  const larguras = [0.22, 0.34, 0.22, 0.22].map((f) => f * W)
  const valores = resumo.map(([, v], i) => {
    fonte(9.5, 'bold')
    return doc.splitTextToSize(v, larguras[i] - 7) as string[]
  })
  const alturaResumo = 6 + 4 + Math.max(...valores.map((v) => v.length)) * alturaLinha(9.5) + 3
  caber(alturaResumo)
  doc.setDrawColor(LINHA)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, y, W, alturaResumo, 2, 2, 'S')
  let x = M
  resumo.forEach(([rotulo], i) => {
    if (i) doc.line(x, y + 3, x, y + alturaResumo - 3)
    fonte(6.8, 'bold', CLARO)
    doc.text(rotulo, x + 4, y + 6, { charSpace: 0.35 })
    fonte(9.5, 'bold', i === 0 ? cor : TINTA)
    doc.text(valores[i], x + 4, y + 11)
    x += larguras[i]
  })
  y += alturaResumo + 7

  // ------------------------------------------------------------- cláusulas
  clausulas(d).forEach((c, i) => {
    caber(18) // título não fica sozinho no fim da página
    fonte(9.5, 'bold', cor)
    doc.text(`CLÁUSULA ${ordinal(i).toUpperCase()} · ${c.titulo.toUpperCase()}`, M, y + 3, { charSpace: 0.15 })
    y += 7
    c.paragrafos.forEach((p, j) => {
      caber(alturaLinha(9.5) * 2)
      fonte(9.5, 'bold', CINZA)
      doc.text(`${i + 1}.${j + 1}`, M, y + 9.5 * PT * 0.8)
      paragrafo(p.texto, M + 9, W - 9)
      if (p.itens?.length) {
        y += 1
        p.itens.forEach((item, k) => {
          caber(alturaLinha(9.5))
          fonte(9.5, 'bold', cor)
          const marca = p.itens!.length > 3 || !/[;.]$/.test(item) ? '•' : `${String.fromCharCode(97 + k)})`
          doc.text(marca, M + 11, y + 9.5 * PT * 0.8)
          paragrafo(item, M + 16, W - 16, 9.5, TINTA, false)
          y += 0.6
        })
      }
      y += 2.2
    })
    y += 2.5
  })

  // ------------------------------------------------------------- assinaturas
  const local = d.contratada.cidade.trim() || d.foro.trim()
  const blocoAssinaturas = 14 + 30 + (d.testemunhas ? 30 : 0)
  caber(blocoAssinaturas)
  y += 2
  fonte(9.5, 'normal', TINTA)
  doc.text(`${local ? `${local}, ` : ''}${dataPorExtenso(d.data)}.`, M, y)
  y += 24
  const assinatura = (xx: number, nome: string, linha2: string, papel: string) => {
    doc.setDrawColor('#9aa0ab')
    doc.setLineWidth(0.3)
    doc.line(xx, y, xx + larguraParte - 4, y)
    fonte(9, 'bold')
    doc.text(nome || ' ', xx, y + 4.5)
    fonte(8, 'normal', CINZA)
    doc.text([linha2, papel].filter(Boolean), xx, y + 8.6)
  }
  assinatura(M, cd.nome, cd.documento && `CPF/CNPJ: ${cd.documento}`, 'CONTRATADA')
  assinatura(M + larguraParte + 6, ct.representante ? `${ct.nome} · ${ct.representante}` : ct.nome, ct.documento && `CPF/CNPJ: ${ct.documento}`, 'CONTRATANTE')
  y += 16
  if (d.testemunhas) {
    y += 14
    assinatura(M, 'Testemunha 1', 'Nome:                                CPF:', '')
    assinatura(M + larguraParte + 6, 'Testemunha 2', 'Nome:                                CPF:', '')
    y += 14
  }

  // ------------------------------------------------------------- rodapé de todas as páginas
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(LINHA)
    doc.setLineWidth(0.3)
    doc.line(M, 283, A4.w - M, 283)
    fonte(7.5, 'normal', CLARO)
    doc.text(`${d.contratada.nome ? `${d.contratada.nome} · ` : ''}Contrato nº ${d.numero}`, M, 288)
    if (p < total) doc.text('Rubricas: ________   ________', A4.w / 2, 288, { align: 'center' })
    doc.text(`Página ${p} de ${total}`, A4.w - M, 288, { align: 'right' })
  }

  return { doc, nome: nomeArquivo(d) }
}
