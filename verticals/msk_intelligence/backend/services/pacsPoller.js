'use strict';

/**
 * PACSPoller — Polls configured PACS connections for new DICOM studies via DICOMweb.
 * Discovers studies, matches to patients, downloads metadata, triggers AI analysis.
 */
class PACSPoller {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.timers = new Map(); // connectionId -> intervalId
    this.running = false;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[PACSPoller] Starting...');

    try {
      const [connections] = await this.sequelize.query(
        `SELECT * FROM msk_pacs_connections WHERE status = 'active'`
      );
      for (const conn of connections) {
        this.scheduleConnection(conn);
      }
      console.log(`[PACSPoller] Monitoring ${connections.length} active connections`);
    } catch (err) {
      console.error('[PACSPoller] Start error:', err.message);
    }
  }

  stop() {
    this.running = false;
    for (const [id, timerId] of this.timers) {
      clearInterval(timerId);
    }
    this.timers.clear();
    console.log('[PACSPoller] Stopped');
  }

  scheduleConnection(conn) {
    if (this.timers.has(conn.id)) {
      clearInterval(this.timers.get(conn.id));
    }

    const interval = (conn.polling_interval_seconds || 300) * 1000;
    const timerId = setInterval(() => {
      this.pollConnection(conn).catch(err => {
        console.error(`[PACSPoller] Poll error for ${conn.name}:`, err.message);
      });
    }, interval);

    this.timers.set(conn.id, timerId);

    // Initial poll after 10s delay
    setTimeout(() => {
      this.pollConnection(conn).catch(err => {
        console.error(`[PACSPoller] Initial poll error for ${conn.name}:`, err.message);
      });
    }, 10000);
  }

  async pollConnection(conn) {
    const startTime = Date.now();
    try {
      const studies = await this.discoverNewStudies(conn);

      let imported = 0;
      for (const study of studies) {
        try {
          const matched = await this.matchStudyToPatient(study, conn);
          if (matched || conn.auto_import) {
            await this.importStudy(study, conn, matched);
            imported++;

            if (conn.auto_analyze) {
              await this.triggerAIAnalysis(study, conn, matched);
            }
          }
        } catch (studyErr) {
          console.error(`[PACSPoller] Study import error:`, studyErr.message);
        }
      }

      await this.sequelize.query(`
        UPDATE msk_pacs_connections SET
          last_poll_at = NOW(), last_poll_status = 'success',
          studies_imported = studies_imported + $1
        WHERE id = $2
      `, { bind: [imported, conn.id] });

      return { discovered: studies.length, imported, duration_ms: Date.now() - startTime };
    } catch (err) {
      await this.sequelize.query(`
        UPDATE msk_pacs_connections SET
          last_poll_at = NOW(), last_poll_status = 'error',
          errors_count = errors_count + 1
        WHERE id = $1
      `, { bind: [conn.id] }).catch(() => {});

      throw err;
    }
  }

  async discoverNewStudies(conn) {
    // Build DICOMweb QIDO-RS query for studies since last poll
    const baseUrl = conn.base_url || `http://${conn.host}:${conn.port}`;
    const endpoint = `${baseUrl}/studies`;

    // Get last poll timestamp for incremental discovery
    const [pollInfo] = await this.sequelize.query(
      `SELECT last_poll_at FROM msk_pacs_connections WHERE id = $1`,
      { bind: [conn.id] }
    );

    const params = new URLSearchParams();
    if (pollInfo[0]?.last_poll_at) {
      const since = new Date(pollInfo[0].last_poll_at).toISOString().split('T')[0];
      params.set('StudyDate', `${since}-`);
    }
    params.set('limit', '100');
    params.set('includefield', 'all');

    try {
      const fetchOpts = { headers: { 'Accept': 'application/dicom+json' } };

      // Add auth if configured
      if (conn.auth_type === 'basic' && conn.auth_credentials) {
        const creds = typeof conn.auth_credentials === 'string'
          ? JSON.parse(conn.auth_credentials) : conn.auth_credentials;
        const token = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        fetchOpts.headers['Authorization'] = `Basic ${token}`;
      } else if (conn.auth_type === 'bearer' && conn.auth_credentials) {
        const creds = typeof conn.auth_credentials === 'string'
          ? JSON.parse(conn.auth_credentials) : conn.auth_credentials;
        fetchOpts.headers['Authorization'] = `Bearer ${creds.token}`;
      }

      const url = `${endpoint}?${params.toString()}`;
      const response = await fetch(url, fetchOpts);

      if (!response.ok) {
        throw new Error(`DICOMweb QIDO-RS failed: ${response.status} ${response.statusText}`);
      }

      const studies = await response.json();

      // Filter out already-imported studies
      const newStudies = [];
      for (const study of studies) {
        const studyUid = this.extractDicomValue(study, '0020000D'); // StudyInstanceUID
        if (!studyUid) continue;

        const [existing] = await this.sequelize.query(
          `SELECT id FROM msk_dicom_studies WHERE study_instance_uid = $1`,
          { bind: [studyUid] }
        );
        if (existing.length === 0) {
          newStudies.push({ raw: study, studyInstanceUid: studyUid });
        }
      }

      return newStudies;
    } catch (err) {
      // If fetch fails (network, no PACS), return empty — don't crash poller
      console.warn(`[PACSPoller] DICOMweb query failed for ${conn.name}: ${err.message}`);
      return [];
    }
  }

  async matchStudyToPatient(study, conn) {
    const patientId = this.extractDicomValue(study.raw, '00100020'); // PatientID (MRN)
    const patientName = this.extractDicomValue(study.raw, '00100010'); // PatientName
    const accessionNumber = this.extractDicomValue(study.raw, '00080050'); // AccessionNumber

    if (conn.match_strategy === 'mrn_accession' || conn.match_strategy === 'mrn') {
      if (patientId) {
        const [patients] = await this.sequelize.query(
          `SELECT id, user_id FROM msk_patients WHERE mrn = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
          { bind: [patientId, conn.tenant_id] }
        );
        if (patients.length > 0) return { patientId: patients[0].id, userId: patients[0].user_id };
      }
    }

    if (conn.match_strategy === 'mrn_accession' || conn.match_strategy === 'accession') {
      if (accessionNumber) {
        const [orders] = await this.sequelize.query(
          `SELECT io.case_id, c.patient_id FROM msk_imaging_orders io
           JOIN msk_cases c ON io.case_id = c.id
           WHERE io.accession_number = $1`,
          { bind: [accessionNumber] }
        );
        if (orders.length > 0) return { patientId: orders[0].patient_id, caseId: orders[0].case_id };
      }
    }

    return null; // No match
  }

  async importStudy(study, conn, matched) {
    const raw = study.raw;
    const studyDate = this.extractDicomValue(raw, '00080020');
    const studyTime = this.extractDicomValue(raw, '00080030');
    const modality = this.extractDicomValue(raw, '00080060');
    const studyDesc = this.extractDicomValue(raw, '00081030');
    const accession = this.extractDicomValue(raw, '00080050');
    const patientDicomId = this.extractDicomValue(raw, '00100020');
    const patientName = this.extractDicomValue(raw, '00100010');
    const numSeries = this.extractDicomValue(raw, '00201206');
    const numInstances = this.extractDicomValue(raw, '00201208');
    const institution = this.extractDicomValue(raw, '00080080');

    await this.sequelize.query(`
      INSERT INTO msk_dicom_studies
        (study_instance_uid, pacs_connection_id, patient_id, case_id,
         accession_number, study_date, study_time, modality, study_description,
         patient_dicom_id, patient_dicom_name, number_of_series, number_of_instances,
         institution_name, import_status, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'imported',$15)
    `, { bind: [
      study.studyInstanceUid, conn.id, matched?.patientId || null, matched?.caseId || null,
      accession || null, studyDate || null, studyTime || null, modality || null,
      studyDesc || null, patientDicomId || null, patientName || null,
      parseInt(numSeries) || null, parseInt(numInstances) || null,
      institution || null, conn.tenant_id
    ] });

    // If matched to a case, update the case status
    if (matched?.caseId) {
      await this.sequelize.query(
        `UPDATE msk_cases SET status = 'imaging_received', updated_at = NOW() WHERE id = $1 AND status = 'imaging_ordered'`,
        { bind: [matched.caseId] }
      );
    }
  }

  async triggerAIAnalysis(study, conn, matched) {
    if (!matched?.caseId) return;

    // Create auto-case timeline event
    await this.sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, event_data)
      VALUES ($1, 'pacs_import', 'DICOM Study Auto-Imported',
              $2, $3)
    `, { bind: [
      matched.caseId,
      `Study ${study.studyInstanceUid} auto-imported from ${conn.name}`,
      JSON.stringify({ study_uid: study.studyInstanceUid, connection: conn.name, modality: this.extractDicomValue(study.raw, '00080060') })
    ] });

    console.log(`[PACSPoller] AI analysis queued for case ${matched.caseId}, study ${study.studyInstanceUid}`);
  }

  async createAutoCase(study, conn) {
    // Create a new case from an unmatched PACS study
    const patientName = this.extractDicomValue(study.raw, '00100010') || 'Unknown';
    const modality = this.extractDicomValue(study.raw, '00080060') || 'Unknown';
    const bodyPart = this.extractDicomValue(study.raw, '00180015') || '';

    const caseNumber = `PACS-${Date.now().toString(36).toUpperCase()}`;

    const [newCase] = await this.sequelize.query(`
      INSERT INTO msk_cases (case_number, status, urgency, case_type, chief_complaint, source, tenant_id)
      VALUES ($1, 'imaging_received', 'routine', 'general', $2, 'api', $3)
      RETURNING id
    `, { bind: [
      caseNumber,
      `Auto-created from PACS: ${modality} study for ${patientName} - ${bodyPart}`,
      conn.tenant_id
    ] });

    return newCase[0]?.id;
  }

  // Helper: extract a DICOM tag value from JSON response
  extractDicomValue(dicomJson, tag) {
    if (!dicomJson || !dicomJson[tag]) return null;
    const entry = dicomJson[tag];
    if (entry.Value && entry.Value.length > 0) {
      const val = entry.Value[0];
      if (typeof val === 'object' && val.Alphabetic) return val.Alphabetic;
      return val;
    }
    return null;
  }
}

module.exports = PACSPoller;
