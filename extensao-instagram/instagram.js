// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Roda na aba do Instagram: faz as consultas com o login que já está aberto no Chrome.
;(() => {
  if (window.__xsInstagram) return
  window.__xsInstagram = true

  const cookie = (nome) => {
    const par = document.cookie.split('; ').find((c) => c.startsWith(`${nome}=`))
    return par ? decodeURIComponent(par.slice(nome.length + 1)) : ''
  }

  async function pedir({ metodo = 'GET', caminho, corpo }) {
    const headers = {
      'x-ig-app-id': '936619743392459',
      'x-requested-with': 'XMLHttpRequest',
      'x-asbd-id': '359341',
      'x-ig-www-claim': sessionStorage.getItem('www-claim-v2') || '0',
      'x-csrftoken': cookie('csrftoken'),
    }
    let body
    if (metodo === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(corpo || {}).toString()
    }
    const r = await fetch(caminho, { method: metodo, headers, body, credentials: 'include' })
    const texto = await r.text()
    let json = null
    try {
      json = JSON.parse(texto)
    } catch {
      /* página HTML (ex.: tela de login) */
    }
    return { status: r.status, json, texto: json ? undefined : texto.slice(0, 300), url: r.url }
  }

  /**
   * Perfil pela página (como quando a pessoa abre o perfil): baixa o HTML de /usuario/ e lê os
   * dados que o Instagram já manda embutidos nela. Serve quando a consulta rápida é bloqueada.
   */
  async function perfilPagina({ usuario }) {
    const u = String(usuario || '').toLowerCase()
    const r = await fetch(`/${encodeURIComponent(u)}/`, { credentials: 'include', headers: { accept: 'text/html' } })
    const html = await r.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const user = {}
    const posts = []
    let achou = false
    const visitar = (v, prof) => {
      if (!v || typeof v !== 'object' || prof > 90) return
      if (Array.isArray(v)) {
        for (const x of v) visitar(x, prof + 1)
        return
      }
      if (typeof v.username === 'string' && v.username.toLowerCase() === u && ('biography' in v || 'follower_count' in v || 'full_name' in v)) {
        achou = true
        for (const [k, val] of Object.entries(v)) if (user[k] == null && val != null) user[k] = val
      }
      if (typeof v.taken_at === 'number') {
        const dono = (v.user && v.user.username) || (v.owner && v.owner.username)
        if (!dono || String(dono).toLowerCase() === u) posts.push(v.taken_at)
      }
      for (const x of Object.values(v)) if (x && typeof x === 'object') visitar(x, prof + 1)
    }
    for (const s of doc.querySelectorAll('script[type="application/json"]')) {
      try {
        visitar(JSON.parse(s.textContent), 0)
      } catch {
        /* bloco que não é JSON */
      }
    }
    return {
      status: r.status,
      url: r.url,
      user: achou ? user : null,
      posts: [...new Set(posts)].sort((a, b) => b - a).slice(0, 30),
      meta: (doc.querySelector('meta[property="og:description"]') || {}).content || '',
      naoExiste: /isn.t available|não está disponível|Page Not Found|Página não encontrada/i.test(doc.title + ' ' + html.slice(0, 200000)) && !achou,
    }
  }

  chrome.runtime.onMessage.addListener((m, _remetente, responder) => {
    if (!m || m.xs !== 'ig') return
    if (m.cmd === 'ping') {
      responder({ ok: true, id: cookie('ds_user_id') || null })
      return
    }
    if (m.cmd === 'pedir') {
      pedir(m.args).then(
        (r) => responder({ ok: true, ...r }),
        (e) => responder({ ok: false, erro: String((e && e.message) || e) }),
      )
      return true
    }
    if (m.cmd === 'pagina') {
      perfilPagina(m.args || {}).then(
        (r) => responder({ ok: true, ...r }),
        (e) => responder({ ok: false, erro: String((e && e.message) || e) }),
      )
      return true
    }
  })
})()
