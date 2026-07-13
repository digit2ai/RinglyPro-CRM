// PLANEA — confirm a user's email (admin), for when Supabase email confirmation is
// ON but no SMTP is delivering the confirmation mail.
//
// The permanent fix is to turn OFF "Confirm email" in the Supabase dashboard
// (Authentication → Sign In / Providers → Email), or configure SMTP. This script is
// the stopgap to unblock accounts that already signed up and are stuck on
// "Email not confirmed".
//
// Usage (needs the service_role key from Supabase → Project Settings → API):
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/confirm-user.mjs someone@email.com
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/confirm-user.mjs --all      // confirm every unconfirmed user
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/confirm-user.mjs --list     // list unconfirmed users

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PLANEA_SERVICE_ROLE_KEY || ''
const arg = process.argv[2]

if (!KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase → Project Settings → API → service_role.')
  process.exit(1)
}
if (!arg) {
  console.error('Usage: node scripts/confirm-user.mjs <email> | --all | --list')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function allUsers() {
  const users = []
  let page = 1
  // paginate through all users
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    users.push(...(data.users || []))
    if (!data.users || data.users.length < 200) break
    page++
  }
  return users
}

function isUnconfirmed(u) { return !u.email_confirmed_at && !u.confirmed_at }

async function main() {
  const users = await allUsers()

  if (arg === '--list') {
    const pend = users.filter(isUnconfirmed)
    console.log(pend.length + ' usuario(s) sin confirmar:')
    pend.forEach((u) => console.log('  - ' + u.email + '  (creado ' + u.created_at + ')'))
    return
  }

  let targets
  if (arg === '--all') {
    targets = users.filter(isUnconfirmed)
  } else {
    const u = users.find((x) => (x.email || '').toLowerCase() === arg.toLowerCase())
    if (!u) { console.error('No existe una cuenta con el correo: ' + arg); process.exit(1) }
    targets = [u]
  }

  if (!targets.length) { console.log('No hay usuarios por confirmar.'); return }

  for (const u of targets) {
    const { error } = await admin.auth.admin.updateUserById(u.id, { email_confirm: true })
    if (error) console.log('✗ ' + u.email + ' — ' + error.message)
    else console.log('✓ ' + u.email + ' confirmado. Ya puede iniciar sesión.')
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
