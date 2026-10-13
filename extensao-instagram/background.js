// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Ponte entre a XS e a aba do Instagram. Só repassa consultas de LEITURA (buscar, ver perfil,
// listar seguidores): nada de seguir, curtir, comentar ou mandar mensagem.

const XS = [/^https:\/\/xs-prospeccao\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]

const LEITURA_GET = [
  /^\/api\/v1\/web\/search\/topsearch\/\?/,
  /^\/web\/search\/topsearch\/\?/,
  /^\/api\/v1\/fbsearch\/web\/top_serp\/\?/,
  /^\/api\/v1\/users\/web_profile_info\/\?/,
  /^\/api\/v1\/users\/\d+\/info\/(\?|$)/,
  /^\/api\/v1\/tags\/web_info\/\?/,
  /^\/api\/v1\/friendships\/\d+\/(followers|following)\/\?/,
  /^\/api\/v1\/locations\/web_info\/\?/,
]
const LEITURA_POST = [/^\/api\/v1\/tags\/[^/?]+\/sections\/$/, /^\/api\/v1\/locations\/\d+\/sections\/$/]

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

function mandarParaAba(tabId, msg, ms = 40_000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, erro: 'O Instagram demorou para responder.' }), ms)
    chrome.tabs.sendMessage(tabId, { xs: 'ig', ...msg }, (res) => {
      clearTimeout(t)
      if (chrome.runtime.lastError || !res) resolve({ ok: false, semScript: true, erro: chrome.runtime.lastError?.message || 'Sem resposta da aba do Instagram.' })
      else resolve(res)
    })
  })
}

async function esperarCarregar(tabId, ms = 25_000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (!tab) return false
    if (tab.status === 'complete') return true
    await espera(300)
  }
  return false
}

/** Aba do Instagram pronta para consultas. Abre uma em segundo plano se não houver. */
async function abaDoInstagram(abrir = true) {
  let [tab] = await chrome.tabs.query({ url: 'https://www.instagram.com/*' })
  if (!tab) {
    if (!abrir) return null
    tab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false })
  }
  await esperarCarregar(tab.id)
  let ping = await mandarParaAba(tab.id, { cmd: 'ping' }, 5_000)
  if (ping.semScript) {
    // Aba aberta antes da extensão ser instalada: coloca o script nela
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['instagram.js'] }).catch(() => undefined)
    ping = await mandarParaAba(tab.id, { cmd: 'ping' }, 5_000)
  }
  if (!ping.ok) throw new Error('Não consegui usar a aba do Instagram. Recarregue a aba do Instagram e tente de novo.')
  return { tab, ping }
}

let contaEmCache = null

async function estado({ abrir = true } = {}) {
  const versao = chrome.runtime.getManifest().version
  const aba = await abaDoInstagram(abrir).catch((e) => ({ erro: e.message }))
  if (!aba || aba.erro) return { ok: true, versao, instagram: { aba: false, logado: false, erro: aba?.erro } }
  const id = aba.ping.id
  if (!id) return { ok: true, versao, instagram: { aba: true, logado: false } }
  if (contaEmCache?.id !== id) {
    const r = await mandarParaAba(aba.tab.id, { cmd: 'pedir', args: { caminho: `/api/v1/users/${id}/info/` } })
    const u = r.json?.user
    contaEmCache = { id, usuario: u?.username ?? null, nome: u?.full_name ?? null }
  }
  return { ok: true, versao, instagram: { aba: true, logado: true, ...contaEmCache } }
}

async function consultar({ metodo = 'GET', caminho, corpo }) {
  const lista = metodo === 'POST' ? LEITURA_POST : LEITURA_GET
  if (typeof caminho !== 'string' || !lista.some((re) => re.test(caminho))) return { ok: false, erro: 'Consulta não permitida pela extensão.' }
  const { tab } = await abaDoInstagram(true)
  return mandarParaAba(tab.id, { cmd: 'pedir', args: { metodo, caminho, corpo } })
}

/** Perfil pela página dele (quando a consulta rápida é bloqueada). */
async function perfilPagina({ usuario }) {
  if (typeof usuario !== 'string' || !/^[a-z0-9._]{1,30}$/i.test(usuario)) return { ok: false, erro: 'Usuário inválido.' }
  const { tab } = await abaDoInstagram(true)
  return mandarParaAba(tab.id, { cmd: 'pagina', args: { usuario } })
}

async function abrirInstagram() {
  const [tab] = await chrome.tabs.query({ url: 'https://www.instagram.com/*' })
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  } else await chrome.tabs.create({ url: 'https://www.instagram.com/', active: true })
  return { ok: true }
}

// Instalou ou atualizou: a tela da XS que já estava aberta reconhece a extensão na hora, sem F5
chrome.runtime.onInstalled.addListener(async () => {
  const abas = await chrome.tabs.query({ url: ['https://xs-prospeccao.vercel.app/*', 'http://localhost/*', 'http://127.0.0.1/*'] })
  for (const aba of abas) await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ['ponte-xs.js'] }).catch(() => undefined)
})

chrome.runtime.onMessage.addListener((m, remetente, responder) => {
  const origem = remetente.origin || (remetente.url ? new URL(remetente.url).origin : '')
  const daXs = XS.some((re) => re.test(origem))
  const doPopup = remetente.id === chrome.runtime.id && !remetente.tab
  if (!daXs && !doPopup) return
  const tarefas = { estado, ig: consultar, perfil: perfilPagina, abrir: abrirInstagram }
  const fn = tarefas[m?.cmd]
  if (!fn) return
  fn(m.args || {}).then(responder, (e) => responder({ ok: false, erro: String((e && e.message) || e) }))
  return true
})
