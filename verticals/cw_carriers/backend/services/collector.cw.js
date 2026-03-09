/**
 * Business Collector Service
 * Lead sourcing pipeline — finds shippers matching CW's target profile,
 * enriches them, scores them, and feeds into HubSpot for Rachel to call.
 */
const Anthropic = require('@anthropic-ai/sdk');
const sequelize = require('./db.cw');
const hubspot = require('./hubspot.cw');

const anthropic = new Anthropic();

// Default target verticals for CW Carriers
const DEFAULT_TARGET_VERTICALS = [
  'Food & Beverage', 'CPG', 'Automotive', 'Manufacturing',
  'Agriculture', 'Chemicals', 'Retail', 'E-Commerce'
];

const DEFAULT_TARGET_LANES = [
  'TX', 'IL', 'CA', 'FL', 'GA', 'OH', 'PA', 'NJ', 'NY', 'MI'
];

/**
 * Score a prospect based on freight profile fit
 * Returns 0-100 score
 */
async function scoreProspect(prospect) {
  const { company_name, industry, estimated_volume, lanes, freight_types, revenue } = prospect;
  let score = 0;

  // Industry fit (0-30)
  if (industry) {
    const match = DEFAULT_TARGET_VERTICALS.some(v => industry.toLowerCase().includes(v.toLowerCase()));
    score += match ? 30 : 10;
  }

  // Volume fit (0-25)
  if (estimated_volume) {
    const vol = parseInt(estimated_volume);
    if (vol >= 100) score += 25;
    else if (vol >= 50) score += 20;
    else if (vol >= 20) score += 15;
    else if (vol >= 5) score += 10;
    else score += 5;
  }

  // Lane match (0-25)
  if (lanes && lanes.length) {
    const matchCount = lanes.filter(l => DEFAULT_TARGET_LANES.some(t => l.toUpperCase().includes(t))).length;
    score += Math.min(25, matchCount * 8);
  }

  // Freight type match (0-20)
  const cwTypes = ['dry_van', 'reefer', 'flatbed', 'ltl'];
  if (freight_types && freight_types.length) {
    const matchCount = freight_types.filter(ft => cwTypes.includes(ft.toLowerCase())).length;
    score += Math.min(20, matchCount * 7);
  } else {
    score += 10; // Unknown = moderate
  }

  return Math.min(100, score);
}

/**
 * Enrich prospect data using AI
 * Takes basic company info and generates enriched profile
 */
async function enrichProspect(companyName, basicInfo = {}) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a freight logistics business analyst. Given a company name, provide a JSON estimate of their shipping profile for a freight broker. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Company: ${companyName}${basicInfo.industry ? `, Industry: ${basicInfo.industry}` : ''}${basicInfo.location ? `, Location: ${basicInfo.location}` : ''}

Return JSON with:
{
  "industry": "specific industry",
  "estimated_annual_freight_loads": number,
  "likely_freight_types": ["dry_van", "reefer", etc],
  "likely_lanes": ["State abbreviations"],
  "estimated_revenue_tier": "small|medium|large|enterprise",
  "decision_maker_title": "likely title of logistics contact",
  "notes": "brief business context"
}`
      }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return basicInfo;
    return { ...basicInfo, ...JSON.parse(jsonMatch[0]) };
  } catch (err) {
    console.error('CW enrichment error:', err.message);
    return basicInfo;
  }
}

/**
 * Import prospects from a list (manual upload or API source)
 * Each prospect: { company_name, full_name, email, phone, industry, location, notes }
 */
async function importProspects(prospects = []) {
  const results = { imported: 0, skipped: 0, errors: 0, details: [] };

  for (const p of prospects) {
    try {
      // Check for duplicates
      if (p.email) {
        const [[existing]] = await sequelize.query(
          `SELECT id FROM cw_contacts WHERE email = $1`, { bind: [p.email] }
        );
        if (existing) {
          results.skipped++;
          results.details.push({ company: p.company_name, status: 'skipped', reason: 'Email exists' });
          continue;
        }
      }

      // Enrich
      const enriched = await enrichProspect(p.company_name, p);

      // Score
      const score = await scoreProspect({
        ...p,
        industry: enriched.industry || p.industry,
        estimated_volume: enriched.estimated_annual_freight_loads,
        lanes: enriched.likely_lanes,
        freight_types: enriched.likely_freight_types
      });

      // Insert as prospect
      const [[newContact]] = await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, freight_types, lanes, volume_estimate, created_at, updated_at)
         VALUES ('prospect', $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
        {
          bind: [
            p.company_name,
            p.full_name || enriched.decision_maker_title || null,
            p.email || null,
            p.phone || null,
            enriched.likely_freight_types || null,
            enriched.likely_lanes || null,
            enriched.estimated_annual_freight_loads ? `${enriched.estimated_annual_freight_loads} loads/yr` : null
          ]
        }
      );

      // Log score in analytics
      await sequelize.query(
        `INSERT INTO cw_analytics (metric_type, metric_date, value_json, created_at)
         VALUES ('prospect_score', CURRENT_DATE, $1, NOW())`,
        { bind: [JSON.stringify({ contact_id: newContact.id, company: p.company_name, score, enriched })] }
      );

      // Auto-sync high-score prospects to HubSpot
      if (score >= 60) {
        hubspot.createContact({
          company_name: p.company_name,
          full_name: p.full_name || '',
          email: p.email || '',
          phone: p.phone || '',
          contact_type: 'prospect'
        }).then(result => {
          if (result.success && result.data?.id) {
            sequelize.query(`UPDATE cw_contacts SET hubspot_id = $1 WHERE id = $2`, { bind: [result.data.id, newContact.id] });
          }
        }).catch(e => console.error('CW BC→HubSpot error:', e.message));
      }

      results.imported++;
      results.details.push({ company: p.company_name, status: 'imported', score, enriched: !!enriched.industry });
    } catch (err) {
      results.errors++;
      results.details.push({ company: p.company_name, status: 'error', error: err.message });
    }
  }

  return results;
}

/**
 * Get prospect pipeline (scored and ranked)
 */
async function getProspectPipeline(limit = 50) {
  try {
    const [prospects] = await sequelize.query(
      `SELECT c.*, a.value_json->>'score' as lead_score
       FROM cw_contacts c
       LEFT JOIN cw_analytics a ON a.metric_type = 'prospect_score'
         AND (a.value_json->>'contact_id')::int = c.id
       WHERE c.contact_type = 'prospect'
       ORDER BY (a.value_json->>'score')::int DESC NULLS LAST, c.created_at DESC
       LIMIT $1`,
      { bind: [limit] }
    );
    return prospects;
  } catch {
    // Fallback without score join
    const [prospects] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE contact_type = 'prospect' ORDER BY created_at DESC LIMIT $1`,
      { bind: [limit] }
    );
    return prospects;
  }
}

/**
 * Generate AI-powered prospect suggestions based on existing client profile
 */
async function suggestProspects(count = 10) {
  try {
    // Get existing shipper profile
    const [shippers] = await sequelize.query(
      `SELECT company_name, freight_types, lanes, volume_estimate
       FROM cw_contacts WHERE contact_type = 'shipper' LIMIT 20`
    );

    const [topLanes] = await sequelize.query(
      `SELECT origin, destination, COUNT(*) as loads FROM cw_loads
       GROUP BY origin, destination ORDER BY loads DESC LIMIT 10`
    );

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a freight logistics business development AI. Generate realistic prospect company suggestions for a US freight broker based on their existing client and lane profile. Return ONLY a JSON array.`,
      messages: [{
        role: 'user',
        content: `CW Carriers existing shippers: ${JSON.stringify(shippers.slice(0, 10))}
Top lanes: ${JSON.stringify(topLanes)}

Generate ${count} realistic prospect companies that would be good targets. Return JSON array:
[{ "company_name": "", "industry": "", "location": "", "estimated_volume": "", "reason": "why they're a good fit" }]`
      }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('CW suggest prospects error:', err.message);
    return [];
  }
}

module.exports = {
  scoreProspect,
  enrichProspect,
  importProspects,
  getProspectPipeline,
  suggestProspects,
  DEFAULT_TARGET_VERTICALS,
  DEFAULT_TARGET_LANES
};
