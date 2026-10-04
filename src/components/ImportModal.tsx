import clsx from 'clsx'
import { AlertTriangle, ClipboardPaste, Copy, FileText, Plus, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { formatPhone } from '../lib/contact'
import { buildDupIndex, DUP_REASON_LABEL, findMatches, type DupMatch } from '../lib/duplicates'
import { decodeFile, splitCity, type ParseResult } from '../lib/parser'
import { parseLeadsAny } from '../lib/sheet'
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
  const [mode, setMode] = useState<'arquivo' | 'colar' | 'manual'>('arquivo')
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function load(text: string, arquivo: string) {
    const result = parseLeadsAny(text)
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
    <Modal
      open
      onClose={onClose}
      title={mode === 'manual' ? 'Novo lead' : 'Importar leads'}
      subtitle={mode === 'manual' ? 'Cadastre uma empresa à mão.' : 'Planilha (CSV), linhas copiadas da planilha ou relatório em TXT.'}
      width="max-w-xl"
    >
      <div className="space-y-3 p-5">
        {mode === 'manual' ? (
          <ManualLead onDone={onClose} />
        ) : mode === 'arquivo' ? (
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
            <span className="mt-1 text-xs text-fg-3">CSV com uma linha de títulos (Empresa, Telefone, Cidade…) ou o relatório em TXT</span>
          </button>
        ) : (
          <div>
            <textarea
              className="input min-h-48 resize-y font-mono text-xs"
              placeholder={'Copie as linhas da planilha, junto com a linha dos títulos, e cole aqui:\n\nEmpresa\tTelefone\tCidade\nPadaria Sol\t(43) 99999-0000\tLondrina - PR'}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              autoFocus
              aria-label="Linhas da planilha"
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
          accept=".csv,.tsv,.txt,text/csv,text/plain"
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
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {mode !== 'arquivo' && (
            <button onClick={() => setMode('arquivo')} className="inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
              <Upload className="size-3.5" /> Escolher arquivo
            </button>
          )}
          {mode !== 'colar' && (
            <button onClick={() => setMode('colar')} className="inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
              <ClipboardPaste className="size-3.5" /> Colar da planilha
            </button>
          )}
          {mode !== 'manual' && (
            <button onClick={() => setMode('manual')} className="inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
              <Plus className="size-3.5" /> Cadastrar um lead à mão
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Um lead cadastrado à mão (sem arquivo). */
function ManualLead({ onDone }: { onDone: () => void }) {
  const importLeads = useApp((s) => s.importLeads)
  const toast = useApp((s) => s.toast)
  const [f, setF] = useState({ empresa: '', telefone: '', nicho: '', cidade: '', instagram: '', website: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const v = (s: string) => s.trim() || null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.empresa.trim()) return
    setSaving(true)
    try {
      const { cidade, estado } = splitCity(v(f.cidade))
      await importLeads(
        [
          {
            index: 1,
            empresa: f.empresa.trim(),
            nicho: v(f.nicho),
            telefone: v(f.telefone),
            whatsapp: null,
            instagram: v(f.instagram),
            website: v(f.website),
            endereco: null,
            cidade,
            estado,
            avaliacao: null,
            numero_avaliacoes: null,
            pasta: null,
            etapa: null,
            maps_url: null,
            observacoes: null,
            dados_extras: null,
            status: 'novo',
          },
        ],
        'Cadastro manual',
      )
      toast(`${f.empresa.trim()} entrou nos seus leads.`)
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ml-empresa">Empresa</label>
        <input id="ml-empresa" className="input h-9" value={f.empresa} onChange={set('empresa')} required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="ml-tel">Telefone / WhatsApp</label>
        <input id="ml-tel" className="input h-9" value={f.telefone} onChange={set('telefone')} inputMode="tel" placeholder="(43) 99999-0000" />
      </div>
      <div>
        <label className="label" htmlFor="ml-nicho">Nicho</label>
        <input id="ml-nicho" className="input h-9" value={f.nicho} onChange={set('nicho')} placeholder="Ex.: Barbearia" />
      </div>
      <div>
        <label className="label" htmlFor="ml-cidade">Cidade</label>
        <input id="ml-cidade" className="input h-9" value={f.cidade} onChange={set('cidade')} placeholder="Cidade - UF" />
      </div>
      <div>
        <label className="label" htmlFor="ml-insta">Instagram</label>
        <input id="ml-insta" className="input h-9" value={f.instagram} onChange={set('instagram')} placeholder="@perfil" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ml-site">Site</label>
        <input id="ml-site" className="input h-9" value={f.website} onChange={set('website')} placeholder="Deixe vazio se não tiver" />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" loading={saving} disabled={!f.empresa.trim()}>
          Salvar lead
        </Button>
      </div>
    </form>
  )
}
