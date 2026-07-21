'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, sequelize } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Resolve an imaging file's bytes (disk or persistent DB base64) and downscale to a
// PDF-friendly JPEG buffer. Returns null for non-image files (DICOM/PDF/NIfTI) or on failure.
async function loadImageBufferForPdf(file) {
  const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!supported.includes(file.mime_type)) return null;
  let raw = null;
  try {
    if (file.storage_path && fs.existsSync(file.storage_path)) {
      raw = fs.readFileSync(file.storage_path);
    } else if (file.file_data) {
      raw = Buffer.from(String(file.file_data).replace(/^data:[^;]+;base64,/, ''), 'base64');
    }
  } catch { return null; }
  if (!raw) return null;
  try {
    const sharp = require('sharp');
    return await sharp(raw, { failOn: 'none' })
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch { return null; }
}

// ai_analysis is stored as JSONB (object) but may arrive as a JSON string on some drivers.
function parseObjectSafe(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
  return null;
}

// ─── FHIR R4 Helpers ───────────────────────────────────────────────────────────

function buildPatientResource(user, patient) {
  return {
    resourceType: 'Patient',
    id: String(patient.id),
    meta: {
      profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
      lastUpdated: patient.updated_at || patient.created_at
    },
    identifier: [{
      system: 'urn:imagingmind:patient-id',
      value: String(patient.id)
    }],
    active: true,
    name: [{
      use: 'official',
      family: user.last_name,
      given: [user.first_name]
    }],
    telecom: [
      ...(user.email ? [{ system: 'email', value: user.email, use: 'home' }] : []),
      ...(user.phone ? [{ system: 'phone', value: user.phone, use: 'mobile' }] : [])
    ],
    gender: mapGender(patient.gender),
    birthDate: patient.date_of_birth ? patient.date_of_birth.toISOString?.().slice(0, 10) || String(patient.date_of_birth).slice(0, 10) : undefined,
    extension: [
      ...(patient.sport ? [{
        url: 'urn:imagingmind:sport',
        valueString: patient.sport
      }] : []),
      ...(patient.team ? [{
        url: 'urn:imagingmind:team',
        valueString: patient.team
      }] : []),
      ...(patient.height_cm ? [{
        url: 'urn:imagingmind:height-cm',
        valueDecimal: parseFloat(patient.height_cm)
      }] : []),
      ...(patient.weight_kg ? [{
        url: 'urn:imagingmind:weight-kg',
        valueDecimal: parseFloat(patient.weight_kg)
      }] : [])
    ]
  };
}

function buildDiagnosticReport(report) {
  return {
    resourceType: 'DiagnosticReport',
    id: String(report.id),
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/DiagnosticReport'],
      lastUpdated: report.updated_at || report.created_at
    },
    identifier: [{
      system: 'urn:imagingmind:report-id',
      value: String(report.id)
    }],
    status: mapReportStatus(report.status),
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
        code: 'RAD',
        display: 'Radiology'
      }]
    }],
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: '36643-5',
        display: 'ImagingMind Diagnostic Report'
      }],
      text: report.report_type || 'diagnostic'
    },
    subject: {
      reference: `Patient/${report.patient_id || 'unknown'}`
    },
    effectiveDateTime: report.finalized_at || report.created_at,
    issued: report.finalized_at || report.created_at,
    performer: report.radiologist_first_name ? [{
      display: `${report.radiologist_first_name} ${report.radiologist_last_name}${report.credentials ? ', ' + report.credentials : ''}`
    }] : [],
    conclusion: report.impression || report.summary || null,
    conclusionCode: report.icd10_codes ? parseJsonSafe(report.icd10_codes).map(code => ({
      coding: [{
        system: 'http://hl7.org/fhir/sid/icd-10-cm',
        code: code
      }]
    })) : [],
    extension: [
      ...(report.severity_grade ? [{
        url: 'urn:imagingmind:severity-grade',
        valueString: report.severity_grade
      }] : []),
      ...(report.recovery_timeline_weeks ? [{
        url: 'urn:imagingmind:recovery-timeline-weeks',
        valueInteger: parseInt(report.recovery_timeline_weeks)
      }] : []),
      ...(report.recovery_description ? [{
        url: 'urn:imagingmind:recovery-description',
        valueString: report.recovery_description
      }] : []),
      ...(report.performance_impact ? [{
        url: 'urn:imagingmind:performance-impact',
        valueString: report.performance_impact
      }] : []),
      ...(report.return_to_play_recommendation ? [{
        url: 'urn:imagingmind:return-to-play',
        valueString: report.return_to_play_recommendation
      }] : [])
    ]
  };
}

function buildConditionFromCase(caseData) {
  return {
    resourceType: 'Condition',
    id: `case-${caseData.id}`,
    meta: { lastUpdated: caseData.updated_at || caseData.created_at },
    identifier: [{
      system: 'urn:imagingmind:case-number',
      value: caseData.case_number
    }],
    clinicalStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        code: mapClinicalStatus(caseData.status)
      }]
    },
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/condition-category',
        code: 'encounter-diagnosis',
        display: 'Encounter Diagnosis'
      }]
    }],
    code: {
      text: caseData.chief_complaint
    },
    subject: {
      reference: `Patient/${caseData.patient_id || 'unknown'}`
    },
    onsetDateTime: caseData.onset_date || caseData.created_at,
    bodySite: caseData.pain_location ? [{
      text: caseData.pain_location
    }] : [],
    severity: caseData.severity ? {
      text: caseData.severity
    } : undefined,
    extension: [
      ...(caseData.injury_mechanism ? [{
        url: 'urn:imagingmind:injury-mechanism',
        valueString: caseData.injury_mechanism
      }] : []),
      ...(caseData.sport_context ? [{
        url: 'urn:imagingmind:sport-context',
        valueString: caseData.sport_context
      }] : []),
      ...(caseData.urgency ? [{
        url: 'urn:imagingmind:urgency',
        valueString: caseData.urgency
      }] : [])
    ]
  };
}

function mapGender(gender) {
  if (!gender) return 'unknown';
  const g = gender.toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'other') return 'other';
  return 'unknown';
}

function mapReportStatus(status) {
  const map = {
    draft: 'preliminary',
    pending_review: 'preliminary',
    finalized: 'final',
    amended: 'amended',
    cancelled: 'cancelled'
  };
  return map[status] || 'unknown';
}

function mapClinicalStatus(caseStatus) {
  if (['closed', 'resolved', 'completed'].includes(caseStatus)) return 'resolved';
  if (['cancelled'].includes(caseStatus)) return 'inactive';
  return 'active';
}

function parseJsonSafe(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

// ─── Routes ─────────────────────────────────────────────────────────────────────

// GET /Patient/:id — FHIR R4 Patient resource
router.get('/Patient/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      WHERE p.id = $1
    `, { bind: [req.params.id] });

    if (rows.length === 0) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }]
      });
    }

    const row = rows[0];
    const resource = buildPatientResource(row, row);
    res.set('Content-Type', 'application/fhir+json');
    res.json(resource);
  } catch (err) {
    console.error('[ImagingMind-FHIR] Patient error:', err);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }]
    });
  }
});

// GET /DiagnosticReport/:id — FHIR R4 DiagnosticReport resource
router.get('/DiagnosticReport/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT r.*,
        u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name, u.credentials,
        c.patient_id
      FROM msk_reports r
      JOIN msk_users u ON r.radiologist_id = u.id
      JOIN msk_cases c ON r.case_id = c.id
      WHERE r.id = $1
    `, { bind: [req.params.id] });

    if (rows.length === 0) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'DiagnosticReport not found' }]
      });
    }

    const resource = buildDiagnosticReport(rows[0]);
    res.set('Content-Type', 'application/fhir+json');
    res.json(resource);
  } catch (err) {
    console.error('[ImagingMind-FHIR] DiagnosticReport error:', err);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }]
    });
  }
});

// GET /$export?patient=:id — FHIR R4 Bundle (all resources for a patient)
router.get('/\\$export', authenticate, async (req, res) => {
  try {
    const patientId = req.query.patient;
    if (!patientId) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: 'patient query parameter is required' }]
      });
    }

    // 1. Patient resource
    const [patientRows] = await sequelize.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      WHERE p.id = $1
    `, { bind: [patientId] });

    if (patientRows.length === 0) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }]
      });
    }

    const patientResource = buildPatientResource(patientRows[0], patientRows[0]);

    // 2. Cases as Conditions
    const [cases] = await sequelize.query(`
      SELECT c.* FROM msk_cases c WHERE c.patient_id = $1 ORDER BY c.created_at DESC
    `, { bind: [patientId] });

    const conditionResources = cases.map(c => buildConditionFromCase(c));

    // 3. Reports as DiagnosticReports
    const [reports] = await sequelize.query(`
      SELECT r.*,
        u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name, u.credentials,
        c.patient_id
      FROM msk_reports r
      JOIN msk_users u ON r.radiologist_id = u.id
      JOIN msk_cases c ON r.case_id = c.id
      WHERE c.patient_id = $1
      ORDER BY r.created_at DESC
    `, { bind: [patientId] });

    const reportResources = reports.map(r => buildDiagnosticReport(r));

    // Build Bundle
    const entries = [
      { fullUrl: `urn:imagingmind:Patient/${patientId}`, resource: patientResource },
      ...conditionResources.map(c => ({
        fullUrl: `urn:imagingmind:Condition/${c.id}`,
        resource: c
      })),
      ...reportResources.map(r => ({
        fullUrl: `urn:imagingmind:DiagnosticReport/${r.id}`,
        resource: r
      }))
    ];

    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      total: entries.length,
      timestamp: new Date().toISOString(),
      meta: {
        lastUpdated: new Date().toISOString()
      },
      entry: entries
    };

    res.set('Content-Type', 'application/fhir+json');
    res.json(bundle);
  } catch (err) {
    console.error('[ImagingMind-FHIR] $export error:', err);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: err.message }]
    });
  }
});

// GET /cases/:id/export/pdf — Generate PDF case summary
router.get('/cases/:id/export/pdf', authenticate, async (req, res) => {
  try {
    // Fetch case with patient and radiologist info
    const [cases] = await sequelize.query(`
      SELECT c.*,
        p.sport, p.team, p.date_of_birth, p.gender, p.height_cm, p.weight_kg,
        p.medical_history, p.allergies,
        u.first_name AS patient_first_name, u.last_name AS patient_last_name,
        u.email AS patient_email, u.phone AS patient_phone,
        r.first_name AS radiologist_first_name, r.last_name AS radiologist_last_name, r.credentials
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      LEFT JOIN msk_users r ON c.assigned_radiologist_id = r.id
      WHERE c.id = $1
    `, { bind: [req.params.id] });

    if (cases.length === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseData = cases[0];

    // Fetch triage decision
    const [triageRows] = await sequelize.query(`
      SELECT * FROM msk_triage_decisions
      WHERE case_id = $1
      ORDER BY created_at DESC LIMIT 1
    `, { bind: [req.params.id] });

    const triage = triageRows.length > 0 ? triageRows[0] : null;

    // Fetch reports with findings
    const [reports] = await sequelize.query(`
      SELECT r.*,
        u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name, u.credentials
      FROM msk_reports r
      LEFT JOIN msk_users u ON r.radiologist_id = u.id
      WHERE r.case_id = $1
      ORDER BY r.created_at DESC
    `, { bind: [req.params.id] });

    // Fetch findings for all reports
    const reportIds = reports.map(r => r.id);
    let findings = [];
    if (reportIds.length > 0) {
      const placeholders = reportIds.map((_, i) => `$${i + 1}`).join(',');
      const [findingRows] = await sequelize.query(
        `SELECT * FROM msk_findings WHERE report_id IN (${placeholders}) ORDER BY report_id, id`,
        { bind: reportIds }
      );
      findings = findingRows;
    }

    // Fetch recovery plans
    const [recoveryPlans] = await sequelize.query(`
      SELECT * FROM msk_recovery_plans
      WHERE case_id = $1
      ORDER BY created_at DESC LIMIT 1
    `, { bind: [req.params.id] });

    const recovery = recoveryPlans.length > 0 ? recoveryPlans[0] : null;

    // ─── Build PDF ──────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 60, right: 60 } });

    const filename = `ImagingMind-Case-${caseData.case_number || caseData.id}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ─── Letterhead ─────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a3c6e')
      .text('ImagingMind', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text('Musculoskeletal Diagnostic Platform', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#888888')
      .text('CONFIDENTIAL - HIPAA Protected Health Information', { align: 'center' });

    // Divider
    doc.moveDown(0.5);
    doc.strokeColor('#1a3c6e').lineWidth(2)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .stroke();
    doc.moveDown(0.8);

    // ─── Case Header ────────────────────────────────────────────────────────────
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a3c6e')
      .text('Case Report');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#333333');

    const caseDate = caseData.created_at
      ? new Date(caseData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A';

    doc.text(`Case Number: ${caseData.case_number || 'N/A'}        Status: ${(caseData.status || '').toUpperCase()}        Date: ${caseDate}`);
    doc.text(`Urgency: ${(caseData.urgency || 'routine').toUpperCase()}        Type: ${caseData.case_type || 'general'}`);
    doc.moveDown(0.8);

    // ─── Patient Demographics ───────────────────────────────────────────────────
    sectionHeader(doc, 'Patient Demographics');
    const patientName = caseData.patient_first_name
      ? `${caseData.patient_first_name} ${caseData.patient_last_name}`
      : 'Unknown';
    const dob = caseData.date_of_birth
      ? new Date(caseData.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A';

    infoRow(doc, 'Name', patientName);
    infoRow(doc, 'Date of Birth', dob);
    infoRow(doc, 'Gender', caseData.gender || 'N/A');
    if (caseData.patient_email) infoRow(doc, 'Email', caseData.patient_email);
    if (caseData.patient_phone) infoRow(doc, 'Phone', caseData.patient_phone);
    if (caseData.sport) infoRow(doc, 'Sport', `${caseData.sport}${caseData.team ? ' (' + caseData.team + ')' : ''}`);
    if (caseData.height_cm) infoRow(doc, 'Height', `${caseData.height_cm} cm`);
    if (caseData.weight_kg) infoRow(doc, 'Weight', `${caseData.weight_kg} kg`);
    doc.moveDown(0.5);

    // ─── Case Summary ───────────────────────────────────────────────────────────
    sectionHeader(doc, 'Case Summary');
    infoRow(doc, 'Chief Complaint', caseData.chief_complaint || 'N/A');
    if (caseData.pain_location) infoRow(doc, 'Pain Location', caseData.pain_location);
    if (caseData.severity) infoRow(doc, 'Severity', caseData.severity);
    if (caseData.injury_mechanism) infoRow(doc, 'Mechanism of Injury', caseData.injury_mechanism);
    if (caseData.onset_date) {
      infoRow(doc, 'Onset Date', new Date(caseData.onset_date).toLocaleDateString('en-US'));
    }
    if (caseData.duration_description) infoRow(doc, 'Duration', caseData.duration_description);
    if (caseData.functional_limitations) infoRow(doc, 'Functional Limitations', caseData.functional_limitations);
    if (caseData.sport_context) infoRow(doc, 'Sport Context', caseData.sport_context);
    doc.moveDown(0.5);

    // ─── Triage Result ──────────────────────────────────────────────────────────
    if (triage) {
      sectionHeader(doc, 'Triage Assessment');
      infoRow(doc, 'Decision', triage.decision_type || 'N/A');
      if (triage.imaging_protocol) infoRow(doc, 'Imaging Protocol', triage.imaging_protocol);
      if (triage.confidence_score) infoRow(doc, 'Confidence Score', `${(parseFloat(triage.confidence_score) * 100).toFixed(0)}%`);
      if (triage.reasoning) {
        doc.moveDown(0.2);
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#444444')
          .text(triage.reasoning, { width: pageWidth });
        doc.font('Helvetica');
      }
      doc.moveDown(0.5);
    }

    // ─── Reports ────────────────────────────────────────────────────────────────
    if (reports.length > 0) {
      for (const report of reports) {
        checkPageBreak(doc, 200);
        sectionHeader(doc, `Diagnostic Report — ${(report.report_type || 'diagnostic').toUpperCase()}`);

        const reportDate = report.finalized_at || report.created_at;
        if (reportDate) {
          doc.fontSize(8).fillColor('#888888')
            .text(`${report.status === 'finalized' ? 'Finalized' : 'Created'}: ${new Date(reportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'right' });
        }

        if (report.radiologist_first_name) {
          infoRow(doc, 'Radiologist', `${report.radiologist_first_name} ${report.radiologist_last_name}${report.credentials ? ', ' + report.credentials : ''}`);
        }

        if (report.summary) {
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Summary');
          doc.fontSize(9).font('Helvetica').fillColor('#444444')
            .text(report.summary, { width: pageWidth });
        }

        if (report.detailed_findings) {
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Detailed Findings');
          doc.fontSize(9).font('Helvetica').fillColor('#444444')
            .text(report.detailed_findings, { width: pageWidth });
        }

        if (report.impression) {
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Impression');
          doc.fontSize(9).font('Helvetica').fillColor('#444444')
            .text(report.impression, { width: pageWidth });
        }

        // Findings for this report
        const reportFindings = findings.filter(f => f.report_id === report.id);
        if (reportFindings.length > 0) {
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Findings');
          for (const f of reportFindings) {
            doc.fontSize(9).font('Helvetica').fillColor('#444444');
            const label = [f.body_region, f.structure, f.finding_type].filter(Boolean).join(' / ');
            doc.text(`  - ${label || 'Finding'}: ${f.description || 'N/A'}${f.severity ? ' [' + f.severity + ']' : ''}`);
          }
        }

        // ICD-10 Codes
        const icd10 = parseJsonSafe(report.icd10_codes);
        if (icd10.length > 0) {
          doc.moveDown(0.2);
          infoRow(doc, 'ICD-10 Codes', icd10.join(', '));
        }

        if (report.severity_grade) infoRow(doc, 'Severity Grade', report.severity_grade);
        if (report.recommendations) {
          const recs = parseJsonSafe(report.recommendations);
          if (recs.length > 0) {
            doc.moveDown(0.2);
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Recommendations');
            doc.fontSize(9).font('Helvetica').fillColor('#444444');
            for (const rec of recs) {
              doc.text(`  - ${typeof rec === 'string' ? rec : JSON.stringify(rec)}`);
            }
          }
        }

        doc.moveDown(0.5);
      }
    }

    // ─── Recovery Timeline ──────────────────────────────────────────────────────
    const hasRecoveryInfo = recovery || reports.some(r => r.recovery_timeline_weeks || r.recovery_description || r.return_to_play_recommendation);

    if (hasRecoveryInfo) {
      checkPageBreak(doc, 150);
      sectionHeader(doc, 'Recovery Timeline');

      for (const report of reports) {
        if (report.recovery_timeline_weeks) {
          infoRow(doc, 'Estimated Recovery', `${report.recovery_timeline_weeks} weeks`);
        }
        if (report.recovery_description) infoRow(doc, 'Recovery Plan', report.recovery_description);
        if (report.performance_impact) infoRow(doc, 'Performance Impact', report.performance_impact);
        if (report.return_to_play_recommendation) infoRow(doc, 'Return-to-Play', report.return_to_play_recommendation);
        if (report.sport_specific_notes) infoRow(doc, 'Sport-Specific Notes', report.sport_specific_notes);
      }

      if (recovery) {
        infoRow(doc, 'Plan Type', recovery.plan_type || 'N/A');
        if (recovery.start_date) infoRow(doc, 'Start Date', new Date(recovery.start_date).toLocaleDateString('en-US'));
        if (recovery.target_end_date) infoRow(doc, 'Target End Date', new Date(recovery.target_end_date).toLocaleDateString('en-US'));
        if (recovery.notes) infoRow(doc, 'Notes', recovery.notes);

        const milestones = parseJsonSafe(recovery.milestones);
        if (milestones.length > 0) {
          doc.moveDown(0.2);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Milestones');
          doc.fontSize(9).font('Helvetica').fillColor('#444444');
          for (const m of milestones) {
            const label = typeof m === 'string' ? m : (m.description || m.name || JSON.stringify(m));
            doc.text(`  - ${label}`);
          }
        }
      }

      doc.moveDown(0.5);
    }

    // ─── Imaging Studies & AI Analysis ──────────────────────────────────────────
    let imagingFilesForPdf = [];
    try {
      const [imgRows] = await sequelize.query(`
        SELECT id, file_name, file_type, mime_type, storage_path, file_data, ai_analysis, ai_analyzed_at, created_at
        FROM msk_imaging_files WHERE case_id = $1 ORDER BY id
      `, { bind: [req.params.id] });
      imagingFilesForPdf = imgRows;
    } catch (e) {
      console.error('[ImagingMind-FHIR] imaging fetch for PDF failed:', e.message);
    }

    if (imagingFilesForPdf.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'Imaging Studies & AI Analysis');
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888888')
        .text('AI-assisted preliminary reads — must be reviewed and finalized by a qualified radiologist.', { width: pageWidth });
      doc.moveDown(0.5);

      for (const f of imagingFilesForPdf) {
        checkPageBreak(doc, 360);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a3c6e')
          .text(f.file_name || `Image ${f.id}`);
        doc.fontSize(8).font('Helvetica').fillColor('#888888')
          .text(`Type: ${(f.file_type || 'image').toUpperCase()}${f.created_at ? '   Uploaded: ' + new Date(f.created_at).toLocaleDateString('en-US') : ''}`);
        doc.moveDown(0.3);

        const imgBuf = await loadImageBufferForPdf(f);
        if (imgBuf) {
          try {
            doc.image(imgBuf, { fit: [pageWidth, 300], align: 'center' });
          } catch (imgErr) {
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999')
              .text(`(Unable to embed image preview: ${imgErr.message})`);
          }
        } else {
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999')
            .text(`(Preview not available — ${(f.file_type || 'file').toUpperCase()} format is not renderable in the report)`);
        }
        doc.moveDown(0.5);

        const ai = parseObjectSafe(f.ai_analysis);
        if (ai) {
          checkPageBreak(doc, 160);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('AI Analysis');
          doc.moveDown(0.1);
          if (ai.modality || ai.bodyRegion) {
            infoRow(doc, 'Study', [ai.modality, ai.bodyRegion].filter(Boolean).join(' — '));
          }
          if (ai.impression) {
            doc.moveDown(0.2);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333').text('Impression');
            doc.fontSize(9).font('Helvetica').fillColor('#444444').text(ai.impression, { width: pageWidth });
          }
          if (ai.findings) {
            doc.moveDown(0.2);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333').text('Findings');
            doc.fontSize(9).font('Helvetica').fillColor('#444444').text(ai.findings, { width: pageWidth });
          }
          if (Array.isArray(ai.abnormalitiesDetected) && ai.abnormalitiesDetected.length) {
            doc.moveDown(0.2);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333').text('Abnormalities Detected');
            doc.fontSize(9).font('Helvetica').fillColor('#444444');
            for (const a of ai.abnormalitiesDetected) doc.text(`  - ${a}`, { width: pageWidth });
          }
          if (Array.isArray(ai.normalFindings) && ai.normalFindings.length) {
            doc.moveDown(0.2);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333').text('Normal / Unremarkable');
            doc.fontSize(9).font('Helvetica').fillColor('#444444');
            for (const n of ai.normalFindings) doc.text(`  - ${n}`, { width: pageWidth });
          }
          if (Array.isArray(ai.icd10Suggestions) && ai.icd10Suggestions.length) {
            doc.moveDown(0.2);
            const codes = ai.icd10Suggestions.map(c => typeof c === 'string' ? c : `${c.code} ${c.description || ''}`.trim());
            infoRow(doc, 'ICD-10 (suggested)', codes.join('; '));
          }
          if (ai.recommendedFollowUp) infoRow(doc, 'Recommended Follow-Up', ai.recommendedFollowUp);
          if (ai.confidenceLevel) infoRow(doc, 'AI Confidence', ai.confidenceLevel);
          if (ai.limitations) {
            doc.moveDown(0.1);
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888888').text(`Limitations: ${ai.limitations}`, { width: pageWidth });
          }
        } else {
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999').text('No AI analysis available for this image.');
        }
        doc.moveDown(0.8);
      }
    }

    // ─── Footer ─────────────────────────────────────────────────────────────────
    doc.moveDown(1);
    doc.strokeColor('#cccccc').lineWidth(0.5)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .stroke();
    doc.moveDown(0.4);
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text(`Generated by ImagingMind on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' });
    doc.text('This report is confidential and intended for authorized healthcare professionals only.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[ImagingMind-FHIR] PDF export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── PDF Helper Functions ───────────────────────────────────────────────────────

function sectionHeader(doc, title) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a3c6e').text(title);
  doc.moveDown(0.15);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.strokeColor('#dde4ee').lineWidth(0.5)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + pageWidth, doc.y)
    .stroke();
  doc.moveDown(0.3);
}

function infoRow(doc, label, value) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555')
    .text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor('#333333')
    .text(String(value || 'N/A'), { width: pageWidth - 10 });
}

function checkPageBreak(doc, requiredSpace) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < requiredSpace) {
    doc.addPage();
  }
}

module.exports = router;
