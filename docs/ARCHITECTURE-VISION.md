# 🎯 RinglyPro MCP Architecture & Vision

## Executive Summary

**RinglyPro is a Universal AI-to-CRM Bridge** that enables natural language interactions with any CRM system through a standardized MCP (Model Context Protocol) interface.

**Vision:** Become the plug-and-play AI brain that connects Claude (or any AI) to legacy CRM systems without code.

---

## 🏗️ Architecture Overview

### Current Architecture (Correct ✅)

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interface Layer                         │
│  - Natural Language Input (Chat UI)                             │
│  - Voice Input (IVR/Receptionist)                               │
│  - Web Dashboard                                                │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTP/WebSocket
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│                    NLP Processing Layer                          │
│                  (src/routes/mcp.js)                            │
│  - Intent Recognition                                           │
│  - Entity Extraction                                            │
│  - Command Parsing                                              │
│  - Typo Correction                                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Tool Calls
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│              RinglyPro MCP Server (The Brain)                    │
│           (mcp-integrations/claude-integration.js)              │
│                                                                  │
│  MCP Tools Exposed:                                             │
│  - search_crm_contacts                                          │
│  - create_crm_contact                                           │
│  - update_crm_contact (TODO)                                    │
│  - create_task (TODO)                                           │
│  - send_sms                                                     │
│  - send_email (TODO)                                            │
│  - create_opportunity (TODO)                                    │
│  - [50+ more operations to add]                                 │
│                                                                  │
│  Features:                                                       │
│  - Multi-tenant credential management                           │
│  - CRM routing logic                                            │
│  - Protocol translation                                         │
│  - Error handling & retries                                     │
└────┬───────────────────┬────────────────────┬────────────────────┘
     │                   │                    │
     │ Client A Creds    │ Client B Creds     │ Client C Creds
     │                   │                    │
┌────▼─────────────┐ ┌───▼──────────────┐ ┌──▼─────────────────┐
│  CRM Proxy Layer │ │  CRM Proxy Layer │ │  CRM Proxy Layer   │
│   (GoHighLevel)  │ │    (HubSpot)     │ │   (Salesforce)     │
│                  │ │                  │ │                    │
│ gohighlevel-     │ │  hubspot-        │ │  salesforce-       │
│ proxy.js         │ │  proxy.js        │ │  proxy.js (TODO)   │
│                  │ │                  │ │                    │
│ - REST API calls │ │ - REST API calls │ │ - REST API calls   │
│ - Auth handling  │ │ - Auth handling  │ │ - Auth handling    │
│ - Response parse │ │ - Response parse │ │ - Response parse   │
└────┬─────────────┘ └───┬──────────────┘ └──┬─────────────────┘
     │                   │                    │
     │                   │                    │
┌────▼─────────────┐ ┌───▼──────────────┐ ┌──▼─────────────────┐
│   GoHighLevel    │ │     HubSpot      │ │    Salesforce      │
│    REST API      │ │    REST API      │ │     REST API       │
└──────────────────┘ └──────────────────┘ └────────────────────┘
```

---

## 🎯 Core Principles

### 1. **Separation of Concerns**
- **NLP Layer**: Understands user intent
- **MCP Server**: Routes and executes operations
- **Proxy Layer**: Handles CRM-specific implementations
- **REST APIs**: External CRM systems

### 2. **Multi-Tenant by Design**
```javascript
// Each client stores their own credentials
Client A → GHL API Key (PIT) → Client A's GHL account
Client B → GHL API Key (JWT) → Client B's GHL account
Client C → HubSpot Token → Client C's HubSpot account
```

### 3. **Plug & Play CRM Support**
Adding a new CRM requires:
1. Create proxy class (e.g., `salesforce-proxy.js`)
2. Implement standard methods (searchContacts, createContact, etc.)
3. Add to MCP server tool routing
4. Update UI settings form

**No changes to NLP layer or core logic required!**

### 4. **Protocol Flexibility**
- **Input**: Natural language, voice, API calls
- **Internal**: MCP protocol (Model Context Protocol)
- **Output**: REST API calls to various CRMs

---

## 🔌 MCP Protocol (Model Context Protocol)

### What is MCP?
MCP is Anthropic's standard for connecting AI models to external tools and data sources.

**Key Components:**
- **Server**: Exposes tools via MCP protocol
- **Tools**: Discrete operations (search, create, update, etc.)
- **Schema**: JSON schema defines inputs/outputs
- **Transport**: stdio, HTTP, WebSocket

### RinglyPro MCP Server

**Location:** `mcp-integrations/claude-integration.js`

**Current Tools:**
```javascript
{
  name: 'search_crm_contacts',
  description: 'Search for contacts in HubSpot or GoHighLevel',
  inputSchema: {
    crm: 'hubspot' | 'gohighlevel',
    query: string,
    limit: number
  }
}

{
  name: 'create_crm_contact',
  description: 'Create a new contact',
  inputSchema: {
    crm: 'hubspot' | 'gohighlevel',
    email: string,
    firstname: string,
    lastname: string,
    phone: string
  }
}

{
  name: 'send_sms',
  description: 'Send SMS (GoHighLevel only)',
  inputSchema: {
    contactId: string,
    message: string
  }
}
```

---

## 📊 Current State Analysis

### ✅ What Works
1. **Natural Language Processing**
   - Command parsing
   - Intent recognition
   - Entity extraction
   - Typo correction

2. **RinglyPro MCP Server**
   - Basic tool structure
   - HubSpot integration
   - GoHighLevel integration (partial)
   - Multi-tenant credential handling

3. **CRM Proxies**
   - GoHighLevel proxy (REST API)
   - HubSpot proxy (REST API)
   - Authentication handling
   - Response parsing

4. **UI/UX**
   - Settings form for API keys
   - Chat interface
   - Sequential testing workflow
   - Command suggestions

### ⚠️ What Needs Work

1. **Authentication Issues**
   - JWT tokens causing 400/401 errors with GHL
   - Need to debug REST API headers/params
   - Version header conflict

2. **Limited MCP Tools**
   - Only 3 tools exposed (search, create, SMS)
   - Need 40+ more operations
   - Missing update, delete, tags, tasks, notes, etc.

3. **Direct API Calls in NLP Layer**
   - `src/routes/mcp.js` calls proxy directly
   - Should call MCP server instead
   - Breaking separation of concerns

4. **Incomplete CRM Coverage**
   - GHL: Partial implementation
   - HubSpot: Basic implementation
   - Salesforce: Not started
   - Zoho: Not started

---

## 🚀 3-Phase Implementation Plan

### **PHASE 1: Fix JWT Authentication** (Today)

**Goal:** Make GHL REST API work with both PIT and JWT tokens

**Tasks:**
1. ✅ Remove Version header for JWT tokens
2. ✅ Add proper query params for GET requests
3. ✅ Enhanced error logging
4. 🔄 Test with real JWT token
5. 🔄 Debug 400/401 errors from Render logs
6. 🔄 Verify all operations work

**Success Criteria:**
- All 13 test workflow steps pass with JWT token
- No 400/401 errors
- Create, search, update, tags all work

**Files Modified:**
- `mcp-integrations/api/gohighlevel-proxy.js` (callAPI method)
- `views/dashboard.ejs` (validation)

---

### **PHASE 2: Expand MCP Server** (Next)

**Goal:** Add all CRM operations as MCP tools

**Tasks:**

#### 2.1 Add Contact Operations
```javascript
{
  name: 'update_crm_contact',
  name: 'delete_crm_contact',
  name: 'get_crm_contact',
  name: 'add_tag_to_contact',
  name: 'remove_tag_from_contact'
}
```

#### 2.2 Add Task Operations
```javascript
{
  name: 'create_crm_task',
  name: 'update_crm_task',
  name: 'list_crm_tasks',
  name: 'delete_crm_task'
}
```

#### 2.3 Add Note Operations
```javascript
{
  name: 'add_crm_note',
  name: 'list_crm_notes',
  name: 'update_crm_note',
  name: 'delete_crm_note'
}
```

#### 2.4 Add Opportunity Operations
```javascript
{
  name: 'create_crm_opportunity',
  name: 'update_crm_opportunity',
  name: 'list_crm_opportunities',
  name: 'get_crm_pipelines'
}
```

#### 2.5 Add Communication Operations
```javascript
{
  name: 'send_crm_email',
  name: 'send_crm_sms', // already exists
  name: 'get_crm_messages'
}
```

#### 2.6 Add Appointment Operations
```javascript
{
  name: 'create_crm_appointment',
  name: 'update_crm_appointment',
  name: 'list_crm_calendars',
  name: 'get_crm_appointments'
}
```

#### 2.7 Add Automation Operations
```javascript
{
  name: 'add_contact_to_workflow',
  name: 'remove_contact_from_workflow',
  name: 'add_contact_to_campaign',
  name: 'remove_contact_from_campaign'
}
```

**Success Criteria:**
- 40+ tools exposed via MCP
- All operations work for GHL and HubSpot
- Consistent error handling
- Full test coverage

**Files Modified:**
- `mcp-integrations/api/claude-integration.js` (add all tools)
- `mcp-integrations/api/gohighlevel-proxy.js` (ensure all methods exist)
- `mcp-integrations/api/hubspot-proxy.js` (ensure all methods exist)

---

### **PHASE 3: Connect NLP to MCP** (Then)

**Goal:** Clean separation - NLP calls MCP server, not REST API directly

**Current Problem:**
```javascript
// src/routes/mcp.js - WRONG (calling proxy directly)
const contacts = await session.proxy.searchContacts(query, 5);
```

**Correct Approach:**
```javascript
// src/routes/mcp.js - RIGHT (calling MCP server)
const result = await mcpClient.callTool('search_crm_contacts', {
  crm: session.crmType, // 'gohighlevel' or 'hubspot'
  query: query,
  limit: 5
});
```

**Tasks:**

#### 3.1 Create MCP Client
```javascript
// src/services/mcp-client.js
class MCPClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }

  async callTool(toolName, params) {
    // Call RinglyPro MCP server
    // Handle JSON-RPC 2.0 protocol
    // Return result
  }

  async listTools() {
    // Get available tools from MCP server
  }
}
```

#### 3.2 Refactor NLP Layer
- Replace all `session.proxy.*` calls with `mcpClient.callTool()`
- Remove direct proxy access
- Use MCP protocol for all CRM operations

#### 3.3 Update Session Management
```javascript
// Sessions store MCP client, not proxy
sessions.set(sessionId, {
  type: 'gohighlevel',
  mcpClient: new MCPClient(MCP_SERVER_URL),
  credentials: { apiKey, locationId },
  createdAt: new Date()
});
```

**Success Criteria:**
- Zero direct REST API calls from NLP layer
- All operations go through MCP server
- Clean architecture diagram validation
- Easy to add new CRMs

**Files Modified:**
- `src/services/mcp-client.js` (NEW)
- `src/routes/mcp.js` (refactor all handlers)
- `mcp-integrations/claude-server.js` (ensure HTTP transport)

---

## 🎯 Future CRM Support Roadmap

### Immediate (Phase 2-3)
- ✅ GoHighLevel (in progress)
- ✅ HubSpot (in progress)

### Short-term (Q1 2025)
- 🔲 Salesforce
- 🔲 Zoho CRM
- 🔲 Pipedrive

### Medium-term (Q2 2025)
- 🔲 Microsoft Dynamics
- 🔲 Copper CRM
- 🔲 Freshsales
- 🔲 Monday.com

### Long-term (Q3+ 2025)
- 🔲 Custom CRM connectors (SDK)
- 🔲 Zapier integration
- 🔲 Make.com integration
- 🔲 Any REST API (generic connector)

---

## 🔐 Authentication Strategy

### Multi-Format Support

**GoHighLevel:**
- PIT Tokens: `pit-xxxx-xxxx-xxxx...`
- JWT Tokens: `eyJhbGciOiJIUzI1NiIs...`
- OAuth 2.0 (future)

**HubSpot:**
- Private App Tokens
- OAuth 2.0

**Salesforce:**
- OAuth 2.0
- Session ID + Server URL

**Generic:**
- API Keys
- Bearer tokens
- Basic auth
- OAuth 2.0

### Security Principles
1. **Encryption at Rest** - All API keys encrypted in database
2. **Encryption in Transit** - HTTPS only
3. **No Logging** - Never log full API keys/tokens
4. **Tenant Isolation** - Strict separation of client credentials
5. **Token Refresh** - Automatic OAuth token refresh

---

## 📈 Success Metrics

### Technical KPIs
- **API Success Rate**: > 95%
- **Average Response Time**: < 2 seconds
- **MCP Tool Coverage**: 40+ tools
- **CRM Support**: 5+ CRMs by Q2 2025
- **Uptime**: 99.9%

### Business KPIs
- **Setup Time**: < 2 minutes per CRM
- **User Satisfaction**: > 4.5/5 stars
- **Support Tickets**: < 5% related to CRM connectivity
- **Adoption Rate**: > 80% of clients use AI Copilot

---

## 🚨 Current Blockers

### P0 - Critical (Blocking production)
1. **JWT Authentication Errors** (PHASE 1)
   - GHL JWT tokens return 400/401
   - Need to debug headers/params
   - Blocking all operations for JWT users

### P1 - High (Limiting functionality)
2. **Limited MCP Tools** (PHASE 2)
   - Only 3 tools exposed
   - Can't do updates, tasks, notes, etc.
   - Users can't do full CRM operations

3. **Direct API Calls** (PHASE 3)
   - NLP layer bypasses MCP server
   - Architecture not clean
   - Hard to add new CRMs

### P2 - Medium (Nice to have)
4. **Missing CRM Support**
   - Salesforce not started
   - Zoho not started
   - Limits market reach

---

## 📚 Documentation Structure

```
docs/
├── ARCHITECTURE-VISION.md (this file)
├── GHL-API-V2-CAPABILITIES.md (GHL API reference)
├── TESTING-WORKFLOW.md (13-step test workflow)
├── MCP-SERVER-GUIDE.md (TODO - How to extend MCP server)
├── ADDING-NEW-CRM.md (TODO - Guide for new CRMs)
└── API-REFERENCE.md (TODO - RinglyPro API docs)
```

---

## 🎓 For Future AI Assistants

**Context Preservation:**
This document serves as the single source of truth for RinglyPro's architecture. When starting a new conversation:

1. **Read this file first** to understand the vision
2. **Check TODO lists** to see current phase
3. **Review recent commits** for latest changes
4. **Don't suggest** using GHL Official MCP Server
5. **Remember** RinglyPro IS the MCP server

**Key Insights:**
- RinglyPro is a **multitenant SaaS platform**
- The goal is to be a **universal AI-to-CRM bridge**
- We are building **our own MCP server**, not using GHL's
- Each client uses **their own CRM credentials**
- Support for **multiple token formats** is essential

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-14
**Maintained By:** RinglyPro Development Team
**Status:** 🚧 Active Development - Phase 1 In Progress
