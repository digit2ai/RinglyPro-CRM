# PLANEA v2 — Arquitectura, Gap Analysis y Backlog

> Fuente: `planea-architect-prompt.json` (v1.0, 2026-07-13) + 4 pantallas (`portal-planea-*.html`) +
> `Planea_User_Stories_v1.pdf` + `Planea_Logica_Recomendaciones.docx` (§16 de `PLANEA-BUILD-SPEC.md`).
> Generado por RinglyPro AI Architect (loop). Reconcilia el build actual (`/planea`, Ionic React + Supabase)
> contra la spec de negocio de 3 agentes + 4 épicas.
>
> **Clasificación:** plataforma de EDUCACIÓN financiera (NO asesoría de inversión regulada).
> **Entidad:** Planea Financiera S.A.S. — NIT 902055456-3, Cali. Dominio planea.co.
> **Equipo:** dev = Rommel · compliance = Eduardo · producto = Manny.
> **Idioma:** español (Colombia). Mobile-first, el flujo E2E debe funcionar sin bugs en móvil.

---

## 0. Estado del deploy (esta iteración)
- **LIVE — Portal v2 (preview de diseño):** las 4 pantallas nuevas (Inicio, Patrimonio, Metas, Cuentas)
  con el nuevo design system teal, navegables en `https://aiagent.ringlypro.com/planea/portal/`.
  HTML/CSS estático, sin build, UTF-8 correcto, nav cableada, botón flotante de Maya (placeholder).
- **LIVE — App real v1 (SPA):** `https://aiagent.ringlypro.com/planea/` (Ionic React + Supabase) —
  score/diagnóstico, login, dashboard, patrimonio v1. Sin cambios en esta iteración.
- **Doc de arquitectura:** este archivo (data model + orquestación + compliance + scheduler + backlog).

> Nota de diseño: el portal v2 introduce **7 pilares** (Ahorro, Deuda, Inversión, Seguros, Impuestos,
> Pensión, Legado) vs. los **4 pilares** del score v1 (Fondo de emergencia, Flujo de caja, Salud de deuda,
> Estabilidad). Ver Open Question OQ-1 — hay que reconciliar si los 7 pilares son una VISTA de planeación
> distinta del score, o si el score se recalcula. Recomendación: mantener el **score de 4 pilares** como
> motor (metodología CFP validada) y presentar los **7 pilares** como tablero de planeación patrimonial
> (capa superior), NO como recálculo del score.

---

## 1. GAP ANALYSIS (build actual vs. spec v2)

Leyenda: ✅ existe · 🟡 parcial · ❌ falta

### 1.1 Épicas / pantallas
| Épica | Requisito | Estado | Nota |
|---|---|---|---|
| E1 Home | Dashboard personalizado + score + net worth + pilares + Maya en cada pantalla | 🟡 | v1 tiene dashboard/score/meta; el portal v2 (preview) muestra el layout objetivo con 7 pilares |
| E1 Home | Navegación entre módulos (Inicio/Patrimonio/Metas/Cuentas/Asesoría/Config) | 🟡 | Nav del portal cableada; falta en la app real (v1 tiene 4 tabs distintos) |
| E2 Patrimonio | Net worth + diversificación por moneda (COP/USD/EUR) | ❌ | v1 solo activos−pasivos en COP; falta multi-moneda |
| E2 Patrimonio | Categorías de activos + estado de protección + evolución 12m | 🟡 | v1 tiene activos/pasivos; falta evolución 12m y protección |
| E2 Patrimonio | AI insight de optimización patrimonial | ❌ | requiere Financial Planner agent |
| E3 Metas | Metas priorizadas (alta/baja) + % + deadline | 🟡 | v1 tiene metas de largo plazo; falta priorización alta/baja |
| E3 Metas | Crear meta con IA | ❌ | requiere Financial Planner |
| E3 Metas | Neural Insights (lista semanal rankeada + newsletter) | ❌ | requiere Financial Planner + scheduler + email |
| E4 Cuentas | Conectar instituciones vía open finance | ❌ | requiere proveedor open finance (Belvo/Finerio) — dep. externa |
| E4 Cuentas | Cuentas agrupadas por institución + productos | ❌ | depende de open finance |
| E4 Cuentas | Sugerencias de producto (referencia de mercado + disclaimer) | 🟡 | portal muestra UI + disclaimer; falta motor + reserva Product Matchmaker |

### 1.2 Agentes / IA
| Componente | Estado | Nota |
|---|---|---|
| Financial Planner (árbol A–I + pirámide CFP) | 🟡 | La lógica determinística está DOCUMENTADA (§16 build-spec) y parcialmente en el frontend v1; falta el agente servidor MCP que la ejecute + chat + insights + PDF |
| Chat con Maya (memoria de conversación) | ❌ | v1 no tiene chat conversacional; requiere agente + almacenamiento `agent_messages` |
| Onboarding & Relationship Manager (6 triggers) | ❌ | falta scheduler + push/in-app |
| Compliance Manager (gate en cada salida) | ❌ | falta; contrato definido en §4 |
| Extracción de PDF de extractos | ❌ | requiere pipeline de extracción + comparación con survey |
| Product Matchmaker (4º agente) | ⛔ NO CONSTRUIR | solo reservar extension point en el diseño MCP |

### 1.3 Datos / infraestructura
| Componente | Estado | Nota |
|---|---|---|
| Backend | 🟡 | v1 en **Supabase** propio; la spec pide **MCP + PostgreSQL (RinglyPro)**. Ver OQ-2 |
| Multi-tenant `tenant_id` | 🟡 | Supabase aísla por RLS/usuario; si se migra a Postgres CRM, aplicar `tenant_id` |
| Scheduler (n8n/cron, America/Bogota) | ❌ | falta |
| Compliance audit log | ❌ | falta |
| Push notifications | ❌ | falta (Capacitor push + web) |

---

## 2. DATA MODEL (PostgreSQL propuesto)

Multi-tenant (`tenant_id`), zona horaria de negocio America/Bogota, montos en **COP enteros** (sin decimales)
salvo `currency` explícito. Reutiliza/re-mapea las entidades v1 de Supabase (§7 build-spec).

```sql
-- Identidad / usuario (mapea persons de v1)
users(id, tenant_id, email, full_name, phone, employer_name, plan, created_at, deleted_at)

-- Onboarding
survey_responses(id, tenant_id, user_id, answers_jsonb, source, created_at)   -- P0..P8
scores(id, tenant_id, user_id, score, scenario CHAR(1), pillars_jsonb, source, created_at) -- source: survey|checkin
score_scenarios(code CHAR(1) PK, name, maya_message_template, goal_template, timeline_template) -- A..I (seed)

-- Planeación patrimonial (7 pilares como VISTA, ver OQ-1)
pillars(id, tenant_id, user_id, key, value_pct, alert_bool, updated_at)  -- key: ahorro|deuda|inversion|seguros|impuestos|pension|legado

-- Metas
goals(id, tenant_id, user_id, type, name, priority, current_amount_cop, target_amount_cop,
      percent_complete, months_remaining, deadline, status, created_by, created_at) -- priority: alta|baja; created_by: system|user|ai

-- Patrimonio
assets(id, tenant_id, user_id, name, category, value_cop, currency, created_at)
liabilities(id, tenant_id, user_id, name, category, value_cop, currency, created_at)

-- Cuentas / open finance (E4)
institutions(id, tenant_id, user_id, name, connection_method, connected_at, status)
accounts(id, tenant_id, user_id, institution_id, name, product_type, mask, balance_cop, meta_jsonb, updated_at)
policies(id, tenant_id, user_id, institution_id, name, kind, premium_cop, renewal_date, status)

-- IA / agentes
agent_messages(id, tenant_id, user_id, agent, role, content, context_jsonb, compliance_status, created_at)
message_triggers(id, tenant_id, user_id, trigger_key, scheduled_for, sent_at, channel, status) -- 6 triggers
insights(id, tenant_id, user_id, rank, title, body, meta_ref_goal_id, week_of, created_at)
pdf_documents(id, tenant_id, user_id, storage_key, sha256, extracted_jsonb, discrepancy_jsonb,
              encrypted_bool, created_at) -- cifrado en reposo

-- Cumplimiento
compliance_audit_log(id, tenant_id, user_id, source_agent, input_ref, verdict, reasons_jsonb,
                     disclaimer_applied_bool, created_at)
```
Índices: todo por `(tenant_id, user_id)`; `scores(user_id, created_at)`; `message_triggers(scheduled_for) WHERE status='pending'`.

---

## 3. ORQUESTACIÓN DE AGENTES (MCP Neural)

Tres agentes por prioridad. El 4º (Product Matchmaker) queda como **extension point reservado**, sin construir.

```
                 ┌─────────────────────────────┐
                 │   COMPLIANCE MANAGER (P3)    │  ← gate obligatorio en TODA salida al usuario
                 └─────────────▲───────────────┘
                               │ valida
   ┌──────────────────────┐    │    ┌───────────────────────────────┐
   │ FINANCIAL PLANNER(P1) │────┴────│ RELATIONSHIP MANAGER (P2)     │
   │ cerebro: árbol A–I +  │         │ retención: 6 triggers tiempo/ │
   │ pirámide CFP          │◀────────│ evento (NUNCA por chat)       │
   └──────────┬───────────┘ consulta └───────────────────────────────┘
              │ reserva
   ┌──────────▼────────────┐
   │ PRODUCT MATCHMAKER(P4) │  ⛔ NO CONSTRUIR — solo reservar el contrato/slot
   └───────────────────────┘
```

**Flujo 1 — chat del usuario:** usuario escribe → Financial Planner carga contexto completo (score,
pilares, survey, historial) y responde por el árbol de decisión → Compliance Manager valida (no asesoría
regulada, disclaimers, sin promesas de retorno) → respuesta validada al usuario.

**Flujo 2 — proactivo/agendado:** dispara un trigger del Relationship Manager → consulta al Financial
Planner para personalizar según la situación actual → Compliance valida → push o in-app.

**Flujo 3 — subida de PDF:** Financial Planner extrae datos del extracto → compara con lo declarado en el
survey → si hay discrepancia, propone actualizar el score con 2 opciones (actualizar automático / hablar con
Maya primero) → Compliance garantiza que el documento queda cifrado y su contenido nunca sale del contexto
de ese usuario.

**Regla no negociable:** el Financial Planner NUNCA improvisa fuera del árbol A–I ni de la pirámide
(flujo de caja → deuda cara → fondo de emergencia → inversión). Modelo: Claude Haiku vía `ANTHROPIC_API_KEY`
(ya disponible), con el árbol como system prompt + herramientas MCP de solo-lectura sobre el data model.

---

## 4. COMPLIANCE GATE — contrato de validación

Toda salida user-facing de P1/P2 pasa por P3 antes de entregarse. Contrato:

```
input:  { user_id, agent, content, context }
checks: [
  no_regulated_advisory,        // no recomienda productos de inversión como asesoría individualizada
  disclaimer_when_applicable,   // adjunta el disclaimer de educación financiera cuando aplica
  no_cross_user_data,           // jamás datos de otro usuario / otra sesión
  no_guaranteed_returns,        // no promete rendimientos
  ley_1581_1377_ok,             // datos personales conforme Ley 1581/2012 + Decreto 1377/2013
  pdf_confidential_encrypted    // extractos cifrados en reposo y tránsito, mismo trato que el survey
]
output: { verdict: pass|block|rewrite, reasons[], disclaimer_applied, safe_content }
audit:  → compliance_audit_log (siempre, pase o no)
```
Disclaimer canónico (de la pantalla Cuentas): *"Las sugerencias son información de referencia sobre productos
disponibles en el mercado. Planea no ofrece recomendaciones individualizadas de inversión."*

---

## 5. SCHEDULER — 6 triggers del Relationship Manager (America/Bogota)

Motor sugerido: **n8n** (ya en el stack) o cron de Render. Nunca se activan por mensajes de chat.

| # | Evento | Acción | Canal |
|---|---|---|---|
| 1 | Survey completo, sin volver en 48h | Mensaje de reactivación | push + in-app |
| 2 | Cada martes 7:00 PM | Martes de Maya — insight del pilar más débil | push |
| 3 | Día 15 y día 30 de cada mes | Check-in de 2 preguntas → recalcula score (`source='checkin'`) | in-app |
| 4 | Usuario completó una meta | Celebración + nueva meta en <24h | push + in-app |
| 5 | Inactivo 7 días | Re-engagement | push |
| 6 | Solo vio el score y se fue | Secuencia de prospecting | push + in-app |

Cada disparo escribe en `message_triggers` y su contenido pasa por Compliance antes de enviarse.

---

## 6. BACKLOG PRIORIZADO (por los 7 criterios de aceptación, mobile-first)

| Sprint | Entregable | Criterio de aceptación | Dep. externa |
|---|---|---|---|
| **S1** | Financial Planner servidor (árbol A–I) + endpoint score; survey <2 min → mensaje correcto por escenario | AC1, AC2 | — (usa ANTHROPIC_API_KEY) |
| **S1** | Migrar/mapear data model (users, survey_responses, scores, goals, assets, liabilities) | AC1 | OQ-2 (Supabase vs Postgres) |
| **S2** | Chat con Maya + memoria (`agent_messages`) + Compliance gate en el flujo 1 | AC3, AC6 | — |
| **S2** | Compliance Manager + `compliance_audit_log` | AC6 | Eduardo (revisión legal) |
| **S3** | Relationship Manager + scheduler (6 triggers) + Martes de Maya | AC4 | push infra |
| **S3** | Portal v2 → volver la app real (portar las 4 pantallas al SPA con datos reales) | AC7 | diseño ya aprobado |
| **S4** | Subida de PDF + extracción + comparación con survey + propuesta de update | AC5 | almacenamiento cifrado |
| **S5** | Cuentas / open finance (Belvo o Finerio) + sugerencias (reserva Matchmaker) | E4 | **proveedor open finance (credenciales)** |

Criterios: AC1 survey<2min+escenario correcto · AC2 "¿qué hago primero?" por árbol · AC3 Maya recuerda ·
AC4 Martes 7PM · AC5 PDF→discrepancia→update · AC6 sin producto regulado/retornos (Compliance) · AC7 E2E
sin bugs en móvil.

---

## 7. OPEN QUESTIONS (decisiones para Manny)

- **OQ-1 — 4 vs 7 pilares.** El score v1 usa 4 pilares (metodología CFP validada); el portal v2 muestra 7
  (Ahorro, Deuda, Inversión, Seguros, Impuestos, Pensión, Legado). ¿Los 7 son una VISTA de planeación
  patrimonial encima del score, o se redefine el score? **Recomendación:** score de 4 pilares como motor;
  7 pilares como tablero de planeación (no recalculan el score). Confirmar.
- **OQ-2 — Backend: Supabase vs. Postgres del CRM.** La app real v1 corre en Supabase propio (auth+RLS+
  edge functions); la spec pide MCP + PostgreSQL de RinglyPro. ¿Migramos a Postgres CRM (multi-tenant
  `tenant_id`, un solo motor, más control) o mantenemos Supabase y conectamos MCP contra Supabase?
  **Recomendación:** mantener Supabase para v1 y exponer los 3 agentes como capa MCP sobre Supabase; migrar
  solo si el negocio lo exige. Alto impacto en S1.
- **OQ-3 — Proveedor open finance (E4).** Belvo vs. Finerio vs. Bancolombia/Nequi API directa. Requiere
  contrato + credenciales (dependencia externa; único bloqueo real de S5). ¿Cuál se contrata?
- **OQ-4 — Push notifications.** ¿Capacitor push (FCM/APNs) para el Martes de Maya y check-ins, o solo
  in-app + email en v2? Afecta S3.
- **OQ-5 — Multi-moneda (E2).** Diversificación COP/USD/EUR: ¿tasas manuales del usuario o feed de TRM
  automático? Afecta el modelo de `assets.currency`.
- **OQ-6 — Marca del score.** El portal v2 muestra "97 / Planeado". Confirmar que la escala 0–100 y las 5
  etiquetas (Punto de partida … Planeado) se mantienen idénticas a v1.

---

## 8. Restricciones (de la spec — inviolables)
- No construir el Product Matchmaker; solo reservar el extension point en el diseño MCP.
- El Financial Planner NUNCA improvisa fuera del árbol A–I + pirámide CFP.
- Manejo de datos personales conforme Ley 1581/2012 + Decreto 1377/2013; PDFs cifrados en reposo y tránsito.
- Las sugerencias de producto son información de referencia de mercado, siempre con el disclaimer.
- Español (Colombia); tono de Maya fijado por el wording oficial de Planea.
