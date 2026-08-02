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
const USD_TO_INR = 90

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
    // Self-hosted GoTrue does not reliably support getClaims(); validate the
    // bearer token against Auth instead so migrated users work as well.
    const { data: userData, error: userErr } = await userClient.auth.getUser(token)
    if (userErr || !userData.user?.id) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id
    const email = userData.user.email || ''

    const body = await req.json().catch(() => ({}))
    const rawInr = body?.amount_inr
    const amountInr = Math.round(Number(rawInr) * 100) / 100
    if (!Number.isFinite(amountInr) || amountInr < 90) return json({ error: 'Minimum ₹90' }, 400)
    if (amountInr > 540000) return json({ error: 'Maximum ₹5,40,000 per transaction' }, 400)
    const amountUsd = Math.round((amountInr / USD_TO_INR) * 10000) / 10000
    if (!Number.isFinite(amountUsd) || amountUsd < 1) return json({ error: 'Minimum ₹90' }, 400)
    if (amountUsd > 6000) return json({ error: 'Maximum ₹5,40,000 per transaction' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: prof } = await admin.from('profiles')
      .select('is_banned').eq('user_id', userId).maybeSingle()
    if (prof?.is_banned) return json({ error: 'Account suspended' }, 403)

    const orderId = 'OXP_' + crypto.randomUUID()
    const returnBase = getSafeReturnBase(body?.return_origin)

    const { error: depositErr } = await admin.from('oxapay_deposits').insert({
      user_id: userId,
      order_id: orderId,
      amount_usd: amountUsd,
      amount_inr: amountInr,
      status: 'waiting',
    })
    if (depositErr) return json({ error: 'Could not start crypto payment', detail: depositErr.message }, 500)

    const payload = {
      amount: amountUsd,
      currency: 'USD',
      lifetime: 30,
      fee_paid_by_payer: 1,
      under_paid_coverage: 0,
      order_id: orderId,
      email,
      description: `Wallet top-up ₹${amountInr} ($${amountUsd})`,
      return_url: `${returnBase}/wallet?oxapay=success&oxapay_order_id=${orderId}`,
      callback_url: `${SUPABASE_URL}/functions/v1/oxapay-webhook`,
    }

    const r = await fetch('https://api.oxapay.com/v1/payment/invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant_api_key': OXAPAY_KEY,
      },
      body: JSON.stringify(payload),
    })
    const text = await r.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    // OxaPay success shape: { status: 200, data: { track_id, payment_url, ... } } or top-level fields
    const inner = data?.data ?? data
    const paymentUrl = inner?.payment_url || inner?.payLink
    const trackId = String(inner?.track_id || inner?.trackId || '') || null

    if (!paymentUrl) {
      await admin.from('oxapay_deposits').update({
        status: 'failed', raw_payload: data,
      }).eq('order_id', orderId)
      return json({ error: 'Gateway error', detail: data }, 502)
    }

    await admin.from('oxapay_deposits').update({
      track_id: trackId,
      payment_url: paymentUrl,
      raw_payload: data,
    }).eq('order_id', orderId)

    return json({
      order_id: orderId,
      payment_url: paymentUrl,
      track_id: trackId,
      amount_usd: amountUsd,
      amount_inr: amountInr,
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

function getSafeReturnBase(input: unknown): string {
  const fallback = 'https://organicsmm.online'
  try {
    const url = new URL(String(input || fallback))
    const host = url.hostname.toLowerCase()
    const allowed = host === 'organicsmm.online'
      || host === 'sologrow-pro.lovable.app'
      || host.endsWith('.lovable.app')
      || host === 'localhost'
    return allowed ? `${url.protocol}//${url.host}`.replace(/\/+$/, '') : fallback
  } catch {
    return fallback
  }
}