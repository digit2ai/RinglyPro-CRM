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
