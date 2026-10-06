// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck } from 'lucide-react'
import { useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Brand'
import { SiteFooter } from '../components/site/SiteFooter'
import { Spinner } from '../components/ui'
import { formatPreco, linkCheckout, useAssinatura } from '../lib/assinatura'
import { useAccount } from '../store/useAccount'
import '@fontsource-variable/manrope'

const INCLUI = [
  'Busca de empresas por cidade, bairro e nicho, já com telefone',
  'Leads, status, histórico e retornos num lugar só',
  'Modo ligação com roteiro e objeções na tela',
  'WhatsApp da XS: mensagens, funis e disparo',
  'Clientes, projetos e financeiro',
  'Funciona no navegador do PC e do celular',
]

/**
 * Página de venda do plano Mensal (/assinar). É o link "Página de vendas" do produto na SigiloPay.
 * - Logado: botão direto para o checkout, com a conta junto (?xs=) → o plano cai na conta certa.
 * - Sem login: entra e assina, ou compra direto (o plano entra na conta com o mesmo e-mail,
 *   inclusive se ela for criada depois da compra).
 */
export function AssinarPage({ logado }: { logado: boolean }) {
  const { checkout, preco, carregado } = useAssinatura()
  const profile = useAccount((s) => s.profile)

  useEffect(() => {
    const antes = document.title
    document.title = 'Assinar · XS Prospecção'
    return () => {
      document.title = antes
    }
  }, [])

  const plano = (
    <div className="rounded-2xl border border-white/10 bg-[#0e1424]/80 p-6 text-left shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">Plano Mensal</p>
        <span className="rounded-md bg-go/15 px-2 py-0.5 text-2xs font-semibold text-go">Tudo liberado</span>
      </div>
      <p className="mt-5 flex items-baseline gap-1.5">
        {preco ? (
          <>
            <span className="font-display num text-[44px] leading-none text-fg">{formatPreco(preco)}</span>
            <span className="text-sm text-fg-3">/mês</span>
          </>
        ) : (
          <span className="text-sm text-fg-3">{carregado ? 'O valor aparece no checkout.' : ' '}</span>
        )}
      </p>
      <p className="mt-2 text-xs text-fg-3">Cobrado uma vez por mês. Pix ou cartão.</p>

      <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-6">
        {INCLUI.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[13px] leading-5 text-fg-2">
            <Check className="mt-0.5 size-4 shrink-0 text-go" aria-hidden /> {t}
          </li>
        ))}
      </ul>

      <div className="mt-7">
        {!carregado ? (
          <div className="flex h-12 items-center justify-center text-fg-3">
            <Spinner />
          </div>
        ) : !checkout ? (
          <p className="rounded-lg border border-white/10 px-4 py-3 text-center text-xs text-fg-3">As assinaturas abrem em breve.</p>
        ) : (
          <a
            href={linkCheckout(checkout, logado ? profile?.user_id : null)}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-[15px] font-semibold text-white transition-colors hover:bg-[#3b7bf6]"
          >
            Assinar agora <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </a>
        )}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-fg-3">
          <ShieldCheck className="size-3.5" aria-hidden /> Pagamento seguro pela SigiloPay · 7 dias de garantia
        </p>
      </div>
    </div>
  )

  if (logado) {
    // Dentro do app (com o menu): só o cartão do plano
    return (
      <div className="mx-auto max-w-md py-4">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-fg">Assinar a XS</h1>
        <p className="mt-1 mb-5 text-xs text-fg-3">
          Pagou, liberou: o plano entra na sua conta sozinho assim que o pagamento é aprovado.
        </p>
        {plano}
      </div>
    )
  }

  return <AssinarPublico plano={plano} temCheckout={!!checkout} />
}

/** Mesmo azul do topo da landing, para quem chega pelo link de vendas. */
function AssinarPublico({ plano, temCheckout }: { plano: ReactNode; temCheckout: boolean }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const antes = root.dataset.theme
    root.dataset.theme = 'dark'
    return () => {
      if (antes) root.dataset.theme = antes
    }
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-[#0a0e18] text-fg">
      <div className="relative isolate flex-1 overflow-hidden">
        <div className="land-glow" aria-hidden />
        <div className="land-grain" aria-hidden />
        <header className="mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="XS Prospecção, página inicial">
            <LogoMark size={28} />
            <Wordmark />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-fg-3 transition-colors hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Início
          </Link>
        </header>

        <main className="mx-auto grid w-full max-w-[1160px] items-center gap-12 px-5 pt-10 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-20 lg:pt-20">
          <div className="land-in max-w-[520px]">
            <p className="text-[13px] text-fg-2/80">Para quem vende sites e serviços digitais</p>
            <h1 className="font-display mt-4 text-[clamp(2.25rem,1.4rem+3vw,3.25rem)] leading-[1.04]">
              Assine a XS e prospecte
              <span className="block text-fg-3">todo dia, sem limite de teste.</span>
            </h1>
            <p className="mt-6 text-base leading-7 text-fg-2">
              Um plano só, com tudo liberado. A cobrança é mensal e o acesso libera sozinho assim que o pagamento é aprovado.
            </p>

            <div className="mt-9 space-y-4 border-l border-white/10 pl-5 text-sm leading-6 text-fg-2">
              <p>
                <span className="font-medium text-fg">Já tem conta?</span>{' '}
                <Link to="/entrar?volta=assinar" className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200">
                  Entre e assine por dentro
                </Link>
                : o plano cai direto na sua conta.
              </p>
              {temCheckout && (
                <p>
                  <span className="font-medium text-fg">Ainda não tem?</span> Assine aqui e depois{' '}
                  <Link to="/criar-conta" className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200">
                    crie sua conta
                  </Link>{' '}
                  com o <span className="text-fg">mesmo e-mail</span> da compra. O plano já vai estar lá.
                </p>
              )}
              <p>
                Prefere ver antes?{' '}
                <Link to="/criar-conta" className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200">
                  Teste 1 dia grátis
                </Link>
                , sem cartão.
              </p>
            </div>
          </div>
          <div className="land-in w-full" style={{ '--d': '120ms' } as CSSProperties}>
            {plano}
          </div>
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
