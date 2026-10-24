// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { FlaskConical, History, RotateCcw, Save, Trophy } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card } from '../kit'
import { Button, Progress, Spinner } from '../ui'
import { ComoFunciona, Selo } from './Ajuda'
import { erroTexto } from './comum'
import { Testes } from './Testes'

interface Resultado {
  persona: string
  nome: string
  categoria: 'cliente' | 'ataque' | 'caso'
  nota: number
  notas: Record<string, number>
  comentario: string
  pontoFraco: string
  barradas: string[]
  conversa: { de: 'lead' | 'agente'; texto: string }[]
}
interface Prova {
  id: string
  versao: number
  em: string
  tamanho: number
  estado: 'rodando' | 'pronta' | 'falhou'
  feitas: number
  resultados: Resultado[]
  nota: number | null
  porCriterio: Record<string, number>
}
interface Dados {
  provas: Prova[]
  comparar: { antes: { versao: number; nota: number | null }; depois: { versao: number; nota: number | null }; diferenca: Record<string, number>; total: number } | null
  versoes: { n: number; em: string; motivo: string }[]
  versaoAtual: number
  casos: { id: string; tipo: 'ouro' | 'erro'; empresa: string; mensagem: string }[]
  personas: { id: string; nome: string; categoria: 'cliente' | 'ataque'; nicho: string; jeito: string }[]
}

const CRITERIO: Record<string, string> = { gente: 'Soa como gente', avanca: 'Avança a venda', regras: 'Respeita as regras', naoInventa: 'Não inventa', chamaNaHora: 'Chama você na hora' }
const tomNota = (n: number | null) => (n === null ? 'neutro' : n >= 85 ? 'verde' : n >= 70 ? 'ouro' : 'vermelho')

/** Laboratório: clientes simulados, a prova com nota, antes e depois, versões e casos. */
export function Laboratorio() {
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<Dados | null>(null)
  const [tamanho, setTamanho] = useState(10)
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(() => ag<Dados>('/laboratorio', { timeoutMs: 10000 }).then(setD, () => setD(null)), [])
  useEffect(() => {
    void carregar()
  }, [carregar])
  const rodando = d?.provas.some((p) => p.estado === 'rodando')
  useEffect(() => {
    if (!rodando) return
    const id = setInterval(() => void carregar(), 5000)
    return () => clearInterval(id)
  }, [rodando, carregar])

  async function chamar(caminho: string, json: unknown, aviso: string) {
    try {
      setD(await ag<Dados>(caminho, { method: 'POST', json }))
      toast(aviso)
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  if (!d)
    return (
      <div className="grid h-24 place-items-center">
        <Spinner />
      </div>
    )

  const ultima = d.provas[0]

  return (
    <div className="space-y-4">
      <ComoFunciona
        id="laboratorio"
        titulo="Testar antes de soltar no cliente"
        passos={[
          <>Clientes de mentira (Seu Zé desconfiado, a pechincheira, o golpista…) conversam com o vendedor. Nada sai pelo WhatsApp.</>,
          <>Uma IA juíza dá nota de 0 a 100 em 5 critérios. Mensagem barrada pela conferência tira pontos.</>,
          <>Nota 85 libera o nível 3 (Piloto) e nota 90 libera o nível 4, na aba Segurança.</>,
          <>Toda mudança no treino guarda uma versão. Rode a prova de novo para ver o antes e depois; se piorou, volte a versão.</>,
        ]}
      />

      <Card
        title={<span className="flex items-center gap-2"><FlaskConical className="size-3.5 text-blue-300" /> Prova</span>}
        description="Gasta umas 3 consultas à IA por conversa simulada."
        actions={
          <div className="flex items-center gap-1.5">
            <select className="input h-7 w-auto text-xs" value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))}>
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n} conversas
                </option>
              ))}
            </select>
            <Button size="sm" variant="primary" disabled={rodando} onClick={() => void chamar('/laboratorio/prova', { tamanho }, 'Prova começou. Leva alguns minutos.')}>
              {rodando ? 'Rodando…' : 'Rodar prova'}
            </Button>
          </div>
        }
        bodyClass="px-4 py-4 space-y-4"
      >
        {!ultima ? (
          <p className="text-xs text-fg-3">Nenhuma prova ainda. Rode a primeira depois de preencher o Treino e o material.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-2xs text-fg-4">Última nota · versão {ultima.versao}</p>
                <p className={clsx('num text-3xl font-semibold', ultima.nota === null ? 'text-fg-3' : ultima.nota >= 85 ? 'text-emerald-300' : ultima.nota >= 70 ? 'text-gold' : 'text-red-300')}>{ultima.nota ?? '—'}</p>
              </div>
              {ultima.estado === 'rodando' && (
                <div className="min-w-[180px] flex-1">
                  <p className="mb-1 text-xs text-fg-3">
                    {ultima.feitas} de {ultima.tamanho} conversas
                  </p>
                  <Progress value={ultima.feitas} max={ultima.tamanho} tone="accent" />
                </div>
              )}
              {d.comparar && (
                <div className="rounded-lg border border-line-soft px-3 py-2 text-xs">
                  <p className="text-fg-3">Antes e depois (v{d.comparar.antes.versao} → v{d.comparar.depois.versao})</p>
                  <p className={clsx('num font-semibold', d.comparar.total >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                    {d.comparar.total >= 0 ? '+' : ''}
                    {d.comparar.total} pontos
                  </p>
                </div>
              )}
            </div>
            {Object.keys(ultima.porCriterio).length > 0 && (
              <div className="grid gap-2 sm:grid-cols-5">
                {Object.entries(ultima.porCriterio).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line-soft px-3 py-2">
                    <p className="text-2xs text-fg-4">{CRITERIO[k] ?? k}</p>
                    <p className="num text-base font-semibold text-fg">
                      {v}
                      {d.comparar?.diferenca[k] ? <span className={clsx('ml-1 text-2xs', d.comparar.diferenca[k] > 0 ? 'text-emerald-300' : 'text-red-300')}>{d.comparar.diferenca[k] > 0 ? '+' : ''}{d.comparar.diferenca[k]}</span> : null}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
              {ultima.resultados.map((r, i) => {
                const k = `${ultima.id}-${i}`
                return (
                  <li key={k}>
                    <button type="button" onClick={() => setAberta(aberta === k ? null : k)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover">
                      <Selo tom={tomNota(r.nota)}>{r.nota}</Selo>
                      <span className="flex-1 truncate text-[13px] text-fg">{r.nome}</span>
                      {r.categoria === 'ataque' && <Selo tom="vermelho">ataque</Selo>}
                      {r.barradas.length > 0 && <Selo tom="ouro">{r.barradas.length} barrada(s)</Selo>}
                    </button>
                    {aberta === k && (
                      <div className="space-y-2 border-t border-line-soft bg-ink px-3 py-3">
                        <p className="text-xs text-fg-2">{r.comentario}</p>
                        {r.pontoFraco && <p className="text-xs text-gold">A melhorar: {r.pontoFraco}</p>}
                        {r.barradas.map((b, j) => (
                          <p key={j} className="text-2xs text-red-300">
                            Barrada: {b}
                          </p>
                        ))}
                        <div className="space-y-1.5">
                          {r.conversa.map((m, j) => (
                            <div key={j} className={clsx('max-w-[85%] rounded-xl px-3 py-1.5 text-xs whitespace-pre-wrap', m.de === 'lead' ? 'bg-raised ring-1 ring-line' : 'ml-auto bg-blue-500/15 ring-1 ring-blue-500/25')}>
                              {m.texto}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title={<span className="flex items-center gap-2"><History className="size-3.5 text-fg-3" /> Versões do treino</span>}
          description={`Agora: versão ${d.versaoAtual}. Cada mudança no treino, no material ou nas lições guarda uma.`}
          actions={<Button size="xs" icon={<Save className="size-3" />} onClick={() => void chamar('/laboratorio/versao', { motivo: window.prompt('O que mudou nesta versão?') ?? '' }, 'Versão guardada.')}>Guardar agora</Button>}
          bodyClass="max-h-[320px] divide-y divide-line-soft overflow-y-auto"
        >
          {d.versoes.length === 0 && <p className="px-4 py-4 text-xs text-fg-3">Nenhuma versão ainda.</p>}
          {d.versoes.map((v) => (
            <div key={v.n} className="flex items-center gap-3 px-4 py-2">
              <span className="num w-8 text-xs font-semibold text-fg-2">v{v.n}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{v.motivo}</span>
              <span className="text-2xs text-fg-4">{formatRelative(v.em)}</span>
              {v.n !== d.versaoAtual && (
                <button type="button" title="Voltar para esta versão" onClick={() => window.confirm(`Voltar o treino para a versão ${v.n}? A versão atual fica guardada.`) && void chamar('/laboratorio/voltar', { n: v.n }, `Treino voltou para a versão ${v.n}.`)} className="grid size-6 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg">
                  <RotateCcw className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Trophy className="size-3.5 text-gold" /> Casos de ouro e de erro</span>} description="Marque uma mensagem do vendedor na conversa como perfeita ou como erro: ela vira teste na prova." bodyClass="max-h-[320px] divide-y divide-line-soft overflow-y-auto">
          {d.casos.length === 0 && <p className="px-4 py-4 text-xs text-fg-3">Nenhum caso ainda. Em Conversas, use os botões “ouro” e “erro” nas mensagens dele.</p>}
          {d.casos.map((c) => (
            <div key={c.id} className="flex items-start gap-2 px-4 py-2">
              <Selo tom={c.tipo === 'ouro' ? 'ouro' : 'vermelho'}>{c.tipo}</Selo>
              <p className="min-w-0 flex-1 text-xs text-fg-2">
                <span className="text-fg-3">{c.empresa}: </span>
                {c.mensagem}
              </p>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Clientes simulados" description="Quem conversa com ele na prova.">
        <ul className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {d.personas.map((p) => (
            <li key={p.id} className="rounded-lg border border-line-soft px-3 py-2">
              <p className="flex items-center gap-1.5 font-medium text-fg">
                {p.nome} {p.categoria === 'ataque' && <Selo tom="vermelho">ataque</Selo>}
              </p>
              <p className="text-2xs text-fg-4">{p.nicho}</p>
              <p className="mt-1 text-fg-3">{p.jeito}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Testes />
    </div>
  )
}
