// =====================================================
// lib/store.js — persistence, Postgres primary with an in-memory safety net.
//
// If DATABASE_URL is absent or the handshake fails, the store degrades to
// in-memory Maps behind an IDENTICAL interface, so /health, the wizard, the
// gallery, save and SIT all stay up. A prompt builder that 500s because a
// connection pool blinked is worse than one that cannot persist — the user's
// actual deliverable is the JSON in the preview pane, and clipboard/download
// never touch the database at all.
//
// /health reports which backend is live, so degraded mode is never silent.
//
// Schema comes from the raw idempotent migrations, NOT sequelize.sync() — see
// migrations/001_create_agents.sql for why (generated index names on a
// 47-character table name truncate and collide on the second boot).
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes, Op } = require('sequelize');

const seeds = require('../seeds/templates');

const DB_URL = process.env.DATABASE_URL || process.env.CRM_DATABASE_URL || '';
const SERVICE = 'ai-agent-prompt-builder';

let sequelize = null;
let models = null;
let backend = 'memory';
let initPromise = null;
let lastError = null;

// --- in-memory fallback tables ---
const mem = { agents: [], templates: [], seq: 1 };

function buildModels(seq) {
  return {
    Agent: require('../models/agent')(seq, DataTypes),
    Template: require('../models/template')(seq, DataTypes)
  };
}

function loadDdl(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8');
}

/**
 * Connect once, lazily, and never fatally. Repeated calls return the same
 * promise so a burst of concurrent requests does not open N pools.
 */
function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!DB_URL) {
      backend = 'memory';
      seedMemory();
      return { backend, reason: 'DATABASE_URL not set' };
    }
    try {
      sequelize = new Sequelize(DB_URL, {
        dialect: 'postgres',
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
        logging: false,
        pool: { max: 3, min: 0, idle: 10000, acquire: 15000 }
      });
      await sequelize.authenticate();
      models = buildModels(sequelize);

      await sequelize.query(loadDdl('001_create_agents.sql'));
      await sequelize.query(loadDdl('002_create_templates.sql'));

      backend = 'postgres';
      await seedTemplates();
      return { backend };
    } catch (err) {
      lastError = err.message;
      console.error(`[${SERVICE}] DB unavailable, using in-memory store:`, err.message);
      sequelize = null;
      models = null;
      backend = 'memory';
      seedMemory();
      return { backend, reason: err.message };
    }
  })();

  return initPromise;
}

function seedMemory() {
  mem.templates = seeds.rows().map((r, i) => Object.assign({ id: i + 1 }, r));
}

/**
 * Upsert the seeded gallery. Runs on every boot so editing a template's copy
 * and redeploying updates it in place — the UNIQUE (tenant_id, slug) index is
 * what turns this into an update rather than a duplicate.
 */
async function seedTemplates() {
  const rows = seeds.rows();
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO ai_agent_prompt_builder_for_data_writing_templates
         (tenant_id, slug, title, category, summary, definition, sort_order, created_at, updated_at)
       VALUES (:tenant_id, :slug, :title, :category, :summary, CAST(:definition AS jsonb), :sort_order, NOW(), NOW())
       ON CONFLICT (tenant_id, slug) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         summary = EXCLUDED.summary,
         definition = EXCLUDED.definition,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      {
        replacements: {
          tenant_id: r.tenant_id,
          slug: r.slug,
          title: r.title,
          category: r.category,
          summary: r.summary,
          definition: JSON.stringify(r.definition),
          sort_order: r.sort_order
        }
      }
    );
  }
}

function status() {
  return { backend, error: lastError };
}

// ---------------------------------------------------------------------------
// Templates — public reads. tenant 0 is the shared/system set.
// ---------------------------------------------------------------------------

async function listTemplates(tenantId) {
  await init();
  const tenants = [seeds.SYSTEM_TENANT];
  if (isFinite(tenantId) && tenantId > 0) tenants.push(tenantId);

  if (backend === 'postgres') {
    const rows = await models.Template.findAll({
      where: { tenant_id: { [Op.in]: tenants } },
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
    return rows.map(plainTemplate);
  }
  return mem.templates
    .filter((t) => tenants.indexOf(t.tenant_id) !== -1)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(plainTemplate);
}

async function getTemplate(slug, tenantId) {
  const all = await listTemplates(tenantId);
  return all.find((t) => t.slug === slug) || null;
}

function plainTemplate(t) {
  const r = t.get ? t.get({ plain: true }) : t;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    summary: r.summary,
    definition: r.definition,
    sort_order: r.sort_order
  };
}

// ---------------------------------------------------------------------------
// Agents — every read and write is filtered on tenant_id. No exceptions.
// ---------------------------------------------------------------------------

async function createAgent(tenantId, fields) {
  await init();
  const row = Object.assign({ tenant_id: tenantId }, fields, {
    created_at: new Date(),
    updated_at: new Date()
  });

  if (backend === 'postgres') {
    const created = await models.Agent.create(row);
    return plainAgent(created);
  }
  row.id = mem.seq++;
  mem.agents.push(row);
  return plainAgent(row);
}

async function listAgents(tenantId) {
  await init();
  if (backend === 'postgres') {
    const rows = await models.Agent.findAll({
      where: { tenant_id: tenantId },
      order: [['created_at', 'DESC'], ['id', 'DESC']]
    });
    return rows.map(plainAgent);
  }
  return mem.agents
    .filter((a) => a.tenant_id === tenantId)
    .sort((a, b) => b.id - a.id)
    .map(plainAgent);
}

/**
 * Fetch one agent. tenant_id is part of the WHERE clause, not an assertion
 * afterwards — a cross-tenant id reads as "not found", which is also what it
 * should look like from the outside.
 */
async function getAgent(tenantId, id) {
  await init();
  if (backend === 'postgres') {
    const row = await models.Agent.findOne({ where: { id, tenant_id: tenantId } });
    return row ? plainAgent(row) : null;
  }
  const row = mem.agents.find((a) => a.id === id && a.tenant_id === tenantId);
  return row ? plainAgent(row) : null;
}

async function updateAgent(tenantId, id, fields) {
  await init();
  const patch = Object.assign({}, fields, { updated_at: new Date() });

  if (backend === 'postgres') {
    const [count] = await models.Agent.update(patch, { where: { id, tenant_id: tenantId } });
    if (!count) return null;
    return getAgent(tenantId, id);
  }
  const row = mem.agents.find((a) => a.id === id && a.tenant_id === tenantId);
  if (!row) return null;
  Object.assign(row, patch);
  return plainAgent(row);
}

async function deleteAgent(tenantId, id) {
  await init();
  if (backend === 'postgres') {
    const count = await models.Agent.destroy({ where: { id, tenant_id: tenantId } });
    return count > 0;
  }
  const i = mem.agents.findIndex((a) => a.id === id && a.tenant_id === tenantId);
  if (i === -1) return false;
  mem.agents.splice(i, 1);
  return true;
}

/** SIT cleanup — removes a throwaway tenant's rows. */
async function purgeTenant(tenantId) {
  await init();
  if (backend === 'postgres') {
    return models.Agent.destroy({ where: { tenant_id: tenantId } });
  }
  const before = mem.agents.length;
  mem.agents = mem.agents.filter((a) => a.tenant_id !== tenantId);
  return before - mem.agents.length;
}

function plainAgent(a) {
  const r = a.get ? a.get({ plain: true }) : a;
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    name: r.name,
    role: r.role,
    goal: r.goal,
    description: r.description,
    data_sources: r.data_sources || [],
    instructions: r.instructions || [],
    constraints: r.constraints || [],
    output_schema: r.output_schema || {},
    source_template: r.source_template || null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

module.exports = {
  init,
  status,
  listTemplates,
  getTemplate,
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  purgeTenant
};
