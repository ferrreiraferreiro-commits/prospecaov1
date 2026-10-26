// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import { Copy, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../data/supabaseClient'
import { formatRelative } from '../lib/dates'
import { useIsAdmin } from '../store/useAccount'
import { useApp } from '../store/useApp'
import { novaChave, sha256, type ChaveApi } from './agente/ConectorClaude'
import { erroTexto } from './agente/comum'
import { Button, Modal } from './ui'

/**
 * Ajustes → Jarvis: gera a chave pessoal (xs_…) para colar no Jarvis (Conexões → XS Prospecção).
 * Mesma tabela do conector do Claude Code (só o hash vai para o banco); a chave aparece uma vez só.
 */
export function ConectorJarvis() {
  const toast = useApp((s) => s.toast)
  const dono = useIsAdmin()
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
      const { error } = await supabase.from('chaves_api').insert({ nome: 'Jarvis', hash: await sha256(chave), final: chave.slice(-4) })
      if (error) throw new Error(error.message.includes('row-level security') ? 'Sua conta não pode criar chaves agora.' : 'Não consegui criar a chave agora.')
      setGerada(chave)
      await carregar()
    } catch (err) {
      toast(erroTexto(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function revogar(c: ChaveApi) {
    if (!supabase || !window.confirm(`Revogar a chave que termina em …${c.final}? Quem usa essa chave (Jarvis ou Claude Code) para de acessar a XS na hora.`)) return
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
      toast('Chave copiada. Cole no Jarvis.')
    } catch {
      toast('Não consegui copiar: selecione a chave e copie.', 'error')
    }
  }

  if (!supabase) return <p className="text-xs text-fg-4">Disponível só com a conta da XS (não no modo local).</p>
  const ativas = (chaves ?? []).filter((c) => !c.revogada_em)

  return (
    <>
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-fg-2">
        <li>Clique em <b>Gerar chave para o Jarvis</b> e depois em <b>Copiar chave</b>.</li>
        <li>No Jarvis, abra <b>Conexões → XS Prospecção</b>, cole a chave e clique em verificar.</li>
        <li>
          {dono
            ? 'Pronto: pelo Jarvis você vê e mexe em leads, CRM, financeiro, vendedor, disparos e prompts de site.'
            : 'Pronto: pelo Jarvis você vê e mexe nos seus leads, clientes, projetos e financeiro.'}
        </li>
      </ol>
      {ativas.length > 0 && (
        <ul className="mb-3 space-y-1">
          {ativas.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-fg-2">
                {c.nome || 'Chave'} …{c.final} <span className="text-fg-4">· {c.usada_em ? `usada ${formatRelative(c.usada_em)}` : 'ainda não usada'}</span>
              </span>
              <button type="button" title="Revogar" onClick={() => void revogar(c)} className="text-fg-4 hover:text-red-300">
                <ShieldOff className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="primary" loading={busy} onClick={() => void gerar()}>
        Gerar chave para o Jarvis
      </Button>
      <Modal
        open={!!gerada}
        onClose={() => setGerada(null)}
        title="Chave do Jarvis"
        subtitle="Ela aparece só agora. Copie e cole no Jarvis; não mostre para ninguém."
        width="max-w-xl"
        footer={
          gerada && (
            <>
              <span className="flex-1" />
              <Button size="sm" variant="primary" icon={<Copy className="size-3.5" />} onClick={() => void copiar(gerada)}>
                Copiar chave
              </Button>
            </>
          )
        }
      >
        {gerada && (
          <div className="space-y-3 px-5 py-4 text-xs text-fg-2">
            <code className="block select-all break-all rounded-md border border-line-soft bg-black/30 px-3 py-2.5 font-mono text-[12px] text-fg-1">{gerada}</code>
            <p>
              No Jarvis: <b>Conexões → XS Prospecção</b> → cole a chave → verificar. Se perder, gere outra aqui e revogue a antiga.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
