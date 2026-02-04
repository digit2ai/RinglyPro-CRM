-- Seed 1 month of Store Health AI dummy data
-- Run this directly in pgAdmin or Render Shell

-- 1. Create Organization
INSERT INTO organizations (name, timezone, config, created_at, updated_at)
VALUES ('Dollar Tree Stores', 'America/New_York', '{"businessHours":{"open":"08:00","close":"22:00"},"alertChannels":["email","sms","push"],"escalationEnabled":true}'::jsonb, NOW(), NOW())
ON CONFLICT DO NOTHING
RETURNING id;

-- Get organization ID (replace 1 with actual ID if different)
DO $$
DECLARE
  org_id INT;
  region_id INT;
  district_id INT;
  current_store_id INT;
  kpi_id INT;
  i INT;
  day_offset INT;
  current_metric_date DATE;
BEGIN
  -- Get organization ID
  SELECT id INTO org_id FROM organizations WHERE name = 'Dollar Tree Stores' LIMIT 1;

  -- 2. Create Region
  INSERT INTO regions (organization_id, name, manager_name, manager_email, manager_phone, created_at, updated_at)
  VALUES (org_id, 'Northeast Region', 'Sarah Johnson', 'sarah.johnson@dollartree.com', '+12125551234', NOW(), NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO region_id;

  IF region_id IS NULL THEN
    SELECT id INTO region_id FROM regions WHERE name = 'Northeast Region' LIMIT 1;
  END IF;

  -- 3. Create District
  INSERT INTO districts (region_id, name, manager_name, manager_email, manager_phone, created_at, updated_at)
  VALUES (region_id, 'NYC Metro District', 'Michael Chen', 'michael.chen@dollartree.com', '+12125555678', NOW(), NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO district_id;

  IF district_id IS NULL THEN
    SELECT id INTO district_id FROM districts WHERE name = 'NYC Metro District' LIMIT 1;
  END IF;

  -- 4. Create 10 Stores
  FOR i IN 1..10 LOOP
    INSERT INTO stores (organization_id, district_id, store_code, name, address, city, state, zip, timezone, manager_name, manager_email, manager_phone, status, created_at, updated_at)
    VALUES (
      org_id,
      district_id,
      'DT-' || LPAD(i::TEXT, 3, '0'),
      CASE i
        WHEN 1 THEN 'Manhattan 42nd St'
        WHEN 2 THEN 'Brooklyn Heights'
        WHEN 3 THEN 'Queens Plaza'
        WHEN 4 THEN 'Bronx Fordham'
        WHEN 5 THEN 'Staten Island Mall'
        WHEN 6 THEN 'Upper East Side'
        WHEN 7 THEN 'Harlem 125th'
        WHEN 8 THEN 'Greenwich Village'
        WHEN 9 THEN 'Williamsburg'
        ELSE 'Long Island City'
      END,
      '123 Main St',
      CASE
        WHEN i IN (1,6,7,8) THEN 'New York'
        WHEN i IN (2,9) THEN 'Brooklyn'
        WHEN i IN (3,10) THEN 'Queens'
        WHEN i = 4 THEN 'Bronx'
        ELSE 'Staten Island'
      END,
      'NY',
      '10000',
      'America/New_York',
      'Store Manager ' || i,
      'manager' || i || '@dollartree.com',
      '+1212555' || LPAD(i::TEXT, 4, '0'),
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (store_code) DO NOTHING;
  END LOOP;

  -- 5. Create KPI Definitions
  INSERT INTO kpi_definitions (kpi_code, name, category, unit, calculation_method, target_value, status, created_at, updated_at)
  VALUES
    ('SALES_DAILY', 'Daily Sales', 'sales', 'USD', 'sum', 5000, 'active', NOW(), NOW()),
    ('LABOR_HOURS', 'Labor Hours', 'labor', 'hours', 'sum', 120, 'active', NOW(), NOW()),
    ('CONVERSION_RATE', 'Conversion Rate', 'sales', 'percent', 'percentage', 35, 'active', NOW(), NOW()),
    ('INVENTORY_LEVEL', 'Inventory Level', 'inventory', 'units', 'count', 10000, 'active', NOW(), NOW()),
    ('TRAFFIC', 'Store Traffic', 'traffic', 'visitors', 'count', 200, 'active', NOW(), NOW())
  ON CONFLICT (kpi_code) DO NOTHING;

  -- 6. Create KPI Thresholds
  FOR kpi_id IN (SELECT id FROM kpi_definitions WHERE kpi_code IN ('SALES_DAILY', 'LABOR_HOURS', 'CONVERSION_RATE', 'INVENTORY_LEVEL', 'TRAFFIC'))
  LOOP
    INSERT INTO kpi_thresholds (kpi_definition_id, green_threshold, yellow_threshold, red_threshold, comparison_operator, created_at, updated_at)
    SELECT kpi_id, target_value * 0.9, target_value * 0.75, target_value * 0.6, '>=', NOW(), NOW()
    FROM kpi_definitions WHERE id = kpi_id
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 7. Generate 30 days of KPI Metrics
  FOR day_offset IN 0..29 LOOP
    current_metric_date := CURRENT_DATE - day_offset;

    FOR current_store_id IN (SELECT id FROM stores WHERE store_code LIKE 'DT-%')
    LOOP
      FOR kpi_id IN (SELECT id FROM kpi_definitions)
      LOOP
        INSERT INTO kpi_metrics (store_id, kpi_definition_id, metric_date, value, comparison_value, variance_pct, status, data_source, created_at, updated_at)
        SELECT
          current_store_id,
          kpi_id,
          current_metric_date,
          target_value * (0.7 + RANDOM() * 0.5) * (0.85 + RANDOM() * 0.3),
          target_value,
          ((target_value * (0.7 + RANDOM() * 0.5) * (0.85 + RANDOM() * 0.3) - target_value) / target_value) * 100,
          CASE
            WHEN RANDOM() > 0.7 THEN 'green'
            WHEN RANDOM() > 0.5 THEN 'yellow'
            ELSE 'red'
          END::metric_status,
          'simulated',
          NOW(),
          NOW()
        FROM kpi_definitions WHERE id = kpi_id
        ON CONFLICT (store_id, kpi_definition_id, metric_date) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 8. Create Store Health Snapshots
  FOR day_offset IN 0..29 LOOP
    current_metric_date := CURRENT_DATE - day_offset;

    FOR current_store_id IN (SELECT id FROM stores WHERE store_code LIKE 'DT-%')
    LOOP
      INSERT INTO store_health_snapshots (store_id, snapshot_date, overall_status, green_count, yellow_count, red_count, health_score, escalation_level, created_at, updated_at)
      SELECT
        current_store_id,
        current_metric_date,
        CASE
          WHEN SUM(CASE WHEN km.status = 'red' THEN 1 ELSE 0 END) = 0 AND SUM(CASE WHEN km.status = 'yellow' THEN 1 ELSE 0 END) = 0 THEN 'green'
          WHEN SUM(CASE WHEN km.status = 'red' THEN 1 ELSE 0 END) = 0 THEN 'yellow'
          ELSE 'red'
        END::health_status,
        SUM(CASE WHEN km.status = 'green' THEN 1 ELSE 0 END),
        SUM(CASE WHEN km.status = 'yellow' THEN 1 ELSE 0 END),
        SUM(CASE WHEN km.status = 'red' THEN 1 ELSE 0 END),
        (SUM(CASE WHEN km.status = 'green' THEN 100 WHEN km.status = 'yellow' THEN 60 ELSE 0 END)::DECIMAL / 5),
        CASE
          WHEN SUM(CASE WHEN km.status = 'red' THEN 1 ELSE 0 END) >= 2 THEN 2
          WHEN SUM(CASE WHEN km.status = 'red' THEN 1 ELSE 0 END) >= 1 THEN 1
          ELSE 0
        END,
        NOW(),
        NOW()
      FROM kpi_metrics km
      WHERE km.store_id = current_store_id AND km.metric_date = current_metric_date
      GROUP BY current_store_id
      ON CONFLICT (store_id, snapshot_date) DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE '✅ Seeding completed successfully!';
  RAISE NOTICE 'Created: 1 Organization, 1 Region, 1 District, 10 Stores, 5 KPIs, 1500 Metrics, 300 Snapshots';
END $$;
