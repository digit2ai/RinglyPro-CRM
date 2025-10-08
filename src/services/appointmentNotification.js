/**
 * Appointment SMS Notification Service
 *
 * Sends SMS confirmations for voice-booked appointments
 */

const twilio = require('twilio');

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

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
    dashboardUrl = 'https://aiagent.ringlypro.com'
}) {
    try {
        // Format the RinglyPro number for display
        const formattedNumber = ringlyproNumber.replace(/(\+1)?(\d{3})(\d{3})(\d{4})/, '($2) $3-$4');

        // Welcome message with activation instructions
        const message = `Welcome to RinglyPro, ${ownerName}! 🎉\n\n` +
            `Your AI assistant Rachel is ready for ${businessName}.\n\n` +
            `📞 Your RinglyPro Number: ${formattedNumber}\n\n` +
            `Next Steps:\n` +
            `1. Log in at ${dashboardUrl}\n` +
            `2. Toggle "Rachel AI" to ON\n` +
            `3. Follow the call forwarding instructions for your carrier\n\n` +
            `Once activated, Rachel will answer all calls to your business phone 24/7!\n\n` +
            `Questions? Reply to this message.`;

        console.log(`📱 Sending welcome SMS to ${ownerPhone}`);
        console.log(`📝 Message: ${message}`);

        const smsResponse = await twilioClient.messages.create({
            body: message,
            from: ringlyproNumber,  // Send from their new RinglyPro number
            to: ownerPhone
        });

        console.log(`✅ Welcome SMS sent successfully! SID: ${smsResponse.sid}`);
        return { success: true, messageSid: smsResponse.sid };

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

module.exports = {
    sendAppointmentConfirmation,
    sendAppointmentConfirmationSpanish,
    sendWelcomeSMS
};
