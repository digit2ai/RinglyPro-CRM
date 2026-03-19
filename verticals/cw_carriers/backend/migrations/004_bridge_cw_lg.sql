-- ============================================================
-- BRIDGE: Cross-reference columns linking CW ↔ LG tables
-- Enables single-query joins across both table sets
-- ============================================================

-- lg_carriers ↔ cw_contacts (carrier)
DO $$ BEGIN
  ALTER TABLE lg_carriers ADD COLUMN cw_contact_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_lg_carriers_cw ON lg_carriers(cw_contact_id);

-- lg_customers ↔ cw_contacts (shipper)
DO $$ BEGIN
  ALTER TABLE lg_customers ADD COLUMN cw_contact_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_lg_customers_cw ON lg_customers(cw_contact_id);

-- lg_loads ↔ cw_loads
DO $$ BEGIN
  ALTER TABLE lg_loads ADD COLUMN cw_load_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_lg_loads_cw ON lg_loads(cw_load_id);

-- cw_contacts ↔ lg_carriers / lg_customers (reverse pointers)
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN lg_carrier_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN lg_customer_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- cw_loads ↔ lg_loads (reverse pointer)
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN lg_load_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- AUTO-LINK: Match existing records by name/ref on deploy
-- ============================================================

-- Link lg_carriers → cw_contacts where carrier_name matches company_name
UPDATE lg_carriers SET cw_contact_id = cw.id
FROM cw_contacts cw
WHERE lg_carriers.cw_contact_id IS NULL
  AND cw.contact_type = 'carrier'
  AND LOWER(TRIM(lg_carriers.carrier_name)) = LOWER(TRIM(cw.company_name));

-- Link lg_carriers → cw_contacts where MC number matches
UPDATE lg_carriers SET cw_contact_id = cw.id
FROM cw_contacts cw
WHERE lg_carriers.cw_contact_id IS NULL
  AND cw.contact_type = 'carrier'
  AND lg_carriers.mc_number IS NOT NULL
  AND REPLACE(lg_carriers.mc_number, 'MC-', '') = REPLACE(cw.mc_number, 'MC-', '');

-- Reverse: cw_contacts → lg_carriers
UPDATE cw_contacts SET lg_carrier_id = lg.id
FROM lg_carriers lg
WHERE cw_contacts.lg_carrier_id IS NULL
  AND lg.cw_contact_id = cw_contacts.id;

-- Link lg_customers → cw_contacts where customer_name matches company_name
UPDATE lg_customers SET cw_contact_id = cw.id
FROM cw_contacts cw
WHERE lg_customers.cw_contact_id IS NULL
  AND cw.contact_type = 'shipper'
  AND LOWER(TRIM(lg_customers.customer_name)) = LOWER(TRIM(cw.company_name));

-- Reverse: cw_contacts → lg_customers
UPDATE cw_contacts SET lg_customer_id = lg.id
FROM lg_customers lg
WHERE cw_contacts.lg_customer_id IS NULL
  AND lg.cw_contact_id = cw_contacts.id;

-- Link lg_loads → cw_loads where load_ref matches
UPDATE lg_loads SET cw_load_id = cw.id
FROM cw_loads cw
WHERE lg_loads.cw_load_id IS NULL
  AND lg_loads.load_ref IS NOT NULL
  AND lg_loads.load_ref = cw.load_ref;

-- Reverse: cw_loads → lg_loads
UPDATE cw_loads SET lg_load_id = lg.id
FROM lg_loads lg
WHERE cw_loads.lg_load_id IS NULL
  AND lg.cw_load_id = cw_loads.id;
