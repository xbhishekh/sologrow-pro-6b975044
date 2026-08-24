import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const FALLBACK_RETURN_URL = 'https://organicsmm.online/wallet'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const requestUrl = new URL(req.url)
  // Some gateways HTML-escape the URL (&amp;), producing params like "amp;status".
  const params = new URLSearchParams()
  for (const [k, v] of requestUrl.searchParams) params.set(k.replace(/^amp;/, '').toLowerCase(), v)

  // Many gateways POST back (form or JSON) instead of GET — merge those params too.
  if (req.method === 'POST') {
    try {
      const ct = (req.headers.get('content-type') || '').toLowerCase()
      const raw = await req.text()
      if (ct.includes('application/json')) {
        const obj = JSON.parse(raw) as Record<string, unknown>
        for (const [k, v] of Object.entries(obj || {})) {
          if (v != null) params.set(k.replace(/^amp;/, '').toLowerCase(), String(v))
        }
      } else {
        for (const [k, v] of new URLSearchParams(raw)) params.set(k.replace(/^amp;/, '').toLowerCase(), v)
      }
    } catch { /* ignore body parse errors */ }
  }

  const status = normalizeStatus(params.get('s') || params.get('status'))
  const depositOrderId =
    params.get('o') ||
    params.get('deposit_order_id') ||
    params.get('zapupi_order_id') ||
    params.get('our_order_id') ||
    firstZapOrder(params) ||
    ''

  const gatewayOrderId = params.get('txn_id') || params.get('order_id') || ''
  const utr = params.get('utr') || ''

  // Prefer the return URL stored when the order was created; query params can be
  // stripped by the gateway, which previously left users stranded on the gateway page.
  let storedReturnUrl: string | null = null
  if (depositOrderId && SUPABASE_URL && SERVICE_ROLE) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
      const { data } = await admin
        .from('zapupi_deposits')
        .select('gateway_response')
        .eq('order_id', depositOrderId)
        .maybeSingle()
      const gr = (data as { gateway_response?: Record<string, unknown> } | null)?.gateway_response
      if (gr && typeof gr.return_url === 'string') storedReturnUrl = gr.return_url
    } catch { /* fall back below */ }
  }

  const finalUrl = safeWalletUrl(storedReturnUrl || params.get('return_url'))

  finalUrl.searchParams.set('status', status)
  if (depositOrderId) finalUrl.searchParams.set('zapupi_order_id', depositOrderId)
  if (gatewayOrderId) finalUrl.searchParams.set('gateway_order_id', gatewayOrderId)
  if (utr) finalUrl.searchParams.set('utr', utr)

  return new Response(renderRedirectPage(finalUrl.toString(), status), {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': finalUrl.toString(),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
})

function firstZapOrder(params: URLSearchParams) {
  for (const [, v] of params) {
    if (typeof v === 'string' && v.startsWith('ZAP_')) return v
  }
  return ''
}

function normalizeStatus(value: string | null) {
  const status = String(value || '').toLowerCase()
  if (status === 'success' || status === 'paid' || status === 'completed') return 'success'
  if (status === 'timeout' || status === 'expired') return 'timeout'
  if (status === 'cancel' || status === 'cancelled' || status === 'canceled') return 'cancelled'
  return 'failed'
}

function safeWalletUrl(value: string | null) {
  try {
    const url = new URL(value || FALLBACK_RETURN_URL)
    const host = url.hostname.toLowerCase()
    const allowedHost =
      host === 'organicsmm.online' ||
      host.endsWith('.organicsmm.online') ||
      host === 'sologrow-pro.lovable.app' ||
      (host.startsWith('id-preview--') && host.endsWith('.lovable.app')) ||
      host === 'localhost' ||
      host === '127.0.0.1'

    if ((url.protocol === 'https:' || url.protocol === 'http:') && allowedHost) {
      url.pathname = '/wallet'
      url.hash = ''
      url.searchParams.delete('status')
      url.searchParams.delete('order_id')
      url.searchParams.delete('zapupi_order_id')
      url.searchParams.delete('deposit_order_id')
      url.searchParams.delete('gateway_order_id')
      url.searchParams.delete('utr')
      return url
    }
  } catch { /* fallback below */ }

  return new URL(FALLBACK_RETURN_URL)
}

function renderRedirectPage(targetUrl: string, status: string) {
  const title = status === 'success' ? 'Payment Successful' : status === 'timeout' ? 'Payment Timed Out' : 'Payment Cancelled'
  const accent = status === 'success' ? '#10b981' : '#ef4444'
  const safeTarget = JSON.stringify(targetUrl)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}" />
  <title>${title}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}
    .card{width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:28px;text-align:center;box-shadow:0 20px 50px -24px rgba(15,23,42,.35)}
    .icon{width:54px;height:54px;margin:0 auto 14px;border-radius:999px;background:${accent};color:white;display:grid;place-items:center;font-size:28px;font-weight:800}
    h1{font-size:20px;margin:0 0 8px;font-weight:800}.muted{font-size:13px;color:#64748b;margin:0 0 20px}.btn{display:block;background:#ea580c;color:white;text-decoration:none;border-radius:14px;padding:13px 16px;font-weight:800}
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">${status === 'success' ? '✓' : '!'}</div>
    <h1>${title}</h1>
    <p class="muted">Redirecting back to your wallet…</p>
    <a class="btn" href="${escapeHtml(targetUrl)}">Back to Wallet</a>
  </main>
  <script>
    const target = ${safeTarget};
    try { window.top.location.replace(target); } catch (_) { window.location.replace(target); }
    setTimeout(function(){ window.location.href = target; }, 400);
  </script>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
