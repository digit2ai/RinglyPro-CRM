'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

// ── Database Connection ──────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || 'postgres://localhost:5432/msk_dev';
const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 }
});

// ── Middleware ────────────────────────────────────────────────────────
const { authenticate, authorize } = require('./middleware/auth');
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ extended: true }));

// ── API Routes ───────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const caseRoutes = require('./routes/cases');
const patientRoutes = require('./routes/patients');
const imagingRoutes = require('./routes/imaging');
const reportRoutes = require('./routes/reports');
const consultRoutes = require('./routes/consultations');
const recoveryRoutes = require('./routes/recovery');
const billingRoutes = require('./routes/billing');
const adminRoutes = require('./routes/admin');
const mcpRoutes = require('./routes/mcp');
const voiceRoutes = require('./routes/voice');
const messageRoutes = require('./routes/messages');
const videoRoutes = require('./routes/video');
const mfaRoutes = require('./routes/mfa');
const schedulingRoutes = require('./routes/scheduling');
const promsRoutes = require('./routes/proms');
const analyticsRoutes = require('./routes/analytics');
const fhirRoutes = require('./routes/fhir');
const rehabRoutes = require('./routes/rehab');
const rpmRoutes = require('./routes/rpm');
const workersCompRoutes = require('./routes/workerscomp');
const engagementRoutes = require('./routes/engagement');

router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/cases', authenticate, caseRoutes);
router.use('/api/v1/patients', authenticate, patientRoutes);
router.use('/api/v1/imaging', authenticate, imagingRoutes);
router.use('/api/v1/reports', authenticate, reportRoutes);
router.use('/api/v1/consultations', authenticate, consultRoutes);
router.use('/api/v1/recovery', authenticate, recoveryRoutes);
router.use('/api/v1/billing', authenticate, billingRoutes);
router.use('/api/v1/admin', authenticate, authorize('admin', 'radiologist'), adminRoutes);
router.use('/api/v1/mcp', mcpRoutes);
router.use('/api/v1/voice', voiceRoutes);
router.use('/api/v1/video', videoRoutes);
router.use('/api/v1/messages', authenticate, messageRoutes);
router.use('/api/v1/auth/mfa', mfaRoutes);
router.use('/api/v1/scheduling', authenticate, schedulingRoutes);
router.use('/api/v1/proms', authenticate, promsRoutes);
router.use('/api/v1/analytics', authenticate, analyticsRoutes);
router.use('/api/v1/fhir', authenticate, fhirRoutes);
router.use('/api/v1/rehab', authenticate, rehabRoutes);
router.use('/api/v1/rpm', authenticate, rpmRoutes);
router.use('/api/v1/workerscomp', authenticate, workersCompRoutes);
router.use('/api/v1/engagement', authenticate, engagementRoutes);

// Notifications API
router.get('/api/v1/notifications', authenticate, async (req, res) => {
  try {
    const [notifs] = await sequelize.query(`
      SELECT * FROM msk_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
    `, { bind: [req.user.userId] });
    const [unread] = await sequelize.query(`
      SELECT COUNT(*) as count FROM msk_notifications WHERE user_id = $1 AND is_read = FALSE
    `, { bind: [req.user.userId] });
    res.json({ success: true, data: notifs, unreadCount: parseInt(unread[0]?.count || 0) });
  } catch (err) { res.json({ success: true, data: [], unreadCount: 0 }); }
});

router.post('/api/v1/notifications/mark-read', authenticate, async (req, res) => {
  try {
    await sequelize.query(`UPDATE msk_notifications SET is_read = TRUE WHERE user_id = $1`, { bind: [req.user.userId] });
    res.json({ success: true });
  } catch (err) { res.json({ success: true }); }
});

// Billing claims routes
router.get('/api/v1/billing/claims', authenticate, async (req, res) => {
  try {
    const [claims] = await sequelize.query(`SELECT * FROM msk_claims ORDER BY created_at DESC LIMIT 100`);
    res.json({ success: true, data: claims });
  } catch (err) { res.json({ success: true, data: [] }); }
});

// ROM Measurements
router.post('/api/v1/rom/measurements', authenticate, async (req, res) => {
  try {
    const { caseId, consultationId, assessmentType, bodySide, angleDegrees, normalRangeMin, normalRangeMax, collectionPoint } = req.body;
    if (!caseId || !assessmentType || angleDegrees === undefined) {
      return res.status(400).json({ error: 'caseId, assessmentType, and angleDegrees required' });
    }
    const [result] = await sequelize.query(`
      INSERT INTO msk_rom_measurements (case_id, consultation_id, patient_id, assessment_type, body_side, angle_degrees, normal_range_min, normal_range_max, collection_point)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, { bind: [caseId, consultationId || null, req.user.userId, assessmentType, bodySide || 'right', angleDegrees, normalRangeMin || 0, normalRangeMax || 180, collectionPoint || 'follow_up'] });
    res.status(201).json({ success: true, data: result[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/v1/rom/measurements/:caseId', authenticate, async (req, res) => {
  try {
    const [measurements] = await sequelize.query(
      `SELECT * FROM msk_rom_measurements WHERE case_id = $1 ORDER BY measured_at DESC`,
      { bind: [req.params.caseId] }
    );
    res.json({ success: true, data: measurements });
  } catch (err) { res.json({ success: true, data: [] }); }
});

router.get('/api/v1/billing/dashboard', authenticate, async (req, res) => {
  try {
    const [summary] = await sequelize.query(`
      SELECT
        COALESCE(SUM(billed_amount), 0) AS total_billed,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END), 0) AS denied_count,
        COUNT(*) AS total_claims
      FROM msk_claims
    `);
    res.json({ success: true, data: summary[0] });
  } catch (err) { res.json({ success: true, data: {} }); }
});

// ── Health Check ─────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'healthy',
      service: 'MSK Intelligence',
      version: '1.0.0',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// ── Database Schema Migration ────────────────────────────────────────
async function runMigrations() {
  try {
    await sequelize.authenticate();
    console.log('[MSK] Database connected');

    // Users & Auth
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'patient'
          CHECK (role IN ('patient','radiologist','admin','b2b_manager','staff')),
        phone VARCHAR(30),
        organization_id INTEGER,
        specialty VARCHAR(200),
        credentials VARCHAR(500),
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_users_email ON msk_users(email);
      CREATE INDEX IF NOT EXISTS idx_msk_users_role ON msk_users(role);
    `);

    // Patients (extended profile)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_patients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES msk_users(id) ON DELETE CASCADE,
        date_of_birth DATE,
        gender VARCHAR(20),
        sport VARCHAR(100),
        team VARCHAR(200),
        position VARCHAR(100),
        height_cm NUMERIC(5,1),
        weight_kg NUMERIC(5,1),
        medical_history JSONB DEFAULT '[]',
        allergies JSONB DEFAULT '[]',
        current_medications JSONB DEFAULT '[]',
        insurance_info JSONB DEFAULT '{}',
        emergency_contact JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_patients_user ON msk_patients(user_id);
    `);

    // Cases (core workflow entity)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_cases (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(20) UNIQUE NOT NULL,
        patient_id INTEGER REFERENCES msk_patients(id),
        assigned_radiologist_id INTEGER REFERENCES msk_users(id),
        status VARCHAR(50) NOT NULL DEFAULT 'intake'
          CHECK (status IN ('intake','triage','imaging_ordered','imaging_received',
            'under_review','report_ready','consult_scheduled','consult_complete',
            'follow_up','closed','emergency')),
        urgency VARCHAR(20) NOT NULL DEFAULT 'routine'
          CHECK (urgency IN ('routine','priority','urgent','emergency')),
        case_type VARCHAR(50)
          CHECK (case_type IN ('joint','spine','soft_tissue','fracture','post_surgical','general')),
        chief_complaint TEXT,
        pain_location VARCHAR(200),
        pain_location_body_map JSONB,
        injury_mechanism VARCHAR(50)
          CHECK (injury_mechanism IN ('trauma','overuse','acute','chronic','unknown')),
        onset_date DATE,
        duration_description TEXT,
        severity INTEGER CHECK (severity BETWEEN 1 AND 10),
        functional_limitations TEXT,
        sport_context VARCHAR(200),
        prior_imaging_history TEXT,
        intake_data JSONB DEFAULT '{}',
        triage_result JSONB,
        ai_preliminary_assessment TEXT,
        pricing_tier VARCHAR(50)
          CHECK (pricing_tier IN ('imaging_review','full_diagnostic','elite_concierge')),
        source VARCHAR(50) DEFAULT 'web'
          CHECK (source IN ('voice','web','b2b','referral','api')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_cases_patient ON msk_cases(patient_id);
      CREATE INDEX IF NOT EXISTS idx_msk_cases_radiologist ON msk_cases(assigned_radiologist_id);
      CREATE INDEX IF NOT EXISTS idx_msk_cases_status ON msk_cases(status);
      CREATE INDEX IF NOT EXISTS idx_msk_cases_urgency ON msk_cases(urgency);
    `);

    // Case Timeline
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_case_timeline (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        event_title VARCHAR(200) NOT NULL,
        event_description TEXT,
        event_data JSONB DEFAULT '{}',
        performed_by INTEGER REFERENCES msk_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_timeline_case ON msk_case_timeline(case_id);
    `);

    // Triage Decisions
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_triage_decisions (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        decision_type VARCHAR(50) NOT NULL
          CHECK (decision_type IN ('imaging_required','direct_consult','emergency_escalation')),
        imaging_protocol TEXT,
        reasoning TEXT,
        confidence_score NUMERIC(3,2),
        ai_model VARCHAR(100),
        reviewed_by INTEGER REFERENCES msk_users(id),
        review_status VARCHAR(20) DEFAULT 'pending'
          CHECK (review_status IN ('pending','approved','overridden')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_triage_case ON msk_triage_decisions(case_id);
    `);

    // Imaging Centers
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_imaging_centers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(50),
        zip VARCHAR(20),
        country VARCHAR(50) DEFAULT 'US',
        phone VARCHAR(30),
        email VARCHAR(255),
        website VARCHAR(500),
        modalities JSONB DEFAULT '["MRI","CT","Ultrasound","X-Ray"]',
        operating_hours JSONB DEFAULT '{}',
        accepts_direct_booking BOOLEAN DEFAULT false,
        partnership_tier VARCHAR(50),
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Imaging Orders
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_imaging_orders (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        imaging_center_id INTEGER REFERENCES msk_imaging_centers(id),
        modality VARCHAR(50) NOT NULL
          CHECK (modality IN ('MRI','CT','Ultrasound','X-Ray','DEXA','PET')),
        body_region VARCHAR(100) NOT NULL,
        protocol TEXT,
        clinical_indication TEXT,
        status VARCHAR(50) DEFAULT 'ordered'
          CHECK (status IN ('ordered','scheduled','completed','uploaded','cancelled')),
        scheduled_date TIMESTAMPTZ,
        completed_date TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_imaging_case ON msk_imaging_orders(case_id);
    `);

    // Imaging Files
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_imaging_files (
        id SERIAL PRIMARY KEY,
        imaging_order_id INTEGER REFERENCES msk_imaging_orders(id) ON DELETE CASCADE,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL
          CHECK (file_type IN ('dicom','nifti','jpg','png','pdf')),
        file_size_bytes BIGINT,
        storage_path TEXT NOT NULL,
        storage_url TEXT,
        mime_type VARCHAR(100),
        series_description VARCHAR(200),
        modality VARCHAR(50),
        is_primary BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        uploaded_by INTEGER REFERENCES msk_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_files_case ON msk_imaging_files(case_id);
      CREATE INDEX IF NOT EXISTS idx_msk_files_order ON msk_imaging_files(imaging_order_id);
    `);

    // Reports
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_reports (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        radiologist_id INTEGER NOT NULL REFERENCES msk_users(id),
        report_type VARCHAR(50) DEFAULT 'diagnostic'
          CHECK (report_type IN ('diagnostic','follow_up','screening','second_opinion')),
        status VARCHAR(50) DEFAULT 'draft'
          CHECK (status IN ('draft','pending_review','finalized','amended','addendum')),
        summary TEXT,
        detailed_findings TEXT,
        impression TEXT,
        icd10_codes JSONB DEFAULT '[]',
        severity_grade VARCHAR(50),
        severity_scale VARCHAR(100),
        recovery_timeline_weeks INTEGER,
        recovery_description TEXT,
        performance_impact TEXT,
        return_to_play_recommendation TEXT,
        sport_specific_notes TEXT,
        comparison_with_prior TEXT,
        recommendations JSONB DEFAULT '[]',
        pdf_url TEXT,
        video_explanation_url TEXT,
        finalized_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_reports_case ON msk_reports(case_id);
      CREATE INDEX IF NOT EXISTS idx_msk_reports_radiologist ON msk_reports(radiologist_id);
    `);

    // Findings (individual findings within a report)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_findings (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES msk_reports(id) ON DELETE CASCADE,
        body_region VARCHAR(100),
        structure VARCHAR(200),
        finding_type VARCHAR(100),
        description TEXT NOT NULL,
        severity VARCHAR(50),
        measurements JSONB DEFAULT '{}',
        imaging_reference VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_findings_report ON msk_findings(report_id);
    `);

    // Annotations
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_annotations (
        id SERIAL PRIMARY KEY,
        imaging_file_id INTEGER NOT NULL REFERENCES msk_imaging_files(id) ON DELETE CASCADE,
        report_id INTEGER REFERENCES msk_reports(id),
        annotation_type VARCHAR(50)
          CHECK (annotation_type IN ('arrow','circle','measurement','text','freehand')),
        coordinates JSONB NOT NULL,
        label TEXT,
        color VARCHAR(20) DEFAULT '#FF4444',
        created_by INTEGER REFERENCES msk_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_annotations_file ON msk_annotations(imaging_file_id);
    `);

    // Consultations (video calls)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_consultations (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES msk_patients(id),
        radiologist_id INTEGER NOT NULL REFERENCES msk_users(id),
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_minutes INTEGER DEFAULT 30,
        status VARCHAR(50) DEFAULT 'scheduled'
          CHECK (status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
        meeting_url TEXT,
        recording_url TEXT,
        notes TEXT,
        completed_at TIMESTAMPTZ,
        cancelled_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_consult_case ON msk_consultations(case_id);
      CREATE INDEX IF NOT EXISTS idx_msk_consult_scheduled ON msk_consultations(scheduled_at);
    `);

    // Messages
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_messages (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES msk_users(id),
        recipient_id INTEGER REFERENCES msk_users(id),
        message_type VARCHAR(50) DEFAULT 'text'
          CHECK (message_type IN ('text','file','system','notification')),
        content TEXT NOT NULL,
        attachment_url TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_messages_case ON msk_messages(case_id);
    `);

    // Recovery Plans
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_recovery_plans (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES msk_patients(id),
        plan_type VARCHAR(50)
          CHECK (plan_type IN ('physiotherapy','training_modification','rehabilitation','maintenance')),
        status VARCHAR(50) DEFAULT 'active'
          CHECK (status IN ('active','completed','paused','cancelled')),
        start_date DATE,
        target_end_date DATE,
        milestones JSONB DEFAULT '[]',
        protocols JSONB DEFAULT '[]',
        notes TEXT,
        created_by INTEGER REFERENCES msk_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_recovery_case ON msk_recovery_plans(case_id);
    `);

    // Referrals
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_referrals (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES msk_cases(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES msk_patients(id),
        referral_type VARCHAR(50)
          CHECK (referral_type IN ('physiotherapy','orthopedic','neurology','sports_medicine','surgery','other')),
        provider_name VARCHAR(200),
        provider_contact TEXT,
        reason TEXT,
        urgency VARCHAR(20) DEFAULT 'routine',
        status VARCHAR(50) DEFAULT 'pending'
          CHECK (status IN ('pending','sent','accepted','completed','declined')),
        notes TEXT,
        created_by INTEGER REFERENCES msk_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Subscriptions
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_subscriptions (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES msk_patients(id),
        organization_id INTEGER,
        plan_type VARCHAR(50) NOT NULL
          CHECK (plan_type IN ('imaging_review','full_diagnostic','elite_concierge',
            'team_basic','team_premium','clinic_partner')),
        status VARCHAR(50) DEFAULT 'active'
          CHECK (status IN ('active','paused','cancelled','expired','trial')),
        price_cents INTEGER NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        billing_cycle VARCHAR(20) DEFAULT 'monthly'
          CHECK (billing_cycle IN ('one_time','monthly','quarterly','annual')),
        stripe_subscription_id VARCHAR(200),
        stripe_customer_id VARCHAR(200),
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_subs_patient ON msk_subscriptions(patient_id);
    `);

    // Invoices
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_invoices (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        patient_id INTEGER REFERENCES msk_patients(id),
        subscription_id INTEGER REFERENCES msk_subscriptions(id),
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(50) DEFAULT 'pending'
          CHECK (status IN ('pending','paid','failed','refunded','void')),
        description TEXT,
        stripe_invoice_id VARCHAR(200),
        stripe_payment_intent_id VARCHAR(200),
        paid_at TIMESTAMPTZ,
        due_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_invoices_patient ON msk_invoices(patient_id);
    `);

    // B2B Contracts
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_b2b_contracts (
        id SERIAL PRIMARY KEY,
        organization_name VARCHAR(200) NOT NULL,
        organization_type VARCHAR(50)
          CHECK (organization_type IN ('sports_team','motorsport_team','clinic','gym','other')),
        contact_name VARCHAR(200),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(30),
        contract_type VARCHAR(50),
        monthly_value_cents INTEGER,
        included_cases_per_month INTEGER,
        status VARCHAR(50) DEFAULT 'active'
          CHECK (status IN ('prospect','negotiation','active','paused','expired','terminated')),
        start_date DATE,
        end_date DATE,
        terms JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Audit Log (HIPAA compliance)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES msk_users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id INTEGER,
        ip_address VARCHAR(45),
        user_agent TEXT,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_audit_user ON msk_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_msk_audit_resource ON msk_audit_log(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_msk_audit_created ON msk_audit_log(created_at);
    `);

    // MFA columns
    await sequelize.query(`
      ALTER TABLE msk_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
      ALTER TABLE msk_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE msk_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
    `);

    // Phase 1: Scheduling tables
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_provider_availability (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER REFERENCES msk_users(id),
        day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME,
        end_time TIME,
        slot_duration_minutes INT DEFAULT 30,
        buffer_minutes INT DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_avail_provider ON msk_provider_availability(provider_id);

      CREATE TABLE IF NOT EXISTS msk_appointments (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        patient_id INTEGER REFERENCES msk_users(id),
        provider_id INTEGER REFERENCES msk_users(id),
        consultation_id INTEGER REFERENCES msk_consultations(id),
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_minutes INT DEFAULT 30,
        status VARCHAR(20) DEFAULT 'scheduled'
          CHECK (status IN ('scheduled','confirmed','cancelled','completed','no_show')),
        reminder_24h_sent BOOLEAN DEFAULT FALSE,
        reminder_1h_sent BOOLEAN DEFAULT FALSE,
        cancel_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_appt_scheduled ON msk_appointments(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_msk_appt_patient ON msk_appointments(patient_id);
      CREATE INDEX IF NOT EXISTS idx_msk_appt_provider ON msk_appointments(provider_id);
    `);

    // Phase 1: Notifications table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES msk_users(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT,
        link TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_notif_user ON msk_notifications(user_id, is_read);
    `);

    // Phase 2: PROM instruments + submissions
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_prom_instruments (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        questions JSONB NOT NULL DEFAULT '[]',
        scoring_formula VARCHAR(20) DEFAULT 'average'
      );

      CREATE TABLE IF NOT EXISTS msk_prom_submissions (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        patient_id INTEGER REFERENCES msk_users(id),
        instrument_code VARCHAR(20),
        answers JSONB NOT NULL DEFAULT '{}',
        score NUMERIC(5,2),
        collection_point VARCHAR(30),
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_prom_sub_case ON msk_prom_submissions(case_id);
      CREATE INDEX IF NOT EXISTS idx_msk_prom_sub_patient ON msk_prom_submissions(patient_id, submitted_at);
    `);

    // Phase 2: Tenants
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_tenants (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(60) UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan VARCHAR(20) DEFAULT 'starter',
        logo_url TEXT,
        primary_color VARCHAR(7) DEFAULT '#0E7490',
        custom_domain TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add tenant_id to core tables (nullable for backward compat)
    await sequelize.query(`
      ALTER TABLE msk_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_reports ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_consultations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_imaging_files ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_appointments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_prom_submissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
      ALTER TABLE msk_messages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES msk_tenants(id);
    `);

    // Phase 2: Insurance eligibility
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_insurance_eligibility (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES msk_users(id),
        appointment_id INTEGER REFERENCES msk_appointments(id),
        payer_name TEXT,
        member_id TEXT,
        group_number TEXT,
        coverage_active BOOLEAN,
        copay_amount NUMERIC(8,2),
        deductible_remaining NUMERIC(8,2),
        in_network BOOLEAN,
        raw_response JSONB,
        checked_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Phase 3: CPT codes + claims
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_cpt_codes (
        code VARCHAR(10) PRIMARY KEY,
        description TEXT,
        category VARCHAR(30),
        base_rate NUMERIC(8,2)
      );

      CREATE TABLE IF NOT EXISTS msk_claims (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES msk_tenants(id),
        patient_id INTEGER REFERENCES msk_users(id),
        case_id INTEGER REFERENCES msk_cases(id),
        consultation_id INTEGER REFERENCES msk_consultations(id),
        claim_number TEXT UNIQUE,
        payer_name TEXT,
        member_id TEXT,
        cpt_codes JSONB NOT NULL DEFAULT '[]',
        icd10_codes JSONB NOT NULL DEFAULT '[]',
        billed_amount NUMERIC(10,2),
        allowed_amount NUMERIC(10,2),
        paid_amount NUMERIC(10,2),
        patient_responsibility NUMERIC(10,2),
        status VARCHAR(20) DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','accepted','denied','appealed','paid')),
        submitted_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        denial_reason TEXT,
        raw_clearinghouse_response JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_claims_tenant ON msk_claims(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_msk_claims_patient ON msk_claims(patient_id);
    `);

    // Seed default tenant
    const [existingTenant] = await sequelize.query(
      `SELECT id FROM msk_tenants WHERE slug = 'msk-intelligence' LIMIT 1`
    );
    if (existingTenant.length === 0) {
      await sequelize.query(`
        INSERT INTO msk_tenants (slug, name, plan) VALUES ('msk-intelligence', 'MSK Intelligence', 'enterprise')
      `);
      console.log('[MSK] Default tenant seeded');
    }

    // Seed PROM instruments
    const [existingProm] = await sequelize.query(
      `SELECT code FROM msk_prom_instruments WHERE code = 'VAS' LIMIT 1`
    );
    if (existingProm.length === 0) {
      await sequelize.query(`
        INSERT INTO msk_prom_instruments (code, name, description, questions, scoring_formula) VALUES
        ('VAS', 'Visual Analog Scale', 'Pain intensity scale 0-10', '[{"id":"pain","text":"Rate your current pain level","type":"scale","min":0,"max":10}]', 'sum'),
        ('KOOS', 'Knee Injury & Osteoarthritis Outcome Score', 'Knee-specific 42-question assessment', '[{"id":"k1","text":"How often is your knee swollen?","type":"likert","options":["Never","Rarely","Sometimes","Often","Always"]},{"id":"k2","text":"Grinding or clicking from knee?","type":"likert","options":["Never","Rarely","Sometimes","Often","Always"]},{"id":"k3","text":"Does your knee catch or lock?","type":"likert","options":["Never","Rarely","Sometimes","Often","Always"]},{"id":"k4","text":"Can you straighten your knee fully?","type":"likert","options":["Always","Often","Sometimes","Rarely","Never"]},{"id":"k5","text":"Can you bend your knee fully?","type":"likert","options":["Always","Often","Sometimes","Rarely","Never"]}]', 'average'),
        ('DASH', 'Disabilities of Arm, Shoulder & Hand', 'Upper extremity 30-question assessment', '[{"id":"d1","text":"Open a tight or new jar","type":"likert","options":["No difficulty","Mild","Moderate","Severe","Unable"]},{"id":"d2","text":"Write","type":"likert","options":["No difficulty","Mild","Moderate","Severe","Unable"]},{"id":"d3","text":"Turn a key","type":"likert","options":["No difficulty","Mild","Moderate","Severe","Unable"]},{"id":"d4","text":"Prepare a meal","type":"likert","options":["No difficulty","Mild","Moderate","Severe","Unable"]},{"id":"d5","text":"Push open a heavy door","type":"likert","options":["No difficulty","Mild","Moderate","Severe","Unable"]}]', 'average'),
        ('ODI', 'Oswestry Disability Index', 'Spine/back disability 10-section assessment', '[{"id":"o1","text":"Pain intensity right now","type":"scale","min":0,"max":5},{"id":"o2","text":"Personal care (washing, dressing)","type":"scale","min":0,"max":5},{"id":"o3","text":"Lifting","type":"scale","min":0,"max":5},{"id":"o4","text":"Walking","type":"scale","min":0,"max":5},{"id":"o5","text":"Sitting","type":"scale","min":0,"max":5}]', 'average'),
        ('PROMIS_PF', 'PROMIS Physical Function', 'General physical function short form', '[{"id":"pf1","text":"Are you able to do chores such as vacuuming or yard work?","type":"likert","options":["Without any difficulty","With a little difficulty","With some difficulty","With much difficulty","Unable to do"]},{"id":"pf2","text":"Are you able to go up and down stairs at a normal pace?","type":"likert","options":["Without any difficulty","With a little difficulty","With some difficulty","With much difficulty","Unable to do"]},{"id":"pf3","text":"Are you able to run errands and shop?","type":"likert","options":["Without any difficulty","With a little difficulty","With some difficulty","With much difficulty","Unable to do"]},{"id":"pf4","text":"Are you able to walk for 15 minutes?","type":"likert","options":["Without any difficulty","With a little difficulty","With some difficulty","With much difficulty","Unable to do"]}]', 'average')
      `);
      console.log('[MSK] PROM instruments seeded');
    }

    // Seed CPT codes
    const [existingCpt] = await sequelize.query(
      `SELECT code FROM msk_cpt_codes WHERE code = '99213' LIMIT 1`
    );
    if (existingCpt.length === 0) {
      await sequelize.query(`
        INSERT INTO msk_cpt_codes (code, description, category, base_rate) VALUES
        ('99213', 'Office/Outpatient visit, established, moderate complexity (telehealth)', 'telehealth', 115.00),
        ('99214', 'Office/Outpatient visit, established, high complexity (telehealth)', 'telehealth', 167.00),
        ('99453', 'Remote monitoring setup and patient education', 'rpm', 19.00),
        ('99454', 'Remote monitoring device supply 16+ days', 'rpm', 64.00),
        ('99457', 'Remote monitoring treatment management, first 20 min/month', 'rpm', 54.00),
        ('99458', 'Remote monitoring treatment management, each additional 20 min', 'rpm', 41.00),
        ('72148', 'MRI lumbar spine without contrast', 'imaging', 328.00),
        ('73221', 'MRI shoulder joint without contrast', 'imaging', 286.00)
      `);
      console.log('[MSK] CPT codes seeded');
    }

    // Phase 4: ROM Measurements
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_rom_measurements (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        consultation_id INTEGER REFERENCES msk_consultations(id),
        patient_id INTEGER REFERENCES msk_users(id),
        tenant_id INTEGER REFERENCES msk_tenants(id),
        assessment_type VARCHAR(50),
        body_side VARCHAR(10),
        angle_degrees NUMERIC(5,1),
        normal_range_min NUMERIC(5,1),
        normal_range_max NUMERIC(5,1),
        snapshot_url TEXT,
        collection_point VARCHAR(30),
        measured_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_rom_case ON msk_rom_measurements(case_id);
    `);

    // Phase 4: Exercise Library + HEP
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_exercise_library (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        body_region VARCHAR(30),
        category VARCHAR(30),
        instructions TEXT,
        video_url TEXT,
        thumbnail_url TEXT,
        sets_default INT DEFAULT 3,
        reps_default INT DEFAULT 10,
        hold_seconds_default INT,
        frequency_per_week INT DEFAULT 5,
        difficulty VARCHAR(10) DEFAULT 'moderate'
      );

      CREATE TABLE IF NOT EXISTS msk_hep_programs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        patient_id INTEGER REFERENCES msk_users(id),
        provider_id INTEGER REFERENCES msk_users(id),
        tenant_id INTEGER REFERENCES msk_tenants(id),
        name TEXT,
        start_date DATE,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'active'
          CHECK (status IN ('active','completed','paused','cancelled')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS msk_hep_exercises (
        id SERIAL PRIMARY KEY,
        program_id INTEGER REFERENCES msk_hep_programs(id) ON DELETE CASCADE,
        exercise_id INTEGER REFERENCES msk_exercise_library(id),
        sets INT,
        reps INT,
        hold_seconds INT,
        frequency_per_week INT,
        notes TEXT,
        sort_order INT
      );

      CREATE TABLE IF NOT EXISTS msk_hep_sessions (
        id SERIAL PRIMARY KEY,
        program_id INTEGER REFERENCES msk_hep_programs(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES msk_users(id),
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        exercises_completed JSONB DEFAULT '[]',
        overall_pain_score SMALLINT,
        duration_minutes INT
      );
      CREATE INDEX IF NOT EXISTS idx_msk_hep_sessions_program ON msk_hep_sessions(program_id);
    `);

    // Phase 4: Workers' Comp extensions
    await sequelize.query(`
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS employer_name TEXT;
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS employer_contact_email TEXT;
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS claim_number TEXT;
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS injury_date DATE;
      ALTER TABLE msk_cases ADD COLUMN IF NOT EXISTS tpa_name TEXT;

      CREATE TABLE IF NOT EXISTS msk_employers (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES msk_tenants(id),
        name TEXT NOT NULL,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        tpa_name TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS msk_ime_reports (
        id SERIAL PRIMARY KEY,
        case_id INTEGER REFERENCES msk_cases(id),
        provider_id INTEGER REFERENCES msk_users(id),
        employer_id INTEGER REFERENCES msk_employers(id),
        work_related BOOLEAN,
        causation_opinion TEXT,
        max_medical_improvement_date DATE,
        permanent_impairment_rating NUMERIC(4,1),
        work_restrictions TEXT,
        return_to_work_date DATE,
        report_text TEXT,
        pdf_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Phase 4: RPM
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS msk_rpm_enrollments (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES msk_users(id),
        case_id INTEGER REFERENCES msk_cases(id),
        provider_id INTEGER REFERENCES msk_users(id),
        tenant_id INTEGER REFERENCES msk_tenants(id),
        start_date DATE,
        end_date DATE,
        monitoring_type VARCHAR(30),
        status VARCHAR(20) DEFAULT 'active',
        cpt_code VARCHAR(10) DEFAULT '99454',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS msk_rpm_readings (
        id SERIAL PRIMARY KEY,
        enrollment_id INTEGER REFERENCES msk_rpm_enrollments(id),
        patient_id INTEGER REFERENCES msk_users(id),
        reading_type VARCHAR(30),
        value NUMERIC(10,2),
        unit TEXT,
        source VARCHAR(20),
        recorded_at TIMESTAMPTZ NOT NULL,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_msk_rpm_readings ON msk_rpm_readings(enrollment_id, recorded_at);
    `);

    // Seed exercise library
    const [existingExercises] = await sequelize.query(
      `SELECT id FROM msk_exercise_library LIMIT 1`
    );
    if (existingExercises.length === 0) {
      await sequelize.query(`
        INSERT INTO msk_exercise_library (name, description, body_region, category, instructions, sets_default, reps_default, hold_seconds_default, frequency_per_week, difficulty) VALUES
        ('Quad Sets', 'Isometric quadriceps contraction', 'knee', 'strengthening', 'Sit with leg extended. Tighten thigh muscle pressing back of knee into floor. Hold 5 seconds.', 3, 10, 5, 5, 'easy'),
        ('Straight Leg Raise', 'Hip flexion with knee locked', 'knee', 'strengthening', 'Lie on back. Tighten thigh, raise leg 12 inches off floor with knee locked. Hold 3 seconds.', 3, 10, 3, 5, 'easy'),
        ('Heel Slides', 'Active knee flexion in supine', 'knee', 'range_of_motion', 'Lie on back. Slide heel toward buttock bending knee as far as comfortable. Slowly return.', 3, 15, NULL, 5, 'easy'),
        ('Wall Slides', 'Partial squat against wall', 'knee', 'strengthening', 'Lean back against wall, feet 12 inches from wall. Slide down 45 degrees. Hold 5 seconds.', 3, 10, 5, 4, 'moderate'),
        ('Step-Ups', 'Forward step onto elevated surface', 'knee', 'strengthening', 'Step up onto a 6-inch step leading with affected leg. Step down slowly. Repeat.', 3, 10, NULL, 4, 'moderate'),
        ('Pendulum Exercises', 'Gravity-assisted shoulder ROM', 'shoulder', 'range_of_motion', 'Bend at waist supporting yourself with unaffected arm. Let affected arm hang. Swing gently in circles.', 3, 15, NULL, 5, 'easy'),
        ('Wall Crawl', 'Shoulder flexion using wall', 'shoulder', 'range_of_motion', 'Face wall at arms length. Walk fingers up the wall as high as possible. Hold at top 5 seconds.', 3, 10, 5, 5, 'easy'),
        ('External Rotation with Band', 'Rotator cuff strengthening', 'shoulder', 'strengthening', 'Elbow at side bent 90 degrees. Hold resistance band. Rotate forearm outward. Slowly return.', 3, 12, NULL, 4, 'moderate'),
        ('Shoulder Shrugs', 'Upper trapezius activation', 'shoulder', 'strengthening', 'Stand straight. Raise shoulders toward ears. Hold 3 seconds. Lower slowly.', 3, 15, 3, 5, 'easy'),
        ('Scapular Squeezes', 'Rhomboid and mid-trap activation', 'shoulder', 'strengthening', 'Sit or stand tall. Squeeze shoulder blades together. Hold 5 seconds. Release.', 3, 12, 5, 5, 'easy'),
        ('Cat-Cow Stretch', 'Spinal mobility exercise', 'spine', 'range_of_motion', 'On hands and knees. Arch back up (cat). Then let belly drop (cow). Alternate slowly.', 3, 10, NULL, 5, 'easy'),
        ('Pelvic Tilts', 'Core stabilization', 'spine', 'strengthening', 'Lie on back, knees bent. Flatten lower back into floor by tightening abs. Hold 5 seconds.', 3, 15, 5, 5, 'easy'),
        ('Bird-Dog', 'Core and balance exercise', 'spine', 'strengthening', 'On hands and knees. Extend opposite arm and leg simultaneously. Hold 5 seconds. Alternate.', 3, 10, 5, 4, 'moderate'),
        ('Bridges', 'Glute and core activation', 'spine', 'strengthening', 'Lie on back, knees bent. Lift hips off floor squeezing glutes. Hold 5 seconds. Lower slowly.', 3, 12, 5, 5, 'easy'),
        ('Child Pose', 'Lumbar flexion stretch', 'spine', 'stretching', 'Kneel and sit back on heels. Reach arms forward on floor. Hold and breathe deeply.', 3, 1, 30, 5, 'easy'),
        ('Hip Flexor Stretch', 'Iliopsoas lengthening', 'hip', 'stretching', 'Kneel on affected side. Push hips forward keeping back upright. Hold 30 seconds.', 3, 3, 30, 5, 'easy'),
        ('Clamshells', 'Hip abductor strengthening', 'hip', 'strengthening', 'Lie on side, knees bent. Keep feet together, open top knee like a clamshell. Hold 3 seconds.', 3, 15, 3, 5, 'easy'),
        ('Single Leg Balance', 'Proprioception training', 'ankle', 'balance', 'Stand on one foot near a support. Hold balance for 30 seconds. Progress to eyes closed.', 3, 3, 30, 5, 'moderate'),
        ('Ankle Alphabet', 'Ankle mobility exercise', 'ankle', 'range_of_motion', 'Sit with foot elevated. Trace the alphabet in the air with your big toe. Complete A-Z.', 2, 1, NULL, 5, 'easy'),
        ('Calf Raises', 'Gastrocnemius strengthening', 'ankle', 'strengthening', 'Stand on edge of step. Rise up on toes. Hold 2 seconds. Lower slowly below step level.', 3, 15, 2, 4, 'moderate')
      `);
      console.log('[MSK] Exercise library seeded (20 exercises)');
    }

    // Seed provider availability for demo radiologist
    const [existingAvail] = await sequelize.query(
      `SELECT id FROM msk_provider_availability LIMIT 1`
    );
    if (existingAvail.length === 0) {
      const [radUsers] = await sequelize.query(
        `SELECT id FROM msk_users WHERE role = 'radiologist' LIMIT 1`
      );
      if (radUsers.length > 0) {
        const radId = radUsers[0].id;
        for (let day = 1; day <= 5; day++) {
          await sequelize.query(`
            INSERT INTO msk_provider_availability (provider_id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes)
            VALUES ($1, $2, '09:00', '17:00', 30, 5)
          `, { bind: [radId, day] });
        }
        console.log('[MSK] Provider availability seeded');
      }
    }

    // Seed demo users
    const bcrypt = require('bcryptjs');
    const [existingAdmin] = await sequelize.query(
      `SELECT id FROM msk_users WHERE email = 'admin@msk-intelligence.com' LIMIT 1`
    );
    if (existingAdmin.length === 0) {
      const hash = await bcrypt.hash('MSKIntel2026!', 12);
      await sequelize.query(`
        INSERT INTO msk_users (email, password_hash, first_name, last_name, role, specialty, credentials)
        VALUES
          ('admin@msk-intelligence.com', $1, 'Admin', 'MSK', 'admin', NULL, NULL),
          ('radiologist@msk-intelligence.com', $1, 'Dr. James', 'Morrison', 'radiologist',
            'Musculoskeletal Radiology', 'MD, Fellowship MSK Radiology, ABMS Board Certified'),
          ('athlete@msk-intelligence.com', $1, 'Carlos', 'Rivera', 'patient', NULL, NULL)
      `, { bind: [hash] });

      // Create patient profile for demo athlete
      const [newUser] = await sequelize.query(
        `SELECT id FROM msk_users WHERE email = 'athlete@msk-intelligence.com' LIMIT 1`
      );
      if (newUser.length > 0) {
        await sequelize.query(`
          INSERT INTO msk_patients (user_id, date_of_birth, gender, sport, team, position, height_cm, weight_kg)
          VALUES ($1, '1995-03-15', 'male', 'Motorsport', 'Team Alpha Racing', 'Driver', 178, 72)
        `, { bind: [newUser[0].id] });
      }
      console.log('[MSK] Demo users seeded');
    }

    console.log('[MSK] Database migration complete');
  } catch (err) {
    console.error('[MSK] Migration error:', err.message);
  }
}

// Run migrations on load
runMigrations();

// ── Automated Engagement Nudge Cron ─────────────────────────────────
const cron = require('node-cron');
// Run every 6 hours — check for patients needing engagement nudges
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('[MSK] Running engagement nudge check...');

    // 1. Exercise compliance nudges — no session in 3+ days for active programs
    const [exerciseAlerts] = await sequelize.query(`
      SELECT DISTINCT hp.patient_id, u.first_name, u.last_name, u.phone, hp.name AS program_name
      FROM msk_hep_programs hp
      JOIN msk_users u ON hp.patient_id = u.id
      WHERE hp.status = 'active'
      AND hp.patient_id NOT IN (
        SELECT DISTINCT patient_id FROM msk_hep_sessions
        WHERE completed_at > NOW() - INTERVAL '3 days'
      )
    `);

    for (const alert of exerciseAlerts) {
      // Create notification
      await sequelize.query(`
        INSERT INTO msk_notifications (user_id, type, title, body, link)
        VALUES ($1, 'exercise_reminder', 'Time for your exercises!',
          $2, '/rehab')
      `, { bind: [alert.patient_id, `You haven''t logged an exercise session in 3 days. Your "${alert.program_name}" program is waiting!`] });
    }

    // 2. Appointment reminders — 24h before, not yet sent
    const [apptAlerts] = await sequelize.query(`
      SELECT a.id, a.patient_id, u.first_name, u.phone, a.scheduled_at
      FROM msk_appointments a
      JOIN msk_users u ON a.patient_id = u.id
      WHERE a.status = 'scheduled'
      AND a.reminder_24h_sent = FALSE
      AND a.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
    `);

    for (const appt of apptAlerts) {
      await sequelize.query(`
        INSERT INTO msk_notifications (user_id, type, title, body, link)
        VALUES ($1, 'appointment_reminder', 'Appointment Tomorrow',
          $2, '/appointments')
      `, { bind: [appt.patient_id, `Your MSK consultation is scheduled for ${new Date(appt.scheduled_at).toLocaleString()}. Don''t forget!`] });
      await sequelize.query(`UPDATE msk_appointments SET reminder_24h_sent = TRUE WHERE id = $1`, { bind: [appt.id] });
    }

    console.log(`[MSK] Nudge check complete: ${exerciseAlerts.length} exercise, ${apptAlerts.length} appointment reminders`);
  } catch (err) {
    console.error('[MSK] Nudge cron error:', err.message);
  }
});

// Export sequelize for use in routes
router.sequelize = sequelize;

// ── Static Files (React SPA) ────────────────────────────────────────
const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));

// SPA Fallback
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

module.exports = router;
module.exports.sequelize = sequelize;
