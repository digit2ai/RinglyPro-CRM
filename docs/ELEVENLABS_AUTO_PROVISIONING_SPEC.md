# ElevenLabs Voice AI Auto-Provisioning System Specification

> **Document Version:** 1.0
> **Created:** January 6, 2026
> **Status:** APPROVED FOR IMPLEMENTATION
> **Author:** RinglyPro Development Team

---

## Executive Summary

This specification defines the automatic provisioning of ElevenLabs Voice AI agents when new RinglyPro clients sign up. Currently, new clients receive a Twilio number with basic TTS (Text-to-Speech) Rachel. This enhancement will automatically create a full ElevenLabs conversational AI agent (Lina) with booking capabilities, call transfer, and bilingual support.

**CRITICAL CONSTRAINT:** Existing clients (especially Client 15 and Client 32) must remain completely untouched. This system only applies to NEW client signups.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target State Architecture](#2-target-state-architecture)
3. [Signup Form Changes](#3-signup-form-changes)
4. [Backend Service Implementation](#4-backend-service-implementation)
5. [Database Schema Changes](#5-database-schema-changes)
6. [ElevenLabs Agent Template](#6-elevenlabs-agent-template)
7. [API Integration Details](#7-api-integration-details)
8. [Error Handling Strategy](#8-error-handling-strategy)
9. [Testing Plan](#9-testing-plan)
10. [Rollback Plan](#10-rollback-plan)

---

## 1. Current State Analysis

### 1.1 Current Signup Flow

**File:** `src/routes/auth.js` (lines 49-350)

```
User Submits Signup Form
        │
        ▼
POST /api/auth/register
        │
        ├──► Step 1: Create User record in `users` table
        │
        ├──► Step 2: Search & Purchase Twilio number
        │         └── Configure webhooks to /voice/rachel/ (TTS)
        │
        ├──► Step 3: Create Client record in `clients` table
        │
        ├──► Step 4: Create Credit Account
        │
        └──► Step 5: Return JWT token, redirect to dashboard
```

### 1.2 Current Form Fields Collected

**File:** `src/routes/auth.js` (lines 52-73)

| Field | Required | Used For |
|-------|----------|----------|
| email | Yes | User account |
| password | Yes | Authentication |
| firstName | Yes | User profile |
| lastName | Yes | User profile |
| businessName | Yes | Client record, Twilio friendly name |
| businessPhone | Yes | Client identification |
| businessType | No | Context |
| websiteUrl | No | Currently unused |
| phoneNumber | No | Owner phone (fallback to businessPhone) |
| businessDescription | No | Currently unused |
| businessHours | No | Basic open/close times |
| services | No | Currently unused |
| termsAccepted | Yes | Legal compliance |
| referralCode | No | Referral tracking |
| plan/amount/tokens/billing | No | Subscription |

### 1.3 Key Files

| File | Purpose |
|------|---------|
| `src/routes/auth.js` | Registration endpoint |
| `src/services/twilioNumberProvisioning.js` | Twilio number purchase |
| `src/models/Client.js` | Client data model |
| `src/routes/elevenlabs-tools.js` | Webhook endpoint for ElevenLabs tools |
| `src/services/availabilityService.js` | RinglyPro calendar availability |
| `views/dashboard.ejs` | Dashboard (NO CHANGES) |
| `views/login.ejs` | Login page (NO CHANGES) |

---

## 2. Target State Architecture

### 2.1 New Signup Flow

```
User Submits Enhanced Signup Form
        │
        ▼
POST /api/auth/register
        │
        ├──► Step 1: Create User record (EXISTING)
        │
        ├──► Step 2: Purchase Twilio number (EXISTING)
        │         └── Configure webhooks to /voice/rachel/ (kept as fallback)
        │
        ├──► Step 3: Create Client record (EXISTING)
        │
        ├──► Step 4: Create Credit Account (EXISTING)
        │
        ├──► Step 5: Create ElevenLabs Agent (NEW)
        │         ├── 5a. Build agent config from template + client data
        │         ├── 5b. POST to ElevenLabs /v1/convai/agents/create
        │         └── 5c. Store agent_id in clients table
        │
        ├──► Step 6: Import Twilio Number to ElevenLabs (NEW)
        │         ├── 6a. POST to /v1/convai/phone-numbers
        │         └── 6b. Store phone_number_id in clients table
        │
        ├──► Step 7: Link Agent to Phone Number (NEW)
        │         └── 7a. PATCH /v1/convai/phone-numbers/{id}
        │
        └──► Step 8: Return JWT token, redirect to dashboard (EXISTING)
```

### 2.2 Components to Create

| Component | Type | Description |
|-----------|------|-------------|
| `src/services/elevenlabsAgentProvisioning.js` | NEW FILE | Service for ElevenLabs API integration |
| Signup form fields | MODIFY | Add required fields for ElevenLabs |
| `src/routes/auth.js` | MODIFY | Add Steps 5-7 after client creation |
| `clients` table | MIGRATE | Add `elevenlabs_agent_id` column |

### 2.3 Components NOT Modified

- `views/dashboard.ejs` - NO CHANGES
- `views/login.ejs` - NO CHANGES
- `src/routes/elevenlabs-tools.js` - Already handles all required tools
- `src/services/availabilityService.js` - Already works for RinglyPro calendar
- Existing clients (15, 32, etc.) - NEVER TOUCHED

---

## 3. Signup Form Changes

### 3.1 New Required Fields

Add these fields to the signup form:

```html
<!-- Owner/Transfer Phone (REQUIRED) -->
<div class="form-group">
    <label for="ownerPhone">Your Personal Phone Number *</label>
    <input
        type="tel"
        id="ownerPhone"
        name="ownerPhone"
        placeholder="+1 (555) 123-4567"
        required
    >
    <small>Where Lina will transfer urgent calls to you</small>
</div>

<!-- Timezone (REQUIRED) -->
<div class="form-group">
    <label for="timezone">Business Timezone *</label>
    <select id="timezone" name="timezone" required>
        <option value="">Select timezone...</option>
        <option value="America/New_York">Eastern Time (ET)</option>
        <option value="America/Chicago">Central Time (CT)</option>
        <option value="America/Denver">Mountain Time (MT)</option>
        <option value="America/Los_Angeles">Pacific Time (PT)</option>
        <option value="America/Phoenix">Arizona (no DST)</option>
        <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
        <option value="America/Anchorage">Alaska Time (AKT)</option>
    </select>
</div>

<!-- Business Hours (REQUIRED - Enhanced) -->
<div class="form-group">
    <label>Business Hours *</label>
    <div class="hours-row">
        <select id="businessHoursOpen" name="businessHoursOpen" required>
            <option value="08:00">8:00 AM</option>
            <option value="09:00" selected>9:00 AM</option>
            <option value="10:00">10:00 AM</option>
            <!-- ... more options -->
        </select>
        <span>to</span>
        <select id="businessHoursClose" name="businessHoursClose" required>
            <option value="17:00" selected>5:00 PM</option>
            <option value="18:00">6:00 PM</option>
            <option value="19:00">7:00 PM</option>
            <!-- ... more options -->
        </select>
    </div>
</div>

<!-- Business Days (REQUIRED) -->
<div class="form-group">
    <label>Business Days *</label>
    <div class="days-checkboxes">
        <label><input type="checkbox" name="businessDays" value="monday" checked> Mon</label>
        <label><input type="checkbox" name="businessDays" value="tuesday" checked> Tue</label>
        <label><input type="checkbox" name="businessDays" value="wednesday" checked> Wed</label>
        <label><input type="checkbox" name="businessDays" value="thursday" checked> Thu</label>
        <label><input type="checkbox" name="businessDays" value="friday" checked> Fri</label>
        <label><input type="checkbox" name="businessDays" value="saturday"> Sat</label>
        <label><input type="checkbox" name="businessDays" value="sunday"> Sun</label>
    </div>
</div>
```

### 3.2 Enhanced Optional Fields

Make these existing fields more prominent:

```html
<!-- Website URL (Optional but Encouraged) -->
<div class="form-group">
    <label for="websiteUrl">Business Website</label>
    <input
        type="url"
        id="websiteUrl"
        name="websiteUrl"
        placeholder="https://yourbusiness.com"
    >
    <small>Lina will use this to learn about your business</small>
</div>

<!-- Services Offered (Optional but Encouraged) -->
<div class="form-group">
    <label for="services">Services You Offer</label>
    <textarea
        id="services"
        name="services"
        rows="3"
        placeholder="e.g., Plumbing repairs, Water heater installation, Drain cleaning..."
    ></textarea>
    <small>Help Lina answer questions about your services</small>
</div>

<!-- Business Description (Optional) -->
<div class="form-group">
    <label for="businessDescription">About Your Business</label>
    <textarea
        id="businessDescription"
        name="businessDescription"
        rows="3"
        placeholder="Brief description of your business..."
    ></textarea>
</div>
```

### 3.3 Updated Form Data Structure

The registration endpoint should now expect:

```javascript
// POST /api/auth/register request body
{
    // Existing fields
    email: "owner@business.com",
    password: "securepassword",
    firstName: "John",
    lastName: "Smith",
    businessName: "Smith Plumbing",
    businessPhone: "+15551234567",      // Business main line
    businessType: "Home Services",
    termsAccepted: true,

    // NEW REQUIRED FIELDS
    ownerPhone: "+15559876543",          // Transfer destination
    timezone: "America/New_York",
    businessHoursOpen: "09:00",
    businessHoursClose: "17:00",
    businessDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],

    // Enhanced optional fields
    websiteUrl: "https://smithplumbing.com",
    services: "Plumbing repairs, Water heater installation, Drain cleaning",
    businessDescription: "Family-owned plumbing business serving the greater metro area since 1985."
}
```

---

## 4. Backend Service Implementation

### 4.1 New Service: elevenlabsAgentProvisioning.js

**File to create:** `src/services/elevenlabsAgentProvisioning.js`

```javascript
/**
 * ElevenLabs Agent Provisioning Service
 *
 * Automatically creates and configures ElevenLabs Voice AI agents
 * for new RinglyPro clients during signup.
 *
 * IMPORTANT: This service is ONLY for NEW clients.
 * Existing clients (15, 32, etc.) are NEVER modified.
 */

const axios = require('axios');
const logger = require('../utils/logger');

class ElevenLabsAgentProvisioning {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

        // Template values from Client 15's agent
        this.voiceId = 'zl7szWVBXnpgrJmAalgz'; // Lina
        this.llmModel = 'gemini-2.5-flash';
        this.ttsModel = 'eleven_turbo_v2';
    }

    /**
     * Main provisioning method - orchestrates full agent setup
     *
     * @param {Object} clientData - Client information from signup
     * @param {string} twilioNumber - Purchased Twilio number (e.g., +15551234567)
     * @param {string} twilioSid - Twilio number SID (e.g., PN...)
     * @returns {Object} { success, agentId, phoneNumberId, error }
     */
    async provisionAgentForClient(clientData, twilioNumber, twilioSid) {
        try {
            logger.info(`🤖 [ElevenLabs] Starting agent provisioning for: ${clientData.businessName}`);

            // Step 1: Create the agent
            const agentResult = await this.createAgent(clientData);
            if (!agentResult.success) {
                throw new Error(`Agent creation failed: ${agentResult.error}`);
            }

            logger.info(`✅ [ElevenLabs] Agent created: ${agentResult.agentId}`);

            // Step 2: Import Twilio number
            const phoneResult = await this.importPhoneNumber(
                twilioNumber,
                twilioSid,
                clientData.businessName
            );
            if (!phoneResult.success) {
                throw new Error(`Phone import failed: ${phoneResult.error}`);
            }

            logger.info(`✅ [ElevenLabs] Phone imported: ${phoneResult.phoneNumberId}`);

            // Step 3: Link agent to phone number
            const linkResult = await this.linkAgentToNumber(
                phoneResult.phoneNumberId,
                agentResult.agentId
            );
            if (!linkResult.success) {
                throw new Error(`Phone-agent link failed: ${linkResult.error}`);
            }

            logger.info(`✅ [ElevenLabs] Agent linked to phone number`);

            return {
                success: true,
                agentId: agentResult.agentId,
                phoneNumberId: phoneResult.phoneNumberId
            };

        } catch (error) {
            logger.error(`❌ [ElevenLabs] Provisioning failed:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create ElevenLabs agent with client-specific configuration
     */
    async createAgent(clientData) {
        try {
            const agentConfig = this.buildAgentConfig(clientData);

            const response = await axios.post(
                `${this.baseUrl}/convai/agents/create`,
                agentConfig,
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                agentId: response.data.agent_id
            };

        } catch (error) {
            logger.error('[ElevenLabs] Create agent error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Import Twilio phone number to ElevenLabs
     */
    async importPhoneNumber(twilioNumber, twilioSid, businessName) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/convai/phone-numbers`,
                {
                    provider: 'twilio',
                    phone_number: twilioNumber,
                    label: `${businessName} - RinglyPro`,
                    twilio_config: {
                        account_sid: process.env.TWILIO_ACCOUNT_SID,
                        auth_token: process.env.TWILIO_AUTH_TOKEN,
                        phone_number_sid: twilioSid
                    }
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                phoneNumberId: response.data.phone_number_id
            };

        } catch (error) {
            logger.error('[ElevenLabs] Import phone error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Link agent to phone number
     */
    async linkAgentToNumber(phoneNumberId, agentId) {
        try {
            await axios.patch(
                `${this.baseUrl}/convai/phone-numbers/${phoneNumberId}`,
                {
                    agent_id: agentId
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return { success: true };

        } catch (error) {
            logger.error('[ElevenLabs] Link agent error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Build agent configuration from client data
     * Based on Client 15's agent template
     */
    buildAgentConfig(clientData) {
        const {
            businessName,
            ownerPhone,
            websiteUrl,
            timezone,
            businessHoursOpen,
            businessHoursClose,
            businessDays,
            services,
            businessDescription,
            clientId
        } = clientData;

        // Format business hours for prompt
        const hoursFormatted = `${this.formatTime(businessHoursOpen)} to ${this.formatTime(businessHoursClose)}`;
        const daysFormatted = this.formatDays(businessDays);

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt({
            businessName,
            ownerPhone,
            websiteUrl,
            hoursFormatted,
            daysFormatted,
            timezone,
            services,
            businessDescription,
            clientId
        });

        return {
            name: `${businessName} - Lina`,
            conversation_config: {
                agent: {
                    prompt: {
                        prompt: systemPrompt
                    },
                    first_message: `Hello! Thank you for calling ${businessName}. This is Lina, how may I help you today?`,
                    language: 'en'
                },
                asr: {
                    quality: 'high',
                    provider: 'elevenlabs',
                    keywords: [businessName]
                },
                tts: {
                    model_id: this.ttsModel,
                    voice_id: this.voiceId,
                    stability: 0.5,
                    similarity_boost: 0.8,
                    speed: 1.0
                },
                llm: {
                    model: this.llmModel,
                    temperature: 0.8,
                    max_tokens: 500
                },
                turn: {
                    mode: 'turn_based'
                },
                conversation: {
                    max_duration_seconds: 600
                }
            },
            platform_settings: {
                widget: {
                    variant: 'full'
                }
            },
            // Configure webhook tools
            tools: this.buildToolsConfig(clientId)
        };
    }

    /**
     * Build the system prompt for the agent
     */
    buildSystemPrompt(data) {
        const {
            businessName,
            ownerPhone,
            websiteUrl,
            hoursFormatted,
            daysFormatted,
            timezone,
            services,
            businessDescription,
            clientId
        } = data;

        let prompt = `You are Lina, the virtual receptionist for ${businessName}.

## Your Role
You are a friendly, professional AI receptionist. Your job is to:
1. Answer calls warmly and professionally
2. Provide information about ${businessName}
3. Help callers book appointments
4. Transfer calls to ${ownerPhone} when the caller needs to speak with someone directly

## Business Information
- Business Name: ${businessName}
- Business Hours: ${hoursFormatted}, ${daysFormatted}
- Timezone: ${timezone}`;

        if (websiteUrl) {
            prompt += `\n- Website: ${websiteUrl}`;
        }

        if (services) {
            prompt += `\n\n## Services Offered\n${services}`;
        }

        if (businessDescription) {
            prompt += `\n\n## About the Business\n${businessDescription}`;
        }

        prompt += `

## Booking Appointments
When a caller wants to book an appointment:
1. Use the check_availability tool to find available slots
2. Always pass client_id: "${clientId}" to the tools
3. Offer 2-3 available time slots
4. Use the book_appointment tool to confirm the booking
5. Send an SMS confirmation using send_sms tool

## Call Transfer
If the caller:
- Asks to speak with a person/manager/owner
- Has an urgent matter you cannot handle
- Specifically requests a transfer

Transfer the call to: ${ownerPhone}
If transfer fails, provide this backup number: +12232949184 (RinglyPro Support)

## Language
You speak fluent English and Spanish. Respond in whichever language the caller uses.

## Important Guidelines
- Be concise and natural in conversation
- Don't read out URLs or technical information
- If you don't know something, offer to take a message or transfer
- Always confirm appointment details before booking
- Be patient with callers who need extra time`;

        return prompt;
    }

    /**
     * Build the tools configuration for the agent
     */
    buildToolsConfig(clientId) {
        const toolsWebhookUrl = `${this.webhookBaseUrl}/api/elevenlabs/tools`;

        return [
            {
                type: 'webhook',
                name: 'get_business_info',
                description: 'Get information about the business for the current call',
                webhook: {
                    url: toolsWebhookUrl,
                    method: 'POST'
                },
                parameters: {
                    type: 'object',
                    properties: {
                        client_id: {
                            type: 'string',
                            description: 'The RinglyPro client ID',
                            const: String(clientId)
                        }
                    },
                    required: ['client_id']
                }
            },
            {
                type: 'webhook',
                name: 'check_availability',
                description: 'Check available appointment slots for booking',
                webhook: {
                    url: toolsWebhookUrl,
                    method: 'POST'
                },
                parameters: {
                    type: 'object',
                    properties: {
                        client_id: {
                            type: 'string',
                            description: 'The RinglyPro client ID',
                            const: String(clientId)
                        },
                        date: {
                            type: 'string',
                            description: 'Date to check in YYYY-MM-DD format (optional, defaults to tomorrow)'
                        },
                        days_ahead: {
                            type: 'integer',
                            description: 'Number of days to look ahead (default 7)',
                            default: 7
                        }
                    },
                    required: ['client_id']
                }
            },
            {
                type: 'webhook',
                name: 'book_appointment',
                description: 'Book an appointment for a caller',
                webhook: {
                    url: toolsWebhookUrl,
                    method: 'POST'
                },
                parameters: {
                    type: 'object',
                    properties: {
                        client_id: {
                            type: 'string',
                            description: 'The RinglyPro client ID',
                            const: String(clientId)
                        },
                        customer_name: {
                            type: 'string',
                            description: 'Full name of the customer'
                        },
                        customer_phone: {
                            type: 'string',
                            description: 'Customer phone number'
                        },
                        customer_email: {
                            type: 'string',
                            description: 'Customer email (optional)'
                        },
                        appointment_date: {
                            type: 'string',
                            description: 'Date in YYYY-MM-DD format'
                        },
                        appointment_time: {
                            type: 'string',
                            description: 'Time in HH:MM format (24-hour)'
                        },
                        purpose: {
                            type: 'string',
                            description: 'Reason for the appointment'
                        }
                    },
                    required: ['client_id', 'customer_name', 'customer_phone', 'appointment_date', 'appointment_time']
                }
            },
            {
                type: 'webhook',
                name: 'send_sms',
                description: 'Send an SMS message to a phone number',
                webhook: {
                    url: toolsWebhookUrl,
                    method: 'POST'
                },
                parameters: {
                    type: 'object',
                    properties: {
                        client_id: {
                            type: 'string',
                            description: 'The RinglyPro client ID',
                            const: String(clientId)
                        },
                        to_phone: {
                            type: 'string',
                            description: 'Phone number to send SMS to'
                        },
                        message: {
                            type: 'string',
                            description: 'SMS message content'
                        }
                    },
                    required: ['client_id', 'to_phone', 'message']
                }
            },
            {
                type: 'transfer_to_number',
                name: 'transfer_call',
                description: 'Transfer the call to a human',
                transfer_to_number: {
                    phone_number: ownerPhone || '+12232949184'
                }
            }
        ];
    }

    /**
     * Format time from 24h to 12h AM/PM
     */
    formatTime(time24) {
        if (!time24) return '9:00 AM';
        const [hours, minutes] = time24.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes || '00'} ${ampm}`;
    }

    /**
     * Format days array to readable string
     */
    formatDays(days) {
        if (!days || !Array.isArray(days) || days.length === 0) {
            return 'Monday through Friday';
        }

        const dayNames = {
            monday: 'Monday',
            tuesday: 'Tuesday',
            wednesday: 'Wednesday',
            thursday: 'Thursday',
            friday: 'Friday',
            saturday: 'Saturday',
            sunday: 'Sunday'
        };

        const formatted = days.map(d => dayNames[d.toLowerCase()] || d);

        if (formatted.length === 1) return formatted[0];
        if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;

        // Check for Mon-Fri pattern
        const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (formatted.length === 5 && weekdays.every(d => formatted.includes(d))) {
            return 'Monday through Friday';
        }

        return formatted.slice(0, -1).join(', ') + ', and ' + formatted.slice(-1);
    }
}

module.exports = new ElevenLabsAgentProvisioning();
```

### 4.2 Modifications to auth.js

**File:** `src/routes/auth.js`

Add after the Client.create block (around line 310):

```javascript
// ==================== ELEVENLABS AGENT PROVISIONING ====================
// ONLY for new clients - never modifies existing clients
console.log('🤖 Provisioning ElevenLabs Voice AI agent...');

let elevenlabsAgentId = null;
let elevenlabsPhoneNumberId = null;

// Skip if env var set (for testing) or if ELEVENLABS_API_KEY not configured
if (process.env.SKIP_ELEVENLABS_PROVISIONING !== 'true' && process.env.ELEVENLABS_API_KEY) {
    try {
        const elevenlabsProvisioning = require('../services/elevenlabsAgentProvisioning');

        const elevenlabsResult = await elevenlabsProvisioning.provisionAgentForClient(
            {
                businessName: businessName,
                ownerPhone: normalizedPhoneNumber || normalizedBusinessPhone,
                websiteUrl: cleanWebsiteUrl,
                timezone: timezone || 'America/New_York',
                businessHoursOpen: businessHours?.open || '09:00',
                businessHoursClose: businessHours?.close || '17:00',
                businessDays: businessDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                services: services,
                businessDescription: businessDescription,
                clientId: client.id
            },
            twilioNumber,
            twilioSid
        );

        if (elevenlabsResult.success) {
            elevenlabsAgentId = elevenlabsResult.agentId;
            elevenlabsPhoneNumberId = elevenlabsResult.phoneNumberId;

            // Update client record with ElevenLabs IDs
            await Client.update(
                {
                    elevenlabs_agent_id: elevenlabsAgentId,
                    elevenlabs_phone_number_id: elevenlabsPhoneNumberId,
                    use_elevenlabs_inbound: true
                },
                { where: { id: client.id } }
            );

            console.log(`✅ ElevenLabs agent provisioned: ${elevenlabsAgentId}`);
        } else {
            console.error(`⚠️ ElevenLabs provisioning failed: ${elevenlabsResult.error}`);
            // Non-fatal: Client still works with Twilio TTS fallback
        }

    } catch (elevenlabsError) {
        console.error('⚠️ ElevenLabs provisioning error (non-fatal):', elevenlabsError.message);
        // Non-fatal: Client still works with Twilio TTS fallback
    }
} else {
    console.log('⏭️ Skipping ElevenLabs provisioning (disabled or no API key)');
}
// ==================== END ELEVENLABS PROVISIONING ====================
```

---

## 5. Database Schema Changes

### 5.1 Migration Script

**File to create:** `migrations/YYYYMMDD_add_elevenlabs_columns.sql`

```sql
-- Add ElevenLabs agent provisioning columns to clients table
-- Run this BEFORE deploying the new code

-- Agent ID from ElevenLabs
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS elevenlabs_agent_id VARCHAR(100);

-- Phone number ID from ElevenLabs (may already exist from Client 15 work)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS elevenlabs_phone_number_id VARCHAR(100);

-- Flag to use ElevenLabs for inbound calls
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS use_elevenlabs_inbound BOOLEAN DEFAULT false;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_elevenlabs_agent_id
ON clients(elevenlabs_agent_id)
WHERE elevenlabs_agent_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN clients.elevenlabs_agent_id IS 'ElevenLabs Conversational AI agent ID (agent_...)';
COMMENT ON COLUMN clients.elevenlabs_phone_number_id IS 'ElevenLabs phone number ID (phnum_...)';
COMMENT ON COLUMN clients.use_elevenlabs_inbound IS 'Use ElevenLabs for inbound calls (vs Twilio TTS)';
```

### 5.2 Update Client Model

**File:** `src/models/Client.js`

Add these fields to the model definition:

```javascript
// ElevenLabs Voice AI fields
elevenlabs_agent_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ElevenLabs Conversational AI agent ID'
},
elevenlabs_phone_number_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ElevenLabs phone number ID for this client'
},
use_elevenlabs_inbound: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Use ElevenLabs for inbound calls instead of Twilio TTS'
}
```

---

## 6. ElevenLabs Agent Template

### 6.1 Reference: Client 15 Agent Configuration

The template is based on Client 15's agent (`agent_0901keadgv5mebdvd9dq5brqcd6h`):

| Setting | Value |
|---------|-------|
| Voice | Lina (`zl7szWVBXnpgrJmAalgz`) |
| LLM Model | `gemini-2.5-flash` |
| TTS Model | `eleven_turbo_v2` |
| Temperature | 0.8 |
| Max Tokens | 500 |
| Stability | 0.5 |
| Similarity Boost | 0.8 |
| Speed | 1.0 |
| Languages | English (primary), Spanish |

### 6.2 Dynamic Variables

These values are injected from signup form data:

| Variable | Source | Example |
|----------|--------|---------|
| `{{business_name}}` | businessName | "Smith Plumbing" |
| `{{owner_phone}}` | ownerPhone | "+15559876543" |
| `{{website_url}}` | websiteUrl | "https://smithplumbing.com" |
| `{{hours_formatted}}` | businessHoursOpen/Close | "9:00 AM to 5:00 PM" |
| `{{days_formatted}}` | businessDays | "Monday through Friday" |
| `{{timezone}}` | timezone | "America/New_York" |
| `{{services}}` | services | "Plumbing repairs, installations" |
| `{{business_description}}` | businessDescription | "Family-owned since 1985" |
| `{{client_id}}` | client.id | "47" |

---

## 7. API Integration Details

### 7.1 ElevenLabs API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/convai/agents/create` | POST | Create new agent |
| `/v1/convai/phone-numbers` | POST | Import Twilio number |
| `/v1/convai/phone-numbers/{id}` | PATCH | Link agent to number |

### 7.2 Authentication

All requests require header:
```
xi-api-key: {ELEVENLABS_API_KEY}
```

### 7.3 Environment Variables

**Required:**
```bash
ELEVENLABS_API_KEY=xi_...          # Already exists
TWILIO_ACCOUNT_SID=AC...           # Already exists
TWILIO_AUTH_TOKEN=...              # Already exists
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com  # Already exists
```

**Optional (for testing):**
```bash
SKIP_ELEVENLABS_PROVISIONING=true  # Skip ElevenLabs during testing
```

---

## 8. Error Handling Strategy

### 8.1 Failure Scenarios

| Scenario | Handling | User Impact |
|----------|----------|-------------|
| ElevenLabs API down | Log error, continue signup | Client uses Twilio TTS fallback |
| Agent creation fails | Log error, continue signup | Client uses Twilio TTS fallback |
| Phone import fails | Log error, continue signup | Client uses Twilio TTS fallback |
| Agent-phone link fails | Log error, continue signup | Client uses Twilio TTS fallback |
| Twilio purchase fails | Rollback transaction, return error | Signup fails (existing behavior) |

### 8.2 Graceful Degradation

ElevenLabs provisioning is **non-fatal**. If it fails:
1. Client is still created successfully
2. Twilio number works with existing TTS Rachel
3. `elevenlabs_agent_id` remains NULL in database
4. Admin can manually provision later if needed

### 8.3 Logging

All ElevenLabs operations are logged with prefix `[ElevenLabs]`:
```
🤖 [ElevenLabs] Starting agent provisioning for: Smith Plumbing
✅ [ElevenLabs] Agent created: agent_abc123
✅ [ElevenLabs] Phone imported: phnum_xyz789
✅ [ElevenLabs] Agent linked to phone number
```

Or on failure:
```
⚠️ ElevenLabs provisioning failed: API rate limit exceeded
```

---

## 9. Testing Plan

### 9.1 Unit Tests

Create test file: `tests/services/elevenlabsAgentProvisioning.test.js`

```javascript
describe('ElevenLabsAgentProvisioning', () => {
    describe('buildAgentConfig', () => {
        it('should build valid agent config from client data');
        it('should include all required tools');
        it('should format business hours correctly');
        it('should handle missing optional fields');
    });

    describe('buildSystemPrompt', () => {
        it('should include business name');
        it('should include transfer number');
        it('should include services if provided');
        it('should support bilingual instruction');
    });

    describe('provisionAgentForClient', () => {
        it('should create agent, import phone, and link');
        it('should return error if agent creation fails');
        it('should return error if phone import fails');
        it('should return error if linking fails');
    });
});
```

### 9.2 Integration Tests

1. **Signup with ElevenLabs enabled:**
   - Set `ELEVENLABS_API_KEY` to valid key
   - Submit signup form with all required fields
   - Verify client created with `elevenlabs_agent_id` populated
   - Verify agent exists in ElevenLabs dashboard
   - Make test call to verify voice works

2. **Signup with ElevenLabs disabled:**
   - Set `SKIP_ELEVENLABS_PROVISIONING=true`
   - Submit signup form
   - Verify client created with `elevenlabs_agent_id` = NULL
   - Verify Twilio TTS still works

3. **Existing clients unchanged:**
   - Query Client 15 before and after deployment
   - Verify `elevenlabs_agent_id` unchanged
   - Verify agent still works

### 9.3 Manual Testing Checklist

- [ ] Signup form displays all new fields
- [ ] Validation works for required fields
- [ ] Timezone dropdown includes all US timezones
- [ ] Business days checkboxes work correctly
- [ ] Signup completes in < 20 seconds
- [ ] New client appears in dashboard correctly
- [ ] Inbound call is answered by Lina
- [ ] Lina speaks correct business name
- [ ] Lina can check availability
- [ ] Lina can book appointment
- [ ] Lina sends SMS confirmation
- [ ] Call transfer to owner phone works
- [ ] Spanish language detection works
- [ ] Existing Client 15 still works unchanged
- [ ] Existing Client 32 still works unchanged

---

## 10. Rollback Plan

### 10.1 If Issues Discovered

**Immediate rollback:**
```bash
# Set env var to disable ElevenLabs provisioning
SKIP_ELEVENLABS_PROVISIONING=true

# Restart application
pm2 restart ringlypro
```

**Full rollback:**
1. Revert code changes to `src/routes/auth.js`
2. Keep `elevenlabsAgentProvisioning.js` (doesn't affect existing flow)
3. Database columns can remain (NULL values are harmless)

### 10.2 Data Recovery

If bad data was written:
```sql
-- Clear ElevenLabs IDs for clients created after deployment
UPDATE clients
SET
    elevenlabs_agent_id = NULL,
    elevenlabs_phone_number_id = NULL,
    use_elevenlabs_inbound = false
WHERE created_at > '2026-01-XX 00:00:00'  -- Deployment timestamp
AND id NOT IN (15, 32);  -- Never touch existing clients
```

---

## Appendix A: Complete File List

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/services/elevenlabsAgentProvisioning.js` | CREATE | ~400 lines |
| `src/routes/auth.js` | MODIFY | ~50 lines added |
| `src/models/Client.js` | MODIFY | ~15 lines added |
| `migrations/YYYYMMDD_add_elevenlabs_columns.sql` | CREATE | ~20 lines |
| Signup form (location TBD) | MODIFY | ~100 lines added |
| `views/dashboard.ejs` | NO CHANGE | 0 |
| `views/login.ejs` | NO CHANGE | 0 |

---

## Appendix B: Environment Variables Summary

```bash
# Required (already exist)
ELEVENLABS_API_KEY=xi_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com
DATABASE_URL=postgresql://...

# Optional (for testing/rollback)
SKIP_ELEVENLABS_PROVISIONING=true
SKIP_TWILIO_PROVISIONING=true
```

---

## Appendix C: Existing Clients Protection

**CRITICAL:** The following clients must NEVER be modified by this system:

| Client ID | Business | ElevenLabs Agent | Notes |
|-----------|----------|------------------|-------|
| 15 | (Client 15 business) | agent_0901keadgv5mebdvd9dq5brqcd6h | Custom GHL integration |
| 32 | Corvita Recovery | (custom agent) | Custom GHL calendars |

**Protection mechanisms:**
1. Provisioning only runs during NEW signup (`POST /api/auth/register`)
2. Code checks `if (!client.elevenlabs_agent_id)` before provisioning
3. Database UPDATE uses `WHERE id = :newClientId`
4. No batch operations on existing records

---

*End of Specification Document*
