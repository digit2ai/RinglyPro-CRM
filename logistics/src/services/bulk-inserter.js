'use strict';

/**
 * Shared bulk insert engine — used by both Generate Demo and Upload routes.
 * Uses raw SQL multi-value INSERT with parallel chunk execution for maximum throughput.
 *
 * @param {Sequelize} sequelize  - Sequelize instance
 * @param {string}    tableName  - Target table (e.g. 'logistics_item_master')
 * @param {string[]}  columns    - Column names (WITHOUT project_id, created_at, updated_at)
 * @param {Array[]}   rows       - Array of value-arrays, one per row, in column order
 * @param {object}    options
 * @param {number}    options.projectId  - Prepended to every row
 * @param {number}    options.chunkSize  - Rows per INSERT (default 5000)
 * @param {number}    options.concurrency - Parallel INSERT statements (default 4)
 * @param {string}    options.label      - Log prefix (e.g. '[DEMO]')
 * @returns {{ inserted: number, elapsed_ms: number }}
 */
async function bulkInsert(sequelize, tableName, columns, rows, options = {}) {
  const startTime = Date.now();
  const chunkSize = options.chunkSize || 5000;
  const concurrency = options.concurrency || 4;
  const label = options.label || '[BULK]';
  const projectId = options.projectId;
  const now = new Date().toISOString();

  // Full column list includes project_id + user columns + timestamps
  const allCols = ['project_id', ...columns, 'created_at', 'updated_at'];
  const colList = allCols.map(c => `"${c}"`).join(',');

  const totalChunks = Math.ceil(rows.length / chunkSize);
  let inserted = 0;

  // Build all chunk SQL strings first
  const chunks = [];
  for (let ci = 0; ci < rows.length; ci += chunkSize) {
    const chunk = rows.slice(ci, ci + chunkSize);
    const valueParts = [];

    for (const row of chunk) {
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
    }

    chunks.push({ sql: `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`, count: chunk.length });
  }

  // Execute chunks in parallel batches
  for (let ci = 0; ci < chunks.length; ci += concurrency) {
    const batch = chunks.slice(ci, ci + concurrency);
    await Promise.all(batch.map(c => sequelize.query(c.sql)));
    inserted += batch.reduce((s, c) => s + c.count, 0);

    const batchEnd = Math.min(ci + concurrency, chunks.length);
    if (batchEnd % 10 === 0 || batchEnd === chunks.length) {
      console.log(`${label} ${tableName}: ${batchEnd}/${totalChunks} chunks (${inserted}/${rows.length} rows, ${Date.now() - startTime}ms)`);
    }
  }

  const elapsed_ms = Date.now() - startTime;
  console.log(`${label} ${tableName}: done — ${inserted} rows in ${elapsed_ms}ms (${totalChunks} chunks, concurrency=${concurrency})`);
  return { inserted, elapsed_ms };
}

/**
 * Streaming variant — accepts a generator/iterator instead of a full array.
 * This avoids building huge arrays in memory (e.g. 637K goods_out lines).
 * Uses parallel execution: builds N chunks then fires them concurrently.
 *
 * @param {Sequelize}  sequelize
 * @param {string}     tableName
 * @param {string[]}   columns
 * @param {Function}   generatorFn  - function*() => yields value-arrays
 * @param {number}     totalEstimate - approximate total for logging
 * @param {object}     options       - same as bulkInsert
 * @returns {{ inserted: number, elapsed_ms: number }}
 */
async function bulkInsertStreaming(sequelize, tableName, columns, generatorFn, totalEstimate, options = {}) {
  const startTime = Date.now();
  const chunkSize = options.chunkSize || 5000;
  const concurrency = options.concurrency || 4;
  const label = options.label || '[BULK]';
  const projectId = options.projectId;
  const now = new Date().toISOString();

  const allCols = ['project_id', ...columns, 'created_at', 'updated_at'];
  const colList = allCols.map(c => `"${c}"`).join(',');

  let inserted = 0;
  let chunkNum = 0;
  let valueParts = [];
  let pendingChunks = [];

  async function flushPending() {
    if (pendingChunks.length === 0) return;
    await Promise.all(pendingChunks.map(c => sequelize.query(c.sql)));
    inserted += pendingChunks.reduce((s, c) => s + c.count, 0);
    pendingChunks = [];
  }

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
      pendingChunks.push({
        sql: `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`,
        count: valueParts.length
      });
      valueParts = [];

      // Fire when we have enough parallel chunks
      if (pendingChunks.length >= concurrency) {
        await flushPending();

        if (chunkNum % 10 === 0) {
          const pct = totalEstimate > 0 ? ((inserted / totalEstimate) * 100).toFixed(1) : '?';
          console.log(`${label} ${tableName}: chunk ${chunkNum} — ${inserted} rows (${pct}%, ${Date.now() - startTime}ms)`);
        }
      }
    }
  }

  // Flush remainder
  if (valueParts.length > 0) {
    chunkNum++;
    pendingChunks.push({
      sql: `INSERT INTO ${tableName} (${colList}) VALUES ${valueParts.join(',')}`,
      count: valueParts.length
    });
  }
  await flushPending();

  const elapsed_ms = Date.now() - startTime;
  console.log(`${label} ${tableName}: done — ${inserted} rows in ${chunkNum} chunks (${elapsed_ms}ms, concurrency=${concurrency})`);
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
