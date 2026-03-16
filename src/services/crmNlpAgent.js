/**
 * RinglyPro CRM NLP Agent
 *
 * Parses natural language commands and executes CRM operations across
 * GHL, HubSpot, Zoho, and the local RinglyPro CRM.
 */

const { QueryTypes } = require('sequelize');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const HS_BASE = 'https://api.hubapi.com';

// ─── Intent Patterns ─────────────────────────────────────────
const INTENTS = [
  { id: 'CREATE_CONTACT', patterns: [/\b(create|add|new)\b.*\b(contact|person|lead)\b/i] },
  { id: 'FIND_CONTACT', patterns: [/\b(find|search|look\s*up|show)\b.*\b(contact|person|lead)\b/i, /\bwho is\b/i] },
  { id: 'LIST_CONTACTS', patterns: [/\b(list|show|get)\b.*\b(contacts|leads|people)\b/i] },
  { id: 'CREATE_DEAL', patterns: [/\b(create|add|new)\b.*\b(deal|opportunity)\b/i] },
  { id: 'LIST_DEALS', patterns: [/\b(show|list|get)\b.*\b(pipeline|deals|opportunities)\b/i] },
  { id: 'UPDATE_DEAL', patterns: [/\b(move|change|update|close)\b.*\b(deal|stage|opportunity)\b/i] },
  { id: 'CREATE_TASK', patterns: [/\b(create|add|new)\b.*\b(task|todo|follow.?up)\b/i] },
  { id: 'LIST_TASKS', patterns: [/\b(show|list|get)\b.*\b(tasks|todos|overdue)\b/i] },
  { id: 'COMPLETE_TASK', patterns: [/\b(complete|done|finish)\b.*\b(task|todo)\b/i] },
  { id: 'FIX_FINDING', patterns: [/\b(fix|resolve|handle|address)\b/i] },
  { id: 'SYNC_CRM', patterns: [/\b(sync|copy|transfer|migrate)\b.*\b(contact|deal|from|to)\b/i] },
  { id: 'SEND_SMS', patterns: [/\b(send|text|sms)\b/i] },
  { id: 'HELP', patterns: [/\b(help|what can|how do|commands)\b/i] },
];

// ─── CRM Detection ──────────────────────────────────────────
function detectCrm(message) {
  const m = message.toLowerCase();
  if (/\bghl\b|gohighlevel|go\s*high/i.test(m)) return 'ghl';
  if (/\bhubspot\b/i.test(m)) return 'hubspot';
  if (/\bzoho\b/i.test(m)) return 'zoho';
  if (/\blocal\b|ringlypro/i.test(m)) return 'local';
  if (/\beverywhere\b|all\s*crm/i.test(m)) return 'all';
  return null; // auto-detect from client config
}

// ─── Extract Data from Message ──────────────────────────────
function extractPhone(msg) { const m = msg.match(/\+?\d[\d\s\-()]{8,}/); return m ? m[0].replace(/[\s\-()]/g, '') : null; }
function extractEmail(msg) { const m = msg.match(/[\w.+-]+@[\w-]+\.[\w.]+/); return m ? m[0] : null; }
function extractAmount(msg) { const m = msg.match(/\$\s*([\d,]+(?:\.\d{2})?)/); return m ? parseFloat(m[1].replace(/,/g, '')) : null; }
function extractName(msg) {
  // Try "for [Name]" or "named [Name]" or "[Name]'s"
  const m = msg.match(/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ||
            msg.match(/\bnamed?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ||
            msg.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)(?:'s)?\b/);
  return m ? m[1] : null;
}

class CrmNlpAgent {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN ENTRY: Process a chat message
  // ═══════════════════════════════════════════════════════════
  async processMessage(clientId, message, context = {}) {
    try {
      // Get client info + CRM connections
      const client = await this._getClient(clientId);
      if (!client) return { success: false, reply: 'Client not found.', actions_taken: [] };

      // Parse intent
      const intent = this._parseIntent(message);
      const requestedCrm = detectCrm(message);
      const activeCrm = requestedCrm || this._autoDetectCrm(client);

      // If from Neural finding context, handle specially
      if (context.finding_id || /\bfix\b/i.test(message)) {
        return this._handleFindingAction(client, message, context, activeCrm);
      }

      // Route to handler
      switch (intent) {
        case 'CREATE_CONTACT': return this._createContact(client, message, activeCrm);
        case 'FIND_CONTACT': return this._findContact(client, message, activeCrm);
        case 'LIST_CONTACTS': return this._listContacts(client, activeCrm);
        case 'CREATE_DEAL': return this._createDeal(client, message, activeCrm);
        case 'LIST_DEALS': return this._listDeals(client, activeCrm);
        case 'UPDATE_DEAL': return this._updateDeal(client, message, activeCrm);
        case 'CREATE_TASK': return this._createTask(client, message);
        case 'LIST_TASKS': return this._listTasks(client);
        case 'COMPLETE_TASK': return this._completeTask(client, message);
        case 'SYNC_CRM': return this._syncCrm(client, message);
        case 'SEND_SMS': return this._sendSms(client, message);
        case 'HELP': return this._showHelp(client);
        default:
          return {
            success: true,
            reply: `I'm not sure what you mean. Try something like:\n• "Create a contact for John Smith +18135551234"\n• "Show my pipeline"\n• "List open deals in GHL"\n• "Create a task: Follow up with Maria due tomorrow"`,
            actions_taken: [],
            suggestions: ['Show contacts', 'Show pipeline', 'Show tasks', 'Help']
          };
      }
    } catch (error) {
      console.error('[CRM Agent] Error:', error.message);
      return { success: false, reply: `Something went wrong: ${error.message}`, actions_taken: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GET CLIENT + CRM CONFIG
  // ═══════════════════════════════════════════════════════════
  async _getClient(clientId) {
    const [client] = await this.sequelize.query(
      `SELECT id, business_name, business_phone, ringlypro_number,
              ghl_api_key, ghl_location_id, hubspot_api_key,
              settings, booking_system
       FROM clients WHERE id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    return client;
  }

  _autoDetectCrm(client) {
    if (client.ghl_api_key) return 'ghl';
    if (client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken) return 'hubspot';
    if (client.settings?.integration?.zoho?.enabled) return 'zoho';
    return 'local';
  }

  _getConnectedCrms(client) {
    const crms = ['local'];
    if (client.ghl_api_key) crms.push('ghl');
    if (client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken) crms.push('hubspot');
    if (client.settings?.integration?.zoho?.enabled) crms.push('zoho');
    return crms;
  }

  _parseIntent(message) {
    for (const intent of INTENTS) {
      if (intent.patterns.some(p => p.test(message))) return intent.id;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // CONTACT OPERATIONS
  // ═══════════════════════════════════════════════════════════
  async _createContact(client, message, crm) {
    const name = extractName(message);
    const phone = extractPhone(message);
    const email = extractEmail(message);

    if (!name && !phone) {
      return { success: true, reply: 'Please provide a name and/or phone number.\nExample: "Create contact for John Smith +18135551234 john@email.com"', actions_taken: [] };
    }

    const parts = (name || '').split(' ');
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || '';
    const actions = [];

    // Always create in local DB
    try {
      await this.sequelize.query(
        `INSERT INTO contacts (client_id, first_name, last_name, phone, email, source, status, tags, lifecycle_stage, created_at, updated_at)
         VALUES (:cid, :fn, :ln, :phone, :email, 'crm_agent', 'active', '[]', 'lead', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        { replacements: { cid: client.id, fn: firstName, ln: lastName, phone: phone || '', email: email || null } }
      );
      actions.push({ type: 'contact_created', crm: 'local', details: { firstName, lastName, phone, email } });
    } catch (e) { /* duplicate, continue */ }

    // Create in external CRM
    if (crm === 'ghl' || crm === 'all') {
      try {
        const result = await this._ghlRequest(client, 'POST', '/contacts/', {
          locationId: client.ghl_location_id, firstName, lastName, phone: phone || '', email: email || '', source: 'RinglyPro CRM Agent'
        });
        actions.push({ type: 'contact_created', crm: 'ghl', details: { contactId: result.contact?.id } });
      } catch (e) { actions.push({ type: 'error', crm: 'ghl', details: e.message }); }
    }

    if (crm === 'hubspot' || crm === 'all') {
      try {
        const token = client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken;
        if (token) {
          const result = await this._hubspotRequest(token, 'POST', '/crm/v3/objects/contacts', {
            properties: { firstname: firstName, lastname: lastName, phone: phone || '', email: email || '', lifecyclestage: 'lead' }
          });
          actions.push({ type: 'contact_created', crm: 'hubspot', details: { contactId: result.id } });
        }
      } catch (e) { actions.push({ type: 'error', crm: 'hubspot', details: e.message }); }
    }

    if (crm === 'zoho' || crm === 'all') {
      try {
        const token = await this._getZohoToken(client);
        if (token) {
          const result = await this._zohoRequest(token, client, 'POST', '/crm/v2/Contacts', {
            data: [{ First_Name: firstName, Last_Name: lastName || firstName, Phone: phone || '', Email: email || '' }]
          });
          actions.push({ type: 'contact_created', crm: 'zoho', details: { id: result.data?.[0]?.details?.id } });
        }
      } catch (e) { actions.push({ type: 'error', crm: 'zoho', details: e.message }); }
    }

    // Log activity
    this._logActivity(client.id, null, null, 'note', `CRM Agent: Created contact ${firstName} ${lastName}`, { phone, email, crm });

    const crmLabel = crm === 'all' ? 'all connected CRMs' : crm.toUpperCase();
    return {
      success: true,
      reply: `Created contact **${firstName} ${lastName}**${phone ? ` (${phone})` : ''} in ${crmLabel}.`,
      actions_taken: actions,
      suggestions: ['Show contacts', 'Create a deal for ' + firstName, 'Create task: Follow up with ' + firstName]
    };
  }

  async _findContact(client, message, crm) {
    const name = extractName(message) || message.replace(/\b(find|search|look\s*up|show|contact|person|lead|in|ghl|hubspot|zoho)\b/gi, '').trim();
    if (!name || name.length < 2) {
      return { success: true, reply: 'Who are you looking for?\nExample: "Find John Smith" or "Search contacts for Maria"', actions_taken: [] };
    }

    const results = [];

    // Search local
    const local = await this.sequelize.query(
      `SELECT id, first_name, last_name, phone, email, lifecycle_stage, lead_score FROM contacts
       WHERE client_id = :cid AND (LOWER(first_name || ' ' || last_name) LIKE :q OR phone LIKE :q2)
       LIMIT 5`,
      { replacements: { cid: client.id, q: `%${name.toLowerCase()}%`, q2: `%${name}%` }, type: QueryTypes.SELECT }
    );
    if (local.length > 0) results.push({ crm: 'local', contacts: local });

    // Search GHL
    if ((crm === 'ghl' || crm === 'all' || !crm) && client.ghl_api_key) {
      try {
        const r = await this._ghlRequest(client, 'GET', `/contacts/search/duplicate?locationId=${client.ghl_location_id}&name=${encodeURIComponent(name)}`);
        if (r.contacts?.length > 0) results.push({ crm: 'ghl', contacts: r.contacts.slice(0, 5).map(c => ({ name: c.contactName, phone: c.phone, email: c.email, id: c.id })) });
      } catch (e) { /* skip */ }
    }

    // Search HubSpot
    if ((crm === 'hubspot' || crm === 'all' || !crm) && (client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken)) {
      try {
        const token = client.hubspot_api_key || client.settings?.integration?.hubspot?.accessToken;
        const r = await this._hubspotRequest(token, 'POST', '/crm/v3/objects/contacts/search', {
          filterGroups: [{ filters: [{ propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: name.split(' ')[0] }] }],
          properties: ['firstname', 'lastname', 'phone', 'email'], limit: 5
        });
        if (r.results?.length > 0) results.push({ crm: 'hubspot', contacts: r.results.map(c => ({ name: `${c.properties.firstname} ${c.properties.lastname}`, phone: c.properties.phone, email: c.properties.email, id: c.id })) });
      } catch (e) { /* skip */ }
    }

    if (results.length === 0) {
      return { success: true, reply: `No contacts found matching "${name}".`, actions_taken: [], suggestions: [`Create contact for ${name}`, 'List contacts'] };
    }

    let reply = `Found contacts matching "${name}":\n\n`;
    for (const r of results) {
      reply += `**${r.crm.toUpperCase()}:**\n`;
      for (const c of r.contacts) {
        const n = c.first_name ? `${c.first_name} ${c.last_name || ''}` : c.name || 'Unknown';
        reply += `• ${n} — ${c.phone || 'no phone'} — ${c.email || 'no email'}\n`;
      }
      reply += '\n';
    }

    return { success: true, reply, actions_taken: [], data: { results }, suggestions: ['Create a deal', 'Show pipeline'] };
  }

  async _listContacts(client, crm) {
    const local = await this.sequelize.query(
      'SELECT id, first_name, last_name, phone, email, lifecycle_stage FROM contacts WHERE client_id = :cid ORDER BY created_at DESC LIMIT 10',
      { replacements: { cid: client.id }, type: QueryTypes.SELECT }
    );

    let reply = `**Recent Contacts** (${local.length}):\n\n`;
    for (const c of local) {
      reply += `• ${c.first_name} ${c.last_name || ''} — ${c.phone || ''} — ${c.lifecycle_stage || 'lead'}\n`;
    }

    return { success: true, reply, actions_taken: [], data: { contacts: local }, suggestions: ['Create contact', 'Show pipeline', 'Find [name]'] };
  }

  // ═══════════════════════════════════════════════════════════
  // DEAL OPERATIONS
  // ═══════════════════════════════════════════════════════════
  async _createDeal(client, message, crm) {
    const name = extractName(message);
    const amount = extractAmount(message) || 0;
    const title = name ? `${name} - New Deal` : 'New Deal';

    const PROB = { new_lead: 10, contacted: 25, qualified: 50, proposal_sent: 65, negotiation: 80, closed_won: 100, closed_lost: 0 };

    const [deal] = await this.sequelize.query(
      `INSERT INTO deals (client_id, title, stage, amount, probability, source, created_at, updated_at)
       VALUES (:cid, :title, 'new_lead', :amount, 10, 'crm_agent', NOW(), NOW()) RETURNING *`,
      { replacements: { cid: client.id, title, amount }, type: QueryTypes.SELECT }
    );

    this._logActivity(client.id, null, deal.id, 'deal_stage_change', `Deal created: ${title}`, { stage: 'new_lead', amount });

    return {
      success: true,
      reply: `Created deal **${title}** for $${amount.toLocaleString()} in the pipeline (stage: New Lead).`,
      actions_taken: [{ type: 'deal_created', crm: 'local', details: deal }],
      suggestions: ['Show pipeline', 'Move deal to contacted', 'Create task for this deal']
    };
  }

  async _listDeals(client, crm) {
    const deals = await this.sequelize.query(
      `SELECT d.*, c.first_name, c.last_name FROM deals d LEFT JOIN contacts c ON d.contact_id = c.id
       WHERE d.client_id = :cid AND d.stage NOT IN ('closed_won','closed_lost')
       ORDER BY d.updated_at DESC LIMIT 15`,
      { replacements: { cid: client.id }, type: QueryTypes.SELECT }
    );

    const [forecast] = await this.sequelize.query(
      `SELECT COALESCE(SUM(amount * probability / 100.0), 0) as forecast, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM deals WHERE client_id = :cid AND stage NOT IN ('closed_won','closed_lost')`,
      { replacements: { cid: client.id }, type: QueryTypes.SELECT }
    );

    let reply = `**Pipeline** — ${forecast.count} open deals | $${Number(forecast.total).toLocaleString()} total | $${Number(forecast.forecast).toLocaleString()} weighted forecast\n\n`;

    if (deals.length === 0) {
      reply += 'No open deals. Create one to get started!';
    } else {
      for (const d of deals) {
        const contact = d.first_name ? ` (${d.first_name} ${d.last_name || ''})` : '';
        reply += `• **${d.title}**${contact} — $${Number(d.amount || 0).toLocaleString()} — ${d.stage.replace(/_/g, ' ')}\n`;
      }
    }

    return { success: true, reply, actions_taken: [], data: { deals, forecast }, suggestions: ['Create new deal', 'Show tasks', 'Open pipeline board'] };
  }

  async _updateDeal(client, message, crm) {
    // Try to extract deal name and new stage
    const stageMap = {
      'new lead': 'new_lead', 'contacted': 'contacted', 'qualified': 'qualified',
      'proposal': 'proposal_sent', 'proposal sent': 'proposal_sent',
      'negotiation': 'negotiation', 'won': 'closed_won', 'closed won': 'closed_won',
      'lost': 'closed_lost', 'closed lost': 'closed_lost'
    };

    let targetStage = null;
    for (const [label, stage] of Object.entries(stageMap)) {
      if (message.toLowerCase().includes(label)) { targetStage = stage; break; }
    }

    const dealName = extractName(message);
    if (!dealName && !targetStage) {
      return { success: true, reply: 'Please specify the deal and target stage.\nExample: "Move John Smith deal to qualified" or "Close Maria deal as won"', actions_taken: [] };
    }

    // Find deal
    const [deal] = await this.sequelize.query(
      `SELECT * FROM deals WHERE client_id = :cid AND LOWER(title) LIKE :q AND stage NOT IN ('closed_won','closed_lost') LIMIT 1`,
      { replacements: { cid: client.id, q: `%${(dealName || '').toLowerCase()}%` }, type: QueryTypes.SELECT }
    );

    if (!deal) {
      return { success: true, reply: `Could not find an open deal matching "${dealName}".`, actions_taken: [], suggestions: ['Show pipeline', 'Create new deal'] };
    }

    if (!targetStage) targetStage = 'contacted'; // default: advance one step

    const PROB = { new_lead: 10, contacted: 25, qualified: 50, proposal_sent: 65, negotiation: 80, closed_won: 100, closed_lost: 0 };

    await this.sequelize.query(
      `UPDATE deals SET stage = :stage, probability = :prob, updated_at = NOW()
       ${targetStage === 'closed_won' ? ', actual_close_date = CURRENT_DATE' : ''} WHERE id = :id`,
      { replacements: { id: deal.id, stage: targetStage, prob: PROB[targetStage] || 0 } }
    );

    this._logActivity(client.id, deal.contact_id, deal.id, 'deal_stage_change', `Stage: ${deal.stage} → ${targetStage}`, { fromStage: deal.stage, toStage: targetStage });

    return {
      success: true,
      reply: `Moved **${deal.title}** from ${deal.stage.replace(/_/g, ' ')} → **${targetStage.replace(/_/g, ' ')}**.`,
      actions_taken: [{ type: 'deal_updated', crm: 'local', details: { id: deal.id, fromStage: deal.stage, toStage: targetStage } }],
      suggestions: ['Show pipeline', 'Create follow-up task']
    };
  }

  // ═══════════════════════════════════════════════════════════
  // TASK OPERATIONS
  // ═══════════════════════════════════════════════════════════
  async _createTask(client, message) {
    // Extract title — everything after "task:" or "task" or "follow up"
    let title = message.replace(/^.*?(task:?|todo:?|follow\s*up:?)\s*/i, '').trim();
    if (!title || title.length < 3) title = 'Follow up';

    // Extract due date
    let dueDate = null;
    if (/tomorrow/i.test(message)) { const d = new Date(); d.setDate(d.getDate() + 1); dueDate = d.toISOString().split('T')[0]; }
    else if (/today/i.test(message)) { dueDate = new Date().toISOString().split('T')[0]; }
    else if (/next week/i.test(message)) { const d = new Date(); d.setDate(d.getDate() + 7); dueDate = d.toISOString().split('T')[0]; }
    else { const m = message.match(/(\d{4}-\d{2}-\d{2})/); if (m) dueDate = m[1]; }

    // Clean title of date words
    title = title.replace(/\b(due|by|on|tomorrow|today|next week|\d{4}-\d{2}-\d{2})\b/gi, '').trim();
    if (!title) title = 'Follow up';

    const [task] = await this.sequelize.query(
      `INSERT INTO crm_tasks (client_id, title, task_type, priority, status, due_date, source, created_at, updated_at)
       VALUES (:cid, :title, 'follow_up', 'medium', 'pending', :due, 'crm_agent', NOW(), NOW()) RETURNING *`,
      { replacements: { cid: client.id, title, due: dueDate }, type: QueryTypes.SELECT }
    );

    return {
      success: true,
      reply: `Created task: **${title}**${dueDate ? ` (due ${dueDate})` : ''}.`,
      actions_taken: [{ type: 'task_created', crm: 'local', details: task }],
      suggestions: ['Show tasks', 'Show overdue tasks']
    };
  }

  async _listTasks(client) {
    const tasks = await this.sequelize.query(
      `SELECT * FROM crm_tasks WHERE client_id = :cid AND status IN ('pending','in_progress')
       ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC NULLS LAST LIMIT 10`,
      { replacements: { cid: client.id }, type: QueryTypes.SELECT }
    );

    if (tasks.length === 0) {
      return { success: true, reply: 'No pending tasks. You\'re all caught up!', actions_taken: [], suggestions: ['Create a task', 'Show pipeline'] };
    }

    let reply = `**Pending Tasks** (${tasks.length}):\n\n`;
    for (const t of tasks) {
      const overdue = t.due_date && t.due_date < new Date().toISOString().split('T')[0] ? ' ⚠️ OVERDUE' : '';
      reply += `• [${t.priority}] **${t.title}**${t.due_date ? ` — due ${t.due_date}` : ''}${overdue}\n`;
    }

    return { success: true, reply, actions_taken: [], data: { tasks }, suggestions: ['Complete task', 'Create task'] };
  }

  async _completeTask(client, message) {
    // Find task by keyword match
    const keyword = message.replace(/\b(complete|done|finish|task|todo)\b/gi, '').trim();
    const [task] = await this.sequelize.query(
      `SELECT * FROM crm_tasks WHERE client_id = :cid AND status = 'pending' AND LOWER(title) LIKE :q LIMIT 1`,
      { replacements: { cid: client.id, q: `%${keyword.toLowerCase()}%` }, type: QueryTypes.SELECT }
    );

    if (!task) {
      return { success: true, reply: `No pending task matching "${keyword}".`, actions_taken: [], suggestions: ['Show tasks'] };
    }

    await this.sequelize.query("UPDATE crm_tasks SET status = 'completed', completed_at = NOW() WHERE id = :id", { replacements: { id: task.id } });

    return {
      success: true,
      reply: `Completed task: **${task.title}** ✓`,
      actions_taken: [{ type: 'task_completed', crm: 'local', details: { id: task.id, title: task.title } }],
      suggestions: ['Show tasks', 'Show pipeline']
    };
  }

  // ═══════════════════════════════════════════════════════════
  // NEURAL FINDING HANDLER
  // ═══════════════════════════════════════════════════════════
  async _handleFindingAction(client, message, context, crm) {
    const title = context.finding_title || message;
    const actions = [];

    if (/missed.*call/i.test(title)) {
      // Get missed call phones
      const missed = await this.sequelize.query(
        `SELECT DISTINCT from_number FROM calls WHERE client_id = :cid AND call_status IN ('missed','no-answer') AND direction IN ('incoming','inbound') AND created_at > NOW() - INTERVAL '7 days' LIMIT 10`,
        { replacements: { cid: client.id }, type: QueryTypes.SELECT }
      );

      for (const c of missed) {
        if (c.from_number && c.from_number !== 'Unknown') {
          // Create contact locally
          try {
            await this.sequelize.query(
              `INSERT INTO contacts (client_id, first_name, phone, source, status, tags, lifecycle_stage, created_at, updated_at)
               VALUES (:cid, 'Missed Caller', :phone, 'missed_call', 'active', '["missed-call","neural-fix"]', 'lead', NOW(), NOW()) ON CONFLICT DO NOTHING`,
              { replacements: { cid: client.id, phone: c.from_number } }
            );
            actions.push({ type: 'contact_created', crm: 'local', details: { phone: c.from_number } });
          } catch (e) { /* duplicate */ }

          // Create task
          await this.sequelize.query(
            `INSERT INTO crm_tasks (client_id, title, task_type, priority, status, due_date, source, created_at, updated_at)
             VALUES (:cid, :title, 'call_back', 'high', 'pending', CURRENT_DATE, 'neural_treatment', NOW(), NOW())`,
            { replacements: { cid: client.id, title: `Call back ${c.from_number}` } }
          );
          actions.push({ type: 'task_created', crm: 'local', details: { phone: c.from_number } });
        }
      }

      return {
        success: true,
        reply: `Fixed! Created ${actions.filter(a => a.type === 'contact_created').length} contacts and ${actions.filter(a => a.type === 'task_created').length} callback tasks for missed callers.`,
        actions_taken: actions,
        suggestions: ['Show tasks', 'Show contacts', 'Send SMS to missed callers']
      };
    }

    if (/stale.*deal/i.test(title) || /no.*activity/i.test(title)) {
      const stale = await this.sequelize.query(
        `SELECT * FROM deals WHERE client_id = :cid AND stage NOT IN ('closed_won','closed_lost') AND updated_at < NOW() - INTERVAL '7 days' LIMIT 10`,
        { replacements: { cid: client.id }, type: QueryTypes.SELECT }
      );

      for (const d of stale) {
        await this.sequelize.query(
          `INSERT INTO crm_tasks (client_id, deal_id, title, task_type, priority, status, due_date, source, created_at, updated_at)
           VALUES (:cid, :did, :title, 'follow_up', 'high', 'pending', CURRENT_DATE, 'neural_treatment', NOW(), NOW())`,
          { replacements: { cid: client.id, did: d.id, title: `Follow up on stale deal: ${d.title}` } }
        );
        actions.push({ type: 'task_created', crm: 'local', details: { dealId: d.id, title: d.title } });
      }

      return {
        success: true,
        reply: `Created ${actions.length} follow-up tasks for stale deals.`,
        actions_taken: actions,
        suggestions: ['Show tasks', 'Show pipeline']
      };
    }

    if (/no.?show/i.test(title)) {
      return {
        success: true,
        reply: `To address no-shows, I recommend enabling appointment reminders.\n\nI can:\n• Create reminder tasks for upcoming appointments\n• Send re-engagement SMS to no-show contacts\n\nJust say "Send SMS to no-show contacts" or "Create reminder tasks".`,
        actions_taken: [],
        suggestions: ['Send SMS to no-show contacts', 'Create reminder tasks', 'Show appointments']
      };
    }

    // Generic finding handler
    return {
      success: true,
      reply: `I see the finding: "${title}"\n\nHere's what I can do:\n• Create contacts for affected callers\n• Create follow-up tasks\n• Send SMS to re-engage\n\nWhat would you like me to do?`,
      actions_taken: [],
      suggestions: ['Create follow-up tasks', 'Send SMS', 'Show contacts']
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SMS
  // ═══════════════════════════════════════════════════════════
  async _sendSms(client, message) {
    const phone = extractPhone(message);
    if (!phone) {
      return { success: true, reply: 'Please provide a phone number.\nExample: "Send SMS to +18135551234 Hey, following up!"', actions_taken: [] };
    }

    // Extract message body (everything after the phone number)
    const bodyMatch = message.match(/(?:message|saying|text|body|:)\s*["']?(.+?)["']?\s*$/i) || message.match(new RegExp(phone.replace(/[+]/g, '\\+') + '\\s+(.+)', 'i'));
    const body = bodyMatch ? bodyMatch[1] : `Hi, this is ${client.business_name}. Just following up — how can we help?`;

    return {
      success: true,
      reply: `To send SMS, use the Messages section in the sidebar.\n\n**Draft prepared:**\nTo: ${phone}\nMessage: ${body}`,
      actions_taken: [],
      suggestions: ['Show contacts', 'Create task', 'Show messages']
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SYNC
  // ═══════════════════════════════════════════════════════════
  async _syncCrm(client, message) {
    const from = /from\s+(ghl|hubspot|zoho)/i.exec(message);
    const to = /to\s+(ghl|hubspot|zoho)/i.exec(message);

    if (!from || !to) {
      return { success: true, reply: 'Please specify source and target.\nExample: "Sync contacts from GHL to HubSpot"', actions_taken: [] };
    }

    return {
      success: true,
      reply: `Cross-CRM sync from ${from[1].toUpperCase()} to ${to[1].toUpperCase()} is a powerful feature. For safety, I'll prepare the sync for your review:\n\n1. I'll fetch contacts from ${from[1].toUpperCase()}\n2. Check for duplicates in ${to[1].toUpperCase()}\n3. Show you what would be created\n\nSay "proceed with sync" to execute.`,
      actions_taken: [],
      suggestions: [`List contacts in ${from[1]}`, `List contacts in ${to[1]}`]
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HELP
  // ═══════════════════════════════════════════════════════════
  _showHelp(client) {
    const crms = this._getConnectedCrms(client);
    return {
      success: true,
      reply: `**CRM Agent Commands**\n\n**Contacts:**\n• "Create contact for [name] [phone] [email]"\n• "Find [name]"\n• "List contacts"\n\n**Deals:**\n• "Create deal for [name] worth $[amount]"\n• "Show pipeline"\n• "Move [deal] to [stage]"\n• "Close [deal] as won/lost"\n\n**Tasks:**\n• "Create task: [title] due [date]"\n• "Show tasks"\n• "Complete task [title]"\n\n**Neural Actions:**\n• "Fix the missed calls finding"\n• "Fix stale deals"\n\n**Connected CRMs:** ${crms.map(c => c.toUpperCase()).join(', ')}\nAdd "in GHL" or "in HubSpot" to target a specific CRM.`,
      actions_taken: [],
      suggestions: ['Show contacts', 'Show pipeline', 'Show tasks']
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CRM API HELPERS
  // ═══════════════════════════════════════════════════════════
  async _ghlRequest(client, method, path, body) {
    const url = GHL_BASE + path;
    const opts = {
      method,
      headers: { 'Authorization': `Bearer ${client.ghl_api_key}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  async _hubspotRequest(token, method, path, body) {
    const url = HS_BASE + path;
    const opts = {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  async _getZohoToken(client) {
    const zoho = client.settings?.integration?.zoho;
    if (!zoho?.enabled || !zoho?.refreshToken) return null;
    try {
      const res = await fetch(`https://accounts.zoho.${zoho.region || 'com'}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&client_id=${zoho.clientId}&client_secret=${zoho.clientSecret}&refresh_token=${zoho.refreshToken}`
      });
      const data = await res.json();
      return data.access_token;
    } catch (e) { return null; }
  }

  async _zohoRequest(token, client, method, path, body) {
    const region = client.settings?.integration?.zoho?.region || 'com';
    const url = `https://www.zohoapis.${region}${path}`;
    const opts = {
      method,
      headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  _logActivity(clientId, contactId, dealId, type, title, metadata) {
    this.sequelize.query(
      `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, metadata, created_at)
       VALUES (:cid, :contactId, :dealId, :type, :title, :meta, NOW())`,
      { replacements: { cid: clientId, contactId: contactId || null, dealId: dealId || null, type, title, meta: JSON.stringify(metadata || {}) } }
    ).catch(e => console.error('[CRM Agent] Activity log error:', e.message));
  }

  // ═══════════════════════════════════════════════════════════
  // CAPABILITIES
  // ═══════════════════════════════════════════════════════════
  async getCapabilities(clientId) {
    const client = await this._getClient(clientId);
    if (!client) return { success: false, error: 'Client not found' };
    return {
      success: true,
      connected_crms: this._getConnectedCrms(client),
      business_name: client.business_name,
      operations: ['create_contact', 'find_contact', 'list_contacts', 'create_deal', 'list_deals', 'update_deal', 'create_task', 'list_tasks', 'complete_task', 'fix_finding', 'send_sms', 'sync_crm']
    };
  }
}

module.exports = CrmNlpAgent;
