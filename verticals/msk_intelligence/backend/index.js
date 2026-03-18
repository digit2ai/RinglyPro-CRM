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
router.use('/api/v1/messages', authenticate, messageRoutes);

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
          ('admin@msk-intelligence.com', '${hash}', 'Admin', 'MSK', 'admin', NULL, NULL),
          ('radiologist@msk-intelligence.com', '${hash}', 'Dr. James', 'Morrison', 'radiologist',
            'Musculoskeletal Radiology', 'MD, Fellowship MSK Radiology, ABMS Board Certified'),
          ('athlete@msk-intelligence.com', '${hash}', 'Carlos', 'Rivera', 'patient', NULL, NULL)
      `);

      // Create patient profile for demo athlete
      const [newUser] = await sequelize.query(
        `SELECT id FROM msk_users WHERE email = 'athlete@msk-intelligence.com' LIMIT 1`
      );
      if (newUser.length > 0) {
        await sequelize.query(`
          INSERT INTO msk_patients (user_id, date_of_birth, gender, sport, team, position, height_cm, weight_kg)
          VALUES (${newUser[0].id}, '1995-03-15', 'male', 'Motorsport', 'Team Alpha Racing', 'Driver', 178, 72)
        `);
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
