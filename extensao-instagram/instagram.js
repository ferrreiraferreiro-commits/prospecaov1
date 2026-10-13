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
  })
})()
