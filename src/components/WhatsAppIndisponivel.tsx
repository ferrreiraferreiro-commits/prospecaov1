import { CloudOff, RefreshCw } from 'lucide-react'
import { MSG_INDISPONIVEL, useWaServico } from '../lib/waServico'
import { Button } from './ui'

/** O serviço de WhatsApp da XS não respondeu: só um aviso amigável, com "tentar de novo". */
export function WhatsAppIndisponivel() {
  const check = useWaServico((s) => s.check)
  return (
    <section className="panel flex flex-col gap-3 border-amber-400/25 bg-amber-400/[0.04] px-4 py-3.5 sm:flex-row sm:items-center">
      <CloudOff className="size-5 shrink-0 text-amber-300" />
      <p className="min-w-0 flex-1 text-xs text-fg-2">{MSG_INDISPONIVEL}</p>
      <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void check()}>
        Tentar de novo
      </Button>
    </section>
  )
}
