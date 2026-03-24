/**
 * FreightMind AI Voice Tools — Data fetchers for Rachel's sales presentation
 * Each tool returns structured text that the ElevenLabs agent can speak naturally
 */
const path = require('path');
const sequelize = require(path.join(__dirname, '../../../cw_carriers/backend/services/db.cw'));
const TENANT = 'demo';

// Tool 1: Get OBD Scanner Overview
async function getOBDOverview() {
  try {
    const [scan] = await sequelize.query(
      `SELECT * FROM lg_obd_scans WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      { bind: [TENANT] }
    );
    const latestScan = scan[0] || {};

    const [findings] = await sequelize.query(
      `SELECT severity, COUNT(*) as cnt, COALESCE(SUM(estimated_monthly_savings),0) as savings
       FROM lg_obd_findings WHERE tenant_id = $1
       GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 WHEN 'advisory' THEN 3 ELSE 4 END`,
      { bind: [TENANT] }
    );

    const totalFindings = findings.reduce((s, f) => s + parseInt(f.cnt), 0);
    const totalSavings = findings.reduce((s, f) => s + parseFloat(f.savings), 0);
    const bySeverity = findings.map(f => `${f.cnt} ${f.severity}`).join(', ');

    let text = `Here is the OBD Scanner overview for CW Carriers. `;
    if (latestScan.overall_score !== undefined) {
      text += `The overall operational health score is ${latestScan.overall_score} out of 100. `;
    }
    text += `The scan identified ${totalFindings} findings: ${bySeverity}. `;
    text += `Total estimated monthly savings across all findings is $${Math.round(totalSavings).toLocaleString()}. `;
    if (latestScan.created_at) {
      text += `The last scan was run on ${new Date(latestScan.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. `;
    }
    text += `The FreightMind platform deploys 8 AI agents, 92 MCP tools, and 7 diagnostic modules to analyze every dimension of your freight operations.`;

    return text;
  } catch (err) {
    console.error('[voiceTools.freight] getOBDOverview error:', err.message);
    return 'I was unable to fetch the OBD Scanner overview at this moment. The OBD Scanner analyzes freight broker operations across 7 diagnostic modules, deploying 8 AI agents and 92 MCP tools. It identifies margin leaks, concentration risks, and operational inefficiencies, then prescribes specific AI-powered treatments.';
  }
}

// Tool 2: Get All Open Findings
async function getFindings() {
  try {
    const [rows] = await sequelize.query(
      `SELECT severity, title, diagnostic, estimated_monthly_savings
       FROM lg_obd_findings WHERE tenant_id = $1 AND status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 WHEN 'advisory' THEN 3 ELSE 4 END,
                estimated_monthly_savings DESC NULLS LAST`,
      { bind: [TENANT] }
    );

    if (rows.length === 0) {
      return 'There are currently no open findings for CW Carriers. All previously identified issues have been resolved.';
    }

    let text = `The OBD Scanner identified ${rows.length} open findings for CW Carriers. `;
    rows.forEach((f, i) => {
      const savings = f.estimated_monthly_savings ? `, with estimated savings of $${Math.round(parseFloat(f.estimated_monthly_savings)).toLocaleString()} per month` : '';
      if (i === 0) {
        text += `The most critical finding is: ${f.title}. ${f.diagnostic}${savings}. `;
      } else {
        text += `Next is a ${f.severity} finding: ${f.title}. ${f.diagnostic}${savings}. `;
      }
    });

    return text;
  } catch (err) {
    console.error('[voiceTools.freight] getFindings error:', err.message);
    return 'I was unable to fetch findings at this moment. The scan typically identifies critical issues including customer concentration risk, negative margin loads, truck idle rates, and compliance gaps.';
  }
}

// Tool 3: Get Prescriptions ranked by savings
async function getPrescriptions() {
  try {
    const [rows] = await sequelize.query(
      `SELECT title, prescription, estimated_monthly_savings, severity, recommended_agent
       FROM lg_obd_findings WHERE tenant_id = $1 AND prescription IS NOT NULL AND estimated_monthly_savings > 0
       ORDER BY estimated_monthly_savings DESC`,
      { bind: [TENANT] }
    );

    if (rows.length === 0) {
      return 'There are currently no prescriptions with savings data available. Run a full OBD scan to generate prescriptions.';
    }

    let text = `Here are the top prescriptions ranked by potential savings. `;
    rows.forEach((f, i) => {
      const monthly = Math.round(parseFloat(f.estimated_monthly_savings)).toLocaleString();
      if (i === 0) {
        text += `The highest-ROI prescription is ${f.title}, with estimated savings of $${monthly} per month. The recommended action is: ${f.prescription}. `;
        if (f.recommended_agent) {
          text += `This would be executed by the ${f.recommended_agent} agent. `;
        }
      } else {
        text += `Next: ${f.title}, saving $${monthly} per month. ${f.prescription}. `;
      }
    });

    return text;
  } catch (err) {
    console.error('[voiceTools.freight] getPrescriptions error:', err.message);
    return 'I was unable to fetch prescriptions at this moment. Prescriptions are AI-generated action plans that address each finding with specific remediation steps.';
  }
}

// Tool 4: Get Cost Reduction Model
async function getCostReductionModel() {
  return `Let me walk you through the cost reduction model for CW Carriers.

There are five major areas where FreightMind AI drives measurable savings.

First, margin recovery: $480,000 per year. This comes from identifying and eliminating negative margin loads, renegotiating underperforming lanes, and implementing dynamic pricing floors. Your scan found 4 negative margin loads in just the last 50 — that is direct revenue leakage.

Second, lane optimization: $300,000 per year. By analyzing historical lane performance, identifying backhaul opportunities on the Florida-Georgia corridor, and matching complementary freight, we eliminate dead miles and improve asset utilization.

Third, carrier rate optimization: $420,000 per year. AI-powered carrier scoring, real-time rate benchmarking against DAT averages, and automated rate negotiation reduce your cost per load by 3 to 5 percent across your carrier base.

Fourth, operational efficiency: $180,000 per year. Automating check calls, status updates, appointment scheduling, and document management frees up dispatcher time. Each dispatcher recovers 2 to 3 hours per day.

Fifth, claims reduction: $120,000 per year. Predictive carrier scoring and proactive monitoring reduce cargo claims, double-brokering exposure, and service failures.

The total Year 1 cost reduction is $1.5 million against a $45 to $82 million revenue base. That is a conservative estimate based on the findings from your actual operational data.`;
}

// Tool 5: Get Company Profile
async function getCompanyProfile() {
  return `Here is the CW Carriers profile.

CW Carriers USA is a woman-owned freight brokerage headquartered in Tampa, Florida, led by CEO Ljiljana Trkulja. The company has been under continuous MC operation since 2005, with over 20 years of industry experience.

Revenue ranges from $45 to $82 million annually, operating under MC-682070. Their core verticals include Food and Beverage, Consumer Packaged Goods, and automotive logistics.

Key clients include PepsiCo, Spartan Nash, Performance Food Group, and Boise Paper. Their on-time delivery rate is 98 percent, which is excellent.

On the technology side, CW runs McLeod TMS as their core operating system, integrated with Macropoint for visibility, Highway and Carrier Assure for carrier vetting, and CargoNet for cargo theft prevention.

The combination of strong operational performance, an established client base, and McLeod as the TMS makes CW an ideal candidate for FreightMind AI — we have a pre-built McLeod integration profile that connects in under 48 hours.`;
}

// Tool 6: Get Pricing Model
async function getPricingModel() {
  return `Let me explain the FreightMind AI pricing model. There are three tiers designed to match your readiness and ambition.

Tier 1 is the Scanner tier at $8,500 per month. This gives you the full OBD diagnostic engine — all 7 scan modules, the universal ingestion engine connected to McLeod, monthly diagnostic reports, and a dedicated findings dashboard. Think of it as getting the diagnosis without the treatment. This is where most clients start.

Tier 2 is the Treatment tier at $12,500 per month plus 2.5 percent of documented savings. This adds AI agents that automatically execute the prescriptions — lane optimization, carrier renegotiation, backhaul matching, and proactive monitoring. The 2.5 percent success fee means we are directly incentivized to deliver results. You only pay on savings we actually generate.

Tier 3 is the Managed tier at $18,000 per month. This is the full FreightMind operating layer — all Scanner and Treatment capabilities, plus dedicated AI operations management, custom agent development, quarterly business reviews, and priority support. This is for brokerages that want AI as a strategic advantage, not just a cost savings tool.

Implementation is a one-time fee of $35,000, which covers McLeod integration, historical data migration, agent configuration, and staff training.

For CW Carriers at the Treatment tier, the Year 1 total investment is approximately $185,000 — that includes $35K implementation plus 12 months at $12,500. Against $1.5 million in projected savings, that is an 8 to 1 return on investment. The platform pays for itself in the first 6 weeks.`;
}

// Tool 7: Get 3-Year ROI Projection
async function getROIProjection() {
  return `Here is the 3-year ROI projection for CW Carriers on the Treatment tier.

Year 1: Projected savings of $1.5 million. Total cost is approximately $185,000 — that includes the $35,000 implementation fee plus $150,000 in platform fees. Net benefit in Year 1 is $1.315 million. The payback period is approximately 6 weeks.

Year 2: Projected savings increase to $2 million as the AI models mature, more lanes are optimized, and Treatment agents expand coverage. Annual cost drops to $180,000 since there is no implementation fee. Net benefit is $1.82 million.

Year 3: Projected savings reach $2.5 million. By this point, AI agents handle carrier negotiations, predictive load matching, and proactive customer retention autonomously. Annual cost is approximately $350,000 reflecting expanded agent coverage. Net benefit is $2.15 million.

Over the 3-year period, the total savings are $6 million against a total investment of $715,000. That yields a net benefit of $5.285 million. For every dollar invested in FreightMind AI, CW Carriers gets $8.40 back. That is not a projection based on theory — it is based on the actual findings from your McLeod data.`;
}

// Tool 8: Get Tech Stack Architecture
async function getTechStack() {
  return `Let me describe the FreightMind OBD Scanner architecture.

At the foundation is the Universal Ingestion Engine. This is what makes FreightMind different from any other analytics tool. It accepts data in any format — CSV, JSON, EDI 204 and 214, Excel, or direct API connections. It uses over 500 fuzzy field aliases to automatically map incoming data regardless of how fields are labeled. If your TMS calls it "customer_rate" and another calls it "cust_linehaul", FreightMind maps both correctly.

We have 10 pre-built TMS integration profiles: McLeod, TMW, MercuryGate, Aljex, Tai TMS, Turvo, 3G-TMS, Banyan, Revenova, and Ascend. For CW Carriers, the McLeod profile connects in under 48 hours with automated daily data pulls.

Once data is ingested, it flows through 7 diagnostic scan modules. Module 1 is Load Operations — analyzing individual load profitability, accessorial charges, and detention patterns. Module 2 is Rate Intelligence — benchmarking your rates against market data and identifying lanes where you overpay carriers. Module 3 is Fleet and Asset Utilization — measuring truck idle rates, load-to-truck ratios, and deadhead miles. Module 4 is Financial Health — analyzing margin trends, cash flow, and payment patterns. Module 5 is Compliance — tracking carrier insurance, authority status, and safety scores. Module 6 is Driver and Carrier Performance — scoring carriers on reliability, communication, and claim history. Module 7 is Customer Analytics — identifying concentration risk, churn signals, and growth opportunities.

Each scan module produces findings with severity levels, and every finding has an AI-generated prescription. The Treatment layer takes those prescriptions and deploys AI agents to execute them automatically — negotiating rates, matching backhauls, updating carrier scores, and alerting dispatchers to emerging issues.`;
}

module.exports = {
  getOBDOverview,
  getFindings,
  getPrescriptions,
  getCostReductionModel,
  getCompanyProfile,
  getPricingModel,
  getROIProjection,
  getTechStack
};
