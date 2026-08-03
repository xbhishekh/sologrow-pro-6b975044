import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const MAX_RUN_RETRIES = 9999
// Reduced from 5min → 60s: as soon as any provider finishes its active order
// on this link, the next run can grab it. Also disables sibling batch-postpone
// so each run gets its own chance every cron tick.
const ACTIVE_ORDER_RETRY_MS = 60 * 1000
const TEMPORARY_RETRY_MS = 60 * 1000

// Inline status-check cache for this execution (avoids re-polling same account row).
const inlineProviderAccountCache = new Map<string, { api_key: string; api_url: string } | null>()
const TERMINAL_PROVIDER_STATUSES = new Set([
  'completed','complete','partial','refunded','canceled','cancelled','error','failed','success','refund','canscelled',
])

async function inlineRefreshRunStatus(supabase: SupabaseClient, run: any): Promise<any> {
  try {
    if (!run?.provider_order_id || !run?.provider_account_id) return run
    const lastCheck = run.last_status_check ? new Date(run.last_status_check).getTime() : 0
    // Only re-poll if we haven't checked in the last 25s (cron is every 1-2min, this is the inline safety net)
    if (Date.now() - lastCheck < 25_000) return run
    const curStatus = (run.provider_status || '').toLowerCase()
    if (TERMINAL_PROVIDER_STATUSES.has(curStatus)) return run

    let acct = inlineProviderAccountCache.get(run.provider_account_id)
    if (acct === undefined) {
      const { data } = await supabase
        .from('provider_accounts')
        .select('api_key, api_url')
        .eq('id', run.provider_account_id)
        .maybeSingle()
      acct = data && data.api_key && data.api_url ? { api_key: data.api_key, api_url: data.api_url } : null
      inlineProviderAccountCache.set(run.provider_account_id, acct)
    }
    if (!acct) return run

    const formData = new URLSearchParams()
    formData.append('key', acct.api_key)
    formData.append('action', 'status')
    formData.append('order', String(run.provider_order_id))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    let result: any
    try {
      const response = await fetch(acct.api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: controller.signal,
      })
      const txt = await response.text()
      try { result = JSON.parse(txt) } catch { result = { error: txt } }
    } finally {
      clearTimeout(timeoutId)
    }

    if (!result || result.error) return run

    const providerStatus = result.status || result.Status || run.provider_status
    const remains = result.remains !== undefined ? Number(result.remains) : run.provider_remains
    const startCount = result.start_count !== undefined ? Number(result.start_count) : run.provider_start_count
    const charge = result.charge !== undefined ? Number(result.charge) : run.provider_charge

    await supabase.from('organic_run_schedule').update({
      provider_status: providerStatus,
      provider_remains: Number.isFinite(remains) ? remains : run.provider_remains,
      provider_start_count: Number.isFinite(startCount) ? startCount : run.provider_start_count,
      provider_charge: Number.isFinite(charge) ? charge : run.provider_charge,
      last_status_check: new Date().toISOString(),
    }).eq('id', run.id)

    return {
      ...run,
      provider_status: providerStatus,
      provider_remains: Number.isFinite(remains) ? remains : run.provider_remains,
      provider_start_count: Number.isFinite(startCount) ? startCount : run.provider_start_count,
      provider_charge: Number.isFinite(charge) ? charge : run.provider_charge,
      last_status_check: new Date().toISOString(),
    }
  } catch (_e) {
    return run
  }
}

// Substrings (lowercase) that indicate the provider rejected the order because
// another order for the same link is still active/processing on their side.
const ACTIVE_ORDER_PATTERNS = [
  'active order', 'wait until order', 'already has an order',
  'order in progress', 'in progress', 'link currently active',
  'processing previous order', 'wait for completion',
  'same link', 'cannot start a new order', 'active processing',
  'active processing order', 'duplicate order', 'duplicate link',
  'link is being processed', 'link is processing',
]

function isActiveOrderErrorMsg(msg: string | null | undefined): boolean {
  if (!msg) return false
  const m = msg.toLowerCase()
  return ACTIVE_ORDER_PATTERNS.some(p => m.includes(p))
}

const TEMPORARY_ERRORS = [
  'balance', 'not have enough', 'processing another transaction',
  'rate limit', 'timeout', 'temporarily', 'too many requests',
  ...ACTIVE_ORDER_PATTERNS,
]

const ACCOUNT_SPECIFIC_ERRORS = [
  'invalid api key', 'api key not found', 'invalid key',
  'unauthorized', 'authentication failed', 'wrong api key', 'api key invalid',
]

const TRY_NEXT_PROVIDER_ERRORS = [
  'quantity less than minimal', 'quantity less than minimum', 'min quantity',
  'minimum order', 'minimum quantity', 'max quantity', 'maximum quantity',
  'quantity more than maximum', 'service not found', 'incorrect service',
  'invalid service', 'service unavailable', 'service is not available',
  'disabled', 'not work', 'maintenance', 'down',
]

interface ProviderAccount {
  id: string
  provider_id: string
  name: string
  api_key: string
  api_url: string
  priority: number
  is_active: boolean
  last_used_at: string | null
  delivery_multiplier?: number | null
}

interface ServiceMapping {
  id: string
  service_id: string
  provider_account_id: string
  provider_service_id: string
  sort_order: number
  is_active: boolean
  provider_account: ProviderAccount
}

type ProviderCandidate = {
  account: ProviderAccount
  providerServiceId: string
  minQuantity: number
  sortOrder: number
}

// Module-level caches
const balanceCache = new Map<string, { balance: number; checkedAt: number }>()

const supabaseModule = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

// ==========================================
// OPTIMIZED: Per-invocation mapping cache
// Avoids repeated DB queries for same service
// ==========================================
class MappingCache {
  private cache = new Map<string, ProviderCandidate[]>()
  private configuredMapping = new Map<string, boolean>()
  
  async getForService(supabase: any, serviceId: string, excludeIds: string[], executionId: string): Promise<ProviderCandidate[]> {
    // Fetch once per service per invocation
    if (!this.cache.has(serviceId)) {
      const { data: mappings, error } = await supabase
        .from('service_provider_mapping')
        .select(`*, provider_account:provider_accounts(*)`)
        .eq('service_id', serviceId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      
      this.configuredMapping.set(serviceId, Boolean(!error && mappings && mappings.length > 0))

      if (error || !mappings || mappings.length === 0) {
        this.cache.set(serviceId, [])
      } else {
        const sorted = [...mappings].sort((a: any, b: any) => {
          const aPriority = a.sort_order || 0
          const bPriority = b.sort_order || 0
          if (aPriority !== bPriority) return aPriority - bPriority
          const aTime = a.provider_account?.last_used_at ? new Date(a.provider_account.last_used_at).getTime() : 0
          const bTime = b.provider_account?.last_used_at ? new Date(b.provider_account.last_used_at).getTime() : 0
          return aTime - bTime
        })
        
        // Fetch each provider-service min_quantity from services table (by provider_service_id + provider_id)
        const providerServiceIds = sorted
          .map((m: any) => m.provider_service_id)
          .filter(Boolean)
        const accountIds = sorted
          .map((m: any) => m.provider_account?.id)
          .filter(Boolean)
        const minByKey = new Map<string, number>()
        if (providerServiceIds.length > 0 && accountIds.length > 0) {
          const { data: providerSvcRows } = await supabase
            .from('services')
            .select('provider_service_id, provider_id, min_quantity')
            .in('provider_service_id', providerServiceIds)
          if (providerSvcRows) {
            for (const row of providerSvcRows as any[]) {
              minByKey.set(`${row.provider_id}:${row.provider_service_id}`, Number(row.min_quantity || 0))
            }
          }
        }

        const accounts: ProviderCandidate[] = []
        for (const mapping of sorted) {
          const account = mapping.provider_account as ProviderAccount
          if (account && account.is_active && isValidHttpUrl(account.api_url)) {
            const key = `${account.provider_id}:${mapping.provider_service_id}`
            accounts.push({
              account,
              providerServiceId: mapping.provider_service_id,
              minQuantity: minByKey.get(key) || 0,
              sortOrder: Number(mapping.sort_order || 999),
            })
          } else if (account && account.is_active && !isValidHttpUrl(account.api_url)) {
            console.log(`⚠️ Skipping provider ${account.name}: invalid api_url`)
          }
        }
        this.cache.set(serviceId, accounts)
      }
    }
    
    // Return filtered copy (excluding busy accounts)
    const all = this.cache.get(serviceId) || []
    return all.filter(a => !excludeIds.includes(a.account.id))
  }
  
  hasAnyForService(serviceId: string): boolean {
    return (this.cache.get(serviceId) || []).length > 0
  }

  hasConfiguredMappingForService(serviceId: string): boolean {
    return this.configuredMapping.get(serviceId) === true
  }
}

async function checkProviderBalance(account: ProviderAccount): Promise<{ hasBalance: boolean; balance: number }> {
  if (!isValidHttpUrl(account.api_url)) {
    console.log(`⚠️ Balance check skipped for ${account.name}: invalid api_url`)
    return { hasBalance: false, balance: 0 }
  }

  const cached = balanceCache.get(account.id)
  if (cached && Date.now() - cached.checkedAt < 30000) {
    return { hasBalance: cached.balance > 0, balance: cached.balance }
  }

  try {
    const formData = new URLSearchParams()
    formData.append('key', account.api_key)
    formData.append('action', 'balance')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(account.api_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const responseText = await response.text()

    let result
    try { result = JSON.parse(responseText) } catch {
      return { hasBalance: true, balance: -1 }
    }

    const balance = parseFloat(result.balance || result.funds || result.amount || '0')
    balanceCache.set(account.id, { balance, checkedAt: Date.now() })
    console.log(`💰 ${account.name} balance: ${balance}`)
    return { hasBalance: balance > 0, balance }
  } catch (error) {
    return { hasBalance: true, balance: -1 }
  }
}

async function updateAccountLastUsed(supabase: any, accountId: string) {
  await supabase
    .from('provider_accounts')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', accountId)
}

async function claimRunLock(params: {
  supabase: any
  runId: string
  expectedStatus: 'pending' | 'failed'
  updates: Record<string, any>
}) {
  const { data, error } = await params.supabase
    .from('organic_run_schedule')
    .update(params.updates)
    .eq('id', params.runId)
    .eq('status', params.expectedStatus)
    .select('id, status')
    .maybeSingle()

  return {
    error,
    locked: !!data,
    row: data,
  }
}

function hasUncertainDispatch(row: any) {
  const message = (row?.error_message || '').toLowerCase()
  if (message.includes('[dispatch uncertain]') || message.includes('[awaiting provider confirmation]')) {
    return true
  }

  return Boolean(
    row?.provider_response &&
    typeof row.provider_response === 'object' &&
    row.provider_response.uncertain_dispatch === true,
  )
}

type ProviderStatusCheckResult =
  | { ok: true; data: any; rawText: string }
  | { ok: false; error: string; rawText: string }

async function checkProviderOrderStatusWithRetries(params: {
  apiUrl: string; apiKey: string; providerOrderId: string;
  maxAttempts?: number; attemptDelayMs?: number;
}): Promise<ProviderStatusCheckResult> {
  const maxAttempts = params.maxAttempts ?? 3
  const attemptDelayMs = params.attemptDelayMs ?? 2000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const formData = new URLSearchParams()
    formData.append('key', params.apiKey)
    formData.append('action', 'status')
    formData.append('order', params.providerOrderId)

    let rawText = ''
    try {
      const response = await fetch(params.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })
      rawText = await response.text()

      let result: any
      try { result = JSON.parse(rawText) } catch { result = { error: rawText } }

      if (result?.error || result?.status === 'fail') {
        const err = (result?.message || result?.error || 'Provider status error')?.toString()
        const retryableNotFound = err.toLowerCase().includes('not found') ||
          err.toLowerCase().includes('incorrect order') || err.toLowerCase().includes('wrong order')

        if (retryableNotFound && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attemptDelayMs))
          continue
        }
        return { ok: false, error: err, rawText }
      }
      return { ok: true, data: result, rawText }
    } catch (e: any) {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attemptDelayMs))
        continue
      }
      return { ok: false, error: `Network error: ${e?.message || 'Unknown'}`, rawText }
    }
  }
  return { ok: false, error: 'Unknown provider status error', rawText: '' }
}

const detectPlatformFromLink = (url: string): string | null => {
  const lower = url.toLowerCase()
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter'
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook'
  return null
}

const detectPlatformFromService = (serviceName: string): string | null => {
  const lower = serviceName.toLowerCase()
  if (lower.includes('instagram') || lower.includes('ig ')) return 'instagram'
  if (lower.includes('youtube') || lower.includes('yt ')) return 'youtube'
  if (lower.includes('tiktok') || lower.includes('tt ')) return 'tiktok'
  if (lower.includes('twitter') || lower.includes('x ')) return 'twitter'
  if (lower.includes('facebook') || lower.includes('fb ')) return 'facebook'
  return null
}

const isValidUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const isValidHttpUrl = (value?: string | null) => {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const normalizeLink = (value?: string | null) => (value || '').toLowerCase().trim().replace(/\/$/, '')

function isZeroDeliveryProviderFailure(run: any) {
  const message = (run?.error_message || '').toLowerCase()
  const status = (run?.provider_status || '').toLowerCase()
  const qty = Number(run?.quantity_to_send || 0)
  const remains = typeof run?.provider_remains === 'number' ? run.provider_remains : Number(run?.provider_remains || 0)
  const startCount = typeof run?.provider_start_count === 'number' ? run.provider_start_count : Number(run?.provider_start_count || 0)

  return Boolean(
    run?.provider_order_id &&
    qty > 0 &&
    (message.includes('0 delivered') || message.includes('auto-retry')) &&
    (status.includes('pending') || status.includes('progress') || status.includes('processing') || status.includes('unknown')) &&
    remains >= qty &&
    startCount <= 0,
  )
}

function providerNameLooksUnhealthy(name?: string | null) {
  const normalized = (name || '').toLowerCase().trim()
  return ['justyoy', 'firgip', 'goup'].includes(normalized)
}

// Strip Instagram/social tracking params (igsh, igshid, utm_*, si, feature, etc.)
// Some SMM providers fail silently or refuse to deliver when the link contains
// share/tracking query strings — sending the clean canonical URL fixes this.
const sanitizeProviderLink = (raw?: string | null): string => {
  const link = (raw || '').trim()
  if (!link) return ''
  try {
    const u = new URL(link)
    const stripKeys = ['igsh', 'igshid', 'si', 'feature', 'fbclid', 'gclid', 'mc_cid', 'mc_eid']
    const keys = Array.from(u.searchParams.keys())
    for (const k of keys) {
      if (stripKeys.includes(k.toLowerCase()) || k.toLowerCase().startsWith('utm_')) {
        u.searchParams.delete(k)
      }
    }
    let out = u.origin + u.pathname.replace(/\/+$/, '/') 
    const qs = u.searchParams.toString()
    if (qs) out += '?' + qs
    return out
  } catch {
    return link
  }
}

const isTerminalProviderStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase().trim()
  return ['completed', 'complete', 'partial', 'refunded', 'canceled', 'cancelled', 'error', 'failed', 'success', 'refund', 'canscelled'].includes(normalized)
}

const isActiveProviderStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase().trim()
  return ['pending', 'in progress', 'processing', 'processing order', 'inprogress', 'awaiting'].includes(normalized)
}

const isFailedProviderStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase().trim()
  return ['refunded', 'canceled', 'cancelled', 'error', 'failed', 'refund', 'canscelled'].includes(normalized)
}

const getNestedEngagementOrderLink = (value: any) => {
  if (Array.isArray(value)) {
    return getNestedEngagementOrderLink(value[0])
  }
  if (value?.engagement_order) {
    return getNestedEngagementOrderLink(value.engagement_order)
  }
  return value?.link || ''
}

const calculateObservedRunDelivery = (run: any) => {
  const providerStatus = (run?.provider_status || '').toString().toLowerCase().trim()

  if (providerStatus === 'completed' || providerStatus === 'complete' || providerStatus === 'success') {
    return Number(run?.quantity_to_send || 0)
  }

  if (run?.provider_remains !== null && run?.provider_remains !== undefined) {
    return Math.max(0, Number(run?.quantity_to_send || 0) - Number(run?.provider_remains || 0))
  }

  return 0
}

// Configurable under-delivery buffer for publicCountDelta.
// Organic (real) viewers can inflate the post's public view count and trick
// the over-delivery guard into stopping orders too early. To absorb that
// genuine growth, we discount publicCountDelta by a buffer = max(MIN, target * PERCENT/100)
// before treating it as "already delivered". Tune via env vars without redeploying logic.
const PUBLIC_DELTA_BUFFER_PERCENT = Math.max(
  0,
  Number(Deno.env.get('PUBLIC_DELTA_BUFFER_PERCENT') ?? '0'),
)
const PUBLIC_DELTA_BUFFER_MIN = Math.max(
  0,
  Number(Deno.env.get('PUBLIC_DELTA_BUFFER_MIN') ?? '0'),
)

const computePublicDeltaBuffer = (targetQty: number) => {
  const pctBuffer = Math.floor((Math.max(0, targetQty) * PUBLIC_DELTA_BUFFER_PERCENT) / 100)
  return Math.max(PUBLIC_DELTA_BUFFER_MIN, pctBuffer)
}

const calculateObservedItemDelivery = (runs: any[], targetQty: number = 0) => {
  const askedSent = (runs || []).reduce((sum: number, run: any) => {
    if (run?.status === 'started' || run?.status === 'completed') {
      return sum + Number(run?.quantity_to_send || 0)
    }
    return sum
  }, 0)

  const observedByRuns = (runs || []).reduce(
    (sum: number, run: any) => sum + calculateObservedRunDelivery(run),
    0,
  )

  const startCounts = (runs || [])
    .map((run: any) => Number(run?.provider_start_count))
    // Ignore 0/null start counts. A zero from a failed/unverified provider status
    // was making public_delta huge and closing orders after only a few runs.
    .filter((value: number) => Number.isFinite(value) && value > 0)

  const publicCountDelta = startCounts.length > 0
    ? Math.max(0, Math.max(...startCounts) - Math.min(...startCounts))
    : 0

  // Discount organic growth: only the portion of publicCountDelta that exceeds
  // the buffer is attributed to provider over-delivery.
  const publicDeltaBuffer = computePublicDeltaBuffer(targetQty)
  const adjustedPublicCountDelta = Math.max(0, publicCountDelta - publicDeltaBuffer)

  return {
    askedSent,
    observedByRuns,
    publicCountDelta,
    publicDeltaBuffer,
    adjustedPublicCountDelta,
    // STRICT MODE: include publicCountDelta so provider over-delivery
    // (e.g. we ask 5k views and the provider pushes 50k to the public post)
    // is treated as already-delivered. This was previously excluded to allow
    // for organic growth from real users, but it caused massive over-delivery
    // complaints (10k ordered → 150k delivered). Better to slightly under-deliver
    // when a post also has organic traffic than to overshoot 10-15×.
    // Organic buffer (PUBLIC_DELTA_BUFFER_PERCENT / PUBLIC_DELTA_BUFFER_MIN) softens
    // the publicCountDelta so genuine organic viewers don't prematurely stop the order.
    // IMPORTANT: do not count `askedSent` as delivered. It only means a quantity was
    // submitted to providers, not that the public target count has been reached.
    delivered: Math.max(observedByRuns, adjustedPublicCountDelta),
    reserved: Math.max(askedSent, observedByRuns, adjustedPublicCountDelta),
  }
}

const getRunObservedCurrentCount = (run: any): number | null => {
  const start = Number(run?.provider_start_count)
  if (!Number.isFinite(start) || start < 0) return null

  const qty = Number(run?.quantity_to_send || 0)
  const status = (run?.provider_status || run?.status || '').toString().toLowerCase().trim()
  const remainsKnown = run?.provider_remains !== null && run?.provider_remains !== undefined

  if (remainsKnown) {
    const remains = Number(run.provider_remains)
    if (Number.isFinite(remains)) {
      return start + Math.max(0, qty - Math.max(0, remains))
    }
  }

  if (status === 'completed' || status === 'complete' || status === 'success') {
    return start + qty
  }

  return start
}

async function syncEngagementItemTracking(supabase: SupabaseClient, itemId?: string | null) {
  if (!itemId) return null

  const { data: item } = await supabase
    .from('engagement_order_items')
    .select('id, engagement_order_id, quantity, status, start_count, current_count, target_count, completion_locked_at')
    .eq('id', itemId)
    .maybeSingle()

  if (!item || item.status === 'cancelled' || item.status === 'paused') return null

  const orderedQty = Number(item.quantity || 0)
  if (orderedQty <= 0) return null

  const { data: runs } = await supabase
    .from('organic_run_schedule')
    .select('id, run_number, quantity_to_send, status, provider_start_count, provider_remains, provider_status, started_at')
    .eq('engagement_order_item_id', itemId)
    .order('run_number', { ascending: true })

  // Filter: only trust runs whose provider ACTUALLY returned a start_count.
  // Using `Number()` coerces null→0 so `Number.isFinite(Number(null))===true`,
  // which historically dragged the baseline to 0 for services (likes/comments/
  // shares/subscribers) where providers omit start_count. Use explicit null check.
  const validRuns = (runs || []).filter((run: any) => {
    const raw = run?.provider_start_count
    if (raw === null || raw === undefined) return false
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0
  })

  const existingStart = item.start_count !== null && item.start_count !== undefined
    ? Number(item.start_count)
    : null
  const firstProviderStart = validRuns.length > 0 ? Number(validRuns[0].provider_start_count) : null

  // Baseline preference:
  //   1) existing non-zero start_count on the item (stable across syncs)
  //   2) real provider baseline captured on the first run
  //   3) fall back to 0 when no provider ever exposed a public counter
  // NEVER overwrite a real existing baseline with 0.
  let baseline: number
  if (existingStart !== null && Number.isFinite(existingStart) && existingStart > 0) {
    baseline = existingStart
  } else if (firstProviderStart !== null && Number.isFinite(firstProviderStart) && firstProviderStart > 0) {
    baseline = firstProviderStart
  } else if (existingStart !== null && Number.isFinite(existingStart) && existingStart >= 0) {
    baseline = existingStart
  } else {
    baseline = 0
  }

  // Delivery-based progress: SUM of delivered across ALL runs (not MAX).
  // For each run: qty_to_send - max(0, provider_remains); if provider says the
  // run finished (completed/success), count the whole qty; else 0.
  const totalDeliveredByRuns = (runs || []).reduce((sum: number, run: any) => {
    const qty = Number(run?.quantity_to_send || 0)
    if (qty <= 0) return sum
    const rawStatus = (run?.provider_status || run?.status || '').toString().toLowerCase().trim()
    const remainsRaw = run?.provider_remains
    if (remainsRaw !== null && remainsRaw !== undefined) {
      const remains = Number(remainsRaw)
      if (Number.isFinite(remains)) {
        return sum + Math.max(0, qty - Math.max(0, remains))
      }
    }
    if (rawStatus === 'completed' || rawStatus === 'complete' || rawStatus === 'success') {
      return sum + qty
    }
    return sum
  }, 0)

  const deliveredCapped = Math.min(orderedQty, totalDeliveredByRuns)
  const publicObservedCounts = validRuns
    .map((run: any) => getRunObservedCurrentCount(run))
    .filter((value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0)

  const current = Math.max(
    baseline + deliveredCapped,
    Number(item.current_count || baseline),
    ...(publicObservedCounts.length ? publicObservedCounts : [baseline]),
  )
  const target = baseline + orderedQty
  const remaining = Math.max(0, target - current)
  // Delivery-based completion (source of truth for services without public counters).
  const targetReached = deliveredCapped >= orderedQty || current >= target

  const itemUpdate: any = {
    start_count: baseline,
    current_count: current,
    last_synced_at: new Date().toISOString(),
  }

  if (targetReached) {
    itemUpdate.status = 'completed'
    await supabase.from('organic_run_schedule').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: `Target count reached (${current}/${target}) — cancelling remaining runs`,
      last_status_check: new Date().toISOString(),
    }).eq('engagement_order_item_id', itemId).eq('status', 'pending')
  }
  // NOTE: no longer force back to 'processing' when target not reached — that
  // decision is made downstream in updateEngagementOrderStatus based on the
  // ACTUAL run outcomes, so items don't get stuck when providers never expose
  // a public counter.

  await supabase.from('engagement_order_items').update(itemUpdate).eq('id', itemId)

  return { baseline, current, target, remaining, targetReached, engagementOrderId: item.engagement_order_id }
}

async function batchPostponeEngagementRunsForLink(
  supabase: SupabaseClient,
  normalizedLink: string,
  engagementType: string,
  scheduledAt: string,
  reason: string,
) {
  if (!normalizedLink) return 0

  const { data: dueRuns, error: dueRunsError } = await supabase
    .from('organic_run_schedule')
    .select('id, engagement_order_item:engagement_order_items!inner(engagement_type, engagement_order:engagement_orders!inner(link))')
    .eq('status', 'pending')
    .not('engagement_order_item_id', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .limit(1000)

  if (dueRunsError || !dueRuns?.length) {
    if (dueRunsError) console.error('Failed to load due runs for batch postpone:', dueRunsError)
    return 0
  }

  // Only postpone runs with matching link AND engagement type
  const matchingIds = dueRuns
    .filter((dueRun: any) => {
      const runLink = normalizeLink(dueRun.engagement_order_item?.engagement_order?.link)
      const runType = (dueRun.engagement_order_item?.engagement_type || '').toLowerCase()
      return runLink === normalizedLink && runType === engagementType.toLowerCase()
    })
    .map((dueRun: any) => dueRun.id)

  if (matchingIds.length === 0) return 0

  const { data: updatedRuns, error: updateError } = await supabase
    .from('organic_run_schedule')
    .update({
      scheduled_at: scheduledAt,
      error_message: reason,
      last_status_check: new Date().toISOString(),
    })
    .in('id', matchingIds)
    .select('id')

  if (updateError) {
    console.error('Failed to batch postpone matching runs:', updateError)
    return 0
  }

  return updatedRuns?.length || 0
}

async function updateEngagementOrderStatus(supabase: SupabaseClient, engagementOrderId: string, itemId: string) {
  if (!engagementOrderId) return

  const tracking = await syncEngagementItemTracking(supabase, itemId)

  const { data: parentOrder } = await supabase
    .from('engagement_orders')
    .select('status')
    .eq('id', engagementOrderId)
    .maybeSingle()

  if (parentOrder?.status === 'cancelled') return

  if (itemId) {
    const { data: currentItem } = await supabase
      .from('engagement_order_items')
      .select('status')
      .eq('id', itemId)
      .maybeSingle()

    if (currentItem?.status !== 'cancelled') {
      const { data: itemRuns } = await supabase
        .from('organic_run_schedule')
        .select('status')
        .eq('engagement_order_item_id', itemId)

      if (itemRuns && itemRuns.length > 0) {
        const completedCount = itemRuns.filter((r: any) => r.status === 'completed').length
        const failedCount = itemRuns.filter((r: any) => r.status === 'failed').length
        const cancelledCount = itemRuns.filter((r: any) => r.status === 'cancelled').length
        const activeCount = itemRuns.filter((r: any) => r.status === 'pending' || r.status === 'started').length
        const totalRuns = itemRuns.length

        let itemStatus = 'processing'
        if (activeCount > 0) itemStatus = currentItem?.status === 'paused' ? 'paused' : 'processing'
        else if (completedCount === totalRuns) itemStatus = 'completed'
        else if (completedCount > 0 && completedCount + failedCount + cancelledCount === totalRuns) itemStatus = 'partial'
        else if (failedCount + cancelledCount === totalRuns) itemStatus = 'failed'

        // If tracking exists AND has a REAL public baseline but delivery hasn't
        // reached the target yet, downgrade a runs-based 'completed' to 'partial'
        // (all runs done but public target not met). For items without a public
        // baseline (start_count = 0), trust the runs-based decision so items
        // don't get stuck perpetually in 'processing'.
        if (
          itemStatus === 'completed'
          && tracking
          && !tracking.targetReached
          && tracking.baseline > 0
        ) {
          itemStatus = 'partial'
        }
        await supabase.from('engagement_order_items').update({ status: itemStatus }).eq('id', itemId)
      }
    }
  }

  const { data: allItems } = await supabase
    .from('engagement_order_items')
    .select('status, quantity, delivered_count')
    .eq('engagement_order_id', engagementOrderId)

  if (!allItems || allItems.length === 0) return

  const effectiveItems = allItems.map((item: any) => {
    const quantity = Number(item.quantity || 0)
    const delivered = Number(item.delivered_count || 0)
    if (quantity > 0 && delivered >= quantity) return { ...item, effective_status: 'completed' }
    return { ...item, effective_status: item.status }
  })

  const completedItems = effectiveItems.filter((i: any) => i.effective_status === 'completed').length
  const partialItems = effectiveItems.filter((i: any) => i.effective_status === 'partial').length
  const failedItems = effectiveItems.filter((i: any) => i.effective_status === 'failed').length
  const cancelledItems = effectiveItems.filter((i: any) => i.effective_status === 'cancelled').length
  const activeItems = effectiveItems.filter((i: any) => i.effective_status === 'processing' || i.effective_status === 'pending').length
  const totalItems = allItems.length

  let orderStatus = 'processing'
  if (completedItems === totalItems) orderStatus = 'completed'
  else if (failedItems === totalItems) orderStatus = 'failed'
  else if (activeItems === 0 && completedItems + partialItems + failedItems + cancelledItems === totalItems) orderStatus = completedItems > 0 ? 'partial' : failedItems > 0 ? 'failed' : 'cancelled'
  else if (parentOrder?.status === 'paused') orderStatus = 'paused'

  await supabase.from('engagement_orders').update({ status: orderStatus }).eq('id', engagementOrderId).neq('status', 'cancelled')
}

async function triggerContinuation(executionId: string, reason: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      console.error(`⚠️ Cannot continue [${executionId}] - missing backend env vars`)
      return false
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/execute-all-runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({ continued_from: executionId, reason }),
    })

    if (!response.ok) {
      const responseText = await response.text()
      console.error(`⚠️ Continuation trigger failed [${executionId}]: ${response.status} ${responseText}`)
      return false
    }

    console.log(`🔁 Continuation queued for [${executionId}] (${reason})`)
    return true
  } catch (error) {
    console.error(`⚠️ Continuation request error [${executionId}]:`, error)
    return false
  }
}

// Declare EdgeRuntime for waitUntil support
declare const EdgeRuntime: { waitUntil(promise: Promise<any>): void }

serve(async (req) => {
  const startTime = Date.now()
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth: service-role (cron) OR a verified user JWT. Reject anon and unsigned tokens.
    // Service-role tokens do not contain a user `sub`, so Supabase Auth claims checks
    // reject them. Accept them by role claim after the Edge gateway has verified JWT.
    const authHeader = req.headers.get('Authorization')
    const supabase = supabaseModule
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    {
      const token = authHeader.replace('Bearer ', '').trim()
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const payload = decodeJwtPayload(token)
      const isServiceRoleToken = token === serviceKey || payload?.role === 'service_role'
      if (!isServiceRoleToken) {
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token)
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    }

    const executionId = crypto.randomUUID().slice(0, 8)
    console.log(`=== EXECUTE ALL ORGANIC RUNS [${executionId}] ===`)

    // Return 202 immediately, process in background to avoid context-canceled
    const backgroundWork = processAllRuns(supabase, executionId, startTime)
    
    try {
      EdgeRuntime.waitUntil(backgroundWork)
    } catch {
      // Fallback: if EdgeRuntime not available, await directly
      await backgroundWork
    }

    return new Response(JSON.stringify({
      success: true, execution_id: executionId,
      message: 'Processing started in background'
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Execution error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function processAllRuns(supabase: any, executionId: string, startTime: number) {
  try {
    // ==========================================
    // SWEEP: retry stuck pending non-organic orders
    // (place-order/public-api invoke process-order fire-and-forget; if that
    //  invoke drops, the order sits at pending forever. Cron picks it up.)
    // ==========================================
    try {
      const staleCutoff = new Date(Date.now() - 60 * 1000).toISOString()
      const { data: stalePending } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'pending')
        .eq('is_organic_mode', false)
        .is('provider_order_id', null)
        .lt('created_at', staleCutoff)
        .order('created_at', { ascending: true })
        .limit(30)

      if (stalePending && stalePending.length > 0) {
        console.log(`[sweep] Retrying ${stalePending.length} stuck pending non-organic orders`)
        for (const p of stalePending) {
          try {
            await supabase.functions.invoke('process-order', { body: { order_id: p.id } })
          } catch (e) {
            console.log(`[sweep] invoke failed for ${p.id}: ${(e as Error).message}`)
          }
        }
      }
    } catch (sweepErr) {
      console.log(`[sweep] error: ${(sweepErr as Error).message}`)
    }

    let processed = 0
    let skipped = 0
    let failed = 0
    let retried = 0
    let shouldContinue = false
    let continuationReason: string | null = null
    const results: any[] = []

    // ==========================================
    // OPTIMIZATION: Single mapping cache for entire invocation
    // ==========================================
    const mappingCache = new MappingCache()

    // ==========================================
    // PRE-FETCH ALL DATA IN PARALLEL (batch queries)
    // ==========================================
    const nowWithBuffer = new Date(Date.now() + 2000).toISOString()
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const [
      { data: activeRuns },
      { data: globalStuckRuns },
      { data: pendingEngagementRuns, error: engagementRunsError },
      { data: failedEngagementRuns },
    ] = await Promise.all([
      // 1. Active runs for conflict detection
      supabase
        .from('organic_run_schedule')
        .select('*, engagement_order_item:engagement_order_items(engagement_type, service_id, engagement_order:engagement_orders(link))')
        .eq('status', 'started'),
      // 2. Stuck runs for cleanup
      supabase
        .from('organic_run_schedule')
        .select('id, run_number, started_at, provider_account_id, provider_status, provider_order_id, provider_remains, provider_start_count, quantity_to_send, retry_count')
        .eq('status', 'started')
        .or(`started_at.lt.${tenMinAgo},started_at.is.null`),
      // 3. Pending engagement runs
      supabase
        .from('organic_run_schedule')
        .select(`*, engagement_order_item:engagement_order_items!organic_run_schedule_engagement_order_item_id_fkey!inner(*, service:services(*), engagement_order:engagement_orders!inner(*))`)
        .eq('status', 'pending')
        .not('engagement_order_item_id', 'is', null)
        .lte('scheduled_at', nowWithBuffer)
        .not('engagement_order_item.status', 'in', '("paused","cancelled")')
        .not('engagement_order_item.engagement_order.status', 'in', '("paused","cancelled")')
        // Fetch strict FIFO at the database level. Ordering by last_status_check
        // first allowed a constant stream of never-checked rows (NULL first) to
        // fill this 1000-row window, so older overdue runs that had already been
        // checked once could remain queued forever and never reach the local FIFO
        // sort below.
        .order('scheduled_at', { ascending: true })
        .order('run_number', { ascending: true })
        .limit(1000),
      // 4. Failed engagement runs for retry
      supabase
        .from('organic_run_schedule')
        .select(`*, engagement_order_item:engagement_order_items!organic_run_schedule_engagement_order_item_id_fkey(*, service:services(*), engagement_order:engagement_orders(*))`)
        .eq('status', 'failed')
        .lt('retry_count', 99)
        .not('engagement_order_item_id', 'is', null)
        .order('completed_at', { ascending: true })
        .limit(50),
    ])

    // ==========================================
    // STEP 0: GLOBAL CLEANUP (stuck runs)
    // ==========================================
    if (globalStuckRuns && globalStuckRuns.length > 0) {
      console.log(`🧹 Cleaning ${globalStuckRuns.length} stuck runs`)
      // Batch cleanup in parallel
      const cleanupPromises = globalStuckRuns.map((stuck: any) => {
        const startedTime = stuck.started_at ? new Date(stuck.started_at).getTime() : Date.now() - 11 * 60 * 1000
        const ageMin = Math.round((Date.now() - startedTime) / 60000)
        
        if (!stuck.provider_order_id) {
          return supabase.from('organic_run_schedule').update({
            status: 'pending', started_at: null, provider_account_id: null,
            error_message: `Ghost run reverted after ${ageMin}min`,
          }).eq('id', stuck.id)
        } else {
          // SCAM GUARD: if provider didn't deliver anything (remains == full qty, or start_count null & remains == qty),
          // mark as failed so the scheduler retries on a backup provider instead of silently "completing" a fake order.
          const qty = stuck.quantity_to_send || 0
          const remains = typeof stuck.provider_remains === 'number' ? stuck.provider_remains : null
          const startCount = typeof stuck.provider_start_count === 'number' ? stuck.provider_start_count : null
          const deliveredZero = remains !== null && qty > 0 && remains >= qty && (startCount === null || startCount === 0)
          const isTerminal = isTerminalProviderStatus(stuck.provider_status)
          const isActive = isActiveProviderStatus(stuck.provider_status)
          const retryCount = stuck.retry_count || 0

          if (deliveredZero && isActive && ageMin < 45) {
            return null
          }

          if (deliveredZero && !isTerminal && retryCount < 15) {
            return supabase.from('organic_run_schedule').update({
              status: 'failed', completed_at: new Date().toISOString(),
              error_message: `Auto-retry after ${ageMin}min: provider returned ${stuck.provider_status || 'unknown'} with 0 delivered (remains=${remains}/${qty})`,
            }).eq('id', stuck.id)
          }

          if (!isTerminal && isActive) {
            return null
          }

          return supabase.from('organic_run_schedule').update({
            last_status_check: new Date().toISOString(),
            error_message: `Still waiting for provider completion after ${ageMin}min (status: ${stuck.provider_status || 'unknown'})`,
          }).eq('id', stuck.id)
        }
      })
      await Promise.all(cleanupPromises.filter(Boolean))
      console.log(`✅ Cleaned ${globalStuckRuns.length} stuck runs`)
    }

    // ==========================================
    // STEP 1: Process ENGAGEMENT ORDER runs
    // ==========================================
    console.log(`\n--- Processing Engagement Order Runs ---`)

    if (engagementRunsError) {
      console.error('Error fetching engagement runs:', engagementRunsError)
    }
    console.log(`📥 Fetched ${pendingEngagementRuns?.length || 0} raw pending engagement runs from DB`)

    // PRE-FILTER: Remove paused/cancelled
    const activeEngagementRuns = (pendingEngagementRuns || []).filter((run: any) => {
      const orderStatus = run.engagement_order_item?.engagement_order?.status
      const itemStatus = run.engagement_order_item?.status
      if (orderStatus === 'paused' || orderStatus === 'cancelled') return false
      if (itemStatus === 'paused' || itemStatus === 'cancelled') return false
      return true
    })

    // ============================================================
    // TYPE ORDERING: Views must go first, then likes/comments/shares/etc.
    // Users complained that likes/comments show up before views on their
    // posts. Enforce a strict order per engagement_order:
    //   1. Views dispatch first.
    //   2. Other engagement types are held back until the views item of
    //      the same order has meaningfully started delivering.
    // ============================================================
    const TYPE_PRIORITY: Record<string, number> = {
      views: 1,
      view: 1,
      plays: 1,
      play: 1,
      likes: 2,
      like: 2,
      comments: 3,
      comment: 3,
      shares: 4,
      share: 4,
      reposts: 5,
      repost: 5,
      saves: 6,
      save: 6,
      followers: 7,
      subscribers: 7,
    }
    const priorityForType = (t?: string) => TYPE_PRIORITY[(t || '').toLowerCase().trim()] ?? 9
    // Ordering only: views dispatch FIRST (priority sort), then likes/comments/shares/etc.
    // No hard gate — organic look comes from priority sorting, not from blocking.
    const gatedEngagementRuns = activeEngagementRuns

    // Do not cap an item to one run per invocation. Provider-level guards below
    // already guarantee that the same provider cannot receive two active orders
    // for the same link+type. Processing every due run here lets each free mapped
    // provider take one run in the same cycle instead of leaving artificial queues.
    const executionProviderMap = new Map<string, Set<string>>()
    // Track link+type combos where ALL providers returned "active order" — only skip same type
    const activeOrderLinkTypes = new Set<string>()

    // Sort by type priority BEFORE per-item cap so views win any tie for scheduling
    const prioritizedPending = [...gatedEngagementRuns].sort((a: any, b: any) => {
      const pa = priorityForType(a.engagement_order_item?.engagement_type)
      const pb = priorityForType(b.engagement_order_item?.engagement_type)
      if (pa !== pb) return pa - pb
      const aTime = new Date(a.scheduled_at || 0).getTime()
      const bTime = new Date(b.scheduled_at || 0).getTime()
      return aTime - bTime
    })

    const pendingRunsLimitedPerItem = prioritizedPending

    // PRE-FILTER failed runs
    const activeFailedRuns = (failedEngagementRuns || []).filter((run: any) => {
      const orderStatus = run.engagement_order_item?.engagement_order?.status
      const itemStatus = run.engagement_order_item?.status
      if (orderStatus === 'cancelled' || orderStatus === 'paused') return false
      if (itemStatus === 'cancelled' || itemStatus === 'paused') return false
      return true
    })

    const retryableFailedRuns = activeFailedRuns.filter((run: any) => {
      // Hard stop: once a provider order id exists, never place that same run again.
      // A retry here can create duplicate external orders for one scheduled run.
      // Exception: provider accepted the order but delivered 0 for 45+ min. Treat it
      // as a dead provider slot and place the same scheduled chunk on another provider.
      if (run.provider_order_id && !isZeroDeliveryProviderFailure(run)) return false
      return true
    })

    const prioritizedRetry = [...retryableFailedRuns].sort((a: any, b: any) => {
      const pa = priorityForType(a.engagement_order_item?.engagement_type)
      const pb = priorityForType(b.engagement_order_item?.engagement_type)
      if (pa !== pb) return pa - pb
      return 0
    })
    const retryRunsLimitedPerItem = prioritizedRetry

    const allEngagementRuns = [...pendingRunsLimitedPerItem, ...retryRunsLimitedPerItem].sort((a: any, b: any) => {
      // Views always ahead of other types in the same batch
      const pa = priorityForType(a.engagement_order_item?.engagement_type)
      const pb = priorityForType(b.engagement_order_item?.engagement_type)
      if (pa !== pb) return pa - pb

      // Strict FIFO within an engagement type. A previous temporary "busy"
      // message must never push an older due run behind newer runs; otherwise
      // the newer run repeatedly grabs the newly-free provider and the older
      // queued run starves forever.
      const aTime = new Date(a.scheduled_at || 0).getTime()
      const bTime = new Date(b.scheduled_at || 0).getTime()
      if (aTime !== bTime) return aTime - bTime

      return Number(a.run_number || 0) - Number(b.run_number || 0)
    })
    console.log(`Processing ${allEngagementRuns.length} runs (${pendingRunsLimitedPerItem.length} pending + ${retryRunsLimitedPerItem.length} retry), total overdue in DB: check query`)

    // Do not pre-block queued runs from old "active order" errors.
    // A queued run must reach the provider attempt loop every cron tick; only
    // live/started provider orders and the provider's fresh API response should
    // decide whether that provider is busy.

    // Process each engagement run
    for (const run of allEngagementRuns) {
      // Timeout guard: if we've been running for 50s, stop to avoid edge function timeout
      if (Date.now() - startTime > 50000) {
        shouldContinue = true
        continuationReason = 'engagement-time-slice-exhausted'
        console.log(`⏰ Approaching timeout (${Date.now() - startTime}ms), stopping processing. Remaining runs will be picked up next cycle.`)
        break
      }

      // FAST SKIP: If we already know this link+type has "active order" on all providers, skip immediately
      const runLink = normalizeLink(run.engagement_order_item?.engagement_order?.link)
      const runType = (run.engagement_order_item?.engagement_type || '').toLowerCase()
      const linkTypeKey = `${runLink}|${runType}`
      if (runLink && activeOrderLinkTypes.has(linkTypeKey)) {
        await supabase.from('organic_run_schedule').update({
          status: 'pending',
          error_message: `[Postponed] Active order on link for ${runType}`,
          last_status_check: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++
        continue
      }

      const isRetry = run.status === 'failed'
      const item = run.engagement_order_item
      if (!item) {
        await supabase.from('organic_run_schedule').update({
          status: 'failed', error_message: 'Missing engagement order item',
        }).eq('id', run.id)
        failed++
        continue
      }

      const currentType = item.engagement_type?.toLowerCase()
      const engagementOrderStatus = item.engagement_order?.status
      const itemStatus = item.status
      
      // CANCELLED = PERMANENT
      if (engagementOrderStatus === 'cancelled') {
        await supabase.from('organic_run_schedule').update({
          status: 'cancelled', error_message: 'Order cancelled by user',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++
        continue
      }
      if (itemStatus === 'cancelled') {
        await supabase.from('organic_run_schedule').update({
          status: 'cancelled', error_message: 'Item cancelled by user',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++
        continue
      }
      
      // PAUSED = TEMPORARY
      if (engagementOrderStatus === 'paused' || itemStatus === 'paused') {
        skipped++
        continue
      }

      // 🛡️ OVER-DELIVERY GUARD: Ensure cumulative sent quantity never exceeds item.quantity.
      // Some providers over-deliver on the public post even when our scheduled qty is lower,
      // so we must stop future runs based on observed public delivery too.
      try {
        const tracking = await syncEngagementItemTracking(supabase, item.id)
        if (tracking?.targetReached) {
          await updateEngagementOrderStatus(supabase, item.engagement_order_id, item.id)
          skipped++
          console.log(`🎯 Item ${item.id} target reached by live count (${tracking.current}/${tracking.target}); pending runs cancelled and item completed.`)
          continue
        }

        const orderedQty = Number(item.quantity || 0)
        if (orderedQty > 0) {
          const { data: sentRows } = await supabase
            .from('organic_run_schedule')
            .select('quantity_to_send,status,provider_start_count,provider_remains,provider_status,run_number')
            .eq('engagement_order_item_id', item.id)
            .in('status', ['completed', 'started', 'failed'])

          const observed = calculateObservedItemDelivery(sentRows || [], orderedQty)
          const actualDelivered = observed.delivered
          const reservedOrDelivered = observed.reserved
          const remaining = orderedQty - reservedOrDelivered
          if (remaining <= 0) {
            // Enough quantity is already at providers, but live public count has not
            // reached target yet. Keep future runs due instead of pushing their
            // schedule forward every cron tick. They remain visibly queued and are
            // reconsidered immediately after an active reservation is completed or
            // released, while still preventing over-delivery in this invocation.
            await supabase.from('organic_run_schedule').update({
              error_message: `Delivery reserved (asked=${observed.askedSent}, observed=${observed.observedByRuns}, public_delta=${observed.publicCountDelta}, public_delta_adj=${observed.adjustedPublicCountDelta}, buffer=${observed.publicDeltaBuffer}, target=${orderedQty}) — awaiting live target count`,
              last_status_check: new Date().toISOString(),
            }).eq('engagement_order_item_id', item.id).eq('status', 'pending')
            if (actualDelivered >= orderedQty) {
              const finalTracking = await syncEngagementItemTracking(supabase, item.id)
              if (finalTracking?.targetReached) {
                await supabase.from('engagement_order_items').update({
                  status: 'completed', updated_at: new Date().toISOString(),
                }).eq('id', item.id).neq('status', 'completed')
              } else {
                await supabase.from('engagement_order_items').update({
                  status: 'processing', updated_at: new Date().toISOString(),
                }).eq('id', item.id).not('status', 'in', '("cancelled","paused","completed")')
              }
            } else {
              await supabase.from('engagement_order_items').update({
                status: 'processing', updated_at: new Date().toISOString(),
              }).eq('id', item.id).not('status', 'in', '("cancelled","paused","completed")')
            }
            skipped++
            console.log(`🛡️ Item ${item.id} delivery reserved — asked=${observed.askedSent}, observed=${observed.observedByRuns}, public_delta=${observed.publicCountDelta}, public_delta_adj=${observed.adjustedPublicCountDelta}, buffer=${observed.publicDeltaBuffer}, target=${orderedQty}. Awaiting live public target.`)
            continue
          }
          const liveRemaining = tracking ? Math.max(1, tracking.remaining) : remaining
          const safeRemaining = Math.max(1, Math.min(remaining, liveRemaining))
          if (run.quantity_to_send > safeRemaining) {
            console.log(`🛡️ Capping run #${run.run_number} qty ${run.quantity_to_send} → ${safeRemaining} (live_remaining=${tracking?.remaining ?? 'n/a'}, asked=${observed.askedSent}, observed=${observed.observedByRuns}, public_delta=${observed.publicCountDelta}, public_delta_adj=${observed.adjustedPublicCountDelta}, buffer=${observed.publicDeltaBuffer}, target=${orderedQty})`)
            await supabase.from('organic_run_schedule').update({
              quantity_to_send: safeRemaining,
            }).eq('id', run.id)
            run.quantity_to_send = safeRemaining
          }
        }
      } catch (capErr) {
        console.error('Over-delivery guard error:', capErr)
      }

      if (!item.service) {
        // FALLBACK: Try bundle
        const bundleId = item.engagement_order?.bundle_id
        if (bundleId) {
          const { data: bundleItem } = await supabase
            .from('bundle_items')
            .select('service_id, service:services(*)')
            .eq('bundle_id', bundleId)
            .eq('engagement_type', item.engagement_type)
            .not('service_id', 'is', null)
            .limit(1).single()
          
          if (bundleItem?.service) {
            item.service = bundleItem.service
            await supabase.from('engagement_order_items')
              .update({ service_id: bundleItem.service_id })
              .eq('id', item.id)
          }
        }
        
        if (!item.service) {
          const retryCount = (run.retry_count || 0) + 1
          if (retryCount >= MAX_RUN_RETRIES) {
            await supabase.from('organic_run_schedule').update({
              status: 'failed', error_message: `Service not found after ${MAX_RUN_RETRIES} retries`,
              retry_count: 99,
            }).eq('id', run.id)
            failed++
          } else {
            await supabase.from('organic_run_schedule').update({
              status: 'failed', error_message: 'Service not found - will retry',
              retry_count: retryCount,
            }).eq('id', run.id)
            skipped++
          }
          continue
        }
      }

      // Platform mismatch detection
      const orderLink = item.engagement_order?.link || ''
      const linkPlatform = detectPlatformFromLink(orderLink)
      const servicePlatform = detectPlatformFromService(item.service.name || '')
      
      if (linkPlatform && servicePlatform && linkPlatform !== servicePlatform) {
        await supabase.from('organic_run_schedule').update({
          status: 'failed',
          error_message: `BLOCKED: Platform mismatch - ${linkPlatform} link cannot use ${servicePlatform} service`,
          completed_at: new Date().toISOString(), retry_count: 99,
        }).eq('id', run.id)
        failed++
        continue
      }

      const sameLink = normalizeLink(orderLink)
      const currentServiceId = item.service?.id
      const sameLinkNormalized = sameLink
      const currentTypeNormalized = (currentType || '').toLowerCase().trim()
      const localExecutionKey = `${sameLinkNormalized}|${currentTypeNormalized}`
      
      // Build busy account list
      const busyAccountIds: string[] = []
      
      // From execution-level tracking
      const usedProvidersForKey = executionProviderMap.get(localExecutionKey) || new Set<string>()
      for (const usedId of usedProvidersForKey) {
        if (!busyAccountIds.includes(usedId)) busyAccountIds.push(usedId)
      }
      
      // Do not add old recently-busy providers here; queued runs should still
      // be sent through the provider rotation and get a fresh response.

      // FALLBACK: If this run already failed/cancelled on a provider, exclude it on retry
      // so the system tries a backup provider instead of repeating the same one.
      if (isRetry && run.provider_account_id) {
        if (!busyAccountIds.includes(run.provider_account_id)) {
          busyAccountIds.push(run.provider_account_id)
          console.log(`🔁 Retry run #${run.run_number}: excluding previous provider ${run.provider_account_name || run.provider_account_id} (failed/cancelled), will try backup`)
        }
      }

      // Do NOT permanently exclude provider_response.tried_providers on the next
      // cron tick. Those IDs are only a diagnostic trail from a previous attempt.
      // Treating them as a blacklist makes a run permanently stuck after one
      // round of temporary provider errors like "service inactive/not found".
      // Real unsafe repeats are still blocked below by active same-link orders
      // and by prior cancelled/refunded provider history.

      // IMPORTANT: Do not permanently block a mapped provider because an older
      // sibling run was cancelled/refunded. The user expects queued runs to go
      // through the full admin-priority provider rotation. Same-run retries still
      // skip the just-failed provider above, and live active-order checks below
      // prevent duplicate active orders on the same provider.
      
      // From active (started) runs for same link+type
      const startedRunsForLink = (activeRuns || []).filter((r: any) => {
        const runLink = normalizeLink(r.engagement_order_item?.engagement_order?.link)
        const runType = (r.engagement_order_item?.engagement_type || '').toLowerCase()
        return runLink === sameLink && runType === currentTypeNormalized
      })
      
      // ROUND-ROBIN: Prefer a different provider after a recent completion,
      // but do NOT hard-block the just-used provider.
      // Otherwise next run can get stuck even after the previous one is completed.
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data: recentCompletedRuns } = await supabase
        .from('organic_run_schedule')
        .select('provider_account_id, engagement_order_item:engagement_order_items(engagement_type, engagement_order:engagement_orders(link))')
        .eq('status', 'completed')
        .not('provider_account_id', 'is', null)
        .gte('completed_at', fiveMinAgo)
      
      const recentCompletedAccountIds = new Set<string>()
      if (recentCompletedRuns) {
        for (const rcr of recentCompletedRuns) {
          const rcrLink = normalizeLink(getNestedEngagementOrderLink(rcr.engagement_order_item))
          const rcrType = (rcr.engagement_order_item?.engagement_type || '').toLowerCase()
          if (rcrLink === sameLink && rcrType === currentTypeNormalized && rcr.provider_account_id) {
            recentCompletedAccountIds.add(rcr.provider_account_id)
          }
        }
      }
      
      if (startedRunsForLink && startedRunsForLink.length > 0) {
        for (let stuckRun of startedRunsForLink) {
          // INLINE STATUS REFRESH: don't trust stale DB status — re-poll provider live so we
          // never block the next run just because check-order-status cron hasn't run yet.
          stuckRun = await inlineRefreshRunStatus(supabase, stuckRun)
          // Provider status casing is not consistent (e.g. "Completed",
          // "completed" or values with surrounding spaces). A case-sensitive
          // comparison kept a finished run in busyAccountIds and prevented the
          // next queued run from using an otherwise-free provider.
          const isTerminal = isTerminalProviderStatus(stuckRun.provider_status)
          const hasNoRemains = typeof stuckRun.provider_remains === 'number' && stuckRun.provider_remains <= 0 && !!stuckRun.provider_order_id
          
          const startedAt = new Date(stuckRun.started_at || 0)
          const runAge = Math.round((Date.now() - startedAt.getTime()) / 1000)
          
          if (isTerminal || hasNoRemains) {
            // SCAM GUARD: terminal status but 0 actually delivered → retry instead of complete
            const qty = stuckRun.quantity_to_send || 0
            const remains = typeof stuckRun.provider_remains === 'number' ? stuckRun.provider_remains : null
            const startCount = typeof stuckRun.provider_start_count === 'number' ? stuckRun.provider_start_count : null
            const deliveredZero = !hasNoRemains && remains !== null && qty > 0 && remains >= qty && (startCount === null || startCount === 0)
            const retryCount = stuckRun.retry_count || 0
            if (deliveredZero && retryCount < 15) {
              console.log(`⚠️ Auto-retry run #${stuckRun.run_number}: provider ${stuckRun.provider_status} with 0 delivered`)
              await supabase.from('organic_run_schedule').update({
                status: 'failed', completed_at: new Date().toISOString(),
                error_message: `Auto-retry: provider ${stuckRun.provider_status} with 0 delivered (remains=${remains}/${qty})`,
              }).eq('id', stuckRun.id)
            } else {
              console.log(`🔄 Auto-completing run #${stuckRun.run_number} (${hasNoRemains ? 'no remains left' : `terminal: ${stuckRun.provider_status}`})`)
              await supabase.from('organic_run_schedule').update({
                status: 'completed', completed_at: new Date().toISOString(),
                error_message: hasNoRemains
                  ? `Auto-completed (provider remains reached 0)`
                  : `Auto-completed (status: ${stuckRun.provider_status})`,
              }).eq('id', stuckRun.id)
            }
          } else if (stuckRun.provider_account_id) {
            if (hasUncertainDispatch(stuckRun)) {
              // The provider request may already have been accepted even though
              // we did not receive an order id. Keep this account reserved for
              // the same link+type to avoid a duplicate, but let the queued run
              // rotate immediately to another mapped provider.
              if (!busyAccountIds.includes(stuckRun.provider_account_id)) {
                busyAccountIds.push(stuckRun.provider_account_id)
              }
              console.log(`🛑 Holding run #${stuckRun.run_number}: provider dispatch uncertain, skipping resend until manual/provider confirmation`)
              skipped++
              continue
            }

            if (!stuckRun.provider_order_id && runAge > 60) {
              await supabase.from('organic_run_schedule').update({
                status: 'pending', started_at: null, provider_account_id: null,
                error_message: `Ghost run reverted (no provider order after ${runAge}s)`,
              }).eq('id', stuckRun.id)
              continue
            }
            
            if (!stuckRun.provider_order_id && runAge <= 60) {
              if (!busyAccountIds.includes(stuckRun.provider_account_id)) {
                busyAccountIds.push(stuckRun.provider_account_id)
              }
              continue
            }
            
            if (!busyAccountIds.includes(stuckRun.provider_account_id)) {
              busyAccountIds.push(stuckRun.provider_account_id)
            }
          }
        }
      }

      // Do not globally block this link+type just because one provider has an
      // active delivery. That provider is already present in busyAccountIds,
      // so rotation can safely continue to the next mapped provider. The
      // per-provider guard below still prevents duplicate active orders on the
      // same provider, while allowing concurrency up to the mapped-provider count.

      // ==========================================
      // OPTIMIZED: Use cached mapping lookup
      // ==========================================
      let availableAccounts = await mappingCache.getForService(
        supabase, item.service.id, busyAccountIds, executionId
      )
      // Never re-add accounts that are actively processing this same link+type.
      // Doing so defeated rotation and could select the same provider again while
      // another mapped provider was free. The next cron tick will re-check live
      // statuses and release an account as soon as its active run is terminal.
      
      // STRICT MAPPING MODE — no automatic default-provider fallback.
      // Only providers explicitly mapped via service_provider_mapping for this
      // service are eligible. If admin hasn't mapped any, the run is postponed
      // until a mapping is configured (prevents accidental routing to a service's
      // legacy default provider_id).
      
      // STRICT ADMIN PRIORITY: always try providers in the exact sort_order
      // configured in Admin → Service Provider Mapping. Priority 1 first,
      // then 2, 3, ... — no re-sorting based on "recent completions" or
      // "unhealthy names" so admin's ordering is fully respected.
      const accountsToTry: ProviderCandidate[] = [...availableAccounts]
      accountsToTry.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999))
      
      if (accountsToTry.length === 0) {
        if (mappingCache.hasConfiguredMappingForService(item.service.id)) {
          // Keep the original user-selected schedule. A busy provider is temporary,
          // so this due run must be reconsidered on every scheduler tick rather than
          // being moved into the future (which looked like an auto-reschedule in UI).
          await supabase.from('organic_run_schedule').update({
            error_message: `[Queued] All providers currently busy for this link`,
            last_status_check: new Date().toISOString(),
          }).eq('id', run.id)
          skipped++
          console.log(`⏳ Run #${run.run_number} remains due (all providers pre-filtered as busy); retrying next tick`)
          results.push({ run_id: run.id, run_number: run.run_number, type: item.engagement_type,
            success: false, skipped: true, reason: `All providers busy - retrying next tick` })
        } else {
          // No mapping configured for this service — postpone (don't fail) so that
          // as soon as admin maps a provider in Service → Provider Mapping, the
          // run picks up automatically on the next cron tick.
          const postponeMs = 5 * 60 * 1000
          const newScheduledAt = new Date(Date.now() + postponeMs).toISOString()
          await supabase.from('organic_run_schedule').update({
            scheduled_at: newScheduledAt,
            error_message: '[Waiting] No provider mapped for this service — add a mapping in Admin → Service Provider Mapping',
            last_status_check: new Date().toISOString(),
          }).eq('id', run.id)
          skipped++
          console.log(`⏸️ Run #${run.run_number} waiting — no provider mapping configured for service ${item.service.id}`)
          results.push({ run_id: run.id, run_number: run.run_number, type: item.engagement_type,
            success: false, skipped: true, reason: 'No provider mapping configured' })
        }
        continue
      }

      // Quantity handling — pick the LOWEST-min provider first so small runs aren't rejected.
      // If every provider minimum is still above the scheduled qty, merge with future
      // pending runs of the same item so shares/saves do not get stuck forever.
      const originalQty = run.quantity_to_send
      let effectiveQty = originalQty
      // Push providers whose min > qty to the end, but PRESERVE admin priority
      // (sort_order) among the ones that fit. JS Array.sort is stable, so
      // returning 0 for same-fit pairs keeps the earlier admin-priority order.
      accountsToTry.sort((a, b) => {
        const aFits = (a.minQuantity || 0) <= effectiveQty ? 0 : 1
        const bFits = (b.minQuantity || 0) <= effectiveQty ? 0 : 1
        return aFits - bFits
      })
      const smallestAccountMin = accountsToTry.reduce((min, entry) => {
        const candidateMin = Number(entry.minQuantity || 0)
        if (candidateMin <= 0) return min
        if (min <= 0) return candidateMin
        return Math.min(min, candidateMin)
      }, 0)
      let quantityToSend = effectiveQty

      if (smallestAccountMin > 0 && effectiveQty < smallestAccountMin) {
        const { data: futurePendingRuns } = await supabase
          .from('organic_run_schedule')
          .select('id, run_number, quantity_to_send')
          .eq('engagement_order_item_id', item.id)
          .eq('status', 'pending')
          .gt('run_number', run.run_number)
          .order('run_number', { ascending: true })

        let combinedQty = effectiveQty
        const runsToMerge: string[] = []
        for (const pendingRun of futurePendingRuns || []) {
          combinedQty += Number(pendingRun.quantity_to_send || 0)
          runsToMerge.push(pendingRun.id)
          if (combinedQty >= smallestAccountMin) break
        }

        if (combinedQty >= smallestAccountMin && runsToMerge.length > 0) {
          await supabase.from('organic_run_schedule').update({
            quantity_to_send: combinedQty,
            base_quantity: combinedQty,
            error_message: `Merged ${runsToMerge.length + 1} runs to meet provider min ${smallestAccountMin}`,
            last_status_check: new Date().toISOString(),
          }).eq('id', run.id)

          await supabase.from('organic_run_schedule').update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error_message: `Merged into run #${run.run_number} to meet provider min ${smallestAccountMin}`,
            last_status_check: new Date().toISOString(),
          }).in('id', runsToMerge)

          effectiveQty = combinedQty
          quantityToSend = combinedQty
          run.quantity_to_send = combinedQty
          run.base_quantity = combinedQty
          accountsToTry.sort((a, b) => {
            const aFits = (a.minQuantity || 0) <= effectiveQty ? 0 : 1
            const bFits = (b.minQuantity || 0) <= effectiveQty ? 0 : 1
            return aFits - bFits
          })
          console.log(`🧩 Run #${run.run_number} merged to ${combinedQty} for ${item.engagement_type} to satisfy provider min ${smallestAccountMin}`)
        } else {
          // No future runs available to merge — boost to provider minimum to unblock.
          // Small over-delivery (a few extra likes/shares) is acceptable vs. stuck forever.
          effectiveQty = smallestAccountMin
          quantityToSend = smallestAccountMin
          run.quantity_to_send = smallestAccountMin
          run.base_quantity = smallestAccountMin
          accountsToTry.sort((a, b) => {
            const aFits = (a.minQuantity || 0) <= effectiveQty ? 0 : 1
            const bFits = (b.minQuantity || 0) <= effectiveQty ? 0 : 1
            return aFits - bFits
          })
          console.log(`⬆️ Run #${run.run_number} boosted from ${originalQty} to provider min ${smallestAccountMin} (no future runs to merge)`)
        }
      }

      console.log(`🔄 Run #${run.run_number}: ${effectiveQty} ${item.engagement_type}, trying ${accountsToTry.length} accounts`)

      const currentStatus = isRetry ? 'failed' : 'pending'
      let runClaimed = false
      const triedProviderIds: string[] = []

      // Try each account
      let success = false
      let lastError: string | null = null
      let providerOrderId: string | null = null
      let providerResult: any = null
      let successAccount: ProviderAccount | null = null
      let verifiedStatus: string | null = null
      let verifiedRemains: number | null = null
      let verifiedStartCount: number | null = null
      let verifiedCharge: number | null = null
      let verifiedLastStatusCheck: string | null = null
      
      for (const { account: selectedAccount, providerServiceId, minQuantity: accountMinQty } of accountsToTry) {
        // NEVER boost quantity above what was scheduled — that causes over-delivery
        // (e.g. scheduled 112 views but provider min is 500 → user sees 500+ delivered).
        // Instead, skip providers whose min exceeds the scheduled qty and try the next one.
        if (accountMinQty && accountMinQty > effectiveQty) {
          lastError = `Provider ${selectedAccount.name} min ${accountMinQty} > scheduled ${effectiveQty}, skipping to avoid over-delivery`
          console.log(`⏭️ ${lastError}`)
          continue
        }
        quantityToSend = effectiveQty
        // PRE-CHECK: Cancel check
        {
          const { data: freshItem } = await supabase
            .from('engagement_order_items')
            .select('status, engagement_order:engagement_orders(status)')
            .eq('id', item.id).maybeSingle()
          
          const freshOrderStatus = (freshItem as any)?.engagement_order?.status
          const freshItemStatus = freshItem?.status
          
          if (freshOrderStatus === 'cancelled' || freshItemStatus === 'cancelled') {
            await supabase.from('organic_run_schedule').update({
              status: 'cancelled', error_message: 'Cancelled before provider send',
              completed_at: new Date().toISOString(),
            }).eq('id', run.id)
            skipped++
            break
          }
        }

        // Balance check
        const { hasBalance, balance: providerBalance } = await checkProviderBalance(selectedAccount)
        if (!hasBalance) {
          lastError = `Provider ${selectedAccount.name} has no balance`
          continue
        }
        const estimatedCost = quantityToSend * 0.0001
        if (providerBalance >= 0 && providerBalance < estimatedCost) {
          lastError = `Provider ${selectedAccount.name} balance too low (${providerBalance})`
          continue
        }

        if (!isValidHttpUrl(selectedAccount.api_url)) {
          lastError = `Provider ${selectedAccount.name} has invalid API URL`
          continue
        }
        
        triedProviderIds.push(selectedAccount.id)

        // ==========================================
        // STRICT GUARD (per-provider): The SAME provider account cannot have
        // two active orders on the same (link + engagement type). Other
        // providers are free to take this run — rotation continues normally.
        // Only when the currently-selected provider already has an active
        // order for this link+type (status='started' without terminal
        // provider status, OR provider_status is Pending / In progress /
        // Processing) do we skip THIS provider and try the next one.
        // ==========================================
        {
          const lookbackIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: priorRuns } = await supabase
            .from('organic_run_schedule')
            .select('id, status, provider_status, provider_order_id, provider_account_id, provider_account_name, started_at, engagement_order_item:engagement_order_items(engagement_type, engagement_order:engagement_orders(link))')
            .not('provider_order_id', 'is', null)
            .eq('provider_account_id', selectedAccount.id)
            .gte('started_at', lookbackIso)
            .order('started_at', { ascending: false })
            .limit(100)

          const conflictingRun = (priorRuns || []).find((pr: any) => {
            if (pr.id === run.id) return false
            if (pr.provider_account_id !== selectedAccount.id) return false
            const localStatus = (pr.status || '').toLowerCase().trim()
            if (['completed', 'failed', 'cancelled', 'canceled', 'partial'].includes(localStatus)) return false
            const prLink = normalizeLink(getNestedEngagementOrderLink(pr.engagement_order_item))
            const prType = (pr.engagement_order_item?.engagement_type || '').toLowerCase().trim()
            if (prLink !== sameLink || prType !== currentTypeNormalized) return false
            if (pr.status === 'started' && !isTerminalProviderStatus(pr.provider_status)) return true
            if (isActiveProviderStatus(pr.provider_status)) return true
            return false
          })

          if (conflictingRun) {
            // Mark this provider as busy for this run and try the next provider.
            if (!busyAccountIds.includes(selectedAccount.id)) {
              busyAccountIds.push(selectedAccount.id)
            }
            lastError = `${selectedAccount.name} already has an active order on this link+${currentTypeNormalized} — trying next provider`
            console.log(`↪️ Run #${run.run_number}: ${selectedAccount.name} busy on same link+type, rotating to next provider`)
            continue
          }
        }

        if (!runClaimed) {
          const { error: claimError, locked: lockAcquired } = await claimRunLock({
            supabase,
            runId: run.id,
            expectedStatus: currentStatus,
            updates: {
              status: 'started',
              started_at: new Date().toISOString(),
              error_message: `Trying ${selectedAccount.name}...`,
              retry_count: (run.retry_count || 0) + (isRetry ? 1 : 0),
              provider_order_id: null,
              provider_status: null,
              provider_response: null,
              provider_account_id: selectedAccount.id,
              provider_account_name: selectedAccount.name,
              last_status_check: new Date().toISOString(),
            },
          })

          if (claimError) {
            // The DB reservation may be won by another scheduler invocation
            // between our pre-check and this claim. Never call the provider in
            // that case; rotate this run to its next mapped provider instead.
            if (claimError.code === '23505' || (claimError.message || '').includes('uniq_active_rotation_lock')) {
              console.log(`🔒 Run #${run.run_number}: ${selectedAccount.name} reserved concurrently for same link+type; trying next provider`)
              lastError = `${selectedAccount.name} reserved concurrently — trying next provider`
              continue
            }
            console.error(`❌ Failed to claim run lock for ${run.id}:`, claimError)
            lastError = `Run claim failed: ${claimError.message || 'unknown error'}`
            break
          }

          if (!lockAcquired) {
            console.log(`⏭️ Run #${run.run_number} already claimed by another execution, skipping duplicate send`)
            skipped++
            lastError = null
            break
          }

          runClaimed = true
        } else {
          await supabase.from('organic_run_schedule').update({
            error_message: `Trying ${selectedAccount.name}...`,
            provider_account_id: selectedAccount.id,
            provider_account_name: selectedAccount.name,
            provider_order_id: null,
            provider_status: null,
            provider_response: null,
            last_status_check: new Date().toISOString(),
          }).eq('id', run.id).eq('status', 'started')
        }

        try {
          const formData = new URLSearchParams()
          formData.append('key', selectedAccount.api_key)
          formData.append('action', 'add')
          formData.append('service', providerServiceId)
          formData.append('link', sanitizeProviderLink(item.engagement_order.link))
          // OVER-DELIVERY GUARD: if admin configured this provider to over-deliver (e.g. 2.0 = sends 2x),
          // divide the scheduled qty so the user's video ultimately receives the correct amount.
          const deliveryMultiplier = Math.max(Number(selectedAccount.delivery_multiplier || 1), 0.5)
          let adjustedQty = quantityToSend
          if (deliveryMultiplier > 1) {
            adjustedQty = Math.max(1, Math.round(quantityToSend / deliveryMultiplier))
            console.log(`📉 Over-delivery guard: ${selectedAccount.name} multiplier=${deliveryMultiplier}, sending ${adjustedQty} instead of ${quantityToSend}`)
          }
          // Respect provider min even after dividing
          if (accountMinQty && adjustedQty < accountMinQty) {
            adjustedQty = accountMinQty
          }
          formData.append('quantity', adjustedQty.toString())

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          const response = await fetch(selectedAccount.api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            signal: controller.signal,
          })

          clearTimeout(timeoutId)
          const responseText = await response.text()
          console.log(`Provider response from ${selectedAccount.name}: ${responseText}`)

          let result
          try { result = JSON.parse(responseText) } catch { result = { error: responseText } }

          if (result.status === 'fail' || result.error) {
            lastError = result.message || result.error
            if (lastError === null || lastError === undefined) lastError = 'Unknown provider error'
            if (typeof lastError !== 'string') lastError = JSON.stringify(lastError)
            providerResult = result
            
            const isActiveOrderError = isActiveOrderErrorMsg(lastError)
            if (isActiveOrderError) {
              await new Promise(resolve => setTimeout(resolve, 200))
              continue
            }
            
            const isTemporaryError = TEMPORARY_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
            if (isTemporaryError) {
              await new Promise(resolve => setTimeout(resolve, 200))
              continue
            }
            
            const isAccountSpecificError = ACCOUNT_SPECIFIC_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
            if (isAccountSpecificError) {
              await new Promise(resolve => setTimeout(resolve, 200))
              continue
            }
            
            const isTryNextProviderError = TRY_NEXT_PROVIDER_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
            if (isTryNextProviderError) {
              await new Promise(resolve => setTimeout(resolve, 200))
              continue
            }
            
            break
          } else {
            providerOrderId = result.order?.toString() || result.id?.toString() || null

            if (!providerOrderId) {
              lastError = 'Provider returned success but no order id'
              providerResult = result
              continue
            }

            // Immediate live-count verification: capture provider start/remains as soon
            // as the run is created so target = first_start_count + ordered_quantity
            // is enforced before the next scheduled run is allowed through.
            verifiedStatus = 'Pending'
            providerResult = { add: result }
            try {
              const statusForm = new URLSearchParams()
              statusForm.append('key', selectedAccount.api_key)
              statusForm.append('action', 'status')
              statusForm.append('order', providerOrderId)
              const statusCtrl = new AbortController()
              const statusTimer = setTimeout(() => statusCtrl.abort(), 8000)
              const statusResponse = await fetch(selectedAccount.api_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: statusForm.toString(),
                signal: statusCtrl.signal,
              })
              clearTimeout(statusTimer)
              const statusText = await statusResponse.text()
              let statusResult: any = {}
              try { statusResult = JSON.parse(statusText) } catch { statusResult = { error: statusText } }
              if (!statusResult.error) {
                verifiedStatus = statusResult.status || verifiedStatus
                const remainsValue = statusResult.remains !== undefined && statusResult.remains !== null
                  ? Number(statusResult.remains)
                  : null
                const startValue = statusResult.start_count !== undefined && statusResult.start_count !== null
                  ? Number(statusResult.start_count)
                  : null
                const chargeValue = statusResult.charge !== undefined && statusResult.charge !== null
                  ? Number(statusResult.charge)
                  : null
                verifiedRemains = Number.isFinite(remainsValue) ? remainsValue : null
                verifiedStartCount = Number.isFinite(startValue) ? startValue : null
                verifiedCharge = Number.isFinite(chargeValue) ? chargeValue : null
                verifiedLastStatusCheck = new Date().toISOString()
                providerResult = { add: result, initial_status: statusResult }
              } else {
                providerResult = { add: result, initial_status_error: statusResult.error }
              }
            } catch (statusError) {
              providerResult = { add: result, initial_status_error: (statusError as Error).message || 'Status check failed' }
            }
            successAccount = selectedAccount
            success = true
            await updateAccountLastUsed(supabase, selectedAccount.id)
            console.log(`✅ Run #${run.run_number} placed via ${selectedAccount.name}! Order ID: ${providerOrderId} (initial live count checked)`)
            break
          }
        } catch (fetchError: any) {
          const uncertainDispatchAt = new Date().toISOString()
          const uncertainMessage = `Network error after provider request. [Dispatch uncertain] Verify provider before retrying: ${fetchError.message || 'Unknown'}`

          await supabase.from('organic_run_schedule').update({
            status: 'started',
            started_at: run.started_at || uncertainDispatchAt,
            completed_at: null,
            error_message: uncertainMessage,
            provider_response: {
              uncertain_dispatch: true,
              stage: 'provider_add_request',
              fetch_error: fetchError.message || 'Unknown',
              happened_at: uncertainDispatchAt,
            },
            last_status_check: uncertainDispatchAt,
          }).eq('id', run.id).eq('status', 'started')

          lastError = null
          console.error(`🚨 Dispatch uncertain for run #${run.run_number}; resend blocked to avoid duplicate provider order`, fetchError)
          skipped++
          break
        }
      }

      // Update run based on result
      if (success && providerOrderId && successAccount) {
        const { data: freshItemPostSend } = await supabase
          .from('engagement_order_items')
          .select('status, engagement_order:engagement_orders(status)')
          .eq('id', item.id).maybeSingle()
        
        const postSendOrderStatus = (freshItemPostSend as any)?.engagement_order?.status
        const postSendItemStatus = freshItemPostSend?.status
        
        if (postSendOrderStatus === 'cancelled' || postSendItemStatus === 'cancelled') {
          await supabase.from('organic_run_schedule').update({
            status: 'cancelled', provider_order_id: providerOrderId,
            provider_response: providerResult,
            provider_account_id: successAccount.id, provider_account_name: successAccount.name,
            provider_status: verifiedStatus,
            error_message: `Order cancelled during send — provider order ${providerOrderId} may need manual cancellation`,
            completed_at: new Date().toISOString(), last_status_check: new Date().toISOString(),
          }).eq('id', run.id)
          skipped++
          continue
        }
        
        // Update run + item + order in parallel
        const providerDeliveredAll = verifiedRemains === 0 && !isFailedProviderStatus(verifiedStatus)
        const providerIsTerminal = isTerminalProviderStatus(verifiedStatus) || providerDeliveredAll

        const updatePromises = [
          supabase.from('organic_run_schedule').update({
            provider_order_id: providerOrderId, provider_response: providerResult,
            error_message: null, provider_account_id: successAccount.id,
            provider_account_name: successAccount.name, provider_status: verifiedStatus,
            provider_start_count: verifiedStartCount, provider_remains: verifiedRemains,
            provider_charge: verifiedCharge,
            ...(providerIsTerminal
              ? {
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  ...(providerDeliveredAll && !isTerminalProviderStatus(verifiedStatus)
                    ? { error_message: 'Auto-completed (provider remains reached 0)' }
                    : {}),
                }
              : {}),
            last_status_check: verifiedLastStatusCheck || new Date().toISOString(),
          }).eq('id', run.id).eq('status', 'started').select('id'),
          supabase.from('engagement_order_items').update({ status: 'processing' })
            .eq('id', item.id).not('status', 'in', '("cancelled","paused")'),
          supabase.from('engagement_orders').update({ status: 'processing' })
            .eq('id', item.engagement_order_id).not('status', 'in', '("cancelled","paused")'),
        ]
        
        const [runUpdateResult] = await Promise.all(updatePromises)
        
        if (!runUpdateResult.data || runUpdateResult.data.length === 0) {
          skipped++
          continue
        }

        if (!executionProviderMap.has(localExecutionKey)) {
          executionProviderMap.set(localExecutionKey, new Set())
        }
        executionProviderMap.get(localExecutionKey)!.add(successAccount.id)

        processed++
        results.push({ 
          run_id: run.id, type: item.engagement_type, run_number: run.run_number,
          success: true, provider_order_id: providerOrderId,
          account_used: successAccount.name, accounts_tried: accountsToTry.length,
          status: providerIsTerminal ? 'completed' : 'started',
        })

        await syncEngagementItemTracking(supabase, item.id)
        await updateEngagementOrderStatus(supabase, item.engagement_order_id, item.id)
      } else if (lastError !== null) {
        const retryCount = (run.retry_count || 0) + 1
        
        await supabase.from('organic_run_schedule').update({
          status: 'pending', started_at: null,
          error_message: `[Auto-retry #${retryCount}] All ${accountsToTry.length} accounts busy: ${lastError}`,
          provider_response: {
            ...(providerResult || {}),
            tried_providers: triedProviderIds,
          },
          provider_account_id: null,
          provider_account_name: null,
          provider_order_id: null,
          provider_status: null,
          retry_count: retryCount, last_status_check: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++

        // NOTE: Batch-postponing siblings was removed — each run should get its
        // own chance on every cron tick. If all providers are truly busy for
        // this link+type, that run is postponed individually above and the
        // next tick will re-evaluate provider availability.
        results.push({ run_id: run.id, type: item.engagement_type, run_number: run.run_number, 
          success: false, error: lastError, will_retry: true, retry_attempt: retryCount, retry_next_tick: true })
      }

      // Minimal delay between runs for max throughput
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // ==========================================
    // STEP 2: Process LEGACY ORDER runs
    // ==========================================
    console.log(`\n--- Processing Legacy Order Runs ---`)
    
    const { data: legacyRuns } = await supabase
      .from('organic_run_schedule')
      .select(`*, order:orders(*, service:services(*))`)
      .eq('status', 'pending')
      .lte('scheduled_at', nowWithBuffer)
      .not('order_id', 'is', null)
      .is('engagement_order_item_id', null)
      .order('scheduled_at', { ascending: true })
      .limit(10)

    console.log(`Found ${legacyRuns?.length || 0} pending legacy runs`)

    for (const run of legacyRuns || []) {
      if (Date.now() - startTime > 55000) {
        shouldContinue = true
        continuationReason = continuationReason || 'legacy-time-slice-exhausted'
        console.log(`⏰ Approaching timeout, stopping legacy processing.`)
        break
      }

      const order = run.order
      if (!order || !order.service) continue

      if (order.status === 'cancelled') {
        await supabase.from('organic_run_schedule').update({
          status: 'cancelled', error_message: 'Order cancelled by user',
          completed_at: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++
        continue
      }
      
      if (order.status === 'paused') { skipped++; continue }

      const startedRunsForOrder = (activeRuns || []).filter((r: any) => r.order_id === order.id)

      if (startedRunsForOrder && startedRunsForOrder.length > 0) {
        const stuckRun = startedRunsForOrder[0]
        // Keep legacy rotation consistent with engagement orders: providers use
        // inconsistent casing/spacing for terminal statuses. Normalize it so a
        // completed provider slot is released instead of blocking queued runs.
        const isTerminal = isTerminalProviderStatus(stuckRun.provider_status)
        const startedAt = new Date(stuckRun.started_at || 0)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
        const isStuckWithoutStatus = startedAt < twoMinutesAgo && !stuckRun.provider_status
        const isInProgressTooLong = startedAt < twoMinutesAgo && stuckRun.provider_status === 'In progress'
        const isPendingTooLong = startedAt < twoMinutesAgo && stuckRun.provider_status === 'Pending'
        
        if (isTerminal || isStuckWithoutStatus || isInProgressTooLong || isPendingTooLong) {
          // SCAM GUARD: detect 0-delivered fake completions and retry instead
          const qty = stuckRun.quantity_to_send || 0
          const remains = typeof stuckRun.provider_remains === 'number' ? stuckRun.provider_remains : null
          const startCount = typeof stuckRun.provider_start_count === 'number' ? stuckRun.provider_start_count : null
          const deliveredZero = remains !== null && qty > 0 && remains >= qty && (startCount === null || startCount === 0)
          const retryCount = stuckRun.retry_count || 0
          if (deliveredZero && !isTerminal && retryCount < 15) {
            await supabase.from('organic_run_schedule').update({
              status: 'failed', completed_at: new Date().toISOString(),
              error_message: `Auto-retry: provider ${stuckRun.provider_status || 'unknown'} with 0 delivered (remains=${remains}/${qty})`,
            }).eq('id', stuckRun.id)
          } else {
            await supabase.from('organic_run_schedule').update({
              status: 'completed', completed_at: new Date().toISOString(),
              error_message: `Auto-completed (status: ${stuckRun.provider_status || 'unknown'})`,
            }).eq('id', stuckRun.id)
          }
        } else {
          if (hasUncertainDispatch(stuckRun)) {
            skipped++
            continue
          }

          const runAge = Math.round((Date.now() - startedAt.getTime()) / 1000)
          if (runAge < 60) { skipped++; continue }
        }
      }

      // STRICT MAPPING — legacy orders must also respect service_provider_mapping
      // when configured. If no mapping is configured, postpone (so admin can add one).
      const mappedAccountsLegacy = await mappingCache.getForService(
        supabase, order.service.id, [], executionId
      )
      const hasLegacyMapping = mappingCache.hasConfiguredMappingForService(order.service.id)

      let legacyProvidersToTry: Array<{ provider: any; providerServiceId: string }> = []

      if (hasLegacyMapping) {
        if (mappedAccountsLegacy.length === 0) {
          await supabase.from('organic_run_schedule').update({
            error_message: '[Queued] All mapped providers currently busy for this link',
            last_status_check: new Date().toISOString(),
          }).eq('id', run.id)
          skipped++
          continue
        }
        // Try every mapped account in strict admin priority order. Previously
        // legacy runs selected only mappedAccountsLegacy[0], so an active-link
        // or inactive-service error on priority 1 incorrectly queued the run
        // even while lower-priority providers were available.
        legacyProvidersToTry = mappedAccountsLegacy
          .sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999))
          .map((candidate) => ({
            provider: {
              id: candidate.account.id,
              provider_id: candidate.account.provider_id,
              name: candidate.account.name,
              api_key: candidate.account.api_key,
              api_url: candidate.account.api_url,
            },
            providerServiceId: candidate.providerServiceId,
          }))
      } else {
        // No mapping configured — wait until admin maps a provider in
        // Admin → Service Provider Mapping. Do NOT fall back to service.provider_id.
        const postponeMs = 5 * 60 * 1000
        await supabase.from('organic_run_schedule').update({
          scheduled_at: new Date(Date.now() + postponeMs).toISOString(),
          error_message: '[Waiting] No provider mapped for this service — add a mapping in Admin → Service Provider Mapping',
          last_status_check: new Date().toISOString(),
        }).eq('id', run.id)
        skipped++
        continue
      }

      if (legacyProvidersToTry.length === 0) {
        await supabase.from('organic_run_schedule').update({
          status: 'failed', error_message: 'No valid mapped provider is available',
        }).eq('id', run.id)
        failed++
        continue
      }

      const { error: updateError, locked: lockAcquired } = await claimRunLock({
        supabase,
        runId: run.id,
        expectedStatus: 'pending',
        updates: { status: 'started', started_at: new Date().toISOString() },
      })

      if (updateError) continue
      if (!lockAcquired) {
        skipped++
        continue
      }

      let lastError: string | null = null
      let providerOrderId: string | null = null
      let successfulLegacyProvider: any = null

      for (const { provider, providerServiceId } of legacyProvidersToTry) {
        if (!isValidHttpUrl(provider.api_url)) {
          lastError = `${provider.name}: invalid API URL`
          continue
        }

        console.log(`🔄 Legacy run #${run.run_number}: trying ${provider.name}`)
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
          const formData = new URLSearchParams()
          formData.append('key', provider.api_key)
          formData.append('action', 'add')
          formData.append('service', providerServiceId || order.service.provider_service_id)
          formData.append('link', sanitizeProviderLink(order.link))
          formData.append('quantity', run.quantity_to_send.toString())

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)
          const response = await fetch(provider.api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(), signal: controller.signal,
          })
          clearTimeout(timeoutId)
          const result = await response.json().catch(() => ({ error: 'Invalid response' }))

          if (result.status === 'fail' || result.error) {
            lastError = result.message || result.error
            if (typeof lastError !== 'string') lastError = JSON.stringify(lastError)
            console.log(`↪️ Legacy provider ${provider.name} rejected run #${run.run_number}: ${lastError}`)
            const shouldRotate = isActiveOrderErrorMsg(lastError!)
              || ACCOUNT_SPECIFIC_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
              || TRY_NEXT_PROVIDER_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
            if (shouldRotate) break
            const isTemporaryError = TEMPORARY_ERRORS.some(err => lastError!.toLowerCase().includes(err.toLowerCase()))
            if (isTemporaryError) break
            if (attempt < MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt))
              retried++; continue
            }
          } else {
            providerOrderId = result.order?.toString() || result.id?.toString()
            successfulLegacyProvider = provider
            break
          }
          } catch (fetchError: any) {
          const uncertainDispatchAt = new Date().toISOString()
          await supabase.from('organic_run_schedule').update({
            status: 'started',
            started_at: run.started_at || uncertainDispatchAt,
            completed_at: null,
            error_message: `Network error after provider request. [Dispatch uncertain] Verify provider before retrying: ${fetchError.message || 'Unknown'}`,
            provider_response: {
              uncertain_dispatch: true,
              stage: 'provider_add_request',
              fetch_error: fetchError.message || 'Unknown',
              happened_at: uncertainDispatchAt,
            },
          }).eq('id', run.id).eq('status', 'started')

          lastError = null
          skipped++
          break
          }
        }
        if (providerOrderId || lastError === null) break
      }

      if (providerOrderId) {
        await supabase.from('organic_run_schedule').update({
          provider_order_id: providerOrderId,
          provider_account_id: successfulLegacyProvider?.id || null,
          provider_account_name: successfulLegacyProvider?.name || null,
          error_message: null,
        }).eq('id', run.id)
        await supabase.from('orders').update({ status: 'processing' }).eq('id', order.id)
        processed++
      } else {
        const shouldRetry = Boolean(lastError)
        if (shouldRetry) {
          const cleanError = lastError || 'All mapped providers unavailable'
          await supabase.from('organic_run_schedule').update({
            status: 'pending', started_at: null,
            error_message: `[Will retry] All ${legacyProvidersToTry.length} mapped providers tried: ${cleanError}`,
          }).eq('id', run.id)
          skipped++
        } else {
          await supabase.from('organic_run_schedule').update({
            status: 'failed', error_message: lastError || 'Failed after retries',
          }).eq('id', run.id)
          failed++
        }
      }
    }

    const totalTime = Date.now() - startTime

    if (shouldContinue) {
      await triggerContinuation(executionId, continuationReason || 'time-slice-exhausted')
    }

    console.log(`\n=== EXECUTION COMPLETE [${executionId}] in ${totalTime}ms ===`)
    console.log(`Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}, Retried: ${retried}`)

    // Send admin alert if failures
    if (failed > 0) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-admin-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
          body: JSON.stringify({
            job_name: 'execute-all-runs', execution_id: executionId,
            failed_count: failed, processed_count: processed, skipped_count: skipped,
            error_details: results.filter(r => !r.success).slice(0, 10).map(r => ({
              run_id: r.run_id, run_number: r.run_number, type: r.type, error: r.error
            }))
          })
        })
      } catch (alertError) {
        console.error('Failed to send admin alert:', alertError)
      }
    }

    console.log(`✅ Background execution [${executionId}] complete: ${processed} processed, ${skipped} skipped, ${failed} failed`)

  } catch (error: any) {
    console.error(`❌ Background execution error:`, error)
  }
}
