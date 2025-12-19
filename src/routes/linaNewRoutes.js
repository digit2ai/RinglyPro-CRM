// routes/linaNewRoutes.js - New Spanish Voice Routes (mirrors Rachel English routes)
const express = require('express');
const LinaSpanishService = require('../services/linaSpanishService');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
const { sendAppointmentConfirmation } = require('../services/appointmentNotification');

// Initialize Lina Spanish service
const linaService = new LinaSpanishService(
    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
    process.env.ELEVENLABS_API_KEY
);

const router = express.Router();

/**
 * Helper to extract context from query params
 * Critical: Twilio doesn't preserve sessions between webhooks
 */
function getContextFromQuery(req) {
    return {
        clientId: parseInt(req.query.client_id, 10) || null,
        businessName: decodeURIComponent(req.query.business_name || 'nuestra empresa'),
        userId: req.query.user_id || '',
        prospectName: req.query.prospect_name ? decodeURIComponent(req.query.prospect_name) : '',
        prospectPhone: req.query.prospect_phone ? decodeURIComponent(req.query.prospect_phone) : '',
        datetime: req.query.datetime ? decodeURIComponent(req.query.datetime) : ''
    };
}

/**
 * Spanish greeting endpoint - entry point after language selection
 */
router.all('/voice/lina-new/greeting', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        console.log(`📞 Lina Spanish greeting for client ${ctx.clientId}: ${ctx.businessName}`);

        if (!ctx.clientId) {
            console.error("❌ No client_id in query params");
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        const twiml = await linaService.createSpanishGreeting(ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error in Lina Spanish greeting:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor llame de nuevo.'));
    }
});

/**
 * Process Spanish speech input
 */
router.post('/voice/lina-new/process-speech', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        const speechResult = req.body.SpeechResult || '';

        console.log(`🎤 Lina processing Spanish speech for client ${ctx.clientId}: "${speechResult}"`);

        if (!ctx.clientId) {
            console.error("❌ No client_id in query params");
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        const twiml = await linaService.processSpeechInput(speechResult, ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error processing Spanish speech:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor intente de nuevo.'));
    }
});

/**
 * Collect name for appointment booking
 */
router.post('/voice/lina-new/collect-name', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        const name = req.body.SpeechResult || '';

        console.log(`📝 Lina collected name for client ${ctx.clientId}: "${name}"`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        if (!name || name.trim().length === 0) {
            // Didn't get a name, ask again
            const twiml = await linaService.handleBookingRequest(ctx.clientId, ctx.businessName, ctx.userId);
            res.type('text/xml');
            return res.send(twiml);
        }

        const twiml = await linaService.askForPhone(name.trim(), ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting name (Spanish):', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor intente de nuevo.'));
    }
});

/**
 * Collect phone number for appointment booking
 */
router.post('/voice/lina-new/collect-phone', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        const digits = req.body.Digits || '';
        const speechResult = req.body.SpeechResult || '';

        console.log(`📱 Lina collecting phone for client ${ctx.clientId}: digits="${digits}", speech="${speechResult}"`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        // Get phone from DTMF or speech
        let phone = '';
        if (digits && digits.length >= 7) {
            phone = digits;
        } else if (speechResult) {
            phone = normalizePhoneFromSpeech(speechResult);
        }

        if (!phone || phone.length < 7) {
            // Didn't get valid phone, ask again
            const twiml = await linaService.askForPhone(ctx.prospectName || 'amigo', ctx.clientId, ctx.businessName, ctx.userId);
            res.type('text/xml');
            return res.send(twiml);
        }

        const twiml = await linaService.askForDateTime(ctx.prospectName || 'amigo', phone, ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting phone (Spanish):', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor intente de nuevo.'));
    }
});

/**
 * Collect date/time for appointment booking
 */
router.post('/voice/lina-new/collect-datetime', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        const datetime = req.body.SpeechResult || '';

        console.log(`📅 Lina collected datetime for client ${ctx.clientId}: "${datetime}"`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        if (!datetime || datetime.trim().length === 0) {
            // Didn't get datetime, ask again
            const twiml = await linaService.askForDateTime(ctx.prospectName, ctx.prospectPhone, ctx.clientId, ctx.businessName, ctx.userId);
            res.type('text/xml');
            return res.send(twiml);
        }

        const twiml = await linaService.confirmBooking(ctx.prospectName, ctx.prospectPhone, datetime.trim(), ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting datetime (Spanish):', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor intente de nuevo.'));
    }
});

/**
 * Book the appointment
 */
router.all('/voice/lina-new/book-appointment', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);

        console.log(`📅 Lina booking appointment for client ${ctx.clientId}: ${ctx.prospectName} (${ctx.prospectPhone}) at ${ctx.datetime}`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        // Try to parse the datetime
        const { parseSpanishDateTime } = require('../utils/spanishDateParser');
        let appointmentDate, appointmentTime;

        try {
            const parsed = parseSpanishDateTime(ctx.datetime);
            appointmentDate = parsed.date;
            appointmentTime = parsed.time;
        } catch (parseError) {
            console.warn('Could not parse datetime, using defaults:', parseError.message);
            // Default to tomorrow at 10am
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            appointmentDate = tomorrow.toISOString().split('T')[0];
            appointmentTime = '10:00';
        }

        // Create the appointment in the database
        const unifiedBookingService = require('../services/unifiedBookingService');

        const bookingResult = await unifiedBookingService.bookAppointment(ctx.clientId, {
            customerName: ctx.prospectName || 'Cliente',
            customerPhone: ctx.prospectPhone || '',
            customerEmail: '',
            date: appointmentDate,
            time: appointmentTime,
            service: 'Cita',
            notes: `Reservado via Lina Voice AI en español. Solicitud: ${ctx.datetime}`,
            source: 'voice_booking_spanish'
        });

        if (bookingResult.success) {
            console.log(`✅ Spanish appointment booked: ${bookingResult.confirmationCode}`);

            // Send confirmation notification
            try {
                await sendAppointmentConfirmation(ctx.clientId, {
                    customerName: ctx.prospectName,
                    customerPhone: ctx.prospectPhone,
                    appointmentDate,
                    appointmentTime,
                    confirmationCode: bookingResult.confirmationCode
                });
            } catch (notifError) {
                console.error('Notification error:', notifError.message);
            }

            const escapedName = linaService.escapeXml(ctx.prospectName);
            const confirmCode = bookingResult.confirmationCode;

            const successText = `¡Excelente ${escapedName}! Su cita ha sido confirmada. Su código de confirmación es ${confirmCode.split('').join(' ')}. Le enviaremos un mensaje de texto con los detalles. ¡Gracias por llamar y que tenga un excelente día!`;

            const audioUrl = await linaService.generateLinaAudio(successText);

            const twiml = audioUrl
                ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
                : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lupe" language="es-MX">${successText}</Say><Hangup/></Response>`;

            res.type('text/xml');
            res.send(twiml);

        } else {
            console.error('❌ Booking failed:', bookingResult.error);

            const errorText = `Lo siento ${linaService.escapeXml(ctx.prospectName)}, no pude completar su reservación en este momento. Por favor intente llamar más tarde o visite nuestro sitio web. Gracias por llamar.`;

            res.type('text/xml');
            res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${errorText}</Say>
    <Hangup/>
</Response>`);
        }

    } catch (error) {
        console.error('Error booking appointment (Spanish):', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error al hacer la reservación. Por favor llame de nuevo.'));
    }
});

/**
 * Voicemail complete handler
 */
router.all('/voice/lina-new/voicemail-complete', async (req, res) => {
    try {
        const ctx = getContextFromQuery(req);
        const recordingUrl = req.body.RecordingUrl || '';
        const recordingDuration = req.body.RecordingDuration || 0;

        console.log(`📬 Spanish voicemail received for client ${ctx.clientId}: ${recordingUrl} (${recordingDuration}s)`);

        if (recordingUrl && ctx.clientId) {
            // Save voicemail to database
            try {
                const { Voicemail } = require('../models');
                await Voicemail.create({
                    client_id: ctx.clientId,
                    caller_phone: req.body.From || 'Unknown',
                    recording_url: recordingUrl,
                    duration: parseInt(recordingDuration, 10) || 0,
                    transcription: null,  // Spanish transcription not supported by Twilio
                    status: 'new',
                    language: 'es'
                });
                console.log(`✅ Spanish voicemail saved for client ${ctx.clientId}`);
            } catch (dbError) {
                console.error('Error saving voicemail:', dbError.message);
            }
        }

        const thankYouText = `Gracias por su mensaje. Lo entregaremos de inmediato. ¡Que tenga un excelente día!`;

        const audioUrl = await linaService.generateLinaAudio(thankYouText);

        const twiml = audioUrl
            ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
            : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lupe" language="es-MX">${thankYouText}</Say><Hangup/></Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error handling Spanish voicemail complete:', error);
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias por su mensaje. Adiós.</Say>
    <Hangup/>
</Response>`);
    }
});

module.exports = router;
