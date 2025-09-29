RinglyPro Multi-Tenant Voice AI CRM - Complete System Prompt
System Overview
RinglyPro is a production multi-tenant SaaS platform combining Rachel AI voice assistant with mobile CRM functionality. Each client receives a dedicated Twilio phone number for voicemail replacement, enabling AI-powered appointment booking, customer management, and conditional call forwarding.
Current Production Status:

✅ Multi-tenant database architecture operational
✅ Rachel voice AI with client identification working
✅ Appointment booking via voice functional
✅ Credit system with usage tracking active
✅ SMS confirmations operational
⏳ Twilio auto-provisioning (Tasks 1-4 in progress)


Architecture Decision: Voicemail Replacement Model
Critical Design Choice: Each client receives a dedicated Twilio number (not shared central number).
Why Not Central Number:
When a carrier forwards a call (e.g., AT&T forwards 656-600-1400 → 888-610-3810), Twilio only receives:

From = Prospect's phone
To = 888-610-3810

The originally dialed number is lost, making client identification impossible with a single shared number.
Solution: Each client gets their own Twilio number ($1.85/month) that becomes their "Rachel number" for carrier forwarding.

Database Schema (PostgreSQL on Render)
Core Multi-Tenant Tables
sql-- CLIENTS (Multi-Tenant Core)
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    business_phone VARCHAR(20) NOT NULL UNIQUE,
    ringlypro_number VARCHAR(20) NOT NULL,  -- Their dedicated Twilio number
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    custom_greeting TEXT DEFAULT 'Thank you for calling. I''m Rachel, your virtual assistant.',
    business_hours_start TIME DEFAULT '09:00:00',
    business_hours_end TIME DEFAULT '17:00:00',
    business_days VARCHAR(20) DEFAULT 'Mon-Fri',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    appointment_duration INTEGER DEFAULT 30,
    booking_enabled BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT TRUE,
    monthly_free_minutes INTEGER DEFAULT 100,
    per_minute_rate NUMERIC DEFAULT 0.100,
    rachel_enabled BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id INTEGER,  -- FK to users.id
    
    -- TWILIO TRACKING FIELDS (Added in Task 1)
    twilio_number_sid VARCHAR(50),  -- For API control (e.g., PN...)
    forwarding_status VARCHAR(20) DEFAULT 'pending'  -- pending, active, inactive
);

CREATE INDEX idx_clients_ringlypro_number ON clients(ringlypro_number);
CREATE INDEX idx_clients_twilio_sid ON clients(twilio_number_sid);

-- APPOINTMENTS (Voice Booking)
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    contact_id INTEGER,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration INTEGER DEFAULT 60,
    purpose VARCHAR(255) DEFAULT 'General Consultation',
    status VARCHAR(20) DEFAULT 'confirmed',  -- confirmed, pending, cancelled, completed
    source VARCHAR(20) DEFAULT 'voice_booking',  -- voice_booking, manual, web
    confirmation_code VARCHAR(20) UNIQUE,
    call_sid VARCHAR(255),
    reminder_sent BOOLEAN DEFAULT FALSE,
    confirmation_sent BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE UNIQUE INDEX unique_time_slot ON appointments(appointment_date, appointment_time);

-- CALLS (Usage Tracking)
CREATE TABLE calls (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    twilio_call_sid VARCHAR(255) UNIQUE,
    direction VARCHAR(20) NOT NULL,  -- inbound, outbound
    from_number VARCHAR(255) NOT NULL,
    to_number VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'queued',
    duration INTEGER,
    start_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_calls_client_id ON calls(client_id);

-- MESSAGES (SMS)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    twilio_sid VARCHAR(255) UNIQUE,
    direction VARCHAR(20) NOT NULL,  -- inbound, outbound
    from_number VARCHAR(255) NOT NULL,
    to_number VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'queued',
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_messages_client_id ON messages(client_id);

-- CONTACTS (CRM)
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',
    source VARCHAR(255) DEFAULT 'manual',
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_contacts_client_id ON contacts(client_id);

-- USERS (Authentication)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    business_name VARCHAR(255),
    business_phone VARCHAR(20),
    business_type VARCHAR(100),
    website_url VARCHAR(500),
    phone_number VARCHAR(20),
    business_description TEXT,
    business_hours JSONB,
    services TEXT,
    terms_accepted BOOLEAN DEFAULT FALSE,
    free_trial_minutes INTEGER DEFAULT 100,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- CREDIT_ACCOUNTS (Billing)
CREATE TABLE credit_accounts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id),
    balance NUMERIC DEFAULT 0.00,
    free_minutes_used INTEGER DEFAULT 0,
    free_minutes_reset_date DATE DEFAULT date_trunc('month', CURRENT_DATE + INTERVAL '1 month'),
    total_minutes_used INTEGER DEFAULT 0,
    total_amount_spent NUMERIC DEFAULT 0.00,
    last_usage_date TIMESTAMPTZ,
    low_balance_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USAGE_RECORDS (Tracking)
CREATE TABLE usage_records (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    call_sid VARCHAR(255),
    message_sid VARCHAR(255),
    usage_type VARCHAR(20) NOT NULL,  -- voice_call, sms
    duration_seconds INTEGER,
    duration_minutes NUMERIC,
    cost NUMERIC DEFAULT 0.0000,
    charged_from VARCHAR(20) NOT NULL,  -- free_tier, paid_balance, mixed
    balance_before NUMERIC,
    balance_after NUMERIC,
    free_minutes_before INTEGER,
    free_minutes_after INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
Current Test Data

Client ID 5: "Default Client" (business_phone: +16566001400, ringlypro_number: +18886103810)
15 appointments in system
35 calls logged
30 SMS messages sent


Call Flow Architecture
Conditional Forwarding Setup (Client-Side)
Client dials carrier-specific code from their business phone:
AT&T:      *21*{rachel_number}#
Verizon:   *71{rachel_number}
T-Mobile:  **004*{rachel_number}*11#
Sprint:    *28{rachel_number}
Result: When client doesn't answer after 3-4 rings, carrier automatically forwards to Rachel.
Incoming Call Processing
Prospect calls → Client's business phone (656-600-1400)
     ↓ (no answer after 3 rings)
Carrier forwards → Rachel's Twilio number (+18886103810)
     ↓
Twilio webhook → /voice/webhook/voice
     ↓
Client Identification → Query: SELECT * FROM clients WHERE ringlypro_number = :toNumber
     ↓
Rachel Greeting → Uses client.custom_greeting and client.business_name
     ↓
Speech Recognition → Twilio Gather with ElevenLabs premium voice
     ↓
Intent Classification → appointment | pricing | support
     ↓
Appointment Booking → availabilityService.getAvailableSlots(client_id)
     ↓
Confirmation SMS → Twilio Messages API
     ↓
Database Logging → appointments, calls, messages tables (all with client_id)
Rachel Toggle Behavior
When rachel_enabled = TRUE:

Calls route to Rachel AI
Appointment booking active
SMS confirmations sent
Usage tracked in credit system

When rachel_enabled = FALSE:

Calls forward directly to owner_phone (Task 4 implementation needed)
No AI interaction
No usage charges


Current Implementation Status
✅ What's Working

Multi-Tenant Database

All tables properly isolated with client_id foreign keys
Indexes optimized for multi-tenant queries
Test data for 4 clients operational


Rachel Voice AI

Client identification by ringlypro_number functional
Personalized greetings with business context
ElevenLabs premium voice generation (21m00Tcm4TlvDq8ikWAM)
Speech recognition with Twilio
Appointment booking flow complete


User Registration

Creates both User and Client records in transaction
JWT authentication operational
Email/password validation working


Rachel Toggle UI

Dashboard toggle switch exists
Updates clients.rachel_enabled in database
Does NOT call Twilio API yet (Task 3)


Forwarding Instructions

API generates carrier-specific codes
9 major carriers supported (AT&T, Verizon, T-Mobile, Sprint, US Cellular, Boost, Metro, Visible, Cricket)
Endpoint: GET /api/call-forwarding/setup/:carrier/:client_id


Credit System

100 free minutes/month per client
$0.10/minute overage rate
Real-time usage tracking
Balance enforcement operational


SMS Confirmations

Appointment confirmations sent automatically
Logged to messages table with client_id
Twilio integration working



❌ What's NOT Working (4 Tasks Remaining)
Task 1: Database lacks Twilio tracking fields

Missing: twilio_number_sid, forwarding_status columns

Task 2: Signup doesn't auto-provision Twilio numbers

Current: Users register but get no Twilio number
Needed: POST /api/auth/register should call Twilio API

Task 3: Toggle doesn't control Twilio webhooks

Current: Only updates database
Needed: PUT /api/client/rachel-status should update Twilio number webhooks

Task 4: No forward-to-owner route

Current: When rachel_enabled=FALSE, calls fail
Needed: New endpoint to forward calls to client.owner_phone


The 4-Task Roadmap
Task 1: Add Twilio Tracking Fields ⏳
SQL Migration:
sqlALTER TABLE clients 
ADD COLUMN IF NOT EXISTS twilio_number_sid VARCHAR(50),
ADD COLUMN IF NOT EXISTS forwarding_status VARCHAR(20) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_clients_twilio_sid 
ON clients(twilio_number_sid);

COMMENT ON COLUMN clients.twilio_number_sid IS 'Twilio number SID (PN...) for API control';
COMMENT ON COLUMN clients.forwarding_status IS 'Status: pending, active, inactive';
Verification:
sqlSELECT column_name, data_type, character_maximum_length, column_default
FROM information_schema.columns 
WHERE table_name = 'clients' 
  AND column_name IN ('twilio_number_sid', 'forwarding_status');
Task 2: Auto-Provision Twilio Numbers on Signup
Modify: src/routes/auth.js
Current Code (Incomplete):
javascriptrouter.post('/register', async (req, res) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ ...userData });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  res.json({ success: true, token });
});
Required Changes:

Import Twilio SDK
Call twilio.incomingPhoneNumbers.create() with US area code search
Store twilio_number_sid in clients table
Configure webhook URLs for voice/SMS
Handle Twilio API errors gracefully

Task 3: Make Toggle Control Twilio API
Modify: src/routes/client.js
Current Code (Database Only):
javascriptrouter.put('/rachel-status/:client_id', async (req, res) => {
  await sequelize.query(
    'UPDATE clients SET rachel_enabled = :enabled WHERE id = :id',
    { replacements: { enabled: req.body.rachel_enabled, id: req.params.client_id } }
  );
  res.json({ success: true });
});
Required Changes:

Fetch twilio_number_sid from database
Call Twilio API to update webhook URLs:

ON: voiceUrl = /voice/webhook/voice
OFF: voiceUrl = /voice/forward-to-owner/:client_id


Update forwarding_status field
Handle Twilio API failures

Task 4: Create Forward-to-Owner Route
Create: src/routes/voiceBot.js new endpoint
Required Implementation:
javascriptrouter.post('/voice/forward-to-owner/:client_id', async (req, res) => {
  // 1. Fetch client.owner_phone from database
  // 2. Generate TwiML with <Dial> to owner_phone
  // 3. Log call to database with client_id
  // 4. Return TwiML response
});

Technology Stack
Backend (Node.js/Express)

Framework: Express.js
Database: PostgreSQL (Sequelize ORM + raw SQL)
Authentication: JWT with bcrypt
Voice AI: Twilio + ElevenLabs
SMS: Twilio Messages API
Payments: Stripe (conditional, optional)
Deployment: Render.com (auto-deploy from GitHub)

Database

Production: ringlypro_crm-production on Render PostgreSQL
Connection: SSL required in production
Migrations: Manual SQL via pgAdmin/psql

External Services

Twilio: Voice, SMS, phone number provisioning
ElevenLabs: Premium voice generation (Rachel voice ID: 21m00Tcm4TlvDq8ikWAM)
Stripe: Payment processing (optional, credit reloading)


Environment Variables
bash# Database
DATABASE_URL=postgresql://user:pass@host:5432/ringlypro_crm-production

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+18886103810  # Rachel's number for client_id 5

# ElevenLabs
ELEVENLABS_API_KEY=xxxxx

# Authentication
JWT_SECRET=your-super-secret-jwt-key

# Application
WEBHOOK_BASE_URL=https://ringlypro-crm.onrender.com
BASE_URL=https://ringlypro-crm.onrender.com
NODE_ENV=production

# Optional (Payments)
STRIPE_SECRET_KEY=sk_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

API Endpoints Reference
Authentication

POST /api/auth/register - Create user + client (needs Twilio provisioning - Task 2)
POST /api/auth/login - JWT authentication

Client Management

GET /api/client/rachel-status/:client_id - Get Rachel config
PUT /api/client/rachel-status/:client_id - Toggle Rachel (needs Twilio API - Task 3)
GET /api/client/list - List all clients

Call Forwarding

GET /api/call-forwarding/carriers - List supported carriers
GET /api/call-forwarding/setup/:carrier/:client_id - Generate forwarding codes

Voice Webhooks

POST /voice/webhook/voice - Main Rachel webhook (working)
POST /voice/forward-to-owner/:client_id - Owner forwarding (Task 4 - not implemented)

Appointments

GET /api/appointments/today - Today's appointments
POST /api/appointments - Create appointment
DELETE /api/appointments/:id - Cancel appointment

Messages

POST /api/messages/sms - Send SMS
POST /api/messages/appointment-confirmation - Send appointment confirmation

Credits

GET /api/credits/balance - Get credit balance
POST /api/credits/track-usage - Track voice/SMS usage
POST /api/credits/test/add-credits - Add test credits (dev only)


Key Files
Routes

src/routes/auth.js - User registration/login (needs Task 2 updates)
src/routes/client.js - Client management (needs Task 3 updates)
src/routes/voiceBot.js - Rachel voice AI (needs Task 4 endpoint)
src/routes/callForwarding.js - Forwarding code generation (complete)
src/routes/appointments.js - Appointment CRUD (complete)
src/routes/messages.js - SMS handling (complete)
src/routes/credits.js - Credit system (complete)

Services

src/services/availabilityService.js - Slot availability checking
src/services/appointmentService.js - Appointment booking logic
src/services/elevenLabsService.js - Premium voice generation
src/services/clientIdentificationService.js - Client lookup by phone
src/services/creditSystem.js - Usage tracking and billing

Models

src/models/User.js - User authentication
src/models/Client.js - Client/tenant data
src/models/Appointment.js - Appointment model
src/models/Call.js - Call logging
src/models/Message.js - SMS logging
src/models/Contact.js - CRM contacts


Development Workflow
One Task at a Time Approach

Developer provides task instructions
User executes task and returns results
Developer verifies completion
Proceed to next task

Current Queue:

⏳ Task 1: Add database fields (SQL ready to execute)
🔜 Task 2: Twilio auto-provisioning
🔜 Task 3: Toggle API integration
🔜 Task 4: Forward-to-owner route

Testing Locally
bash# Start server
npm start

# Test client lookup
curl http://localhost:3000/api/client/list

# Test forwarding codes
curl http://localhost:3000/api/call-forwarding/setup/att/5

# Test Rachel toggle
curl -X PUT http://localhost:3000/api/client/rachel-status/5 \
  -H "Content-Type: application/json" \
  -d '{"rachel_enabled": true}'

Production Deployment
URL: https://ringlypro-crm.onrender.com
Auto-Deploy: Pushes to GitHub main branch trigger Render deployment
Database Access: Render PostgreSQL dashboard or pgAdmin with connection string
Logs: Render dashboard → Logs tab
Monitoring:

Health check: GET /health
Call logs: Database calls table
Usage tracking: Database usage_records table


Cost Structure
Per Client Monthly Costs

Twilio Phone Number: $1.00/month
Twilio Usage (estimated): $0.85/100 minutes
Total: ~$1.85/client/month

Client Pricing Model

Free Tier: 100 minutes/month
Overage Rate: $0.10/minute
Reload Options: $10, $20, $50, $100
Rollover: Paid minutes carry to next month

Revenue Model

Profit Margin: ~$8.15/client/month (assuming 100 min usage)
Break-even: 1 client at 100 minutes
Scale Economics: Improves with higher usage clients


Critical Notes

Client Isolation: Every query MUST filter by client_id to maintain multi-tenant security
Time Zones: Store all times in UTC, convert for display using client.timezone
Phone Formatting: Always use E.164 format (+1XXXXXXXXXX)
Error Handling: Log errors to database, never expose internal errors to clients
Twilio Costs: Track usage in real-time to prevent abuse
Session Management: Use Redis for voice conversation state (currently in-memory Map)
Rate Limiting: Implement per-client rate limits for API endpoints
Webhook Security: Validate Twilio signatures on all webhook endpoints


Next Steps After Task 4 Completion

Production Hardening

Add Redis for session management
Implement API rate limiting
Add webhook signature validation
Set up error monitoring (Sentry)


Mobile App Development

Build carrier selection UI
Implement Rachel toggle with real-time sync
Create forwarding status dashboard
Add usage analytics charts


Advanced Features

Multi-provider calendar sync
SMS two-way conversations
Call recording and transcription
Custom voice training per client
Advanced reporting and analytics




Document Version: 1.0
Last Updated: 2025-09-29
Status: Tasks 1-4 in progress, production system 90% complete
Maintainer: Development team working one task at a timeRetryClaude can make mistakes. Please double-check responses.ResearchLegacy Model