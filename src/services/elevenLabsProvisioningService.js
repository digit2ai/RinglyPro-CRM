// src/services/elevenLabsProvisioningService.js
// ElevenLabs Agent Auto-Provisioning for RinglyPro signup flow
// Creates agent, imports Twilio number, links agent, configures tools

const axios = require('axios');

class ElevenLabsProvisioningService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    // Voice & model config
    this.voiceId = 'zl7szWVBXnpgrJmAalgz'; // Lina
    this.llmModel = 'gemini-2.5-flash';
    this.ttsModel = 'eleven_turbo_v2';
  }

  /**
   * Main entry point: provision complete ElevenLabs agent for a new RinglyPro client
   * @param {Object} clientData - { businessName, businessType, websiteUrl, businessDescription, businessHours, services, ownerPhone, language }
   * @param {string} twilioNumber - Purchased Twilio number (e.g., +15551234567)
   * @param {string} twilioSid - Twilio number SID (e.g., PN...)
   * @param {number} clientId - RinglyPro client ID (for tool webhooks)
   * @returns {Object} { success, agentId, phoneNumberId, error }
   */
  async provisionAgent(clientData, twilioNumber, twilioSid, clientId) {
    try {
      console.log(`[ElevenLabsProvisioning] Starting agent provisioning for: ${clientData.businessName} (client ${clientId})`);

      // Step 1: Create the agent with tools
      const agentConfig = this.buildAgentConfig(clientData, clientId);
      const agentResult = await this.createAgent(agentConfig);
      if (!agentResult.success) {
        throw new Error(`Agent creation failed: ${agentResult.error}`);
      }
      console.log(`[ElevenLabsProvisioning] Agent created: ${agentResult.agentId}`);

      // Step 2: Import Twilio number to ElevenLabs
      const phoneResult = await this.importPhoneNumber(
        twilioNumber,
        twilioSid,
        `${clientData.businessName} - RinglyPro`
      );
      if (!phoneResult.success) {
        throw new Error(`Phone import failed: ${phoneResult.error}`);
      }
      console.log(`[ElevenLabsProvisioning] Phone imported: ${phoneResult.phoneNumberId}`);

      // Step 3: Link agent to phone number
      const linkResult = await this.linkAgentToNumber(
        phoneResult.phoneNumberId,
        agentResult.agentId
      );
      if (!linkResult.success) {
        throw new Error(`Phone-agent link failed: ${linkResult.error}`);
      }
      console.log(`[ElevenLabsProvisioning] Agent linked to phone number`);

      return {
        success: true,
        agentId: agentResult.agentId,
        phoneNumberId: phoneResult.phoneNumberId
      };

    } catch (error) {
      console.error(`[ElevenLabsProvisioning] Provisioning failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create ElevenLabs agent via API
   */
  async createAgent(agentConfig) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/convai/agents/create`,
        agentConfig,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        agentId: response.data.agent_id
      };
    } catch (error) {
      console.error('[ElevenLabsProvisioning] Create agent error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Import Twilio phone number to ElevenLabs
   */
  async importPhoneNumber(twilioNumber, twilioSid, label) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/convai/phone-numbers`,
        {
          provider: 'twilio',
          phone_number: twilioNumber,
          label: label,
          sid: process.env.TWILIO_ACCOUNT_SID,
          token: process.env.TWILIO_AUTH_TOKEN
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return {
        success: true,
        phoneNumberId: response.data.phone_number_id
      };
    } catch (error) {
      console.error('[ElevenLabsProvisioning] Import phone error:', error.response?.data || error.message);
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
        { agent_id: agentId },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return { success: true };
    } catch (error) {
      console.error('[ElevenLabsProvisioning] Link agent error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Build complete agent config for ElevenLabs API
   */
  buildAgentConfig(clientData, clientId) {
    const systemPrompt = this.buildSystemPrompt(clientData, clientId);

    return {
      name: `${clientData.businessName} - RinglyPro AI`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt
          },
          first_message: `Hello! Thank you for calling ${clientData.businessName}. How may I help you today?`,
          language: clientData.language || 'en'
        },
        asr: {
          quality: 'high',
          provider: 'elevenlabs',
          keywords: [clientData.businessName]
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
          mode: 'turn'
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
      tools: this.buildToolsConfig(clientId, clientData.ownerPhone)
    };
  }

  /**
   * Build system prompt for the voice agent
   */
  buildSystemPrompt(clientData, clientId) {
    const {
      businessName,
      businessType,
      websiteUrl,
      businessDescription,
      services,
      ownerPhone,
      businessHours,
      timezone,
      businessDays
    } = clientData;

    let prompt = `You are the AI receptionist for ${businessName}.

## Your Role
You are a friendly, professional AI receptionist. Your job is to:
1. Answer calls warmly and professionally
2. Provide information about ${businessName} and its services
3. Help callers schedule appointments
4. Answer questions about the business
5. Transfer calls to ${ownerPhone} when the caller needs to speak with the owner or manager

## Business Information
- Business Name: ${businessName}`;

    if (businessType) {
      prompt += `\n- Industry: ${businessType}`;
    }

    if (websiteUrl) {
      prompt += `\n- Website: ${websiteUrl}`;
    }

    if (businessDescription) {
      prompt += `\n- About: ${businessDescription}`;
    }

    if (services) {
      const svcList = Array.isArray(services) ? services.join(', ') : services;
      prompt += `\n- Services: ${svcList}`;
    }

    if (businessHours) {
      if (typeof businessHours === 'object') {
        prompt += `\n- Hours: ${businessHours.open || '9:00 AM'} - ${businessHours.close || '5:00 PM'}`;
      } else {
        prompt += `\n- Hours: ${businessHours}`;
      }
    }

    if (timezone) {
      prompt += `\n- Timezone: ${timezone}`;
    }

    if (businessDays) {
      prompt += `\n- Business Days: ${businessDays}`;
    }

    prompt += `

## Booking Appointments
When a caller wants to schedule a visit or appointment:
1. Use the check_availability tool to find open slots
2. Offer 2-3 available time slots to the caller
3. Once they choose, collect their name, phone number, and reason for the visit
4. Use the book_appointment tool to confirm the booking
5. Confirm the appointment details back to the caller

## Call Transfer
If the caller:
- Asks to speak with the owner or manager
- Has a billing or account question you cannot answer
- Has an urgent matter or complaint
- Specifically requests a transfer

Transfer the call to: ${ownerPhone}

## Language
You speak fluent English and Spanish. Respond in whichever language the caller uses.

## Important Guidelines
- Be concise and natural in conversation
- Don't read out URLs or technical information
- If you don't know something, offer to take a message or transfer the call
- Always confirm appointment details before booking
- Be professional, warm, and helpful at all times`;

    return prompt;
  }

  /**
   * Build tools configuration for ElevenLabs agent
   * Uses the exact ElevenLabs API schema format
   */
  buildToolsConfig(clientId, ownerPhone) {
    const toolsWebhookUrl = `${this.webhookBaseUrl}/api/elevenlabs/tools`;

    return [
      {
        type: 'webhook',
        name: 'check_availability',
        description: 'Check available appointment slots. Use this to find open times before booking.',
        disable_interruptions: false,
        force_pre_tool_speech: 'auto',
        tool_call_sound: null,
        tool_call_sound_behavior: 'auto',
        tool_error_handling_mode: 'auto',
        execution_mode: 'immediate',
        api_schema: {
          url: toolsWebhookUrl,
          method: 'POST',
          path_params_schema: [],
          query_params_schema: [],
          request_body_schema: {
            id: 'body',
            type: 'object',
            description: 'Parameters for checking availability',
            properties: [
              {
                id: 'tool_name',
                type: 'string',
                value_type: 'constant',
                description: '',
                dynamic_variable: '',
                constant_value: 'check_availability',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'client_id',
                type: 'string',
                value_type: 'constant',
                description: '',
                dynamic_variable: '',
                constant_value: String(clientId),
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'days_ahead',
                type: 'string',
                value_type: 'constant',
                description: '',
                dynamic_variable: '',
                constant_value: '30',
                enum: null,
                is_system_provided: false,
                required: true
              }
            ],
            required: false,
            value_type: 'llm_prompt'
          },
          request_headers: [],
          auth_connection: null
        },
        assignments: [],
        response_timeout_secs: 20,
        dynamic_variables: {
          dynamic_variable_placeholders: {}
        }
      },
      {
        type: 'webhook',
        name: 'book_appointment',
        description: 'Book an appointment for the caller. Use this after confirming date, time, and customer details.',
        disable_interruptions: false,
        force_pre_tool_speech: 'auto',
        tool_call_sound: null,
        tool_call_sound_behavior: 'auto',
        tool_error_handling_mode: 'auto',
        execution_mode: 'immediate',
        api_schema: {
          url: toolsWebhookUrl,
          method: 'POST',
          path_params_schema: [],
          query_params_schema: [],
          request_body_schema: {
            id: 'body',
            type: 'object',
            description: 'Parameters for booking appointment',
            properties: [
              {
                id: 'tool_name',
                type: 'string',
                value_type: 'constant',
                description: '',
                dynamic_variable: '',
                constant_value: 'book_appointment',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'client_id',
                type: 'string',
                value_type: 'constant',
                description: '',
                dynamic_variable: '',
                constant_value: String(clientId),
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'customer_name',
                type: 'string',
                value_type: 'llm_prompt',
                description: "Customer's full name",
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'customer_phone',
                type: 'string',
                value_type: 'llm_prompt',
                description: "Customer's phone number",
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'customer_email',
                type: 'string',
                value_type: 'llm_prompt',
                description: "Customer's email address (optional)",
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: false
              },
              {
                id: 'appointment_date',
                type: 'string',
                value_type: 'llm_prompt',
                description: 'Appointment date in YYYY-MM-DD format',
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'appointment_time',
                type: 'string',
                value_type: 'llm_prompt',
                description: 'Appointment time in HH:MM format (24-hour)',
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: true
              },
              {
                id: 'purpose',
                type: 'string',
                value_type: 'llm_prompt',
                description: 'Reason for the appointment',
                dynamic_variable: '',
                constant_value: '',
                enum: null,
                is_system_provided: false,
                required: false
              }
            ],
            required: false,
            value_type: 'llm_prompt'
          },
          request_headers: [],
          auth_connection: null
        },
        assignments: [],
        response_timeout_secs: 30,
        dynamic_variables: {
          dynamic_variable_placeholders: {}
        }
      },
      {
        type: 'transfer_to_number',
        name: 'transfer_call',
        description: 'Transfer the call to the business owner or manager',
        transfer_to_number: {
          phone_number: ownerPhone || '+12232949184'
        }
      }
    ];
  }
}

module.exports = new ElevenLabsProvisioningService();
