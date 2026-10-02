import clsx from 'clsx'
import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { newId } from '../data/repository'
import { DEFAULT_MESSAGES, fillMessage, getMessages, MESSAGE_VARIABLES } from '../lib/messages'
import type { Lead, MessageTemplate } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button } from './ui'

const VAR_HINT: Record<string, string> = {
  '{saudacao}': 'Bom dia / Boa tarde / Boa noite, pela hora',
  '{responsavel}': 'Quem atendeu ou o sócio do CNPJ (some se não houver)',
  '{empresa}': 'Nome da empresa',
  '{cidade}': 'Cidade do lead',
  '{nicho}': 'Nicho em minúsculas',
  '{nome}': 'Seu primeiro nome',
  '{servico}': 'O que você oferece',
}

/** Modelos de mensagem: nome + variações (rodízio entre os leads). Variáveis entram no ponto do cursor. */
export function MessagesEditor() {
  const settings = useApp((s) => s.settings)
  const leads = useApp((s) => s.leads)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const [list, setList] = useState<MessageTemplate[]>(() => structuredClone(getMessages(settings)))
  const [selectedId, setSelectedId] = useState(list[0]?.id)
  const [dirty, setDirty] = useState(false)
  const focused = useRef<{ index: number; el: HTMLTextAreaElement } | null>(null)

  const selected = list.find((t) => t.id === selectedId) ?? list[0]
  const sample: Lead | undefined = leads.find((l) => l.falei_com) ?? leads[0]

  const update = (patch: Partial<MessageTemplate>) => {
    setList((l) => l.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)))
    setDirty(true)
  }
  const setVariation = (i: number, text: string) => update({ variacoes: selected.variacoes.map((v, j) => (j === i ? text : v)) })

  const insertVar = (token: string) => {
    const f = focused.current
    const i = f?.index ?? 0
    const current = selected.variacoes[i] ?? ''
    const start = f?.el.selectionStart ?? current.length
    const end = f?.el.selectionEnd ?? current.length
    setVariation(i, current.slice(0, start) + token + current.slice(end))
    requestAnimationFrame(() => {
      if (!f) return
      f.el.focus()
      f.el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = async (next = list) => {
    const clean = next
      .map((t) => ({ ...t, nome: t.nome.trim() || 'Sem nome', variacoes: t.variacoes.map((v) => v.trim()).filter(Boolean) }))
      .filter((t) => t.variacoes.length)
    await saveSettings({ ...settings, mensagens: clean.length ? clean : null })
    setList(clean.length ? clean : structuredClone(DEFAULT_MESSAGES))
    setDirty(false)
    toast('Mensagens salvas.')
  }

  if (!selected) {
    return (
      <Button size="sm" onClick={() => setList(structuredClone(DEFAULT_MESSAGES))}>
        Restaurar modelos padrão
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={clsx(
              'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
              t.id === selected.id ? 'border-line-strong bg-raised text-fg' : 'border-line bg-ink text-fg-3 hover:text-fg',
            )}
          >
            {t.nome || 'Sem nome'}
          </button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            const t = { id: newId(), nome: `Modelo ${list.length + 1}`, variacoes: ['{saudacao}! Aqui é o {nome}…'] }
            setList((l) => [...l, t])
            setSelectedId(t.id)
            setDirty(true)
          }}
        >
          Novo
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="msg-nome">
            Nome do modelo
          </label>
          <input id="msg-nome" className="input" value={selected.nome} onChange={(e) => update({ nome: e.target.value })} />
        </div>
        {list.length > 1 && (
          <Button
            size="md"
            variant="ghost"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => {
              const next = list.filter((t) => t.id !== selected.id)
              setList(next)
              setSelectedId(next[0].id)
              void save(next)
            }}
          >
            Excluir
          </Button>
        )}
      </div>

      <div>
        <p className="label">Variáveis (clique para inserir no texto)</p>
        <div className="flex flex-wrap gap-1">
          {MESSAGE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              title={VAR_HINT[v]}
              onMouseDown={(e) => e.preventDefault()} // mantém o cursor no texto
              onClick={() => insertVar(v)}
              className="num h-6 rounded-[5px] border border-line bg-ink px-1.5 text-2xs text-teal-300 hover:border-line-strong"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {selected.variacoes.map((v, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center gap-2">
              <span className="label mb-0">Variação {i + 1}</span>
              {selected.variacoes.length > 1 && (
                <button onClick={() => update({ variacoes: selected.variacoes.filter((_, j) => j !== i) })} className="ml-auto text-fg-4 hover:text-fg" aria-label={`Remover variação ${i + 1}`}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <textarea
              className="input resize-y leading-5"
              rows={3}
              value={v}
              onFocus={(e) => (focused.current = { index: i, el: e.currentTarget })}
              onChange={(e) => setVariation(i, e.target.value)}
            />
            {sample && v.trim() && (
              <p className="mt-1 text-2xs leading-4 text-fg-3">
                <span className="text-fg-4">Ex. ({sample.empresa}): </span>
                {fillMessage(v, sample, settings)}
              </p>
            )}
          </div>
        ))}
        <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => update({ variacoes: [...selected.variacoes, ''] })}>
          Adicionar variação
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        <button
          onClick={() => {
            setList(structuredClone(DEFAULT_MESSAGES))
            setSelectedId(DEFAULT_MESSAGES[0].id)
            setDirty(true)
          }}
          className="inline-flex items-center gap-1.5 text-2xs text-fg-3 hover:text-fg"
        >
          <RotateCcw className="size-3" /> Restaurar modelos padrão
        </button>
        <span className="ml-auto text-2xs text-fg-4">{dirty ? 'Alterações não salvas' : ''}</span>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => save()}>
          Salvar mensagens
        </Button>
      </div>
    </div>
  )
}
