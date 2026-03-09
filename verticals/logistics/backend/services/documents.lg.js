const sequelize = require('./db.lg');
const path = require('path');
const fs = require('fs');
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

async function upload_document(input, user) {
  const { doc_type, load_id, carrier_id, shipper_id, contact_id, filename, file_data, mime_type } = input;
  if (!doc_type) throw new Error('doc_type required');
  const storageName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename || 'document'}`;
  const storagePath = path.join(UPLOAD_DIR, storageName);
  let fileSize = 0;
  if (file_data) { const buf = Buffer.from(file_data, 'base64'); fs.writeFileSync(storagePath, buf); fileSize = buf.length; }
  const [[doc]] = await sequelize.query(
    `INSERT INTO lg_documents (tenant_id, doc_type, filename, original_name, mime_type, file_size, storage_path, load_id, carrier_id, shipper_id, contact_id, uploaded_by, status, created_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW()) RETURNING *`,
    { bind: [doc_type, storageName, filename || storageName, mime_type || 'application/octet-stream', fileSize, storagePath, load_id || null, carrier_id || null, shipper_id || null, contact_id || null, user?.id || null] }
  );
  return { document_id: doc.id, doc_type: doc.doc_type, filename: doc.original_name, status: 'uploaded' };
}

async function get_load_documents(input) {
  const { load_id } = input;
  if (!load_id) throw new Error('load_id required');
  const [docs] = await sequelize.query(`SELECT d.*, u.full_name as uploaded_by_name FROM lg_documents d LEFT JOIN lg_users u ON u.id = d.uploaded_by WHERE d.load_id = $1 AND d.status = 'active' ORDER BY d.created_at DESC`, { bind: [load_id] });
  const byType = {};
  docs.forEach(d => { if (!byType[d.doc_type]) byType[d.doc_type] = []; byType[d.doc_type].push({ id: d.id, filename: d.original_name, created_at: d.created_at }); });
  return { load_id, total_documents: docs.length, by_type: byType };
}

async function verify_documents_complete(input) {
  const { load_id } = input;
  if (!load_id) throw new Error('load_id required');
  const [[load]] = await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [load_id] });
  if (!load) throw new Error('Load not found');
  const [docs] = await sequelize.query(`SELECT doc_type, COUNT(*) as count FROM lg_documents WHERE load_id = $1 AND status = 'active' GROUP BY doc_type`, { bind: [load_id] });
  const docMap = {};
  docs.forEach(d => { docMap[d.doc_type] = parseInt(d.count); });
  const required = ['bol', 'rate_confirmation'];
  if (load.status === 'delivered') required.push('pod');
  const missing = required.filter(r => !docMap[r]);
  return { load_id, load_ref: load.load_ref, billing_ready: missing.length === 0, required_documents: required, missing_documents: missing, message: missing.length === 0 ? 'All required documents present. Ready for billing.' : `Missing: ${missing.join(', ')}` };
}

module.exports = { upload_document, get_load_documents, verify_documents_complete };
