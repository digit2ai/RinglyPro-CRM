'use strict';

/**
 * One-shot migration: add CFO-grade categorization columns to intuitive_surgeon_commitments
 *
 * Adds the fields needed by the 3-tab Surgeon Commitment Editor (Deck 3 pattern):
 *   - commitment_category (open_to_mis | pull_forward | training_pipeline)
 *   - trained, training_needs, proctoring_needed
 *   - current_weekly_volume, target_weekly_volume, backlog_weeks (pull-forward)
 *   - free_text_intel (free-text CSR-gathered intel)
 *
 * Idempotent: each ADD COLUMN uses IF NOT EXISTS.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node verticals/intuitive/scripts/migrate-surgeon-commitment-fields.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const URL = process.env.DATABASE_URL || process.env.CRM_DATABASE_URL;
if (!URL) {
  console.error('DATABASE_URL or CRM_DATABASE_URL required');
  process.exit(1);
}

const sequelize = new Sequelize(URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

const STATEMENTS = [
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS commitment_category VARCHAR(30) DEFAULT 'open_to_mis'`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS trained BOOLEAN DEFAULT true`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS training_needs VARCHAR(255)`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS proctoring_needed BOOLEAN DEFAULT false`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS current_weekly_volume INTEGER`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS target_weekly_volume INTEGER`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS backlog_weeks INTEGER`,
  `ALTER TABLE intuitive_surgeon_commitments ADD COLUMN IF NOT EXISTS free_text_intel TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_intuitive_surg_commit_category ON intuitive_surgeon_commitments(commitment_category)`,
];

(async () => {
  try {
    console.log('Connecting...');
    await sequelize.authenticate();
    console.log('Connected.');

    for (const sql of STATEMENTS) {
      console.log('>', sql.slice(0, 90) + (sql.length > 90 ? '…' : ''));
      await sequelize.query(sql);
    }

    const [rows] = await sequelize.query(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = 'intuitive_surgeon_commitments'
          AND column_name IN ('commitment_category','trained','training_needs','proctoring_needed','current_weekly_volume','target_weekly_volume','backlog_weeks','free_text_intel')
        ORDER BY column_name`
    );
    console.log('\nVerified new columns:');
    for (const r of rows) console.log(' -', r.column_name, '(' + r.data_type + ')', r.column_default || '');

    console.log('\nDONE.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
})();
