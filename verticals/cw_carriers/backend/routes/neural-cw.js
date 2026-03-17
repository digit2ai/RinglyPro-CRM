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

    // Load CW-specific metrics from DB
    const [[loadStats]] = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_loads,
        COUNT(*) FILTER (WHERE status = 'covered') as covered_loads,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_loads,
        COUNT(*) as total_loads,
        COALESCE(SUM(rate_usd) FILTER (WHERE status = 'delivered'), 0) as delivered_revenue,
        COALESCE(AVG(rate_usd), 0) as avg_rate
       FROM cw_loads WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    const [[callStats]] = await sequelize.query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome = 'answered') as answered,
        COUNT(*) FILTER (WHERE outcome = 'no_answer') as missed,
        COALESCE(AVG(duration_sec) FILTER (WHERE outcome = 'answered'), 0) as avg_duration
       FROM cw_call_logs WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    const [[contactStats]] = await sequelize.query(
      `SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE hubspot_id IS NOT NULL) as synced_to_hubspot,
        COUNT(*) FILTER (WHERE contact_type = 'carrier') as carriers,
        COUNT(*) FILTER (WHERE contact_type = 'shipper') as shippers,
        COUNT(*) FILTER (WHERE contact_type = 'prospect') as prospects
       FROM cw_contacts`
    );

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
        treatment: null
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

    res.json({
      success: true,
      healthScore: overallScore,
      scoreLabel,
      revenueAtRisk,
      recoveryPotential,
      trend: { direction: overallScore >= 50 ? 'up' : 'down', points: Math.abs(overallScore - 50), period: '30 days' },
      businessName: 'CW Carriers USA',
      panels,
      findings,
      connections,
      hubspot: {
        deals: hsDeals,
        contacts: hsContacts,
        pipelines: pipelines.length,
        pipeline_value: pipelineMetrics.total_pipeline || 0,
        won_revenue: pipelineMetrics.won_revenue || 0
      }
    });
  } catch (error) {
    console.error('CW Neural dashboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
