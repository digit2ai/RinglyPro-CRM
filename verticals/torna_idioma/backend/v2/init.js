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

async function seedBadges() {
  const [[{ c: badgeCount }]] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ti_v2_badges`
  );
  if (badgeCount >= 15) return;

  const badges = require('./seeds/badges');
  let inserted = 0;
  for (const b of badges) {
    try {
      const result = await sequelize.query(
        `INSERT INTO ti_v2_badges
         (code, name_en, name_es, name_fil, description, icon, color, category, xp_reward, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (code) DO UPDATE SET
           name_en = EXCLUDED.name_en,
           name_es = EXCLUDED.name_es,
           name_fil = EXCLUDED.name_fil,
           description = EXCLUDED.description,
           icon = EXCLUDED.icon,
           color = EXCLUDED.color,
           category = EXCLUDED.category,
           xp_reward = EXCLUDED.xp_reward,
           sort_order = EXCLUDED.sort_order
         RETURNING id`,
        {
          bind: [
            b.code,
            b.name_en,
            b.name_es || null,
            b.name_fil || null,
            b.description || null,
            b.icon || null,
            b.color || 'gold',
            b.category || 'progress',
            b.xp_reward || 0,
            b.sort_order || 0
          ]
        }
      );
      if (result[0].length > 0) inserted++;
    } catch (e) {
      console.warn('  ⚠ badge skip:', b.code, e.message);
    }
  }
  const [[{ c: finalCount }]] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ti_v2_badges`
  );
  console.log(`  ✅ Torna Idioma v2 badges seeded: ${inserted} upserted, ${finalCount} total`);
}

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

    // Seed badges (Step 5)
    await seedBadges();
  } catch (err) {
    console.error('  ⚠ Torna Idioma v2 init error:', err.message);
  }
}

module.exports = { initializeV2 };
