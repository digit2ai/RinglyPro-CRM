// =====================================================
// RinglyPro Credit System Service
// File: src/services/creditSystem.js
// =====================================================

const { Pool } = require('pg');
// Conditional Stripe initialization
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.log('Stripe not configured - payment features disabled');
}

class CreditSystem {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL
        });
    }

    // Get comprehensive credit summary for a client
    async getClientCreditSummary(clientId) {
        const query = `
            SELECT * FROM client_credit_summary 
            WHERE client_id = $1
        `;
        const result = await this.pool.query(query, [clientId]);
        return result.rows[0];
    }

    // Get monthly spend for current month
    async getMonthlySpend(clientId) {
        const query = `
            SELECT COALESCE(SUM(cost), 0) as monthly_spend
            FROM usage_records 
            WHERE client_id = $1 
              AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        `;
        const result = await this.pool.query(query, [clientId]);
        return parseFloat(result.rows[0].monthly_spend);
    }

    // Track call or SMS usage and charge appropriately
    async trackUsage(clientId, { callSid, messageSid, durationSeconds, usageType }) {
        const client = await this.pool.query(
            'SELECT * FROM clients WHERE id = $1', 
            [clientId]
        );
        
        if (client.rows.length === 0) {
            throw new Error('Client not found');
        }
        
        const creditAccount = await this.getCreditAccount(clientId);
        
        // Check if we need to reset monthly free minutes
        await this.checkMonthlyReset(creditAccount);
        
        let usageResult;
        if (usageType === 'voice_call') {
            const durationMinutes = Math.ceil(durationSeconds / 60);
            usageResult = await this.calculateVoiceUsageCharge(
                creditAccount, 
                durationMinutes, 
                client.rows[0].per_minute_rate
            );
        } else if (usageType === 'sms') {
            usageResult = await this.calculateSMSUsageCharge(
                creditAccount,
                client.rows[0].per_minute_rate
            );
        }
        
        // Create usage record
        const usageRecord = await this.pool.query(`
            INSERT INTO usage_records (
                client_id, call_sid, message_sid, usage_type, duration_seconds, 
                duration_minutes, cost, charged_from, balance_before, balance_after,
                free_minutes_before, free_minutes_after, caller_phone, recipient_phone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            clientId, callSid, messageSid, usageType, durationSeconds,
            usageResult.durationMinutes || null, usageResult.cost, usageResult.chargedFrom,
            usageResult.balanceBefore, usageResult.balanceAfter,
            usageResult.freeMinutesBefore, usageResult.freeMinutesAfter,
            usageResult.callerPhone, usageResult.recipientPhone
        ]);
        
        // Update credit account
        await this.pool.query(`
            UPDATE credit_accounts SET 
                balance = $1,
                free_minutes_used = $2,
                total_minutes_used = total_minutes_used + $3,
                total_amount_spent = total_amount_spent + $4,
                last_usage_date = NOW(),
                updated_at = NOW()
            WHERE client_id = $5
        `, [
            usageResult.balanceAfter,
            usageResult.freeMinutesAfter,
            usageResult.durationMinutes || 0,
            usageResult.cost,
            clientId
        ]);
        
        // Check for low balance notifications
        await this.checkLowBalanceNotifications(clientId, usageResult.balanceAfter);
        
        return usageRecord.rows[0];
    }

    // Calculate usage charge for voice calls
    async calculateVoiceUsageCharge(creditAccount, durationMinutes, perMinuteRate) {
        const client = await this.pool.query(
            'SELECT monthly_free_minutes FROM clients WHERE id = $1',
            [creditAccount.client_id]
        );
        const monthlyFreeMinutes = client.rows[0].monthly_free_minutes;
        
        const freeMinutesRemaining = monthlyFreeMinutes - creditAccount.free_minutes_used;
        const balanceBefore = parseFloat(creditAccount.balance);
        const freeMinutesBefore = creditAccount.free_minutes_used;
        
        let freeMinutesUsed = 0;
        let paidMinutesUsed = 0;
        let totalCost = 0;
        let chargedFrom = 'free_tier';
        
        if (freeMinutesRemaining >= durationMinutes) {
            // All minutes covered by free tier
            freeMinutesUsed = durationMinutes;
            chargedFrom = 'free_tier';
        } else if (freeMinutesRemaining > 0) {
            // Partially covered by free tier
            freeMinutesUsed = freeMinutesRemaining;
            paidMinutesUsed = durationMinutes - freeMinutesRemaining;
            totalCost = paidMinutesUsed * perMinuteRate;
            chargedFrom = 'mixed';
        } else {
            // All paid minutes
            paidMinutesUsed = durationMinutes;
            totalCost = paidMinutesUsed * perMinuteRate;
            chargedFrom = 'paid_balance';
        }
        
        // Check if sufficient balance for paid portion
        if (totalCost > balanceBefore) {
            throw new Error('Insufficient credit balance');
        }
        
        return {
            cost: totalCost,
            chargedFrom,
            balanceBefore,
            balanceAfter: balanceBefore - totalCost,
            freeMinutesBefore,
            freeMinutesAfter: freeMinutesBefore + freeMinutesUsed,
            durationMinutes
        };
    }

    // Calculate usage charge for SMS
    async calculateSMSUsageCharge(creditAccount, perMinuteRate) {
        const smsCost = perMinuteRate * 0.5; // SMS costs half of voice per minute rate
        const balanceBefore = parseFloat(creditAccount.balance);
        
        if (smsCost > balanceBefore) {
            throw new Error('Insufficient credit balance for SMS');
        }
        
        return {
            cost: smsCost,
            chargedFrom: 'paid_balance',
            balanceBefore,
            balanceAfter: balanceBefore - smsCost,
            freeMinutesBefore: creditAccount.free_minutes_used,
            freeMinutesAfter: creditAccount.free_minutes_used
        };
    }

    // Get credit account for client
    async getCreditAccount(clientId) {
        const result = await this.pool.query(
            'SELECT * FROM credit_accounts WHERE client_id = $1',
            [clientId]
        );
        
        if (result.rows.length === 0) {
            // Create credit account if it doesn't exist
            await this.pool.query(`
                INSERT INTO credit_accounts (client_id, balance, free_minutes_used)
                VALUES ($1, 0.00, 0)
            `, [clientId]);
            
            return this.getCreditAccount(clientId);
        }
        
        return result.rows[0];
    }

    // Check for monthly free minutes reset
    async checkMonthlyReset(creditAccount) {
        const now = new Date();
        const resetDate = new Date(creditAccount.free_minutes_reset_date);
        
        if (now >= resetDate) {
            const nextResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            await this.pool.query(`
                UPDATE credit_accounts SET 
                    free_minutes_used = 0,
                    free_minutes_reset_date = $1,
                    low_balance_notified = false,
                    updated_at = NOW()
                WHERE client_id = $2
            `, [nextResetDate, creditAccount.client_id]);
            
            // Send monthly reset notification
            await this.sendMonthlyResetNotification(creditAccount.client_id);
        }
    }

    // Check and send low balance notifications
    async checkLowBalanceNotifications(clientId, currentBalance) {
        const creditAccount = await this.getCreditAccount(clientId);
        
        // Low balance threshold ($1.00)
        if (currentBalance <= 1.00 && !creditAccount.low_balance_notified) {
            await this.sendLowBalanceNotification(clientId, currentBalance);
            await this.pool.query(
                'UPDATE credit_accounts SET low_balance_notified = true WHERE client_id = $1',
                [clientId]
            );
        }
        
        // Zero balance
        if (currentBalance <= 0 && !creditAccount.zero_balance_notified) {
            await this.sendZeroBalanceNotification(clientId);
            await this.pool.query(
                'UPDATE credit_accounts SET zero_balance_notified = true WHERE client_id = $1',
                [clientId]
            );
        }
    }

    // Send low balance notification
    async sendLowBalanceNotification(clientId, balance) {
        const client = await this.pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [clientId]
        );
        
        if (client.rows.length === 0) return;
        
        const clientData = client.rows[0];
        const freeMinutesUsed = await this.getFreeMinutesUsed(clientId);
        
        const notification = await this.pool.query(`
            INSERT INTO credit_notifications (
                client_id, notification_type, trigger_balance, message, sms_message
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [
            clientId,
            'low_balance',
            balance,
            `Your RinglyPro credit balance is low ($${balance.toFixed(2)}). Reload now to ensure uninterrupted service.`,
            `🔔 RinglyPro Low Balance Alert\n\nYour credit balance: $${balance.toFixed(2)}\nFree minutes used: ${freeMinutesUsed}/100\n\nReload now: ${process.env.APP_URL}/credits/reload/${clientId}\n\nReply STOP to opt out.`
        ]);
        
        console.log(`Low balance notification created for client ${clientId}: $${balance.toFixed(2)}`);
        return notification.rows[0];
    }

    // Credit reload with Stripe (conditional)
    async initiateReload(clientId, amount, paymentMethodId, options = {}) {
        // Check if Stripe is configured
        if (!stripe) {
            throw new Error('Payment processing not configured. Stripe credentials required.');
        }

        const client = await this.pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [clientId]
        );
        
        if (client.rows.length === 0) {
            throw new Error('Client not found');
        }
        
        const clientData = client.rows[0];
        const creditAccount = await this.getCreditAccount(clientId);
        
        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            payment_method: paymentMethodId,
            customer: clientData.stripe_customer_id,
            confirm: true,
            metadata: {
                clientId: clientId.toString(),
                type: 'credit_reload'
            }
        });
        
        // Create transaction record
        const transaction = await this.pool.query(`
            INSERT INTO payment_transactions (
                client_id, stripe_payment_intent_id, amount, status, 
                payment_method, balance_before, balance_after
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            clientId,
            paymentIntent.id,
            amount,
            paymentIntent.status,
            'card',
            creditAccount.balance,
            parseFloat(creditAccount.balance) + amount
        ]);
        
        if (paymentIntent.status === 'succeeded') {
            await this.completeReload(transaction.rows[0].id, amount);
        }
        
        return { 
            transaction: transaction.rows[0], 
            paymentIntent 
        };
    }

    // Complete credit reload
    async completeReload(transactionId, amount) {
        const transaction = await this.pool.query(
            'SELECT * FROM payment_transactions WHERE id = $1',
            [transactionId]
        );
        
        if (transaction.rows.length === 0) {
            throw new Error('Transaction not found');
        }
        
        const transactionData = transaction.rows[0];
        const creditAccount = await this.getCreditAccount(transactionData.client_id);
        
        // Update credit balance
        await this.pool.query(`
            UPDATE credit_accounts SET 
                balance = balance + $1,
                low_balance_notified = false,
                zero_balance_notified = false,
                updated_at = NOW()
            WHERE client_id = $2
        `, [amount, transactionData.client_id]);
        
        // Update transaction
        await this.pool.query(`
            UPDATE payment_transactions SET 
                status = 'completed',
                completed_at = NOW(),
                balance_after = $1
            WHERE id = $2
        `, [parseFloat(creditAccount.balance) + amount, transactionId]);
        
        // Clear low balance notifications
        await this.pool.query(`
            UPDATE credit_notifications SET 
                sent = true, 
                sent_at = NOW() 
            WHERE client_id = $1 AND sent = false
        `, [transactionData.client_id]);
        
        console.log(`Credit reload completed for client ${transactionData.client_id}: $${amount}`);
        return transaction.rows[0];
    }

    // Get usage history with pagination
    async getUsageHistory(clientId, options = {}) {
        const { page = 1, limit = 50, type, startDate, endDate } = options;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE client_id = $1';
        let params = [clientId];
        let paramCount = 1;
        
        if (type) {
            whereClause += ` AND usage_type = $${++paramCount}`;
            params.push(type);
        }
        
        if (startDate) {
            whereClause += ` AND created_at >= $${++paramCount}`;
            params.push(startDate);
        }
        
        if (endDate) {
            whereClause += ` AND created_at <= $${++paramCount}`;
            params.push(endDate);
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM usage_records ${whereClause}`;
        const dataQuery = `
            SELECT * FROM usage_records 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;
        
        params.push(limit, offset);
        
        const [countResult, dataResult] = await Promise.all([
            this.pool.query(countQuery, params.slice(0, paramCount - 2)),
            this.pool.query(dataQuery, params)
        ]);
        
        return {
            records: dataResult.rows,
            total: parseInt(countResult.rows[0].total)
        };
    }

    // Get payment history
    async getPaymentHistory(clientId, options = {}) {
        const { page = 1, limit = 20, status } = options;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE client_id = $1';
        let params = [clientId];
        let paramCount = 1;
        
        if (status) {
            whereClause += ` AND status = $${++paramCount}`;
            params.push(status);
        }
        
        const countQuery = `SELECT COUNT(*) as total FROM payment_transactions ${whereClause}`;
        const dataQuery = `
            SELECT * FROM payment_transactions 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT $${++paramCount} OFFSET $${++paramCount}
        `;
        
        params.push(limit, offset);
        
        const [countResult, dataResult] = await Promise.all([
            this.pool.query(countQuery, params.slice(0, paramCount - 2)),
            this.pool.query(dataQuery, params)
        ]);
        
        return {
            records: dataResult.rows,
            total: parseInt(countResult.rows[0].total)
        };
    }

    // Get notifications
    async getNotifications(clientId, options = {}) {
        const { active = true } = options;
        
        let whereClause = 'WHERE client_id = $1';
        const params = [clientId];
        
        if (active) {
            whereClause += ' AND sent = false AND (expires_at IS NULL OR expires_at > NOW())';
        }
        
        const query = `
            SELECT * FROM credit_notifications 
            ${whereClause}
            ORDER BY created_at DESC
        `;
        
        const result = await this.pool.query(query, params);
        return result.rows;
    }

    // Configure auto-reload
    async configureAutoReload(clientId, { enabled, amount, threshold, paymentMethodId }) {
        const updateQuery = `
            UPDATE clients SET 
                auto_reload_enabled = $1,
                auto_reload_amount = $2,
                auto_reload_threshold = $3,
                updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `;
        
        const result = await this.pool.query(updateQuery, [
            enabled, amount, threshold, clientId
        ]);
        
        return result.rows[0];
    }

    // Get usage analytics
    async getUsageAnalytics(clientId, period = '30d') {
        const analytics = await this.pool.query(`
            SELECT * FROM client_usage_analytics 
            WHERE client_id = $1
        `, [clientId]);
        
        return analytics.rows[0] || {};
    }

    // Handle Stripe webhooks (conditional)
    async handleStripeWebhook(event) {
        if (!stripe) {
            console.log('Stripe webhook received but Stripe not configured');
            return;
        }

        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.handlePaymentSuccess(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await this.handlePaymentFailure(event.data.object);
                break;
            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }
    }

    // Handle successful payment
    async handlePaymentSuccess(paymentIntent) {
        const clientId = paymentIntent.metadata.clientId;
        const amount = paymentIntent.amount / 100; // Convert from cents
        
        // Find the transaction
        const transaction = await this.pool.query(
            'SELECT * FROM payment_transactions WHERE stripe_payment_intent_id = $1',
            [paymentIntent.id]
        );
        
        if (transaction.rows.length > 0) {
            await this.completeReload(transaction.rows[0].id, amount);
        }
    }

    // Handle failed payment
    async handlePaymentFailure(paymentIntent) {
        await this.pool.query(`
            UPDATE payment_transactions SET 
                status = 'failed',
                failed_at = NOW(),
                failure_reason = $1
            WHERE stripe_payment_intent_id = $2
        `, [paymentIntent.last_payment_error?.message || 'Payment failed', paymentIntent.id]);
    }

    // Helper methods
    async getFreeMinutesUsed(clientId) {
        const result = await this.pool.query(
            'SELECT free_minutes_used FROM credit_accounts WHERE client_id = $1',
            [clientId]
        );
        return result.rows[0]?.free_minutes_used || 0;
    }

    async sendMonthlyResetNotification(clientId) {
        console.log(`Monthly reset notification for client ${clientId}`);
        // Implementation for monthly reset notification can be added here
    }

    async sendZeroBalanceNotification(clientId) {
        console.log(`Zero balance notification for client ${clientId}`);
        // Implementation for zero balance notification can be added here
    }

    // Test method to manually add credits (for testing without Stripe)
    async addTestCredits(clientId, amount) {
        const creditAccount = await this.getCreditAccount(clientId);
        
        await this.pool.query(`
            UPDATE credit_accounts SET 
                balance = balance + $1,
                updated_at = NOW()
            WHERE client_id = $2
        `, [amount, clientId]);
        
        // Create a test transaction record
        await this.pool.query(`
            INSERT INTO payment_transactions (
                client_id, amount, status, payment_method, 
                balance_before, balance_after, completed_at
            ) VALUES ($1, $2, 'completed', 'test', $3, $4, NOW())
        `, [
            clientId, 
            amount, 
            creditAccount.balance, 
            parseFloat(creditAccount.balance) + amount
        ]);
        
        console.log(`Test credits added for client ${clientId}: $${amount}`);
        return { success: true, amount, clientId };
    }
}

module.exports = CreditSystem;