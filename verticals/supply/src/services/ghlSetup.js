'use strict';

/**
 * "Set up automatically" — configures a tenant's GoHighLevel sub-account so the
 * supplier never has to open GoHighLevel.
 *
 *   1. connection check
 *   2. contact custom fields (the context / offer / rep / campaign the agent reads)
 *   3. phone numbers on the sub-account
 *   4. two Voice AI agents, created or UPDATED in place (idempotent, found by name)
 *   5. a call-transfer action to the default sales rep (created once per agent)
 *   6. the outbound workflow, found by name — HighLevel has no API to create a
 *      workflow, so it arrives in the sub-account from our Snapshot
 *
 * NEVER TAKES OVER A PHONE NUMBER UNASKED. The inbound agent is given a number
 * only when the tenant ticked "answer inbound calls with Supply"; otherwise the
 * number keeps answering exactly as it does today.
 *
 * Each step is reported (ok / skipped / needs_you / failed) and a failure in
 * one step never hides the result of the others.
 */

const tenants = require('./tenants');
const db = require('../db');

const OUT_NAME = 'RinglyPro Supply Outbound';
const IN_NAME = 'RinglyPro Supply Inbound';
const WORKFLOW_MATCH = /supply.*outbound|outbound.*supply/i;

function prompt(direction, tags, company) {
  const t = (k, fallback) => tags[k] || fallback;
  const intro = direction === 'outbound'
    ? `You are Lina, a friendly sales assistant calling contractors on behalf of ${company}, a building-material supplier.`
    : `You are Lina, the receptionist for ${company}, a building-material supplier. Contractors call to ask about products, prices, stock, or to reach their sales rep.`;
  const goal = direction === 'outbound'
    ? `YOUR GOAL ON THIS CALL
1. Introduce yourself and ${company} in one sentence.
2. Ask if they buy the materials in the offer for their jobs.
3. Present the offer briefly, using only the prices written in the offer above.
4. If interested, ask which product, roughly how much, and when they need it.
5. If they want pricing, a quote, or a person, transfer the call to the sales rep.
6. If they are busy, ask for a better time to call back.`
    : `YOUR GOAL ON THIS CALL
1. If the context above shows a previous conversation, greet them as someone you already know and continue from it.
2. Answer product, price and stock questions using only what is written above.
3. Capture which product, roughly how much, and when they need it.
4. If they want pricing, a quote, or a person, transfer the call to the sales rep.
5. Otherwise take a clear message for the sales rep.`;
  return `${intro} You speak English or Spanish, matching the caller.

WHAT YOU KNOW ABOUT THIS CONTRACTOR (read before speaking):
${t('rps_context', '(no previous conversation)')}

TODAY'S OFFER AND RULES:
${t('rps_offer', '(no offer)')}

ASSIGNED SALES REP: ${t('rps_rep', '(the sales team)')}

${goal}

RULES
- Quote ONLY the prices and numbers written above. Never invent a price, discount or stock level.
- Never compare to Home Depot, Lowe's or any competitor unless the offer text contains that exact comparison.
- If they ask not to be called again, apologize, confirm they will not be called, and end the call.
- Keep answers short and natural. One question at a time.
- If you do not know something, say a sales rep will follow up.`;
}


async function run(tenant, provider, { answerInbound = false, actorId } = {}) {
  const steps = [];
  const step = (key, label, status, detail) => { steps.push({ key, label, status, detail }); return status; };
  const g = tenant.ghl || {};
  const company = tenant.name;

  // 1. connection
  const h = await provider.health(tenant);
  if (!h.ok) { step('connection', 'Connect to GoHighLevel', 'failed', h.detail); return { ok: false, steps }; }
  step('connection', 'Connect to GoHighLevel', 'ok', h.detail);

  // 2. fields
  let tags = {};
  try {
    await provider.ensureFields();
    tags = provider.fieldTags || {};
    step('fields', 'Contact fields for context and offer', 'ok', Object.values(tags).join('  '));
  } catch (e) {
    step('fields', 'Contact fields for context and offer', 'failed', /not authorized for this scope/i.test(e.message) ? 'The token is missing "View/Edit Custom Fields".' : e.message);
  }

  // 3. numbers
  let number = g.phone_number || null;
  try {
    const nums = await provider.listNumbers();
    if (!number && nums.length) number = nums[0].phoneNumber;
    step('numbers', 'Phone number', nums.length ? 'ok' : 'needs_you', nums.length ? `${nums.map((n) => n.phoneNumber).join(', ')}${number ? ' · using ' + number : ''}` : 'This sub-account has no phone number. Buy one in GoHighLevel (Phone System → Add Number).');
  } catch (e) {
    step('numbers', 'Phone number', 'failed', /scope/i.test(e.message) ? 'The token is missing the phone-number scope ("View Phone Numbers").' : e.message);
  }

  // 4. agents
  const rep = await db.tone(tenant.id, 'SELECT name, phone FROM sup_sales_reps WHERE tenant_id = :tenant AND active ORDER BY is_default DESC, id LIMIT 1');
  const ids = { outbound_agent_id: g.outbound_agent_id || null, inbound_agent_id: g.inbound_agent_id || null };
  let existing = [];
  try { existing = await provider.listAgents(); } catch (e) { /* create path still tries */ }
  const byName = (n) => existing.find((a) => String(a.agentName || a.name || '').toLowerCase() === n.toLowerCase());
  for (const [dir, name, key] of [['outbound', OUT_NAME, 'outbound_agent_id'], ['inbound', IN_NAME, 'inbound_agent_id']]) {
    const body = {
      agentName: name, businessName: company, agentPrompt: prompt(dir, tags, company), language: 'multi', maxCallDuration: 900, timezone: tenant.timezone,
      welcomeMessage: dir === 'outbound' ? `Hi, this is Lina calling from ${company} about building materials for your projects. Do you have a minute?` : `Thanks for calling ${company}, this is Lina. How can I help you today?`
    };
    if (dir === 'inbound' && answerInbound && number) body.inboundNumber = number;
    try {
      let found = ids[key] ? { id: ids[key] } : byName(name);
      if (found && found.id) {
        try { await provider.updateAgent(found.id, body); }
        catch (e) { if (e.status !== 404) throw e; found = null; } // deleted inside GHL: recreate below
      }
      if (found && found.id) { ids[key] = found.id; step(dir + '_agent', `${dir === 'outbound' ? 'Outbound sales' : 'Inbound receptionist'} agent`, 'ok', 'Updated · ' + name); }
      else { const c = await provider.createAgent(body); ids[key] = c.id; step(dir + '_agent', `${dir === 'outbound' ? 'Outbound sales' : 'Inbound receptionist'} agent`, 'ok', 'Created · ' + name); }
    } catch (e) {
      step(dir + '_agent', `${dir === 'outbound' ? 'Outbound sales' : 'Inbound receptionist'} agent`, 'failed', /scope/i.test(e.message) ? 'The token is missing the Voice AI agent scopes ("View/Edit Voice AI Agents").' : e.message);
    }
  }
  if (!answerInbound) step('inbound_number', 'Inbound calls', 'skipped', `${number || 'Your number'} keeps answering as it does today. Tick "Answer inbound calls with Supply" to hand it to the inbound agent.`);
  else step('inbound_number', 'Inbound calls', number && ids.inbound_agent_id ? 'ok' : 'failed', number ? `${number} now rings the inbound agent` : 'No phone number to assign');

  // 5. transfer action (once per agent)
  const transfer = Object.assign({}, g.transfer_action_ids || {});
  if (!rep || !rep.phone) step('transfer', 'Transfer to sales rep', 'needs_you', 'Add a default sales rep with a phone number in Settings, then run setup again.');
  else {
    let made = 0; let failed = null;
    for (const key of ['outbound_agent_id', 'inbound_agent_id']) {
      const agentId = ids[key];
      if (!agentId || transfer[agentId]) continue;
      try {
        const a = await provider.createAgentAction(agentId, 'CALL_TRANSFER', 'Transfer to ' + rep.name, {
          triggerPrompt: 'When the caller asks for a person, a quote, contractor pricing, or shows clear buying intent',
          transferToType: 'number', transferToValue: rep.phone, triggerMessage: `Let me connect you with ${rep.name} right now.`, hearWhisperMessage: true
        });
        transfer[agentId] = a.id || true; made++;
      } catch (e) { failed = e.message; }
    }
    step('transfer', 'Transfer to sales rep', failed ? 'failed' : 'ok', failed || `Calls transfer to ${rep.name} (${rep.phone})${made ? '' : ' · already set'}`);
  }

  // 6. workflow
  let workflowId = g.default_workflow_id || null;
  try {
    const wfs = await provider.listWorkflows();
    const match = wfs.filter((w) => WORKFLOW_MATCH.test(w.name)).sort((a, b) => (b.status === 'published') - (a.status === 'published'))[0];
    if (match) { workflowId = match.id; step('workflow', 'Outbound calling workflow', match.status === 'published' ? 'ok' : 'needs_you', `${match.name}${match.status === 'published' ? '' : ' · publish it in GoHighLevel'}`); }
    else step('workflow', 'Outbound calling workflow', 'needs_you', 'Load the RinglyPro Supply snapshot into this sub-account (it contains the "Supply Outbound Call" workflow), then run setup again.');
  } catch (e) {
    step('workflow', 'Outbound calling workflow', 'failed', /scope/i.test(e.message) ? 'The token is missing "View Workflows".' : e.message);
  }

  await tenants.mergeGhl(tenant.id, Object.assign({}, ids, { default_workflow_id: workflowId, phone_number: number, transfer_action_ids: transfer, inbound_answering: !!answerInbound, last_setup_at: new Date().toISOString() }));
  // Campaigns without their own workflow pick up the default.
  if (workflowId) await db.trun(tenant.id, `UPDATE sup_campaigns SET agent = agent || jsonb_build_object('ghl_workflow_id', :w::text) WHERE tenant_id = :tenant AND COALESCE(agent->>'ghl_workflow_id','') = '' AND status IN ('draft','pending_approval','approved')`, { w: workflowId });
  const ok = steps.every((s) => s.status === 'ok' || s.status === 'skipped');
  await require('../util').audit(tenant.id, actorId, 'ghl.auto_setup', 'tenant', tenant.id, { ok, steps: steps.map((s) => s.key + ':' + s.status) });
  return { ok, steps };
}

module.exports = { run, prompt, OUT_NAME, IN_NAME, WORKFLOW_MATCH };
