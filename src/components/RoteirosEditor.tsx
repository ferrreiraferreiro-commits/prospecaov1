import clsx from 'clsx'
import { Check, Copy, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { newId } from '../data/repository'
import { DEFAULT_OBJECTIONS, DEFAULT_SCRIPT, getActiveRoteiro, getRoteiros } from '../lib/script'
import type { Objection, Roteiro, ScriptSection } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button } from './ui'

function blankRoteiro(nome: string): Roteiro {
  return {
    id: newId(),
    nome,
    secoes: structuredClone(DEFAULT_SCRIPT).map((s) => ({ ...s, id: newId() })),
    objecoes: structuredClone(DEFAULT_OBJECTIONS).map((o) => ({ ...o, id: newId() })),
  }
}

/** Vários roteiros: criar, duplicar, renomear, excluir e escolher qual usar nas ligações. */
export function RoteirosEditor() {
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)

  const [list, setList] = useState<Roteiro[]>(() => structuredClone(getRoteiros(settings)))
  const [ativoId, setAtivoId] = useState(() => getActiveRoteiro(settings).id)
  const [selectedId, setSelectedId] = useState(ativoId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dirty, setDirty] = useState(false)

  const selected = list.find((r) => r.id === selectedId) ?? list[0]

  function update(patch: Partial<Roteiro>) {
    setList((l) => l.map((r) => (r.id === selected.id ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const setSecoes = (secoes: ScriptSection[]) => update({ secoes })
  const setObjecoes = (objecoes: Objection[]) => update({ objecoes })

  async function persist(nextList: Roteiro[], nextAtivo: string, message: string) {
    const clean = nextList.map((r) => ({
      ...r,
      nome: r.nome.trim() || 'Sem nome',
      secoes: r.secoes.filter((s) => s.titulo.trim() || s.texto.trim()),
      objecoes: r.objecoes.filter((o) => o.titulo.trim() && o.resposta.trim()),
    }))
    await saveSettings({ ...settings, roteiros: clean, roteiro_ativo: nextAtivo, roteiro: null, objecoes: null })
    setDirty(false)
    toast(message)
  }

  function add(copyFrom?: Roteiro) {
    const r = copyFrom
      ? { ...structuredClone(copyFrom), id: newId(), nome: `${copyFrom.nome} (cópia)` }
      : blankRoteiro(`Roteiro ${list.length + 1}`)
    setList((l) => [...l, r])
    setSelectedId(r.id)
    setConfirmDelete(false)
    setDirty(true)
  }

  async function remove() {
    if (list.length <= 1) return
    const next = list.filter((r) => r.id !== selected.id)
    const nextAtivo = ativoId === selected.id ? next[0].id : ativoId
    setList(next)
    setAtivoId(nextAtivo)
    setSelectedId(next[0].id)
    setConfirmDelete(false)
    await persist(next, nextAtivo, 'Roteiro excluído.')
  }

  async function useThis() {
    setAtivoId(selected.id)
    await persist(list, selected.id, `“${selected.nome}” será usado nas próximas ligações.`)
  }

  return (
    <div className="space-y-4">
      {/* Abas dos roteiros */}
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setSelectedId(r.id)
              setConfirmDelete(false)
            }}
            className={clsx(
              'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors',
              r.id === selected.id ? 'border-gold/40 bg-gold/10 text-fg' : 'border-line bg-ink text-fg-2 hover:text-fg',
            )}
          >
            {r.nome || 'Sem nome'}
            {r.id === ativoId && <span className="rounded bg-go/15 px-1 text-[10px] leading-4 text-go">em uso</span>}
          </button>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => add()}>
          Novo
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => add(selected)} title="Criar uma cópia deste roteiro para testar uma variação">
          Duplicar
        </Button>
      </div>

      {/* Cabeçalho do roteiro selecionado */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft bg-ink/50 p-3">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="rt-nome">Nome do roteiro</label>
          <input id="rt-nome" className="input" value={selected.nome} onChange={(e) => update({ nome: e.target.value })} />
        </div>
        {selected.id !== ativoId ? (
          <Button size="md" variant="secondary" className="border-go/30 text-go hover:bg-go/10" icon={<Check className="size-3.5" />} onClick={useThis}>
            Usar nas ligações
          </Button>
        ) : (
          <span className="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-go">
            <Check className="size-3.5" /> Em uso nas ligações
          </span>
        )}
        <Button
          size="md"
          variant="ghost"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => update({ secoes: structuredClone(DEFAULT_SCRIPT), objecoes: structuredClone(DEFAULT_OBJECTIONS) })}
          title="Substituir o texto deste roteiro pelo padrão"
        >
          Texto padrão
        </Button>
        {list.length > 1 &&
          (confirmDelete ? (
            <Button size="md" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={remove}>
              Confirmar exclusão
            </Button>
          ) : (
            <Button size="md" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)}>
              Excluir
            </Button>
          ))}
      </div>

      {/* Etapas */}
      <div className="space-y-3">
        {selected.secoes.map((sec, i) => (
          <div key={sec.id} className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
            <input
              className="input font-medium"
              value={sec.titulo}
              onChange={(e) => setSecoes(selected.secoes.map((s, j) => (j === i ? { ...s, titulo: e.target.value } : s)))}
              aria-label="Título da etapa"
            />
            <textarea
              className="input resize-y"
              rows={Math.min(6, Math.max(2, sec.texto.split('\n').length))}
              value={sec.texto}
              onChange={(e) => setSecoes(selected.secoes.map((s, j) => (j === i ? { ...s, texto: e.target.value } : s)))}
              aria-label={`Texto de ${sec.titulo}`}
            />
            <button onClick={() => setSecoes(selected.secoes.filter((_, j) => j !== i))} className="self-start rounded p-1.5 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Remover etapa">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setSecoes([...selected.secoes, { id: newId(), titulo: 'Nova etapa', texto: '' }])}>
          Adicionar etapa
        </Button>
      </div>

      <h3 className="pt-2 text-xs font-semibold text-fg-2">Objeções deste roteiro</h3>
      <div className="space-y-3">
        {selected.objecoes.map((o, i) => (
          <div key={o.id} className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
            <input
              className="input font-medium"
              value={o.titulo}
              onChange={(e) => setObjecoes(selected.objecoes.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
              aria-label="Objeção"
            />
            <textarea
              className="input resize-y"
              rows={2}
              value={o.resposta}
              onChange={(e) => setObjecoes(selected.objecoes.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))}
              aria-label={`Resposta para ${o.titulo}`}
            />
            <button onClick={() => setObjecoes(selected.objecoes.filter((_, j) => j !== i))} className="self-start rounded p-1.5 text-fg-4 hover:bg-hover hover:text-fg" aria-label="Remover objeção">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setObjecoes([...selected.objecoes, { id: newId(), titulo: '', resposta: '' }])}>
          Adicionar objeção
        </Button>
      </div>

      <div className="sticky bottom-20 flex items-center justify-end gap-3 border-t border-line-soft bg-panel pt-3 lg:bottom-0">
        {dirty && <span className="text-2xs text-gold">Alterações não salvas</span>}
        <Button variant="primary" size="sm" onClick={() => persist(list, ativoId, 'Roteiros salvos.')} disabled={!dirty}>
          Salvar roteiros
        </Button>
      </div>
    </div>
  )
}
