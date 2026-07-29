// =====================================================
// routes/tracks.js — GET /api/v1/tracks (public, no auth)
//
// Serves the curated library from data/tracks.json. `?lang=en` swaps the
// Spanish title/category/description for their English counterparts, so the
// player never has to hold a copy of the library copy in two places.
// =====================================================

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const LIBRARY_PATH = path.join(__dirname, '..', 'data', 'tracks.json');

let cache = null;
function loadLibrary() {
  if (cache) return cache;
  cache = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  return cache;
}

function categoryLabel(lib, id, en) {
  const cat = (lib.categories || []).find((c) => c.id === id);
  if (!cat) return id;
  return en ? (cat.label_en || cat.label) : cat.label;
}

function project(track, lang, lib) {
  const en = lang === 'en';
  const out = {
    id: track.id,
    title: en ? (track.title_en || track.title) : track.title,
    category: track.category,
    category_label: categoryLabel(lib, track.category, en),
    url: track.url,
    duration_sec: track.duration_sec,
    loop: track.loop !== false,
    description: en ? (track.description_en || track.description) : track.description,
    license: track.license,
    stereo_required: !!track.stereo_required,
  };
  // Frequency metadata only where it actually applies, so the UI can badge the
  // headphone requirement and the "not for sleep" warning without guessing.
  if (track.band) out.band = track.band;
  if (track.beat_hz != null) out.beat_hz = track.beat_hz;
  if (track.carrier_hz != null) out.carrier_hz = track.carrier_hz;
  if (track.frequency_hz != null) out.frequency_hz = track.frequency_hz;
  if (track.not_for_sleep) out.not_for_sleep = true;
  return out;
}

module.exports = function trackRoutes() {
  const router = express.Router();

  // Criterion 2: 200 + JSON array of >= 5 tracks, each {id,title,category,url,duration_sec}.
  router.get('/api/v1/tracks', (req, res) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'es';
      const lib = loadLibrary();
      res.set('Cache-Control', 'public, max-age=300');
      res.json(lib.tracks.map((t) => project(t, lang, lib)));
    } catch (err) {
      console.error('[sueno] tracks read failed:', err.message);
      res.status(500).json({ error: 'track library unavailable' });
    }
  });

  // Library metadata (licensing note, version) — handy for the UI footer.
  router.get('/api/v1/tracks/meta', (req, res) => {
    try {
      const en = req.query.lang === 'en';
      const lib = loadLibrary();
      const used = new Set(lib.tracks.map((t) => t.category));
      res.json({
        library_version: lib.library_version,
        license_note: lib.license_note,
        // Stated on every surface that shows a frequency track. No health,
        // psychological or financial claim is made anywhere in this app.
        frequency_disclaimer: en
          ? lib.frequency_disclaimer_en : lib.frequency_disclaimer,
        units_note: lib.units_note,
        count: lib.tracks.length,
        categories: (lib.categories || []).filter((c) => used.has(c.id)).map((c) => ({
          id: c.id,
          label: en ? (c.label_en || c.label) : c.label,
          count: lib.tracks.filter((t) => t.category === c.id).length,
        })),
      });
    } catch (err) {
      console.error('[sueno] tracks meta failed:', err.message);
      res.status(500).json({ error: 'track library unavailable' });
    }
  });

  return router;
};

module.exports.loadLibrary = loadLibrary;
