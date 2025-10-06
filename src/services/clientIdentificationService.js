// services/clientIdentificationService.js
const { Client } = require('pg');

class ClientIdentificationService {
    constructor(databaseUrl) {
        this.databaseUrl = databaseUrl;
    }

    /**
     * Get database client connection
     */
    async getDatabaseClient() {
        const client = new Client({
            connectionString: this.databaseUrl,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        await client.connect();
        return client;
    }

    /**
     * Identify client by their RinglyPro phone number
     * @param {string} ringlypro_number - The incoming phone number
     * @returns {Object|null} Client information or null if not found
     */
    async identifyClientByNumber(ringlypro_number) {
        // Clean the phone number for comparison
        const cleanedNumber = this.cleanPhoneNumber(ringlypro_number);
        
        let client;
        try {
            client = await this.getDatabaseClient();
            
            const query = `
                SELECT 
                    id,
                    business_name,
                    custom_greeting,
                    booking_url,
                    ringlypro_number,
                    rachel_enabled,
                    business_hours_start,
                    business_hours_end,
                    business_days,
                    appointment_duration,
                    timezone,
                    booking_enabled,
                    active
                FROM clients 
                WHERE ringlypro_number = $1 OR ringlypro_number = $2
            `;
            
            // Try both original and cleaned number formats
            const result = await client.query(query, [ringlypro_number, cleanedNumber]);
            
            if (result.rows.length > 0) {
                const clientInfo = {
                    client_id: result.rows[0].id,
                    business_name: result.rows[0].business_name,
                    custom_greeting: result.rows[0].custom_greeting,
                    booking_url: result.rows[0].booking_url,
                    ringlypro_number: result.rows[0].ringlypro_number,
                    rachel_enabled: result.rows[0].rachel_enabled,
                    business_hours_start: result.rows[0].business_hours_start,
                    business_hours_end: result.rows[0].business_hours_end,
                    business_days: result.rows[0].business_days,
                    appointment_duration: result.rows[0].appointment_duration,
                    timezone: result.rows[0].timezone,
                    booking_enabled: result.rows[0].booking_enabled,
                    active: result.rows[0].active
                };
                
                console.log(`✅ Client identified: ${clientInfo.business_name} (ID: ${clientInfo.client_id})`);
                return clientInfo;
            } else {
                console.warn(`⚠️ No client found for number: ${ringlypro_number}`);
                return null;
            }
            
        } catch (error) {
            console.error(`Error identifying client by number ${ringlypro_number}:`, error);
            return null;
        } finally {
            if (client) {
                await client.end();
            }
        }
    }

    /**
     * Clean phone number to standard format for comparison
     * @param {string} phoneNumber - Raw phone number string
     * @returns {string} Cleaned phone number
     */
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return "";

        // If already in correct format, return as-is
        if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
            console.log(`Phone number already in correct format: ${phoneNumber}`);
            return phoneNumber;
        }

        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, "");

        // Normalize to E.164 format (+1XXXXXXXXXX)
        if (cleaned.length === 10) {
            // 10 digits - add +1
            cleaned = "+1" + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
            // 11 digits starting with 1 - add +
            cleaned = "+" + cleaned;
        } else if (cleaned.length === 11) {
            // 11 digits not starting with 1 - add +1
            cleaned = "+1" + cleaned;
        } else if (cleaned.startsWith("1") && cleaned.length > 11) {
            // Trim excess and add +
            cleaned = "+" + cleaned.substring(0, 11);
        } else {
            // Default: add + if missing
            if (!cleaned.startsWith("+")) {
                cleaned = "+" + cleaned;
            }
        }

        console.log(`Phone number cleaned: ${phoneNumber} → ${cleaned}`);
        return cleaned;
    }

    /**
     * Check if Rachel is enabled for a specific client
     * @param {number} clientId - The client's ID
     * @returns {boolean} True if Rachel is enabled
     */
    async checkRachelEnabled(clientId) {
        let client;
        try {
            client = await this.getDatabaseClient();
            
            const result = await client.query(
                "SELECT rachel_enabled FROM clients WHERE id = $1", 
                [clientId]
            );
            
            if (result.rows.length > 0) {
                return result.rows[0].rachel_enabled;
            } else {
                console.warn(`Client ${clientId} not found when checking Rachel status`);
                return false;
            }
            
        } catch (error) {
            console.error(`Error checking Rachel status for client ${clientId}:`, error);
            return false;
        } finally {
            if (client) {
                await client.end();
            }
        }
    }

    /**
     * Generate personalized greeting text for the client
     * @param {Object} clientInfo - Client information object
     * @returns {string} Personalized greeting text
     */
    getClientGreetingText(clientInfo) {
        if (clientInfo.custom_greeting) {
            // Use client's custom greeting if available
            return clientInfo.custom_greeting.trim();
        } else {
            // Generate default personalized greeting
            const greeting = `
                Thank you for calling ${clientInfo.business_name}. 
                I'm Rachel, your AI assistant. 
                How can I help you today? 
                You can say book appointment to schedule a consultation, 
                pricing to hear about our services, 
                or speak with someone if you need to talk to a team member.
            `;
            
            console.log(`Generated greeting for ${clientInfo.business_name}`);
            return greeting.trim();
        }
    }

    /**
     * Log the start of a call in the database
     * @param {number} clientId - The client's ID
     * @param {string} callerNumber - The caller's phone number
     * @param {string} callSid - Twilio call SID
     * @returns {boolean} True if logged successfully
     */
    async logCallStart(clientId, callerNumber, callSid) {
        // Skip logging if critical parameters are missing
        if (!clientId || !callSid) {
            console.warn('⚠️ Cannot log call start - missing clientId or callSid');
            return false;
        }

        // Handle Anonymous callers - use placeholder instead of null
        const sanitizedCallerNumber = (callerNumber && callerNumber !== 'Anonymous')
            ? callerNumber
            : 'Anonymous';

        let client;
        try {
            client = await this.getDatabaseClient();

            // Note: This function is deprecated - call logging should use the Call model via Sequelize
            // Keeping for backward compatibility but logging a warning
            console.warn('⚠️ logCallStart is deprecated - consider using Call.create() via Sequelize');

            console.log(`✅ Call start logged for client ${clientId}, caller: ${sanitizedCallerNumber}, SID: ${callSid}`);
            return true;

        } catch (error) {
            console.error("Error logging call start:", error);
            return false;
        } finally {
            if (client) {
                await client.end();
            }
        }
    }

    /**
     * Get client information by ID
     * @param {number} clientId - The client's ID
     * @returns {Object|null} Client information or null if not found
     */
    async getClientById(clientId) {
        let client;
        try {
            client = await this.getDatabaseClient();
            
            const query = `
                SELECT 
                    id,
                    business_name,
                    custom_greeting,
                    booking_url,
                    ringlypro_number,
                    rachel_enabled,
                    business_hours
                FROM clients 
                WHERE id = $1
            `;
            
            const result = await client.query(query, [clientId]);
            
            if (result.rows.length > 0) {
                return {
                    client_id: result.rows[0].id,
                    business_name: result.rows[0].business_name,
                    custom_greeting: result.rows[0].custom_greeting,
                    booking_url: result.rows[0].booking_url,
                    ringlypro_number: result.rows[0].ringlypro_number,
                    rachel_enabled: result.rows[0].rachel_enabled,
                    business_hours: result.rows[0].business_hours
                };
            } else {
                return null;
            }
            
        } catch (error) {
            console.error(`Error getting client by ID ${clientId}:`, error);
            return null;
        } finally {
            if (client) {
                await client.end();
            }
        }
    }
}

module.exports = ClientIdentificationService;