// =====================================================
// MCP module 'gs-engine' — tool definitions + dispatcher, consistent with the
// existing D2AIEAM MCP pattern (POST /tools/call, GET /tools/list). Every tool is
// multi-tenant: the caller's EquiMind JWT sets req.tenantId. Responses are
// schema-valid JSON: { ok, tool, result } or { ok:false, error }.
// =====================================================
'use strict';

const express = require('express');
const router = express.Router();
const { requireAccount } = require('../lib/auth');
const svc = require('../lib/service');

const TOOLS = [
  { name: 'gs.capture.createSession', description: 'Create a 3D capture session (course_walk | conformation | scene).',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['course_walk', 'conformation', 'scene'] }, source_type: { type: 'string', enum: ['video', 'photos'] }, title: { type: 'string' }, horse_id: { type: 'integer' } } } },
  { name: 'gs.capture.uploadFrames', description: 'Register uploaded source coverage for a session and mark it ready.',
    input_schema: { type: 'object', required: ['session_id'], properties: { session_id: { type: 'integer' }, frame_count: { type: 'integer' }, source_bytes: { type: 'integer' }, source_seconds: { type: 'number' } } } },
  { name: 'gs.job.dispatch', description: 'Charge credits and enqueue a processing job for a ready session.',
    input_schema: { type: 'object', required: ['session_id'], properties: { session_id: { type: 'integer' }, inline: { type: 'boolean' } } } },
  { name: 'gs.job.status', description: 'Get the status of a processing job.',
    input_schema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'integer' } } } },
  { name: 'gs.scene.get', description: 'Get a playable scene with signed asset URLs.',
    input_schema: { type: 'object', required: ['scene_id'], properties: { scene_id: { type: 'integer' } } } },
  { name: 'gs.scene.list', description: 'List the tenant\'s 3D scenes.', input_schema: { type: 'object', properties: {} } },
  { name: 'gs.scene.delete', description: 'Delete a scene and its assets.',
    input_schema: { type: 'object', required: ['scene_id'], properties: { scene_id: { type: 'integer' } } } }
];

router.get('/tools/list', (req, res) => res.json({ module: 'gs-engine', version: '1.0.0', tools: TOOLS }));

router.post('/tools/call', requireAccount, async (req, res) => {
  const body = req.body || {};
  const tool = body.tool || body.name;
  const a = body.arguments || body.input || body.params || {};
  const base = (req.baseUrl.replace(/\/api\/v1\/mcp$/, '') || '') + '/';
  try {
    let result;
    switch (tool) {
      case 'gs.capture.createSession': result = await svc.createSession(req.tenantId, a); break;
      case 'gs.capture.uploadFrames': result = await svc.attachSource(req.tenantId, a.session_id, a); break;
      case 'gs.job.dispatch': result = await svc.dispatchJob(req.tenantId, a.session_id, { runInline: !!a.inline }); break;
      case 'gs.job.status': result = await svc.jobStatus(req.tenantId, a.job_id); break;
      case 'gs.scene.get': result = await svc.sceneGet(req.tenantId, a.scene_id, base); break;
      case 'gs.scene.list': result = await svc.sceneList(req.tenantId); break;
      case 'gs.scene.delete': result = await svc.sceneDelete(req.tenantId, a.scene_id); break;
      default: return res.status(400).json({ ok: false, error: 'unknown tool: ' + tool, tools: TOOLS.map((t) => t.name) });
    }
    if (result == null) return res.status(404).json({ ok: false, error: 'not found' });
    if (result.error) return res.status(result.code || 400).json({ ok: false, error: result.error, result });
    res.json({ ok: true, tool, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
module.exports.TOOLS = TOOLS;
