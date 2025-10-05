// =====================================================
// Twilio Number Management Service
// File: src/services/twilioNumberService.js
// =====================================================

const twilio = require('twilio');

class TwilioNumberService {
    constructor() {
        this.twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        this.baseUrl = process.env.APP_URL || 'https://aiagent.ringlypro.com';
    }

    /**
     * Purchase and configure a new phone number for a client
     * CRITICAL: Automatically sets up statusCallback to track usage and deduct credits
     *
     * @param {Object} options - Purchase options
     * @param {string} options.areaCode - Preferred area code (e.g., "212")
     * @param {number} options.clientId - Client ID for tracking
     * @param {string} options.clientPhone - Optional: existing phone to port
     * @returns {Promise<Object>} Purchased phone number details
     */
    async purchaseAndConfigureNumber(options = {}) {
        const { areaCode, clientId } = options;

        try {
            console.log(`🔍 Searching for available phone number (Area code: ${areaCode || 'any'})...`);

            // Search for available phone numbers
            const availableNumbers = await this.twilioClient
                .availablePhoneNumbers('US')
                .local
                .list({
                    areaCode: areaCode,
                    voiceEnabled: true,
                    smsEnabled: true,
                    limit: 5
                });

            if (availableNumbers.length === 0) {
                throw new Error(`No available phone numbers found for area code ${areaCode}`);
            }

            const selectedNumber = availableNumbers[0].phoneNumber;
            console.log(`📞 Found available number: ${selectedNumber}`);

            // Purchase the phone number with AUTOMATIC WEBHOOK CONFIGURATION
            const purchasedNumber = await this.twilioClient
                .incomingPhoneNumbers
                .create({
                    phoneNumber: selectedNumber,
                    friendlyName: `RinglyPro Client ${clientId}`,

                    // ⚠️ CRITICAL: Voice Configuration for Credit Tracking
                    voiceUrl: `${this.baseUrl}/voice/rachel/incoming`,
                    voiceMethod: 'POST',

                    // 🔥 THIS IS THE CRITICAL PART - Automatic Credit Deduction
                    statusCallback: `${this.baseUrl}/webhook/twilio/voice`,
                    statusCallbackMethod: 'POST',
                    statusCallbackEvent: ['initiated', 'answered', 'completed'],

                    // SMS Configuration
                    smsUrl: `${this.baseUrl}/webhook/twilio/sms`,
                    smsMethod: 'POST',

                    // Additional settings
                    voiceFallbackUrl: `${this.baseUrl}/voice/fallback`,
                    voiceFallbackMethod: 'POST'
                });

            console.log(`✅ Phone number purchased and configured: ${purchasedNumber.phoneNumber}`);
            console.log(`✅ StatusCallback configured: ${this.baseUrl}/webhook/twilio/voice`);
            console.log(`✅ Voice URL configured: ${this.baseUrl}/voice/rachel/incoming`);

            return {
                success: true,
                phoneNumber: purchasedNumber.phoneNumber,
                sid: purchasedNumber.sid,
                friendlyName: purchasedNumber.friendlyName,
                voiceUrl: purchasedNumber.voiceUrl,
                statusCallback: purchasedNumber.statusCallback,
                statusCallbackMethod: purchasedNumber.statusCallbackMethod,
                cost: purchasedNumber.monthlyPrice || 1.00
            };

        } catch (error) {
            console.error('❌ Error purchasing phone number:', error);
            throw new Error(`Failed to purchase phone number: ${error.message}`);
        }
    }

    /**
     * Configure an EXISTING phone number with proper webhooks
     * Use this to fix numbers that were purchased without proper configuration
     *
     * @param {string} phoneNumberSid - Twilio Phone Number SID
     * @param {number} clientId - Client ID for tracking
     * @returns {Promise<Object>} Updated configuration
     */
    async configureExistingNumber(phoneNumberSid, clientId) {
        try {
            console.log(`🔧 Configuring existing number: ${phoneNumberSid}`);

            const updatedNumber = await this.twilioClient
                .incomingPhoneNumbers(phoneNumberSid)
                .update({
                    friendlyName: `RinglyPro Client ${clientId}`,

                    // Voice Configuration
                    voiceUrl: `${this.baseUrl}/voice/rachel/incoming`,
                    voiceMethod: 'POST',

                    // 🔥 CRITICAL: Add StatusCallback for Credit Tracking
                    statusCallback: `${this.baseUrl}/webhook/twilio/voice`,
                    statusCallbackMethod: 'POST',
                    statusCallbackEvent: ['initiated', 'answered', 'completed'],

                    // SMS Configuration
                    smsUrl: `${this.baseUrl}/webhook/twilio/sms`,
                    smsMethod: 'POST',

                    // Fallback
                    voiceFallbackUrl: `${this.baseUrl}/voice/fallback`,
                    voiceFallbackMethod: 'POST'
                });

            console.log(`✅ Number configured: ${updatedNumber.phoneNumber}`);
            console.log(`✅ StatusCallback: ${updatedNumber.statusCallback}`);

            return {
                success: true,
                phoneNumber: updatedNumber.phoneNumber,
                statusCallback: updatedNumber.statusCallback,
                voiceUrl: updatedNumber.voiceUrl
            };

        } catch (error) {
            console.error('❌ Error configuring phone number:', error);
            throw new Error(`Failed to configure phone number: ${error.message}`);
        }
    }

    /**
     * Verify that a phone number has proper statusCallback configured
     * Use this to audit existing numbers and catch configuration issues
     *
     * @param {string} phoneNumberSid - Twilio Phone Number SID
     * @returns {Promise<Object>} Verification results
     */
    async verifyNumberConfiguration(phoneNumberSid) {
        try {
            const number = await this.twilioClient
                .incomingPhoneNumbers(phoneNumberSid)
                .fetch();

            const expectedStatusCallback = `${this.baseUrl}/webhook/twilio/voice`;
            const hasStatusCallback = number.statusCallback === expectedStatusCallback;
            const hasVoiceUrl = number.voiceUrl?.includes('/voice/rachel/incoming');

            const isConfiguredCorrectly = hasStatusCallback && hasVoiceUrl;

            return {
                phoneNumber: number.phoneNumber,
                sid: number.sid,
                voiceUrl: number.voiceUrl,
                statusCallback: number.statusCallback,
                statusCallbackMethod: number.statusCallbackMethod,
                statusCallbackEvent: number.statusCallbackEvent,
                isConfiguredCorrectly: isConfiguredCorrectly,
                issues: {
                    missingStatusCallback: !hasStatusCallback,
                    missingVoiceUrl: !hasVoiceUrl
                },
                recommendations: isConfiguredCorrectly
                    ? 'Configuration is correct ✅'
                    : '⚠️ WARNING: Missing statusCallback - Credits will NOT be deducted! Run configureExistingNumber() to fix.'
            };

        } catch (error) {
            console.error('❌ Error verifying number configuration:', error);
            throw new Error(`Failed to verify number: ${error.message}`);
        }
    }

    /**
     * Audit ALL phone numbers in the account
     * Find any numbers missing proper statusCallback configuration
     *
     * @returns {Promise<Array>} List of all numbers with their configuration status
     */
    async auditAllNumbers() {
        try {
            console.log('🔍 Auditing all Twilio phone numbers...');

            const numbers = await this.twilioClient
                .incomingPhoneNumbers
                .list({ limit: 100 });

            const audits = await Promise.all(
                numbers.map(num => this.verifyNumberConfiguration(num.sid))
            );

            const misconfigured = audits.filter(a => !a.isConfiguredCorrectly);

            console.log(`📊 Audit complete: ${numbers.length} total numbers`);
            console.log(`✅ Correctly configured: ${audits.length - misconfigured.length}`);
            console.log(`⚠️  Misconfigured: ${misconfigured.length}`);

            if (misconfigured.length > 0) {
                console.log('\n⚠️  CRITICAL: These numbers are missing statusCallback:');
                misconfigured.forEach(num => {
                    console.log(`   - ${num.phoneNumber} (SID: ${num.sid})`);
                });
                console.log('\n💰 You are losing money on calls to these numbers!');
            }

            return {
                total: numbers.length,
                configured: audits.length - misconfigured.length,
                misconfigured: misconfigured.length,
                numbers: audits,
                criticalIssues: misconfigured
            };

        } catch (error) {
            console.error('❌ Error auditing numbers:', error);
            throw new Error(`Failed to audit numbers: ${error.message}`);
        }
    }

    /**
     * Release a phone number (when client cancels)
     *
     * @param {string} phoneNumberSid - Twilio Phone Number SID
     * @returns {Promise<Object>} Release confirmation
     */
    async releaseNumber(phoneNumberSid) {
        try {
            console.log(`🗑️  Releasing phone number: ${phoneNumberSid}`);

            await this.twilioClient
                .incomingPhoneNumbers(phoneNumberSid)
                .remove();

            console.log(`✅ Phone number released successfully`);

            return {
                success: true,
                message: 'Phone number released'
            };

        } catch (error) {
            console.error('❌ Error releasing phone number:', error);
            throw new Error(`Failed to release phone number: ${error.message}`);
        }
    }
}

module.exports = TwilioNumberService;
