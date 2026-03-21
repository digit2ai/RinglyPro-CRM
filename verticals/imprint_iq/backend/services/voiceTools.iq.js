/**
 * ImprintIQ Voice Tools — Data fetchers for Lina's presentation capabilities
 * Each tool returns structured text that Lina can speak naturally
 */
const sequelize = require('./db.iq');
const neuralEngine = require('./neural.iq');

const TENANT = 'imprint_iq';

// Tool: Get Dashboard KPIs
async function getDashboardOverview() {
  try {
    const [quotes, orders, production, customers, calls, inventory] = await Promise.all([
      sequelize.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM iq_quotes WHERE tenant_id = $1 AND stage IN ('draft','sent')`, { bind: [TENANT] }).then(r => r[0][0]),
      sequelize.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM iq_orders WHERE tenant_id = $1 AND stage NOT IN ('delivered','cancelled')`, { bind: [TENANT] }).then(r => r[0][0]),
      sequelize.query(`SELECT COUNT(*) as cnt FROM iq_production_jobs WHERE tenant_id = $1 AND stage IN ('queued','setup','running')`, { bind: [TENANT] }).then(r => r[0][0]),
      sequelize.query(`SELECT COUNT(*) as cnt FROM iq_customers WHERE tenant_id = $1 AND status = 'active'`, { bind: [TENANT] }).then(r => r[0][0]),
      sequelize.query(`SELECT COUNT(*) as cnt FROM iq_calls WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`, { bind: [TENANT] }).then(r => r[0][0]),
      sequelize.query(`SELECT SUM(CASE WHEN qty_on_hand <= reorder_point AND reorder_point > 0 THEN 1 ELSE 0 END) as low_stock FROM iq_inventory WHERE tenant_id = $1`, { bind: [TENANT] }).then(r => r[0][0])
    ]);

    return `Here is the current ImprintIQ dashboard overview. There are ${quotes.cnt} open quotes worth $${Math.round(parseFloat(quotes.total)).toLocaleString()} in the pipeline. ${orders.cnt} active orders totaling $${Math.round(parseFloat(orders.total)).toLocaleString()} are in production. ${production.cnt} production jobs are currently in progress across the decoration lines. The customer base has ${customers.cnt} active accounts. There were ${calls.cnt} voice AI calls in the last 7 days. ${parseInt(inventory.low_stock || 0)} inventory items are below reorder point and need attention.`;
  } catch (err) {
    return 'I was unable to fetch the dashboard data at this moment. Let me describe what the dashboard typically shows instead.';
  }
}

// Tool: Get Neural Intelligence Report
async function getNeuralReport() {
  try {
    const dashboard = await neuralEngine.getDashboard(TENANT);
    const findings = await neuralEngine.generateFindings(TENANT);

    let report = `The Neural Intelligence health score is currently ${dashboard.overallScore} out of 100, rated as ${dashboard.scoreLabel}. `;
    report += `Here are the 6 health panel scores: `;
    dashboard.panels.forEach(p => {
      report += `${p.name} is at ${p.score} out of 100 — ${p.topFinding}. `;
    });

    if (findings.length > 0) {
      report += `Neural has identified ${findings.length} diagnostic findings. `;
      findings.slice(0, 5).forEach(f => {
        report += `${f.severity} finding: ${f.title}. ${f.dollarImpact}. `;
      });
    }

    return report;
  } catch (err) {
    return 'I was unable to fetch the Neural Intelligence report at this moment.';
  }
}

// Tool: Get Process Comparison (Current vs ImprintIQ)
async function getProcessComparison() {
  return `Here is the current state versus ImprintIQ target state comparison for Hit Promotional Products.

Quoting: Currently takes 4 to 24 hours per quote with manual price lookups. With ImprintIQ, quotes are generated in 30 seconds from natural language input. This saves approximately $180,000 per year in sales rep time.

Artwork and Proofing: Currently takes 3 to 5 days with an average of 3 or more revision cycles via email. With ImprintIQ, the Art Director Agent validates artwork in 2 seconds and generates virtual mockups automatically. Customer approves with one click. This saves approximately $250,000 per year.

Call Handling: Currently 30 to 40 percent of calls are missed with no after-hours coverage. With ImprintIQ, AI voice agents answer every call 24/7, create customer records, and can generate quotes during the call. This saves $55,000 in reception costs plus recovers approximately $780,000 in orders that would otherwise be lost to competitors.

Reorder Detection: Currently there is zero proactive reorder tracking. Customers leave silently. With ImprintIQ, AI predicts reorder windows based on purchase history and proactively contacts customers 30 days before they need to buy. This recovers approximately $200,000 per year in customer revenue.

Production Scheduling: Currently managed by whiteboard and paper tickets. With ImprintIQ, the Production Orchestrator Agent routes jobs to the optimal decoration line, predicts bottlenecks before they happen, and tracks OEE in real-time. This saves approximately $350,000 per year.

Invoicing and Collections: Currently invoices are generated 1 to 3 days after shipment with manual collections and 45-plus day DSO. With ImprintIQ, invoices generate instantly on shipment confirmation and AI automatically follows up on overdue accounts. This saves approximately $140,000 per year and reduces DSO by 12 days.

The total projected operational savings is approximately $1.955 million per year, before counting additional revenue gains from recovered calls and proactive reorders.`;
}

// Tool: Get Architecture Overview
async function getArchitectureOverview() {
  return `ImprintIQ is built on a 5-layer data architecture that feeds Neural Intelligence and 11 autonomous AI agents.

Layer 1 is ERP and Operational Data. This is what already happened — customers, quotes, orders, invoices, inventory, and shipments. We pull this from their existing systems like QuickBooks, Antera, commonsku, or SAGE. This layer is fully built and operational.

Layer 2 is Communications Data. This captures what people said — phone call transcripts, emails, chat messages, SMS, and meeting notes. This is where 60 percent of the real intelligence lives. The Voice AI agents generate this data automatically from every call they handle. This layer is planned for the next phase.

Layer 3 is Market and Industry Data. This tracks what is happening outside — ASI and SAGE product catalogs with over 100,000 SKUs, real-time supplier inventory via PromoStandards API, market pricing benchmarks, trade show calendars, and competitor activity. This layer is planned.

Layer 4 is Production and Sensor Data. This monitors what machines are doing — machine status and OEE, QC vision inspection comparing finished products to approved proofs, barcode tracking through workflow stages, and shipping carrier events. This layer is planned.

Layer 5 is Behavioral and Engagement Data. This predicts what customers will do next — website browsing activity, email campaign engagement, search queries, customer engagement scores, and social media signals that indicate buying intent. This layer is planned.

When only Layer 1 is active, you get backward-looking findings about what happened. When Layers 1 and 2 are active, you understand what is happening right now. With all 5 layers active, you have a fully predictive, autonomous business operation.

The system includes 11 AI agents: Catalog Intelligence, Quote Engine, Art Director, Production Orchestrator, Supply Chain, QC Vision, Fulfillment, Customer Voice with Rachel and Ana, Sales Intelligence, Finance and Billing, and Compliance.`;
}

// Tool: Get ROI Summary for Hit Promo
async function getROISummary() {
  return `Here is the projected return on investment for Hit Promotional Products based on their $655 million annual revenue.

The ImprintIQ investment is $120,000 per month, which is $1.44 million annually. This includes all 11 AI agents, Neural Intelligence with 6 health panels and 15 diagnostic analyzers, system integrations, and managed AI operations.

The projected annual operational savings break down as follows:
Quoting automation saves $180,000 per year.
Artwork and proof automation saves $250,000 per year.
Call recovery and voice AI saves $835,000 per year, including $780,000 in recovered order revenue.
Reorder intelligence saves $200,000 per year.
Production scheduling optimization saves $350,000 per year.
Invoice and collections automation saves $140,000 per year.
The total projected annual savings is $1.955 million.

This gives a net annual benefit of $515,000, a return on investment of 1.36 times, and a payback period of approximately 9 months. These are conservative numbers based on operational savings only.

Additional revenue upside not included in these numbers: recovered missed call revenue of $780,000 or more per year, proactive reorder capture reactivating 20 to 30 percent of dormant accounts, faster quoting that doubles proposal volume, reduced customer churn, competitive pricing intelligence, and OEE optimization for the new 800,000 square foot facility in Fairfield, Ohio.

When you include the revenue upside, the total impact could exceed $3 to $4 million annually.`;
}

// Tool: Get specific finding details
async function getFindings() {
  try {
    const findings = await neuralEngine.generateFindings(TENANT);
    if (findings.length === 0) return 'No diagnostic findings are currently active. All systems are nominal.';

    let report = `Neural Intelligence has identified ${findings.length} active findings. Here they are in order of severity: `;
    findings.forEach((f, i) => {
      report += `Finding ${i + 1}: ${f.severity} severity. ${f.title}. ${f.explanation} The dollar impact is ${f.dollarImpact}. `;
      if (f.treatment) {
        report += `The recommended treatment is ${f.treatment.treatment_type.replace(/_/g, ' ')}. ${f.treatment.projection}. `;
      }
    });
    return report;
  } catch (err) {
    return 'I was unable to fetch the findings at this moment.';
  }
}

// Tool: Get system health and OBD codes
async function getSystemHealth() {
  try {
    const obdCodes = await neuralEngine.getOBDCodes(TENANT);
    let report = 'Here is the on-board diagnostics status for all ImprintIQ systems. ';
    obdCodes.forEach(obd => {
      report += `${obd.code}, ${obd.system}: ${obd.reading} with ${obd.value} ${obd.label}. `;
    });
    const okCount = obdCodes.filter(o => o.status === 'ok').length;
    const warnCount = obdCodes.filter(o => o.status === 'warn').length;
    report += `Overall: ${okCount} systems operational, ${warnCount} need attention.`;
    return report;
  } catch (err) {
    return 'I was unable to fetch system health data at this moment.';
  }
}

module.exports = {
  getDashboardOverview,
  getNeuralReport,
  getProcessComparison,
  getArchitectureOverview,
  getROISummary,
  getFindings,
  getSystemHealth
};
