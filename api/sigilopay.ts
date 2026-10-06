// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Webhook da SigiloPay: POST /api/sigilopay
 *
 * Cadastrado no painel da SigiloPay (Configurações → Webhooks) para o produto XS Prospecção,
 * com o evento "Transação paga" (e, se quiser, estornada/contestada).
 * Só repassa o aviso para o banco (função sigilopay_receber), que confere o token,
 * acha a conta e libera o plano Mensal. Aqui não tem regra nenhuma de plano.
 *
 * Respostas: 200 = recebido (até eventos ignorados, para a SigiloPay não reenviar à toa),
 * 401 = token não confere, 500 = falha (a SigiloPay tenta de novo).
 */

interface Req {
  method?: string
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ error: 'Supabase não configurado.' })

  let dados: unknown
  try {
    dados = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  } catch {
    return res.status(400).json({ error: 'JSON inválido.' })
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return res.status(400).json({ error: 'JSON inválido.' })

  try {
    const r = await fetch(`${url}/rest/v1/rpc/sigilopay_receber`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados }),
    })
    const corpo = (await r.json().catch(() => null)) as { code?: string; message?: string } | string | null
    if (r.ok) return res.status(200).json({ ok: true, resultado: corpo })
    if (corpo && typeof corpo === 'object' && corpo.code === '28000') return res.status(401).json({ error: 'Token não confere.' })
    return res.status(500).json({ error: 'Falha ao registrar o pagamento.' })
  } catch {
    return res.status(500).json({ error: 'Falha ao registrar o pagamento.' })
  }
}
