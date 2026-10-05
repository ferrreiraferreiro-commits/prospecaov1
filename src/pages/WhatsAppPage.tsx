// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
import clsx from 'clsx'
import { CheckCircle2, CloudOff, LoaderCircle, LogOut, QrCode, RefreshCw, Send, ShieldAlert, Smartphone, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card, Field } from '../components/kit'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui'
import { formatPhone } from '../lib/contact'
import { estadoDoWhatsApp, MSG_INDISPONIVEL, useWaServico, waFetch, type EstadoWhatsApp, type WaInfo } from '../lib/waServico'
import { useApp } from '../store/useApp'

const ROTULO: Record<EstadoWhatsApp, { texto: string; cor: string }> = {
  verificando: { texto: 'Verificando…', cor: 'bg-amber-400' },
  conectado: { texto: 'Conectado', cor: 'bg-go' },
  reconectando: { texto: 'Reconectando…', cor: 'bg-amber-400' },
  'gerando-qr': { texto: 'Aguardando QR Code', cor: 'bg-amber-400' },
  'aguardando-qr': { texto: 'Aguardando leitura do QR Code', cor: 'bg-amber-400' },
  erro: { texto: 'Erro de conexão', cor: 'bg-red-400' },
  desconectado: { texto: 'Desconectado', cor: 'bg-red-400' },
}

function Linha({ titulo, cor, texto, pulsar }: { titulo: string; cor: string; texto: string; pulsar?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-ink px-3.5 py-2.5">
      <span className="text-xs text-fg-3">{titulo}</span>
      <span className="flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="relative flex size-2.5 items-center justify-center">
          <span className={clsx('size-2.5 rounded-full', cor)} />
          {pulsar && <span className={clsx('absolute size-2.5 animate-ping rounded-full opacity-60', cor)} />}
        </span>
        {texto}
      </span>
    </div>
  )
}

/**
 * Conexão do WhatsApp: roda na nuvem da XS (um WhatsApp por conta),
 * então não há nada para instalar. O QR Code aparece aqui mesmo.
 */
export function WhatsAppPage() {
  const online = useWaServico((s) => s.online)
  const check = useWaServico((s) => s.check)
  const toast = useApp((s) => s.toast)
  const [wa, setWa] = useState<WaInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [tel, setTel] = useState('')
  const [texto, setTexto] = useState('Teste da XS Prospecção ✅')
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setWa(await waFetch<WaInfo>('/whatsapp/status', { timeoutMs: 8000 }))
    } catch {
      setWa(null)
    }
  }, [])

  const estado = estadoDoWhatsApp(wa)
  const esperando = estado === 'gerando-qr' || estado === 'aguardando-qr' || estado === 'reconectando'
  useEffect(() => {
    if (!online) return
    void refresh()
    const id = setInterval(() => void refresh(), esperando ? 2000 : 6000)
    return () => clearInterval(id)
  }, [online, esperando, refresh])

  async function conectar() {
    setBusy(true)
    try {
      setWa(await waFetch<WaInfo>('/whatsapp/conectar', { method: 'POST', timeoutMs: 30000 }))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível conectar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function desconectar() {
    if (!window.confirm('Desconectar este WhatsApp da XS? Campanhas em andamento ficam pausadas.')) return
    setBusy(true)
    try {
      setWa(await waFetch<WaInfo>('/whatsapp/desconectar', { method: 'POST', timeoutMs: 20000 }))
      void check()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível desconectar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function enviarTeste() {
    if (!tel.trim() || !texto.trim()) return
    setSending(true)
    try {
      await waFetch('/whatsapp/teste', { method: 'POST', json: { telefone: tel, texto }, timeoutMs: 45000 })
      toast('Mensagem de teste enviada.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao enviar.', 'error')
    } finally {
      setSending(false)
    }
  }

  const conectado = estado === 'conectado'
  const servico = online === false ? { cor: 'bg-red-400', texto: 'Offline' } : online ? { cor: 'bg-go', texto: 'Online' } : { cor: 'bg-amber-400', texto: 'Verificando…' }

  return (
    <div className="space-y-4">
      <PageHeader title="WhatsApp" subtitle="Conecte o número que vai fazer os disparos. Tudo roda na nuvem da XS: não precisa instalar nada no computador." />

      <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <Card bodyClass="p-5">
          <div className="space-y-2">
            <Linha titulo="Serviço WhatsApp" cor={servico.cor} texto={servico.texto} pulsar={!!online} />
            {online !== false && <Linha titulo="WhatsApp" cor={ROTULO[estado].cor} texto={ROTULO[estado].texto} pulsar={conectado} />}
          </div>

          {online === false ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-tint/[0.05] text-fg-3">
                <CloudOff className="size-7" />
              </span>
              <p className="max-w-sm text-sm text-fg-2">{MSG_INDISPONIVEL}</p>
              <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void check()}>
                Tentar de novo
              </Button>
            </div>
          ) : conectado && wa?.user ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-go/15 text-go">
                <CheckCircle2 className="size-7" />
              </span>
              <div>
                <p className="pv text-base font-semibold">{wa.user.name}</p>
                <p className="text-xs text-fg-3">
                  Número: <span className="pv num text-fg-2">{formatPhone(wa.user.id)}</span>
                </p>
              </div>
              <p className="max-w-sm text-xs text-fg-3">Pronto para disparar. Para trocar de número, desconecte aqui e leia o QR Code com o outro aparelho.</p>
              <Button variant="danger" icon={<LogOut className="size-3.5" />} loading={busy} onClick={() => void desconectar()}>
                Desconectar
              </Button>
            </div>
          ) : estado === 'aguardando-qr' && wa?.qrCodeUrl ? (
            <div className="flex flex-col items-center gap-4 pt-5 sm:flex-row sm:items-start">
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
              <span className={clsx('flex size-14 items-center justify-center rounded-full', estado === 'erro' ? 'bg-red-500/10 text-red-300' : 'bg-tint/[0.05] text-fg-3')}>
                {esperando || busy || estado === 'verificando' ? <LoaderCircle className="size-7 animate-spin" /> : estado === 'erro' ? <TriangleAlert className="size-7" /> : <Smartphone className="size-7" />}
              </span>
              <p className="max-w-sm text-xs text-fg-3">
                {estado === 'reconectando'
                  ? 'Reconectando ao seu WhatsApp. Isso costuma levar alguns segundos.'
                  : estado === 'gerando-qr'
                    ? 'Gerando o QR Code…'
                    : estado === 'verificando'
                      ? 'Verificando a conexão…'
                      : 'Nenhum WhatsApp conectado. Clique abaixo para mostrar o QR Code.'}
                {estado === 'erro' && wa?.lastError && <span className="mt-1 block text-red-300">{wa.lastError}</span>}
              </p>
              {(estado === 'desconectado' || estado === 'erro') && (
                <Button variant="primary" icon={<QrCode className="size-3.5" />} loading={busy} onClick={() => void conectar()}>
                  Conectar WhatsApp
                </Button>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Enviar mensagem de teste" description="Confira se está tudo certo antes de um disparo.">
            <div className="space-y-3">
              <Field label="Telefone (com DDD)">
                <input className="pv input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(43) 99999-9999" />
              </Field>
              <Field label="Mensagem">
                <textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
              </Field>
              <Button icon={<Send className="size-3.5" />} loading={sending} disabled={!conectado || !tel.trim()} onClick={() => void enviarTeste()}>
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
              <li>Se o WhatsApp desconectar de forma suspeita, a XS pausa tudo e só retoma quando você mandar.</li>
            </ul>
            <p className="mt-2 text-2xs text-fg-4">Nenhum intervalo garante que o WhatsApp não vá restringir a conta.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
