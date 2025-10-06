# RinglyPro-CRM System Architecture

**Version:** 2.0.0
**Platform:** AI-Powered Voice Receptionist & CRM
**Production URL:** https://aiagent.ringlypro.com
**Last Updated:** October 2025

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Schema](#4-database-schema)
5. [API Routes & Endpoints](#5-api-routes--endpoints)
6. [Core Functionality](#6-core-functionality)
7. [External Integrations](#7-external-integrations)
8. [Security & Authentication](#8-security--authentication)
9. [Multi-Tenant Architecture](#9-multi-tenant-architecture)
10. [Voice AI System](#10-voice-ai-system)
11. [Billing & Credits](#11-billing--credits)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Data Flows](#13-data-flows)
14. [Configuration](#14-configuration)

---

## 1. Project Overview

RinglyPro-CRM is a **multi-tenant SaaS platform** that provides AI-powered phone receptionist services with integrated CRM capabilities. The system enables businesses to handle incoming phone calls using bilingual voice AI (English/Spanish), book appointments autonomously, and manage customer relationships.

### Key Features
- 🤖 **Bilingual Voice AI** - Rachel (English) and Lina (Spanish) voice agents
- 📅 **Autonomous Appointment Booking** - Real-time scheduling via voice
- 💬 **Two-Way SMS** - Integrated messaging system
- 📊 **CRM Dashboard** - Contacts, calls, messages, analytics
- 💳 **Flexible Billing** - Free tier + pay-as-you-go with Stripe
- 🔒 **Enterprise Security** - JWT authentication, multi-tenant isolation
- 📱 **Progressive Web App** - Installable mobile experience

### Use Cases
- Healthcare practices (appointment scheduling)
- Legal offices (client intake)
- Real estate agencies (lead management)
- Service businesses (booking & support)

---

## 2. Technology Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 16+ |
| Framework | Express.js | 4.18.2 |
| Language | JavaScript (ES6+) | - |
| Database | PostgreSQL | 15+ |
| ORM | Sequelize | 6.35.0 |
| Session | express-session | 1.17.3 |
| Authentication | JWT | 9.0.2 |
| Password Hashing | bcrypt | 6.0.0 |

### Frontend
| Component | Technology |
|-----------|-----------|
| Template Engine | EJS 3.1.9 |
| Styling | Tailwind CSS (utility-first) |
| JavaScript | Vanilla JS + modular Auth library |
| PWA Support | Service Worker + manifest.json |

### External Services
| Service | Purpose | Key Features |
|---------|---------|--------------|
| Twilio | Voice & SMS | Calls, messaging, phone provisioning |
| ElevenLabs | Text-to-Speech | Premium voices (Rachel, Lina) |
| Stripe | Payments | Credit reload, subscriptions |
| SendGrid | Email | Transactional emails, notifications |

### Development Tools
- **Testing:** Jest 29.7.0
- **Linting:** ESLint 8.55.0 + Prettier 3.1.0
- **Dev Server:** Nodemon 3.0.2

---

## 3. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Web Browser (Dashboard)  │  Twilio Voice  │  SMS Gateway       │
└────────────┬──────────────┴────────┬───────┴──────────┬─────────┘
             │                       │                   │
             ▼                       ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                      Express.js Server                           │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │ Auth Routes  │ Voice Routes │  API Routes  │   Webhooks   │  │
│  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘  │
│         │              │              │              │           │
│         ▼              ▼              ▼              ▼           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               SERVICE LAYER                               │   │
│  │  • rachelVoiceService    • appointmentService            │   │
│  │  • linaVoiceService      • creditSystem                  │   │
│  │  • clientIdentificationService                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                   PostgreSQL Database                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Users │ Clients │ Contacts │ Appointments │ Calls       │   │
│  │  Messages │ CreditAccounts │ Call History                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
             │              │              │              │
             ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
├─────────────────────────────────────────────────────────────────┤
│   Twilio    │   ElevenLabs   │    Stripe    │   SendGrid       │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
RinglyPro-CRM/
├── src/
│   ├── app.js                      # Express app configuration (440 lines)
│   ├── server.js                   # Server startup + graceful shutdown
│   ├── config/
│   │   ├── database.js             # PostgreSQL/Sequelize config
│   │   └── businessHours.js        # Business hours & slot generation
│   ├── middleware/
│   │   └── auth.js                 # JWT authentication middleware
│   ├── models/                     # Sequelize ORM models
│   │   ├── index.js                # Model registry & associations (584 lines)
│   │   ├── User.js                 # User authentication
│   │   ├── Client.js               # Multi-tenant client config
│   │   ├── Contact.js              # CRM contacts
│   │   ├── Appointment.js          # Appointment bookings
│   │   ├── Call.js                 # Call history
│   │   ├── Message.js              # SMS messages
│   │   └── CreditAccount.js        # Billing/credit system
│   ├── routes/                     # API route handlers (20 files, 6,891 lines)
│   │   ├── auth.js                 # Authentication routes (667 lines)
│   │   ├── rachelRoutes.js         # English voice AI (497 lines)
│   │   ├── linaRoutes.js           # Spanish voice AI (370 lines)
│   │   ├── appointments.js         # Appointment API (689 lines)
│   │   ├── credits.js              # Credit system API (288 lines)
│   │   ├── mobile.js               # Mobile CRM API (386 lines)
│   │   └── [other routes]
│   └── services/                   # Business logic (12 files, 4,058 lines)
│       ├── rachelVoiceService.js   # English AI service (417 lines)
│       ├── linaVoiceService.js     # Spanish AI service (328 lines)
│       ├── creditSystem.js         # Billing logic (651 lines)
│       ├── appointmentService.js   # Booking logic (414 lines)
│       ├── elevenLabsService.js    # TTS integration (116 lines)
│       └── clientIdentificationService.js # Tenant lookup (268 lines)
├── views/                          # EJS templates
│   ├── dashboard.ejs               # Main dashboard (90,914 bytes)
│   ├── login.ejs
│   ├── signup.ejs
│   └── [other views]
├── public/                         # Static assets
│   ├── js/auth.js                  # Client-side auth library
│   ├── audio/                      # ElevenLabs generated audio cache
│   ├── manifest.json               # PWA manifest
│   └── service-worker.js           # PWA service worker
└── migrations/                     # Database migrations
    ├── create-appointments-table.js
    └── [other migrations]
```

---

## 4. Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Users    │──────▶│   Clients   │──────▶│  Contacts   │
└─────────────┘ 1:1   └─────────────┘ 1:N   └─────────────┘
                             │                      │
                             │ 1:N                  │ 1:N
                             ▼                      ▼
                      ┌─────────────┐       ┌─────────────┐
                      │Appointments │       │    Calls    │
                      └─────────────┘       └─────────────┘
                             │
                             │ 1:1
                             ▼
                      ┌─────────────┐       ┌─────────────┐
                      │Credit       │──────▶│  Messages   │
                      │Accounts     │ 1:N   └─────────────┘
                      └─────────────┘
```

### Core Tables

#### **users** - User Authentication & Profiles
```sql
CREATE TABLE users (
  id                          SERIAL PRIMARY KEY,
  email                       VARCHAR(255) UNIQUE NOT NULL,
  password_hash               VARCHAR(255) NOT NULL,
  first_name                  VARCHAR(100),
  last_name                   VARCHAR(100),
  business_name               VARCHAR(255),
  business_phone              VARCHAR(255),
  business_type               VARCHAR(100),  -- healthcare, legal, realestate, etc.
  website_url                 VARCHAR(255),
  phone_number                VARCHAR(20),
  business_description        TEXT,
  business_hours              JSONB,
  services                    TEXT,
  terms_accepted              BOOLEAN DEFAULT false,
  free_trial_minutes          INTEGER DEFAULT 100,
  onboarding_completed        BOOLEAN DEFAULT false,
  email_verified              BOOLEAN DEFAULT false,
  email_verification_token    VARCHAR(255),
  password_reset_token        VARCHAR(255),
  password_reset_expires      TIMESTAMP,
  created_at                  TIMESTAMP DEFAULT NOW(),
  updated_at                  TIMESTAMP DEFAULT NOW()
);
```

#### **clients** - Multi-Tenant Configuration
```sql
CREATE TABLE clients (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  business_name             VARCHAR(255) NOT NULL,
  business_phone            VARCHAR(20) NOT NULL,
  ringlypro_number          VARCHAR(20) UNIQUE,  -- Twilio assigned number
  twilio_number_sid         VARCHAR(50),
  owner_name                VARCHAR(255),
  owner_phone               VARCHAR(20),
  owner_email               VARCHAR(255),
  custom_greeting           TEXT,
  business_hours_start      TIME DEFAULT '09:00',
  business_hours_end        TIME DEFAULT '17:00',
  business_days             VARCHAR(20) DEFAULT '1,2,3,4,5',  -- Mon-Fri
  timezone                  VARCHAR(50) DEFAULT 'America/New_York',
  appointment_duration      INTEGER DEFAULT 30,  -- minutes
  booking_enabled           BOOLEAN DEFAULT true,
  sms_notifications         BOOLEAN DEFAULT true,
  monthly_free_minutes      INTEGER DEFAULT 100,
  per_minute_rate           DECIMAL(10,3) DEFAULT 0.100,
  rachel_enabled            BOOLEAN DEFAULT true,  -- English AI
  active                    BOOLEAN DEFAULT true,
  forwarding_status         VARCHAR(20),
  stripe_customer_id        VARCHAR(255),
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);
```

#### **contacts** - CRM Contacts
```sql
CREATE TABLE contacts (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firstName             VARCHAR(100) NOT NULL,
  lastName              VARCHAR(100) NOT NULL,
  phone                 VARCHAR(20) NOT NULL,
  email                 VARCHAR(255),
  notes                 TEXT,
  status                VARCHAR(20) DEFAULT 'active',  -- active, inactive, blocked
  source                VARCHAR(50),  -- manual, voice_call, sms, rachel_voice
  last_contacted_at     TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, phone)
);
```

#### **appointments** - Voice-Booked Appointments
```sql
CREATE TABLE appointments (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id            INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  customer_name         VARCHAR(255) NOT NULL,
  customer_phone        VARCHAR(20) NOT NULL,
  customer_email        VARCHAR(255),
  appointment_date      DATE NOT NULL,
  appointment_time      TIME NOT NULL,
  duration              INTEGER DEFAULT 30,  -- minutes
  purpose               TEXT,
  status                VARCHAR(20) DEFAULT 'confirmed',
                        -- confirmed, pending, cancelled, completed, no-show
  confirmation_code     VARCHAR(20) UNIQUE,
  source                VARCHAR(50) DEFAULT 'voice_booking',
                        -- voice_booking, online, manual, walk-in
  reminder_sent         BOOLEAN DEFAULT false,
  confirmation_sent     BOOLEAN DEFAULT false,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, appointment_date, appointment_time)
);
```

#### **calls** - Call History
```sql
CREATE TABLE calls (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  contact_id            INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  twilio_call_sid       VARCHAR(50) UNIQUE,
  direction             VARCHAR(20),  -- incoming, outgoing
  from_number           VARCHAR(20) NOT NULL,
  to_number             VARCHAR(20) NOT NULL,
  status                VARCHAR(20),
                        -- queued, ringing, in-progress, completed, busy, failed, no-answer
  duration              INTEGER,  -- seconds
  recording_url         VARCHAR(500),
  cost                  DECIMAL(10,4),
  start_time            TIMESTAMP,
  end_time              TIMESTAMP,
  answered_by           VARCHAR(50),
  hangup_cause          VARCHAR(50),
  caller_name           VARCHAR(255),
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);
```

#### **messages** - SMS History
```sql
CREATE TABLE messages (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id            INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  twilio_sid            VARCHAR(50) UNIQUE,
  direction             VARCHAR(20),  -- incoming, outgoing
  from_number           VARCHAR(20) NOT NULL,
  to_number             VARCHAR(20) NOT NULL,
  body                  TEXT NOT NULL,
  status                VARCHAR(20),  -- queued, sent, received, delivered, failed
  error_code            VARCHAR(10),
  error_message         VARCHAR(500),
  cost                  DECIMAL(10,4),
  sent_at               TIMESTAMP,
  delivered_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);
```

#### **credit_accounts** - Billing System
```sql
CREATE TABLE credit_accounts (
  id                        SERIAL PRIMARY KEY,
  client_id                 INTEGER UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  balance                   DECIMAL(10,2) DEFAULT 0.00,
  free_minutes_used         INTEGER DEFAULT 0,
  free_minutes_reset_date   DATE,
  total_minutes_used        INTEGER DEFAULT 0,
  total_amount_spent        DECIMAL(10,2) DEFAULT 0.00,
  last_usage_date           TIMESTAMP,
  low_balance_notified      BOOLEAN DEFAULT false,
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);
```

---

## 5. API Routes & Endpoints

### Authentication (`/api/auth`)
```
POST   /api/auth/register              Register new user + auto-provision Twilio number
POST   /api/auth/login                 Authenticate user, return JWT
POST   /api/auth/logout                Invalidate session
GET    /api/auth/profile               Get user profile (protected)
POST   /api/auth/update-profile        Update user information (protected)
POST   /api/auth/forgot-password       Request password reset email
POST   /api/auth/reset-password        Reset password with token
GET    /api/auth/verify-reset-token/:token   Verify reset token validity
POST   /api/auth/refresh-token         Refresh JWT token (protected)
GET    /api/auth/verify                Verify token validity (protected)
```

### Voice AI Routes

#### Rachel (English Voice)
```
POST   /voice/rachel/                  Main webhook - incoming call handler
POST   /voice/rachel/select-language   Language selection (1=English, 2=Spanish)
POST   /voice/rachel/incoming          Process incoming call with language
POST   /voice/rachel/process-speech    Speech recognition processing
POST   /voice/rachel/collect-name      Collect customer name for booking
POST   /voice/rachel/collect-phone     Collect phone number
POST   /voice/rachel/book-appointment  Complete appointment booking
GET    /voice/rachel/test-client/:number   Test client identification
```

#### Lina (Spanish Voice)
```
POST   /voice/lina/incoming            Spanish voice handler
POST   /voice/lina/process-speech      Spanish speech processing
POST   /voice/lina/collect-name        Spanish name collection
POST   /voice/lina/collect-phone       Spanish phone collection
POST   /voice/lina/book-appointment    Spanish appointment booking
```

### CRM Routes

#### Contacts
```
GET    /api/contacts                   List all contacts (protected)
POST   /api/contacts                   Create new contact (protected)
GET    /api/contacts/:id               Get contact details (protected)
PUT    /api/contacts/:id               Update contact (protected)
DELETE /api/contacts/:id               Delete contact (protected)
```

#### Appointments
```
GET    /api/appointments               List appointments (protected)
POST   /api/appointments               Create appointment (protected)
GET    /api/appointments/:id           Get appointment details (protected)
PUT    /api/appointments/:id           Update appointment (protected)
DELETE /api/appointments/:id           Cancel appointment (protected)
GET    /api/appointments/today         Today's appointments (protected)
GET    /api/appointments/available     Available time slots (protected)
```

#### Messages
```
GET    /api/messages                   List messages (protected)
POST   /api/messages/sms               Send SMS (protected)
GET    /api/messages/test              Test Twilio connection
POST   /webhook/twilio/sms             Twilio SMS webhook (incoming messages)
```

#### Calls
```
GET    /api/calls                      List call history (protected)
GET    /api/calls/:id                  Get call details (protected)
GET    /api/call-log                   Call log for dashboard (protected)
POST   /webhook/twilio/status          Twilio call status webhook
```

### Credit System (`/api/credits`)
```
GET    /api/credits/test/client/:id               Get client credit summary
POST   /api/credits/reload                        Initiate credit reload (protected)
POST   /api/credits/webhook/stripe                Stripe webhook handler
GET    /api/credits/usage                         Get usage history (protected)
GET    /api/credits/transactions                  Get payment history (protected)
GET    /api/credits/notifications                 Get credit notifications (protected)
POST   /api/credits/auto-reload/configure         Configure auto-reload (protected)
POST   /api/credits/test/add/:clientId            Add test credits (development)
```

### Mobile CRM (`/api/mobile`)
```
GET    /api/mobile/dashboard           Mobile dashboard data (protected)
GET    /api/mobile/stats               Mobile statistics (protected)
POST   /api/mobile/client/toggle       Toggle Rachel AI on/off (protected)
```

### System Routes
```
GET    /health                         System health check
GET    /api/status                     API status with database stats
GET    /api/dashboard                  Dashboard data (protected)
GET    /                               Main dashboard (requires auth)
GET    /login                          Login page
GET    /signup                         Registration page
GET    /forgot-password                Password reset request page
GET    /reset-password                 Password reset form
```

---

## 6. Core Functionality

### 6.1 Multi-Tenant Voice AI System

**Bilingual Support**
- **English Voice:** Rachel (ElevenLabs voice ID: `21m00Tcm4TlvDq8ikWAM`)
- **Spanish Voice:** Lina (ElevenLabs voice ID: `ThT5KcBeYPX3keUQqHPh`)
- **Language Selection:** DTMF-based (Press 1 for English, 2 for Spanish)
- **TTS Model:** `eleven_monolingual_v1` with stability=0.5, similarity_boost=0.75

**Client Identification**
- Automatic client lookup by incoming Twilio phone number
- Multi-tenant isolation (each client has dedicated Twilio number)
- Custom greetings per client
- Business hours enforcement
- Session-based context storage

**Voice Capabilities**
- Speech recognition (Twilio speech-to-text)
- Intent recognition (booking, pricing, support inquiries)
- Natural language processing
- Premium TTS with ElevenLabs
- Fallback to Twilio TTS if ElevenLabs unavailable
- Audio file caching in `/public/audio/`

### 6.2 Appointment Booking System

**Real-Time Booking**
- Voice-driven appointment scheduling
- Date/time collection via speech recognition
- Phone number and name capture
- Automatic duplicate detection
- Confirmation code generation (unique 6-character codes)
- Time slot availability checking
- Conflict prevention with unique constraint

**Business Hours Management**
- Configurable per client
- Time zone support
- Day-of-week scheduling (Monday-Friday default)
- Appointment duration settings (default 30 minutes)
- Buffer time between appointments

**Booking Sources**
- `voice_booking` - Rachel/Lina AI
- `online` - Web form
- `manual` - Admin entry
- `walk-in` - Physical arrival

**Appointment States**
- `confirmed` - Booked and confirmed
- `pending` - Awaiting confirmation
- `cancelled` - Cancelled by user/system
- `completed` - Appointment finished
- `no-show` - Customer didn't arrive

### 6.3 CRM Functionality

**Contact Management**
- Full CRUD operations
- Multi-tenant isolation by client_id
- Source tracking (manual, voice, SMS)
- Last contacted timestamp
- Status management (active, inactive, blocked)
- Automatic contact creation from voice calls
- Phone number deduplication

**Call History**
- Twilio webhook integration
- Call duration tracking (start to end time)
- Recording URL storage
- Direction tracking (incoming/outgoing)
- Status tracking (completed, missed, failed, busy)
- Cost tracking per call
- Caller name identification

**SMS Messaging**
- Two-way SMS support
- Message history with threading
- Delivery status tracking (queued, sent, delivered, failed)
- Error handling with error codes
- Cost tracking per message
- Twilio webhook integration for incoming SMS

### 6.4 Dashboard & Analytics

**Real-Time Dashboard**
- Today's statistics (contacts, appointments, messages, calls)
- Recent activity feeds
- Call statistics:
  - Total calls
  - Incoming vs. outgoing
  - Missed calls
  - Average duration
- Credit balance display
- Low balance alerts
- Quick actions panel

**PWA Support**
- Progressive Web App capabilities
- Service worker for offline support
- Installable to home screen
- Responsive mobile design
- Push notification ready (configured but not active)

---

## 7. External Integrations

### 7.1 Twilio Integration

**Purpose:** Voice calls, SMS, phone number management

**Configuration:**
```javascript
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_MESSAGING_SERVICE_SID=MG...
```

**Webhooks:**
- **Voice:** `/voice/rachel/` - Incoming call handler
- **SMS:** `/webhook/twilio/sms` - Incoming message handler
- **Status:** `/webhook/twilio/status` - Call status updates

**Features Used:**
- Voice API (calls, TwiML generation)
- Messaging API (SMS send/receive)
- Phone Numbers API (provisioning, configuration)
- Speech Recognition (`<Gather>` with input="speech")
- DTMF Input (`<Gather>` with input="dtmf")
- Call Recording
- Voice status callbacks

**Implementation:** [twilioNumberService.js](src/services/twilioNumberService.js)

### 7.2 ElevenLabs Integration

**Purpose:** Premium text-to-speech for natural voice AI

**Configuration:**
```javascript
ELEVENLABS_API_KEY=sk_...
```

**Voice Models:**
- **Rachel (English):** `21m00Tcm4TlvDq8ikWAM`
- **Lina (Spanish):** `ThT5KcBeYPX3keUQqHPh`
- **Model:** `eleven_monolingual_v1`
- **Settings:**
  - Stability: 0.5
  - Similarity boost: 0.75

**Audio Generation:**
- MP3 format
- Cached in `/public/audio/`
- Auto-cleanup of old files (>7 days)
- Fallback to Twilio TTS on failure
- Async generation with promise handling

**Implementation:** [elevenLabsService.js](src/services/elevenLabsService.js)

### 7.3 Stripe Integration

**Purpose:** Payment processing for credit reloads

**Configuration:**
```javascript
STRIPE_SECRET_KEY=sk_live_...
```

**Features:**
- Payment Intents API
- Webhook handling:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- Customer management
- Transaction metadata (client_id, amount)
- Automatic credit application

**Payment Flow:**
1. User requests credit reload
2. Create Stripe Payment Intent
3. Return client_secret to frontend
4. User completes payment
5. Webhook confirms payment
6. Credits added to account
7. Notification sent to user

**Implementation:** [credits.js:112-166](src/routes/credits.js#L112-L166)

### 7.4 SendGrid Integration

**Purpose:** Transactional emails

**Configuration:**
```javascript
SENDGRID_API_KEY=SG...
FROM_EMAIL=noreply@ringlypro.com
```

**Email Types:**
- Password reset emails
- Welcome emails (registration)
- Low balance notifications
- Appointment confirmations
- Zero balance alerts

**Implementation:** Email service wrapper in various route handlers

---

## 8. Security & Authentication

### 8.1 Password Security

**Hashing:**
- **Algorithm:** bcrypt
- **Salt Rounds:** 10
- **Storage:** `password_hash` field in users table

**Validation:**
- Minimum 6 characters
- Required during registration
- Rehashed on password change

**Reset Flow:**
1. User requests reset via email
2. Generate secure token (`crypto.randomBytes(32)`)
3. Store token + expiration (1 hour)
4. Send email with reset link
5. User clicks link, submits new password
6. Token validated and consumed
7. Password updated, token cleared

**Implementation:** [auth.js:312-419](src/routes/auth.js#L312-L419)

### 8.2 JWT Token Security

**Token Generation:**
```javascript
const token = jwt.sign(
  { userId: user.id, email: user.email, clientId: client.id },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
```

**Token Storage:**
- Client-side: localStorage
- Key: `authToken`
- Transmission: `Authorization: Bearer <token>` header

**Token Refresh:**
- Automatic refresh after 6 days
- Endpoint: `POST /api/auth/refresh-token`
- Returns new token with extended expiration

**Middleware Protection:**
```javascript
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};
```

**Implementation:** [auth.js:1-45](src/middleware/auth.js#L1-L45)

### 8.3 Multi-Tenant Security

**Tenant Isolation:**
- All queries filtered by `client_id`
- Automatic client identification via phone number
- Session-based client context
- Users can only access their own data

**Client Identification:**
```javascript
// Incoming call → identify client by Twilio number
const client = await Client.findOne({
  where: { ringlypro_number: req.body.To }
});

// Store in session for subsequent requests
req.session.clientId = client.id;
```

**Data Access Control:**
- Every CRM query includes `where: { client_id: req.user.clientId }`
- API routes validate user ownership before operations
- No cross-tenant data leakage

**Implementation:** [clientIdentificationService.js](src/services/clientIdentificationService.js)

### 8.4 API Security

**Rate Limiting:**
- express-rate-limit on authentication endpoints
- Prevents brute-force attacks
- Configurable limits (e.g., 5 requests per 15 minutes)

**Input Validation:**
- express-validator on all user inputs
- SQL injection prevention (Sequelize parameterized queries)
- XSS prevention (EJS auto-escaping)

**CORS Configuration:**
- Restricted to specific origins
- Credentials allowed for authenticated requests

**Session Security:**
- Secure cookies in production (HTTPS only)
- HTTP-only flags
- Session expiration (1 hour default)
- Secret stored in environment variable

---

## 9. Multi-Tenant Architecture

### Architecture Pattern

**Type:** Shared Database, Shared Schema with Tenant Isolation

```
┌──────────────────────────────────────────────────────────┐
│                    Single Database                        │
├──────────────────────────────────────────────────────────┤
│  User 1 (Client 1)  │  User 2 (Client 2)  │  User 3...   │
│  ─────────────────  │  ─────────────────  │              │
│  • Contacts (c1)    │  • Contacts (c2)    │              │
│  • Appointments     │  • Appointments     │              │
│  • Calls            │  • Calls            │              │
│  • Messages         │  • Messages         │              │
│                     │                     │              │
│  All data filtered by client_id                          │
└──────────────────────────────────────────────────────────┘
```

### Tenant Provisioning Flow

**Registration Process:**
1. User submits registration form
2. Create `users` record
3. Provision Twilio phone number
4. Create `clients` record with Twilio number
5. Create `credit_accounts` record (100 free minutes)
6. Configure Twilio webhook (point to `/voice/rachel/`)
7. Generate JWT token
8. Return success + redirect to dashboard

**Auto-Provisioning:** [twilioNumberService.js:92-151](src/services/twilioNumberService.js#L92-L151)

### Tenant Identification

**By Phone Number (Voice Calls):**
```javascript
const client = await Client.findOne({
  where: { ringlypro_number: req.body.To }
});
```

**By User Authentication (API):**
```javascript
// JWT contains clientId
const clientId = req.user.clientId;
```

**Session Storage:**
```javascript
req.session.clientId = client.id;
req.session.callerNumber = req.body.From;
```

### Data Isolation

**Query Filtering:**
```javascript
// All CRM queries include client_id
const contacts = await Contact.findAll({
  where: { client_id: req.user.clientId }
});

const appointments = await Appointment.findAll({
  where: {
    client_id: req.user.clientId,
    appointment_date: { [Op.gte]: new Date() }
  }
});
```

**Model Associations:**
```javascript
Client.hasMany(Contact, { foreignKey: 'client_id' });
Client.hasMany(Appointment, { foreignKey: 'client_id' });
Client.hasMany(Call, { foreignKey: 'client_id' });
Client.hasMany(Message, { foreignKey: 'client_id' });
```

**Implementation:** [index.js:479-584](src/models/index.js#L479-L584)

---

## 10. Voice AI System

### 10.1 Voice Flow State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    INCOMING CALL                             │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
           ┌────────────────────────┐
           │ Identify Client by To  │
           │ Store in session       │
           └────────┬───────────────┘
                    ▼
           ┌────────────────────────┐
           │ Bilingual Greeting     │
           │ Press 1 or 2           │
           └────────┬───────────────┘
                    ▼
         ┌──────────┴──────────┐
         ▼                     ▼
┌────────────────┐    ┌────────────────┐
│ English (1)    │    │ Spanish (2)    │
│ Rachel Voice   │    │ Lina Voice     │
└────────┬───────┘    └────────┬───────┘
         │                     │
         └──────────┬──────────┘
                    ▼
           ┌────────────────────────┐
           │ Custom Greeting        │
           │ "How can I help you?"  │
           └────────┬───────────────┘
                    ▼
           ┌────────────────────────┐
           │ Speech Recognition     │
           │ Intent Detection       │
           └────────┬───────────────┘
                    ▼
         ┌──────────┴──────────┐
         ▼                     ▼
┌────────────────┐    ┌────────────────┐
│ Book Appt      │    │ Other Intents  │
└────────┬───────┘    └────────────────┘
         ▼
┌────────────────────────┐
│ Collect Name           │
└────────┬───────────────┘
         ▼
┌────────────────────────┐
│ Collect Phone          │
└────────┬───────────────┘
         ▼
┌────────────────────────┐
│ Collect Date/Time      │
└────────┬───────────────┘
         ▼
┌────────────────────────┐
│ Check Availability     │
└────────┬───────────────┘
         ▼
┌────────────────────────┐
│ Create Appointment     │
│ Generate Code          │
└────────┬───────────────┘
         ▼
┌────────────────────────┐
│ Confirm + Hangup       │
└────────────────────────┘
```

### 10.2 TwiML Generation

**Example: Language Selection**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1"
          action="/voice/rachel/select-language"
          method="POST">
    <Play>https://aiagent.ringlypro.com/audio/greeting.mp3</Play>
  </Gather>
  <Say>We didn't receive your selection. Please call back.</Say>
</Response>
```

**Example: Speech Collection**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech"
          action="/voice/rachel/process-speech"
          method="POST"
          speechTimeout="auto"
          language="en-US">
    <Play>https://aiagent.ringlypro.com/audio/how-can-i-help.mp3</Play>
  </Gather>
</Response>
```

**Implementation:** [rachelRoutes.js](src/routes/rachelRoutes.js), [linaRoutes.js](src/routes/linaRoutes.js)

### 10.3 Intent Recognition

**Booking Intent Keywords:**
```javascript
const bookingKeywords = [
  'book', 'schedule', 'appointment', 'reservation',
  'reserva', 'cita', 'agendar'  // Spanish
];
```

**Pricing Intent Keywords:**
```javascript
const pricingKeywords = [
  'cost', 'price', 'charge', 'fee', 'how much',
  'precio', 'costo', 'cuánto'  // Spanish
];
```

**Intent Detection Logic:**
```javascript
const speechResult = req.body.SpeechResult?.toLowerCase();

if (bookingKeywords.some(keyword => speechResult.includes(keyword))) {
  // Route to booking flow
  return res.send(generateBookingTwiML());
}

if (pricingKeywords.some(keyword => speechResult.includes(keyword))) {
  // Provide pricing information
  return res.send(generatePricingTwiML());
}

// Default: general support
return res.send(generateSupportTwiML());
```

**Implementation:** [rachelVoiceService.js:87-145](src/services/rachelVoiceService.js#L87-L145)

### 10.4 Audio Caching Strategy

**Cache Location:** `/public/audio/`

**Naming Convention:**
```javascript
const filename = `${clientId}-${Date.now()}-${hash}.mp3`;
```

**Auto-Cleanup:**
```javascript
// Delete audio files older than 7 days
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
fs.readdirSync(audioDir).forEach(file => {
  const filePath = path.join(audioDir, file);
  const stats = fs.statSync(filePath);
  if (Date.now() - stats.mtimeMs > SEVEN_DAYS) {
    fs.unlinkSync(filePath);
  }
});
```

**Fallback Strategy:**
1. Try ElevenLabs TTS
2. If fails, log error
3. Use Twilio `<Say>` tag as fallback
4. Return TwiML with fallback voice

---

## 11. Billing & Credits

### 11.1 Credit System Architecture

**Hybrid Model:**
- 100 free minutes per month (configurable per client)
- $0.10 per minute for paid usage (configurable per client)
- Monthly reset on the 1st of each month
- Automatic balance deduction
- Low balance notifications

### 11.2 Usage Tracking

**Per-Call Billing:**
```javascript
const calculateCallCost = (durationSeconds, client, creditAccount) => {
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const freeMinutesRemaining = client.monthly_free_minutes - creditAccount.free_minutes_used;

  let freeMinutesUsed = 0;
  let paidMinutesUsed = 0;
  let cost = 0;

  if (freeMinutesRemaining > 0) {
    freeMinutesUsed = Math.min(durationMinutes, freeMinutesRemaining);
    paidMinutesUsed = durationMinutes - freeMinutesUsed;
  } else {
    paidMinutesUsed = durationMinutes;
  }

  cost = paidMinutesUsed * client.per_minute_rate;

  return { freeMinutesUsed, paidMinutesUsed, cost };
};
```

**Implementation:** [creditSystem.js:154-223](src/services/creditSystem.js#L154-L223)

### 11.3 Monthly Reset

**Reset Logic:**
```javascript
const checkAndResetMonthlyMinutes = async (creditAccount) => {
  const now = new Date();
  const resetDate = creditAccount.free_minutes_reset_date;

  if (now > resetDate) {
    const nextResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await creditAccount.update({
      free_minutes_used: 0,
      free_minutes_reset_date: nextResetDate,
      low_balance_notified: false
    });
  }
};
```

**Implementation:** [creditSystem.js:225-247](src/services/creditSystem.js#L225-L247)

### 11.4 Balance Notifications

**Low Balance Threshold:** $1.00

**Zero Balance Behavior:**
- Rachel AI disabled automatically
- Calls not blocked (user must manually disable forwarding)
- Dashboard shows warning banner

**Notification Triggers:**
```javascript
if (newBalance < 1.00 && !creditAccount.low_balance_notified) {
  await sendLowBalanceEmail(client);
  await creditAccount.update({ low_balance_notified: true });
}

if (newBalance <= 0) {
  await client.update({ rachel_enabled: false });
  await sendZeroBalanceEmail(client);
}
```

**Implementation:** [creditSystem.js:303-367](src/services/creditSystem.js#L303-L367)

### 11.5 Payment Processing

**Credit Reload Flow:**
1. User clicks "Add Credits"
2. Frontend calls `POST /api/credits/reload` with amount
3. Backend creates Stripe Payment Intent
4. Returns `client_secret` to frontend
5. Frontend displays Stripe payment form
6. User completes payment
7. Stripe sends webhook to `/api/credits/webhook/stripe`
8. Backend verifies webhook signature
9. Credits added to account
10. Success notification sent

**Webhook Handling:**
```javascript
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

if (event.type === 'payment_intent.succeeded') {
  const paymentIntent = event.data.object;
  const clientId = paymentIntent.metadata.client_id;
  const amount = paymentIntent.amount / 100;  // Convert cents to dollars

  await addCredits(clientId, amount);
  await sendPaymentConfirmationEmail(clientId, amount);
}
```

**Implementation:** [credits.js:112-166](src/routes/credits.js#L112-L166)

---

## 12. Deployment Architecture

### 12.1 Production Environment

**Platform:** Render.com
**URL:** https://aiagent.ringlypro.com
**Region:** US-East (configurable)

**Build Configuration:**
```yaml
# render.yaml
services:
  - type: web
    name: ringlypro-crm
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: ringlypro-db
          property: connectionString
```

### 12.2 Database

**Provider:** Render PostgreSQL
**Version:** PostgreSQL 15+
**Connection:** SSL required
**Backups:** Automated daily backups

**Connection Pooling:**
```javascript
{
  max: 10,
  min: 0,
  acquire: 30000,
  idle: 10000
}
```

### 12.3 Environment Variables

**Required Variables:**
```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/ringlypro_crm

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_MESSAGING_SERVICE_SID=MG...

# ElevenLabs
ELEVENLABS_API_KEY=sk_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...

# SendGrid
SENDGRID_API_KEY=SG...
FROM_EMAIL=noreply@ringlypro.com

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secure-random-secret-minimum-32-chars
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com
FRONTEND_URL=https://aiagent.ringlypro.com
SESSION_SECRET=your-session-secret
```

### 12.4 Monitoring & Health Checks

**Health Endpoint:**
```javascript
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});
```

**Status Endpoint:**
```javascript
app.get('/api/status', async (req, res) => {
  const stats = {
    users: await User.count(),
    clients: await Client.count(),
    contacts: await Contact.count(),
    appointments: await Appointment.count(),
    calls: await Call.count(),
    messages: await Message.count()
  };
  res.json({ status: 'ok', stats });
});
```

### 12.5 Graceful Shutdown

**Implementation:**
```javascript
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log('HTTP server closed');
  });

  await sequelize.close();
  console.log('Database connections closed');

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**File:** [server.js:46-74](src/server.js#L46-L74)

---

## 13. Data Flows

### 13.1 Voice Appointment Booking Flow

```
┌─────────────┐
│ Customer    │ Dials Twilio number
│ Phone Call  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Twilio                                                   │
│ • Receives call                                          │
│ • POST to /voice/rachel/                                │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server                                         │
│ 1. Identify client by To number                         │
│ 2. Store clientId in session                            │
│ 3. Generate bilingual greeting TwiML                    │
│ 4. Play ElevenLabs audio (language selection)           │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Customer                                                 │
│ • Presses 1 (English) or 2 (Spanish)                    │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server (/voice/rachel/select-language)        │
│ 1. Store language in session                            │
│ 2. Play custom greeting for client                      │
│ 3. Ask "How can I help you?"                            │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Customer                                                 │
│ • Speaks: "I need to book an appointment"               │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Twilio Speech Recognition                                │
│ • Converts speech to text                               │
│ • POST SpeechResult to /voice/rachel/process-speech     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server (/voice/rachel/process-speech)         │
│ 1. Detect booking intent from keywords                  │
│ 2. Ask for customer name                                │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Customer                                                 │
│ • Speaks: "John Smith"                                  │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server (/voice/rachel/collect-name)           │
│ 1. Store name in session                                │
│ 2. Ask for phone number                                 │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Customer                                                 │
│ • Speaks: "555-1234"                                    │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server (/voice/rachel/collect-phone)          │
│ 1. Store phone in session                               │
│ 2. Ask for preferred date/time                          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Customer                                                 │
│ • Speaks: "Tomorrow at 2pm"                             │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ RinglyPro Server (/voice/rachel/book-appointment)       │
│ 1. Parse date/time from speech                          │
│ 2. Check availability in database                       │
│ 3. Generate unique confirmation code                    │
│ 4. Create Appointment record                            │
│ 5. Create/update Contact record                         │
│ 6. Play confirmation with code                          │
│ 7. Create Call record                                   │
│ 8. Calculate and deduct credits                         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Database Updates                                         │
│ • appointments: New record created                      │
│ • contacts: Created or updated                          │
│ • calls: Call logged with duration                      │
│ • credit_accounts: Balance deducted                     │
└─────────────────────────────────────────────────────────┘
```

### 13.2 User Registration Flow

```
┌─────────────┐
│ User visits │
│ /signup     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Signup Form                                              │
│ • Email, password                                        │
│ • Business name, phone                                   │
│ • Business type                                          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼ POST /api/auth/register
┌─────────────────────────────────────────────────────────┐
│ Server: Validate Input                                   │
│ • Check email uniqueness                                │
│ • Validate password strength                            │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Database: Create User Record                            │
│ • Hash password with bcrypt                             │
│ • Store user info                                       │
│ • Set free_trial_minutes = 100                          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Twilio: Provision Phone Number                          │
│ • twilioNumberService.assignNumberToClient()            │
│ • Search available numbers with voice capability        │
│ • Purchase number                                       │
│ • Configure webhook: /voice/rachel/                     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Database: Create Client Record                          │
│ • Link to user.id                                       │
│ • Store ringlypro_number (Twilio number)                │
│ • Set rachel_enabled = true                             │
│ • Set monthly_free_minutes = 100                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Database: Create CreditAccount Record                   │
│ • Link to client.id                                     │
│ • Set balance = 0.00                                    │
│ • Set free_minutes_used = 0                             │
│ • Set free_minutes_reset_date = next month 1st          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Server: Generate JWT Token                              │
│ • Payload: { userId, email, clientId }                  │
│ • Expiration: 7 days                                    │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Response to Client                                       │
│ • Return: { token, user, client }                       │
│ • Client stores token in localStorage                   │
│ • Redirect to /dashboard                                │
└─────────────────────────────────────────────────────────┘
```

### 13.3 Credit Deduction Flow (Post-Call)

```
┌─────────────┐
│ Call Ends   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Twilio                                                   │
│ • POST to /webhook/twilio/status                        │
│ • Payload: CallSid, Duration, Status                    │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Server: Retrieve Call Data                              │
│ • Find Call by twilio_call_sid                          │
│ • Get associated Client                                 │
│ • Get CreditAccount                                     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Check Monthly Reset                                      │
│ • If past reset date, reset free_minutes_used to 0     │
│ • Update free_minutes_reset_date to next month         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Calculate Billable Minutes                              │
│ • durationMinutes = Math.ceil(durationSeconds / 60)     │
│ • freeRemaining = 100 - free_minutes_used               │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Determine Free vs. Paid Split                           │
│ • If freeRemaining > 0:                                 │
│   - freeUsed = min(duration, freeRemaining)             │
│   - paidUsed = duration - freeUsed                      │
│ • Else:                                                 │
│   - freeUsed = 0                                        │
│   - paidUsed = duration                                 │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Calculate Cost                                           │
│ • cost = paidUsed * client.per_minute_rate              │
│ • Default: paidUsed * $0.10                             │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Update CreditAccount                                     │
│ • free_minutes_used += freeUsed                         │
│ • balance -= cost                                       │
│ • total_minutes_used += duration                        │
│ • total_amount_spent += cost                            │
│ • last_usage_date = now                                 │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Check Balance Thresholds                                 │
│ • If balance < $1.00 AND not notified:                  │
│   - Send low balance email                              │
│   - Set low_balance_notified = true                     │
│ • If balance <= 0:                                      │
│   - Disable Rachel AI (rachel_enabled = false)          │
│   - Send zero balance email                             │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Update Call Record                                       │
│ • Set cost = calculated cost                            │
│ • Set duration = durationSeconds                        │
│ • Set end_time = now                                    │
│ • Set status = 'completed'                              │
└─────────────────────────────────────────────────────────┘
```

---

## 14. Configuration

### 14.1 Business Hours Configuration

**Default Settings:**
```javascript
{
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],  // Monday-Friday
  timezone: 'America/New_York',
  appointmentDuration: 30  // minutes
}
```

**Time Slot Generation:**
```javascript
const generateTimeSlots = (start, end, duration) => {
  const slots = [];
  let current = moment(start, 'HH:mm');
  const endTime = moment(end, 'HH:mm');

  while (current.isBefore(endTime)) {
    slots.push(current.format('HH:mm'));
    current.add(duration, 'minutes');
  }

  return slots;
};
```

**Implementation:** [businessHours.js](src/config/businessHours.js)

### 14.2 Database Configuration

**Connection:**
```javascript
{
  dialect: 'postgres',
  protocol: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false
}
```

**Implementation:** [database.js](src/config/database.js)

### 14.3 Session Configuration

**Express Session:**
```javascript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000  // 1 hour
  }
}));
```

### 14.4 Twilio Configuration

**Voice Webhook:**
```javascript
{
  url: 'https://aiagent.ringlypro.com/voice/rachel/',
  method: 'POST',
  statusCallback: 'https://aiagent.ringlypro.com/webhook/twilio/status',
  statusCallbackMethod: 'POST'
}
```

**SMS Webhook:**
```javascript
{
  url: 'https://aiagent.ringlypro.com/webhook/twilio/sms',
  method: 'POST'
}
```

---

## Appendix

### A. Key File Locations

| Component | File Path | Lines of Code |
|-----------|-----------|---------------|
| Main App | [src/app.js](src/app.js) | 440 |
| Server | [src/server.js](src/server.js) | 107 |
| Models Index | [src/models/index.js](src/models/index.js) | 584 |
| Auth Routes | [src/routes/auth.js](src/routes/auth.js) | 667 |
| Rachel Routes | [src/routes/rachelRoutes.js](src/routes/rachelRoutes.js) | 497 |
| Lina Routes | [src/routes/linaRoutes.js](src/routes/linaRoutes.js) | 370 |
| Appointments | [src/routes/appointments.js](src/routes/appointments.js) | 689 |
| Credit System | [src/services/creditSystem.js](src/services/creditSystem.js) | 651 |
| Rachel Service | [src/services/rachelVoiceService.js](src/services/rachelVoiceService.js) | 417 |
| Lina Service | [src/services/linaVoiceService.js](src/services/linaVoiceService.js) | 328 |
| Appointment Service | [src/services/appointmentService.js](src/services/appointmentService.js) | 414 |
| ElevenLabs Service | [src/services/elevenLabsService.js](src/services/elevenLabsService.js) | 116 |
| Client Auth Library | [public/js/auth.js](public/js/auth.js) | 350+ |
| Dashboard View | [views/dashboard.ejs](views/dashboard.ejs) | 90,914 bytes |

### B. External Resources

- **Twilio Documentation:** https://www.twilio.com/docs
- **ElevenLabs API:** https://elevenlabs.io/docs
- **Stripe API:** https://stripe.com/docs/api
- **Sequelize ORM:** https://sequelize.org/docs
- **Express.js:** https://expressjs.com

### C. Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | Oct 2025 | Complete bilingual system, credit system, PWA |
| 1.5.0 | Sep 2025 | Spanish voice (Lina) added |
| 1.0.0 | Aug 2025 | Initial production release |

---

**Document Author:** RinglyPro Team
**Contact:** support@ringlypro.com
**License:** Proprietary
**Last Review:** October 2025
