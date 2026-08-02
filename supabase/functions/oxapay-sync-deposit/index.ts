import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const OXAPAY_KEY = (Deno.env.get('OXAPAY_MERCHANT_API_KEY') || '').trim()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!OXAPAY_KEY) return json({ error: 'Crypto payment gateway is not configured' }, 503)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await userClient.auth.getUser(token)
    if (userErr || !userData.user?.id) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.order_id || '')
    if (!orderId) return json({ error: 'order_id required' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: dep } = await admin.from('oxapay_deposits')
      .select('*').eq('order_id', orderId).maybeSingle()
    if (!dep) return json({ error: 'Not found' }, 404)
    if (dep.user_id !== userId) return json({ error: 'Forbidden' }, 403)
    if (dep.credited) return json({ credited: false, already: true })

    // Poll OxaPay for latest state directly from their API (server-to-server,
    // authenticated with the merchant key). If the gateway itself says the
    // invoice is paid, we credit here too — the webhook may never arrive on a
    // self-hosted setup (firewall / wrong callback URL).
    let remotePaid = false
    let remoteAmountOk = true
    if (dep.track_id) {
      try {
        const r = await fetch(`https://api.oxapay.com/v1/payment/${dep.track_id}`, {
          headers: { 'merchant_api_key': OXAPAY_KEY },
        })
        const txt = await r.text()
        let data: any = {}
        try { data = JSON.parse(txt) } catch { data = { raw: txt } }
        const inner = data?.data ?? data
        const remoteStatus = String(inner?.status || '').toLowerCase()
        remotePaid = ['paid', 'confirmed', 'completed', 'success'].includes(remoteStatus)
        const paidAmt = Number(inner?.amount ?? inner?.paid_amount ?? inner?.received_amount)
        const expectedUsd = Number(dep.amount_usd)
        if (remotePaid && Number.isFinite(paidAmt) && Number.isFinite(expectedUsd) && expectedUsd > 0) {
          remoteAmountOk = paidAmt >= expectedUsd * 0.98
        }
        if (remoteStatus) {
          await admin.from('oxapay_deposits').update({
            status: remoteStatus,
            pay_currency: inner?.pay_currency || inner?.currency || dep.pay_currency,
            raw_payload: data,
          }).eq('order_id', orderId)
        }
      } catch { /* ignore polling errors */ }
    }

    let credited = false
    if (remotePaid && remoteAmountOk) {
      const { data: res } = await admin.rpc('credit_wallet_oxapay', { p_order_id: orderId })
      credited = !!(res as any)?.credited
    }

    // Re-read
    const { data: fresh } = await admin.from('oxapay_deposits')
      .select('status,credited').eq('order_id', orderId).maybeSingle()

    return json({
      credited,
      already: !!fresh?.credited,
      status: fresh?.status || dep.status,
      awaiting: fresh?.credited ? undefined : 'payment_confirmation',
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status,
  })
}