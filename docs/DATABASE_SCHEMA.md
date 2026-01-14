# RinglyPro CRM Database Schema

## Database: `ringlypro_crm_production`

This document describes all database tables, their columns, and relationships in the RinglyPro CRM system.

---

## Table of Contents

1. [Entity Relationship Diagram](#entity-relationship-diagram)
2. [Core Tables](#core-tables)
   - [users](#users)
   - [clients](#clients)
   - [contacts](#contacts)
3. [Communication Tables](#communication-tables)
   - [messages](#messages)
   - [calls](#calls)
   - [appointments](#appointments)
4. [Billing Tables](#billing-tables)
   - [credit_accounts](#credit_accounts)
5. [Admin Tables](#admin-tables)
   - [admin_communications](#admin_communications)
   - [admin_notes](#admin_notes)
6. [Integration Tables](#integration-tables)
   - [google_calendar_integrations](#google_calendar_integrations)
   - [ghl_integrations](#ghl_integrations)
7. [Project Tracker Tables](#project-tracker-tables)
   - [projects](#projects)
   - [project_milestones](#project_milestones)
   - [project_messages](#project_messages)

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              RINGLYPRO CRM DATABASE SCHEMA                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌──────────────┐
                                    │    USERS     │
                                    │──────────────│
                                    │ id (PK)      │
                                    │ email        │
                                    │ password_hash│
                                    │ first_name   │
                                    │ last_name    │
                                    │ is_admin     │
                                    │ ...          │
                                    └──────┬───────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │ 1:1                  │ 1:N                  │ 1:N
                    ▼                      ▼                      ▼
           ┌──────────────┐      ┌──────────────────┐    ┌──────────────────┐
           │   CLIENTS    │      │    PROJECTS      │    │ PROJECT_MESSAGES │
           │──────────────│      │──────────────────│    │──────────────────│
           │ id (PK)      │      │ id (PK)          │    │ id (PK)          │
           │ user_id (FK) │◄─────│ user_id (FK)     │    │ user_id (FK)     │
           │ business_name│      │ created_by_admin │    │ milestone_id(FK) │
           │ ringlypro_num│      │ title            │    │ message          │
           │ rachel_enabled│     │ status           │    │ is_admin         │
           │ ...          │      │ ...              │    │ ...              │
           └──────┬───────┘      └────────┬─────────┘    └──────────────────┘
                  │                       │                       ▲
    ┌─────────────┼─────────────┐         │ 1:N                   │
    │             │             │         ▼                       │
    │ 1:1         │ 1:N         │ 1:N  ┌──────────────────┐       │
    ▼             ▼             ▼      │PROJECT_MILESTONES│       │
┌────────────┐ ┌────────────┐ ┌──────┐ │──────────────────│       │
│  CREDIT_   │ │  CONTACTS  │ │ADMIN_│ │ id (PK)          │       │
│  ACCOUNTS  │ │────────────│ │NOTES │ │ project_id (FK)  │───────┘
│────────────│ │ id (PK)    │ │──────│ │ title            │  1:N
│ id (PK)    │ │ client_id  │ │id(PK)│ │ status           │
│ client_id  │ │ firstName  │ │...   │ │ ...              │
│ balance    │ │ phone      │ └──────┘ └──────────────────┘
│ ...        │ │ email      │
└────────────┘ │ ...        │
               └─────┬──────┘
                     │
        ┌────────────┼────────────┐
        │ 1:N        │ 1:N        │ 1:N
        ▼            ▼            ▼
┌────────────┐ ┌────────────┐ ┌──────────────┐
│  MESSAGES  │ │   CALLS    │ │ APPOINTMENTS │
│────────────│ │────────────│ │──────────────│
│ id (PK)    │ │ id (PK)    │ │ id (PK)      │
│ client_id  │ │ client_id  │ │ client_id    │
│ contact_id │ │ contact_id │ │ contact_id   │
│ direction  │ │ direction  │ │ customer_name│
│ body       │ │ duration   │ │ appt_date    │
│ status     │ │ status     │ │ appt_time    │
│ ...        │ │ ...        │ │ status       │
└────────────┘ └────────────┘ │ source       │
                              │ ...          │
                              └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTEGRATION TABLES                                 │
├─────────────────────────────────┬───────────────────────────────────────────┤
│                                 │                                           │
│  ┌──────────────────────────┐   │   ┌──────────────────────────┐            │
│  │GOOGLE_CALENDAR_INTEGRATIONS  │   │   GHL_INTEGRATIONS       │            │
│  │──────────────────────────│   │   │──────────────────────────│            │
│  │ id (PK)                  │   │   │ id (PK)                  │            │
│  │ client_id (FK) ──────────┼───┼───│ client_id (FK) ──────────┼──► CLIENTS │
│  │ google_email             │   │   │ user_id (FK) ────────────┼──► USERS   │
│  │ access_token             │   │   │ ghl_location_id          │            │
│  │ refresh_token            │   │   │ access_token             │            │
│  │ ...                      │   │   │ refresh_token            │            │
│  └──────────────────────────┘   │   │ ...                      │            │
│                                 │   └──────────────────────────┘            │
└─────────────────────────────────┴───────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      ADMIN COMMUNICATION TABLES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────┐                                               │
│  │  ADMIN_COMMUNICATIONS    │                                               │
│  │──────────────────────────│                                               │
│  │ id (PK)                  │                                               │
│  │ admin_user_id (FK) ──────┼──► USERS (admin)                              │
│  │ client_id (FK) ──────────┼──► CLIENTS                                    │
│  │ communication_type       │                                               │
│  │ message                  │                                               │
│  │ ...                      │                                               │
│  └──────────────────────────┘                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Tables

### users

Authentication and user account table.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `email` | VARCHAR(255) | NO | Unique email address |
| `password_hash` | VARCHAR(255) | NO | Bcrypt hashed password |
| `first_name` | VARCHAR(100) | YES | User's first name |
| `last_name` | VARCHAR(100) | YES | User's last name |
| `business_name` | VARCHAR(255) | YES | Business name |
| `business_phone` | VARCHAR(20) | YES | Business phone number |
| `business_type` | VARCHAR(100) | YES | Type of business (healthcare, legal, etc.) |
| `website_url` | VARCHAR(500) | YES | Business website URL |
| `phone_number` | VARCHAR(20) | YES | Personal phone number |
| `business_description` | TEXT | YES | Business description |
| `business_hours` | JSONB | YES | Business hours configuration |
| `services` | TEXT | YES | Services offered |
| `terms_accepted` | BOOLEAN | NO | Terms and conditions accepted |
| `free_trial_minutes` | INTEGER | NO | Free trial minutes (default: 100) |
| `onboarding_completed` | BOOLEAN | NO | Onboarding status |
| `email_verified` | BOOLEAN | NO | Email verification status |
| `email_verification_token` | VARCHAR(255) | YES | Email verification token |
| `is_admin` | BOOLEAN | NO | Admin user flag |
| `admin_phone` | VARCHAR(20) | YES | Admin phone for notifications |
| `tokens_balance` | INTEGER | YES | Current token balance |
| `tokens_used_this_month` | INTEGER | YES | Tokens used this billing cycle |
| `token_package` | VARCHAR(50) | YES | Subscription package (free, starter, etc.) |
| `tokens_rollover` | INTEGER | YES | Rollover tokens from previous month |
| `billing_cycle_start` | DATE | YES | Start of billing cycle |
| `last_token_reset` | DATE | YES | Last token reset date |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `email` (unique), `business_type`, `onboarding_completed`, `is_admin`

---

### clients

Multi-tenant client configuration table. Each client has dedicated Twilio number and settings.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `user_id` | INTEGER | YES | FK to users table |
| `business_name` | VARCHAR(255) | NO | Business name |
| `business_phone` | VARCHAR(20) | NO | Original business phone (unique) |
| `ringlypro_number` | VARCHAR(20) | NO | Dedicated Twilio number (unique) |
| `twilio_number_sid` | VARCHAR(50) | YES | Twilio number SID (PN...) |
| `forwarding_status` | VARCHAR(20) | NO | Status: pending, active, inactive |
| `owner_name` | VARCHAR(255) | NO | Business owner name |
| `owner_phone` | VARCHAR(20) | NO | Owner phone number |
| `owner_email` | VARCHAR(255) | NO | Owner email |
| `website_url` | VARCHAR(500) | YES | Business website URL |
| `custom_greeting` | TEXT | NO | Rachel AI greeting message |
| `outbound_voicemail_message` | TEXT | YES | Custom voicemail message |
| `outbound_voicemail_audio_url` | TEXT | YES | ElevenLabs audio URL for voicemail |
| `business_hours_start` | TIME | NO | Business hours start (default: 09:00) |
| `business_hours_end` | TIME | NO | Business hours end (default: 17:00) |
| `business_days` | VARCHAR(20) | NO | Business days (default: Mon-Fri) |
| `timezone` | VARCHAR(50) | NO | Timezone (default: America/New_York) |
| `appointment_duration` | INTEGER | NO | Default appointment duration (default: 30) |
| `booking_enabled` | BOOLEAN | NO | Booking enabled flag |
| `calendar_settings` | JSON | YES | Per-day calendar configuration |
| `hubspot_api_key` | VARCHAR(255) | YES | HubSpot API key |
| `hubspot_meeting_slug` | VARCHAR(100) | YES | HubSpot meeting slug |
| `hubspot_timezone` | VARCHAR(50) | YES | HubSpot timezone override |
| `booking_system` | VARCHAR(20) | YES | Active booking system (ghl, hubspot) |
| `settings` | JSONB | YES | Extended settings JSON |
| `sms_notifications` | BOOLEAN | NO | SMS notifications enabled |
| `ivr_enabled` | BOOLEAN | NO | IVR call transfer enabled |
| `ivr_options` | JSON | YES | IVR department options |
| `monthly_free_minutes` | INTEGER | NO | Monthly free minutes (default: 100) |
| `per_minute_rate` | DECIMAL(10,3) | NO | Per minute rate (default: 0.100) |
| `rachel_enabled` | BOOLEAN | NO | **Rachel AI enabled flag** |
| `referral_code` | VARCHAR(10) | YES | Unique referral code |
| `referred_by` | INTEGER | YES | FK to clients (referrer) |
| `active` | BOOLEAN | NO | Account active status |
| `deposit_required` | BOOLEAN | NO | Deposit requirement flag |
| `deposit_amount` | DECIMAL(10,2) | YES | Default deposit amount |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `business_phone` (unique), `ringlypro_number` (unique), `twilio_number_sid`, `user_id`

**Relationships:**
- `user_id` → `users.id` (1:1)
- `referred_by` → `clients.id` (self-referential)

---

### contacts

CRM contacts for each client.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table |
| `first_name` | VARCHAR(50) | NO | Contact first name |
| `last_name` | VARCHAR(50) | NO | Contact last name |
| `phone` | VARCHAR | NO | Phone number (unique) |
| `email` | VARCHAR | NO | Email address (unique) |
| `notes` | TEXT | YES | Contact notes |
| `status` | ENUM | NO | Status: active, inactive, blocked |
| `source` | VARCHAR | NO | Source: manual, voice_call, sms, ghl_sync |
| `last_contacted_at` | TIMESTAMP | YES | Last contact timestamp |
| `ghl_contact_id` | VARCHAR | YES | GoHighLevel contact ID |
| `ghl_synced_at` | TIMESTAMP | YES | Last GHL sync time |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id`, `phone`, `email`, `firstName + lastName`, `createdAt`

**Relationships:**
- `client_id` → `clients.id` (N:1)

---

## Communication Tables

### messages

SMS and voice message history.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table |
| `contact_id` | INTEGER | YES | FK to contacts table |
| `twilio_sid` | VARCHAR | YES | Twilio message SID (unique) |
| `recording_url` | VARCHAR | YES | Twilio recording URL |
| `direction` | ENUM | NO | Direction: incoming, outgoing |
| `from_number` | VARCHAR | NO | From phone number |
| `to_number` | VARCHAR | NO | To phone number |
| `body` | TEXT | NO | Message body (max 1600 chars) |
| `status` | ENUM | NO | Status: queued, sent, received, delivered, failed, undelivered |
| `error_code` | VARCHAR | YES | Error code if failed |
| `error_message` | TEXT | YES | Error message if failed |
| `cost` | DECIMAL(10,4) | YES | Message cost in USD |
| `sent_at` | TIMESTAMP | YES | Send timestamp |
| `delivered_at` | TIMESTAMP | YES | Delivery timestamp |
| `read` | BOOLEAN | NO | Read status flag |
| `ghl_message_id` | VARCHAR | YES | GHL message ID |
| `ghl_conversation_id` | VARCHAR | YES | GHL conversation ID |
| `ghl_contact_id` | VARCHAR | YES | GHL contact ID |
| `synced_to_ghl` | BOOLEAN | NO | Synced to GHL flag |
| `synced_from_ghl` | BOOLEAN | NO | Synced from GHL flag |
| `ghl_synced_at` | TIMESTAMP | YES | Last GHL sync time |
| `message_source` | ENUM | NO | Source: twilio, ghl, whatsapp, manual, **elevenlabs** |
| `message_type` | ENUM | NO | Type: sms, email, call, voicemail, whatsapp, note |
| `call_duration` | INTEGER | YES | Duration in seconds (for calls) |
| `call_start_time` | TIMESTAMP | YES | Call start time |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id`, `contact_id`, `twilio_sid`, `direction`, `from_number`, `to_number`, `created_at`, `status`

**Relationships:**
- `client_id` → `clients.id` (N:1)
- `contact_id` → `contacts.id` (N:1)

---

### calls

Call history and tracking.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table |
| `contact_id` | INTEGER | YES | FK to contacts table |
| `twilio_call_sid` | VARCHAR | YES | Twilio call SID (unique) |
| `direction` | ENUM | NO | Direction: incoming, outgoing |
| `from_number` | VARCHAR | NO | From phone number |
| `to_number` | VARCHAR | NO | To phone number |
| `status` | ENUM | NO | Twilio status: queued, ringing, in-progress, completed, busy, failed, no-answer, canceled |
| `call_status` | ENUM | NO | App status: initiated, ringing, answered, completed, missed, failed, busy, no-answer |
| `duration` | INTEGER | YES | Call duration in seconds |
| `recording_url` | VARCHAR | YES | Recording URL if available |
| `cost` | DECIMAL(10,4) | YES | Call cost in USD |
| `start_time` | TIMESTAMP | YES | Call start time |
| `end_time` | TIMESTAMP | YES | Call end time |
| `answered_by` | VARCHAR | YES | Human or machine |
| `hangup_cause` | VARCHAR | YES | Reason for ending |
| `caller_name` | VARCHAR | YES | Caller ID name |
| `notes` | TEXT | YES | Call notes |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `contact_id`, `twilio_call_sid`, `direction`, `from_number`, `to_number`, `created_at`, `status`, `call_status`

**Relationships:**
- `client_id` → `clients.id` (N:1)
- `contact_id` → `contacts.id` (N:1)

---

### appointments

Appointment booking system (supports voice booking, GHL, HubSpot, Vagaro, Google Calendar).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table |
| `contact_id` | INTEGER | YES | FK to contacts table |
| `customer_name` | VARCHAR(100) | NO | Customer name |
| `customer_phone` | VARCHAR | NO | Customer phone |
| `customer_email` | VARCHAR | YES | Customer email |
| `appointment_date` | DATE | NO | Appointment date (YYYY-MM-DD) |
| `appointment_time` | TIME | NO | Appointment time (HH:MM:SS) |
| `duration` | INTEGER | YES | Duration in minutes (default: 30) |
| `purpose` | TEXT | YES | Purpose of appointment |
| `status` | VARCHAR | NO | Status: confirmed, pending, cancelled, completed, no-show, scheduled |
| `confirmation_code` | VARCHAR(20) | NO | Unique confirmation code |
| `source` | VARCHAR | NO | Source: voice_booking, voice_booking_spanish, online, manual, walk-in, ghl_sync, hubspot_sync, vagaro_sync, whatsapp, whatsapp_ghl, whatsapp_vagaro, whatsapp_hubspot |
| `ghl_appointment_id` | VARCHAR | YES | GHL appointment ID |
| `ghl_contact_id` | VARCHAR | YES | GHL contact ID |
| `ghl_calendar_id` | VARCHAR | YES | GHL calendar ID |
| `ghl_synced_at` | TIMESTAMP | YES | GHL sync time |
| `hubspot_meeting_id` | VARCHAR | YES | HubSpot meeting ID |
| `hubspot_contact_id` | VARCHAR | YES | HubSpot contact ID |
| `vagaro_appointment_id` | VARCHAR | YES | Vagaro appointment ID |
| `vagaro_contact_id` | VARCHAR | YES | Vagaro customer ID |
| `google_event_id` | VARCHAR | YES | Google Calendar event ID |
| `zoho_event_id` | VARCHAR | YES | Zoho CRM event ID |
| `crm_last_synced_at` | TIMESTAMP | YES | Last CRM sync time |
| `deposit_status` | VARCHAR(20) | NO | Deposit status: not_required, pending, confirmed |
| `deposit_confirmed_at` | TIMESTAMP | YES | Deposit confirmation time |
| `deposit_confirmation_method` | VARCHAR(50) | YES | Confirmation method: manual, zelle, email |
| `deposit_notes` | TEXT | YES | Deposit notes |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `contact_id`, `customer_phone`, `appointment_date`, `appointment_time`, `status`, `source`, `confirmation_code`, `client_id + appointment_date + appointment_time` (unique)

**Relationships:**
- `client_id` → `clients.id` (N:1)
- `contact_id` → `contacts.id` (N:1)

---

## Billing Tables

### credit_accounts

Client billing and usage tracking.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table (unique) |
| `balance` | DECIMAL(10,2) | NO | Account balance (default: 0.00) |
| `free_minutes_used` | INTEGER | NO | Free minutes used this cycle |
| `free_minutes_reset_date` | DATE | NO | Free minutes reset date |
| `total_minutes_used` | INTEGER | NO | Total minutes used all time |
| `total_amount_spent` | DECIMAL(10,2) | NO | Total amount spent |
| `last_usage_date` | TIMESTAMP | YES | Last usage timestamp |
| `low_balance_notified` | BOOLEAN | NO | Low balance notification sent |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id` (unique)

**Relationships:**
- `client_id` → `clients.id` (1:1)

---

## Admin Tables

### admin_communications

Admin-to-client communication log.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `admin_user_id` | INTEGER | NO | FK to users table (admin) |
| `client_id` | INTEGER | NO | FK to clients table |
| `communication_type` | VARCHAR(20) | NO | Type: sms, note, call |
| `message` | TEXT | YES | Communication content |
| `phone_number` | VARCHAR(20) | YES | Phone number used |
| `twilio_sid` | VARCHAR(50) | YES | Twilio SID |
| `direction` | VARCHAR(10) | YES | Direction: inbound, outbound |
| `status` | VARCHAR(20) | YES | Status: sent, delivered, failed, received |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `admin_user_id`, `client_id`, `phone_number`, `created_at`

**Relationships:**
- `admin_user_id` → `users.id` (N:1)
- `client_id` → `clients.id` (N:1)

---

### admin_notes

Internal admin notes about clients.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `admin_user_id` | INTEGER | NO | FK to users table (admin) |
| `client_id` | INTEGER | NO | FK to clients table |
| `note` | TEXT | NO | Note content |
| `note_type` | VARCHAR(20) | NO | Type: general, technical, billing, support |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id`, `admin_user_id`, `created_at`

**Relationships:**
- `admin_user_id` → `users.id` (N:1)
- `client_id` → `clients.id` (N:1)

---

## Integration Tables

### google_calendar_integrations

Google Calendar OAuth tokens and settings.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table (unique) |
| `google_email` | VARCHAR | NO | Google account email |
| `access_token` | TEXT | NO | OAuth access token |
| `refresh_token` | TEXT | NO | OAuth refresh token |
| `token_type` | VARCHAR | NO | Token type (Bearer) |
| `expires_at` | TIMESTAMP | NO | Token expiration time |
| `scope` | TEXT | YES | Granted OAuth scopes |
| `calendar_id` | VARCHAR | YES | Selected calendar ID (default: primary) |
| `calendar_name` | VARCHAR | YES | Calendar name |
| `is_active` | BOOLEAN | NO | Integration active flag |
| `sync_appointments` | BOOLEAN | NO | Sync appointments flag |
| `sync_blocked_times` | BOOLEAN | NO | Sync blocked times flag |
| `last_synced_at` | TIMESTAMP | YES | Last sync time |
| `last_error` | TEXT | YES | Last error message |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id` (unique)

**Relationships:**
- `client_id` → `clients.id` (1:1)

---

### ghl_integrations

GoHighLevel OAuth tokens for multi-tenant support.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `client_id` | INTEGER | NO | FK to clients table |
| `user_id` | INTEGER | YES | FK to users table |
| `ghl_location_id` | VARCHAR(50) | NO | GHL Location ID (sub-account) |
| `ghl_company_id` | VARCHAR(50) | YES | GHL Company ID (agency) |
| `access_token` | TEXT | NO | OAuth access token |
| `refresh_token` | TEXT | YES | OAuth refresh token |
| `token_type` | VARCHAR(20) | NO | Token type (Bearer) |
| `scope` | TEXT | YES | Granted scopes |
| `expires_at` | TIMESTAMP | YES | Token expiration |
| `user_type` | VARCHAR(20) | YES | Location or Company |
| `location_name` | VARCHAR(255) | YES | GHL location name |
| `is_active` | BOOLEAN | NO | Integration active flag |
| `last_synced_at` | TIMESTAMP | YES | Last sync time |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `client_id`, `user_id`, `ghl_location_id`, `is_active`, `client_id + is_active` (unique partial where is_active=true)

**Relationships:**
- `client_id` → `clients.id` (N:1)
- `user_id` → `users.id` (N:1)

---

## Project Tracker Tables

### projects

Custom modification projects for clients.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `user_id` | INTEGER | NO | FK to users table (project owner) |
| `created_by_admin` | INTEGER | YES | FK to users table (admin creator) |
| `title` | VARCHAR(255) | NO | Project title |
| `description` | TEXT | YES | Project description |
| `status` | ENUM | NO | Status: pending, in_progress, completed, on_hold, cancelled |
| `priority` | ENUM | NO | Priority: low, medium, high, urgent |
| `estimated_completion` | DATE | YES | Estimated completion date |
| `actual_completion` | DATE | YES | Actual completion date |
| `client_requirements` | TEXT | YES | Client requirements |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `user_id`, `status`, `priority`, `created_at`

**Relationships:**
- `user_id` → `users.id` (N:1, owner)
- `created_by_admin` → `users.id` (N:1, creator)

---

### project_milestones

Milestones within projects.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `project_id` | INTEGER | NO | FK to projects table (CASCADE delete) |
| `title` | VARCHAR(255) | NO | Milestone title |
| `description` | TEXT | YES | Milestone description |
| `status` | ENUM | NO | Status: pending, in_progress, completed, blocked |
| `order` | INTEGER | NO | Display order within project |
| `due_date` | DATE | YES | Milestone due date |
| `completed_at` | TIMESTAMP | YES | Completion timestamp |
| `admin_notes` | TEXT | YES | Internal admin notes |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Record update time |

**Indexes:** `project_id`, `status`, `order`, `due_date`

**Relationships:**
- `project_id` → `projects.id` (N:1, CASCADE)

---

### project_messages

Two-way messaging between admin and client per milestone.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NO | Primary key, auto-increment |
| `milestone_id` | INTEGER | NO | FK to project_milestones (CASCADE delete) |
| `user_id` | INTEGER | NO | FK to users table (message author) |
| `is_admin` | BOOLEAN | NO | Message from admin flag |
| `message` | TEXT | NO | Message content |
| `attachment_url` | VARCHAR(500) | YES | Attachment URL |
| `attachment_name` | VARCHAR(255) | YES | Original attachment filename |
| `read_at` | TIMESTAMP | YES | Read timestamp |
| `created_at` | TIMESTAMP | NO | Record creation time |

**Indexes:** `milestone_id`, `user_id`, `is_admin`, `created_at`

**Relationships:**
- `milestone_id` → `project_milestones.id` (N:1, CASCADE)
- `user_id` → `users.id` (N:1)

---

## Relationship Summary

### One-to-One (1:1)
- `users` ↔ `clients` (via `user_id`)
- `clients` ↔ `credit_accounts` (via `client_id`)
- `clients` ↔ `google_calendar_integrations` (via `client_id`)

### One-to-Many (1:N)
- `clients` → `contacts`
- `clients` → `messages`
- `clients` → `calls`
- `clients` → `appointments`
- `clients` → `admin_communications`
- `clients` → `admin_notes`
- `clients` → `ghl_integrations`
- `contacts` → `messages`
- `contacts` → `calls`
- `contacts` → `appointments`
- `users` → `projects` (as owner)
- `users` → `projects` (as admin creator)
- `users` → `admin_communications`
- `users` → `admin_notes`
- `users` → `project_messages`
- `users` → `ghl_integrations`
- `projects` → `project_milestones`
- `project_milestones` → `project_messages`

### Self-Referential
- `clients` → `clients` (via `referred_by` for referral tracking)

---

## Key Fields for ElevenLabs Voice Integration

To enable ElevenLabs voice booking for a client:

1. **clients.rachel_enabled** = `true` - Enables Rachel AI
2. **clients.settings** (JSONB) - Contains ElevenLabs configuration:
   ```json
   {
     "elevenLabsAgentId": "agent_xxxxx",
     "elevenLabsPhoneNumberId": "phnum_xxxxx"
   }
   ```
3. **messages.message_source** = `'elevenlabs'` - Identifies voice messages
4. **appointments.source** = `'voice_booking'` - Identifies voice-booked appointments

See [CLIENT_15_ARCHITECTURE.md](./CLIENT_15_ARCHITECTURE.md) for complete ElevenLabs activation guide.
