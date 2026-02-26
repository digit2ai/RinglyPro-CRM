/**
 * Appointment SMS Notification Service
 *
 * Sends SMS confirmations for voice-booked appointments
 */

const twilio = require('twilio');
const axios = require('axios');
const { Sequelize, QueryTypes } = require('sequelize');

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
});

/**
 * Send appointment confirmation SMS
 *
 * @param {Object} appointment - Appointment details
 * @param {string} appointment.customerPhone - Customer phone number
 * @param {string} appointment.customerName - Customer name
 * @param {string} appointment.appointmentDate - Appointment date (YYYY-MM-DD)
 * @param {string} appointment.appointmentTime - Appointment time (HH:MM:SS)
 * @param {string} appointment.confirmationCode - Confirmation code
 * @param {string} businessName - Business name
 * @param {string} fromNumber - Twilio number to send from (client's RinglyPro number)
 * @returns {Promise<Object>} Twilio message response
 */
async function sendAppointmentConfirmation({
    customerPhone,
    customerName,
    appointmentDate,
    appointmentTime,
    confirmationCode,
    businessName,
    fromNumber
}) {
    try {
        // Format date and time for display
        const date = new Date(`${appointmentDate}T${appointmentTime}`);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // SMS message
        const message = `Hi ${customerName}! Your appointment with ${businessName} is confirmed for ${formattedDate} at ${formattedTime}. Confirmation code: ${confirmationCode}. Reply CANCEL to cancel.`;

        console.log(`📱 Sending SMS to ${customerPhone} from ${fromNumber}`);
        console.log(`📝 Message: ${message}`);

        const smsResponse = await twilioClient.messages.create({
            body: message,
            from: fromNumber,
            to: customerPhone
        });

        console.log(`✅ SMS sent successfully! SID: ${smsResponse.sid}`);
        return { success: true, messageSid: smsResponse.sid };

    } catch (error) {
        console.error('❌ Error sending appointment SMS:', error);
        console.error(`   To: ${customerPhone}`);
        console.error(`   From: ${fromNumber}`);
        console.error(`   Error: ${error.message}`);

        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

/**
 * Send Spanish appointment confirmation SMS
 */
async function sendAppointmentConfirmationSpanish({
    customerPhone,
    customerName,
    appointmentDate,
    appointmentTime,
    confirmationCode,
    businessName,
    fromNumber
}) {
    try {
        const date = new Date(`${appointmentDate}T${appointmentTime}`);
        const formattedDate = date.toLocaleDateString('es-MX', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('es-MX', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const message = `¡Hola ${customerName}! Su cita con ${businessName} está confirmada para el ${formattedDate} a las ${formattedTime}. Código: ${confirmationCode}. Responda CANCELAR para cancelar.`;

        console.log(`📱 Enviando SMS a ${customerPhone} desde ${fromNumber}`);
        console.log(`📝 Mensaje: ${message}`);

        const smsResponse = await twilioClient.messages.create({
            body: message,
            from: fromNumber,
            to: customerPhone
        });

        console.log(`✅ SMS enviado! SID: ${smsResponse.sid}`);
        return { success: true, messageSid: smsResponse.sid };

    } catch (error) {
        console.error('❌ Error enviando SMS de cita:', error);
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

/**
 * Send welcome SMS to new client after registration
 *
 * @param {Object} params - Welcome message parameters
 * @param {string} params.ownerPhone - Client owner's phone number
 * @param {string} params.ownerName - Client owner's name
 * @param {string} params.businessName - Business name
 * @param {string} params.ringlyproNumber - Assigned RinglyPro number
 * @param {string} params.dashboardUrl - URL to dashboard
 * @returns {Promise<Object>} Twilio message response
 */
async function sendWelcomeSMS({
    ownerPhone,
    ownerName,
    businessName,
    ringlyproNumber,
    dashboardUrl = 'https://aiagent.ringlypro.com',
    userEmail,
    otpCode
}) {
    try {
        // Format the RinglyPro number for display
        const formattedNumber = ringlyproNumber.replace(/(\+1)?(\d{3})(\d{3})(\d{4})/, '($2) $3-$4');

        // Build credentials block if OTP is available
        const credentialsBlock = (userEmail && otpCode)
            ? `\nLOGIN CREDENTIALS:\n` +
              `User ID: ${userEmail}\n` +
              `Temp Password: ${otpCode}\n\n` +
              `Log in at ${dashboardUrl} and set your permanent password.\n`
            : '';

        // Welcome message with activation instructions
        const message = `Welcome to RinglyPro, ${ownerName}! 🎉\n\n` +
            `Your AI assistant Rachel is ready for ${businessName}.\n` +
            `📞 Your RinglyPro Number: ${formattedNumber}\n` +
            credentialsBlock +
            `\nNext Steps:\n` +
            `1. Log in with credentials above\n` +
            `2. Set your new password\n` +
            `3. Toggle "Rachel AI" to ON\n` +
            `4. Set up call forwarding\n\n` +
            `Questions? Reply to this message.`;

        console.log(`📱 Sending welcome SMS to ${ownerPhone}`);

        // Send via GHL (A2P verified) using system client
        const ghlResult = await sendSmsViaGhl({
            toPhone: ownerPhone,
            message,
            customerName: ownerName
        });

        if (ghlResult.success) {
            console.log(`✅ Welcome SMS sent via GHL! messageId: ${ghlResult.message_id}`);
            return ghlResult;
        }

        // Fallback to Twilio if GHL fails
        console.log(`⚠️ GHL SMS failed, falling back to Twilio`);
        const smsResponse = await twilioClient.messages.create({
            body: message,
            from: ringlyproNumber,
            to: ownerPhone
        });

        console.log(`✅ Welcome SMS sent via Twilio fallback! SID: ${smsResponse.sid}`);
        return { success: true, provider: 'twilio', messageSid: smsResponse.sid };

    } catch (error) {
        console.error('❌ Error sending welcome SMS:', error);
        console.error(`   To: ${ownerPhone}`);
        console.error(`   From: ${ringlyproNumber}`);
        console.error(`   Error: ${error.message}`);

        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

/**
 * Send SMS via GoHighLevel (A2P 10DLC verified delivery)
 * Uses the system client (client 15) GHL integration
 */
async function sendSmsViaGhl({ toPhone, message, customerName }) {
    try {
        const systemClientId = process.env.RINGLYPRO_SYSTEM_CLIENT_ID || 15;

        // Get GHL credentials from system client
        const clients = await sequelize.query(`
            SELECT c.business_name,
                   c.settings->'integration'->'ghl' as ghl_settings,
                   g.access_token as oauth_token,
                   g.ghl_location_id as oauth_location_id
            FROM clients c
            LEFT JOIN ghl_integrations g ON g.client_id = c.id AND g.is_active = true
            WHERE c.id = :clientId
        `, { replacements: { clientId: systemClientId }, type: QueryTypes.SELECT });

        if (!clients || clients.length === 0) {
            return { success: false, error: 'System client not found' };
        }

        const ghlSettings = clients[0].ghl_settings;
        const oauthToken = clients[0].oauth_token;
        const oauthLocationId = clients[0].oauth_location_id;

        const ghlApiKey = (ghlSettings?.enabled && ghlSettings?.apiKey) ? ghlSettings.apiKey : oauthToken;
        const ghlLocationId = oauthLocationId || ghlSettings?.locationId;

        if (!ghlApiKey || !ghlLocationId) {
            return { success: false, error: 'No GHL integration on system client' };
        }

        // Normalize phone
        let normalizedPhone = toPhone.replace(/[^\d+]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        const ghlBaseUrl = 'https://services.leadconnectorhq.com';
        const ghlHeaders = {
            'Authorization': `Bearer ${ghlApiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
        };

        // Find or create contact
        let contactId;
        let contactData;
        try {
            const searchResp = await axios.get(
                `${ghlBaseUrl}/contacts/search/duplicate`,
                {
                    params: { locationId: ghlLocationId, number: normalizedPhone },
                    headers: ghlHeaders,
                    timeout: 10000
                }
            );
            contactId = searchResp.data?.contact?.id;
            contactData = searchResp.data?.contact;
        } catch (searchErr) {
            console.warn(`[WelcomeSMS] GHL contact search failed:`, searchErr.response?.data || searchErr.message);
        }

        if (!contactId) {
            const createResp = await axios.post(
                `${ghlBaseUrl}/contacts/`,
                {
                    locationId: ghlLocationId,
                    phone: normalizedPhone,
                    name: customerName || 'New Client',
                    source: 'RinglyPro AI'
                },
                { headers: ghlHeaders, timeout: 10000 }
            );
            contactId = createResp.data?.contact?.id;
            contactData = createResp.data?.contact;
        }

        if (!contactId) {
            return { success: false, error: 'Could not get GHL contactId' };
        }

        // Clear DND if active
        const smsDnd = contactData?.dndSettings?.SMS;
        if (smsDnd && smsDnd.status === 'active') {
            try {
                await axios.put(
                    `${ghlBaseUrl}/contacts/${contactId}`,
                    {
                        dnd: false,
                        dndSettings: {
                            SMS: { status: 'inactive', message: '' },
                            Call: { status: 'inactive', message: '' }
                        }
                    },
                    { headers: ghlHeaders, timeout: 10000 }
                );
            } catch (dndErr) {
                console.warn(`[WelcomeSMS] Failed to clear DND:`, dndErr.response?.data || dndErr.message);
            }
        }

        // Send SMS
        const smsResp = await axios.post(
            `${ghlBaseUrl}/conversations/messages`,
            {
                type: 'SMS',
                contactId: contactId,
                message: message
            },
            { headers: ghlHeaders, timeout: 15000 }
        );

        console.log(`[WelcomeSMS] GHL SMS sent to ${normalizedPhone}, messageId: ${smsResp.data?.messageId || smsResp.data?.id}`);

        return {
            success: true,
            provider: 'ghl',
            message_id: smsResp.data?.messageId || smsResp.data?.id,
            contact_id: contactId,
            to: normalizedPhone
        };

    } catch (error) {
        console.error('[WelcomeSMS] GHL SMS error:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendAppointmentConfirmation,
    sendAppointmentConfirmationSpanish,
    sendWelcomeSMS
};
