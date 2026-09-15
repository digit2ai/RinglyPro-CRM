'use strict';

/**
 * SpeakUp AI Factory — Project Registry.
 *
 * ROUTING IS DATA, NOT CODE. Nothing else in the factory names a project: every
 * repository, branch, path scope, allowed action and test command is read from
 * su_projects. Adding a project is a row (POST /factory/projects), not a deploy.
 *
 * The seed below only fills keys a tenant does not have yet; it never overwrites
 * an edited row.
 */

const { Project } = require('../models');
const { normalizeSpoken } = require('./security');

const ACTIONS = ['read', 'prepare', 'execute', 'merge'];
const MONOREPO = process.env.SPEAKUP_FACTORY_REPO || 'digit2ai/RinglyPro-CRM';

const DEFAULT_PROJECTS = [
  { key: 'ringlypro', name: 'RinglyPro', aliases: ['ringlypro', 'ringly pro', 'ringly', 'crm', 'rachel', 'lina'],
    path_scope: ['src'], knowledge_sources: ['CLAUDE.md', '.claude/commands/ringlypro-architect.md'],
    deployment: 'Render auto-deploy from main (aiagent.ringlypro.com)' },
  { key: 'speakup', name: 'SpeakUp', aliases: ['speakup', 'speak up'],
    path_scope: ['verticals/speakup'], test_commands: ['node verticals/speakup/test-offline.js'],
    knowledge_sources: ['CLAUDE.md'], deployment: 'Render auto-deploy from main (/speakup)' },
  { key: 'orbup', name: 'OrbUp', aliases: ['orbup', 'orb up', 'discovery'],
    path_scope: ['verticals/discovery'], knowledge_sources: ['CLAUDE.md'], deployment: 'Render auto-deploy from main (orbup.app)' },
  { key: 'jobmd', name: 'JobMD', aliases: ['jobmd', 'job md', 'jobmd io'],
    path_scope: ['verticals/jobmd'], knowledge_sources: ['CLAUDE.md'], deployment: 'Render auto-deploy from main (jobmd.io)' },
  { key: 'jobup', name: 'JobUp', aliases: ['jobup', 'job up'],
    path_scope: ['verticals/jobup'], knowledge_sources: ['CLAUDE.md'], deployment: 'Render auto-deploy from main (jobup.dev)' },
  { key: 'virtual-chamber', name: 'Virtual Chamber', aliases: ['virtual chamber', 'camara virtual', 'camaravirtual', 'chamber', 'pacc'],
    path_scope: ['src/routes/unified-chamber', 'public/chamber'], knowledge_sources: ['CLAUDE.md'],
    deployment: 'Render auto-deploy from main (camaravirtual.app)' }
];

async function ensureDefaults(tenant_id) {
  let created = 0;
  for (const p of DEFAULT_PROJECTS) {
    const [, isNew] = await Project.findOrCreate({
      where: { tenant_id, key: p.key },
      defaults: {
        tenant_id, key: p.key, name: p.name, aliases: p.aliases, repo: MONOREPO, default_branch: 'main',
        path_scope: p.path_scope, deployment: p.deployment, architect_agent: 'ringlypro-architect',
        knowledge_sources: p.knowledge_sources, allowed_actions: ['read', 'prepare', 'execute', 'merge'],
        test_commands: p.test_commands || [], workflow_file: 'speakup-factory.yml', enabled: true
      }
    });
    if (isNew) created++;
  }
  return created;
}

async function list(tenant_id) {
  return Project.findAll({ where: { tenant_id }, order: [['id', 'ASC']] });
}

async function get(tenant_id, key) {
  if (!key) return null;
  return Project.findOne({ where: { tenant_id, key: String(key) } });
}

// Longest alias wins, whole-word match on normalized text.
function matchProject(projects, text) {
  const n = ' ' + normalizeSpoken(text) + ' ';
  let best = null, bestLen = 0;
  for (const p of projects) {
    if (!p.enabled) continue;
    const names = [p.key, p.name, ...(p.aliases || [])].map(normalizeSpoken).filter(Boolean);
    for (const a of names) {
      if (n.includes(' ' + a + ' ') && a.length > bestLen) { best = p; bestLen = a.length; }
    }
  }
  return best;
}

async function resolveFromText(tenant_id, text) {
  return matchProject(await list(tenant_id), text);
}

// Test commands run in CI with execFile (no shell). Only these prefixes, and no
// shell metacharacters, so a registry edit cannot smuggle a pipeline in.
const TEST_CMD = /^(node|npx jest|npm test)(\s+[A-Za-z0-9_./:=@-]+)*$/;

function sanitize(input, { partial } = {}) {
  const out = {};
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has('key')) {
    const key = String(input.key || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(key)) errors.push('key must be lowercase letters, digits or dashes');
    out.key = key;
  }
  if (!partial || has('name')) {
    out.name = String(input.name || '').trim().slice(0, 120);
    if (!out.name) errors.push('name required');
  }
  if (has('aliases')) out.aliases = (Array.isArray(input.aliases) ? input.aliases : []).map(a => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (!partial || has('repo')) {
    out.repo = String(input.repo || '').trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(out.repo)) errors.push('repo must be owner/name');
  }
  if (has('default_branch')) {
    out.default_branch = String(input.default_branch || 'main').trim();
    if (!/^[A-Za-z0-9._/-]{1,100}$/.test(out.default_branch)) errors.push('invalid default_branch');
  }
  if (has('path_scope')) {
    out.path_scope = (Array.isArray(input.path_scope) ? input.path_scope : []).map(String)
      .filter(p => /^[A-Za-z0-9_.\/-]{1,200}$/.test(p) && !p.includes('..') && !p.startsWith('/')).slice(0, 10);
  }
  if (has('deployment')) out.deployment = String(input.deployment || '').slice(0, 200);
  if (has('architect_agent')) out.architect_agent = String(input.architect_agent || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  if (has('knowledge_sources')) {
    out.knowledge_sources = (Array.isArray(input.knowledge_sources) ? input.knowledge_sources : []).map(String)
      .filter(p => /^[A-Za-z0-9_.\/-]{1,200}$/.test(p) && !p.includes('..')).slice(0, 10);
  }
  if (has('allowed_actions')) {
    out.allowed_actions = (Array.isArray(input.allowed_actions) ? input.allowed_actions : []).filter(a => ACTIONS.includes(a));
  }
  if (has('test_commands')) {
    const cmds = (Array.isArray(input.test_commands) ? input.test_commands : []).map(c => String(c).trim()).filter(Boolean);
    for (const c of cmds) if (!TEST_CMD.test(c)) errors.push('test command not allowed: ' + c);
    out.test_commands = cmds.filter(c => TEST_CMD.test(c)).slice(0, 5);
  }
  if (has('workflow_file')) {
    out.workflow_file = String(input.workflow_file || '').trim();
    if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(out.workflow_file)) errors.push('invalid workflow_file');
  }
  if (has('enabled')) out.enabled = !!input.enabled;
  return { value: out, errors };
}

function allows(project, action) {
  return !!(project && project.enabled && Array.isArray(project.allowed_actions) && project.allowed_actions.includes(action));
}

module.exports = { ACTIONS, DEFAULT_PROJECTS, TEST_CMD, ensureDefaults, list, get, matchProject, resolveFromText, sanitize, allows };
