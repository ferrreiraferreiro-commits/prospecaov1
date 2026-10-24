// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { BookOpen, CircleCheck, CircleDashed, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ag } from '../../lib/agente'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card, Field } from '../kit'
import { Button, Empty, Spinner } from '../ui'
import { ComoFunciona, Selo } from './Ajuda'
import { erroTexto, Texto } from './comum'

type Tipo = 'precos' | 'faq' | 'portfolio' | 'politica' | 'contrato' | 'pagamento' | 'outro'
interface Material {
  id: string
  titulo: string
  tipo: Tipo
  texto: string
  ativo: boolean
  atualizadoEm: string
  velho: boolean
}
interface Dados {
  lista: Material[]
  passos: { tipo: Tipo; texto: string; feito: boolean }[]
  tipos: Record<Tipo, string>
  lacunas: { id: string; pergunta: string; texto: string }[]
}

const VAZIO = { id: '', titulo: '', tipo: 'faq' as Tipo, texto: '' }

/** O que ele consulta antes de responder: o seu material, com citação da fonte em cada resposta. */
export function Base() {
  const toast = useApp((s) => s.toast)
  const [d, setD] = useState<Dados | null>(null)
  const [edit, setEdit] = useState<typeof VAZIO | null>(null)
  const [busy, setBusy] = useState(false)
  const [resposta, setResposta] = useState<Record<string, string>>({})

  const carregar = useCallback(() => ag<Dados>('/material', { timeoutMs: 10000 }).then(setD, () => setD(null)), [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar() {
    if (!edit) return
    setBusy(true)
    try {
      setD(await ag<Dados>('/material', { method: 'POST', json: { ...edit, id: edit.id || undefined } }))
      setEdit(null)
      toast('Material salvo. Ele já usa nas próximas respostas.')
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function apagar(m: Material) {
    if (!window.confirm(`Apagar "${m.titulo}"? Ele para de consultar este material.`)) return
    try {
      setD(await ag<Dados>(`/material/${m.id}`, { method: 'DELETE' }))
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  async function responderLacuna(id: string) {
    try {
      await ag(`/pendencias/${id}`, { method: 'POST', json: { acao: 'editar', mensagens: [resposta[id] ?? ''] } })
      toast('Resposta guardada no material.')
      void carregar()
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

  const feitos = d.passos.filter((p) => p.feito).length

  return (
    <div className="space-y-4">
      <ComoFunciona
        id="base"
        titulo="O que ele consulta antes de responder"
        passos={[
          <>Cadastre aqui preços, perguntas frequentes, portfólio e políticas. Antes de responder, ele procura aqui.</>,
          <>Preço, prazo e link só saem se estiverem no material: a conferência barra o que não estiver.</>,
          <>Em cada resposta, você vê de onde ele tirou a informação.</>,
          <>Quando um cliente pergunta algo que o material não responde, aparece em "Faltando" para você completar.</>,
        ]}
      />

      <Card title="Comece pelo que ele mais vai precisar" description={`${feitos} de ${d.passos.length} prontos. "Seu negócio" no Treino também conta.`} bodyClass="px-4 py-3 grid gap-1.5 sm:grid-cols-2">
        {d.passos.map((p) => (
          <button
            key={p.tipo}
            type="button"
            disabled={p.feito}
            onClick={() => setEdit({ ...VAZIO, tipo: p.tipo, titulo: d.tipos[p.tipo] })}
            className={clsx('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs', p.feito ? 'text-fg-3' : 'text-fg-2 hover:bg-hover')}
          >
            {p.feito ? <CircleCheck className="size-3.5 shrink-0 text-emerald-300" /> : <CircleDashed className="size-3.5 shrink-0 text-gold" />}
            {p.texto}
          </button>
        ))}
      </Card>

      {d.lacunas.length > 0 && (
        <Card title={<span className="flex items-center gap-1.5"><TriangleAlert className="size-3.5 text-gold" /> Faltando no material</span>} description="Clientes perguntaram e ele não achou a resposta. A sua resposta vira material." bodyClass="divide-y divide-line-soft">
          {d.lacunas.map((l) => (
            <div key={l.id} className="space-y-2 px-4 py-3">
              <p className="text-[13px] text-fg">“{l.pergunta}”</p>
              <p className="text-2xs text-fg-4">{l.texto}</p>
              <div className="flex gap-2">
                <input className="input flex-1" value={resposta[l.id] ?? ''} onChange={(e) => setResposta({ ...resposta, [l.id]: e.target.value })} placeholder="A resposta certa" />
                <Button size="sm" variant="primary" disabled={!resposta[l.id]?.trim()} onClick={() => void responderLacuna(l.id)}>
                  Guardar
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {edit && (
        <Card title={edit.id ? 'Editar material' : 'Novo material'} actions={<Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>} bodyClass="px-4 py-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Título">
              <input className="input" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} placeholder="Tabela de preços 2026" />
            </Field>
            <Field label="Tipo">
              <select className="input" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as Tipo })}>
                {(Object.keys(d.tipos) as Tipo[]).map((t) => (
                  <option key={t} value={t}>
                    {d.tipos[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Texto" hint="Escreva como explicaria para um vendedor novo. Parágrafos curtos ajudam ele a achar.">
            <Texto value={edit.texto} onChange={(v) => setEdit({ ...edit, texto: v })} rows={8} placeholder={'Site completo: R$ 1.200 à vista ou 3x de R$ 420.\nInclui: domínio por 1 ano, hospedagem, botão de WhatsApp.\nPrazo: 7 dias úteis.'} />
          </Field>
          <Button variant="primary" loading={busy} disabled={!edit.texto.trim()} onClick={() => void salvar()}>
            Salvar material
          </Button>
        </Card>
      )}

      <Card
        title="Seu material"
        description="Tudo o que está ligado entra na busca dele."
        actions={!edit && <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ ...VAZIO })}>Novo material</Button>}
        bodyClass="divide-y divide-line-soft"
      >
        {d.lista.length === 0 ? (
          <div className="p-4">
            <Empty icon={<BookOpen />} title="Nenhum material ainda">
              Comece pela tabela de preços e pelas perguntas que mais se repetem.
            </Empty>
          </div>
        ) : (
          d.lista.map((m) => (
            <div key={m.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                  {m.titulo} <Selo>{d.tipos[m.tipo]}</Selo>
                  {m.velho && <Selo tom="ouro">mais de 90 dias: confirme os preços</Selo>}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs whitespace-pre-wrap text-fg-3">{m.texto}</p>
                <p className="mt-0.5 text-2xs text-fg-4">Atualizado {formatRelative(m.atualizadoEm)}</p>
              </div>
              <button type="button" title="Editar" onClick={() => setEdit({ id: m.id, titulo: m.titulo, tipo: m.tipo, texto: m.texto })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg">
                <Pencil className="size-3.5" />
              </button>
              <button type="button" title="Apagar" onClick={() => void apagar(m)} className="grid size-7 place-items-center rounded-md text-fg-4 hover:bg-hover hover:text-red-300">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
