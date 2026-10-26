// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { Copy, Plug, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../data/supabaseClient'
import { formatRelative } from '../../lib/dates'
import { WA_URL } from '../../lib/waServico'
import { useApp } from '../../store/useApp'
import { Card } from '../kit'
import { Button, Modal } from '../ui'
import { erroTexto } from './comum'

export interface ChaveApi {
  id: string
  nome: string
  final: string
  criada_em: string
  usada_em: string | null
  revogada_em: string | null
}

/** Endereço do conector (o mesmo servidor do WhatsApp da XS). */
export const URL_CONECTOR = `${WA_URL}/mcp`

export async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function novaChave(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `xs_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

const comando = (chave: string) => `claude mcp add --scope user --transport http xs ${URL_CONECTOR} --header "Authorization: Bearer ${chave}"`

/**
 * Liga a XS no Claude Code: gera uma chave pessoal (só o hash vai para o banco), mostra o comando uma vez
 * e deixa revogar. Com o conector, o Claude Code lê leads, clientes, o vendedor, o Xico e os prompts de site.
 */
export function ConectorClaude() {
  const toast = useApp((s) => s.toast)
  const [chaves, setChaves] = useState<ChaveApi[] | null>(null)
  const [gerada, setGerada] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    if (!supabase) return setChaves([])
    const { data } = await supabase.from('chaves_api').select('id, nome, final, criada_em, usada_em, revogada_em').order('criada_em', { ascending: false })
    setChaves((data as ChaveApi[] | null) ?? [])
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function gerar() {
    if (!supabase) return
    setBusy(true)
    try {
      const chave = novaChave()
      const { error } = await supabase.from('chaves_api').insert({ nome: 'Claude Code', hash: await sha256(chave), final: chave.slice(-4) })
      if (error) throw new Error(error.message.includes('row-level security') ? 'Só o dono da XS pode criar chaves.' : 'Não consegui criar a chave agora.')
      setGerada(chave)
      await carregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function revogar(c: ChaveApi) {
    if (!supabase || !window.confirm(`Revogar a chave que termina em …${c.final}? O Claude Code para de acessar a XS com ela na hora.`)) return
    const { error } = await supabase.from('chaves_api').update({ revogada_em: new Date().toISOString() }).eq('id', c.id)
    if (error) toast('Não consegui revogar agora.', 'error')
    else {
      toast('Chave revogada.')
      await carregar()
    }
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      toast('Comando copiado.')
    } catch {
      toast('Não consegui copiar: selecione o texto e copie.', 'error')
    }
  }

  const ativas = (chaves ?? []).filter((c) => !c.revogada_em)

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Plug className="size-3.5 text-blue-300" /> Conectar ao Claude Code
        </span>
      }
      description="O Claude Code passa a enxergar a XS: leads, clientes, o vendedor, o Xico e os prompts de site."
    >
      {!supabase ? (
        <p className="text-xs text-fg-4">Disponível só com a conta da XS (não no modo local).</p>
      ) : (
        <>
          {ativas.length > 0 && (
            <ul className="mb-2.5 space-y-1">
              {ativas.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-fg-2">
                    Chave …{c.final} <span className="text-fg-4">· {c.usada_em ? `usada ${formatRelative(c.usada_em)}` : 'ainda não usada'}</span>
                  </span>
                  <button type="button" title="Revogar" onClick={() => void revogar(c)} className="text-fg-4 hover:text-red-300">
                    <ShieldOff className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="secondary" className="w-full" loading={busy} onClick={() => void gerar()}>
            {ativas.length ? 'Gerar outra chave' : 'Gerar chave e comando'}
          </Button>
        </>
      )}
      <Modal
        open={!!gerada}
        onClose={() => setGerada(null)}
        title="Conectar a XS no Claude Code"
        subtitle="Esta chave aparece só agora. Guarde o comando ou rode já."
        width="max-w-2xl"
        footer={
          gerada && (
            <>
              <span className="flex-1" />
              <Button size="sm" variant="primary" icon={<Copy className="size-3.5" />} onClick={() => void copiar(comando(gerada))}>
                Copiar comando
              </Button>
            </>
          )
        }
      >
        {gerada && (
          <div className="space-y-3 px-5 py-4 text-xs text-fg-2">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>
                No app do Claude, aba <b>Code</b>, abra o <b>Terminal</b> (ou o PowerShell do Windows).
              </li>
              <li>Cole o comando abaixo e aperte Enter.</li>
              <li>
                Abra uma conversa nova no Claude Code e peça, por exemplo: <i>"pega na XS os dados da Pizzaria X e o modelo de prompt de site e monta o site"</i>.
              </li>
            </ol>
            <pre className="rounded-md border border-line bg-ink p-3 font-mono text-[11px] leading-5 break-all whitespace-pre-wrap text-fg">{comando(gerada)}</pre>
            <p className="text-2xs text-fg-4">A chave dá acesso aos seus dados da XS. Não mande para ninguém nem cole em conversa. Se vazar, revogue aqui e gere outra.</p>
          </div>
        )}
      </Modal>
    </Card>
  )
}
