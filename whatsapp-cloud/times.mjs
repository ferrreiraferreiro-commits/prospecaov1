// Plano Times no gateway: quem está numa equipe usa o WhatsApp (e o plano) do dono da equipe.
// Troca só o trecho que lê o perfil (pela RPC meu_acesso do Supabase); não mexe no resto, como a regra das 24 h da VPS.
// Uso: node times.mjs /opt/xs-whatsapp/gateway.ts
import fs from 'node:fs'

const arquivo = process.argv[2] ?? '/opt/xs-whatsapp/gateway.ts'
let s = fs.readFileSync(arquivo, 'utf8')
if (s.includes('rest/v1/rpc/meu_acesso')) {
  console.log('Já estava pronto.')
  process.exit(0)
}

const antes = "  // O próprio perfil, lido com o login da pessoa (a regra do banco só deixa cada um ler o seu)\n  const perfil = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=usuario,recursos,plano,plano_ate,teste_ate,admin&user_id=eq.${user.id}`, {\n    headers,\n    signal: AbortSignal.timeout(8000),\n  })\n  if (!perfil.ok) throw new Error(`supabase perfil ${perfil.status}`)\n  const [p] = (await perfil.json()) as Perfil[]\n  return { id: user.id, usuario"
const depois = "  // Conta e plano que valem para a pessoa: os do dono, se ela está numa equipe (plano Times).\n  // Assim todo mundo da equipe usa o mesmo WhatsApp.\n  const perfil = await fetch(`${SUPABASE_URL}/rest/v1/rpc/meu_acesso`, {\n    method: 'POST',\n    headers: { ...headers, 'Content-Type': 'application/json' },\n    body: '{}',\n    signal: AbortSignal.timeout(8000),\n  })\n  if (!perfil.ok) throw new Error(`supabase perfil ${perfil.status}`)\n  const [p] = (await perfil.json()) as (Perfil & { conta?: unknown })[]\n  const id = typeof p?.conta === 'string' && UUID_OK.test(p.conta) ? p.conta : user.id\n  return { id, usuario"
if (!s.includes(antes)) {
  console.error('Não achei o trecho do perfil no gateway. Nada foi mudado.')
  process.exit(1)
}
s = s.replace(antes, depois)
fs.writeFileSync(arquivo, s)
console.log('Pronto: membros de equipe usam o WhatsApp do dono.')
