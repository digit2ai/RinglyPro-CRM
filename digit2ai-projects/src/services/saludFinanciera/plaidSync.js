'use strict';
/**
 * Bank of America -> Plaid -> Salud Financiera. READ-ONLY: this file reads from
 * Plaid and writes only to our own sf_* tables. Nothing is ever written to the bank.
 *
 * Rules (deterministic, no model anywhere in this file):
 * - /transactions/sync pages are ALL fetched first, then applied in ONE DB
 *   transaction together with the new cursor (Plaid's own rule).
 * - Every bank transaction is kept in sf_plaid_txn (all accounts, all dates).
 *   Only accounts marked `incluir` and dates >= importar_desde become rows in
 *   sf_movimientos, so two years of history never distorts the balance.
 * - Order of matching for a new bank transaction:
 *     1. a PENDING plan row with the same type and amount within +-5 days
 *        -> marked cumplido with monto_real = bank amount (logged in sf_cambios, undoable)
 *     2. an unlinked MANUAL real row, same type and amount within +-3 days -> linked
 *     3. otherwise a new real row, fuente='plaid'
 * - pending -> posted: the posted transaction carries pending_transaction_id;
 *   the stored pending row is re-keyed in place, so the movement keeps its id,
 *   its links and any category the owner set.
 * - removed: a 'nuevo' movement is deleted, a plan match goes back to pendiente,
 *   a manual match is just unlinked.
 * - A movement the owner deleted by hand is never re-created by a re-sync.
 */
const plaid = require('./plaidClient');
const { categoria, claveComercio } = require('./plaidCategorias');

const SYNC_OPTS = { personal_finance_category_version: 'v2' };

function userOf(item) { return { userId: item.user_id, tenantId: item.tenant_id }; }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// pg parses a DATE as LOCAL midnight, so read it back with local components
function toISO(v) { return v instanceof Date ? v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0') : String(v || '').slice(0, 10); }
function money(c) { return '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ---------------- items / accounts (never selects the token for callers) ----------------
async function items(sequelize, user) {
  const [rows] = await sequelize.query(`SELECT id, item_id, institution_id, institution_name, estado, importar_desde::text AS importar_desde, consent_expira, historial_completo, recurrencia, ultimo_sync, ultimo_error, created_at
    FROM sf_plaid_items WHERE user_id = :u AND tenant_id = :t ORDER BY id`, { replacements: { u: user.userId, t: user.tenantId } });
  const [accts] = await sequelize.query('SELECT id, item_id, account_id, nombre, mask, tipo, subtipo, incluir FROM sf_plaid_accounts WHERE user_id = :u AND tenant_id = :t ORDER BY id',
    { replacements: { u: user.userId, t: user.tenantId } });
  return rows.map(r => ({ ...r, cuentas: accts.filter(a => a.item_id === r.item_id).map(a => ({ id: a.id, nombre: a.nombre, mask: a.mask, tipo: a.tipo, subtipo: a.subtipo, incluir: a.incluir })) }));
}
async function itemWithToken(sequelize, where, rep) {
  const [rows] = await sequelize.query(`SELECT * FROM sf_plaid_items WHERE ${where} LIMIT 1`, { replacements: rep });
  return rows[0] || null;
}

async function addAlerta(sequelize, user, tipo, ref, texto, transaction) {
  await sequelize.query(`INSERT INTO sf_alertas (tenant_id, user_id, tipo, ref, texto) VALUES (:t, :u, :tipo, :ref, :texto)
    ON CONFLICT (user_id, tipo, ref) WHERE ref IS NOT NULL DO NOTHING`,
    { replacements: { t: user.tenantId, u: user.userId, tipo, ref: ref == null ? null : String(ref).slice(0, 200), texto: String(texto).slice(0, 500) }, transaction });
}

async function loadAccounts(sequelize, item) {
  const user = userOf(item);
  const r = await plaid.call('/accounts/get', {}, { accessTokenEnc: item.access_token_enc });
  for (const a of r.accounts || []) {
    await sequelize.query(`INSERT INTO sf_plaid_accounts (tenant_id, user_id, item_id, account_id, nombre, mask, tipo, subtipo, incluir)
      VALUES (:t, :u, :item, :acct, :nombre, :mask, :tipo, :subtipo, :incluir)
      ON CONFLICT (account_id) DO UPDATE SET nombre = EXCLUDED.nombre, mask = EXCLUDED.mask, tipo = EXCLUDED.tipo, subtipo = EXCLUDED.subtipo`,
      { replacements: { t: user.tenantId, u: user.userId, item: item.item_id, acct: a.account_id, nombre: a.official_name || a.name || null, mask: a.mask || null,
        tipo: a.type || null, subtipo: a.subtype || null,
        // owner decision 2026-10-26: only CHECKING counts by default (the card is already paid as "Corte")
        incluir: a.type === 'depository' && a.subtype === 'checking' } });
  }
  return (r.accounts || []).length;
}

async function refreshItemInfo(sequelize, item) {
  const user = userOf(item);
  const r = await plaid.call('/item/get', {}, { accessTokenEnc: item.access_token_enc });
  const it = (r && r.item) || {};
  const exp = it.consent_expiration_time || null;
  await sequelize.query('UPDATE sf_plaid_items SET consent_expira = :exp, institution_id = COALESCE(:inst, institution_id), updated_at = NOW() WHERE id = :id',
    { replacements: { exp, inst: it.institution_id || null, id: item.id } });
  if (exp && Date.parse(exp) - Date.now() < 30 * 864e5) {
    await addAlerta(sequelize, user, 'reconectar', 'consent:' + String(exp).slice(0, 10),
      `El permiso de ${item.institution_name || 'tu banco'} vence el ${String(exp).slice(0, 10)}. Pulsa "Reconectar" para renovarlo por 12 meses.`);
  }
  return exp;
}

/** connect: public_token -> access_token (server side only), store encrypted, load accounts. */
async function connect(sequelize, user, publicToken, institution, today, opts = {}) {
  const ex = await plaid.call('/item/public_token/exchange', { public_token: String(publicToken) });
  if (!ex || !ex.access_token || !ex.item_id) throw new Error('Plaid no devolvió el acceso');
  const enc = plaid.encrypt(ex.access_token);
  const [[plan]] = await sequelize.query("SELECT MIN(fecha)::text AS f FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND origen = 'plan'", { replacements: { u: user.userId, t: user.tenantId } });
  let desde = plan && plan.f && plan.f < today ? plan.f : today;
  // a re-connection is a NEW Item with new transaction ids: start the day after the last bank import,
  // or everything already imported would come in a second time
  // an ADDITIONAL login (other accounts, e.g. the business one) starts at the plan start like the first one did
  if (!opts.adicional) {
    const [[last]] = await sequelize.query("SELECT MAX(fecha)::text AS f FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND fuente = 'plaid'", { replacements: { u: user.userId, t: user.tenantId } });
    if (last && last.f && last.f >= desde) desde = addDays(last.f, 1);
  }
  const name = institution && typeof institution.name === 'string' ? institution.name.slice(0, 100) : 'Bank of America';
  const instId = institution && typeof institution.institution_id === 'string' ? institution.institution_id.slice(0, 60) : null;
  const [[row]] = await sequelize.query(`INSERT INTO sf_plaid_items (tenant_id, user_id, item_id, institution_id, institution_name, access_token_enc, importar_desde)
    VALUES (:t, :u, :item, :inst, :name, :enc, :desde)
    ON CONFLICT (item_id) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc, estado = 'activo', ultimo_error = NULL, updated_at = NOW()
    RETURNING *`, { replacements: { t: user.tenantId, u: user.userId, item: ex.item_id, inst: instId, name, enc, desde } });
  await loadAccounts(sequelize, row);
  try { await refreshItemInfo(sequelize, row); } catch (e) { /* consent date is informative */ }
  return { id: row.id, item_id: row.item_id, institution_name: row.institution_name, importar_desde: toISO(row.importar_desde) };
}

// ---------------- sync ----------------
async function fetchAllPages(item) {
  for (let intento = 0; intento < 3; intento++) {
    let cursor = item.cursor || undefined;
    const added = [], modified = [], removed = [];
    let status = null, restart = false;
    for (let guard = 0; guard < 200; guard++) {
      const body = { count: 500, options: SYNC_OPTS };
      if (cursor) body.cursor = cursor;
      let r;
      try { r = await plaid.call('/transactions/sync', body, { accessTokenEnc: item.access_token_enc }); }
      catch (e) { if (e.code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') { restart = true; break; } throw e; }
      added.push(...(r.added || [])); modified.push(...(r.modified || [])); removed.push(...(r.removed || []));
      status = r.transactions_update_status || status;
      cursor = r.next_cursor;
      if (!r.has_more) break;
    }
    if (!restart) return { added, modified, removed, cursor: cursor || item.cursor || null, status };
  }
  throw new Error('Plaid cambió los datos durante la sincronización tres veces seguidas; se reintentará.');
}

function norm(t) {
  const pfc = t.personal_finance_category || {};
  return {
    transaction_id: String(t.transaction_id), account_id: String(t.account_id),
    fecha: toISO(t.date), nombre: t.name || t.merchant_name || 'Movimiento del banco', comercio: t.merchant_name || null,
    monto_cents: Math.round(Number(t.amount) * 100), pending: !!t.pending,
    pending_transaction_id: t.pending_transaction_id || null,
    pfc_primary: pfc.primary || null, pfc_detailed: pfc.detailed || null
  };
}

async function applyChanges(sequelize, item, ch, ctx, transaction) {
  const user = userOf(item);
  const q = (sql, rep) => sequelize.query(sql, { replacements: { u: user.userId, t: user.tenantId, ...rep }, transaction });
  const [acs] = await q('SELECT account_id, incluir FROM sf_plaid_accounts WHERE user_id = :u AND tenant_id = :t AND item_id = :item', { item: item.item_id });
  const incluir = new Map(acs.map(a => [a.account_id, a.incluir]));
  const [rg] = await q('SELECT clave, categoria FROM sf_categoria_reglas WHERE user_id = :u AND tenant_id = :t');
  const reglas = new Map(rg.map(r => [r.clave, r.categoria]));
  const desde = toISO(item.importar_desde);
  const stats = { nuevos: 0, plan: 0, manual: 0, actualizados: 0, eliminados: 0, historial: 0 };

  async function unapply(row) {
    if (!row.mov_id) return;
    if (row.enlace === 'nuevo') await q("DELETE FROM sf_movimientos WHERE id = :id AND user_id = :u AND tenant_id = :t AND fuente = 'plaid'", { id: row.mov_id });
    else if (row.enlace === 'plan') await q("UPDATE sf_movimientos SET estado = 'pendiente', monto_real = NULL, updated_at = NOW() WHERE id = :id AND user_id = :u AND tenant_id = :t AND origen = 'plan'", { id: row.mov_id });
    await q('UPDATE sf_plaid_txn SET mov_id = NULL, enlace = NULL, updated_at = NOW() WHERE id = :id', { id: row.id });
  }

  // Matches a bank transaction to a plan row. A PENDING row becomes cumplido with the bank amount
  // (logged, undoable). A row the owner ALREADY marked paid is only linked, so it is not counted twice.
  async function matchPlan(row, tipo, cents, monto, fecha) {
    const [[plan]] = await q(`SELECT id, concepto, estado, fecha::text AS fecha FROM sf_movimientos m WHERE user_id = :u AND tenant_id = :t AND origen = 'plan'
      AND tipo = :tipo AND fecha BETWEEN :d1 AND :d2
      AND (monto = :monto OR (categoria IN ('salario','servicios','ingreso_extra','corte') AND ABS(monto - :monto) <= monto * 0.02))
      AND NOT EXISTS (SELECT 1 FROM sf_plaid_txn x WHERE x.mov_id = m.id AND x.enlace IN ('plan','cumplido'))
      ORDER BY (estado = 'pendiente') DESC, ABS(monto - :monto), ABS(fecha - CAST(:fecha AS DATE)), id LIMIT 1`, { tipo, monto, d1: addDays(fecha, -5), d2: addDays(fecha, 5), fecha });
    if (!plan) return false;
    if (plan.estado === 'cumplido') {
      await q("UPDATE sf_plaid_txn SET mov_id = :m, enlace = 'cumplido', updated_at = NOW() WHERE id = :id", { m: plan.id, id: row.id });
      stats.plan++;
      return true;
    }
    await q("UPDATE sf_movimientos SET estado = 'cumplido', monto_real = :monto, updated_at = NOW() WHERE id = :id AND user_id = :u AND tenant_id = :t", { monto, id: plan.id });
    await q("INSERT INTO sf_cambios (tenant_id, user_id, accion, descripcion, datos) VALUES (:t, :u, 'cumplido', :d, CAST(:x AS JSONB))",
      { d: `El banco confirmó "${plan.concepto}" del ${plan.fecha} por ${money(cents)}`, x: JSON.stringify({ id: plan.id, antes: { estado: 'pendiente', monto_real: null }, banco: true }) });
    await q("UPDATE sf_plaid_txn SET mov_id = :m, enlace = 'plan', updated_at = NOW() WHERE id = :id", { m: plan.id, id: row.id });
    stats.plan++;
    return true;
  }

  async function reconcile(row) {
    const included = incluir.get(row.account_id) === true && toISO(row.fecha) >= desde && Number(row.monto_cents) !== 0;
    if (!included) { if (row.mov_id) await unapply(row); else stats.historial++; return; }
    const cents = Number(row.monto_cents);
    const tipo = cents > 0 ? 'egreso' : 'ingreso';
    const monto = (Math.abs(cents) / 100).toFixed(2);
    const fecha = toISO(row.fecha);
    if (row.mov_id) {
      const [[mov]] = await q('SELECT id, categoria_manual, pendiente_banco FROM sf_movimientos WHERE id = :id AND user_id = :u AND tenant_id = :t', { id: row.mov_id });
      if (!mov) return; // the owner deleted it: never re-create
      // a pending charge that just POSTED gets one more chance to match the plan (it is now final)
      if (row.enlace === 'nuevo' && mov.pendiente_banco && !row.pending && await matchPlan(row, tipo, cents, monto, fecha)) {
        await q("DELETE FROM sf_movimientos WHERE id = :id AND user_id = :u AND tenant_id = :t AND fuente = 'plaid'", { id: mov.id });
        return;
      }
      if (row.enlace === 'nuevo') {
        const cat = mov.categoria_manual ? null : categoria({ ...row, tipo }, reglas);
        await q(`UPDATE sf_movimientos SET fecha = :fecha, tipo = :tipo, monto = :monto, concepto = :concepto, comercio = :comercio, pendiente_banco = :pend,
          categoria = COALESCE(:cat, categoria), updated_at = NOW() WHERE id = :id AND user_id = :u AND tenant_id = :t`,
          { fecha, tipo, monto, concepto: row.nombre, comercio: row.comercio, pend: !!row.pending, cat, id: mov.id });
      } else if (row.enlace === 'plan') {
        await q("UPDATE sf_movimientos SET monto_real = :monto, updated_at = NOW() WHERE id = :id AND user_id = :u AND tenant_id = :t AND estado = 'cumplido'", { monto, id: mov.id });
      }
      stats.actualizados++;
      return;
    }
    // 1) a plan row: exact amount (salary, bills and other income may vary up to 2%), +-5 days
    if (await matchPlan(row, tipo, cents, monto, fecha)) return;
    // 2) an unlinked manual real row (exact amount, +-3 days)
    const [[man]] = await q(`SELECT id FROM sf_movimientos m WHERE user_id = :u AND tenant_id = :t AND origen = 'real' AND fuente = 'manual'
      AND tipo = :tipo AND monto = :monto AND fecha BETWEEN :d1 AND :d2
      AND NOT EXISTS (SELECT 1 FROM sf_plaid_txn x WHERE x.mov_id = m.id)
      ORDER BY ABS(fecha - CAST(:fecha AS DATE)), id LIMIT 1`, { tipo, monto, d1: addDays(fecha, -3), d2: addDays(fecha, 3), fecha });
    if (man) {
      await q("UPDATE sf_plaid_txn SET mov_id = :m, enlace = 'manual', updated_at = NOW() WHERE id = :id", { m: man.id, id: row.id });
      stats.manual++;
      return;
    }
    // 3) new real movement from the bank
    const cat = categoria({ ...row, tipo }, reglas);
    const [[mov]] = await q(`INSERT INTO sf_movimientos (tenant_id, user_id, fecha, concepto, tipo, monto, categoria, origen, estado, nota, fuente, pendiente_banco, comercio)
      VALUES (:t, :u, :fecha, :concepto, :tipo, :monto, :cat, 'real', NULL, :nota, 'plaid', :pend, :comercio) RETURNING id`,
      { fecha, concepto: String(row.nombre).slice(0, 200), tipo, monto, cat, nota: 'Importado de ' + (item.institution_name || 'tu banco'), pend: !!row.pending, comercio: row.comercio });
    await q("UPDATE sf_plaid_txn SET mov_id = :m, enlace = 'nuevo', updated_at = NOW() WHERE id = :id", { m: mov.id, id: row.id });
    stats.nuevos++;
  }

  const FIELDS = 'account_id = :account_id, fecha = :fecha, nombre = :nombre, comercio = :comercio, monto_cents = :monto_cents, pending = :pending, pfc_primary = :pfc_primary, pfc_detailed = :pfc_detailed, updated_at = NOW()';
  async function upsert(t) {
    const rep = { ...t, item: item.item_id };
    const [[ya]] = await q('SELECT id FROM sf_plaid_txn WHERE transaction_id = :transaction_id', rep);
    if (t.pending_transaction_id && !ya) {
      // pending -> posted: re-key the stored pending row in place (same movement, same links)
      const [moved] = await q(`UPDATE sf_plaid_txn SET transaction_id = :transaction_id, ${FIELDS} WHERE transaction_id = :pending_transaction_id AND user_id = :u AND tenant_id = :t RETURNING *`, rep);
      if (moved.length) return moved[0];
    }
    const [[row]] = await q(`INSERT INTO sf_plaid_txn (tenant_id, user_id, item_id, account_id, transaction_id, fecha, nombre, comercio, monto_cents, pending, pfc_primary, pfc_detailed)
      VALUES (:t, :u, :item, :account_id, :transaction_id, :fecha, :nombre, :comercio, :monto_cents, :pending, :pfc_primary, :pfc_detailed)
      ON CONFLICT (transaction_id) DO UPDATE SET ${FIELDS.replace(/= :(\w+)/g, '= EXCLUDED.$1').replace('EXCLUDED.updated_at', 'NOW()')}
      RETURNING *`, rep);
    return row;
  }

  for (const t of ch.added.concat(ch.modified).map(norm)) {
    if (!Number.isFinite(t.monto_cents) || !t.fecha) continue;
    await reconcile(await upsert(t));
  }
  for (const r of ch.removed) {
    const [[row]] = await q('SELECT * FROM sf_plaid_txn WHERE transaction_id = :tx AND user_id = :u AND tenant_id = :t', { tx: String(r.transaction_id) });
    if (!row) continue;
    await unapply(row);
    await q('DELETE FROM sf_plaid_txn WHERE id = :id', { id: row.id });
    stats.eliminados++;
  }
  return stats;
}

const running = new Map(); // item_id -> promise (one sync per item per process)

async function syncItem(sequelize, item, ctx = {}) {
  if (running.has(item.item_id)) return running.get(item.item_id);
  const p = (async () => {
    let ch;
    try { ch = await fetchAllPages(item); }
    catch (e) { await markError(sequelize, item, e); throw e; }
    const stats = await sequelize.transaction(async (transaction) => {
      // multi-instance safety: one writer per item
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: 'sf_plaid:' + item.item_id }, transaction });
      const [[now]] = await sequelize.query('SELECT cursor FROM sf_plaid_items WHERE id = :id FOR UPDATE', { replacements: { id: item.id }, transaction });
      if (!now || (now.cursor || null) !== (item.cursor || null)) return { saltado: true }; // another instance already applied these pages
      const s = await applyChanges(sequelize, item, ch, ctx, transaction);
      await sequelize.query(`UPDATE sf_plaid_items SET cursor = :c, ultimo_sync = NOW(), ultimo_error = NULL,
        estado = CASE WHEN estado = 'desconectado' THEN estado ELSE 'activo' END,
        historial_completo = historial_completo OR :hist, updated_at = NOW() WHERE id = :id`,
        { replacements: { c: ch.cursor, hist: ch.status === 'HISTORICAL_UPDATE_COMPLETE', id: item.id }, transaction });
      return s;
    });
    return { ...stats, status: ch.status, added: ch.added.length, modified: ch.modified.length, removed: ch.removed.length };
  })();
  running.set(item.item_id, p);
  try { return await p; } finally { running.delete(item.item_id); }
}

async function markError(sequelize, item, e) {
  const user = userOf(item);
  const login = e && (e.code === 'ITEM_LOGIN_REQUIRED' || e.code === 'PENDING_DISCONNECT');
  await sequelize.query("UPDATE sf_plaid_items SET ultimo_error = :err, estado = CASE WHEN :login THEN 'login_requerido' ELSE estado END, updated_at = NOW() WHERE id = :id",
    { replacements: { err: String((e && (e.code || e.message)) || 'error').slice(0, 300), login: !!login, id: item.id } });
  if (login) await addAlerta(sequelize, user, 'reconectar', 'login:' + new Date().toISOString().slice(0, 10), `${item.institution_name || 'Tu banco'} pide que vuelvas a iniciar sesión. Pulsa "Reconectar".`);
}

// ---------------- recurring charges / subscriptions ----------------
function detectar(txns, today) {
  const groups = new Map();
  for (const t of txns) {
    if (t.pending || !Number(t.monto_cents)) continue;
    const dir = Number(t.monto_cents) > 0 ? 'salida' : 'entrada';
    const k = claveComercio(t.comercio || t.nombre) + '|' + dir;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const [k, list] of groups) {
    if (list.length < 3) continue;
    list.sort((a, b) => (toISO(a.fecha) < toISO(b.fecha) ? -1 : 1));
    const last = list.slice(-6);
    const gaps = []; for (let i = 1; i < last.length; i++) gaps.push((Date.parse(toISO(last[i].fecha)) - Date.parse(toISO(last[i - 1].fecha))) / 864e5);
    if (!gaps.every(g => g >= 25 && g <= 35)) continue;
    const amts = last.map(t => Math.abs(Number(t.monto_cents))).sort((a, b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    if (!last.slice(-3).every(t => Math.abs(Math.abs(Number(t.monto_cents)) - med) <= med * 0.15)) continue;
    const ult = last[last.length - 1];
    out.push({
      stream_id: 'det:' + k, direccion: k.endsWith('|salida') ? 'salida' : 'entrada', descripcion: ult.comercio || ult.nombre, comercio: ult.comercio,
      frecuencia: 'MONTHLY', status: 'DETECTADO', activo: toISO(ult.fecha) >= addDays(today, -40),
      monto_promedio: (med / 100).toFixed(2), monto_ultimo: (Math.abs(Number(ult.monto_cents)) / 100).toFixed(2),
      proxima_fecha: addDays(toISO(ult.fecha), 30), pfc_primary: ult.pfc_primary, pfc_detailed: ult.pfc_detailed
    });
  }
  return out;
}

function fromPlaidStream(s, direccion) {
  const pfc = s.personal_finance_category || {};
  const amt = (o) => (o && o.amount != null ? Math.abs(Number(o.amount)).toFixed(2) : null);
  return {
    stream_id: String(s.stream_id), direccion, descripcion: s.merchant_name || s.description || 'Cobro recurrente', comercio: s.merchant_name || null,
    frecuencia: s.frequency || 'UNKNOWN', status: s.status || 'UNKNOWN', activo: s.is_active !== false,
    monto_promedio: amt(s.average_amount), monto_ultimo: amt(s.last_amount), proxima_fecha: s.predicted_next_date || null,
    pfc_primary: pfc.primary || null, pfc_detailed: pfc.detailed || null
  };
}

const FREQ = { WEEKLY: 'semanal', BIWEEKLY: 'cada dos semanas', SEMI_MONTHLY: 'dos veces al mes', MONTHLY: 'mensual', ANNUALLY: 'anual' };

async function recurring(sequelize, item, ctx = {}) {
  const user = userOf(item);
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  let streams = [], fuente = item.recurrencia;
  if (fuente === 'plaid') {
    try {
      const r = await plaid.call('/transactions/recurring/get', { options: SYNC_OPTS }, { accessTokenEnc: item.access_token_enc });
      streams = (r.outflow_streams || []).map(s => fromPlaidStream(s, 'salida')).concat((r.inflow_streams || []).map(s => fromPlaidStream(s, 'entrada')));
    } catch (e) {
      if (e.code === 'PRODUCT_NOT_READY') return { fuente, streams: 0, pendiente: true };
      if (e.status && e.status < 500) {
        // Recurring is an add-on and may not be enabled on the Trial plan: fall back to our own detector, labelled as ours
        fuente = 'detector';
        await sequelize.query("UPDATE sf_plaid_items SET recurrencia = 'detector', updated_at = NOW() WHERE id = :id", { replacements: { id: item.id } });
      } else throw e;
    }
  }
  if (fuente === 'detector') {
    const [txns] = await sequelize.query("SELECT fecha, nombre, comercio, monto_cents, pending, pfc_primary, pfc_detailed FROM sf_plaid_txn WHERE user_id = :u AND tenant_id = :t AND item_id = :item AND fecha >= :d",
      { replacements: { u: user.userId, t: user.tenantId, item: item.item_id, d: addDays(today, -400) } });
    streams = detectar(txns, today);
  }
  const nuevos = [];
  await sequelize.transaction(async (transaction) => {
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: 'sf_plaid_rec:' + user.tenantId + ':' + user.userId }, transaction });
  const [[prev]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM sf_plaid_recurrentes WHERE user_id = :u AND tenant_id = :t', { replacements: { u: user.userId, t: user.tenantId }, transaction });
  const primera = prev.n === 0;
  for (const s of streams) {
    const cat = categoria({ comercio: s.comercio, nombre: s.descripcion, pfc_primary: s.pfc_primary, pfc_detailed: s.pfc_detailed, tipo: s.direccion === 'salida' ? 'egreso' : 'ingreso' });
    const [[old]] = await sequelize.query('SELECT id, monto_ultimo::text AS monto_ultimo FROM sf_plaid_recurrentes WHERE user_id = :u AND tenant_id = :t AND stream_id = :s', { replacements: { u: user.userId, t: user.tenantId, s: fuente + ':' + s.stream_id }, transaction });
    const rep = { t: user.tenantId, u: user.userId, s: fuente + ':' + s.stream_id, fuente, dir: s.direccion, desc: String(s.descripcion).slice(0, 200), com: s.comercio, frec: s.frecuencia, st: s.status, act: !!s.activo,
      prom: s.monto_promedio, ult: s.monto_ultimo, prox: s.proxima_fecha, cat };
    if (!old) {
      await sequelize.query(`INSERT INTO sf_plaid_recurrentes (tenant_id, user_id, stream_id, fuente, direccion, descripcion, comercio, frecuencia, status, activo, monto_promedio, monto_ultimo, proxima_fecha, categoria)
        VALUES (:t, :u, :s, :fuente, :dir, :desc, :com, :frec, :st, :act, :prom, :ult, :prox, :cat)`, { replacements: rep, transaction });
      const relevante = s.direccion === 'salida' && s.activo && s.status !== 'TOMBSTONED' && s.status !== 'UNKNOWN';
      if (relevante) nuevos.push(s);
      if (relevante && !primera) {
        await addAlerta(sequelize, user, 'nueva_suscripcion', rep.s,
          `Nuevo cobro recurrente: ${rep.desc}${s.monto_ultimo ? ' ' + '$' + Number(s.monto_ultimo).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}${FREQ[s.frecuencia] ? ' (' + FREQ[s.frecuencia] + ')' : ''}${fuente === 'detector' ? ' · detectado por la app' : ''}.`, transaction);
      }
    } else {
      if (s.direccion === 'salida' && old.monto_ultimo && s.monto_ultimo && Math.abs(Number(old.monto_ultimo) - Number(s.monto_ultimo)) >= 0.01) {
        await addAlerta(sequelize, user, 'cambio_monto', rep.s + ':' + s.monto_ultimo,
          `${rep.desc} cambió de monto: $${Number(old.monto_ultimo).toFixed(2)} → $${Number(s.monto_ultimo).toFixed(2)}.`, transaction);
      }
      await sequelize.query(`UPDATE sf_plaid_recurrentes SET descripcion = :desc, comercio = :com, frecuencia = :frec, status = :st, activo = :act, monto_promedio = :prom, monto_ultimo = :ult,
        proxima_fecha = :prox, categoria = :cat, updated_at = NOW() WHERE user_id = :u AND tenant_id = :t AND stream_id = :s`, { replacements: rep, transaction });
    }
  }
  if (primera && nuevos.length) {
    const lista = nuevos.slice(0, 8).map(s => s.descripcion).join(', ');
    await addAlerta(sequelize, user, 'resumen_recurrentes', item.item_id,
      `Encontré ${nuevos.length} cobro${nuevos.length === 1 ? '' : 's'} recurrente${nuevos.length === 1 ? '' : 's'} en tu banco: ${lista}${nuevos.length > 8 ? '…' : ''}.${fuente === 'detector' ? ' (detectados por la app)' : ''}`, transaction);
  }
  });
  return { fuente, streams: streams.length, nuevos: nuevos.length };
}

async function recurrentesDe(sequelize, user) {
  const [rows] = await sequelize.query(`SELECT id, fuente, direccion, descripcion, frecuencia, status, activo, monto_promedio::text AS monto_promedio, monto_ultimo::text AS monto_ultimo, proxima_fecha::text AS proxima_fecha, categoria
    FROM sf_plaid_recurrentes WHERE user_id = :u AND tenant_id = :t ORDER BY activo DESC, direccion DESC, monto_ultimo DESC NULLS LAST`, { replacements: { u: user.userId, t: user.tenantId } });
  return rows;
}

// ---------------- toggling an account in / out ----------------
async function setIncluir(sequelize, user, accountRowId, incluir) {
  const [[acct]] = await sequelize.query('SELECT * FROM sf_plaid_accounts WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { id: accountRowId, u: user.userId, t: user.tenantId } });
  if (!acct) return null;
  await sequelize.query('UPDATE sf_plaid_accounts SET incluir = :inc WHERE id = :id', { replacements: { inc: !!incluir, id: acct.id } });
  const item = await itemWithToken(sequelize, 'item_id = :i AND user_id = :u AND tenant_id = :t', { i: acct.item_id, u: user.userId, t: user.tenantId });
  if (!item) return { incluir: !!incluir };
  // re-apply every stored transaction of that account with the new switch, no Plaid call needed
  const stats = await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: 'sf_plaid:' + item.item_id }, transaction });
    const [rows] = await sequelize.query('SELECT * FROM sf_plaid_txn WHERE user_id = :u AND tenant_id = :t AND account_id = :a ORDER BY fecha, id', { replacements: { u: user.userId, t: user.tenantId, a: acct.account_id }, transaction });
    const asTxn = rows.map(r => ({ transaction_id: r.transaction_id, account_id: r.account_id, date: toISO(r.fecha), name: r.nombre, merchant_name: r.comercio, amount: Number(r.monto_cents) / 100, pending: r.pending, personal_finance_category: { primary: r.pfc_primary, detailed: r.pfc_detailed } }));
    return applyChanges(sequelize, item, { added: [], modified: asTxn, removed: [] }, {}, transaction);
  });
  return { incluir: !!incluir, ...stats };
}

/** disconnect: /item/remove at Plaid, then forget the token. Imported movements stay. */
async function disconnect(sequelize, user, itemRowId) {
  const item = await itemWithToken(sequelize, 'id = :id AND user_id = :u AND tenant_id = :t', { id: itemRowId, u: user.userId, t: user.tenantId });
  if (!item) return null;
  let remoto = 'ok';
  try { await plaid.call('/item/remove', {}, { accessTokenEnc: item.access_token_enc }); }
  catch (e) { remoto = String(e.code || e.message || 'error'); }
  await sequelize.query('DELETE FROM sf_plaid_accounts WHERE item_id = :i AND user_id = :u AND tenant_id = :t', { replacements: { i: item.item_id, u: user.userId, t: user.tenantId } });
  await sequelize.query('DELETE FROM sf_plaid_items WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { id: item.id, u: user.userId, t: user.tenantId } });
  return { remoto };
}

// ---------------- webhooks ----------------
async function storeWebhook(sequelize, body, dedupeKey) {
  const item = body && body.item_id ? await itemWithToken(sequelize, 'item_id = :i', { i: String(body.item_id) }) : null;
  if (!item) return null; // a verified webhook for an item we do not hold: nothing to do
  const [rows] = await sequelize.query(`INSERT INTO sf_plaid_webhooks (tenant_id, item_id, tipo, codigo, cuerpo_sha256, payload)
    VALUES (:t, :i, :tipo, :cod, :sha, CAST(:p AS JSONB)) ON CONFLICT (cuerpo_sha256) DO NOTHING RETURNING id`,
    { replacements: { t: item.tenant_id, i: item.item_id, tipo: String(body.webhook_type || '').slice(0, 60), cod: String(body.webhook_code || '').slice(0, 60), sha: dedupeKey, p: JSON.stringify(body) } });
  return rows[0] ? { id: rows[0].id, item } : null; // duplicate delivery -> null
}

async function processWebhook(sequelize, whId, ctx = {}) {
  // claim (another instance may hold it for up to 5 min); procesado_at is set only on success
  const [[wh]] = await sequelize.query(`UPDATE sf_plaid_webhooks SET claimed_at = NOW(), intentos = intentos + 1 WHERE id = :id AND procesado_at IS NULL
    AND intentos < 10 AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '5 minutes') RETURNING *`, { replacements: { id: whId } });
  if (!wh) return null;
  const body = wh.payload || {};
  const item = await itemWithToken(sequelize, 'item_id = :i', { i: wh.item_id });
  if (!item) return null;
  const user = userOf(item);
  const code = `${body.webhook_type}/${body.webhook_code}`;
  try {
    if (code === 'TRANSACTIONS/SYNC_UPDATES_AVAILABLE' || code === 'TRANSACTIONS/DEFAULT_UPDATE' || code === 'TRANSACTIONS/HISTORICAL_UPDATE' || code === 'TRANSACTIONS/INITIAL_UPDATE') {
      const r = await syncItem(sequelize, item, ctx);
      if (body.historical_update_complete || r.status === 'HISTORICAL_UPDATE_COMPLETE') {
        const fresh = await itemWithToken(sequelize, 'id = :id', { id: item.id });
        await recurring(sequelize, fresh, ctx);
      }
    } else if (code === 'TRANSACTIONS/RECURRING_TRANSACTIONS_UPDATE') {
      await recurring(sequelize, item, ctx);
    } else if (body.webhook_type === 'ITEM') {
      const err = body.error || {};
      if (body.webhook_code === 'ERROR' && err.error_code === 'ITEM_LOGIN_REQUIRED') await markError(sequelize, item, { code: 'ITEM_LOGIN_REQUIRED' });
      else if (body.webhook_code === 'PENDING_DISCONNECT' || body.webhook_code === 'PENDING_EXPIRATION') {
        await sequelize.query("UPDATE sf_plaid_items SET estado = 'por_desconectar', updated_at = NOW() WHERE id = :id", { replacements: { id: item.id } });
        const when = String(body.disconnect_time || body.consent_expiration_time || '').slice(0, 10);
        await addAlerta(sequelize, user, 'reconectar', 'disconnect:' + (when || new Date().toISOString().slice(0, 10)),
          `${item.institution_name || 'Tu banco'} se desconectará${when ? ' el ' + when : ' en 7 días'}. Pulsa "Reconectar" para renovar el permiso.`);
      } else if (body.webhook_code === 'LOGIN_REPAIRED') {
        await sequelize.query("UPDATE sf_plaid_items SET estado = 'activo', ultimo_error = NULL, updated_at = NOW() WHERE id = :id", { replacements: { id: item.id } });
      } else if (body.webhook_code === 'USER_PERMISSION_REVOKED' || body.webhook_code === 'USER_ACCOUNT_REVOKED') {
        await sequelize.query("UPDATE sf_plaid_items SET estado = 'desconectado', updated_at = NOW() WHERE id = :id", { replacements: { id: item.id } });
        await addAlerta(sequelize, user, 'reconectar', 'revoked:' + item.item_id, `Se revocó el permiso de ${item.institution_name || 'tu banco'}. Conéctalo de nuevo para seguir importando.`);
      } else if (body.webhook_code === 'NEW_ACCOUNTS_AVAILABLE') {
        await addAlerta(sequelize, user, 'cuentas_nuevas', 'new:' + item.item_id + ':' + new Date().toISOString().slice(0, 10), `${item.institution_name || 'Tu banco'} tiene cuentas nuevas. Pulsa "Reconectar" para elegir cuáles compartir.`);
      } else if (body.webhook_code === 'WEBHOOK_UPDATE_ACKNOWLEDGED') { /* nothing to do */ }
    }
    await sequelize.query('UPDATE sf_plaid_webhooks SET procesado_at = NOW(), error = NULL WHERE id = :id', { replacements: { id: wh.id } });
    return code;
  } catch (e) {
    // claimed_at cleared so the next tick retries it (up to 10 attempts)
    await sequelize.query('UPDATE sf_plaid_webhooks SET error = :e, claimed_at = NULL WHERE id = :id', { replacements: { e: String(e.code || e.message).slice(0, 300), id: wh.id } });
    throw e;
  }
}

// ---------------- daily backup job ----------------
let timer = null;
async function tick(sequelize, ctx = {}) {
  const store = require('./store');
  await store.ensure(sequelize);
  const nyHour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }));
  const out = { items: 0, webhooks: 0 };
  // retry webhooks whose processing never finished (the process may have restarted)
  const [stuck] = await sequelize.query("SELECT id FROM sf_plaid_webhooks WHERE procesado_at IS NULL AND intentos < 10 AND created_at < NOW() - INTERVAL '2 minutes' AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '5 minutes') ORDER BY id LIMIT 20");
  for (const w of stuck) { try { await processWebhook(sequelize, w.id, ctx); out.webhooks++; } catch (e) { /* recorded on the row */ } }
  if (!ctx.force && nyHour < 6) return out;
  // claim each item at most once per ~20 h (multi-instance safe)
  const [claimed] = await sequelize.query(`UPDATE sf_plaid_items SET ultimo_sync = NOW() WHERE estado <> 'desconectado'
    AND (ultimo_sync IS NULL OR ultimo_sync < NOW() - INTERVAL '20 hours') RETURNING *`);
  for (const item of claimed) {
    out.items++;
    try { await syncItem(sequelize, item, ctx); } catch (e) { continue; }
    try { await refreshItemInfo(sequelize, item); } catch (e) { /* informative */ }
    try { const fresh = await itemWithToken(sequelize, 'id = :id', { id: item.id }); if (fresh.historial_completo) await recurring(sequelize, fresh, ctx); } catch (e) { /* next day */ }
  }
  return out;
}
function start(sequelize) {
  const on = process.env.SALUD_FINANCIERA_PLAID_SYNC === 'on' || (process.env.NODE_ENV === 'production' && process.env.SALUD_FINANCIERA_PLAID_SYNC !== 'off');
  if (!on || timer) return false;
  timer = setInterval(() => { tick(sequelize).catch(e => console.error('[SaludFinanciera/Plaid] tick:', e.message)); }, 15 * 60 * 1000);
  if (timer.unref) timer.unref();
  return true;
}

async function alertas(sequelize, user, soloNoLeidas) {
  const [rows] = await sequelize.query(`SELECT id, tipo, texto, leida, created_at FROM sf_alertas WHERE user_id = :u AND tenant_id = :t ${soloNoLeidas ? 'AND NOT leida' : ''} ORDER BY id DESC LIMIT 50`,
    { replacements: { u: user.userId, t: user.tenantId } });
  return rows;
}

module.exports = { items, connect, loadAccounts, refreshItemInfo, syncItem, recurring, recurrentesDe, setIncluir, disconnect, storeWebhook, processWebhook, tick, start, alertas, addAlerta, detectar, itemWithToken, _norm: norm };
