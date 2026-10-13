// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
const conta = document.getElementById('conta')
const ponto = document.getElementById('ponto')

chrome.runtime.sendMessage({ cmd: 'estado', args: { abrir: false } }, (res) => {
  const ig = res?.instagram
  if (ig?.logado) {
    ponto.className = 'ponto ok'
    conta.textContent = ig.usuario ? `Instagram conectado: @${ig.usuario}` : 'Instagram conectado'
  } else {
    ponto.className = 'ponto ruim'
    conta.textContent = ig?.aba === false && !ig?.erro ? 'Abra o Instagram neste Chrome e entre numa conta.' : 'Entre numa conta do Instagram neste Chrome.'
  }
})

document.getElementById('xs').onclick = () => chrome.tabs.create({ url: 'https://xs-prospeccao.vercel.app/instagram' })
document.getElementById('ig').onclick = () => chrome.runtime.sendMessage({ cmd: 'abrir' }, () => window.close())
