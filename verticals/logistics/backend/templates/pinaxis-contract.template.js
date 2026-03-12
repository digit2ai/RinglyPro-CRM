/**
 * PINAXIS Enterprise Services Agreement Template
 * All placeholders use {{PLACEHOLDER}} syntax
 * INTERNAL ONLY — never expose to frontend
 */

module.exports = function getContractHTML(data) {
  const d = {
    CLIENT_NAME: data.client_name || '_______________',
    CLIENT_ADDRESS: data.client_address || '_______________',
    EFFECTIVE_DATE: data.effective_date || '_______________',
    IMPLEMENTATION_FEE: Number(data.implementation_fee || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    MONTHLY_RETAINER: Number(data.monthly_retainer || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    TOKEN_MARKUP: data.token_markup || 30,
    INITIAL_TERM_MONTHS: data.initial_term_months || 24,
    ONBOARDING_HOURS: data.onboarding_hours || 10,
    IMPL_TIMELINE_WEEKS: data.impl_timeline_weeks || 8,
    PROVIDER_NAME: 'Digit2AI LLC d/b/a RinglyPro',
    JURISDICTION: 'Florida',
    NON_COMPETE_MONTHS: 24,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 1in; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.6; color: #1E293B; max-width: 8.5in; margin: 0 auto; padding: 1in; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 0.5em; color: #1B2A4A; }
  h2 { font-size: 13pt; color: #1B2A4A; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px; margin-top: 1.5em; }
  .parties { text-align: center; margin: 1em 0 2em; font-size: 10pt; color: #475569; }
  .section { margin-bottom: 1em; }
  .sig-block { margin-top: 3em; display: flex; justify-content: space-between; }
  .sig-col { width: 45%; }
  .sig-line { border-top: 1px solid #1E293B; margin-top: 3em; padding-top: 4px; font-size: 10pt; }
  .exhibit { page-break-before: always; }
  ol { padding-left: 1.2em; }
  ol li { margin-bottom: 0.5em; }
  .indent { margin-left: 2em; }
</style>
</head>
<body>

<h1>ENTERPRISE SERVICES AGREEMENT</h1>

<div class="parties">
  This Enterprise Services Agreement ("Agreement") is entered into as of
  <strong>${d.EFFECTIVE_DATE}</strong> ("Effective Date") by and between:<br><br>
  <strong>${d.PROVIDER_NAME}</strong> ("Provider")<br>
  and<br>
  <strong>${d.CLIENT_NAME}</strong> ("Client")<br>
  ${d.CLIENT_ADDRESS}
</div>

<h2>1. DEFINITIONS</h2>
<div class="section">
  <ol>
    <li><strong>"Services"</strong> means the AI-powered logistics analytics, automation, and consulting services described in Exhibit A.</li>
    <li><strong>"Platform"</strong> means Provider's proprietary PINAXIS logistics intelligence platform, including all MCP tools, dashboards, and integrations.</li>
    <li><strong>"Token Consumption"</strong> means the aggregate usage of AI model input and output tokens consumed through the Platform on Client's behalf.</li>
    <li><strong>"Confidential Information"</strong> means all non-public information disclosed by either party, including business data, technical specifications, pricing, and trade secrets.</li>
    <li><strong>"Deliverables"</strong> means all reports, analyses, configurations, and documentation produced by Provider under this Agreement.</li>
  </ol>
</div>

<h2>2. SCOPE OF SERVICES</h2>
<div class="section">
  <p>Provider shall deliver the Services described in Exhibit A, including but not limited to:</p>
  <ol>
    <li>Warehouse data analysis and optimization recommendations via PINAXIS platform</li>
    <li>AI-powered product-to-service matching and fit analysis</li>
    <li>OEE analytics, anomaly detection, and predictive maintenance</li>
    <li>Proposal and document generation</li>
    <li>IoT data interpretation and Galileo integration</li>
    <li>Ongoing platform access, maintenance, and support</li>
  </ol>
  <p>Implementation shall commence within five (5) business days of the Effective Date and shall be completed within <strong>${d.IMPL_TIMELINE_WEEKS} weeks</strong>, subject to Client's timely provision of required data and access.</p>
  <p>Provider shall allocate <strong>${d.ONBOARDING_HOURS} hours</strong> of dedicated onboarding and training support.</p>
</div>

<h2>3. FEES, BILLING & TOKEN CONSUMPTION</h2>
<div class="section">
  <ol>
    <li><strong>Implementation Fee:</strong> ${d.IMPLEMENTATION_FEE}, due upon execution of this Agreement.</li>
    <li><strong>Monthly Retainer:</strong> ${d.MONTHLY_RETAINER} per month, due on the first business day of each calendar month, beginning the month following completion of implementation.</li>
    <li><strong>Token Consumption:</strong> Token consumption is billed monthly at actual API cost plus ${d.TOKEN_MARKUP}%. Provider shall supply a monthly consumption report detailing token usage by service category.</li>
    <li><strong>Overage:</strong> Consumption exceeding 150% of the established baseline shall be billed at the same rate, with five (5) business days' written notice to Client.</li>
    <li><strong>Payment Terms:</strong> All invoices are due within thirty (30) days of issuance. Late payments accrue interest at 1.5% per month or the maximum rate permitted by law, whichever is less.</li>
  </ol>
</div>

<h2>4. TERM & TERMINATION</h2>
<div class="section">
  <ol>
    <li><strong>Initial Term:</strong> This Agreement shall commence on the Effective Date and continue for a period of <strong>${d.INITIAL_TERM_MONTHS} months</strong> ("Initial Term").</li>
    <li><strong>Renewal:</strong> Upon expiration of the Initial Term, this Agreement shall automatically renew for successive twelve (12) month periods unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current term.</li>
    <li><strong>Termination for Cause:</strong> Either party may terminate this Agreement upon thirty (30) days' written notice if the other party materially breaches any provision and fails to cure such breach within the notice period.</li>
    <li><strong>Effect of Termination:</strong> Upon termination, Client shall pay all fees accrued through the termination date. Provider shall deliver all completed Deliverables and provide reasonable transition assistance for thirty (30) days.</li>
  </ol>
</div>

<h2>5. INTELLECTUAL PROPERTY</h2>
<div class="section">
  <ol>
    <li><strong>Provider IP:</strong> All rights, title, and interest in the Platform, including all software, algorithms, models, prompts, configurations, and methodologies, shall remain the exclusive property of Provider.</li>
    <li><strong>Client Data:</strong> Client retains all rights to its proprietary data. Provider receives a limited license to use Client data solely to perform the Services.</li>
    <li><strong>Deliverables:</strong> Client receives a non-exclusive, non-transferable license to use Deliverables for its internal business purposes. Provider retains ownership of all underlying methodologies, tools, and frameworks.</li>
  </ol>
</div>

<h2>6. NON-CIRCUMVENTION & ANTI-REVERSE ENGINEERING</h2>
<div class="section">
  <ol>
    <li><strong>Non-Circumvention:</strong> During the term and for ${d.NON_COMPETE_MONTHS} months thereafter, Client shall not directly or indirectly engage, contract with, or solicit any third party to replicate, replace, or substitute the Services using substantially similar AI tools, prompts, workflows, or methodologies as those employed by Provider.</li>
    <li><strong>Anti-Reverse Engineering:</strong> Client shall not reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, prompts, or architecture of the Platform or any component thereof.</li>
    <li><strong>Remedies:</strong> Client acknowledges that a breach of this Section would cause irreparable harm and that Provider shall be entitled to injunctive relief in addition to any other remedies available at law or in equity.</li>
  </ol>
</div>

<h2>7. CONFIDENTIALITY</h2>
<div class="section">
  <ol>
    <li>Each party agrees to hold in strict confidence all Confidential Information received from the other party.</li>
    <li>Confidential Information shall not be disclosed to any third party without the disclosing party's prior written consent, except as required by law.</li>
    <li>This obligation survives termination for a period of three (3) years.</li>
  </ol>
</div>

<h2>8. REPRESENTATIONS & WARRANTIES</h2>
<div class="section">
  <ol>
    <li>Provider represents that the Services will be performed in a professional and workmanlike manner consistent with industry standards.</li>
    <li>Client represents that it has the authority to enter into this Agreement and that all data provided is accurate and lawfully obtained.</li>
    <li><strong>DISCLAIMER:</strong> EXCEPT AS EXPRESSLY SET FORTH HEREIN, PROVIDER MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.</li>
  </ol>
</div>

<h2>9. LIMITATION OF LIABILITY</h2>
<div class="section">
  <p>IN NO EVENT SHALL EITHER PARTY'S AGGREGATE LIABILITY UNDER THIS AGREEMENT EXCEED THE TOTAL FEES PAID BY CLIENT IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.</p>
</div>

<h2>10. GOVERNING LAW</h2>
<div class="section">
  <p>This Agreement shall be governed by and construed in accordance with the laws of the State of ${d.JURISDICTION}, without regard to its conflict of laws principles. Any dispute arising under this Agreement shall be resolved in the state or federal courts located in ${d.JURISDICTION}.</p>
</div>

<h2>11. GENERAL PROVISIONS</h2>
<div class="section">
  <ol>
    <li><strong>Entire Agreement:</strong> This Agreement, including all exhibits, constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and agreements.</li>
    <li><strong>Amendments:</strong> No modification shall be effective unless in writing and signed by both parties.</li>
    <li><strong>Severability:</strong> If any provision is held invalid, the remaining provisions shall remain in full force and effect.</li>
    <li><strong>Assignment:</strong> Neither party may assign this Agreement without the other party's prior written consent, except in connection with a merger or acquisition.</li>
    <li><strong>Notices:</strong> All notices shall be in writing and delivered to the addresses set forth above.</li>
    <li><strong>Force Majeure:</strong> Neither party shall be liable for delays caused by events beyond its reasonable control.</li>
  </ol>
</div>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-line"><strong>${d.PROVIDER_NAME}</strong></div>
    <br>
    <div class="sig-line">Authorized Signature</div>
    <br>
    <div class="sig-line">Name &amp; Title</div>
    <br>
    <div class="sig-line">Date</div>
  </div>
  <div class="sig-col">
    <div class="sig-line"><strong>${d.CLIENT_NAME}</strong></div>
    <br>
    <div class="sig-line">Authorized Signature</div>
    <br>
    <div class="sig-line">Name &amp; Title</div>
    <br>
    <div class="sig-line">Date</div>
  </div>
</div>

<div class="exhibit">
  <h2>EXHIBIT A — SCOPE OF SERVICES</h2>
  <div class="section">
    <p>The following services shall be delivered by Provider under this Agreement:</p>
    <ol>
      <li><strong>PINAXIS Platform Access:</strong> Full access to the PINAXIS logistics intelligence platform, including all MCP tools for warehouse analytics, product matching, simulation, and reporting.</li>
      <li><strong>Data Intake & Analysis:</strong> Ingestion and analysis of Client's warehouse operational data, including order structures, throughput patterns, SKU classifications, and storage utilization.</li>
      <li><strong>Product-to-Service Matching:</strong> AI-powered recommendations for automation products and configurations tailored to Client's operational profile.</li>
      <li><strong>OEE Analytics:</strong> Real-time Overall Equipment Effectiveness monitoring, anomaly detection, and predictive maintenance alerts.</li>
      <li><strong>Simulation & Modeling:</strong> Scenario-based simulation of proposed automation solutions with throughput, cost, and ROI projections.</li>
      <li><strong>Proposal Generation:</strong> Automated generation of comprehensive proposals including technical specifications, pricing, risk registers, and implementation timelines.</li>
      <li><strong>Galileo IoT Integration:</strong> Interpretation and visualization of IoT sensor data for warehouse monitoring and optimization.</li>
      <li><strong>Onboarding & Training:</strong> ${d.ONBOARDING_HOURS} hours of onboarding support including platform training, data import assistance, and workflow configuration.</li>
      <li><strong>Ongoing Support:</strong> Business-hours support via email and platform chat, with 24-hour response SLA for critical issues.</li>
    </ol>
  </div>
</div>

</body>
</html>`;
};
