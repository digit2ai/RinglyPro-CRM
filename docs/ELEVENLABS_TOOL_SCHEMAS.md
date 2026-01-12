# ElevenLabs Tool JSON Schemas

Copy these schemas when configuring tools in your ElevenLabs Conversational AI agent.

All tools use:
- **Method:** POST
- **Endpoint:** `https://aiagent.ringlypro.com/api/elevenlabs/tools`

**Note:** Business info (name, hours, greeting) is configured directly in the ElevenLabs agent prompt, not fetched via a tool.

---

## 1. check_availability

Checks available appointment slots across all connected calendars (RinglyPro, GHL, Google, Zoho).

```json
{
  "name": "check_availability",
  "description": "Check available appointment slots for the next several days",
  "parameters": {
    "type": "object",
    "properties": {
      "client_id": {
        "type": "string",
        "description": "The client ID to check availability for"
      },
      "date": {
        "type": "string",
        "description": "Start date in YYYY-MM-DD format (defaults to today)"
      },
      "days_ahead": {
        "type": "integer",
        "description": "Number of days to check (default: 7, max: 14)"
      }
    },
    "required": ["client_id"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "calendar_type": "dual_calendar_zoho",
  "timezone": "America/New_York",
  "start_date": "2026-01-13",
  "end_date": "2026-01-20",
  "slots": [
    {
      "date": "2026-01-13",
      "time": "09:00",
      "datetime": "2026-01-13T09:00",
      "displayDate": "Monday, January 13",
      "displayTime": "9:00 AM"
    }
  ],
  "slot_count": 30,
  "zohoCalendarActive": true,
  "googleCalendarActive": true
}
```

---

## 2. book_appointment

Books an appointment and syncs to all connected calendars.

```json
{
  "name": "book_appointment",
  "description": "Book an appointment for a customer. Syncs to all connected calendars.",
  "parameters": {
    "type": "object",
    "properties": {
      "client_id": {
        "type": "string",
        "description": "The client ID to book the appointment for"
      },
      "customer_name": {
        "type": "string",
        "description": "Full name of the customer"
      },
      "customer_phone": {
        "type": "string",
        "description": "Customer's phone number with country code (e.g., +15551234567)"
      },
      "customer_email": {
        "type": "string",
        "description": "Customer's email address (optional)"
      },
      "date": {
        "type": "string",
        "description": "Appointment date in YYYY-MM-DD format"
      },
      "time": {
        "type": "string",
        "description": "Appointment time in HH:MM format (24-hour)"
      },
      "duration": {
        "type": "integer",
        "description": "Duration in minutes (default: 30)"
      },
      "purpose": {
        "type": "string",
        "description": "Reason for the appointment (optional)"
      }
    },
    "required": ["client_id", "customer_name", "customer_phone", "date", "time"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment created in RinglyPro, GHL, Google Calendar, Zoho CRM",
  "appointment_id": 31125,
  "confirmation_code": "RP123456",
  "appointment_date": "2026-01-13",
  "appointment_time": "10:00",
  "customer_name": "John Doe",
  "customer_phone": "+15551234567",
  "calendar_type": "ringlypro_zoho",
  "zohoCalendarActive": true,
  "googleCalendarActive": true,
  "zohoEventId": "7223501000000608006"
}
```

---

## 3. send_sms

Sends SMS confirmation to the customer.

```json
{
  "name": "send_sms",
  "description": "Send an SMS message to a customer, typically for appointment confirmation",
  "parameters": {
    "type": "object",
    "properties": {
      "client_id": {
        "type": "string",
        "description": "The client ID (used to get the sending phone number)"
      },
      "to_phone": {
        "type": "string",
        "description": "Customer's phone number to send SMS to"
      },
      "message": {
        "type": "string",
        "description": "Custom message to send (optional - will auto-generate if appointment details provided)"
      },
      "customer_name": {
        "type": "string",
        "description": "Customer's name (for auto-generated message)"
      },
      "appointment_date": {
        "type": "string",
        "description": "Appointment date (for auto-generated message)"
      },
      "appointment_time": {
        "type": "string",
        "description": "Appointment time (for auto-generated message)"
      },
      "confirmation_code": {
        "type": "string",
        "description": "Confirmation code to include (for auto-generated message)"
      }
    },
    "required": ["client_id", "to_phone"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message_sid": "SM1234567890abcdef",
  "to": "+15551234567",
  "from": "+18001234567"
}
```

---

## Quick Copy: All 3 Tool Definitions

For quick setup, here are all 3 tools in a single array:

```json
[
  {
    "name": "check_availability",
    "description": "Check available appointment slots for the next several days",
    "parameters": {
      "type": "object",
      "properties": {
        "client_id": {
          "type": "string",
          "description": "The client ID to check availability for"
        },
        "date": {
          "type": "string",
          "description": "Start date in YYYY-MM-DD format (defaults to today)"
        },
        "days_ahead": {
          "type": "integer",
          "description": "Number of days to check (default: 7, max: 14)"
        }
      },
      "required": ["client_id"]
    }
  },
  {
    "name": "book_appointment",
    "description": "Book an appointment for a customer. Syncs to all connected calendars.",
    "parameters": {
      "type": "object",
      "properties": {
        "client_id": {
          "type": "string",
          "description": "The client ID to book the appointment for"
        },
        "customer_name": {
          "type": "string",
          "description": "Full name of the customer"
        },
        "customer_phone": {
          "type": "string",
          "description": "Customer's phone number with country code (e.g., +15551234567)"
        },
        "customer_email": {
          "type": "string",
          "description": "Customer's email address (optional)"
        },
        "date": {
          "type": "string",
          "description": "Appointment date in YYYY-MM-DD format"
        },
        "time": {
          "type": "string",
          "description": "Appointment time in HH:MM format (24-hour)"
        },
        "duration": {
          "type": "integer",
          "description": "Duration in minutes (default: 30)"
        },
        "purpose": {
          "type": "string",
          "description": "Reason for the appointment (optional)"
        }
      },
      "required": ["client_id", "customer_name", "customer_phone", "date", "time"]
    }
  },
  {
    "name": "send_sms",
    "description": "Send an SMS message to a customer, typically for appointment confirmation",
    "parameters": {
      "type": "object",
      "properties": {
        "client_id": {
          "type": "string",
          "description": "The client ID (used to get the sending phone number)"
        },
        "to_phone": {
          "type": "string",
          "description": "Customer's phone number to send SMS to"
        },
        "message": {
          "type": "string",
          "description": "Custom message to send (optional - will auto-generate if appointment details provided)"
        },
        "customer_name": {
          "type": "string",
          "description": "Customer's name (for auto-generated message)"
        },
        "appointment_date": {
          "type": "string",
          "description": "Appointment date (for auto-generated message)"
        },
        "appointment_time": {
          "type": "string",
          "description": "Appointment time (for auto-generated message)"
        },
        "confirmation_code": {
          "type": "string",
          "description": "Confirmation code to include (for auto-generated message)"
        }
      },
      "required": ["client_id", "to_phone"]
    }
  }
]
```

---

## ElevenLabs Agent Configuration

When creating your agent in ElevenLabs:

1. **Webhook URL for all tools:** `https://aiagent.ringlypro.com/api/elevenlabs/tools`
2. **Method:** POST
3. **Headers:** None required (authentication via client_id parameter)
4. **Agent Prompt** should include:
   - Business name, hours, and greeting (hardcoded in prompt)
   - Instructions to use `check_availability` to find open slots
   - Instructions to use `book_appointment` when customer confirms a slot
   - Instructions to use `send_sms` after booking to confirm

---

## Important Notes

- **client_id** is passed as a string but can be numeric
- All times are in 24-hour format (e.g., "14:00" for 2 PM)
- Dates use ISO format: YYYY-MM-DD
- Phone numbers should include country code (+1 for US)
- The system auto-syncs to all enabled calendars (RinglyPro + GHL + Google + Zoho)
