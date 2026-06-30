-- =====================================================
-- Evaluación del Caballo de Paso Fino — Juez de Campeonato (sección 6).
--
-- Full championship schema: VIDEO (pose) + AUDIO (hoof beats) fusion, modality
-- classification with versioned thresholds, criterion scoring, and ranking.
--
-- Shared Postgres (process.env.DATABASE_URL). Every table is prefixed `ecpf_`
-- so it can never collide with another tenant/app in the shared CRM database.
-- Top-level entities carry tenant_id (multi-tenant discipline). IF NOT EXISTS
-- everywhere; ENUMs are created idempotently via DO blocks (CREATE TYPE has no
-- IF NOT EXISTS). Sequelize sync({alter:false}) also creates these on boot —
-- this file is the canonical, auditable DDL and matches the brief's section 6.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---- ENUMs (idempotent) ----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE ecpf_sexo_caballo AS ENUM ('macho','hembra','castrado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ecpf_grado_evento AS ENUM ('A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ecpf_modalidad_marcha AS ENUM ('paso_fino','trocha','trote_galope','trocha_galope');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ecpf_extremidad AS ENUM ('ant_izq','ant_der','post_izq','post_der');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ecpf_tipo_superficie AS ENUM ('tablado','arena','asfalto','tierra','cemento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- GRUPO 1: ENTIDADES BASE ----------------------------------------------
CREATE TABLE IF NOT EXISTS ecpf_propietarios (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    nombre VARCHAR(150) NOT NULL,
    documento VARCHAR(50),
    telefono VARCHAR(40),
    email VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_caballos (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    nombre VARCHAR(150) NOT NULL,
    registro_fedequinas VARCHAR(60),
    microchip VARCHAR(60),
    fecha_nacimiento DATE,
    sexo ecpf_sexo_caballo,
    capa VARCHAR(60),
    criadero VARCHAR(150),
    padre_id BIGINT REFERENCES ecpf_caballos(id),
    madre_id BIGINT REFERENCES ecpf_caballos(id),
    propietario_id BIGINT REFERENCES ecpf_propietarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_eventos (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    nombre VARCHAR(200) NOT NULL,
    grado ecpf_grado_evento,
    anio INT NOT NULL,
    sede VARCHAR(150),
    fecha_inicio DATE,
    fecha_fin DATE,
    ente_organizador VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_categorias (
    id BIGSERIAL PRIMARY KEY,
    evento_id BIGINT NOT NULL REFERENCES ecpf_eventos(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    modalidad ecpf_modalidad_marcha NOT NULL,
    edad_min_meses INT,
    edad_max_meses INT,
    sexo_permitido ecpf_sexo_caballo
);

CREATE TABLE IF NOT EXISTS ecpf_inscripciones (
    id BIGSERIAL PRIMARY KEY,
    caballo_id BIGINT NOT NULL REFERENCES ecpf_caballos(id),
    categoria_id BIGINT NOT NULL REFERENCES ecpf_categorias(id) ON DELETE CASCADE,
    numero_competidor INT,
    jinete VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (categoria_id, numero_competidor)
);

-- ---- GRUPO 2: CAPTURA (VIDEO + AUDIO CRUDO) -------------------------------
CREATE TABLE IF NOT EXISTS ecpf_sesiones_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    inscripcion_id BIGINT NOT NULL REFERENCES ecpf_inscripciones(id) ON DELETE CASCADE,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_hora_fin TIMESTAMPTZ,
    duracion_seg NUMERIC(6,2),
    superficie ecpf_tipo_superficie NOT NULL DEFAULT 'tablado',
    video_raw_url TEXT,
    fps NUMERIC(6,2),
    resolucion VARCHAR(20),
    modelo_pose VARCHAR(80),
    audio_raw_url TEXT,
    audio_sample_rate_hz INT,
    audio_canales SMALLINT,
    audio_formato VARCHAR(20),
    dispositivo_id VARCHAR(80),
    condiciones_ambientales TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_puntos_anatomicos (
    id SMALLSERIAL PRIMARY KEY,
    codigo VARCHAR(40) UNIQUE NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    region VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS ecpf_frames_video (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    numero_frame INT NOT NULL,
    timestamp_ms INT NOT NULL,
    UNIQUE (sesion_id, numero_frame)
);

CREATE TABLE IF NOT EXISTS ecpf_pose_keypoints (
    id BIGSERIAL PRIMARY KEY,
    frame_id BIGINT NOT NULL REFERENCES ecpf_frames_video(id) ON DELETE CASCADE,
    punto_id SMALLINT NOT NULL REFERENCES ecpf_puntos_anatomicos(id),
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL,
    confianza REAL,
    visible BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ecpf_pisadas (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    timestamp_ms INT NOT NULL,
    extremidad ecpf_extremidad NOT NULL,
    orden_secuencia SMALLINT,
    intervalo_anterior_ms INT,
    intensidad_db REAL,
    duracion_contacto_ms INT,
    detectada_por_video BOOLEAN DEFAULT TRUE,
    detectada_por_audio BOOLEAN DEFAULT FALSE,
    confianza REAL
);

-- ---- GRUPO 3: MÉTRICAS DERIVADAS ------------------------------------------
CREATE TABLE IF NOT EXISTS ecpf_metricas_movimiento (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    cadencia_ppm REAL,
    regularidad_ritmo REAL,
    simetria_lateral REAL,
    uniformidad_4_tiempos REAL,
    coef_variacion_intervalos REAL,
    elevacion_anterior REAL,
    elevacion_posterior REAL,
    longitud_paso REAL,
    velocidad_promedio REAL,
    UNIQUE (sesion_id)
);

CREATE TABLE IF NOT EXISTS ecpf_metricas_sonido (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    intervalo_promedio_ms REAL,
    desviacion_intervalos_ms REAL,
    claridad_4_tiempos REAL,
    nivel_db_promedio REAL,
    frecuencia_dominante_hz REAL,
    relacion_senal_ruido REAL,
    UNIQUE (sesion_id)
);

-- ---- GRUPO 4: CLASIFICACIÓN Y PUNTUACIÓN ----------------------------------
CREATE TABLE IF NOT EXISTS ecpf_modelos_clasificacion (
    id BIGSERIAL PRIMARY KEY,
    version VARCHAR(40) NOT NULL,
    modalidad ecpf_modalidad_marcha,
    umbrales_json JSONB,
    fecha_entrenamiento DATE,
    activo BOOLEAN DEFAULT FALSE,
    UNIQUE (version)
);

CREATE TABLE IF NOT EXISTS ecpf_clasificaciones (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    modalidad_detectada ecpf_modalidad_marcha,
    confianza REAL,
    modelo_id BIGINT REFERENCES ecpf_modelos_clasificacion(id),
    es_modalidad_valida BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_criterios_evaluacion (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    modalidad ecpf_modalidad_marcha,
    peso_porcentaje NUMERIC(5,2),
    formula TEXT
);

CREATE TABLE IF NOT EXISTS ecpf_puntuaciones (
    id BIGSERIAL PRIMARY KEY,
    sesion_id BIGINT NOT NULL REFERENCES ecpf_sesiones_evaluacion(id) ON DELETE CASCADE,
    criterio_id BIGINT NOT NULL REFERENCES ecpf_criterios_evaluacion(id),
    valor_medido REAL,
    puntaje_normalizado REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecpf_resultados (
    id BIGSERIAL PRIMARY KEY,
    inscripcion_id BIGINT NOT NULL REFERENCES ecpf_inscripciones(id) ON DELETE CASCADE,
    puntaje_total REAL,
    ranking INT,
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inscripcion_id)
);

-- ---- ÍNDICES --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ecpf_caballos_tenant     ON ecpf_caballos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_eventos_tenant      ON ecpf_eventos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_frames_sesion_ts    ON ecpf_frames_video (sesion_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_ecpf_keypoints_frame     ON ecpf_pose_keypoints (frame_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_keypoints_punto     ON ecpf_pose_keypoints (punto_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_pisadas_sesion_ts   ON ecpf_pisadas (sesion_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_ecpf_pisadas_extremidad  ON ecpf_pisadas (sesion_id, extremidad);
CREATE INDEX IF NOT EXISTS idx_ecpf_clasif_sesion       ON ecpf_clasificaciones (sesion_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_punt_sesion         ON ecpf_puntuaciones (sesion_id);
CREATE INDEX IF NOT EXISTS idx_ecpf_inscrip_categoria   ON ecpf_inscripciones (categoria_id);

-- ---- SEED: puntos anatómicos equinos (22) ---------------------------------
INSERT INTO ecpf_puntos_anatomicos (codigo, nombre, region) VALUES
('hocico','Hocico','cabeza'),
('nuca','Nuca','cabeza'),
('cruz','Cruz','tronco'),
('dorso','Dorso','tronco'),
('grupa','Grupa','tronco'),
('base_cola','Base de la cola','tronco'),
('codo_ant_izq','Codo anterior izq','ant_izq'),
('rodilla_ant_izq','Rodilla anterior izq','ant_izq'),
('menudillo_ant_izq','Menudillo anterior izq','ant_izq'),
('casco_ant_izq','Casco anterior izq','ant_izq'),
('codo_ant_der','Codo anterior der','ant_der'),
('rodilla_ant_der','Rodilla anterior der','ant_der'),
('menudillo_ant_der','Menudillo anterior der','ant_der'),
('casco_ant_der','Casco anterior der','ant_der'),
('babilla_post_izq','Babilla posterior izq','post_izq'),
('corvejon_post_izq','Corvejón posterior izq','post_izq'),
('menudillo_post_izq','Menudillo posterior izq','post_izq'),
('casco_post_izq','Casco posterior izq','post_izq'),
('babilla_post_der','Babilla posterior der','post_der'),
('corvejon_post_der','Corvejón posterior der','post_der'),
('menudillo_post_der','Menudillo posterior der','post_der'),
('casco_post_der','Casco posterior der','post_der')
ON CONFLICT (codigo) DO NOTHING;

-- ---- SEED: criterios paso fino (ajustar pesos al reglamento Fedequinas) ----
INSERT INTO ecpf_criterios_evaluacion (nombre, modalidad, peso_porcentaje, formula)
SELECT * FROM (VALUES
  ('Ritmo y regularidad','paso_fino'::ecpf_modalidad_marcha,35.00,'f(coef_variacion_intervalos)'),
  ('Claridad 4 tiempos','paso_fino'::ecpf_modalidad_marcha,25.00,'f(claridad_4_tiempos)'),
  ('Simetría lateral','paso_fino'::ecpf_modalidad_marcha,15.00,'f(simetria_lateral)'),
  ('Brío / cadencia','paso_fino'::ecpf_modalidad_marcha,15.00,'f(cadencia_ppm)'),
  ('Elevación','paso_fino'::ecpf_modalidad_marcha,10.00,'f(elevacion_anterior, elevacion_posterior)')
) AS v(nombre, modalidad, peso_porcentaje, formula)
WHERE NOT EXISTS (
  SELECT 1 FROM ecpf_criterios_evaluacion WHERE modalidad = 'paso_fino'
);

-- ---- SEED: modelo de clasificación activo v1.0.0 (umbrales versionados) -----
INSERT INTO ecpf_modelos_clasificacion (version, modalidad, umbrales_json, fecha_entrenamiento, activo)
VALUES (
  'v1.0.0', NULL,
  '{"cluster_beat_ms":60,"fusion_window_ms":40,"cv_paso_fino_max":0.10,"cv_regular_max":0.18,"lateral_ratio_min":0.60,"diagonal_ratio_min":0.60,"cadencia_paso_fino_min_ppm":120,"cadencia_paso_fino_ideal_ppm":180,"cadencia_paso_fino_max_ppm":280}'::jsonb,
  NULL, TRUE
)
ON CONFLICT (version) DO NOTHING;
