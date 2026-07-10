import { createClient } from 'npm:@supabase/supabase-js@2'

type SupabaseKeys = Record<string, string>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type'
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  })
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

function getSupabaseKey(envName: string, keyName = 'default') {
  const raw = getRequiredEnv(envName)
  const keys = JSON.parse(raw) as SupabaseKeys
  const key = keys[keyName]

  if (!key) {
    throw new Error(`Missing key "${keyName}" in ${envName}`)
  }

  return key
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization')
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]

  if (!token) return null

  // New Supabase API keys are not user JWTs.
  if (token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) {
    return null
  }

  return token
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, max)
}

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&').replace(/[(),]/g, ' ')
}

const supabaseUrl = getRequiredEnv('SUPABASE_URL')
const supabasePublishableKey = getSupabaseKey('SUPABASE_PUBLISHABLE_KEYS')
const supabaseSecretKey = getSupabaseKey('SUPABASE_SECRET_KEYS')

const authClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
})

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
})

async function isAuthenticated(req: Request) {
  const jwt = getBearerToken(req)

  if (!jwt) return false

  const { data, error } = await authClient.auth.getClaims(jwt)

  if (error) return false

  return typeof data?.claims?.sub === 'string' && data.claims.sub.length > 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!(await isAuthenticated(req))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const url = new URL(req.url)

    const page = parsePositiveInt(url.searchParams.get('page'), 1, 10_000)
    const limit = parsePositiveInt(url.searchParams.get('limit'), 20, 100)
    const status = url.searchParams.get('status')?.trim()
    const q = url.searchParams.get('q')?.trim().slice(0, 200)

    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = adminClient
      .from('contact_request_messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) {
      query = query.eq('status', status)
    }

    if (q) {
      const search = escapeIlike(q)

      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,message.ilike.%${search}%`
      )
    }

    const { data, error, count } = await query

    if (error) throw error

    const total = count ?? 0

    return jsonResponse({
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'

    return jsonResponse({ error: message }, 500)
  }
})
