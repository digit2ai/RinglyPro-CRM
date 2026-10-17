'use strict';
/**
 * Device keys — the credential on ISTC's board.
 *
 * ONE DIRECTION ONLY. A device key may WRITE readings and read NOTHING back.
 * This is the key that ships on hardware, gets flashed into firmware, and ends
 * up in a logic-analyser capture on somebody's bench; it must be worth nothing
 * to whoever finds it beyond the ability to post readings for one pet.
 *
 * Stored as SHA-256. The plaintext is shown exactly once, at mint time, and
 * there is no endpoint that can return it again.
 */
const crypto = require('crypto');
const dbm = require('./db');

const PREFIX = 'mp_dev_';

function mintPlaintext() {
  return PREFIX + crypto.randomBytes(24).toString('base64url');
}
function hash(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

async function create({ tenant_id, account_id, pet_id, label, hardware_id }) {
  const key = mintPlaintext();
  const rows = await dbm.run(
    `INSERT INTO mp_devices (tenant_id, account_id, pet_id, label, hardware_id, key_hash, key_prefix)
     VALUES (:tenant_id, :account_id, :pet_id, :label, :hardware_id, :key_hash, :key_prefix)
     RETURNING id, label, pet_id, key_prefix, created_at`,
    {
      tenant_id, account_id,
      pet_id: pet_id == null ? null : pet_id,
      label: String(label || 'Collar').slice(0, 80),
      hardware_id: hardware_id ? String(hardware_id).slice(0, 120) : null,
      key_hash: hash(key),
      key_prefix: key.slice(0, 12)
    }
  );
  await dbm.event(tenant_id, account_id, 'device.created', { device_id: rows[0].id });
  // `key` is returned to this one response and never stored in plaintext.
  return { device: rows[0], key };
}

/** Resolve a presented key to its device, or null. Revoked keys resolve to null. */
async function authenticate(presented) {
  if (!presented || typeof presented !== 'string' || !presented.startsWith(PREFIX)) return null;
  const row = await dbm.one(
    `SELECT id, tenant_id, account_id, pet_id, label, revoked_at
       FROM mp_devices WHERE key_hash = :h`,
    { h: hash(presented) }
  );
  if (!row || row.revoked_at) return null;
  return row;
}

async function touch(device_id) {
  try {
    await dbm.run('UPDATE mp_devices SET last_seen_at = NOW() WHERE id = :id', { id: device_id });
  } catch (_) { /* a last-seen write must never fail an ingest */ }
}

async function list({ tenant_id }) {
  return dbm.q(
    `SELECT d.id, d.label, d.pet_id, d.hardware_id, d.firmware, d.key_prefix,
            d.created_at, d.last_seen_at, d.revoked_at, p.name AS pet_name
       FROM mp_devices d
       LEFT JOIN mp_pets p ON p.id = d.pet_id AND p.tenant_id = d.tenant_id
      WHERE d.tenant_id = :tenant_id
      ORDER BY d.created_at DESC`,
    { tenant_id }
  );
}

async function revoke({ tenant_id, id }) {
  const rows = await dbm.run(
    `UPDATE mp_devices SET revoked_at = NOW()
      WHERE tenant_id = :tenant_id AND id = :id AND revoked_at IS NULL
      RETURNING id`,
    { tenant_id, id }
  );
  return rows.length > 0;
}

module.exports = { PREFIX, hash, create, authenticate, touch, list, revoke };
