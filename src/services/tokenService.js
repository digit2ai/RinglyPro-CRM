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
    // Based on official pricing: https://aiagent.ringlypro.com/pricing
    this.serviceCosts = {
      // Voice & Calling
      'lina_ai_receptionist': 1,          // Lina AI Receptionist - 1 token/call
      'outbound_call_single': 1,          // Single outbound call - 1 token
      'outbound_campaign_100': 50,        // Outbound Campaign (100 calls) - 50 tokens

      // AI & Chat
      'ai_chat_message': 1,               // AI Chat Message - 1 token
      'ghl_query': 2,                     // GoHighLevel Query - 2 tokens
      'data_analysis': 5,                 // Data Analysis - 5 tokens

      // Communication
      'email_sent': 2,                    // Email Sent - 2 tokens
      'sms_sent': 3,                      // SMS Sent - 3 tokens
      'email_campaign': 50,               // Email Campaign (up to 1000) - 50 tokens

      // Business Collector & Export
      'business_collector_100': 20,       // Business Collector (100 leads) - 20 tokens
      'csv_export': 5,                    // CSV Export - 5 tokens
      'business_collector_csv': 5,        // Legacy alias for CSV export

      // Social Media
      'social_post': 10,                  // Social Media Post - 10 tokens
      'social_media_post': 10,            // Alias for social post

      // CRM Operations (future)
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
      'ivr_interaction': 1,               // IVR menu interaction

      // WhatsApp Business (bilingual AI assistant)
      'whatsapp_template_sent': 2,        // Business-initiated template message
      'whatsapp_session_message': 1,      // Reply within 24hr window (FREE from Meta)
      'whatsapp_media_sent': 3,           // Send image/file/video
      'whatsapp_ai_response': 1           // AI-generated response in session
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

      // Handle NULL balance (should be initialized on first deduction, but check here too)
      const balance = user.tokens_balance ?? 100;

      // Zero or negative balance means no access (must purchase tokens)
      if (balance <= 0) {
        logger.warn(`[TOKENS] User ${userId} has zero balance (${balance}). Must purchase tokens.`);
        return false;
      }

      const cost = this.serviceCosts[serviceType] || 0;
      const hasTokens = balance >= cost;

      logger.info(`[TOKENS] User ${userId} check: ${balance} >= ${cost} = ${hasTokens}`);

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

        // Handle NULL token balance (set to 100 default AND SAVE IT)
        let needsInitialization = false;
        if (user.tokens_balance === null || user.tokens_balance === undefined) {
          user.tokens_balance = 100;
          needsInitialization = true;
          console.log(`⚠️ User ${userId} had NULL token balance, initializing to 100`);
        }

        if (user.tokens_used_this_month === null || user.tokens_used_this_month === undefined) {
          user.tokens_used_this_month = 0;
          needsInitialization = true;
        }

        if (user.token_package === null || user.token_package === undefined) {
          user.token_package = 'free';
          needsInitialization = true;
        }

        // Save initialization if needed (fixes NULL persistence issue)
        if (needsInitialization) {
          await user.save({ transaction: t });
          console.log(`✅ Initialized token fields for user ${userId}: balance=100, package=free`);
        }

        // Check balance (must have tokens to use service)
        if (user.tokens_balance <= 0) {
          throw new Error(
            `Insufficient tokens. Your balance is ${user.tokens_balance}. Please purchase more tokens to continue using services.`
          );
        }

        if (user.tokens_balance < cost) {
          throw new Error(
            `Insufficient tokens. Need ${cost}, have ${user.tokens_balance}. Please purchase more tokens.`
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
   * Also handles FREE plan monthly reset (resets to 100 tokens if a month has passed)
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

      // Handle NULL values - default to free tier with 100 tokens
      let tokenBalance = user.tokens_balance ?? 100;
      let tokensUsed = user.tokens_used_this_month ?? 0;
      const tokenPackage = user.token_package || user.subscription_plan || 'free';
      const tokensRollover = user.tokens_rollover ?? 0;

      // Calculate monthly allocation based on package
      const packageAllocations = {
        free: 100,
        starter: 500,
        growth: 2000,
        professional: 7500
      };
      const monthlyAllocation = packageAllocations[tokenPackage] || 100;

      // NOTE: Auto-reset removed to prevent accidental token wipes
      // Free plan monthly tokens are now handled ONLY via:
      // 1. Stripe webhook (invoice.paid) for paid subscribers
      // 2. Manual admin intervention for free tier users
      // This prevents purchased/referral tokens from being wiped

      return {
        balance: tokenBalance,                           // Frontend expects 'balance'
        tokens_balance: tokenBalance,                    // Keep for backward compatibility
        usedThisMonth: tokensUsed,                       // Frontend expects camelCase
        tokens_used_this_month: tokensUsed,
        package: tokenPackage,                           // Frontend expects 'package'
        token_package: tokenPackage,
        monthlyAllocation: monthlyAllocation,            // Add monthly allocation
        tokens_rollover: tokensRollover,
        billing_cycle_start: user.billing_cycle_start,
        last_token_reset: user.last_token_reset,
        features_disabled: tokenBalance <= 0             // Disable features if balance is zero or negative
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

  /**
   * Add 100 free tokens monthly (does NOT reset balance)
   * Called by cron job on the 1st of each month
   * Purchased and referral tokens are NEVER removed - just adds 100 tokens
   * @param {number} userId - User ID (optional, if not provided adds to all users)
   * @returns {Promise<object>} Results
   */
  async resetMonthlyTokens(userId = null) {
    try {
      const { User, sequelize } = require('../models');

      let users;
      if (userId) {
        // Add tokens to specific user
        const user = await User.findByPk(userId);
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        users = [user];
      } else {
        // Add tokens to all users
        users = await User.findAll();
      }

      const results = {
        totalUsers: users.length,
        resetCount: 0,
        errors: []
      };

      for (const user of users) {
        try {
          const currentBalance = user.tokens_balance || 0;
          const tokensToAdd = 100; // Always add 100 free tokens per month

          // Simply add 100 tokens to existing balance
          // This keeps ALL purchased and referral tokens
          const newBalance = currentBalance + tokensToAdd;

          // Update user
          await user.update({
            tokens_balance: newBalance,
            tokens_used_this_month: 0, // Reset usage counter
            last_token_reset: new Date(),
            billing_cycle_start: new Date()
          });

          logger.info(`[MONTHLY RESET] User ${user.id} (${user.email}): ${currentBalance} → ${newBalance} (+100 free tokens)`);

          results.resetCount++;

        } catch (error) {
          logger.error(`[MONTHLY RESET] Error for user ${user.id}:`, error);
          results.errors.push({
            userId: user.id,
            email: user.email,
            error: error.message
          });
        }
      }

      logger.info(`[MONTHLY RESET] Completed: ${results.resetCount}/${results.totalUsers} users received 100 free tokens`);

      return results;

    } catch (error) {
      logger.error(`[MONTHLY RESET] Fatal error:`, error);
      throw error;
    }
  }

  /**
   * Check if user needs monthly reset
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if reset needed
   */
  async needsMonthlyReset(userId) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(userId);

      if (!user) {
        return false;
      }

      // If never reset, needs reset
      if (!user.last_token_reset) {
        return true;
      }

      // Check if last reset was more than 30 days ago
      const daysSinceReset = (new Date() - new Date(user.last_token_reset)) / (1000 * 60 * 60 * 24);
      return daysSinceReset >= 30;

    } catch (error) {
      logger.error(`[TOKENS] Error checking reset status:`, error);
      return false;
    }
  }
}

// Singleton instance
const tokenService = new TokenService();

module.exports = tokenService;
