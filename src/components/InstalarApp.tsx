import { CheckCircle2, Smartphone } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { appJaInstalado, detectarNavegador, isAndroid, isIos, isStandalone, useInstall, type Navegador } from '../lib/pwa'
import { useApp } from '../store/useApp'
import { Button } from './ui'

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>

/** Passo a passo de cada navegador, para quando ele não oferece a instalação direto pelo botão. */
function Passos({ nav }: { nav: Navegador }) {
  if (isIos()) {
    return (
      <>
        Abra este site no <B>Safari</B>, toque em <B>Compartilhar</B> (o quadrado com a seta) e depois em <B>Adicionar à Tela de Início</B>.
      </>
    )
  }
  if (isAndroid()) {
    return nav === 'samsung' ? (
      <>
        Toque no menu <B>≡</B> e depois em <B>Adicionar página a</B> → <B>Tela inicial</B>.
      </>
    ) : (
      <>
        Toque no menu <B>⋮</B> (no canto de cima) e depois em <B>Instalar app</B> ou <B>Adicionar à tela inicial</B>.
      </>
    )
  }
  switch (nav) {
    case 'brave':
      return (
        <>
          Clique no ícone de instalar (um monitor com uma seta) no fim da barra de endereço. Se não aparecer: menu <B>≡</B> → <B>Salvar e compartilhar</B> →{' '}
          <B>Instalar página como app</B>.
        </>
      )
    case 'edge':
      return (
        <>
          Clique no ícone de instalar no fim da barra de endereço. Se não aparecer: menu <B>…</B> → <B>Aplicativos</B> → <B>Instalar este site como aplicativo</B>.
        </>
      )
    case 'chrome':
      return (
        <>
          Clique no ícone de instalar (um monitor com uma seta) no fim da barra de endereço. Se não aparecer: menu <B>⋮</B> → <B>Transmitir, salvar e compartilhar</B>{' '}
          → <B>Instalar página como app</B>.
        </>
      )
    case 'firefox':
    case 'safari':
      return (
        <>
          Este navegador não instala sites como app no computador. Abra a XS no <B>Chrome</B>, no <B>Edge</B> ou no <B>Brave</B> para instalar.
        </>
      )
    default:
      return (
        <>
          Procure no menu do navegador a opção <B>Instalar app</B> ou <B>Instalar página como app</B>.
        </>
      )
  }
}

/** Cartão "Instalar como app" de Ajustes: o botão aparece sempre. */
export function InstalarApp() {
  const toast = useApp((s) => s.toast)
  const [canInstall, install] = useInstall()
  const [nav, setNav] = useState<Navegador>('outro')
  const [instalado, setInstalado] = useState(false)
  const [ajuda, setAjuda] = useState(false)

  useEffect(() => {
    void detectarNavegador().then(setNav)
    void appJaInstalado().then(setInstalado)
  }, [])

  if (isStandalone()) return <p className="text-xs text-go">Você já está usando o app instalado.</p>

  return (
    <div className="space-y-2.5">
      {instalado && (
        <p className="flex items-center gap-1.5 text-xs text-go">
          <CheckCircle2 className="size-3.5" /> O app já está instalado neste aparelho. Abra pelo ícone <B>XS Prospecção</B>.
        </p>
      )}
      <Button
        variant="primary"
        size="sm"
        icon={<Smartphone className="size-3.5" />}
        onClick={async () => {
          if (canInstall) {
            if (await install()) toast('App instalado.')
            return
          }
          setAjuda(true)
        }}
      >
        Instalar agora
      </Button>
      {ajuda && !canInstall && (
        <p className="rounded-md border border-line-soft bg-ink px-3 py-2.5 text-xs leading-5 text-fg-2">
          <Passos nav={nav} />
        </p>
      )}
    </div>
  )
}
