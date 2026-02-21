// kancho-ai/services/kancho-elevenlabs-provisioning.js
// ElevenLabs Agent Auto-Provisioning for KanchoAI martial arts schools
// Adapted from docs/ELEVENLABS_AUTO_PROVISIONING_SPEC.md

const axios = require('axios');

class KanchoElevenLabsProvisioning {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    // Voice & model config (same as RinglyPro spec)
    this.voiceId = 'zl7szWVBXnpgrJmAalgz'; // Lina
    this.llmModel = 'gemini-2.5-flash';
    this.ttsModel = 'eleven_turbo_v2';
  }

  /**
   * Main entry point: provision complete ElevenLabs agent for a martial arts school
   * @param {Object} schoolData - { schoolName, ownerPhone, martialArtType, timezone, website }
   * @param {string} twilioNumber - Purchased Twilio number (e.g., +15551234567)
   * @param {string} twilioSid - Twilio number SID (e.g., PN...)
   * @param {number} clientId - RinglyPro client ID (for tool webhooks)
   * @returns {Object} { success, agentId, phoneNumberId, error }
   */
  async provisionAgentForSchool(schoolData, twilioNumber, twilioSid, clientId) {
    try {
      console.log(`[KanchoElevenLabs] Starting agent provisioning for: ${schoolData.schoolName}`);

      // Step 1: Create the agent
      const agentConfig = this.buildAgentConfig(schoolData, clientId);
      const agentResult = await this.createAgent(agentConfig);
      if (!agentResult.success) {
        throw new Error(`Agent creation failed: ${agentResult.error}`);
      }
      console.log(`[KanchoElevenLabs] Agent created: ${agentResult.agentId}`);

      // Step 2: Import Twilio number to ElevenLabs
      const phoneResult = await this.importPhoneNumber(
        twilioNumber,
        twilioSid,
        `${schoolData.schoolName} - KanchoAI`
      );
      if (!phoneResult.success) {
        throw new Error(`Phone import failed: ${phoneResult.error}`);
      }
      console.log(`[KanchoElevenLabs] Phone imported: ${phoneResult.phoneNumberId}`);

      // Step 3: Link agent to phone number
      const linkResult = await this.linkAgentToNumber(
        phoneResult.phoneNumberId,
        agentResult.agentId
      );
      if (!linkResult.success) {
        throw new Error(`Phone-agent link failed: ${linkResult.error}`);
      }
      console.log(`[KanchoElevenLabs] Agent linked to phone number`);

      return {
        success: true,
        agentId: agentResult.agentId,
        phoneNumberId: phoneResult.phoneNumberId
      };

    } catch (error) {
      console.error(`[KanchoElevenLabs] Provisioning failed:`, error.message);
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
      console.error('[KanchoElevenLabs] Create agent error:', error.response?.data || error.message);
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
          },
          timeout: 15000
        }
      );

      return {
        success: true,
        phoneNumberId: response.data.phone_number_id
      };
    } catch (error) {
      console.error('[KanchoElevenLabs] Import phone error:', error.response?.data || error.message);
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
      console.error('[KanchoElevenLabs] Link agent error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }

  /**
   * Build complete agent config for ElevenLabs API
   */
  buildAgentConfig(schoolData, clientId) {
    const { schoolName } = schoolData;
    const systemPrompt = this.buildMartialArtsPrompt(schoolData, clientId);

    return {
      name: `${schoolName} - Kancho AI`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt
          },
          first_message: `Hello! Thank you for calling ${schoolName}. This is your Kancho AI assistant. How may I help you today?`,
          language: 'en'
        },
        asr: {
          quality: 'high',
          provider: 'elevenlabs',
          keywords: [schoolName]
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
      tools: this.buildToolsConfig(clientId, schoolData.ownerPhone)
    };
  }

  /**
   * Build martial-arts-specific system prompt
   */
  buildMartialArtsPrompt(schoolData, clientId) {
    const {
      schoolName,
      ownerPhone,
      martialArtType,
      timezone,
      website
    } = schoolData;

    const tz = timezone || 'America/New_York';
    const artType = martialArtType || 'martial arts';

    let prompt = `You are the AI receptionist for ${schoolName}, a ${artType} school.

## Your Role
You are a friendly, professional, and respectful AI receptionist. Your job is to:
1. Answer calls warmly and professionally
2. Provide information about ${schoolName} and its programs
3. Help callers schedule trial classes or introductory lessons
4. Answer questions about class schedules, programs, and belt ranks
5. Transfer calls to ${ownerPhone} when the caller needs to speak with the instructor or owner

## School Information
- School Name: ${schoolName}
- Martial Art: ${artType}
- Timezone: ${tz}`;

    if (website) {
      prompt += `\n- Website: ${website}`;
    }

    prompt += `

## Common Inquiries
When callers ask about:
- **Trial classes**: Offer to book a free introductory lesson using the booking tool
- **Class schedules**: Use check_availability to show available times
- **Pricing/membership**: Let them know the instructor can discuss pricing in detail, offer to schedule a visit
- **Belt testing/promotions**: Let them know the instructor handles belt testing schedules, offer to transfer
- **Kids programs**: Mention the school offers youth programs and offer to schedule a trial class

## Booking Appointments
When a caller wants to visit, try a class, or schedule a lesson:
1. Use the check_availability tool to find open slots
2. Always pass client_id: "${clientId}" to all tools
3. Offer 2-3 available time slots
4. Use the book_appointment tool to confirm the booking
5. Send an SMS confirmation using the send_sms tool

## Call Transfer
If the caller:
- Asks to speak with the instructor, sensei, or owner
- Has a billing or membership question you cannot answer
- Has an urgent matter or complaint
- Specifically requests a transfer

Transfer the call to: ${ownerPhone}

## Language
You speak fluent English and Spanish. Respond in whichever language the caller uses.

## Important Guidelines
- Be concise and natural in conversation
- Use respectful martial arts terminology when appropriate
- Don't read out URLs or technical information
- If you don't know something, offer to take a message or transfer the call
- Always confirm appointment details before booking
- Be encouraging to prospective students — martial arts training is a positive journey
- Be patient with callers who need extra time`;

    return prompt;
  }

  /**
   * Build tools configuration for ElevenLabs agent
   * All tools point to the existing /api/elevenlabs/tools endpoint
   */
  buildToolsConfig(clientId, ownerPhone) {
    const toolsWebhookUrl = `${this.webhookBaseUrl}/api/elevenlabs/tools`;

    return [
      {
        type: 'webhook',
        name: 'get_business_info',
        description: 'Get information about the martial arts school for the current call',
        webhook: {
          url: toolsWebhookUrl,
          method: 'POST'
        },
        parameters: {
          type: 'object',
          properties: {
            client_id: {
              type: 'string',
              description: 'The client ID',
              const: String(clientId)
            }
          },
          required: ['client_id']
        }
      },
      {
        type: 'webhook',
        name: 'check_availability',
        description: 'Check available time slots for classes, trial lessons, or appointments',
        webhook: {
          url: toolsWebhookUrl,
          method: 'POST'
        },
        parameters: {
          type: 'object',
          properties: {
            client_id: {
              type: 'string',
              description: 'The client ID',
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
        description: 'Book a trial class, introductory lesson, or appointment for the caller',
        webhook: {
          url: toolsWebhookUrl,
          method: 'POST'
        },
        parameters: {
          type: 'object',
          properties: {
            client_id: {
              type: 'string',
              description: 'The client ID',
              const: String(clientId)
            },
            customer_name: {
              type: 'string',
              description: 'Full name of the caller'
            },
            customer_phone: {
              type: 'string',
              description: 'Caller phone number'
            },
            customer_email: {
              type: 'string',
              description: 'Caller email (optional)'
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
              description: 'Reason for the visit (e.g., trial class, introductory lesson, belt testing)'
            }
          },
          required: ['client_id', 'customer_name', 'customer_phone', 'appointment_date', 'appointment_time']
        }
      },
      {
        type: 'webhook',
        name: 'send_sms',
        description: 'Send an SMS confirmation or message to a phone number',
        webhook: {
          url: toolsWebhookUrl,
          method: 'POST'
        },
        parameters: {
          type: 'object',
          properties: {
            client_id: {
              type: 'string',
              description: 'The client ID',
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
        description: 'Transfer the call to the instructor or school owner',
        transfer_to_number: {
          phone_number: ownerPhone || '+12232949184'
        }
      }
    ];
  }
}

module.exports = new KanchoElevenLabsProvisioning();
