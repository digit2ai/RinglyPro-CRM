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

function project(track, lang) {
  const en = lang === 'en';
  return {
    id: track.id,
    title: en ? (track.title_en || track.title) : track.title,
    category: en ? (track.category_en || track.category) : track.category,
    url: track.url,
    duration_sec: track.duration_sec,
    loop: track.loop !== false,
    description: en ? (track.description_en || track.description) : track.description,
    license: track.license,
    stereo_required: !!track.stereo_required,
  };
}

module.exports = function trackRoutes() {
  const router = express.Router();

  // Criterion 2: 200 + JSON array of >= 5 tracks, each {id,title,category,url,duration_sec}.
  router.get('/api/v1/tracks', (req, res) => {
    try {
      const lang = req.query.lang === 'en' ? 'en' : 'es';
      const lib = loadLibrary();
      res.set('Cache-Control', 'public, max-age=300');
      res.json(lib.tracks.map((t) => project(t, lang)));
    } catch (err) {
      console.error('[sueno] tracks read failed:', err.message);
      res.status(500).json({ error: 'track library unavailable' });
    }
  });

  // Library metadata (licensing note, version) — handy for the UI footer.
  router.get('/api/v1/tracks/meta', (req, res) => {
    try {
      const lib = loadLibrary();
      res.json({
        library_version: lib.library_version,
        license_note: lib.license_note,
        count: lib.tracks.length,
        categories: Array.from(new Set(lib.tracks.map((t) => t.category))),
      });
    } catch (err) {
      console.error('[sueno] tracks meta failed:', err.message);
      res.status(500).json({ error: 'track library unavailable' });
    }
  });

  return router;
};

module.exports.loadLibrary = loadLibrary;
