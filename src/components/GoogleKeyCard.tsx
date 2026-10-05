// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { CheckCircle2, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store/useApp'
import { COTA_GRATIS, LIMITE_PADRAO, restantes, SEM_TETO, semTeto, usadasNoMes, useGoogleKey } from '../store/useGoogleKey'
import { DEMO_KEY_URL, GetDemoKeyButton, GoogleKeyPaste } from './GoogleKeyPaste'
import { confirmAction } from './kit'
import { Button, Progress } from './ui'

const LINKS = {
  demo: DEMO_KEY_URL,
  demoInfo: 'https://mapsplatform.google.com/maps-demo-key/',
  console: 'https://console.cloud.google.com/projectcreate',
  billing: 'https://console.cloud.google.com/billing',
  api: 'https://console.cloud.google.com/apis/library/places.googleapis.com',
  credenciais: 'https://console.cloud.google.com/apis/credentials',
  cotas: 'https://console.cloud.google.com/apis/api/places.googleapis.com/quotas',
}

/** Ajustes → Busca do Google: a chave do usuário, o teto do mês e o passo a passo para criar a chave (sem ou com cartão). */
export function GoogleKeyCard() {
  const toast = useApp((s) => s.toast)
  const gk = useGoogleKey()
  const [limite, setLimite] = useState(String(LIMITE_PADRAO))
  // null = ainda não mexeu (abre o mais fácil se não tem chave); 'nenhum' = fechou tudo
  const [guide, setGuide] = useState<'demo' | 'cartao' | 'nenhum' | null>(null)

  useEffect(() => {
    if (!gk.loaded) void gk.load()
  }, [gk])
  useEffect(() => setLimite(String(gk.config.limite)), [gk.config.limite])

  const chave = gk.config.chave
  const usadas = usadasNoMes(gk.config)
  // Sem chave, o passo a passo mais fácil (sem cartão) já vem aberto
  const aberto = guide === null ? (gk.loaded && !chave ? 'demo' : null) : guide
  const toggle = (g: 'demo' | 'cartao') => setGuide(aberto === g ? 'nenhum' : g)

  const demo = semTeto(gk.config)
  async function setDemo(on: boolean) {
    try {
      await gk.save({ limite: on ? SEM_TETO : LIMITE_PADRAO })
      toast(on ? 'Chave sem cartão: a XS não põe mais teto no mês.' : `Teto de ${LIMITE_PADRAO} consultas por mês ligado.`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error')
    }
  }

  async function saveLimite() {
    const n = Math.round(Number(limite))
    if (!Number.isFinite(n) || n < 0) return toast('Digite um número.', 'error')
    if (n > COTA_GRATIS && !confirmAction(`Acima de ${COTA_GRATIS} consultas por mês o Google cobra (cerca de US$ 35 a cada 1.000). Quer mesmo um teto de ${n}?`)) return
    try {
      await gk.save({ limite: n })
      toast('Teto do mês salvo.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar.', 'error')
    }
  }

  return (
    <section id="google" className="panel scroll-mt-6">
      <header className="border-b border-line-soft px-5 py-3.5">
        <h2 className="text-[13px] font-semibold">Busca do Google</h2>
        <p className="mt-0.5 text-xs text-fg-3">
          Além da base aberta, a busca pode usar o Google Maps (com nota e avaliações) pela sua própria chave do Google. Dá para criar uma sem cartão em 2 minutos, e a XS nunca
          deixa você ser cobrado.
        </p>
      </header>
      <div className="space-y-4 px-5 py-4">
        {chave ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] px-3 py-2.5">
            <CheckCircle2 className="size-4 text-emerald-300" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-medium text-fg">Chave conectada</p>
              <p className="pv num text-2xs text-fg-3">
                {chave.slice(0, 6)}••••••••{chave.slice(-4)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (!confirmAction('Tirar a chave do Google desta conta? A busca continua funcionando pela base aberta.')) return
                await gk.save({ chave: null }).catch((err: Error) => toast(err.message, 'error'))
              }}
            >
              Tirar
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-semibold text-fg">1.</span>
              <GetDemoKeyButton />
              <span className="text-2xs text-fg-3">Entre com o seu Gmail e clique em "Copiar chave". Sem cartão.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="pt-2 text-xs font-semibold text-fg">2.</span>
              <GoogleKeyPaste className="min-w-0 flex-1" />
            </div>
          </div>
        )}

        {chave && <GoogleKeyPaste label="Trocar a chave" />}
        <p className="-mt-2 text-2xs text-fg-4">Ao salvar, a XS confere a chave com uma consulta que o Google não cobra. A chave fica guardada só na sua conta.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="label">Uso neste mês</p>
            {demo ? (
              <>
                <p className="num text-lg font-semibold">
                  {usadas} <span className="text-sm font-normal text-fg-4">consultas · sem teto</span>
                </p>
                <p className="text-2xs text-fg-4">Chave sem cartão: nunca cobra. O Google limita por dia; quando acaba, a busca do Google volta no dia seguinte.</p>
              </>
            ) : (
              <>
                <p className="num text-lg font-semibold">
                  {usadas} <span className="text-sm font-normal text-fg-4">/ {gk.config.limite} consultas</span>
                </p>
                <Progress value={usadas} max={gk.config.limite || 1} tone={restantes(gk.config) < 50 ? 'gold' : 'accent'} className="h-1.5" />
                <p className="text-2xs text-fg-4">Cerca de {(restantes(gk.config) * 20).toLocaleString('pt-BR')} empresas ainda grátis. Zera no dia 1º.</p>
              </>
            )}
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-xs text-fg-2">
              <input type="checkbox" className="mt-0.5" checked={demo} onChange={(e) => void setDemo(e.target.checked)} />
              <span>
                Minha chave é a de demonstração (sem cartão)
                <span className="block text-2xs text-fg-4">Ela nunca cobra, então a XS não põe teto no mês. Só marque se a chave não tem cartão.</span>
              </span>
            </label>
            {!demo && (
              <div className="space-y-1.5">
                <label htmlFor="g-limite" className="label">
                  Teto por mês
                </label>
                <div className="flex gap-1.5">
                  <input id="g-limite" type="number" min={0} className="input num w-28" value={limite} onChange={(e) => setLimite(e.target.value)} />
                  <Button size="sm" onClick={() => void saveLimite()} disabled={String(gk.config.limite) === limite}>
                    Salvar
                  </Button>
                </div>
                <p className="text-2xs text-fg-4">
                  Com cartão, a cota grátis do Google é {COTA_GRATIS.toLocaleString('pt-BR')} por mês; deixando em {LIMITE_PADRAO}, você nunca paga nada.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="divide-y divide-line-soft rounded-lg border border-line-soft">
          <Guide open={aberto === 'demo'} onToggle={() => toggle('demo')} title="Sem cartão: chave de demonstração (2 minutos)" badge="Mais fácil">
            <Step n={1} link={LINKS.demo} linkLabel="Abrir a página da chave">
              Clique no botão azul lá em cima (ou aqui) e entre com a sua conta Google (o mesmo login do Gmail).
            </Step>
            <Step n={2}>
              Marque que aceita os <b className="font-medium text-fg">Termos de Serviço</b> (se pedir o país, escolha <b className="font-medium text-fg">Brasil</b>) e clique em{' '}
              <b className="font-medium text-fg">Concordar e continuar</b>. Não precisa de cartão.
            </Step>
            <Step n={3}>
              Aparece a tela <b className="font-medium text-fg">"Tudo certo!"</b> com a sua chave (começa com "AIza"). Clique em <b className="font-medium text-fg">Copiar chave</b>
              .
            </Step>
            <Step n={4}>
              Cole a chave no campo acima e clique em <b className="font-medium text-fg">Salvar</b>. Pronto: a busca do Google já aparece em Buscar empresas.
            </Step>
            <li className="rounded-md bg-tint/[0.04] px-2.5 py-2 text-2xs leading-4 text-fg-3">
              Essa chave é grátis de verdade: não tem cartão, então nunca cobra. O Google dá um limite de consultas por dia (ele não diz quanto); quando acaba, a busca do Google
              pausa até o dia seguinte e a base aberta continua funcionando. Se a chave sumir, ela pode ser vista de novo no{' '}
              <a href={LINKS.credenciais} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                Google Cloud
              </a>
              .{' '}
              <a href={LINKS.demoInfo} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                Saiba mais
              </a>
            </li>
          </Guide>
          <Guide open={aberto === 'cartao'} onToggle={() => toggle('cartao')} title="Com cartão: 1.000 consultas grátis por mês (uns 5 minutos)">
            <Step n={1} link={LINKS.console} linkLabel="Criar projeto">
              Entre no Google Cloud com a sua conta Google e crie um projeto (por exemplo, "XS Busca").
            </Step>
            <Step n={2} link={LINKS.billing} linkLabel="Faturamento">
              Vincule uma conta de faturamento ao projeto. O Google pede um cartão (cartão virtual de banco digital costuma servir) só para confirmar que você é uma pessoa: dentro
              das 1.000 consultas grátis do mês ele não cobra nada.
            </Step>
            <Step n={3} link={LINKS.api} linkLabel="Ativar a API">
              Abra a página da <b className="font-medium text-fg">Places API (New)</b> e clique em <b className="font-medium text-fg">Ativar</b>.
            </Step>
            <Step n={4} link={LINKS.credenciais} linkLabel="Credenciais">
              Em <b className="font-medium text-fg">Credenciais</b>, clique em <b className="font-medium text-fg">Criar credenciais → Chave de API</b> e copie a chave (começa com
              "AIza").
            </Step>
            <Step n={5}>
              Recomendado: na chave, em <b className="font-medium text-fg">Restrições de API</b>, escolha só a <b className="font-medium text-fg">Places API (New)</b>. Em
              "Restrições do aplicativo", deixe <b className="font-medium text-fg">Nenhuma</b>.
            </Step>
            <Step n={6} link={LINKS.cotas} linkLabel="Cotas">
              Garantia extra (opcional): nas cotas da Places API, limite as consultas de <b className="font-medium text-fg">Text Search</b> a{' '}
              <b className="font-medium text-fg">30 por dia</b>. Assim nem um erro passa da cota grátis.
            </Step>
            <Step n={7}>
              Cole a chave no campo acima e clique em <b className="font-medium text-fg">Salvar</b>. Se der erro, a mensagem diz qual passo falta.
            </Step>
          </Guide>
        </div>
      </div>
    </section>
  )
}

function Guide({ open, onToggle, title, badge, children }: { open: boolean; onToggle: () => void; title: string; badge?: string; children: ReactNode }) {
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-fg">
        <span className="flex-1">{title}</span>
        {badge && <span className="rounded bg-emerald-500/10 px-1.5 text-2xs leading-5 font-medium text-emerald-300">{badge}</span>}
        <span className="text-2xs font-normal text-fg-3">{open ? 'esconder' : 'ver passo a passo'}</span>
      </button>
      {open && <ol className="space-y-3 border-t border-line-soft px-3 py-3 text-xs text-fg-2">{children}</ol>}
    </div>
  )
}

function Step({ n, children, link, linkLabel }: { n: number; children: ReactNode; link?: string; linkLabel?: string }) {
  return (
    <li className="flex gap-2.5">
      <span className={clsx('num mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-2xs font-semibold text-blue-200')}>{n}</span>
      <span className="min-w-0 flex-1 leading-5">
        {children}{' '}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-blue-300 hover:text-blue-200">
            {linkLabel} <ExternalLink className="size-3" />
          </a>
        )}
      </span>
    </li>
  )
}
