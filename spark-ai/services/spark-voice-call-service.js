// spark-ai/services/spark-voice-call-service.js
// Twilio + ElevenLabs outbound calling service for Spark AI

const twilio = require('twilio');

class SparkVoiceCallService {
  constructor() {
    this.twilioClient = null;
    this.twilioPhoneNumber = null;
    this.twilioEnabled = false;
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    this.initializeTwilio();
  }

  initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.AGENT_PHONE_NUMBER;

    if (accountSid && authToken && phoneNumber) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
        this.twilioPhoneNumber = phoneNumber;
        this.twilioEnabled = true;
        console.log('[SparkVoice] Twilio initialized successfully');
      } catch (error) {
        console.error('[SparkVoice] Failed to initialize Twilio:', error.message);
      }
    } else {
      console.warn('[SparkVoice] Twilio credentials not configured - outbound calling disabled');
    }
  }

  /**
   * Validate phone number format
   * @param {string} phone - Phone number to validate
   * @returns {string|null} - Formatted phone number or null if invalid
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Handle US numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    if (digits.length > 10 && digits.length <= 15) {
      return `+${digits}`;
    }

    return null;
  }

  /**
   * Initiate an outbound call using Twilio with ElevenLabs AI
   * @param {Object} options - Call options
   * @param {number} options.school_id - School ID
   * @param {string} options.phone - Target phone number
   * @param {string} options.agent - Agent type ('sensei' or 'maestro')
   * @param {string} options.call_type - Type of call (lead_followup, retention, etc.)
   * @param {number} options.lead_id - Optional lead ID
   * @param {number} options.student_id - Optional student ID
   * @param {string} options.context - Optional context for the call
   * @returns {Promise<Object>} - Call result with Twilio SID
   */
  async initiateOutboundCall(options) {
    const { school_id, phone, agent = 'sensei', call_type, lead_id, student_id, context } = options;

    if (!this.twilioEnabled) {
      throw new Error('Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    if (!formattedPhone) {
      throw new Error(`Invalid phone number format: ${phone}`);
    }

    // Build the TwiML URL with query parameters for context
    const twimlUrl = new URL(`${this.webhookBaseUrl}/spark/api/v1/voice/twiml`);
    twimlUrl.searchParams.set('school_id', school_id);
    twimlUrl.searchParams.set('agent', agent);
    twimlUrl.searchParams.set('call_type', call_type);
    if (lead_id) twimlUrl.searchParams.set('lead_id', lead_id);
    if (student_id) twimlUrl.searchParams.set('student_id', student_id);
    if (context) twimlUrl.searchParams.set('context', encodeURIComponent(context));

    // Status callback URL for tracking call progress
    const statusCallbackUrl = `${this.webhookBaseUrl}/spark/api/v1/voice/twilio-status`;

    try {
      const call = await this.twilioClient.calls.create({
        to: formattedPhone,
        from: this.twilioPhoneNumber,
        url: twimlUrl.toString(),
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: `${this.webhookBaseUrl}/spark/api/v1/voice/recording-status`,
        recordingStatusCallbackMethod: 'POST'
      });

      console.log(`[SparkVoice] Outbound call initiated: ${call.sid} to ${formattedPhone}`);

      return {
        success: true,
        twilio_sid: call.sid,
        status: call.status,
        to: formattedPhone,
        from: this.twilioPhoneNumber,
        school_id,
        agent,
        call_type
      };
    } catch (error) {
      console.error('[SparkVoice] Failed to initiate call:', error.message);
      throw error;
    }
  }

  /**
   * Get call status from Twilio
   * @param {string} callSid - Twilio Call SID
   * @returns {Promise<Object>} - Call details
   */
  async getCallStatus(callSid) {
    if (!this.twilioEnabled) {
      throw new Error('Twilio is not configured');
    }

    try {
      const call = await this.twilioClient.calls(callSid).fetch();
      return {
        sid: call.sid,
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        direction: call.direction,
        answeredBy: call.answeredBy
      };
    } catch (error) {
      console.error('[SparkVoice] Failed to get call status:', error.message);
      throw error;
    }
  }

  /**
   * End an active call
   * @param {string} callSid - Twilio Call SID
   * @returns {Promise<Object>} - Updated call details
   */
  async endCall(callSid) {
    if (!this.twilioEnabled) {
      throw new Error('Twilio is not configured');
    }

    try {
      const call = await this.twilioClient.calls(callSid).update({
        status: 'completed'
      });
      console.log(`[SparkVoice] Call ended: ${callSid}`);
      return { success: true, status: call.status };
    } catch (error) {
      console.error('[SparkVoice] Failed to end call:', error.message);
      throw error;
    }
  }

  /**
   * Get recording URL for a call
   * @param {string} callSid - Twilio Call SID
   * @returns {Promise<string|null>} - Recording URL or null
   */
  async getRecordingUrl(callSid) {
    if (!this.twilioEnabled) {
      return null;
    }

    try {
      const recordings = await this.twilioClient.recordings.list({
        callSid: callSid,
        limit: 1
      });

      if (recordings.length > 0) {
        return `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`;
      }
      return null;
    } catch (error) {
      console.error('[SparkVoice] Failed to get recording:', error.message);
      return null;
    }
  }

  /**
   * Map Twilio call status to SparkAiCall status
   * @param {string} twilioStatus - Twilio status string
   * @returns {string} - SparkAiCall status
   */
  mapTwilioStatus(twilioStatus) {
    const statusMap = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no_answer',
      'canceled': 'failed'
    };
    return statusMap[twilioStatus] || twilioStatus;
  }

  /**
   * Check if service is ready
   * @returns {boolean}
   */
  isReady() {
    return this.twilioEnabled;
  }
}

// Export singleton instance
module.exports = new SparkVoiceCallService();
