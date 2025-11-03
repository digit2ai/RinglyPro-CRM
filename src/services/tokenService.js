// =====================================================
// RinglyPro Token Service
// File: src/services/tokenService.js
// Purpose: Manage token-based billing for all services
// =====================================================

const { sequelize } = require('../models');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    // Token costs for each service
    this.serviceCosts = {
      // Business Collector
      'business_collector_100': 20,      // Collect 100 leads
      'business_collector_csv': 5,        // Export to CSV
      'outbound_campaign_100': 50,        // Auto-call 100 leads
      'outbound_call_single': 1,          // Single outbound call

      // AI Copilot
      'ai_chat_message': 1,               // MCP chat message
      'ghl_query': 2,                     // GoHighLevel query
      'data_analysis': 5,                 // Complex analysis

      // Marketing (future)
      'email_sent': 2,                    // Send single email
      'sms_sent': 3,                      // Send single SMS
      'social_post': 10,                  // Create social media post
      'email_campaign': 50,               // Email campaign (up to 1000)

      // CRM (future)
      'appointment_booking': 2,           // Book appointment
      'contact_create': 1,                // Create contact
      'contact_update': 1,                // Update contact
      'contact_export_100': 5,            // Export 100 contacts
      'calendar_sync_month': 10,          // Monthly calendar sync

      // Voice (future - migration from credit system)
      'voice_inbound_minute': 5,          // Inbound call per minute
      'voice_outbound_minute': 5,         // Outbound call per minute
      'voicemail_transcription': 3,       // Voicemail transcription
      'call_forward': 2,                  // Call forwarding
      'ivr_interaction': 1                // IVR menu interaction
    };
  }

  /**
   * Check if user has enough tokens for a service
   * @param {number} userId - User ID
   * @param {string} serviceType - Service type key
   * @returns {Promise<boolean>}
   */
  async hasEnoughTokens(userId, serviceType) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(userId);

      if (!user) {
        logger.error(`[TOKENS] User not found: ${userId}`);
        return false;
      }

      const cost = this.serviceCosts[serviceType] || 0;
      const hasTokens = user.tokens_balance >= cost;

      logger.info(`[TOKENS] User ${userId} check: ${user.tokens_balance} >= ${cost} = ${hasTokens}`);

      return hasTokens;
    } catch (error) {
      logger.error(`[TOKENS] Error checking balance:`, error);
      return false;
    }
  }

  /**
   * Deduct tokens from user account
   * @param {number} userId - User ID
   * @param {string} serviceType - Service type key
   * @param {object} metadata - Additional service data
   * @returns {Promise<object>} Deduction result
   */
  async deductTokens(userId, serviceType, metadata = {}) {
    const cost = this.serviceCosts[serviceType];

    if (!cost) {
      throw new Error(`Unknown service type: ${serviceType}`);
    }

    try {
      const result = await sequelize.transaction(async (t) => {
        const { User } = require('../models');

        // Lock user row for update
        const user = await User.findByPk(userId, {
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Check balance
        if (user.tokens_balance < cost) {
          throw new Error(
            `Insufficient tokens. Need ${cost}, have ${user.tokens_balance}`
          );
        }

        // Deduct tokens
        const oldBalance = user.tokens_balance;
        user.tokens_balance -= cost;
        user.tokens_used_this_month += cost;
        await user.save({ transaction: t });

        // Log transaction
        const [transactionResult] = await sequelize.query(
          `
          INSERT INTO token_transactions (
            user_id, service_type, tokens_used, tokens_balance_after, metadata
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          {
            bind: [
              userId,
              serviceType,
              cost,
              user.tokens_balance,
              JSON.stringify(metadata)
            ],
            transaction: t
          }
        );

        logger.info(
          `[TOKENS] Deducted ${cost} tokens from user ${userId} (${serviceType}). ` +
          `Balance: ${oldBalance} → ${user.tokens_balance}`
        );

        return {
          success: true,
          tokens_deducted: cost,
          tokens_remaining: user.tokens_balance,
          transaction_id: transactionResult[0]?.id,
          service_type: serviceType
        };
      });

      return result;
    } catch (error) {
      logger.error(`[TOKENS] Deduction failed:`, error);
      throw error;
    }
  }

  /**
   * Add tokens to user account (purchase or refund)
   * @param {number} userId - User ID
   * @param {number} tokens - Number of tokens to add
   * @param {string} reason - Reason for adding tokens
   * @param {object} metadata - Additional data
   * @returns {Promise<object>}
   */
  async addTokens(userId, tokens, reason = 'purchase', metadata = {}) {
    try {
      const result = await sequelize.transaction(async (t) => {
        const { User } = require('../models');

        const user = await User.findByPk(userId, {
          lock: t.LOCK.UPDATE,
          transaction: t
        });

        if (!user) {
          throw new Error('User not found');
        }

        const oldBalance = user.tokens_balance;
        user.tokens_balance += tokens;
        await user.save({ transaction: t });

        // Log as negative tokens_used (means added, not deducted)
        await sequelize.query(
          `
          INSERT INTO token_transactions (
            user_id, service_type, tokens_used, tokens_balance_after, metadata
          ) VALUES ($1, $2, $3, $4, $5)
          `,
          {
            bind: [
              userId,
              reason,
              -tokens, // Negative = added
              user.tokens_balance,
              JSON.stringify(metadata)
            ],
            transaction: t
          }
        );

        logger.info(
          `[TOKENS] Added ${tokens} tokens to user ${userId} (${reason}). ` +
          `Balance: ${oldBalance} → ${user.tokens_balance}`
        );

        return {
          success: true,
          tokens_added: tokens,
          new_balance: user.tokens_balance,
          reason
        };
      });

      return result;
    } catch (error) {
      logger.error(`[TOKENS] Add tokens failed:`, error);
      throw error;
    }
  }

  /**
   * Get user token balance and package info
   * @param {number} userId - User ID
   * @returns {Promise<object>}
   */
  async getBalance(userId) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Calculate monthly allocation based on package
      const packageAllocations = {
        free: 100,
        starter: 500,
        growth: 2000,
        professional: 7500
      };
      const monthlyAllocation = packageAllocations[user.token_package] || 100;

      return {
        balance: user.tokens_balance,                    // Frontend expects 'balance'
        tokens_balance: user.tokens_balance,             // Keep for backward compatibility
        usedThisMonth: user.tokens_used_this_month,      // Frontend expects camelCase
        tokens_used_this_month: user.tokens_used_this_month,
        package: user.token_package,                     // Frontend expects 'package'
        token_package: user.token_package,
        monthlyAllocation: monthlyAllocation,            // Add monthly allocation
        tokens_rollover: user.tokens_rollover,
        billing_cycle_start: user.billing_cycle_start,
        last_token_reset: user.last_token_reset
      };
    } catch (error) {
      logger.error(`[TOKENS] Get balance failed:`, error);
      throw error;
    }
  }

  /**
   * Get token usage history for user
   * @param {number} userId - User ID
   * @param {object} options - Query options (limit, offset, startDate, endDate)
   * @returns {Promise<Array>}
   */
  async getUsageHistory(userId, options = {}) {
    const { limit = 50, offset = 0, startDate, endDate } = options;

    try {
      let whereClause = 'WHERE user_id = $1';
      const params = [userId];

      if (startDate) {
        params.push(startDate);
        whereClause += ` AND created_at >= $${params.length}`;
      }

      if (endDate) {
        params.push(endDate);
        whereClause += ` AND created_at <= $${params.length}`;
      }

      params.push(limit);
      const limitParam = params.length;

      params.push(offset);
      const offsetParam = params.length;

      const [transactions] = await sequelize.query(
        `
        SELECT
          id, service_type, tokens_used, tokens_balance_after, metadata, created_at
        FROM token_transactions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        { bind: params }
      );

      const [countResult] = await sequelize.query(
        `
        SELECT COUNT(*) as total
        FROM token_transactions
        ${whereClause}
        `,
        { bind: [userId, startDate, endDate].filter(Boolean) }
      );

      return {
        transactions,
        total: parseInt(countResult[0]?.total || 0),
        limit,
        offset
      };
    } catch (error) {
      logger.error(`[TOKENS] Get usage history failed:`, error);
      throw error;
    }
  }

  /**
   * Get token usage analytics for user
   * @param {number} userId - User ID
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<object>}
   */
  async getUsageAnalytics(userId, days = 30) {
    try {
      const [analytics] = await sequelize.query(
        `
        SELECT
          service_type,
          COUNT(*) as usage_count,
          SUM(tokens_used) as total_tokens,
          AVG(tokens_used) as avg_tokens
        FROM token_transactions
        WHERE user_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
          AND tokens_used > 0
        GROUP BY service_type
        ORDER BY total_tokens DESC
        `,
        { bind: [userId] }
      );

      const [totals] = await sequelize.query(
        `
        SELECT
          SUM(tokens_used) as total_tokens_used,
          COUNT(*) as total_transactions,
          MIN(created_at) as first_usage,
          MAX(created_at) as last_usage
        FROM token_transactions
        WHERE user_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
          AND tokens_used > 0
        `,
        { bind: [userId] }
      );

      return {
        breakdown: analytics,
        totals: totals[0] || {},
        period_days: days
      };
    } catch (error) {
      logger.error(`[TOKENS] Get analytics failed:`, error);
      throw error;
    }
  }

  /**
   * Check if user needs low balance warning
   * @param {number} userId - User ID
   * @returns {Promise<object>}
   */
  async checkLowBalanceWarning(userId) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const packageAllocations = {
        free: 100,
        starter: 500,
        growth: 2000,
        professional: 7500
      };

      const monthlyAllocation = packageAllocations[user.token_package] || 100;
      const percentageRemaining = (user.tokens_balance / monthlyAllocation) * 100;

      return {
        tokens_balance: user.tokens_balance,
        monthly_allocation: monthlyAllocation,
        percentage_remaining: percentageRemaining,
        is_low_balance: percentageRemaining < 25, // Less than 25%
        is_critical_balance: percentageRemaining < 10 // Less than 10%
      };
    } catch (error) {
      logger.error(`[TOKENS] Low balance check failed:`, error);
      throw error;
    }
  }

  /**
   * Get service cost
   * @param {string} serviceType - Service type key
   * @returns {number} Token cost
   */
  getServiceCost(serviceType) {
    return this.serviceCosts[serviceType] || 0;
  }

  /**
   * Get all service costs (for pricing display)
   * @returns {object}
   */
  getAllServiceCosts() {
    return { ...this.serviceCosts };
  }
}

// Singleton instance
const tokenService = new TokenService();

module.exports = tokenService;
