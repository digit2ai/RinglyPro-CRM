const sequelize = require('./db.lg');
const https = require('https');

function fmcsaRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); } });
    }).on('error', reject);
  });
}

async function verify_carrier_authority(input) {
  const { dot_number, mc_number } = input;
  if (!dot_number && !mc_number) throw new Error('dot_number or mc_number required');
  let carrierData = null;
  try {
    const webKey = process.env.FMCSA_API_KEY;
    if (webKey && dot_number) {
      const resp = await fmcsaRequest(`https://mobile.fmcsa.dot.gov/qc/services/carriers/${dot_number}?webKey=${webKey}`);
      if (resp?.content?.carrier) {
        const c = resp.content.carrier;
        carrierData = { dot_number: c.dotNumber, legal_name: c.legalName, dba_name: c.dbaName, entity_type: c.entityType, operating_status: c.allowedToOperate === 'Y' ? 'AUTHORIZED' : 'NOT AUTHORIZED', power_units: c.totalPowerUnits, drivers: c.totalDrivers, safety_rating: c.safetyRating, bipd_insurance_on_file: c.bipdInsuranceOnFile === 'Y', cargo_insurance_on_file: c.cargoInsuranceOnFile === 'Y' };
      }
    }
  } catch (e) { console.error('FMCSA API error:', e.message); }
  if (!carrierData) carrierData = { dot_number: dot_number || 'N/A', legal_name: 'Pending FMCSA Lookup', operating_status: 'UNKNOWN', note: 'Set FMCSA_API_KEY env var for live lookups' };

  const [[existing]] = await sequelize.query(`SELECT id FROM lg_carrier_compliance WHERE dot_number = $1`, { bind: [dot_number || 'N/A'] });
  if (existing) {
    await sequelize.query(`UPDATE lg_carrier_compliance SET operating_status = $1, legal_name = $2, safety_rating = $3, power_units = $4, drivers = $5, bipd_insurance_on_file = $6, cargo_insurance_on_file = $7, raw_fmcsa_data = $8, last_fmcsa_check = NOW(), updated_at = NOW() WHERE id = $9`,
      { bind: [carrierData.operating_status, carrierData.legal_name, carrierData.safety_rating || null, carrierData.power_units || null, carrierData.drivers || null, carrierData.bipd_insurance_on_file || false, carrierData.cargo_insurance_on_file || false, JSON.stringify(carrierData), existing.id] });
  } else {
    await sequelize.query(`INSERT INTO lg_carrier_compliance (tenant_id, dot_number, mc_number, legal_name, operating_status, safety_rating, power_units, drivers, bipd_insurance_on_file, cargo_insurance_on_file, raw_fmcsa_data, last_fmcsa_check, created_at, updated_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())`,
      { bind: [dot_number || null, mc_number || null, carrierData.legal_name, carrierData.operating_status, carrierData.safety_rating || null, carrierData.power_units || null, carrierData.drivers || null, carrierData.bipd_insurance_on_file || false, carrierData.cargo_insurance_on_file || false, JSON.stringify(carrierData)] });
  }
  const authorized = carrierData.operating_status === 'AUTHORIZED';
  return { ...carrierData, authorized, risk_level: authorized ? 'LOW' : 'HIGH', recommendation: authorized ? 'Carrier is authorized to operate' : 'WARNING: Carrier is NOT authorized' };
}

async function get_safety_score(input) {
  const { dot_number } = input;
  if (!dot_number) throw new Error('dot_number required');
  let [[comp]] = await sequelize.query(`SELECT * FROM lg_carrier_compliance WHERE dot_number = $1`, { bind: [dot_number] });
  if (!comp) { await verify_carrier_authority({ dot_number }); [[comp]] = await sequelize.query(`SELECT * FROM lg_carrier_compliance WHERE dot_number = $1`, { bind: [dot_number] }); }
  if (!comp) throw new Error('Could not retrieve carrier data');
  return { dot_number: comp.dot_number, legal_name: comp.legal_name, safety_rating: comp.safety_rating, operating_status: comp.operating_status, csa_scores: { unsafe_driving: comp.csa_unsafe_driving, hours_of_service: comp.csa_hours_of_service, driver_fitness: comp.csa_driver_fitness, vehicle_maintenance: comp.csa_vehicle_maintenance }, last_checked: comp.last_fmcsa_check };
}

async function check_insurance_status(input) {
  const { dot_number, carrier_id } = input;
  let where, bind;
  if (dot_number) { where = 'dot_number = $1'; bind = [dot_number]; }
  else if (carrier_id) { where = 'contact_id = $1'; bind = [carrier_id]; }
  else throw new Error('carrier_id or dot_number required');
  const [[comp]] = await sequelize.query(`SELECT * FROM lg_carrier_compliance WHERE ${where}`, { bind });
  if (!comp) throw new Error('Carrier compliance record not found');
  return { dot_number: comp.dot_number, legal_name: comp.legal_name, bipd_insurance: { on_file: comp.bipd_insurance_on_file, coverage_to: comp.bipd_coverage_to }, cargo_insurance: { on_file: comp.cargo_insurance_on_file, coverage_to: comp.cargo_coverage_to }, onboarding_status: comp.onboarding_status };
}

async function run_carrier_onboarding(input, user) {
  const { dot_number, mc_number, contact_id } = input;
  if (!dot_number) throw new Error('dot_number required');
  const authority = await verify_carrier_authority({ dot_number, mc_number });
  const [docs] = contact_id ? await sequelize.query(`SELECT doc_type FROM lg_documents WHERE contact_id = $1 AND status = 'active'`, { bind: [contact_id] }) : [[]];
  const docTypes = docs.map(d => d.doc_type);
  const checklist = { authority_verified: authority.authorized, insurance_on_file: authority.bipd_insurance_on_file || false, w9_uploaded: docTypes.includes('w9'), carrier_agreement_signed: docTypes.includes('carrier_agreement') };
  const allComplete = Object.values(checklist).every(v => v);
  await sequelize.query(`UPDATE lg_carrier_compliance SET onboarding_status = $1, contact_id = $2, w9_on_file = $3, carrier_agreement_on_file = $4, updated_at = NOW() ${allComplete ? ", onboarding_completed_at = NOW()" : ""} WHERE dot_number = $5`,
    { bind: [allComplete ? 'approved' : 'in_progress', contact_id || null, checklist.w9_uploaded, checklist.carrier_agreement_signed, dot_number] });
  return { dot_number, legal_name: authority.legal_name, onboarding_status: allComplete ? 'approved' : 'in_progress', checklist, missing: Object.entries(checklist).filter(([, v]) => !v).map(([k]) => k) };
}

module.exports = { verify_carrier_authority, get_safety_score, check_insurance_status, run_carrier_onboarding };
