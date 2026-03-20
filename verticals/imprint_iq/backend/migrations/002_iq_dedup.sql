-- Deduplicate customers (keep lowest id per company)
DELETE FROM iq_customers a USING iq_customers b
  WHERE a.id > b.id AND a.company_name = b.company_name AND a.tenant_id = b.tenant_id;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_iq_customers_company_tenant ON iq_customers(tenant_id, company_name);

-- Add unique constraint on product sku
CREATE UNIQUE INDEX IF NOT EXISTS idx_iq_products_sku_tenant ON iq_products(tenant_id, sku);

-- Add unique constraint on supplier name
CREATE UNIQUE INDEX IF NOT EXISTS idx_iq_suppliers_name_tenant ON iq_suppliers(tenant_id, name);
