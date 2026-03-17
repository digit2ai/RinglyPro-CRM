/**
 * CW Carriers — HubSpot CRM Agent
 * NLP-powered conversational interface for HubSpot CRUD operations
 */
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

const anthropic = new Anthropic();

router.use(auth);

const SYSTEM_PROMPT = `You are the HubSpot CRM Agent for CW Carriers USA, a freight brokerage.
You help the user manage their HubSpot CRM using natural language.

Parse the user's message and return JSON only with this structure:
{ "intent": "<intent_name>", "entities": { ... }, "confidence": 0.0-1.0, "reply": "<friendly confirmation message>" }

Available intents:
- create_contact: Create a new HubSpot contact. Entities: { firstname, lastname, email, phone, company }
- update_contact: Update an existing contact. Entities: { search_query, updates: { firstname?, lastname?, email?, phone?, company? } }
- delete_contact: Delete a HubSpot contact. Entities: { search_query }
- search_contacts: Search/list contacts. Entities: { query }
- create_deal: Create a new deal. Entities: { dealname, amount, pipeline, dealstage, closedate, description }
- update_deal: Update an existing deal. Entities: { search_query, updates: { dealname?, amount?, dealstage?, closedate? } }
- delete_deal: Delete a HubSpot deal. Entities: { search_query }
- search_deals: Search deals. Entities: { query }
- show_pipeline: Show pipeline overview. Entities: { pipeline_id? }
- move_deal: Move deal to a different stage. Entities: { search_query, new_stage }
- show_metrics: Show CRM metrics/stats. Entities: {}
- create_task: Create a follow-up task. Entities: { subject, body, priority }
- log_activity: Log an activity/note. Entities: { contact_query, note }
- help: Show available commands. Entities: {}

HubSpot deal stages (default pipeline): appointmentscheduled, qualifiedtobuy, presentationscheduled, decisionmakerboughtin, contractsent, closedwon, closedlost

For freight context: deals often represent loads/shipments. Contacts are carriers, shippers, or prospects.

Always set a meaningful reply message that confirms the action being taken.`;

async function parseNLP(userInput) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }]
    });
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { intent: 'help', entities: {}, confidence: 0, reply: '' };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('CW CRM Agent NLP error:', err.message);
    return { intent: 'help', entities: {}, confidence: 0, reply: '' };
  }
}

// POST /chat — Main conversational endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const parsed = await parseNLP(message);
    const { intent, entities } = parsed;
    let reply = parsed.reply || '';
    let actions_taken = [];
    let suggestions = [];
    let data = null;

    switch (intent) {
      case 'create_contact': {
        const result = await hubspot.hubspotRequest('POST', '/crm/v3/objects/contacts', {
          properties: {
            firstname: entities.firstname || '',
            lastname: entities.lastname || '',
            email: entities.email || '',
            phone: entities.phone || '',
            company: entities.company || ''
          }
        });
        if (result.success) {
          actions_taken.push({ type: 'create_contact', crm: 'hubspot', details: `Created ${entities.firstname} ${entities.lastname}` });
          reply = reply || `Contact "${entities.firstname} ${entities.lastname}" created in HubSpot.`;
          // Also save locally
          try {
            await sequelize.query(
              `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, hubspot_id, hubspot_synced_at, created_at, updated_at)
               VALUES ('prospect', $1, $2, $3, $4, $5, NOW(), NOW(), NOW())`,
              { bind: [entities.company || null, `${entities.firstname || ''} ${entities.lastname || ''}`.trim(), entities.email || null, entities.phone || null, result.data?.id] }
            );
          } catch (e) { /* non-critical */ }
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: result.error });
          reply = `Failed to create contact: ${result.error}`;
        }
        suggestions = ['Search contacts', 'Create another contact', 'Show pipeline'];
        break;
      }

      case 'update_contact': {
        const searchResult = await hubspot.searchContacts(entities.search_query || '');
        if (!searchResult.success || !searchResult.data?.results?.length) {
          reply = `No contacts found matching "${entities.search_query}". Try a different search term.`;
          suggestions = ['Search contacts', 'Create contact'];
          break;
        }
        const contact = searchResult.data.results[0];
        const updateResult = await hubspot.updateContact(contact.id, entities.updates || {});
        if (updateResult.success) {
          actions_taken.push({ type: 'update_contact', crm: 'hubspot', details: `Updated ${contact.properties?.firstname} ${contact.properties?.lastname}` });
          reply = reply || `Contact "${contact.properties?.firstname} ${contact.properties?.lastname}" updated in HubSpot.`;
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: updateResult.error });
          reply = `Failed to update contact: ${updateResult.error}`;
        }
        suggestions = ['Search contacts', 'Show pipeline'];
        break;
      }

      case 'delete_contact': {
        const searchResult = await hubspot.searchContacts(entities.search_query || '');
        if (!searchResult.success || !searchResult.data?.results?.length) {
          reply = `No contacts found matching "${entities.search_query}".`;
          suggestions = ['Search contacts'];
          break;
        }
        const contact = searchResult.data.results[0];
        const name = `${contact.properties?.firstname || ''} ${contact.properties?.lastname || ''}`.trim();
        const deleteResult = await hubspot.deleteContact(contact.id);
        if (deleteResult.success) {
          actions_taken.push({ type: 'delete_contact', crm: 'hubspot', details: `Deleted ${name}` });
          reply = reply || `Contact "${name}" has been deleted from HubSpot.`;
          // Remove local hubspot_id reference
          try {
            await sequelize.query(`UPDATE cw_contacts SET hubspot_id = NULL WHERE hubspot_id = $1`, { bind: [contact.id] });
          } catch (e) { /* non-critical */ }
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: deleteResult.error });
          reply = `Failed to delete contact: ${deleteResult.error}`;
        }
        suggestions = ['Search contacts', 'Create contact'];
        break;
      }

      case 'search_contacts': {
        const searchResult = await hubspot.searchContacts(entities.query || '');
        if (searchResult.success && searchResult.data?.results?.length) {
          const contacts = searchResult.data.results.map(c => ({
            id: c.id,
            name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim(),
            email: c.properties?.email || '—',
            phone: c.properties?.phone || '—',
            company: c.properties?.company || '—'
          }));
          data = contacts;
          reply = reply || `Found ${contacts.length} contacts in HubSpot:`;
        } else {
          reply = `No contacts found matching "${entities.query}".`;
        }
        suggestions = ['Create contact', 'Search deals', 'Show pipeline'];
        break;
      }

      case 'create_deal': {
        const result = await hubspot.createDeal({
          load_ref: '',
          origin: '',
          destination: '',
          rate_usd: entities.amount || 0,
          status: 'open',
          freight_type: entities.description || '',
          ...entities
        });
        // Override with custom deal if direct properties given
        if (entities.dealname) {
          const directResult = await hubspot.hubspotRequest('POST', '/crm/v3/objects/deals', {
            properties: {
              dealname: entities.dealname,
              amount: String(entities.amount || 0),
              pipeline: entities.pipeline || 'default',
              dealstage: entities.dealstage || 'appointmentscheduled',
              closedate: entities.closedate || null,
              description: entities.description || ''
            }
          });
          if (directResult.success) {
            actions_taken.push({ type: 'create_deal', crm: 'hubspot', details: `Created deal "${entities.dealname}"` });
            reply = reply || `Deal "${entities.dealname}" created in HubSpot pipeline.`;
          } else {
            actions_taken.push({ type: 'error', crm: 'hubspot', details: directResult.error });
            reply = `Failed to create deal: ${directResult.error}`;
          }
        } else if (result.success) {
          actions_taken.push({ type: 'create_deal', crm: 'hubspot', details: 'Deal created' });
          reply = reply || 'Deal created in HubSpot.';
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: result.error });
          reply = `Failed to create deal: ${result.error}`;
        }
        suggestions = ['Show pipeline', 'Search deals', 'Create another deal'];
        break;
      }

      case 'update_deal': {
        const searchResult = await hubspot.searchDeals(entities.search_query || '');
        if (!searchResult.success || !searchResult.data?.results?.length) {
          reply = `No deals found matching "${entities.search_query}".`;
          suggestions = ['Search deals', 'Create deal'];
          break;
        }
        const deal = searchResult.data.results[0];
        const updateResult = await hubspot.updateDeal(deal.id, entities.updates || {});
        if (updateResult.success) {
          actions_taken.push({ type: 'update_deal', crm: 'hubspot', details: `Updated "${deal.properties?.dealname}"` });
          reply = reply || `Deal "${deal.properties?.dealname}" updated.`;
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: updateResult.error });
          reply = `Failed to update deal: ${updateResult.error}`;
        }
        suggestions = ['Show pipeline', 'Search deals'];
        break;
      }

      case 'delete_deal': {
        const searchResult = await hubspot.searchDeals(entities.search_query || '');
        if (!searchResult.success || !searchResult.data?.results?.length) {
          reply = `No deals found matching "${entities.search_query}".`;
          suggestions = ['Search deals'];
          break;
        }
        const deal = searchResult.data.results[0];
        const deleteResult = await hubspot.deleteDeal(deal.id);
        if (deleteResult.success) {
          actions_taken.push({ type: 'delete_deal', crm: 'hubspot', details: `Deleted "${deal.properties?.dealname}"` });
          reply = reply || `Deal "${deal.properties?.dealname}" has been deleted from HubSpot.`;
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: deleteResult.error });
          reply = `Failed to delete deal: ${deleteResult.error}`;
        }
        suggestions = ['Show pipeline', 'Create deal'];
        break;
      }

      case 'search_deals': {
        const searchResult = await hubspot.searchDeals(entities.query || '');
        if (searchResult.success && searchResult.data?.results?.length) {
          const deals = searchResult.data.results.map(d => ({
            id: d.id,
            name: d.properties?.dealname || '—',
            amount: d.properties?.amount || '0',
            stage: d.properties?.dealstage || '—',
            close: d.properties?.closedate || '—'
          }));
          data = deals;
          reply = reply || `Found ${deals.length} deals in HubSpot:`;
        } else {
          reply = `No deals found matching "${entities.query}".`;
        }
        suggestions = ['Create deal', 'Show pipeline', 'Search contacts'];
        break;
      }

      case 'show_pipeline': {
        const dealsResult = await hubspot.getDealsWithStages(entities.pipeline_id || 'default');
        if (dealsResult.success && dealsResult.data?.results?.length) {
          const stageGroups = {};
          for (const d of dealsResult.data.results) {
            const stage = d.properties?.dealstage || 'unknown';
            if (!stageGroups[stage]) stageGroups[stage] = { count: 0, value: 0 };
            stageGroups[stage].count++;
            stageGroups[stage].value += parseFloat(d.properties?.amount || 0);
          }
          data = { total: dealsResult.data.results.length, stages: stageGroups };
          reply = reply || `Pipeline overview: ${dealsResult.data.results.length} deals across ${Object.keys(stageGroups).length} stages.`;
        } else {
          reply = 'No deals in pipeline yet.';
        }
        suggestions = ['Create deal', 'Search deals', 'Show metrics'];
        break;
      }

      case 'move_deal': {
        const searchResult = await hubspot.searchDeals(entities.search_query || '');
        if (!searchResult.success || !searchResult.data?.results?.length) {
          reply = `No deals found matching "${entities.search_query}".`;
          break;
        }
        const deal = searchResult.data.results[0];
        const moveResult = await hubspot.updateDealStage(deal.id, entities.new_stage || 'qualifiedtobuy');
        if (moveResult.success) {
          actions_taken.push({ type: 'move_deal', crm: 'hubspot', details: `Moved "${deal.properties?.dealname}" to ${entities.new_stage}` });
          reply = reply || `Deal "${deal.properties?.dealname}" moved to stage "${entities.new_stage}".`;
        } else {
          actions_taken.push({ type: 'error', crm: 'hubspot', details: moveResult.error });
          reply = `Failed to move deal: ${moveResult.error}`;
        }
        suggestions = ['Show pipeline', 'Search deals'];
        break;
      }

      case 'show_metrics': {
        const metricsResult = await hubspot.getPipelineMetrics();
        if (metricsResult.success) {
          data = metricsResult.data;
          reply = reply || `HubSpot Metrics:\n• Total Deals: ${metricsResult.data.total_deals}\n• Open: ${metricsResult.data.open_deals}\n• Won: ${metricsResult.data.won_deals}\n• Pipeline Value: $${Number(metricsResult.data.total_pipeline).toLocaleString()}\n• Won Revenue: $${Number(metricsResult.data.won_revenue).toLocaleString()}`;
        } else {
          reply = 'Unable to fetch HubSpot metrics.';
        }
        suggestions = ['Show pipeline', 'Search contacts', 'Search deals'];
        break;
      }

      case 'create_task': {
        const result = await hubspot.createTask({
          subject: entities.subject || 'Follow-up',
          body: entities.body || '',
          priority: entities.priority || 'MEDIUM'
        });
        if (result.success) {
          actions_taken.push({ type: 'create_task', crm: 'hubspot', details: `Task: ${entities.subject}` });
          reply = reply || `Task "${entities.subject}" created in HubSpot.`;
        } else {
          reply = `Failed to create task: ${result.error}`;
        }
        suggestions = ['Show pipeline', 'Search contacts'];
        break;
      }

      case 'log_activity': {
        if (entities.contact_query) {
          const searchResult = await hubspot.searchContacts(entities.contact_query);
          if (searchResult.success && searchResult.data?.results?.length) {
            const contactId = searchResult.data.results[0].id;
            await hubspot.logCallActivity({
              title: `Note: ${entities.note || entities.contact_query}`,
              summary: entities.note || '',
              direction: 'outbound',
              duration_sec: 0,
              hubspot_contact_id: contactId
            });
            reply = reply || `Activity logged for "${entities.contact_query}" in HubSpot.`;
            actions_taken.push({ type: 'log_activity', crm: 'hubspot', details: `Note added` });
          } else {
            reply = `Contact "${entities.contact_query}" not found in HubSpot.`;
          }
        } else {
          reply = 'Please specify which contact to log the activity for.';
        }
        suggestions = ['Search contacts', 'Show pipeline'];
        break;
      }

      case 'help':
      default: {
        reply = `I'm your HubSpot CRM Agent. Here's what I can do:\n\n**Contacts:**\n• Create contact for [name] at [company]\n• Update [name]'s phone to [number]\n• Delete contact [name]\n• Search contacts for [query]\n\n**Deals:**\n• Create deal "[name]" for $[amount]\n• Move deal "[name]" to closed won\n• Update deal "[name]" amount to $[value]\n• Delete deal "[name]"\n• Search deals for [query]\n\n**Pipeline:**\n• Show pipeline\n• Show metrics\n\n**Tasks & Activities:**\n• Create task: Follow up with [name]\n• Log note for [contact]: [message]`;
        suggestions = ['Show pipeline', 'Search contacts', 'Show metrics', 'Create contact for John Smith'];
        break;
      }
    }

    // Log command
    try {
      await sequelize.query(
        `INSERT INTO cw_nlp_commands (user_input, parsed_intent, parsed_entities, action_taken, result_summary, success, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        { bind: [message, intent, JSON.stringify(entities), intent, reply.substring(0, 200), actions_taken.length > 0 || intent === 'help'] }
      );
    } catch (e) { /* non-critical */ }

    res.json({ success: true, reply, actions_taken, suggestions, data, intent, confidence: parsed.confidence });
  } catch (err) {
    console.error('CW CRM Agent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /capabilities — Connection status
router.get('/capabilities', async (req, res) => {
  try {
    const hasHubSpot = !!process.env.HUBSPOT_ACCESS_TOKEN;
    const connected_crms = ['hubspot'];
    if (!hasHubSpot) connected_crms.length = 0;

    res.json({
      success: true,
      connected_crms,
      business_name: 'CW Carriers USA',
      features: ['contacts', 'deals', 'pipeline', 'tasks', 'activities']
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
