// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * WhatsApp da XS — o serviço de WhatsApp de UMA conta (disparos, funis e mensagens agendadas).
 * Roda na VPS da XS, um por conta (whatsapp-cloud/instalar.sh), e escuta só em 127.0.0.1:
 * quem fala com ele é o gateway (whatsapp-cloud/gateway.ts), que confere o login da pessoa.
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import * as agente from './agente/agente.js'
import * as conector from './agente/conector.js'
import * as xico from './agente/xico.js'
import { abrirConversa, enviarNaConversa, listarConversas, marcarLidas } from './conversas.js'
import { agendaPending, cancelAgenda, createAgenda, deleteAgenda, listAgenda, markAgendaSynced, updateAgenda } from './agenda.js'
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, markSynced, pauseCampaign, runningCount, sentPhones, startCampaign, summary } from './disparo.js'
import { storageDir } from './store.js'
import { connect, disconnect, getWa, resumeStoredSession, sendText, shutdown } from './whatsapp.js'

const VERSION = '2.1.0'
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
      ...(agente.AGENTE_LIGADO ? { agente: { ativo: agente.lerConfig().ativo } } : {}),
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

// ---------------------------------------------------------------- Agente IA (só no WhatsApp do dono: XS_AGENTE=1)
const soAgente =
  (fn: Handler): Handler =>
  (req, res) =>
    agente.AGENTE_LIGADO ? fn(req, res) : res.status(404).json({ error: 'O agente não está disponível nesta conta.' })
const id = (req: Request) => String(req.params.id)
const comEstado = (fn: (req: Request) => unknown) =>
  soAgente(async (req) => {
    await fn(req)
    return agente.estado()
  })
app.get('/agente/estado', wrap(soAgente(() => agente.estado())))
app.get('/agente/config', wrap(soAgente(() => agente.lerConfig())))
app.post('/agente/config', wrap(soAgente((req) => agente.salvarConfig(req.body ?? {}))))
app.post('/agente/chave', wrap(comEstado((req) => agente.trocarChave(String(req.body?.chave ?? '')))))
app.delete('/agente/chave', wrap(comEstado(() => agente.removerChave())))
app.post('/agente/retomar', wrap(comEstado(() => agente.retomar())))
app.get('/agente/atividade', wrap(soAgente(() => agente.atividade())))
app.get('/agente/conversas', wrap(soAgente(() => agente.listarConversas())))
app.get('/agente/conversas/:id', wrap(soAgente((req) => agente.verConversa(id(req)))))
app.post('/agente/conversas/:id/assumir', wrap(soAgente((req) => agente.assumir(id(req)))))
app.post('/agente/conversas/:id/devolver', wrap(soAgente((req) => agente.devolver(id(req)))))
app.post('/agente/conversas/:id/marcar', wrap(soAgente((req) => agente.marcar(id(req), req.body?.estado))))
app.post('/agente/conversas/:id/enviar', wrap(soAgente((req) => agente.enviarComoVoce(id(req), String(req.body?.texto ?? '')))))
app.post(
  '/agente/conversas/:id/avaliar',
  wrap(soAgente((req) => agente.avaliar(id(req), String(req.body?.mensagem ?? ''), req.body?.nota, String(req.body?.correcao ?? '')))),
)
app.get('/agente/licoes', wrap(soAgente(() => agente.listarLicoes())))
app.post('/agente/licoes', wrap(soAgente((req) => agente.novaLicao(req.body ?? {}))))
app.post('/agente/licoes/:id', wrap(soAgente((req) => agente.editarLicao(id(req), req.body ?? {}))))
app.delete('/agente/licoes/:id', wrap(soAgente((req) => agente.apagarLicao(id(req)))))
app.get('/agente/fila', wrap(soAgente(() => agente.listarFila())))
app.post('/agente/fila/buscar', wrap(soAgente((req) => agente.buscarAgora(req.body?.alvo ? String(req.body.alvo) : undefined))))
app.post('/agente/fila/:id/descartar', wrap(soAgente((req) => agente.descartarDaFila(id(req), String(req.body?.motivo ?? '')))))
app.post('/agente/simular/abordagem', wrap(soAgente((req) => agente.simularAbordagem(req.body?.lead ?? {}))))
app.post('/agente/simular/conversa', wrap(soAgente((req) => agente.simularConversa(req.body?.lead ?? {}, req.body?.mensagens ?? []))))
app.post(
  '/agente/simular/avaliar',
  wrap(soAgente((req) => agente.avaliarSimulacao(req.body?.mensagens ?? [], req.body?.indice, req.body?.nota, String(req.body?.correcao ?? '')))),
)
app.get('/agente/sinc', wrap(soAgente(() => agente.pendentesSinc())))
app.post('/agente/sinc', wrap(soAgente((req) => agente.marcarSinc(req.body?.itens ?? []))))
app.post('/agente/conhecidos', wrap(soAgente((req) => agente.definirConhecidos(req.body?.telefones))))
app.post('/agente/google', wrap(soAgente((req) => agente.definirGoogle(req.body ?? {}))))
app.post('/agente/parar', wrap(comEstado(() => agente.pararTudo())))
app.get('/agente/pendencias', wrap(soAgente(() => agente.listarPendencias())))
app.post('/agente/pendencias/:id', wrap(soAgente((req) => agente.resolverPendencia(id(req), String(req.body?.acao ?? ''), req.body?.mensagens))))
app.get('/agente/seguranca', wrap(soAgente(() => agente.seguranca())))
// POST (o gateway da nuvem só deixa passar GET, POST e DELETE)
app.post('/agente/nivel', wrap(soAgente((req) => agente.mudarNivel(req.body?.nivel))))
app.post('/agente/voltar', wrap(comEstado(() => agente.voltarATrabalhar())))
// A tela Conversas da XS: quem está com o vendedor, a conversa de um número, assumir e entregar
app.get('/agente/mapa', wrap(soAgente(() => agente.mapaConversas())))
app.get('/agente/tel/:telefone', wrap(soAgente((req) => agente.conversaPorTelefone(String(req.params.telefone)))))
app.post('/agente/tel/:telefone/assumir', wrap(soAgente((req) => agente.assumirPorTelefone(String(req.params.telefone)))))
app.post('/agente/tel/:telefone/entregar', wrap(soAgente((req) => agente.entregarAoAgente(String(req.params.telefone), req.body?.nome ? String(req.body.nome) : undefined))))

// Xico, o assistente do dono (mesma sessão e mesma chave do Agente IA)
app.get('/agente/xico', wrap(soAgente(() => xico.ver())))
app.post('/agente/xico/abrir', wrap(soAgente(() => xico.abrir())))
app.post('/agente/xico/mensagem', wrap(soAgente((req) => xico.mensagem(String(req.body?.texto ?? '')))))
app.post('/agente/xico/app', wrap(soAgente((req) => xico.responderApp(req.body?.resultados ?? []))))
app.post('/agente/xico/propostas/:id', wrap(soAgente((req) => xico.decidir(id(req), req.body?.aceitar === true))))
app.delete('/agente/xico/memoria/:id', wrap(soAgente((req) => xico.apagarLembranca(id(req)))))
app.post('/agente/xico/recomecar', wrap(soAgente(() => xico.recomecar())))
app.get('/agente/xico/prompt', wrap(soAgente(() => ({ texto: xico.promptParaClaude() }))))
app.get('/agente/xico/sites/:id', wrap(soAgente((req) => xico.verPrompt(id(req)))))
app.delete('/agente/xico/sites/:id', wrap(soAgente((req) => xico.apagarPrompt(id(req)))))
app.get('/agente/testes', wrap(soAgente(() => agente.listarTestes())))
app.post('/agente/testes/:id', wrap(soAgente((req) => agente.mudarTeste(id(req), req.body ?? {}))))
app.get('/agente/ramos', wrap(soAgente(() => agente.numerosPorRamo())))

// Conector da XS para o Claude (MCP). A chave pessoal é conferida dentro dele (o gateway não confere login aqui).
app.post('/mcp', (req, res, next) => void conector.atender(req, res).catch(next))
app.all('/mcp', (_req, res) => void res.status(405).set('Allow', 'POST').json({ error: 'Use POST.' }))

// ---------------------------------------------------------------- Conversas (só texto)
app.get('/conversas', wrap(() => listarConversas()))
app.get('/conversas/:telefone', wrap((req) => abrirConversa(String(req.params.telefone))))
app.post('/conversas/:telefone/enviar', wrap((req) => enviarNaConversa(String(req.params.telefone), String(req.body?.texto ?? ''))))
app.post('/conversas/:telefone/lidas', wrap((req) => marcarLidas(String(req.params.telefone))))

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
