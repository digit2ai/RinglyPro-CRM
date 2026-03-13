# Torna Idioma — Modelos de Datos y Arquitectura

> Documentación completa de todos los modelos, tablas, relaciones y flujos de datos del sistema Torna Idioma.

---

## Resumen del Sistema

Torna Idioma es una plataforma educativa trilingüe (EN/ES/FIL) para enseñanza de español en Makati City, Filipinas. Incluye:
- **Educación**: Cursos, lecciones, ejercicios, progreso, certificaciones
- **IA Tutor**: Profesora Isabel (Don Quijote immersion method)
- **BPO**: Empresas socias, bolsa de trabajo, colocaciones
- **Advocacy**: Eventos, supporters, donaciones
- **Gobierno**: KPIs, escuelas, impacto económico, red de socios

**Stack**: PostgreSQL, Sequelize (raw queries), Express.js, React 18, Vite

---

## Diagrama de Relaciones

```
ti_users (core)
  ├── 1:N → ti_courses (created_by)
  ├── 1:N → ti_events (created_by)
  ├── 1:N → ti_enrollments (user_id → course_id)
  ├── 1:N → ti_lesson_progress (user_id → lesson_id)
  ├── 1:N → ti_certifications (user_id)
  ├── 1:N → ti_bpo_placements (user_id → company_id)
  ├── 1:N → ti_bpo_applications (user_id → job_id)
  ├── 1:N → ti_event_registrations (user_id → event_id)
  └── 1:1 → ti_tutor_sessions (user_id)

ti_courses
  ├── 1:N → ti_lessons (course_id)
  └── 1:N → ti_enrollments (course_id)

ti_lessons
  └── 1:N → ti_lesson_progress (lesson_id)

ti_bpo_companies
  ├── 1:N → ti_bpo_jobs (company_id)
  └── 1:N → ti_bpo_placements (company_id)

ti_bpo_jobs
  └── 1:N → ti_bpo_applications (job_id)

ti_events
  └── 1:N → ti_event_registrations (event_id)

ti_supporters
  └── 1:N → ti_donations (supporter_id)
```

---

## 1. ti_users — Usuarios

**Migración**: `001_ti_core.sql`
**Propósito**: Cuentas de todos los participantes del sistema.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | Identificador único |
| email | VARCHAR(255) UNIQUE NOT NULL | Login |
| password_hash | VARCHAR(255) NOT NULL | Bcrypt hash |
| tenant_id | VARCHAR(50) DEFAULT 'torna_idioma' | Aislamiento multi-tenant |
| role | VARCHAR(30) DEFAULT 'student' | admin, official, teacher, student, bpo_worker, partner |
| full_name | VARCHAR(255) NOT NULL | Nombre completo |
| phone | VARCHAR(50) | Teléfono |
| organization | VARCHAR(255) | Organización afiliada |
| language_pref | VARCHAR(5) DEFAULT 'en' | en, es, fil |
| avatar_url | TEXT | URL de foto |
| status | VARCHAR(20) DEFAULT 'active' | active, inactive, suspended |
| last_login | TIMESTAMPTZ | Último inicio de sesión |
| created_at | TIMESTAMPTZ | Creación |
| updated_at | TIMESTAMPTZ | Última actualización |

**Índices**: email, role, tenant_id
**API**: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
**Seed**: 7 usuarios demo (admin, teacher, student, official, bpo_worker, partner)

---

## 2. ti_courses — Cursos

**Migración**: `002_ti_education.sql`
**Propósito**: Catálogo de cursos de español.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| title_en, title_es, title_fil | VARCHAR(255) | Títulos trilingües |
| description_en, description_es, description_fil | TEXT | Descripciones trilingües |
| level | VARCHAR(30) DEFAULT 'beginner' | beginner, intermediate, advanced |
| category | VARCHAR(50) DEFAULT 'general' | general, bpo, cultural, business, certification |
| duration_hours | INTEGER DEFAULT 0 | Horas estimadas |
| total_lessons | INTEGER DEFAULT 0 | Conteo de lecciones (calculado) |
| thumbnail_url | TEXT | Imagen del curso |
| is_published | BOOLEAN DEFAULT false | Visibilidad |
| sort_order | INTEGER DEFAULT 0 | Orden en catálogo |
| created_by | INTEGER FK → ti_users | Creador |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/courses` (publicados), `GET /api/courses/:id` (con lecciones), `POST /api/courses` (teacher)
**Seed**: 5 cursos — Spanish Fundamentals, BPO Spanish, Filipino-Spanish Heritage, Advanced Business, DELE Prep

---

## 3. ti_lessons — Lecciones

**Migración**: `002_ti_education.sql`
**Propósito**: Contenido educativo dentro de cada curso.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| course_id | INTEGER FK → ti_courses ON DELETE CASCADE | Curso padre |
| title_en, title_es, title_fil | VARCHAR(255) | Títulos trilingües |
| content_en, content_es, content_fil | TEXT | Contenido en markdown |
| lesson_type | VARCHAR(30) DEFAULT 'reading' | reading, video, exercise, quiz |
| sort_order | INTEGER DEFAULT 0 | Secuencia dentro del curso |
| duration_minutes | INTEGER DEFAULT 15 | Duración estimada |
| exercises | JSONB DEFAULT '[]' | Ejercicios embebidos |
| created_at, updated_at | TIMESTAMPTZ | |

**Formato de exercises** (JSONB):
```json
[
  { "type": "multiple_choice", "q": "Pregunta?", "options": ["A","B","C","D"], "answer": 1 },
  { "type": "fill_blank", "q": "Me _____ Juan.", "answer": "llamo" }
]
```

**API**: `GET /api/courses/lessons/:id` (con progreso del usuario y lecciones hermanas)
**Seed**: 25 lecciones (5 por curso) desde `seeds/lessons.js`

---

## 4. ti_enrollments — Inscripciones

**Migración**: `002_ti_education.sql`
**Propósito**: Seguimiento de inscripciones de usuarios en cursos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users ON DELETE CASCADE | |
| course_id | INTEGER FK → ti_courses ON DELETE CASCADE | |
| status | VARCHAR(20) DEFAULT 'active' | active, completed, dropped |
| enrolled_at | TIMESTAMPTZ | Fecha de inscripción |
| completed_at | TIMESTAMPTZ | Fecha de completado |
| progress_pct | NUMERIC(5,2) DEFAULT 0 | Porcentaje 0-100 (calculado) |

**UNIQUE**: (user_id, course_id)
**API**: `POST /api/courses/:id/enroll`, `GET /api/courses/my/enrollments`
**Lógica**: `progress_pct` se recalcula automáticamente en cada `POST /courses/lessons/:id/progress`

---

## 5. ti_lesson_progress — Progreso de Lecciones

**Migración**: `002_ti_education.sql`
**Propósito**: Progreso individual por lección por estudiante.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users ON DELETE CASCADE | |
| lesson_id | INTEGER FK → ti_lessons ON DELETE CASCADE | |
| status | VARCHAR(20) DEFAULT 'not_started' | not_started, in_progress, completed |
| score | NUMERIC(5,2) | Puntuación del ejercicio (0-100) |
| time_spent_sec | INTEGER DEFAULT 0 | Segundos acumulados |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**UNIQUE**: (user_id, lesson_id)
**API**: `POST /api/courses/lessons/:id/progress`
**Lógica**: Upsert — si existe, actualiza score/status/time_spent; si no, inserta. Después recalcula `ti_enrollments.progress_pct`.

---

## 6. ti_certifications — Certificaciones

**Migración**: `002_ti_education.sql`
**Propósito**: Certificaciones otorgadas (DELE y completado de curso).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users ON DELETE CASCADE | |
| cert_type | VARCHAR(50) NOT NULL | DELE A1/A2/B1/B2/C1, course_completion, custom |
| cert_level | VARCHAR(30) | A1, A2, B1, B2, C1, C2 |
| course_id | INTEGER FK → ti_courses | Curso asociado (opcional) |
| score | NUMERIC(5,2) | Puntuación |
| issued_at | TIMESTAMPTZ | Fecha de emisión |
| expires_at | TIMESTAMPTZ | Expiración (si aplica) |
| certificate_url | TEXT | URL del certificado PDF |
| status | VARCHAR(20) DEFAULT 'active' | active, expired, revoked |

**API**: `GET /api/courses/my/certifications`

---

## 7. ti_schools — Escuelas

**Migración**: `003_ti_programs.sql`
**Propósito**: Escuelas participantes en el programa.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(255) NOT NULL | Nombre de la escuela |
| school_type | VARCHAR(30) DEFAULT 'public' | public, private |
| barangay | VARCHAR(100) | Barangay en Makati |
| address | TEXT | Dirección completa |
| principal_name | VARCHAR(255) | Director/a |
| contact_email | VARCHAR(255) | Email de contacto |
| contact_phone | VARCHAR(50) | Teléfono |
| total_students | INTEGER DEFAULT 0 | Total de alumnos |
| enrolled_students | INTEGER DEFAULT 0 | Alumnos en Torna Idioma |
| program_status | VARCHAR(20) DEFAULT 'pilot' | pilot, active, expanding, inactive |
| joined_at | TIMESTAMPTZ | Fecha de incorporación |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/analytics/schools`
**Seed**: 7 escuelas en Makati (University of Makati, Makati Science HS, Don Bosco, etc.)

---

## 8. ti_bpo_companies — Empresas BPO

**Migración**: `003_ti_programs.sql`
**Propósito**: Socios corporativos BPO con posiciones de español.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(255) NOT NULL | |
| industry | VARCHAR(100) | BPO / Contact Center, etc. |
| contact_name | VARCHAR(255) | Contacto de contratación |
| contact_email, contact_phone | VARCHAR | |
| spanish_positions | INTEGER DEFAULT 0 | Posiciones disponibles |
| avg_salary_increase | NUMERIC(10,2) | % aumento salarial promedio |
| partnership_status | VARCHAR(20) DEFAULT 'prospect' | prospect, active, hiring |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/bpo/companies`, `GET /api/bpo/companies/:id`, `POST /api/bpo/companies` (admin)
**Seed**: Teleperformance, Concentrix, TTEC, Sitel, Alorica

---

## 9. ti_bpo_placements — Colocaciones BPO

**Migración**: `003_ti_programs.sql`
**Propósito**: Registro de colocaciones laborales exitosas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users | |
| company_id | INTEGER FK → ti_bpo_companies | |
| position_title | VARCHAR(255) | Puesto |
| salary_before | NUMERIC(12,2) | Salario previo |
| salary_after | NUMERIC(12,2) | Nuevo salario |
| salary_increase_pct | NUMERIC(5,2) | % de aumento |
| placed_at | TIMESTAMPTZ | Fecha de colocación |
| status | VARCHAR(20) DEFAULT 'active' | |

**Uso en Analytics**: Calcula total placements, avg salary increase, annual income increase, estimated tax revenue

---

## 10. ti_bpo_jobs — Bolsa de Trabajo

**Migración**: `005_ti_bpo_jobs.sql`
**Propósito**: Ofertas laborales de empresas BPO socias.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| company_id | INTEGER FK → ti_bpo_companies ON DELETE CASCADE | |
| title | VARCHAR(255) NOT NULL | Título del puesto |
| description_en, description_es, description_fil | TEXT | |
| location | VARCHAR(255) DEFAULT 'Makati City' | |
| job_type | VARCHAR(30) DEFAULT 'full_time' | full_time, part_time, contract |
| salary_range | VARCHAR(100) | "₱28,000 - ₱35,000" |
| spanish_level_required | VARCHAR(10) DEFAULT 'B1' | A1-C2 |
| requirements | JSONB DEFAULT '[]' | |
| benefits | JSONB DEFAULT '[]' | |
| slots | INTEGER DEFAULT 1 | |
| applications_count | INTEGER DEFAULT 0 | |
| status | VARCHAR(20) DEFAULT 'open' | open, closed, filled |
| posted_at, closes_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/bpo/jobs`
**Seed**: 8 ofertas laborales

---

## 11. ti_bpo_applications — Aplicaciones de Trabajo

**Migración**: `005_ti_bpo_jobs.sql`
**Propósito**: Solicitudes de empleo de usuarios.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users ON DELETE CASCADE | |
| job_id | INTEGER FK → ti_bpo_jobs ON DELETE CASCADE | |
| cover_note | TEXT | Nota de presentación |
| status | VARCHAR(20) DEFAULT 'submitted' | submitted, reviewing, interview, offered, rejected |
| applied_at | TIMESTAMPTZ | |
| reviewed_at | TIMESTAMPTZ | |

**UNIQUE**: (user_id, job_id)
**API**: `POST /api/bpo/jobs/:id/apply`, `GET /api/bpo/my/applications`

---

## 12. ti_partners — Red de Socios

**Migración**: `003_ti_programs.sql`
**Propósito**: Universidades e instituciones socias internacionales.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(255) NOT NULL | |
| country | VARCHAR(100) NOT NULL | |
| country_flag | VARCHAR(10) | Emoji bandera |
| partner_type | VARCHAR(50) DEFAULT 'university' | university, cultural_center, government, ngo, corporate |
| description_en, description_es | TEXT | |
| contact_name, contact_email | VARCHAR | |
| programs_offered | JSONB DEFAULT '[]' | |
| partnership_status | VARCHAR(20) DEFAULT 'active' | |
| signed_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/analytics/partners`
**Seed**: 6 socios (Instituto Cervantes, UNAM, U. Andes, PUC Chile, UBA, U. Makati)

---

## 13. ti_events — Eventos

**Migración**: `003_ti_programs.sql`
**Propósito**: Eventos culturales, talleres, sesiones informativas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| title_en, title_es, title_fil | VARCHAR(255) | |
| description_en, description_es, description_fil | TEXT | |
| event_type | VARCHAR(50) DEFAULT 'cultural' | cultural, workshop, social, info_session, conference |
| location | VARCHAR(255) | Lugar físico |
| event_date | TIMESTAMPTZ NOT NULL | Fecha/hora inicio |
| end_date | TIMESTAMPTZ | Fecha/hora fin |
| capacity | INTEGER | Capacidad máxima |
| registered_count | INTEGER DEFAULT 0 | Registros actuales |
| is_published | BOOLEAN DEFAULT true | |
| created_by | INTEGER FK → ti_users | |
| created_at, updated_at | TIMESTAMPTZ | |

**API**: `GET /api/advocacy/events`, `POST /api/advocacy/events` (admin)
**Seed**: 6 eventos (Día de la Hispanidad, Spanish for BPO Workshop, Tertulias, DELE Info, Heritage Walk, Paella Night)

---

## 14. ti_event_registrations — Registros a Eventos

**Migración**: `003_ti_programs.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| event_id | INTEGER FK → ti_events ON DELETE CASCADE | |
| user_id | INTEGER FK → ti_users ON DELETE SET NULL | Null para invitados |
| guest_name, guest_email | VARCHAR(255) | Para registros sin cuenta |
| status | VARCHAR(20) DEFAULT 'registered' | registered, attended, no_show |
| registered_at | TIMESTAMPTZ | |

**UNIQUE**: (event_id, user_id)
**API**: `POST /api/advocacy/events/:id/register`, `GET /api/advocacy/events/my`

---

## 15. ti_supporters — Supporters

**Migración**: `003_ti_programs.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| full_name | VARCHAR(255) NOT NULL | |
| email | VARCHAR(255) UNIQUE NOT NULL | |
| phone | VARCHAR(50) | |
| supporter_type | VARCHAR(30) DEFAULT 'individual' | individual, organization, sponsor, media |
| organization | VARCHAR(255) | |
| message | TEXT | Motivo de apoyo |
| is_newsletter | BOOLEAN DEFAULT true | |
| signed_at | TIMESTAMPTZ | |

**API**: `POST /api/advocacy/supporters`, `GET /api/advocacy/supporters` (admin)

---

## 16. ti_donations — Donaciones

**Migración**: `003_ti_programs.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| supporter_id | INTEGER FK → ti_supporters | |
| donor_name, donor_email | VARCHAR(255) | |
| amount | NUMERIC(12,2) NOT NULL | |
| currency | VARCHAR(5) DEFAULT 'PHP' | PHP, USD, EUR |
| donation_type | VARCHAR(30) DEFAULT 'one_time' | one_time, monthly, annual |
| purpose | VARCHAR(100) | Scholarship, events, operations |
| status | VARCHAR(20) DEFAULT 'received' | |
| donated_at | TIMESTAMPTZ | |

---

## 17. ti_kpi_snapshots — Snapshots de KPIs

**Migración**: `004_ti_analytics.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| snapshot_date | DATE NOT NULL | |
| period | VARCHAR(10) DEFAULT 'daily' | daily, weekly, monthly |
| metrics | JSONB NOT NULL DEFAULT '{}' | KPIs flexibles |
| created_at | TIMESTAMPTZ | |

**Uso**: Series temporales para tendencias históricas.

---

## 18. ti_economic_impact — Impacto Económico

**Migración**: `004_ti_analytics.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| period_start, period_end | DATE | Periodo del reporte |
| total_students_enrolled | INTEGER | |
| total_certified | INTEGER | |
| total_bpo_placed | INTEGER | |
| avg_salary_increase_pct | NUMERIC(5,2) | |
| total_salary_increase_php | NUMERIC(15,2) | |
| estimated_tax_revenue_php | NUMERIC(15,2) | 15% de ingresos |
| partner_count, school_count, event_count, supporter_count | INTEGER | |
| total_donations_php | NUMERIC(15,2) | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

**API**: `GET /api/analytics/economic-impact`

---

## 19. ti_mcp_tool_log — Log de Herramientas MCP

**Migración**: `004_ti_analytics.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| tool_name | VARCHAR(100) NOT NULL | |
| user_id | INTEGER | |
| input, output | JSONB | |
| duration_ms | INTEGER | |
| error | TEXT | |
| created_at | TIMESTAMPTZ | |

**Uso**: Reservado para futura integración MCP.

---

## 20. ti_tutor_sessions — Sesiones del Tutor IA

**Migración**: `006_ti_tutor_sessions.sql`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | SERIAL PK | |
| user_id | INTEGER FK → ti_users, UNIQUE | Una sesión por usuario |
| message_count | INTEGER DEFAULT 0 | Mensajes enviados |
| level | VARCHAR(10) DEFAULT 'beginner' | Nivel del estudiante |
| last_active | TIMESTAMP | Última interacción |
| created_at | TIMESTAMP | |

**API**: `POST /api/tutor/chat` (upsert con ON CONFLICT), `GET /api/tutor/starters`

---

## Flujo de Datos por Página Frontend

| Página | Endpoints |
|--------|-----------|
| **CourseCatalog** | `GET /courses`, `GET /courses/my/enrollments`, `POST /courses/:id/enroll` |
| **Classroom** | `GET /courses/:id`, `GET /courses/lessons/:id`, `POST /courses/lessons/:id/progress` |
| **Progress** | `GET /courses/my/progress` |
| **Certifications** | `GET /courses/my/certifications` |
| **AITutor** | `POST /tutor/chat`, `GET /tutor/starters` |
| **BPOProgram** | `GET /bpo/companies`, `GET /bpo/stats` |
| **JobBoard** | `GET /bpo/jobs`, `GET /bpo/my/applications`, `POST /bpo/jobs/:id/apply` |
| **Events** | `GET /advocacy/events`, `GET /advocacy/events/my`, `POST /advocacy/events/:id/register` |
| **Supporters** | `POST /advocacy/supporters`, `GET /advocacy/supporters/count` |
| **ProgramMetrics** | `GET /analytics/overview` |
| **Schools** | `GET /analytics/schools` |
| **EconomicImpact** | `GET /analytics/economic-impact` |
| **PartnerNetwork** | `GET /analytics/partners` |

---

## Convenciones

- **Prefijo `ti_`**: Todas las tablas usan el prefijo `ti_` (Torna Idioma)
- **Trilingüe**: Campos con `_en`, `_es`, `_fil` para contenido traducido
- **JSONB**: Para datos flexibles (exercises, requirements, programs_offered, metrics)
- **Soft-delete**: Campos `status` en vez de borrado físico
- **Timestamps**: `created_at` + `updated_at` en todas las tablas
- **Uniqueness**: Constraints compuestos para prevenir duplicados (enrollments, progress, applications)
- **Cascade**: `ON DELETE CASCADE` en relaciones donde la entidad padre controla el ciclo de vida
