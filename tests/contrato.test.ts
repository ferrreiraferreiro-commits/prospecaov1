import { writeFileSync } from 'node:fs'
import { jsPDF } from 'jspdf'
import { describe, expect, it } from 'vitest'
import { clausulas, CONTRATO_PADRAO, faltando, inteiroPorExtenso, numeroContrato, valorPorExtenso, type ContratoDados } from '../src/lib/contrato'
import { gerarContratoPdf } from '../src/lib/contratoPdf'

const dados = (patch: Partial<ContratoDados> = {}): ContratoDados => ({
  ...CONTRATO_PADRAO,
  contratada: { nome: 'XS Sites', documento: '12.345.678/0001-90', endereco: 'Rua das Flores, 100 - Centro', cidade: 'Londrina - PR', email: 'contato@xssites.com.br', telefone: '(43) 99999-0000', pix: 'contato@xssites.com.br' },
  numero: '2026-0042',
  data: '2026-10-08',
  contratante: { nome: 'Pizzaria Bella Massa Ltda', documento: '98.765.432/0001-10', endereco: 'Av. Higienópolis, 1500 - Londrina - PR', email: 'bellamassa@gmail.com', telefone: '(43) 98888-1111', representante: 'João da Silva' },
  projeto: { nome: 'Site da Pizzaria Bella Massa', escopo: 'Página inicial com cardápio\nBotão de pedido pelo WhatsApp\nGaleria de fotos\nMapa e horários' },
  valor: 1500,
  pagamento: { forma: '50_50', parcelas: 3, texto: '' },
  prazo: { tipo: 'dias', data: '', dias: 15 },
  manutencao: { ativa: true, valor: 89.9, inclui: 'hospedagem, pequenas alterações de texto e fotos, e suporte pelo WhatsApp' },
  foro: 'Londrina - PR',
  ...patch,
})

describe('contrato', () => {
  it('valor por extenso como se escreve em contrato', () => {
    expect(valorPorExtenso(1500)).toBe('mil e quinhentos reais')
    expect(valorPorExtenso(1250)).toBe('mil duzentos e cinquenta reais')
    expect(valorPorExtenso(2030.5)).toBe('dois mil e trinta reais e cinquenta centavos')
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(100)).toBe('cem reais')
    expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais')
    expect(inteiroPorExtenso(1_200_000)).toBe('um milhão e duzentos mil')
    expect(inteiroPorExtenso(999)).toBe('novecentos e noventa e nove')
  })

  it('cláusulas trazem valor, pagamento, prazo, manutenção e foro', () => {
    const c = clausulas(dados())
    const texto = c.flatMap((x) => x.paragrafos.map((p) => [p.texto, ...(p.itens ?? [])].join(' '))).join('\n')
    expect(texto).toContain('R$ 1.500,00 (mil e quinhentos reais)')
    expect(texto).toContain('50% (R$ 750,00) como entrada')
    expect(texto).toContain('em até 15 dias úteis')
    expect(texto).toContain('R$ 89,90 (oitenta e nove reais e noventa centavos) por mês')
    expect(texto).toContain('comarca de Londrina - PR')
    expect(texto).toContain('Botão de pedido pelo WhatsApp')
    expect(c.some((x) => x.titulo === 'Da manutenção mensal')).toBe(true)
    // Sem manutenção, a cláusula some
    expect(clausulas(dados({ manutencao: { ativa: false, valor: 0, inclui: '' } })).some((x) => x.titulo === 'Da manutenção mensal')).toBe(false)
    // Parcelado
    const parc = clausulas(dados({ pagamento: { forma: 'parcelado', parcelas: 3, texto: '' } }))
    expect(parc[2].paragrafos[1].texto).toContain('3 parcelas mensais e iguais de R$ 500,00')
  })

  it('aponta o que falta e o número é estável por projeto', () => {
    expect(faltando(dados())).toEqual([])
    expect(faltando(dados({ valor: 0, contratada: { ...dados().contratada, documento: '' } }))).toEqual(['seu CPF ou CNPJ', 'o valor do projeto'])
    expect(numeroContrato('abc', '2026-10-08')).toBe(numeroContrato('abc', '2026-01-01').replace('2026', '2026'))
    expect(numeroContrato('abc', '2026-10-08')).toMatch(/^2026-\d{4}$/)
  })

  it('gera o PDF com rodapé e páginas', async () => {
    const { doc, nome } = await gerarContratoPdf(dados({ testemunhas: true }), jsPDF)
    expect(nome).toBe('Contrato 2026-0042 - Pizzaria Bella Massa Ltda.pdf')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2)
    const bytes = doc.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(5000)
    if (process.env.SALVAR_PDF) writeFileSync(process.env.SALVAR_PDF, new Uint8Array(bytes))
  })
})
