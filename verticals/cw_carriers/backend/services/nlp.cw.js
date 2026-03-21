const Anthropic = require('@anthropic-ai/sdk');
const sequelize = require('./db.cw');
const reports = require('./reports.cw');

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a freight logistics CRM assistant for CW Carriers USA.
Extract the intent and entities from the user's command.
Return JSON only with this structure: { "intent": "<intent_name>", "entities": { ... }, "confidence": 0.0-1.0 }

Available intents:
- show_open_loads: List open loads
- show_loads: List all loads (optionally filtered)
- show_contacts: List contacts (optionally filtered by type)
- call_carrier: Initiate outbound call to a carrier
- update_load_status: Change a load's status
- find_carriers_for_load: Find matching carriers for a load's lane
- create_contact: Add a new contact
- add_note: Add a note/activity to a contact in HubSpot
- show_call_history: Show call log history
- show_dashboard: Show dashboard KPIs
- schedule_callback: Create a follow-up task
- send_status_update: Call a shipper with load status
- search_hubspot: Search HubSpot contacts
- show_lane_stats: Show lane profitability analytics
- show_carrier_stats: Show carrier performance
- generate_report: Generate a PDF report
- help: User needs assistance or command not understood

Entity extraction examples:
- "show loads delivered late this week" -> { intent: "show_loads", entities: { status: "delivered", timeframe: "this_week", late: true } }
- "call carriers for load #1042" -> { intent: "call_carrier", entities: { load_id: 1042 } }
- "add note to PepsiCo - confirmed Q2 volume up 15%" -> { intent: "add_note", entities: { company: "PepsiCo", note: "confirmed Q2 volume up 15%" } }
- "who are our top 5 carriers this month" -> { intent: "show_carrier_stats", entities: { limit: 5, timeframe: "this_month" } }`;

async function parseCommand(userInput) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }]
    });

    const text = response.content[0].text.trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { intent: 'help', entities: {}, confidence: 0 };
    }
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('CW NLP parse error:', err.message);
    return { intent: 'help', entities: {}, confidence: 0 };
  }
}

async function executeIntent(parsed, helpers) {
  const { intent, entities } = parsed;
  let result = { success: false, message: 'Unknown intent' };

  try {
    switch (intent) {
      case 'show_open_loads': {
        // Query both cw_loads and lg_loads
        const [cwRows] = await sequelize.query(
          `SELECT l.load_ref, l.origin, l.destination, l.rate_usd, l.pickup_date, l.status, l.freight_type,
                  sc.company_name as shipper_name, cc.company_name as carrier_name, 'cw' as source
           FROM cw_loads l LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
           WHERE l.status = 'open' ORDER BY l.pickup_date ASC LIMIT 25`
        );
        const [lgRows] = await sequelize.query(
          `SELECT load_ref, origin_city || ', ' || origin_state as origin, destination_city || ', ' || destination_state as destination,
                  buy_rate as rate_usd, pickup_date, status, equipment_type as freight_type,
                  shipper_name, NULL as carrier_name, 'lg' as source
           FROM lg_loads WHERE status = 'open' ORDER BY pickup_date ASC LIMIT 25`
        );
        const allRows = [...cwRows, ...lgRows].slice(0, 50);
        // Also get total count
        const [[cwCnt]] = await sequelize.query(`SELECT COUNT(*) as c FROM cw_loads WHERE status = 'open'`);
        const [[lgCnt]] = await sequelize.query(`SELECT COUNT(*) as c FROM lg_loads WHERE status = 'open'`);
        const totalOpen = parseInt(cwCnt.c || 0) + parseInt(lgCnt.c || 0);
        result = { success: true, data: allRows, message: `Found ${totalOpen} open loads (showing first ${allRows.length})` };
        break;
      }
      case 'show_loads': {
        let cwWhere = 'WHERE 1=1';
        let lgWhere = 'WHERE 1=1';
        const cwBinds = [];
        const lgBinds = [];
        if (entities.status) {
          cwBinds.push(entities.status); cwWhere += ` AND l.status = $${cwBinds.length}`;
          lgBinds.push(entities.status); lgWhere += ` AND status = $${lgBinds.length}`;
        }
        const [cwRows] = await sequelize.query(
          `SELECT l.load_ref, l.origin, l.destination, l.rate_usd, l.pickup_date, l.status,
                  sc.company_name as shipper_name, cc.company_name as carrier_name, 'cw' as source
           FROM cw_loads l LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
           ${cwWhere} ORDER BY l.created_at DESC LIMIT 25`, { bind: cwBinds }
        );
        const [lgRows] = await sequelize.query(
          `SELECT load_ref, origin_city || ', ' || origin_state as origin, destination_city || ', ' || destination_state as destination,
                  buy_rate as rate_usd, pickup_date, status, shipper_name, NULL as carrier_name, 'lg' as source
           FROM lg_loads ${lgWhere} ORDER BY created_at DESC LIMIT 25`, { bind: lgBinds }
        );
        const allRows = [...cwRows, ...lgRows].slice(0, 50);
        result = { success: true, data: allRows, message: `Found ${allRows.length} loads` };
        break;
      }
      case 'show_contacts': {
        let where = 'WHERE 1=1';
        const binds = [];
        if (entities.type || entities.contact_type) {
          binds.push(entities.type || entities.contact_type);
          where += ` AND contact_type = $${binds.length}`;
        }
        const [rows] = await sequelize.query(
          `SELECT * FROM cw_contacts ${where} ORDER BY company_name ASC LIMIT 50`,
          { bind: binds }
        );
        result = { success: true, data: rows, message: `Found ${rows.length} contacts` };
        break;
      }
      case 'call_carrier': {
        if (!entities.load_id && !entities.carrier_id) {
          result = { success: false, message: 'Please specify a load ID or carrier ID' };
          break;
        }
        if (entities.load_id) {
          const [carriers] = await sequelize.query(
            `SELECT id FROM cw_contacts WHERE contact_type = 'carrier' AND phone IS NOT NULL LIMIT 10`
          );
          const carrierIds = carriers.map(c => c.id);
          if (helpers && helpers.rachel) {
            const campaignResult = await helpers.rachel.runCarrierCoverage(entities.load_id, carrierIds);
            result = { success: true, data: campaignResult, message: `Carrier coverage campaign launched for load #${entities.load_id}` };
          } else {
            result = { success: true, data: { carrierIds }, message: `Found ${carrierIds.length} carriers for coverage campaign` };
          }
        }
        break;
      }
      case 'update_load_status': {
        if (!entities.load_id || !entities.status) {
          result = { success: false, message: 'Please specify load ID and new status' };
          break;
        }
        await sequelize.query(
          `UPDATE cw_loads SET status = $1, updated_at = NOW() WHERE id = $2`,
          { bind: [entities.status, entities.load_id] }
        );
        result = { success: true, message: `Load #${entities.load_id} updated to ${entities.status}` };
        break;
      }
      case 'find_carriers_for_load': {
        const loadId = entities.load_id;
        const [[load]] = loadId ? await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [loadId] }) : [[]];
        const origin = entities.origin || load?.origin;
        const destination = entities.destination || load?.destination;
        if (!origin && !destination) {
          result = { success: false, message: 'Please specify a lane (origin/destination) or load ID' };
          break;
        }
        const [carriers] = await sequelize.query(
          `SELECT * FROM cw_contacts WHERE contact_type = 'carrier'
           AND (lanes && ARRAY[$1::text] OR lanes && ARRAY[$2::text]
                OR $1 = ANY(lanes) OR $2 = ANY(lanes))
           LIMIT 20`,
          { bind: [origin || '', destination || ''] }
        );
        result = { success: true, data: carriers, message: `Found ${carriers.length} carriers matching lane` };
        break;
      }
      case 'create_contact': {
        const contactData = {
          contact_type: entities.contact_type || entities.type || 'prospect',
          company_name: entities.company || entities.company_name || null,
          full_name: entities.name || entities.full_name || null,
          email: entities.email || null,
          phone: entities.phone || null
        };
        const [, meta] = await sequelize.query(
          `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
          { bind: [contactData.contact_type, contactData.company_name, contactData.full_name, contactData.email, contactData.phone] }
        );
        result = { success: true, message: `Contact created: ${contactData.company_name || contactData.full_name}` };
        break;
      }
      case 'add_note': {
        if (helpers && helpers.hubspot && entities.company) {
          const hsResult = await helpers.hubspot.searchContacts(entities.company);
          if (hsResult.success && hsResult.data?.results?.length) {
            const contactId = hsResult.data.results[0].id;
            await helpers.hubspot.logCallActivity({
              title: `Note: ${entities.note || entities.company}`,
              summary: entities.note || '',
              direction: 'outbound',
              duration_sec: 0,
              hubspot_contact_id: contactId
            });
            result = { success: true, message: `Note added to ${entities.company} in HubSpot` };
          } else {
            result = { success: false, message: `Contact "${entities.company}" not found in HubSpot` };
          }
        } else {
          result = { success: false, message: 'HubSpot service not available or company not specified' };
        }
        break;
      }
      case 'show_call_history': {
        const limit = entities.limit || 20;
        const [rows] = await sequelize.query(
          `SELECT cl.*, c.company_name, c.full_name as contact_name
           FROM cw_call_logs cl
           LEFT JOIN cw_contacts c ON cl.contact_id = c.id
           ORDER BY cl.created_at DESC LIMIT $1`,
          { bind: [limit] }
        );
        result = { success: true, data: rows, message: `Last ${rows.length} calls` };
        break;
      }
      case 'show_dashboard': {
        const [[cwOpen]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads WHERE status = 'open'`);
        const [[lgOpen]] = await sequelize.query(`SELECT COUNT(*) as count FROM lg_loads WHERE status = 'open'`);
        const [[cwCov]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads WHERE status = 'covered' AND updated_at::date = CURRENT_DATE`);
        const [[cwCarr]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_contacts WHERE contact_type = 'carrier'`);
        const [[lgCarr]] = await sequelize.query(`SELECT COUNT(*) as count FROM lg_carriers`);
        const [[callsToday]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE created_at::date = CURRENT_DATE`);
        const [[cwTotal]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads`);
        const [[lgTotal]] = await sequelize.query(`SELECT COUNT(*) as count FROM lg_loads`);
        const totalLoads = parseInt(cwTotal.count || 0) + parseInt(lgTotal.count || 0);
        const openLoads = parseInt(cwOpen.count || 0) + parseInt(lgOpen.count || 0);
        result = {
          success: true,
          data: {
            total_loads: totalLoads,
            open_loads: openLoads,
            coverage_rate: totalLoads > 0 ? Math.round(((totalLoads - openLoads) / totalLoads) * 100) + '%' : '0%',
            active_carriers: parseInt(cwCarr.count || 0) + parseInt(lgCarr.count || 0),
            covered_today: parseInt(cwCov.count || 0),
            calls_today: parseInt(callsToday.count || 0),
          },
          message: `Dashboard: ${totalLoads.toLocaleString()} total loads, ${openLoads.toLocaleString()} open`
        };
        break;
      }
      case 'schedule_callback': {
        if (helpers && helpers.hubspot) {
          await helpers.hubspot.createTask({
            subject: entities.subject || `Follow-up: ${entities.company || 'Unknown'}`,
            body: entities.note || entities.reason || '',
            priority: entities.priority || 'MEDIUM'
          });
          result = { success: true, message: `Follow-up task created for ${entities.company || 'contact'}` };
        } else {
          result = { success: false, message: 'HubSpot service not available' };
        }
        break;
      }
      case 'send_status_update': {
        if (!entities.company && !entities.contact_id) {
          result = { success: false, message: 'Please specify a company or contact' };
          break;
        }
        let contact;
        if (entities.contact_id) {
          [[contact]] = await sequelize.query(`SELECT * FROM cw_contacts WHERE id = $1`, { bind: [entities.contact_id] });
        } else {
          [[contact]] = await sequelize.query(
            `SELECT * FROM cw_contacts WHERE company_name ILIKE $1 LIMIT 1`,
            { bind: [`%${entities.company}%`] }
          );
        }
        if (!contact || !contact.phone) {
          result = { success: false, message: 'Contact not found or no phone number' };
          break;
        }
        if (helpers && helpers.rachel) {
          const callResult = await helpers.rachel.makeOutboundCall(contact.phone, 'status_update', entities);
          result = { success: callResult.success, message: `Status update call initiated to ${contact.company_name || contact.full_name}` };
        } else {
          result = { success: false, message: 'Voice service not available' };
        }
        break;
      }
      case 'search_hubspot': {
        if (helpers && helpers.hubspot) {
          const hsResult = await helpers.hubspot.searchContacts(entities.query || entities.company || '');
          result = { success: hsResult.success, data: hsResult.data?.results || [], message: `Found ${hsResult.data?.results?.length || 0} HubSpot contacts` };
        }
        break;
      }
      case 'show_lane_stats': {
        const [rows] = await sequelize.query(
          `SELECT origin, destination,
            COUNT(*) as total_loads,
            COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
            AVG(rate_usd) as avg_rate,
            SUM(rate_usd) as total_revenue
           FROM cw_loads
           GROUP BY origin, destination
           ORDER BY total_loads DESC LIMIT 20`
        );
        result = { success: true, data: rows, message: `Lane statistics for ${rows.length} lanes` };
        break;
      }
      case 'show_carrier_stats': {
        const limit = entities.limit || 10;
        const [rows] = await sequelize.query(
          `SELECT c.id, c.company_name, c.full_name,
            COUNT(l.id) as total_loads,
            COUNT(l.id) FILTER (WHERE l.status = 'delivered') as delivered,
            AVG(l.rate_usd) as avg_rate
           FROM cw_contacts c
           LEFT JOIN cw_loads l ON l.carrier_id = c.id
           WHERE c.contact_type = 'carrier'
           GROUP BY c.id, c.company_name, c.full_name
           ORDER BY total_loads DESC LIMIT $1`,
          { bind: [limit] }
        );
        result = { success: true, data: rows, message: `Top ${rows.length} carriers` };
        break;
      }
      case 'generate_report': {
        const reportType = entities.report_type || entities.type || 'qbr';
        let reportUrl = '';
        if (reportType === 'lanes' || reportType === 'lane') {
          reportUrl = '/cw_carriers/api/reports/lanes';
        } else if (reportType === 'carriers' || reportType === 'carrier') {
          reportUrl = '/cw_carriers/api/reports/carriers';
        } else {
          reportUrl = '/cw_carriers/api/reports/qbr';
          if (entities.shipper_name) reportUrl += `?shipper_name=${encodeURIComponent(entities.shipper_name)}`;
        }
        result = {
          success: true,
          message: `PDF report ready! Download it from the Reports page or use this link: ${reportUrl}`,
          data: { report_type: reportType, download_url: reportUrl }
        };
        break;
      }
      case 'help':
      default: {
        result = {
          success: true,
          message: "I can help with these commands:\n- Show open loads\n- Call carriers for load #[ID]\n- Add note to [company]\n- Send status update to [company]\n- Show call history\n- Show dashboard\n- Show lane stats\n- Show carrier stats\n- Create contact\n- Schedule callback\n- Search HubSpot for [query]"
        };
        break;
      }
    }
  } catch (err) {
    console.error('CW NLP execute error:', err.message);
    result = { success: false, message: `Error: ${err.message}` };
  }

  // Log command
  try {
    await sequelize.query(
      `INSERT INTO cw_nlp_commands (user_input, parsed_intent, parsed_entities, action_taken, result_summary, success, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      {
        bind: [
          helpers?.userInput || '',
          intent,
          JSON.stringify(entities),
          intent,
          result.message,
          result.success
        ]
      }
    );
  } catch (e) {
    // Non-critical
  }

  return result;
}

module.exports = { parseCommand, executeIntent };
