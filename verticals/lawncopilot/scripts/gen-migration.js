'use strict';

/**
 * Regenerate the canonical migration SQL from the live schema.
 * Run from the repo root: node verticals/lawncopilot/scripts/gen-migration.js
 *
 * Tables auto-create on boot via sync({alter:false}); this file is the
 * checked-in record of that schema for anyone provisioning a fresh database.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const m = require('../src/models');

const TYPE = {
  'integer': 'INTEGER',
  'character varying': 'VARCHAR(255)',
  'text': 'TEXT',
  'boolean': 'BOOLEAN',
  'jsonb': 'JSONB',
  'double precision': 'DOUBLE PRECISION',
  'timestamp with time zone': 'TIMESTAMPTZ',
  'timestamp without time zone': 'TIMESTAMP',
  'date': 'DATE'
};

(async () => {
  const [cols] = await m.sequelize.query(
    "SELECT table_name, column_name, data_type, is_nullable, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name LIKE 'lc\\_%' " +
    "ORDER BY table_name, ordinal_position"
  );
  const [idx] = await m.sequelize.query(
    "SELECT tablename, indexdef FROM pg_indexes " +
    "WHERE schemaname='public' AND tablename LIKE 'lc\\_%' AND indexname NOT LIKE '%_pkey' " +
    "ORDER BY tablename, indexname"
  );

  const byTable = {};
  cols.forEach(c => { (byTable[c.table_name] = byTable[c.table_name] || []).push(c); });

  let out = `-- Lawn Co-Pilot — canonical schema
-- The AI office for landscaping companies. Multi-tenant throughout (tenant_id).
--
-- Tables auto-create on boot via sync({alter:false}) in src/index.js. This file
-- is the checked-in record for provisioning a fresh database directly.
--
-- Card data NEVER lands here: lc_payment_methods holds Stripe ids plus
-- brand/last4/expiry only. No PAN, no CVV.
--
-- Generated ${new Date().toISOString().slice(0, 10)} from the live schema.

`;

  Object.keys(byTable).sort().forEach(t => {
    out += `CREATE TABLE IF NOT EXISTS ${t} (\n`;
    out += byTable[t].map(c => {
      const isSerial = (c.column_default || '').includes('nextval');
      let line = '  ' + c.column_name + ' ';
      if (isSerial) {
        line += 'SERIAL PRIMARY KEY';
      } else {
        line += TYPE[c.data_type] || c.data_type.toUpperCase();
        if (c.column_default) line += ' DEFAULT ' + c.column_default;
        if (c.is_nullable === 'NO') line += ' NOT NULL';
      }
      return line;
    }).join(',\n');
    out += '\n);\n';

    idx.filter(i => i.tablename === t).forEach(i => {
      out += i.indexdef
        .replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ') + ';\n';
    });
    out += '\n';
  });

  const target = path.join(__dirname, '..', 'migrations', '20260723_lawncopilot_tables.sql');
  fs.writeFileSync(target, out);
  console.log(`Wrote ${Object.keys(byTable).length} tables to ${target}`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
