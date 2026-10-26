// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { sugestaoVariavel, textoDoModelo, useModelosMeta, valoresParaLead, type ModeloMeta } from '../lib/meta'
import type { Lead } from '../lib/types'
import { useApp } from '../store/useApp'
import { Field } from './kit'
import { Button, Spinner } from './ui'

export interface EscolhaModelo {
  modelo: ModeloMeta | null
  /** Um campo por variável do corpo; aceita {empresa}, {cidade}, {responsavel}, {nicho}, {saudacao} */
  campos: string[]
}

export const chaveModelo = (m: Pick<ModeloMeta, 'nome' | 'idioma'>) => `${m.nome}|${m.idioma}`

/** Campos iniciais de um modelo recém-escolhido. */
export const camposIniciais = (m: ModeloMeta | null) => (m ? m.variaveis.map((v, i) => sugestaoVariavel(v, i)) : [])

/**
 * Escolha de um modelo aprovado pela Meta + o valor de cada variável + prévia para um lead.
 * Usado no Disparo e nas Conversas (fora da janela de 24 h) da API oficial.
 */
export function MetaModelo({ valor, onChange, lead, compacto }: { valor: EscolhaModelo; onChange: (v: EscolhaModelo) => void; lead: Lead | null; compacto?: boolean }) {
  const { modelos, erro, carregando, carregar } = useModelosMeta()
  const settings = useApp((s) => s.settings)

  useEffect(() => {
    void carregar()
  }, [carregar])

  const usaveis = useMemo(() => (modelos ?? []).filter((m) => m.suportado), [modelos])
  const outros = useMemo(() => (modelos ?? []).filter((m) => !m.suportado), [modelos])

  // Primeiro modelo já vem escolhido
  useEffect(() => {
    if (!valor.modelo && usaveis[0]) onChange({ modelo: usaveis[0], campos: camposIniciais(usaveis[0]) })
  }, [usaveis, valor.modelo, onChange])

  const previa = valor.modelo ? textoDoModelo(valor.modelo, valoresParaLead(valor.campos, lead, settings)) : ''

  if (!modelos) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-ink px-3 py-2.5 text-xs text-fg-3">
        {erro ? (
          <>
            <span className="flex-1 text-red-300">{erro}</span>
            <Button size="xs" variant="ghost" icon={<RefreshCw className="size-3" />} onClick={() => void carregar(true)}>
              Tentar de novo
            </Button>
          </>
        ) : (
          <>
            <Spinner className="size-3.5" /> Buscando os modelos aprovados na Meta…
          </>
        )}
      </div>
    )
  }

  if (!usaveis.length) {
    return (
      <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2.5 text-xs leading-5 text-amber-100">
        Nenhum modelo aprovado que a XS consiga enviar. Crie um modelo só com texto no{' '}
        <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-300 hover:text-blue-200">
          Gerenciador do WhatsApp
        </a>{' '}
        e espere a Meta aprovar.
        {outros.length > 0 && <span className="block text-2xs text-fg-3">{outros.length} modelo(s) aprovados têm foto, vídeo ou variável em botão — ainda não saem pela XS.</span>}
        <Button size="xs" variant="ghost" className="mt-1" loading={carregando} icon={<RefreshCw className="size-3" />} onClick={() => void carregar(true)}>
          Atualizar
        </Button>
      </div>
    )
  }

  return (
    <div className={compacto ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-end gap-2">
        <Field label="Modelo aprovado" className="flex-1">
          <select
            className="input"
            value={valor.modelo ? chaveModelo(valor.modelo) : ''}
            onChange={(e) => {
              const m = usaveis.find((x) => chaveModelo(x) === e.target.value) ?? null
              onChange({ modelo: m, campos: camposIniciais(m) })
            }}
          >
            {usaveis.map((m) => (
              <option key={chaveModelo(m)} value={chaveModelo(m)}>
                {m.nome} · {m.idioma} · {m.categoria === 'MARKETING' ? 'marketing' : m.categoria === 'UTILITY' ? 'utilidade' : m.categoria.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Button size={compacto ? 'sm' : 'md'} variant="ghost" loading={carregando} aria-label="Atualizar modelos" title="Buscar de novo na Meta" icon={<RefreshCw className="size-3.5" />} onClick={() => void carregar(true)} />
      </div>

      {valor.modelo && valor.modelo.variaveis.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {valor.modelo.variaveis.map((v, i) => (
            <Field key={v} label={`Variável {{${v}}}`}>
              <input
                className="input"
                value={valor.campos[i] ?? ''}
                onChange={(e) => onChange({ ...valor, campos: valor.campos.map((c, j) => (j === i ? e.target.value : c)) })}
                placeholder="{empresa}, {cidade}… ou um texto"
              />
            </Field>
          ))}
          <p className="text-2xs leading-4 text-fg-4 sm:col-span-2">
            Use {'{empresa}'}, {'{responsavel}'}, {'{cidade}'}, {'{nicho}'} ou {'{saudacao}'}: a XS troca pelos dados de cada lead. Variável vazia vira “-”.
          </p>
        </div>
      )}

      {valor.modelo && (
        <div className="rounded-lg border border-line-soft bg-ink p-3">
          <p className="mb-1 text-2xs font-semibold text-fg-3">Prévia{lead ? ` · ${lead.empresa}` : ''}</p>
          <p className="pv text-xs leading-5 whitespace-pre-wrap text-fg-2">{previa}</p>
          {valor.modelo.botoes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {valor.modelo.botoes.map((b) => (
                <span key={b} className="rounded-md border border-line-soft px-2 py-0.5 text-2xs text-blue-300">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
