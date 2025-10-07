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

module.exports = {
    sendAppointmentConfirmation,
    sendAppointmentConfirmationSpanish
};
