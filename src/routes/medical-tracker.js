const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sequelize = require('../config/database');
const MedicalDocumentAI = require('../services/medicalDocumentAI');

// Multer config -- memory storage, accept images + PDFs
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, HEIC, WebP) and PDFs are accepted'), false);
  }
});

// Import models
const MedicalPatient = require('../models/MedicalPatient');
const MedicalDiagnosis = require('../models/MedicalDiagnosis');
const MedicalMedication = require('../models/MedicalMedication');
const MedicalAppointment = require('../models/MedicalAppointment');
const MedicalLabOrder = require('../models/MedicalLabOrder');
const MedicalImagingOrder = require('../models/MedicalImagingOrder');
const MedicalProvider = require('../models/MedicalProvider');
const MedicalFollowUp = require('../models/MedicalFollowUp');
const MedicalVital = require('../models/MedicalVital');
const MedicalNote = require('../models/MedicalNote');

// Model map for generic CRUD
const MODELS = {
  patients: MedicalPatient,
  diagnoses: MedicalDiagnosis,
  medications: MedicalMedication,
  appointments: MedicalAppointment,
  lab_orders: MedicalLabOrder,
  imaging_orders: MedicalImagingOrder,
  providers: MedicalProvider,
  followups: MedicalFollowUp,
  vitals: MedicalVital,
  notes: MedicalNote
};

// ==================== HEALTH ====================
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'medical-tracker', status: 'running' });
});

// ==================== MIGRATE ====================
router.post('/migrate', async (req, res) => {
  try {
    const sqlPath = path.join(__dirname, '../../migrations/20260421_medical_tracker_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await sequelize.query(sql);
    res.json({ success: true, message: 'Medical tracker tables created' });
  } catch (error) {
    console.error('Migration error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DOCUMENT UPLOAD & AI EXTRACTION ====================

// Upload documents, extract data with Claude Vision, return structured preview
router.post('/upload/extract', upload.array('documents', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const ai = new MedicalDocumentAI();
    const patientId = req.body.patient_id || 1;

    // Build existing context so AI can merge intelligently
    let existingContext = '';
    try {
      const patient = await MedicalPatient.findByPk(patientId);
      if (patient) {
        existingContext = `Patient: ${patient.name}, MRN: ${patient.mrn}, DOB: ${patient.dob}`;
      }
    } catch (e) { /* no context available */ }

    const results = [];
    for (const file of req.files) {
      try {
        const base64 = file.buffer.toString('base64');
        let extracted;
        if (file.mimetype === 'application/pdf') {
          extracted = await ai.extractFromPDF(base64, existingContext);
        } else {
          extracted = await ai.extractFromImage(base64, file.mimetype, existingContext);
        }
        results.push({
          filename: file.originalname,
          size: file.size,
          type: file.mimetype,
          extracted,
          status: 'success'
        });
      } catch (err) {
        console.error('Extraction error for', file.originalname, ':', err.message);
        results.push({
          filename: file.originalname,
          size: file.size,
          type: file.mimetype,
          extracted: null,
          status: 'error',
          error: err.message
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Confirm and save extracted data to the database
router.post('/upload/confirm', async (req, res) => {
  try {
    const { patient_id, extracted } = req.body;
    if (!extracted) return res.status(400).json({ success: false, error: 'No extracted data provided' });

    const pid = patient_id || 1;
    const saved = { diagnoses: 0, medications: 0, appointments: 0, lab_orders: 0, imaging_orders: 0, providers: 0, followups: 0, vitals: 0, notes: 0 };

    // Update patient info if provided
    if (extracted.patient) {
      const patient = await MedicalPatient.findByPk(pid);
      if (patient) {
        const updates = {};
        const p = extracted.patient;
        // Only update non-null fields
        for (const key of Object.keys(p)) {
          if (p[key] && p[key] !== '' && p[key] !== null) updates[key] = p[key];
        }
        if (Object.keys(updates).length > 0) await patient.update(updates);
      }
    }

    // Save each section
    if (extracted.diagnoses) {
      for (const d of extracted.diagnoses) {
        if (!d.condition_name) continue;
        const [, created] = await MedicalDiagnosis.findOrCreate({
          where: { patient_id: pid, icd_code: d.icd_code || d.condition_name },
          defaults: { ...d, patient_id: pid }
        });
        if (created) saved.diagnoses++;
      }
    }

    if (extracted.medications) {
      for (const m of extracted.medications) {
        if (!m.medication_name) continue;
        const [, created] = await MedicalMedication.findOrCreate({
          where: { patient_id: pid, medication_name: m.medication_name },
          defaults: { ...m, patient_id: pid }
        });
        if (created) saved.medications++;
      }
    }

    if (extracted.appointments) {
      for (const a of extracted.appointments) {
        if (!a.appointment_date && !a.doctor_name) continue;
        const [, created] = await MedicalAppointment.findOrCreate({
          where: { patient_id: pid, appointment_date: a.appointment_date || null, doctor_name: a.doctor_name || 'Unknown' },
          defaults: { ...a, patient_id: pid }
        });
        if (created) saved.appointments++;
      }
    }

    if (extracted.lab_orders) {
      for (const l of extracted.lab_orders) {
        if (!l.test_name) continue;
        const [, created] = await MedicalLabOrder.findOrCreate({
          where: { patient_id: pid, test_name: l.test_name, order_date: l.order_date || null },
          defaults: { ...l, patient_id: pid }
        });
        if (created) saved.lab_orders++;
      }
    }

    if (extracted.imaging_orders) {
      for (const i of extracted.imaging_orders) {
        if (!i.imaging_test) continue;
        const [, created] = await MedicalImagingOrder.findOrCreate({
          where: { patient_id: pid, imaging_test: i.imaging_test, order_date: i.order_date || null },
          defaults: { ...i, patient_id: pid }
        });
        if (created) saved.imaging_orders++;
      }
    }

    if (extracted.providers) {
      for (const p of extracted.providers) {
        if (!p.provider_name) continue;
        const [, created] = await MedicalProvider.findOrCreate({
          where: { patient_id: pid, provider_name: p.provider_name },
          defaults: { ...p, patient_id: pid }
        });
        if (created) saved.providers++;
      }
    }

    if (extracted.followups) {
      for (const f of extracted.followups) {
        if (!f.item) continue;
        const [, created] = await MedicalFollowUp.findOrCreate({
          where: { patient_id: pid, item: f.item },
          defaults: { ...f, patient_id: pid }
        });
        if (created) saved.followups++;
      }
    }

    if (extracted.vitals) {
      for (const v of extracted.vitals) {
        if (!v.measured_date) continue;
        const [, created] = await MedicalVital.findOrCreate({
          where: { patient_id: pid, measured_date: v.measured_date },
          defaults: { ...v, patient_id: pid }
        });
        if (created) saved.vitals++;
      }
    }

    if (extracted.notes) {
      for (const n of extracted.notes) {
        if (!n.note_text) continue;
        const [, created] = await MedicalNote.findOrCreate({
          where: { patient_id: pid, note_text: n.note_text },
          defaults: { ...n, patient_id: pid }
        });
        if (created) saved.notes++;
      }
    }

    res.json({ success: true, message: 'Data saved to tracker', saved });
  } catch (error) {
    console.error('Confirm save error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DASHBOARD DATA ====================
// Returns everything for one patient in a single call
router.get('/dashboard/:patientId', async (req, res) => {
  try {
    const pid = req.params.patientId;
    const [
      patient, diagnoses, medications, appointments, labOrders,
      imagingOrders, providers, followups, vitals, notes
    ] = await Promise.all([
      MedicalPatient.findByPk(pid),
      MedicalDiagnosis.findAll({ where: { patient_id: pid }, order: [['created_at', 'DESC']] }),
      MedicalMedication.findAll({ where: { patient_id: pid }, order: [['status', 'ASC'], ['medication_name', 'ASC']] }),
      MedicalAppointment.findAll({ where: { patient_id: pid }, order: [['appointment_date', 'DESC']] }),
      MedicalLabOrder.findAll({ where: { patient_id: pid }, order: [['order_date', 'DESC']] }),
      MedicalImagingOrder.findAll({ where: { patient_id: pid }, order: [['order_date', 'DESC']] }),
      MedicalProvider.findAll({ where: { patient_id: pid }, order: [['provider_name', 'ASC']] }),
      MedicalFollowUp.findAll({ where: { patient_id: pid }, order: [['due_date', 'ASC']] }),
      MedicalVital.findAll({ where: { patient_id: pid }, order: [['measured_date', 'DESC']] }),
      MedicalNote.findAll({ where: { patient_id: pid }, order: [['created_at', 'DESC']] })
    ]);

    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });

    res.json({
      success: true,
      data: { patient, diagnoses, medications, appointments, labOrders, imagingOrders, providers, followups, vitals, notes }
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GENERIC CRUD ====================
// LIST all for a resource (optionally filter by patient_id)
router.get('/:resource', async (req, res) => {
  try {
    const Model = MODELS[req.params.resource];
    if (!Model) return res.status(404).json({ success: false, error: `Unknown resource: ${req.params.resource}` });

    const where = {};
    if (req.query.patient_id) where.patient_id = req.query.patient_id;
    if (req.query.status) where.status = req.query.status;

    const items = await Model.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET one
router.get('/:resource/:id', async (req, res) => {
  try {
    const Model = MODELS[req.params.resource];
    if (!Model) return res.status(404).json({ success: false, error: `Unknown resource: ${req.params.resource}` });

    const item = await Model.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE
router.post('/:resource', async (req, res) => {
  try {
    const Model = MODELS[req.params.resource];
    if (!Model) return res.status(404).json({ success: false, error: `Unknown resource: ${req.params.resource}` });

    const item = await Model.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE
router.put('/:resource/:id', async (req, res) => {
  try {
    const Model = MODELS[req.params.resource];
    if (!Model) return res.status(404).json({ success: false, error: `Unknown resource: ${req.params.resource}` });

    const item = await Model.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });

    await item.update(req.body);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE
router.delete('/:resource/:id', async (req, res) => {
  try {
    const Model = MODELS[req.params.resource];
    if (!Model) return res.status(404).json({ success: false, error: `Unknown resource: ${req.params.resource}` });

    const item = await Model.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });

    await item.destroy();
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SEED INITIAL DATA ====================
router.post('/seed/initial', async (req, res) => {
  try {
    // Create patient
    const [patient] = await MedicalPatient.findOrCreate({
      where: { mrn: '28127128' },
      defaults: {
        name: 'Manuel Stagg',
        dob: '1967-02-03',
        sex: 'Male',
        mrn: '28127128',
        ceid: 'ADV-MVH4-73X9-RZ55',
        address: '33600 Barberry Leaf Way, Wesley Chapel, FL 33543',
        phone: '813-641-4177',
        primary_clinic: 'AdventHealth Medical Group Multispecialty at New Tampa',
        primary_doctor: 'Hala Al-Jiboury, MD',
        insurance_name: 'Aetna Choice POS II Managed Choice',
        insurance_plan: '10000149',
        insurance_policy: 'W116527841',
        insurance_group: '086887001500016',
        insurance_address: 'PO Box 981106, El Paso, TX 79998-1106',
        allergies: 'No Known Allergies',
        pharmacy_name: 'Publix #0006, Shoppes At New Tampa',
        pharmacy_address: '1920 County Road 581, Wesley Chapel FL 33543',
        pharmacy_phone: '813-994-4242'
      }
    });

    const pid = patient.id;

    // Diagnoses
    const diagnosesData = [
      { patient_id: pid, condition_name: 'Gastroesophageal reflux disease, unspecified whether esophagitis present', icd_code: 'K21.9', status: 'Active', diagnosed_date: '2026-03-03' },
      { patient_id: pid, condition_name: 'Epigastric pain', icd_code: 'R10.13', status: 'Active', diagnosed_date: '2026-03-03' },
      { patient_id: pid, condition_name: 'Smoker', icd_code: 'F17.200', status: 'Active', notes: 'On nicotine patch + varenicline (Chantix) for cessation' }
    ];
    for (const d of diagnosesData) {
      await MedicalDiagnosis.findOrCreate({ where: { patient_id: pid, icd_code: d.icd_code }, defaults: d });
    }

    // Medications
    const medsData = [
      { patient_id: pid, medication_name: 'Albuterol inhaler', dose: '108 (90 Base) MCG/ACT', instructions: 'Inhale 1 puff 1 time for 1 dose', status: 'Active' },
      { patient_id: pid, medication_name: 'Aspirin', brand_name: 'Chewable', dose: '81 MG', instructions: 'Chew 1 tablet 1 time each day', status: 'Active' },
      { patient_id: pid, medication_name: 'Atorvastatin', brand_name: 'Lipitor', dose: '80 MG tablet', instructions: 'Take 1 tablet by mouth 1 time daily', status: 'Active' },
      { patient_id: pid, medication_name: 'Lisinopril', dose: '40 MG tablet', instructions: 'Take 1 tablet 1 time each day', status: 'Active' },
      { patient_id: pid, medication_name: 'Metoprolol Succinate XL', brand_name: 'Toprol-XL', dose: '25 MG 24hr tablet', instructions: 'Take 1 tablet by mouth 1 time daily - do not crush or chew', status: 'Active' },
      { patient_id: pid, medication_name: 'Na Sulfate-K Sulfate-Mg Sulf', brand_name: 'Suprep Bowel Prep Kit', dose: '17.5-3.13-1.6 GM/177ML solution', instructions: 'Take by mouth 1 time for 1 dose', prescribing_doctor: 'Hala Al-Jiboury, MD', start_date: '2026-03-03', status: 'Started' },
      { patient_id: pid, medication_name: 'Nicotine patch', brand_name: 'Nicoderm CQ', dose: '7 MG/24HR', instructions: 'Place 1 patch on skin 1 time each day at the same time', status: 'Active' },
      { patient_id: pid, medication_name: 'Sertraline', brand_name: 'Zoloft', dose: '50 MG tablet', instructions: 'Take 1 tablet by mouth 1 time each day', status: 'Active' },
      { patient_id: pid, medication_name: 'Tiotropium bromide monohydrate', brand_name: 'Spiriva Respimat', dose: '1.25 MCG/ACT aerosol', instructions: 'Inhale 2 inhalations 1 time each day', status: 'Active' },
      { patient_id: pid, medication_name: 'Varenicline', brand_name: 'Chantix', dose: '0.5 MG tablet', instructions: 'Take 1 tablet in the morning + 1 tablet before bedtime, with full glass of water', status: 'Active' }
    ];
    for (const m of medsData) {
      await MedicalMedication.findOrCreate({ where: { patient_id: pid, medication_name: m.medication_name }, defaults: m });
    }

    // Appointments
    const apptsData = [
      { patient_id: pid, appointment_type: 'doctor', appointment_date: '2026-03-03', appointment_time: '9:30 AM', doctor_name: 'Hala Al-Jiboury, MD', specialty: 'Specialist', location: 'AdventHealth Medical Group Multispecialty at New Tampa', reason: 'GERD, epigastric pain, smoking', status: 'Completed', notes: 'Orders placed for CT, labs, bowel prep started' },
      { patient_id: pid, appointment_type: 'doctor', appointment_date: '2026-05-05', appointment_time: '9:30 AM', arrive_by: '9:15 AM', doctor_name: 'Hala Al-Jiboury, MD', specialty: 'Specialist', location: 'AdventHealth Medical Group Multispecialty at New Tampa', reason: 'Follow-up', status: 'Scheduled', notes: 'Bring insurance info and copayment' }
    ];
    for (const a of apptsData) {
      await MedicalAppointment.findOrCreate({ where: { patient_id: pid, appointment_date: a.appointment_date, doctor_name: a.doctor_name }, defaults: a });
    }

    // Lab orders
    const labsData = [
      { patient_id: pid, order_date: '2026-03-03', test_name: 'Lipase', test_code: '606', facility: 'Quest Diagnostics', facility_account: '66098353', lab_ref: 'G317440903', ordering_doctor: 'Hala Al-Jiboury, MD', diagnosis_reason: 'K21.9, R10.13, F17.200', specimen_source: 'Blood, Venous', expected_date: 'Once', status: 'Ordered' },
      { patient_id: pid, order_date: '2026-03-03', test_name: 'CBC', test_code: '1759', facility: 'Quest Diagnostics', facility_account: '66098353', lab_ref: 'G317440903', ordering_doctor: 'Hala Al-Jiboury, MD', diagnosis_reason: 'K21.9, R10.13, F17.200', specimen_source: 'Blood, Venous', expected_date: 'Once', status: 'Ordered' },
      { patient_id: pid, order_date: '2026-03-03', test_name: 'Comprehensive Metabolic Panel', test_code: '10231', facility: 'Quest Diagnostics', facility_account: '66098353', lab_ref: 'G317440903', ordering_doctor: 'Hala Al-Jiboury, MD', diagnosis_reason: 'K21.9, R10.13, F17.200', specimen_source: 'Blood, Venous', expected_date: 'Once', status: 'Ordered' }
    ];
    for (const l of labsData) {
      await MedicalLabOrder.findOrCreate({ where: { patient_id: pid, test_name: l.test_name, order_date: l.order_date }, defaults: l });
    }

    // Imaging orders
    await MedicalImagingOrder.findOrCreate({
      where: { patient_id: pid, order_id: '1303697176' },
      defaults: {
        patient_id: pid, order_date: '2026-03-03', imaging_test: 'CT', body_area: 'Abdomen Pelvis',
        contrast: 'W IV Contrast', facility: 'Patient Preference (not yet scheduled)',
        ordering_doctor: 'Hala Al-Jiboury, MD', order_id: '1303697176',
        reason: 'Smoker with epigastric abdominal pain, rule out structural causes including pancreas',
        priority: 'Routine', expiration_date: '2027-03-03', status: 'Ordered'
      }
    });

    // Providers
    await MedicalProvider.findOrCreate({
      where: { patient_id: pid, npi: '1356626402' },
      defaults: {
        patient_id: pid, provider_name: 'Hala Al-Jiboury, MD', specialty: 'Specialist',
        clinic: 'AdventHealth Medical Group Multispecialty at New Tampa, 8702 Hunters Lake Drive, Suite 100, Tampa FL 33647-2855',
        phone: '813-467-4700', fax: '813-467-4754', npi: '1356626402'
      }
    });

    // Vitals
    await MedicalVital.findOrCreate({
      where: { patient_id: pid, measured_date: '2026-03-03' },
      defaults: {
        patient_id: pid, measured_date: '2026-03-03', blood_pressure: '138/96',
        pulse: 77, oxygen_saturation: '97%', weight: '205 lb 3.2 oz',
        height: '5\'10"', bmi: 29.44
      }
    });

    // Follow-ups
    const followupsData = [
      { patient_id: pid, item: 'Follow-up office visit', due_date: '2026-05-05', related_to: 'Hala Al-Jiboury, MD', status: 'Scheduled', notes: '9:30 AM, arrive by 9:15 AM' },
      { patient_id: pid, item: 'Complete lab work (Lipase, CBC, CMP)', due_date: null, related_to: 'Quest Diagnostics', status: 'Pending', notes: 'Lab Ref# G317440903. Blood draw, venous.' },
      { patient_id: pid, item: 'Schedule CT Abdomen Pelvis W IV Contrast', due_date: '2027-03-03', related_to: 'Hala Al-Jiboury, MD', status: 'Pending', notes: 'Location: Patient Preference. Routine priority.' },
      { patient_id: pid, item: 'Pick up Suprep Bowel Prep Kit', due_date: null, related_to: 'Publix #0006, Wesley Chapel', status: 'Pending', notes: 'Estimated payment: $0' }
    ];
    for (const f of followupsData) {
      await MedicalFollowUp.findOrCreate({ where: { patient_id: pid, item: f.item }, defaults: f });
    }

    // Notes
    const notesData = [
      { patient_id: pid, note_text: 'Blood pressure 138/96 is elevated -- patient already on lisinopril 40mg and metoprolol 25mg.', category: 'Clinical', source_document: 'After Visit Summary 3/3/2026' },
      { patient_id: pid, note_text: 'BMI 29.44 is in the overweight range (just under 30 obesity threshold).', category: 'Clinical', source_document: 'After Visit Summary 3/3/2026' },
      { patient_id: pid, note_text: 'Patient is actively on smoking cessation therapy (nicotine patch + varenicline/Chantix).', category: 'Clinical', source_document: 'After Visit Summary 3/3/2026' },
      { patient_id: pid, note_text: 'Address typo in provider system: "Westey Chalpel" should be "Wesley Chapel".', category: 'Action Item', source_document: 'Insurance/Guarantor Sheet 3/3/2026' }
    ];
    for (const n of notesData) {
      await MedicalNote.findOrCreate({ where: { patient_id: pid, note_text: n.note_text }, defaults: n });
    }

    res.json({ success: true, message: 'Initial data seeded', patient_id: pid });
  } catch (error) {
    console.error('Seed error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
