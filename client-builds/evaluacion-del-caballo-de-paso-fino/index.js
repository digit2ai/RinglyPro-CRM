// =====================================================
// Evaluación del Caballo de Paso Fino — Express sub-app.
//
// Auto-mounted by src/app.js at /evaluacion-del-caballo-de-paso-fino.
//   GET  /health                       -> public health check (#1)
//   POST /api/v1/horses                -> register a horse (JWT) (#2)
//   GET  /api/v1/horses                -> tenant-scoped list (#3)
//   POST /api/v1/evaluations           -> upload WAV + analyze + persist (JWT) (#4,#5,#6)
//   GET  /api/v1/evaluations?horse_id  -> per-horse history, newest first (#7)
//   GET  / , /dashboard                -> server-rendered ES/EN pages (#8)
//   GET  /privacidad                   -> Ley 1581 data-protection note (#9)
//
// Audio layer ONLY: upload a hoof-beat WAV, extract cadence + regularity in pure
// JS, apply the deterministic rule engine, show a diagnostic card + history.
// Video + ML fusion are deferred (multi-year vision); this proves hoof sound is
// measurable — the POC the timeline calls for.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');

const evaluation = require('./models/evaluation');
const championship = require('./models/championship');
const healthRouter = require('./routes/health');
const sessionRouter = require('./routes/session');
const horsesRouter = require('./routes/horses');
const evaluationsRouter = require('./routes/evaluations');
const championshipRouter = require('./routes/championship');
const pagesRouter = require('./routes/pages');

const app = express();

// Body parsing for JSON routes (horse create). Multipart uploads are handled by
// multer inside routes/evaluations.js, so this never touches the WAV bytes.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Bring up the data layer once (Postgres, or in-memory fallback). Non-blocking.
evaluation.init()
  .then((s) => console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'store_init', mode: s.mode })))
  .catch((e) => console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'store_init_error', error: e.message })));

// Championship judge data layer (video + audio, modality classification, scoring).
championship.init()
  .then((s) => console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'champ_init', mode: s.mode })))
  .catch((e) => console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'champ_init_error', error: e.message })));

// Health (public).
app.use('/health', healthRouter);

// Static assets (app.js). Pages are server-rendered, so never serve index.html
// statically.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Demo session minting (server-side token for the live POC).
app.use('/api/v1/session', sessionRouter);

// JWT-guarded (writes) + public-read API.
app.use('/api/v1/horses', horsesRouter);
app.use('/api/v1/evaluations', evaluationsRouter);
app.use('/api/v1/champ', championshipRouter);

// Server-rendered pages (/, /dashboard, /privacidad). Mounted last.
app.use('/', pagesRouter);

module.exports = app;

// Allow standalone boot for local dev (node index.js).
if (require.main === module) {
  const PORT = process.env.ECPF_PORT || 4087;
  app.listen(PORT, () => console.log(`evaluacion-del-caballo-de-paso-fino listening on :${PORT}`));
}
