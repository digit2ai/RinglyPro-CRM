-- Forzza — control de capital (efectivo vs cuentas por cobrar vs obligaciones).
-- Corre en cada arranque bajo candado: cada sentencia debe ser idempotente.
-- Todas las tablas llevan tenant_id NOT NULL con índice.

CREATE TABLE IF NOT EXISTS fz_tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fz_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','director','capturista','contador')),
  password_hash TEXT,
  must_change BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_users_email ON fz_users (LOWER(email));
CREATE INDEX IF NOT EXISTS ix_fz_users_tenant ON fz_users (tenant_id);

-- Una fila por empresa. reserva_minima NULL = la empresa aún no la define (nunca se inventa).
CREATE TABLE IF NOT EXISTS fz_config (
  tenant_id INTEGER PRIMARY KEY REFERENCES fz_tenants(id),
  reserva_minima NUMERIC(14,2),
  aprobador_user_id INTEGER,
  dias_credito_clientes INTEGER NOT NULL DEFAULT 30,
  dias_credito_proveedores INTEGER NOT NULL DEFAULT 30,
  horizonte_dias INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cuentas de dinero. saldo_inicial = saldo al CIERRE de fecha_saldo; el saldo de hoy suma
-- los movimientos con fecha posterior. incluir=FALSE (p. ej. una tarjeta) queda fuera del efectivo.
CREATE TABLE IF NOT EXISTS fz_cuentas (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  nombre TEXT NOT NULL,
  banco TEXT,
  terminacion TEXT,
  tipo TEXT NOT NULL DEFAULT 'cheques' CHECK (tipo IN ('cheques','tarjeta','efectivo','inversion')),
  uso TEXT NOT NULL DEFAULT 'operacion' CHECK (uso IN ('cobranza','operacion','personal','otro')),
  incluir BOOLEAN NOT NULL DEFAULT TRUE,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_saldo DATE,
  notas TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_cuentas_tenant ON fz_cuentas (tenant_id);

CREATE TABLE IF NOT EXISTS fz_clientes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  nombre TEXT NOT NULL,
  rfc TEXT,
  telefono TEXT,
  dias_credito INTEGER,
  limite_credito NUMERIC(14,2),
  notas TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_clientes_tenant ON fz_clientes (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_clientes_nombre ON fz_clientes (tenant_id, LOWER(nombre));

CREATE TABLE IF NOT EXISTS fz_proveedores (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  nombre TEXT NOT NULL,
  rfc TEXT,
  telefono TEXT,
  dias_credito INTEGER,
  notas TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_proveedores_tenant ON fz_proveedores (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_proveedores_nombre ON fz_proveedores (tenant_id, LOWER(nombre));

-- Cuentas por cobrar: una fila por venta a crédito (factura o remisión). El saldo se calcula
-- con los abonos; nunca se guarda.
CREATE TABLE IF NOT EXISTS fz_cxc (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  cliente_id INTEGER NOT NULL REFERENCES fz_clientes(id),
  folio TEXT,
  tipo_doc TEXT NOT NULL DEFAULT 'factura' CHECK (tipo_doc IN ('factura','remision')),
  fecha DATE NOT NULL,
  vencimiento DATE NOT NULL,
  total NUMERIC(14,2) NOT NULL CHECK (total > 0),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','pagada','cancelada')),
  compromiso_fecha DATE,
  notas TEXT,
  origen TEXT NOT NULL DEFAULT 'manual',
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_cxc_tenant ON fz_cxc (tenant_id, estado, vencimiento);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_cxc_folio ON fz_cxc (tenant_id, cliente_id, folio) WHERE folio IS NOT NULL;

CREATE TABLE IF NOT EXISTS fz_movimientos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  cuenta_id INTEGER NOT NULL REFERENCES fz_cuentas(id),
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  referencia TEXT,
  contraparte TEXT,
  monto NUMERIC(14,2) NOT NULL CHECK (monto <> 0),
  categoria TEXT NOT NULL DEFAULT 'sin_categoria',
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','importado','cobro','pago','fijo')),
  conciliado BOOLEAN NOT NULL DEFAULT FALSE,
  hash TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_mov_tenant ON fz_movimientos (tenant_id, cuenta_id, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_mov_hash ON fz_movimientos (tenant_id, cuenta_id, hash) WHERE hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS fz_cxc_abonos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  cxc_id INTEGER NOT NULL REFERENCES fz_cxc(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  movimiento_id INTEGER REFERENCES fz_movimientos(id) ON DELETE SET NULL,
  nota TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_cxc_abonos ON fz_cxc_abonos (tenant_id, cxc_id);

-- Cuentas por pagar. Estados: abierta -> programada (alguien propone fecha) -> aprobada
-- (la persona que aprueba) -> pagada. La proyección cuenta todo lo no pagado.
CREATE TABLE IF NOT EXISTS fz_cxp (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  proveedor_id INTEGER NOT NULL REFERENCES fz_proveedores(id),
  folio TEXT,
  fecha DATE NOT NULL,
  vencimiento DATE NOT NULL,
  total NUMERIC(14,2) NOT NULL CHECK (total > 0),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','programada','aprobada','pagada','cancelada')),
  fecha_programada DATE,
  programado_por INTEGER,
  aprobado_por INTEGER,
  aprobado_at TIMESTAMPTZ,
  notas TEXT,
  origen TEXT NOT NULL DEFAULT 'manual',
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_cxp_tenant ON fz_cxp (tenant_id, estado, vencimiento);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_cxp_folio ON fz_cxp (tenant_id, proveedor_id, folio) WHERE folio IS NOT NULL;

CREATE TABLE IF NOT EXISTS fz_cxp_pagos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  cxp_id INTEGER NOT NULL REFERENCES fz_cxp(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  movimiento_id INTEGER REFERENCES fz_movimientos(id) ON DELETE SET NULL,
  nota TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_cxp_pagos ON fz_cxp_pagos (tenant_id, cxp_id);

-- Gastos fijos que se repiten: nómina, IMSS, renta, financiamientos (camión), servicios.
-- pagado_hasta: la última fecha ya pagada; la proyección solo cuenta las que vienen después.
CREATE TABLE IF NOT EXISTS fz_fijos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'otro',
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  frecuencia TEXT NOT NULL CHECK (frecuencia IN ('semanal','quincenal','mensual')),
  dia INTEGER,
  desde DATE,
  hasta DATE,
  pagado_hasta DATE,
  notas TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_fijos_tenant ON fz_fijos (tenant_id);

CREATE TABLE IF NOT EXISTS fz_activity (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  user_email TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_activity_tenant ON fz_activity (tenant_id, id);

-- ── Integración con SICAR (15-nov-2026) ──────────────────────────────
-- SICAR no tiene API: se importan sus reportes (PDF o Excel). Cada importación queda registrada
-- con la huella del archivo y si la suma leída cuadró con el total que imprime SICAR.
CREATE TABLE IF NOT EXISTS fz_sicar_imports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  tipo TEXT NOT NULL,
  archivo TEXT,
  sha256 TEXT NOT NULL,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','puente')),
  desde DATE,
  hasta DATE,
  filas INTEGER NOT NULL DEFAULT 0,
  cuadra BOOLEAN,
  total_impreso NUMERIC(16,2),
  total_leido NUMERIC(16,2),
  resumen JSONB,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_fz_sicar_imports_tenant ON fz_sicar_imports (tenant_id, id);

-- Documentos de SICAR para análisis (compras, gastos, ventas, abonos). clave = huella del renglón:
-- importar un periodo que se traslapa no duplica nada.
CREATE TABLE IF NOT EXISTS fz_sicar_docs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('compra','venta','abono_cliente','abono_proveedor')),
  doc TEXT,
  folio TEXT,
  fecha DATE NOT NULL,
  parte TEXT,
  caja TEXT,
  est TEXT,
  total NUMERIC(16,2) NOT NULL,
  clave TEXT NOT NULL,
  import_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_sicar_docs_clave ON fz_sicar_docs (tenant_id, clave);
CREATE INDEX IF NOT EXISTS ix_fz_sicar_docs_fecha ON fz_sicar_docs (tenant_id, tipo, fecha);

-- Saldos por cliente/proveedor según SICAR en una fecha de corte (reportes de créditos y por periodo).
CREATE TABLE IF NOT EXISTS fz_sicar_saldos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  import_id INTEGER NOT NULL REFERENCES fz_sicar_imports(id) ON DELETE CASCADE,
  lado TEXT NOT NULL CHECK (lado IN ('cxc','cxp')),
  parte TEXT NOT NULL,
  num TEXT,
  saldo NUMERIC(16,2) NOT NULL,
  d0 NUMERIC(16,2), d31 NUMERIC(16,2), d61 NUMERIC(16,2), d91 NUMERIC(16,2), d121 NUMERIC(16,2)
);
CREATE INDEX IF NOT EXISTS ix_fz_sicar_saldos ON fz_sicar_saldos (tenant_id, import_id);
-- vista = el filtro Estado del reporte (por_pagar, vencidos, todos...): un reporte de vencidos no es el saldo total.
ALTER TABLE fz_sicar_saldos ADD COLUMN IF NOT EXISTS vista TEXT;

-- Llaves del puente SICAR (la computadora de Forzza sube los reportes de una carpeta).
-- Solo se guarda el SHA-256; la llave se muestra una vez.
CREATE TABLE IF NOT EXISTS fz_api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES fz_tenants(id),
  nombre TEXT NOT NULL,
  prefijo TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'sicar' CHECK (scope IN ('sicar')),
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_fz_api_keys_tenant ON fz_api_keys (tenant_id);

-- Un abono o pago que vino de SICAR lleva su referencia: reimportar el mismo reporte no lo repite.
ALTER TABLE fz_cxc_abonos ADD COLUMN IF NOT EXISTS ref_externa TEXT;
ALTER TABLE fz_cxp_pagos ADD COLUMN IF NOT EXISTS ref_externa TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_cxc_abonos_ref ON fz_cxc_abonos (tenant_id, ref_externa) WHERE ref_externa IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fz_cxp_pagos_ref ON fz_cxp_pagos (tenant_id, ref_externa) WHERE ref_externa IS NOT NULL;
ALTER TABLE fz_clientes ADD COLUMN IF NOT EXISTS sicar_num TEXT;
ALTER TABLE fz_proveedores ADD COLUMN IF NOT EXISTS sicar_num TEXT;
