# GoHighLevel MCP Integration Guide

## Overview
This integration allows your AI assistant and backend applications to interact directly with your GoHighLevel CRM through authenticated API calls.

## Configuration

### 1. Environment Variables
Add these to your `.env` file:

```bash
# GoHighLevel Configuration
GHL_PRIVATE_API_KEY=pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe
GHL_LOCATION_ID=your_location_id_here
```

### 2. API Endpoint
All GoHighLevel routes are mounted at: `https://your-domain.com/api/ghl/`

### 3. Authentication Headers
All requests must include EITHER:
- **Environment Variables** (automatically used if set)
- **Request Headers:**
  ```
  x-ghl-api-key: pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe
  x-ghl-location-id: YOUR_LOCATION_ID
  ```
- **Request Body:**
  ```json
  {
    "apiKey": "pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe",
    "locationId": "YOUR_LOCATION_ID"
  }
  ```

## API Reference

### Health Check

#### GET `/api/ghl/health`
Check if the GoHighLevel integration is running.

**Response:**
```json
{
  "success": true,
  "service": "GoHighLevel MCP Integration",
  "version": "1.0.0",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Contacts Management

### Create Contact

#### POST `/api/ghl/contacts/create`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+18135559123",
  "tags": ["new-lead", "interested"],
  "customFields": {
    "industry": "Real Estate",
    "budget": "50000"
  },
  "source": "Website Form"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contact": {
      "id": "contact_abc123",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+18135559123"
    }
  }
}
```

### Get Contact

#### GET `/api/ghl/contacts/:contactId`

**Response:**
```json
{
  "success": true,
  "data": {
    "contact": {
      "id": "contact_abc123",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+18135559123",
      "tags": ["new-lead"],
      "customField": {}
    }
  }
}
```

### Update Contact

#### PUT `/api/ghl/contacts/:contactId`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+18135559124"
}
```

### Search Contacts

#### POST `/api/ghl/contacts/search`

**Request Body:**
```json
{
  "query": "John",
  "email": "john@example.com",
  "phone": "+18135559123",
  "limit": 20
}
```

### Manage Tags

#### POST `/api/ghl/contacts/:contactId/tags`
Add tags to a contact.

**Request Body:**
```json
{
  "tags": ["hot-lead", "follow-up"]
}
```

#### DELETE `/api/ghl/contacts/:contactId/tags`
Remove tags from a contact.

---

## Conversations & Messaging

### Send SMS

#### POST `/api/ghl/conversations/messages/sms`

**Request Body:**
```json
{
  "contactId": "contact_abc123",
  "message": "Hi John! Thanks for reaching out. We'll get back to you shortly."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_xyz789",
    "status": "sent"
  }
}
```

### Send Email

#### POST `/api/ghl/conversations/messages/email`

**Request Body:**
```json
{
  "contactId": "contact_abc123",
  "subject": "Welcome to Our Service!",
  "body": "Hi John,\n\nThank you for signing up!",
  "html": "<h1>Welcome!</h1><p>Thank you for signing up!</p>",
  "emailFrom": "hello@yourdomain.com"
}
```

### Get Conversation Messages

#### GET `/api/ghl/conversations/:contactId/messages?limit=20&lastMessageId=msg_123`

### Get All Conversations

#### GET `/api/ghl/conversations?limit=20`

---

## Notes Management

### Create Note

#### POST `/api/ghl/contacts/:contactId/notes`

**Request Body:**
```json
{
  "body": "Called customer. Very interested in our premium package.",
  "userId": "user_123"
}
```

### Get Notes

#### GET `/api/ghl/contacts/:contactId/notes`

### Update Note

#### PUT `/api/ghl/notes/:noteId`

**Request Body:**
```json
{
  "body": "Updated note content"
}
```

### Delete Note

#### DELETE `/api/ghl/notes/:noteId`

---

## Tasks Management

### Create Task

#### POST `/api/ghl/contacts/:contactId/tasks`

**Request Body:**
```json
{
  "title": "Follow up call",
  "body": "Call to discuss pricing and timeline",
  "dueDate": "2025-01-20T10:00:00Z",
  "assignedTo": "user_123",
  "status": "pending"
}
```

### Get Tasks

#### GET `/api/ghl/contacts/:contactId/tasks`

### Update Task

#### PUT `/api/ghl/tasks/:taskId`

**Request Body:**
```json
{
  "status": "completed",
  "completed": true
}
```

### Delete Task

#### DELETE `/api/ghl/tasks/:taskId`

---

## Appointments/Calendar

### Get Calendars

#### GET `/api/ghl/calendars`

### Create Appointment

#### POST `/api/ghl/appointments/create`

**Request Body:**
```json
{
  "calendarId": "cal_123",
  "contactId": "contact_abc123",
  "startTime": "2025-01-20T14:00:00Z",
  "endTime": "2025-01-20T15:00:00Z",
  "title": "Sales Demo",
  "appointmentStatus": "confirmed",
  "assignedUserId": "user_123"
}
```

### Get Appointments

#### GET `/api/ghl/appointments?contactId=contact_123&startDate=2025-01-01&endDate=2025-01-31`

### Update Appointment

#### PUT `/api/ghl/appointments/:appointmentId`

---

## Opportunities/Pipeline

### Get Pipelines

#### GET `/api/ghl/opportunities/pipelines`

### Create Opportunity

#### POST `/api/ghl/opportunities/create`

**Request Body:**
```json
{
  "pipelineId": "pipeline_123",
  "contactId": "contact_abc123",
  "name": "Real Estate Deal - John Doe",
  "pipelineStageId": "stage_456",
  "status": "open",
  "monetaryValue": 50000
}
```

### Get Opportunities

#### GET `/api/ghl/opportunities?contactId=contact_123&status=open`

### Update Opportunity

#### PUT `/api/ghl/opportunities/:opportunityId`

---

## Workflows

### Add Contact to Workflow

#### POST `/api/ghl/workflows/:workflowId/add-contact`

**Request Body:**
```json
{
  "contactId": "contact_abc123"
}
```

---

## AI Composite Actions

These endpoints combine multiple operations for common AI agent workflows.

### Welcome New Contact (AI Action)

#### POST `/api/ghl/ai/welcome-contact`

This endpoint creates a contact, sends a welcome SMS, and logs a note - all in one request!

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+18135559123",
  "email": "john@example.com",
  "welcomeMessage": "Hi John! Welcome to our service. We're excited to work with you!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contact created and welcomed successfully",
  "data": {
    "contact": { "id": "contact_abc123", ... },
    "sms": { "messageId": "msg_xyz789" },
    "note": { "id": "note_456" }
  }
}
```

### Log Conversation (AI Action)

#### POST `/api/ghl/ai/log-conversation`

Logs a conversation note and optionally creates a follow-up task.

**Request Body:**
```json
{
  "contactId": "contact_abc123",
  "conversationSummary": "Discussed pricing for the premium package. Customer interested but needs to check budget.",
  "followUpTask": "Call back next week",
  "dueDate": "2025-01-27T10:00:00Z"
}
```

---

## Testing Examples

### Using cURL

#### Test Health Check
```bash
curl https://ringlypro-crm.onrender.com/api/ghl/health
```

#### Create a Contact
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/ghl/contacts/create \
  -H "Content-Type: application/json" \
  -H "x-ghl-api-key: pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe" \
  -H "x-ghl-location-id: YOUR_LOCATION_ID" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phone": "+18135559999",
    "email": "test@example.com"
  }'
```

#### Send SMS
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/ghl/conversations/messages/sms \
  -H "Content-Type: application/json" \
  -H "x-ghl-api-key: pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe" \
  -H "x-ghl-location-id: YOUR_LOCATION_ID" \
  -d '{
    "contactId": "contact_abc123",
    "message": "This is a test message from the integration!"
  }'
```

#### AI Welcome Action
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/ghl/ai/welcome-contact \
  -H "Content-Type: application/json" \
  -H "x-ghl-api-key: pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe" \
  -H "x-ghl-location-id: YOUR_LOCATION_ID" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+18135559123",
    "email": "john@example.com",
    "welcomeMessage": "Hi John! Thanks for signing up. We'\''ll be in touch soon!"
  }'
```

### Using JavaScript/Node.js

```javascript
const axios = require('axios');

const GHL_API_KEY = 'pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe';
const GHL_LOCATION_ID = 'your_location_id';
const BASE_URL = 'https://ringlypro-crm.onrender.com/api/ghl';

// Create a contact
async function createContact() {
  const response = await axios.post(`${BASE_URL}/contacts/create`, {
    firstName: 'Jane',
    lastName: 'Smith',
    phone: '+18135551234',
    email: 'jane@example.com',
    tags: ['new-lead']
  }, {
    headers: {
      'x-ghl-api-key': GHL_API_KEY,
      'x-ghl-location-id': GHL_LOCATION_ID
    }
  });

  console.log('Contact created:', response.data);
  return response.data.data.contact.id;
}

// Send SMS to contact
async function sendSMS(contactId, message) {
  const response = await axios.post(`${BASE_URL}/conversations/messages/sms`, {
    contactId,
    message
  }, {
    headers: {
      'x-ghl-api-key': GHL_API_KEY,
      'x-ghl-location-id': GHL_LOCATION_ID
    }
  });

  console.log('SMS sent:', response.data);
}

// AI Action: Welcome new contact
async function welcomeContact(firstName, lastName, phone, email) {
  const response = await axios.post(`${BASE_URL}/ai/welcome-contact`, {
    firstName,
    lastName,
    phone,
    email,
    welcomeMessage: `Hi ${firstName}! Welcome to our service. Looking forward to working with you!`
  }, {
    headers: {
      'x-ghl-api-key': GHL_API_KEY,
      'x-ghl-location-id': GHL_LOCATION_ID
    }
  });

  console.log('Welcome action completed:', response.data);
}

// Example usage
(async () => {
  try {
    // Create and welcome a new contact
    await welcomeContact('John', 'Doe', '+18135559123', 'john@example.com');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
})();
```

### Using Python

```python
import requests
import json

GHL_API_KEY = 'pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe'
GHL_LOCATION_ID = 'your_location_id'
BASE_URL = 'https://ringlypro-crm.onrender.com/api/ghl'

headers = {
    'Content-Type': 'application/json',
    'x-ghl-api-key': GHL_API_KEY,
    'x-ghl-location-id': GHL_LOCATION_ID
}

# Create a contact
def create_contact(first_name, last_name, phone, email):
    data = {
        'firstName': first_name,
        'lastName': last_name,
        'phone': phone,
        'email': email,
        'tags': ['new-lead']
    }

    response = requests.post(
        f'{BASE_URL}/contacts/create',
        headers=headers,
        json=data
    )

    return response.json()

# Send SMS
def send_sms(contact_id, message):
    data = {
        'contactId': contact_id,
        'message': message
    }

    response = requests.post(
        f'{BASE_URL}/conversations/messages/sms',
        headers=headers,
        json=data
    )

    return response.json()

# AI Action: Welcome contact
def welcome_contact(first_name, last_name, phone, email, message):
    data = {
        'firstName': first_name,
        'lastName': last_name,
        'phone': phone,
        'email': email,
        'welcomeMessage': message
    }

    response = requests.post(
        f'{BASE_URL}/ai/welcome-contact',
        headers=headers,
        json=data
    )

    return response.json()

# Example usage
if __name__ == '__main__':
    try:
        # Create and welcome a new contact
        result = welcome_contact(
            'John',
            'Doe',
            '+18135559123',
            'john@example.com',
            'Hi John! Welcome to our service!'
        )
        print('Welcome action result:', json.dumps(result, indent=2))
    except Exception as e:
        print(f'Error: {e}')
```

## AI Agent Integration Example

Here's how your AI agent can use this integration:

```javascript
// AI Agent - Natural language to API calls

const AI_PROMPT = `
You are an AI assistant with access to GoHighLevel CRM. You can:
1. Create and update contacts
2. Send SMS and emails
3. Log notes and create tasks
4. Manage appointments
5. Handle opportunities and pipelines

Available functions:
- createContact(firstName, lastName, phone, email, tags)
- sendSMS(contactId, message)
- sendEmail(contactId, subject, body)
- createNote(contactId, noteText)
- createTask(contactId, title, dueDate)
- welcomeContact(firstName, lastName, phone, email, message)
`;

// Example: User says "Add John Doe with phone 813-555-9123 and send him an intro SMS"
async function handleUserRequest(userMessage) {
  // Parse the request (using your AI model)
  const intent = parseIntent(userMessage);

  if (intent.action === 'create_and_message') {
    // Use the composite AI action
    const result = await welcomeContact(
      intent.firstName,
      intent.lastName,
      intent.phone,
      intent.email,
      'Hi! Thanks for reaching out. We look forward to working with you!'
    );

    return `✅ Created contact ${intent.firstName} ${intent.lastName} and sent welcome SMS!`;
  }
}
```

## Error Handling

All endpoints return structured error responses:

```json
{
  "success": false,
  "error": "Error message here",
  "details": { /* Additional error details */ }
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (missing required fields)
- `401` - Unauthorized (missing or invalid API key)
- `500` - Server error

## Security Best Practices

1. **Never expose your API key** in client-side code
2. **Use environment variables** for storing credentials
3. **Implement rate limiting** on your endpoints
4. **Validate all input data** before sending to GoHighLevel
5. **Log all API calls** for audit purposes

## GoHighLevel API Limits

- Rate limit: Check GoHighLevel documentation for current limits
- Consider implementing request queuing for high-volume operations
- Use bulk operations when available

## Support & Resources

- GoHighLevel API Documentation: https://highlevel.stoplight.io/
- Integration Support: Your development team
- API Status: Check `/api/ghl/health` endpoint

## Deployment

The integration is already deployed at:
```
https://ringlypro-crm.onrender.com/api/ghl/
```

To redeploy:
```bash
npm run deploy
# or
git push origin main  # Auto-deploys via Render
```

## Next Steps

1. Add your `GHL_LOCATION_ID` to environment variables
2. Test the health endpoint
3. Create a test contact
4. Integrate with your AI agent
5. Set up webhooks (optional) for real-time updates

---

**Integration Version:** 1.0.0
**Last Updated:** January 2025
**Maintained By:** RinglyPro Development Team
