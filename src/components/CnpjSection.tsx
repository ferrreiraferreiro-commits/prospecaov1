import { BadgeCheck, Search, TriangleAlert, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { fetchCnpj, formatCnpj, isValidCnpj, leadCnpj, pickResponsavel } from '../lib/cnpj'
import { digits } from '../lib/contact'
import { formatDateTime } from '../lib/dates'
import { titleCase } from '../lib/script'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'
import { Button } from './ui'

/** Abertura "2015-03-20" → "20/03/2015" */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/**
 * CNPJ e sócios (dados públicos da Receita via BrasilAPI).
 * O sócio só é sugerido como responsável quando nome, telefone e cidade conferem com o lead.
 */
export function CnpjSection({ lead }: { lead: Lead }) {
  const saveCnpj = useApp((s) => s.saveCnpj)
  const updateLeadWork = useApp((s) => s.updateLeadWork)
  const toast = useApp((s) => s.toast)
  const known = leadCnpj(lead)
  const [draft, setDraft] = useState(known ? formatCnpj(known) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = lead.cnpj_info ?? null
  const responsavel = info ? pickResponsavel(info.socios) : null

  const consult = async () => {
    const value = digits(draft)
    if (!isValidCnpj(value)) {
      setError('CNPJ inválido. Confira os 14 números.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetchCnpj(value, lead)
      await saveCnpj(lead.id, value, result)
      toast(result.confere ? 'Dados do CNPJ encontrados e conferidos.' : 'CNPJ encontrado, mas os dados não batem com este lead. Revise.', result.confere ? 'success' : 'info')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na consulta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void consult()
        }}
      >
        <input
          className="input num h-8 flex-1 text-xs"
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          aria-label="CNPJ"
        />
        <Button type="submit" size="sm" loading={loading} icon={<Search className="size-3.5" />} disabled={!draft.trim()}>
          {info ? 'Consultar de novo' : 'Consultar'}
        </Button>
      </form>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {!info && !error && (
        <p className="text-2xs leading-4 text-fg-4">
          Peça o CNPJ na ligação ou procure no site/rodapé da empresa. A consulta traz razão social, situação e os sócios — útil para saber com quem falar.
        </p>
      )}

      {info && (
        <div className="space-y-2.5 rounded-lg border border-line-soft bg-ink/60 p-3 text-xs">
          <p className={info.confere ? 'flex items-center gap-1.5 font-medium text-go' : 'flex items-center gap-1.5 font-medium text-orange-300'}>
            {info.confere ? <BadgeCheck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            {info.confere ? 'Confere com este lead (nome, telefone e cidade)' : 'Não conferiu com este lead — pode ser de outra empresa'}
          </p>
          <dl className="space-y-1">
            {info.razao_social && <Line label="Razão social">{info.razao_social}</Line>}
            {info.nome_fantasia && <Line label="Nome fantasia">{info.nome_fantasia}</Line>}
            {info.situacao && <Line label="Situação">{titleCase(info.situacao)}</Line>}
            {info.abertura && <Line label="Abertura">{fmtDate(info.abertura)}</Line>}
            {info.atividade && <Line label="Atividade">{info.atividade}</Line>}
            {info.municipio && <Line label="Município">{[titleCase(info.municipio), info.uf].filter(Boolean).join(' - ')}</Line>}
            {info.email && <Line label="E-mail">{info.email.toLowerCase()}</Line>}
          </dl>
          {info.socios.length > 0 && (
            <div className="border-t border-line-soft pt-2.5">
              <p className="mb-1.5 text-2xs font-medium text-fg-3">Sócios</p>
              <ul className="space-y-1.5">
                {info.socios.map((s) => {
                  const principal = s === responsavel || (responsavel && s.nome === responsavel.nome)
                  return (
                    <li key={s.nome} className="flex items-center gap-2">
                      <UserRound className="size-3.5 shrink-0 text-fg-4" />
                      <span className="min-w-0 flex-1">
                        <span className="text-fg">{titleCase(s.nome)}</span>
                        {s.qualificacao && <span className="text-fg-3"> · {s.qualificacao}</span>}
                      </span>
                      {principal && info.confere && !lead.falei_com && (
                        <button
                          onClick={() => {
                            void updateLeadWork(lead.id, { falei_com: titleCase(s.nome), cargo: s.qualificacao || null })
                            toast('Responsável salvo em “Falei com”.')
                          }}
                          className="shrink-0 text-2xs text-blue-300 hover:text-blue-200"
                        >
                          Usar como contato
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="text-2xs text-fg-4">Consultado em {formatDateTime(info.consultado_em)} · BrasilAPI (dados públicos da Receita)</p>
        </div>
      )}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <dt className="text-fg-3">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}
