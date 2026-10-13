// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Roda nas páginas da XS: a tela "Instagram" conversa com a extensão por window.postMessage.
// Também é colocado nas abas da XS já abertas quando a extensão é instalada ou atualizada.
;(() => {
  const vivo = () => !!chrome.runtime?.id
  if (window.__xsPonte?.vivo()) return window.__xsPonte.anunciar()

  const VERSAO = chrome.runtime.getManifest().version
  const responder = (msg) => window.postMessage({ canal: 'xs-ig', ...msg }, location.origin)
  const anunciar = () => responder({ tipo: 'oi', versao: VERSAO })

  function ouvir(e) {
    if (e.source !== window || e.origin !== location.origin) return
    const m = e.data
    if (!m || m.canal !== 'xs-ig') return
    // Versão antiga desta ponte (a extensão foi recarregada): sai e deixa a nova responder
    if (!vivo()) return window.removeEventListener('message', ouvir)
    if (m.tipo === 'ola') return anunciar()
    if (m.tipo !== 'pedido') return
    try {
      chrome.runtime.sendMessage({ cmd: m.cmd, args: m.args }, (res) => {
        const erro = chrome.runtime.lastError?.message
        responder({ tipo: 'resposta', id: m.id, ...(erro || !res ? { ok: false, erro: erro || 'A extensão não respondeu.' } : res) })
      })
    } catch {
      responder({ tipo: 'resposta', id: m.id, ok: false, erro: 'A extensão foi atualizada. Recarregue esta página (F5).' })
    }
  }

  window.addEventListener('message', ouvir)
  window.__xsPonte = { vivo, anunciar }
  anunciar()
})()
