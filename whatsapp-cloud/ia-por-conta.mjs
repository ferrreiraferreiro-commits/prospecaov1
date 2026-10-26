// Liga no gateway a regra "IA no WhatsApp só para quem tem o recurso ia" (o dono da XS libera em Contas).
// Troca trechos exatos e só grava se achar todos (não mexe no resto, como a regra das 24 h da VPS).
// Uso: node ia-por-conta.mjs /opt/xs-whatsapp/gateway.ts
import fs from 'node:fs'

const arquivo = process.argv[2] ?? '/opt/xs-whatsapp/gateway.ts'
let s = fs.readFileSync(arquivo, 'utf8')
if (s.includes('A IA ainda não está liberada na sua conta.')) {
  console.log('Já estava pronto.')
  process.exit(0)
}

const trocas = [
  ['  admin?: boolean\n}', '  admin?: boolean\n  /** Tem a IA no WhatsApp liberada (recurso "ia"; o dono sempre tem) */\n  ia?: boolean\n}'],
  ['admin: p?.admin === true }', "admin: p?.admin === true, ia: p?.admin === true || (Array.isArray(p?.recursos) && p.recursos.includes('ia')) }"],
  ['s: Sessao, caminho: string) {', 's: Sessao, caminho: string, ia = false) {'],
  [
    "  if (caminho.startsWith('/agente/xico') && !s.fixa) return send(res, 404, { error: 'Não encontrado.' })\n",
    "  if (caminho.startsWith('/agente/xico') && !s.fixa) return send(res, 404, { error: 'Não encontrado.' })\n  if (caminho.startsWith('/agente/') && !s.fixa && !ia) return send(res, 404, { error: 'A IA ainda não está liberada na sua conta.' })\n",
  ],
  ["return await repassar(req, res, s, url.pathname.slice('/motor'.length))", "return await repassar(req, res, s, url.pathname.slice('/motor'.length), conta.ia === true)"],
]

// O arquivo pode ter quebra de linha do Windows
const nl = s.includes('\r\n') ? '\r\n' : '\n'
for (const t of trocas) t.forEach((x, i) => (t[i] = x.replaceAll('\n', nl)))

const faltam = trocas.filter(([de]) => !s.includes(de)).map(([de]) => de.trim().slice(0, 60))
if (faltam.length) {
  console.log('Não mudei nada. Não achei:\n- ' + faltam.join('\n- '))
  process.exit(1)
}
for (const [de, para] of trocas) s = s.replace(de, para)
fs.copyFileSync(arquivo, `${arquivo}.antes-da-ia-por-conta`)
fs.writeFileSync(arquivo, s)
console.log('Pronto: a IA agora só abre para quem tem o recurso ia.')
