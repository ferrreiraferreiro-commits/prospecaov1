// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { BadgeCheck, Copy, ExternalLink, KeyRound, LogOut, MessageCircle, Pencil, Send, Webhook, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Field } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button, Spinner } from '../components/ui'
import { supabase } from '../data/supabaseClient'
import { formatPhone } from '../lib/contact'
import { metaFetch, useMetaConexao, webhookUrl } from '../lib/meta'
import { useApp } from '../store/useApp'

/**
 * API oficial do WhatsApp (Meta) → Conexão. Separada do WhatsApp da XS (QR code):
 * a pessoa cola as credenciais do próprio app da Meta e o webhook da XS no painel da Meta.
 */
export function MetaConexaoPage() {
  const { carregado, conexao, conexoes, carregar } = useMetaConexao()
  const [novo, setNovo] = useState(false)
  const toast = useApp((s) => s.toast)
  const [editando, setEditando] = useState(false)
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    void carregar()
    // Enquanto o webhook não chegou, confere de vez em quando (a pessoa está no painel da Meta)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, 15_000)
    return () => clearInterval(t)
  }, [carregar])

  const desconectar = async () => {
    if (!window.confirm('Desconectar este número da API oficial? As credenciais dele saem da XS. As conversas e campanhas continuam aqui.')) return
    setSaindo(true)
    try {
      const { error } = (await supabase?.rpc('meta_desconectar', { p_numero_id: conexao?.numero_id ?? null })) ?? { error: null }
      if (error) throw new Error(error.message)
      await carregar()
      toast('API oficial desconectada.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao desconectar.', 'error')
    } finally {
      setSaindo(false)
    }
  }

  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <PageHeader
        title="API oficial · Conexão"
        subtitle="Use o WhatsApp pela API oficial da Meta. Fica separado do WhatsApp da XS (QR code): os dois podem funcionar ao mesmo tempo."
      />

      {!supabase ? (
        <Card>
          <p className="text-xs text-fg-3">A API oficial precisa da sua conta da XS (não funciona no modo local).</p>
        </Card>
      ) : !carregado ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : conexao && !editando && !novo ? (
        <>
          <Card
            title={conexoes.length > 1 ? `Conectada · ${conexoes.length} números` : 'Conectada'}
            actions={
              <>
                <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setNovo(true)}>
                  Adicionar número
                </Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditando(true)}>
                  Trocar credenciais
                </Button>
                <Button size="sm" variant="ghost" loading={saindo} icon={<LogOut className="size-3.5" />} onClick={() => void desconectar()}>
                  Desconectar
                </Button>
              </>
            }
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Linha titulo="Número" valor={<span className="pv num">{conexao.numero ? formatPhone(conexao.numero) : conexao.numero_id}</span>} />
              <Linha titulo="Nome verificado" valor={<span className="pv">{conexao.nome_verificado || '—'}</span>} />
              <Linha
                titulo="Avisos da Meta (webhook)"
                valor={
                  conexao.webhook_ok_em ? (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <span className="size-2 rounded-full bg-go" /> Recebendo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-200">
                      <span className="size-2 animate-pulse rounded-full bg-amber-400" /> Aguardando
                    </span>
                  )
                }
              />
            </div>
            {conexao.webhook_ok_em && (
              <p className="mt-2 text-2xs text-fg-4">Último aviso recebido em {new Date(conexao.webhook_ok_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/api-oficial/conversas" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg">
                <MessageCircle className="size-3.5" /> Conversas
              </Link>
              <Link to="/api-oficial/disparo" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg">
                <Send className="size-3.5" /> Disparo
              </Link>
            </div>
          </Card>

          <Card
            title="Webhook: cole no painel da Meta"
            description="Sem isso a XS envia, mas não recebe as respostas nem os avisos de entregue e lido."
          >
            <div className="space-y-3">
              <Copiavel titulo="URL de callback" valor={webhookUrl(conexao.gancho)} />
              <Copiavel titulo="Token de verificação" valor={conexao.verificacao} />
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-fg-3">
                <li>
                  No{' '}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">
                    painel da Meta para desenvolvedores
                  </a>
                  , abra o seu app → <b className="text-fg-2">WhatsApp → Configuração</b>.
                </li>
                <li>
                  Em <b className="text-fg-2">Webhook</b>, clique em Editar, cole a URL e o token acima e clique em <b className="text-fg-2">Verificar e salvar</b>.
                </li>
                <li>
                  Em <b className="text-fg-2">Campos do webhook</b>, assine o campo <b className="text-fg-2">messages</b>.
                </li>
                <li>Mande uma mensagem do seu celular para o número conectado: o status acima muda para “Recebendo”.</li>
              </ol>
            </div>
          </Card>

          <Regras />
        </>
      ) : (
        <>
          <Formulario
            trocando={!!conexao && !novo}
            onCancelar={conexao ? () => (setEditando(false), setNovo(false)) : undefined}
            onConectou={async () => {
              await carregar()
              setEditando(false)
              setNovo(false)
            }}
          />
          <Regras />
        </>
      )}
    </div>
  )
}

function Formulario({ trocando, onCancelar, onConectou }: { trocando: boolean; onCancelar?: () => void; onConectou: () => Promise<void> }) {
  const toast = useApp((s) => s.toast)
  const [numeroId, setNumeroId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [token, setToken] = useState('')
  const [segredo, setSegredo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const conectar = async () => {
    setSalvando(true)
    try {
      const r = await metaFetch<{ numero: string | null; nome: string | null }>({ acao: 'conectar', numeroId: numeroId.trim(), wabaId: wabaId.trim(), token: token.trim(), segredo: segredo.trim() })
      toast(`API oficial conectada${r.numero ? ` (${r.numero})` : ''}.`)
      await onConectou()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível conectar.', 'error')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card
      title={trocando ? 'Trocar credenciais' : 'Conectar a API oficial'}
      description="Os dados ficam no app da Meta que você criou. A XS testa tudo na Meta antes de salvar."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID do número de telefone" hint="WhatsApp → Configuração da API">
              <input className="input num" inputMode="numeric" value={numeroId} onChange={(e) => setNumeroId(e.target.value)} placeholder="Ex.: 123456789012345" />
            </Field>
            <Field label="ID da conta do WhatsApp Business" hint="WhatsApp → Configuração da API">
              <input className="input num" inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="Ex.: 102345678901234" />
            </Field>
          </div>
          <Field label="Token de acesso permanente" hint="Do usuário do sistema, com as permissões whatsapp_business_messaging e whatsapp_business_management">
            <input className="input font-mono text-2xs" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
          </Field>
          <Field label="Chave secreta do app" hint="Configurações do app → Básico → Chave secreta do app. Serve para a XS conferir que os avisos vieram mesmo da Meta.">
            <input className="input font-mono text-2xs" type="password" autoComplete="off" value={segredo} onChange={(e) => setSegredo(e.target.value)} placeholder="32 letras e números" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={salvando} disabled={!numeroId || !wabaId || !token || !segredo} icon={<KeyRound className="size-3.5" />} onClick={() => void conectar()}>
              {trocando ? 'Salvar e testar' : 'Conectar'}
            </Button>
            {onCancelar && (
              <Button variant="ghost" onClick={onCancelar}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
        <aside className="rounded-lg border border-line-soft bg-ink p-3.5 text-xs leading-5 text-fg-3">
          <p className="mb-1.5 font-semibold text-fg-2">Onde pegar cada coisa</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Crie um app do tipo <b className="text-fg-2">Empresa</b> em{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">
                developers.facebook.com <ExternalLink className="inline size-3" />
              </a>{' '}
              e adicione o produto WhatsApp.
            </li>
            <li>Adicione e verifique o seu número em WhatsApp → Configuração da API.</li>
            <li>
              No{' '}
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">
                Gerenciador de Negócios
              </a>
              , crie um usuário do sistema, dê acesso ao app e à conta do WhatsApp e gere um token que <b className="text-fg-2">nunca expira</b>.
            </li>
            <li>Cadastre um cartão na conta do WhatsApp Business (a Meta cobra você direto).</li>
          </ol>
        </aside>
      </div>
    </Card>
  )
}

function Regras() {
  return (
    <Card title="Como a API oficial funciona">
      <ul className="grid gap-2 text-xs leading-5 text-fg-3 sm:grid-cols-3">
        <li className="rounded-lg border border-line-soft bg-ink p-3">
          <BadgeCheck className="mb-1 size-4 text-emerald-300" />
          <b className="text-fg-2">Primeira mensagem = modelo aprovado.</b> Para quem não falou com você nas últimas 24 h, só sai um modelo aprovado pela Meta.
        </li>
        <li className="rounded-lg border border-line-soft bg-ink p-3">
          <MessageCircle className="mb-1 size-4 text-blue-300" />
          <b className="text-fg-2">Janela de 24 h.</b> Depois que a pessoa responde, você conversa livre por 24 h a partir da última mensagem dela.
        </li>
        <li className="rounded-lg border border-line-soft bg-ink p-3">
          <Webhook className="mb-1 size-4 text-gold" />
          <b className="text-fg-2">Cobrança da Meta.</b> A Meta cobra cada modelo enviado direto no seu cartão. A XS não cobra nada a mais por isso.
        </li>
      </ul>
    </Card>
  )
}

function Linha({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-soft bg-ink px-3.5 py-2.5">
      <p className="text-2xs text-fg-4">{titulo}</p>
      <div className="mt-0.5 text-sm font-semibold text-fg">{valor}</div>
    </div>
  )
}

function Copiavel({ titulo, valor }: { titulo: string; valor: string }) {
  const toast = useApp((s) => s.toast)
  const [ok, setOk] = useState(false)
  return (
    <Field label={titulo}>
      <div className="flex gap-2">
        <input className="input num flex-1 font-mono text-2xs" readOnly value={valor} onFocus={(e) => e.currentTarget.select()} />
        <Button
          icon={<Copy className={clsx('size-3.5', ok && 'text-emerald-300')} />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor)
              setOk(true)
              setTimeout(() => setOk(false), 1500)
            } catch {
              toast('Não deu para copiar. Selecione e copie à mão.', 'error')
            }
          }}
        >
          {ok ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </Field>
  )
}
