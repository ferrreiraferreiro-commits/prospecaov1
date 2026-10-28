// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Plano Times: tudo o que o desenvolvedor precisa para fazer o site — pedido, dados do Maps/Instagram, conversa e histórico.
import clsx from 'clsx'
import { CalendarClock, Check, Hand, MessageCircle, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatPhone, instagramHandle, instagramHref, mapsHref, telHref, websiteHref, websiteLabel, whatsappDigits } from '../lib/contact'
import { conversasApi, telefoneConversa, type MensagemConversa } from '../lib/conversas'
import { formatDateKey, formatDateTime, formatRelative } from '../lib/dates'
import { metaConversasApi, numeroDoLead, useMetaConexao } from '../lib/meta'
import { SITE_STATUS, useQuem, useSites, type SitePedido } from '../lib/sites'
import { useAccount, useHasWhatsApp, usePapel } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { Avatar } from './Avatar'
import { confirmAction } from './kit'
import { Rating } from './leadBits'
import { Timeline } from './Timeline'
import { Button, Missing } from './ui'

function Bloco({ titulo, children, right }: { titulo: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line-soft px-5 py-4 last:border-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="flex-1 text-2xs font-semibold tracking-[0.08em] text-fg-4 uppercase">{titulo}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Linha({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-xs">
      <dt className="w-28 shrink-0 text-fg-3">{label}</dt>
      <dd className="pv min-w-0 flex-1 break-words text-fg">{children}</dd>
    </div>
  )
}

const Externo = ({ href, children }: { href: string | null; children: ReactNode }) =>
  href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200 hover:underline">
      {children}
    </a>
  ) : (
    <Missing />
  )

export function SiteDetalhe({ p, onClose }: { p: SitePedido; onClose: () => void }) {
  const quem = useQuem()
  const papel = usePapel()
  const eu = useAccount((s) => s.profile?.user_id)
  const interactions = useApp((s) => s.interactions)
  const { pegar, devolver, concluir, reabrir, cancelar, editar } = useSites.getState()
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(p.link ?? '')
  const [briefing, setBriefing] = useState(p.briefing ?? '')
  const lead = p.lead
  const meu = p.dev === eu
  const podeFazer = papel !== 'vendedor'
  const podeEditar = papel !== 'desenvolvedor'
  const st = SITE_STATUS[p.status]
  const historico = useMemo(() => (lead ? interactions.filter((i) => i.lead_id === lead.id) : []), [interactions, lead])

  const agir = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) useApp.getState().toast(ok, 'success')
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error')
      void useSites.getState().carregar()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="border-b border-line-soft px-5 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span className={clsx('inline-flex items-center gap-1.5 rounded px-1.5 text-2xs leading-5 font-medium ring-1 ring-inset', st.chip)}>
              <span className={clsx('size-1.5 rounded-full', st.dot)} />
              {st.label}
            </span>
            <h2 className="pv mt-1.5 text-base leading-6 font-semibold tracking-[-0.01em]">{lead?.empresa ?? 'Lead apagado'}</h2>
            <p className="text-xs text-fg-3">{[lead?.nicho, lead?.cidade && [lead.cidade, lead.estado].filter(Boolean).join(' - ')].filter(Boolean).join(' · ')}</p>
          </div>
          <button onClick={onClose} className="-mr-1.5 rounded-md p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>

        {/* O que fazer agora, conforme o momento do site */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {p.status === 'fila' && podeFazer && (
            <Button variant="go" icon={<Hand className="size-3.5" />} loading={busy} onClick={() => void agir(() => pegar(p.id), 'O site é seu. Bom trabalho!')}>
              Pegar o serviço
            </Button>
          )}
          {p.status === 'fazendo' && (meu || papel === 'dono' || papel === 'gestor') && (
            <>
              <input className="input pv h-8 min-w-0 flex-1" placeholder="Link do site pronto (ex.: padaria.vercel.app)" value={link} onChange={(e) => setLink(e.target.value)} />
              <Button variant="go" icon={<Check className="size-3.5" />} loading={busy} onClick={() => void agir(() => concluir(p.id, link), 'Site entregue. A equipe foi avisada no chat.')}>
                Marcar como pronto
              </Button>
              <Button variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={busy} onClick={() => confirmAction('Devolver este site para a fila? Outra pessoa poderá pegar.') && void agir(() => devolver(p.id))}>
                Devolver
              </Button>
            </>
          )}
          {p.status === 'fazendo' && !meu && papel === 'desenvolvedor' && <p className="text-xs text-fg-3">Outra pessoa está fazendo este site.</p>}
          {p.status === 'pronto' && (
            <>
              {p.link && (
                <a href={websiteHref(p.link) ?? '#'} target="_blank" rel="noreferrer" className="pv text-xs text-blue-300 hover:underline">
                  Ver o site: {websiteLabel(p.link)}
                </a>
              )}
              {(meu || podeEditar) && (
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={busy} onClick={() => void agir(() => reabrir(p.id))}>
                  Reabrir
                </Button>
              )}
            </>
          )}
          {podeEditar && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              icon={<Trash2 className="size-3.5" />}
              disabled={busy}
              onClick={() => confirmAction('Tirar este lead da fila de sites?') && void agir(async () => (await cancelar(p.id), onClose()))}
            >
              Tirar da fila
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Bloco
          titulo="O que o cliente quer"
          right={p.prazo && (
            <span className="inline-flex items-center gap-1 text-2xs text-fg-2">
              <CalendarClock className="size-3" /> Entregar até {formatDateKey(p.prazo)}
            </span>
          )}
        >
          {podeEditar ? (
            <textarea
              className="input pv min-h-[96px] w-full py-2 text-[13px] leading-5"
              placeholder="Ex.: site de uma página com cardápio, botão de WhatsApp e fotos do Instagram. Cores da logo."
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              onBlur={() => briefing !== (p.briefing ?? '') && void agir(() => editar(p.id, { briefing: briefing.trim() || null }))}
            />
          ) : p.briefing ? (
            <p className="pv text-[13px] leading-6 whitespace-pre-wrap text-fg">{p.briefing}</p>
          ) : (
            <p className="text-xs text-fg-4">O vendedor não escreveu o que o cliente quer. Pergunte no chat da equipe.</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-2xs text-fg-3">
            <Avatar src={null} name={(p.pedido_por && quem.get(p.pedido_por)?.nome) || '?'} size={16} />
            <span className="pv">{(p.pedido_por && quem.get(p.pedido_por)?.nome) ?? 'Alguém'}</span> mandou {formatRelative(p.pedido_em)}
            {p.dev && (
              <>
                {' '}· feito por <span className="pv">{quem.get(p.dev)?.nome ?? 'alguém'}</span>
              </>
            )}
          </p>
        </Bloco>

        {lead && (
          <Bloco titulo="Google Maps e redes">
            <dl>
              <Linha label="Telefone">
                <Externo href={telHref(lead.telefone)}>{formatPhone(lead.telefone)}</Externo>
              </Linha>
              <Linha label="WhatsApp">{lead.whatsapp ? formatPhone(whatsappDigits(lead.whatsapp)) || lead.whatsapp : <Missing />}</Linha>
              <Linha label="Instagram">
                <Externo href={instagramHref(lead.instagram)}>{instagramHandle(lead.instagram)}</Externo>
              </Linha>
              <Linha label="Site atual">{lead.website ? <Externo href={websiteHref(lead.website)}>{websiteLabel(lead.website)}</Externo> : <span className="text-gold/90">Sem site</span>}</Linha>
              <Linha label="Endereço">{lead.endereco ?? <Missing />}</Linha>
              <Linha label="Avaliação">{lead.avaliacao !== null ? <Rating lead={lead} /> : <Missing />}</Linha>
              <Linha label="Google Maps">
                <Externo href={mapsHref(lead.maps_url, lead.empresa, lead.cidade)}>Abrir no Maps (fotos, horários e avaliações)</Externo>
              </Linha>
              {lead.falei_com && <Linha label="Falou com">{[lead.falei_com, lead.cargo].filter(Boolean).join(' · ')}</Linha>}
              {lead.anotacoes && <Linha label="Anotações">{lead.anotacoes}</Linha>}
              {Object.entries(lead.dados_extras ?? {}).map(([k, v]) => (
                <Linha key={k} label={k}>
                  {v}
                </Linha>
              ))}
            </dl>
          </Bloco>
        )}

        {lead && <Conversa telefone={numeroDoLead(lead)} />}

        {lead && historico.length > 0 && (
          <Bloco titulo="Histórico do lead">
            <Timeline lead={lead} items={historico} />
          </Bloco>
        )}
        <p className="px-5 py-3 text-2xs text-fg-4">Na fila desde {formatDateTime(p.pedido_em)}</p>
      </div>
    </>
  )
}

/** Conversa com o cliente, só para ler: WhatsApp da XS (QR) ou API oficial, o que tiver mensagens. */
function Conversa({ telefone }: { telefone: string }) {
  const temWhatsApp = useHasWhatsApp()
  const temMeta = useMetaConexao((s) => s.conexoes.length > 0)
  const [estado, setEstado] = useState<{ canal: 'qr' | 'meta'; msgs: MensagemConversa[] } | null | 'carregando'>('carregando')

  useEffect(() => {
    let vivo = true
    const tel = telefoneConversa(telefone)
    void (async () => {
      if (!tel || !temWhatsApp) return vivo && setEstado(null)
      try {
        const c = await (await conversasApi()).abrir(tel)
        if (c.msgs.length) return vivo && setEstado({ canal: 'qr', msgs: c.msgs })
      } catch {
        /* WhatsApp da XS desconectado: tenta a API oficial */
      }
      try {
        if (temMeta) {
          const c = await metaConversasApi.abrir(tel)
          if (c.msgs.length) return vivo && setEstado({ canal: 'meta', msgs: c.msgs })
        }
      } catch {
        /* sem API oficial */
      }
      if (vivo) setEstado(null)
    })()
    return () => {
      vivo = false
    }
  }, [telefone, temWhatsApp, temMeta])

  // O desenvolvedor não abre a tela Conversas: lê a conversa só aqui
  const dev = usePapel() === 'desenvolvedor'
  const abrir = !dev && estado && estado !== 'carregando' ?`${estado.canal === 'meta' ? '/api-oficial/conversas' : '/conversas'}?tel=${telefone}` : null
  return (
    <Bloco
      titulo="Conversa no WhatsApp"
      right={
        abrir && (
          <Link to={abrir} className="inline-flex items-center gap-1 text-2xs text-blue-300 hover:underline">
            <MessageCircle className="size-3" /> Abrir em Conversas
          </Link>
        )
      }
    >
      {estado === 'carregando' ? (
        <p className="text-xs text-fg-4">Carregando a conversa…</p>
      ) : !estado ? (
        <p className="text-xs text-fg-4">Nenhuma conversa com esse número no WhatsApp da equipe.</p>
      ) : (
        <div className="max-h-[360px] space-y-1.5 overflow-y-auto rounded-lg border border-line-soft bg-ink/60 p-3">
          {estado.msgs.slice(-60).map((m) => (
            <div key={m.id} className={clsx('flex', m.deMim ? 'justify-end' : 'justify-start')}>
              <div className={clsx('pv max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-5 whitespace-pre-wrap', m.deMim ? 'bg-blue-600/25 text-fg' : 'bg-raised text-fg')}>
                {m.midia && <span className="mr-1 text-fg-3">[{m.midia}]</span>}
                {m.texto}
                <span className="ml-2 text-[10px] text-fg-4">{formatDateTime(m.em)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Bloco>
  )
}
