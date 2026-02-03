# Store Health AI - API Documentation

## Base URL
```
http://localhost:3000/api/v1
```

## Response Format

All API responses follow this standard format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "count": 10  // Optional, for list endpoints
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "requestId": "abc123"
  }
}
```

---

## Authentication

🔜 **Coming in future version**

Currently, all endpoints are open. In production, add JWT authentication.

---

## Endpoints

### Health Check

#### GET /health
Check API and database health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-02T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "environment": "development"
}
```

---

## Store Endpoints

### GET /api/v1/stores
Get all stores with optional filters.

**Query Parameters:**
- `status` - Filter by status (active/inactive/closed)
- `region_id` - Filter by region
- `district_id` - Filter by district
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:**
```bash
GET /api/v1/stores?status=active&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "store_code": "DT-001",
      "name": "Dollar Tree - Manhattan 42nd St",
      "city": "New York",
      "state": "NY",
      "status": "active",
      "manager_name": "Alice Martinez"
    }
  ],
  "count": 1
}
```

---

### GET /api/v1/stores/:id
Get store details by ID.

**Example:**
```bash
GET /api/v1/stores/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "store_code": "DT-001",
    "name": "Dollar Tree - Manhattan 42nd St",
    "address": "123 West 42nd Street",
    "city": "New York",
    "state": "NY",
    "zip_code": "10036",
    "manager_name": "Alice Martinez",
    "manager_phone": "+1-555-0202",
    "region": { ... },
    "district": { ... }
  }
}
```

---

### GET /api/v1/stores/:id/health
Get current health status for a store.

**Query Parameters:**
- `date` - Optional date (YYYY-MM-DD, defaults to today)

**Example:**
```bash
GET /api/v1/stores/1/health?date=2026-02-02
```

**Response:**
```json
{
  "success": true,
  "data": {
    "snapshot": {
      "id": 123,
      "store_id": 1,
      "snapshot_date": "2026-02-02",
      "overall_status": "red",
      "health_score": 68.5,
      "red_kpi_count": 1,
      "yellow_kpi_count": 1,
      "green_kpi_count": 2,
      "escalation_level": 2,
      "action_required": true,
      "summary": "Store requires immediate attention..."
    },
    "metrics": [
      {
        "kpi_code": "sales",
        "kpi_name": "Sales Performance",
        "value": 13500,
        "variance_pct": 12.5,
        "status": "green",
        "category": "sales"
      }
    ]
  }
}
```

---

### GET /api/v1/stores/:id/health/history
Get health history for a store.

**Query Parameters:**
- `days` - Number of days of history (default: 30)

**Example:**
```bash
GET /api/v1/stores/1/health/history?days=7
```

---

### GET /api/v1/stores/:id/kpis
Get current KPIs for a store.

**Query Parameters:**
- `date` - Optional date (YYYY-MM-DD, defaults to today)

**Example:**
```bash
GET /api/v1/stores/1/kpis
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "store_id": 1,
      "metric_date": "2026-02-02",
      "value": 13500,
      "comparison_value": 12000,
      "variance_pct": 12.5,
      "status": "green",
      "kpiDefinition": {
        "id": 1,
        "kpi_code": "sales",
        "name": "Sales Performance",
        "unit": "$",
        "category": "sales"
      }
    }
  ],
  "count": 4
}
```

---

### GET /api/v1/stores/:id/kpis/history
Get KPI history for a specific KPI.

**Query Parameters:**
- `kpi_code` - Required, KPI code (e.g., "sales", "traffic")
- `days` - Number of days of history (default: 30)

**Example:**
```bash
GET /api/v1/stores/1/kpis/history?kpi_code=sales&days=7
```

---

### GET /api/v1/stores/:id/alerts
Get alerts for a store.

**Query Parameters:**
- `status` - Filter by status (active/acknowledged/resolved)
- `severity` - Filter by severity (yellow/red/critical)
- `limit` - Number of results (default: 50)

**Example:**
```bash
GET /api/v1/stores/1/alerts?status=active
```

---

### GET /api/v1/stores/:id/tasks
Get tasks for a store.

**Query Parameters:**
- `status` - Filter by status (pending/in_progress/completed)
- `limit` - Number of results (default: 50)

---

### GET /api/v1/stores/:id/escalations
Get escalations for a store.

---

### GET /api/v1/stores/:id/ai-calls
Get AI call history for a store.

---

## KPI Endpoints

### POST /api/v1/kpis/calculate
Calculate and store a single KPI value.

**Request Body:**
```json
{
  "store_id": 1,
  "kpi_code": "sales",
  "metric_date": "2026-02-02",
  "value": 13500,
  "metadata": {
    "day_of_week": "Monday"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1001,
    "kpi_code": "sales",
    "kpi_name": "Sales Performance",
    "value": 13500,
    "variance_pct": 12.5,
    "status": "green",
    "threshold": {
      "green_min": -2,
      "yellow_min": -6,
      "red_threshold": -6
    }
  }
}
```

---

### POST /api/v1/kpis/batch-calculate
Calculate multiple KPIs at once.

**Request Body:**
```json
{
  "store_id": 1,
  "metric_date": "2026-02-02",
  "kpis": {
    "sales": 13500,
    "traffic": 450,
    "conversion_rate": 35.5,
    "labor_coverage": 97
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "kpi_code": "sales",
      "status": "green",
      "variance_pct": 12.5
    },
    {
      "kpi_code": "traffic",
      "status": "green",
      "variance_pct": 4.2
    }
  ],
  "count": 4
}
```

---

### GET /api/v1/kpis/definitions
Get all KPI definitions.

**Query Parameters:**
- `organization_id` - Filter by organization
- `category` - Filter by category (sales/traffic/labor/inventory/hr)
- `is_active` - Filter by active status (default: true)

---

### GET /api/v1/kpis/thresholds
Get KPI thresholds.

**Query Parameters:**
- `organization_id` - Filter by organization
- `store_id` - Filter by store (store-specific overrides)
- `kpi_definition_id` - Filter by KPI

---

### GET /api/v1/kpis/metrics
Get KPI metrics with filters.

**Query Parameters:**
- `store_id` - Filter by store
- `kpi_definition_id` - Filter by KPI
- `metric_date` - Filter by date (YYYY-MM-DD)
- `status` - Filter by status (green/yellow/red)
- `limit` - Number of results (default: 100)
- `offset` - Pagination offset (default: 0)

---

## Alert Endpoints

### GET /api/v1/alerts
Get all alerts with filters.

**Query Parameters:**
- `store_id` - Filter by store
- `status` - Filter by status (active/acknowledged/resolved/expired)
- `severity` - Filter by severity (yellow/red/critical)
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:**
```bash
GET /api/v1/alerts?status=active&severity=red
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 147,
      "store_id": 1,
      "severity": "red",
      "escalation_level": 2,
      "status": "active",
      "title": "🔴 Labor Coverage Ratio 10.0% below target",
      "message": "...",
      "requires_acknowledgment": true,
      "alert_date": "2026-02-02T10:00:00.000Z",
      "expires_at": "2026-02-03T10:00:00.000Z",
      "store": { ... },
      "kpiDefinition": { ... }
    }
  ],
  "count": 1
}
```

---

### GET /api/v1/alerts/:id
Get alert by ID.

---

### POST /api/v1/alerts/:id/acknowledge
Acknowledge an alert.

**Request Body:**
```json
{
  "acknowledged_by": "Alice Martinez"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Alert acknowledged successfully"
}
```

---

### POST /api/v1/alerts/:id/resolve
Resolve an alert.

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Alert resolved successfully"
}
```

---

### GET /api/v1/alerts/status/overdue
Get all overdue alerts (past SLA deadline).

---

## Task Endpoints

### GET /api/v1/tasks
Get all tasks with filters.

**Query Parameters:**
- `store_id` - Filter by store
- `status` - Filter by status (pending/in_progress/completed/cancelled)
- `priority` - Filter by priority (1-5)
- `assigned_to_role` - Filter by role (store_manager/shift_lead/etc.)
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

---

### GET /api/v1/tasks/:id
Get task by ID.

---

### POST /api/v1/tasks/:id/complete
Mark task as complete.

**Request Body:**
```json
{
  "completed_by": "Alice Martinez",
  "outcome": "Filled staffing gaps with backup employees"
}
```

---

### POST /api/v1/tasks/:id/update-status
Update task status.

**Request Body:**
```json
{
  "status": "in_progress"
}
```

---

### GET /api/v1/tasks/status/pending
Get all pending and in-progress tasks.

---

### GET /api/v1/tasks/status/overdue
Get all overdue tasks (past due date).

---

## Escalation Endpoints

### GET /api/v1/escalations
Get all escalations with filters.

**Query Parameters:**
- `store_id` - Filter by store
- `status` - Filter by status (pending/acknowledged/resolved)
- `to_level` - Filter by escalation level (0-4)
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

---

### GET /api/v1/escalations/:id
Get escalation by ID.

---

### POST /api/v1/escalations/:id/acknowledge
Acknowledge an escalation.

**Request Body:**
```json
{
  "acknowledged_by": "Michael Chen"
}
```

---

### POST /api/v1/escalations/:id/resolve
Resolve an escalation.

**Request Body:**
```json
{
  "resolution": "Issue resolved. Labor coverage restored to 97%."
}
```

---

### GET /api/v1/escalations/status/pending
Get all pending escalations.

---

### POST /api/v1/escalations/monitor
Manually trigger escalation monitoring (normally runs on schedule).

**Response:**
```json
{
  "success": true,
  "data": [ ... ],
  "count": 3,
  "message": "Escalation monitoring complete. 3 new escalations created."
}
```

---

## Dashboard Endpoints

### GET /api/v1/dashboard/overview
Get comprehensive dashboard overview.

**Query Parameters:**
- `date` - Optional date (YYYY-MM-DD, defaults to today)

**Response:**
```json
{
  "success": true,
  "data": {
    "total_stores": 20,
    "green_stores": 12,
    "yellow_stores": 5,
    "red_stores": 3,
    "stores_requiring_action": 8,
    "average_health_score": 78.5,
    "critical_stores": [
      {
        "store_id": 1,
        "store_code": "DT-001",
        "store_name": "Dollar Tree - Manhattan 42nd St",
        "overall_status": "red",
        "health_score": 68.5,
        "escalation_level": 2
      }
    ]
  }
}
```

---

### GET /api/v1/dashboard/stores-requiring-action
Get stores that need immediate attention (action_required = true).

---

### GET /api/v1/dashboard/critical-stores
Get critical stores (escalation level >= 2).

**Query Parameters:**
- `date` - Optional date (YYYY-MM-DD)
- `limit` - Number of results (default: 20)

---

### GET /api/v1/dashboard/kpi-trends
Get KPI trends over time.

**Query Parameters:**
- `days` - Number of days (default: 7)
- `kpi_code` - Optional, filter by specific KPI

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "kpi_definition_id": 1,
      "metric_date": "2026-02-01",
      "avg_value": 13200,
      "avg_variance": -3.2,
      "store_count": 20,
      "kpiDefinition": {
        "kpi_code": "sales",
        "name": "Sales Performance"
      }
    }
  ]
}
```

---

### GET /api/v1/dashboard/top-issues
Get top issues affecting multiple stores.

**Query Parameters:**
- `date` - Optional date (YYYY-MM-DD)
- `limit` - Number of results (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "kpi_definition_id": 4,
      "affected_stores": 8,
      "avg_variance": -7.5,
      "kpiDefinition": {
        "kpi_code": "labor_coverage",
        "name": "Labor Coverage Ratio",
        "category": "labor"
      }
    }
  ]
}
```

---

## Voice Call Endpoints (AI Integration)

### POST /api/v1/voice/twiml/:callId
Generate TwiML for a call (Twilio webhook).

**Note:** This endpoint is called automatically by Twilio when a call is answered. It generates the TwiML (Twilio Markup Language) that instructs Twilio on what to say and how to gather input.

**Response (XML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello Alice Martinez, this is an urgent message from Store Health AI regarding Dollar Tree - Manhattan 42nd St...</Say>
  <Gather input="speech" action="/api/v1/voice/response/123" timeout="5">
    <Say>Do you acknowledge this alert?</Say>
  </Gather>
  <Say>Thank you. Goodbye.</Say>
</Response>
```

---

### POST /api/v1/voice/status/:callId
Handle call status updates (Twilio webhook).

**Note:** This endpoint receives status updates from Twilio throughout the call lifecycle.

**Request Body (from Twilio):**
```json
{
  "CallSid": "CA1234567890abcdef",
  "CallStatus": "completed",
  "CallDuration": "45",
  "From": "+15551234567",
  "To": "+15559876543"
}
```

**Response:**
```
200 OK
```

---

### POST /api/v1/voice/response/:callId
Handle call response (Twilio webhook for speech input).

**Note:** This endpoint receives the manager's spoken response to the AI call.

**Request Body (from Twilio):**
```json
{
  "SpeechResult": "yes I acknowledge",
  "Confidence": 0.95
}
```

**Response (XML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for acknowledging. A follow-up task has been created. Goodbye.</Say>
  <Hangup/>
</Response>
```

---

### POST /api/v1/voice/recording/:callId
Handle recording callback (Twilio webhook).

**Note:** This endpoint receives recording data from Twilio after a call is completed and recorded.

**Response:**
```
200 OK
```

---

### GET /api/v1/voice/calls
Get all AI calls with filters.

**Query Parameters:**
- `store_id` - Filter by store
- `status` - Filter by call status (completed/failed/no-answer/busy)
- `call_type` - Filter by call type (escalation_alert/test/etc.)
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

**Example:**
```bash
GET /api/v1/voice/calls?store_id=1&status=completed
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "store_id": 1,
      "alert_id": 147,
      "escalation_id": 23,
      "call_type": "escalation_alert",
      "call_provider": "twilio",
      "call_status": "completed",
      "to_phone": "+1-555-0202",
      "scheduled_at": "2026-02-02T14:00:00.000Z",
      "initiated_at": "2026-02-02T14:00:05.000Z",
      "answered_at": "2026-02-02T14:00:12.000Z",
      "completed_at": "2026-02-02T14:01:30.000Z",
      "call_duration": 78,
      "outcome": "acknowledged",
      "provider_call_id": "CA1234567890abcdef",
      "store": {
        "id": 1,
        "store_code": "DT-001",
        "name": "Dollar Tree - Manhattan 42nd St",
        "manager_name": "Alice Martinez"
      },
      "alert": {
        "id": 147,
        "severity": "red",
        "title": "🔴 Labor Coverage Ratio 10.0% below target"
      }
    }
  ],
  "count": 1
}
```

---

### GET /api/v1/voice/calls/:id
Get call details by ID.

**Example:**
```bash
GET /api/v1/voice/calls/42
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "store_id": 1,
    "alert_id": 147,
    "escalation_id": 23,
    "call_type": "escalation_alert",
    "call_provider": "twilio",
    "call_status": "completed",
    "to_phone": "+1-555-0202",
    "scheduled_at": "2026-02-02T14:00:00.000Z",
    "answered_at": "2026-02-02T14:00:12.000Z",
    "completed_at": "2026-02-02T14:01:30.000Z",
    "call_duration": 78,
    "outcome": "acknowledged",
    "metadata": {
      "severity": "red",
      "kpi_code": "labor_coverage",
      "transcript": "yes I acknowledge the issue",
      "recording_url": "https://..."
    },
    "store": { ... },
    "alert": { ... },
    "escalation": { ... }
  }
}
```

---

### POST /api/v1/voice/test
Test call endpoint.

**Request Body:**
```json
{
  "phone_number": "+1-555-0123",
  "message": "This is a test call from Store Health AI"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": "twilio",
    "call_id": "CA1234567890abcdef",
    "status": "initiated"
  },
  "message": "Test call initiated successfully"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Database connection failed |

---

## Rate Limiting

🔜 **Coming in future version**

Will implement rate limiting: 100 requests/minute per IP.

---

## Example Usage

### JavaScript (Fetch API)
```javascript
// Get store health
const response = await fetch('http://localhost:3000/api/v1/stores/1/health');
const data = await response.json();

if (data.success) {
  console.log('Store Status:', data.data.snapshot.overall_status);
  console.log('Health Score:', data.data.snapshot.health_score);
}
```

### cURL
```bash
# Get dashboard overview
curl http://localhost:3000/api/v1/dashboard/overview

# Calculate KPI
curl -X POST http://localhost:3000/api/v1/kpis/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": 1,
    "kpi_code": "sales",
    "value": 13500
  }'

# Acknowledge alert
curl -X POST http://localhost:3000/api/v1/alerts/147/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"acknowledged_by": "Alice Martinez"}'
```

---

## Postman Collection

🔜 **Coming soon**

Will provide Postman collection with all endpoints pre-configured.

---

## Next Steps

1. ✅ **Option 1**: Business Logic Layer (Complete)
2. ✅ **Option 2**: REST API Layer (Complete)
3. ✅ **Option 3**: AI Voice Integration (Complete - Twilio & Vapi)
4. ⏭️ **Option 4**: Dashboard UI (React/Vue)

---

For more information, see:
- [OPTION1_COMPLETE.md](./OPTION1_COMPLETE.md) - Business logic documentation
- [VISUALS.md](./VISUALS.md) - System architecture and UI mockups
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing instructions
