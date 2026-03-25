/**
 * CW Carriers — Neural Intelligence API
 * HubSpot-connected health scoring and diagnostics
 */
const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// ─── Health ────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'CW Carriers Neural Intelligence', version: '1.0.0', status: 'operational' });
});

// ─── Dashboard — Full Neural data for the frontend ─────────────
router.get('/dashboard', async (req, res) => {
  try {
    // Pull HubSpot data in parallel
    const [dealsRes, contactsRes, pipelinesRes, metricsRes] = await Promise.all([
      hubspot.getDeals(),
      hubspot.getContacts(),
      hubspot.getPipelines(),
      hubspot.getPipelineMetrics()
    ]);

    const deals = dealsRes.success ? (dealsRes.data?.results || []) : [];
    const contacts = contactsRes.success ? (contactsRes.data?.results || []) : [];
    const pipelines = pipelinesRes.success ? (pipelinesRes.data?.results || []) : [];
    const pipelineMetrics = metricsRes.success ? metricsRes.data : {};

    // Load metrics from BOTH cw_loads AND lg_loads
    const [[cwLoadStats]] = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_loads,
        COUNT(*) FILTER (WHERE status = 'covered') as covered_loads,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_loads,
        COUNT(*) as total_loads,
        COALESCE(SUM(rate_usd) FILTER (WHERE status = 'delivered'), 0) as delivered_revenue,
        COALESCE(AVG(rate_usd), 0) as avg_rate
       FROM cw_loads WHERE created_at >= NOW() - INTERVAL '30 days'`
    );
    let lgLoadStats = { open_loads: 0, covered_loads: 0, delivered_loads: 0, total_loads: 0, delivered_revenue: 0, avg_rate: 0 };
    try {
      const [[lg]] = await sequelize.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'open') as open_loads,
          COUNT(*) FILTER (WHERE status IN ('covered','dispatched')) as covered_loads,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered_loads,
          COUNT(*) as total_loads,
          COALESCE(SUM(sell_rate) FILTER (WHERE status = 'delivered'), 0) as delivered_revenue,
          COALESCE(AVG(buy_rate), 0) as avg_rate
         FROM lg_loads WHERE created_at >= NOW() - INTERVAL '30 days'`
      );
      lgLoadStats = lg;
    } catch (e) { /* lg_loads may not exist */ }

    // Merge load stats
    const loadStats = {
      open_loads: parseInt(cwLoadStats.open_loads || 0) + parseInt(lgLoadStats.open_loads || 0),
      covered_loads: parseInt(cwLoadStats.covered_loads || 0) + parseInt(lgLoadStats.covered_loads || 0),
      delivered_loads: parseInt(cwLoadStats.delivered_loads || 0) + parseInt(lgLoadStats.delivered_loads || 0),
      total_loads: parseInt(cwLoadStats.total_loads || 0) + parseInt(lgLoadStats.total_loads || 0),
      delivered_revenue: parseFloat(cwLoadStats.delivered_revenue || 0) + parseFloat(lgLoadStats.delivered_revenue || 0),
      avg_rate: parseFloat(cwLoadStats.avg_rate || 0) || parseFloat(lgLoadStats.avg_rate || 0) || 2500,
    };

    const [[callStats]] = await sequelize.query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome = 'answered') as answered,
        COUNT(*) FILTER (WHERE outcome = 'no_answer') as missed,
        COALESCE(AVG(duration_sec) FILTER (WHERE outcome = 'answered'), 0) as avg_duration
       FROM cw_call_logs WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    // Contacts from BOTH cw_contacts AND lg_carriers/lg_customers
    const [[cwContactStats]] = await sequelize.query(
      `SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE hubspot_id IS NOT NULL) as synced_to_hubspot,
        COUNT(*) FILTER (WHERE contact_type = 'carrier') as carriers,
        COUNT(*) FILTER (WHERE contact_type = 'shipper') as shippers,
        COUNT(*) FILTER (WHERE contact_type = 'prospect') as prospects
       FROM cw_contacts`
    );
    let lgCarrierCount = 0, lgCustomerCount = 0;
    try {
      const [[lc]] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_carriers`);
      const [[lcu]] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_customers`);
      lgCarrierCount = parseInt(lc.cnt || 0);
      lgCustomerCount = parseInt(lcu.cnt || 0);
    } catch (e) { /* ok */ }

    const contactStats = {
      total_contacts: parseInt(cwContactStats.total_contacts || 0) + lgCarrierCount + lgCustomerCount,
      synced_to_hubspot: parseInt(cwContactStats.synced_to_hubspot || 0),
      carriers: parseInt(cwContactStats.carriers || 0) + lgCarrierCount,
      shippers: parseInt(cwContactStats.shippers || 0) + lgCustomerCount,
      prospects: parseInt(cwContactStats.prospects || 0),
    };

    const [[syncStats]] = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'success') as successful,
        COUNT(*) FILTER (WHERE status = 'error') as errors,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM cw_hubspot_sync WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    // Calculate health scores
    const totalCalls = parseInt(callStats.total_calls) || 0;
    const answered = parseInt(callStats.answered) || 0;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 50;

    const totalLoads = parseInt(loadStats.total_loads) || 0;
    const deliveredLoads = parseInt(loadStats.delivered_loads) || 0;
    const coverageRate = totalLoads > 0 ? Math.round((deliveredLoads / totalLoads) * 100) : 50;

    const totalContacts = parseInt(contactStats.total_contacts) || 0;
    const syncedContacts = parseInt(contactStats.synced_to_hubspot) || 0;
    const syncRate = totalContacts > 0 ? Math.round((syncedContacts / totalContacts) * 100) : 0;

    const hsDeals = deals.length;
    const hsContacts = contacts.length;

    // Panel scores
    const callHealth = {
      name: 'Call Health',
      score: Math.min(answerRate + 10, 100),
      topFinding: totalCalls === 0
        ? 'No calls recorded yet — data will populate as Rachel makes calls'
        : `${answered} of ${totalCalls} calls answered (${answerRate}% answer rate)`,
      trend: { direction: answerRate >= 70 ? 'up' : 'down', points: Math.abs(answerRate - 70) },
      source: 'Rachel / CW Call Logs'
    };

    const pipelineHealth = {
      name: 'Pipeline Health',
      score: Math.min(Math.max(coverageRate + (hsDeals > 0 ? 15 : 0), 20), 100),
      topFinding: hsDeals > 0
        ? `${hsDeals} deals in HubSpot pipeline | $${Number(pipelineMetrics.total_pipeline || 0).toLocaleString()} total value`
        : `${parseInt(loadStats.open_loads)} open loads, ${deliveredLoads} delivered this month`,
      trend: { direction: coverageRate >= 50 ? 'up' : 'down', points: Math.abs(coverageRate - 50) },
      source: 'HubSpot + CW Loads'
    };

    const leadCapture = {
      name: 'Lead Capture',
      score: Math.min(Math.max(parseInt(contactStats.prospects) * 5, 20), 100),
      topFinding: `${contactStats.prospects} prospects | ${contactStats.carriers} carriers | ${contactStats.shippers} shippers`,
      trend: { direction: parseInt(contactStats.prospects) > 5 ? 'up' : 'flat', points: parseInt(contactStats.prospects) },
      source: 'CW Contacts + HubSpot'
    };

    const hubspotSync = {
      name: 'HubSpot Sync',
      score: syncRate > 0 ? Math.min(syncRate + 20, 100) : (hsContacts > 0 ? 60 : 30),
      topFinding: syncRate > 0
        ? `${syncedContacts} of ${totalContacts} contacts synced to HubSpot (${syncRate}%)`
        : hsContacts > 0
          ? `${hsContacts} contacts in HubSpot — connect sync for full coverage`
          : 'HubSpot sync not yet configured',
      trend: { direction: syncRate >= 50 ? 'up' : 'flat', points: syncRate },
      source: 'HubSpot CRM'
    };

    const automationCoverage = {
      name: 'Automation Coverage',
      score: Math.min(30 + (process.env.HUBSPOT_ACCESS_TOKEN ? 25 : 0) + (totalCalls > 0 ? 25 : 0) + (hsDeals > 0 ? 20 : 0), 100),
      topFinding: [
        process.env.HUBSPOT_ACCESS_TOKEN ? 'HubSpot connected' : 'HubSpot pending',
        totalCalls > 0 ? 'Voice AI active' : 'Voice AI pending',
        hsDeals > 0 ? 'Pipeline active' : 'Pipeline pending'
      ].join(' | '),
      trend: { direction: 'up', points: 2 },
      source: 'System'
    };

    const panels = [callHealth, pipelineHealth, leadCapture, hubspotSync, automationCoverage];
    const overallScore = Math.round(panels.reduce((s, p) => s + p.score, 0) / panels.length);
    const scoreLabel = overallScore >= 80 ? 'Excellent' : overallScore >= 65 ? 'Good' : overallScore >= 45 ? 'Needs Attention' : 'Critical';

    // Revenue at risk
    const missedCalls = parseInt(callStats.missed) || 0;
    const avgRate = parseFloat(loadStats.avg_rate) || 2500;
    const revenueAtRisk = Math.round(missedCalls * 0.2 * avgRate);
    const recoveryPotential = Math.round(revenueAtRisk * 0.55);

    // Generate findings
    const findings = [];

    if (missedCalls > 0) {
      findings.push({
        id: 'f1', severity: missedCalls > 10 ? 'CRITICAL' : 'WARNING',
        title: `${missedCalls} missed carrier calls this month`,
        explanation: `Your team missed ${missedCalls} inbound calls in the last 30 days. Each missed call represents a potential load coverage opportunity worth ~$${avgRate.toLocaleString()} avg.`,
        dollarImpact: `$${revenueAtRisk.toLocaleString()} at risk`,
        source: 'Rachel Call Logs',
        treatment: {
          treatment_type: 'cw_missed_call_recovery',
          workflow: [
            { type: 'trigger', text: 'When an incoming call is missed or goes to voicemail' },
            { type: 'condition', text: 'If caller is a carrier not yet in contacts' },
            { type: 'action', text: 'Auto-create HubSpot contact, send follow-up SMS, schedule callback task' }
          ],
          projection: `Recover up to $${recoveryPotential.toLocaleString()} in missed load revenue`
        }
      });
    }

    if (parseInt(loadStats.open_loads) > 5) {
      findings.push({
        id: 'f2', severity: 'WARNING',
        title: `${loadStats.open_loads} loads still uncovered`,
        explanation: `You have ${loadStats.open_loads} open loads awaiting carrier assignment. Consider running a carrier coverage campaign.`,
        dollarImpact: `$${(parseInt(loadStats.open_loads) * avgRate).toLocaleString()} pipeline`,
        source: 'CW Loads',
        treatment: {
          treatment_type: 'cw_load_coverage_outbound',
          workflow: [
            { type: 'trigger', text: 'When load stays uncovered for >4 hours' },
            { type: 'condition', text: 'If matching carriers exist in contacts' },
            { type: 'action', text: 'Auto-trigger Rachel outbound calls to matching carriers, create HubSpot deal' }
          ],
          projection: `Cover loads faster — reduce avg coverage time by 40%`
        }
      });
    }

    if (syncRate < 50 && totalContacts > 0) {
      findings.push({
        id: 'f3', severity: 'OPPORTUNITY',
        title: `${totalContacts - syncedContacts} contacts not synced to HubSpot`,
        explanation: `Only ${syncRate}% of your contacts are synced to HubSpot. Syncing all contacts ensures your pipeline and reporting are complete.`,
        dollarImpact: '',
        source: 'HubSpot Sync',
        treatment: {
          treatment_type: 'cw_contact_hubspot_sync',
          workflow: [
            { type: 'trigger', text: 'When a new contact is created in CW system' },
            { type: 'condition', text: 'If contact has no HubSpot ID' },
            { type: 'action', text: 'Auto-push to HubSpot as contact, associate with relevant deals' }
          ],
          projection: 'Achieve 100% CRM sync coverage'
        }
      });
    }

    if (hsDeals > 0 && (pipelineMetrics.won_deals || 0) === 0) {
      findings.push({
        id: 'f4', severity: 'OPPORTUNITY',
        title: 'No closed-won deals in HubSpot',
        explanation: `You have ${hsDeals} deals in pipeline but none marked as won. Update deal stages as loads are delivered to track win rate.`,
        dollarImpact: '',
        source: 'HubSpot Pipeline',
        treatment: {
          treatment_type: 'cw_deal_stage_sync',
          workflow: [
            { type: 'trigger', text: 'When a load status changes to "delivered" in CW system' },
            { type: 'condition', text: 'If a matching HubSpot deal exists for the load' },
            { type: 'action', text: 'Auto-update HubSpot deal stage to "closedwon" and log delivery date' }
          ],
          projection: `Track win rate and revenue attribution across ${hsDeals} deals`
        }
      });
    }

    if (findings.length === 0) {
      findings.push({
        id: 'f0', severity: 'OPPORTUNITY',
        title: 'Neural Intelligence is analyzing your operations',
        explanation: 'As your call data, load activity, and HubSpot pipeline grow, Neural will detect patterns, surface revenue opportunities, and recommend automations. Keep operating and check back for insights.',
        dollarImpact: '',
        source: 'System',
        treatment: null
      });
    }

    // Connections
    const connections = [
      { name: 'HubSpot CRM', status: process.env.HUBSPOT_ACCESS_TOKEN ? 'connected' : 'disconnected', lastSync: process.env.HUBSPOT_ACCESS_TOKEN ? 'Active' : null },
      { name: 'Rachel Voice AI', status: totalCalls > 0 ? 'connected' : 'disconnected', lastSync: totalCalls > 0 ? 'Active' : null },
      { name: 'CW Dispatch', status: 'connected', lastSync: 'Active' }
    ];

    // ── OBD (On-Board Diagnostics) ──────────────────────────────
    // Real-time system health codes like a vehicle's OBD-II
    const obd = [];

    // OBD-01: Voice AI System
    const voiceStatus = totalCalls > 0 ? 'OK' : 'INACTIVE';
    obd.push({
      code: 'OBD-01', system: 'Voice AI Engine',
      status: voiceStatus,
      severity: voiceStatus === 'OK' ? 'ok' : 'warning',
      reading: totalCalls > 0 ? `${totalCalls} calls processed | ${answerRate}% answer rate | ${Math.round(parseFloat(callStats.avg_duration) || 0)}s avg duration` : 'No calls recorded — Rachel is idle',
      metric: answerRate,
      metric_label: 'Answer Rate',
      last_activity: totalCalls > 0 ? 'Last 30 days' : 'Never',
    });

    // OBD-02: HubSpot CRM Link
    const hsStatus = process.env.HUBSPOT_ACCESS_TOKEN ? (hsDeals > 0 ? 'OK' : 'CONNECTED') : 'DISCONNECTED';
    obd.push({
      code: 'OBD-02', system: 'HubSpot CRM Link',
      status: hsStatus,
      severity: hsStatus === 'OK' ? 'ok' : hsStatus === 'CONNECTED' ? 'warning' : 'critical',
      reading: process.env.HUBSPOT_ACCESS_TOKEN
        ? `${hsContacts} contacts | ${hsDeals} deals | $${Number(pipelineMetrics.total_pipeline || 0).toLocaleString()} pipeline`
        : 'HubSpot API token not configured',
      metric: hsDeals,
      metric_label: 'Active Deals',
      last_activity: process.env.HUBSPOT_ACCESS_TOKEN ? 'Connected' : 'Not configured',
    });

    // OBD-03: Contact Sync
    const syncStatus = syncRate >= 80 ? 'OK' : syncRate >= 30 ? 'DEGRADED' : totalContacts === 0 ? 'NO_DATA' : 'FAULT';
    obd.push({
      code: 'OBD-03', system: 'Contact Sync Pipeline',
      status: syncStatus,
      severity: syncStatus === 'OK' ? 'ok' : syncStatus === 'DEGRADED' ? 'warning' : 'critical',
      reading: totalContacts > 0
        ? `${syncedContacts}/${totalContacts} synced (${syncRate}%) | ${parseInt(syncStats.errors) || 0} sync errors this week`
        : 'No contacts in system',
      metric: syncRate,
      metric_label: 'Sync Rate',
      last_activity: parseInt(syncStats.successful) > 0 ? `${syncStats.successful} syncs this week` : 'No recent syncs',
    });

    // OBD-04: Dispatch & Load Engine
    const openLoads = parseInt(loadStats.open_loads) || 0;
    const coveredLoads = parseInt(loadStats.covered_loads) || 0;
    const dispatchStatus = totalLoads === 0 ? 'NO_DATA' : openLoads > 10 ? 'OVERLOADED' : coverageRate >= 50 ? 'OK' : 'DEGRADED';
    obd.push({
      code: 'OBD-04', system: 'Dispatch Engine',
      status: dispatchStatus,
      severity: dispatchStatus === 'OK' ? 'ok' : dispatchStatus === 'OVERLOADED' ? 'critical' : dispatchStatus === 'DEGRADED' ? 'warning' : 'info',
      reading: totalLoads > 0
        ? `${openLoads} open | ${coveredLoads} covered | ${deliveredLoads} delivered | ${coverageRate}% delivery rate`
        : 'No loads in system — import or create loads to begin',
      metric: coverageRate,
      metric_label: 'Delivery Rate',
      last_activity: totalLoads > 0 ? `${totalLoads} loads (30 days)` : 'No activity',
    });

    // OBD-05: Revenue Pipeline
    const deliveredRevenue = parseFloat(loadStats.delivered_revenue) || 0;
    const pipelineValue = Number(pipelineMetrics.total_pipeline || 0);
    const revenueStatus = (deliveredRevenue + pipelineValue) > 0 ? 'OK' : 'NO_REVENUE';
    obd.push({
      code: 'OBD-05', system: 'Revenue Pipeline',
      status: revenueStatus,
      severity: revenueStatus === 'OK' ? 'ok' : 'warning',
      reading: `$${deliveredRevenue.toLocaleString()} delivered | $${pipelineValue.toLocaleString()} in pipeline | $${Number(pipelineMetrics.won_revenue || 0).toLocaleString()} won`,
      metric: Math.round(deliveredRevenue + pipelineValue),
      metric_label: 'Total Value',
      last_activity: deliveredRevenue > 0 ? 'Active' : 'No delivered revenue',
    });

    // OBD-06: Treatment Automation
    let activeTreatments = 0;
    try {
      const [tRows] = await sequelize.query(`SELECT COUNT(*) as cnt FROM neural_treatments WHERE client_id = 0 AND is_active = true`);
      activeTreatments = parseInt(tRows[0]?.cnt) || 0;
    } catch (e) { /* table may not exist yet */ }
    const treatmentStatus = activeTreatments >= 3 ? 'OK' : activeTreatments > 0 ? 'PARTIAL' : 'INACTIVE';
    obd.push({
      code: 'OBD-06', system: 'Treatment Automation',
      status: treatmentStatus,
      severity: treatmentStatus === 'OK' ? 'ok' : treatmentStatus === 'PARTIAL' ? 'warning' : 'info',
      reading: activeTreatments > 0
        ? `${activeTreatments} active workflow${activeTreatments > 1 ? 's' : ''} | ${6 - activeTreatments} available to activate`
        : '0 workflows active — activate treatments from Findings to automate recovery',
      metric: activeTreatments,
      metric_label: 'Active Workflows',
      last_activity: activeTreatments > 0 ? `${activeTreatments}/6 active` : 'None active',
    });

    // OBD-07: Carrier Network
    const totalCarriers = parseInt(contactStats.carriers) || 0;
    const carrierStatus = totalCarriers >= 10 ? 'OK' : totalCarriers > 0 ? 'LOW' : 'EMPTY';
    obd.push({
      code: 'OBD-07', system: 'Carrier Network',
      status: carrierStatus,
      severity: carrierStatus === 'OK' ? 'ok' : carrierStatus === 'LOW' ? 'warning' : 'critical',
      reading: `${totalCarriers} carriers | ${parseInt(contactStats.shippers) || 0} shippers | ${parseInt(contactStats.prospects) || 0} prospects`,
      metric: totalCarriers,
      metric_label: 'Carriers',
      last_activity: totalCarriers > 0 ? 'Active' : 'No carriers registered',
    });

    // OBD-08: Data Ingestion
    let uploadCount = 0, uploadRows = 0;
    try {
      const [uRows] = await sequelize.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(imported_rows), 0) as rows FROM lg_data_uploads WHERE tenant_id = 'logistics'`);
      uploadCount = parseInt(uRows[0]?.cnt) || 0;
      uploadRows = parseInt(uRows[0]?.rows) || 0;
    } catch (e) { /* ok */ }
    const ingestionStatus = uploadRows > 100 ? 'OK' : uploadRows > 0 ? 'PARTIAL' : 'NO_DATA';
    obd.push({
      code: 'OBD-08', system: 'Data Ingestion',
      status: ingestionStatus,
      severity: ingestionStatus === 'OK' ? 'ok' : ingestionStatus === 'PARTIAL' ? 'warning' : 'info',
      reading: uploadCount > 0
        ? `${uploadCount} uploads | ${uploadRows.toLocaleString()} rows imported`
        : 'No data imported — use Data Ingestion to upload CSV/JSON',
      metric: uploadRows,
      metric_label: 'Rows Imported',
      last_activity: uploadCount > 0 ? `${uploadCount} uploads` : 'No uploads',
    });

    // OBD summary
    const obdOkCount = obd.filter(d => d.severity === 'ok').length;
    const obdWarningCount = obd.filter(d => d.severity === 'warning').length;
    const obdCriticalCount = obd.filter(d => d.severity === 'critical').length;

    // OBD findings count
    let obdFindingsCount = 0;
    try {
      const [[obdCnt]] = await sequelize.query(`SELECT COUNT(*) as cnt FROM lg_obd_findings WHERE status != 'resolved'`);
      obdFindingsCount = parseInt(obdCnt.cnt || 0);
    } catch (e) {}

    res.json({
      success: true,
      healthScore: overallScore,
      scoreLabel,
      revenueAtRisk,
      recoveryPotential,
      trend: { direction: overallScore >= 50 ? 'up' : 'down', points: Math.abs(overallScore - 50), period: '30 days' },
      businessName: 'CW Carriers USA',
      loadStats,
      contactStats,
      callStats: { total: callStats.total_calls, answered: callStats.answered, missed: callStats.missed },
      obdFindings: obdFindingsCount,
      panels,
      findings,
      connections,
      hubspot: {
        deals: hsDeals,
        contacts: hsContacts,
        pipelines: pipelines.length,
        pipeline_value: pipelineMetrics.total_pipeline || 0,
        won_revenue: pipelineMetrics.won_revenue || 0
      },
      obd: {
        diagnostics: obd,
        summary: { total: obd.length, ok: obdOkCount, warning: obdWarningCount, critical: obdCriticalCount },
        overall_status: obdCriticalCount > 0 ? 'FAULT' : obdWarningCount > 2 ? 'CHECK' : 'ALL SYSTEMS GO',
      }
    });
  } catch (error) {
    console.error('CW Neural dashboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── CW-specific Treatment Templates ────────────────────────────
const CW_TREATMENT_TEMPLATES = {
  cw_missed_call_recovery: {
    trigger_event: 'call.missed',
    actions: [
      { type: 'sms', template: 'Hi, we missed your call at CW Carriers. Reply with your MC# and we\'ll match you to an open load right away.', delay_minutes: 0 },
      { type: 'crm_contact', crm: 'hubspot' },
      { type: 'callback', delay_minutes: 30 }
    ]
  },
  cw_load_coverage_outbound: {
    trigger_event: 'load.uncovered',
    actions: [
      { type: 'sms', template: 'CW Carriers has a new {equipment_type} load: {origin} to {destination}, {pickup_date}. Interested? Reply YES or call us.', delay_minutes: 0 },
      { type: 'crm_task', task: 'Follow up on uncovered load', crm: 'hubspot' }
    ]
  },
  cw_contact_hubspot_sync: {
    trigger_event: 'cw_contact.created',
    actions: [
      { type: 'crm_contact', crm: 'hubspot' },
      { type: 'crm_tag', tag: 'cw-auto-synced', crm: 'hubspot' }
    ]
  },
  cw_stale_deal: {
    trigger_event: 'deal.stale',
    actions: [
      { type: 'sms', template: 'Hi {customer_name}, CW Carriers here. We noticed your shipment inquiry is still open. Ready to move forward? Call us anytime.', delay_minutes: 0 },
      { type: 'crm_tag', tag: 'reengagement', crm: 'hubspot' }
    ]
  },
  cw_new_carrier_welcome: {
    trigger_event: 'carrier.created',
    actions: [
      { type: 'sms', template: 'Welcome to the CW Carriers network! We match carriers like you with quality loads daily. Reply LANES to share your preferred lanes.', delay_minutes: 0 },
      { type: 'crm_contact', crm: 'hubspot' }
    ]
  },
  cw_deal_stage_sync: {
    trigger_event: 'load.delivered',
    actions: [
      { type: 'crm_update', crm: 'hubspot', update: 'deal_stage', value: 'closedwon' },
      { type: 'crm_tag', tag: 'cw-delivered', crm: 'hubspot' }
    ]
  }
};

// ─── Treatment Activation ────────────────────────────────────────
router.post('/treatments/activate', async (req, res) => {
  try {
    const { finding_id, treatment_type, is_active } = req.body;
    if (!treatment_type) return res.status(400).json({ error: 'treatment_type required' });

    const template = CW_TREATMENT_TEMPLATES[treatment_type];
    if (!template) return res.status(400).json({ error: `Unknown treatment: ${treatment_type}` });

    const active = is_active !== false;

    // Upsert into neural_treatments (use client_id=0 for CW Carriers tenant)
    const clientId = 0;
    const [existing] = await sequelize.query(
      `SELECT id FROM neural_treatments WHERE client_id = $1 AND treatment_type = $2`,
      { bind: [clientId, treatment_type] }
    );

    if (existing.length > 0) {
      await sequelize.query(
        `UPDATE neural_treatments SET is_active = $1, actions = $2, trigger_event = $3,
         ${active ? 'activated_at = NOW(),' : 'deactivated_at = NOW(),'} updated_at = NOW()
         WHERE client_id = $4 AND treatment_type = $5`,
        { bind: [active, JSON.stringify(template.actions), template.trigger_event, clientId, treatment_type] }
      );
    } else {
      await sequelize.query(
        `INSERT INTO neural_treatments (client_id, treatment_type, trigger_event, actions, is_active, activated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())`,
        { bind: [clientId, treatment_type, template.trigger_event, JSON.stringify(template.actions), active] }
      );
    }

    // Fetch updated record
    const [[treatment]] = await sequelize.query(
      `SELECT * FROM neural_treatments WHERE client_id = $1 AND treatment_type = $2`,
      { bind: [clientId, treatment_type] }
    );

    res.json({ success: true, treatment, message: `Treatment ${active ? 'activated' : 'deactivated'}: ${treatment_type}` });
  } catch (err) {
    console.error('Treatment activation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Active Treatments ────────────────────────────────────────
router.get('/treatments', async (req, res) => {
  try {
    const [treatments] = await sequelize.query(
      `SELECT * FROM neural_treatments WHERE client_id = 0 ORDER BY created_at DESC`
    );
    res.json({ success: true, treatments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Treatment Execution Log ──────────────────────────────────────
router.get('/treatments/log', async (req, res) => {
  try {
    const [logs] = await sequelize.query(
      `SELECT * FROM treatment_execution_log WHERE client_id = 0 ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fix Now — Immediate one-click bulk action ──────────────────────
router.post('/treatments/fix-now', async (req, res) => {
  try {
    const { treatment_type } = req.body;
    if (!treatment_type) return res.status(400).json({ error: 'treatment_type required' });

    const results = { treatment_type, actions: [], total: 0, success: 0, errors: 0 };

    if (treatment_type === 'cw_contact_hubspot_sync') {
      // Bulk sync all un-synced contacts to HubSpot
      const [unsynced] = await sequelize.query(
        `SELECT id, first_name, last_name, email, phone, company, contact_type
         FROM cw_contacts WHERE hubspot_id IS NULL LIMIT 100`
      );
      results.total = unsynced.length;

      for (const contact of unsynced) {
        try {
          const hsResult = await hubspot.createContact({
            firstname: contact.first_name || '',
            lastname: contact.last_name || '',
            email: contact.email || `${contact.id}@cw-placeholder.com`,
            phone: contact.phone || '',
            company: contact.company || 'CW Carriers Contact',
            cw_contact_type: contact.contact_type || 'unknown'
          });
          if (hsResult.success && hsResult.data?.id) {
            await sequelize.query(
              `UPDATE cw_contacts SET hubspot_id = $1, updated_at = NOW() WHERE id = $2`,
              { bind: [hsResult.data.id, contact.id] }
            );
            await sequelize.query(
              `INSERT INTO cw_hubspot_sync (entity_type, entity_id, hubspot_id, action, status, created_at)
               VALUES ('contact', $1, $2, 'create', 'success', NOW())`,
              { bind: [contact.id, hsResult.data.id] }
            );
            results.success++;
          } else {
            results.errors++;
          }
        } catch (e) {
          results.errors++;
        }
      }
      results.actions.push(`Synced ${results.success} contacts to HubSpot`);

    } else if (treatment_type === 'cw_deal_stage_sync') {
      // Find delivered loads and update matching HubSpot deals to closedwon
      const [delivered] = await sequelize.query(
        `SELECT l.load_ref, l.sell_rate, l.customer_id, c.customer_name
         FROM lg_loads l
         LEFT JOIN lg_customers c ON l.customer_id = c.id
         WHERE l.status = 'delivered' AND l.tenant_id = 'logistics'
         LIMIT 50`
      );
      results.total = delivered.length;

      for (const load of delivered) {
        try {
          // Search for matching deal in HubSpot
          const searchResult = await hubspot.searchDeals(load.customer_name || load.load_ref);
          if (searchResult.success && searchResult.data?.results?.length > 0) {
            const deal = searchResult.data.results[0];
            const currentStage = deal.properties?.dealstage;
            if (currentStage !== 'closedwon') {
              const updateResult = await hubspot.updateDealStage(deal.id, 'closedwon');
              if (updateResult.success) {
                results.success++;
                results.actions.push(`Updated "${deal.properties?.dealname}" to Closed Won`);
              } else { results.errors++; }
            } else {
              results.success++; // Already won
            }
          }
        } catch (e) { results.errors++; }
      }
      if (results.success === 0) results.actions.push('No matching HubSpot deals found for delivered loads');

    } else if (treatment_type === 'cw_load_coverage_outbound') {
      // Get open loads and prepare outbound campaign data
      const [openLoads] = await sequelize.query(
        `SELECT load_ref, origin_city, origin_state, destination_city, destination_state,
                equipment_type, sell_rate, pickup_date
         FROM lg_loads WHERE status = 'open' AND tenant_id = 'logistics'
         ORDER BY pickup_date ASC LIMIT 20`
      );
      results.total = openLoads.length;

      // Get matching carriers for each load
      for (const load of openLoads) {
        const [carriers] = await sequelize.query(
          `SELECT carrier_name, phone, email FROM lg_carriers
           WHERE tenant_id = 'logistics'
           AND ($1 = ANY(equipment_types) OR equipment_types IS NULL)
           AND (home_state = $2 OR home_state IS NULL)
           LIMIT 3`,
          { bind: [load.equipment_type, load.origin_state] }
        );
        if (carriers.length > 0) {
          results.success++;
          results.actions.push(`${load.load_ref}: ${load.origin_city}→${load.destination_city} — ${carriers.length} carrier matches ready`);
        }
      }
      if (results.total > 0) results.actions.push(`Carrier matching complete: ${results.success} loads with available carriers`);

    } else {
      return res.status(400).json({ error: `No immediate fix available for: ${treatment_type}` });
    }

    // Log execution
    try {
      await sequelize.query(
        `INSERT INTO treatment_execution_log (client_id, treatment_type, trigger_event, actions_taken, result, created_at)
         VALUES (0, $1, 'manual_fix_now', $2, $3, NOW())`,
        { bind: [treatment_type, JSON.stringify(results.actions), results.errors === 0 ? 'success' : 'partial'] }
      );
    } catch (logErr) { console.error('Treatment log error:', logErr.message); }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Fix Now error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Available Treatment Templates ────────────────────────────────
router.get('/treatments/templates', (req, res) => {
  const templates = {};
  for (const [key, val] of Object.entries(CW_TREATMENT_TEMPLATES)) {
    templates[key] = { trigger_event: val.trigger_event, actions: val.actions.length, action_types: val.actions.map(a => a.type) };
  }
  res.json({ success: true, templates });
});

module.exports = router;
