-- Spark Martial Arts AI - Database Migration
-- Run this migration to create all required tables for the Spark ecosystem
-- Date: 2026-02-10

-- =====================================================
-- 1. SPARK SCHOOLS TABLE
-- Core entity for martial arts schools
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_schools (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    external_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    martial_art_type VARCHAR(100),
    plan_type VARCHAR(20) DEFAULT 'starter' CHECK (plan_type IN ('starter', 'growth', 'pro', 'enterprise')),
    monthly_revenue_target DECIMAL(10, 2) DEFAULT 0,
    student_capacity INTEGER DEFAULT 100,
    active_students INTEGER DEFAULT 0,
    website VARCHAR(255),
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    ai_enabled BOOLEAN DEFAULT true,
    voice_agent VARCHAR(20) DEFAULT 'sensei' CHECK (voice_agent IN ('sensei', 'maestro', 'both', 'none')),
    status VARCHAR(20) DEFAULT 'trial' CHECK (status IN ('active', 'inactive', 'trial', 'suspended')),
    trial_ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_schools_tenant ON spark_schools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_spark_schools_external ON spark_schools(external_id);
CREATE INDEX IF NOT EXISTS idx_spark_schools_status ON spark_schools(status);
CREATE INDEX IF NOT EXISTS idx_spark_schools_martial_art ON spark_schools(martial_art_type);

-- =====================================================
-- 2. SPARK STUDENTS TABLE
-- Student/member entity for martial arts schools
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_students (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    external_id VARCHAR(100),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    date_of_birth DATE,
    belt_rank VARCHAR(50),
    belt_stripes INTEGER DEFAULT 0,
    enrollment_date DATE,
    last_attendance TIMESTAMP,
    attendance_streak INTEGER DEFAULT 0,
    total_classes INTEGER DEFAULT 0,
    membership_type VARCHAR(50),
    monthly_rate DECIMAL(8, 2) DEFAULT 0,
    lifetime_value DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'frozen', 'cancelled', 'prospect')),
    churn_risk VARCHAR(20) DEFAULT 'low' CHECK (churn_risk IN ('low', 'medium', 'high', 'critical')),
    churn_risk_score DECIMAL(5, 2) DEFAULT 0,
    last_payment_date DATE,
    payment_status VARCHAR(20) DEFAULT 'current' CHECK (payment_status IN ('current', 'past_due', 'failed', 'cancelled')),
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    emergency_contact JSONB DEFAULT '{}',
    parent_guardian JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_students_school ON spark_students(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_students_external ON spark_students(external_id);
CREATE INDEX IF NOT EXISTS idx_spark_students_email ON spark_students(email);
CREATE INDEX IF NOT EXISTS idx_spark_students_phone ON spark_students(phone);
CREATE INDEX IF NOT EXISTS idx_spark_students_status ON spark_students(status);
CREATE INDEX IF NOT EXISTS idx_spark_students_churn ON spark_students(churn_risk);
CREATE INDEX IF NOT EXISTS idx_spark_students_belt ON spark_students(belt_rank);

-- =====================================================
-- 3. SPARK LEADS TABLE
-- Lead/prospect entity for martial arts schools
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_leads (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    external_id VARCHAR(100),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    source VARCHAR(100),
    campaign VARCHAR(255),
    interest VARCHAR(255),
    status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'follow_up', 'converted', 'lost', 'unresponsive')),
    lead_score INTEGER DEFAULT 50,
    temperature VARCHAR(10) DEFAULT 'warm' CHECK (temperature IN ('hot', 'warm', 'cold')),
    trial_date TIMESTAMP,
    trial_completed BOOLEAN DEFAULT false,
    follow_up_date TIMESTAMP,
    last_contact_date TIMESTAMP,
    contact_attempts INTEGER DEFAULT 0,
    preferred_contact_method VARCHAR(20) DEFAULT 'any' CHECK (preferred_contact_method IN ('phone', 'email', 'sms', 'any')),
    best_time_to_call VARCHAR(50),
    notes TEXT,
    ai_notes TEXT,
    tags TEXT[] DEFAULT '{}',
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    assigned_to VARCHAR(255),
    converted_to_student_id INTEGER REFERENCES spark_students(id),
    conversion_date TIMESTAMP,
    lost_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_leads_school ON spark_leads(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_leads_external ON spark_leads(external_id);
CREATE INDEX IF NOT EXISTS idx_spark_leads_email ON spark_leads(email);
CREATE INDEX IF NOT EXISTS idx_spark_leads_phone ON spark_leads(phone);
CREATE INDEX IF NOT EXISTS idx_spark_leads_status ON spark_leads(status);
CREATE INDEX IF NOT EXISTS idx_spark_leads_temp ON spark_leads(temperature);
CREATE INDEX IF NOT EXISTS idx_spark_leads_score ON spark_leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_spark_leads_followup ON spark_leads(follow_up_date);

-- =====================================================
-- 4. SPARK CLASSES TABLE
-- Class/program entity for martial arts schools
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_classes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    external_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    program_type VARCHAR(100),
    martial_art VARCHAR(100),
    level VARCHAR(50),
    schedule JSONB DEFAULT '{}',
    duration_minutes INTEGER DEFAULT 60,
    capacity INTEGER DEFAULT 20,
    instructor VARCHAR(255),
    instructor_id INTEGER,
    average_attendance DECIMAL(5, 2) DEFAULT 0,
    fill_rate DECIMAL(5, 2) DEFAULT 0,
    popularity_score INTEGER DEFAULT 50,
    price DECIMAL(8, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_classes_school ON spark_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_classes_external ON spark_classes(external_id);
CREATE INDEX IF NOT EXISTS idx_spark_classes_program ON spark_classes(program_type);
CREATE INDEX IF NOT EXISTS idx_spark_classes_active ON spark_classes(is_active);

-- =====================================================
-- 5. SPARK REVENUE TABLE
-- Revenue tracking for martial arts schools
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_revenue (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('membership', 'retail', 'event', 'private_lesson', 'testing_fee', 'other')),
    category VARCHAR(100),
    amount DECIMAL(10, 2) NOT NULL,
    student_id INTEGER REFERENCES spark_students(id),
    description TEXT,
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    is_recurring BOOLEAN DEFAULT false,
    source VARCHAR(100) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_revenue_school ON spark_revenue(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_revenue_date ON spark_revenue(date);
CREATE INDEX IF NOT EXISTS idx_spark_revenue_type ON spark_revenue(type);
CREATE INDEX IF NOT EXISTS idx_spark_revenue_student ON spark_revenue(student_id);
CREATE INDEX IF NOT EXISTS idx_spark_revenue_school_date ON spark_revenue(school_id, date);

-- =====================================================
-- 6. SPARK HEALTH SCORES TABLE
-- School health scoring for martial arts businesses
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_health_scores (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    retention_score INTEGER DEFAULT 0,
    revenue_score INTEGER DEFAULT 0,
    lead_score INTEGER DEFAULT 0,
    attendance_score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    growth_score INTEGER DEFAULT 0,
    overall_score INTEGER DEFAULT 0,
    grade CHAR(1) DEFAULT 'C' CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
    metrics JSONB DEFAULT '{}',
    insights TEXT[] DEFAULT '{}',
    alerts JSONB[] DEFAULT '{}',
    vs_last_week INTEGER DEFAULT 0,
    vs_last_month INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, date)
);

CREATE INDEX IF NOT EXISTS idx_spark_health_school ON spark_health_scores(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_health_date ON spark_health_scores(date);
CREATE INDEX IF NOT EXISTS idx_spark_health_score ON spark_health_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_spark_health_grade ON spark_health_scores(grade);

-- =====================================================
-- 7. SPARK AI CALLS TABLE
-- AI Voice Call logs for Sensei/Maestro agents
-- =====================================================

CREATE TABLE IF NOT EXISTS spark_ai_calls (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES spark_schools(id) ON DELETE CASCADE,
    agent VARCHAR(20) NOT NULL CHECK (agent IN ('sensei', 'maestro')),
    call_type VARCHAR(30) NOT NULL CHECK (call_type IN ('lead_followup', 'no_show', 'retention', 'payment_reminder', 'winback', 'appointment_confirmation', 'survey', 'other')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    phone_number VARCHAR(20),
    lead_id INTEGER REFERENCES spark_leads(id),
    student_id INTEGER REFERENCES spark_students(id),
    duration_seconds INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'no_answer', 'voicemail', 'busy', 'failed', 'transferred')),
    outcome VARCHAR(255),
    sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    transcript TEXT,
    summary TEXT,
    action_items TEXT[] DEFAULT '{}',
    recording_url TEXT,
    external_call_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spark_calls_school ON spark_ai_calls(school_id);
CREATE INDEX IF NOT EXISTS idx_spark_calls_agent ON spark_ai_calls(agent);
CREATE INDEX IF NOT EXISTS idx_spark_calls_type ON spark_ai_calls(call_type);
CREATE INDEX IF NOT EXISTS idx_spark_calls_status ON spark_ai_calls(status);
CREATE INDEX IF NOT EXISTS idx_spark_calls_lead ON spark_ai_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_spark_calls_student ON spark_ai_calls(student_id);
CREATE INDEX IF NOT EXISTS idx_spark_calls_created ON spark_ai_calls(created_at);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
    RAISE NOTICE 'Spark Martial Arts AI Migration Complete';
    RAISE NOTICE 'Tables created: spark_schools, spark_students, spark_leads, spark_classes, spark_revenue, spark_health_scores, spark_ai_calls';
END $$;
