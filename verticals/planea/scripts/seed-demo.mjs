// PLANEA — demo account seeder.
// Creates (or reuses) a demo user in the live Supabase project and populates it
// with the business-requirements mockup data so the app can be shown to a client
// with realistic test data. Idempotent: re-running upserts the same account.
//
// Two ways to run:
//   A) Anon (self-service): cd verticals/planea && node scripts/seed-demo.mjs
//      Works ONLY if the hosted Supabase project has email confirmation OFF, or the
//      demo user has already been confirmed in the dashboard.
//   B) Admin (recommended): SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
//      Uses admin.createUser({ email_confirm:true }) so no inbox is needed, and seeds
//      with the service role (bypasses RLS). Get the key from the Supabase dashboard →
//      Project Settings → API → service_role. Do NOT commit it.
// Creds are printed at the end.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co'
const SUPABASE_KEY = 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PLANEA_SERVICE_ROLE_KEY || ''

const DEMO_EMAIL = process.env.PLANEA_DEMO_EMAIL || 'cliente.demo@planea.co'
const DEMO_PASSWORD = process.env.PLANEA_DEMO_PASSWORD || 'PlaneaDemo2026!'
const DEMO_NAME = 'Eduardo López'

// ── Mockup data (from portal-planea-*.html) ────────────────────────────────
const scoreData = {
  score: 97,
  timestamp: '2026-07-13T12:00:00.000Z',
  company: null,
  scenario: 'I',            // sin deuda cara, fondo completo → usuario sólido
  source: 'survey',
  pillars: { emergency_fund: 95, cash_flow: 98, debt_health: 96, stability: 92 },
  answers: { P1: 'D', P2: 'C', P3: 'none', P4: 'D', P5: 'fixed', P6: '1', P7: 'save' },
}

// Meta mensual activa = Fondo de emergencia al 62% (pantalla Inicio)
const progressData = {
  pillar: 'emergency_fund',
  status: 'active',
  valor_inicio: 45,
  goal_text: 'Completa tu fondo de emergencia: 6 meses de gastos esenciales.',
  hito_1_points: 55, hito_2_points: 62, hito_3_points: 78, hito_4_points: 95,
  hito_1_date: '2026-07-01', hito_2_date: '2026-07-08', hito_3_date: '2026-07-15', hito_4_date: '2026-07-22',
  created_at: '2026-07-01T00:00:00.000Z',
  fecha_completada: null,
  next_goal_at: null,
}

const now = '2026-07-13T12:00:00.000Z'
const assets = [
  { name: 'Liquidez',                 type: 'savings_account', value: 12000000 },
  { name: 'Ahorro (CDT y fondos)',    type: 'term_deposit',    value: 18000000 },
  { name: 'Inversiones',              type: 'investments',     value: 22000000 },
  { name: 'Sociedades',               type: 'business',        value: 15000000 },
  { name: 'Vivienda',                 type: 'housing',         value: 55000000 },
  { name: 'Vehículos',                type: 'vehicle',         value: 9000000 },
  { name: 'Activos no financieros',   type: 'other',           value: 4000000 },
].map((a, i) => ({ id: i + 1, name: a.name, type: a.type, value: a.value, created_at: now }))

const liabilities = [
  { name: 'Hipoteca',            type: 'mortgage',      value: 25000000 },
  { name: 'Crédito de consumo',  type: 'consumer_loan', value: 7600000 },
  { name: 'Tarjeta de crédito',  type: 'credit_card',   value: 2400000 },
].map((l, i) => ({ id: i + 1, name: l.name, type: l.type, value: l.value, created_at: now }))

const longTermGoals = [
  { name: 'Cuota inicial de apartamento', type: 'house',     target_amount: 60000000,  current_savings: 28000000, monthly_saving: 2000000 },
  { name: 'Europa 2027',                  type: 'trip',      target_amount: 15000000,  current_savings: 4500000,  monthly_saving: 750000 },
  { name: 'Pensión voluntaria (retiro)',  type: 'other',     target_amount: 200000000, current_savings: 12000000, monthly_saving: 900000 },
  { name: 'Maestría',                     type: 'education', target_amount: 30000000,  current_savings: 9000000,  monthly_saving: 1000000 },
]

// ── Seed ────────────────────────────────────────────────────────────────────
function log(...a) { console.log(...a) }

// Admin path: create+confirm the user and return an RLS-bypassing client.
async function adminSetup() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Find existing user by email, else create one (email pre-confirmed).
  let userId = null
  const list = await admin.auth.admin.listUsers()
  const existing = list.data?.users?.find((u) => u.email === DEMO_EMAIL)
  if (existing) {
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, email_confirm: true })
    log('• existing demo user confirmed (admin)')
  } else {
    const created = await admin.auth.admin.createUser({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
      user_metadata: { full_name: DEMO_NAME, score_data: scoreData },
    })
    if (created.error) throw new Error('admin.createUser: ' + created.error.message)
    userId = created.data.user.id
    log('• demo user created + confirmed (admin)')
  }
  return { client: admin, userId }
}

// Anon path: sign up / sign in as the user (needs confirmations OFF or a confirmed user).
async function anonSetup() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signUp = await supabase.auth.signUp({
    email: DEMO_EMAIL, password: DEMO_PASSWORD,
    options: { data: { full_name: DEMO_NAME, score_data: scoreData } },
  })
  if (signUp.data?.session) { log('• demo user created'); return { client: supabase, userId: signUp.data.session.user.id } }
  const signIn = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
  if (signIn.data?.session) { log('• existing demo user, signed in'); return { client: supabase, userId: signIn.data.session.user.id } }
  throw new Error(
    'Could not obtain a session: ' + (signIn.error?.message || 'unknown') +
    '\n   → The hosted project requires email confirmation. Re-run with SUPABASE_SERVICE_ROLE_KEY=... ' +
    'OR confirm the demo user in the Supabase dashboard (Authentication → Users), OR turn off ' +
    'email confirmations (Authentication → Providers → Email).'
  )
}

async function main() {
  const { client: supabase, userId } = SERVICE_ROLE_KEY ? await adminSetup() : await anonSetup()

  // persons: ensure name + score + progress are set (row exists via trigger).
  const upd = await supabase
    .from('persons')
    .update({ full_name: DEMO_NAME, score_data: scoreData, progress_data: progressData })
    .eq('user_id', userId)
    .select('id')
    .single()
  if (upd.error) throw new Error('persons update: ' + upd.error.message)
  const personId = upd.data.id
  log('• persons updated (personId=' + personId + ', score=97 Planeado)')

  // patrimony: upsert the single row (assets 135M / liabilities 35M → neto 100M).
  const pat = await supabase
    .from('persons_patrimony')
    .upsert({ person_id: personId, assets_data: assets, liabilities_data: liabilities }, { onConflict: 'person_id' })
  if (pat.error) throw new Error('patrimony upsert: ' + pat.error.message)
  log('• patrimony seeded (activos $135M, pasivos $35M, neto $100M)')

  // long-term goals: clear + reinsert for idempotency.
  await supabase.from('persons_long_term_goals').delete().eq('person_id', personId)
  const g = await supabase
    .from('persons_long_term_goals')
    .insert(longTermGoals.map((x) => ({ ...x, person_id: personId })))
  if (g.error) throw new Error('long_term_goals insert: ' + g.error.message)
  log('• ' + longTermGoals.length + ' metas de largo plazo sembradas')

  log('\n✅ Demo listo. Credenciales para mostrar al cliente:')
  log('   URL:      https://aiagent.ringlypro.com/planea/')
  log('   Email:    ' + DEMO_EMAIL)
  log('   Password: ' + DEMO_PASSWORD)
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
