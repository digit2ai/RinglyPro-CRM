'use strict';

/**
 * Seed hospitals and open positions so the platform has something to match
 * against on day one. Idempotent: matched on organisation name and position
 * title, so running it twice changes nothing.
 *
 * These are SAMPLE ORGANISATIONS, not real clients. The names are obviously
 * generic for that reason — a seeded row that reads like a real hospital would
 * eventually be quoted back as a customer.
 */

require('dotenv').config();
const { sequelize, Organization, Position } = require('../src/models');

const TENANT = parseInt(process.env.JOBMD_TENANT_ID || '1', 10);

const ORGS = [
  { name: 'Sample Regional Medical Center', org_type: 'hospital', city: 'Tampa', state: 'FL',
    facilities: 3, robotics_platforms: ['da Vinci Xi'], recruiting_priorities: 'Robotic general surgery and urology.' },
  { name: 'Sample Health System', org_type: 'health_system', city: 'Atlanta', state: 'GA',
    facilities: 9, robotics_platforms: ['da Vinci Xi', 'Hugo RAS'], recruiting_priorities: 'Cardiac and thoracic coverage.' },
  { name: 'Sample Integrated Delivery Network', org_type: 'idn', city: 'Dallas', state: 'TX',
    facilities: 14, robotics_platforms: ['da Vinci X', 'Mazor X'], recruiting_priorities: 'Orthopaedics and spine.' },
  { name: 'Sample Coastal Hospital', org_type: 'hospital', city: 'Charleston', state: 'SC',
    facilities: 2, robotics_platforms: [], recruiting_priorities: 'General and trauma surgery.' },
  { name: 'Sample University Hospital', org_type: 'health_system', city: 'Chapel Hill', state: 'NC',
    facilities: 5, robotics_platforms: ['da Vinci Si'], recruiting_priorities: 'Academic transplant and hepatobiliary.' }
];

const POSITIONS = [
  { org: 'Sample Regional Medical Center', title: 'Robotic General Surgeon', specialty: 'Robotic Surgery',
    employment_model: 'employed', compensation_min: 550000, compensation_max: 650000, call_schedule: 'light',
    robotics_required: true, robotic_platforms: ['da Vinci Xi'], min_years_experience: 5,
    procedures: ['robotic cholecystectomy', 'robotic hernia repair'], start_date: '2026-11-01' },
  { org: 'Sample Regional Medical Center', title: 'Urologist', specialty: 'Urology',
    employment_model: 'employed', compensation_min: 480000, compensation_max: 560000, call_schedule: 'moderate',
    robotics_required: true, robotic_platforms: ['da Vinci Xi'], min_years_experience: 3,
    procedures: ['robotic prostatectomy'], start_date: '2026-10-01' },
  { org: 'Sample Health System', title: 'Cardiac Surgeon', specialty: 'Cardiac Surgery',
    employment_model: 'employed', compensation_min: 700000, compensation_max: 850000, call_schedule: 'heavy',
    robotics_required: false, min_years_experience: 7, procedures: ['CABG', 'valve repair'], start_date: '2027-01-15' },
  { org: 'Sample Health System', title: 'Thoracic Surgeon', specialty: 'Thoracic Surgery',
    employment_model: 'employed', compensation_min: 620000, compensation_max: 720000, call_schedule: 'moderate',
    robotics_required: true, robotic_platforms: ['da Vinci Xi', 'Hugo RAS'], min_years_experience: 5,
    procedures: ['robotic lobectomy'], start_date: '2026-12-01' },
  { org: 'Sample Integrated Delivery Network', title: 'Orthopaedic Surgeon - Joints', specialty: 'Orthopaedic Surgery',
    employment_model: 'independent', compensation_min: 600000, compensation_max: 780000, call_schedule: 'light',
    robotics_required: true, robotic_platforms: ['Mazor X'], min_years_experience: 4,
    procedures: ['total knee', 'total hip'], start_date: '2026-11-15' },
  { org: 'Sample Integrated Delivery Network', title: 'Neurosurgeon - Spine', specialty: 'Neurosurgery',
    employment_model: 'employed', compensation_min: 800000, compensation_max: 950000, call_schedule: 'heavy',
    robotics_required: true, robotic_platforms: ['Mazor X'], min_years_experience: 6,
    procedures: ['spinal fusion'], start_date: '2027-02-01' },
  { org: 'Sample Coastal Hospital', title: 'General Surgeon', specialty: 'General Surgery',
    employment_model: 'employed', compensation_min: 420000, compensation_max: 500000, call_schedule: 'moderate',
    robotics_required: false, min_years_experience: 2, procedures: ['appendectomy', 'cholecystectomy'],
    start_date: '2026-10-15' },
  { org: 'Sample Coastal Hospital', title: 'Trauma Surgeon', specialty: 'Trauma Surgery',
    employment_model: 'employed', compensation_min: 500000, compensation_max: 580000, call_schedule: 'heavy',
    robotics_required: false, min_years_experience: 3, procedures: ['damage control laparotomy'],
    start_date: '2026-12-15' },
  { org: 'Sample University Hospital', title: 'Transplant Surgeon', specialty: 'Transplant Surgery',
    employment_model: 'academic', compensation_min: 560000, compensation_max: 660000, call_schedule: 'heavy',
    robotics_required: false, min_years_experience: 5, procedures: ['kidney transplant', 'liver transplant'],
    start_date: '2027-03-01' },
  { org: 'Sample University Hospital', title: 'Hepatobiliary Surgeon', specialty: 'Hepatobiliary Surgery',
    employment_model: 'academic', compensation_min: 540000, compensation_max: 640000, call_schedule: 'moderate',
    robotics_required: true, robotic_platforms: ['da Vinci Si'], min_years_experience: 4,
    procedures: ['Whipple', 'hepatectomy'], start_date: '2027-01-01' },
  { org: 'Sample Health System', title: 'Gynecologic Surgeon', specialty: 'Gynecology',
    employment_model: 'employed', compensation_min: 400000, compensation_max: 480000, call_schedule: 'light',
    robotics_required: true, robotic_platforms: ['da Vinci Xi'], min_years_experience: 3,
    procedures: ['robotic hysterectomy'], start_date: '2026-11-01' },
  { org: 'Sample Regional Medical Center', title: 'Colon & Rectal Surgeon', specialty: 'Colon & Rectal Surgery',
    employment_model: 'employed', compensation_min: 520000, compensation_max: 610000, call_schedule: 'light',
    robotics_required: true, robotic_platforms: ['da Vinci Xi'], min_years_experience: 4,
    procedures: ['robotic colectomy'], start_date: '2026-12-01' }
];

async function seed() {
  await sequelize.authenticate();
  const orgIds = {};
  let newOrgs = 0, newPos = 0;

  for (const o of ORGS) {
    let row = await Organization.findOne({ where: { tenant_id: TENANT, name: o.name } });
    if (!row) { row = await Organization.create(Object.assign({ tenant_id: TENANT }, o)); newOrgs++; }
    orgIds[o.name] = row.id;
  }
  for (const p of POSITIONS) {
    const org_id = orgIds[p.org];
    const exists = await Position.findOne({ where: { tenant_id: TENANT, org_id: org_id, title: p.title } });
    if (exists) continue;
    const body = Object.assign({}, p);
    delete body.org;
    const org = ORGS.filter(function (o) { return o.name === p.org; })[0];
    await Position.create(Object.assign({
      tenant_id: TENANT, org_id: org_id, city: org.city, state: org.state,
      board_certification_required: true, status: 'open'
    }, body));
    newPos++;
  }
  const totalOrgs = await Organization.count({ where: { tenant_id: TENANT } });
  const totalPos = await Position.count({ where: { tenant_id: TENANT } });
  console.log('organisations: +' + newOrgs + ' (total ' + totalOrgs + ')');
  console.log('positions:     +' + newPos + ' (total ' + totalPos + ')');
  return { newOrgs, newPos, totalOrgs, totalPos };
}

if (require.main === module) {
  seed().then(function () { return sequelize.close(); })
        .then(function () { process.exit(0); })
        .catch(function (e) { console.error('seed failed:', e.message); process.exit(1); });
}
module.exports = { seed, ORGS, POSITIONS };
