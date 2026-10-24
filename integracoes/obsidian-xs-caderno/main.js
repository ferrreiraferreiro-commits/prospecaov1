// XS Caderno: baixa as notas do vendedor IA para a pasta "Caderno XS" e devolve as suas edições como proposta.
const { Plugin, PluginSettingTab, Setting, requestUrl, Notice, normalizePath } = require('obsidian')
const PADRAO = { servidor: 'https://109-110-184-199.sslip.io/whatsapp/mcp', token: '', pasta: 'Caderno XS' }

module.exports = class XsCaderno extends Plugin {
  async onload() {
    this.settings = Object.assign({}, PADRAO, await this.loadData())
    this.baixando = false
    this.addSettingTab(new Ajustes(this.app, this))
    this.addCommand({ id: 'baixar', name: 'Baixar o Caderno da XS', callback: () => this.baixar() })
    this.addRibbonIcon('refresh-cw', 'Baixar o Caderno da XS', () => this.baixar())
    this.registerEvent(this.app.vault.on('modify', (f) => this.enviar(f)))
  }
  // Fala com o conector da XS (MCP) usando a sua chave pessoal xs_ (XS → Vendedor → Ajustes → Conector)
  async ferramenta(nome, args) {
    const r = await requestUrl({ url: this.settings.servidor, method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + this.settings.token }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: nome, arguments: args } }) })
    const j = r.json
    if (j.error) throw new Error(j.error.message)
    const texto = (j.result?.content ?? []).map((c) => c.text).join('')
    if (j.result?.isError) throw new Error(texto)
    try { return JSON.parse(texto) } catch { return texto }
  }
  async baixar() {
    this.baixando = true
    try {
      const arquivos = await this.ferramenta('caderno_arquivos', {})
      for (const a of arquivos) {
        const caminho = normalizePath(`${this.settings.pasta}/${a.caminho}`)
        const pasta = caminho.split('/').slice(0, -1).join('/')
        if (pasta && !this.app.vault.getAbstractFileByPath(pasta)) await this.app.vault.createFolder(pasta).catch(() => {})
        const f = this.app.vault.getAbstractFileByPath(caminho)
        if (f) await this.app.vault.modify(f, a.conteudo)
        else await this.app.vault.create(caminho, a.conteudo)
      }
      new Notice(`Caderno da XS: ${arquivos.length} notas atualizadas.`)
    } catch (e) {
      new Notice(`Caderno da XS: ${e.message}`)
    } finally {
      setTimeout(() => (this.baixando = false), 2000)
    }
  }
  async enviar(f) {
    if (this.baixando || !f.path.startsWith(this.settings.pasta + '/') || !f.path.endsWith('.md')) return
    clearTimeout(this.espera)
    this.espera = setTimeout(async () => {
      try {
        const conteudo = await this.app.vault.read(f)
        await this.ferramenta('caderno_importar', { caminho: f.path.slice(this.settings.pasta.length + 1), conteudo })
        new Notice('Caderno da XS: sua edição foi como proposta (aprove na XS).')
      } catch (e) {
        new Notice(`Caderno da XS: ${e.message}`)
      }
    }, 4000)
  }
}

class Ajustes extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin }
  display() {
    const el = this.containerEl
    el.empty()
    for (const [k, nome] of [['servidor', 'Endereço do conector da XS'], ['token', 'Sua chave pessoal (xs_…)'], ['pasta', 'Pasta no cofre']])
      new Setting(el).setName(nome).addText((t) => t.setValue(this.plugin.settings[k]).onChange(async (v) => { this.plugin.settings[k] = v.trim(); await this.plugin.saveData(this.plugin.settings) }))
  }
}
