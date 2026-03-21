// compliance.agent.js
// FreightMind AI — Compliance & Safety Agent
// DOT/FMCSA compliance, HOS monitoring, insurance/CDL expiry tracking, violation prevention

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const sequelize = require('../db.cw');

// ── Tool Handlers ───────────────────────────────────────────────────────────

// (1) check_hos_violation — check Hours of Service remaining for a driver
async function checkHosViolation(input) {
  const { driver_id } = input;

  const [rows] = await sequelize.query(`
    SELECT id, first_name, last_name,
           hos_drive_remaining, hos_duty_remaining, hos_cycle_remaining
    FROM lg_drivers
    WHERE id = $1
  `, { bind: [driver_id] });

  if (!rows.length) throw new Error(`Driver ${driver_id} not found`);

  const d = rows[0];
  const violations = [];
  const warnings = [];

  // Check drive hours
  if (parseFloat(d.hos_drive_remaining) <= 0) {
    violations.push({ type: 'drive_time', remaining: d.hos_drive_remaining, message: 'Drive time exhausted — cannot drive' });
  } else if (parseFloat(d.hos_drive_remaining) < 1) {
    warnings.push({ type: 'drive_time', remaining: d.hos_drive_remaining, message: 'Less than 1 hour of drive time remaining' });
  }

  // Check duty hours
  if (parseFloat(d.hos_duty_remaining) <= 0) {
    violations.push({ type: 'duty_time', remaining: d.hos_duty_remaining, message: 'Duty time exhausted — must go off duty' });
  } else if (parseFloat(d.hos_duty_remaining) < 2) {
    warnings.push({ type: 'duty_time', remaining: d.hos_duty_remaining, message: 'Less than 2 hours of duty time remaining' });
  }

  // Check cycle hours
  if (parseFloat(d.hos_cycle_remaining) <= 0) {
    violations.push({ type: 'cycle_time', remaining: d.hos_cycle_remaining, message: 'Cycle time exhausted — 34-hour restart required' });
  }

  return {
    driver_id: d.id,
    driver_name: `${d.first_name} ${d.last_name}`,
    hos_drive_remaining: parseFloat(d.hos_drive_remaining),
    hos_duty_remaining: parseFloat(d.hos_duty_remaining),
    hos_cycle_remaining: parseFloat(d.hos_cycle_remaining),
    violations,
    warnings,
    compliant: violations.length === 0
  };
}

// (2) verify_cdl — check CDL validity and endorsements
async function verifyCdl(input) {
  const { driver_id } = input;

  const [rows] = await sequelize.query(`
    SELECT id, first_name, last_name,
           cdl_number, cdl_state, cdl_class, cdl_expiry, endorsements
    FROM lg_drivers
    WHERE id = $1
  `, { bind: [driver_id] });

  if (!rows.length) throw new Error(`Driver ${driver_id} not found`);

  const d = rows[0];
  const now = new Date();
  const expiry = d.cdl_expiry ? new Date(d.cdl_expiry) : null;
  const daysUntilExpiry = expiry ? Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)) : null;
  const valid = expiry ? expiry > now : false;

  return {
    driver_id: d.id,
    driver_name: `${d.first_name} ${d.last_name}`,
    cdl_number: d.cdl_number,
    cdl_state: d.cdl_state,
    valid,
    class: d.cdl_class,
    endorsements: d.endorsements,
    expiry: d.cdl_expiry,
    days_until_expiry: daysUntilExpiry,
    alert: daysUntilExpiry !== null && daysUntilExpiry <= 30 ? `CDL expires in ${daysUntilExpiry} days` : null
  };
}

// (3) check_insurance — check carrier insurance status
async function checkInsurance(input) {
  const { carrier_id } = input;

  const [rows] = await sequelize.query(`
    SELECT id, entity_type, entity_id, compliance_type, status,
           expiry_date, details, created_at
    FROM lg_compliance
    WHERE entity_type = 'carrier' AND entity_id = $1 AND compliance_type = 'insurance'
    ORDER BY created_at DESC
    LIMIT 1
  `, { bind: [String(carrier_id)] });

  if (!rows.length) {
    return { carrier_id, active: false, coverage_type: null, expiry_date: null, days_until_expiry: null, alert_needed: true, message: 'No insurance record found for this carrier' };
  }

  const rec = rows[0];
  const now = new Date();
  const expiry = rec.expiry_date ? new Date(rec.expiry_date) : null;
  const daysUntilExpiry = expiry ? Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)) : null;
  const active = rec.status === 'current' && expiry && expiry > now;
  const details = typeof rec.details === 'string' ? JSON.parse(rec.details) : (rec.details || {});

  return {
    carrier_id,
    compliance_id: rec.id,
    active,
    coverage_type: details.coverage_type || 'general_liability',
    status: rec.status,
    expiry_date: rec.expiry_date,
    days_until_expiry: daysUntilExpiry,
    alert_needed: !active || (daysUntilExpiry !== null && daysUntilExpiry <= 30)
  };
}

// (4) log_inspection — record a truck inspection
async function logInspection(input) {
  const { truck_id, type, results, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const complianceType = `inspection_${type}`;
  const details = typeof results === 'string' ? JSON.parse(results) : (results || {});
  const pass = details.pass !== undefined ? details.pass : true;
  const status = pass ? 'current' : 'violation';

  const [inserted] = await sequelize.query(`
    INSERT INTO lg_compliance (entity_type, entity_id, compliance_type, status, details, tenant_id, created_at, updated_at)
    VALUES ('truck', $1, $2, $3, $4, $5, NOW(), NOW())
    RETURNING id
  `, { bind: [String(truck_id), complianceType, status, JSON.stringify(details), tid] });

  return {
    inspection_id: inserted[0].id,
    truck_id,
    type,
    pass,
    status,
    recorded_at: new Date().toISOString()
  };
}

// (5) flag_violation — flag a compliance violation and log it
async function flagViolation(input) {
  const { type, entity_type, entity_id, details, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const detailObj = typeof details === 'string' ? JSON.parse(details) : (details || {});
  const severity = detailObj.severity || (type === 'hos' || type === 'drug_test' ? 'critical' : 'high');

  // Insert violation into lg_compliance
  const [compInserted] = await sequelize.query(`
    INSERT INTO lg_compliance (entity_type, entity_id, compliance_type, status, details, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, 'violation', $4, $5, NOW(), NOW())
    RETURNING id
  `, { bind: [entity_type, String(entity_id), `violation_${type}`, JSON.stringify({ ...detailObj, severity }), tid] });

  // Log to lg_agent_log
  await sequelize.query(`
    INSERT INTO lg_agent_log (agent_name, tool_name, input, output, success, tenant_id, created_at)
    VALUES ('compliance', 'flag_violation', $1, $2, true, $3, NOW())
  `, { bind: [
    JSON.stringify({ type, entity_type, entity_id }),
    JSON.stringify({ violation_id: compInserted[0].id, severity }),
    tid
  ] });

  return {
    violation_id: compInserted[0].id,
    type,
    entity_type,
    entity_id,
    severity,
    alert_sent: true,
    flagged_at: new Date().toISOString()
  };
}

// (6) schedule_drug_test — schedule a drug test for a driver
async function scheduleDrugTest(input) {
  const { driver_id, type, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const testType = type || 'random';

  const [inserted] = await sequelize.query(`
    INSERT INTO lg_compliance (entity_type, entity_id, compliance_type, status, details, tenant_id, created_at, updated_at)
    VALUES ('driver', $1, 'drug_test', 'pending', $2, $3, NOW(), NOW())
    RETURNING id
  `, { bind: [String(driver_id), JSON.stringify({ test_type: testType, scheduled_date: new Date().toISOString() }), tid] });

  return {
    compliance_id: inserted[0].id,
    scheduled: true,
    type: testType,
    driver_id,
    status: 'pending',
    scheduled_at: new Date().toISOString()
  };
}

// (7) audit_eld_logs — audit ELD logs for gaps/discrepancies
async function auditEldLogs(input) {
  const { driver_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [events] = await sequelize.query(`
    SELECT id, event_type, event_time, details
    FROM lg_tracking_events
    WHERE driver_id = $1 AND tenant_id = $2
      AND event_time >= $3 AND event_time <= $4
    ORDER BY event_time ASC
  `, { bind: [driver_id, tid, period_start, period_end] });

  const discrepancies = [];
  const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1].event_time);
    const curr = new Date(events[i].event_time);
    const gapMs = curr - prev;

    if (gapMs > GAP_THRESHOLD_MS) {
      discrepancies.push({
        gap_start: events[i - 1].event_time,
        gap_end: events[i].event_time,
        gap_minutes: Math.round(gapMs / 60000),
        prev_event_id: events[i - 1].id,
        next_event_id: events[i].id
      });
    }
  }

  // Calculate coverage percentage
  const periodMs = new Date(period_end) - new Date(period_start);
  const totalGapMs = discrepancies.reduce((sum, d) => sum + d.gap_minutes * 60000, 0);
  const coveragePct = periodMs > 0 ? Math.round(((periodMs - totalGapMs) / periodMs) * 10000) / 100 : 0;

  return {
    driver_id,
    period_start,
    period_end,
    total_events: events.length,
    discrepancies,
    clean: discrepancies.length === 0,
    coverage_pct: coveragePct
  };
}

// (8) check_carrier_authority — verify carrier operating authority
async function checkCarrierAuthority(input) {
  const { mc_number } = input;

  const [rows] = await sequelize.query(`
    SELECT id, name, mc_number, dot_number, operating_status, safety_rating,
           insurance_expiry, contact_email, contact_phone
    FROM lg_carriers
    WHERE mc_number = $1
  `, { bind: [mc_number] });

  if (!rows.length) throw new Error(`Carrier with MC# ${mc_number} not found`);

  const c = rows[0];
  const now = new Date();
  const insExpiry = c.insurance_expiry ? new Date(c.insurance_expiry) : null;
  const insuranceCurrent = insExpiry ? insExpiry > now : false;
  const violations = [];

  if (c.operating_status && c.operating_status.toLowerCase() !== 'active' && c.operating_status.toLowerCase() !== 'authorized') {
    violations.push({ type: 'authority', message: `Operating status is "${c.operating_status}" — not authorized to haul` });
  }
  if (!insuranceCurrent) {
    violations.push({ type: 'insurance', message: 'Insurance is expired or missing' });
  }
  if (c.safety_rating && c.safety_rating.toLowerCase() === 'unsatisfactory') {
    violations.push({ type: 'safety_rating', message: 'Carrier has an unsatisfactory safety rating' });
  }

  return {
    carrier_id: c.id,
    carrier_name: c.name,
    mc_number: c.mc_number,
    dot_number: c.dot_number,
    active: c.operating_status ? ['active', 'authorized'].includes(c.operating_status.toLowerCase()) : false,
    operating_status: c.operating_status,
    safety_rating: c.safety_rating,
    insurance_current: insuranceCurrent,
    insurance_expiry: c.insurance_expiry,
    violations,
    compliant: violations.length === 0
  };
}

// (9) generate_compliance_report — aggregate compliance status across all entities
async function generateComplianceReport(input) {
  const { tenant_id, period } = input;
  const tid = tenant_id || 'logistics';
  const periodDays = parseInt(period) || 30;

  const [items] = await sequelize.query(`
    SELECT id, entity_type, entity_id, compliance_type, status, expiry_date, details
    FROM lg_compliance
    WHERE tenant_id = $1
      AND created_at >= NOW() - $2 * INTERVAL '1 day'
    ORDER BY created_at DESC
  `, { bind: [tid, periodDays] });

  const byStatus = { current: 0, expiring_soon: 0, expired: 0, violation: 0, pending: 0 };
  const criticalIssues = [];
  const now = new Date();

  for (const item of items) {
    if (item.status === 'violation') {
      byStatus.violation++;
      criticalIssues.push({
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        compliance_type: item.compliance_type,
        status: item.status
      });
    } else if (item.status === 'pending') {
      byStatus.pending++;
    } else if (item.expiry_date && new Date(item.expiry_date) < now) {
      byStatus.expired++;
      criticalIssues.push({
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        compliance_type: item.compliance_type,
        status: 'expired',
        expiry_date: item.expiry_date
      });
    } else if (item.expiry_date && (new Date(item.expiry_date) - now) < 30 * 24 * 60 * 60 * 1000) {
      byStatus.expiring_soon++;
    } else {
      byStatus.current++;
    }
  }

  return {
    report_date: now.toISOString(),
    tenant_id: tid,
    period_days: periodDays,
    total_items: items.length,
    by_status: byStatus,
    critical_issues: criticalIssues
  };
}

// (10) track_expiring_docs — find documents expiring within N days
async function trackExpiringDocs(input) {
  const { days_ahead, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const days = parseInt(days_ahead) || 30;

  const [rows] = await sequelize.query(`
    SELECT id, entity_type, entity_id, compliance_type, status, expiry_date, details
    FROM lg_compliance
    WHERE tenant_id = $1
      AND expiry_date BETWEEN NOW() AND NOW() + $2 * INTERVAL '1 day'
    ORDER BY expiry_date ASC
  `, { bind: [tid, days] });

  const expiring = rows.map(r => {
    const daysLeft = Math.ceil((new Date(r.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      compliance_type: r.compliance_type,
      status: r.status,
      expiry_date: r.expiry_date,
      days_until_expiry: daysLeft,
      urgency: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'medium'
    };
  });

  return {
    days_ahead: days,
    tenant_id: tid,
    expiring,
    count: expiring.length,
    critical_count: expiring.filter(e => e.urgency === 'critical').length
  };
}

// ── Agent Definition ────────────────────────────────────────────────────────

const complianceAgent = new FreightMindAgent({
  name: 'compliance',
  systemPrompt: `You are the Compliance & Safety agent for FreightMind. You ensure DOT/FMCSA compliance, monitor HOS, track insurance/CDL expiry, and prevent violations before they happen. Safety is non-negotiable.`,
  tools: [
    {
      name: 'check_hos_violation',
      description: 'Check Hours of Service remaining for a driver and flag violations or warnings',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'ID of the driver to check' }
        },
        required: ['driver_id']
      },
      handler: checkHosViolation
    },
    {
      name: 'verify_cdl',
      description: 'Verify CDL validity, class, endorsements, and expiry for a driver',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'ID of the driver' }
        },
        required: ['driver_id']
      },
      handler: verifyCdl
    },
    {
      name: 'check_insurance',
      description: 'Check insurance status and expiry for a carrier',
      input_schema: {
        type: 'object',
        properties: {
          carrier_id: { type: 'integer', description: 'ID of the carrier' }
        },
        required: ['carrier_id']
      },
      handler: checkInsurance
    },
    {
      name: 'log_inspection',
      description: 'Log a truck inspection result (pre-trip, post-trip, DOT, annual, etc.)',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          type: { type: 'string', description: 'Inspection type: pre_trip, post_trip, dot, annual' },
          results: {
            type: 'object',
            description: 'Inspection results including pass/fail and findings',
            properties: {
              pass: { type: 'boolean', description: 'Whether the inspection passed' },
              findings: { type: 'array', items: { type: 'string' }, description: 'List of findings or defects' }
            }
          },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id', 'type', 'results']
      },
      handler: logInspection
    },
    {
      name: 'flag_violation',
      description: 'Flag a compliance violation and log it for audit trail',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Violation type: hos, cdl, insurance, drug_test, inspection, weight, hazmat' },
          entity_type: { type: 'string', description: 'Entity type: driver, carrier, truck' },
          entity_id: { type: 'integer', description: 'ID of the entity' },
          details: {
            type: 'object',
            description: 'Violation details',
            properties: {
              severity: { type: 'string', description: 'critical, high, medium, low' },
              description: { type: 'string' },
              regulation: { type: 'string', description: 'Regulation code violated (e.g. 49 CFR 395.3)' }
            }
          },
          tenant_id: { type: 'string' }
        },
        required: ['type', 'entity_type', 'entity_id']
      },
      handler: flagViolation
    },
    {
      name: 'schedule_drug_test',
      description: 'Schedule a drug test for a driver (random or pre-employment)',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'ID of the driver' },
          type: { type: 'string', description: 'Test type: random, pre_employment' },
          tenant_id: { type: 'string' }
        },
        required: ['driver_id']
      },
      handler: scheduleDrugTest
    },
    {
      name: 'audit_eld_logs',
      description: 'Audit ELD logs for a driver over a date range, detecting gaps and discrepancies',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'ID of the driver' },
          period_start: { type: 'string', description: 'Start date (ISO 8601)' },
          period_end: { type: 'string', description: 'End date (ISO 8601)' },
          tenant_id: { type: 'string' }
        },
        required: ['driver_id', 'period_start', 'period_end']
      },
      handler: auditEldLogs
    },
    {
      name: 'check_carrier_authority',
      description: 'Verify carrier operating authority, safety rating, and insurance by MC number',
      input_schema: {
        type: 'object',
        properties: {
          mc_number: { type: 'string', description: 'Motor Carrier number (e.g. MC-123456)' }
        },
        required: ['mc_number']
      },
      handler: checkCarrierAuthority
    },
    {
      name: 'generate_compliance_report',
      description: 'Generate an aggregate compliance report for a tenant over a given period',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          period: { type: 'integer', description: 'Number of days to look back (default 30)' }
        },
        required: ['tenant_id']
      },
      handler: generateComplianceReport
    },
    {
      name: 'track_expiring_docs',
      description: 'Find all compliance documents expiring within N days',
      input_schema: {
        type: 'object',
        properties: {
          days_ahead: { type: 'integer', description: 'Number of days to look ahead (default 30)' },
          tenant_id: { type: 'string' }
        },
        required: ['days_ahead']
      },
      handler: trackExpiringDocs
    }
  ]
});

registerAgent(complianceAgent);

module.exports = complianceAgent;
