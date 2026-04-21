'use strict';

/**
 * Actuals CSV Ingester - SurgicalMind AI
 *
 * Parses uploaded CSV files with actual surgical volumes and ingests them
 * into intuitive_plan_actuals for proforma variance tracking.
 *
 * Expected CSV columns: surgeon_name, procedure_type, period_start, period_end, cases
 *
 * Copyright 2026 Digit2AI / RinglyPro CRM
 */

const db = require('../../models');
const { matchSurgeonByName } = require('./surgeon-registry');

const PlanActual = db.IntuitivePlanActual;

// ---------------------------------------------------------------------------
// Parse a CSV buffer into structured rows
// ---------------------------------------------------------------------------

async function parseCsvBuffer(buffer) {
  let parse;
  try {
    parse = require('csv-parse/sync').parse;
  } catch (_e) {
    try {
      // Fallback: csv-parse may export differently
      const csvParse = require('csv-parse');
      parse = csvParse.parse
        ? (input, opts) => {
            return new Promise((resolve, reject) => {
              csvParse.parse(input, opts, (err, records) => {
                if (err) reject(err);
                else resolve(records);
              });
            });
          }
        : null;
      if (!parse) throw new Error('csv-parse not available');
    } catch (_e2) {
      throw new Error('csv-parse package is not installed. Run: npm install csv-parse');
    }
  }

  const input = Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : String(buffer);

  const records = typeof parse === 'function'
    ? await Promise.resolve(parse(input, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        cast: (value, context) => {
          if (context.column === 'cases') {
            const num = parseInt(value, 10);
            return isNaN(num) ? value : num;
          }
          return value;
        }
      }))
    : [];

  // Validate required columns
  if (records.length > 0) {
    const requiredCols = ['surgeon_name', 'procedure_type', 'period_start', 'period_end', 'cases'];
    const presentCols = Object.keys(records[0]);
    const missing = requiredCols.filter(c => !presentCols.includes(c));
    if (missing.length > 0) {
      throw new Error(`CSV is missing required columns: ${missing.join(', ')}. Found: ${presentCols.join(', ')}`);
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Ingest CSV into intuitive_plan_actuals
// ---------------------------------------------------------------------------

async function ingestCsv(projectId, csvBuffer, importedBy) {
  const result = { inserted: 0, skipped: 0, errors: [], unmatched: [] };

  try {
    const rows = await parseCsvBuffer(csvBuffer);

    if (rows.length === 0) {
      result.errors.push('CSV file is empty or has no data rows');
      return result;
    }

    // Group rows by period to create one PlanActual per period
    const periodMap = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for 1-indexed and header row

      // Validate row
      if (!row.surgeon_name || !row.surgeon_name.trim()) {
        result.errors.push(`Row ${rowNum}: missing surgeon_name`);
        result.skipped++;
        continue;
      }
      if (!row.period_start || !row.period_end) {
        result.errors.push(`Row ${rowNum}: missing period_start or period_end`);
        result.skipped++;
        continue;
      }

      const cases = typeof row.cases === 'number' ? row.cases : parseInt(row.cases, 10);
      if (isNaN(cases) || cases < 0) {
        result.errors.push(`Row ${rowNum}: invalid cases value "${row.cases}"`);
        result.skipped++;
        continue;
      }

      // Validate date formats (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(row.period_start) || !dateRegex.test(row.period_end)) {
        result.errors.push(`Row ${rowNum}: dates must be YYYY-MM-DD format`);
        result.skipped++;
        continue;
      }

      // Fuzzy-match surgeon
      const match = await matchSurgeonByName(projectId, row.surgeon_name.trim());

      if (!match.surgeon) {
        result.unmatched.push({
          row: rowNum,
          surgeon_name: row.surgeon_name.trim(),
          procedure_type: row.procedure_type || '',
          cases
        });
        // Still include the data with the raw name
      }

      const periodKey = `${row.period_start}__${row.period_end}`;
      if (!periodMap[periodKey]) {
        periodMap[periodKey] = {
          period_start: row.period_start,
          period_end: row.period_end,
          surgeon_actuals: []
        };
      }

      periodMap[periodKey].surgeon_actuals.push({
        surgeon_name: match.surgeon ? match.surgeon.full_name : row.surgeon_name.trim(),
        surgeon_id: match.surgeon ? match.surgeon.id : null,
        match_confidence: match.confidence || 0,
        procedure_type: (row.procedure_type || '').trim(),
        actual_cases: cases,
        projected_cases: null, // To be filled by proforma comparison
        variance: null,
        variance_pct: null
      });
    }

    // Find the active business plan for this project (most recent)
    const BusinessPlan = db.IntuitiveBusinessPlan;
    let businessPlan = null;
    if (BusinessPlan) {
      try {
        businessPlan = await BusinessPlan.findOne({
          where: { project_id: projectId },
          order: [['created_at', 'DESC']]
        });
      } catch (_e) {
        // Business plan lookup is optional
      }
    }

    if (!businessPlan) {
      result.errors.push('No business plan found for this project. Records saved without business_plan_id linkage.');
    }

    // Insert one PlanActual per period
    for (const periodKey of Object.keys(periodMap)) {
      const period = periodMap[periodKey];

      try {
        const totalActual = period.surgeon_actuals.reduce((sum, s) => sum + s.actual_cases, 0);

        // Generate a readable period label
        const startDate = new Date(period.period_start);
        const endDate = new Date(period.period_end);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const periodLabel = startDate.getMonth() === endDate.getMonth()
          ? `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`
          : `${monthNames[startDate.getMonth()]} - ${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`;

        await PlanActual.create({
          business_plan_id: businessPlan ? businessPlan.id : null,
          period_start: period.period_start,
          period_end: period.period_end,
          period_label: periodLabel,
          surgeon_actuals: period.surgeon_actuals,
          total_actual_cases: totalActual,
          total_projected_cases: 0,
          total_variance: 0,
          variance_pct: 0,
          imported_by: importedBy || 'csv_upload',
          import_source: 'report_upload',
          notes: `CSV import: ${period.surgeon_actuals.length} surgeon entries`
        });

        result.inserted += period.surgeon_actuals.length;
      } catch (insertErr) {
        result.errors.push(`Period ${periodKey}: ${insertErr.message}`);
        result.skipped += period.surgeon_actuals.length;
      }
    }

    return result;
  } catch (err) {
    console.error('[ActualsCsvIngester] ingestCsv error:', err.message || err);
    result.errors.push(err.message || String(err));
    return result;
  }
}

// ---------------------------------------------------------------------------
// Generate a CSV template with headers and example rows
// ---------------------------------------------------------------------------

function generateTemplate() {
  const lines = [
    'surgeon_name,procedure_type,period_start,period_end,cases',
    'Dr. Jane Smith,Radical Prostatectomy,2026-01-01,2026-01-31,12',
    'Dr. John Doe,Hysterectomy,2026-01-01,2026-01-31,8'
  ];
  return lines.join('\n');
}

module.exports = {
  parseCsvBuffer,
  ingestCsv,
  generateTemplate
};
