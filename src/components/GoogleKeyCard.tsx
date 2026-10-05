// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { CheckCircle2, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store/useApp'
import { COTA_GRATIS, LIMITE_PADRAO, restantes, usadasNoMes, useGoogleKey } from '../store/useGoogleKey'
import { mapsApi } from '../store/useMapsSearch'
import { confirmAction } from './kit'
import { Button, Progress } from './ui'

const LINKS = {
  console: 'https://console.cloud.google.com/projectcreate',
  billing: 'https://console.cloud.google.com/billing',
  api: 'https://console.cloud.google.com/apis/library/places.googleapis.com',
  credenciais: 'https://console.cloud.google.com/apis/credentials',
  cotas: 'https://console.cloud.google.com/apis/api/places.googleapis.com/quotas',
}

/** Ajustes → Busca do Google: a chave do usuário, o teto do mês e o passo a passo para criar a chave. */
export function GoogleKeyCard() {
  const toast = useApp((s) => s.toast)
  const gk = useGoogleKey()
  const [draft, setDraft] = useState('')
  const [limite, setLimite] = useState(String(LIMITE_PADRAO))
  const [testing, setTesting] = useState(false)
  const [guide, setGuide] = useState(false)

  useEffect(() => {
    if (!gk.loaded) void gk.load()
  }, [gk])
  useEffect(() => setLimite(String(gk.config.limite)), [gk.config.limite])

  const chave = gk.config.chave
  const usadas = usadasNoMes(gk.config)
  // Sem chave, o passo a passo já vem aberto
  const showGuide = guide || (gk.loaded && !chave)

  async function testAndSave() {
    const k = draft.trim()
    if (!k) return toast('Cole a chave do Google no campo.', 'error')
    setTesting(true)
    try {
      await mapsApi({ acao: 'testar', chave: k })
      await gk.save({ chave: k })
      setDraft('')
      toast('Chave conferida e salva. A busca do Google está liberada.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui conferir a chave.', 'error')
    } finally {
      setTesting(false)
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
          A busca de empresas usa o Google Maps com a sua própria chave. O Google dá 1.000 consultas grátis por mês para cada conta (cada uma traz até 20 empresas) e a XS para
          antes disso.
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
                if (!confirmAction('Tirar a chave do Google desta conta? A busca passa a usar só o OpenStreetMap.')) return
                await gk.save({ chave: null }).catch((err: Error) => toast(err.message, 'error'))
              }}
            >
              Tirar
            </Button>
          </div>
        ) : null}

        <div>
          <label htmlFor="g-chave" className="label">
            {chave ? 'Trocar a chave' : 'Sua chave do Google (Places API)'}
          </label>
          <div className="flex gap-1.5">
            <input
              id="g-chave"
              className="pv input font-mono"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void testAndSave()}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="primary" loading={testing} icon={<KeyRound className="size-3.5" />} onClick={() => void testAndSave()}>
              Testar e salvar
            </Button>
          </div>
          <p className="mt-1 text-2xs text-fg-4">O teste usa uma consulta que o Google não cobra. A chave fica guardada só na sua conta.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="label">Uso neste mês</p>
            <p className="num text-lg font-semibold">
              {usadas} <span className="text-sm font-normal text-fg-4">/ {gk.config.limite} consultas</span>
            </p>
            <Progress value={usadas} max={gk.config.limite || 1} tone={restantes(gk.config) < 50 ? 'gold' : 'accent'} className="h-1.5" />
            <p className="text-2xs text-fg-4">Cerca de {(restantes(gk.config) * 20).toLocaleString('pt-BR')} empresas ainda grátis. Zera no dia 1º.</p>
          </div>
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
              A cota grátis do Google é {COTA_GRATIS.toLocaleString('pt-BR')}. Deixando em {LIMITE_PADRAO}, você nunca paga nada.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line-soft">
          <button onClick={() => setGuide((g) => !g)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-fg">
            Como criar a chave (uns 5 minutos)
            <span className="text-2xs font-normal text-fg-3">{showGuide ? 'esconder' : 'ver passo a passo'}</span>
          </button>
          {showGuide && (
            <ol className="space-y-3 border-t border-line-soft px-3 py-3 text-xs text-fg-2">
              <Step n={1} link={LINKS.console} linkLabel="Criar projeto">
                Entre no Google Cloud com a sua conta Google e crie um projeto (por exemplo, "XS Busca").
              </Step>
              <Step n={2} link={LINKS.billing} linkLabel="Faturamento">
                Vincule uma conta de faturamento ao projeto. O Google pede um cartão só para confirmar que você é uma pessoa: dentro das 1.000 consultas grátis do mês ele não cobra
                nada.
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
                Cole a chave no campo acima e clique em <b className="font-medium text-fg">Testar e salvar</b>. Se der erro, a mensagem diz qual passo falta.
              </Step>
            </ol>
          )}
        </div>
      </div>
    </section>
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
