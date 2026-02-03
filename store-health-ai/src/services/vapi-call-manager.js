'use strict';

const { AiCall, CallScript, Alert, Store, Task } = require('../../models');
const axios = require('axios');

/**
 * Vapi Call Manager
 *
 * Alternative to Twilio, using Vapi.ai for AI voice calls.
 * Vapi provides conversational AI with built-in speech recognition,
 * natural language understanding, and dynamic conversation flows.
 *
 * Features:
 * - Natural conversational AI (no TwiML needed)
 * - Built-in speech-to-text and text-to-speech
 * - Smart interruption handling
 * - Multi-turn conversations
 * - Function calling for dynamic responses
 *
 * @see https://docs.vapi.ai/
 */

class VapiCallManager {
  constructor() {
    this.apiKey = null;
    this.apiUrl = 'https://api.vapi.ai';
    this.initialized = false;
  }

  /**
   * Initialize Vapi client
   */
  initialize() {
    if (this.initialized) return;

    this.apiKey = process.env.VAPI_API_KEY;

    if (!this.apiKey) {
      console.warn('⚠️  VAPI_API_KEY not configured. Vapi calling will not work.');
      console.warn('   Add VAPI_API_KEY to your .env file to enable Vapi integration.');
      return;
    }

    console.log('✅ Vapi API initialized');
    this.initialized = true;
  }

  /**
   * Check if Vapi is configured and ready
   */
  isConfigured() {
    this.initialize();
    return this.initialized && this.apiKey;
  }

  /**
   * Schedule and initiate a call using Vapi
   *
   * @param {Object} escalation - Escalation record
   * @param {Object} alert - Alert record
   * @param {Object} store - Store record
   * @param {Object} kpiDefinition - KPI definition record
   * @returns {Promise<Object>} AiCall record
   */
  async scheduleCall(escalation, alert, store, kpiDefinition) {
    if (!this.isConfigured()) {
      throw new Error('Vapi is not configured. Please set VAPI_API_KEY in your environment.');
    }

    // Get appropriate call script based on severity
    const script = await this.getCallScript(alert.severity);

    if (!script) {
      throw new Error(`No call script found for severity: ${alert.severity}`);
    }

    // Create AI call record
    const aiCall = await AiCall.create({
      store_id: store.id,
      alert_id: alert.id,
      escalation_id: escalation.id,
      call_type: 'escalation_alert',
      call_provider: 'vapi',
      call_status: 'scheduled',
      to_phone: store.manager_phone,
      scheduled_at: new Date(),
      metadata: {
        severity: alert.severity,
        kpi_code: kpiDefinition.kpi_code,
        escalation_level: escalation.to_level
      }
    });

    // Initiate call with Vapi
    try {
      await this.initiateCallWithVapi(aiCall, script, store, kpiDefinition, alert);
      return aiCall;
    } catch (error) {
      // Update call record with error
      await aiCall.update({
        call_status: 'failed',
        error_message: error.message
      });
      throw error;
    }
  }

  /**
   * Initiate a call using Vapi API
   */
  async initiateCallWithVapi(aiCall, script, store, kpiDefinition, alert) {
    // Build conversation context
    const context = this.buildConversationContext(store, kpiDefinition, alert);

    // Create Vapi assistant configuration
    const assistantConfig = this.createAssistantConfig(script, context);

    // Make API call to Vapi
    const response = await axios.post(
      `${this.apiUrl}/call/phone`,
      {
        assistant: assistantConfig,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: store.manager_phone,
          name: store.manager_name || 'Store Manager'
        },
        metadata: {
          aiCallId: aiCall.id,
          storeId: store.id,
          alertId: alert.id
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update call record with Vapi call ID
    await aiCall.update({
      provider_call_id: response.data.id,
      call_status: 'initiated',
      initiated_at: new Date(),
      metadata: {
        ...aiCall.metadata,
        vapi_call_id: response.data.id,
        vapi_assistant_id: response.data.assistantId
      }
    });

    console.log(`📞 Vapi call initiated: ${response.data.id} to ${store.manager_phone}`);
    return response.data;
  }

  /**
   * Build conversation context for Vapi assistant
   */
  buildConversationContext(store, kpiDefinition, alert) {
    return {
      store_name: store.name,
      store_code: store.store_code,
      manager_name: store.manager_name || 'Manager',
      kpi_name: kpiDefinition.name,
      kpi_value: alert.kpi_value,
      threshold: alert.threshold_value,
      severity: alert.severity,
      alert_title: alert.title,
      alert_date: alert.alert_date
    };
  }

  /**
   * Create Vapi assistant configuration
   */
  createAssistantConfig(script, context) {
    // Replace template variables in script content
    let systemPrompt = this.interpolateScript(script.script_content, context);

    return {
      name: 'Store Health AI Assistant',
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        systemPrompt: systemPrompt,
        functions: [
          {
            name: 'acknowledge_alert',
            description: 'Called when the manager acknowledges the alert',
            parameters: {
              type: 'object',
              properties: {
                acknowledged: {
                  type: 'boolean',
                  description: 'Whether the manager acknowledged'
                },
                notes: {
                  type: 'string',
                  description: 'Any notes from the manager'
                }
              }
            }
          },
          {
            name: 'request_callback',
            description: 'Called when the manager requests a callback later',
            parameters: {
              type: 'object',
              properties: {
                callback_time: {
                  type: 'string',
                  description: 'When to call back (e.g., "2 hours", "tomorrow")'
                }
              }
            }
          }
        ]
      },
      voice: {
        provider: 'elevenlabs',
        voiceId: process.env.VAPI_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Default: Rachel
        stability: 0.5,
        similarityBoost: 0.75
      },
      firstMessage: this.interpolateScript(script.greeting, context),
      endCallMessage: 'Thank you for your time. Goodbye.',
      recordingEnabled: true,
      maxDurationSeconds: 300, // 5 minutes max
      silenceTimeoutSeconds: 30,
      responseDelaySeconds: 1,
      interruptionsEnabled: true
    };
  }

  /**
   * Interpolate template variables in script
   */
  interpolateScript(template, context) {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Handle Vapi webhook events
   *
   * Vapi sends webhooks for various events:
   * - call.started
   * - call.ended
   * - function-call (when AI calls a function)
   * - transcript (real-time transcription)
   */
  async handleWebhook(event) {
    const { type, call, metadata } = event;

    if (!metadata || !metadata.aiCallId) {
      console.warn('Vapi webhook missing aiCallId in metadata');
      return;
    }

    const aiCall = await AiCall.findByPk(metadata.aiCallId);
    if (!aiCall) {
      console.error(`AI Call not found: ${metadata.aiCallId}`);
      return;
    }

    switch (type) {
      case 'call.started':
        await this.handleCallStarted(aiCall, call);
        break;

      case 'call.ended':
        await this.handleCallEnded(aiCall, call);
        break;

      case 'function-call':
        await this.handleFunctionCall(aiCall, event);
        break;

      case 'transcript':
        await this.handleTranscript(aiCall, event);
        break;

      default:
        console.log(`Unhandled Vapi event type: ${type}`);
    }
  }

  /**
   * Handle call started event
   */
  async handleCallStarted(aiCall, call) {
    await aiCall.update({
      call_status: 'in-progress',
      answered_at: new Date(),
      metadata: {
        ...aiCall.metadata,
        call_started: new Date().toISOString()
      }
    });

    console.log(`📞 Vapi call started: ${aiCall.id}`);
  }

  /**
   * Handle call ended event
   */
  async handleCallEnded(aiCall, call) {
    const duration = call.duration || 0;
    const endedReason = call.endedReason || 'unknown';

    await aiCall.update({
      call_status: endedReason === 'customer-hangup' || endedReason === 'assistant-hangup'
        ? 'completed'
        : 'failed',
      completed_at: new Date(),
      call_duration: duration,
      metadata: {
        ...aiCall.metadata,
        ended_reason: endedReason,
        transcript: call.transcript || null,
        recording_url: call.recordingUrl || null
      }
    });

    console.log(`📞 Vapi call ended: ${aiCall.id} (${endedReason}, ${duration}s)`);
  }

  /**
   * Handle function call from AI
   *
   * This is called when the AI assistant calls one of the functions
   * we defined (acknowledge_alert or request_callback)
   */
  async handleFunctionCall(aiCall, event) {
    const { functionCall } = event;
    const { name, parameters } = functionCall;

    console.log(`🔧 Function called: ${name}`, parameters);

    if (name === 'acknowledge_alert') {
      await this.handleAcknowledgment(aiCall, parameters);
    } else if (name === 'request_callback') {
      await this.handleCallbackRequest(aiCall, parameters);
    }
  }

  /**
   * Handle alert acknowledgment
   */
  async handleAcknowledgment(aiCall, parameters) {
    // Update the associated alert
    if (aiCall.alert_id) {
      const alert = await Alert.findByPk(aiCall.alert_id);
      if (alert && alert.status === 'active') {
        await alert.update({
          status: 'acknowledged',
          acknowledged_at: new Date(),
          acknowledged_by: 'AI Call Response'
        });
      }
    }

    // Create a follow-up task
    if (aiCall.store_id && aiCall.alert_id) {
      await Task.create({
        store_id: aiCall.store_id,
        alert_id: aiCall.alert_id,
        kpi_definition_id: (await Alert.findByPk(aiCall.alert_id)).kpi_definition_id,
        title: 'Follow up on acknowledged alert',
        description: `Manager acknowledged alert via AI call. Notes: ${parameters.notes || 'None'}`,
        assigned_to_role: 'store_manager',
        priority: 2,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: 'pending'
      });
    }

    // Update call metadata
    await aiCall.update({
      outcome: 'acknowledged',
      metadata: {
        ...aiCall.metadata,
        acknowledged: true,
        acknowledgment_notes: parameters.notes || null
      }
    });

    console.log(`✅ Alert acknowledged via Vapi call: ${aiCall.id}`);
  }

  /**
   * Handle callback request
   */
  async handleCallbackRequest(aiCall, parameters) {
    // Schedule a callback
    const callbackTime = this.parseCallbackTime(parameters.callback_time);

    await aiCall.update({
      outcome: 'callback_requested',
      metadata: {
        ...aiCall.metadata,
        callback_requested: true,
        callback_time: callbackTime.toISOString()
      }
    });

    // Create a task to call back
    if (aiCall.store_id) {
      await Task.create({
        store_id: aiCall.store_id,
        alert_id: aiCall.alert_id,
        title: 'Call back store manager',
        description: `Manager requested callback at ${callbackTime.toLocaleString()}`,
        assigned_to_role: 'regional_manager',
        priority: 2,
        due_date: callbackTime,
        status: 'pending'
      });
    }

    console.log(`📅 Callback requested: ${aiCall.id} at ${callbackTime}`);
  }

  /**
   * Handle transcript updates
   */
  async handleTranscript(aiCall, event) {
    const { transcript } = event;

    // Store transcript in metadata
    await aiCall.update({
      metadata: {
        ...aiCall.metadata,
        partial_transcript: transcript
      }
    });
  }

  /**
   * Parse callback time string to Date
   */
  parseCallbackTime(timeStr) {
    const now = new Date();

    if (timeStr.includes('hour')) {
      const hours = parseInt(timeStr) || 2;
      return new Date(now.getTime() + hours * 60 * 60 * 1000);
    } else if (timeStr.includes('tomorrow')) {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else {
      // Default: 2 hours
      return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }
  }

  /**
   * Get call script by severity
   */
  async getCallScript(severity) {
    const scriptType = severity === 'red' || severity === 'critical' ? 'red' : 'yellow';

    const script = await CallScript.findOne({
      where: {
        script_type: scriptType,
        is_active: true
      }
    });

    return script;
  }

  /**
   * Test call using Vapi
   */
  async testCall(phoneNumber, message) {
    if (!this.isConfigured()) {
      throw new Error('Vapi is not configured. Please set VAPI_API_KEY in your environment.');
    }

    const response = await axios.post(
      `${this.apiUrl}/call/phone`,
      {
        assistant: {
          name: 'Test Assistant',
          model: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            systemPrompt: `You are a friendly test assistant. Say: "${message}" and then ask if the user can hear you clearly.`
          },
          voice: {
            provider: 'elevenlabs',
            voiceId: process.env.VAPI_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
          },
          firstMessage: message,
          maxDurationSeconds: 60
        },
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: phoneNumber
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      provider: 'vapi',
      call_id: response.data.id,
      status: 'initiated',
      message: 'Test call initiated successfully with Vapi'
    };
  }

  /**
   * Get call details from Vapi
   */
  async getCallDetails(vapiCallId) {
    if (!this.isConfigured()) {
      throw new Error('Vapi is not configured');
    }

    const response = await axios.get(
      `${this.apiUrl}/call/${vapiCallId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      }
    );

    return response.data;
  }
}

// Export singleton instance
const vapiCallManager = new VapiCallManager();
module.exports = vapiCallManager;
