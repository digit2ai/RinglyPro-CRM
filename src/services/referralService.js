/**
 * RINGLYPRO CRM - VIRAL REFERRAL SERVICE
 *
 * Handles all referral-related operations:
 * - Referral code generation and validation
 * - Tracking referral signups and conversions
 * - Automatic token rewards (200 on signup, 1000 on conversion)
 * - Tier management (Bronze/Silver/Gold)
 * - Analytics and leaderboards
 *
 * Created: November 3, 2025
 */

const { sequelize } = require('../models');
const tokenService = require('./tokenService');
const emailService = require('./emailService');

class ReferralService {
  constructor() {
    this.REWARD_CONFIG = {
      bronze: {
        signupTokens: 200,
        conversionTokens: 1000,
        recurringMonthlyTokens: 0,
        commissionPercentage: 0
      },
      silver: {
        signupTokens: 300,
        conversionTokens: 1500,
        recurringMonthlyTokens: 200,
        commissionPercentage: 5 // 5% in tokens
      },
      gold: {
        signupTokens: 500,
        conversionTokens: 2000,
        recurringMonthlyTokens: 500,
        commissionPercentage: 15, // 15% in cash
        unlimitedTokens: true
      }
    };

    this.TIER_THRESHOLDS = {
      bronze: { min: 0, max: 4 },
      silver: { min: 5, max: 24 },
      gold: { min: 25, max: Infinity }
    };
  }

  /**
   * Get or create referral code for user
   */
  async getReferralCode(userId) {
    try {
      const [result] = await sequelize.query(
        `SELECT referral_code FROM users WHERE id = $1`,
        { bind: [userId], type: sequelize.QueryTypes.SELECT }
      );

      if (!result || !result.referral_code) {
        // Generate new code if missing
        const [generated] = await sequelize.query(
          `UPDATE users SET referral_code = generate_referral_code($1)
           WHERE id = $1 RETURNING referral_code`,
          { bind: [userId], type: sequelize.QueryTypes.SELECT }
        );
        return generated.referral_code;
      }

      return result.referral_code;
    } catch (error) {
      console.error('Error getting referral code:', error);
      throw error;
    }
  }

  /**
   * Validate referral code exists and get referrer info
   */
  async validateReferralCode(referralCode) {
    try {
      const [referrer] = await sequelize.query(
        `SELECT id, email, first_name, last_name, referral_tier, business_name
         FROM users WHERE referral_code = $1`,
        { bind: [referralCode], type: sequelize.QueryTypes.SELECT }
      );

      if (!referrer) {
        return { valid: false, error: 'Invalid referral code' };
      }

      return {
        valid: true,
        referrer: {
          id: referrer.id,
          email: referrer.email,
          name: `${referrer.first_name} ${referrer.last_name}`,
          tier: referrer.referral_tier,
          businessName: referrer.business_name
        }
      };
    } catch (error) {
      console.error('Error validating referral code:', error);
      return { valid: false, error: 'Validation error' };
    }
  }

  /**
   * Record a new referral when user signs up
   */
  async recordReferralSignup(referredUserId, referralCode, metadata = {}) {
    const transaction = await sequelize.transaction();

    try {
      // Validate referral code
      const validation = await this.validateReferralCode(referralCode);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const referrerId = validation.referrer.id;

      // Get referred user info
      const [referredUser] = await sequelize.query(
        `SELECT email, first_name, last_name FROM users WHERE id = $1`,
        { bind: [referredUserId], type: sequelize.QueryTypes.SELECT }
      );

      // Update referred user to track who referred them
      await sequelize.query(
        `UPDATE users
         SET referred_by_code = $1, referred_by_user_id = $2
         WHERE id = $3`,
        { bind: [referralCode, referrerId, referredUserId], transaction }
      );

      // Create referral record
      const [referral] = await sequelize.query(
        `INSERT INTO referrals (
          referrer_user_id, referrer_code, referred_user_id, referred_email, referred_name,
          status, signup_ip, signup_source, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
        RETURNING id`,
        {
          bind: [
            referrerId,
            referralCode,
            referredUserId,
            referredUser.email,
            `${referredUser.first_name || ''} ${referredUser.last_name || ''}`.trim(),
            metadata.signupIp || null,
            metadata.source || 'referral_link',
            JSON.stringify(metadata)
          ],
          transaction,
          type: sequelize.QueryTypes.INSERT
        }
      );

      const referralId = referral[0].id;

      // Get referrer's tier and reward config
      const [tierInfo] = await sequelize.query(
        `SELECT rt.signup_bonus_tokens, rt.tier_name
         FROM users u
         JOIN referral_tiers rt ON u.referral_tier = rt.tier_name
         WHERE u.id = $1`,
        { bind: [referrerId], type: sequelize.QueryTypes.SELECT, transaction }
      );

      const signupTokens = tierInfo?.signup_bonus_tokens || 200;

      // Create signup reward for referrer
      await sequelize.query(
        `INSERT INTO referral_rewards (
          user_id, referral_id, reward_type, reward_amount, reward_currency, status
        ) VALUES ($1, $2, 'signup_bonus', $3, 'tokens', 'pending')
        RETURNING id`,
        {
          bind: [referrerId, referralId, signupTokens],
          transaction,
          type: sequelize.QueryTypes.INSERT
        }
      );

      // Credit signup tokens to referrer
      await this.creditReferralReward(referrerId, referralId, signupTokens, 'signup_bonus', transaction);

      // Give bonus tokens to referred user (50 token signup bonus)
      await tokenService.addTokens(
        referredUserId,
        50,
        'referral_signup_bonus',
        { referred_by: referralCode },
        transaction
      );

      await transaction.commit();

      // Send notification emails (async, don't wait)
      this.sendReferralSignupNotification(referrerId, referredUser, signupTokens).catch(console.error);

      return {
        success: true,
        referralId,
        tokensEarned: signupTokens,
        message: `Referral recorded! ${signupTokens} tokens credited to referrer.`
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Error recording referral signup:', error);
      throw error;
    }
  }

  /**
   * Record referral conversion when referred user makes first purchase
   */
  async recordReferralConversion(referredUserId, purchaseAmount, packageName) {
    const transaction = await sequelize.transaction();

    try {
      // Find referral record
      const [referral] = await sequelize.query(
        `SELECT id, referrer_user_id, status FROM referrals
         WHERE referred_user_id = $1 AND status = 'pending'`,
        { bind: [referredUserId], type: sequelize.QueryTypes.SELECT }
      );

      if (!referral) {
        // No pending referral found (user not referred or already converted)
        return { success: false, message: 'No pending referral found' };
      }

      const referrerId = referral.referrer_user_id;

      // Update referral status to converted
      await sequelize.query(
        `UPDATE referrals
         SET status = 'converted',
             converted_at = CURRENT_TIMESTAMP,
             first_purchase_amount = $1,
             first_purchase_package = $2
         WHERE id = $3`,
        { bind: [purchaseAmount, packageName, referral.id], transaction }
      );

      // Get referrer's tier and reward config
      const [tierInfo] = await sequelize.query(
        `SELECT rt.conversion_bonus_tokens, rt.commission_percentage, rt.commission_type, u.referral_tier
         FROM users u
         JOIN referral_tiers rt ON u.referral_tier = rt.tier_name
         WHERE u.id = $1`,
        { bind: [referrerId], type: sequelize.QueryTypes.SELECT, transaction }
      );

      const conversionTokens = tierInfo?.conversion_bonus_tokens || 1000;
      const commissionPercent = tierInfo?.commission_percentage || 0;
      const commissionType = tierInfo?.commission_type || 'tokens';

      // Create conversion reward
      await sequelize.query(
        `INSERT INTO referral_rewards (
          user_id, referral_id, reward_type, reward_amount, reward_currency, status
        ) VALUES ($1, $2, 'conversion_bonus', $3, 'tokens', 'pending')`,
        {
          bind: [referrerId, referral.id, conversionTokens],
          transaction
        }
      );

      // Credit conversion tokens
      await this.creditReferralReward(
        referrerId,
        referral.id,
        conversionTokens,
        'conversion_bonus',
        transaction
      );

      let totalReward = conversionTokens;

      // Calculate and credit commission if applicable
      if (commissionPercent > 0) {
        const commissionAmount = Math.round((purchaseAmount * commissionPercent) / 100);

        await sequelize.query(
          `INSERT INTO referral_rewards (
            user_id, referral_id, reward_type, reward_amount, reward_currency, status, metadata
          ) VALUES ($1, $2, 'commission', $3, $4, 'pending', $5)`,
          {
            bind: [
              referrerId,
              referral.id,
              commissionAmount,
              commissionType,
              JSON.stringify({ purchase_amount: purchaseAmount, commission_percent: commissionPercent })
            ],
            transaction
          }
        );

        if (commissionType === 'tokens') {
          // Convert cash commission to tokens (assuming $1 = 20 tokens based on pricing)
          const commissionTokens = Math.round((commissionAmount / 100) * 20);
          await this.creditReferralReward(
            referrerId,
            referral.id,
            commissionTokens,
            'commission',
            transaction
          );
          totalReward += commissionTokens;
        } else {
          // Cash commission - update earnings
          await sequelize.query(
            `UPDATE users SET referral_earnings = referral_earnings + $1 WHERE id = $2`,
            { bind: [commissionAmount / 100, referrerId], transaction }
          );
        }
      }

      await transaction.commit();

      // Send notification
      this.sendReferralConversionNotification(referrerId, referredUserId, totalReward, purchaseAmount).catch(console.error);

      return {
        success: true,
        tokensEarned: totalReward,
        message: `Conversion recorded! ${totalReward} tokens credited to referrer.`
      };

    } catch (error) {
      await transaction.rollback();
      console.error('Error recording referral conversion:', error);
      throw error;
    }
  }

  /**
   * Credit referral reward tokens to user
   */
  async creditReferralReward(userId, referralId, tokens, rewardType, transaction = null) {
    const shouldCommit = !transaction;
    const txn = transaction || await sequelize.transaction();

    try {
      // Add tokens via token service
      const tokenTxn = await tokenService.addTokens(
        userId,
        tokens,
        `referral_${rewardType}`,
        { referral_id: referralId },
        txn
      );

      // Update reward status
      await sequelize.query(
        `UPDATE referral_rewards
         SET status = 'credited', credited_at = CURRENT_TIMESTAMP, transaction_id = $1
         WHERE user_id = $2 AND referral_id = $3 AND reward_type = $4 AND status = 'pending'`,
        { bind: [tokenTxn.id, userId, referralId, rewardType], transaction: txn }
      );

      // Update user's total referral tokens earned
      await sequelize.query(
        `UPDATE users SET referral_tokens_earned = referral_tokens_earned + $1 WHERE id = $2`,
        { bind: [tokens, userId], transaction: txn }
      );

      if (shouldCommit) {
        await txn.commit();
      }

      return { success: true, tokensAdded: tokens };

    } catch (error) {
      if (shouldCommit) {
        await txn.rollback();
      }
      console.error('Error crediting referral reward:', error);
      throw error;
    }
  }

  /**
   * Get referral stats for a user
   */
  async getReferralStats(userId) {
    try {
      const [stats] = await sequelize.query(
        `SELECT * FROM referral_analytics WHERE user_id = $1`,
        { bind: [userId], type: sequelize.QueryTypes.SELECT }
      );

      if (!stats) {
        return {
          userId,
          referralCode: await this.getReferralCode(userId),
          tier: 'bronze',
          totalReferrals: 0,
          successfulReferrals: 0,
          conversionRate: 0,
          tokensEarned: 0,
          cashEarned: 0
        };
      }

      return {
        userId: stats.user_id,
        email: stats.email,
        name: `${stats.first_name || ''} ${stats.last_name || ''}`.trim(),
        referralCode: stats.referral_code,
        tier: stats.referral_tier,
        totalReferrals: stats.total_referrals || 0,
        successfulReferrals: stats.successful_referrals || 0,
        activeReferrals: stats.active_referrals || 0,
        churnedReferrals: stats.churned_referrals || 0,
        conversionRate: stats.conversion_rate || 0,
        totalRevenue: parseFloat(stats.total_referral_revenue || 0),
        avgReferralValue: parseFloat(stats.avg_referral_value || 0),
        tokensEarned: stats.total_token_rewards || 0,
        cashEarned: parseFloat(stats.total_cash_rewards || 0),
        firstReferralDate: stats.first_referral_date,
        lastReferralDate: stats.last_referral_date,
        tierInfo: {
          name: stats.tier_name,
          signupBonus: stats.signup_bonus_tokens,
          conversionBonus: stats.conversion_bonus_tokens,
          commissionRate: parseFloat(stats.commission_percentage || 0)
        }
      };
    } catch (error) {
      console.error('Error getting referral stats:', error);
      throw error;
    }
  }

  /**
   * Get list of user's referrals
   */
  async getUserReferrals(userId, options = {}) {
    const { limit = 50, offset = 0, status = null } = options;

    try {
      const whereClause = status ? `AND r.status = '${status}'` : '';

      const referrals = await sequelize.query(
        `SELECT
          r.id,
          r.referred_email,
          r.referred_name,
          r.status,
          r.signed_up_at,
          r.converted_at,
          r.first_purchase_amount,
          r.first_purchase_package,
          r.last_activity_at,
          COALESCE(SUM(rr.reward_amount), 0) as total_rewards_earned
         FROM referrals r
         LEFT JOIN referral_rewards rr ON r.id = rr.referral_id AND rr.status = 'credited'
         WHERE r.referrer_user_id = $1 ${whereClause}
         GROUP BY r.id
         ORDER BY r.signed_up_at DESC
         LIMIT $2 OFFSET $3`,
        {
          bind: [userId, limit, offset],
          type: sequelize.QueryTypes.SELECT
        }
      );

      const [countResult] = await sequelize.query(
        `SELECT COUNT(*) as total FROM referrals WHERE referrer_user_id = $1 ${whereClause}`,
        { bind: [userId], type: sequelize.QueryTypes.SELECT }
      );

      return {
        referrals: referrals.map(r => ({
          id: r.id,
          email: r.referred_email,
          name: r.referred_name,
          status: r.status,
          signedUpAt: r.signed_up_at,
          convertedAt: r.converted_at,
          purchaseAmount: parseFloat(r.first_purchase_amount || 0),
          purchasePackage: r.first_purchase_package,
          tokensEarned: r.total_rewards_earned || 0,
          lastActivity: r.last_activity_at
        })),
        pagination: {
          total: parseInt(countResult.total),
          limit,
          offset,
          hasMore: parseInt(countResult.total) > (offset + limit)
        }
      };
    } catch (error) {
      console.error('Error getting user referrals:', error);
      throw error;
    }
  }

  /**
   * Get referral leaderboard
   */
  async getLeaderboard(limit = 100) {
    try {
      const leaderboard = await sequelize.query(
        `SELECT * FROM referral_leaderboard LIMIT $1`,
        { bind: [limit], type: sequelize.QueryTypes.SELECT }
      );

      return leaderboard.map(entry => ({
        rank: entry.leaderboard_rank,
        userId: entry.user_id,
        name: entry.full_name,
        businessName: entry.business_name,
        referralCode: entry.referral_code,
        tier: entry.referral_tier,
        tierBadge: entry.tier_badge,
        totalReferrals: entry.total_referrals,
        successfulReferrals: entry.successful_referrals,
        tokensEarned: entry.referral_tokens_earned,
        cashEarned: parseFloat(entry.referral_earnings || 0)
      }));
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  /**
   * Generate referral link for user
   */
  async getReferralLink(userId, baseUrl = 'https://aiagent.ringlypro.com') {
    const referralCode = await this.getReferralCode(userId);
    return `${baseUrl}/signup?ref=${referralCode}`;
  }

  /**
   * Send referral signup notification email
   */
  async sendReferralSignupNotification(referrerId, referredUser, tokensEarned) {
    try {
      const [referrer] = await sequelize.query(
        `SELECT email, first_name FROM users WHERE id = $1`,
        { bind: [referrerId], type: sequelize.QueryTypes.SELECT }
      );

      if (!referrer) return;

      // TODO: Implement email template
      console.log(`[REFERRAL] Sending signup notification to ${referrer.email}: ${referredUser.email} signed up, earned ${tokensEarned} tokens`);

      // When emailService is enhanced, uncomment:
      /*
      await emailService.sendReferralSignupEmail(referrer.email, {
        referrerName: referrer.first_name,
        referredEmail: referredUser.email,
        tokensEarned
      });
      */

    } catch (error) {
      console.error('Error sending referral signup notification:', error);
    }
  }

  /**
   * Send referral conversion notification email
   */
  async sendReferralConversionNotification(referrerId, referredUserId, tokensEarned, purchaseAmount) {
    try {
      const [referrer] = await sequelize.query(
        `SELECT email, first_name FROM users WHERE id = $1`,
        { bind: [referrerId], type: sequelize.QueryTypes.SELECT }
      );

      const [referred] = await sequelize.query(
        `SELECT email FROM users WHERE id = $1`,
        { bind: [referredUserId], type: sequelize.QueryTypes.SELECT }
      );

      if (!referrer || !referred) return;

      console.log(`[REFERRAL] Sending conversion notification to ${referrer.email}: ${referred.email} purchased, earned ${tokensEarned} tokens`);

      // When emailService is enhanced, uncomment:
      /*
      await emailService.sendReferralConversionEmail(referrer.email, {
        referrerName: referrer.first_name,
        referredEmail: referred.email,
        tokensEarned,
        purchaseAmount
      });
      */

    } catch (error) {
      console.error('Error sending referral conversion notification:', error);
    }
  }

  /**
   * Process monthly recurring rewards for Silver/Gold tiers
   */
  async processMonthlyRecurringRewards() {
    try {
      // Get all users with Silver or Gold tier
      const users = await sequelize.query(
        `SELECT u.id, u.email, u.referral_tier, rt.recurring_monthly_tokens
         FROM users u
         JOIN referral_tiers rt ON u.referral_tier = rt.tier_name
         WHERE rt.recurring_monthly_tokens > 0`,
        { type: sequelize.QueryTypes.SELECT }
      );

      let processed = 0;
      for (const user of users) {
        try {
          await tokenService.addTokens(
            user.id,
            user.recurring_monthly_tokens,
            'referral_monthly_bonus',
            { tier: user.referral_tier }
          );
          processed++;
          console.log(`[REFERRAL] Credited ${user.recurring_monthly_tokens} recurring tokens to user ${user.id}`);
        } catch (error) {
          console.error(`[REFERRAL] Failed to credit recurring tokens to user ${user.id}:`, error);
        }
      }

      return {
        success: true,
        processed,
        message: `Processed ${processed} monthly recurring rewards`
      };

    } catch (error) {
      console.error('Error processing monthly recurring rewards:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ReferralService();
