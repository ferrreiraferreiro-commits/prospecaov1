import clsx from 'clsx'
import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAccount } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { LogoMark } from './Brand'
import { Button } from './ui'

const SERVICOS = ['Criação de sites', 'Landing pages', 'Tráfego pago', 'Social media', 'Identidade visual']
const METAS = [20, 30, 50, 80]
const MAPS_FORM_KEY = 'xs-prospeccao:busca-maps'

/** Já deixa a cidade pronta na busca do Maps. */
function prefillMapsCity(cidade: string) {
  try {
    const form = JSON.parse(localStorage.getItem(MAPS_FORM_KEY) ?? '{}') as { location?: string }
    if (!form.location) localStorage.setItem(MAPS_FORM_KEY, JSON.stringify({ ...form, location: cidade }))
  } catch {
    /* sem armazenamento */
  }
}

/** Primeiro acesso: um cartão no meio da tela com o básico para o app já sair ajustado. */
export function Welcome() {
  const profile = useAccount((s) => s.profile)
  const saveProfile = useAccount((s) => s.save)
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)

  const [nome, setNome] = useState(profile?.nome ?? settings.nome_vendedor ?? '')
  const [servico, setServico] = useState(settings.servico ?? '')
  const [cidade, setCidade] = useState(profile?.cidade ?? '')
  const [meta, setMeta] = useState(settings.meta_diaria || 30)
  const [saving, setSaving] = useState(false)

  if (!profile || profile.boas_vindas_feitas) return null

  async function finish(e?: FormEvent) {
    e?.preventDefault()
    setSaving(true)
    try {
      const n = nome.trim()
      const c = cidade.trim()
      await saveSettings({
        ...settings,
        nome_vendedor: n || settings.nome_vendedor,
        servico: servico.trim() || settings.servico,
        meta_diaria: meta > 0 ? meta : settings.meta_diaria,
      })
      if (c) prefillMapsCity(c)
      await saveProfile({ nome: n || null, cidade: c || null, boas_vindas_feitas: true })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={(e) => void finish(e)}
        role="dialog"
        aria-modal
        aria-labelledby="bv-titulo"
        className="anim-rise w-full max-w-md space-y-5 rounded-2xl border border-line bg-panel px-6 py-7 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)]"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={56} />
          <div>
            <h2 id="bv-titulo" className="text-lg leading-6 font-semibold tracking-[-0.01em]">
              Bem-vindo ao XS Prospecção
            </h2>
            <p className="mt-1 text-xs text-fg-3">Quatro respostas rápidas e o app já fica do seu jeito. Dá para mudar depois em Ajustes.</p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="bv-nome">
            Seu nome
          </label>
          <input id="bv-nome" className="input h-9" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como você se apresenta na ligação" autoFocus required />
        </div>

        <div>
          <label className="label" htmlFor="bv-servico">
            O que você vende
          </label>
          <input id="bv-servico" className="input h-9" value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: criação de sites" />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SERVICOS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setServico(s)}
                className={clsx(
                  'h-6 rounded-md border px-2 text-2xs transition-colors',
                  servico === s ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:text-fg-2',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="bv-cidade">
            Cidade onde você prospecta
          </label>
          <input id="bv-cidade" className="input h-9" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade, UF" />
        </div>

        <div>
          <p className="label">Meta de ligações por dia</p>
          <div className="flex items-center gap-1">
            {METAS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeta(m)}
                className={clsx(
                  'num h-8 flex-1 rounded-md border text-xs font-medium transition-colors',
                  meta === m ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-line text-fg-3 hover:text-fg-2',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={saving}>
            Começar
          </Button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveProfile({ boas_vindas_feitas: true }).catch(() => undefined)}
            className="block w-full text-center text-2xs text-fg-4 hover:text-fg-2"
          >
            Pular por agora
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
