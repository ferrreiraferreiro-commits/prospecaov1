import { Bell, Camera, Database, Download, LogOut, Smartphone, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Avatar, resizeAvatar } from '../components/Avatar'
import { MessagesEditor } from '../components/MessagesEditor'
import { MOTOR_DOWNLOAD, MotorSteps } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button, Segmented } from '../components/ui'
import { getWhatsAppDestino, setWhatsAppDestino } from '../components/whatsapp'
import { supabase } from '../data/supabaseClient'
import { formatDateTime } from '../lib/dates'
import { getAvisosOn, notificationPermission, setAvisosOn, showSystemNotification } from '../lib/notify'
import { isIos, isStandalone, useInstall } from '../lib/pwa'
import { DEFAULT_SETTINGS, type Snapshot } from '../lib/types'
import { exportSnapshot, useApp } from '../store/useApp'
import clsx from 'clsx'
import { BIZ_TABLES, emptyBiz, type BizSnapshot } from '../lib/biz'
import { DEFAULT_MOTOR_URL, getMotorUrl, setMotorUrl, useMotor } from '../lib/motor'
import { useHasMotor } from '../store/useAccount'
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
  const motor = useHasMotor()
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

  // Links como /configuracoes#motor levam direto à seção
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
  const [confirmWipe, setConfirmWipe] = useState('')
  const [waDestino, setWaDestino] = useState(getWhatsAppDestino)
  const [busy, setBusy] = useState(false)
  const [avisos, setAvisos] = useState(getAvisosOn)
  const [permissao, setPermissao] = useState(notificationPermission)
  const [maxTent, setMaxTent] = useState(String(settings.max_tentativas))
  const [canInstall, install] = useInstall()
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
      // Backups do XS trazem também a gestão (os da Central antiga, só os leads)
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
      <PageHeader title="Ajustes" subtitle={motor ? 'Perfil, mensagens, avisos, Motor XS e backup.' : 'Perfil, mensagens, avisos e backup.'} />

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
            <input id="st-nome" className="input" value={nome} placeholder="Ex.: Gabriel Yamashita" onChange={(e) => setNome(e.target.value)} />
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

      <Card
        id="mensagens"
        title="Mensagens de WhatsApp"
        description="Modelos usados no botão Mensagem. Cada modelo pode ter várias variações — cada lead recebe uma, em rodízio, para os textos não saírem todos iguais."
      >
        <MessagesEditor />
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
        {isStandalone() ? (
          <p className="text-xs text-go">Você já está usando o app instalado.</p>
        ) : canInstall ? (
          <Button
            variant="primary"
            size="sm"
            icon={<Smartphone className="size-3.5" />}
            onClick={async () => {
              if (await install()) toast('App instalado.')
            }}
          >
            Instalar agora
          </Button>
        ) : isIos() ? (
          <p className="text-xs leading-5 text-fg-2">
            No iPhone: abra este site no <span className="text-fg">Safari</span>, toque em <span className="text-fg">Compartilhar</span> e depois em{' '}
            <span className="text-fg">Adicionar à Tela de Início</span>.
          </p>
        ) : (
          <p className="text-xs leading-5 text-fg-2">
            No Android (Chrome): menu <span className="text-fg">⋮</span> → <span className="text-fg">Instalar app</span> ou <span className="text-fg">Adicionar à tela inicial</span>. No PC (Chrome/Edge): ícone de instalar na barra de endereço.
          </p>
        )}
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

      {motor && <MotorCard />}

    </div>
  )
}

function MotorCard() {
  const online = useMotor((s) => s.online)
  const health = useMotor((s) => s.health)
  const check = useMotor((s) => s.check)
  const toast = useApp((s) => s.toast)
  const [url, setUrl] = useState(getMotorUrl())
  return (
    <Card
      id="motor"
      title="Motor XS"
      description="Programa que roda no seu computador e faz a busca no Google Maps e o WhatsApp dos disparos."
      actions={
        <span className={clsx('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium', online ? 'bg-go/10 text-emerald-300' : 'bg-tint/[0.04] text-fg-3')}>
          <span className={clsx('size-1.5 rounded-full', online ? 'bg-go' : 'bg-fg-4')} /> {online ? `Ligado · v${health?.versao ?? ''}` : 'Desligado'}
        </span>
      }
    >
      <div className="space-y-3 text-xs">
        {online && health && (
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
              <dt className="text-[10px] text-fg-4">Navegador para o Maps</dt>
              <dd className={health.navegador ? 'text-emerald-300' : 'text-red-300'}>{health.navegador ? 'Encontrado' : 'Instale o Chrome'}</dd>
            </div>
            <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
              <dt className="text-[10px] text-fg-4">WhatsApp</dt>
              <dd className="text-fg">{health.whatsapp.status === 'connected' ? (health.whatsapp.user?.name ?? 'Conectado') : 'Desconectado'}</dd>
            </div>
            <div className="rounded-md border border-line-soft bg-ink px-2.5 py-1.5">
              <dt className="text-[10px] text-fg-4">Busca no Maps</dt>
              <dd className="text-fg">{health.maps.active ? 'Rodando' : 'Parada'}</dd>
            </div>
          </dl>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <MotorSteps https={window.location.protocol === 'https:'} />
          </div>
          <a href={MOTOR_DOWNLOAD} download className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-[#3b7bf6]">
            <Download className="size-3.5" /> Baixar o Motor XS (Windows)
          </a>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
          <label className="block min-w-60 flex-1">
            <span className="label">Endereço do motor</span>
            <input className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_MOTOR_URL} />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              setMotorUrl(url)
              await check()
              toast(useMotor.getState().online ? 'Motor encontrado.' : 'Motor não respondeu nesse endereço.', useMotor.getState().online ? 'success' : 'error')
            }}
          >
            Salvar e testar
          </Button>
        </div>
      </div>
    </Card>
  )
}
