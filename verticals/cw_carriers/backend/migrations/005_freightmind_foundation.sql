-- FreightMind AI — Phase 1-5 Foundation Tables
-- Migration 005: Trucks, Drivers, Dispatches, Tracking, Invoices, Settlements,
-- Maintenance, Compliance, Quotes, RFPs, Shippers, Agent Log, Calls, Voice Usage, Audit Trail,
-- Tenant Config (MCP Orchestrator tier gating)
-- Created: 2026-03-20

-- ============================================================================
-- TENANT CONFIG — MCP Orchestrator tier gating (which tiers each client has)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_tenant_config (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255),
  tier_1_load_ops BOOLEAN DEFAULT false,
  tier_2_fleet_ops BOOLEAN DEFAULT false,
  tier_3_financial BOOLEAN DEFAULT false,
  tier_4_compliance BOOLEAN DEFAULT false,
  tier_5_neural BOOLEAN DEFAULT false,
  addon_voice BOOLEAN DEFAULT false,
  addon_treatment BOOLEAN DEFAULT false,
  voice_minutes_included INTEGER DEFAULT 0,
  truck_count INTEGER DEFAULT 0,
  package_name VARCHAR(50),
  monthly_rate NUMERIC(10,2),
  billing_start_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','trial','suspended','cancelled')),
  api_key VARCHAR(100) UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default tenant with all tiers (CW Carriers = full package)
INSERT INTO lg_tenant_config (tenant_id, company_name, tier_1_load_ops, tier_2_fleet_ops, tier_3_financial, tier_4_compliance, tier_5_neural, addon_voice, addon_treatment, package_name, status)
VALUES ('logistics', 'CW Carriers USA', true, true, true, true, true, true, true, 'FreightMind Complete', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- 1. lg_trucks — Fleet truck inventory
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_trucks (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    truck_number VARCHAR(50) NOT NULL,
    carrier_id INTEGER,
    vin VARCHAR(20),
    make VARCHAR(50),
    model VARCHAR(50),
    year INTEGER,
    equipment_type VARCHAR(50) DEFAULT 'dry_van',
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','assigned','in_transit','maintenance','out_of_service')),
    current_lat NUMERIC(10,7),
    current_lng NUMERIC(10,7),
    current_city VARCHAR(255),
    current_state VARCHAR(10),
    last_position_update TIMESTAMP,
    odometer INTEGER,
    next_pm_due_miles INTEGER,
    next_inspection_date DATE,
    insurance_expiry DATE,
    registration_expiry DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_trucks_tenant_id ON lg_trucks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_trucks_status ON lg_trucks(status);
CREATE INDEX IF NOT EXISTS idx_lg_trucks_carrier_id ON lg_trucks(carrier_id);

-- ============================================================================
-- 2. lg_drivers — Driver roster
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_drivers (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    driver_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    cdl_number VARCHAR(50),
    cdl_state VARCHAR(10),
    cdl_expiry DATE,
    cdl_class VARCHAR(5) DEFAULT 'A',
    endorsements TEXT[] DEFAULT '{}',
    carrier_id INTEGER,
    truck_id INTEGER,
    home_city VARCHAR(255),
    home_state VARCHAR(10),
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','assigned','driving','resting','off_duty','inactive')),
    hos_drive_remaining NUMERIC(4,1) DEFAULT 11.0,
    hos_duty_remaining NUMERIC(4,1) DEFAULT 14.0,
    hos_cycle_remaining NUMERIC(5,1) DEFAULT 70.0,
    hos_last_update TIMESTAMP,
    current_lat NUMERIC(10,7),
    current_lng NUMERIC(10,7),
    current_city VARCHAR(255),
    current_state VARCHAR(10),
    preferred_lanes JSONB DEFAULT '[]',
    drug_test_last DATE,
    drug_test_next DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_drivers_tenant_id ON lg_drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_drivers_status ON lg_drivers(status);
CREATE INDEX IF NOT EXISTS idx_lg_drivers_carrier_id ON lg_drivers(carrier_id);
CREATE INDEX IF NOT EXISTS idx_lg_drivers_cdl_expiry ON lg_drivers(cdl_expiry);

-- ============================================================================
-- 3. lg_dispatches — Load assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_dispatches (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    load_id INTEGER,
    driver_id INTEGER,
    truck_id INTEGER,
    dispatched_at TIMESTAMP DEFAULT NOW(),
    pickup_eta TIMESTAMP,
    delivery_eta TIMESTAMP,
    actual_pickup TIMESTAMP,
    actual_delivery TIMESTAMP,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned','en_route_pickup','at_pickup','loaded','in_transit','at_delivery','delivered','cancelled')),
    route_miles NUMERIC(8,1),
    deadhead_miles NUMERIC(8,1),
    detention_minutes INTEGER DEFAULT 0,
    detention_charges NUMERIC(10,2) DEFAULT 0,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_dispatches_tenant_id ON lg_dispatches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_dispatches_status ON lg_dispatches(status);
CREATE INDEX IF NOT EXISTS idx_lg_dispatches_load_id ON lg_dispatches(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_dispatches_driver_id ON lg_dispatches(driver_id);

-- ============================================================================
-- 4. lg_tracking_events — GPS tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_tracking_events (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    truck_id INTEGER,
    driver_id INTEGER,
    load_id INTEGER,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('position','geofence_enter','geofence_exit','speed_alert','idle_alert','hos_warning','departure','arrival','delay','weather')),
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    city VARCHAR(255),
    state VARCHAR(10),
    speed_mph NUMERIC(5,1),
    heading NUMERIC(5,1),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_tracking_events_truck_created ON lg_tracking_events(truck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_tracking_events_load_created ON lg_tracking_events(load_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_tracking_events_event_type ON lg_tracking_events(event_type);

-- ============================================================================
-- 5. lg_invoices — Invoice management
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_invoices (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    invoice_number VARCHAR(50) UNIQUE,
    load_id INTEGER,
    bill_to_type VARCHAR(20) DEFAULT 'broker',
    bill_to_name VARCHAR(255),
    bill_to_email VARCHAR(255),
    amount NUMERIC(12,2),
    detention_amount NUMERIC(10,2) DEFAULT 0,
    fuel_surcharge NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(12,2),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','generated','sent','paid','overdue','factored','disputed','void')),
    sent_at TIMESTAMP,
    due_date DATE,
    paid_at TIMESTAMP,
    paid_amount NUMERIC(12,2),
    factored BOOLEAN DEFAULT false,
    factored_at TIMESTAMP,
    factored_amount NUMERIC(12,2),
    pod_url TEXT,
    bol_url TEXT,
    pdf_url TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_invoices_status ON lg_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lg_invoices_due_date ON lg_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_lg_invoices_load_id ON lg_invoices(load_id);

-- ============================================================================
-- 6. lg_settlements — Driver pay
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_settlements (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    driver_id INTEGER,
    period_start DATE,
    period_end DATE,
    loads_count INTEGER DEFAULT 0,
    total_miles NUMERIC(10,1) DEFAULT 0,
    gross_pay NUMERIC(12,2) DEFAULT 0,
    fuel_deductions NUMERIC(10,2) DEFAULT 0,
    advance_deductions NUMERIC(10,2) DEFAULT 0,
    other_deductions NUMERIC(10,2) DEFAULT 0,
    net_pay NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','calculated','approved','paid')),
    pdf_url TEXT,
    paid_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_settlements_driver_id ON lg_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_lg_settlements_status ON lg_settlements(status);
CREATE INDEX IF NOT EXISTS idx_lg_settlements_period_start ON lg_settlements(period_start);

-- ============================================================================
-- 7. lg_maintenance — Truck maintenance records
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_maintenance (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    truck_id INTEGER,
    service_type VARCHAR(50) NOT NULL,
    description TEXT,
    odometer_at_service INTEGER,
    next_due_miles INTEGER,
    next_due_date DATE,
    cost NUMERIC(10,2),
    shop_name VARCHAR(255),
    shop_city VARCHAR(255),
    shop_state VARCHAR(10),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
    parts JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_maintenance_truck_created ON lg_maintenance(truck_id, created_at DESC);

-- ============================================================================
-- 8. lg_compliance — Compliance tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_compliance (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('driver','truck','carrier')),
    entity_id INTEGER NOT NULL,
    compliance_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'current' CHECK (status IN ('current','expiring_soon','expired','pending','waived')),
    effective_date DATE,
    expiry_date DATE,
    document_url TEXT,
    notes TEXT,
    alert_sent BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_compliance_expiry_date ON lg_compliance(expiry_date);
CREATE INDEX IF NOT EXISTS idx_lg_compliance_entity ON lg_compliance(entity_type, entity_id);

-- ============================================================================
-- 9. lg_quotes — Spot quote tracking for win/loss analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_quotes (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    load_id INTEGER,
    shipper_id INTEGER,
    rfp_id INTEGER,
    lane VARCHAR(255),
    origin_city VARCHAR(255),
    origin_state VARCHAR(10),
    destination_city VARCHAR(255),
    destination_state VARCHAR(10),
    equipment_type VARCHAR(50) DEFAULT 'dry_van',
    quoted_rate NUMERIC(12,2),
    quoted_rpm NUMERIC(8,2),
    market_rate_at_quote NUMERIC(12,2),
    margin_target_pct NUMERIC(5,2),
    source VARCHAR(30) DEFAULT 'spot' CHECK (source IN ('spot','contract','rfp','email','phone','portal')),
    outcome VARCHAR(20) CHECK (outcome IN ('pending','won','lost','expired','withdrawn')),
    winning_rate NUMERIC(12,2),
    delta_from_winner NUMERIC(12,2),
    loss_reason VARCHAR(100),
    responded_at TIMESTAMP,
    decided_at TIMESTAMP,
    auto_quoted BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_quotes_outcome ON lg_quotes(outcome);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_lane ON lg_quotes(origin_state, destination_state);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_shipper_id ON lg_quotes(shipper_id);

-- ============================================================================
-- 10. lg_rfps — Shipper RFP/bid management
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_rfps (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    shipper_id INTEGER,
    shipper_name VARCHAR(255),
    rfp_name VARCHAR(255),
    received_date DATE,
    due_date DATE,
    total_lanes INTEGER DEFAULT 0,
    lanes_bid INTEGER DEFAULT 0,
    lanes_skipped INTEGER DEFAULT 0,
    lanes_awarded INTEGER DEFAULT 0,
    total_volume_est INTEGER,
    total_revenue_est NUMERIC(14,2),
    avg_margin_target NUMERIC(5,2),
    status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received','analyzing','pricing','submitted','awarded','closed')),
    source_file_url TEXT,
    bid_response_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_rfps_status ON lg_rfps(status);
CREATE INDEX IF NOT EXISTS idx_lg_rfps_shipper_id ON lg_rfps(shipper_id);

-- ============================================================================
-- 11. lg_rfp_lanes — Individual RFP lanes
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_rfp_lanes (
    id SERIAL PRIMARY KEY,
    rfp_id INTEGER,
    origin_city VARCHAR(255),
    origin_state VARCHAR(10),
    destination_city VARCHAR(255),
    destination_state VARCHAR(10),
    equipment_type VARCHAR(50) DEFAULT 'dry_van',
    volume_per_week INTEGER,
    shipper_target_rate NUMERIC(12,2),
    our_bid_rate NUMERIC(12,2),
    market_rate NUMERIC(12,2),
    projected_margin_pct NUMERIC(5,2),
    recommendation VARCHAR(20) CHECK (recommendation IN ('bid_aggressive','bid_standard','bid_high','skip')),
    recommendation_reason TEXT,
    awarded BOOLEAN DEFAULT false,
    awarded_rate NUMERIC(12,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_rfp_lanes_rfp_id ON lg_rfp_lanes(rfp_id);

-- ============================================================================
-- 12. lg_shippers — Shipper relationship intelligence
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_shippers (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    shipper_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address VARCHAR(500),
    city VARCHAR(255),
    state VARCHAR(10),
    zip VARCHAR(20),
    industry VARCHAR(100),
    relationship_score NUMERIC(5,2) DEFAULT 50.0,
    volume_score NUMERIC(5,2) DEFAULT 50.0,
    payment_score NUMERIC(5,2) DEFAULT 50.0,
    growth_score NUMERIC(5,2) DEFAULT 50.0,
    churn_risk VARCHAR(20) DEFAULT 'low' CHECK (churn_risk IN ('low','medium','high','critical')),
    avg_payment_days NUMERIC(5,1),
    total_loads_ltm INTEGER DEFAULT 0,
    total_revenue_ltm NUMERIC(14,2) DEFAULT 0,
    avg_monthly_loads NUMERIC(8,1) DEFAULT 0,
    top_lanes JSONB DEFAULT '[]',
    competitors_known JSONB DEFAULT '[]',
    lifetime_value NUMERIC(14,2) DEFAULT 0,
    first_load_date DATE,
    last_load_date DATE,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_shippers_relationship_score ON lg_shippers(relationship_score DESC);
CREATE INDEX IF NOT EXISTS idx_lg_shippers_churn_risk ON lg_shippers(churn_risk);
CREATE INDEX IF NOT EXISTS idx_lg_shippers_tenant_id ON lg_shippers(tenant_id);

-- ============================================================================
-- 13. lg_agent_log — AI agent activity tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_agent_log (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    agent_name VARCHAR(50) NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    input JSONB,
    output JSONB,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error TEXT,
    triggered_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_agent_log_agent_created ON lg_agent_log(agent_name, created_at DESC);

-- ============================================================================
-- 14. lg_calls — Voice AI call log
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_calls (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
    caller_phone VARCHAR(20),
    caller_name VARCHAR(255),
    caller_type VARCHAR(20) CHECK (caller_type IN ('shipper','carrier','driver','broker','unknown')),
    caller_entity_id INTEGER,
    called_phone VARCHAR(20),
    voice_persona VARCHAR(20) DEFAULT 'rachel',
    intent_classified VARCHAR(50),
    agent_routed_to VARCHAR(50),
    load_id INTEGER,
    carrier_id INTEGER,
    driver_id INTEGER,
    duration_seconds INTEGER,
    outcome VARCHAR(30) CHECK (outcome IN ('completed','voicemail','no_answer','busy','failed','transferred')),
    result_summary TEXT,
    actions_taken JSONB DEFAULT '[]',
    recording_url TEXT,
    transcript TEXT,
    sentiment VARCHAR(20),
    follow_up_needed BOOLEAN DEFAULT false,
    follow_up_date TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_calls_tenant_created ON lg_calls(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_calls_load_id ON lg_calls(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_calls_direction_created ON lg_calls(direction, created_at DESC);

-- ============================================================================
-- 15. lg_voice_usage — SaaS voice billing
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_voice_usage (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    month VARCHAR(7) NOT NULL,
    inbound_minutes NUMERIC(10,1) DEFAULT 0,
    outbound_minutes NUMERIC(10,1) DEFAULT 0,
    total_minutes NUMERIC(10,1) DEFAULT 0,
    included_minutes INTEGER DEFAULT 100,
    overage_minutes NUMERIC(10,1) DEFAULT 0,
    overage_cost NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, month)
);

-- ============================================================================
-- 16. lg_audit_trail — AI decision audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS lg_audit_trail (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    agent_name VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    decision TEXT,
    reasoning TEXT,
    confidence NUMERIC(3,2),
    input_data JSONB,
    output_data JSONB,
    human_override BOOLEAN DEFAULT false,
    overridden_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lg_audit_trail_agent_created ON lg_audit_trail(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lg_audit_trail_entity ON lg_audit_trail(entity_type, entity_id);
