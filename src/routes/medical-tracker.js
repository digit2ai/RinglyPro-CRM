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

// ==================== SEED LINA STAGG ====================
router.post('/seed/lina-stagg', async (req, res) => {
  try {
    // Create patient
    const [patient] = await MedicalPatient.findOrCreate({
      where: { mrn: '618136' },
      defaults: {
        name: 'Lina M. Stagg',
        dob: '1974-11-28',
        sex: 'Female',
        mrn: '618136',
        address: 'Wesley Chapel, FL 33543',
        phone: '',
        primary_clinic: 'Florida Cancer Specialists - Wesley Chapel Tanic',
        primary_doctor: 'Hassan Hasanein, MD',
        insurance_name: '',
        allergies: '',
        pharmacy_name: ''
      }
    });

    const pid = patient.id;

    // Diagnoses
    const diagnosesData = [
      { patient_id: pid, condition_name: 'Kidney Transplant (11 years post-op)', icd_code: 'Z94.0', status: 'Chronic', notes: 'Transplanted kidney, on immunosuppressive therapy. Prograf level 3.2 (target 5-7 at 11 years).' },
      { patient_id: pid, condition_name: 'Anemia of Chronic Kidney Disease', icd_code: 'D63.1', status: 'Active', notes: 'Hemoglobin 7.1 (critically low). Low transferrin 162 (range 203-362). Iron stores adequate but delivery impaired.' },
      { patient_id: pid, condition_name: 'Post-Bariatric Surgery (5 years)', icd_code: 'Z98.84', status: 'Chronic', notes: 'Bariatric surgery 5 years ago. Malabsorption affects medication levels and nutrition. Low caloric intake ~800-1000 cal/day.' },
      { patient_id: pid, condition_name: 'Generalized Anxiety Disorder', icd_code: 'F41.1', status: 'Active', notes: 'On sertraline, buspirone, ALPRAZolam for management.' },
      { patient_id: pid, condition_name: 'Insomnia', icd_code: 'G47.00', status: 'Active', notes: 'Managed with traZODone 100mg nightly as needed.' },
      { patient_id: pid, condition_name: 'Vitamin Deficiency (Bariatric)', icd_code: 'E56.9', status: 'Active', notes: 'B12 dropping from 817 to 434. On multivitamin with folic acid. May need B12 injections.' },
      { patient_id: pid, condition_name: 'Protein Malnutrition', icd_code: 'E46', status: 'Active', notes: 'Low transferrin 162 indicates protein deficiency. Currently eating ~800-1000 calories/day. Needs 60-80g protein minimum.' }
    ];
    for (const d of diagnosesData) {
      await MedicalDiagnosis.findOrCreate({ where: { patient_id: pid, icd_code: d.icd_code }, defaults: d });
    }

    // Medications with schedule
    const medsData = [
      { patient_id: pid, medication_name: 'Tacrolimus', brand_name: 'Prograf', dose: '5 mg capsule', instructions: 'DOSE 1: 4:00 AM empty stomach (nightstand, small sip water, back to sleep). DOSE 2: 3:00 PM empty stomach (no food 1hr before or 2hrs after). 12 hours apart. CRITICAL anti-rejection med.', prescribing_doctor: 'Transplant Team', status: 'Active', notes: 'Prograf level 3.2 (target 5-7). Was taking once daily -- now twice daily. Avoid grapefruit. Separate from multivitamin by 5+ hours.' },
      { patient_id: pid, medication_name: 'Mycophenolic Acid', brand_name: '', dose: '360 mg tablet', instructions: 'DOSE 1: 11:30 AM with breakfast. DOSE 2: 5:00 PM after protein shake. Take 1hr after tacrolimus. Anti-rejection immunosuppressant.', prescribing_doctor: 'Transplant Team', status: 'Active', notes: 'Was taking once daily -- now twice daily. Can cause anemia (bone marrow suppression).' },
      { patient_id: pid, medication_name: 'PredniSONE', brand_name: 'Deltasone', dose: '5 mg tablet', instructions: 'Take 1 tablet at 11:30 AM with breakfast. Matches morning cortisol cycle. NEVER skip -- prevents organ rejection.', prescribing_doctor: 'Transplant Team', status: 'Active', notes: 'Anti-rejection med. Take with food to reduce stomach irritation on bariatric pouch. Was taking at 11pm -- moved to morning.' },
      { patient_id: pid, medication_name: 'Pantoprazole', dose: '40 mg tablet', instructions: 'Take at 10:30 AM when you wake up. Empty stomach, 30 minutes before eating. Protects stomach/bariatric pouch.', status: 'Active', notes: 'Also protects stomach from predniSONE irritation. Activates acid pumps that turn on with food.' },
      { patient_id: pid, medication_name: 'Farxiga', dose: '10 mg tablet', instructions: 'Take at 11:30 AM with breakfast. Kidney protection / diabetes management.', status: 'Active', notes: 'Protects transplanted kidney. Reduces pressure inside kidney filters.' },
      { patient_id: pid, medication_name: 'Multivitamin with Folic Acid', brand_name: 'Thera Vitamin', dose: '400 mcg tablet', instructions: 'Take 1 tablet at 11:30 AM with breakfast. For vitamin deficiency prevention (bariatric patient).', status: 'Active', notes: 'Prescription ends 6/18/2025 -- needs permanent renewal for bariatric patients. Separate from tacrolimus by 5+ hours.' },
      { patient_id: pid, medication_name: 'Sertraline', brand_name: 'Zoloft', dose: '100 mg tablet', instructions: 'Take 1 tablet at 10:00 PM. Nightly for anxiety (repeated episodes).', status: 'Active', notes: 'Bedtime reduces daytime drowsiness. Cannot refill through MyChart -- contact pharmacy.' },
      { patient_id: pid, medication_name: 'Buspirone', brand_name: 'BuSpar', dose: '10 mg tablet', instructions: 'Take 1 tablet at 10:00 PM at bedtime. For anxiety (long-term management).', status: 'Active', notes: 'Cannot refill through MyChart -- contact pharmacy.' },
      { patient_id: pid, medication_name: 'ALPRAZolam', brand_name: 'Xanax', dose: '0.5 mg tablet', instructions: 'Take 0.5 mg as needed for anxiety, up to 3 times daily. Avoid stacking with bedtime sedatives if possible.', status: 'Active', notes: 'Prescription expired May 30, 2022 -- contact provider. Fast-acting anxiety relief.' },
      { patient_id: pid, medication_name: 'TraZODone', brand_name: 'Desyrel', dose: '50 mg tablet (take 2 = 100mg)', instructions: 'Take 2 tablets (100mg total) at 11:00 PM. Last medication before sleep. As needed for sleep.', status: 'Active', notes: 'Cannot refill through MyChart -- contact pharmacy.' }
    ];
    for (const m of medsData) {
      await MedicalMedication.findOrCreate({ where: { patient_id: pid, medication_name: m.medication_name }, defaults: m });
    }

    // Lab results (April 15, 2026)
    const labsData = [
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Hemoglobin (Hgb)', test_code: 'CBC', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '7.1 g/dL (CRITICALLY LOW - Range: 12.0-15.5). Previous: 11.0', result_date: '2026-04-16', notes: 'Severe anemia. Causes: CKD (low EPO), low transferrin (iron delivery failure), protein malnutrition.' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'WBC', test_code: 'CBC', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '7.2 K/uL (Normal - Range: 4.2-10.3). Previous: 1.1', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'RDW', test_code: 'CBC', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '18.7% (HIGH - Range: 11.6-15.0). Red blood cells are different sizes -- indicates multiple anemia causes.', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'MCV', test_code: 'CBC', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '99.0 fL (High-Normal - Range: 80-100). Creeping toward macrocytic.', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Iron', test_code: 'IRON', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '109 ug/dL (Normal - Range: 30-160). Previous: 91', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'UIBC', test_code: 'IRON', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '121 ug/dL (Normal - Range: 110-370)', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Iron Saturation %', test_code: 'IRON', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '47% (SLIGHTLY HIGH - Range: 25-45). High because transferrin is low -- fewer carriers are overloaded.', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'TIBC', test_code: 'IRON', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '230 ug/dL (Normal)', result_date: '2026-04-16' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Ferritin', test_code: 'FERR', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '103.10 ng/mL (Normal - Range: 30-200). Previous: 40.50. Went UP -- iron stores are adequate.', result_date: '2026-04-17' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Transferrin', test_code: 'TRANS', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '162 mg/dL (LOW - Range: 203-362). Iron carrier protein too low. Body has iron but cannot deliver it to bone marrow.', result_date: '2026-04-16', notes: 'Low transferrin = protein malnutrition + CKD. Need more dietary protein to produce transferrin.' },
      { patient_id: pid, order_date: '2026-04-15', test_name: 'Vitamin B12', test_code: 'B12', facility: 'FCS - Center Pointe Drive, Ft. Myers, FL', ordering_doctor: 'Hassan Hasanein, MD', status: 'Completed', result_value: '434 pg/mL (In range but DROPPED 47% - Range: 200-1100). Previous: 817. Bariatric malabsorption -- may need B12 injections.', result_date: '2026-04-17' }
    ];
    for (const l of labsData) {
      await MedicalLabOrder.findOrCreate({ where: { patient_id: pid, test_name: l.test_name, order_date: l.order_date }, defaults: l });
    }

    // Providers
    const providersData = [
      { patient_id: pid, provider_name: 'Hassan Hasanein, MD', specialty: 'Hematology/Oncology', clinic: 'Florida Cancer Specialists - Wesley Chapel Tanic, 2895 Hueland Pond Blvd, Suite 100, Wesley Chapel, FL 33543', phone: '(813) 279-7107', fax: '(833) 912-1180' },
      { patient_id: pid, provider_name: 'Transplant Team', specialty: 'Nephrology / Transplant', clinic: '', notes: 'Managing tacrolimus, mycophenolic acid, predniSONE for kidney rejection prevention' }
    ];
    for (const p of providersData) {
      await MedicalProvider.findOrCreate({ where: { patient_id: pid, provider_name: p.provider_name }, defaults: p });
    }

    // Follow-ups
    const followupsData = [
      { patient_id: pid, item: 'Confirm tacrolimus target trough level with transplant team', related_to: 'Transplant Team', status: 'Pending', notes: 'Current level 3.2. Need to know if target is 5-7 at 11 years post-transplant.' },
      { patient_id: pid, item: 'Confirm twice-daily dosing for tacrolimus and mycophenolic acid', related_to: 'Transplant Team', status: 'Pending', notes: 'Was taking both once daily. Switched to twice daily per schedule analysis.' },
      { patient_id: pid, item: 'Check GFR/creatinine - transplant kidney function', related_to: 'Transplant Team', status: 'Pending', notes: 'Hemoglobin 7.1 may indicate declining kidney function (low EPO production).' },
      { patient_id: pid, item: 'Discuss EPO or darbepoetin injections for anemia', related_to: 'Hassan Hasanein, MD', status: 'Pending', notes: 'CKD anemia - kidney not producing enough erythropoietin.' },
      { patient_id: pid, item: 'Evaluate need for IV iron infusions', related_to: 'Hassan Hasanein, MD', status: 'Pending', notes: 'Transferrin too low to deliver iron to marrow. IV iron bypasses transferrin.' },
      { patient_id: pid, item: 'Discuss B12 injections vs oral supplementation', related_to: 'Hassan Hasanein, MD', status: 'Pending', notes: 'B12 dropped from 817 to 434. Bariatric gut may not absorb oral B12.' },
      { patient_id: pid, item: 'Check albumin and prealbumin levels', related_to: 'Hassan Hasanein, MD', status: 'Pending', notes: 'Confirm protein malnutrition causing low transferrin.' },
      { patient_id: pid, item: 'Renew multivitamin prescription permanently', related_to: 'Prescribing Doctor', status: 'Pending', notes: 'Current prescription ends 6/18/2025. Bariatric patients need lifelong supplementation.' },
      { patient_id: pid, item: 'Recheck Prograf level 5-7 days after switching to twice daily', related_to: 'Transplant Team', status: 'Pending', notes: 'Blood draw must be right BEFORE next dose (e.g., at 3:30 AM before 4 AM pill).' }
    ];
    for (const f of followupsData) {
      await MedicalFollowUp.findOrCreate({ where: { patient_id: pid, item: f.item }, defaults: f });
    }

    // Notes
    const notesData = [
      { patient_id: pid, note_text: 'MEDICATION SCHEDULE ANALYSIS (April 2026): Patient was taking tacrolimus once daily at 10pm with 4 other meds. Switched to twice daily (4am + 3pm) on empty stomach. Prograf level 3.2 likely due to: (1) once daily dosing, (2) not empty stomach, (3) bariatric malabsorption, (4) drug interactions at 10pm. Also was taking mycophenolic acid once daily -- switched to twice daily.', category: 'Clinical', source_document: 'AI Medication Schedule Analysis' },
      { patient_id: pid, note_text: 'ANEMIA ROOT CAUSE ANALYSIS: Three concurrent causes identified: (1) CKD anemia - transplanted kidney declining, producing less EPO. (2) Low transferrin (162) - not enough carrier protein to deliver iron to bone marrow. Iron stores are adequate (ferritin 103, iron 109) but cannot be utilized. (3) Protein malnutrition - eating ~800-1000 cal/day, insufficient protein to produce transferrin. B12 dropped 47% (817->434) due to bariatric malabsorption.', category: 'Clinical', source_document: 'Lab Results Analysis April 2026' },
      { patient_id: pid, note_text: 'DAILY ROUTINE: Wakes at 4am for bathroom, back to sleep. Up again 6-7am for bathroom, back to sleep. Stays in bed until 10-11:30am due to extreme fatigue (Hgb 7.1 = oxygen-starved). Goes downstairs for coffee + bread at 11:30am. Protein shake 80g at 4-5pm. Small snack/meal at 8pm. Bedtime meds 10-11pm. Total caloric intake estimated 800-1000 cal/day.', category: 'Clinical', source_document: 'Patient Interview' },
      { patient_id: pid, note_text: 'DIETARY RECOMMENDATIONS: Increase protein to 80-100g/day. Add eggs or Greek yogurt at 11:30am breakfast. Add mid-day snack at 2pm (cheese/almonds/cottage cheese, 10-15g protein). Keep protein shake at 4pm. Upgrade 8pm snack to real meal (4oz chicken/fish + rice/potato + vegetables, 25-30g protein). Target 1400-1600 calories/day. Post-bariatric rules: protein first, small bites, 30 chews, no liquids during meals, no carbonation, no straws.', category: 'Action Item', source_document: 'Nutrition Plan' }
    ];
    for (const n of notesData) {
      await MedicalNote.findOrCreate({ where: { patient_id: pid, note_text: n.note_text }, defaults: n });
    }

    res.json({ success: true, message: 'Lina Stagg data seeded', patient_id: pid });
  } catch (error) {
    console.error('Seed Lina error:', error.message);
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
