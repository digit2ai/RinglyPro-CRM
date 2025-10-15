# RinglyPro MCP Server - System Architecture Documentation

**Version:** 2.0.0
**Last Updated:** October 15, 2025
**Document Type:** Technical Architecture Specification

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture Layers](#architecture-layers)
4. [Component Details](#component-details)
5. [Data Flow](#data-flow)
6. [Authentication & Security](#authentication--security)
7. [API Integration](#api-integration)
8. [Natural Language Processing](#natural-language-processing)
9. [Database Schema](#database-schema)
10. [Deployment Architecture](#deployment-architecture)
11. [Performance & Scalability](#performance--scalability)
12. [Error Handling & Monitoring](#error-handling--monitoring)

---

## Executive Summary

### What is RinglyPro?

**RinglyPro is a Multi-Tenant AI-Powered CRM Integration Platform** that bridges natural language interactions with CRM systems through the Model Context Protocol (MCP).

### Key Capabilities

- **Natural Language CRM Operations**: Users interact with CRM using conversational language
- **Multi-CRM Support**: Pluggable architecture supports GoHighLevel, HubSpot, Salesforce, and more
- **Voice AI Integration**: Telephony-based CRM operations via Twilio + Voice AI
- **MCP Protocol**: Standardized tool exposure for AI model interactions
- **Multi-Tenant**: Isolated credential management per client
- **Advanced Features**: Appointments, workflows, campaigns, social media, review automation

### Architecture Philosophy

```
Natural Language → Intent Recognition → MCP Tools → CRM Proxy → External CRM
```

**Separation of Concerns:**
- **User Interface Layer**: Chat, Voice, Dashboard
- **NLP Processing Layer**: Intent parsing and entity extraction
- **MCP Server Layer**: Tool routing and execution
- **Proxy Layer**: CRM-specific API implementations
- **External Systems**: GoHighLevel, HubSpot, Twilio, etc.

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Web Chat UI │  │ Voice/IVR AI │  │  Dashboard   │  │  Mobile App  │   │
│  │ (MCP Copilot)│  │   (Twilio)   │  │  (Admin UI)  │  │     (iOS)    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │                  │
          │ HTTP POST        │ WebSocket        │ HTTP GET/POST    │ REST API
          │                  │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────────▼──────────┐
│                       EXPRESS.JS APPLICATION LAYER                          │
│                            (src/app.js, src/server.js)                      │
│                                                                              │
│  ├─ Session Management (express-session)                                    │
│  ├─ Authentication Middleware (JWT tokens)                                  │
│  ├─ Request Validation (express-validator)                                  │
│  ├─ Rate Limiting (express-rate-limit)                                      │
│  └─ CORS, Helmet Security Headers                                           │
└─────────┬────────────────────────────────────────────────────────────────────┘
          │
          │ Route to appropriate handler
          │
┌─────────▼────────────────────────────────────────────────────────────────────┐
│                          ROUTING LAYER (src/routes/)                         │
│                                                                               │
│  /api/mcp/chat       → NLP Processing + MCP Tool Execution                  │
│  /api/mcp/copilot/*  → MCP Copilot API endpoints                            │
│  /api/auth/*         → User authentication (login, register, password reset)│
│  /api/contacts/*     → Direct CRM contact operations                        │
│  /api/appointments/* → Appointment booking & management                     │
│  /webhook/twilio/*   → Voice & SMS webhooks from Twilio                     │
│  /api/admin/*        → Admin dashboard operations                           │
│  /api/mobile/*       → Mobile app API endpoints                             │
└─────────┬────────────────────────────────────────────────────────────────────┘
          │
          ├─────────────────────┬─────────────────────┬──────────────────────┐
          │                     │                     │                      │
┌─────────▼────────────┐ ┌──────▼──────────────┐ ┌──▼───────────────────┐  │
│   NLP PROCESSOR      │ │  DATABASE LAYER     │ │  EXTERNAL SERVICES   │  │
│  (src/routes/mcp.js) │ │  (src/models/)      │ │    INTEGRATION       │  │
│                      │ │                     │ │                      │  │
│  - Intent matching   │ │  Sequelize ORM      │ │  - Twilio API        │  │
│  - Entity extraction │ │  PostgreSQL         │ │  - SendGrid Email    │  │
│  - Date/time parsing │ │                     │ │  - Stripe Payments   │  │
│  - Command routing   │ │  Models:            │ │  - AWS S3 Storage    │  │
│                      │ │  • User             │ │                      │  │
│  60+ NLP patterns    │ │  • Client           │ └──────────────────────┘  │
│                      │ │  • Appointment      │                           │
└─────────┬────────────┘ │  • Message          │                           │
          │              │  • Call             │                           │
          │              │  • Contact          │                           │
          │              │  • CreditAccount    │                           │
          │              └─────────────────────┘                           │
          │                                                                 │
          │ Execute CRM operation                                          │
          │                                                                 │
┌─────────▼─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER / SESSION MANAGER                           │
│               (mcp-integrations/api/claude-integration.js)                │
│                                                                            │
│  Session-Based Proxy Management:                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ sessions = {                                                    │      │
│  │   'session_abc123': {                                           │      │
│  │     sessionId: 'abc123',                                        │      │
│  │     crmType: 'gohighlevel',                                     │      │
│  │     locationId: 'loc_xyz',                                      │      │
│  │     apiKey: 'pit-xxxxx',                                        │      │
│  │     proxy: <GoHighLevelProxy instance>,                         │      │
│  │     lastActivity: Date                                          │      │
│  │   }                                                             │      │
│  │ }                                                               │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                            │
│  Features:                                                                │
│  • Per-session CRM proxy instances                                        │
│  • Credential isolation between users                                     │
│  • Automatic session cleanup (30 min timeout)                             │
│  • Health checks & credential validation                                  │
└─────────┬──────────────────────────────────────────────────────────────────┘
          │
          │ Route to appropriate CRM proxy
          │
          ├───────────────────┬──────────────────────┬─────────────────────┐
          │                   │                      │                     │
┌─────────▼─────────┐  ┌──────▼──────────────┐  ┌──▼──────────────────┐  │
│  GoHighLevel      │  │    HubSpot          │  │   Salesforce        │  │
│     Proxy         │  │     Proxy           │  │     Proxy           │  │
│                   │  │                     │  │                     │  │
│ gohighlevel-      │  │  hubspot-           │  │  (Future)           │  │
│ proxy.js          │  │  proxy.js           │  │  salesforce-        │  │
│                   │  │                     │  │  proxy.js           │  │
│ 40+ API methods:  │  │ API methods:        │  │                     │  │
│ • Contacts        │  │ • Contacts          │  │                     │  │
│ • Opportunities   │  │ • Deals             │  │                     │  │
│ • Appointments    │  │ • Tasks             │  │                     │  │
│ • Tasks           │  │ • Notes             │  │                     │  │
│ • Workflows       │  │ • Emails            │  │                     │  │
│ • Campaigns       │  │                     │  │                     │  │
│ • Pipelines       │  │                     │  │                     │  │
│ • Social Media    │  │                     │  │                     │  │
│ • Conversations   │  │                     │  │                     │  │
│ • SMS/Email       │  │                     │  │                     │  │
└─────────┬─────────┘  └──────┬──────────────┘  └──────────────────────┘  │
          │                   │                                            │
          │ REST API calls    │ REST API calls                             │
          │                   │                                            │
┌─────────▼─────────┐  ┌──────▼──────────────┐                            │
│   GoHighLevel     │  │     HubSpot         │                            │
│    REST API v2    │  │    REST API v3      │                            │
│                   │  │                     │                            │
│ https://services. │  │ https://api.hubapi. │                            │
│ leadconnector     │  │ com/                │                            │
│ .io/              │  │                     │                            │
└───────────────────┘  └─────────────────────┘                            │
                                                                            │
```

---

## Architecture Layers

### Layer 1: User Interface Layer

**Components:**
- **Web Chat UI** - MCP Copilot chat interface ([public/mcp-copilot/](../public/mcp-copilot/))
- **Voice AI** - Twilio-based telephony integration
- **Admin Dashboard** - Multi-tenant admin portal
- **Mobile App** - iOS/Android native app (API consumer)

**Technologies:**
- Frontend: HTML5, CSS3, JavaScript (Vanilla)
- Voice: Twilio Voice API, WebSockets
- Mobile: REST API JSON responses

**Endpoints:**
```
GET  /                           → Dashboard homepage
GET  /mcp-copilot               → MCP Copilot chat interface
POST /api/mcp/chat              → Chat message processing
POST /api/mcp/copilot/chat      → Alternative chat endpoint
GET  /api/mcp/health            → Health check endpoint
```

---

### Layer 2: NLP Processing Layer

**Primary File:** [src/routes/mcp.js](../src/routes/mcp.js)

**Responsibilities:**
1. **Intent Recognition** - Match user input to CRM operations
2. **Entity Extraction** - Extract emails, names, dates, IDs from messages
3. **Date/Time Parsing** - Convert natural language dates to Date objects
4. **Command Routing** - Route to appropriate proxy methods
5. **Response Formatting** - Format results for user-friendly display

**Supported Intents (60+ patterns):**

| Category | Intent Examples |
|----------|----------------|
| **Contact Management** | "search contacts", "create contact", "update contact", "add tags" |
| **Opportunities** | "create opportunity", "update opportunity", "move to stage" |
| **Appointments** | "book appointment tomorrow at 2pm", "list appointments" |
| **Tasks/Reminders** | "create reminder due Friday", "remind me to follow up" |
| **Workflows** | "add to workflow", "remove from workflow", "show workflows" |
| **Campaigns** | "add to campaign", "list campaigns" |
| **Pipelines** | "show pipelines", "list pipelines with stages" |
| **Social Media** | "schedule social post for tomorrow: content", "list social posts" |
| **Reviews** | "send review request to john@test.com" |
| **Messaging** | "send SMS", "send email" |
| **Conversations** | "show conversations", "get messages" |
| **Dashboard** | "view dashboard", "show stats" |

**Natural Language Date Parsing:**

Utility: [src/utils/date-parser.js](../src/utils/date-parser.js)

```javascript
// Supports:
"tomorrow at 2pm"           → Date (tomorrow, 14:00)
"next Friday at 3:30pm"     → Date (next Friday, 15:30)
"in 3 days"                 → Date (3 days from now)
"today"                     → Date (today, current time)
"Monday"                    → Date (next Monday)
"30 minutes"                → Duration (30)
"1 hour"                    → Duration (60)
```

**Entity Extraction Patterns:**

```javascript
// Email extraction
const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);

// Name extraction
const nameMatch = message.match(/(?:for|with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);

// Date/time extraction
const dateTimeMatch = message.match(/(tomorrow|today|monday|...|at \d+:\d+ ?[ap]m)/i);

// ID extraction
const opportunityId = message.match(/opportunity\s+([a-zA-Z0-9_-]+)/i)?.[1];
const workflowId = message.match(/workflow\s+([a-zA-Z0-9_-]+)/i)?.[1];
```

---

### Layer 3: MCP Server / Session Manager

**Primary File:** [mcp-integrations/api/claude-integration.js](../mcp-integrations/api/claude-integration.js)

**Purpose:** Manage CRM proxy instances per user session with credential isolation.

**Session Structure:**

```javascript
const sessions = new Map();

// Example session object
{
  sessionId: 'abc123xyz',
  crmType: 'gohighlevel',          // or 'hubspot', 'salesforce'
  locationId: 'loc_xyz789',
  apiKey: 'pit-xxxxxxxxxxxxx',     // PIT token for GHL
  proxy: <GoHighLevelMCPProxy>,    // Instantiated proxy object
  lastActivity: Date('2025-10-15T12:00:00Z'),
  userEmail: 'user@example.com'
}
```

**Session Lifecycle:**

```javascript
// 1. Initialize Session
POST /api/mcp/copilot/sessions/initialize
{
  "crmType": "gohighlevel",
  "apiKey": "pit-xxxxxx",
  "locationId": "loc_12345"
}
→ Returns: { sessionId: "abc123" }

// 2. Use Session for Operations
POST /api/mcp/chat
{
  "sessionId": "abc123",
  "message": "search contacts john"
}
→ Uses cached proxy instance

// 3. Automatic Cleanup
// Sessions expire after 30 minutes of inactivity
// Expired sessions are removed from memory
```

**Security Features:**
- ✅ Per-session credential isolation
- ✅ No credential leakage between users
- ✅ Automatic session expiration
- ✅ Token validation on initialization
- ✅ Rate limiting per session

---

### Layer 4: CRM Proxy Layer

**Purpose:** Abstract CRM-specific API implementations into standardized methods.

#### GoHighLevel Proxy

**File:** [mcp-integrations/api/gohighlevel-proxy.js](../mcp-integrations/api/gohighlevel-proxy.js)

**Authentication:** Private Integration Token (PIT) or JWT

**API Methods (40+):**

```javascript
class GoHighLevelMCPProxy {
  constructor(apiKey, locationId, mcpEndpoint) {
    this.apiKey = apiKey;              // PIT or JWT token
    this.locationId = locationId;       // GHL location ID
    this.mcpEndpoint = mcpEndpoint;     // MCP endpoint URL
  }

  // ===== CONTACTS =====
  async searchContacts(query, limit = 20)
  async createContact(contactData)
  async updateContact(contactId, updates)
  async getContactById(contactId)
  async addTagsToContact(contactId, tags)
  async removeTagsFromContact(contactId, tags)
  async deleteContact(contactId)

  // ===== OPPORTUNITIES =====
  async getOpportunities(filters = {})
  async createOpportunity(opportunityData)
  async updateOpportunity(opportunityId, updates)
  async getPipelines()
  async deleteOpportunity(opportunityId)

  // ===== APPOINTMENTS/CALENDAR =====
  async getCalendars()
  async createAppointment(appointmentData)
  async updateAppointment(appointmentId, updates)
  async deleteAppointment(appointmentId)
  async getAppointments(filters = {})

  // ===== TASKS =====
  async createTask(contactId, taskData)
  async updateTask(contactId, taskId, updates)
  async getTasks(contactId)
  async deleteTask(contactId, taskId)

  // ===== WORKFLOWS =====
  async getWorkflows()
  async addToWorkflow(contactId, workflowId, eventStartTime)
  async removeFromWorkflow(contactId, workflowId)

  // ===== CAMPAIGNS =====
  async getCampaigns()
  async addToCampaign(contactId, campaignId)
  async removeFromCampaign(contactId, campaignId)

  // ===== MESSAGING =====
  async sendSMS(contactId, message)
  async sendEmail(contactId, subject, message)
  async getConversations(filters = {})
  async getMessages(conversationId, limit = 20)
  async sendMessage(conversationId, type, message)

  // ===== SOCIAL MEDIA =====
  async createSocialPost(postData)
  async getSocialPost(postId)
  async listSocialPosts(filters = {})
  async updateSocialPost(postId, updates)
  async deleteSocialPost(postId)
  async getSocialAccounts(platform = 'facebook')

  // ===== NOTES =====
  async createNote(contactId, body)
  async getNotes(contactId)
  async updateNote(contactId, noteId, body)
  async deleteNote(contactId, noteId)

  // ===== LOCATION/SETTINGS =====
  async getLocation()
  async getCustomFields()

  // ===== PAYMENTS =====
  async getOrder(orderId)
  async listTransactions(filters = {})

  // ===== WEBHOOKS =====
  async triggerInboundWebhook(webhookUrl, payload)

  // ===== INTERNAL HELPERS =====
  async callMCP(toolName, params)
  async callAPI(endpoint, method, data)
}
```

**API Endpoint Pattern:**

```javascript
// REST API v2 base URL
const BASE_URL = 'https://services.leadconnectorhq.com';

// Example: Search contacts
GET /contacts?locationId=loc_123&query=john
Headers: {
  'Authorization': 'Bearer pit-xxxxx',
  'Version': '2021-07-28',
  'Content-Type': 'application/json'
}

// Example: Create contact
POST /contacts
Headers: { 'Authorization': 'Bearer pit-xxxxx', ... }
Body: {
  "locationId": "loc_123",
  "email": "john@test.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+15555555555"
}
```

**Error Handling:**

```javascript
try {
  const result = await this.callAPI('/contacts', 'POST', contactData);
  return result;
} catch (error) {
  console.error('❌ GHL API Error:', error.response?.data || error.message);
  throw new Error(`GoHighLevel API error: ${error.message}`);
}
```

#### HubSpot Proxy

**File:** [mcp-integrations/api/hubspot-proxy.js](../mcp-integrations/api/hubspot-proxy.js)

**Authentication:** Private App Access Token

**API Methods:**

```javascript
class HubSpotMCPProxy {
  async searchContacts(query, limit)
  async createContact(contactData)
  async sendSMS(contactId, message)
  // ... (subset of GHL methods)
}
```

---

### Layer 5: External Services Integration

#### Twilio Voice & SMS

**Webhooks:**
- `POST /webhook/twilio/voice` - Incoming calls
- `POST /webhook/twilio/sms` - Incoming SMS messages

**Integration:**
```javascript
// Voice AI greeting
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const response = new VoiceResponse();
response.say({ voice: 'Polly.Joanna' }, 'Hello! How can I assist you?');
```

#### SendGrid Email

**Purpose:** Transactional emails (password reset, notifications)

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: user.email,
  from: 'noreply@ringlypro.com',
  subject: 'Password Reset',
  html: resetEmailTemplate
});
```

#### Stripe Payments

**Purpose:** Credit purchases, subscription billing

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: 'price_xxxxx', quantity: 1 }],
  mode: 'payment'
});
```

---

## Data Flow

### Example: "Create Contact" Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                            │
│    User types: "create contact john@test.com John Doe"                   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ POST /api/mcp/chat
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. EXPRESS ROUTING LAYER                                                 │
│    src/routes/mcp.js → POST handler                                      │
│    - Validate sessionId                                                  │
│    - Extract message from body                                           │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ Route to NLP processor
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. NLP PROCESSING                                                        │
│    const lowerMessage = message.toLowerCase();                           │
│    if (lowerMessage.includes('create contact')) {                        │
│      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/);        │
│      const nameMatch = message.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);      │
│      // Extracted: email="john@test.com", name="John Doe"               │
│    }                                                                     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ Get session proxy
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. SESSION MANAGER                                                       │
│    const session = sessions.get(sessionId);                              │
│    const proxy = session.proxy; // GoHighLevelMCPProxy instance          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ Execute CRM operation
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. CRM PROXY LAYER                                                       │
│    const result = await proxy.createContact({                            │
│      email: "john@test.com",                                             │
│      firstName: "John",                                                  │
│      lastName: "Doe",                                                    │
│      phone: null                                                         │
│    });                                                                   │
│    → Calls proxy.callAPI('/contacts', 'POST', ...)                       │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ HTTP POST request
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. EXTERNAL CRM API (GoHighLevel)                                        │
│    POST https://services.leadconnectorhq.com/contacts                    │
│    Headers: { Authorization: Bearer pit-xxxxx }                          │
│    Body: { locationId, email, firstName, lastName }                      │
│                                                                           │
│    Response: { contact: { id: "abc123", ... } }                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ Return result
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. RESPONSE FORMATTING                                                   │
│    response = `✅ Contact created: John Doe (john@test.com)              │
│                 📋 Contact ID: abc123`;                                  │
│    data = result.contact;                                                │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ HTTP Response
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 8. USER INTERFACE                                                        │
│    Display in chat:                                                      │
│    ✅ Contact created: John Doe (john@test.com)                          │
│    📋 Contact ID: abc123                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication & Security

### Multi-Tenant Authentication

**User Authentication:** JWT-based

```javascript
// Registration
POST /api/auth/register
Body: { email, password, firstName, lastName }
→ Creates User record in PostgreSQL
→ Returns JWT token

// Login
POST /api/auth/login
Body: { email, password }
→ Validates credentials via bcrypt
→ Returns JWT token: jwt.sign({ userId, email }, SECRET, { expiresIn: '7d' })

// Protected Routes
Middleware: authenticateToken(req, res, next)
→ Verifies JWT token from Authorization header
→ Attaches req.user = decoded token payload
```

### CRM Credential Storage

**Database:** PostgreSQL via Sequelize ORM

**Model:** [src/models/Client.js](../src/models/Client.js)

```javascript
Client {
  id: UUID (primary key)
  userId: UUID (foreign key → User)
  clientName: STRING

  // GoHighLevel credentials
  ghlLocationId: STRING
  ghlApiKey: STRING (encrypted in production)

  // HubSpot credentials
  hubspotAccessToken: STRING

  // Twilio credentials
  twilioAccountSid: STRING
  twilioAuthToken: STRING
  twilioPhoneNumber: STRING

  // Settings
  voiceAIEnabled: BOOLEAN
  language: STRING (en, es)
  timezone: STRING

  createdAt: DATE
  updatedAt: DATE
}
```

**Security Measures:**
- ✅ API keys encrypted at rest (AES-256 in production)
- ✅ JWT tokens expire after 7 days
- ✅ bcrypt password hashing (10 rounds)
- ✅ CORS enabled for trusted origins only
- ✅ Helmet.js security headers
- ✅ Rate limiting: 100 requests/15 minutes per IP
- ✅ SQL injection protection via Sequelize ORM
- ✅ XSS protection via input sanitization

---

## API Integration

### GoHighLevel API v2

**Documentation:** https://highlevel.stoplight.io/

**Authentication Methods:**

1. **Private Integration Token (PIT)** - Recommended
   ```
   Format: pit-xxxxxxxxxxxxxxxxxxxxx
   Header: Authorization: Bearer pit-xxxxx
   ```

2. **JWT Token** - OAuth-based (not recommended for MCP)
   ```
   Format: eyJhbGciOiJIUzI1NiIs...
   Header: Authorization: Bearer eyJhbGc...
   ```

**API Endpoints Used:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/contacts/` | GET | Search contacts |
| `/contacts/` | POST | Create contact |
| `/contacts/{id}` | PUT | Update contact |
| `/contacts/{id}` | DELETE | Delete contact |
| `/opportunities/` | GET | List opportunities |
| `/opportunities/` | POST | Create opportunity |
| `/opportunities/{id}` | PUT | Update opportunity |
| `/opportunities/pipelines` | GET | List pipelines & stages |
| `/calendars/` | GET | List calendars |
| `/calendars/events/appointments` | POST | Create appointment |
| `/contacts/{id}/tasks` | POST | Create task |
| `/contacts/{id}/tasks/{taskId}` | PUT | Update task |
| `/contacts/{id}/workflow/{wfId}` | POST | Add to workflow |
| `/contacts/{id}/workflow/{wfId}` | DELETE | Remove from workflow |
| `/contacts/{id}/campaigns/{campId}` | POST | Add to campaign |
| `/conversations/search` | POST | Search conversations |
| `/conversations/messages` | POST | Send message |
| `/social-media-posting/{locId}/posts` | POST | Create social post |
| `/social-media-posting/{locId}/posts/list` | POST | List social posts |

**Rate Limits:**
- 120 requests per minute per location
- Burst: 200 requests per minute

**Common Response Format:**

```json
{
  "contacts": [
    {
      "id": "contact_abc123",
      "locationId": "loc_xyz789",
      "email": "john@test.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+15555555555",
      "tags": ["lead", "interested"],
      "dateAdded": "2025-10-15T12:00:00.000Z"
    }
  ],
  "count": 1,
  "total": 1
}
```

### HubSpot API v3

**Authentication:** Private App Access Token

**Endpoints:**
- `GET /crm/v3/objects/contacts` - List contacts
- `POST /crm/v3/objects/contacts` - Create contact
- `PATCH /crm/v3/objects/contacts/{id}` - Update contact

---

## Natural Language Processing

### Intent Classification

**Algorithm:** Pattern Matching (Regex-based)

**Why not ML?**
- Low latency required (<100ms)
- Deterministic behavior preferred
- Easy to debug and extend
- Sufficient for CRM domain

**Pattern Structure:**

```javascript
// Primary pattern: keyword matching
if (lowerMessage.includes('create contact')) { ... }

// Secondary pattern: entity extraction
const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);

// Tertiary pattern: context awareness
if (lowerMessage.includes('book') && (lowerMessage.includes('appointment') || lowerMessage.includes('schedule'))) {
  // Handle appointment booking
}
```

### Entity Extraction

**Supported Entity Types:**

| Entity Type | Extraction Pattern | Example |
|-------------|-------------------|---------|
| Email | `/([\w.-]+@[\w.-]+\.\w+)/i` | john@test.com |
| Phone | `/(\+?1?\d{10,15})/` | +15555555555 |
| Name | `/([A-Z][a-z]+ [A-Z][a-z]+)/` | John Doe |
| Date | `/(tomorrow|today|friday|next week)/i` | tomorrow |
| Time | `/(\d{1,2}:\d{2} ?[ap]m|\d{1,2} ?[ap]m)/i` | 2pm, 3:30pm |
| Duration | `/(\d+) ?(minutes?|hours?)/i` | 30 minutes |
| ID | `/([a-zA-Z0-9_-]{10,})/` | opp_abc123 |
| Tags | `/tags? (.+)/i` | #lead, #vip |

### Date/Time Parsing

**Implementation:** [src/utils/date-parser.js](../src/utils/date-parser.js)

**Supported Formats:**

```javascript
// Relative dates
"today"        → new Date() (today, current time)
"tomorrow"     → new Date() + 1 day
"yesterday"    → new Date() - 1 day
"in 3 days"    → new Date() + 3 days
"in 2 weeks"   → new Date() + 14 days

// Day names
"monday"       → Next Monday
"friday"       → Next Friday
"next friday"  → Friday of next week

// Time parsing
"at 2pm"       → 14:00
"at 3:30pm"    → 15:30
"at 14:00"     → 14:00 (24-hour)

// Combined
"tomorrow at 2pm"  → Tomorrow, 14:00
"friday at 3:30pm" → Next Friday, 15:30
"next monday at 10am" → Monday of next week, 10:00
```

**Function Signature:**

```javascript
function parseNaturalDate(text) {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Handle relative dates
  if (lowerText.includes('tomorrow')) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    // ... extract time if present
    return date;
  }

  // Handle day names
  if (lowerText.includes('monday')) {
    const date = new Date(now);
    const targetDay = 1; // Monday = 1
    const currentDay = date.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilTarget);
    return date;
  }

  return now;
}
```

---

## Database Schema

### PostgreSQL Database

**ORM:** Sequelize v6.35.0

**Connection Configuration:**

```javascript
// src/config/database.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});
```

### Core Models

#### User Model

**File:** [src/models/User.js](../src/models/User.js)

```javascript
User {
  id: UUID (primary key)
  email: STRING (unique, required)
  password: STRING (hashed, required)
  firstName: STRING
  lastName: STRING
  role: ENUM('user', 'admin')
  isEmailVerified: BOOLEAN
  emailVerificationToken: STRING
  passwordResetToken: STRING
  passwordResetExpires: DATE
  lastLogin: DATE
  createdAt: DATE
  updatedAt: DATE
}

// Associations
User.hasMany(Client, { foreignKey: 'userId' })
User.hasMany(CreditAccount, { foreignKey: 'userId' })
```

#### Client Model

**File:** [src/models/Client.js](../src/models/Client.js)

```javascript
Client {
  id: UUID (primary key)
  userId: UUID (foreign key → User)
  clientName: STRING (required)

  // CRM Integration
  crmType: ENUM('gohighlevel', 'hubspot', 'salesforce')
  ghlLocationId: STRING
  ghlApiKey: STRING
  hubspotAccessToken: STRING

  // Twilio Integration
  twilioAccountSid: STRING
  twilioAuthToken: STRING
  twilioPhoneNumber: STRING

  // Voice AI Settings
  voiceAIEnabled: BOOLEAN (default: true)
  voiceAILanguage: ENUM('en', 'es')
  voiceAIName: STRING (e.g., 'Rachel', 'Lina')

  // Business Settings
  businessName: STRING
  timezone: STRING (default: 'America/New_York')
  workingHours: JSON

  createdAt: DATE
  updatedAt: DATE
}

// Associations
Client.belongsTo(User, { foreignKey: 'userId' })
Client.hasMany(Appointment, { foreignKey: 'clientId' })
Client.hasMany(Call, { foreignKey: 'clientId' })
Client.hasMany(Message, { foreignKey: 'clientId' })
```

#### Appointment Model

**File:** [src/models/Appointment.js](../src/models/Appointment.js)

```javascript
Appointment {
  id: UUID (primary key)
  clientId: UUID (foreign key → Client)

  // Contact Info
  customerName: STRING (required)
  customerPhone: STRING (required)
  customerEmail: STRING

  // Appointment Details
  appointmentDate: DATE (required)
  duration: INTEGER (minutes, default: 30)
  status: ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')
  notes: TEXT

  // Integration
  crmContactId: STRING (GHL/HubSpot contact ID)
  crmAppointmentId: STRING (GHL appointment ID)

  // Metadata
  source: ENUM('voice', 'web', 'mobile', 'api')
  createdBy: ENUM('customer', 'admin', 'ai')

  createdAt: DATE
  updatedAt: DATE
}

// Associations
Appointment.belongsTo(Client, { foreignKey: 'clientId' })
```

#### Call Model

**File:** [src/models/Call.js](../src/models/Call.js)

```javascript
Call {
  id: UUID (primary key)
  clientId: UUID (foreign key → Client)

  // Twilio Data
  callSid: STRING (unique)
  from: STRING (phone number)
  to: STRING (phone number)
  status: ENUM('initiated', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer')
  direction: ENUM('inbound', 'outbound')
  duration: INTEGER (seconds)

  // Call Recording
  recordingUrl: STRING
  transcription: TEXT

  // AI Analysis
  sentiment: ENUM('positive', 'neutral', 'negative')
  intentDetected: STRING
  keywords: ARRAY(STRING)

  createdAt: DATE
  updatedAt: DATE
}
```

#### Message Model

**File:** [src/models/Message.js](../src/models/Message.js)

```javascript
Message {
  id: UUID (primary key)
  clientId: UUID (foreign key → Client)

  // Twilio Data
  messageSid: STRING (unique)
  from: STRING (phone number)
  to: STRING (phone number)
  body: TEXT
  direction: ENUM('inbound', 'outbound')
  status: ENUM('queued', 'sent', 'delivered', 'failed')

  // Media
  mediaUrl: ARRAY(STRING)

  // Integration
  crmContactId: STRING
  crmConversationId: STRING

  createdAt: DATE
  updatedAt: DATE
}
```

#### CreditAccount Model

**File:** [src/models/CreditAccount.js](../src/models/CreditAccount.js)

```javascript
CreditAccount {
  id: UUID (primary key)
  userId: UUID (foreign key → User)

  balance: DECIMAL(10, 2) (default: 0.00)
  currency: STRING (default: 'USD')

  // Transaction Log
  transactions: JSON ARRAY [
    { type: 'purchase', amount: 100.00, date: '2025-10-15', stripeId: 'ch_xxx' },
    { type: 'usage', amount: -5.00, date: '2025-10-15', description: 'Voice call' }
  ]

  createdAt: DATE
  updatedAt: DATE
}
```

### Database Migrations

**Migration Files:** [migrations/](../migrations/)

**Key Migrations:**
1. `20250101-create-users.js` - User authentication tables
2. `20250102-create-clients.js` - Multi-tenant client configuration
3. `20250103-create-appointments.js` - Appointment scheduling
4. `20250104-create-calls.js` - Call history logging
5. `20250105-create-messages.js` - SMS history
6. `20250106-add-crm-integration.js` - CRM credential columns

**Running Migrations:**

```bash
# Run all pending migrations
npm run migrate

# Undo last migration
npm run migrate:undo

# Check migration status
npm run migrate:status
```

---

## Deployment Architecture

### Production Environment

**Platform:** Render.com (Web Service)

**Configuration:**

```yaml
# render.yaml
services:
  - type: web
    name: ringlypro-crm
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: ringlypro-postgres
          property: connectionString
      - key: PORT
        value: 10000
    healthCheckPath: /health

databases:
  - name: ringlypro-postgres
    plan: starter
    databaseName: ringlypro_crm
    user: ringlypro_user
```

**Scaling Configuration:**
- **Web Instances:** 1-5 (auto-scaling based on CPU)
- **Database:** PostgreSQL 15, 256MB RAM (starter plan)
- **Memory:** 512MB per instance
- **CPU:** 0.5 CPU per instance

**Environment Variables (Production):**

```bash
# Server
NODE_ENV=production
PORT=10000
WEBHOOK_BASE_URL=https://ringlypro-crm.onrender.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Authentication
JWT_SECRET=xxxxxxxxxxxxx
SESSION_SECRET=xxxxxxxxxxxxx

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+15555555555

# SendGrid
SENDGRID_API_KEY=SG.xxxxx

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# GoHighLevel (default/admin)
GHL_LOCATION_ID=loc_xxxxx
GHL_API_KEY=pit-xxxxx

# HubSpot (optional)
HUBSPOT_ACCESS_TOKEN=pat-xxxxx
```

### Development Environment

**Local Setup:**

```bash
# 1. Clone repository
git clone https://github.com/digit2ai/RinglyPro-CRM.git
cd RinglyPro-CRM

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Setup database
npm run setup-db
npm run migrate

# 5. Start development server
npm run dev
# Server runs on http://localhost:3000
```

**Docker Support (Optional):**

```dockerfile
# Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/ringlypro
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ringlypro
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Performance & Scalability

### Caching Strategy

**Session Cache:**
```javascript
// In-memory session cache (30-minute TTL)
const sessions = new Map();

// Automatic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      sessions.delete(sessionId);
      console.log(`🧹 Cleaned up expired session: ${sessionId}`);
    }
  }
}, 5 * 60 * 1000);
```

**Database Connection Pooling:**
```javascript
pool: {
  max: 10,        // Maximum connections
  min: 0,         // Minimum connections
  acquire: 30000, // Max time to acquire connection (ms)
  idle: 10000     // Max idle time before release (ms)
}
```

### Rate Limiting

**Express Rate Limit:**
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // 100 requests per window
  message: 'Too many requests, please try again later.'
});

app.use('/api/', apiLimiter);
```

### Performance Metrics

**Target Metrics:**
- API Response Time: <200ms (p95)
- NLP Processing: <100ms
- Database Queries: <50ms
- External CRM API: <500ms (dependent on external service)
- Uptime: 99.9%

**Monitoring:**
- Application logs via Winston
- Error tracking via console.error
- Health check endpoint: `/health`

---

## Error Handling & Monitoring

### Error Handling Strategy

**Layered Error Handling:**

```javascript
// 1. Route-level try/catch
router.post('/chat', async (req, res) => {
  try {
    const result = await processMessage(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Proxy-level error handling
async createContact(data) {
  try {
    const result = await this.callAPI('/contacts', 'POST', data);
    return result;
  } catch (error) {
    throw new Error(`GHL API error: ${error.message}`);
  }
}

// 3. Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

### Logging System

**Winston Logger Configuration:**

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

**Log Levels:**
- **error**: Critical errors requiring immediate attention
- **warn**: Warning conditions
- **info**: Informational messages (default)
- **debug**: Debug-level messages

### Health Check Endpoint

```javascript
// GET /health
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  };

  // Check database connection
  try {
    await sequelize.authenticate();
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## Appendix: File Structure

```
RinglyPro-CRM/
├── src/
│   ├── app.js                      # Express app configuration
│   ├── server.js                   # Server startup & graceful shutdown
│   ├── config/
│   │   └── database.js             # Sequelize configuration
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication middleware
│   ├── models/
│   │   ├── index.js                # Sequelize model loader
│   │   ├── User.js                 # User authentication model
│   │   ├── Client.js               # Multi-tenant client configuration
│   │   ├── Appointment.js          # Appointment scheduling model
│   │   ├── Call.js                 # Call history model
│   │   ├── Message.js              # SMS message history
│   │   └── CreditAccount.js        # Credit balance & transactions
│   ├── routes/
│   │   ├── mcp.js                  # ⭐ Main NLP processing & MCP chat
│   │   ├── gohighlevel-mcp.js      # GoHighLevel MCP endpoints
│   │   ├── auth.js                 # User authentication routes
│   │   ├── contacts.js             # Direct contact management
│   │   ├── appointments.js         # Appointment booking UI
│   │   ├── messages.js             # SMS messaging routes
│   │   ├── calls.js                # Call history routes
│   │   ├── voiceBot.js             # Voice AI webhook handler
│   │   ├── admin.js                # Admin dashboard routes
│   │   └── mobile.js               # Mobile app API endpoints
│   ├── services/
│   └── utils/
│       └── date-parser.js          # ⭐ Natural language date parsing
├── mcp-integrations/
│   ├── api/
│   │   ├── claude-integration.js   # ⭐ MCP session manager
│   │   ├── gohighlevel-proxy.js    # ⭐ GoHighLevel API proxy (40+ methods)
│   │   └── hubspot-proxy.js        # HubSpot API proxy
│   ├── config/
│   ├── workflows/
│   └── voice/
├── public/
│   ├── mcp-copilot/                # ⭐ MCP Copilot chat UI
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── script.js
│   ├── js/
│   └── audio/
├── views/                          # EJS templates
├── docs/
│   ├── MCP-SERVER-ARCHITECTURE.md  # ⭐ This document
│   ├── ARCHITECTURE-VISION.md      # Original architecture vision
│   ├── GHL-API-V2-CAPABILITIES.md  # GHL API reference
│   └── TESTING-WORKFLOW.md         # Testing procedures
├── migrations/                     # Sequelize database migrations
├── scripts/                        # Utility scripts
├── package.json
├── .env.example
└── README.md
```

---

## Glossary

| Term | Definition |
|------|------------|
| **MCP** | Model Context Protocol - Anthropic's standard for AI tool integration |
| **GHL** | GoHighLevel - CRM platform |
| **PIT** | Private Integration Token - GoHighLevel API authentication method |
| **JWT** | JSON Web Token - Authentication token format |
| **NLP** | Natural Language Processing |
| **CRM** | Customer Relationship Management |
| **IVR** | Interactive Voice Response |
| **ORM** | Object-Relational Mapping (Sequelize) |
| **UUID** | Universally Unique Identifier |
| **WebSocket** | Full-duplex communication protocol |
| **REST** | Representational State Transfer (API architecture) |

---

## Contact & Support

**Project Repository:** https://github.com/digit2ai/RinglyPro-CRM
**Production URL:** https://ringlypro-crm.onrender.com
**Documentation:** [docs/](../docs/)

**For Issues:**
- Create GitHub issue with label `bug`, `feature`, or `question`
- Include error logs, screenshots, and reproduction steps

---

**Document Version:** 1.0
**Last Updated:** October 15, 2025
**Author:** RinglyPro Development Team
