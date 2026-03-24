const BASE = '/freight_broker/api/obd'

export async function uploadFile(file, profile) {
  const formData = new FormData()
  formData.append('file', file)
  if (profile) formData.append('profile', profile)
  formData.append('tenant_id', 'demo')
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: formData })
  return res.json()
}

export async function mapFields(batchId, mappings, entityType) {
  // Convert array [{source,target}] to object {"Header":"canonical_field"}
  const field_mappings = Array.isArray(mappings)
    ? mappings.reduce((obj, m) => { if (m.source && m.target) obj[m.source] = m.target; return obj; }, {})
    : mappings;
  const res = await fetch(`${BASE}/map-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId, field_mappings, entity_type: entityType, tenant_id: 'demo' })
  })
  return res.json()
}

export async function getIngestionProfiles() {
  const res = await fetch(`${BASE}/ingestion-profiles`)
  return res.json()
}

export async function runScan(modules) {
  const res = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: 'demo', modules })
  })
  return res.json()
}

export async function getFindings(params = {}) {
  const qs = new URLSearchParams({ tenant_id: 'demo', ...params }).toString()
  const res = await fetch(`${BASE}/findings?${qs}`)
  return res.json()
}

export async function getFinding(id) {
  const res = await fetch(`${BASE}/findings/${id}`)
  return res.json()
}

export async function updateFinding(id, data) {
  const res = await fetch(`${BASE}/findings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.json()
}

export async function getDashboard() {
  const res = await fetch(`${BASE}/dashboard?tenant_id=demo`)
  return res.json()
}

export async function getScanHistory() {
  const res = await fetch(`${BASE}/scan-history?tenant_id=demo`)
  return res.json()
}

export async function getHealth() {
  const res = await fetch('/freight_broker/health')
  return res.json()
}
