// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { ExternalLink, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useGoogleKey } from '../store/useGoogleKey'
import { mapsApi } from '../store/useMapsSearch'
import { Button } from './ui'

/**
 * Mesmo destino do botão "Receber uma chave de demonstração" da página oficial (developers.google.com/maps/demo-key):
 * mostra os termos (quem nunca aceitou precisa deles) e em seguida gera a chave, sem cartão.
 */
export const DEMO_KEY_URL = 'https://console.cloud.google.com/google/maps-hosted/tos?ref=https%3A%2F%2Fdevelopers.google.com%2Fmaps%2F&hl=pt-br'

/** Botão que abre o Google direto na tela da chave grátis (sem cartão). */
export function GetDemoKeyButton({ className }: { className?: string }) {
  return (
    <a
      href={DEMO_KEY_URL}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#3b7bf6]',
        className,
      )}
    >
      Pegar minha chave grátis no Google <ExternalLink className="size-3.5" />
    </a>
  )
}

/** Campo para colar a chave: confere com o Google (consulta que não é cobrada) e salva na conta. */
export function GoogleKeyPaste({ label, className }: { label?: string; className?: string }) {
  const toast = useApp((s) => s.toast)
  const save = useGoogleKey((s) => s.save)
  const [draft, setDraft] = useState('')
  const [testing, setTesting] = useState(false)

  async function testAndSave() {
    const k = draft.trim()
    if (!k) return toast('Cole a chave do Google no campo.', 'error')
    setTesting(true)
    try {
      await mapsApi({ acao: 'testar', chave: k })
      await save({ chave: k })
      setDraft('')
      toast('Chave conferida e salva. A busca do Google está liberada.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui conferir a chave.', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor="g-chave" className="label">
          {label}
        </label>
      )}
      <div className="flex gap-1.5">
        <input
          id="g-chave"
          className="pv input font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void testAndSave()}
          placeholder="Cole aqui a chave (AIza…)"
          autoComplete="off"
          spellCheck={false}
        />
        <Button variant="primary" loading={testing} icon={<KeyRound className="size-3.5" />} onClick={() => void testAndSave()}>
          Salvar
        </Button>
      </div>
    </div>
  )
}
