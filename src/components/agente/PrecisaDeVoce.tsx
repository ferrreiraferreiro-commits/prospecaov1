// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { Check, Inbox, Pencil, ShieldAlert, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ag, resolverPendencia, type Pendencia } from '../../lib/agente'
import { formatPhone } from '../../lib/contact'
import { formatRelative } from '../../lib/dates'
import { useApp } from '../../store/useApp'
import { Card } from '../kit'
import { Button, Empty, Spinner } from '../ui'
import { Bolha, erroTexto } from './comum'

const TIPO: Record<Pendencia['tipo'], string> = {
  aprovar: 'Esperando aprovação',
  barrada: 'Barrada pela conferência',
  pessoa: 'Chamou você',
  contrato: 'Contrato',
  lacuna: 'Material sem resposta',
  licao: 'Lição proposta',
  teste: 'Teste proposto',
  nivel: 'Nível',
  reuniao: 'Reunião',
}

const RESULTADO: Record<NonNullable<Pendencia['resultado']>, string> = {
  aprovada: 'Aprovada',
  editada: 'Editada e enviada',
  descartada: 'Descartada',
  substituida: 'O cliente escreveu de novo',
  feita: 'Feita',
}

/**
 * A mensagem pronta esperando você: aprovar (sai como está), editar e enviar, ou descartar.
 * Antes de sair, o motor confere de novo se a pessoa pediu para parar, a LGPD e o horário.
 */
export function RascunhoPendente({ id, mensagens, onFeito, compacto }: { id: string; mensagens: string[]; onFeito: () => void; compacto?: boolean }) {
  const toast = useApp((s) => s.toast)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(mensagens.join('\n\n'))
  const [busy, setBusy] = useState<string | null>(null)

  async function fazer(acao: 'aprovar' | 'editar' | 'descartar') {
    setBusy(acao)
    try {
      const bolhas = texto.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
      await resolverPendencia(id, acao, acao === 'editar' ? bolhas : undefined)
      toast(acao === 'descartar' ? 'Descartada. Nada foi enviado.' : 'Enviada.')
      onFeito()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {editando ? (
        <div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={Math.min(8, Math.max(3, texto.split('\n').length + 1))}
            className="input w-full resize-y py-2 text-[13px] leading-5"
          />
          <p className="mt-1 text-2xs text-fg-4">Linha em branco separa uma bolha da outra (até 3).</p>
        </div>
      ) : (
        <div className={clsx('space-y-1.5', compacto && 'max-h-48 overflow-y-auto')}>
          {mensagens.map((m, i) => (
            <Bolha key={i} de="agente" texto={m} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} loading={busy === 'descartar'} disabled={!!busy} onClick={() => void fazer('descartar')}>
          Descartar
        </Button>
        {editando ? (
          <>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => (setEditando(false), setTexto(mensagens.join('\n\n')))}>
              Cancelar
            </Button>
            <Button size="sm" variant="go" icon={<Check className="size-3.5" />} loading={busy === 'editar'} disabled={!!busy || !texto.trim()} onClick={() => void fazer('editar')}>
              Enviar a minha versão
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} disabled={!!busy} onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button size="sm" variant="go" icon={<Check className="size-3.5" />} loading={busy === 'aprovar'} disabled={!!busy} onClick={() => void fazer('aprovar')}>
              Aprovar e enviar
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** A fila "Precisa de você": tudo o que o vendedor não faz sem você. */
export function PrecisaDeVoce({ onMudou, abrirConversa }: { onMudou: () => void; abrirConversa: (id: string) => void }) {
  const toast = useApp((s) => s.toast)
  const [dados, setDados] = useState<{ abertas: Pendencia[]; resolvidas: Pendencia[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setDados(await ag<{ abertas: Pendencia[]; resolvidas: Pendencia[] }>('/pendencias', { timeoutMs: 10000 }))
      setErro(null)
    } catch (err) {
      setErro(erroTexto(err))
    }
  }, [])

  useEffect(() => {
    void carregar()
    const t = setInterval(() => document.visibilityState === 'visible' && void carregar(), 15_000)
    return () => clearInterval(t)
  }, [carregar])

  const feito = () => {
    void carregar()
    onMudou()
  }

  async function marcarFeita(id: string) {
    try {
      await resolverPendencia(id, 'feita')
      feito()
    } catch (err) {
      toast(erroTexto(err), 'error')
    }
  }

  if (!dados) return erro ? <Empty icon={<Inbox />} title="Não deu para abrir a fila">{erro}</Empty> : <div className="grid h-40 place-items-center"><Spinner /></div>

  return (
    <div className="space-y-4">
      {dados.abertas.length === 0 ? (
        <Empty icon={<Inbox />} title="Nada esperando você">
          Quando uma mensagem precisar da sua aprovação, for barrada pela conferência ou o cliente chamar você, ela aparece aqui.
        </Empty>
      ) : (
        dados.abertas.map((p) => (
          <Card
            key={p.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="pv">{p.empresa || 'Sem conversa'}</span>
                <span className={clsx('rounded px-1.5 text-[10px] font-semibold', p.tipo === 'barrada' ? 'bg-red-500/10 text-red-300' : p.tipo === 'aprovar' ? 'bg-blue-500/10 text-blue-300' : 'bg-amber-400/10 text-amber-300')}>{TIPO[p.tipo]}</span>
              </span>
            }
            description={
              <span>
                {p.telefone && <span className="pv">{formatPhone(p.telefone)} · </span>}
                {formatRelative(p.criadaEm)}
                {p.prazo && ` · responder até ${new Date(p.prazo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            }
            actions={
              p.conversaId ? (
                <button className="text-2xs text-blue-300 hover:text-blue-200" onClick={() => abrirConversa(p.conversaId!)}>
                  Ver conversa →
                </button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <p className="flex items-start gap-1.5 text-xs text-fg-2">
                <ShieldAlert className={clsx('mt-px size-3.5 shrink-0', p.tipo === 'barrada' ? 'text-red-300' : 'text-fg-4')} />
                <span>
                  {p.texto}
                  {p.motivo && <span className="block text-fg-3">{p.motivo}</span>}
                </span>
              </p>
              {!!p.ultimas?.length && (
                <div className="space-y-1.5 rounded-lg border border-line-soft bg-panel/50 p-2.5">
                  {p.ultimas.map((m, i) => (
                    <Bolha key={i} de={m.de} texto={m.texto} em={m.em} />
                  ))}
                </div>
              )}
              {p.rascunho?.mensagens.length ? (
                <div>
                  <p className="mb-1.5 text-2xs font-medium text-fg-3">
                    Mensagem pronta{p.rascunho.barradas.length > 0 && ` (barrada antes: ${p.rascunho.barradas.join('; ')})`}
                  </p>
                  <RascunhoPendente id={p.id} mensagens={p.rascunho.mensagens} onFeito={feito} />
                </div>
              ) : (
                <div className="flex justify-end gap-1.5">
                  {p.telefone && (
                    <Link to={`/conversas?tel=${p.telefone}`} className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs text-fg-2 hover:bg-hover">
                      Responder nas Conversas
                    </Link>
                  )}
                  <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => void marcarFeita(p.id)}>
                    Feito
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))
      )}
      {dados.resolvidas.length > 0 && (
        <Card title="Resolvidas há pouco" bodyClass="divide-y divide-line-soft">
          {dados.resolvidas.slice(0, 12).map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="pv min-w-0 flex-1 truncate text-fg-2">
                {p.empresa ? `${p.empresa}: ` : ''}
                {p.texto}
              </span>
              <span className="shrink-0 text-fg-3">{p.resultado ? RESULTADO[p.resultado] : ''}</span>
              <span className="shrink-0 text-2xs text-fg-4">{p.resolvidaEm ? formatRelative(p.resolvidaEm) : ''}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
