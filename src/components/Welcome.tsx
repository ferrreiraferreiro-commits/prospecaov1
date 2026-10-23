import clsx from 'clsx'
import { ExternalLink, PlayCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CANAL_TUTORIAIS } from '../lib/tutoriais'
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

  // Tudo começa em branco: quem preenche é a pessoa
  const [nome, setNome] = useState('')
  const [servico, setServico] = useState('')
  const [cidade, setCidade] = useState('')
  const [meta, setMeta] = useState(settings.meta_diaria || 30)
  const [saving, setSaving] = useState(false)
  const [etapa, setEtapa] = useState<'ola' | 'canal' | 'form'>('ola')

  if (!profile || profile.boas_vindas_feitas) return null

  async function finish(e?: FormEvent) {
    e?.preventDefault()
    setSaving(true)
    try {
      const n = nome.trim() || profile?.nome?.trim() || ''
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

  if (etapa !== 'form')
    return createPortal(
      <div className="anim-fade fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-sm">
        <Intro nome={profile.nome?.trim().split(/\s+/)[0] ?? ''} canal={etapa === 'canal'} onCanal={() => setEtapa('canal')} onContinuar={() => setEtapa('form')} />
      </div>,
      document.body,
    )

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
              Boas-vindas à XS Prospecção
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

/** Quanto tempo o "Olá" fica sozinho no meio da tela antes de subir */
const OLA_MS = 2600

/**
 * Abertura do primeiro acesso: "Olá, seja bem-vindo" no meio da tela; depois o texto sobe e aparece o
 * canal de tutoriais. Clicar em qualquer lugar adianta.
 */
function Intro({ nome, canal, onCanal, onContinuar }: { nome: string; canal: boolean; onCanal: () => void; onContinuar: () => void }) {
  const cartao = useRef<HTMLDivElement>(null)
  const continuar = useRef<HTMLButtonElement>(null)
  const avancar = useRef(onCanal)
  avancar.current = onCanal
  // Enquanto o cartão está escondido, o "Olá" desce metade da altura dele para ficar no meio da tela
  const [desce, setDesce] = useState(0)

  useLayoutEffect(() => {
    setDesce((cartao.current?.offsetHeight ?? 0) / 2 + 20)
  }, [])

  useEffect(() => {
    if (canal) {
      const t = setTimeout(() => continuar.current?.focus({ preventScroll: true }), 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => avancar.current(), OLA_MS)
    return () => clearTimeout(t)
  }, [canal])

  const atraso = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties
  const palavras = ['Olá,', nome ? `${nome}!` : 'tudo bem?']

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="bv-ola"
      onClick={() => !canal && onCanal()}
      className="flex min-h-full flex-col items-center justify-center gap-10 px-4 py-10"
    >
      <div
        className="flex flex-col items-center text-center"
        style={{
          transform: canal ? 'translateY(0) scale(0.86)' : `translateY(${desce}px)`,
          transition: 'transform 900ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span className="land-in" style={atraso(0)}>
          <LogoMark size={64} />
        </span>
        <h1 id="bv-ola" className="mt-6 text-4xl leading-tight font-semibold tracking-[-0.03em] text-fg sm:text-5xl">
          {palavras.map((p, i) => (
            <span key={i} className="land-in inline-block pv" style={atraso(250 + i * 220)}>
              {p}
              {i < palavras.length - 1 && ' '}
            </span>
          ))}
        </h1>
        <p className="land-in mt-3 text-base text-fg-2 sm:text-lg" style={atraso(800)}>
          Seja bem-vindo à XS Prospecção
        </p>
      </div>

      <div
        ref={cartao}
        aria-hidden={!canal}
        className={clsx(
          'w-full max-w-md rounded-2xl border border-line bg-panel px-6 py-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)] transition-[opacity,transform,visibility] duration-700 ease-out',
          canal ? 'visible translate-y-0 opacity-100 delay-200' : 'invisible translate-y-4 opacity-0',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400">
            <PlayCircle className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">Canal de tutoriais</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              Vídeos no YouTube mostrando, passo a passo, como usar cada parte da XS. Ficou com dúvida? A resposta está lá.
            </p>
          </div>
        </div>
        <a
          href={CANAL_TUTORIAIS}
          target="_blank"
          rel="noreferrer"
          tabIndex={canal ? 0 : -1}
          className="mt-5 flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-raised text-xs font-medium text-fg transition-colors hover:border-line-strong"
        >
          <PlayCircle className="size-4 text-red-400" strokeWidth={1.75} />
          Abrir o canal no YouTube
          <ExternalLink className="size-3.5 text-fg-4" />
        </a>
        <Button ref={continuar} variant="primary" size="lg" className="mt-2 w-full" tabIndex={canal ? 0 : -1} onClick={onContinuar}>
          Continuar
        </Button>
        <p className="mt-3 text-center text-2xs text-fg-4">O canal também fica no menu, em Tutoriais.</p>
      </div>
    </div>
  )
}
