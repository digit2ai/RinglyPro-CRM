RinglyPro Multi-Tenant Voice AI & CRM System
System Overview
RinglyPro is a multi-tenant SaaS platform combining AI voice assistant (Rachel) with mobile CRM functionality. Each client gets their own branded instance with dedicated phone number, calendar integration, and customer management.
Credit System & Monetization
Free Tier: 100 minutes per month per client
Overage Behavior: When minutes exhausted, both CRM and Rachel voice lock until:

Next month renewal (auto-unlock), OR
Manual account reload

Reload Options: $10, $20, $50, $100 via mobile app UI
Rollover Policy: Paid minutes carry forward to following month
Usage Tracking: Real-time minute consumption with dashboard alerts
Call Flow Architecture
Client Control

Mobile App Toggle: Client can enable/disable Rachel per their preference
Conditional Forward: When Rachel enabled, calls forward to AI only after 3 rings (giving client chance to answer)
Direct Answer: If Rachel disabled, all calls go directly to client

Multi-Tenant Call Processing

Prospect dials: Client's personal business number
Ring Detection: System waits 3 rings if Rachel enabled
Client Identification: Rachel identifies client by incoming phone number lookup
Contextual Greeting: Rachel uses client's business name, description, and custom greeting
Intent Processing: Appointment booking, pricing, support transfer options

Appointment Booking Flow
Calendar Integration:

Rachel queries Client A's calendar database for availability
Offers 3 specific date/time combinations to prospect
Books selected slot directly in client's calendar system
Appointment appears immediately in mobile app

Confirmation System:

SMS sent to prospect: Appointment details + confirmation
SMS sent to client: New booking notification
Both messages logged in client's CRM

Database Architecture Requirements
Multi-Tenant Separation: All tables include client_id foreign key

appointments.client_id → Links bookings to specific client
calls.client_id → Tracks usage per client
contacts.client_id → Segregates prospect lists
messages.client_id → SMS logging per client

Credit Management:

Real-time minute tracking per client
Automatic service suspension at zero balance
Payment processing with instant unlock
Monthly rollover calculations

Mobile App Features

Rachel Toggle: One-tap enable/disable voice assistant
Usage Dashboard: Real-time minute consumption tracking
Reload Interface: Quick payment options ($10-$100)
Calendar View: All Rachel-booked appointments
CRM Access: Contact management, call logs, SMS history
Service Status: Clear indication when locked due to insufficient credits

Logging & Analytics
Comprehensive Tracking: Every Rachel interaction logged in client-specific CRM:

Inbound call details and duration
Speech recognition results and intents
Appointment booking success/failure rates
SMS delivery confirmations
Credit usage patterns and payment history

The system maintains complete client isolation while providing unified Rachel AI experience across all tenants.

RinglyPro Multi-Tenant Voice AI & CRM System
System Overview
RinglyPro is a multi-tenant SaaS platform combining AI voice assistant (Rachel) with mobile CRM functionality. Each client gets their own branded instance with dedicated phone number, calendar integration, and customer management.
Architecture Diagram
mermaidgraph TB
    %% External Users
    P[Prospect Caller] 
    CA[Client A - Business Owner]
    CB[Client B - Business Owner]

    %% Phone System Layer
    subgraph "Telephony Layer"
        PN1["+1-555-0001<br/>Client A Number"]
        PN2["+1-555-0002<br/>Client B Number"]
        RN["+18886103810<br/>Rachel AI Number"]
    end

    %% Call Routing Logic
    subgraph "Call Routing & Control"
        CR[Call Router<br/>3-Ring Logic]
        RT[Rachel Toggle<br/>Client Control]
    end

    %% Rachel AI Engine
    subgraph "Rachel AI Voice System"
        RS[Rachel Service<br/>Multi-Tenant]
        EL[ElevenLabs<br/>Premium Voice]
        TW[Twilio<br/>Speech & SMS]
        IC[Intent Classification<br/>Demo|Pricing|Support]
    end

    %% Multi-Tenant Database
    subgraph "Database Layer (PostgreSQL)"
        CT[Clients Table<br/>business_name, ringlypro_number<br/>custom_greeting, business_hours]
        AP[Appointments Table<br/>client_id, prospect_info<br/>date_time, status]
        CL[Calls Table<br/>client_id, call_details<br/>duration, cost]
        CO[Contacts Table<br/>client_id, prospect_data<br/>interaction_history]
        CR_DB[Credit Accounts<br/>client_id, balance<br/>usage_tracking]
        MS[Messages Table<br/>client_id, sms_logs<br/>confirmations]
    end

    %% Credit Management System
    subgraph "Credit & Billing System"
        CM[Credit Manager<br/>Minute Tracking]
        PS[Payment System<br/>$10, $20, $50, $100]
        LS[Lock Service<br/>Auto Lock/Unlock]
        RO[Rollover Engine<br/>Monthly Reset]
    end

    %% Mobile Applications
    subgraph "Mobile App (Client A)"
        MA_RT[Rachel Toggle<br/>ON/OFF]
        MA_CR[CRM Dashboard<br/>Contacts & Calls]
        MA_CAL[Calendar View<br/>Appointments]
        MA_CC[Credit Center<br/>Balance & Reload]
        MA_US[Usage Stats<br/>Minutes Consumed]
    end

    subgraph "Mobile App (Client B)"
        MB_RT[Rachel Toggle<br/>ON/OFF]
        MB_CR[CRM Dashboard<br/>Contacts & Calls]
        MB_CAL[Calendar View<br/>Appointments]
        MB_CC[Credit Center<br/>Balance & Reload]
        MB_US[Usage Stats<br/>Minutes Consumed]
    end

    %% External Integrations
    subgraph "External Services"
        ST[Stripe<br/>Payment Processing]
        SM[SMS Gateway<br/>Confirmations]
        EM[Email Service<br/>Notifications]
    end

    %% Call Flow Connections
    P -->|1. Calls| PN1
    PN1 -->|2. 3 Ring Wait| CR
    CR -->|3. Check Toggle| RT
    RT -->|4. If Rachel ON| RN
    RN -->|5. Route to AI| RS

    %% Rachel Processing Flow
    RS -->|Voice Generation| EL
    RS -->|Speech Processing| TW
    RS -->|Intent Analysis| IC
    IC -->|Appointment Request| AP
    RS -->|Client Lookup| CT
    RS -->|Log Interaction| CL
    RS -->|Create Contact| CO
    RS -->|Send SMS| MS

    %% Credit System Flow
    RS -->|Track Usage| CM
    CM -->|Check Balance| CR_DB
    CM -->|Lock Service| LS
    LS -->|Block Access| RS
    PS -->|Process Payment| ST
    ST -->|Update Balance| CR_DB
    CR_DB -->|Unlock Service| LS

    %% Mobile App Connections
    CA -->|Controls| MA_RT
    MA_RT -->|Toggle State| RT
    MA_CR -->|View Data| CL
    MA_CR -->|View Data| CO
    MA_CAL -->|View Bookings| AP
    MA_CC -->|Reload Credits| PS
    MA_US -->|Monitor Usage| CM

    CB -->|Controls| MB_RT
    MB_RT -->|Toggle State| RT
    MB_CR -->|View Data| CL
    MB_CR -->|View Data| CO
    MB_CAL -->|View Bookings| AP
    MB_CC -->|Reload Credits| PS
    MB_US -->|Monitor Usage| CM

    %% SMS & Notification Flow
    RS -->|Booking Confirmation| SM
    SM -->|To Prospect| P
    SM -->|To Client| CA
    SM -->|Log Message| MS

    %% Data Relationships
    CT -.->|client_id| AP
    CT -.->|client_id| CL
    CT -.->|client_id| CO
    CT -.->|client_id| CR_DB
    CT -.->|client_id| MS
The diagram above illustrates the complete system architecture showing:
🔵 Call Flow: Prospect → Client Number → 3-Ring Wait → Rachel Toggle Check → AI Processing
🟣 Database Layer: Multi-tenant PostgreSQL with client_id foreign keys
🟢 Rachel AI Engine: Voice generation, speech processing, and intent classification
🟠 External Services: Stripe payments, SMS gateway, email notifications
🔴 Credit System: Real-time tracking, automatic lock/unlock, rollover management
Credit System & Monetization
Free Tier: 100 minutes per month per client
Overage Behavior: When minutes exhausted, both CRM and Rachel voice lock until:

Next month renewal (auto-unlock), OR
Manual account reload

Reload Options: $10, $20, $50, $100 via mobile app UI
Rollover Policy: Paid minutes carry forward to following month
Usage Tracking: Real-time minute consumption with dashboard alerts
Call Flow Architecture
Client Control

Mobile App Toggle: Client can enable/disable Rachel per their preference
Conditional Forward: When Rachel enabled, calls forward to AI only after 3 rings (giving client chance to answer)
Direct Answer: If Rachel disabled, all calls go directly to client

Multi-Tenant Call Processing

Prospect dials: Client's personal business number
Ring Detection: System waits 3 rings if Rachel enabled
Client Identification: Rachel identifies client by incoming phone number lookup
Contextual Greeting: Rachel uses client's business name, description, and custom greeting
Intent Processing: Appointment booking, pricing, support transfer options

Appointment Booking Flow
Calendar Integration:

Rachel queries Client A's calendar database for availability
Offers 3 specific date/time combinations to prospect
Books selected slot directly in client's calendar system
Appointment appears immediately in mobile app

Confirmation System:

SMS sent to prospect: Appointment details + confirmation
SMS sent to client: New booking notification
Both messages logged in client's CRM

Database Architecture Requirements
Multi-Tenant Separation: All tables include client_id foreign key

appointments.client_id → Links bookings to specific client
calls.client_id → Tracks usage per client
contacts.client_id → Segregates prospect lists
messages.client_id → SMS logging per client

Credit Management:

Real-time minute tracking per client
Automatic service suspension at zero balance
Payment processing with instant unlock
Monthly rollover calculations

Mobile App Features

Rachel Toggle: One-tap enable/disable voice assistant
Usage Dashboard: Real-time minute consumption tracking
Reload Interface: Quick payment options ($10-$100)
Calendar View: All Rachel-booked appointments
CRM Access: Contact management, call logs, SMS history
Service Status: Clear indication when locked due to insufficient credits

Logging & Analytics
Comprehensive Tracking: Every Rachel interaction logged in client-specific CRM:

Inbound call details and duration
Speech recognition results and intents
Appointment booking success/failure rates
SMS delivery confirmations
Credit usage patterns and payment history

The system maintains complete client isolation while providing unified Rachel AI experience across all tenants.
Perfect! The database migration is complete and successful. All required foreign key relationships are in place:
✅ Multi-Tenant Structure Confirmed:

appointments.client_id → clients.id
calls.client_id → clients.id
contacts.client_id → clients.id
messages.client_id → clients.id

✅ Existing Infrastructure:

credit_accounts.client_id → clients.id
credit_notifications.client_id → clients.id
payment_transactions.client_id → clients.id
usage_records.client_id → clients.id

Database Migration Summary:

Added client_id to operational tables
Migrated 15 appointments, 35 calls, 30 messages to default client
Made client_id NOT NULL for data integrity
Added rachel_enabled and booking_url fields to clients