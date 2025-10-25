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
      lastCallAt: null
    };
    this.config = {
      schedule: '*/2 9-17 * * 1-5', // Every 2 minutes, 9am-5pm EST, Mon-Fri
      timezone: 'America/New_York',
      minInterval: 2, // minutes between calls
      maxCallsPerHour: 30,
      maxCallsPerDay: 200
    };

    logger.info('📞 Scheduled Auto-Caller Service initialized');
  }

  /**
   * Check if current time is within business hours (9am-5pm EST, Mon-Fri)
   */
  isBusinessHours() {
    const now = new Date();
    const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false };
    const estTime = now.toLocaleString('en-US', options);

    // Parse EST time
    const [weekday, time] = estTime.split(', ');
    const [hour] = time.split(':').map(Number);

    // Check if Monday-Friday
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (!validDays.includes(weekday)) {
      logger.debug(`❌ Outside business days: ${weekday}`);
      return false;
    }

    // Check if 9am-5pm EST
    if (hour < 9 || hour >= 17) {
      logger.debug(`❌ Outside business hours: ${hour}:00 EST`);
      return false;
    }

    logger.debug(`✅ Within business hours: ${weekday} ${hour}:00 EST`);
    return true;
  }

  /**
   * Get next prospect to call from database
   */
  async getNextProspect() {
    try {
      let whereClause = 'WHERE call_status = :status';
      const replacements = { status: 'TO_BE_CALLED' };

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

    try {
      // Get next prospect
      const prospect = await this.getNextProspect();

      if (!prospect) {
        logger.info('✅ No more prospects to call, stopping scheduler');
        this.stop();
        return;
      }

      logger.info(`📞 Calling prospect: ${prospect.business_name} (${prospect.phone_number})`);

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
        logger.info(`✅ Call initiated: ${result.callSid}`);
      } else {
        logger.error(`❌ Call failed: ${result.error}`);
      }

    } catch (error) {
      logger.error('❌ Error in makeScheduledCall:', error.message);
    }
  }

  /**
   * Start the scheduled auto-caller
   */
  async start(clientId = null, filters = {}) {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

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
      lastCallAt: null
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
