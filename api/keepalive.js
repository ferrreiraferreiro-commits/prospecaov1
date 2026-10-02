// Chamado 1x por dia pelo cron da Vercel (vercel.json). O Supabase gratuito pausa o
// projeto depois de 7 dias sem nenhuma requisição; esta consulta leve conta como uso.
// Com a chave pública (anon) e RLS, nenhum dado é lido — só o banco é acordado.
export default async function handler(_req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(200).json({ ok: false, motivo: 'Supabase não configurado' })
  try {
    const r = await fetch(`${url}/rest/v1/settings?select=user_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return res.status(200).json({ ok: r.ok, status: r.status, em: new Date().toISOString() })
  } catch (err) {
    return res.status(200).json({ ok: false, erro: String(err) })
  }
}
