'use strict';

/**
 * Método Rizal vocabulary seed loader.
 *
 * Module 1 (hand-authored gold standard) → ti_vocab_roots (assessed surface).
 * Modules 2–12 (machine-generated) → ti_vocab_roots_staging, qa_status='pending'.
 * Per Gate G3, generated Tagalog stays in staging until a native reviewer signs
 * off and promotes it. Idempotent: re-runs upsert each root.
 */

const fs = require('fs');
const path = require('path');
const sequelize = require('../../services/db.ti');

const DIR = __dirname;

function readModule(n) {
  const f = path.join(DIR, `module${n}_vocab_roots.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error(`  ⚠ Método Rizal: module${n} JSON parse failed:`, e.message);
    return null;
  }
}

function flattenRoots(mod) {
  const out = [];
  let order = 0;
  for (const session of mod.sessions || []) {
    for (const r of session.roots || []) {
      out.push({
        id: r.id,
        module: mod.module,
        level: mod.level,
        theme: session.theme,
        element: session.element,
        root_lemma: r.root_lemma,
        pos: r.pos,
        derived_forms: JSON.stringify(r.derived_forms || []),
        gloss_en: r.gloss_en,
        gloss_fil: r.gloss_fil,
        example_es: r.example_es,
        example_en: r.example_en,
        example_fil: r.example_fil,
        sort_order: order++,
      });
    }
  }
  return out;
}

async function upsert(table, rows, staging) {
  for (const r of rows) {
    const cols = `id, module, level, theme, element, root_lemma, pos, derived_forms,
                  gloss_en, gloss_fil, example_es, example_en, example_fil, sort_order`;
    const extraCol = staging ? ', qa_status' : '';
    const extraVal = staging ? `, 'pending'` : '';
    await sequelize.query(
      `INSERT INTO ${table} (${cols}${extraCol})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14${extraVal})
       ON CONFLICT (id) DO UPDATE SET
         module=$2, level=$3, theme=$4, element=$5, root_lemma=$6, pos=$7,
         derived_forms=$8::jsonb, gloss_en=$9, gloss_fil=$10, example_es=$11,
         example_en=$12, example_fil=$13, sort_order=$14`,
      { bind: [r.id, r.module, r.level, r.theme, r.element, r.root_lemma, r.pos,
               r.derived_forms, r.gloss_en, r.gloss_fil, r.example_es, r.example_en,
               r.example_fil, r.sort_order] }
    );
  }
}

async function loadMetodoRizal() {
  // Module 1 → assessed surface (authored gold standard).
  const m1 = readModule(1);
  if (m1) {
    const [[exists]] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM ti_vocab_roots WHERE module = 1`);
    if (!exists || exists.n < 1) {
      await upsert('ti_vocab_roots', flattenRoots(m1), false);
      console.log('  ✅ Método Rizal: Module 1 loaded into ti_vocab_roots (gold standard)');
    }
  }

  // Modules 2–12 → staging (machine-generated, QA-held under Gate G3).
  const [[staged]] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM ti_vocab_roots_staging`);
  if (!staged || staged.n < 1) {
    let total = 0, mods = 0;
    for (let n = 2; n <= 12; n++) {
      const mod = readModule(n);
      if (!mod) continue;
      const rows = flattenRoots(mod);
      await upsert('ti_vocab_roots_staging', rows, true);
      total += rows.length; mods += 1;
    }
    if (mods > 0) {
      console.log(`  ✅ Método Rizal: ${mods} modules (${total} roots) staged for G3 review`);
    }
  }
}

module.exports = { loadMetodoRizal };
