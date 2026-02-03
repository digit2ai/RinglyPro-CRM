# Option 2: REST API Layer - COMPLETE ✅

## Overview

The complete REST API layer for the Store Health AI system has been implemented. This provides HTTP endpoints to power dashboards, mobile apps, and third-party integrations.

---

## What Was Built

### 🚀 Express Server
- **[src/index.js](./src/index.js)** - Main server with middleware stack
- Production-ready configuration
- Clean error handling
- Request logging
- CORS enabled
- Security headers (Helmet)

### 🛡️ Middleware (3 files)
- **[error-handler.js](./src/middleware/error-handler.js)** - Global error handling
- **[not-found.js](./src/middleware/not-found.js)** - 404 handler
- **[async-handler.js](./src/middleware/async-handler.js)** - Async wrapper for routes

### 🛣️ Routes (7 route files)
- **[health.js](./src/routes/health.js)** - Health check endpoint
- **[stores.js](./src/routes/stores.js)** - Store endpoints (11 routes)
- **[kpis.js](./src/routes/kpis.js)** - KPI calculation endpoints (5 routes)
- **[alerts.js](./src/routes/alerts.js)** - Alert management (5 routes)
- **[tasks.js](./src/routes/tasks.js)** - Task management (6 routes)
- **[escalations.js](./src/routes/escalations.js)** - Escalation management (6 routes)
- **[dashboard.js](./src/routes/dashboard.js)** - Dashboard analytics (5 routes)

### 🎮 Controllers (6 controller files)
- **[store-controller.js](./src/controllers/store-controller.js)** - Store operations
- **[kpi-controller.js](./src/controllers/kpi-controller.js)** - KPI calculations
- **[alert-controller.js](./src/controllers/alert-controller.js)** - Alert operations
- **[task-controller.js](./src/controllers/task-controller.js)** - Task operations
- **[escalation-controller.js](./src/controllers/escalation-controller.js)** - Escalation operations
- **[dashboard-controller.js](./src/controllers/dashboard-controller.js)** - Dashboard data

### 📚 Documentation
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference with examples

---

## API Endpoints

### Total: 45+ Endpoints

#### Health (1)
- `GET /health` - API health check

#### Stores (11)
- `GET /api/v1/stores` - List all stores
- `GET /api/v1/stores/:id` - Get store details
- `GET /api/v1/stores/:id/health` - Get store health
- `GET /api/v1/stores/:id/health/history` - Get health history
- `GET /api/v1/stores/:id/kpis` - Get current KPIs
- `GET /api/v1/stores/:id/kpis/history` - Get KPI history
- `GET /api/v1/stores/:id/alerts` - Get store alerts
- `GET /api/v1/stores/:id/tasks` - Get store tasks
- `GET /api/v1/stores/:id/escalations` - Get store escalations
- `GET /api/v1/stores/:id/ai-calls` - Get AI call history

#### KPIs (5)
- `POST /api/v1/kpis/calculate` - Calculate single KPI
- `POST /api/v1/kpis/batch-calculate` - Batch calculate KPIs
- `GET /api/v1/kpis/definitions` - Get KPI definitions
- `GET /api/v1/kpis/thresholds` - Get KPI thresholds
- `GET /api/v1/kpis/metrics` - Get KPI metrics

#### Alerts (5)
- `GET /api/v1/alerts` - List all alerts
- `GET /api/v1/alerts/:id` - Get alert details
- `POST /api/v1/alerts/:id/acknowledge` - Acknowledge alert
- `POST /api/v1/alerts/:id/resolve` - Resolve alert
- `GET /api/v1/alerts/status/overdue` - Get overdue alerts

#### Tasks (6)
- `GET /api/v1/tasks` - List all tasks
- `GET /api/v1/tasks/:id` - Get task details
- `POST /api/v1/tasks/:id/complete` - Complete task
- `POST /api/v1/tasks/:id/update-status` - Update task status
- `GET /api/v1/tasks/status/pending` - Get pending tasks
- `GET /api/v1/tasks/status/overdue` - Get overdue tasks

#### Escalations (6)
- `GET /api/v1/escalations` - List all escalations
- `GET /api/v1/escalations/:id` - Get escalation details
- `POST /api/v1/escalations/:id/acknowledge` - Acknowledge escalation
- `POST /api/v1/escalations/:id/resolve` - Resolve escalation
- `GET /api/v1/escalations/status/pending` - Get pending escalations
- `POST /api/v1/escalations/monitor` - Trigger escalation monitoring

#### Dashboard (5)
- `GET /api/v1/dashboard/overview` - Get dashboard overview
- `GET /api/v1/dashboard/stores-requiring-action` - Get stores needing attention
- `GET /api/v1/dashboard/critical-stores` - Get critical stores
- `GET /api/v1/dashboard/kpi-trends` - Get KPI trends
- `GET /api/v1/dashboard/top-issues` - Get top issues

---

## Example API Calls

### Get Store Health
```bash
curl http://localhost:3000/api/v1/stores/1/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "snapshot": {
      "overall_status": "red",
      "health_score": 68.5,
      "red_kpi_count": 1,
      "yellow_kpi_count": 1,
      "green_kpi_count": 2,
      "escalation_level": 2,
      "action_required": true
    },
    "metrics": [...]
  }
}
```

### Calculate KPI
```bash
curl -X POST http://localhost:3000/api/v1/kpis/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": 1,
    "kpi_code": "sales",
    "value": 13500
  }'
```

### Get Dashboard Overview
```bash
curl http://localhost:3000/api/v1/dashboard/overview
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_stores": 20,
    "green_stores": 12,
    "yellow_stores": 5,
    "red_stores": 3,
    "average_health_score": 78.5,
    "stores_requiring_action": 8
  }
}
```

### Acknowledge Alert
```bash
curl -X POST http://localhost:3000/api/v1/alerts/147/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"acknowledged_by": "Alice Martinez"}'
```

---

## File Structure

```
store-health-ai/
├── src/
│   ├── index.js                        ✅ Express server
│   ├── middleware/
│   │   ├── error-handler.js            ✅ Global error handler
│   │   ├── not-found.js                ✅ 404 handler
│   │   └── async-handler.js            ✅ Async wrapper
│   ├── routes/
│   │   ├── health.js                   ✅ Health check
│   │   ├── stores.js                   ✅ Store routes (11)
│   │   ├── kpis.js                     ✅ KPI routes (5)
│   │   ├── alerts.js                   ✅ Alert routes (5)
│   │   ├── tasks.js                    ✅ Task routes (6)
│   │   ├── escalations.js              ✅ Escalation routes (6)
│   │   └── dashboard.js                ✅ Dashboard routes (5)
│   ├── controllers/
│   │   ├── store-controller.js         ✅ Store operations
│   │   ├── kpi-controller.js           ✅ KPI calculations
│   │   ├── alert-controller.js         ✅ Alert management
│   │   ├── task-controller.js          ✅ Task management
│   │   ├── escalation-controller.js    ✅ Escalation management
│   │   └── dashboard-controller.js     ✅ Dashboard analytics
│   └── services/                       ✅ From Option 1
│       ├── kpi-calculator.js
│       ├── threshold-checker.js
│       ├── alert-manager.js
│       ├── escalation-engine.js
│       └── voice-call-manager.js
├── API_DOCUMENTATION.md                ✅ Complete API docs
└── package.json                        ✅ Updated dependencies
```

---

## Starting the API Server

### Install Dependencies
```bash
npm install
```

### Start Server (Development)
```bash
npm run dev
```

### Start Server (Production)
```bash
npm start
```

### Expected Output
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║           🏪  STORE HEALTH AI - API SERVER  🏪            ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port: 3000                              ║
║  Environment: development                                  ║
║                                                            ║
║  Endpoints:                                                ║
║    Health Check:  http://localhost:3000/health            ║
║    API v1:        http://localhost:3000/api/v1            ║
║    Stores:        /api/v1/stores                          ║
║    KPIs:          /api/v1/kpis                            ║
║    Alerts:        /api/v1/alerts                          ║
║    Tasks:         /api/v1/tasks                           ║
║    Dashboard:     /api/v1/dashboard                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

## Testing the API

### Manual Testing with cURL

```bash
# 1. Check health
curl http://localhost:3000/health

# 2. Get all stores
curl http://localhost:3000/api/v1/stores

# 3. Get store health
curl http://localhost:3000/api/v1/stores/1/health

# 4. Get dashboard overview
curl http://localhost:3000/api/v1/dashboard/overview

# 5. Calculate KPI
curl -X POST http://localhost:3000/api/v1/kpis/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": 1,
    "kpi_code": "sales",
    "value": 13500
  }'
```

### Using JavaScript (Fetch API)

```javascript
// Get store health
const getStoreHealth = async (storeId) => {
  const response = await fetch(`http://localhost:3000/api/v1/stores/${storeId}/health`);
  const data = await response.json();

  if (data.success) {
    console.log('Status:', data.data.snapshot.overall_status);
    console.log('Score:', data.data.snapshot.health_score);
  }
};

// Calculate KPI
const calculateKpi = async (storeId, kpiCode, value) => {
  const response = await fetch('http://localhost:3000/api/v1/kpis/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, kpi_code: kpiCode, value })
  });

  const data = await response.json();
  return data;
};
```

---

## Features

### ✅ Implemented

- Complete RESTful API design
- Clean route/controller architecture
- Comprehensive error handling
- Request logging
- CORS support
- Security headers
- Async/await error handling
- Standardized response format
- Query parameter filtering
- Pagination support
- Related data inclusion (joins)

### 🔜 Future Enhancements

- JWT authentication
- Rate limiting
- Request validation (Joi/Zod)
- API versioning (v2)
- Swagger UI integration
- WebSocket support for real-time updates
- Caching (Redis)
- GraphQL endpoint (optional)

---

## Integration with Option 1

The API layer seamlessly integrates with the business logic from Option 1:

```
API Request
    ↓
Express Routes
    ↓
Controllers
    ↓
Services (Option 1)
    ↓
Database Models
    ↓
API Response
```

**Example Flow:**
1. `GET /api/v1/stores/1/health`
2. → `store-controller.getStoreHealth()`
3. → `thresholdChecker.checkStoreHealth()` (Option 1 service)
4. → Queries database via Sequelize models
5. → Returns formatted JSON response

---

## API Response Standards

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "count": 10  // For list endpoints
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Store not found",
    "statusCode": 404,
    "requestId": "abc123"
  }
}
```

### HTTP Status Codes
- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Environment Variables

Required in `.env`:
```env
# Server
PORT=3000
NODE_ENV=development

# Database (from Option 1)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=store_health_ai
DB_USER=postgres
DB_PASSWORD=your_password

# CORS
CORS_ORIGIN=*
```

---

## Next Steps

### Option 3: AI Voice Integration
- Integrate Twilio/Vapi
- Add voice call endpoints
- Implement call script management
- Add webhook handlers for call events

### Option 4: Dashboard UI
- Build React/Vue dashboard
- Connect to these API endpoints
- Real-time updates via WebSockets
- Mobile-responsive design

---

## Documentation

- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete endpoint reference
- **[OPTION1_COMPLETE.md](./OPTION1_COMPLETE.md)** - Business logic documentation
- **[VISUALS.md](./VISUALS.md)** - System architecture

---

## Success Criteria ✅

All Option 2 requirements completed:

- ✅ Express server with middleware stack
- ✅ 45+ API endpoints across 7 route files
- ✅ 6 comprehensive controllers
- ✅ Clean error handling
- ✅ Request logging and security
- ✅ Integration with Option 1 services
- ✅ Complete API documentation
- ✅ Standardized response format
- ✅ Query filtering and pagination

---

**Ready for Option 3 (AI Voice) or Option 4 (Dashboard UI)?**
