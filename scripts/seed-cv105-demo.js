#!/usr/bin/env node
'use strict';
/**
 * cv-105 (Hispanotec) demo directory seed.
 *
 *   node scripts/seed-cv105-demo.js            seed (refuses if demo rows already exist)
 *   node scripts/seed-cv105-demo.js --reseed   delete the demo rows, then seed again
 *   node scripts/seed-cv105-demo.js --reset    delete the demo rows only
 *   node scripts/seed-cv105-demo.js --dry      build everything in memory, write nothing
 *   node scripts/seed-cv105-demo.js --accept   top match per role accepts (leaves 1-2 roles open)
 *
 * What it writes into chamber cv-105 ONLY:
 *   500 fictional members (150 company owners + 350 individual specialists)
 *   150 company profiles with products, services and certifications
 *    10 proposed projects in recruiting, each crossing 4-5 sectors
 *    15 open RFQs
 *   and the match invitations for those projects, computed by the platform's
 *   OWN matcher (src/routes/unified-chamber/lib/scoring.js) with the same
 *   greedy one-invitation-per-member rule as POST /projects/:id/invite-matches,
 *   plus the IRS score from lib/project-irs-scorer.js. No score is typed in.
 *
 * HOW DEMO ROWS ARE FOUND AGAIN: every demo member's email ends in
 * @demo-hispanotec.test (a reserved TLD, so no mail can ever be delivered),
 * and every other demo row hangs off a demo member (proposer, requester,
 * owner). --reset deletes by that chain and never touches a real member.
 *
 * Demo members get a bcrypt hash of a random password nobody knows: 500
 * accounts with a published password inside a live chamber would let anyone
 * sign in and read the real members' directory.
 *
 * Deterministic: a seeded PRNG, so a reseed produces the same people.
 */

require('dotenv').config();
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { scoreMember } = require('../src/routes/unified-chamber/lib/scoring');
const irsScorer = require('../src/routes/unified-chamber/lib/project-irs-scorer');
const C = require('./cv105-demo-catalog');

const SLUG = 'cv-105';
const DEMO_DOMAIN = 'demo-hispanotec.test';
const SEED = 20260930;
const TOTAL = 500;
const OWNER_SHARE = 0.30;
const INVITES_PER_ROLE = 3;

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const RESET_ONLY = args.has('--reset');
const RESEED = args.has('--reseed');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

// ---- deterministic randomness --------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.min(n, a.length));
}
function weighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const x of items) { r -= x.weight; if (r <= 0) return x; }
  return items[items.length - 1];
}
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/gi, 'n');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const listEs = (arr) => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

const NAME_TAIL = {
  Spain: ['Ibérica', 'Mediterránea', 'del Sur', 'Levante', 'Atlántica', 'Castellana'],
  Colombia: ['Andina', 'del Café', 'Caribe', 'Pacífico', 'Llanera', 'Antioqueña'],
  Mexico: ['del Bajío', 'Azteca', 'del Norte', 'Maya', 'del Pacífico', 'Sonorense'],
  'United States': ['Americas', 'Gulf', 'Sunbelt', 'Florida', 'Texas', 'Hispana'],
};
const SERVED_ES = { Spain: 'España', Colombia: 'Colombia', Mexico: 'México', 'United States': 'Estados Unidos' };
const EXTRAS = [
  'Disponible para proyectos en España, Colombia, México y EE. UU.',
  'Ha liderado equipos multidisciplinarios en proyectos internacionales.',
  'Busca socios para proyectos de exportación y crecimiento regional.',
  'Experiencia con proyectos financiados por banca de desarrollo.',
  'Trabaja en español e inglés con clientes de ambos lados del Atlántico.',
  'Interesado en proyectos de impacto social y sostenibilidad.',
];
const REVENUE = ['< USD 500.000', 'USD 500.000 – 2 M', 'USD 2 M – 10 M', 'USD 10 M – 50 M'];

// ---- build the people ------------------------------------------------------
function buildMembers() {
  const people = [];
  const usedEmails = new Set();
  const usedCompanies = new Set();

  function person(sector, country, isOwner) {
    const female = rnd() < 0.48;
    const first = pick(female ? C.FIRST_F : C.FIRST_M);
    const last = pick(C.LAST) + (rnd() < 0.6 ? ' ' + pick(C.LAST) : '');
    const city = pick(country.cities);
    const years = int(4, 30);
    let email;
    do {
      email = `${ascii(first).toLowerCase()}.${ascii(last.split(' ')[0]).toLowerCase()}.${int(100, 999)}@${DEMO_DOMAIN}`;
    } while (usedEmails.has(email));
    usedEmails.add(email);
    const languages = country.name === 'United States' || rnd() < 0.4 ? ['Spanish', 'English'] : ['Spanish'];
    const base = {
      email, first_name: first, last_name: last, country: country.name, sector: sector.slug,
      years_experience: years, languages,
      trust_score: Math.round((0.62 + rnd() * 0.33) * 100) / 100,
      created_days_ago: int(5, 200), active_days_ago: int(0, 30),
    };

    if (isOwner) {
      const kind = pick(sector.kinds);
      let name;
      do {
        name = `${pick(sector.roots)} ${pick(NAME_TAIL[country.name])} ${pick(country.suffixes)}`.replace(/\s+/g, ' ');
      } while (usedCompanies.has(name));
      usedCompanies.add(name);
      const skills = sample(sector.skills, 3);
      const served = sample(C.COUNTRIES.map((c) => c.name), int(1, 3));
      if (!served.includes(country.name)) served.unshift(country.name);
      const bio = `${first} dirige ${name}, ${kind.type} con sede en ${city}. ` +
        `Productos: ${listEs(kind.products)}. Servicios: ${listEs(kind.services)}. ` +
        `Capacidades: ${listEs(skills)}. ${years} años en el sector; atiende ${listEs(served.map((s) => SERVED_ES[s]))}.`;
      return {
        ...base, isOwner: true, membership_type: 'empresarial', company_name: name,
        sub_specialty: clip(`${cap(kind.type)} · ${listEs(skills.slice(0, 2))}`, 255),
        bio: bio.replace(/\.\./g, '.'),
        company: {
          name,
          description: `${cap(kind.type)} con sede en ${city}. ${cap(listEs(kind.products))}.`,
          sector: sector.slug,
          capabilities: [...kind.products, ...kind.services, ...skills],
          certifications: kind.certs,
          countries_served: served,
          employee_count: pick([8, 12, 25, 40, 60, 90, 150, 240, 400]),
          annual_revenue_range: pick(REVENUE),
        },
      };
    }

    const title = pick(sector.titles);
    const skills = sample(sector.skills, 4);
    const company = rnd() < 0.5 ? 'Profesional independiente'
      : `${last.split(' ')[0]} ${pick(['Consultores', '& Asociados', 'Ingeniería', 'Servicios Profesionales'])}`;
    return {
      ...base, isOwner: false, membership_type: 'individual', company_name: company,
      sub_specialty: clip(`${title} · ${listEs(skills.slice(0, 2))}`, 255),
      bio: `${title} con ${years} años de experiencia, radicado en ${city}. ` +
        `Especialidad en ${listEs(skills)}. ${pick(EXTRAS)}`,
    };
  }

  const countryByName = Object.fromEntries(C.COUNTRIES.map((c) => [c.name, c]));
  const sectorBySlug = Object.fromEntries(C.SECTORS.map((s) => [s.slug, s]));

  // Guarantee a company owner exists for every project proposer slot.
  const proposers = C.PROJECTS.map((p) => person(sectorBySlug[p.proposer[0]], countryByName[p.proposer[1]], true));
  const proposerCount = {};
  for (const p of C.PROJECTS) proposerCount[p.proposer[0]] = (proposerCount[p.proposer[0]] || 0) + 1;
  people.push(...proposers);

  for (const sector of C.SECTORS) {
    const already = proposerCount[sector.slug] || 0;
    const n = sector.weight - already;
    const owners = Math.max(0, Math.round(sector.weight * OWNER_SHARE) - already);
    for (let i = 0; i < n; i++) people.push(person(sector, weighted(C.COUNTRIES), i < owners));
  }
  return { people, proposers };
}

function buildPlan(p, budget) {
  const [bmin, best, bmax] = p.budget;
  const [tmin, test, tmax] = p.months;
  const roles = p.roles.map(([title, sector, regions, skills], i) => ({
    role_title: title,
    must_have: i < 3,
    commitment_pct: i < 2 ? 100 : 50,
    preferred_sectors: [sector],
    preferred_regions: regions,
    required_skills: skills,
    responsibilities: [`Aportar ${listEs(skills.slice(0, 2))} al proyecto.`, 'Participar en el comité de seguimiento mensual.'],
  }));
  const split = [['Fase 1 · Piloto', 'Inversión inicial y piloto', 0.35], ['Fase 2 · Operación', 'Equipamiento y operación', 0.40], ['Fase 3 · Escala', 'Comercialización y escala', 0.25]];
  return {
    title: p.title,
    demo_seed: 'cv105-2026-09-30',
    executive_summary: p.summary,
    problem_market: {
      problem_statement: p.problem,
      target_segments: p.roles.map((r) => r[0]),
      // Market sizes deliberately omitted: this is demo data and no study backs a figure.
      tam_usd: null, sam_usd: null, som_usd: null,
    },
    solution: {
      description: p.summary,
      key_differentiators: [
        'Equipo formado con socios verificados de la red Hispanotec',
        `Operación en ${listEs(p.countries.map((c) => SERVED_ES[c]))}`,
        'Matching por IA entre roles del proyecto y capacidades de los miembros',
      ],
      tech_stack_or_methodology: p.roles.flatMap((r) => r[3]).slice(0, 6),
    },
    team_roles_required: roles,
    budget_breakdown: split.map(([phase, category, pct]) => ({ phase, category, amount_usd: Math.round(best * pct) })),
    timeline_milestones: [
      { month: 1, milestone: 'Equipo núcleo conformado', deliverable: 'Acuerdo de socios firmado' },
      { month: Math.max(2, Math.round(test * 0.35)), milestone: 'Piloto en operación', deliverable: 'Primeros resultados medidos' },
      { month: Math.round(test * 0.7), milestone: 'Operación estable', deliverable: 'Indicadores de la fase 2 cumplidos' },
      { month: test, milestone: 'Listo para escalar', deliverable: 'Plan de expansión aprobado' },
    ],
    success_kpis: [
      { kpi: 'Socios activos en el proyecto', target: `${roles.length} roles cubiertos al mes 2`, measurement_period: 'Monthly' },
      { kpi: 'Hitos del cronograma cumplidos', target: '100 % de los hitos de la fase 1', measurement_period: 'Quarterly' },
    ],
    revenue_model: { description: 'Ingresos por venta de productos y servicios del consorcio; precios a definir en la fase piloto.' },
    go_to_market: {
      phases: [
        { name: 'Piloto', duration_months: Math.max(2, Math.round(test * 0.35)), activities: ['Conformar el equipo en la red Hispanotec', 'Ejecutar el piloto'] },
        { name: 'Operación', duration_months: Math.round(test * 0.35), activities: ['Estabilizar la operación', 'Primeros clientes'] },
        { name: 'Escala', duration_months: Math.max(1, test - Math.round(test * 0.7)), activities: ['Expandir a nuevos mercados'] },
      ],
    },
    risks: [
      { risk: 'Retrasos en permisos y certificaciones', likelihood: 'medium', mitigation: 'Incorporar desde el inicio al socio legal y de cumplimiento' },
      { risk: 'Variación de costos de insumos y fletes', likelihood: 'medium', mitigation: 'Contratos marco con proveedores de la red' },
      { risk: 'Coordinación entre socios de varios países', likelihood: 'low', mitigation: 'Comité mensual y espacio de trabajo compartido en la plataforma' },
    ],
    _budget: { bmin, best, bmax, tmin, test, tmax },
  };
}

// ---- database -------------------------------------------------------------
async function demoMemberIds(chamberId) {
  const rows = await sequelize.query(
    `SELECT id FROM members WHERE chamber_id = :c AND email LIKE :d`,
    { replacements: { c: chamberId, d: `%@${DEMO_DOMAIN}` }, type: QueryTypes.SELECT });
  return rows.map((r) => r.id);
}

async function reset(chamberId) {
  const ids = await demoMemberIds(chamberId);
  if (!ids.length) { console.log('reset: no demo rows found'); return; }
  const t = await sequelize.transaction();
  try {
    const q = (sql) => sequelize.query(sql, { replacements: { c: chamberId, ids }, transaction: t });
    const projSub = `SELECT id FROM projects WHERE chamber_id = :c AND proposer_member_id IN (:ids)`;
    const rfqSub = `SELECT id FROM rfqs WHERE chamber_id = :c AND requester_member_id IN (:ids)`;
    await q(`DELETE FROM project_invitations WHERE chamber_id = :c AND (project_id IN (${projSub}) OR member_id IN (:ids))`);
    await q(`DELETE FROM project_members WHERE chamber_id = :c AND (project_id IN (${projSub}) OR member_id IN (:ids))`);
    for (const tbl of ['project_plan_versions', 'project_milestones', 'project_tasks', 'project_messages', 'project_meetings', 'project_signoffs', 'project_documents']) {
      await q(`DELETE FROM ${tbl} WHERE chamber_id = :c AND project_id IN (${projSub})`);
    }
    await q(`DELETE FROM projects WHERE chamber_id = :c AND proposer_member_id IN (:ids)`);
    await q(`DELETE FROM rfq_responses WHERE chamber_id = :c AND rfq_id IN (${rfqSub})`);
    await q(`DELETE FROM rfqs WHERE chamber_id = :c AND requester_member_id IN (:ids)`);
    await q(`DELETE FROM companies WHERE chamber_id = :c AND owner_member_id IN (:ids)`);
    await q(`DELETE FROM members WHERE chamber_id = :c AND id IN (:ids) AND email LIKE '%@${DEMO_DOMAIN}'`);
    await t.commit();
    console.log(`reset: removed ${ids.length} demo members and everything attached to them`);
  } catch (e) { await t.rollback(); throw e; }
}

async function seed(chamberId) {
  const { people, proposers } = buildMembers();
  const plans = C.PROJECTS.map((p) => buildPlan(p));
  const owners = people.filter((p) => p.isOwner);
  console.log(`built ${people.length} members (${owners.length} companies), ${plans.length} projects, ${C.RFQS.length} RFQs`);
  if (DRY) {
    const bySector = {};
    for (const p of people) bySector[p.sector] = (bySector[p.sector] || 0) + 1;
    console.log(bySector);
    console.log(JSON.stringify(people[12], null, 1));
    return;
  }

  const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const t = await sequelize.transaction();
  try {
    // members, 100 per statement
    for (let i = 0; i < people.length; i += 100) {
      const chunk = people.slice(i, i + 100);
      const bind = [];
      const values = chunk.map((m) => {
        const cols = [chamberId, m.email, hash, m.first_name, m.last_name, m.country, m.sector, m.sub_specialty,
          m.years_experience, m.languages, m.company_name, m.membership_type, m.bio, m.trust_score,
          m.created_days_ago, m.active_days_ago];
        const base = bind.length;
        bind.push(...cols);
        const $ = (k) => `$${base + k}`;
        return `(${$(1)},${$(2)},${$(3)},${$(4)},${$(5)},${$(6)},${$(7)},${$(8)},${$(9)},${$(10)}::text[],${$(11)},${$(12)},${$(13)},` +
          `'member','member',${$(14)},false,'email','active',NOW() - (${$(16)} || ' days')::interval,NOW() - (${$(15)} || ' days')::interval,NOW())`;
      });
      const rows = await sequelize.query(
        `INSERT INTO members (chamber_id,email,password_hash,first_name,last_name,country,sector,sub_specialty,
           years_experience,languages,company_name,membership_type,bio,governance_role,access_level,trust_score,
           verified,verification_level,status,last_active_at,created_at,updated_at)
         VALUES ${values.join(',')} RETURNING id, email`,
        { bind, type: QueryTypes.SELECT, transaction: t });
      const idByEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));
      for (const m of chunk) m.id = idByEmail[m.email];
    }

    // companies
    for (const o of owners) {
      const [row] = await sequelize.query(
        `INSERT INTO companies (chamber_id,name,description,sector,capabilities,certifications,countries_served,
           employee_count,annual_revenue_range,owner_member_id,verified,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5::text[],$6::text[],$7::text[],$8,$9,$10,false,NOW(),NOW()) RETURNING id`,
        { bind: [chamberId, o.company.name, o.company.description, o.company.sector, o.company.capabilities,
          o.company.certifications, o.company.countries_served, o.company.employee_count,
          o.company.annual_revenue_range, o.id], type: QueryTypes.SELECT, transaction: t });
      o.company_id = row.id;
    }

    // projects
    const projects = [];
    for (let i = 0; i < C.PROJECTS.length; i++) {
      const p = C.PROJECTS[i];
      const plan = plans[i];
      const b = plan._budget; delete plan._budget;
      const proposer = proposers[i];
      const [row] = await sequelize.query(
        `INSERT INTO projects (chamber_id,title,description,sector,countries,budget_min,budget_est,budget_max,
           timeline_min_months,timeline_est_months,timeline_max_months,status,proposer_member_id,plan_json,
           plan_status,visibility,recruitment_deadline,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,'proposal',$12,$13::jsonb,'recruiting','public_plan',
           NOW() + interval '30 days', NOW() - ($14 || ' minutes')::interval, NOW())
         RETURNING *`,
        { bind: [chamberId, p.title, p.summary, p.sector, p.countries, b.bmin, b.best, b.bmax, b.tmin, b.test, b.tmax,
          proposer.id, JSON.stringify(plan), String((C.PROJECTS.length - i) * 7)], type: QueryTypes.SELECT, transaction: t });
      projects.push(row);
    }

    // rfqs
    for (let i = 0; i < C.RFQS.length; i++) {
      const [title, sector, budget, countries] = C.RFQS[i];
      const requester = owners.find((o) => o.sector === sector && countries.includes(o.country) && !o._rfq)
        || owners.find((o) => o.sector === sector && !o._rfq) || owners[i];
      requester._rfq = true;
      await sequelize.query(
        `INSERT INTO rfqs (chamber_id,title,description,sector,budget_range,deadline,countries_target,target_languages,
           company_id,requester_member_id,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,(NOW() + ($6 || ' days')::interval)::date,$7::text[],'{Spanish}',$8,$9,'open',
           NOW() - ($10 || ' hours')::interval,NOW())`,
        { bind: [chamberId, title, `${title}. Solicitud de ${requester.company_name}; se aceptan propuestas de miembros de la red.`,
          sector, budget, String(int(14, 45)), countries, requester.company_id, requester.id, String(i * 5 + 1)], transaction: t });
    }

    // invitations: the platform's own matcher, same greedy rule as invite-matches.
    // Candidate pool is demo members only, so no real member is invited to a demo project.
    const pool = people.filter((m) => m.id);
    let invites = 0;
    const report = [];
    for (const proj of projects) {
      const roles = proj.plan_json.team_roles_required;
      const pairs = [];
      roles.forEach((role, ri) => {
        for (const m of pool) if (m.id !== proj.proposer_member_id) pairs.push({ m, ri, role, score: scoreMember(m, role) });
      });
      pairs.sort((a, b) => b.score - a.score);
      const used = new Set();
      const filled = new Map();
      const chosen = [];
      for (const pr of pairs) {
        if (used.has(pr.m.id) || (filled.get(pr.ri) || 0) >= INVITES_PER_ROLE) continue;
        used.add(pr.m.id); filled.set(pr.ri, (filled.get(pr.ri) || 0) + 1); chosen.push(pr);
      }
      for (const c of chosen) {
        await sequelize.query(
          `INSERT INTO project_invitations (chamber_id,project_id,member_id,role_index,role_title,status,match_score,
             invited_by_member_id,invited_at) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,NOW())`,
          { bind: [chamberId, proj.id, c.m.id, c.ri, c.role.role_title, c.score.toFixed(3), proj.proposer_member_id], transaction: t });
        invites++;
      }
      const irs = await irsScorer.scoreProject(proj, [], { useAi: false });
      await sequelize.query(
        `UPDATE projects SET irs_score=$1, irs_components=$2::jsonb, irs_evidence=$3::jsonb, irs_grade=$4, irs_computed_at=NOW()
         WHERE chamber_id=$5 AND id=$6`,
        { bind: [irs.score, JSON.stringify(irs.components), JSON.stringify({ ai: irs.ai, base_score: irs.base_score, auto: 'demo_seed' }),
          irs.grade, chamberId, proj.id], transaction: t });
      const sectors = new Set(chosen.map((c) => c.m.sector));
      const strong = chosen.filter((c) => c.score >= 0.7).length;
      report.push({ id: proj.id, title: clip(proj.title, 60), invites: chosen.length, strong, sectors: sectors.size,
        top: chosen[0] ? chosen[0].score.toFixed(2) : '-', irs: irs.grade });
    }

    // One-off repair while we are here: a real project title carried Cyrillic
    // look-alike letters ("Hispa" + Cyrillic en + o). Map them back to Latin. Idempotent.
    const CYR = { '\u043d': 'n', '\u043e': 'o', '\u0430': 'a', '\u0435': 'e', '\u0440': 'p', '\u0441': 'c' };
    const fix = (s) => String(s || '').replace(/[\u0400-\u04FF]/g, (ch) => CYR[ch] || ch);
    const dirty = await sequelize.query(`SELECT id, title, plan_json FROM projects WHERE chamber_id = $1 AND title ~ '[\u0400-\u04FF]'`,
      { bind: [chamberId], type: QueryTypes.SELECT, transaction: t });
    for (const d of dirty) {
      const pj = d.plan_json || {};
      if (pj.title) pj.title = fix(pj.title);
      await sequelize.query(`UPDATE projects SET title = $1, plan_json = $2::jsonb WHERE chamber_id = $3 AND id = $4`,
        { bind: [fix(d.title), JSON.stringify(pj), chamberId, d.id], transaction: t });
      console.log(`fixed Cyrillic letters in project ${d.id}: ${fix(d.title)}`);
    }

    await t.commit();
    console.log(`inserted ${people.length} members, ${owners.length} companies, ${projects.length} projects, ${C.RFQS.length} RFQs, ${invites} invitations`);
    console.table(report);
  } catch (e) { await t.rollback(); throw e; }
}


// Accept the best-matched pending invitation for some roles of each demo
// project, with exactly the effects of POST /projects/:id/invitations/:inv/respond
// {action:'accept'}: invitation -> accepted, a project_members row, and the
// member's other pending invites on that project removed. The fictional
// members cannot sign in, so without this every team reads "0 miembros".
// At least one role per project is left open, so the project stays in
// 'recruiting' (filling every role would auto-close it and run the cascade).
async function acceptTopMatches(chamberId) {
  const ids = await demoMemberIds(chamberId);
  if (!ids.length) { console.log('accept: no demo rows'); return; }
  const projects = await sequelize.query(
    `SELECT * FROM projects WHERE chamber_id = :c AND proposer_member_id IN (:ids) ORDER BY id`,
    { replacements: { c: chamberId, ids }, type: QueryTypes.SELECT });
  const t = await sequelize.transaction();
  const report = [];
  try {
    for (let pi = 0; pi < projects.length; pi++) {
      const proj = projects[pi];
      const roles = (proj.plan_json && proj.plan_json.team_roles_required) || [];
      const toFill = Math.max(1, roles.length - 1 - (pi % 2));   // n-1 or n-2 roles
      let filled = 0;
      for (let ri = 0; ri < roles.length && filled < toFill; ri++) {
        const [has] = await sequelize.query(
          `SELECT id FROM project_members WHERE chamber_id=:c AND project_id=:p AND role_index=:ri`,
          { replacements: { c: chamberId, p: proj.id, ri }, type: QueryTypes.SELECT, transaction: t });
        if (has) { filled++; continue; }
        const [inv] = await sequelize.query(
          `SELECT * FROM project_invitations WHERE chamber_id=:c AND project_id=:p AND role_index=:ri AND status='pending'
           ORDER BY match_score DESC LIMIT 1`,
          { replacements: { c: chamberId, p: proj.id, ri }, type: QueryTypes.SELECT, transaction: t });
        if (!inv) continue;
        await sequelize.query(
          `UPDATE project_invitations SET status='accepted', responded_at=NOW() WHERE chamber_id=:c AND id=:id`,
          { replacements: { c: chamberId, id: inv.id }, transaction: t });
        await sequelize.query(
          `INSERT INTO project_members (chamber_id, project_id, member_id, role, role_title, role_index, invitation_id, joined_at)
           VALUES (:c, :p, :m, 'collaborator', :rt, :ri, :inv, NOW())`,
          { replacements: { c: chamberId, p: proj.id, m: inv.member_id, rt: inv.role_title, ri, inv: inv.id }, transaction: t });
        await sequelize.query(
          `DELETE FROM project_invitations WHERE chamber_id=:c AND project_id=:p AND member_id=:m AND status='pending' AND id<>:inv`,
          { replacements: { c: chamberId, p: proj.id, m: inv.member_id, inv: inv.id }, transaction: t });
        filled++;
      }
      const team = await sequelize.query(
        `SELECT pm.member_id, m.trust_score, false AS is_proposer FROM project_members pm JOIN members m ON m.id=pm.member_id
         WHERE pm.chamber_id=:c AND pm.project_id=:p`,
        { replacements: { c: chamberId, p: proj.id }, type: QueryTypes.SELECT, transaction: t });
      const irs = await irsScorer.scoreProject(proj, team, { useAi: false });
      await sequelize.query(
        `UPDATE projects SET irs_score=$1, irs_components=$2::jsonb, irs_evidence=$3::jsonb, irs_grade=$4, irs_computed_at=NOW()
         WHERE chamber_id=$5 AND id=$6`,
        { bind: [irs.score, JSON.stringify(irs.components), JSON.stringify({ ai: irs.ai, base_score: irs.base_score, auto: 'demo_seed_accept' }),
          irs.grade, chamberId, proj.id], transaction: t });
      report.push({ id: proj.id, title: clip(proj.title, 55), roles: roles.length, team: team.length, open: roles.length - filled, irs: `${irs.score_100} ${irs.grade}` });
    }
    await t.commit();
    console.table(report);
  } catch (e) { await t.rollback(); throw e; }
}

(async () => {
  const [chamber] = await sequelize.query(`SELECT id FROM chambers WHERE slug = :s`,
    { replacements: { s: SLUG }, type: QueryTypes.SELECT });
  if (!chamber) throw new Error(`chamber ${SLUG} not found`);
  const chamberId = chamber.id;

  if (RESET_ONLY) { await reset(chamberId); return; }
  if (args.has('--accept')) { await acceptTopMatches(chamberId); return; }
  if (!DRY) {
    const existing = await demoMemberIds(chamberId);
    if (existing.length && !RESEED) {
      console.log(`${existing.length} demo members already exist in ${SLUG}. Use --reseed to replace them or --reset to remove them.`);
      return;
    }
    if (existing.length) await reset(chamberId);
  }
  await seed(chamberId);
  if (!DRY) await acceptTopMatches(chamberId);
})().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
