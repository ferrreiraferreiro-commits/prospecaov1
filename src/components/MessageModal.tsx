import clsx from 'clsx'
import { Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPhone, whatsappTarget } from '../lib/contact'
import { formatRelative } from '../lib/dates'
import { fillMessage, getMessages, lastMessageAt, responsavelDoLead, variationIndex, variationsOf } from '../lib/messages'
import type { Lead } from '../lib/types'
import { useLead } from '../store/derived'
import { useApp } from '../store/useApp'
import { useUi } from '../store/useUi'
import { Button, Modal, WhatsAppIcon } from './ui'
import { useSendMessage, useWhatsApp } from './whatsapp'

/** "Mandar mensagem": escolhe o modelo, confere o texto e abre o WhatsApp com ele escrito. */
export function MessageModal() {
  const target = useUi((s) => s.message)
  const openMessage = useUi((s) => s.openMessage)
  const lead = useLead(target?.leadId)
  if (!target || !lead) return null
  return <MessageFlow key={lead.id} lead={lead} initialTemplate={target.templateId} onClose={() => openMessage(null)} />
}

function MessageFlow({ lead, initialTemplate, onClose }: { lead: Lead; initialTemplate?: string; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const interactions = useApp((s) => s.interactions)
  const toast = useApp((s) => s.toast)
  const send = useSendMessage()
  const openChat = useWhatsApp()
  const templates = getMessages(settings)
  const [templateId, setTemplateId] = useState(() => templates.find((t) => t.id === initialTemplate)?.id ?? templates[0]?.id)
  const template = templates.find((t) => t.id === templateId) ?? templates[0]
  const variations = template ? variationsOf(template) : []
  const [variation, setVariation] = useState(() => (template ? variationIndex(template, lead.id) : 0))
  const [text, setText] = useState(() => fillMessage(variations[variation] ?? '', lead, settings))

  const choose = (id: string, index?: number) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const options = variationsOf(t)
    const i = index ?? variationIndex(t, lead.id)
    setTemplateId(id)
    setVariation(i)
    setText(fillMessage(options[i] ?? '', lead, settings))
  }

  const target = whatsappTarget(lead)
  const last = useMemo(() => lastMessageAt(interactions, lead.id), [interactions, lead.id])
  const semResponsavel = !responsavelDoLead(lead) && /\{\s*responsavel\s*\}/.test(variations[variation] ?? '')
  const semNome = !settings.nome_vendedor.trim() && /\{\s*nome\s*\}/.test(variations[variation] ?? '')

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-xl"
      title="Mensagem de WhatsApp"
      subtitle={
        <span className="text-fg-2">
          {lead.empresa}
          {target && <span className="num text-fg-3"> · {formatPhone(target.number)}</span>}
        </span>
      }
      footer={
        <>
          <Link to="/mensagens" onClick={onClose} className="mr-auto inline-flex items-center gap-1.5 text-2xs text-fg-3 hover:text-fg">
            <Settings2 className="size-3" /> Editar modelos
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              void openChat(lead)
              onClose()
            }}
            disabled={!target}
          >
            Abrir sem texto
          </Button>
          <Button
            variant="primary"
            icon={<WhatsAppIcon className="size-3.5" />}
            disabled={!target || !text.trim()}
            onClick={() => {
              if (send(lead, text, template?.nome)) {
                toast('Mensagem escrita no WhatsApp. Confira e aperte enviar lá.')
                onClose()
              }
            }}
          >
            Abrir no WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {last && (
          <p className="rounded-md border border-teal-300/20 bg-teal-300/[0.05] px-3 py-2 text-xs text-fg-2">
            Já foi aberta uma mensagem para este lead <span className="num text-fg">{formatRelative(last)}</span>.
          </p>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-fg-2">Modelo</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(t.id)}
                className={clsx(
                  'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  t.id === template?.id ? 'border-teal-300/40 bg-teal-300/10 text-teal-300' : 'border-line bg-ink text-fg-2 hover:border-line-strong hover:text-fg',
                )}
              >
                {t.nome}
              </button>
            ))}
          </div>
          {variations.length > 1 && (
            <div className="mt-2 flex items-center gap-1.5 text-2xs text-fg-3">
              Variação
              {variations.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => template && choose(template.id, i)}
                  className={clsx('num size-6 rounded-md border', i === variation ? 'border-line-strong bg-raised text-fg' : 'border-line text-fg-3 hover:text-fg')}
                  aria-label={`Variação ${i + 1}`}
                >
                  {i + 1}
                </button>
              ))}
              <span className="text-fg-4">· cada lead recebe uma, em rodízio</span>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="msg-text">
            Texto (pode editar antes de abrir)
          </label>
          <textarea id="msg-text" className="input resize-y leading-5" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          {(semResponsavel || semNome) && (
            <p className="mt-1.5 text-2xs text-fg-3">
              {semResponsavel && 'Sem nome do responsável: a saudação ficou sem nome. Preencha “Falei com” ou consulte o CNPJ para personalizar. '}
              {semNome && (
                <>
                  Seu nome não está no perfil.{' '}
                  <Link to="/configuracoes#perfil" onClick={onClose} className="text-blue-300 hover:text-blue-200">
                    Preencher
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <p className="text-2xs leading-4 text-fg-4">
          O WhatsApp abre com o texto pronto — nada é enviado sozinho. A mensagem fica no histórico do lead e o Status 2 vira “Mensagem enviada” se estiver vazio.
        </p>
      </div>
    </Modal>
  )
}
