'use strict';

const twilio = require('twilio');
const { AiCall, CallScript, Store, KpiDefinition, Alert, Escalation } = require('../../models');

/**
 * Voice Call Manager Service
 * Manages AI voice calls to store managers using Twilio
 */
class VoiceCallManagerService {
  constructor() {
    this.twilioClient = null;
    this.twilioEnabled = false;
    this.initializeTwilio();
  }

  /**
   * Initialize Twilio client
   */
  initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && phoneNumber) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
        this.twilioPhoneNumber = phoneNumber;
        this.twilioEnabled = true;
        console.log('✓ Twilio initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Twilio:', error.message);
        this.twilioEnabled = false;
      }
    } else {
      console.log('⚠️  Twilio not configured - voice calls disabled');
      console.log('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env');
      this.twilioEnabled = false;
    }
  }

  /**
   * Schedule an AI voice call for Level 3 escalation
   * @param {object} escalation - Escalation object
   * @param {object} alert - Alert object
   * @param {object} store - Store object
   * @param {object} kpiDefinition - KPI definition
   * @returns {Promise<object>} Scheduled call
   */
  async scheduleCall(escalation, alert, store, kpiDefinition) {
    console.log(`📞 Scheduling AI call for store ${store.name}`);

    // Get appropriate call script
    const script = await this.getCallScript(store.organization_id, alert.severity);

    if (!script) {
      throw new Error(`No call script found for severity: ${alert.severity}`);
    }

    // Create AI call record
    const aiCall = await AiCall.create({
      store_id: store.id,
      alert_id: alert.id,
      escalation_id: escalation.id,
      call_type: alert.severity,
      call_status: 'scheduled',
      recipient_name: store.manager_name,
      recipient_phone: store.manager_phone,
      metadata: {
        kpi_code: kpiDefinition.kpi_code,
        kpi_name: kpiDefinition.name,
        variance_pct: alert.metadata?.variance_pct,
        script_id: script.id,
        script_version: script.version
      }
    });

    console.log(`✓ AI call ${aiCall.id} scheduled for ${store.manager_name} at ${store.manager_phone}`);

    // Initiate call immediately if Twilio is enabled
    if (this.twilioEnabled) {
      try {
        await this.initiateCallWithTwilio(aiCall, script, store, kpiDefinition, alert);
      } catch (error) {
        console.error(`Failed to initiate call ${aiCall.id}:`, error.message);
        await aiCall.update({
          call_status: 'failed',
          metadata: {
            ...aiCall.metadata,
            error: error.message
          }
        });
      }
    } else {
      console.log('⚠️  Twilio not enabled - call logged but not initiated');
    }

    return aiCall;
  }

  /**
   * Initiate call using Twilio
   * @param {object} aiCall - AI call record
   * @param {object} script - Call script
   * @param {object} store - Store object
   * @param {object} kpiDefinition - KPI definition
   * @param {object} alert - Alert object
   */
  async initiateCallWithTwilio(aiCall, script, store, kpiDefinition, alert) {
    if (!this.twilioEnabled) {
      throw new Error('Twilio is not enabled');
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';

    // Create Twilio call
    const call = await this.twilioClient.calls.create({
      to: store.manager_phone,
      from: this.twilioPhoneNumber,
      url: `${baseUrl}/api/v1/voice/twiml/${aiCall.id}`,
      statusCallback: `${baseUrl}/api/v1/voice/status/${aiCall.id}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: true,
      recordingStatusCallback: `${baseUrl}/api/v1/voice/recording/${aiCall.id}`,
      recordingStatusCallbackMethod: 'POST',
      timeout: 30,
      machineDetection: 'Enable',
      machineDetectionTimeout: 5
    });

    // Update call record with Twilio SID
    await aiCall.update({
      external_call_id: call.sid,
      call_status: 'in_progress',
      call_initiated_at: new Date(),
      metadata: {
        ...aiCall.metadata,
        twilio_sid: call.sid,
        twilio_status: call.status
      }
    });

    console.log(`✓ Twilio call initiated: ${call.sid}`);

    return call;
  }

  /**
   * Get call script for call type
   * @param {number} organizationId - Organization ID
   * @param {string} callType - Call type (green/yellow/red)
   * @returns {Promise<object>} Call script
   */
  async getCallScript(organizationId, callType) {
    return await CallScript.findOne({
      where: {
        organization_id: organizationId,
        script_type: callType,
        is_active: true
      },
      order: [['version', 'DESC']]
    });
  }

  /**
   * Generate script with variables replaced
   * @param {object} script - Call script template
   * @param {object} variables - Variables to replace
   * @returns {string} Processed script
   */
  generateScriptContent(script, variables) {
    let content = script.script_content;

    // Replace all variables in format {variable_name}
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      content = content.replace(regex, variables[key]);
    });

    return content;
  }

  /**
   * Generate TwiML for call
   * @param {object} aiCall - AI call record
   * @returns {Promise<string>} TwiML XML
   */
  async generateTwiML(aiCall) {
    // Get related data
    const [store, alert, script] = await Promise.all([
      Store.findByPk(aiCall.store_id),
      Alert.findByPk(aiCall.alert_id, {
        include: [{ model: KpiDefinition, as: 'kpiDefinition' }]
      }),
      CallScript.findByPk(aiCall.metadata.script_id)
    ]);

    if (!store || !alert || !script) {
      throw new Error('Missing required data for TwiML generation');
    }

    // Prepare variables for script
    const variables = {
      store_name: store.name,
      manager_name: store.manager_name,
      kpi_name: alert.kpiDefinition.name,
      variance: Math.abs(alert.metadata.variance_pct || 0).toFixed(1)
    };

    // Generate script content
    const scriptContent = this.generateScriptContent(script, variables);

    // Build TwiML
    const twiml = new twilio.twiml.VoiceResponse();

    // Pause briefly
    twiml.pause({ length: 1 });

    // Speak the script
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, scriptContent);

    // For red calls, gather response
    if (aiCall.call_type === 'red') {
      const gather = twiml.gather({
        input: 'speech',
        timeout: 5,
        speechTimeout: 'auto',
        action: `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/voice/response/${aiCall.id}`,
        method: 'POST'
      });

      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Please say yes if you need assistance, or later if you will handle it yourself.');
    }

    // Thank you and hang up
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Thank you. Goodbye.');

    twiml.hangup();

    return twiml.toString();
  }

  /**
   * Handle call status update from Twilio
   * @param {object} callId - AI call ID
   * @param {object} statusData - Twilio status callback data
   */
  async handleCallStatus(callId, statusData) {
    const aiCall = await AiCall.findByPk(callId);

    if (!aiCall) {
      throw new Error('AI call not found');
    }

    const updates = {
      metadata: {
        ...aiCall.metadata,
        last_status_update: new Date(),
        twilio_status: statusData.CallStatus,
        call_duration: statusData.CallDuration
      }
    };

    // Map Twilio status to our status
    switch (statusData.CallStatus) {
      case 'initiated':
      case 'ringing':
        updates.call_status = 'in_progress';
        break;

      case 'answered':
      case 'in-progress':
        updates.call_status = 'in_progress';
        if (!aiCall.call_connected_at) {
          updates.call_connected_at = new Date();
        }
        break;

      case 'completed':
        updates.call_status = 'completed';
        updates.call_ended_at = new Date();
        if (statusData.CallDuration) {
          updates.call_duration_seconds = parseInt(statusData.CallDuration);
        }
        break;

      case 'busy':
      case 'failed':
      case 'canceled':
        updates.call_status = 'failed';
        updates.call_ended_at = new Date();
        break;

      case 'no-answer':
        updates.call_status = 'no_answer';
        updates.call_ended_at = new Date();
        break;
    }

    await aiCall.update(updates);

    console.log(`✓ Call ${callId} status updated: ${statusData.CallStatus}`);

    return aiCall;
  }

  /**
   * Handle call response (speech input)
   * @param {object} callId - AI call ID
   * @param {object} responseData - Twilio gather callback data
   */
  async handleCallResponse(callId, responseData) {
    const aiCall = await AiCall.findByPk(callId);

    if (!aiCall) {
      throw new Error('AI call not found');
    }

    const speechResult = responseData.SpeechResult || '';
    const confidence = responseData.Confidence || 0;

    // Determine response based on speech
    let response = 'other';
    if (speechResult.toLowerCase().includes('yes')) {
      response = 'yes';
    } else if (speechResult.toLowerCase().includes('later')) {
      response = 'later';
    }

    await aiCall.update({
      response,
      metadata: {
        ...aiCall.metadata,
        speech_result: speechResult,
        speech_confidence: confidence
      },
      follow_up_required: response === 'yes'
    });

    console.log(`✓ Call ${callId} response recorded: ${response}`);

    return aiCall;
  }

  /**
   * Handle recording callback
   * @param {object} callId - AI call ID
   * @param {object} recordingData - Twilio recording callback data
   */
  async handleRecording(callId, recordingData) {
    const aiCall = await AiCall.findByPk(callId);

    if (!aiCall) {
      throw new Error('AI call not found');
    }

    await aiCall.update({
      recording_url: recordingData.RecordingUrl,
      metadata: {
        ...aiCall.metadata,
        recording_sid: recordingData.RecordingSid,
        recording_duration: recordingData.RecordingDuration
      }
    });

    console.log(`✓ Call ${callId} recording saved: ${recordingData.RecordingSid}`);

    return aiCall;
  }

  /**
   * Get call history for a store
   * @param {number} storeId - Store ID
   * @param {number} limit - Number of results
   * @returns {Promise<array>} Call history
   */
  async getCallHistory(storeId, limit = 50) {
    return await AiCall.findAll({
      where: { store_id: storeId },
      include: [
        {
          model: Alert,
          as: 'alert',
          include: [
            {
              model: KpiDefinition,
              as: 'kpiDefinition',
              attributes: ['kpi_code', 'name']
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Get call by ID with full details
   * @param {number} callId - Call ID
   * @returns {Promise<object>} Call details
   */
  async getCallDetails(callId) {
    return await AiCall.findByPk(callId, {
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'store_code', 'name', 'manager_name']
        },
        {
          model: Alert,
          as: 'alert',
          include: [
            {
              model: KpiDefinition,
              as: 'kpiDefinition'
            }
          ]
        },
        {
          model: Escalation,
          as: 'escalation'
        }
      ]
    });
  }

  /**
   * Make an outbound call using ElevenLabs Conversational AI Agent
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message context (for logging only, agent uses its own prompts)
   * @returns {Promise<object>} Call result
   */
  async makeElevenLabsCall(phoneNumber, message = '') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID || 'agent_3701kgg7d7v3e1vbjsxv0p5pn48e';
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID || 'phnum_1901kghs951vf99vj61hna48pp7v';

    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    if (!agentId) {
      throw new Error('ELEVENLABS_AGENT_ID not configured');
    }

    try {
      console.log(`🤖 Initiating ElevenLabs AI call to ${phoneNumber} with agent ${agentId}`);

      // ElevenLabs Twilio Outbound Call API
      const requestBody = {
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId, // ElevenLabs phone number ID
        to_number: phoneNumber // Recipient's phone number
      };

      console.log(`📞 ElevenLabs request:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error(`❌ ElevenLabs API error: ${JSON.stringify(responseData)}`);
        throw new Error(responseData.detail?.message || responseData.error || 'ElevenLabs API error');
      }

      console.log(`✅ ElevenLabs call initiated: ${JSON.stringify(responseData)}`);

      return {
        success: true,
        callSid: responseData.conversation_id || responseData.call_id,
        phone: phoneNumber,
        status: 'initiated',
        provider: 'elevenlabs',
        response: responseData
      };

    } catch (error) {
      console.error(`❌ ElevenLabs call error: ${error.message}`);

      return {
        success: false,
        error: error.message,
        phone: phoneNumber,
        provider: 'elevenlabs'
      };
    }
  }

  /**
   * Test call (for development/testing)
   * @param {string} phoneNumber - Phone number to call
   * @param {string} message - Test message
   */
  async testCall(phoneNumber, message = 'This is a test call from Store Health AI.') {
    // Check if ElevenLabs is configured (preferred)
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID) {
      console.log('🤖 Using ElevenLabs AI for test call');
      return await this.makeElevenLabsCall(phoneNumber, message);
    }

    // Fallback to traditional Twilio
    if (!this.twilioEnabled) {
      throw new Error('Neither ElevenLabs nor Twilio is configured');
    }

    console.log('📞 Using traditional Twilio for test call');
    const call = await this.twilioClient.calls.create({
      to: phoneNumber,
      from: this.twilioPhoneNumber,
      twiml: `<Response><Say voice="alice">${message}</Say></Response>`,
      timeout: 30
    });

    console.log(`✓ Test call initiated: ${call.sid}`);

    return call;
  }
}

module.exports = new VoiceCallManagerService();
