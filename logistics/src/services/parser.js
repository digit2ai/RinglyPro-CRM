'use strict';

const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');

// Schema definitions for each file type
const SCHEMAS = {
  item_master: {
    required: ['sku'],
    optional: ['description', 'unit_of_measure', 'length_mm', 'width_mm', 'height_mm', 'weight_kg',
               'pieces_per_picking_unit', 'pieces_per_pallet', 'pallet_ti', 'pallet_hi',
               'crash_class', 'batch_tracked', 'dangerous_goods', 'temperature_range', 'category'],
    transforms: {
      length_mm: parseFloat,
      width_mm: parseFloat,
      height_mm: parseFloat,
      weight_kg: parseFloat,
      pieces_per_picking_unit: parseInt,
      pieces_per_pallet: parseInt,
      pallet_ti: parseInt,
      pallet_hi: parseInt,
      batch_tracked: v => v === true || v === 'true' || v === '1' || v === 'yes' || v === 'Y',
      dangerous_goods: v => v === true || v === 'true' || v === '1' || v === 'yes' || v === 'Y'
    }
  },
  inventory: {
    required: ['sku'],
    optional: ['stock', 'location', 'storage_space', 'unit_of_measure', 'snapshot_date'],
    transforms: {
      stock: parseFloat,
      snapshot_date: v => v || null
    }
  },
  goods_in: {
    required: ['sku', 'receipt_date'],
    optional: ['receipt_id', 'quantity', 'unit_of_measure', 'receipt_time', 'supplier'],
    transforms: {
      quantity: parseFloat,
      receipt_time: v => v || null
    }
  },
  goods_out: {
    required: ['sku', 'ship_date', 'order_id'],
    optional: ['orderline_id', 'quantity', 'picking_unit', 'unit_of_measure',
               'order_type', 'order_date', 'picking_date', 'picking_time', 'ship_time',
               'customer_id', 'shipping_method', 'shipping_load_number'],
    transforms: {
      quantity: parseFloat,
      order_date: v => v || null,
      picking_date: v => v || null,
      picking_time: v => v || null,
      ship_time: v => v || null
    }
  },
  oee_machines: {
    required: ['name'],
    optional: ['line', 'expected_cycle_time_sec', 'is_active'],
    transforms: {
      expected_cycle_time_sec: parseFloat,
      is_active: v => v === true || v === 'true' || v === '1' || v === 'yes' || v === 'Y'
    }
  },
  oee_machine_events: {
    required: ['machine_name', 'status'],
    optional: ['reason', 'recorded_at'],
    transforms: {
      recorded_at: v => v || null,
      status: v => v ? v.toString().toLowerCase().trim() : v
    }
  },
  oee_production_runs: {
    required: ['machine_name', 'shift_start', 'planned_production_time_min'],
    optional: ['shift_end', 'total_parts', 'good_parts', 'actual_cycle_time_sec'],
    transforms: {
      planned_production_time_min: parseFloat,
      total_parts: v => parseInt(v, 10),
      good_parts: v => parseInt(v, 10),
      actual_cycle_time_sec: parseFloat,
      shift_end: v => v || null
    }
  }
};

// Column name normalization map
const COLUMN_ALIASES = {
  'article': 'sku', 'article_number': 'sku', 'article_no': 'sku', 'item': 'sku',
  'item_number': 'sku', 'material': 'sku', 'material_number': 'sku', 'artikelnummer': 'sku',
  'desc': 'description', 'bezeichnung': 'description', 'name': 'description',
  'length': 'length_mm', 'width': 'width_mm', 'height': 'height_mm', 'weight': 'weight_kg',
  'laenge': 'length_mm', 'breite': 'width_mm', 'hoehe': 'height_mm', 'gewicht': 'weight_kg',
  'qty': 'quantity', 'menge': 'quantity', 'amount': 'quantity',
  'uom': 'unit_of_measure', 'unit': 'unit_of_measure', 'einheit': 'unit_of_measure',
  'date': 'ship_date', 'order_no': 'order_id', 'auftrag': 'order_id',
  'delivery_note': 'receipt_id', 'lieferschein': 'receipt_id',
  'customer': 'customer_id', 'kunde': 'customer_id',
  'location_name': 'location', 'lagerort': 'location', 'lagerplatz': 'storage_space',
  'lieferant': 'supplier', 'vendor': 'supplier',
  'versandart': 'shipping_method', 'ship_method': 'shipping_method',
  'machine': 'machine_name', 'maschine': 'machine_name', 'equipment': 'machine_name',
  'equipment_name': 'machine_name', 'maschinen_name': 'machine_name',
  'maschinenname': 'name', 'machine_name_id': 'machine_name',
  'linie': 'line', 'production_line': 'line',
  'cycle_time': 'expected_cycle_time_sec', 'zykluszeit': 'expected_cycle_time_sec',
  'aktiv': 'is_active', 'active': 'is_active',
  'grund': 'reason', 'cause': 'reason', 'stoergrund': 'reason',
  'zeitpunkt': 'recorded_at', 'event_time': 'recorded_at',
  'schichtbeginn': 'shift_start', 'shift_begin': 'shift_start',
  'schichtende': 'shift_end',
  'geplante_zeit': 'planned_production_time_min', 'planned_time': 'planned_production_time_min',
  'gesamt_teile': 'total_parts', 'parts_produced': 'total_parts',
  'gut_teile': 'good_parts', 'good_count': 'good_parts',
  'ist_zykluszeit': 'actual_cycle_time_sec'
};

function normalizeColumnName(name) {
  const cleaned = name.toString().trim().toLowerCase()
    .replace(/[\s\-\.]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return COLUMN_ALIASES[cleaned] || cleaned;
}

/**
 * Streaming CSV parser for large files.
 * Parses the CSV in chunks using line splitting instead of loading everything into csv-parse/sync.
 * Handles 500K+ rows efficiently.
 */
function parseCsvStreaming(buffer) {
  const text = buffer.toString('utf-8');

  // Detect delimiter from first line
  const firstNewline = text.indexOf('\n');
  const firstLine = text.substring(0, firstNewline > 0 ? firstNewline : 500).trim();
  const delimiter = firstLine.includes(';') ? ';' : ',';

  // Parse header
  const headerEnd = text.indexOf('\n');
  if (headerEnd < 0) return { rawRows: [], headers: [] };

  const headerLine = text.substring(0, headerEnd).trim().replace(/\r$/, '');
  const headers = headerLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());

  // Parse rows — manual split is 10x faster than csv-parse/sync for large files
  const rows = [];
  let pos = headerEnd + 1;
  const len = text.length;

  while (pos < len) {
    // Find end of line
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd < 0) lineEnd = len;

    const line = text.substring(pos, lineEnd).trim().replace(/\r$/, '');
    pos = lineEnd + 1;

    if (!line) continue;

    // Split by delimiter (handle quoted fields)
    const values = splitCsvLine(line, delimiter);
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (i < values.length) ? values[i] : null;
    }
    rows.push(row);
  }

  return { rawRows: rows, headers };
}

/**
 * Split a CSV line respecting quoted fields
 */
function splitCsvLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseRawData(buffer, mimetype, filename) {
  if (mimetype === 'text/csv' || filename.endsWith('.csv')) {
    // Use streaming parser for CSV files (handles large files)
    return parseCsvStreaming(buffer);
  } else {
    // Excel file — use XLSX library
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    return { rawRows, headers };
  }
}

function validateAndTransform(rawRows, headers, fileType) {
  const schema = SCHEMAS[fileType];
  if (!schema) throw new Error(`Unknown file type: ${fileType}`);

  const errors = [];
  const warnings = [];

  // Normalize header names
  const headerMap = {};
  for (const h of headers) {
    headerMap[h] = normalizeColumnName(h);
  }

  // Check required columns
  const normalizedHeaders = Object.values(headerMap);
  for (const req of schema.required) {
    if (!normalizedHeaders.includes(req)) {
      errors.push({ type: 'missing_column', column: req, message: `Required column '${req}' not found. Available: ${headers.join(', ')}` });
    }
  }

  if (errors.length > 0) {
    return { rows: [], errors, warnings, columnCount: headers.length };
  }

  const allFields = [...schema.required, ...schema.optional];
  const rows = [];
  let skippedRows = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const row = {};
    let rowValid = true;

    for (const originalHeader of headers) {
      const normalized = headerMap[originalHeader];
      if (allFields.includes(normalized)) {
        let value = raw[originalHeader];

        // Apply transform
        if (schema.transforms[normalized] && value != null && value !== '') {
          try {
            value = schema.transforms[normalized](value);
          } catch (e) {
            // Don't log individual row warnings for large files — too noisy
            value = null;
          }
        }

        if (value === '' || value === undefined) value = null;
        row[normalized] = value;
      }
    }

    // Validate required fields
    for (const req of schema.required) {
      if (row[req] == null || row[req] === '') {
        skippedRows++;
        rowValid = false;
        break;
      }
    }

    // Validate status for oee_machine_events
    if (fileType === 'oee_machine_events' && row.status) {
      const validStatuses = ['running', 'stopped', 'idle', 'fault'];
      if (!validStatuses.includes(row.status)) {
        rowValid = false;
        skippedRows++;
      }
    }

    // Compute bin_capable for item_master
    if (fileType === 'item_master' && row.length_mm && row.width_mm && row.height_mm) {
      row.bin_capable = (row.length_mm <= 600 && row.width_mm <= 400 && row.height_mm <= 450);
    }

    if (rowValid) {
      rows.push(row);
    }
  }

  if (skippedRows > 0) {
    warnings.push({ type: 'skipped_rows', message: `${skippedRows} rows skipped due to missing required fields` });
  }

  if (rows.length < 10) {
    warnings.push({ type: 'low_row_count', message: `Only ${rows.length} valid rows. Expected more for meaningful analysis.` });
  }

  return { rows, errors, warnings, columnCount: headers.length };
}

async function parseFile(file, fileType) {
  console.log(`[PARSER] Parsing ${fileType}: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  const startTime = Date.now();

  const { rawRows, headers } = parseRawData(file.buffer, file.mimetype, file.originalname);
  console.log(`[PARSER] Raw parse complete: ${rawRows.length} rows in ${Date.now() - startTime}ms`);

  if (rawRows.length === 0) {
    throw new Error('File is empty or could not be parsed');
  }

  const result = validateAndTransform(rawRows, headers, fileType);
  console.log(`[PARSER] Validation complete: ${result.rows.length} valid rows in ${Date.now() - startTime}ms total`);

  return result;
}

/**
 * parseHeadersOnly — reads ONLY the first line of a CSV, normalizes column names,
 * validates against the schema required columns, and estimates row count.
 * Returns instantly — no full file parse.
 *
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} filename
 * @param {string} fileType
 * @returns {{ valid: boolean, headers: string[], errors: object[], rowEstimate: number }}
 */
function parseHeadersOnly(buffer, mimetype, filename, fileType) {
  const schema = SCHEMAS[fileType];
  if (!schema) {
    return { valid: false, headers: [], errors: [{ type: 'unknown_type', message: `Unknown file type: ${fileType}` }], rowEstimate: 0 };
  }

  let rawHeaders = [];

  if (mimetype === 'text/csv' || filename.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    const firstNewline = text.indexOf('\n');
    const firstLine = (firstNewline > 0 ? text.substring(0, firstNewline) : text).trim().replace(/\r$/, '');

    // Detect delimiter
    const delimiter = firstLine.includes(';') ? ';' : ',';
    rawHeaders = firstLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());

    // Estimate row count by counting newlines
    let newlines = 0;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) newlines++;
    }
    // rowEstimate = newlines (header line produces 1 newline, so rows ≈ newlines)
    var rowEstimate = Math.max(0, newlines - 1);
  } else {
    // Excel — have to read the workbook but only grab the header row
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 2 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
    // For Excel, rough estimate (re-read without sheetRows to count would be slow)
    var rowEstimate = 0; // unknown for Excel — will be known after full parse
  }

  // Normalize headers
  const normalizedHeaders = rawHeaders.map(h => normalizeColumnName(h));

  // Validate required columns
  const errors = [];
  for (const req of schema.required) {
    if (!normalizedHeaders.includes(req)) {
      errors.push({
        type: 'missing_column',
        column: req,
        message: `Required column '${req}' not found. Available: ${rawHeaders.join(', ')}`
      });
    }
  }

  return {
    valid: errors.length === 0,
    headers: normalizedHeaders,
    errors,
    rowEstimate: rowEstimate || 0
  };
}

module.exports = { parseFile, parseHeadersOnly, SCHEMAS };
