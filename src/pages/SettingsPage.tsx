import { Bell, Camera, Database, Download, LogOut, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Avatar, resizeAvatar } from '../components/Avatar'
import { PageHeader } from '../components/PageHeader'
import { Button, Segmented } from '../components/ui'
import { getWhatsAppDestino, setWhatsAppDestino } from '../components/whatsapp'
import { supabase } from '../data/supabaseClient'
import { changePassword, isLegacyEmail, USUARIO_REGRA, usuarioValido } from '../lib/auth'
import { formatDateTime } from '../lib/dates'
import { getAvisosOn, notificationPermission, setAvisosOn, showSystemNotification } from '../lib/notify'
import { InstalarApp } from '../components/InstalarApp'
import { GoogleKeyCard } from '../components/GoogleKeyCard'
import { DEFAULT_SETTINGS, type Snapshot } from '../lib/types'
import { exportSnapshot, useApp } from '../store/useApp'
import clsx from 'clsx'
import { BIZ_TABLES, emptyBiz, type BizSnapshot } from '../lib/biz'
import { useWaServico } from '../lib/waServico'
import { useAccount, useHasWhatsApp } from '../store/useAccount'
import { useBiz } from '../store/useBiz'


function Card({ id, title, description, children, actions }: { id?: string; title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-6">
      <header className="flex flex-wrap items-start gap-3 border-b border-line-soft px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const temWhatsApp = useHasWhatsApp()
  const settings = useApp((s) => s.settings)
  const imports = useApp((s) => s.imports)
  const leads = useApp((s) => s.leads)
  const repoKind = useApp((s) => s.repo?.kind)
  const { saveSettings, restoreBackup, toast } = useApp.getState()

  const [nome, setNome] = useState(settings.nome_vendedor)
  const [servico, setServico] = useState(settings.servico)
  const [meta, setMeta] = useState(String(settings.meta_diaria))
  const avatarRef = useRef<HTMLInputElement>(null)
  const { hash } = useLocation()

  // Links como /configuracoes#whatsapp levam direto à seção
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
  const [confirmWipe, setConfirmWipe] = useState('')
  const [waDestino, setWaDestino] = useState(getWhatsAppDestino)
  const [busy, setBusy] = useState(false)
  const [avisos, setAvisos] = useState(getAvisosOn)
  const [permissao, setPermissao] = useState(notificationPermission)
  const [maxTent, setMaxTent] = useState(String(settings.max_tentativas))
  const fileRef = useRef<HTMLInputElement>(null)

  const saveProfile = async () => {
    await saveSettings({ ...settings, nome_vendedor: nome.trim(), servico: servico.trim(), meta_diaria: Math.max(1, Math.round(Number(meta) || DEFAULT_SETTINGS.meta_diaria)) })
    toast('Perfil salvo.')
  }

  const changeAvatar = async (file: File) => {
    try {
      const avatar = await resizeAvatar(file)
      await saveSettings({ ...useApp.getState().settings, avatar })
      toast('Foto atualizada.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao trocar a foto.', 'error')
    }
  }

  const exportBackup = () => {
    const biz = useBiz.getState()
    const gestao = Object.fromEntries(BIZ_TABLES.map((t) => [t, biz[t]]))
    const blob = new Blob([JSON.stringify({ ...exportSnapshot(), gestao }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `xs-prospeccao-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Snapshot & { gestao?: Partial<BizSnapshot> }
      if (!Array.isArray(data.leads) || !Array.isArray(data.interactions)) throw new Error('Arquivo de backup inválido.')
      const extra = data.gestao ? ` e ${data.gestao.clients?.length ?? 0} clientes` : ''
      if (!window.confirm(`Restaurar ${data.leads.length} leads${extra}? Os dados atuais serão substituídos.`)) return
      setBusy(true)
      await restoreBackup({
        leads: data.leads,
        interactions: data.interactions,
        followups: data.followups ?? [],
        meetings: data.meetings ?? [],
        imports: data.imports ?? [],
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
      })
      // Backups da XS trazem também a gestão (os da Central antiga, só os leads)
      if (data.gestao) await useBiz.getState().restore({ ...emptyBiz(), ...data.gestao })
      toast('Backup restaurado.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao restaurar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const wipe = async () => {
    setBusy(true)
    try {
      await restoreBackup({ leads: [], interactions: [], followups: [], meetings: [], imports: [], settings })
      setConfirmWipe('')
      toast('Todos os leads foram apagados.', 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao apagar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Ajustes" subtitle={temWhatsApp ? 'Perfil, avisos, WhatsApp e backup.' : 'Perfil, avisos e backup.'} />

      <Card id="perfil" title="Meu perfil" description="O primeiro nome entra no roteiro como {nome}." actions={<Button variant="primary" size="sm" onClick={saveProfile}>Salvar perfil</Button>}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar src={settings.avatar} name={nome || 'Você'} size={56} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Camera className="size-3.5" />} onClick={() => avatarRef.current?.click()}>
              {settings.avatar ? 'Trocar foto' : 'Adicionar foto'}
            </Button>
            {settings.avatar && (
              <Button size="sm" variant="ghost" onClick={() => saveSettings({ ...settings, avatar: null })}>
                Remover foto
              </Button>
            )}
          </div>
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void changeAvatar(file)
              e.target.value = ''
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
          <div>
            <label className="label" htmlFor="st-nome">Seu nome</label>
            <input id="st-nome" className="input" value={nome} placeholder="Como você se apresenta na ligação" onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-serv">O que você oferece</label>
            <input id="st-serv" className="input" value={servico} onChange={(e) => setServico(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-meta">Meta diária</label>
            <input id="st-meta" type="number" min={1} className="input num" value={meta} onChange={(e) => setMeta(e.target.value)} />
          </div>
        </div>
      </Card>

      {supabase && <AcessoCard />}

      <GoogleKeyCard />

      <Card
        title="WhatsApp"
        description="Onde abrir a conversa ao clicar em WhatsApp ou “Ligar pelo WhatsApp”. Vale só para este dispositivo."
      >
        <Segmented
          value={waDestino}
          onChange={(v) => {
            setWaDestino(v)
            setWhatsAppDestino(v)
            toast(v === 'web' ? 'WhatsApp vai abrir no navegador (WhatsApp Web).' : 'WhatsApp vai abrir no app instalado.')
          }}
          options={[
            { id: 'web', label: 'WhatsApp Web (navegador)' },
            { id: 'app', label: 'App do WhatsApp (Windows/celular)' },
          ]}
        />
        <p className="mt-2.5 text-2xs leading-4 text-fg-3">
          O WhatsApp Web abre sempre na mesma aba, trocando de conversa a cada lead. Para ligar, clique no ícone de telefone no topo da conversa. Se o
          seu WhatsApp Web não mostrar esse ícone, use o app do WhatsApp para Windows.
        </p>
      </Card>

      <Card id="tentativas" title="Novas tentativas automáticas" description="Quando a ligação não é atendida, o retorno já vem agendado para o dia seguinte, no período oposto (ligou de manhã → tenta à tarde).">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-fg-2">
            <input
              type="checkbox"
              className="accent-[var(--color-go)]"
              checked={settings.auto_tentativas}
              onChange={(e) => {
                void saveSettings({ ...settings, auto_tentativas: e.target.checked })
                toast(e.target.checked ? 'Novas tentativas automáticas ligadas.' : 'Novas tentativas automáticas desligadas.')
              }}
            />
            Agendar a próxima tentativa sozinho
          </label>
          <label className="flex items-center gap-2 text-fg-2">
            Sugerir encerrar depois de
            <input
              type="number"
              min={2}
              max={20}
              className="input num h-7 w-14 px-2 text-center text-xs"
              value={maxTent}
              onChange={(e) => setMaxTent(e.target.value)}
              onBlur={() => {
                const n = Math.max(2, Math.min(20, Math.round(Number(maxTent) || 5)))
                setMaxTent(String(n))
                if (n !== settings.max_tentativas) void saveSettings({ ...settings, max_tentativas: n })
              }}
            />
            tentativas seguidas sem resposta
          </label>
        </div>
        <p className="mt-2.5 text-2xs leading-4 text-fg-3">
          O retorno aparece no painel da ligação antes de salvar — dá para mudar o dia ou tirar. Leads que passam do limite saem da fila e aparecem em Hoje → “Sugestão: encerrar”.
        </p>
      </Card>

      <Card id="avisos" title="Avisos de retorno e reunião" description="Na hora de um retorno marcado (e 10 minutos antes de uma reunião) aparece um aviso. Funciona enquanto o site ou o app estiver aberto.">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-fg-2">
            <input
              type="checkbox"
              className="accent-[var(--color-go)]"
              checked={avisos}
              onChange={(e) => {
                setAvisos(e.target.checked)
                setAvisosOn(e.target.checked)
              }}
            />
            Avisar neste dispositivo
          </label>
          {permissao === 'granted' ? (
            <>
              <span className="text-go">Notificações do sistema permitidas</span>
              <Button size="xs" variant="ghost" onClick={() => showSystemNotification('Teste de aviso', 'Assim aparece um retorno na hora marcada.', 'teste')}>
                Testar
              </Button>
            </>
          ) : permissao === 'denied' ? (
            <span className="text-fg-3">Notificações bloqueadas no navegador — libere no cadeado ao lado do endereço do site.</span>
          ) : permissao === 'unsupported' ? (
            <span className="text-fg-3">Este navegador não mostra notificações; o aviso aparece só dentro do site.</span>
          ) : (
            <Button
              size="sm"
              icon={<Bell className="size-3.5" />}
              onClick={async () => {
                const p = await Notification.requestPermission()
                setPermissao(p)
                if (p === 'granted') toast('Notificações ativadas.')
              }}
            >
              Permitir notificações do sistema
            </Button>
          )}
        </div>
      </Card>

      <Card id="app" title="Instalar como app" description="Abre em tela cheia, com ícone na tela inicial do celular ou na barra de tarefas do PC. Os dados continuam os mesmos.">
        <InstalarApp />
      </Card>

      <Card title="Importações" description={`${imports.length} ${imports.length === 1 ? 'arquivo importado' : 'arquivos importados'}`}>
        {imports.length === 0 ? (
          <p className="text-xs text-fg-4">Nenhuma importação ainda.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {[...imports].reverse().map((imp) => (
              <li key={imp.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-fg">{imp.arquivo}</span>
                <span className="num text-fg-2">{imp.quantidade_leads} leads</span>
                <span className="num text-fg-3">{formatDateTime(imp.data_importacao)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Dados"
        description={
          repoKind === 'supabase'
            ? 'Sincronizado com o Supabase.'
            : 'Salvos neste navegador. Exporte um backup de vez em quando — ou configure o Supabase para sincronizar.'
        }
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-tint/[0.04] px-2 py-1 text-2xs text-fg-2">
            <Database className="size-3" /> {repoKind === 'supabase' ? 'Supabase' : 'Local'}
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportBackup} disabled={!leads.length}>
            Exportar backup
          </Button>
          <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()} loading={busy}>
            Restaurar backup
          </Button>
          {supabase && (
            <Button size="sm" variant="ghost" icon={<LogOut className="size-3.5" />} onClick={() => supabase!.auth.signOut()}>
              Sair da conta
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importBackup(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="mt-5 rounded-lg border border-bad/20 bg-bad/[0.04] p-3">
          <p className="text-xs font-medium text-red-300">Apagar todos os leads</p>
          <p className="mt-0.5 text-2xs text-fg-3">Remove leads, histórico, retornos e reuniões. Digite APAGAR para confirmar.</p>
          <div className="mt-2 flex gap-2">
            <input className="input h-7 max-w-40 text-xs" value={confirmWipe} onChange={(e) => setConfirmWipe(e.target.value)} placeholder="APAGAR" aria-label="Confirmação" />
            <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={confirmWipe !== 'APAGAR' || busy} onClick={wipe}>
              Apagar tudo
            </Button>
          </div>
        </div>
      </Card>

      {temWhatsApp && <WhatsAppCard />}

    </div>
  )
}

/** O WhatsApp roda na nuvem da XS: aqui só a situação e o atalho para a Conexão. */
function WhatsAppCard() {
  const online = useWaServico((s) => s.online)
  const wa = useWaServico((s) => s.health?.whatsapp)
  return (
    <Card id="whatsapp" title="WhatsApp" description="O WhatsApp dos disparos, funis e mensagens agendadas roda na nuvem da XS. Não precisa instalar nada.">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-fg-2">
          <span className={clsx('size-2 rounded-full', online ? (wa?.status === 'connected' ? 'bg-go' : 'bg-amber-400') : 'bg-red-400')} />
          {online ? (wa?.status === 'connected' ? 'Conectado' : 'Desconectado') : online === false ? 'Serviço indisponível no momento' : 'Verificando…'}
        </span>
        <Link to="/whatsapp" className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-[#3b7bf6]">
          Abrir Conexão
        </Link>
      </div>
    </Card>
  )
}

/** E-mail de acesso e troca de senha (só com login). */
function AcessoCard() {
  const toast = useApp((s) => s.toast)
  const email = useAccount((s) => s.profile?.email ?? null)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const trocar = async () => {
    if (!supabase || !email) return
    setErro(null)
    if (nova !== confirma) return setErro('A confirmação não é igual à senha nova.')
    setSalvando(true)
    const err = await changePassword(supabase, email, atual, nova)
    setSalvando(false)
    if (err) return setErro(err)
    setAtual('')
    setNova('')
    setConfirma('')
    toast('Senha trocada. Use a nova no próximo acesso.')
  }

  return (
    <Card id="acesso" title="Acesso e senha" description="Você entra na XS com o usuário ou com o e-mail.">
      <div className="mb-5 grid gap-3 border-b border-line-soft pb-5 sm:grid-cols-2">
        <UsuarioCampo />
        <EmailCampo email={email} />
      </div>
      <p className="mb-2 text-xs font-semibold text-fg">Trocar senha</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void trocar()
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <div>
          <label className="label" htmlFor="ac-atual">Senha atual</label>
          <input id="ac-atual" type="password" className="input" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="ac-nova">Senha nova</label>
          <input id="ac-nova" type="password" className="input" autoComplete="new-password" minLength={6} placeholder="Pelo menos 6 caracteres" value={nova} onChange={(e) => setNova(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="ac-conf">Repita a senha nova</label>
          <input id="ac-conf" type="password" className="input" autoComplete="new-password" minLength={6} value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
        </div>
        <div className="flex items-center gap-3 sm:col-span-3">
          <Button type="submit" variant="primary" size="sm" loading={salvando} disabled={!atual || !nova || !confirma}>
            Trocar senha
          </Button>
          {erro && <p className="text-xs text-red-300">{erro}</p>}
        </div>
      </form>
    </Card>
  )
}

/** Nome de usuário: escolher ou trocar (precisa estar livre). */
function UsuarioCampo() {
  const toast = useApp((s) => s.toast)
  const profile = useAccount((s) => s.profile)
  const atual = profile?.usuario ?? ''
  const [valor, setValor] = useState(atual)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setValor(atual), [atual])
  const v = valor.trim().toLowerCase()

  const salvar = async () => {
    if (!supabase || !profile) return
    if (!usuarioValido(v)) return toast(USUARIO_REGRA, 'error')
    setSalvando(true)
    const { error } = await supabase.rpc('definir_meu_usuario', { u: v })
    setSalvando(false)
    if (error) return toast(error.message, 'error')
    useAccount.setState({ profile: { ...profile, usuario: v } })
    toast(`Pronto. Agora você também entra com “${v}”.`)
  }

  return (
    <div>
      <label className="label" htmlFor="ac-usuario">Usuário</label>
      <div className="flex gap-2">
        <input
          id="ac-usuario"
          className="input"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Escolha um usuário"
          value={valor}
          onChange={(e) => setValor(e.target.value.toLowerCase().replace(/\s+/g, ''))}
        />
        <Button size="sm" className="h-8" loading={salvando} disabled={!v || v === atual} onClick={() => void salvar()}>
          Salvar
        </Button>
      </div>
    </div>
  )
}

/** E-mail da conta. Conta só com usuário pode cadastrar um (serve para recuperar a senha). */
function EmailCampo({ email }: { email: string | null }) {
  const toast = useApp((s) => s.toast)
  const profile = useAccount((s) => s.profile)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const semEmail = isLegacyEmail(email)

  const salvar = async () => {
    if (!supabase || !profile) return
    setSalvando(true)
    const { error } = await supabase.rpc('definir_meu_email', { novo })
    if (error) {
      setSalvando(false)
      return toast(error.message, 'error')
    }
    await supabase.auth.refreshSession()
    await useAccount.getState().init(supabase, profile.user_id)
    setSalvando(false)
    toast('E-mail salvo. Ele serve para entrar e para recuperar a senha.')
  }

  if (!semEmail) {
    return (
      <div>
        <span className="label">E-mail</span>
        <p className="flex h-8 items-center text-xs font-medium text-fg">{email ?? 'Não informado'}</p>
      </div>
    )
  }
  return (
    <div>
      <label className="label" htmlFor="ac-email">
        E-mail <span className="font-normal text-fg-4">(opcional)</span>
      </label>
      <div className="flex gap-2">
        <input id="ac-email" type="email" className="input" placeholder="seu@email.com" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <Button size="sm" className="h-8" loading={salvando} disabled={!novo.includes('@')} onClick={() => void salvar()}>
          Salvar
        </Button>
      </div>
      <p className="mt-1 text-2xs text-fg-4">Sem e-mail, se esquecer a senha só o suporte consegue gerar outra.</p>
    </div>
  )
}
