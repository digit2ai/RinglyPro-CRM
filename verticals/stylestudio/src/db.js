'use strict';
/**
 * Style Studio — database. CRM_DATABASE_URL || DATABASE_URL (the house rule, and
 * the database holding the CRM `users` table the owner signs in against).
 * The migration IS the schema: every file in ../migrations runs on boot, in
 * filename order, under a Postgres advisory lock so two instances never race.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const url = process.env.STYLE_STUDIO_DATABASE_URL || process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = new Sequelize(url, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

const LOCK = 7310112026;
async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const t = await sequelize.transaction();
  try {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: LOCK }, transaction: t });
    for (const f of files) await sequelize.query(fs.readFileSync(path.join(dir, f), 'utf8'), { transaction: t });
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }
}

const sel = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const one = async (sql, r) => (await sel(sql, r))[0] || null;
const exec = (sql, replacements = {}) => sequelize.query(sql, { replacements });

module.exports = { sequelize, migrate, sel, one, exec };
