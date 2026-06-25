#!/usr/bin/env node
/**
 * PCCI (cv-3) Chamber Member Directory Seed
 * Philippine Chamber of Commerce International
 *
 * WHY: cv-3's P2B "run a plan" logic (AI plan generation, IRS, Monte Carlo,
 * role-based recruitment, 30-day countdown) is byte-for-byte identical to cv-2
 * and works end-to-end. The only reason cv-3 looked "broken" vs cv-2 is that
 * its member directory was never populated -- recruitment had only the admin
 * test accounts to invite. cv-2 has 12 real members, so its recruitment panel
 * fills with diverse candidates per role.
 *
 * This seeds a realistic, diverse directory into chamber_id=3 so plan
 * recruitment surfaces strong matches for any AI-generated role set
 * (engineering, logistics, product, sales, finance, legal, data, marketing...).
 *
 * Idempotent: skips any member whose email already exists in chamber 3.
 * Run: node scripts/seed-pcci-members.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const CHAMBER_ID = 3;
// bcrypt hash for "Palindrome@7" (same demo password used by seed-pacc-demo.js)
const PASSWORD_HASH = '$2b$12$7OGOn.ILPVpKEGOVsxv03eV1aBv7cIvuuQrV8gmI/BWNV.4Z105Ye';

// Diverse roster spanning the sectors AI plan roles typically ask for.
// sub_specialty + bio + company_name feed the required_skills matcher;
// sector + country feed the sector/region matchers in lib/scoring.js.
const MEMBERS = [
  {
    first_name: 'Rafael', last_name: 'Lim', email: 'rafael.lim@limcloud.ph',
    sector: 'tecnologia', sub_specialty: 'Cloud architecture, Python/FastAPI, AI/ML engineering',
    country: 'Philippines', company_name: 'LimCloud Engineering',
    years_experience: 14, trust_score: 0.88,
    bio: 'CTO and full-stack engineer. Builds scalable SaaS on AWS with Python, FastAPI, React, and machine-learning pipelines. Led platform teams across PH and US startups.'
  },
  {
    first_name: 'Bianca', last_name: 'Soriano', email: 'bianca.soriano@northstarpm.com',
    sector: 'consultoria', sub_specialty: 'Product management, roadmap strategy, UX research',
    country: 'United States', company_name: 'NorthStar Product Partners',
    years_experience: 11, trust_score: 0.85,
    bio: 'Senior product manager specializing in marketplace and logistics products. Owns discovery, roadmap, and go-to-market for B2B platforms serving SMBs.'
  },
  {
    first_name: 'Marco', last_name: 'Velasquez', email: 'marco.velasquez@translinkph.com',
    sector: 'logistica', sub_specialty: 'Freight forwarding, last-mile delivery, supply chain ops',
    country: 'Philippines', company_name: 'TransLink Logistics',
    years_experience: 16, trust_score: 0.86,
    bio: 'Logistics operations manager running cross-border freight and last-mile networks across Metro Manila. Expert in carrier management, route optimization, and warehousing.'
  },
  {
    first_name: 'Patricia', last_name: 'Aquino', email: 'patricia.aquino@aquinocap.com',
    sector: 'finanzas', sub_specialty: 'Corporate finance, fundraising, financial modeling',
    country: 'United States', company_name: 'Aquino Capital Advisors',
    years_experience: 13, trust_score: 0.84,
    bio: 'Finance lead and CFO-for-hire. Builds financial models, manages fundraising, and structures cross-border investment for early-stage and growth companies.'
  },
  {
    first_name: 'Daniel', last_name: 'Reyes', email: 'daniel.reyes@reyesdata.io',
    sector: 'tecnologia', sub_specialty: 'Data analytics, ML engineering, dashboards and BI',
    country: 'Philippines', company_name: 'Reyes Data Labs',
    years_experience: 9, trust_score: 0.82,
    bio: 'Data analyst and ML engineer. Designs analytics pipelines, predictive models, and visualization dashboards. Strong in Python, SQL, and data storytelling.'
  },
  {
    first_name: 'Grace', last_name: 'Tan', email: 'grace.tan@tangrowth.com',
    sector: 'consultoria', sub_specialty: 'Sales, partnerships, regional business development',
    country: 'United States', company_name: 'Tan Growth Partners',
    years_experience: 12, trust_score: 0.83,
    bio: 'Regional sales and partnerships leader. Builds channel and partner ecosystems across the US and Southeast Asia, with a focus on diaspora and SMB markets.'
  },
  {
    first_name: 'Joseph', last_name: 'Mendoza', email: 'joseph.mendoza@mendozalegal.ph',
    sector: 'servicios_profesionales', sub_specialty: 'Corporate law, compliance, cross-border contracts',
    country: 'Philippines', company_name: 'Mendoza Legal',
    years_experience: 18, trust_score: 0.87,
    bio: 'Corporate lawyer focused on regulatory compliance, contracts, and cross-border transactions between PH and US entities.'
  },
  {
    first_name: 'Carmela', last_name: 'Dizon', email: 'carmela.dizon@dizoncreative.com',
    sector: 'servicios_profesionales', sub_specialty: 'Marketing, brand strategy, digital campaigns',
    country: 'United States', company_name: 'Dizon Creative',
    years_experience: 10, trust_score: 0.8,
    bio: 'Marketing and brand strategist. Runs digital campaigns, content, and community growth for consumer and B2B brands targeting Filipino-American audiences.'
  },
  {
    first_name: 'Anton', last_name: 'Cruz', email: 'anton.cruz@cruzfrontend.com',
    sector: 'tecnologia', sub_specialty: 'Frontend engineering, React, data visualization, UI/UX',
    country: 'Philippines', company_name: 'Cruz Frontend Studio',
    years_experience: 8, trust_score: 0.81,
    bio: 'Frontend and visualization engineer. Builds React dashboards, interactive data visualizations, and accessible UI for analytics-heavy products.'
  },
  {
    first_name: 'Liza', last_name: 'Garcia', email: 'liza.garcia@garciaops.com',
    sector: 'consultoria', sub_specialty: 'Operations, project management, process design',
    country: 'United States', company_name: 'Garcia Operations Consulting',
    years_experience: 15, trust_score: 0.84,
    bio: 'Operations and program manager. Stands up delivery processes, manages cross-functional teams, and scales operations for growing ventures.'
  },
  {
    first_name: 'Emil', last_name: 'Bautista', email: 'emil.bautista@bautistacyber.ph',
    sector: 'ciberseguridad', sub_specialty: 'Security engineering, cloud security, compliance audits',
    country: 'Philippines', company_name: 'Bautista CyberDefense',
    years_experience: 12, trust_score: 0.85,
    bio: 'Cybersecurity engineer. Secures cloud infrastructure, runs compliance audits (SOC2, ISO), and builds security into platform engineering.'
  },
  {
    first_name: 'Nadia', last_name: 'Fernandez', email: 'nadia.fernandez@fernandeztrade.com',
    sector: 'comercio_exterior', sub_specialty: 'Cross-border commerce, import/export, trade compliance',
    country: 'United States', company_name: 'Fernandez Trade Group',
    years_experience: 14, trust_score: 0.83,
    bio: 'International trade specialist. Manages import/export operations, customs and trade compliance, and cross-border commerce between the US and the Philippines.'
  },
  {
    first_name: 'Victor', last_name: 'Ramos', email: 'victor.ramos@ramosfintech.com',
    sector: 'finanzas', sub_specialty: 'Fintech, payments, remittances, product partnerships',
    country: 'Philippines', company_name: 'Ramos Fintech',
    years_experience: 11, trust_score: 0.82,
    bio: 'Fintech product and partnerships lead. Builds payments and remittance products for diaspora communities; deep PH-US corridor experience.'
  },
  {
    first_name: 'Sofia', last_name: 'Domingo', email: 'sofia.domingo@domingohealth.com',
    sector: 'salud', sub_specialty: 'Healthcare operations, telehealth, care navigation',
    country: 'United States', company_name: 'Domingo Health Services',
    years_experience: 13, trust_score: 0.81,
    bio: 'Healthcare operations leader. Launches telehealth and bilingual care-navigation services for Filipino-American communities.'
  }
];

async function main() {
  try {
    await sequelize.authenticate();
    console.log(`Connected. Seeding member directory for chamber_id=${CHAMBER_ID} (PCCI)...\n`);

    let created = 0, skipped = 0;
    for (const m of MEMBERS) {
      const [existing] = await sequelize.query(
        `SELECT id FROM members WHERE chamber_id = :c AND lower(email) = lower(:e)`,
        { type: QueryTypes.SELECT, replacements: { c: CHAMBER_ID, e: m.email } }
      ).catch(() => [null]);

      if (existing) {
        console.log(`  skip (exists): ${m.first_name} ${m.last_name} <${m.email}>`);
        skipped++;
        continue;
      }

      const [res] = await sequelize.query(
        `INSERT INTO members
           (chamber_id, email, password_hash, first_name, last_name, country,
            sector, sub_specialty, years_experience, languages, company_name,
            membership_type, bio, trust_score, verified, verification_level,
            governance_role, access_level, status, last_active_at, created_at, updated_at)
         VALUES
           (:c, :email, :hash, :fn, :ln, :country,
            :sector, :sub, :yrs, ARRAY['English','Filipino']::text[], :company,
            'individual', :bio, :trust, true, 'basic',
            'member', 'member', 'active', NOW(), NOW(), NOW())
         RETURNING id`,
        {
          type: QueryTypes.SELECT,
          replacements: {
            c: CHAMBER_ID, email: m.email, hash: PASSWORD_HASH,
            fn: m.first_name, ln: m.last_name, country: m.country,
            sector: m.sector, sub: m.sub_specialty, yrs: m.years_experience,
            company: m.company_name, bio: m.bio, trust: m.trust_score
          }
        }
      );
      console.log(`  created id=${res.id}: ${m.first_name} ${m.last_name} | ${m.sector} | ${m.country}`);
      created++;
    }

    const [cnt] = await sequelize.query(
      `SELECT count(*)::int AS n FROM members WHERE chamber_id = :c AND status = 'active'`,
      { type: QueryTypes.SELECT, replacements: { c: CHAMBER_ID } }
    );

    console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
    console.log(`cv-3 active members now: ${cnt.n}`);
    console.log(`Demo login password for seeded members: Palindrome@7`);
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
    await sequelize.close();
    process.exit(1);
  }
}

main();
