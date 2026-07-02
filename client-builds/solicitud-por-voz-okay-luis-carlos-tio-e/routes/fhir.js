// GET /api/v1/readings/:id/fhir — export a reading as a FHIR R4 Observation
// bundle (HR = LOINC 8867-4, respiratory rate = 9279-1). JWT + tenant-scoped;
// wrong-tenant / missing id -> 404. The interoperability hook telehealth asks for.
const express = require('express');
const router = express.Router();
const store = require('../models/reading');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

function observation(id, code, display, value, unit, ucum, when) {
  return {
    resource: {
      resourceType: 'Observation',
      id: String(id),
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: code, display: display }], text: display },
      effectiveDateTime: when,
      valueQuantity: { value: value, unit: unit, system: 'http://unitsofmeasure.org', code: ucum }
    }
  };
}

router.get('/:id/fhir', async (req, res) => {
  try {
    const row = await store.getById(req.tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'reading not found' });
    const when = new Date(row.created_at).toISOString();
    const entry = [];
    if (row.bpm != null) entry.push(observation(row.id + '-hr', '8867-4', 'Heart rate', Number(row.bpm), 'beats/minute', '/min', when));
    if (row.respiratory_bpm != null) entry.push(observation(row.id + '-rr', '9279-1', 'Respiratory rate', Number(row.respiratory_bpm), 'breaths/minute', '/min', when));
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'] },
      entry: entry
    };
    res.type('application/fhir+json').json(bundle);
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'fhir_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
