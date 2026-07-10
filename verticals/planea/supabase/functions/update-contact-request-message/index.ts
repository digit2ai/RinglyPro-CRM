import { createClient } from 'npm:@supabase/supabase-js@2'

type SupabaseKeys = Record<string, string>
type ContactRequestMessageStatus = 'pending' | 'read' | 'archived'

const VALID_STATUSES = new Set<ContactRequestMessageStatus>([
  'pending',
  'read',
  'archived'
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
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

  if (token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) {
    return null
  }

  return token
}

function isContactRequestMessageStatus(
  value: unknown
): value is ContactRequestMessageStatus {
  return (
    typeof value === 'string' &&
    VALID_STATUSES.has(value as ContactRequestMessageStatus)
  )
}

async function readJsonBody(req: Request) {
  try {
    return await req.json()
  } catch {
    return null
  }
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

  if (req.method !== 'PATCH') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!(await isAuthenticated(req))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')?.trim()

    if (!id) {
      return jsonResponse({ error: 'id query parameter is required' }, 400)
    }

    const body = await readJsonBody(req)

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { status } = body as { status?: unknown }

    if (!isContactRequestMessageStatus(status)) {
      return jsonResponse(
        {
          error: 'Invalid status',
          allowedValues: [...VALID_STATUSES]
        },
        400
      )
    }

    const { data, error } = await adminClient
      .from('contact_request_messages')
      .update({ status })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw error

    if (data === null) {
      return jsonResponse({ error: 'Message not found' }, 404)
    }

    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'

    return jsonResponse({ error: message }, 500)
  }
})
