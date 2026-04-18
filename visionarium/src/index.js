const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for visionarium.app
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('visionarium.app') || origin.includes('ringlypro.com') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Lang');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// i18n middleware
const { detectLanguage } = require('./middleware/i18n');
app.use(detectLanguage);

// Health check
app.use('/health', require('./routes/health'));

// API routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/community', require('./routes/community'));
app.use('/api/v1/cohorts', require('./routes/cohorts'));
app.use('/api/v1/fellows', require('./routes/fellows'));
app.use('/api/v1/mentors', require('./routes/mentors'));
app.use('/api/v1/sponsors', require('./routes/sponsors'));
app.use('/api/v1/applications', require('./routes/applications'));
app.use('/api/v1/events', require('./routes/events'));
app.use('/api/v1/opportunities', require('./routes/marketplace'));
app.use('/api/v1/impact', require('./routes/impact'));
app.use('/api/v1/lina', require('./routes/lina'));
app.use('/api/v1/admin', require('./routes/admin'));

// Serve React dashboard (built assets)
const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist');
app.use(express.static(dashboardDist));

// DB sync on startup
const models = require('../models');
models.sequelize.sync({ alter: false })
  .then(() => console.log('[Visionarium] Database models synced'))
  .catch(err => console.error('[Visionarium] DB sync error:', err.message));

// Seed sponsor tiers on first run
(async () => {
  try {
    const count = await models.VisionariumSponsorTier.count();
    if (count === 0) {
      await models.VisionariumSponsorTier.bulkCreate([
        { name: 'founding', min_contribution: 250000, board_observer: true, named_fellowship: true, demo_day_speaking: true, custom_impact_dossier: true, benefits: { board_observer: true, named_fellowships: true, prominent_recognition: true, first_access_talent: true, demo_day_speaking: true, custom_dossier: true } },
        { name: 'lead', min_contribution: 100000, board_observer: false, named_fellowship: true, demo_day_speaking: true, custom_impact_dossier: true, benefits: { named_track: true, logo_on_materials: true, sponsor_briefed_capstone: true, demo_day_presence: true, custom_dossier: true } },
        { name: 'program', min_contribution: 25000, board_observer: false, named_fellowship: false, demo_day_speaking: false, custom_impact_dossier: false, benefits: { logo_recognition: true, aggregate_impact_report: true, mentor_slot_invitations: true, talent_pipeline_access: true } },
        { name: 'supporter', min_contribution: 10000, board_observer: false, named_fellowship: false, demo_day_speaking: false, custom_impact_dossier: false, benefits: { name_recognition: true, aggregate_impact_report: true, mentor_slot_invitations: true } },
        { name: 'in_kind', min_contribution: 0, board_observer: false, named_fellowship: false, demo_day_speaking: false, custom_impact_dossier: false, benefits: { tier_equivalent_recognition: true } }
      ]);
      console.log('[Visionarium] Sponsor tiers seeded');
    }
  } catch (e) { /* table may not exist yet on first deploy */ }
})();

// SPA fallback -- serve index.html for all non-API, non-asset routes
app.get('*', (req, res) => {
  const indexPath = path.join(dashboardDist, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback: redirect to whitepaper until dashboard is built
    res.redirect('/youth-talent-global/whitepaper.html');
  }
});

module.exports = app;
