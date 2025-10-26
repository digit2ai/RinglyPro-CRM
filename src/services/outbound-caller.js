// Outbound Caller Service - Twilio Integration
const twilio = require('twilio');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

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
   * Make a single outbound call
   */
  async makeCall(phoneNumber, leadData = {}) {
    if (!this.twilioClient) {
      throw new Error('Twilio not configured');
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
      logger.info(`Making call to ${validation.normalized}`);

      const call = await this.twilioClient.calls.create({
        to: validation.normalized,
        from: this.twilioNumber,
        url: `${process.env.BASE_URL || 'http://localhost:3000'}/api/outbound-caller/voice`,
        statusCallback: `${process.env.BASE_URL || 'http://localhost:3000'}/api/outbound-caller/call-status`,
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
  async startAutoCalling(leads, intervalMinutes = 2) {
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

    logger.info(`Starting auto-calling: ${leads.length} leads, ${intervalMinutes} min intervals`);

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
    });

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
  generateVoiceTwiML(machineDetection = null) {
    const twiml = new twilio.twiml.VoiceResponse();

    // ALWAYS play Rachel Premium Voice message and hang up
    // No transfer to GHL - saves costs and avoids AI-to-AI conversations
    // Compliant with telemarketing regulations (informational message only)
    logger.info('Call answered - playing Rachel Premium Voice informational message');

    // RinglyPro TCPA-compliant informational voicemail message
    const voicemailMessage = "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day.";

    // Check if ElevenLabs voice URL is configured (pre-generated audio file)
    const elevenLabsVoiceUrl = process.env.ELEVENLABS_VOICEMAIL_URL;

    if (elevenLabsVoiceUrl) {
      // Play pre-generated Rachel ElevenLabs Premium Voice audio
      twiml.play(elevenLabsVoiceUrl);
      logger.info('Playing ElevenLabs Rachel Premium Voice from: ' + elevenLabsVoiceUrl);
    } else {
      // Fallback to Twilio Polly voice if ElevenLabs not configured
      logger.warn('ElevenLabs voice URL not configured, falling back to Twilio Polly');
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

    // Update database when call is completed
    if (status === 'completed' && log && log.phone) {
      try {
        // Remove + and country code to match database phone format
        const phoneNumber = log.phone.replace(/^\+1/, '');

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

        logger.info(`📊 Updating database for phone ${phoneNumber}: status=CALLED, result=${callResult}`);

        // Update business_directory table
        await sequelize.query(
          `UPDATE business_directory
           SET call_status = 'CALLED',
               call_attempts = call_attempts + 1,
               last_called_at = CURRENT_TIMESTAMP,
               call_result = :callResult,
               updated_at = CURRENT_TIMESTAMP
           WHERE phone_number = :phoneNumber`,
          {
            replacements: {
              phoneNumber: phoneNumber,
              callResult: callResult
            },
            type: QueryTypes.UPDATE
          }
        );

        logger.info(`✅ Database updated successfully for ${phoneNumber}`);

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
