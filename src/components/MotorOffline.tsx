import { Download, PlugZap, RefreshCw, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMotor } from '../lib/motor'
import { Button } from './ui'

export const MOTOR_DOWNLOAD = '/downloads/Motor-WhatsApp-XS.zip'

/** Passo a passo para instalar e abrir o Motor WhatsApp XS (Windows). */
export function MotorSteps({ https }: { https?: boolean }) {
  return (
    <ol className="list-decimal space-y-0.5 pl-4 text-fg-2">
      <li>
        Baixe o <strong className="text-fg">Motor WhatsApp XS</strong> (Windows, ~35 MB) e extraia o arquivo <strong className="text-fg">Motor WhatsApp XS.exe</strong> numa pasta fixa (ex.: Documentos).
      </li>
      <li>
        Dê dois cliques nele. Se o Windows avisar "O Windows protegeu o computador", clique em <strong className="text-fg">Mais informações → Executar assim mesmo</strong>.
      </li>
      <li>Deixe a janela preta aberta enquanto os disparos acontecem.</li>
      {https && <li>Se o navegador perguntar se o site pode acessar apps e serviços deste dispositivo, clique em Permitir.</li>}
    </ol>
  )
}

/** O motor pode até estar aberto, mas o navegador negou a este site falar com ele. */
export function NavegadorBloqueou() {
  const host = typeof window !== 'undefined' ? window.location.host : 'o site'
  return (
    <section className="panel flex flex-col gap-3 border-red-400/30 bg-red-400/[0.05] px-4 py-3.5 sm:flex-row sm:items-start">
      <ShieldAlert className="size-5 shrink-0 text-red-300" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="mb-1.5 font-semibold text-fg">O navegador está bloqueando o Motor WhatsApp XS</p>
        <p className="mb-1.5 text-fg-2">Se a janela preta do motor já está aberta, falta só liberar o acesso no navegador:</p>
        <ol className="list-decimal space-y-0.5 pl-4 text-fg-2">
          <li>
            Clique no ícone à esquerda do endereço <strong className="text-fg">{host}</strong>, lá em cima.
          </li>
          <li>
            Em <strong className="text-fg">Apps e serviços neste dispositivo</strong> (ou <strong className="text-fg">Rede local</strong>), escolha <strong className="text-fg">Permitir</strong>. Se não aparecer ali, abra <strong className="text-fg">Configurações do site</strong>.
          </li>
          <li>
            No <strong className="text-fg">Brave</strong>, a opção se chama <strong className="text-fg">Acesso ao localhost</strong>. Se continuar bloqueado, desligue o Shields (o leão) para este site.
          </li>
          <li>Recarregue a página.</li>
        </ol>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => window.location.reload()}>
          Já liberei, recarregar
        </Button>
      </div>
    </section>
  )
}

/** Explica como ligar o Motor WhatsApp XS quando uma tela precisa dele. */
export function MotorOffline({ feature }: { feature: string }) {
  const check = useMotor((s) => s.check)
  const bloqueado = useMotor((s) => s.bloqueado)
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  if (bloqueado) return <NavegadorBloqueou />
  return (
    <section className="panel flex flex-col gap-3 border-amber-400/25 bg-amber-400/[0.04] px-4 py-3.5 sm:flex-row sm:items-start">
      <PlugZap className="size-5 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="mb-1.5 font-semibold text-fg">{feature} precisa do Motor WhatsApp XS aberto neste computador</p>
        <MotorSteps https={isHttps} />
        <p className="mt-1.5 text-fg-4">
          O motor roda no seu computador porque o disparo automático precisa de uma sessão do WhatsApp sempre aberta.{' '}
          <Link to="/configuracoes#motor" className="text-blue-300 hover:text-blue-200">
            Mais sobre o motor
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <a
          href={MOTOR_DOWNLOAD}
          download
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-[#3b7bf6]"
        >
          <Download className="size-3.5" /> Baixar o Motor WhatsApp XS
        </a>
        <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void check()}>
          Já abri, verificar
        </Button>
      </div>
    </section>
  )
}
