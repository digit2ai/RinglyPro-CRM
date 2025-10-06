// services/twilioNumberProvisioning.js
const twilio = require('twilio');

class TwilioNumberProvisioning {
    constructor(accountSid, authToken, webhookBaseUrl) {
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.webhookBaseUrl = webhookBaseUrl;
        this.client = twilio(accountSid, authToken);
    }

    /**
     * Search for available phone numbers in a specific area code or country
     * @param {Object} options - Search criteria
     * @param {string} options.areaCode - Area code to search (e.g., '888', '212')
     * @param {string} options.country - Country code (default: 'US')
     * @param {boolean} options.tollFree - Search for toll-free numbers
     * @param {number} options.limit - Max results to return
     * @returns {Array} Available phone numbers
     */
    async searchAvailableNumbers(options = {}) {
        try {
            const {
                areaCode = null,
                country = 'US',
                tollFree = false,
                limit = 10
            } = options;

            console.log(`🔍 Searching for available numbers...`);
            console.log(`   Area code: ${areaCode || 'any'}`);
            console.log(`   Country: ${country}`);
            console.log(`   Toll-free: ${tollFree}`);

            const searchParams = {
                limit: limit,
                voiceEnabled: true,
                smsEnabled: true
            };

            if (areaCode) {
                searchParams.areaCode = areaCode;
            }

            let availableNumbers;
            if (tollFree) {
                availableNumbers = await this.client
                    .availablePhoneNumbers(country)
                    .tollFree
                    .list(searchParams);
            } else {
                availableNumbers = await this.client
                    .availablePhoneNumbers(country)
                    .local
                    .list(searchParams);
            }

            console.log(`✅ Found ${availableNumbers.length} available numbers`);

            return availableNumbers.map(num => ({
                phoneNumber: num.phoneNumber,
                friendlyName: num.friendlyName,
                locality: num.locality,
                region: num.region,
                postalCode: num.postalCode,
                capabilities: {
                    voice: num.capabilities.voice,
                    sms: num.capabilities.sms,
                    mms: num.capabilities.mms
                }
            }));

        } catch (error) {
            console.error('❌ Error searching for numbers:', error);
            throw new Error(`Failed to search for numbers: ${error.message}`);
        }
    }

    /**
     * Purchase a phone number and configure it for Rachel voice bot
     * @param {string} phoneNumber - Phone number to purchase (e.g., '+18885551234')
     * @param {Object} options - Configuration options
     * @param {string} options.friendlyName - Friendly name for the number
     * @returns {Object} Purchased number details
     */
    async purchaseAndConfigureNumber(phoneNumber, options = {}) {
        try {
            console.log(`📞 Purchasing number: ${phoneNumber}...`);

            const { friendlyName = 'RinglyPro Number' } = options;

            // Purchase the number
            const incomingPhoneNumber = await this.client.incomingPhoneNumbers.create({
                phoneNumber: phoneNumber,
                friendlyName: friendlyName,
                voiceUrl: `${this.webhookBaseUrl}/voice/rachel/`,
                voiceMethod: 'POST',
                voiceFallbackUrl: `${this.webhookBaseUrl}/voice/rachel/`,
                voiceFallbackMethod: 'POST',
                smsUrl: `${this.webhookBaseUrl}/webhook/twilio/sms`,
                smsMethod: 'POST',
                statusCallback: `${this.webhookBaseUrl}/webhook/twilio/status`,
                statusCallbackMethod: 'POST'
            });

            console.log(`✅ Number purchased successfully!`);
            console.log(`   SID: ${incomingPhoneNumber.sid}`);
            console.log(`   Number: ${incomingPhoneNumber.phoneNumber}`);
            console.log(`   Voice URL: ${incomingPhoneNumber.voiceUrl}`);

            return {
                sid: incomingPhoneNumber.sid,
                phoneNumber: incomingPhoneNumber.phoneNumber,
                friendlyName: incomingPhoneNumber.friendlyName,
                voiceUrl: incomingPhoneNumber.voiceUrl,
                smsUrl: incomingPhoneNumber.smsUrl,
                capabilities: {
                    voice: incomingPhoneNumber.capabilities.voice,
                    sms: incomingPhoneNumber.capabilities.sms,
                    mms: incomingPhoneNumber.capabilities.mms
                }
            };

        } catch (error) {
            console.error('❌ Error purchasing number:', error);
            throw new Error(`Failed to purchase number: ${error.message}`);
        }
    }

    /**
     * Update webhook URLs for an existing number
     * @param {string} phoneNumberSid - Twilio phone number SID
     * @returns {Object} Updated number details
     */
    async updateWebhooks(phoneNumberSid) {
        try {
            console.log(`🔧 Updating webhooks for SID: ${phoneNumberSid}...`);

            const updatedNumber = await this.client
                .incomingPhoneNumbers(phoneNumberSid)
                .update({
                    voiceUrl: `${this.webhookBaseUrl}/voice/rachel/`,
                    voiceMethod: 'POST',
                    voiceFallbackUrl: `${this.webhookBaseUrl}/voice/rachel/`,
                    voiceFallbackMethod: 'POST',
                    smsUrl: `${this.webhookBaseUrl}/webhook/twilio/sms`,
                    smsMethod: 'POST'
                });

            console.log(`✅ Webhooks updated successfully!`);
            console.log(`   Voice URL: ${updatedNumber.voiceUrl}`);

            return {
                sid: updatedNumber.sid,
                phoneNumber: updatedNumber.phoneNumber,
                voiceUrl: updatedNumber.voiceUrl,
                smsUrl: updatedNumber.smsUrl
            };

        } catch (error) {
            console.error('❌ Error updating webhooks:', error);
            throw new Error(`Failed to update webhooks: ${error.message}`);
        }
    }

    /**
     * Release (delete) a phone number
     * @param {string} phoneNumberSid - Twilio phone number SID
     */
    async releaseNumber(phoneNumberSid) {
        try {
            console.log(`🗑️ Releasing number SID: ${phoneNumberSid}...`);

            await this.client
                .incomingPhoneNumbers(phoneNumberSid)
                .remove();

            console.log(`✅ Number released successfully!`);

        } catch (error) {
            console.error('❌ Error releasing number:', error);
            throw new Error(`Failed to release number: ${error.message}`);
        }
    }

    /**
     * Get details of a phone number
     * @param {string} phoneNumberSid - Twilio phone number SID
     * @returns {Object} Number details
     */
    async getNumberDetails(phoneNumberSid) {
        try {
            const number = await this.client
                .incomingPhoneNumbers(phoneNumberSid)
                .fetch();

            return {
                sid: number.sid,
                phoneNumber: number.phoneNumber,
                friendlyName: number.friendlyName,
                voiceUrl: number.voiceUrl,
                smsUrl: number.smsUrl,
                capabilities: number.capabilities,
                status: number.status
            };

        } catch (error) {
            console.error('❌ Error fetching number details:', error);
            throw new Error(`Failed to fetch number details: ${error.message}`);
        }
    }

    /**
     * List all phone numbers in the account
     * @returns {Array} All phone numbers
     */
    async listAllNumbers() {
        try {
            console.log(`📋 Listing all phone numbers...`);

            const numbers = await this.client.incomingPhoneNumbers.list();

            console.log(`✅ Found ${numbers.length} numbers in account`);

            return numbers.map(num => ({
                sid: num.sid,
                phoneNumber: num.phoneNumber,
                friendlyName: num.friendlyName,
                voiceUrl: num.voiceUrl,
                smsUrl: num.smsUrl
            }));

        } catch (error) {
            console.error('❌ Error listing numbers:', error);
            throw new Error(`Failed to list numbers: ${error.message}`);
        }
    }

    /**
     * Provision a complete number for a new client
     * @param {Object} options - Provisioning options
     * @param {string} options.businessName - Business name for friendly name
     * @param {string} options.areaCode - Preferred area code (optional)
     * @param {boolean} options.tollFree - Request toll-free number (optional)
     * @returns {Object} Provisioned number details
     */
    async provisionNumberForClient(options = {}) {
        try {
            const {
                businessName,
                areaCode = null,
                tollFree = false
            } = options;

            console.log(`🎯 Provisioning number for client: ${businessName}`);

            // Step 1: Search for available numbers
            const availableNumbers = await this.searchAvailableNumbers({
                areaCode,
                tollFree,
                limit: 5
            });

            if (availableNumbers.length === 0) {
                throw new Error('No available numbers found');
            }

            // Step 2: Select the first available number
            const selectedNumber = availableNumbers[0];
            console.log(`✅ Selected number: ${selectedNumber.phoneNumber}`);

            // Step 3: Purchase and configure the number
            const purchasedNumber = await this.purchaseAndConfigureNumber(
                selectedNumber.phoneNumber,
                { friendlyName: `${businessName} - RinglyPro` }
            );

            console.log(`🎉 Number provisioned successfully for ${businessName}!`);

            return {
                ...purchasedNumber,
                selectedFrom: availableNumbers.length,
                locality: selectedNumber.locality,
                region: selectedNumber.region
            };

        } catch (error) {
            console.error('❌ Error provisioning number:', error);
            throw new Error(`Failed to provision number: ${error.message}`);
        }
    }
}

module.exports = TwilioNumberProvisioning;
