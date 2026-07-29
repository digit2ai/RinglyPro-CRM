// =====================================================
// routes/sessions.js — POST/GET/PATCH /api/v1/sessions
//
// No login this sprint. The row owner is the client-generated `x-anon-token`
// header (a random UUID, not PII). Every read filters on tenant_id AND
// anon_token, so one device can never see another's history.
//
// PII discipline: the token is NEVER logged at full length — `mask()` keeps the
// first 8 characters only, and nothing else identifying is stored.
// =====================================================

'use strict';

const express = require('express');
const { loadLibrary } = require('./tracks');

const TENANT_ID = parseInt(process.env.APLICACION_SUENO_TENANT_ID || '1', 10);
const TOKEN_RE = /^[A-Za-z0-9._:-]{8,64}$/;

function mask(token) {
  if (!token) return '(none)';
  return String(token).slice(0, 8) + '…';
}

function readToken(req) {
  const raw = req.get('x-anon-token');
  if (!raw) return { error: 'x-anon-token header required' };
  const token = String(raw).trim();
  if (!TOKEN_RE.test(token)) {
    return { error: 'x-anon-token must be 8-64 chars of [A-Za-z0-9._:-]' };
  }
  return { token };
}

function knownTrackIds() {
  try { return new Set(loadLibrary().tracks.map((t) => t.id)); } catch (e) { return null; }
}

module.exports = function sessionRoutes({ store }) {
  const router = express.Router();

  // Criterion 3 + 4: 201 with the created row (incl. tenant_id); 400 with no token.
  router.post('/api/v1/sessions', async (req, res) => {
    const auth = readToken(req);
    if (auth.error) return res.status(400).json({ error: auth.error });

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'JSON object body required' });
    }

    const trackId = typeof body.track_id === 'string' ? body.track_id.trim() : '';
    if (!trackId) return res.status(400).json({ error: 'track_id required' });
    const ids = knownTrackIds();
    if (ids && !ids.has(trackId)) {
      return res.status(400).json({ error: 'unknown track_id' });
    }

    const timer = Number(body.timer_minutes);
    if (!Number.isFinite(timer) || !Number.isInteger(timer) || timer < 1 || timer > 720) {
      return res.status(400).json({ error: 'timer_minutes must be an integer between 1 and 720' });
    }

    const played = Number.isFinite(Number(body.played_seconds))
      ? Math.max(0, Math.min(Math.round(Number(body.played_seconds)), 720 * 60))
      : 0;

    try {
      const track = ids ? loadLibrary().tracks.find((t) => t.id === trackId) : null;
      const row = await store.create({
        tenant_id: TENANT_ID,
        anon_token: auth.token,
        track_id: trackId,
        track_title: track ? track.title : null,
        timer_minutes: timer,
        played_seconds: played,
        completed: body.completed === true,
        language: body.language === 'en' ? 'en' : 'es',
        completed_at: body.completed === true ? new Date() : null,
      });
      console.log(`[sueno] session logged track=${trackId} timer=${timer}m owner=${mask(auth.token)}`);
      res.status(201).json(row);
    } catch (err) {
      console.error('[sueno] session create failed:', err.message);
      res.status(500).json({ error: 'could not save session' });
    }
  });

  // Criterion 5: only rows owned by the presented token.
  router.get('/api/v1/sessions', async (req, res) => {
    const auth = readToken(req);
    if (auth.error) return res.status(400).json({ error: auth.error });
    try {
      const rows = await store.listByToken(TENANT_ID, auth.token, req.query.limit);
      res.set('Cache-Control', 'no-store');
      res.json(rows);
    } catch (err) {
      console.error('[sueno] session list failed:', err.message);
      res.status(500).json({ error: 'could not read sessions' });
    }
  });

  // Favourite selections, aggregated from this token's own rows.
  router.get('/api/v1/sessions/favourites', async (req, res) => {
    const auth = readToken(req);
    if (auth.error) return res.status(400).json({ error: auth.error });
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await store.favourites(TENANT_ID, auth.token));
    } catch (err) {
      console.error('[sueno] favourites failed:', err.message);
      res.status(500).json({ error: 'could not read favourites' });
    }
  });

  return router;
};
