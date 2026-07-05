// =====================================================
// Credit metering for GS_PROCESSING. Integrates with the EXISTING EquiMind credit
// ledger (ecpf_users / ecpf_credit_tx) via its addCredits/debitOne API — NO
// billing-table schema change (see DECISIONS.md). Usage type recorded as
// 'gs' (analysis_type) with a GS_PROCESSING description for reporting.
// =====================================================
'use strict';

const account = require('../../evaluacion-del-caballo-de-paso-fino/models/account');

// Charge N credits for a GS job (atomic per-credit debit; all-or-nothing).
// Returns { ok, charged, balance, reason }.
async function charge(tenantId, credits, meta = {}) {
  const n = Math.max(1, Math.ceil(credits));
  let charged = 0;
  let balance = null;
  for (let i = 0; i < n; i++) {
    const d = await account.debitOne(tenantId, { analysis_type: 'gs', description: 'GS_PROCESSING ' + (meta.label || '') });
    if (!d.ok) {
      // Roll back what we charged so a partial charge never sticks.
      if (charged > 0) { try { await account.addCredits(tenantId, charged, { kind: 'refund', description: 'GS_PROCESSING rollback (insufficient)' }); } catch (e) {} }
      return { ok: false, charged: 0, balance: d.balance, reason: d.reason || 'insufficient' };
    }
    charged++; balance = d.balance;
  }
  return { ok: true, charged, balance };
}

// Refund N credits (job failed after charging).
async function refund(tenantId, credits, meta = {}) {
  const n = Math.max(0, Math.round(credits));
  if (!n) return null;
  try { return await account.addCredits(tenantId, n, { kind: 'refund', description: 'GS_PROCESSING refund: ' + (meta.reason || 'job failed') }); }
  catch (e) { return null; }
}

async function balance(tenantId) { try { return await account.getBalance(tenantId); } catch (e) { return 0; } }

module.exports = { charge, refund, balance };
