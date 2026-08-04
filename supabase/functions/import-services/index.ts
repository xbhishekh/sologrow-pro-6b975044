import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProviderService {
  service: string
  name: string
  type: string
  rate: string
  min: string
  max: string
  dripfeed?: boolean
  refill?: boolean
  cancel?: boolean
  category?: string
  desc?: string
}

// Transform a provider service to our format
function transformService(s: ProviderService, provider_id: string, markup_percent: number, categoryOverride?: string) {
  const baseRate = parseFloat(s.rate) || 0
  const markedUpRate = baseRate * (1 + markup_percent / 100)

  let speed = 'medium'
  const nameLower = s.name.toLowerCase()
  if (nameLower.includes('instant') || nameLower.includes('fast')) {
    speed = 'instant'
  } else if (nameLower.includes('slow') || nameLower.includes('gradual')) {
    speed = 'slow'
  }

  let quality = 'standard'
  if (nameLower.includes('premium') || nameLower.includes('hq') || nameLower.includes('high quality')) {
    quality = 'premium'
  } else if (nameLower.includes('real') || nameLower.includes('active')) {
    quality = 'high'
  }

  // Use category override if provided (from bundle auto-import)
  let category = categoryOverride || s.category || s.type || 'Other'

  // Only auto-detect category if no override provided
  if (!categoryOverride) {
    const catLower = category.toLowerCase()

    if (catLower.includes('instagram')) {
      if (nameLower.includes('followers')) category = 'Instagram Followers'
      else if (nameLower.includes('like')) category = 'Instagram Likes'
      else if (nameLower.includes('view')) category = 'Instagram Views'
      else if (nameLower.includes('comment')) category = 'Instagram Comments'
      else category = 'Instagram'
    } else if (catLower.includes('tiktok')) {
      if (nameLower.includes('followers')) category = 'TikTok Followers'
      else if (nameLower.includes('like')) category = 'TikTok Likes'
      else if (nameLower.includes('view')) category = 'TikTok Views'
      else category = 'TikTok'
    } else if (catLower.includes('youtube')) {
      if (nameLower.includes('subscriber')) category = 'YouTube Subscribers'
      else if (nameLower.includes('view')) category = 'YouTube Views'
      else if (nameLower.includes('like')) category = 'YouTube Likes'
      else category = 'YouTube'
    } else if (catLower.includes('twitter') || catLower.includes('x ')) {
      category = 'Twitter/X'
    } else if (catLower.includes('facebook')) {
      category = 'Facebook'
    }
  }

  return {
    provider_id,
    provider_service_id: s.service.toString(),
    name: s.name,
    category,
    description: s.desc || null,
    price: Number(markedUpRate.toFixed(5)),
    min_quantity: parseInt(s.min) || 10,
    max_quantity: parseInt(s.max) || 100000,
    speed,
    quality,
    drip_feed_enabled: s.dripfeed === true,
    is_active: true,
    refill: s.refill ? 'Yes' : 'No',
    cancel_allowed: s.cancel ? 'Yes' : 'No',
  }
}

// Convert provider currency to USD
function convertRateToUSD(rate: string, providerCurrency: string, exchangeRates: Record<string, number>): number {
  const baseRate = parseFloat(rate) || 0;
  const fromUpper = providerCurrency.toUpperCase();
  if (fromUpper === 'USD') return baseRate;

  const fromRate = exchangeRates[fromUpper] || (fromUpper === 'INR' ? 90 : 1);
  return baseRate / fromRate;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isAdmin = (roleRows || []).some((r: { role: string }) => r.role === 'admin')

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const {
      provider_id,
      markup_percent = 30,
      action = 'fetch', // 'fetch' = get list, 'import' = import specific services
      service_ids = [],  // Array of service IDs to import
      search_query = '',  // Search query for filtering
      category_override = '', // Override category for auto-import from bundles (e.g., "Instagram Saves")
      provider_account_id = null // optional: use this specific account's credentials
    } = await req.json()

    if (!provider_id) {
      return new Response(JSON.stringify({ error: 'Provider ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Action: ${action}, Provider: ${provider_id}`)

    // Build ALL candidate credentials for this provider (accounts first, then providers row).
    // Different accounts of the same provider can expose different service catalogs / keys,
    // so we try each one until the requested service IDs are found.
    type Cred = { accountId: string | null; name: string; apiKey: string; apiUrl: string }
    const creds: Cred[] = []

    const { data: accounts } = await supabase
      .from('provider_accounts')
      .select('id, name, api_key, api_url, priority, is_active')
      .eq('provider_id', provider_id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    for (const a of accounts || []) {
      if (!a.api_key || !a.api_url) continue
      if (provider_account_id && a.id !== provider_account_id) continue
      creds.push({ accountId: a.id, name: a.name || provider_id, apiKey: a.api_key, apiUrl: a.api_url })
    }

    const { data: provider } = await supabase
      .from('providers')
      .select('*')
      .eq('id', provider_id)
      .maybeSingle()

    if (provider?.api_key && provider?.api_url &&
        !creds.some(c => c.apiKey === provider.api_key && c.apiUrl === provider.api_url)) {
      creds.push({ accountId: null, name: provider.name || provider_id, apiKey: provider.api_key, apiUrl: provider.api_url })
    }

    // Ensure providers row exists so the services FK constraint is satisfied
    if (!provider && creds[0]) {
      await supabase
        .from('providers')
        .upsert({
          id: provider_id,
          name: creds[0].name,
          api_key: creds[0].apiKey,
          api_url: creds[0].apiUrl,
          is_active: true,
        }, { onConflict: 'id' })
      console.log(`Auto-created provider entry for: ${provider_id}`)
    }

    if (creds.length === 0) {
      return new Response(JSON.stringify({ error: `Provider not found: ${provider_id}. Check providers or provider_accounts table.` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the service catalog from one credential set
    async function fetchCatalog(cred: Cred): Promise<{ list: ProviderService[] | null; err: string }> {
      try {
        const formData = new URLSearchParams()
        formData.append('key', cred.apiKey)
        formData.append('action', 'services')

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 25000)
        const response = await fetch(cred.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          return { list: null, err: `${cred.name}: HTTP ${response.status}` }
        }
        const raw = await response.json()
        if (!Array.isArray(raw)) {
          return { list: null, err: `${cred.name}: ${raw?.error || 'invalid response format'}` }
        }
        return { list: raw as ProviderService[], err: '' }
      } catch (e) {
        return { list: null, err: `${cred.name}: ${(e as Error).message}` }
      }
    }

    const wantedIds: string[] = (service_ids || []).map((x: unknown) => String(x).trim()).filter(Boolean)

    let servicesData: ProviderService[] | null = null
    let usedCred: Cred = creds[0]
    const fetchErrors: string[] = []

    for (const cred of creds) {
      const { list, err } = await fetchCatalog(cred)
      if (!list) { fetchErrors.push(err); continue }
      console.log(`Received ${list.length} services from ${cred.name}`)
      servicesData = list
      usedCred = cred
      // For import, keep trying other accounts until the requested IDs exist in the catalog
      if (action === 'import' && wantedIds.length > 0) {
        const idSet = new Set(list.map(s => String(s.service)))
        if (wantedIds.some(id => idSet.has(id))) break
        fetchErrors.push(`${cred.name}: service ${wantedIds.join(', ')} not in catalog (${list.length} services)`)
        continue
      }
      break
    }

    if (!servicesData) {
      return new Response(JSON.stringify({
        error: `Provider API error: ${fetchErrors.join(' | ') || 'no catalog returned'}`
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const apiKey = usedCred.apiKey
    const apiUrl = usedCred.apiUrl

    // 1. Fetch exchange rates
    let exchangeRates: Record<string, number> = { USD: 1, INR: 90, EUR: 0.92, GBP: 0.79, AED: 3.67 };
    try {
      const extReq = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-exchange-rates`);
      if (extReq.ok) {
        const ratesData = await extReq.json();
        if (ratesData.rates) exchangeRates = ratesData.rates;
      }
    } catch (e) {
      console.error("Failed to fetch exchange rates, using fallbacks:", e);
    }

    // 2. Fetch unique provider currency
    const DEFAULT_PROVIDER_CURRENCY = Deno.env.get("PROVIDER_CURRENCY") || 'INR';
    let providerCurrency = DEFAULT_PROVIDER_CURRENCY;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const balResponse = await fetch(`${apiUrl}?key=${apiKey}&action=balance`, { signal: controller.signal });
      clearTimeout(timeout);
      if (balResponse.ok) {
        const data = await balResponse.json();
        if (data.currency) providerCurrency = data.currency;
      }
    } catch (e) {
      console.error("Failed to detect provider currency, using default");
    }

    // Process all rates into USD
    for (const s of servicesData) {
      s.rate = convertRateToUSD(s.rate, providerCurrency, exchangeRates).toString();
    }

    // ACTION: FETCH - Return list of services for selection
    if (action === 'fetch') {
      let filtered = servicesData

      // Apply search filter
      if (search_query) {
        const query = search_query.toLowerCase()
        filtered = servicesData.filter(s =>
          s.service.toString().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          (s.category && s.category.toLowerCase().includes(query))
        )
      }

      // Return first 100 results (paginated)
      const results = filtered.slice(0, 100).map(s => ({
        service_id: s.service.toString(),
        name: s.name,
        category: s.category || s.type || 'Other',
        rate: parseFloat(s.rate) || 0,
        min: parseInt(s.min) || 10,
        max: parseInt(s.max) || 100000,
        dripfeed: s.dripfeed || false,
        refill: s.refill || false,
      }))

      return new Response(JSON.stringify({
        success: true,
        total: servicesData.length,
        filtered: filtered.length,
        services: results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ACTION: IMPORT - Import specific services by ID
    if (action === 'import') {
      if (!service_ids || service_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'No services selected' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Filter to only selected services (string-normalised compare)
      const wanted = new Set(wantedIds)
      const selectedServices = servicesData.filter(s => wanted.has(String(s.service).trim()))

      if (selectedServices.length === 0) {
        const sample = servicesData.slice(0, 5).map(s => String(s.service)).join(', ')
        return new Response(JSON.stringify({
          error: `Service ID ${wantedIds.join(', ')} not found in ${provider_id} catalog (${servicesData.length} services checked across ${creds.length} account(s)). Example IDs: ${sample}`,
          details: fetchErrors.length ? fetchErrors : undefined
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Transform and insert - use category_override if provided
      const servicesToInsert = selectedServices.map(s =>
        transformService(s, provider_id, markup_percent, category_override || undefined)
      )

      let imported = 0
      let updated = 0
      const errors: string[] = []

      for (const service of servicesToInsert) {
        // Check if exists
        const { data: existing } = await supabase
          .from('services')
          .select('id')
          .eq('provider_id', provider_id)
          .eq('provider_service_id', service.provider_service_id)
          .maybeSingle()
        if (existing) {
          const { error } = await supabase
            .from('services')
            .update(service)
            .eq('id', existing.id)

          if (error) {
            errors.push(`Update ${service.name}: ${error.message}`)
          } else {
            updated++

            // Auto-link in mapping table (prefer the account whose catalog matched)
            const linkAccountId = usedCred.accountId || accounts?.[0]?.id
            if (linkAccountId) {
              await supabase.from('service_provider_mapping').upsert({
                service_id: existing.id,
                provider_account_id: linkAccountId,
                provider_service_id: service.provider_service_id,
                sort_order: 1,
                is_active: true
              }, { onConflict: 'service_id,provider_account_id' })
            }
          }
        } else {
          const { data: inserted, error } = await supabase
            .from('services')
            .insert(service)
            .select('id')
            .single()

          if (error) {
            errors.push(`Insert ${service.name}: ${error.message}`)
          } else {
            imported++

            // Auto-link in mapping table (prefer the account whose catalog matched)
            const linkAccountId = usedCred.accountId || accounts?.[0]?.id
            if (inserted && linkAccountId) {
              await supabase.from('service_provider_mapping').upsert({
                service_id: inserted.id,
                provider_account_id: linkAccountId,
                provider_service_id: service.provider_service_id,
                sort_order: 1,
                is_active: true
              }, { onConflict: 'service_id,provider_account_id' })
            }
          }
        }
      }

      console.log(`Import complete: ${imported} new, ${updated} updated`)

      return new Response(JSON.stringify({
        success: true,
        imported,
        updated,
        total: servicesToInsert.length,
        errors: errors.length > 0 ? errors : undefined
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ACTION: IMPORT_ALL - Import all services (bulk)
    if (action === 'import_all') {
      // Delete existing services from this provider
      await supabase.from('services').delete().eq('provider_id', provider_id)

      const servicesToInsert = servicesData.map(s =>
        transformService(s, provider_id, markup_percent)
      )

      // Batch insert
      const BATCH_SIZE = 500
      let imported = 0

      for (let i = 0; i < servicesToInsert.length; i += BATCH_SIZE) {
        const batch = servicesToInsert.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('services').insert(batch)

        if (!error) {
          imported += batch.length
        }
      }

      return new Response(JSON.stringify({
        success: true,
        imported,
        total: servicesToInsert.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Import error:', error)
    return new Response(JSON.stringify({
      error: (error as Error).message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
