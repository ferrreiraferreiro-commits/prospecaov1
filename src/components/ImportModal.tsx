import clsx from 'clsx'
import { AlertTriangle, ClipboardPaste, Copy, FileText, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { formatPhone } from '../lib/contact'
import { buildDupIndex, DUP_REASON_LABEL, findMatches, type DupMatch } from '../lib/duplicates'
import { decodeFile, parseLeadsTxt, type ParseResult } from '../lib/parser'
import { fmtRating } from '../lib/script'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Button, Modal } from './ui'

interface Parsed extends ParseResult {
  arquivo: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ImportModal() {
  const open = useUi((s) => s.importOpen)
  const setOpen = useUi((s) => s.setImportOpen)
  if (!open) return null
  return <ImportFlow onClose={() => setOpen(false)} />
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const leads = useApp((s) => s.leads)
  const importLeads = useApp((s) => s.importLeads)
  const toast = useApp((s) => s.toast)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [pasteMode, setPasteMode] = useState(false)
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function load(text: string, arquivo: string) {
    const result = parseLeadsTxt(text)
    setError(result.leads.length ? null : result.warnings[0] ?? 'Nenhum lead encontrado no arquivo.')
    if (result.leads.length) {
      setParsed({ ...result, arquivo })
      setExcluded(new Set())
    }
  }

  async function readFile(file: File) {
    const buffer = await file.arrayBuffer()
    load(decodeFile(buffer), file.name)
  }

  // Possíveis duplicados: contra a base atual e dentro do próprio arquivo
  const dups = useMemo(() => {
    if (!parsed) return new Map<number, { match: DupMatch; label: string }[]>()
    const fileItems = parsed.leads.map((l, i) => ({ ...l, id: `file:${i}` }))
    const index = buildDupIndex([...leads, ...fileItems])
    const byId = new Map(leads.map((l) => [l.id, l]))
    const out = new Map<number, { match: DupMatch; label: string }[]>()
    fileItems.forEach((item, i) => {
      const matches = findMatches(item, index).map((match) => {
        if (match.otherId.startsWith('file:')) {
          const j = Number(match.otherId.slice(5))
          return { match, label: `#${String(parsed.leads[j].index).padStart(3, '0')} deste arquivo` }
        }
        return { match, label: `${byId.get(match.otherId)?.empresa ?? 'lead'} (já na base)` }
      })
      if (matches.length) out.set(i, matches)
    })
    return out
  }, [parsed, leads])

  const selectedCount = parsed ? parsed.leads.length - excluded.size : 0

  async function confirm() {
    if (!parsed || !selectedCount) return
    setImporting(true)
    try {
      const chosen = parsed.leads.filter((_, i) => !excluded.has(i))
      const n = await importLeads(chosen, parsed.arquivo)
      toast(`${plural(n, 'lead importado', 'leads importados')} com sucesso.`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar.')
      setImporting(false)
    }
  }

  const toggle = (i: number) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // ---- Prévia -------------------------------------------------------------
  if (parsed) {
    const exportDate = Object.entries(parsed.meta).find(([k]) => /data/i.test(k))?.[1]
    return (
      <Modal
        open
        onClose={onClose}
        width="max-w-3xl"
        title={plural(parsed.leads.length, 'lead encontrado', 'leads encontrados')}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-3" /> {parsed.arquivo}
            {exportDate && <span className="text-fg-4">· exportado em {exportDate}</span>}
          </span>
        }
        footer={
          <>
            <span className="mr-auto text-2xs text-fg-3">
              {dups.size > 0 ? `${plural(dups.size, 'possível duplicado', 'possíveis duplicados')} — desmarque o que não quiser importar.` : 'Nenhuma duplicidade encontrada.'}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={importing} disabled={!selectedCount} onClick={confirm}>
              Importar {plural(selectedCount, 'lead', 'leads')}
            </Button>
          </>
        }
      >
        {parsed.warnings.length > 0 && (
          <div className="mx-5 mt-4 space-y-1 rounded-md border border-gold/20 bg-gold/[0.05] px-3 py-2 text-xs text-fg-2">
            {parsed.warnings.map((w) => (
              <p key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" />
                {w}
              </p>
            ))}
          </div>
        )}
        {error && <p className="mx-5 mt-4 text-xs text-red-300">{error}</p>}
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-2 text-2xs text-fg-4">
          <input
            type="checkbox"
            className="size-3.5 accent-[#3fb97f]"
            checked={excluded.size === 0}
            onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(parsed.leads.map((_, i) => i)))}
            aria-label="Selecionar todos"
          />
          <span>Empresa</span>
        </div>
        <ul>
          {parsed.leads.map((l, i) => {
            const d = dups.get(i)
            const off = excluded.has(i)
            return (
              <li key={i} className={clsx('border-b border-line-soft last:border-0', off && 'opacity-45')}>
                <label className="flex cursor-pointer gap-3 px-5 py-2.5 hover:bg-tint/[0.02]">
                  <input type="checkbox" className="mt-0.5 size-3.5 shrink-0 accent-[#3fb97f]" checked={!off} onChange={() => toggle(i)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="num text-2xs text-fg-4">#{String(l.index).padStart(3, '0')}</span>
                      <span className="text-[13px] font-semibold">{l.empresa}</span>
                      {d && (
                        <span className="inline-flex items-center gap-1 rounded bg-orange-400/10 px-1.5 text-[10px] leading-4 font-medium text-orange-300">
                          <Copy className="size-2.5" /> Possível duplicado
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-3">
                      <span>{l.nicho ?? 'Nicho não informado'}</span>
                      <span className="num text-fg-2">{l.telefone ? formatPhone(l.telefone) : 'Sem telefone'}</span>
                      <span>{[l.cidade, l.estado].filter(Boolean).join(' - ') || 'Cidade não informada'}</span>
                      {l.avaliacao !== null && (
                        <span className="num">
                          ★ {fmtRating(l.avaliacao)} ({l.numero_avaliacoes ?? 0})
                        </span>
                      )}
                      <span className={l.website ? '' : 'text-gold/90'}>{l.website ? 'Com site' : 'Sem site'}</span>
                    </div>
                    {d && (
                      <div className="mt-1 text-2xs text-orange-300/80">
                        {d.map(({ match, label }) => (
                          <p key={match.otherId}>
                            {match.reasons.map((r) => DUP_REASON_LABEL[r]).join(' e ')} que {label}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      </Modal>
    )
  }

  // ---- Seleção do arquivo -------------------------------------------------
  return (
    <Modal open onClose={onClose} title="Importar leads" subtitle="Arquivo TXT exportado da sua busca de leads." width="max-w-xl">
      <div className="space-y-3 p-5">
        {!pasteMode ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) void readFile(file)
            }}
            className={clsx(
              'flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-go/60 bg-go/[0.05]' : 'border-line-strong hover:border-line-strong hover:bg-tint/[0.015]',
            )}
          >
            <Upload className="mb-3 size-5 text-fg-3" />
            <span className="text-sm font-medium">Arraste o arquivo aqui ou clique para escolher</span>
            <span className="mt-1 text-xs text-fg-3">Blocos numerados como “[001] EMPRESA” viram leads</span>
          </button>
        ) : (
          <div>
            <textarea
              className="input min-h-48 resize-y font-mono text-xs"
              placeholder={'[001] NOME DA EMPRESA\n  Categoria / Nicho : …\n  Telefone          : …'}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              autoFocus
              aria-label="Conteúdo do arquivo"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="primary" disabled={!pasted.trim()} onClick={() => load(pasted, 'texto colado')}>
                Ler leads
              </Button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void readFile(file)
            e.target.value = ''
          }}
        />
        {error && (
          <p className="flex items-start gap-2 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
          </p>
        )}
        <button onClick={() => setPasteMode((p) => !p)} className="inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
          {pasteMode ? <Upload className="size-3.5" /> : <ClipboardPaste className="size-3.5" />}
          {pasteMode ? 'Escolher arquivo' : 'Colar o conteúdo do arquivo'}
        </button>
      </div>
    </Modal>
  )
}
