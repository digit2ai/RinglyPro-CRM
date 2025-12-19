// routes/linaRoutes.js - Spanish Voice Routes
const express = require('express');
const LinaSpanishVoiceService = require('../services/linaVoiceService');
const ClientIdentificationService = require('../services/clientIdentificationService');
const path = require('path');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
const { sendAppointmentConfirmationSpanish } = require('../services/appointmentNotification');
const crmAwareAvailabilityService = require('../services/crmAwareAvailabilityService');
const unifiedBookingService = require('../services/unifiedBookingService');

// Initialize Lina service
const linaService = new LinaSpanishVoiceService(
    process.env.DATABASE_URL,
    process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com',
    process.env.ELEVENLABS_API_KEY
);

const clientService = new ClientIdentificationService(process.env.DATABASE_URL);

const router = express.Router();

/**
 * Create IVR menu for Spanish (same logic as English, different language)
 */
function createSpanishIVRMenu(client) {
    const businessName = client.business_name;
    const ivrOptions = client.ivr_options || [];

    // Get enabled departments only
    const enabledDepts = ivrOptions.filter(dept => dept.enabled);

    // Build Spanish menu text with warm, empathetic tone
    let menuText = `¡Hola! Habla Lina de ${businessName}. Estoy aquí para ayudarle. <break time="0.8s"/> `;
    menuText += `Para programar una cita, presione 1. <break time="0.5s"/> `;

    // Add department options (starting from 2)
    enabledDepts.forEach((dept, index) => {
        const digit = index + 2;
        menuText += `Para ${dept.name}, presione ${digit}. <break time="0.5s"/> `;
    });

    menuText += `O, para dejar un mensaje de voz, presione 9. `;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf" numDigits="1" timeout="5" action="/voice/rachel/ivr-selection?lang=es" method="POST">
        <Say voice="Polly.Lupe" language="es-MX">${menuText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No recibí una selección. Adiós.</Say>
    <Hangup/>
</Response>`;

    console.log(`📋 Spanish IVR Menu created for ${businessName}: ${enabledDepts.length} departments`);
    return twiml;
}

/**
 * Spanish greeting endpoint (called after language selection)
 * Handle both GET (from redirects) and POST (from direct calls)
 */
const handleSpanishIncoming = async (req, res) => {
    try {
        console.log('📞 Spanish language selected - Lina webhook called');

        // Restore client context from query params if present (for TwiML redirects)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
                console.log(`✅ Restored client_id from query: ${parsedClientId}`);
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
            console.log(`✅ Restored business_name from query: ${req.session.business_name}`);
        }

        // Get client info from session (or restored from query)
        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        if (!clientId) {
            console.error("❌ No client context in session or query params");
            const twiml = `
                <?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor, llame de nuevo.</Say>
                    <Hangup/>
                </Response>
            `;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Load full client info including IVR settings
        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        if (!client) {
            console.error(`❌ Client ${clientId} not found`);
            const twiml = `
                <?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, llame de nuevo.</Say>
                    <Hangup/>
                </Response>
            `;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Check if IVR is enabled
        if (client.ivr_enabled && client.ivr_options && client.ivr_options.length > 0) {
            console.log(`✅ IVR enabled for ${businessName} - showing Spanish menu`);
            const twiml = createSpanishIVRMenu(client);
            res.type('text/xml');
            return res.send(twiml);
        }

        // No IVR - use simple Spanish greeting with Polly.Lupe (reliable fallback)
        console.log(`📞 No IVR for ${businessName} - using Spanish greeting`);

        // Time-appropriate greeting
        const hour = new Date().getHours();
        let timeGreeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

        // Escape business name for XML
        const escapedBusinessName = (businessName || 'nuestra empresa')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const greetingText = `${timeGreeting}, gracias por llamar a ${escapedBusinessName}. Mi nombre es Lina, su asistente virtual. Puedo ayudarle a agendar una cita, o si prefiere, puede dejarme un mensaje. ¿En qué puedo ayudarle hoy?`;

        // Pass client context via query params since Twilio doesn't preserve sessions between requests
        // URL-encode the business name to handle special characters
        const encodedBusinessName = encodeURIComponent(businessName || 'nuestra empresa');
        const contextParams = `client_id=${clientId}&business_name=${encodedBusinessName}`;

        // Use Polly.Lupe which is reliable - skip ElevenLabs for now to ensure stability
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/lina/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${greetingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina/incoming?${contextParams}</Redirect>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error in Lina webhook:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, intente llamar de nuevo.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/lina/incoming', handleSpanishIncoming);
router.get('/voice/lina/incoming', handleSpanishIncoming);

/**
 * Process Spanish speech input endpoint
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/lina/process-speech', async (req, res) => {
    try {
        console.log('🎤 Processing Spanish speech:', req.body.SpeechResult);

        // Restore client context from query params (Twilio doesn't preserve sessions)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
                console.log(`✅ Restored client_id from query: ${parsedClientId}`);
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
            console.log(`✅ Restored business_name from query: ${req.session.business_name}`);
        }

        // Save restored session
        if (clientIdFromQuery || businessNameFromQuery) {
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        const twimlResponse = await linaService.processSpeechInput(req.body, req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error processing Spanish speech:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error procesando su solicitud. Por favor, intente de nuevo.</Say>
                <Redirect>/voice/lina/webhook</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect name for appointment booking (Spanish)
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/lina/collect-name', async (req, res) => {
    try {
        // Restore client context from query params (Twilio doesn't preserve sessions)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const name = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📝 Spanish - Name collected for client ${clientId}: ${name}`);
        console.log(`📋 Session data: clientId=${clientId}, businessName=${businessName}`);

        // Store name in session
        req.session.prospect_name = name;

        // Save session before sending response
        try {
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        console.error('❌ Session save error in collect-name:', err);
                        reject(err);
                    } else {
                        console.log('✅ Spanish - Session saved with prospect name');
                        resolve();
                    }
                });
            });
        } catch (sessionErr) {
            console.error('❌ Failed to save session in collect-name:', sessionErr);
            throw sessionErr; // Re-throw to trigger outer catch
        }

        // Escape XML special characters to prevent parse errors
        const escapedName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // Pass context via query params since Twilio doesn't preserve sessions
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="10" speechTimeout="5" numDigits="10" action="/voice/lina/collect-phone?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">Gracias ${escapedName}. Ahora puede decir su número de teléfono de 10 dígitos, o marcarlo usando el teclado.</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-name?${contextParams}</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-name:', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting name (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Intentemos de nuevo.</Say>
                <Redirect>/voice/lina/process-speech</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect phone number for appointment booking (Spanish)
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/lina/collect-phone', async (req, res) => {
    try {
        // Restore client context from query params
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const digits = req.body.Digits || '';  // DTMF keypad input
        const speechResult = req.body.SpeechResult || '';  // Voice input
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'nuestra empresa';

        let normalizedPhone;

        if (digits) {
            // User entered phone via keypad - this is already accurate
            console.log(`📞 Spanish - Phone entered via keypad for client ${clientId}: ${digits}`);
            normalizedPhone = normalizePhoneFromSpeech(digits);  // Just formats it
        } else if (speechResult) {
            // User spoke the phone number - needs normalization
            console.log(`📞 Spanish - Phone spoken for client ${clientId}: ${speechResult}`);
            normalizedPhone = normalizePhoneFromSpeech(speechResult);
            console.log(`📞 Spanish - Normalized from speech: ${speechResult} → ${normalizedPhone}`);
        } else {
            console.log(`⚠️ Spanish - No phone input received for client ${clientId}`);
            normalizedPhone = '';
        }

        console.log(`📝 Spanish - Prospect name from session: ${prospectName}`);
        console.log(`✅ Spanish - Final phone number: ${normalizedPhone}`);

        // Store normalized phone in session
        req.session.prospect_phone = normalizedPhone;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Escape XML special characters to prevent parse errors
        const escapedName = (prospectName || 'señor')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedPhone = normalizedPhone
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedBusiness = (businessName || 'nuestra empresa')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // Pass context via query params since Twilio doesn't preserve sessions
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/lina/collect-datetime?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">Perfecto ${escapedName}. Ahora dígame que día y hora prefiere para su cita. Por ejemplo puede decir mañana a las 10 de la mañana o el viernes a las 2 de la tarde</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-phone?${contextParams}</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-phone (Spanish):', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting phone (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, intente de nuevo.</Say>
                <Redirect>/voice/lina/collect-name</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect date/time for appointment booking (Spanish)
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/lina/collect-datetime', async (req, res) => {
    try {
        // Restore client context from query params
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const datetime = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📅 Spanish - DateTime collected for client ${clientId}: ${datetime}`);
        console.log(`📝 Spanish - Prospect info: ${prospectName} (${prospectPhone})`);

        // Store datetime in session
        req.session.appointment_datetime = datetime;

        // Save session before sending response
        try {
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        console.error('❌ Session save error in collect-datetime:', err);
                        reject(err);
                    } else {
                        console.log('✅ Spanish - Session saved with datetime');
                        resolve();
                    }
                });
            });
        } catch (sessionErr) {
            console.error('❌ Failed to save session in collect-datetime:', sessionErr);
            throw sessionErr;
        }

        // Escape XML special characters
        const escapedName = (prospectName || 'señor')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedDateTime = datetime
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // Pass context via query params since Twilio doesn't preserve sessions
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Perfecto ${escapedName}. Déjeme confirmar su cita para ${escapedDateTime}. Por favor espere un momento mientras verifico la disponibilidad.</Say>
    <Redirect>/voice/lina/book-appointment?${contextParams}</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-datetime (Spanish)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting datetime (Spanish):', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-phone</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);
    }
});

/**
 * Book appointment endpoint (Spanish)
 * Handle both GET (from redirects) and POST
 */
const handleBookAppointmentSpanish = async (req, res) => {
    try {
        // Restore client context from query params
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDateTime = req.session.appointment_datetime || 'la fecha solicitada';
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📅 Spanish - Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone}) at ${appointmentDateTime}`);

        const moment = require('moment-timezone');

        let appointmentDate, appointmentTime;

        try {
            const now = moment().tz('America/New_York');
            let parsedDateTime = now.clone();

            const lowerText = appointmentDateTime.toLowerCase();
            if (lowerText.includes('mañana') || lowerText.includes('manana')) {
                parsedDateTime.add(1, 'day');
            } else if (lowerText.includes('hoy')) {
                // Keep as today
            } else if (lowerText.includes('lunes')) {
                parsedDateTime = parsedDateTime.day(1);
                if (parsedDateTime.isSameOrBefore(now, 'day')) parsedDateTime.add(7, 'days');
            } else if (lowerText.includes('martes')) {
                parsedDateTime = parsedDateTime.day(2);
                if (parsedDateTime.isSameOrBefore(now, 'day')) parsedDateTime.add(7, 'days');
            } else if (lowerText.includes('miércoles') || lowerText.includes('miercoles')) {
                parsedDateTime = parsedDateTime.day(3);
                if (parsedDateTime.isSameOrBefore(now, 'day')) parsedDateTime.add(7, 'days');
            } else if (lowerText.includes('jueves')) {
                parsedDateTime = parsedDateTime.day(4);
                if (parsedDateTime.isSameOrBefore(now, 'day')) parsedDateTime.add(7, 'days');
            } else if (lowerText.includes('viernes')) {
                parsedDateTime = parsedDateTime.day(5);
                if (parsedDateTime.isSameOrBefore(now, 'day')) parsedDateTime.add(7, 'days');
            } else {
                parsedDateTime.add(1, 'day');
            }

            const timeMatch = appointmentDateTime.match(/(\d{1,2})/);
            if (timeMatch) {
                let hour = parseInt(timeMatch[1]);
                const isTarde = lowerText.includes('tarde');
                const isMorningContext = lowerText.includes('de la mañana');

                if (isTarde && hour < 12) hour += 12;
                if (hour === 12 && isMorningContext) hour = 12;

                parsedDateTime.hour(hour).minute(0).second(0);
            } else {
                parsedDateTime.hour(14).minute(0).second(0);
            }

            appointmentDate = parsedDateTime.format('YYYY-MM-DD');
            appointmentTime = parsedDateTime.format('HH:mm');

            console.log(`📆 Parsed appointment: date=${appointmentDate}, time=${appointmentTime}`);

            if (!clientId) {
                throw new Error('Missing clientId');
            }

            // ============= CHECK AVAILABILITY USING CRM-AWARE SERVICE =============
            console.log(`🔍 Checking CRM-aware availability for client ${clientId} on ${appointmentDate}`);
            const availabilityResult = await crmAwareAvailabilityService.getAvailableSlots(clientId, appointmentDate);
            console.log(`📅 Availability result: source=${availabilityResult.source}, slots=${availabilityResult.slots?.length || 0}`);

            // Check if requested time is available
            const normalizedRequestedTime = appointmentTime.substring(0, 5); // HH:mm
            const isSlotAvailable = availabilityResult.success && availabilityResult.slots?.some(slot => {
                const slotTime = (slot.time || '').substring(0, 5);
                return slotTime === normalizedRequestedTime;
            });

            if (!isSlotAvailable) {
                console.log(`⚠️ Time slot ${appointmentDate} ${appointmentTime} not available in ${availabilityResult.source}`);

                const escapedName = (prospectName || 'señor')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');

                let errorTwiml;

                if (availabilityResult.slots?.length > 0) {
                    // Format first 3 available slots for speech (Spanish)
                    const formatTimeForSpeechSpanish = (timeStr) => {
                        const [hours, minutes] = (timeStr || '00:00').split(':');
                        let hour = parseInt(hours);
                        const isPM = hour >= 12;
                        if (hour > 12) hour -= 12;
                        if (hour === 0) hour = 12;

                        const article = hour === 1 ? 'la' : 'las';
                        const period = isPM ? 'de la tarde' : 'de la mañana';

                        if (minutes === '00') {
                            return `${article} ${hour} ${period}`;
                        } else {
                            return `${article} ${hour} y ${minutes} ${period}`;
                        }
                    };

                    const suggestions = availabilityResult.slots.slice(0, 3).map(slot =>
                        formatTimeForSpeechSpanish(slot.time?.substring(0, 5) || slot.displayTime)
                    );
                    const suggestionText = suggestions.length === 1
                        ? suggestions[0]
                        : suggestions.length === 2
                        ? `${suggestions[0]} o ${suggestions[1]}`
                        : `${suggestions[0]}, ${suggestions[1]}, o ${suggestions[2]}`;

                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esa hora ya está reservada. Tenemos disponibilidad a ${suggestionText}. Por favor llame de nuevo para agendar una de estas horas. Gracias.</Say>
    <Hangup/>
</Response>`;
                } else {
                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esa hora ya está reservada y estamos completamente llenos ese día. Por favor llame de nuevo para agendar otro día. Gracias.</Say>
    <Hangup/>
</Response>`;
                }

                console.log('📤 Sending SLOT UNAVAILABLE TwiML (Spanish)');
                res.set('Content-Type', 'text/xml; charset=utf-8');
                return res.send(errorTwiml);
            }

            console.log(`✅ Time slot ${appointmentDate} ${appointmentTime} is available in ${availabilityResult.source}!`);

            // ============= BOOK USING UNIFIED CRM-AWARE SERVICE =============
            console.log(`🎯 Booking appointment via unified service for client ${clientId}`);

            const bookingResult = await unifiedBookingService.bookAppointment(clientId, {
                customerName: prospectName || 'Desconocido',
                customerPhone: prospectPhone || 'Desconocido',
                customerEmail: null,
                date: appointmentDate,
                time: appointmentTime,
                service: 'Cita',
                notes: 'Agendado via Lina Voice AI (Spanish)',
                source: 'voice_booking_spanish'
            });

            console.log(`📅 Booking result: system=${bookingResult.system}, success=${bookingResult.success}`);

            if (!bookingResult.success) {
                throw new Error(bookingResult.error || 'Booking failed');
            }

            const confirmationCode = bookingResult.confirmationCode ||
                                   bookingResult.localAppointment?.confirmation_code ||
                                   Math.random().toString(36).substring(2, 8).toUpperCase();

            console.log(`✅✅✅ SPANISH APPOINTMENT CREATED! ✅✅✅`);
            console.log(`   🏢 Client: ${clientId}`);
            console.log(`   👤 Customer: ${prospectName} (${prospectPhone})`);
            console.log(`   📅 DateTime: ${appointmentDate} ${appointmentTime}`);
            console.log(`   🔑 Confirmation: ${confirmationCode}`);
            console.log(`   📊 CRM System: ${bookingResult.system}`);

            // Send Spanish SMS confirmation
            try {
                const { Client } = require('../models');
                const client = await Client.findByPk(clientId);

                if (client && client.ringlypro_number) {
                    console.log(`📱 Enviando SMS de confirmación a ${prospectPhone}`);

                    const smsResult = await sendAppointmentConfirmationSpanish({
                        customerPhone: prospectPhone,
                        customerName: prospectName,
                        appointmentDate: appointmentDate,
                        appointmentTime: appointmentTime,
                        confirmationCode: confirmationCode,
                        businessName: businessName,
                        fromNumber: client.ringlypro_number
                    });

                    if (smsResult.success) {
                        console.log(`✅ SMS confirmación enviado! SID: ${smsResult.messageSid}`);
                    } else {
                        console.error(`❌ SMS falló: ${smsResult.error}`);
                    }
                } else {
                    console.warn(`⚠️  No se puede enviar SMS - cliente ${clientId} sin número RinglyPro`);
                }
            } catch (smsError) {
                console.error(`❌ Error enviando SMS de confirmación:`, smsError);
                // Don't fail the appointment if SMS fails
            }

            const escapedName = (prospectName || 'señor')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            const escapedBusiness = (businessName || 'nuestra empresa')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            const escapedDateTime = appointmentDateTime
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Excelentes noticias ${escapedName}. He agendado exitosamente su cita con ${escapedBusiness} para ${escapedDateTime}. Su código de confirmación es ${confirmationCode}. Recibirá un mensaje de texto con todos los detalles. Gracias por llamar y esperamos verle pronto.</Say>
    <Hangup/>
</Response>`;

            console.log('📤 Sending SUCCESS TwiML (Spanish)');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);

        } catch (bookingError) {
            console.error('❌❌❌ ERROR CREATING SPANISH APPOINTMENT ❌❌❌');
            console.error(`   Error message: ${bookingError.message}`);
            console.error(`   Session: clientId=${clientId}, name="${prospectName}", phone="${prospectPhone}"`);

            const escapedName = (prospectName || 'señor')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, hubo un error al agendar su cita. Por favor llame de nuevo o visite nuestro sitio web. Gracias por su paciencia.</Say>
    <Hangup/>
</Response>`;

            console.log('📤 Sending ERROR TwiML (Spanish)');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(errorTwiml);
        }

    } catch (error) {
        console.error('Error booking appointment (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error al agendar su cita. Por favor, llame de nuevo o visite nuestro sitio web para programar.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/lina/book-appointment', handleBookAppointmentSpanish);
router.get('/voice/lina/book-appointment', handleBookAppointmentSpanish);

/**
 * Handle pricing response (Spanish)
 */
router.post('/voice/lina/handle-pricing-response', async (req, res) => {
    try {
        const response = req.body.SpeechResult || '';
        const businessName = req.session.business_name || 'nuestra empresa';

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por su interés. Le conectaré con un especialista en precios de ${businessName} quien puede proporcionarle información detallada sobre nuestros servicios y costos. Por favor, espere mientras transfiero su llamada.</Say>
                <Say voice="Polly.Lupe" language="es-MX">La función de transferencia aún no está configurada. Por favor, visite nuestro sitio web o llame más tarde para obtener información sobre precios.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error handling pricing response (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, llame más tarde.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Fallback webhook endpoint (Spanish)
 */
router.post('/voice/lina/webhook', async (req, res) => {
    try {
        const businessName = req.session.business_name || 'nosotros';

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por llamar a ${businessName}. ¡Que tenga un excelente día!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error in fallback webhook (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por llamar. ¡Adiós!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Voicemail recording endpoint (Spanish)
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/lina/voicemail', async (req, res) => {
    try {
        console.log('📬 Spanish voicemail requested');

        // Restore client context from query params
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const twimlResponse = await linaService.handleVoicemailRequest(req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in Spanish voicemail:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error con el buzón de voz. Por favor, intente llamar de nuevo.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
});

router.get('/voice/lina/voicemail', async (req, res) => {
    try {
        console.log('📬 Spanish voicemail requested (GET)');

        // Restore client context from query params
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }

        const twimlResponse = await linaService.handleVoicemailRequest(req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in Spanish voicemail:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error con el buzón de voz. Por favor, intente llamar de nuevo.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Handle voicemail recording completion (Spanish)
 * Since Twilio doesn't support Spanish transcription, we store the recording directly
 */
router.post('/voice/lina/voicemail-complete', async (req, res) => {
    try {
        const {
            RecordingUrl,
            RecordingSid,
            RecordingDuration,
            CallSid,
            From,
            To
        } = req.body;

        console.log(`✅ Spanish voicemail recording completed: ${RecordingSid}, Duration: ${RecordingDuration}s`);
        console.log(`🎵 Recording URL: ${RecordingUrl}`);

        // Validate required parameters
        if (!To) {
            console.warn(`⚠️ Voicemail completion missing 'To' number, using session fallback`);
            // Try to get from session
            const toNumber = req.session?.ringlypro_number;
            if (!toNumber) {
                console.error(`❌ Cannot determine target number for voicemail`);
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias por su mensaje. Adiós!</Say>
    <Hangup/>
</Response>`;
                res.set('Content-Type', 'text/xml; charset=utf-8');
                return res.send(twiml);
            }
        }

        // Find client by RinglyPro number
        const { Client, Message } = require('../models');
        const client = await Client.findOne({
            where: { ringlypro_number: To }
        });

        if (client) {
            // Store voicemail with generic Spanish message (no transcription)
            await Message.create({
                clientId: client.id,
                contactId: null,
                twilioSid: RecordingSid,
                recordingUrl: RecordingUrl,
                direction: 'incoming',
                fromNumber: From,
                toNumber: To,
                body: `📞 Mensaje de voz en español (${RecordingDuration}s) - Haga clic para escuchar la grabación`,
                status: 'received',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            console.log(`💾 Spanish voicemail stored for client ${client.id} (${client.business_name})`);
        } else {
            console.warn(`⚠️ No client found for number ${To}`);
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias por su mensaje. Le responderemos pronto. Adiós!</Say>
    <Hangup/>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error handling Spanish voicemail completion:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias. Adiós!</Say>
    <Hangup/>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);
    }
});

/**
 * Handle voicemail transcription callback (Spanish)
 */
router.post('/voice/lina/voicemail-transcription', async (req, res) => {
    try {
        const {
            TranscriptionText,
            TranscriptionSid,
            RecordingSid,
            RecordingUrl,
            CallSid,
            From,
            To
        } = req.body;

        console.log(`📝 Spanish voicemail transcription received: ${TranscriptionSid}`);
        console.log(`Transcripción: "${TranscriptionText}"`);

        // Find client by RinglyPro number
        const { Client, Message } = require('../models');
        const client = await Client.findOne({
            where: { ringlypro_number: To }
        });

        if (!client) {
            console.warn(`⚠️ No client found for number ${To}`);
            res.status(200).send('OK');
            return;
        }

        // Summarize with Claude AI (Spanish)
        const ClaudeAIService = require('../services/claudeAI');
        const claudeAI = new ClaudeAIService();

        let summary;
        try {
            summary = await claudeAI.summarizeVoicemail(TranscriptionText, From, 'es');
        } catch (aiError) {
            console.error('⚠️ Claude AI summarization failed, using fallback:', aiError.message);
            summary = `Mensaje de voz de ${From}: ${TranscriptionText}`;
        }

        // Store voicemail in Messages table
        await Message.create({
            clientId: client.id,
            contactId: null,
            twilioSid: RecordingSid,
            recordingUrl: RecordingUrl,  // Store MP3 URL for playback
            direction: 'incoming',
            fromNumber: From,
            toNumber: To,
            body: summary,
            status: 'received',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        console.log(`💾 Spanish voicemail stored for client ${client.id} (${client.business_name})`);
        console.log(`🎵 Recording URL: ${RecordingUrl}`);

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Error processing Spanish voicemail transcription:', error);
        res.status(200).send('OK'); // Always return 200 to Twilio
    }
});

module.exports = router;
