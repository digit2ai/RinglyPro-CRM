// Outbound Caller Service - Twilio Integration
const twilio = require('twilio');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const tokenService = require('./tokenService');

class OutboundCallerService {
  constructor() {
    this.twilioClient = null;
    this.twilioNumber = null;
    this.agentNumber = null;
    this.callingInterval = null;
    this.currentLeads = [];
    this.currentIndex = 0;
    this.isRunning = false;
    this.callLogs = [];
    this.intervalDelay = 120000; // 2 minutes default
    this.currentUserId = null; // Track userId for token deduction

    this.initializeTwilio();
  }

  initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioNumber = process.env.TWILIO_PHONE_NUMBER;
    this.agentNumber = process.env.AGENT_PHONE_NUMBER;

    if (accountSid && authToken && this.twilioNumber) {
      this.twilioClient = twilio(accountSid, authToken);
      logger.info('Twilio client initialized successfully');
    } else {
      logger.warn('Twilio credentials not configured - outbound calling disabled');
    }
  }

  /**
   * Validate phone number format
   */
  validatePhone(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/[^\d]/g, '');

    // Must be 10 or 11 digits
    if (cleaned.length !== 10 && cleaned.length !== 11) {
      return { valid: false, error: 'Invalid phone number length' };
    }

    // Normalize to 11 digits with country code
    const normalized = cleaned.length === 10 ? '1' + cleaned : cleaned;

    // Check for invalid area codes
    const invalidAreaCodes = ['555', '911', '000', '111'];
    const areaCode = normalized.substring(1, 4);

    if (invalidAreaCodes.includes(areaCode)) {
      return { valid: false, error: 'Invalid area code' };
    }

    // Check for test numbers
    if (normalized.startsWith('1555') || normalized === '15555555555') {
      return { valid: false, error: 'Test number detected' };
    }

    return { valid: true, normalized: '+' + normalized };
  }

  /**
   * Check if current time is within business hours (8am-6pm EST, Mon-Fri)
   */
  isBusinessHours() {
    try {
      const now = new Date();

      // Get EST/EDT time using Intl.DateTimeFormat
      const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
        weekday: 'short'
      });

      const parts = estFormatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value;
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');

      logger.info(`📅 Business hours check: ${weekday} ${hour}:00 EST`);

      // Check if Monday-Friday
      const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      if (!validDays.includes(weekday)) {
        logger.info(`❌ Outside business days: ${weekday}`);
        return false;
      }

      // Check if 8am-6pm EST (8-17, stops before 6pm)
      if (hour < 8 || hour >= 18) {
        logger.info(`❌ Outside business hours: ${hour}:00 EST (allowed 8-17)`);
        return false;
      }

      logger.info(`✅ Within business hours: ${weekday} ${hour}:00 EST`);
      return true;
    } catch (error) {
      logger.error('Error checking business hours:', error.message);
      return false; // Fail safe - don't call if error
    }
  }

  /**
   * Make a single outbound call
   */
  async makeCall(phoneNumber, leadData = {}, userId = null, clientId = null) {
    if (!this.twilioClient) {
      throw new Error('Twilio not configured');
    }

    // Check token balance and deduct 1 token if userId provided
    if (userId) {
      try {
        await tokenService.deductTokens(
          userId,
          'outbound_call_single',
          {
            phone: phoneNumber,
            lead_name: leadData.name,
            lead_category: leadData.category
          }
        );
        logger.info(`✅ Deducted 1 token from user ${userId} for outbound call`);
      } catch (error) {
        logger.error(`❌ Token deduction failed for user ${userId}:`, error.message);
        throw new Error(`Insufficient tokens: ${error.message}`);
      }
    }

    // Check business hours - TCPA compliance
    // Allow bypass for testing with bypassBusinessHours flag
    const bypassHours = leadData?.bypassBusinessHours === true;

    if (!bypassHours && !this.isBusinessHours()) {
      // Get current time for better error message
      const now = new Date();
      const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        weekday: 'short'
      });
      const currentTime = estFormatter.format(now);

      throw new Error(`Call cannot be made After Hours - TCPA Compliant. Current time: ${currentTime}. Business hours: Mon-Fri 8AM-6PM EST.`);
    }

    const validation = this.validatePhone(phoneNumber);
    if (!validation.valid) {
      logger.warn(`Invalid phone number ${phoneNumber}: ${validation.error}`);
      return {
        success: false,
        error: validation.error,
        phone: phoneNumber
      };
    }

    try {
      logger.info(`Making call to ${validation.normalized}${clientId ? ` for client ${clientId}` : ''}`);

      // Fetch client's Twilio number if clientId provided
      let fromNumber = this.twilioNumber; // Default to environment variable

      if (clientId) {
        try {
          const [clientData] = await sequelize.query(
            'SELECT ringlypro_number FROM clients WHERE id = :clientId',
            {
              replacements: { clientId },
              type: QueryTypes.SELECT
            }
          );

          if (clientData && clientData.ringlypro_number) {
            fromNumber = clientData.ringlypro_number;
            logger.info(`Using client's Twilio number: ${fromNumber}`);
          } else {
            logger.warn(`Client ${clientId} has no ringlypro_number, using default: ${this.twilioNumber}`);
          }
        } catch (error) {
          logger.error(`Error fetching client Twilio number: ${error.message}`);
          // Fall back to default number
        }
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const voiceUrl = clientId
        ? `${baseUrl}/api/outbound-caller/voice?clientId=${clientId}`
        : `${baseUrl}/api/outbound-caller/voice`;

      const call = await this.twilioClient.calls.create({
        to: validation.normalized,
        from: fromNumber,
        url: voiceUrl,
        statusCallback: `${baseUrl}/api/outbound-caller/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        machineDetection: 'DetectMessageEnd', // Voicemail detection
        machineDetectionTimeout: 5000,
        record: false
      });

      const logEntry = {
        callSid: call.sid,
        phone: validation.normalized,
        leadData,
        status: 'initiated',
        timestamp: new Date(),
        direction: 'outbound'
      };

      this.callLogs.push(logEntry);

      logger.info(`Call initiated: ${call.sid} to ${validation.normalized}`);

      return {
        success: true,
        callSid: call.sid,
        phone: validation.normalized,
        status: call.status
      };

    } catch (error) {
      logger.error(`Error making call to ${phoneNumber}:`, error.message);

      const errorLog = {
        phone: phoneNumber,
        error: error.message,
        timestamp: new Date(),
        status: 'failed'
      };

      this.callLogs.push(errorLog);

      return {
        success: false,
        error: error.message,
        phone: phoneNumber
      };
    }
  }

  /**
   * Start auto-calling from lead list
   */
  async startAutoCalling(leads, intervalMinutes = 2, userId = null, clientId = null) {
    if (this.isRunning) {
      throw new Error('Auto-calling already in progress');
    }

    if (!leads || leads.length === 0) {
      throw new Error('No leads provided');
    }

    this.currentLeads = leads;
    this.currentIndex = 0;
    this.isRunning = true;
    this.intervalDelay = intervalMinutes * 60 * 1000;
    this.currentUserId = userId; // Store userId for token deduction
    this.currentClientId = clientId; // Store clientId for custom voicemail message

    logger.info(`Starting auto-calling: ${leads.length} leads, ${intervalMinutes} min intervals${userId ? ` (userId: ${userId})` : ''}${clientId ? ` (clientId: ${clientId})` : ''}`);

    // Make first call immediately
    await this.makeNextCall();

    // Schedule remaining calls
    this.callingInterval = setInterval(async () => {
      await this.makeNextCall();
    }, this.intervalDelay);

    return {
      success: true,
      totalLeads: leads.length,
      intervalMinutes,
      status: 'started'
    };
  }

  /**
   * Make next call in the queue
   */
  async makeNextCall() {
    if (!this.isRunning || this.currentIndex >= this.currentLeads.length) {
      this.stopAutoCalling();
      return;
    }

    const lead = this.currentLeads[this.currentIndex];
    const phone = lead.phone || lead.phone_e164;

    if (!phone) {
      logger.warn(`Lead ${this.currentIndex + 1} has no phone number, skipping`);
      this.currentIndex++;
      return;
    }

    await this.makeCall(phone, {
      name: lead.business_name || lead.name,
      category: lead.category,
      index: this.currentIndex + 1,
      total: this.currentLeads.length
    }, this.currentUserId, this.currentClientId); // Pass stored userId and clientId

    this.currentIndex++;
  }

  /**
   * Stop auto-calling
   */
  stopAutoCalling() {
    if (this.callingInterval) {
      clearInterval(this.callingInterval);
      this.callingInterval = null;
    }

    const wasCalling = this.isRunning;
    this.isRunning = false;

    logger.info(`Auto-calling stopped. Called ${this.currentIndex}/${this.currentLeads.length} leads`);

    return {
      success: true,
      status: 'stopped',
      callsMade: this.currentIndex,
      totalLeads: this.currentLeads.length,
      wasCalling
    };
  }

  /**
   * Get current calling status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentIndex: this.currentIndex,
      totalLeads: this.currentLeads.length,
      callsMade: this.currentIndex,
      remaining: Math.max(0, this.currentLeads.length - this.currentIndex),
      recentLogs: this.callLogs.slice(-10), // Last 10 calls
      intervalMinutes: this.intervalDelay / 60000
    };
  }

  /**
   * Generate TwiML for voice interaction
   */
  async generateVoiceTwiML(machineDetection = null, clientId = null) {
    const twiml = new twilio.twiml.VoiceResponse();

    // ALWAYS play voice message and hang up
    // No transfer to GHL - saves costs and avoids AI-to-AI conversations
    // Compliant with telemarketing regulations (informational message only)
    logger.info('Call answered - playing voicemail informational message');

    // Default RinglyPro TCPA-compliant informational voicemail message
    let voicemailMessage = "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day.";
    let customAudioUrl = null;

    // Fetch client's custom message and audio URL if clientId provided
    if (clientId) {
      try {
        const [results] = await sequelize.query(
          'SELECT outbound_voicemail_message, outbound_voicemail_audio_url FROM clients WHERE id = :clientId',
          {
            replacements: { clientId },
            type: sequelize.QueryTypes.SELECT
          }
        );

        if (results) {
          if (results.outbound_voicemail_message) {
            voicemailMessage = results.outbound_voicemail_message;
            logger.info(`Using custom voicemail message for client ${clientId}`);
          }

          if (results.outbound_voicemail_audio_url) {
            customAudioUrl = results.outbound_voicemail_audio_url;
            logger.info(`Using custom Lina voice audio for client ${clientId}: ${customAudioUrl}`);
          }
        } else {
          logger.info(`No custom message for client ${clientId}, using default`);
        }
      } catch (error) {
        logger.error(`Error fetching custom message for client ${clientId}:`, error.message);
        // Fall through to use default message
      }
    }

    const baseUrl = process.env.BASE_URL || 'https://ringlypro-crm.onrender.com';

    // Priority order for voicemail audio:
    // 1. Custom ElevenLabs audio (Lina voice) for client
    // 2. Default ElevenLabs audio from environment variable
    // 3. Fallback to Twilio Polly TTS

    if (customAudioUrl) {
      // Custom client message with Lina's ElevenLabs voice
      twiml.play(`${baseUrl}${customAudioUrl}`);
      logger.info(`🎤 Playing custom Lina voice audio: ${baseUrl}${customAudioUrl}`);
    } else if (clientId && voicemailMessage !== "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day.") {
      // Custom message but audio generation failed - use Twilio Polly TTS as fallback
      logger.info('⚠️ No custom audio found, using Twilio Polly TTS fallback');
      twiml.say({
        voice: 'Polly.Joanna',
        language: 'en-US'
      }, voicemailMessage);
    } else if (process.env.ELEVENLABS_VOICEMAIL_URL) {
      // Default message with ElevenLabs - play pre-generated audio
      twiml.play(process.env.ELEVENLABS_VOICEMAIL_URL);
      logger.info('🎤 Playing default ElevenLabs voice from: ' + process.env.ELEVENLABS_VOICEMAIL_URL);
    } else {
      // Final fallback to Twilio Polly voice
      logger.warn('⚠️ No audio available, falling back to Twilio Polly TTS');
      twiml.say({
        voice: 'Polly.Joanna',
        language: 'en-US'
      }, voicemailMessage);
    }

    // Pause briefly then hang up
    twiml.pause({ length: 1 });
    twiml.hangup();

    return twiml.toString();
  }

  /**
   * Handle gather response (user pressed key)
   */
  handleGather(digits) {
    const twiml = new twilio.twiml.VoiceResponse();

    if (digits === '1') {
      // Connect to agent
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Please hold while we connect you to an agent.');

      if (this.agentNumber) {
        twiml.dial({
          timeout: 30,
          callerId: this.twilioNumber
        }, this.agentNumber);
      } else {
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'Sorry, no agent is available at the moment. Please try again later. Goodbye.');
      }

    } else if (digits === '2') {
      // Do not call
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'You have been added to our do not call list. You will not receive any more calls from us. Goodbye.');

    } else {
      // Invalid input
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Invalid input. Goodbye.');
    }

    twiml.hangup();
    return twiml.toString();
  }

  /**
   * Update call status from webhook
   */
  async updateCallStatus(callSid, status, answeredBy = null) {
    const log = this.callLogs.find(l => l.callSid === callSid);

    if (log) {
      log.status = status;
      log.answeredBy = answeredBy;
      log.updatedAt = new Date();

      logger.info(`Call ${callSid} status updated: ${status}${answeredBy ? ` (${answeredBy})` : ''}`);
    }

    // Update database when call reaches ANY final status (not just completed)
    // This prevents infinite loops on busy/failed numbers
    const finalStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
    if (finalStatuses.includes(status) && log && log.phone) {
      try {
        // Twilio webhook sends: "+18134776636"
        // Database can store in multiple formats due to historical inconsistency:
        // - "+18134776636" (E.164 with +1 - STANDARD)
        // - "+8134776636" (E.164 with + only)
        // - "18134776636" (11 digits no +)
        // - "8134776636" (10 digits no +)
        // Try ALL 4 formats to ensure we find the row
        const phoneWithPlus = log.phone;                         // "+18134776636"
        const phoneWith1 = log.phone.replace(/^\+/, '');         // "18134776636" (11 digits)
        const phoneWithout1 = log.phone.replace(/^\+1/, '');     // "8134776636" (10 digits)
        const phoneWithPlusNoOne = '+' + phoneWithout1;          // "+8134776636"

        // Determine call result based on answeredBy and status
        let callResult = 'completed';
        if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence') {
          callResult = 'voicemail';
        } else if (answeredBy === 'human') {
          callResult = 'human';
        } else if (status === 'no-answer') {
          callResult = 'no_answer';
        } else if (status === 'busy') {
          callResult = 'busy';
        } else if (status === 'failed') {
          callResult = 'failed';
        }

        logger.info(`📊 Updating database for phone ${log.phone}: status=CALLED, result=${callResult}`);

        // Update business_directory table - try ALL 4 phone format variations
        // Only increment call_attempts if this is the first call (call_status = 'TO_BE_CALLED')
        const [results, metadata] = await sequelize.query(
          `UPDATE business_directory
           SET call_status = 'CALLED',
               call_attempts = CASE
                 WHEN call_status = 'TO_BE_CALLED' THEN call_attempts + 1
                 ELSE call_attempts
               END,
               last_called_at = CURRENT_TIMESTAMP,
               call_result = :callResult,
               updated_at = CURRENT_TIMESTAMP
           WHERE phone_number IN (:phoneWithPlus, :phoneWith1, :phoneWithout1, :phoneWithPlusNoOne)`,
          {
            replacements: {
              phoneWithPlus: phoneWithPlus,
              phoneWith1: phoneWith1,
              phoneWithout1: phoneWithout1,
              phoneWithPlusNoOne: phoneWithPlusNoOne,
              callResult: callResult
            },
            type: QueryTypes.UPDATE
          }
        );

        logger.info(`✅ Database updated successfully for ${log.phone} (${metadata.rowCount} rows affected)`);

      } catch (dbError) {
        logger.error(`❌ Failed to update database for call ${callSid}:`, dbError.message);
        // Don't throw - webhook should still succeed even if DB update fails
      }
    }

    return { success: true, callSid, status };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    this.stopAutoCalling();
    logger.info('Outbound caller service cleaned up');
  }
}

// Singleton instance
const outboundCallerService = new OutboundCallerService();

// Cleanup on process exit
process.on('exit', () => outboundCallerService.cleanup());
process.on('SIGINT', () => {
  outboundCallerService.cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  outboundCallerService.cleanup();
  process.exit(0);
});

module.exports = outboundCallerService;
