// Scheduled Auto-Caller Service - Automated prospect calling with node-cron
const cron = require('node-cron');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const outboundCallerService = require('./outbound-caller');

class ScheduledAutoCallerService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.isPaused = false;
    this.currentClientId = null;
    this.filters = {
      location: null,
      category: null
    };
    this.stats = {
      totalProspects: 0,
      calledToday: 0,
      remainingToday: 0,
      successRate: 0,
      startedAt: null,
      lastCallAt: null,
      failedCalls: 0,
      duplicateDetections: 0
    };
    this.config = {
      schedule: '*/2 8-18 * * 1-5', // Every 2 minutes, 8am-6pm EST, Mon-Fri
      timezone: 'America/New_York',
      minInterval: 2, // minutes between calls
      maxCallsPerHour: 30,
      maxCallsPerDay: 200,
      maxConsecutiveFailures: 3, // EMERGENCY: Stop after 3 consecutive failures
      maxDuplicateDetections: 2 // EMERGENCY: Stop if same number called twice
    };
    this.recentCalls = []; // Track recent calls to detect duplicates
    this.consecutiveFailures = 0;
    this.emergencyStop = false;
    this.emergencyReason = null;

    logger.info('📞 Scheduled Auto-Caller Service initialized with EMERGENCY SAFETY CONTROLS');
  }

  /**
   * EMERGENCY STOP: Send email and stop all calling
   */
  async emergencyStopAndNotify(reason) {
    this.emergencyStop = true;
    this.emergencyReason = reason;

    logger.error(`🚨 EMERGENCY STOP TRIGGERED: ${reason}`);

    // Send email notification
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const msg = {
        to: 'mstagg@digit2ai.com',
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ringlypro.com',
        subject: '🚨 EMERGENCY: Outbound Caller STOPPED',
        text: `Technical Issue Detected\n\nThe Outbound Caller system has been automatically stopped due to:\n\n${reason}\n\nTimestamp: ${new Date().toISOString()}\n\nStats:\n- Calls made today: ${this.stats.calledToday}\n- Failed calls: ${this.stats.failedCalls}\n- Duplicate detections: ${this.stats.duplicateDetections}\n- Consecutive failures: ${this.consecutiveFailures}\n\nPlease investigate immediately to prevent TCPA violations.\n\n- RinglyPro Auto-Caller System`,
        html: `
          <h2>🚨 EMERGENCY: Outbound Caller STOPPED</h2>
          <p><strong>Technical Issue Detected</strong></p>
          <p>The Outbound Caller system has been automatically stopped due to:</p>
          <div style="background-color: #fee; border-left: 4px solid #c00; padding: 15px; margin: 20px 0;">
            <strong>${reason}</strong>
          </div>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <h3>Statistics</h3>
          <ul>
            <li>Calls made today: ${this.stats.calledToday}</li>
            <li>Failed calls: ${this.stats.failedCalls}</li>
            <li>Duplicate detections: ${this.stats.duplicateDetections}</li>
            <li>Consecutive failures: ${this.consecutiveFailures}</li>
          </ul>
          <p><strong>⚠️ Please investigate immediately to prevent TCPA violations.</strong></p>
          <p><em>- RinglyPro Auto-Caller System</em></p>
        `
      };

      await sgMail.send(msg);
      logger.info('✅ Emergency notification email sent to mstagg@digit2ai.com');
    } catch (emailError) {
      logger.error('❌ Failed to send emergency email:', emailError.message);
    }

    // Stop the scheduler
    if (this.isRunning) {
      this.stop();
    }
  }

  /**
   * Check for duplicate calls (same number called multiple times)
   */
  checkForDuplicates(phoneNumber) {
    // Keep only last 10 calls in memory
    if (this.recentCalls.length > 10) {
      this.recentCalls.shift();
    }

    // Check if this number was already called recently
    const duplicate = this.recentCalls.find(call => call.phone === phoneNumber);
    if (duplicate) {
      this.stats.duplicateDetections++;
      logger.error(`🚨 DUPLICATE CALL DETECTED: ${phoneNumber} was already called at ${duplicate.timestamp}`);
      return true;
    }

    // Add to recent calls
    this.recentCalls.push({
      phone: phoneNumber,
      timestamp: new Date().toISOString()
    });

    return false;
  }

  /**
   * Check if current time is within business hours (8am-6pm EST, Mon-Fri)
   */
  isBusinessHours() {
    try {
      const now = new Date();

      // Get EST/EDT time using Intl.DateTimeFormat (more reliable)
      const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
        weekday: 'short'
      });

      const parts = estFormatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value;
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');

      logger.debug(`🕐 Current time check: ${weekday} ${hour}:00 EST`);

      // Check if Monday-Friday
      const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      if (!validDays.includes(weekday)) {
        logger.debug(`❌ Outside business days: ${weekday}`);
        return false;
      }

      // Check if 8am-6pm EST (8-17, stops before 6pm)
      if (hour < 8 || hour >= 18) {
        logger.debug(`❌ Outside business hours: ${hour}:00 EST`);
        return false;
      }

      logger.debug(`✅ Within business hours: ${weekday} ${hour}:00 EST`);
      return true;
    } catch (error) {
      logger.error('❌ Error checking business hours:', error.message);
      // Default to false if there's an error
      return false;
    }
  }

  /**
   * Get next prospect to call from database
   */
  async getNextProspect() {
    try {
      // SAFETY: Exclude BAD_NUMBER entries - these should NEVER be called
      let whereClause = 'WHERE call_status = :status AND call_status != :badStatus';
      const replacements = {
        status: 'TO_BE_CALLED',
        badStatus: 'BAD_NUMBER'
      };

      // Add client filter if specified
      if (this.currentClientId) {
        whereClause += ' AND client_id = :clientId';
        replacements.clientId = this.currentClientId;
      }

      // Add location filter if specified
      if (this.filters.location) {
        whereClause += ' AND location = :location';
        replacements.location = this.filters.location;
      }

      // Add category filter if specified
      if (this.filters.category) {
        whereClause += ' AND category ILIKE :category';
        replacements.category = `%${this.filters.category}%`;
      }

      const query = `
        SELECT
          id,
          business_name,
          phone_number,
          location,
          category,
          call_attempts,
          created_at
        FROM business_directory
        ${whereClause}
        ORDER BY created_at ASC
        LIMIT 1
      `;

      const prospects = await sequelize.query(query, {
        replacements,
        type: QueryTypes.SELECT
      });

      return prospects.length > 0 ? prospects[0] : null;

    } catch (error) {
      logger.error('❌ Error fetching next prospect:', error.message);
      return null;
    }
  }

  /**
   * Get prospect queue count
   */
  async getQueueCount() {
    try {
      let whereClause = 'WHERE call_status = :status';
      const replacements = { status: 'TO_BE_CALLED' };

      if (this.currentClientId) {
        whereClause += ' AND client_id = :clientId';
        replacements.clientId = this.currentClientId;
      }

      if (this.filters.location) {
        whereClause += ' AND location = :location';
        replacements.location = this.filters.location;
      }

      if (this.filters.category) {
        whereClause += ' AND category ILIKE :category';
        replacements.category = `%${this.filters.category}%`;
      }

      const result = await sequelize.query(
        `SELECT COUNT(*) as count FROM business_directory ${whereClause}`,
        {
          replacements,
          type: QueryTypes.SELECT
        }
      );

      return parseInt(result[0].count);

    } catch (error) {
      logger.error('❌ Error getting queue count:', error.message);
      return 0;
    }
  }

  /**
   * Make next scheduled call
   */
  async makeScheduledCall() {
    // SAFETY: Check for emergency stop
    if (this.emergencyStop) {
      logger.error('🚨 Emergency stop active, cannot make calls');
      return;
    }

    // Skip if paused
    if (this.isPaused) {
      logger.info('⏸️  Scheduler paused, skipping call');
      return;
    }

    // Check business hours
    if (!this.isBusinessHours()) {
      logger.info('⏰ Outside business hours, skipping call');
      return;
    }

    // Check daily call limit
    if (this.stats.calledToday >= this.config.maxCallsPerDay) {
      logger.warn(`⚠️  Daily call limit reached (${this.config.maxCallsPerDay}), stopping for today`);
      this.pause();
      return;
    }

    // SAFETY: Check consecutive failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      await this.emergencyStopAndNotify(
        `Too many consecutive failures (${this.consecutiveFailures}). Possible webhook failure or system issue.`
      );
      return;
    }

    try {
      // Get next prospect
      const prospect = await this.getNextProspect();

      if (!prospect) {
        logger.info('✅ No more prospects to call, stopping scheduler');
        this.stop();
        return;
      }

      // SAFETY: Check for duplicate calls
      if (this.checkForDuplicates(prospect.phone_number)) {
        await this.emergencyStopAndNotify(
          `DUPLICATE CALL DETECTED: Attempted to call ${prospect.phone_number} (${prospect.business_name}) multiple times. Database update may have failed.`
        );
        return;
      }

      logger.info(`📞 Calling prospect: ${prospect.business_name} (${prospect.phone_number})`);

      // SAFETY: Mark as calling IMMEDIATELY (before Twilio call)
      // This prevents retries if webhook fails
      await sequelize.query(
        `UPDATE business_directory
         SET call_status = 'CALLING',
             last_called_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :prospectId`,
        {
          replacements: { prospectId: prospect.id },
          type: QueryTypes.UPDATE
        }
      );
      logger.info(`📊 Database updated: Status changed to CALLING for ${prospect.phone_number}`);

      // Make the call using existing outbound caller service
      const result = await outboundCallerService.makeCall(prospect.phone_number, {
        name: prospect.business_name,
        category: prospect.category,
        location: prospect.location,
        prospectId: prospect.id
      });

      if (result.success) {
        this.stats.calledToday++;
        this.stats.lastCallAt = new Date();
        this.consecutiveFailures = 0; // Reset on success
        logger.info(`✅ Call initiated: ${result.callSid}`);

        // Update to CALLED status (webhook will also update, but this ensures it)
        await sequelize.query(
          `UPDATE business_directory
           SET call_status = 'CALLED',
               call_attempts = call_attempts + 1
           WHERE id = :prospectId`,
          {
            replacements: { prospectId: prospect.id },
            type: QueryTypes.UPDATE
          }
        );
      } else {
        this.stats.failedCalls++;
        this.consecutiveFailures++;
        logger.error(`❌ Call failed: ${result.error}`);

        // Mark as FAILED or BAD_NUMBER if validation failed
        const isBadNumber = result.error?.includes('Invalid') || result.error?.includes('Test number');
        await sequelize.query(
          `UPDATE business_directory
           SET call_status = :status,
               call_notes = :notes,
               call_attempts = call_attempts + 1
           WHERE id = :prospectId`,
          {
            replacements: {
              prospectId: prospect.id,
              status: isBadNumber ? 'BAD_NUMBER' : 'FAILED',
              notes: `Call failed: ${result.error}`
            },
            type: QueryTypes.UPDATE
          }
        );
      }

    } catch (error) {
      this.stats.failedCalls++;
      this.consecutiveFailures++;
      logger.error('❌ Error in makeScheduledCall:', error.message);

      // SAFETY: If too many errors, emergency stop
      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        await this.emergencyStopAndNotify(
          `System error: ${error.message}. Consecutive failures: ${this.consecutiveFailures}`
        );
      }
    }
  }

  /**
   * Start the scheduled auto-caller
   */
  async start(clientId = null, filters = {}) {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    // SAFETY: Reset emergency stop flags
    this.emergencyStop = false;
    this.emergencyReason = null;
    this.consecutiveFailures = 0;
    this.recentCalls = [];

    this.currentClientId = clientId;
    this.filters = {
      location: filters.location || null,
      category: filters.category || null
    };

    // Get initial queue count
    const queueCount = await this.getQueueCount();
    if (queueCount === 0) {
      throw new Error('No prospects found with status TO_BE_CALLED');
    }

    this.stats = {
      totalProspects: queueCount,
      calledToday: 0,
      remainingToday: queueCount,
      successRate: 0,
      startedAt: new Date(),
      lastCallAt: null,
      failedCalls: 0,
      duplicateDetections: 0
    };

    // Create cron job
    this.cronJob = cron.schedule(
      this.config.schedule,
      () => this.makeScheduledCall(),
      {
        scheduled: true,
        timezone: this.config.timezone
      }
    );

    this.isRunning = true;
    this.isPaused = false;

    logger.info(`🚀 Scheduled Auto-Caller started`);
    logger.info(`📊 Queue: ${queueCount} prospects to call`);
    logger.info(`📅 Schedule: ${this.config.schedule} (${this.config.timezone})`);
    if (clientId) logger.info(`👤 Client filter: ${clientId}`);
    if (this.filters.location) logger.info(`📍 Location filter: ${this.filters.location}`);
    if (this.filters.category) logger.info(`🏷️  Category filter: ${this.filters.category}`);

    // Make first call immediately if within business hours
    if (this.isBusinessHours()) {
      await this.makeScheduledCall();
    } else {
      logger.info('⏰ Outside business hours, waiting for next scheduled time');
    }

    return {
      success: true,
      message: 'Scheduler started successfully',
      stats: this.stats,
      config: this.config
    };
  }

  /**
   * Pause the scheduler (maintains state)
   */
  pause() {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    if (this.isPaused) {
      throw new Error('Scheduler is already paused');
    }

    this.isPaused = true;
    logger.info('⏸️  Scheduler paused');

    return {
      success: true,
      message: 'Scheduler paused',
      stats: this.stats
    };
  }

  /**
   * Resume the scheduler from paused state
   */
  async resume() {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    if (!this.isPaused) {
      throw new Error('Scheduler is not paused');
    }

    this.isPaused = false;
    logger.info('▶️  Scheduler resumed');

    // Make a call immediately if within business hours
    if (this.isBusinessHours()) {
      await this.makeScheduledCall();
    }

    return {
      success: true,
      message: 'Scheduler resumed',
      stats: this.stats
    };
  }

  /**
   * Stop the scheduler completely
   */
  stop() {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    const finalStats = { ...this.stats };

    this.isRunning = false;
    this.isPaused = false;
    this.currentClientId = null;
    this.filters = { location: null, category: null };

    logger.info('⏹️  Scheduler stopped');
    logger.info(`📊 Final stats: Called ${finalStats.calledToday} prospects`);

    return {
      success: true,
      message: 'Scheduler stopped',
      finalStats
    };
  }

  /**
   * Get current scheduler status
   */
  async getStatus() {
    const queueCount = this.isRunning ? await this.getQueueCount() : 0;

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isBusinessHours: this.isBusinessHours(),
      clientId: this.currentClientId,
      filters: this.filters,
      stats: {
        ...this.stats,
        remainingToday: queueCount
      },
      config: this.config,
      nextCallTime: this.isRunning && !this.isPaused ? 'Within 2 minutes' : null
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig) {
    const wasRunning = this.isRunning;

    // Stop if running
    if (wasRunning) {
      this.stop();
    }

    // Update configuration
    if (newConfig.schedule) this.config.schedule = newConfig.schedule;
    if (newConfig.timezone) this.config.timezone = newConfig.timezone;
    if (newConfig.minInterval) this.config.minInterval = newConfig.minInterval;
    if (newConfig.maxCallsPerHour) this.config.maxCallsPerHour = newConfig.maxCallsPerHour;
    if (newConfig.maxCallsPerDay) this.config.maxCallsPerDay = newConfig.maxCallsPerDay;

    logger.info('⚙️  Scheduler configuration updated');

    return {
      success: true,
      message: 'Configuration updated' + (wasRunning ? ' (scheduler was restarted)' : ''),
      config: this.config
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    if (this.isRunning) {
      this.stop();
    }
    logger.info('🧹 Scheduled Auto-Caller Service cleaned up');
  }
}

// Singleton instance
const scheduledAutoCallerService = new ScheduledAutoCallerService();

// Cleanup on process exit
process.on('exit', () => scheduledAutoCallerService.cleanup());
process.on('SIGINT', () => {
  scheduledAutoCallerService.cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  scheduledAutoCallerService.cleanup();
  process.exit(0);
});

module.exports = scheduledAutoCallerService;
