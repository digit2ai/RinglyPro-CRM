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

async function seedTutors() {
  try {
    const [[{ c: tutorCount }]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM ti_v2_tutors`
    );
    if (tutorCount >= 3) return;

    const tutors = require('./seeds/tutors');
    let inserted = 0;
    for (const t of tutors) {
      try {
        const [result] = await sequelize.query(
          `INSERT INTO ti_v2_tutors
           (display_name, headline, bio, accent, native_language, languages_spoken,
            specialties, certifications, years_experience, hourly_rate_usd, status,
            timezone, rating_avg, rating_count, total_sessions, total_students, photo_url,
            approved_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11,
                   $12, $13, $14, $15, $16, $17, NOW(), NOW(), NOW())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          {
            bind: [
              t.display_name,
              t.headline,
              t.bio,
              t.accent,
              t.native_language,
              JSON.stringify(t.languages_spoken || []),
              JSON.stringify(t.specialties || []),
              JSON.stringify(t.certifications || []),
              t.years_experience || 0,
              t.hourly_rate_usd,
              t.status || 'approved',
              t.timezone || 'UTC',
              t.rating_avg || 0,
              t.rating_count || 0,
              t.total_sessions || 0,
              t.total_students || 0,
              t.photo_url || null
            ]
          }
        );
        if (result[0]?.id) {
          inserted++;
          // Seed availability
          for (const slot of (t.availability || [])) {
            await sequelize.query(
              `INSERT INTO ti_v2_tutor_availability (tutor_id, day_of_week, start_time, end_time, active, created_at)
               VALUES ($1, $2, $3, $4, true, NOW())`,
              { bind: [result[0].id, slot.day_of_week, slot.start_time, slot.end_time] }
            );
          }
        }
      } catch (e) {
        console.warn('  ⚠ tutor skip:', t.display_name, e.message);
      }
    }
    console.log(`  ✅ Torna Idioma v2 tutors seeded: ${inserted} tutors with availability`);
  } catch (e) {
    console.error('  ⚠ seedTutors failed:', e.message);
  }
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

    // Seed demo tutors (Step 10)
    await seedTutors();
  } catch (err) {
    console.error('  ⚠ Torna Idioma v2 init error:', err.message);
  }
}

module.exports = { initializeV2 };
