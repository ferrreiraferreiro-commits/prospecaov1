// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { MapPin, Plus, Search, Trash2, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ag, type AgenteConfig, type Alvo, type FilaItem } from '../../lib/agente'
import { CATEGORIAS, POPULARES } from '../../lib/categorias'
import { formatPhone } from '../../lib/contact'
import { useApp } from '../../store/useApp'
import { Card, Field, NumberInput } from '../kit'
import { Button, Spinner } from '../ui'
import { Chave, DIAS_SEMANA, erroTexto, Texto, type AgenteCtx } from './comum'

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

/** Tipos de negócio da busca no Google Maps (os mais pedidos primeiro). */
const TIPOS = CATEGORIAS.slice().sort((a, b) => Number(POPULARES.includes(b.id)) - Number(POPULARES.includes(a.id)))

type Rascunho = Pick<AgenteConfig, 'prospeccao' | 'followup'>

export function Prospeccao({ ctx }: { ctx: AgenteCtx }) {
  const original: Rascunho = { prospeccao: ctx.config.prospeccao, followup: ctx.config.followup }
  const [r, setR] = useState<Rascunho>(original)
  const [busy, setBusy] = useState(false)
  const mudou = JSON.stringify(r) !== JSON.stringify(original)
  const p = r.prospeccao
  const setP = (patch: Partial<Rascunho['prospeccao']>) => setR((x) => ({ ...x, prospeccao: { ...x.prospeccao, ...patch } }))

  async function salvar() {
    setBusy(true)
    const c = await ctx.salvar(r, 'Prospecção salva.')
    if (c) setR({ prospeccao: c.prospeccao, followup: c.followup })
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <Card
        title="Buscar e abordar sozinho"
        description="Todo dia, no horário escolhido, ele procura empresas novas no Google Maps (com a sua chave e a sua cota grátis), dá uma nota de encaixe, filtra pelos seus critérios e manda a primeira mensagem, devagar, para não queimar o número."
        actions={
          <Button variant="primary" size="sm" loading={busy} disabled={!mudou} onClick={() => void salvar()}>
            Salvar
          </Button>
        }
        bodyClass="px-4 py-4 space-y-5"
      >
        <Chave ligado={p.ativa} onChange={(v) => setP({ ativa: v })} label={p.ativa ? 'Prospecção ligada' : 'Prospecção desligada (ele só responde quem escrever)'} />
        {ctx.estado.google && !ctx.estado.google.temChave && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Para buscar sozinho ele usa a sua chave do Google. <Link to="/configuracoes" className="font-medium text-blue-300 hover:text-blue-200">Coloque a chave em Configurações → Busca do Google</Link> e deixe a XS aberta um minuto para ele receber.
            </span>
          </p>
        )}
        {ctx.estado.google?.temChave && <p className="text-2xs text-fg-4">Chave do Google conectada · {ctx.estado.google.restante >= 100000 ? 'sem teto no mês' : `${ctx.estado.google.restante} consultas ainda cabem na cota do mês`}</p>}

        <section>
          <h3 className="label">Cidades e tipos de negócio</h3>
          <Alvos alvos={p.alvos} onChange={(alvos) => setP({ alvos })} />
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Empresas por dia no começo">
            <NumberInput value={p.porDiaInicial} onChange={(v) => setP({ porDiaInicial: v ?? 20 })} min={1} />
          </Field>
          <Field label="Sobe por semana" hint="Se o número não tiver problema.">
            <NumberInput value={p.aumentoSemana} onChange={(v) => setP({ aumentoSemana: v ?? 0 })} min={0} />
          </Field>
          <Field label="Até no máximo">
            <NumberInput value={p.porDiaMax} onChange={(v) => setP({ porDiaMax: v ?? 50 })} min={1} />
          </Field>
        </section>

        <section className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <span className="label">Dias</span>
            <div className="flex gap-1">
              {DIAS_SEMANA.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setP({ dias: p.dias.includes(i) ? p.dias.filter((x) => x !== i) : [...p.dias, i].sort() })}
                  className={clsx('h-7 w-10 rounded-md text-xs font-medium ring-1 ring-inset', p.dias.includes(i) ? 'bg-blue-500/15 text-blue-300 ring-blue-500/30' : 'text-fg-3 ring-line hover:text-fg-2')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <Horario label="Horário das abordagens" inicio={p.inicio} fim={p.fim} onChange={(inicio, fim) => setP({ inicio, fim })} />
          <Chave ligado={p.soSemSite} onChange={(v) => setP({ soSemSite: v })} label="Só empresas sem site" />
          <Chave
            ligado={p.cumprimentarPrimeiro !== false}
            onChange={(v) => setP({ cumprimentarPrimeiro: v })}
            label="Cumprimentar primeiro: manda só “Oi, boa tarde!” e a apresentação vem depois da resposta (automática ou da pessoa)"
          />
        </section>

        <Field label="Que empresas você quer (ou não quer)?" hint="Ele usa isso para tirar da fila quem não combina. Tirar empresas da fila com um motivo também ensina.">
          <Texto value={p.criterios} onChange={(v) => setP({ criterios: v })} rows={3} placeholder="Ex.: Evite franquias, redes grandes e empresas de outras cidades. Prefira negócios de bairro." />
        </Field>

        <section className="rounded-lg border border-line-soft bg-ink p-3">
          <Chave ligado={r.followup.ativo} onChange={(v) => setR((x) => ({ ...x, followup: { ...x.followup, ativo: v } }))} label="Follow-up de quem parou de responder" />
          {r.followup.ativo && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3">
              {r.followup.dias.map((d, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i === 0 ? 'Tenta de novo depois de' : 'e depois de mais'}
                  <NumberInput
                    className="w-16"
                    value={d}
                    min={1}
                    onChange={(v) => setR((x) => ({ ...x, followup: { ...x.followup, dias: x.followup.dias.map((y, j) => (j === i ? (v ?? 1) : y)) } }))}
                  />
                  dias
                  <button type="button" title="Tirar" onClick={() => setR((x) => ({ ...x, followup: { ...x.followup, dias: x.followup.dias.filter((_, j) => j !== i) } }))} className="text-fg-4 hover:text-red-300">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {r.followup.dias.length < 4 && (
                <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setR((x) => ({ ...x, followup: { ...x.followup, dias: [...x.followup.dias, 3] } }))}>
                  tentativa
                </Button>
              )}
            </div>
          )}
        </section>
      </Card>

      <Fila alvos={ctx.config.prospeccao.alvos} />
    </div>
  )
}

export function Horario({ label, inicio, fim, onChange }: { label: string; inicio: number; fim: number; onChange: (inicio: number, fim: number) => void }) {
  const horas = Array.from({ length: 25 }, (_, h) => h)
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-1.5 text-xs text-fg-3">
        <select className="input h-7 w-20" value={inicio} onChange={(e) => onChange(Number(e.target.value), fim)}>
          {horas.slice(0, 24).map((h) => (
            <option key={h} value={h}>
              {h}h
            </option>
          ))}
        </select>
        às
        <select className="input h-7 w-20" value={fim} onChange={(e) => onChange(inicio, Number(e.target.value))}>
          {horas.slice(1).map((h) => (
            <option key={h} value={h}>
              {h}h
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function Alvos({ alvos, onChange }: { alvos: Alvo[]; onChange: (a: Alvo[]) => void }) {
  const [uf, setUf] = useState('PR')
  const [cidade, setCidade] = useState('')
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [busca, setBusca] = useState('')

  const tipos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? TIPOS.filter((t) => `${t.nome} ${t.grupo}`.toLowerCase().includes(q)) : TIPOS.slice(0, 18)
  }, [busca])

  function adicionar() {
    const nichos = TIPOS.filter((t) => escolhidos.includes(t.id)).map((t) => ({ nome: t.nome, busca: t.google, tax: t.base, nomes: t.nomes }))
    if (!cidade.trim() || !nichos.length) return
    onChange([...alvos, { id: crypto.randomUUID(), uf, cidade: cidade.trim(), nichos, ativo: true }])
    setCidade('')
    setEscolhidos([])
  }

  return (
    <div className="space-y-3">
      {alvos.length > 0 && (
        <ul className="space-y-1.5">
          {alvos.map((a) => (
            <li key={a.id} className={clsx('flex items-center gap-2.5 rounded-lg border border-line-soft px-3 py-2', !a.ativo && 'opacity-50')}>
              <Chave ligado={a.ativo} onChange={(v) => onChange(alvos.map((x) => (x.id === a.id ? { ...x, ativo: v } : x)))} />
              <MapPin className="size-3.5 shrink-0 text-fg-3" />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="font-medium text-fg">
                  {a.cidade} - {a.uf}
                </span>
                <span className="text-fg-3"> · {a.nichos.map((n) => n.nome).join(', ')}</span>
              </div>
              <button type="button" title="Tirar" onClick={() => onChange(alvos.filter((x) => x.id !== a.id))} className="grid size-6 place-items-center rounded-md text-fg-4 hover:bg-hover hover:text-red-300">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2.5 rounded-lg border border-dashed border-line p-3">
        <div className="flex gap-2">
          <select className="input w-20" value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <input className="input flex-1" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade (ex.: Londrina)" />
        </div>
        <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar tipo de negócio (pizzaria, dentista, oficina…)" />
        <div className="flex flex-wrap gap-1.5">
          {tipos.map((t) => {
            const on = escolhidos.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setEscolhidos(on ? escolhidos.filter((x) => x !== t.id) : [...escolhidos, t.id])}
                className={clsx('h-6 rounded-full px-2.5 text-2xs font-medium ring-1 ring-inset', on ? 'bg-blue-500/15 text-blue-300 ring-blue-500/30' : 'text-fg-2 ring-line hover:ring-line-strong')}
              >
                {t.nome}
              </button>
            )
          })}
          {escolhidos
            .filter((id) => !tipos.some((t) => t.id === id))
            .map((id) => (
              <button key={id} type="button" onClick={() => setEscolhidos(escolhidos.filter((x) => x !== id))} className="h-6 rounded-full bg-blue-500/15 px-2.5 text-2xs font-medium text-blue-300 ring-1 ring-blue-500/30 ring-inset">
                {TIPOS.find((t) => t.id === id)?.nome}
              </button>
            ))}
        </div>
        <Button size="sm" icon={<Plus className="size-3.5" />} disabled={!cidade.trim() || !escolhidos.length} onClick={adicionar}>
          Adicionar {escolhidos.length ? `${escolhidos.length} tipo(s) em ${cidade.trim() || '…'}` : ''}
        </Button>
        <p className="text-2xs text-fg-4">Depois de adicionar, clique em Salvar. Ele sorteia entre as cidades e dá mais vez às que respondem mais.</p>
      </div>
    </div>
  )
}

function Fila({ alvos }: { alvos: Alvo[] }) {
  const toast = useApp((s) => s.toast)
  const [fila, setFila] = useState<FilaItem[] | null>(null)
  const [alvo, setAlvo] = useState('')
  const [buscando, setBuscando] = useState(false)

  const carregar = useCallback(() => ag<FilaItem[]>('/fila', { timeoutMs: 10000 }).then(setFila, () => setFila([])), [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function buscar() {
    setBuscando(true)
    try {
      const r = await ag<{ achadas: number; novas: number; fila: FilaItem[] }>('/fila/buscar', { method: 'POST', json: { alvo: alvo || undefined }, timeoutMs: 60000 })
      setFila(r.fila)
      toast(r.novas ? `${r.novas} empresa(s) nova(s) na fila.` : 'Nenhuma empresa nova encontrada nessa busca.', r.novas ? 'success' : 'info')
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBuscando(false)
    }
  }

  async function tirar(f: FilaItem) {
    const motivo = window.prompt(`Tirar "${f.empresa}" da fila.\n\nQuer dizer o motivo? (ex.: "é franquia", "outra cidade"). Com motivo, ele aprende a não escolher empresas assim.`, '')
    if (motivo === null) return
    setFila((x) => x?.filter((y) => y.id !== f.id) ?? null)
    try {
      const r = await ag<{ licao: { texto: string } | null }>(`/fila/${f.id}/descartar`, { method: 'POST', json: { motivo } })
      if (r.licao) toast(`Aprendeu: ${r.licao.texto}`)
    } catch (err) {
      toast(erroTexto(err), 'error')
      void carregar()
    }
  }

  return (
    <Card
      title="Próximas empresas"
      description="Quem ele vai abordar, na ordem da nota de encaixe. Tire quem não combina: ele aprende com o motivo."
      actions={
        <div className="flex items-center gap-1.5">
          {alvos.length > 1 && (
            <select className="input h-7 w-auto text-xs" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value="">Cidade sorteada</option>
              {alvos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.cidade} - {a.uf}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" icon={<Search className="size-3.5" />} loading={buscando} disabled={!alvos.length} onClick={() => void buscar()}>
            Buscar agora
          </Button>
        </div>
      }
      bodyClass="px-2 py-1.5"
    >
      {fila === null ? (
        <div className="grid h-24 place-items-center">
          <Spinner />
        </div>
      ) : fila.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-fg-3">{alvos.length ? 'Fila vazia. Ele busca sozinho quando precisar, ou clique em "Buscar agora" para ver o que viria.' : 'Adicione cidades e tipos de negócio acima e salve.'}</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
          {fila.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-2 py-2">
              {typeof f.encaixe === 'number' && (
                <span
                  title={f.encaixeMotivos?.length ? `Nota de encaixe: ${f.encaixeMotivos.join(', ')}` : 'Nota de encaixe'}
                  className={clsx('num grid h-7 w-9 shrink-0 place-items-center rounded-md text-xs font-semibold ring-1 ring-inset', f.encaixe >= 75 ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : f.encaixe >= 50 ? 'bg-amber-400/10 text-amber-300 ring-amber-400/25' : 'text-fg-3 ring-line')}
                >
                  {f.encaixe}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="pv truncate text-[13px] font-medium text-fg">{f.empresa}</p>
                <p className="pv truncate text-xs text-fg-3">{[f.nicho, f.endereco || `${f.cidade} - ${f.uf}`, formatPhone(f.telefone)].filter(Boolean).join(' · ')}</p>
                {!!f.encaixeMotivos?.length && <p className="truncate text-2xs text-fg-4">{f.encaixeMotivos.join(' · ')}</p>}
              </div>
              <Button size="xs" variant="ghost" onClick={() => void tirar(f)}>
                Tirar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
