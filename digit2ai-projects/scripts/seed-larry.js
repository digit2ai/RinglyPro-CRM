'use strict';

/**
 * Seed: Larry & Ting Partnership Discussion (2026-04-29)
 *
 * Idempotent. Re-running:
 *   - finds or creates "Company ABC"
 *   - finds or creates the named batch (matched by company_id + title)
 *   - creates the 8 projects only if the batch has < 8 projects
 *   - creates a CompanyAccessToken for Larry and Ting if they don't exist
 *
 * Returns share URLs for both reviewers.
 */

const PROJECTS = [
  {
    name: '1. Website & Client Acquisition (iqbiz.net)',
    description: 'Modernize positioning, messaging, and conversion structure before driving traffic, so the site captures and qualifies leads. Reuse chamber cookie-cutter template, RinglyPro landing patterns, and Visionarium / HISPATEC playbooks.',
    feasibility: 'HIGH',
    risk_level: 'LOW',
    risk_notes: 'Mostly content + IA + funnel work; no new platform code.',
    contacts_notes: '- Larry (domain owner)\n- Copy / design support\n- Target-buyer ICP confirmation',
    questions: [
      'Who owns iqbiz.net today, and what is current monthly traffic and lead volume?',
      'Who is the target buyer -- corporates, SMEs, family offices, or brokers?',
      "Is there an existing CRM / lead-capture stack we'd be replacing, or starting from zero?",
      'Brand authority: is "iqbiz" the long-term brand, or a placeholder?'
    ]
  },
  {
    name: '2. Exim Credit Bank Synergy',
    description: 'Cross-border financing partnership; position offerings for international deal flow and trade finance. Strongest strategic fit; leverage Neural Intelligence for Global Banking Compliance whitepaper, presentation, and wire-transfer-screening MCP architecture already drafted.',
    feasibility: 'MEDIUM',
    risk_level: 'MEDIUM',
    risk_notes: 'Real bank integration is months; sales motion can start immediately. Reputational risk if relationship is not direct.',
    contacts_notes: '- Exim bank officer (TBD by Larry)\n- Compliance / legal counsel\n- Pilot client for first deal',
    questions: [
      'What is your direct relationship with Exim -- officer, intermediary, or broker chain?',
      'Which Exim are we talking about -- US EXIM, Exim India, Korea Exim, China Exim, or another?',
      'Do you have a signed mandate or referral agreement, or is this still relationship-stage?',
      'What deal sizes and sectors are they actively underwriting right now?'
    ]
  },
  {
    name: '3. Forex / MT4 / Trading Infrastructure',
    description: 'Trading platform, automation, and user acquisition play. No existing assets. MT4 is closed (MetaQuotes); bridges and EAs are commoditized. Only viable as a signal / affiliate funnel, not as execution.',
    feasibility: 'LOW',
    risk_level: 'HIGH',
    risk_notes: 'Regulatory exposure, capital intensity, multi-quarter commitment, crowded market.',
    contacts_notes: '- Licensed broker partner\n- Regulatory counsel (FCA / CySEC / ASIC / offshore)\n- Liquidity provider\n- Audience source',
    questions: [
      'Are you proposing we build a brokerage, white-label one, or run a signal/affiliate funnel?',
      'Do you already hold any regulatory licenses (FCA, CySEC, ASIC, offshore)?',
      'Is there an existing trader audience, or do we have to acquire from scratch?',
      'What is the actual revenue model -- spread, commission, managed accounts, or course/community?'
    ]
  },
  {
    name: '4. Financial Dashboard (Deals, DD, Proposals)',
    description: 'Centralize deal flow, investor communication, due-diligence workflow, and funding pipelines. Essentially RinglyPro CRM verticalized for deal flow -- reuses multi-tenant CRM, proposals library, MCP copilot, dashboard scaffolding, and neural dashboard. 2-4 weeks to credible demo.',
    feasibility: 'HIGH',
    risk_level: 'LOW',
    risk_notes: 'Main risk is scope creep -- must define which deal-flow stages we own.',
    contacts_notes: '- Internal team (Manuel build, Larry/Ting deal sourcing)\n- Pilot investors\n- Integration partners (DocuSign, Dealroom, Salesforce)',
    questions: [
      "Whose deal flow are we centralizing -- yours, Ting's, partner network, or external clients?",
      'Roughly how many active deals per month, and what stages do they pass through today?',
      'Who are the investor users on the other side, and how do they currently receive deal info?',
      'Any existing tooling we need to integrate with (DocuSign, Ironclad, Dealroom, Salesforce)?'
    ]
  },
  {
    name: '5. Project Funding (BG, LC, SBLC)',
    description: "Bank guarantees, letters of credit, and standby letters of credit for project funding. Mostly relationship + compliance, not software. Software angle is deal-vetting + DD workflow + counterparty KYC dashboard inside Project 4. Don't build instrument issuance.",
    feasibility: 'LOW',
    risk_level: 'HIGH',
    risk_notes: '~90% scam vectors in this market (fake RWAs, fraudulent MT760s); reputational and legal exposure.',
    contacts_notes: '- Top-50 issuing bank relationship\n- Escrow agent\n- Bank-officer verification\n- Legal counsel\n- Monetizer',
    questions: [
      'Who are the issuing banks you have access to -- top-50, second-tier, private/offshore?',
      'What is the typical face-value range and historical success rate on closed deals?',
      'Are you positioned as a monetizer, provider, or facilitator?',
      'How are you handling the standard scam vectors (RWA verification, MT760, escrow)?'
    ]
  },
  {
    name: '6. Fuel / Oil Transactions (Vopak, SOP)',
    description: 'Commodity trading vertical with tank-lease and SOP procedures. No tech moat without verified seller / SOP. Vopak SGS reports easy to fake; DD workflow is the only software angle.',
    feasibility: 'LOW',
    risk_level: 'HIGH',
    risk_notes: 'Vopak SGS reports easily fabricated; compliance / sanctions exposure (OFAC, FATF); jurisdiction issues. Park until counterparties are real and named.',
    contacts_notes: '- Verified refinery / allocation holder\n- Named Vopak TSA holder\n- KYC / compliance partner\n- Escrow bank',
    questions: [
      'Who is the verified seller -- refinery, allocation holder, or trader?',
      'Is there a real Vopak tank lease with a named TSA, or are we still at LOI / SCO stage?',
      'What jurisdictions and product grades (EN590, JP54, D6)?',
      'Any prior closed transactions you can reference?'
    ]
  },
  {
    name: '7. Content / Publishing Dashboard',
    description: 'Authority-building publishing infrastructure tied to investor visibility and deal sourcing. Reuses TunjoRacing press portal, press release manager, and HISPATEC content infra. 1-2 weeks lift.',
    feasibility: 'HIGH',
    risk_level: 'LOW',
    risk_notes: 'Main risk is editorial sustainability without a contributor pipeline.',
    contacts_notes: '- Editorial lead\n- Contributors / writers\n- Syndication partners (LinkedIn, Bloomberg, PR Newswire)',
    questions: [
      'What is the editorial angle -- thought leadership, deal announcements, market commentary, or PR distribution?',
      'Do you have writers / contributors lined up, or do we need an AI-assisted pipeline?',
      'Distribution channels -- owned site only, or syndication?'
    ]
  },
  {
    name: '8. MOA Between Partners',
    description: 'Formalize partnership structure, roles, IP ownership, and revenue split. Non-technical -- legal documentation lift only.',
    feasibility: 'HIGH',
    risk_level: 'MEDIUM',
    risk_notes: 'HIGH if deferred. Building joint assets without an MOA in place creates IP and equity disputes.',
    contacts_notes: '- Partnership counsel\n- IP attorney\n- Manuel + Larry + Ting as signatories',
    questions: [
      "What is Ting's role and contribution -- capital, network, operations, technical?",
      'How do you envision equity / revenue split across the three of us?',
      'IP ownership: how do we handle assets I bring in (RinglyPro, Neural Banking, MCP architecture) vs. assets we build jointly?',
      'Exclusivity -- are these projects exclusive to this partnership, or can each of us run parallel ventures?',
      'Governance: who has decision authority on prioritization, hiring, capital deployment?'
    ]
  }
];

const COMPANY_NAME = 'Company ABC';
const BATCH_TITLE = 'Larry & Ting Partnership Discussion 2026-04-29';
const MEETING_DATE = '2026-04-29';

async function seedLarryTing(opts = {}) {
  const {
    sequelize,
    Company,
    Project,
    IntakeBatch,
    ProjectIntake,
    ProjectQuestion,
    CompanyAccessToken
  } = require('../src/models');

  const larry = {
    email: opts.larry_email || 'larry@iqbiz.net',
    name:  opts.larry_name  || 'Larry'
  };
  const ting = {
    email: opts.ting_email || 'ting@iqbiz.net',
    name:  opts.ting_name  || 'Ting'
  };

  // 1. Company
  let [company] = await Company.findOrCreate({
    where: { workspace_id: 1, name: COMPANY_NAME },
    defaults: {
      workspace_id: 1,
      name: COMPANY_NAME,
      industry: 'Multi-vertical (finance, energy, media)',
      notes: "Larry's holding company / partnership vehicle for the IQBiz ecosystem."
    }
  });

  // 2. Batch
  let [batch] = await IntakeBatch.findOrCreate({
    where: { workspace_id: 1, company_id: company.id, title: BATCH_TITLE },
    defaults: {
      workspace_id: 1,
      company_id: company.id,
      title: BATCH_TITLE,
      meeting_date: MEETING_DATE,
      submitted_by_email: 'manuel@digit2ai.com',
      submitted_by_name: 'Manuel Stagg',
      status: 'in_review',
      notes: 'Initial 8-project intake from Larry (with Ting copied). Awaiting partner Q&A and priority scoring before MOA.'
    }
  });

  // 3. Projects + intake + questions
  const existing = await ProjectIntake.count({ where: { batch_id: batch.id } });
  if (existing < PROJECTS.length) {
    for (const def of PROJECTS) {
      const exists = await Project.findOne({ where: { workspace_id: 1, company_id: company.id, name: def.name } });
      if (exists) continue;
      const t = await sequelize.transaction();
      try {
        const project = await Project.create({
          workspace_id: 1,
          company_id: company.id,
          name: def.name,
          description: def.description,
          status: 'planning',
          stage: 'initiation',
          priority: 'medium'
        }, { transaction: t });
        await ProjectIntake.create({
          project_id: project.id,
          batch_id: batch.id,
          feasibility: def.feasibility,
          risk_level: def.risk_level,
          risk_notes: def.risk_notes,
          contacts_notes: def.contacts_notes,
          intake_status: 'discussion'
        }, { transaction: t });
        for (let i = 0; i < def.questions.length; i++) {
          await ProjectQuestion.create({
            project_id: project.id,
            question_text: def.questions[i],
            position: i,
            created_by_email: 'manuel@digit2ai.com'
          }, { transaction: t });
        }
        await t.commit();
      } catch (e) {
        await t.rollback();
        throw e;
      }
    }
  }

  // 4. Access tokens for Larry & Ting (idempotent by grantee_email)
  async function ensureToken(person) {
    let token = await CompanyAccessToken.findOne({
      where: { company_id: company.id, batch_id: batch.id, grantee_email: person.email }
    });
    if (!token) {
      token = await CompanyAccessToken.create({
        company_id: company.id,
        batch_id: batch.id,
        grantee_email: person.email,
        grantee_name: person.name,
        role: 'reviewer'
      });
    }
    return token;
  }
  const larryToken = await ensureToken(larry);
  const tingToken  = await ensureToken(ting);

  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
  const larryUrl = `${baseUrl}/projects/intake/batch.html?token=${larryToken.token}`;
  const tingUrl  = `${baseUrl}/projects/intake/batch.html?token=${tingToken.token}`;

  return {
    company_id: company.id,
    batch_id: batch.id,
    project_count: await ProjectIntake.count({ where: { batch_id: batch.id } }),
    larry: { ...larry, token: larryToken.token, url: larryUrl },
    ting:  { ...ting,  token: tingToken.token,  url: tingUrl  },
    admin_dashboard: `${baseUrl}/projects/intake/`
  };
}

module.exports = seedLarryTing;

// CLI
if (require.main === module) {
  (async () => {
    try {
      const out = await seedLarryTing({});
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  })();
}
