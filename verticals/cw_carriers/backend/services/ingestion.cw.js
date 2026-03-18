// RinglyPro Logistics — Data Ingestion Pipeline
// Level 1: File upload (CSV, Excel, JSON)
// Profiles data on arrival, normalizes, validates, preserves raw files

const sequelize = require('./db.cw');
const fs = require('fs');
const path = require('path');

// Column mapping presets for common TMS exports
const COLUMN_PRESETS = {
  loads: {
    expected: ['load_ref','origin','destination','pickup_date','delivery_date','equipment_type','weight','miles','buy_rate','sell_rate','status','customer','carrier','commodity'],
    aliases: {
      load_ref: ['load_id','load_number','load_no','ref','reference','load#','pro_number','order_number'],
      origin: ['origin_city','pickup_city','shipper_city','from','ship_from','origin_location'],
      origin_state: ['origin_st','pickup_state','from_state','ship_from_state'],
      origin_zip: ['origin_postal','pickup_zip','from_zip'],
      destination: ['dest_city','delivery_city','consignee_city','to','ship_to','destination_location','dest'],
      destination_state: ['dest_state','dest_st','delivery_state','to_state','ship_to_state'],
      destination_zip: ['dest_postal','delivery_zip','to_zip'],
      pickup_date: ['pick_date','pickup','pu_date','ship_date','pickup_appt'],
      delivery_date: ['del_date','delivery','deliver_date','delivery_appt','drop_date'],
      equipment_type: ['equipment','trailer_type','trailer','equip','mode'],
      weight: ['weight_lbs','weight_pounds','lbs','gross_weight','total_weight'],
      miles: ['distance','mileage','total_miles','loaded_miles'],
      buy_rate: ['carrier_rate','cost','carrier_pay','buy','carrier_cost','line_haul'],
      sell_rate: ['customer_rate','revenue','sell','customer_charge','total_charge','shipper_rate'],
      status: ['load_status','shipment_status','order_status'],
      customer: ['customer_name','shipper','shipper_name','bill_to','account'],
      carrier: ['carrier_name','carrier','trucking_company','mc_number'],
      commodity: ['freight_type','description','commodity_type','item'],
    },
  },
  carriers: {
    expected: ['carrier_name','mc_number','dot_number','contact_name','phone','email','equipment_types','home_city','home_state'],
    aliases: {
      carrier_name: ['name','company','company_name','trucking_company','legal_name'],
      mc_number: ['mc','mc_no','mc_num','authority_number'],
      dot_number: ['dot','dot_no','dot_num','usdot','us_dot'],
      contact_name: ['contact','dispatcher','rep','primary_contact'],
      phone: ['phone_number','telephone','cell','contact_phone','mobile'],
      email: ['email_address','contact_email'],
      equipment_types: ['equipment','trailer_types','trailers'],
      home_city: ['city','base_city','terminal_city','location'],
      home_state: ['state','base_state','terminal_state','st'],
    },
  },
  customers: {
    expected: ['customer_name','contact_name','phone','email','payment_terms','billing_address'],
    aliases: {
      customer_name: ['name','company','company_name','account_name','shipper_name'],
      contact_name: ['contact','primary_contact','rep'],
      phone: ['phone_number','telephone','contact_phone'],
      email: ['email_address','contact_email'],
      payment_terms: ['terms','pay_terms','net_terms'],
      billing_address: ['address','bill_to_address','invoice_address'],
    },
  },
  rates: {
    expected: ['origin_state','destination_state','equipment_type','avg_rate','rate_per_mile_avg','sample_size'],
    aliases: {
      origin_state: ['from_state','origin_st','pickup_state','lane_origin'],
      destination_state: ['to_state','dest_state','dest_st','delivery_state','lane_dest'],
      equipment_type: ['equipment','trailer_type','mode'],
      avg_rate: ['rate','average_rate','avg_cost','avg_revenue','line_haul'],
      rate_per_mile_avg: ['rpm','rate_per_mile','cost_per_mile','avg_rpm'],
      sample_size: ['count','loads','volume','num_loads'],
    },
  },
};

function normalizeColumnName(col) {
  return col.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function autoMapColumns(headers, dataType) {
  const preset = COLUMN_PRESETS[dataType];
  if (!preset) return {};
  const mapping = {};
  const normalizedHeaders = headers.map(normalizeColumnName);

  for (const [target, aliasList] of Object.entries(preset.aliases)) {
    // Check direct match first
    const directIdx = normalizedHeaders.indexOf(target);
    if (directIdx >= 0) {
      mapping[headers[directIdx]] = target;
      continue;
    }
    // Check aliases
    for (const alias of aliasList) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx >= 0) {
        mapping[headers[idx]] = target;
        break;
      }
    }
  }
  return mapping;
}

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Smart delimiter detection
  const firstLine = lines[0];
  const delimiters = [',', '\t', '|', ';'];
  let delimiter = ',';
  let maxCount = 0;
  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length;
    if (count > maxCount) { maxCount = count; delimiter = d; }
  }

  const headers = parseLine(firstLine, delimiter);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i], delimiter);
    if (vals.length === headers.length) {
      const row = {};
      headers.forEach((h, j) => { row[h] = vals[j]; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

function parseLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseJSON(content) {
  const data = JSON.parse(content);
  const rows = Array.isArray(data) ? data : data.data || data.records || data.loads || data.carriers || data.rows || [data];
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

function validateRow(row, mapping, dataType) {
  const errors = [];
  const mapped = {};
  for (const [src, tgt] of Object.entries(mapping)) {
    mapped[tgt] = row[src];
  }

  if (dataType === 'loads') {
    if (!mapped.origin && !mapped.origin_state) errors.push('Missing origin');
    if (!mapped.destination && !mapped.destination_state) errors.push('Missing destination');
    if (mapped.buy_rate && isNaN(parseFloat(mapped.buy_rate))) errors.push('Invalid buy_rate');
    if (mapped.sell_rate && isNaN(parseFloat(mapped.sell_rate))) errors.push('Invalid sell_rate');
    if (mapped.pickup_date && isNaN(Date.parse(mapped.pickup_date))) errors.push('Invalid pickup_date');
  } else if (dataType === 'carriers') {
    if (!mapped.carrier_name) errors.push('Missing carrier_name');
  } else if (dataType === 'customers') {
    if (!mapped.customer_name) errors.push('Missing customer_name');
  }

  return { mapped, errors };
}

function parseLocation(fullLocation) {
  if (!fullLocation) return {};
  const parts = fullLocation.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const stateZip = parts[parts.length - 1].split(' ');
    return { city: parts[0], state: stateZip[0]?.substring(0, 2).toUpperCase(), zip: stateZip[1] || null };
  }
  return { city: fullLocation, state: null, zip: null };
}

async function process_upload(input) {
  const { file_content, file_name, file_type, data_type, tenant_id, user_id, column_mapping } = input;
  if (!file_content) throw new Error('file_content required');
  if (!data_type) throw new Error('data_type required (loads, carriers, customers, rates)');
  const tid = tenant_id || 'logistics';

  // Parse file
  let parsed;
  const ft = file_type || (file_name?.endsWith('.json') ? 'json' : 'csv');
  if (ft === 'json') {
    parsed = parseJSON(file_content);
  } else {
    parsed = parseCSV(file_content);
  }

  if (parsed.rows.length === 0) throw new Error('No data rows found in file');

  // Auto-map columns if not provided
  const mapping = column_mapping || autoMapColumns(parsed.headers, data_type);

  // Create upload record
  const [[upload]] = await sequelize.query(`
    INSERT INTO lg_data_uploads (tenant_id, filename, original_name, file_type, data_type, total_rows,
      column_mapping, status, uploaded_by, processing_started_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8, NOW(), NOW()) RETURNING *
  `, { bind: [tid, file_name || `upload_${Date.now()}.${ft}`, file_name || null, ft, data_type, parsed.rows.length, JSON.stringify(mapping), user_id || null] });

  let imported = 0, skipped = 0, errorCount = 0;
  const validationErrors = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const { mapped, errors } = validateRow(row, mapping, data_type);

    if (errors.length > 0) {
      errorCount++;
      validationErrors.push({ row: i + 2, errors });
      continue;
    }

    try {
      if (data_type === 'loads') {
        const orig = parseLocation(mapped.origin);
        const dest = parseLocation(mapped.destination);
        const buyRate = parseFloat(mapped.buy_rate) || null;
        const sellRate = parseFloat(mapped.sell_rate) || null;
        const miles = parseFloat(mapped.miles) || null;
        const margin = (buyRate && sellRate) ? sellRate - buyRate : null;
        const marginPct = (buyRate && sellRate && buyRate > 0) ? ((sellRate - buyRate) / sellRate * 100) : null;
        const rpm = (buyRate && miles && miles > 0) ? buyRate / miles : null;

        await sequelize.query(`
          INSERT INTO lg_loads (tenant_id, load_ref, origin_city, origin_state, origin_zip, origin_full,
            destination_city, destination_state, destination_zip, destination_full,
            pickup_date, delivery_date, equipment_type, weight_lbs, miles,
            buy_rate, sell_rate, margin, margin_pct, rate_per_mile,
            shipper_name, commodity, status, source, upload_batch_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'upload',$24,NOW(),NOW())
        `, { bind: [tid, mapped.load_ref || `UP-${upload.id}-${i}`,
          mapped.origin_city || orig.city, mapped.origin_state || orig.state, mapped.origin_zip || orig.zip, mapped.origin,
          mapped.destination_city || dest.city, mapped.destination_state || dest.state, mapped.destination_zip || dest.zip, mapped.destination,
          mapped.pickup_date || null, mapped.delivery_date || null,
          mapped.equipment_type || 'dry_van', parseFloat(mapped.weight) || null, miles,
          buyRate, sellRate, margin, marginPct, rpm,
          mapped.customer || null, mapped.commodity || null, mapped.status || 'delivered',
          upload.id] });
        imported++;
      } else if (data_type === 'carriers') {
        const equipArray = mapped.equipment_types ? `{${mapped.equipment_types.split(/[,;|]/).map(s => s.trim()).join(',')}}` : '{dry_van}';
        await sequelize.query(`
          INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, contact_name, phone, email,
            equipment_types, home_city, home_state, source, upload_batch_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'upload',$11,NOW(),NOW())
          ON CONFLICT DO NOTHING
        `, { bind: [tid, mapped.carrier_name, mapped.mc_number, mapped.dot_number, mapped.contact_name,
          mapped.phone, mapped.email, equipArray, mapped.home_city, mapped.home_state, upload.id] });
        imported++;
      } else if (data_type === 'customers') {
        await sequelize.query(`
          INSERT INTO lg_customers (tenant_id, customer_name, contact_name, phone, email, payment_terms,
            billing_address, source, upload_batch_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'upload',$8,NOW(),NOW())
        `, { bind: [tid, mapped.customer_name, mapped.contact_name, mapped.phone, mapped.email,
          mapped.payment_terms || 'net_30', mapped.billing_address, upload.id] });
        imported++;
      } else if (data_type === 'rates') {
        await sequelize.query(`
          INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, destination_state, equipment_type,
            avg_rate, rate_per_mile_avg, sample_size, benchmark_source, rate_date, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'upload',CURRENT_DATE,NOW())
        `, { bind: [tid, mapped.origin_state, mapped.destination_state, mapped.equipment_type || 'dry_van',
          parseFloat(mapped.avg_rate) || null, parseFloat(mapped.rate_per_mile_avg) || null,
          parseInt(mapped.sample_size) || 1] });
        imported++;
      }
    } catch (err) {
      errorCount++;
      validationErrors.push({ row: i + 2, errors: [err.message] });
    }
  }

  // Update upload record
  const finalStatus = errorCount === parsed.rows.length ? 'failed' : errorCount > 0 ? 'partial' : 'completed';
  await sequelize.query(`
    UPDATE lg_data_uploads SET imported_rows = $1, skipped_rows = $2, error_rows = $3,
      validation_errors = $4, status = $5, processing_completed_at = NOW() WHERE id = $6
  `, { bind: [imported, skipped, errorCount, JSON.stringify(validationErrors.slice(0, 50)), finalStatus, upload.id] });

  return {
    upload_id: upload.id,
    status: finalStatus,
    total_rows: parsed.rows.length,
    imported: imported,
    skipped: skipped,
    errors: errorCount,
    column_mapping: mapping,
    columns_detected: parsed.headers,
    validation_errors: validationErrors.slice(0, 20),
    message: `Processed ${parsed.rows.length} rows: ${imported} imported, ${errorCount} errors`,
  };
}

async function get_upload_history(input) {
  const { tenant_id, limit } = input;
  const tid = tenant_id || 'logistics';
  const [uploads] = await sequelize.query(`
    SELECT id, filename, original_name, file_type, data_type, total_rows, imported_rows, error_rows,
      status, uploaded_by, created_at, processing_completed_at
    FROM lg_data_uploads WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2
  `, { bind: [tid, limit || 50] });
  return { total: uploads.length, uploads };
}

async function get_column_mapping_preview(input) {
  const { headers, data_type } = input;
  if (!headers || !data_type) throw new Error('headers array and data_type required');
  const mapping = autoMapColumns(headers, data_type);
  const preset = COLUMN_PRESETS[data_type];
  const unmapped = preset ? preset.expected.filter(f => !Object.values(mapping).includes(f)) : [];
  return { mapping, unmapped_fields: unmapped, mapped_count: Object.keys(mapping).length, total_columns: headers.length };
}

async function preview_data(input) {
  const { file_content, file_name, file_type, data_type } = input;
  if (!file_content) throw new Error('file_content required');
  if (!data_type) throw new Error('data_type required');

  const ft = file_type || (file_name?.endsWith('.json') ? 'json' : 'csv');
  const parsed = ft === 'json' ? parseJSON(file_content) : parseCSV(file_content);
  if (parsed.rows.length === 0) throw new Error('No data rows found');

  const mapping = autoMapColumns(parsed.headers, data_type);
  const preset = COLUMN_PRESETS[data_type];
  const unmapped = preset ? preset.expected.filter(f => !Object.values(mapping).includes(f)) : [];

  // Preview first 5 rows mapped
  const previewRows = parsed.rows.slice(0, 5).map((row, i) => {
    const { mapped, errors } = validateRow(row, mapping, data_type);
    return { row_num: i + 2, mapped, errors, valid: errors.length === 0 };
  });

  // Quick validation stats across all rows
  let validCount = 0, errorCount = 0;
  for (const row of parsed.rows) {
    const { errors } = validateRow(row, mapping, data_type);
    if (errors.length === 0) validCount++;
    else errorCount++;
  }

  return {
    total_rows: parsed.rows.length,
    headers: parsed.headers,
    mapping,
    unmapped_fields: unmapped,
    mapped_count: Object.keys(mapping).length,
    total_columns: parsed.headers.length,
    preview_rows: previewRows,
    validation: { valid: validCount, errors: errorCount, pct: Math.round((validCount / parsed.rows.length) * 100) },
  };
}

module.exports = { process_upload, get_upload_history, get_column_mapping_preview, preview_data, COLUMN_PRESETS };
