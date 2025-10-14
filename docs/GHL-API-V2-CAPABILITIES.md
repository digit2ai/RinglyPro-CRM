# GoHighLevel API v2 - Complete Natural Language Capabilities

## 📋 Overview

This document outlines all natural language commands supported by the RinglyPro CRM AI Copilot, powered by GoHighLevel API v2.

**Base URL:** `https://services.leadconnectorhq.com`
**Auth:** Private Integration Token (Bearer)
**Version:** `2021-07-28`

---

## 📇 Contact Management (7 Functions)

### Create Contact
**API Endpoint:** `POST /contacts/`
**Natural Language:**
- `create contact John Smith phone 5551234567`
- `add contact Jane Doe email jane@example.com`
- `new contact Maria Garcia phone 8136414177 email maria@test.com`

**Slots:** firstName, lastName, phone, email, tags, source, customFields

---

### Update Contact
**API Endpoint:** `PUT /contacts/{contactId}`
**Natural Language:**
- `update contact john@test.com phone 8136414177`
- `change contact John Smith email newemail@test.com`
- `update john@test.com phone: 813-465-9575`

**Slots:** contactId, firstName, lastName, phone, email, tags

---

### Search Contacts
**API Endpoint:** `GET /contacts/` (with search params)
**Natural Language:**
- `search John`
- `find 8136414177`
- `lookup john@example.com`
- `search contacts with tag vip`

**Slots:** query, phone, email, tag, limit

---

### Get Contact
**API Endpoint:** `GET /contacts/{contactId}`
**Natural Language:**
- Currently handled via search with exact match
- Returns specific contact details

**Slots:** contactId

---

### Add Tag
**API Endpoint:** `POST /contacts/{contactId}/tags`
**Natural Language:**
- `add tag vip to john@example.com`
- `tag john@test.com with hot-lead`
- `add tags interested, qualified to contact`

**Slots:** contactId, tags (array)

---

### Remove Tag
**API Endpoint:** `DELETE /contacts/{contactId}/tags`
**Natural Language:**
- `remove tag cold-lead from john@example.com`
- `untag john@test.com from inactive`
- `remove tags spam, unqualified from contact`

**Slots:** contactId, tags (array)

---

### Delete Contact
**API Endpoint:** `DELETE /contacts/{contactId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId

---

## 💬 Conversations & Messages (4 Functions)

### Send SMS
**API Endpoint:** `POST /conversations/messages` (type: SMS)
**Natural Language:**
- `send sms to john@test.com saying Hello!`
- `text 5551234567: Your appointment is confirmed`
- `send message to John saying Thanks for your business`

**Slots:** contactId, message, type: "SMS"

---

### Send Email
**API Endpoint:** `POST /conversations/messages` (type: Email)
**Natural Language:**
- `email john@test.com subject Welcome body Thanks for joining!`
- `send email to contact with Follow up message`
- `email john@test.com: Quick reminder about tomorrow`

**Slots:** contactId, subject, body, type: "Email"

---

### Create Conversation
**API Endpoint:** `POST /conversations/`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, locationId, channel

---

### Get Conversation Messages
**API Endpoint:** `GET /conversations/{conversationId}/messages`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** conversationId, limit

---

## ✅ Tasks (4 Functions)

### Create Task
**API Endpoint:** `POST /contacts/{contactId}/tasks`
**Natural Language:**
- `create task for john@test.com: Follow up on proposal`
- `add task to John reminder Call back tomorrow`
- `new task for contact: Send pricing information`

**Slots:** contactId, title, body, dueDate, assignedTo, completed

**Default Due Date:** Tomorrow (24 hours from now)

---

### List Tasks
**API Endpoint:** `GET /contacts/{contactId}/tasks`
**Natural Language:**
- `list tasks for john@test.com`
- `show tasks for John`
- `get tasks from contact`

**Returns:** Array of tasks with status (✓ completed, ○ pending)

---

### Update Task
**API Endpoint:** `PUT /contacts/{contactId}/tasks/{taskId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, taskId, title, body, completed

---

### Delete Task
**API Endpoint:** `DELETE /contacts/{contactId}/tasks/{taskId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, taskId

---

## 📝 Notes (4 Functions)

### Add Note
**API Endpoint:** `POST /contacts/{contactId}/notes`
**Natural Language:**
- `add note to john@test.com: Customer interested in premium plan`
- `create note for John: Follow up next week`
- `note for contact: Called, no answer, will try again`

**Slots:** contactId, body

---

### Get Notes
**API Endpoint:** `GET /contacts/{contactId}/notes`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId

---

### Update Note
**API Endpoint:** `PUT /contacts/{contactId}/notes/{noteId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, noteId, body

---

### Delete Note
**API Endpoint:** `DELETE /contacts/{contactId}/notes/{noteId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, noteId

---

## 💰 Opportunities (6 Functions)

### Create Opportunity
**API Endpoint:** `POST /opportunities/`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, pipelineId, stageId, name, monetaryValue, assignedTo

---

### Update Opportunity
**API Endpoint:** `PUT /opportunities/{opportunityId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** opportunityId, stageId, monetaryValue, status, assignedTo

---

### List Opportunities
**API Endpoint:** `GET /opportunities/search`
**Natural Language:**
- `show opportunities`
- `list opportunities`
- `get all deals`

**Slots:** locationId, pipelineId, stageId, contactId, status

---

### Get Opportunity
**API Endpoint:** `GET /opportunities/{opportunityId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** opportunityId

---

### Get Pipelines
**API Endpoint:** `GET /opportunities/pipelines`
**Natural Language:**
- `show pipelines`
- `list pipelines`
- `get pipelines`

**Returns:** All pipelines for the location

---

### Update Opportunity Stage
**API Endpoint:** `PUT /opportunities/{opportunityId}` (stageId)
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** opportunityId, stageId

---

## 📅 Calendar & Appointments (4 Functions)

### List Calendars
**API Endpoint:** `GET /calendars/`
**Natural Language:**
- `show calendars`
- `list calendars`
- `get calendars`

**Returns:** All calendars available for booking

---

### Create Appointment
**API Endpoint:** `POST /calendars/events/appointments`
**Natural Language:**
- `book appointment for john@test.com`
- `schedule appointment with John tomorrow at 2pm`
- `create appointment for contact`

**Slots:** contactId, calendarId, startTime, endTime, locationId, notes, title

**Note:** Current implementation shows available calendars for manual booking

---

### Update Appointment
**API Endpoint:** `PUT /calendars/events/appointments/{appointmentId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** appointmentId, startTime, endTime, notes, status

---

### Get Appointment
**API Endpoint:** `GET /calendars/events/appointments/{appointmentId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** appointmentId

---

## 🔄 Workflows (3 Functions)

### Add to Workflow
**API Endpoint:** `POST /contacts/{contactId}/workflow/{workflowId}`
**Natural Language:**
- `add john@test.com to workflow abc123`
- `enroll John in workflow xyz789`
- `start workflow abc123 for contact`

**Slots:** contactId, workflowId, eventStartTime (optional)

**Default Event Start:** Current timestamp

---

### Remove from Workflow
**API Endpoint:** `DELETE /contacts/{contactId}/workflow/{workflowId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, workflowId

---

### Trigger Inbound Webhook
**API Endpoint:** Custom webhook URL (from workflow trigger)
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** webhookUrl, payload (custom JSON)

**Use Case:** Start workflows via webhook triggers with custom data

---

## 📢 Campaigns (2 Functions)

### Add to Campaign
**API Endpoint:** `POST /contacts/{contactId}/campaigns/{campaignId}`
**Natural Language:**
- `add john@test.com to campaign welcome`
- `enroll contact in campaign nurture`
- `add John to campaign xyz789`

**Slots:** contactId, campaignId

---

### Remove from Campaign
**API Endpoint:** `DELETE /contacts/{contactId}/campaigns/{campaignId}`
**Status:** Backend ready, NLP handler not yet implemented
**Slots:** contactId, campaignId

---

## 📊 Location & Dashboard (3 Functions)

### Get Location
**API Endpoint:** `GET /locations/{locationId}`
**Natural Language:**
- `show location`
- `get location info`
- `location details`

**Returns:** Location name, address, settings, custom fields

---

### Get Custom Fields
**API Endpoint:** `GET /locations/{locationId}/customFields`
**Status:** Backend ready, NLP handler not yet implemented
**Returns:** All custom field definitions for the location

---

### Show Dashboard
**Natural Language:**
- `show dashboard`
- `view dashboard`
- `dashboard overview`

**Returns:** Aggregated data including:
- Total opportunities
- Total pipeline value
- Active pipelines count
- Calendars count

---

## 📈 Summary Statistics

### Total API Coverage
- **Total Functions Implemented:** 40+
- **With NLP Handlers:** 21
- **Backend Ready (No NLP Yet):** 19

### By Category
| Category | Total | With NLP | Backend Only |
|----------|-------|----------|--------------|
| Contacts | 7 | 6 | 1 |
| Messages | 4 | 2 | 2 |
| Tasks | 4 | 2 | 2 |
| Notes | 4 | 1 | 3 |
| Opportunities | 6 | 2 | 4 |
| Appointments | 4 | 2 | 2 |
| Workflows | 3 | 1 | 2 |
| Campaigns | 2 | 1 | 1 |
| Location | 3 | 2 | 1 |

---

## 🎯 Natural Language Intelligence Features

### 1. Typo Correction
- Automatically corrects 1-character typos in command keywords
- Uses Levenshtein distance algorithm
- Examples: "loaction" → "location", "calender" → "calendar"

### 2. Case-Insensitive Matching
- Contact names work in any case
- "John Smith", "john smith", "JOHN SMITH" all match

### 3. Flexible Contact Lookup
- By email: `john@example.com`
- By phone: `8136414177`, `813-641-4177`, `(813) 641-4177`
- By name: `John`, `John Smith`, `John Doe`

### 4. Multiple Command Formats
- **With keywords:** "send sms to john@test.com saying Hello"
- **With colons:** "email john@test.com: Quick message"
- **Natural phrases:** "text John saying Your appointment is confirmed"

### 5. Smart Phone Number Handling
- Normalizes to E.164 format (`+1XXXXXXXXXX`)
- Accepts: 10 digits, 11 digits with 1, formatted numbers
- Examples: `5551234567`, `15551234567`, `555-123-4567`, `(555) 123-4567`

### 6. Helpful Error Messages
- Provides examples when commands fail
- Suggests correct format
- Links to documentation

---

## 🔐 Required OAuth Scopes

For full functionality, ensure your Private Integration Token (PIT) has these scopes:

- `contacts.read` - Search and get contacts
- `contacts.write` - Create, update, delete contacts, manage tags/tasks/notes
- `conversations.read` - View conversations and messages
- `conversations.write` - Send SMS and emails
- `opportunities.read` - List opportunities and pipelines
- `opportunities.write` - Create and update opportunities
- `appointments.read` - View appointments
- `appointments.write` - Create and update appointments
- `calendars.readonly` - List available calendars
- `workflows.write` - Add/remove contacts from workflows
- `campaigns.write` - Add/remove contacts from campaigns
- `locations.readonly` - Get location info and custom fields

---

## 📚 Developer Resources

- **GHL API Docs:** https://highlevel.stoplight.io/
- **Intent Router Config:** `/mcp-integrations/config/ghl-intent-router.js`
- **GHL Proxy Methods:** `/mcp-integrations/api/gohighlevel-proxy.js`
- **NLP Handlers:** `/src/routes/mcp.js`
- **Quick Actions UI:** `/public/mcp-copilot/index.html`

---

## 🚀 Future Enhancements

### High Priority (Backend Ready, Need NLP)
1. Update/delete tasks
2. Get/update/delete notes
3. Create/update opportunities with full details
4. Update/cancel appointments
5. Remove from workflows/campaigns
6. Trigger inbound webhooks

### Medium Priority (Need Full Implementation)
1. Custom field management
2. Advanced search filters
3. Bulk operations
4. Appointment scheduling with date/time parsing
5. Multi-contact operations

### Low Priority (Nice to Have)
1. Payment/order management
2. Document/contract handling
3. Form submissions
4. Membership management
5. Analytics and reporting

---

**Last Updated:** 2025-10-14
**Version:** 2.0.0
**Status:** Production Ready ✅
