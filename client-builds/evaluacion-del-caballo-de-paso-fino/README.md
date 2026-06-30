# Evaluación del Caballo de Paso Fino

Spanish-first app for judging the gait of Colombian Paso Fino horses. Two layers:

## Layer 1 — Audio evaluation (`/`)
Ingests a hoof-beat **WAV** for a named horse, extracts cadence (BPM) and frequency regularity (CV) via pure-JS WAV decode + short-time-energy onset detection (`lib/gaitAnalyzer.js`), applies a deterministic rule engine (`lib/diagnosis.js` — constant-but-lagging → `vet_review`, irregular → `training_adjustment`, else `normal`), persists the evaluation, and shows a diagnostic card + per-horse history. 16-bit PCM mono WAV only (non-WAV → `415`).

## Layer 2 — Championship judge (`/juez`)
Turns the app into a **championship judge**: it classifies the gait **modality** (`paso_fino` / `trocha` / `trote_galope`) and **scores** it from two sources — **video pose** (per-frame joint keypoints) and **audio** (hoof beats).

- **Detection + fusion** (`lib/footfall.js`): footfalls from pose (hoof `casco_*` ground contacts) and from audio onsets; fused when they fall within ~40 ms, raising confidence. Limb + sequence + inter-beat intervals assigned per footfall.
- **Classification** (`lib/classifier.js`): counts beats/cycle (2/3/4), detects lateral vs diagonal support (each fore follows the same-side hind = lateral → paso fino; opposite side = diagonal → trocha), and the interval coefficient of variation. Rules + **versioned thresholds** live in `ecpf_modelos_clasificacion.umbrales_json` (never hardcoded). Returns confidence and `es_modalidad_valida` (detected vs entered category).
- **Metrics** (`lib/metrics.js`): cadence, regularity, lateral symmetry, 4-beat uniformity/clarity, elevation; surface normalizes audio level.
- **Scoring** (`lib/scoring.js`): each criterion in `ecpf_criterios_evaluacion` (paso fino: rhythm 35% · 4-beat clarity 25% · symmetry 15% · brío/cadence 15% · elevation 10%) → 0..100, weighted total, **ranking** within the category.

**UI** (`/juez`): pre-select event/category/competitor (one-click demo data), upload video (+optional audio), surface selector, progress bar, then a judge card — modality + confidence, mismatch flag, key metrics, total score + per-criterion breakdown, footfall timeline (video/audio/both), video player, and a narrative verdict. The dashboard (`/dashboard`) adds a sortable ranking-by-category table.

**Pose note:** server does not decode video (no native deps). Pose keypoints arrive as a JSON contract (equine-pose model in production). For the zero-setup live demo, the gait is **synthesized on the server** (`lib/synth.js`, `demo_modalidad`) and the **real** pipeline runs end-to-end; sessions are tagged `modelo_pose='synthetic-demo'` for traceability. Only the 4 `casco_*` keypoints are persisted (volume control; partition by `sesion_id` when real volume arrives).

## Runbook
Auto-mounted by `src/app.js` at `/evaluacion-del-caballo-de-paso-fino`. Sequelize against `DATABASE_URL` with in-memory fallback (`ECPF_FORCE_MEMORY=1`). All championship tables/enums are prefixed `ecpf_` (they share RinglyPro's Postgres; generic names like `eventos`/`resultados` would collide). Canonical DDL: `migrations/002_championship.sql` (idempotent: `IF NOT EXISTS` + `ON CONFLICT`; Sequelize `sync({alter:false})` also creates them on boot). Writes require a RinglyPro JWT (`JWT_SECRET`); the UI auto-acquires a demo session (`GET /api/v1/session/demo`) so judges never paste a token. Reads are public.

Run the acceptance suite with `node sit.js` (boots in-memory, 26 checks: audio app + classifier unit tests + championship e2e, exit 0 on pass). Bilingual ES (default) / EN (`?lang=en`). Privacy: no personal data (Ley 1581 note at `/privacidad`).

## API (`/api/v1/champ`)
- `POST /demo-setup` — create demo event/category/horse/inscription (JWT)
- `POST /sessions` — upload video+audio (or `demo_modalidad`) + `inscripcion_id` + `superficie` → runs the full pipeline, returns the judge verdict (JWT)
- `GET /sessions/:id` — full verdict for a session
- `GET /results?categoria_id=` — category ranking
- `GET /eventos | /categorias | /inscripciones` — UI selectors
