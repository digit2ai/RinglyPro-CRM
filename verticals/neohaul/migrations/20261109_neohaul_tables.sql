-- NeoHaul — plataforma de operación (pedidos, viajes, estimaciones, facturas,
-- gastos, diésel, nómina, taller). Runs on every boot under an advisory lock,
-- so every statement must stay idempotent. Prefix nh_, tenant_id on every row.

CREATE TABLE IF NOT EXISTS nh_tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(60) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nh_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  email VARCHAR(200) NOT NULL,
  name VARCHAR(160),
  phone VARCHAR(40),
  role VARCHAR(20) NOT NULL DEFAULT 'capturista',
  password_hash VARCHAR(200),
  must_change BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nh_users_email_uq ON nh_users (LOWER(email));
CREATE INDEX IF NOT EXISTS nh_users_tenant_ix ON nh_users (tenant_id);

CREATE TABLE IF NOT EXISTS nh_trucks (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  empresa VARCHAR(40) NOT NULL,           -- NeoHaul | TTS | SEMAQSA | Externo
  unidad VARCHAR(60) NOT NULL,
  tipo VARCHAR(60),
  capacidad_m3 NUMERIC(8,2),
  placas VARCHAR(30),
  chofer_id INTEGER,
  propio BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE solo para NeoHaul: sus costos cuentan en el tablero
  notas VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_trucks_tenant_ix ON nh_trucks (tenant_id);

CREATE TABLE IF NOT EXISTS nh_drivers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  telefono VARCHAR(40),
  empresa VARCHAR(40) NOT NULL DEFAULT 'NeoHaul',
  puesto VARCHAR(40) NOT NULL DEFAULT 'chofer',  -- chofer | mecanico
  salario_semanal NUMERIC(14,2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_drivers_tenant_ix ON nh_drivers (tenant_id);

CREATE TABLE IF NOT EXISTS nh_clients (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  rfc VARCHAR(20),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_clients_tenant_ix ON nh_clients (tenant_id);

CREATE TABLE IF NOT EXISTS nh_obras (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  clave VARCHAR(40),
  ingeniero VARCHAR(160),
  ingeniero_tel VARCHAR(40),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_obras_tenant_ix ON nh_obras (tenant_id);

CREATE TABLE IF NOT EXISTS nh_tarifas (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  material VARCHAR(60),
  origen VARCHAR(120),
  destino VARCHAR(120),
  unidad VARCHAR(20) NOT NULL,            -- tonelada | dia | viaje
  precio NUMERIC(14,2) NOT NULL,
  por_confirmar BOOLEAN NOT NULL DEFAULT FALSE,
  nota VARCHAR(300),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_tarifas_tenant_ix ON nh_tarifas (tenant_id);

CREATE TABLE IF NOT EXISTS nh_pedidos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  fecha DATE NOT NULL,
  obra_id INTEGER NOT NULL,
  tarifa_id INTEGER,
  material VARCHAR(60),
  camiones INTEGER NOT NULL DEFAULT 1,
  solicitante VARCHAR(160),
  notas VARCHAR(500),
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto',  -- abierto | asignado | cerrado | cancelado
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_pedidos_tenant_ix ON nh_pedidos (tenant_id, fecha);

CREATE TABLE IF NOT EXISTS nh_asignaciones (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  pedido_id INTEGER NOT NULL,
  truck_id INTEGER NOT NULL,
  driver_id INTEGER,
  avisado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_asig_tenant_ix ON nh_asignaciones (tenant_id, pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS nh_asig_uq ON nh_asignaciones (pedido_id, truck_id);

CREATE TABLE IF NOT EXISTS nh_files (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL,              -- ticket | vale | factura | otro
  filename VARCHAR(200),
  mime VARCHAR(80) NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_files_tenant_ix ON nh_files (tenant_id);

CREATE TABLE IF NOT EXISTS nh_viajes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  fecha DATE NOT NULL,
  pedido_id INTEGER,
  obra_id INTEGER NOT NULL,
  tarifa_id INTEGER NOT NULL,
  truck_id INTEGER,
  driver_id INTEGER,
  ticket_no VARCHAR(60),
  vale_no VARCHAR(60),
  cantidad NUMERIC(12,3) NOT NULL,
  unidad VARCHAR(20) NOT NULL,
  precio_unitario NUMERIC(14,2) NOT NULL,
  importe NUMERIC(14,2) NOT NULL,
  ticket_file_id INTEGER,
  vale_file_id INTEGER,
  ocr JSONB,
  estado VARCHAR(20) NOT NULL DEFAULT 'capturado', -- capturado | confirmado
  estimacion_id INTEGER,
  notas VARCHAR(500),
  created_by INTEGER,
  confirmed_by INTEGER,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_viajes_tenant_ix ON nh_viajes (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS nh_viajes_obra_ix ON nh_viajes (tenant_id, obra_id, fecha);

CREATE TABLE IF NOT EXISTS nh_estimaciones (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  obra_id INTEGER NOT NULL,
  desde DATE NOT NULL,
  hasta DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador', -- borrador | enviada | aprobada | facturada
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  viajes INTEGER NOT NULL DEFAULT 0,
  enviada_at TIMESTAMPTZ,
  aprobada_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_est_tenant_ix ON nh_estimaciones (tenant_id, obra_id);

CREATE TABLE IF NOT EXISTS nh_facturas (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  obra_id INTEGER,
  estimacion_id INTEGER,
  concepto VARCHAR(300) NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
  unidad VARCHAR(30),
  precio_unitario NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  iva NUMERIC(14,2) NOT NULL,
  retencion NUMERIC(14,2) NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  aplica_retencion BOOLEAN NOT NULL DEFAULT TRUE,
  solicitante VARCHAR(160),
  departamento VARCHAR(120),
  folio VARCHAR(60),
  fecha_requisicion DATE NOT NULL,
  fecha_emision DATE,
  fecha_cobro DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'requisicion', -- requisicion | emitida | cobrada | cancelada
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_fact_tenant_ix ON nh_facturas (tenant_id, estado);

CREATE TABLE IF NOT EXISTS nh_gastos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  fecha DATE NOT NULL,
  proveedor VARCHAR(200) NOT NULL,
  folio VARCHAR(60),
  concepto VARCHAR(300),
  categoria VARCHAR(30) NOT NULL DEFAULT 'otros', -- diesel | refacciones | taller | llantas | casetas | otros
  total NUMERIC(14,2) NOT NULL,
  saldo NUMERIC(14,2) NOT NULL,
  truck_id INTEGER,
  obra_id INTEGER,
  prioridad VARCHAR(10),
  semana_pago DATE,                        -- lunes de la semana en que se propone pagar
  monto_propuesto NUMERIC(14,2),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente | programado | pagado
  fecha_pago DATE,
  file_id INTEGER,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_gastos_tenant_ix ON nh_gastos (tenant_id, fecha);

CREATE TABLE IF NOT EXISTS nh_gasto_reparto (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  gasto_id INTEGER NOT NULL,
  truck_id INTEGER NOT NULL,
  km NUMERIC(12,1) NOT NULL,
  monto NUMERIC(14,2) NOT NULL,
  fuente VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | gps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_reparto_tenant_ix ON nh_gasto_reparto (tenant_id, gasto_id);

CREATE TABLE IF NOT EXISTS nh_nomina (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  semana DATE NOT NULL,                    -- lunes de la semana
  dias JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"lun":"asistio",...}
  salario NUMERIC(14,2),
  bonos NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonos_nota VARCHAR(200),
  comision_pct NUMERIC(5,2) NOT NULL DEFAULT 8,
  base_comision NUMERIC(14,2) NOT NULL DEFAULT 0,
  comision NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cerrada BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nh_nomina_uq ON nh_nomina (tenant_id, driver_id, semana);

CREATE TABLE IF NOT EXISTS nh_taller (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  fecha DATE NOT NULL,
  cliente VARCHAR(160) NOT NULL DEFAULT 'NeoHaul',
  truck_id INTEGER,
  unidad_externa VARCHAR(80),
  supervisor VARCHAR(160),
  mecanico VARCHAR(160),
  trabajos VARCHAR(1000) NOT NULL,
  horas NUMERIC(8,2),
  km NUMERIC(12,1),
  refacciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  mano_obra NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cobrable BOOLEAN NOT NULL DEFAULT FALSE,
  estado VARCHAR(20) NOT NULL DEFAULT 'registrado', -- registrado | por_cobrar | cobrado
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_taller_tenant_ix ON nh_taller (tenant_id, fecha);

CREATE TABLE IF NOT EXISTS nh_activity (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  user_email VARCHAR(200),
  action VARCHAR(60) NOT NULL,
  detail VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nh_activity_tenant_ix ON nh_activity (tenant_id, created_at);
