'use strict';

/**
 * Shared bulk insert engine — used by both Generate Demo and Upload routes.
 * Uses raw SQL multi-value INSERT for maximum throughput.
 *
 * @param {Sequelize} sequelize  - Sequelize instance
 * @param {string}    tableName  - Target table (e.g. 'logistics_item_master')
 * @param {string[]}  columns    - Column names (WITHOUT project_id, created_at, updated_at)
 * @param {Array[]}   rows       - Array of value-arrays, one per row, in column order
 * @param {object}    options
 * @param {number}    options.projectId  - Prepended to every row
 * @param {number}    options.chunkSize  - Rows per INSERT (default 2000)
 * @param {string}    options.label      - Log prefix (e.g. '[DEMO]')
 * @returns {{ inserted: number, elapsed_ms: number }}
 */
async function bulkInsert(sequelize, tableName, columns, rows, options = {}) {
  const startTime = Date.now();
  const chunkSize = options.chunkSize || 2000;
  const label = options.label || '[BULK]';
  const projectId = options.projectId;
  const now = new Date().toISOString();

  // Full column list includes project_id + user columns + timestamps
  const allCols = ['project_id', ...columns, 'created_at', 'updated_at'];
  const colList = allCols.map(c => `"${c}"`).join(',');

  const totalChunks = Math.ceil(rows.length / chunkSize);
  let inserted = 0;

  for (let ci = 0; ci < rows.length; ci += chunkSize) {
    const chunk = rows.slice(ci, ci + chunkSize);
    const valueParts = [];

    for (const row of chunk) {
      const vals = [
        projectId,                           // project_id
        ...row,                              // user-supplied values
        `'${now}'`,                          // created_at  (pre-quoted)
        `'${now}'`                           // updated_at  (pre-quoted)
      ];

      // Format each value for raw SQL
      const formatted = vals.map((v, i) => {
        // Timestamps are already quoted
        if (i === vals.length - 1 || i === vals.length - 2) return v;
        return sqlLiteral(v);
      });

      valueParts.push(`(${formatted.join(',')})`);
    }

    const sql = `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`;
    await sequelize.query(sql);
    inserted += chunk.length;

    const chunkNum = Math.floor(ci / chunkSize) + 1;
    if (chunkNum % 10 === 0 || chunkNum === totalChunks) {
      console.log(`${label} ${tableName}: chunk ${chunkNum}/${totalChunks} (${inserted}/${rows.length} rows, ${Date.now() - startTime}ms)`);
    }
  }

  const elapsed_ms = Date.now() - startTime;
  console.log(`${label} ${tableName}: done — ${inserted} rows in ${elapsed_ms}ms`);
  return { inserted, elapsed_ms };
}

/**
 * Streaming variant — accepts a generator/iterator instead of a full array.
 * This avoids building huge arrays in memory (e.g. 637K goods_out lines).
 *
 * @param {Sequelize}  sequelize
 * @param {string}     tableName
 * @param {string[]}   columns
 * @param {Function}   generatorFn  - function*(batchIndex) => yields value-arrays
 * @param {number}     totalEstimate - approximate total for logging
 * @param {object}     options       - same as bulkInsert
 * @returns {{ inserted: number, elapsed_ms: number }}
 */
async function bulkInsertStreaming(sequelize, tableName, columns, generatorFn, totalEstimate, options = {}) {
  const startTime = Date.now();
  const chunkSize = options.chunkSize || 2000;
  const label = options.label || '[BULK]';
  const projectId = options.projectId;
  const now = new Date().toISOString();

  const allCols = ['project_id', ...columns, 'created_at', 'updated_at'];
  const colList = allCols.map(c => `"${c}"`).join(',');

  let inserted = 0;
  let chunkNum = 0;
  let valueParts = [];

  for (const row of generatorFn()) {
    const vals = [
      projectId,
      ...row,
      `'${now}'`,
      `'${now}'`
    ];

    const formatted = vals.map((v, i) => {
      if (i === vals.length - 1 || i === vals.length - 2) return v;
      return sqlLiteral(v);
    });

    valueParts.push(`(${formatted.join(',')})`);

    if (valueParts.length >= chunkSize) {
      chunkNum++;
      const sql = `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`;
      await sequelize.query(sql);
      inserted += valueParts.length;
      valueParts = [];

      if (chunkNum % 10 === 0) {
        const pct = totalEstimate > 0 ? ((inserted / totalEstimate) * 100).toFixed(1) : '?';
        console.log(`${label} ${tableName}: chunk ${chunkNum} — ${inserted} rows (${pct}%, ${Date.now() - startTime}ms)`);
      }
    }
  }

  // Flush remainder
  if (valueParts.length > 0) {
    chunkNum++;
    const sql = `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`;
    await sequelize.query(sql);
    inserted += valueParts.length;
  }

  const elapsed_ms = Date.now() - startTime;
  console.log(`${label} ${tableName}: done — ${inserted} rows in ${chunkNum} chunks (${elapsed_ms}ms)`);
  return { inserted, elapsed_ms };
}

/**
 * Convert a JS value to a safe SQL literal string.
 */
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  // String — escape single quotes
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

module.exports = { bulkInsert, bulkInsertStreaming, sqlLiteral };
