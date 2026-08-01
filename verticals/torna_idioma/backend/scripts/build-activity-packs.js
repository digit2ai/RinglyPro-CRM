#!/usr/bin/env node
'use strict';

/**
 * Rebuild every lesson's practice pack from the current curriculum.
 *
 *   node verticals/torna_idioma/backend/scripts/build-activity-packs.js
 *
 * Safe to re-run: packs are derived from ti_lessons + the practice bank, so a rebuild
 * reflects whatever the curriculum says now. Runs with no API key.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sequelize = require('../services/db.ti');
const activityPack = require('../services/activity-pack');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/010_ti_lesson_activities.sql'), 'utf8');
    await sequelize.query(sql);
    console.log('schema ready');

    const summary = await activityPack.rebuildAll();
    console.log(
      `built ${summary.built}/${summary.lessons} packs; ${summary.lessons_with_cognates} lessons carry a Tagalog cognate bridge`
    );
    process.exit(0);
  } catch (err) {
    console.error('build failed:', err.message);
    process.exit(1);
  }
})();
