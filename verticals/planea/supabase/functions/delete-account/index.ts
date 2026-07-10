import { createClient } from 'npm:@supabase/supabase-js@2'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getSupabaseKey(envName: string, keyName = 'default'): string {
  const raw  = getRequiredEnv(envName)
  const keys = JSON.parse(raw) as Record<string, string>
  const key  = keys[keyName]
  if (!key) throw new Error(`Missing key "${keyName}" in ${envName}`)
  return key
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  const match      = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token      = match?.[1]
  if (!token) return null
  if (token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) return null
  return token
}

// ── Supabase clients ──────────────────────────────────────────────────────────

const supabaseUrl            = getRequiredEnv('SUPABASE_URL')
const supabasePublishableKey = getSupabaseKey('SUPABASE_PUBLISHABLE_KEYS')
const supabaseSecretKey      = getSupabaseKey('SUPABASE_SECRET_KEYS')

const authClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const jwt = getBearerToken(req)
  if (jwt === null) return jsonResponse({ error: 'Unauthorized' }, 401)

  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt)
  if (claimsError !== null || typeof claimsData?.claims?.sub !== 'string') {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userId = claimsData.claims.sub

  const { error } = await adminClient.auth.admin.deleteUser(userId, true)

  if (error !== null) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ success: true })
})
