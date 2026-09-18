/* PLANEA — quién puede abrir /planea/admin.
 *
 *   node verticals/planea/scripts/planea-admins.cjs                 lista los administradores
 *   node verticals/planea/scripts/planea-admins.cjs --grant 9 18    concede por ID de cuenta
 *   node verticals/planea/scripts/planea-admins.cjs --revoke 18     quita
 *
 * El permiso va por ID de una cuenta de Planea que YA existe, nunca por un correo escrito
 * en una lista. La persona entra con su mismo usuario y contraseña de Planea.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });
const { Sequelize } = require('sequelize');
const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
const sq = new Sequelize(url, { dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false });
const T = Number(process.env.PLANEA_TENANT_ID) || 1;
const args = process.argv.slice(2);
const mode = args[0] === '--grant' ? 'grant' : args[0] === '--revoke' ? 'revoke' : 'list';
const ids = args.slice(1).map(Number).filter((n) => Number.isInteger(n) && n > 0);

(async () => {
  await sq.query(`CREATE TABLE IF NOT EXISTS planea_admins (
    id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
    granted_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_admins_user ON planea_admins (tenant_id, user_id)');
  if (mode !== 'list' && !ids.length) { console.error('Indica uno o más IDs de cuenta.'); process.exit(1); }
  for (const id of ids) {
    const [[u]] = await sq.query('SELECT id, email FROM planea_users WHERE id = :id', { replacements: { id } });
    if (!u) { console.error('No existe la cuenta ' + id + '; no se concede nada.'); process.exitCode = 1; continue; }
    if (mode === 'grant') await sq.query("INSERT INTO planea_admins (tenant_id, user_id, granted_by) VALUES (:t, :u, 'script') ON CONFLICT DO NOTHING", { replacements: { t: T, u: id } });
    else await sq.query('DELETE FROM planea_admins WHERE tenant_id = :t AND user_id = :u', { replacements: { t: T, u: id } });
    console.log((mode === 'grant' ? 'Concedido: ' : 'Quitado: ') + u.id + ' ' + u.email);
  }
  const [rows] = await sq.query('SELECT a.user_id, u.email, u.full_name, a.granted_by, a.created_at FROM planea_admins a JOIN planea_users u ON u.id = a.user_id WHERE a.tenant_id = :t ORDER BY a.user_id', { replacements: { t: T } });
  console.log('\nAdministradores (tenant ' + T + '):');
  rows.forEach((r) => console.log('  ' + r.user_id + '  ' + r.email + '  ' + (r.full_name || '')));
  await sq.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
