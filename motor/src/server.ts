/**
 * Motor XS — servidor local do XS Prospecção.
 * Escuta só em 127.0.0.1 e só aceita chamadas do próprio app (localhost ou o domínio na Vercel).
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import { agendaPending, cancelAgenda, createAgenda, deleteAgenda, listAgenda, markAgendaSynced, updateAgenda } from './agenda.js'
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, markSynced, pauseCampaign, runningCount, sentPhones, startCampaign, summary } from './disparo.js'
import { ackMaps, chromeExecutable, geocode, getMapsState, reverseGeocode, startMaps, stopMaps } from './maps.js'
import { keepAwakeActive } from './keepAwake.js'
import { storageDir } from './store.js'
import { connect, disconnect, getWa, resumeStoredSession, sendText, shutdown } from './whatsapp.js'

const VERSION = '1.2.0'
const PORT = Number(process.env.XS_PORT ?? 3077)

const EXTRA_ORIGINS = (process.env.XS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/** localhost em qualquer porta, os domínios do projeto na Vercel e os extras do .env */
export function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  if (EXTRA_ORIGINS.includes(origin)) return true
  try {
    const u = new URL(origin)
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') return true
    return u.protocol === 'https:' && /^xs-prospeccao[a-z0-9-]*\.vercel\.app$/.test(u.hostname)
  } catch {
    return false
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    if (!allowedOrigin(origin)) return res.status(403).json({ error: 'Origem não autorizada pelo Motor XS.' })
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    // Chrome: site público (Vercel) acessando o computador local
    if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
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
    const maps = getMapsState()
    return {
      ok: true,
      versao: VERSION,
      navegador: Boolean(chromeExecutable()),
      whatsapp: { status: wa.status, user: wa.user },
      maps: { active: maps.active, phase: maps.phase, runId: maps.runId, pendente: !maps.active && !maps.imported && maps.results.length > 0 },
      disparo: { running: runningCount() },
      agenda: { pendentes: agendaPending() },
      acordado: keepAwakeActive(),
    }
  }),
)

// ---------------------------------------------------------------- Maps
app.get('/maps/estado', wrap(() => getMapsState()))
app.post(
  '/maps/iniciar',
  wrap((req) => {
    startMaps(req.body ?? {})
    return { ok: true, runId: getMapsState().runId }
  }),
)
app.post(
  '/maps/parar',
  wrap(async () => {
    await stopMaps()
    return { ok: true }
  }),
)
app.post('/maps/ack', wrap((req) => ackMaps(String(req.body?.runId ?? ''))))
app.get('/maps/geocode', wrap((req) => geocode(String(req.query.q ?? ''))))
app.get('/maps/reverse', wrap((req) => reverseGeocode(Number(req.query.lat), Number(req.query.lng))))

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
  res.status(400).json({ error: err?.message || 'Erro no Motor XS.' })
})

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  ┌────────────────────────────────────────────┐')
  console.log('  │  Motor XS ligado  ·  XS Prospecção         │')
  console.log(`  │  http://127.0.0.1:${PORT}                      │`)
  console.log('  │  Deixe esta janela aberta enquanto usa      │')
  console.log('  │  a busca no Maps e o disparo de WhatsApp.   │')
  console.log('  └────────────────────────────────────────────┘')
  console.log(`  Dados locais: ${storageDir}`)
  if (!chromeExecutable()) console.log('  Atenção: Chrome/Edge/Brave não encontrado — a busca no Maps não vai funcionar.')
  resumeStoredSession()
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  A porta ${PORT} já está em uso. O Motor XS já está aberto em outra janela?\n`)
  else console.error(err)
  process.exit(1)
})

function bye() {
  shutdown()
  void stopMaps().finally(() => process.exit(0))
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)
