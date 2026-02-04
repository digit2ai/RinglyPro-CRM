-- Verify seed data was inserted successfully

-- Check organizations
SELECT COUNT(*) as org_count FROM organizations WHERE name = 'Dollar Tree Stores';

-- Check stores
SELECT COUNT(*) as store_count FROM stores WHERE store_code LIKE 'DT-%';

-- Check KPI definitions
SELECT COUNT(*) as kpi_count FROM kpi_definitions;

-- Check KPI metrics
SELECT COUNT(*) as metric_count FROM kpi_metrics;

-- Check store health snapshots
SELECT COUNT(*) as snapshot_count FROM store_health_snapshots;

-- Summary
SELECT
  'Organizations' as table_name, COUNT(*) as count FROM organizations WHERE name = 'Dollar Tree Stores'
UNION ALL
SELECT 'Regions', COUNT(*) FROM regions WHERE name = 'Northeast Region'
UNION ALL
SELECT 'Districts', COUNT(*) FROM districts WHERE name = 'NYC Metro District'
UNION ALL
SELECT 'Stores', COUNT(*) FROM stores WHERE store_code LIKE 'DT-%'
UNION ALL
SELECT 'KPI Definitions', COUNT(*) FROM kpi_definitions
UNION ALL
SELECT 'KPI Metrics', COUNT(*) FROM kpi_metrics
UNION ALL
SELECT 'Store Health Snapshots', COUNT(*) FROM store_health_snapshots;
