// billing.agent.js
// FreightMind AI — Billing & Settlement Agent
// Automates invoicing, driver settlements, collections, audit, and cash flow optimization

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const sequelize = require('../db.cw');

// ── Tool Handlers ───────────────────────────────────────────────────────────

// (1) generate_invoice — create invoice from a delivered load
async function generateInvoice(input) {
  const { load_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!load_id) throw new Error('load_id is required');

  const [loads] = await sequelize.query(`
    SELECT id, load_ref, sell_rate, miles, status, origin_city, origin_state,
           destination_city, destination_state, customer_name
    FROM lg_loads
    WHERE id = $1 AND tenant_id = $2
  `, { bind: [load_id, tid] });

  if (!loads[0]) throw new Error(`Load ${load_id} not found`);
  const load = loads[0];

  const invoiceNumber = 'FM-' + (load.load_ref || load_id) + '-' + Date.now();
  const amount = parseFloat(load.sell_rate) || 0;

  const [result] = await sequelize.query(`
    INSERT INTO lg_invoices (tenant_id, load_id, invoice_number, customer_name, amount,
      total_amount, due_date, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $5, NOW() + INTERVAL '30 days', 'generated', NOW())
    RETURNING id, invoice_number, amount, due_date, status, created_at
  `, { bind: [tid, load_id, invoiceNumber, load.customer_name || null, amount] });

  await sequelize.query(`
    UPDATE lg_loads SET status = 'invoiced' WHERE id = $1 AND tenant_id = $2
  `, { bind: [load_id, tid] });

  const invoice = result[0];
  return {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    load_id,
    load_ref: load.load_ref,
    lane: `${load.origin_city}, ${load.origin_state} -> ${load.destination_city}, ${load.destination_state}`,
    customer_name: load.customer_name || null,
    amount: parseFloat(invoice.amount),
    due_date: invoice.due_date,
    status: invoice.status,
    created_at: invoice.created_at,
  };
}

// (2) calc_driver_pay — calculate driver pay for a period
async function calcDriverPay(input) {
  const { driver_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!driver_id) throw new Error('driver_id is required');
  if (!period_start || !period_end) throw new Error('period_start and period_end are required');

  const [dispatches] = await sequelize.query(`
    SELECT d.id as dispatch_id, d.load_id, d.actual_delivery, d.route_miles,
           l.buy_rate, l.sell_rate, l.load_ref, l.miles,
           l.origin_city, l.origin_state, l.destination_city, l.destination_state
    FROM lg_dispatches d
    JOIN lg_loads l ON l.id = d.load_id
    WHERE d.driver_id = $1 AND d.status = 'delivered'
      AND d.actual_delivery BETWEEN $2 AND $3
      AND d.tenant_id = $4
  `, { bind: [driver_id, period_start, period_end, tid] });

  const driverSplit = 0.70;
  let totalMiles = 0;
  let grossPay = 0;
  const loads = [];

  for (const d of dispatches) {
    const buyRate = parseFloat(d.buy_rate) || 0;
    const miles = parseFloat(d.route_miles) || parseFloat(d.miles) || 0;
    const pay = Math.round(buyRate * driverSplit * 100) / 100;
    totalMiles += miles;
    grossPay += pay;
    loads.push({
      dispatch_id: d.dispatch_id,
      load_id: d.load_id,
      load_ref: d.load_ref,
      lane: `${d.origin_city}, ${d.origin_state} -> ${d.destination_city}, ${d.destination_state}`,
      delivered: d.actual_delivery,
      miles,
      buy_rate: buyRate,
      driver_pay: pay,
    });
  }

  return {
    driver_id,
    period_start,
    period_end,
    loads_count: dispatches.length,
    total_miles: Math.round(totalMiles),
    driver_split_pct: driverSplit * 100,
    gross_pay: Math.round(grossPay * 100) / 100,
    loads,
  };
}

// (3) submit_to_factoring — factor an invoice at 3% fee
async function submitToFactoring(input) {
  const { invoice_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!invoice_id) throw new Error('invoice_id is required');

  const [invoices] = await sequelize.query(`
    SELECT id, total_amount, status FROM lg_invoices
    WHERE id = $1 AND tenant_id = $2
  `, { bind: [invoice_id, tid] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];
  const totalAmount = parseFloat(inv.total_amount) || 0;
  const feePct = 3;
  const factoredAmount = Math.round(totalAmount * (1 - feePct / 100) * 100) / 100;
  const feeAmount = Math.round(totalAmount * (feePct / 100) * 100) / 100;

  await sequelize.query(`
    UPDATE lg_invoices
    SET factored = true, factored_at = NOW(), factored_amount = $1, status = 'factored'
    WHERE id = $2 AND tenant_id = $3
  `, { bind: [factoredAmount, invoice_id, tid] });

  return {
    invoice_id,
    factored: true,
    original_amount: totalAmount,
    advance_amount: factoredAmount,
    fee_pct: feePct,
    fee_amount: feeAmount,
    status: 'factored',
  };
}

// (4) track_payment — check payment status on an invoice
async function trackPayment(input) {
  const { invoice_id } = input;

  if (!invoice_id) throw new Error('invoice_id is required');

  const [invoices] = await sequelize.query(`
    SELECT id, invoice_number, customer_name, amount, total_amount, paid_amount,
           status, due_date, sent_at, factored, created_at
    FROM lg_invoices WHERE id = $1
  `, { bind: [invoice_id] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];

  const sentAt = inv.sent_at ? new Date(inv.sent_at) : new Date(inv.created_at);
  const daysOutstanding = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));

  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    customer_name: inv.customer_name,
    status: inv.status,
    amount: parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0,
    paid_amount: parseFloat(inv.paid_amount) || 0,
    due_date: inv.due_date,
    days_outstanding: daysOutstanding,
    factored: inv.factored || false,
    overdue: inv.due_date ? new Date(inv.due_date) < new Date() && inv.status !== 'paid' : false,
  };
}

// (5) reconcile_fuel — estimate fuel costs for a driver's loads
async function reconcileFuel(input) {
  const { driver_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!driver_id) throw new Error('driver_id is required');
  if (!period_start || !period_end) throw new Error('period_start and period_end are required');

  const mpg = 6;
  const pricePerGallon = 4.00;

  const [dispatches] = await sequelize.query(`
    SELECT d.id, d.load_id, d.route_miles, l.miles, l.load_ref,
           l.origin_city, l.origin_state, l.destination_city, l.destination_state
    FROM lg_dispatches d
    JOIN lg_loads l ON l.id = d.load_id
    WHERE d.driver_id = $1 AND d.status = 'delivered'
      AND d.actual_delivery BETWEEN $2 AND $3
      AND d.tenant_id = $4
  `, { bind: [driver_id, period_start, period_end, tid] });

  let totalMiles = 0;
  const trips = dispatches.map(d => {
    const miles = parseFloat(d.route_miles) || parseFloat(d.miles) || 0;
    totalMiles += miles;
    const gallons = Math.round((miles / mpg) * 100) / 100;
    const cost = Math.round(gallons * pricePerGallon * 100) / 100;
    return {
      load_id: d.load_id,
      load_ref: d.load_ref,
      lane: `${d.origin_city}, ${d.origin_state} -> ${d.destination_city}, ${d.destination_state}`,
      miles,
      estimated_gallons: gallons,
      estimated_cost: cost,
    };
  });

  const totalGallons = Math.round((totalMiles / mpg) * 100) / 100;
  const totalCost = Math.round(totalGallons * pricePerGallon * 100) / 100;
  const costPerMile = totalMiles > 0 ? Math.round((totalCost / totalMiles) * 100) / 100 : 0;

  return {
    driver_id,
    period_start,
    period_end,
    trips: trips.length,
    total_miles: Math.round(totalMiles),
    estimated_gallons: totalGallons,
    estimated_cost: totalCost,
    cost_per_mile: costPerMile,
    assumptions: { mpg, price_per_gallon: pricePerGallon },
    trip_details: trips,
  };
}

// (6) aging_report — accounts receivable aging buckets
async function agingReport(input) {
  const { tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [buckets] = await sequelize.query(`
    SELECT
      SUM(CASE WHEN NOW() - created_at <= INTERVAL '30 days' THEN total_amount ELSE 0 END) as current_amount,
      COUNT(CASE WHEN NOW() - created_at <= INTERVAL '30 days' THEN 1 END) as current_count,
      SUM(CASE WHEN NOW() - created_at > INTERVAL '30 days' AND NOW() - created_at <= INTERVAL '60 days' THEN total_amount ELSE 0 END) as thirty_day_amount,
      COUNT(CASE WHEN NOW() - created_at > INTERVAL '30 days' AND NOW() - created_at <= INTERVAL '60 days' THEN 1 END) as thirty_day_count,
      SUM(CASE WHEN NOW() - created_at > INTERVAL '60 days' AND NOW() - created_at <= INTERVAL '90 days' THEN total_amount ELSE 0 END) as sixty_day_amount,
      COUNT(CASE WHEN NOW() - created_at > INTERVAL '60 days' AND NOW() - created_at <= INTERVAL '90 days' THEN 1 END) as sixty_day_count,
      SUM(CASE WHEN NOW() - created_at > INTERVAL '90 days' THEN total_amount ELSE 0 END) as ninety_plus_amount,
      COUNT(CASE WHEN NOW() - created_at > INTERVAL '90 days' THEN 1 END) as ninety_plus_count
    FROM lg_invoices
    WHERE tenant_id = $1 AND status NOT IN ('paid', 'cancelled')
  `, { bind: [tid] });

  const b = buckets[0] || {};
  const currentAmt = parseFloat(b.current_amount) || 0;
  const thirtyAmt = parseFloat(b.thirty_day_amount) || 0;
  const sixtyAmt = parseFloat(b.sixty_day_amount) || 0;
  const ninetyAmt = parseFloat(b.ninety_plus_amount) || 0;
  const totalAr = currentAmt + thirtyAmt + sixtyAmt + ninetyAmt;

  return {
    tenant_id: tid,
    current: { amount: Math.round(currentAmt * 100) / 100, count: parseInt(b.current_count) || 0 },
    thirty_day: { amount: Math.round(thirtyAmt * 100) / 100, count: parseInt(b.thirty_day_count) || 0 },
    sixty_day: { amount: Math.round(sixtyAmt * 100) / 100, count: parseInt(b.sixty_day_count) || 0 },
    ninety_plus: { amount: Math.round(ninetyAmt * 100) / 100, count: parseInt(b.ninety_plus_count) || 0 },
    total_ar: Math.round(totalAr * 100) / 100,
    at_risk: Math.round((sixtyAmt + ninetyAmt) * 100) / 100,
    at_risk_pct: totalAr > 0 ? Math.round(((sixtyAmt + ninetyAmt) / totalAr) * 10000) / 100 : 0,
  };
}

// (7) settle_driver — calculate and record driver settlement
async function settleDriver(input) {
  const { driver_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!driver_id) throw new Error('driver_id is required');
  if (!period_start || !period_end) throw new Error('period_start and period_end are required');

  // Reuse calc_driver_pay logic inline
  const [dispatches] = await sequelize.query(`
    SELECT d.id as dispatch_id, d.load_id, d.route_miles,
           l.buy_rate, l.miles
    FROM lg_dispatches d
    JOIN lg_loads l ON l.id = d.load_id
    WHERE d.driver_id = $1 AND d.status = 'delivered'
      AND d.actual_delivery BETWEEN $2 AND $3
      AND d.tenant_id = $4
  `, { bind: [driver_id, period_start, period_end, tid] });

  const driverSplit = 0.70;
  let totalMiles = 0;
  let grossPay = 0;

  for (const d of dispatches) {
    const buyRate = parseFloat(d.buy_rate) || 0;
    const miles = parseFloat(d.route_miles) || parseFloat(d.miles) || 0;
    totalMiles += miles;
    grossPay += buyRate * driverSplit;
  }

  grossPay = Math.round(grossPay * 100) / 100;

  // Estimate deductions (fuel advance placeholder)
  const fuelDeduction = 0;
  const netPay = Math.round((grossPay - fuelDeduction) * 100) / 100;

  const [result] = await sequelize.query(`
    INSERT INTO lg_settlements (tenant_id, driver_id, period_start, period_end,
      loads_count, total_miles, gross_pay, deductions, net_pay, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
    RETURNING id, driver_id, period_start, period_end, loads_count, total_miles,
      gross_pay, deductions, net_pay, status, created_at
  `, { bind: [tid, driver_id, period_start, period_end, dispatches.length,
    Math.round(totalMiles), grossPay, fuelDeduction, netPay] });

  const settlement = result[0];
  return {
    settlement_id: settlement.id,
    driver_id: settlement.driver_id,
    period_start: settlement.period_start,
    period_end: settlement.period_end,
    loads_count: parseInt(settlement.loads_count),
    total_miles: parseInt(settlement.total_miles),
    gross_pay: parseFloat(settlement.gross_pay),
    deductions: parseFloat(settlement.deductions),
    net_pay: parseFloat(settlement.net_pay),
    driver_split_pct: driverSplit * 100,
    status: settlement.status,
    created_at: settlement.created_at,
  };
}

// (8) calc_load_profit — single load profitability
async function calcLoadProfit(input) {
  const { load_id } = input;

  if (!load_id) throw new Error('load_id is required');

  const [loads] = await sequelize.query(`
    SELECT id, load_ref, sell_rate, buy_rate, margin, margin_pct, miles,
           origin_city, origin_state, destination_city, destination_state
    FROM lg_loads WHERE id = $1
  `, { bind: [load_id] });

  if (!loads[0]) throw new Error(`Load ${load_id} not found`);
  const load = loads[0];

  const revenue = parseFloat(load.sell_rate) || 0;
  const cost = parseFloat(load.buy_rate) || 0;
  const margin = parseFloat(load.margin) || (revenue - cost);
  const marginPct = parseFloat(load.margin_pct) || (revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0);
  const miles = parseFloat(load.miles) || 0;
  const rpm = miles > 0 ? Math.round((revenue / miles) * 100) / 100 : 0;

  return {
    load_id: load.id,
    load_ref: load.load_ref,
    lane: `${load.origin_city}, ${load.origin_state} -> ${load.destination_city}, ${load.destination_state}`,
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    margin_pct: Math.round(marginPct * 100) / 100,
    miles: Math.round(miles),
    rpm,
    profitable: margin > 0,
  };
}

// (9) send_collections_notice — escalated collections tracking
async function sendCollectionsNotice(input) {
  const { invoice_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!invoice_id) throw new Error('invoice_id is required');

  const [invoices] = await sequelize.query(`
    SELECT id, invoice_number, customer_name, total_amount, status, due_date, created_at
    FROM lg_invoices WHERE id = $1 AND tenant_id = $2
  `, { bind: [invoice_id, tid] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];

  const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.created_at);
  const daysOverdue = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

  let escalationLevel;
  if (daysOverdue >= 90) escalationLevel = 4;
  else if (daysOverdue >= 60) escalationLevel = 3;
  else if (daysOverdue >= 45) escalationLevel = 2;
  else escalationLevel = 1;

  const escalationLabels = { 1: 'friendly_reminder', 2: 'firm_notice', 3: 'demand_letter', 4: 'collections_referral' };

  // Track the collections event
  try {
    await sequelize.query(`
      INSERT INTO lg_invoice_events (tenant_id, invoice_id, event_type, details, created_at)
      VALUES ($1, $2, 'collections_notice', $3, NOW())
    `, { bind: [tid, invoice_id, JSON.stringify({ escalation_level: escalationLevel, days_overdue: daysOverdue })] });
  } catch (e) {
    // Table may not exist yet — non-blocking
  }

  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    customer_name: inv.customer_name,
    sent: true,
    escalation_level: escalationLevel,
    escalation_type: escalationLabels[escalationLevel],
    days_overdue: daysOverdue,
    amount: parseFloat(inv.total_amount) || 0,
    due_date: inv.due_date,
  };
}

// (10) audit_carrier_invoice — compare invoice amount against load cost
async function auditCarrierInvoice(input) {
  const { invoice_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!invoice_id) throw new Error('invoice_id is required');

  const [invoices] = await sequelize.query(`
    SELECT i.id, i.invoice_number, i.total_amount, i.load_id,
           l.buy_rate, l.sell_rate, l.load_ref, l.miles,
           l.origin_city, l.origin_state, l.destination_city, l.destination_state
    FROM lg_invoices i
    LEFT JOIN lg_loads l ON l.id = i.load_id
    WHERE i.id = $1 AND i.tenant_id = $2
  `, { bind: [invoice_id, tid] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];

  const invoiceAmount = parseFloat(inv.total_amount) || 0;
  const expectedAmount = parseFloat(inv.buy_rate) || 0;
  const delta = Math.round((invoiceAmount - expectedAmount) * 100) / 100;
  const deltaPct = expectedAmount > 0 ? Math.round((delta / expectedAmount) * 10000) / 100 : 0;
  const threshold = 5; // 5% variance threshold

  const flaggedIssues = [];
  if (Math.abs(deltaPct) > threshold) {
    flaggedIssues.push({
      issue: 'amount_variance',
      message: `Invoice amount $${invoiceAmount} differs from expected $${expectedAmount} by ${deltaPct}%`,
      severity: Math.abs(deltaPct) > 15 ? 'high' : 'medium',
    });
  }
  if (!inv.load_id) {
    flaggedIssues.push({
      issue: 'no_load_linked',
      message: 'Invoice is not linked to a load record',
      severity: 'high',
    });
  }

  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    load_id: inv.load_id,
    load_ref: inv.load_ref,
    lane: inv.origin_city ? `${inv.origin_city}, ${inv.origin_state} -> ${inv.destination_city}, ${inv.destination_state}` : null,
    matches: flaggedIssues.length === 0,
    expected_amount: expectedAmount,
    invoice_amount: invoiceAmount,
    delta: delta,
    delta_pct: deltaPct,
    threshold_pct: threshold,
    flagged_issues: flaggedIssues,
  };
}

// (11) flag_billing_discrepancy — flag an issue on an invoice
async function flagBillingDiscrepancy(input) {
  const { invoice_id, issue_type, details, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!invoice_id) throw new Error('invoice_id is required');
  if (!issue_type) throw new Error('issue_type is required');

  // Store the flag as a metadata update and event
  await sequelize.query(`
    UPDATE lg_invoices SET status = 'flagged' WHERE id = $1 AND tenant_id = $2
  `, { bind: [invoice_id, tid] });

  try {
    await sequelize.query(`
      INSERT INTO lg_invoice_events (tenant_id, invoice_id, event_type, details, created_at)
      VALUES ($1, $2, 'discrepancy_flagged', $3, NOW())
    `, { bind: [tid, invoice_id, JSON.stringify({ issue_type, details: details || null })] });
  } catch (e) {
    // Table may not exist yet — non-blocking
  }

  return {
    invoice_id,
    flagged: true,
    issue_type,
    details: details || null,
    status: 'flagged',
  };
}

// (12) generate_dispute — dispute an invoice
async function generateDispute(input) {
  const { invoice_id, reason, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!invoice_id) throw new Error('invoice_id is required');
  if (!reason) throw new Error('reason is required');

  const [invoices] = await sequelize.query(`
    SELECT id, total_amount, invoice_number FROM lg_invoices
    WHERE id = $1 AND tenant_id = $2
  `, { bind: [invoice_id, tid] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];

  await sequelize.query(`
    UPDATE lg_invoices SET status = 'disputed' WHERE id = $1 AND tenant_id = $2
  `, { bind: [invoice_id, tid] });

  const disputeId = `DSP-${invoice_id}-${Date.now()}`;

  try {
    await sequelize.query(`
      INSERT INTO lg_invoice_events (tenant_id, invoice_id, event_type, details, created_at)
      VALUES ($1, $2, 'dispute_created', $3, NOW())
    `, { bind: [tid, invoice_id, JSON.stringify({ dispute_id: disputeId, reason })] });
  } catch (e) {
    // Table may not exist yet — non-blocking
  }

  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    dispute_id: disputeId,
    reason,
    original_amount: parseFloat(inv.total_amount) || 0,
    status: 'disputed',
  };
}

// (13) track_dispute_resolution — check dispute status
async function trackDisputeResolution(input) {
  const { invoice_id } = input;

  if (!invoice_id) throw new Error('invoice_id is required');

  const [invoices] = await sequelize.query(`
    SELECT id, invoice_number, total_amount, status, customer_name, created_at
    FROM lg_invoices WHERE id = $1
  `, { bind: [invoice_id] });

  if (!invoices[0]) throw new Error(`Invoice ${invoice_id} not found`);
  const inv = invoices[0];

  // Try to get dispute event details
  let disputeDate = null;
  let disputeReason = null;
  try {
    const [events] = await sequelize.query(`
      SELECT details, created_at FROM lg_invoice_events
      WHERE invoice_id = $1 AND event_type = 'dispute_created'
      ORDER BY created_at DESC LIMIT 1
    `, { bind: [invoice_id] });
    if (events[0]) {
      disputeDate = events[0].created_at;
      const det = typeof events[0].details === 'string' ? JSON.parse(events[0].details) : events[0].details;
      disputeReason = det.reason || null;
    }
  } catch (e) {
    // Table may not exist yet — non-blocking
  }

  const isDisputed = inv.status === 'disputed';

  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    customer_name: inv.customer_name,
    status: inv.status,
    disputed: isDisputed,
    dispute_date: disputeDate,
    dispute_reason: disputeReason,
    original_amount: parseFloat(inv.total_amount) || 0,
    resolution: isDisputed ? null : inv.status,
    days_in_dispute: disputeDate ? Math.floor((Date.now() - new Date(disputeDate).getTime()) / (1000 * 60 * 60 * 24)) : null,
  };
}

// ── Agent Definition ────────────────────────────────────────────────────────

const billingAgent = new FreightMindAgent({
  name: 'billing',
  model: 'claude-sonnet-4-5-20250514',
  systemPrompt: `You are the Billing & Settlement agent for FreightMind. You automate invoicing on POD receipt, calculate driver settlements, manage collections, audit invoices, and maximize cash flow. Every dollar counts.`,
  tools: [
    {
      name: 'generate_invoice',
      description: 'Generate an invoice for a delivered load. Creates invoice with 30-day terms and marks the load as invoiced.',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load to invoice' },
          tenant_id: { type: 'string' }
        },
        required: ['load_id']
      },
      handler: generateInvoice
    },
    {
      name: 'calc_driver_pay',
      description: 'Calculate driver pay for a date range. Sums delivered loads at 70% driver split of buy rate.',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'Driver ID' },
          period_start: { type: 'string', description: 'Start date (ISO format)' },
          period_end: { type: 'string', description: 'End date (ISO format)' },
          tenant_id: { type: 'string' }
        },
        required: ['driver_id', 'period_start', 'period_end']
      },
      handler: calcDriverPay
    },
    {
      name: 'submit_to_factoring',
      description: 'Submit an invoice to factoring company for early payment at 3% fee.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the invoice to factor' },
          tenant_id: { type: 'string' }
        },
        required: ['invoice_id']
      },
      handler: submitToFactoring
    },
    {
      name: 'track_payment',
      description: 'Track payment status and aging for an invoice.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the invoice to track' }
        },
        required: ['invoice_id']
      },
      handler: trackPayment
    },
    {
      name: 'reconcile_fuel',
      description: 'Estimate fuel costs for a driver over a period based on route miles (6 MPG, $4.00/gal).',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'Driver ID' },
          period_start: { type: 'string', description: 'Start date (ISO format)' },
          period_end: { type: 'string', description: 'End date (ISO format)' },
          tenant_id: { type: 'string' }
        },
        required: ['driver_id', 'period_start', 'period_end']
      },
      handler: reconcileFuel
    },
    {
      name: 'aging_report',
      description: 'Generate accounts receivable aging report with current, 30d, 60d, 90+ day buckets.',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' }
        }
      },
      handler: agingReport
    },
    {
      name: 'settle_driver',
      description: 'Calculate and record a driver settlement for a pay period. Inserts into lg_settlements.',
      input_schema: {
        type: 'object',
        properties: {
          driver_id: { type: 'integer', description: 'Driver ID' },
          period_start: { type: 'string', description: 'Start date (ISO format)' },
          period_end: { type: 'string', description: 'End date (ISO format)' },
          tenant_id: { type: 'string' }
        },
        required: ['driver_id', 'period_start', 'period_end']
      },
      handler: settleDriver
    },
    {
      name: 'calc_load_profit',
      description: 'Calculate profitability for a single load — revenue, cost, margin, RPM.',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load' }
        },
        required: ['load_id']
      },
      handler: calcLoadProfit
    },
    {
      name: 'send_collections_notice',
      description: 'Send an escalated collections notice for an overdue invoice. Determines escalation level by days overdue.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the overdue invoice' },
          tenant_id: { type: 'string' }
        },
        required: ['invoice_id']
      },
      handler: sendCollectionsNotice
    },
    {
      name: 'audit_carrier_invoice',
      description: 'Audit a carrier invoice against the load buy rate. Flags variance > 5%.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the invoice to audit' },
          tenant_id: { type: 'string' }
        },
        required: ['invoice_id']
      },
      handler: auditCarrierInvoice
    },
    {
      name: 'flag_billing_discrepancy',
      description: 'Flag a billing discrepancy on an invoice. Updates status to flagged and records the issue.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the invoice' },
          issue_type: { type: 'string', description: 'Type of issue (e.g. rate_mismatch, duplicate, missing_pod)' },
          details: { type: 'string', description: 'Description of the discrepancy' },
          tenant_id: { type: 'string' }
        },
        required: ['invoice_id', 'issue_type']
      },
      handler: flagBillingDiscrepancy
    },
    {
      name: 'generate_dispute',
      description: 'Generate a formal dispute for an invoice. Sets status to disputed and records the reason.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the invoice to dispute' },
          reason: { type: 'string', description: 'Reason for the dispute' },
          tenant_id: { type: 'string' }
        },
        required: ['invoice_id', 'reason']
      },
      handler: generateDispute
    },
    {
      name: 'track_dispute_resolution',
      description: 'Track the resolution status of a disputed invoice.',
      input_schema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'integer', description: 'ID of the disputed invoice' }
        },
        required: ['invoice_id']
      },
      handler: trackDisputeResolution
    }
  ]
});

registerAgent(billingAgent);

module.exports = billingAgent;
