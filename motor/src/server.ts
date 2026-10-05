// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * WhatsApp da XS — o serviço de WhatsApp de UMA conta (disparos, funis e mensagens agendadas).
 * Roda na VPS da XS, um por conta (whatsapp-cloud/instalar.sh), e escuta só em 127.0.0.1:
 * quem fala com ele é o gateway (whatsapp-cloud/gateway.ts), que confere o login da pessoa.
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import { agendaPending, cancelAgenda, createAgenda, deleteAgenda, listAgenda, markAgendaSynced, updateAgenda } from './agenda.js'
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, markSynced, pauseCampaign, runningCount, sentPhones, startCampaign, summary } from './disparo.js'
import { storageDir } from './store.js'
import { connect, disconnect, getWa, resumeStoredSession, sendText, shutdown } from './whatsapp.js'

const VERSION = '2.0.0'
const PORT = Number(process.env.XS_PORT ?? 3077)

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

// Navegador nenhum fala direto com este serviço (só o gateway, que não manda Origin)
app.use((req, res, next) => {
  if (req.headers.origin) return res.status(403).json({ error: 'Acesso direto não permitido.' })
  next()
})

type Handler = (req: Request, res: Response) => unknown
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res)
    if (!res.headersSent) res.json(out ?? { ok: true })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------- saúde
app.get(
  '/health',
  wrap(() => {
    const wa = getWa()
    return {
      ok: true,
      versao: VERSION,
      whatsapp: { status: wa.status, user: wa.user },
      disparo: { running: runningCount() },
      agenda: { pendentes: agendaPending() },
    }
  }),
)

// ---------------------------------------------------------------- WhatsApp
app.get('/whatsapp/status', wrap(() => getWa()))
app.post(
  '/whatsapp/conectar',
  wrap(async () => {
    await connect()
    return getWa()
  }),
)
app.post(
  '/whatsapp/desconectar',
  wrap(async () => {
    await disconnect()
    return getWa()
  }),
)
app.post('/whatsapp/teste', wrap((req) => sendText(String(req.body?.telefone ?? ''), String(req.body?.texto ?? ''))))

// ---------------------------------------------------------------- Disparo
app.get('/disparo/campanhas', wrap(() => listCampaigns()))
app.get(
  '/disparo/campanhas/:id',
  wrap((req, res) => {
    const c = getCampaign(String(req.params.id))
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada.' })
    return { ...c, resumo: summary(c) }
  }),
)
app.post('/disparo/campanhas', wrap((req) => summary(createCampaign(req.body ?? {}))))
app.post('/disparo/campanhas/:id/iniciar', wrap((req) => startCampaign(String(req.params.id), req.body?.confirmar === true)))
app.post('/disparo/campanhas/:id/pausar', wrap((req) => pauseCampaign(String(req.params.id))))
app.post('/disparo/campanhas/:id/sincronizado', wrap((req) => markSynced(String(req.params.id), Array.isArray(req.body?.itens) ? req.body.itens : [])))
app.delete('/disparo/campanhas/:id', wrap((req) => deleteCampaign(String(req.params.id))))
app.get('/disparo/enviados', wrap(() => sentPhones()))

// ---------------------------------------------------------------- Agendamentos
app.get('/agenda', wrap(() => listAgenda()))
app.post('/agenda', wrap((req) => createAgenda(req.body ?? {})))
app.post('/agenda/:id/editar', wrap((req) => updateAgenda(String(req.params.id), req.body ?? {})))
app.post('/agenda/:id/cancelar', wrap((req) => cancelAgenda(String(req.params.id))))
app.delete('/agenda/:id', wrap((req) => deleteAgenda(String(req.params.id))))
app.post('/agenda/sincronizado', wrap((req) => markAgendaSynced(Array.isArray(req.body?.itens) ? req.body.itens : [])))

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err?.message || 'Erro no WhatsApp da XS.' })
})

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`WhatsApp da XS em http://127.0.0.1:${PORT} · dados em ${storageDir}`)
  resumeStoredSession()
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  A porta ${PORT} já está em uso. Outra sessão já usa essa porta?\n`)
  else console.error(err)
  process.exit(1)
})

function bye() {
  shutdown()
  process.exit(0)
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)
