import clsx from 'clsx'
import { CheckCircle2, LoaderCircle, LogOut, QrCode, Send, ShieldAlert, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card, Field } from '../components/kit'
import { MotorOffline } from '../components/MotorOffline'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { motorFetch, useMotor, type WaStatus } from '../lib/motor'
import { useApp } from '../store/useApp'

interface WaInfo {
  status: WaStatus
  qrCodeUrl: string | null
  user: { id: string; name: string } | null
  lastError: string | null
}

const STATUS_LABEL: Record<WaStatus, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  qrcode: 'Aguardando leitura do QR Code',
  connected: 'Conectado',
}

export function WhatsAppPage() {
  const online = useMotor((s) => s.online)
  const check = useMotor((s) => s.check)
  const toast = useApp((s) => s.toast)
  const [wa, setWa] = useState<WaInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [tel, setTel] = useState('')
  const [texto, setTexto] = useState('Teste da XS Prospecção ✅')
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setWa(await motorFetch<WaInfo>('/whatsapp/status', { timeoutMs: 5000 }))
    } catch {
      setWa(null)
    }
  }, [])

  const waiting = wa?.status === 'connecting' || wa?.status === 'qrcode'
  useEffect(() => {
    if (!online) return
    void refresh()
    const id = setInterval(() => void refresh(), waiting ? 2000 : 6000)
    return () => clearInterval(id)
  }, [online, waiting, refresh])

  async function connect() {
    setBusy(true)
    try {
      setWa(await motorFetch<WaInfo>('/whatsapp/conectar', { method: 'POST', timeoutMs: 30000 }))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao conectar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar este WhatsApp da XS? Campanhas em andamento ficam pausadas.')) return
    setBusy(true)
    try {
      setWa(await motorFetch<WaInfo>('/whatsapp/desconectar', { method: 'POST', timeoutMs: 20000 }))
      void check()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao desconectar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    if (!tel.trim() || !texto.trim()) return
    setSending(true)
    try {
      await motorFetch('/whatsapp/teste', { method: 'POST', json: { telefone: tel, texto }, timeoutMs: 45000 })
      toast('Mensagem de teste enviada.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao enviar.', 'error')
    } finally {
      setSending(false)
    }
  }

  const connected = wa?.status === 'connected'

  return (
    <div className="space-y-4">
      <PageHeader title="WhatsApp" subtitle="Conecte o número que vai fazer os disparos. A sessão fica salva no seu computador, dentro do Motor XS." />

      {online === false && <MotorOffline feature="A conexão do WhatsApp" />}

      <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <Card
          title={
            <span className="flex items-center gap-2">
              <span className={clsx('size-2 rounded-full', connected ? 'bg-go' : waiting ? 'bg-amber-400' : 'bg-fg-4')} />
              {wa ? STATUS_LABEL[wa.status] : online ? 'Verificando…' : 'Motor desligado'}
            </span>
          }
          bodyClass="p-5"
        >
          {connected && wa?.user ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-go/15 text-go">
                <CheckCircle2 className="size-7" />
              </span>
              <div>
                <p className="text-base font-semibold">{wa.user.name}</p>
                <p className="num text-xs text-fg-3">{formatPhone(wa.user.id)}</p>
              </div>
              <p className="max-w-sm text-xs text-fg-3">Pronto para disparar. Se trocar de número, desconecte aqui e leia o QR Code com o outro aparelho.</p>
              <Button variant="danger" icon={<LogOut className="size-3.5" />} loading={busy} onClick={() => void disconnect()}>
                Desconectar
              </Button>
            </div>
          ) : wa?.status === 'qrcode' && wa.qrCodeUrl ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <img src={wa.qrCodeUrl} alt="QR Code do WhatsApp" className="size-56 shrink-0 rounded-lg bg-white p-2" />
              <ol className="list-decimal space-y-1.5 pl-4 text-xs text-fg-2">
                <li>Abra o WhatsApp no celular.</li>
                <li>
                  Toque em <strong className="text-fg">Mais opções (⋮)</strong> ou <strong className="text-fg">Configurações</strong>.
                </li>
                <li>
                  Entre em <strong className="text-fg">Aparelhos conectados → Conectar aparelho</strong>.
                </li>
                <li>Aponte a câmera para este código. Ele se renova sozinho a cada poucos segundos.</li>
              </ol>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-tint/[0.05] text-fg-3">
                {waiting || busy ? <LoaderCircle className="size-7 animate-spin" /> : <Smartphone className="size-7" />}
              </span>
              <p className="max-w-sm text-xs text-fg-3">
                {waiting ? 'Gerando o QR Code…' : 'Nenhum WhatsApp conectado. Clique abaixo para gerar o QR Code.'}
                {wa?.lastError && <span className="mt-1 block text-red-300">{wa.lastError}</span>}
              </p>
              <Button variant="primary" icon={<QrCode className="size-3.5" />} loading={busy || waiting} disabled={!online} onClick={() => void connect()}>
                Conectar WhatsApp
              </Button>
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Enviar mensagem de teste" description="Confira se está tudo certo antes de um disparo.">
            <div className="space-y-3">
              <Field label="Telefone (com DDD)">
                <input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(35) 99999-9999" />
              </Field>
              <Field label="Mensagem">
                <textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
              </Field>
              <Button icon={<Send className="size-3.5" />} loading={sending} disabled={!connected || !tel.trim()} onClick={() => void sendTest()}>
                Enviar teste
              </Button>
            </div>
          </Card>

          <section className="panel border-amber-400/20 px-4 py-3.5">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <ShieldAlert className="size-4" /> Cuidados para não ter o número restrito
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-fg-2">
              <li>Prefira um número só para prospecção, não o seu pessoal.</li>
              <li>Use intervalos longos entre leads (5 a 15 min) e poucas dezenas por dia no começo.</li>
              <li>Escreva variações diferentes em cada mensagem do funil.</li>
              <li>Se o WhatsApp desconectar de forma suspeita, o motor pausa tudo e só retoma quando você mandar.</li>
            </ul>
            <p className="mt-2 text-2xs text-fg-4">Nenhum intervalo garante que o WhatsApp não vá restringir a conta.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
