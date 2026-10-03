import { PlugZap, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMotor } from '../lib/motor'
import { Button } from './ui'

/** Explica como ligar o Motor XS quando uma tela precisa dele. */
export function MotorOffline({ feature }: { feature: string }) {
  const check = useMotor((s) => s.check)
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  return (
    <section className="panel flex flex-col gap-3 border-amber-400/25 bg-amber-400/[0.04] px-4 py-3.5 sm:flex-row sm:items-start">
      <PlugZap className="size-5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-fg">{feature} precisa do Motor XS ligado neste computador</p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-fg-2">
          <li>
            Na pasta do projeto, dê dois cliques em <strong className="text-fg">Iniciar Motor XS.bat</strong> (na primeira vez ele instala o que precisa).
          </li>
          <li>Deixe a janela preta aberta enquanto usa a busca e o disparo.</li>
          {isHttps && <li>Se o Chrome perguntar sobre acessar apps e serviços deste dispositivo, clique em Permitir.</li>}
        </ol>
        <p className="mt-1.5 text-fg-4">
          O motor roda no seu computador porque o Google Maps e o WhatsApp precisam de um navegador e de uma sessão sempre abertos — a Vercel não consegue fazer isso.{' '}
          <Link to="/configuracoes#motor" className="text-blue-300 hover:text-blue-200">
            Ajustes do motor
          </Link>
        </p>
      </div>
      <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void check()}>
        Verificar de novo
      </Button>
    </section>
  )
}
