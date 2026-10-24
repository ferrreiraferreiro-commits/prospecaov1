// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Archive, Download, NotebookPen, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag, type Licao } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card } from '../kit'
import { Button, Segmented, Spinner } from '../ui'
import { ComoFunciona, Selo } from './Ajuda'
import { erroTexto } from './comum'

type LicaoCaderno = Licao & { titulo?: string; escopo?: string; confianca?: 'baixa' | 'media' | 'alta'; status?: 'proposta' | 'ativa' | 'arquivada'; revisarEm?: string | null; provas?: string[] }
interface Dados {
  licoes: LicaoCaderno[]
  diario: { dia: string; resumo: string; funcionou: string[]; naoFuncionou: string[]; erros: string[] }[]
  arquivos: number
}
type Filtro = 'ativa' | 'proposta' | 'arquivada'

const ORIGEM: Record<string, string> = { voce: 'você', correcao: 'sua correção', resultado: 'resultado', professor: 'Professor', obsidian: 'Obsidian', teste: 'teste' }

/** O Caderno: o que ele aprendeu, o Diário do Professor e o Obsidian. */
export function Caderno() {
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<Dados | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('ativa')
  const [nova, setNova] = useState('')
  const [escopo, setEscopo] = useState('geral')
  const [baixando, setBaixando] = useState(false)

  const carregar = useCallback(() => ag<Dados>('/caderno', { timeoutMs: 10000 }).then(setD, () => setD(null)), [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function mudar(id: string, json: Record<string, unknown>) {
    try {
      setD(await ag<Dados>(`/caderno/licao/${id}`, { method: 'POST', json }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  async function adicionar() {
    try {
      const l = await ag<Licao>('/licoes', { method: 'POST', json: { tipo: 'conversa', texto: nova } })
      if (escopo !== 'geral') await ag(`/caderno/licao/${l.id}`, { method: 'POST', json: { escopo } })
      setNova('')
      toast('Lição no Caderno. Vale a partir da próxima resposta.')
      void carregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  async function baixar() {
    setBaixando(true)
    try {
      const z = await ag<{ nome: string; base64: string }>('/caderno/zip', { timeoutMs: 30000 })
      const bytes = Uint8Array.from(atob(z.base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = z.nome
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBaixando(false)
    }
  }

  if (!d)
    return (
      <div className="grid h-24 place-items-center">
        <Spinner />
      </div>
    )

  const status = (l: LicaoCaderno) => l.status ?? (l.ativa ? 'ativa' : 'arquivada')
  const lista = d.licoes.filter((l) => status(l) === filtro)
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      <ComoFunciona
        id="caderno"
        titulo="A memória do vendedor"
        passos={[
          <>Toda noite o Professor lê as conversas que terminaram e escreve o que funcionou, o que não funcionou e os erros (no Diário).</>,
          <>Quando aprende algo novo, ele propõe uma lição. Você aprova em "Precisa de você" e ela passa a valer.</>,
          <>Lição pode valer para tudo ou só para um ramo (ex.: ramo:Barbearia).</>,
          <>Baixe o Caderno para abrir no Obsidian, ou instale o plugin "XS Caderno" para sincronizar nos dois sentidos.</>,
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title={<span className="flex items-center gap-2"><NotebookPen className="size-3.5 text-blue-300" /> Lições</span>}
          actions={<Segmented size="xs" value={filtro} onChange={setFiltro} options={[{ id: 'ativa', label: 'Valendo' }, { id: 'proposta', label: 'Propostas' }, { id: 'arquivada', label: 'Arquivadas' }]} />}
          bodyClass="divide-y divide-line-soft"
        >
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <input className="input min-w-[200px] flex-1" value={nova} onChange={(e) => setNova(e.target.value)} placeholder='Ensinar: "Sempre pergunte o nome do dono"' />
            <input className="input w-40" value={escopo} onChange={(e) => setEscopo(e.target.value)} title="geral ou ramo:Barbearia" />
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} disabled={!nova.trim()} onClick={() => void adicionar()}>
              Ensinar
            </Button>
          </div>
          {lista.length === 0 && <p className="px-4 py-6 text-center text-xs text-fg-3">Nada aqui.</p>}
          {lista.map((l) => (
            <div key={l.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-fg">{l.texto}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Selo tom={l.escopo?.startsWith('ramo:') ? 'azul' : 'neutro'}>{l.escopo || 'geral'}</Selo>
                  {l.confianca && <Selo tom={l.confianca === 'alta' ? 'verde' : l.confianca === 'media' ? 'ouro' : 'neutro'}>confiança {l.confianca}</Selo>}
                  {!!l.provas?.length && <Selo>{l.provas.length} conversa(s) de prova</Selo>}
                  {l.revisarEm && l.revisarEm < hoje && <Selo tom="ouro">revisar se ainda vale</Selo>}
                  <span className="text-2xs text-fg-4">
                    {ORIGEM[l.origem] ?? l.origem} · {formatRelative(l.em)}
                  </span>
                </p>
              </div>
              {status(l) === 'arquivada' ? (
                <button type="button" title="Voltar a valer" onClick={() => void mudar(l.id, { status: 'ativa' })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg">
                  <RotateCcw className="size-3.5" />
                </button>
              ) : (
                <button type="button" title="Arquivar" onClick={() => void mudar(l.id, { status: 'arquivada' })} className="grid size-7 place-items-center rounded-md text-fg-4 hover:bg-hover hover:text-fg">
                  <Archive className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card title="Obsidian" description={`${d.arquivos} notas: persona, regras, ramos, objeções, lições, diário e material.`} bodyClass="px-4 py-4 space-y-3">
            <Button variant="primary" icon={<Download className="size-3.5" />} loading={baixando} onClick={() => void baixar()}>
              Baixar Caderno (.zip)
            </Button>
            <ol className="space-y-1.5 text-xs text-fg-3">
              <li>1. Descompacte dentro do seu cofre do Obsidian. Pronto: as notas abrem com links entre si.</li>
              <li>
                2. Para sincronizar sozinho, copie a pasta <code className="text-fg-2">integracoes/obsidian-xs-caderno</code> para <code className="text-fg-2">.obsidian/plugins/</code> do cofre e ative "XS Caderno".
              </li>
              <li>3. Nos ajustes do plugin, cole a sua chave pessoal do conector (Ajustes → Conector). O que você editar no Obsidian volta como proposta.</li>
            </ol>
          </Card>

          <Card title="Diário do Professor" description="O que ele escreveu sobre as conversas de cada noite." bodyClass="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
            {d.diario.length === 0 && <p className="px-4 py-4 text-xs text-fg-3">O primeiro diário aparece depois da primeira noite com conversas encerradas.</p>}
            {d.diario.map((x) => (
              <div key={x.dia} className="space-y-1 px-4 py-3 text-xs">
                <p className="font-medium text-fg">{x.dia.split('-').reverse().join('/')}</p>
                <p className="text-fg-3">{x.resumo}</p>
                {x.funcionou.map((t, i) => (
                  <p key={`f${i}`} className="text-emerald-300">+ {t}</p>
                ))}
                {x.naoFuncionou.map((t, i) => (
                  <p key={`n${i}`} className="text-fg-2">− {t}</p>
                ))}
                {x.erros.map((t, i) => (
                  <p key={`e${i}`} className={clsx('text-red-300')}>! {t}</p>
                ))}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
