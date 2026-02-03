# Store Health AI Agent - Database Schema Design

## Overview
This schema supports a retail operations AI manager that monitors store health, predicts operational risk, and manages escalations through a Red/Yellow/Green status system.

## Design Principles
- **Time-series optimized**: KPI metrics stored for historical trend analysis
- **Multi-tenant ready**: Support multiple retail chains/organizations
- **Audit trail**: Complete history of alerts, tasks, escalations, and AI interactions
- **Configurable**: Thresholds and rules defined in database, not hard-coded
- **Scalable**: Designed for high-frequency data ingestion and real-time querying

---

## Core Entities

### 1. Organizations
Multi-tenant container for retail chains.

```sql
organizations
- id (PK)
- name
- timezone
- config (JSONB) -- org-level settings
- created_at
- updated_at
```

### 2. Stores
Individual retail locations.

```sql
stores
- id (PK)
- organization_id (FK)
- store_code (unique per org)
- name
- address
- city
- state
- zip_code
- timezone
- phone
- manager_name
- manager_phone
- manager_email
- region_id (FK to regions)
- district_id (FK to districts)
- status (active/inactive/closed)
- metadata (JSONB) -- store type, size, etc.
- created_at
- updated_at
```

### 3. Regions & Districts
Organizational hierarchy for escalation.

```sql
regions
- id (PK)
- organization_id (FK)
- name
- manager_name
- manager_email
- manager_phone
- created_at
- updated_at

districts
- id (PK)
- organization_id (FK)
- region_id (FK)
- name
- manager_name
- manager_email
- manager_phone
- created_at
- updated_at
```

---

## KPI & Metrics Layer

### 4. KPI Definitions
Defines what metrics are tracked (sales, traffic, conversion, etc.).

```sql
kpi_definitions
- id (PK)
- organization_id (FK)
- kpi_code (unique: 'sales', 'traffic', 'conversion_rate', etc.)
- name
- description
- unit (%, $, count, ratio)
- calculation_method (ENUM: sum, average, ratio, etc.)
- category (sales/labor/inventory/hr)
- is_active
- created_at
- updated_at
```

### 5. KPI Thresholds
Configurable Red/Yellow/Green thresholds per KPI.

```sql
kpi_thresholds
- id (PK)
- kpi_definition_id (FK)
- organization_id (FK)
- store_id (FK, nullable) -- null = org default, set = store override
- green_min (decimal)
- yellow_min (decimal)
- red_threshold (decimal)
- comparison_basis (ENUM: rolling_4w, same_period_ly, absolute)
- priority (1-5, for escalation)
- created_at
- updated_at
```

### 6. KPI Metrics (Time-Series)
Raw metric data ingested daily (or more frequently).

```sql
kpi_metrics
- id (PK)
- store_id (FK)
- kpi_definition_id (FK)
- metric_date (date)
- metric_timestamp (timestamp)
- value (decimal)
- comparison_value (decimal) -- baseline for comparison
- comparison_type (rolling_4w/same_period_ly)
- variance_pct (decimal) -- calculated variance
- status (ENUM: green/yellow/red)
- metadata (JSONB) -- additional context
- created_at
- updated_at
- INDEX (store_id, kpi_definition_id, metric_date)
- INDEX (metric_date)
```

---

## Store Health & Status

### 7. Store Health Snapshots
Daily overall health assessment for each store.

```sql
store_health_snapshots
- id (PK)
- store_id (FK)
- snapshot_date (date)
- overall_status (ENUM: green/yellow/red)
- health_score (0-100)
- red_kpi_count (int)
- yellow_kpi_count (int)
- green_kpi_count (int)
- escalation_level (0-4)
- risk_probability (decimal) -- predictive risk %
- summary (text) -- AI-generated summary
- action_required (boolean)
- metadata (JSONB)
- created_at
- updated_at
- UNIQUE (store_id, snapshot_date)
```

### 8. KPI Status History
Tracks when each KPI changes status (for trend detection).

```sql
kpi_status_history
- id (PK)
- store_id (FK)
- kpi_definition_id (FK)
- date (date)
- previous_status (green/yellow/red)
- current_status (green/yellow/red)
- value (decimal)
- variance_pct (decimal)
- duration_in_status (int) -- days in current status
- created_at
- INDEX (store_id, kpi_definition_id, date)
```

---

## Alerting & Task Management

### 9. Alerts
Generated alerts when thresholds are crossed.

```sql
alerts
- id (PK)
- store_id (FK)
- kpi_definition_id (FK)
- alert_date (timestamp)
- severity (ENUM: yellow/red/critical)
- escalation_level (0-4)
- status (ENUM: active/acknowledged/resolved/expired)
- title (text)
- message (text)
- requires_acknowledgment (boolean)
- acknowledged_at (timestamp)
- acknowledged_by (text) -- user/role who acknowledged
- resolved_at (timestamp)
- expires_at (timestamp) -- SLA deadline
- metadata (JSONB)
- created_at
- updated_at
- INDEX (store_id, status, alert_date)
```

### 10. Tasks
Actionable tasks assigned to store managers.

```sql
tasks
- id (PK)
- alert_id (FK, nullable)
- store_id (FK)
- kpi_definition_id (FK, nullable)
- task_type (ENUM: review/action/escalation)
- priority (1-5)
- title (text)
- description (text)
- assigned_to_role (store_manager/shift_lead/regional)
- assigned_to_name (text)
- assigned_to_contact (text) -- phone/email
- status (ENUM: pending/in_progress/completed/cancelled)
- due_date (timestamp)
- completed_at (timestamp)
- completed_by (text)
- outcome (text)
- metadata (JSONB)
- created_at
- updated_at
- INDEX (store_id, status, due_date)
```

---

## Escalation Management

### 11. Escalations
Tracks escalation events and chain.

```sql
escalations
- id (PK)
- store_id (FK)
- alert_id (FK)
- task_id (FK, nullable)
- from_level (0-4)
- to_level (0-4)
- escalation_reason (text)
- triggered_by (ENUM: threshold/sla_breach/manual/predicted_risk)
- escalated_at (timestamp)
- escalated_to_role (text)
- escalated_to_name (text)
- escalated_to_contact (text)
- status (ENUM: pending/acknowledged/resolved)
- resolution (text)
- resolved_at (timestamp)
- metadata (JSONB)
- created_at
- updated_at
- INDEX (store_id, status, escalated_at)
```

### 12. Escalation Rules
Defines when and how to escalate.

```sql
escalation_rules
- id (PK)
- organization_id (FK)
- kpi_definition_id (FK, nullable) -- null = applies to all
- trigger_condition (ENUM: status_red/status_yellow/sla_breach/predicted_risk)
- duration_hours (int) -- how long before escalating
- from_level (0-4)
- to_level (0-4)
- action (ENUM: create_task/send_alert/ai_call/regional_escalation)
- is_active (boolean)
- created_at
- updated_at
```

---

## AI Voice Call Management

### 13. AI Calls
Log of all AI voice calls made to store managers.

```sql
ai_calls
- id (PK)
- store_id (FK)
- alert_id (FK, nullable)
- task_id (FK, nullable)
- escalation_id (FK, nullable)
- call_type (ENUM: green/yellow/red)
- call_status (ENUM: scheduled/in_progress/completed/failed/no_answer)
- recipient_name (text)
- recipient_phone (text)
- call_initiated_at (timestamp)
- call_connected_at (timestamp)
- call_ended_at (timestamp)
- call_duration_seconds (int)
- transcript (text)
- sentiment (text) -- analyzed sentiment
- response (ENUM: yes/later/no_answer/other)
- follow_up_required (boolean)
- recording_url (text)
- external_call_id (text) -- Twilio/Vapi ID
- metadata (JSONB)
- created_at
- updated_at
- INDEX (store_id, call_initiated_at)
```

### 14. Call Scripts
Templates for AI voice calls.

```sql
call_scripts
- id (PK)
- organization_id (FK)
- script_type (ENUM: green/yellow/red)
- version (int)
- script_content (text)
- variables (JSONB) -- dynamic placeholders
- is_active (boolean)
- created_at
- updated_at
```

---

## Predictive Risk

### 15. Risk Predictions
AI-generated risk predictions.

```sql
risk_predictions
- id (PK)
- store_id (FK)
- prediction_date (date)
- target_date (date) -- date being predicted
- prediction_type (ENUM: sales/labor/inventory/overall)
- predicted_status (green/yellow/red)
- confidence_score (decimal) -- 0-100
- contributing_factors (JSONB) -- what signals drove prediction
- model_version (text)
- created_at
- INDEX (store_id, target_date, prediction_type)
```

---

## Labor Management (Supporting Data)

### 16. Labor Schedules
Planned labor coverage.

```sql
labor_schedules
- id (PK)
- store_id (FK)
- schedule_date (date)
- shift_start (time)
- shift_end (time)
- required_hours (decimal)
- scheduled_hours (decimal)
- available_hours (decimal)
- coverage_ratio (decimal) -- available/required
- status (green/yellow/red)
- created_at
- updated_at
- INDEX (store_id, schedule_date)
```

### 17. Labor Call-Outs
Tracks employee absences.

```sql
labor_callouts
- id (PK)
- store_id (FK)
- labor_schedule_id (FK, nullable)
- callout_date (date)
- employee_name (text)
- shift_affected (text)
- hours_lost (decimal)
- is_filled (boolean)
- filled_by (text)
- is_peak_hours (boolean)
- created_at
- updated_at
- INDEX (store_id, callout_date)
```

---

## Inventory Health (Supporting Data)

### 18. Inventory Levels
Current and historical inventory.

```sql
inventory_levels
- id (PK)
- store_id (FK)
- sku (text)
- product_name (text)
- category (text)
- snapshot_date (date)
- quantity_on_hand (int)
- average_daily_sales (decimal)
- days_of_cover (decimal)
- is_top_sku (boolean)
- is_out_of_stock (boolean)
- status (green/yellow/red)
- created_at
- updated_at
- INDEX (store_id, snapshot_date, is_top_sku)
```

### 19. Out-of-Stock Events
Tracks stockout incidents.

```sql
out_of_stock_events
- id (PK)
- store_id (FK)
- sku (text)
- product_name (text)
- out_of_stock_at (timestamp)
- restocked_at (timestamp, nullable)
- duration_hours (int)
- estimated_lost_sales (decimal)
- is_top_sku (boolean)
- created_at
- INDEX (store_id, out_of_stock_at)
```

---

## Configuration & System

### 20. System Config
Global system configuration.

```sql
system_config
- id (PK)
- organization_id (FK)
- config_key (text)
- config_value (JSONB)
- description (text)
- is_active (boolean)
- updated_by (text)
- created_at
- updated_at
- UNIQUE (organization_id, config_key)
```

---

## Key Relationships

```
organizations (1) → (N) stores
organizations (1) → (N) regions → (N) districts
organizations (1) → (N) kpi_definitions

stores (1) → (N) kpi_metrics
stores (1) → (N) store_health_snapshots
stores (1) → (N) alerts → (N) tasks
stores (1) → (N) escalations
stores (1) → (N) ai_calls

kpi_definitions (1) → (N) kpi_thresholds
kpi_definitions (1) → (N) kpi_metrics

alerts (1) → (N) tasks
alerts (1) → (1) escalations
alerts (1) → (N) ai_calls
```

---

## Indexes Strategy

**High-frequency queries:**
- `kpi_metrics`: (store_id, kpi_definition_id, metric_date)
- `store_health_snapshots`: (store_id, snapshot_date)
- `alerts`: (store_id, status, alert_date)
- `tasks`: (store_id, status, due_date)

**Time-series optimization:**
- Partition `kpi_metrics` by month
- Partition `ai_calls` by month
- Archive data older than 2 years to cold storage

---

## Data Retention

| Table | Retention | Archive Strategy |
|-------|-----------|------------------|
| kpi_metrics | 2 years hot | Archive to S3/cold storage |
| store_health_snapshots | 2 years hot | Archive to S3/cold storage |
| alerts | 1 year hot | Archive resolved alerts >1yr |
| tasks | 1 year hot | Archive completed tasks >1yr |
| ai_calls | 2 years hot | Archive recordings separately |
| escalations | 2 years | Archive resolved >2yr |

---

## Next Steps

1. **Migrations**: Create Sequelize/Knex migrations for each table
2. **Models**: Build ORM models with relationships
3. **Seed Data**: Create sample orgs, stores, KPI definitions
4. **API Layer**: Build REST/GraphQL endpoints for data access
5. **Calculation Engine**: Build KPI calculation and threshold checking
6. **Alerting Engine**: Build rule-based alerting system
7. **AI Integration**: Connect to voice call provider (Twilio/Vapi)
