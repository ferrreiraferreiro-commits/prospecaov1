// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
// Roda nas páginas da XS: a tela "Instagram" conversa com a extensão por window.postMessage.
;(() => {
  const VERSAO = chrome.runtime.getManifest().version
  const responder = (msg) => window.postMessage({ canal: 'xs-ig', ...msg }, location.origin)
  const anunciar = () => responder({ tipo: 'oi', versao: VERSAO })

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return
    const m = e.data
    if (!m || m.canal !== 'xs-ig') return
    if (m.tipo === 'ola') return anunciar()
    if (m.tipo !== 'pedido') return
    try {
      chrome.runtime.sendMessage({ cmd: m.cmd, args: m.args }, (res) => {
        const erro = chrome.runtime.lastError?.message
        responder({ tipo: 'resposta', id: m.id, ...(erro || !res ? { ok: false, erro: erro || 'A extensão não respondeu.' } : res) })
      })
    } catch {
      // Extensão atualizada ou recarregada: esta página ainda fala com a versão antiga
      responder({ tipo: 'resposta', id: m.id, ok: false, erro: 'A extensão foi atualizada. Recarregue esta página (F5).' })
    }
  })

  anunciar()
})()
