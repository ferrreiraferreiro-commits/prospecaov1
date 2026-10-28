// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: fila de sites. O vendedor manda o lead (pela ficha do lead); o desenvolvedor pega o serviço e entrega.
import clsx from 'clsx'
import { CalendarClock, Code, ExternalLink, Hand, Inbox } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageHeader } from '../components/PageHeader'
import { SiteDetalhe } from '../components/SiteDetalhe'
import { Button, Drawer, Segmented } from '../components/ui'
import { websiteHref, websiteLabel } from '../lib/contact'
import { formatDateKeyShort, formatRelative, todayKey } from '../lib/dates'
import { SITE_STATUS, useQuem, useSites, type SitePedido, type SiteStatus } from '../lib/sites'
import { useAccount, usePapel } from '../store/useAccount'
import { useApp } from '../store/useApp'

const COLUNAS: { id: SiteStatus; vazio: string }[] = [
  { id: 'fila', vazio: 'Nenhum site esperando. Quando um vendedor fechar um site, ele aparece aqui.' },
  { id: 'fazendo', vazio: 'Ninguém fazendo site agora.' },
  { id: 'pronto', vazio: 'Nenhum site entregue ainda.' },
]

export function SitesPage() {
  const { pedidos, carregado, carregar } = useSites()
  const papel = usePapel()
  const eu = useAccount((s) => s.profile?.user_id)
  const [params, setParams] = useSearchParams()
  const [filtro, setFiltro] = useState<'todos' | 'meus'>(papel === 'desenvolvedor' ? 'meus' : 'todos')
  const aberto = params.get('id')

  useEffect(() => {
    void carregar()
    const t = setInterval(() => void carregar(), 20_000)
    return () => clearInterval(t)
  }, [carregar])

  // Desenvolvedor: "Meus" mostra a fila inteira (para pegar) e só os sites dele nas outras colunas
  const visiveis = useMemo(
    () => (filtro === 'meus' ? pedidos.filter((p) => p.status === 'fila' || p.dev === eu || p.pedido_por === eu) : pedidos),
    [pedidos, filtro, eu],
  )
  const pedidoAberto = pedidos.find((p) => p.id === aberto) ?? null
  const abrir = (id: string | null) => setParams(id ? { id } : {}, { replace: true })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sites para fazer"
        subtitle={
          papel === 'desenvolvedor'
            ? 'Pegue um serviço da fila. Tudo o que o vendedor sabe do cliente está dentro de cada site.'
            : 'Na ficha do lead, use “Mandar para fazer o site”. Os desenvolvedores pegam daqui.'
        }
        actions={
          <Segmented
            value={filtro}
            onChange={setFiltro}
            options={[
              { id: 'todos', label: 'Todos' },
              { id: 'meus', label: papel === 'desenvolvedor' ? 'Fila e os meus' : 'Que eu mandei' },
            ]}
          />
        }
      />

      {carregado && !pedidos.length ? (
        <section className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl border border-line-soft bg-raised">
            <Code className="size-5 text-emerald-300" />
          </span>
          <p className="text-sm font-semibold">A fila de sites está vazia</p>
          <p className="max-w-md text-xs leading-5 text-fg-3">
            Quando o cliente fechar, o vendedor abre a ficha do lead e clica em <span className="text-fg-2">Mandar para fazer o site</span>, contando o que o cliente quer. O site aparece aqui para um desenvolvedor pegar.
          </p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUNAS.map((c) => {
            const itens = visiveis.filter((p) => p.status === c.id)
            const st = SITE_STATUS[c.id]
            return (
              <section key={c.id} className="flex min-w-0 flex-col gap-2.5">
                <header className="flex items-center gap-2 px-1">
                  <span className={clsx('size-2 rounded-full', st.dot)} />
                  <h2 className="text-[13px] font-semibold">{st.label}</h2>
                  <span className="num text-xs text-fg-4">{itens.length}</span>
                </header>
                {itens.length ? (
                  itens.map((p) => <CartaoSite key={p.id} p={p} onAbrir={() => abrir(p.id)} />)
                ) : (
                  <p className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-xs text-fg-4">{c.vazio}</p>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Drawer open={!!pedidoAberto} onClose={() => abrir(null)} width="sm:w-[600px]">
        {pedidoAberto && <SiteDetalhe key={pedidoAberto.id} p={pedidoAberto} onClose={() => abrir(null)} />}
      </Drawer>
    </div>
  )
}

function CartaoSite({ p, onAbrir }: { p: SitePedido; onAbrir: () => void }) {
  const quem = useQuem()
  const papel = usePapel()
  const pegar = useSites((s) => s.pegar)
  const [busy, setBusy] = useState(false)
  const lead = p.lead
  const dev = p.dev ? quem.get(p.dev) : null
  const atrasado = p.prazo && p.status !== 'pronto' && p.prazo < todayKey()

  const pegarServico = async () => {
    setBusy(true)
    try {
      await pegar(p.id)
      useApp.getState().toast('O site é seu. Bom trabalho!', 'success')
      onAbrir()
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
      void useSites.getState().carregar()
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel group cursor-pointer px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-hover" onClick={onAbrir}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="pv truncate text-[13px] font-semibold">{lead?.empresa ?? 'Lead apagado'}</h3>
          <p className="truncate text-2xs text-fg-3">{[lead?.nicho, lead?.cidade].filter(Boolean).join(' · ') || 'Sem nicho'}</p>
        </div>
        {p.prazo && (
          <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-2xs leading-5 ring-1 ring-inset', atrasado ? 'bg-bad/10 text-red-300 ring-bad/30' : 'bg-tint/[0.04] text-fg-2 ring-line')}>
            <CalendarClock className="size-3" />
            {formatDateKeyShort(p.prazo)}
          </span>
        )}
      </div>

      {p.briefing ? (
        <p className="pv mt-2 line-clamp-2 text-xs leading-5 text-fg-2">{p.briefing}</p>
      ) : (
        <p className="mt-2 text-xs text-fg-4">Sem descrição do que o cliente quer.</p>
      )}

      <footer className="mt-3 flex items-center gap-2 text-2xs text-fg-3">
        {p.status === 'fila' ? (
          <>
            <Inbox className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">
              <span className="pv">{(p.pedido_por && quem.get(p.pedido_por)?.nome) ?? 'Alguém'}</span> · {formatRelative(p.pedido_em)}
            </span>
            {papel !== 'vendedor' && (
              <Button
                size="xs"
                variant="go"
                icon={<Hand className="size-3" />}
                loading={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  void pegarServico()
                }}
              >
                Pegar o serviço
              </Button>
            )}
          </>
        ) : p.status === 'fazendo' ? (
          <>
            <Avatar src={null} name={dev?.nome ?? '?'} size={18} />
            <span className="min-w-0 flex-1 truncate">
              <span className="pv">{dev?.nome ?? 'Alguém'}</span> pegou {p.pego_em ? formatRelative(p.pego_em) : ''}
            </span>
          </>
        ) : (
          <>
            <Avatar src={null} name={dev?.nome ?? '?'} size={18} />
            <span className="min-w-0 flex-1 truncate">{p.pronto_em ? `Entregue ${formatRelative(p.pronto_em)}` : 'Entregue'}</span>
            {p.link && (
              <a href={websiteHref(p.link) ?? '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="pv inline-flex items-center gap-1 text-blue-300 hover:underline">
                {websiteLabel(p.link)} <ExternalLink className="size-3" />
              </a>
            )}
          </>
        )}
      </footer>
    </article>
  )
}
