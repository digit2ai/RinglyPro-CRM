'use strict';
/**
 * An in-memory stand-in for src/db.js so the SIT runs with NO Postgres and NO
 * keys. It dispatches on distinctive fragments of the real SQL.
 *
 * THE HARNESS MUST NOT BE MORE PERMISSIVE THAN POSTGRES. This repo has been
 * bitten six times by a fake that enforced in JavaScript a rule the real SQL
 * had lost, so a mutation test passed while production was broken. So:
 *   - the tenant predicate is read OFF THE STATEMENT, not assumed;
 *   - ON CONFLICT DO NOTHING is honoured only when the SQL actually says it;
 *   - the metric/source CHECK constraints from the migration are applied here
 *     too, so a row the database would refuse is refused here.
 */
const fs = require('fs');
const path = require('path');

const METRICS = ['heart_rate_bpm', 'resp_rate_bpm', 'hrv_ms', 'activity', 'temp_c', 'spo2_pct'];
const SOURCES = ['device', 'video', 'manual'];

function make() {
  const T = {
    mp_accounts: [], mp_pets: [], mp_devices: [], mp_readings: [],
    mp_alert_rules: [], mp_alerts: [], mp_reports: [], mp_share_links: [],
    mp_push_subs: [], mp_events: []
  };
  const seq = { mp_accounts: 0, mp_pets: 0, mp_devices: 0, mp_readings: 0,
    mp_alert_rules: 0, mp_alerts: 0, mp_reports: 0, mp_share_links: 0, mp_events: 0 };
  const stats = { queries: [] };

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  /** Return only the columns the statement actually selects. */
  function project(sql, row) {
    const m = /^SELECT (.+?) FROM /i.exec(sql);
    if (!m || m[1].includes('*')) return Object.assign({}, row);
    const cols = m[1].split(',').map((c) => {
      const t = c.trim();
      const as = /\sAS\s+([a-z_0-9]+)$/i.exec(t);
      if (as) return as[1];
      const last = t.split('.').pop().trim();
      return /^[a-z_][a-z_0-9]*$/i.test(last) ? last : null;
    }).filter(Boolean);
    const out = {};
    for (const c of cols) out[c] = row[c];
    return out;
  }

  /** Does this statement actually filter by tenant? Read, never assumed. */
  function hasTenantPredicate(sql) {
    return /tenant_id\s*=\s*:(t|tenant_id)\b/.test(sql);
  }

  function q(sql, r = {}) {
    const s = norm(sql);
    stats.queries.push(s);
    const T_ID = r.t !== undefined ? r.t : r.tenant_id;

    if (/FROM mp_accounts WHERE lower\(email\)/.test(s)) {
      const hit = T.mp_accounts.filter((a) => a.email.toLowerCase() === String(r.e).toLowerCase());
      return hit;
    }
    if (/FROM mp_accounts WHERE id = :id/.test(s)) {
      return T.mp_accounts.filter((a) => a.id === r.id);
    }
    if (/COUNT\(\*\)::int AS n FROM mp_accounts/.test(s)) {
      return [{ n: T.mp_accounts.length }];
    }
    if (/FROM mp_pets WHERE tenant_id/.test(s) || /FROM mp_pets\s+WHERE/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: mp_pets read without a tenant predicate');
      let rows = T.mp_pets.filter((p) => p.tenant_id === T_ID);
      if (/archived_at IS NULL/.test(s)) rows = rows.filter((p) => !p.archived_at);
      if (/id = :id/.test(s)) rows = rows.filter((p) => p.id === r.id);
      if (/id = :p\b/.test(s)) rows = rows.filter((p) => p.id === r.p);
      if (/id = :pet_id/.test(s)) rows = rows.filter((p) => p.id === r.pet_id);
      if (/COUNT\(\*\)/.test(s)) return [{ n: rows.length }];
      // PROJECT THE SELECT LIST. Returning every column regardless of what the
      // statement asked for makes the harness LESS accurate than Postgres, and
      // hides exactly the bug a "does the share link leak account_id?" test is
      // written to catch.
      return rows.map((row) => project(s, row));
    }
    if (/FROM mp_devices WHERE key_hash/.test(s)) {
      return T.mp_devices.filter((d) => d.key_hash === r.h);
    }
    if (/FROM mp_devices d/.test(s)) {
      if (!/d\.tenant_id = :tenant_id/.test(s)) throw new Error('fake-db: device list without a tenant predicate');
      return T.mp_devices.filter((d) => d.tenant_id === r.tenant_id)
        .map((d) => Object.assign({}, d, {
          pet_name: (T.mp_pets.find((p) => p.id === d.pet_id && p.tenant_id === d.tenant_id) || {}).name || null
        }));
    }
    if (/COUNT\(\*\)::int AS n FROM mp_devices/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: device count without a tenant predicate');
      return [{ n: T.mp_devices.filter((d) => d.tenant_id === T_ID && !d.revoked_at).length }];
    }
    if (/DISTINCT ON \(metric\)/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: today read without a tenant predicate');
      const rows = T.mp_readings.filter((x) => x.tenant_id === T_ID && x.pet_id === r.p);
      const by = new Map();
      for (const x of rows) {
        const cur = by.get(x.metric);
        if (!cur || new Date(x.recorded_at) > new Date(cur.recorded_at)) by.set(x.metric, x);
      }
      return [...by.values()];
    }
    if (/FROM mp_readings/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: readings read without a tenant predicate');
      let rows = T.mp_readings.filter((x) => x.tenant_id === T_ID && x.pet_id === r.p);
      if (r.metric) rows = rows.filter((x) => x.metric === r.metric);
      if (/GROUP BY metric/.test(s)) {
        const g = new Map();
        for (const x of rows) {
          const a = g.get(x.metric) || { metric: x.metric, samples: 0, sum: 0, min: Infinity, max: -Infinity, a_source: x.source, a_conf: x.confidence };
          a.samples++; a.sum += Number(x.value);
          a.min = Math.min(a.min, Number(x.value)); a.max = Math.max(a.max, Number(x.value));
          g.set(x.metric, a);
        }
        return [...g.values()].map((a) => ({
          metric: a.metric, samples: a.samples, avg: a.sum / a.samples,
          min: a.min, max: a.max, a_source: a.a_source, a_conf: a.a_conf,
          source: a.a_source
        })).sort((x, y) => x.metric.localeCompare(y.metric));
      }
      return rows.map((x) => ({ t: x.recorded_at, value: x.value, samples: 1, source: x.source, confidence: x.confidence }));
    }
    if (/FROM mp_alert_rules/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: rules read without a tenant predicate');
      return T.mp_alert_rules.filter((x) => x.tenant_id === T_ID && x.pet_id === (r.p !== undefined ? r.p : r.pet_id)
        && (!/enabled = TRUE/.test(s) || x.enabled));
    }
    if (/FROM mp_alerts/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: alerts read without a tenant predicate');
      return T.mp_alerts.filter((x) => x.tenant_id === T_ID && x.pet_id === (r.p !== undefined ? r.p : r.pet_id));
    }
    if (/FROM mp_reports/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: reports read without a tenant predicate');
      return T.mp_reports.filter((x) => x.tenant_id === T_ID && x.pet_id === r.pet_id
        && x.report_date === r.date && x.lang === r.lang);
    }
    if (/FROM mp_share_links/.test(s)) {
      if (/tenant_id = :t/.test(s)) {
        return T.mp_share_links
          .filter((x) => x.tenant_id === r.t && x.pet_id === r.p)
          .sort((a, b) => b.id - a.id)        // ORDER BY created_at DESC, id DESC
          .map((row) => project(s, row));
      }
      return T.mp_share_links.filter((x) => x.token_hash === r.h && !x.revoked_at);
    }
    return [];
  }

  function run(sql, r = {}) {
    const s = norm(sql);
    stats.queries.push(s);
    const T_ID = r.t !== undefined ? r.t : r.tenant_id;

    if (/INSERT INTO mp_accounts/.test(s)) {
      const id = ++seq.mp_accounts;
      // The single-statement form sets id and tenant_id to the SAME sequence
      // value. If the SQL ever goes back to a placeholder, that is visible here.
      const atomic = /SELECT id, id,/.test(s);
      const row = { id, tenant_id: atomic ? id : 0, email: r.email, password_hash: r.hash,
        name: r.name, lang: r.lang, created_at: new Date() };
      // ck_mp_accounts_self_tenant, applied here too: a row Postgres would
      // refuse must be refused by the harness.
      if (row.tenant_id !== row.id) throw new Error('ck_mp_accounts_self_tenant');
      T.mp_accounts.push(row);
      return [{ id: row.id }];
    }
    if (/UPDATE mp_accounts SET tenant_id/.test(s)) {
      const a = T.mp_accounts.find((x) => x.id === r.id); if (a) a.tenant_id = r.id;
      return [];
    }
    if (/UPDATE mp_accounts SET last_login_at/.test(s)) return [];
    if (/INSERT INTO mp_pets/.test(s)) {
      const row = { id: ++seq.mp_pets, tenant_id: r.t, account_id: r.a, name: r.name, breed: r.breed,
        breed_size: r.breed_size, birth_date: r.birth_date, weight_kg: r.weight_kg, sex: r.sex,
        neutered: r.neutered, conditions: r.conditions, created_at: new Date(), archived_at: null };
      T.mp_pets.push(row);
      return [row];
    }
    if (/UPDATE mp_pets SET/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: pet update without a tenant predicate');
      const p = T.mp_pets.find((x) => x.tenant_id === r.t && x.id === r.id);
      if (!p) return [];
      for (const k of Object.keys(r)) if (k !== 't' && k !== 'id' && k in p) p[k] = r[k];
      return [p];
    }
    if (/INSERT INTO mp_devices/.test(s)) {
      const row = { id: ++seq.mp_devices, tenant_id: r.tenant_id, account_id: r.account_id,
        pet_id: r.pet_id, label: r.label, hardware_id: r.hardware_id, firmware: null,
        key_hash: r.key_hash, key_prefix: r.key_prefix, created_at: new Date(),
        last_seen_at: null, revoked_at: null };
      T.mp_devices.push(row);
      return [row];
    }
    if (/UPDATE mp_devices SET revoked_at/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: revoke without a tenant predicate');
      const d = T.mp_devices.find((x) => x.tenant_id === r.tenant_id && x.id === r.id && !x.revoked_at);
      if (!d) return [];
      d.revoked_at = new Date();
      return [{ id: d.id }];
    }
    if (/UPDATE mp_devices SET last_seen_at/.test(s)) {
      const d = T.mp_devices.find((x) => x.id === r.id); if (d) d.last_seen_at = new Date();
      return [];
    }
    if (/UPDATE mp_devices SET firmware/.test(s)) {
      const d = T.mp_devices.find((x) => x.id === r.id); if (d) d.firmware = r.f;
      return [];
    }
    if (/INSERT INTO mp_readings/.test(s)) {
      // The migration's CHECK constraints, applied here too: a row Postgres
      // would refuse must be refused by the harness.
      if (!METRICS.includes(r.metric)) throw new Error('ck_mp_readings_metric');
      if (!SOURCES.includes(r.source)) throw new Error('ck_mp_readings_source');
      const conflicts = /ON CONFLICT \(tenant_id, dedupe_key\) DO NOTHING/.test(s);
      if (conflicts && T.mp_readings.some((x) => x.tenant_id === r.tenant_id && x.dedupe_key === r.dedupe_key)) {
        return [];
      }
      const row = { id: ++seq.mp_readings, tenant_id: r.tenant_id, pet_id: r.pet_id,
        device_id: r.device_id, metric: r.metric, value: Number(r.value), source: r.source,
        confidence: r.confidence, recorded_at: r.recorded_at, dedupe_key: r.dedupe_key };
      T.mp_readings.push(row);
      return [{ id: row.id }];
    }
    if (/INSERT INTO mp_alert_rules/.test(s)) {
      const found = T.mp_alert_rules.find((x) => x.tenant_id === r.t && x.pet_id === r.p && x.metric === r.metric);
      const row = found || { id: ++seq.mp_alert_rules, tenant_id: r.t, pet_id: r.p, metric: r.metric };
      row.min_value = r.lo; row.max_value = r.hi; row.enabled = r.en;
      if (!found) T.mp_alert_rules.push(row);
      return [row];
    }
    if (/INSERT INTO mp_alerts/.test(s)) {
      const row = { id: ++seq.mp_alerts, tenant_id: r.tenant_id, pet_id: r.pet_id, rule_id: r.rule_id,
        metric: r.metric, value: r.value, direction: r.direction, fired_at: new Date(), read_at: null };
      T.mp_alerts.push(row);
      return [{ id: row.id }];
    }
    if (/UPDATE mp_alerts SET read_at/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: alert read without a tenant predicate');
      T.mp_alerts.filter((x) => x.tenant_id === T_ID).forEach((x) => { x.read_at = new Date(); });
      return [];
    }
    if (/INSERT INTO mp_reports/.test(s)) {
      const found = T.mp_reports.find((x) => x.tenant_id === r.tenant_id && x.pet_id === r.pet_id
        && x.report_date === r.date && x.lang === r.lang);
      const row = found || { id: ++seq.mp_reports, tenant_id: r.tenant_id, pet_id: r.pet_id,
        report_date: r.date, lang: r.lang };
      row.body = r.body;
      row.facts = typeof r.facts === 'string' ? JSON.parse(r.facts) : r.facts;
      row.composed_by = r.composed_by;
      row.is_simulated = r.is_simulated;
      row.rejected = r.rejected ? JSON.parse(r.rejected) : null;
      if (!found) T.mp_reports.push(row);
      return [row];
    }
    if (/UPDATE mp_share_links SET revoked_at/.test(s)) {
      if (!hasTenantPredicate(s)) throw new Error('fake-db: share revoke without a tenant predicate');
      const l = T.mp_share_links.find((x) => x.tenant_id === r.t && x.id === r.id && !x.revoked_at);
      if (!l) return [];
      l.revoked_at = new Date();
      return [{ id: l.id }];
    }
    if (/INSERT INTO mp_share_links/.test(s)) {
      const row = { id: ++seq.mp_share_links, tenant_id: r.t, pet_id: r.p, token_hash: r.h,
        from_date: '2026-01-01', to_date: '2026-12-31', expires_at: new Date(Date.now() + 86400000),
        revoked_at: null };
      T.mp_share_links.push(row);
      return [row];
    }
    if (/INSERT INTO mp_events/.test(s)) {
      T.mp_events.push({ id: ++seq.mp_events, tenant_id: r.tenant_id, account_id: r.account_id,
        kind: r.kind, detail: r.detail });
      return [];
    }
    return [];
  }

  return {
    configured: () => true,
    migrate: async () => {},
    q: async (sql, r) => q(sql, r),
    one: async (sql, r) => (q(sql, r)[0] || null),
    run: async (sql, r) => run(sql, r),
    event: async (tenant_id, account_id, kind, detail) =>
      run('INSERT INTO mp_events (tenant_id, account_id, kind, detail) VALUES (:tenant_id,:account_id,:kind,:detail)',
        { tenant_id, account_id, kind, detail }),
    _tables: T, _stats: stats
  };
}

/** Install the fake in place of src/db.js, before anything requires it. */
function install() {
  const target = require.resolve(path.join(__dirname, '..', 'src', 'db.js'));
  const fake = make();
  require.cache[target] = { id: target, filename: target, loaded: true, exports: fake, children: [], paths: [] };
  return fake;
}

module.exports = { make, install, METRICS, SOURCES };
