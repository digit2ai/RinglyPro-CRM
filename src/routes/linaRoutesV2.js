// routes/linaRoutesV2.js - Spanish Voice Routes V2 (rebuilt from scratch based on Rachel)
// This is a clean rewrite with NO session dependencies - all context via query params

const express = require('express');
const router = express.Router();
const LinaVoiceServiceV2 = require('../services/linaVoiceServiceV2');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
const { sendAppointmentConfirmation } = require('../services/appointmentNotification');

// Initialize service
const linaService = new LinaVoiceServiceV2(
    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
    process.env.ELEVENLABS_API_KEY
);

/**
 * Extract context from query params
 * This is the ONLY way to get context - NO session dependency
 */
function getContext(req) {
    return {
        clientId: parseInt(req.query.client_id, 10) || null,
        businessName: req.query.business_name ? decodeURIComponent(req.query.business_name) : 'nuestra empresa',
        userId: req.query.user_id || '',
        prospectName: req.query.prospect_name ? decodeURIComponent(req.query.prospect_name) : '',
        prospectPhone: req.query.prospect_phone ? decodeURIComponent(req.query.prospect_phone) : '',
        datetime: req.query.datetime ? decodeURIComponent(req.query.datetime) : ''
    };
}

/**
 * Spanish greeting - entry point after language selection
 */
router.all('/voice/lina-v2/greeting', async (req, res) => {
    try {
        const ctx = getContext(req);
        console.log(`[LINA-V2] Greeting for client ${ctx.clientId}: ${ctx.businessName}`);

        if (!ctx.clientId) {
            console.error("[LINA-V2] No client_id in query params");
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        const twiml = await linaService.createGreeting(ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[LINA-V2] Greeting error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor llame de nuevo.'));
    }
});

/**
 * Process speech input
 */
router.post('/voice/lina-v2/process-speech', async (req, res) => {
    try {
        const ctx = getContext(req);
        const speechResult = req.body.SpeechResult || '';

        console.log(`[LINA-V2] Speech for client ${ctx.clientId}: "${speechResult}"`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        const twiml = await linaService.processSpeech(speechResult, ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[LINA-V2] Process speech error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error. Por favor intente de nuevo.'));
    }
});

/**
 * Collect name
 */
router.post('/voice/lina-v2/collect-name', async (req, res) => {
    try {
        const ctx = getContext(req);
        const name = req.body.SpeechResult || '';

        console.log(`[LINA-V2] Name collected for client ${ctx.clientId}: "${name}"`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        if (!name || name.trim().length === 0) {
            // Didn't get name, ask again
            const twiml = await linaService.askForName(ctx.clientId, ctx.businessName, ctx.userId);
            res.type('text/xml');
            return res.send(twiml);
        }

        const twiml = await linaService.askForPhone(name.trim(), ctx.clientId, ctx.businessName, ctx.userId);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[LINA-V2] Collect name error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error.'));
    }
});

/**
 * Collect phone number
 */
router.post('/voice/lina-v2/collect-phone', async (req, res) => {
    try {
        const ctx = getContext(req);
        const digits = req.body.Digits || '';
        const speechResult = req.body.SpeechResult || '';

        console.log(`[LINA-V2] Phone for client ${ctx.clientId}: digits="${digits}", speech="${speechResult}"`);

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
        console.error('[LINA-V2] Collect phone error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error.'));
    }
});

/**
 * Collect date/time
 */
router.post('/voice/lina-v2/collect-datetime', async (req, res) => {
    try {
        const ctx = getContext(req);
        const datetime = req.body.SpeechResult || '';

        console.log(`[LINA-V2] DateTime for client ${ctx.clientId}: "${datetime}"`);

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
        console.error('[LINA-V2] Collect datetime error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error.'));
    }
});

/**
 * Book appointment
 */
router.all('/voice/lina-v2/book-appointment', async (req, res) => {
    try {
        const ctx = getContext(req);

        console.log(`[LINA-V2] Booking for client ${ctx.clientId}: ${ctx.prospectName} (${ctx.prospectPhone}) at ${ctx.datetime}`);

        if (!ctx.clientId) {
            res.type('text/xml');
            return res.send(linaService.createSessionExpiredResponse());
        }

        // Parse Spanish datetime
        const { parseSpanishDateTime } = require('../utils/spanishDateParser');
        let appointmentDate, appointmentTime;

        try {
            const parsed = parseSpanishDateTime(ctx.datetime);
            appointmentDate = parsed.date;
            appointmentTime = parsed.time;
        } catch (parseError) {
            console.warn('[LINA-V2] DateTime parse failed, using defaults:', parseError.message);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            appointmentDate = tomorrow.toISOString().split('T')[0];
            appointmentTime = '10:00';
        }

        // Book via unified service
        const unifiedBookingService = require('../services/unifiedBookingService');

        const bookingResult = await unifiedBookingService.bookAppointment(ctx.clientId, {
            customerName: ctx.prospectName || 'Cliente',
            customerPhone: ctx.prospectPhone || '',
            customerEmail: '',
            date: appointmentDate,
            time: appointmentTime,
            service: 'Cita',
            notes: `Reservado via Lina Voice AI V2 en espanol. Solicitud: ${ctx.datetime}`,
            source: 'voice_booking_spanish'
        });

        if (bookingResult.success) {
            console.log(`[LINA-V2] Booking success: ${bookingResult.confirmationCode}`);

            // Send SMS confirmation
            try {
                await sendAppointmentConfirmation(ctx.clientId, {
                    customerName: ctx.prospectName,
                    customerPhone: ctx.prospectPhone,
                    appointmentDate,
                    appointmentTime,
                    confirmationCode: bookingResult.confirmationCode
                });
            } catch (notifError) {
                console.error('[LINA-V2] SMS notification error:', notifError.message);
            }

            const escapedName = linaService.escapeXml(ctx.prospectName);
            const confirmCode = bookingResult.confirmationCode;

            const successText = `Excelente ${escapedName}! Su cita ha sido confirmada. Su codigo de confirmacion es ${confirmCode.split('').join(' ')}. Le enviaremos un mensaje de texto con los detalles. Gracias por llamar y que tenga un excelente dia!`;

            const audioUrl = await linaService.generateLinaAudio(successText);

            const twiml = audioUrl
                ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
                : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lupe" language="es-MX">${successText}</Say><Hangup/></Response>`;

            res.type('text/xml');
            res.send(twiml);

        } else {
            console.error('[LINA-V2] Booking failed:', bookingResult.error);

            const errorText = `Lo siento ${linaService.escapeXml(ctx.prospectName)}, no pude completar su reservacion en este momento. Por favor intente llamar mas tarde o visite nuestro sitio web. Gracias por llamar.`;

            res.type('text/xml');
            res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${errorText}</Say>
    <Hangup/>
</Response>`);
        }

    } catch (error) {
        console.error('[LINA-V2] Book appointment error:', error);
        res.type('text/xml');
        res.send(linaService.createErrorResponse('Lo siento, hubo un error al hacer la reservacion. Por favor llame de nuevo.'));
    }
});

/**
 * Voicemail complete handler
 */
router.all('/voice/lina-v2/voicemail-complete', async (req, res) => {
    try {
        const ctx = getContext(req);
        const recordingUrl = req.body.RecordingUrl || '';
        const recordingDuration = req.body.RecordingDuration || 0;

        console.log(`[LINA-V2] Voicemail for client ${ctx.clientId}: ${recordingUrl} (${recordingDuration}s)`);

        // Save voicemail to database
        if (recordingUrl && ctx.clientId) {
            try {
                const { Voicemail } = require('../models');
                await Voicemail.create({
                    client_id: ctx.clientId,
                    caller_phone: req.body.From || 'Unknown',
                    recording_url: recordingUrl,
                    duration: parseInt(recordingDuration, 10) || 0,
                    transcription: null,
                    status: 'new',
                    language: 'es'
                });
                console.log(`[LINA-V2] Voicemail saved for client ${ctx.clientId}`);
            } catch (dbError) {
                console.error('[LINA-V2] Voicemail save error:', dbError.message);
            }
        }

        const thankYouText = `Gracias por su mensaje. Lo entregaremos de inmediato. Que tenga un excelente dia!`;

        const audioUrl = await linaService.generateLinaAudio(thankYouText);

        const twiml = audioUrl
            ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
            : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Lupe" language="es-MX">${thankYouText}</Say><Hangup/></Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[LINA-V2] Voicemail complete error:', error);
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias por su mensaje. Adios.</Say>
    <Hangup/>
</Response>`);
    }
});

module.exports = router;
