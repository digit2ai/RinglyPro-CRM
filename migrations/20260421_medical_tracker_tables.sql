-- Medical Tracker Tables
-- Created: 2026-04-21

-- Patient profile (personal use, single patient for now)
CREATE TABLE IF NOT EXISTS medical_patients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  dob DATE,
  sex VARCHAR(10),
  mrn VARCHAR(50),
  ceid VARCHAR(50),
  address TEXT,
  phone VARCHAR(30),
  primary_clinic TEXT,
  primary_doctor VARCHAR(255),
  insurance_name VARCHAR(255),
  insurance_plan VARCHAR(100),
  insurance_policy VARCHAR(100),
  insurance_group VARCHAR(100),
  insurance_address TEXT,
  allergies TEXT DEFAULT 'No Known Allergies',
  pharmacy_name VARCHAR(255),
  pharmacy_address TEXT,
  pharmacy_phone VARCHAR(30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Active diagnoses / conditions
CREATE TABLE IF NOT EXISTS medical_diagnoses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  condition_name VARCHAR(500) NOT NULL,
  icd_code VARCHAR(20),
  notes TEXT,
  status VARCHAR(30) DEFAULT 'Active',
  diagnosed_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Medications
CREATE TABLE IF NOT EXISTS medical_medications (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  medication_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255),
  dose VARCHAR(100),
  instructions TEXT,
  prescribing_doctor VARCHAR(255),
  start_date DATE,
  end_date DATE,
  status VARCHAR(30) DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Doctor / test appointments (unified)
CREATE TABLE IF NOT EXISTS medical_appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  appointment_type VARCHAR(30) NOT NULL DEFAULT 'doctor',
  appointment_date DATE,
  appointment_time VARCHAR(20),
  arrive_by VARCHAR(20),
  doctor_name VARCHAR(255),
  specialty VARCHAR(100),
  location TEXT,
  reason TEXT,
  status VARCHAR(30) DEFAULT 'Scheduled',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lab orders
CREATE TABLE IF NOT EXISTS medical_lab_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  order_date DATE,
  test_name VARCHAR(255) NOT NULL,
  test_code VARCHAR(50),
  facility VARCHAR(255),
  facility_account VARCHAR(100),
  lab_ref VARCHAR(100),
  ordering_doctor VARCHAR(255),
  diagnosis_reason TEXT,
  specimen_source VARCHAR(100),
  expected_date VARCHAR(100),
  status VARCHAR(30) DEFAULT 'Ordered',
  result_value TEXT,
  result_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Imaging orders
CREATE TABLE IF NOT EXISTS medical_imaging_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  order_date DATE,
  imaging_test VARCHAR(255) NOT NULL,
  body_area VARCHAR(255),
  contrast VARCHAR(100),
  facility VARCHAR(255),
  ordering_doctor VARCHAR(255),
  order_id VARCHAR(100),
  reason TEXT,
  priority VARCHAR(30) DEFAULT 'Routine',
  expiration_date DATE,
  status VARCHAR(30) DEFAULT 'Ordered',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Providers
CREATE TABLE IF NOT EXISTS medical_providers (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  provider_name VARCHAR(255) NOT NULL,
  specialty VARCHAR(100),
  clinic VARCHAR(500),
  phone VARCHAR(30),
  fax VARCHAR(30),
  npi VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Follow-ups / next steps
CREATE TABLE IF NOT EXISTS medical_followups (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  due_date DATE,
  related_to VARCHAR(255),
  status VARCHAR(30) DEFAULT 'Pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vitals history
CREATE TABLE IF NOT EXISTS medical_vitals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  measured_date DATE,
  blood_pressure VARCHAR(20),
  pulse INTEGER,
  oxygen_saturation VARCHAR(10),
  weight VARCHAR(30),
  height VARCHAR(20),
  bmi DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- General notes
CREATE TABLE IF NOT EXISTS medical_notes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES medical_patients(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'General',
  source_document VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_med_diag_patient ON medical_diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_meds_patient ON medical_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_appt_patient ON medical_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_appt_date ON medical_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_med_lab_patient ON medical_lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_img_patient ON medical_imaging_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_prov_patient ON medical_providers(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_fu_patient ON medical_followups(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_vitals_patient ON medical_vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_notes_patient ON medical_notes(patient_id);
