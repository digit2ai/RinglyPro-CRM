/**
 * ImprintIQ — Data Ingestion Service
 * CSV parsing, fuzzy column mapping, and batch insert into iq_* tables
 * No external dependencies required
 */

const sequelize = require('./db.iq');

// ───── Schema Map: target_field → array of aliases ─────
const SCHEMA_MAP = {
  customers: {
    company_name: ['company', 'account', 'customer', 'client', 'business name', 'account name', 'org', 'company name'],
    contact_name: ['contact', 'name', 'primary contact', 'contact name', 'rep', 'full name', 'person'],
    contact_email: ['email', 'e-mail', 'contact email', 'primary email', 'mail'],
    contact_phone: ['phone', 'telephone', 'mobile', 'cell', 'contact phone', 'phone number'],
    industry: ['industry', 'vertical', 'sector', 'segment', 'market'],
    lifetime_value: ['ltv', 'lifetime', 'total revenue', 'ytd', 'total spent', 'revenue', 'sales', 'lifetime value'],
    last_order_date: ['last order', 'last invoice', 'last purchase', 'last activity', 'recent order', 'last order date'],
    address: ['address', 'street', 'street address', 'address line'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region', 'st'],
    zip: ['zip', 'postal', 'zipcode', 'zip code', 'postal code'],
    status: ['status', 'active', 'account status'],
    notes: ['notes', 'comments', 'memo', 'description']
  },
  quotes: {
    quote_number: ['quote', 'quote #', 'quote number', 'proposal', 'estimate', 'quote no', 'quote id'],
    customer_id: ['customer id', 'customer_id', 'client id', 'account id'],
    title: ['title', 'description', 'project', 'event', 'subject', 'project name'],
    total_amount: ['amount', 'total', 'value', 'price', 'subtotal', 'grand total', 'total amount'],
    margin_pct: ['margin', 'margin %', 'profit %', 'markup', 'margin pct'],
    stage: ['status', 'stage', 'state', 'outcome', 'quote status'],
    source: ['source', 'lead source', 'channel', 'origin'],
    created_at: ['date', 'created', 'quote date', 'sent date', 'created at', 'create date']
  },
  orders: {
    order_number: ['order', 'order #', 'order number', 'po', 'po #', 'purchase order', 'order no', 'order id'],
    customer_id: ['customer id', 'customer_id', 'client id', 'account id'],
    title: ['title', 'description', 'project', 'project name'],
    total_amount: ['amount', 'total', 'value', 'revenue', 'subtotal', 'total amount'],
    cost_total: ['cost', 'cogs', 'total cost', 'cost total'],
    margin_pct: ['margin', 'margin %', 'profit %', 'margin pct'],
    stage: ['status', 'stage', 'state', 'order status'],
    payment_status: ['payment', 'payment status', 'paid', 'invoiced', 'payment state'],
    created_at: ['date', 'order date', 'created', 'created at', 'create date']
  },
  calls: {
    direction: ['direction', 'type', 'inbound/outbound', 'call type', 'call direction'],
    phone_from: ['from', 'caller', 'phone from', 'caller id', 'from number'],
    phone_to: ['to', 'called', 'phone to', 'destination', 'to number'],
    duration_sec: ['duration', 'length', 'seconds', 'talk time', 'call length', 'duration sec'],
    outcome: ['outcome', 'result', 'status', 'disposition', 'call result'],
    agent_name: ['agent', 'rep', 'user', 'answered by', 'agent name', 'representative'],
    created_at: ['date', 'call date', 'time', 'timestamp', 'created at', 'call time']
  },
  invoices: {
    invoice_number: ['invoice', 'invoice #', 'invoice number', 'inv #', 'invoice no', 'invoice id'],
    customer_id: ['customer id', 'customer_id', 'client id', 'account id'],
    amount: ['amount', 'subtotal', 'net amount', 'net'],
    tax_amount: ['tax', 'tax amount', 'sales tax'],
    total_amount: ['total', 'grand total', 'invoice total', 'balance', 'total amount'],
    paid_amount: ['paid', 'payment', 'amount paid', 'received', 'paid amount'],
    status: ['status', 'state', 'paid/unpaid', 'invoice status'],
    due_date: ['due', 'due date', 'payment due'],
    created_at: ['date', 'invoice date', 'created', 'created at', 'create date']
  },
  products: {
    sku: ['sku', 'item number', 'item #', 'product code', 'code', 'item code'],
    name: ['name', 'product', 'product name', 'item', 'item name', 'description'],
    category: ['category', 'type', 'product type', 'group'],
    base_price: ['price', 'base price', 'unit price', 'sell price', 'retail'],
    cost: ['cost', 'unit cost', 'cogs', 'supplier cost'],
    brand: ['brand', 'manufacturer', 'vendor', 'supplier'],
    min_qty: ['min qty', 'minimum', 'moq', 'min order'],
    status: ['status', 'active', 'state']
  }
};

// ───── CSV Templates (header lines) ─────
const TEMPLATES = {
  customers: 'company_name,contact_name,contact_email,contact_phone,industry,lifetime_value,last_order_date,address,city,state,zip,status,notes',
  quotes: 'quote_number,title,total_amount,margin_pct,stage,source,created_at',
  orders: 'order_number,title,total_amount,cost_total,margin_pct,stage,payment_status,created_at',
  calls: 'direction,phone_from,phone_to,duration_sec,outcome,agent_name,created_at',
  invoices: 'invoice_number,amount,tax_amount,total_amount,paid_amount,status,due_date,created_at',
  products: 'sku,name,category,base_price,cost,brand,min_qty,status'
};

// ───── CSV Parser (no deps) ─────
function parseCSV(text, delimiter) {
  if (!text || !text.trim()) return [];

  // Auto-detect delimiter if not specified
  if (!delimiter) {
    const firstLine = text.split('\n')[0];
    if (firstLine.includes('\t')) delimiter = '\t';
    else delimiter = ',';
  }

  const lines = [];
  let current = '';
  let inQuotes = false;

  // Split preserving quoted newlines
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  // Parse header
  const headers = parseLine(lines[0], delimiter);

  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter);
    if (values.length === 0) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(obj);
  }

  return rows;
}

function parseLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ───── Fuzzy Column Matcher ─────
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function scoreMatch(csvHeader, alias) {
  const h = normalize(csvHeader);
  const a = normalize(alias);

  // Exact match
  if (h === a) return 100;

  // Contains match
  if (h.includes(a) || a.includes(h)) return 85;

  // Levenshtein distance normalized
  const maxLen = Math.max(h.length, a.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(h, a);
  const similarity = (1 - dist / maxLen) * 100;

  return similarity;
}

function mapColumns(csvHeaders, dataType) {
  const schema = SCHEMA_MAP[dataType];
  if (!schema) return { mapping: {}, unmapped: csvHeaders };

  const mapping = {};      // csvHeader → { field, confidence, source }
  const unmapped = [];
  const usedFields = new Set();

  for (const csvHeader of csvHeaders) {
    let bestField = null;
    let bestScore = 0;

    for (const [field, aliases] of Object.entries(schema)) {
      if (usedFields.has(field)) continue;
      for (const alias of aliases) {
        const score = scoreMatch(csvHeader, alias);
        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    }

    if (bestField && bestScore >= 50) {
      mapping[csvHeader] = {
        field: bestField,
        confidence: bestScore >= 80 ? 'high' : bestScore >= 65 ? 'medium' : 'low',
        score: Math.round(bestScore)
      };
      usedFields.add(bestField);
    } else {
      unmapped.push(csvHeader);
    }
  }

  return { mapping, unmapped };
}

// ───── Insert functions per type ─────
const INSERT_SQL = {
  customers: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_customers (${cols.join(', ')}) VALUES (${placeholders})`;
  },
  quotes: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_quotes (${cols.join(', ')}) VALUES (${placeholders})`;
  },
  orders: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_orders (${cols.join(', ')}) VALUES (${placeholders})`;
  },
  calls: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_calls (${cols.join(', ')}) VALUES (${placeholders})`;
  },
  invoices: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_invoices (${cols.join(', ')}) VALUES (${placeholders})`;
  },
  products: (fields) => {
    const cols = ['tenant_id', ...fields, 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO iq_products (${cols.join(', ')}) VALUES (${placeholders})`;
  }
};

// Tables that have updated_at vs those that don't
const HAS_UPDATED_AT = { customers: true, quotes: true, orders: true, invoices: true, products: true };

// Numeric fields that need parsing
const NUMERIC_FIELDS = new Set([
  'lifetime_value', 'total_amount', 'margin_pct', 'cost_total', 'amount',
  'tax_amount', 'paid_amount', 'duration_sec', 'base_price', 'cost', 'min_qty'
]);

// Date fields
const DATE_FIELDS = new Set([
  'last_order_date', 'created_at', 'due_date', 'event_date'
]);

function cleanValue(field, raw) {
  if (!raw || raw === '' || raw === 'null' || raw === 'NULL' || raw === 'N/A') return null;

  if (NUMERIC_FIELDS.has(field)) {
    // Strip $, commas, %, spaces
    const cleaned = raw.replace(/[$,%\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  if (DATE_FIELDS.has(field)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  return raw;
}

async function insertRows(dataType, rows, mapping, tenantId) {
  const results = { imported: 0, skipped: 0, errors: [] };

  // Get mapped DB fields (excluding created_at/updated_at — we handle those)
  const fieldEntries = Object.entries(mapping)
    .filter(([_, m]) => m.field !== 'created_at')
    .map(([csvCol, m]) => ({ csvCol, dbField: m.field }));

  const dbFields = fieldEntries.map(e => e.dbField);

  // Handle created_at mapping separately
  const createdAtCsvCol = Object.entries(mapping).find(([_, m]) => m.field === 'created_at')?.[0];

  const hasUpdatedAt = HAS_UPDATED_AT[dataType];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const values = [tenantId];

      for (const { csvCol, dbField } of fieldEntries) {
        values.push(cleanValue(dbField, row[csvCol]));
      }

      // created_at
      let createdVal = null;
      if (createdAtCsvCol && row[createdAtCsvCol]) {
        createdVal = cleanValue('created_at', row[createdAtCsvCol]);
      }
      values.push(createdVal || new Date().toISOString());

      // updated_at
      if (hasUpdatedAt) {
        values.push(new Date().toISOString());
      }

      const cols = ['tenant_id', ...dbFields, 'created_at'];
      if (hasUpdatedAt) cols.push('updated_at');

      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO iq_${dataType} (${cols.join(', ')}) VALUES (${placeholders})`;

      await sequelize.query(sql, { bind: values });
      results.imported++;
    } catch (err) {
      results.skipped++;
      if (results.errors.length < 10) {
        results.errors.push({ row: i + 2, message: err.message.substring(0, 200) });
      }
    }
  }

  return results;
}

// ───── Status: row counts for all iq_* tables ─────
async function getStatus(tenantId) {
  const tables = [
    { key: 'customers', table: 'iq_customers', label: 'Customers' },
    { key: 'quotes', table: 'iq_quotes', label: 'Quotes' },
    { key: 'orders', table: 'iq_orders', label: 'Orders' },
    { key: 'calls', table: 'iq_calls', label: 'Calls' },
    { key: 'invoices', table: 'iq_invoices', label: 'Invoices' },
    { key: 'products', table: 'iq_products', label: 'Products' },
    { key: 'production_jobs', table: 'iq_production_jobs', label: 'Production Jobs' },
    { key: 'inventory', table: 'iq_inventory', label: 'Inventory' },
    { key: 'suppliers', table: 'iq_suppliers', label: 'Suppliers' },
    { key: 'shipments', table: 'iq_shipments', label: 'Shipments' }
  ];

  const counts = {};
  for (const t of tables) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM ${t.table} WHERE tenant_id = $1`,
        { bind: [tenantId] }
      );
      counts[t.key] = { label: t.label, count: parseInt(rows[0].cnt) };
    } catch {
      counts[t.key] = { label: t.label, count: 0 };
    }
  }
  return counts;
}

// ───── Reset: delete all data for a tenant ─────
async function resetData(tenantId) {
  const tables = [
    'iq_treatment_log', 'iq_neural_treatments', 'iq_neural_insights',
    'iq_agent_sessions', 'iq_reorder_predictions', 'iq_compliance',
    'iq_shipments', 'iq_invoices', 'iq_production_jobs',
    'iq_order_items', 'iq_orders', 'iq_quote_items', 'iq_quotes',
    'iq_artwork', 'iq_inventory', 'iq_products', 'iq_suppliers',
    'iq_calls', 'iq_customers'
  ];

  const deleted = {};
  for (const table of tables) {
    try {
      const [, meta] = await sequelize.query(
        `DELETE FROM ${table} WHERE tenant_id = $1`,
        { bind: [tenantId] }
      );
      deleted[table] = meta?.rowCount || 0;
    } catch {
      deleted[table] = 0;
    }
  }
  return deleted;
}

module.exports = {
  SCHEMA_MAP,
  TEMPLATES,
  parseCSV,
  mapColumns,
  insertRows,
  getStatus,
  resetData,
  cleanValue
};
