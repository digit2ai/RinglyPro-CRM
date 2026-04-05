'use strict';

/**
 * v2 Initialization — seeds v2-specific reference data.
 *
 * Called from the parent backend/index.js initialize() function after
 * v2 migrations run. Idempotent — safe to run on every deploy.
 *
 * Current seeds:
 *   - Filipino-Spanish cognates (500+ pairs from seeds/cognates-starter.js)
 */

const sequelize = require('../services/db.ti');

async function initializeV2() {
  try {
    // Seed cognates if table is empty (or has fewer than expected rows)
    const [[{ c: cognateCount }]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM ti_v2_cognates`
    );

    if (cognateCount < 500) {
      const cognates = require('./seeds/cognates-starter');
      let inserted = 0;
      let skipped = 0;

      for (const cg of cognates) {
        try {
          const result = await sequelize.query(
            `INSERT INTO ti_v2_cognates
             (word_es, word_tl, category, cefr_level, etymology_note, example_es, example_tl, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (word_es, word_tl) DO NOTHING
             RETURNING id`,
            {
              bind: [
                cg.word_es,
                cg.word_tl,
                cg.category,
                cg.cefr_level,
                cg.etymology_note,
                cg.example_es,
                cg.example_tl
              ]
            }
          );
          if (result[0].length > 0) inserted++;
          else skipped++;
        } catch (e) {
          // Log once, continue — don't let one bad row stop the seed
          if (skipped < 5) console.warn('  ⚠ cognate skip:', cg.word_es, '/', cg.word_tl, e.message);
          skipped++;
        }
      }

      const [[{ c: finalCount }]] = await sequelize.query(
        `SELECT COUNT(*)::int AS c FROM ti_v2_cognates`
      );
      console.log(
        `  ✅ Torna Idioma v2 cognates seeded: ${inserted} inserted, ${skipped} skipped, ${finalCount} total in table`
      );
    }
  } catch (err) {
    console.error('  ⚠ Torna Idioma v2 init error:', err.message);
  }
}

module.exports = { initializeV2 };
