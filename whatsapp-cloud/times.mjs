// Plano Times no gateway: quem está numa equipe usa o WhatsApp (e o plano) do dono da equipe.
// Troca só a leitura do perfil (pela RPC meu_acesso do Supabase); não mexe no resto, como a regra das 24 h da VPS.
// Procura os trechos com folga (a VPS pode ter espaços e comentários diferentes) e só grava se achar os três.
// Uso: node times.mjs /opt/xs-whatsapp/gateway.ts
import fs from 'node:fs'

const arquivo = process.argv[2] ?? '/opt/xs-whatsapp/gateway.ts'
let s = fs.readFileSync(arquivo, 'utf8')
if (s.includes('rest/v1/rpc/meu_acesso')) {
  console.log('Já estava pronto.')
  process.exit(0)
}

const trocas = [
  [
    'leitura do perfil',
    /fetch\(`\$\{SUPABASE_URL\}\/rest\/v1\/profiles\?select=[^`]*`,\s*\{\s*headers,/,
    "fetch(`${SUPABASE_URL}/rest/v1/rpc/meu_acesso`, {\n    method: 'POST',\n    headers: { ...headers, 'Content-Type': 'application/json' },\n    body: '{}',",
  ],
  [
    'perfil lido',
    /const \[p\] = \(await (\w+)\.json\(\)\) as Perfil\[\]/,
    (_, v) =>
      `const [p] = (await ${v}.json()) as (Perfil & { conta?: unknown })[]\n  // Plano Times: quem está numa equipe usa a conta (e o WhatsApp) do dono\n  const id = typeof p?.conta === 'string' && UUID_OK.test(p.conta) ? p.conta : user.id`,
  ],
  ['conta devolvida', /return \{ id: user\.id,/, 'return { id,'],
]

for (const [nome, de, para] of trocas) {
  if (!de.test(s)) {
    console.error(`Não achei o trecho "${nome}" no gateway. Nada foi mudado.`)
    process.exit(1)
  }
  s = s.replace(de, para)
}
fs.writeFileSync(arquivo, s)
console.log('Pronto: membros de equipe usam o WhatsApp do dono.')
