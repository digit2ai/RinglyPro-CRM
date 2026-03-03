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
               'order_date', 'picking_date', 'picking_time', 'ship_time',
               'customer_id', 'shipping_method', 'shipping_load_number'],
    transforms: {
      quantity: parseFloat,
      order_date: v => v || null,
      picking_date: v => v || null,
      picking_time: v => v || null,
      ship_time: v => v || null
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
  'versandart': 'shipping_method', 'ship_method': 'shipping_method'
};

function normalizeColumnName(name) {
  const cleaned = name.toString().trim().toLowerCase()
    .replace(/[\s\-\.]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return COLUMN_ALIASES[cleaned] || cleaned;
}

function parseRawData(buffer, mimetype, filename) {
  let rawRows = [];
  let headers = [];

  if (mimetype === 'text/csv' || filename.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    // Detect delimiter
    const firstLine = text.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    rawRows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      trim: true,
      relax_column_count: true
    });

    if (rawRows.length > 0) {
      headers = Object.keys(rawRows[0]);
    }
  } else {
    // Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (rawRows.length > 0) {
      headers = Object.keys(rawRows[0]);
    }
  }

  return { rawRows, headers };
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
            warnings.push({ row: i + 2, column: normalized, message: `Transform failed: ${e.message}` });
            value = null;
          }
        }

        // Handle empty strings
        if (value === '' || value === undefined) value = null;

        row[normalized] = value;
      }
    }

    // Validate required fields have values
    for (const req of schema.required) {
      if (row[req] == null || row[req] === '') {
        errors.push({ row: i + 2, column: req, message: `Required field '${req}' is empty` });
        rowValid = false;
      }
    }

    // Compute bin_capable for item_master
    if (fileType === 'item_master' && row.length_mm && row.width_mm && row.height_mm) {
      const l = row.length_mm;
      const w = row.width_mm;
      const h = row.height_mm;
      // Check against GEBHARDT standard bin sizes (600x400 footprint)
      row.bin_capable = (l <= 600 && w <= 400 && h <= 450);
    }

    if (rowValid) {
      rows.push(row);
    }
  }

  // Plausibility warnings
  if (rows.length < 10) {
    warnings.push({ type: 'low_row_count', message: `Only ${rows.length} valid rows. Expected more for meaningful analysis.` });
  }

  if (fileType === 'goods_out' && rows.length > 0) {
    const dates = rows.filter(r => r.ship_date).map(r => new Date(r.ship_date));
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const daySpan = (maxDate - minDate) / (1000 * 60 * 60 * 24);
      if (daySpan < 30) {
        warnings.push({ type: 'short_date_range', message: `Data spans only ${Math.round(daySpan)} days. Recommend at least 3 months.` });
      }
    }
  }

  return { rows, errors, warnings, columnCount: headers.length };
}

async function parseFile(file, fileType) {
  const { rawRows, headers } = parseRawData(file.buffer, file.mimetype, file.originalname);

  if (rawRows.length === 0) {
    throw new Error('File is empty or could not be parsed');
  }

  return validateAndTransform(rawRows, headers, fileType);
}

module.exports = { parseFile, SCHEMAS };
