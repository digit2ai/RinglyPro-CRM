// routes/anaRoutes.js - Spanish Voice Routes (Ana)
// This is a 1:1 mirror of rachelRoutes.js but in Spanish
// IMPORTANT: Uses the SAME flow as English: Name -> Phone -> Date -> Offer Slots -> Select Slot -> Book

const express = require('express');
const AnaVoiceService = require('../services/anaVoiceService');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
const { sendAppointmentConfirmation } = require('../services/appointmentNotification');

// ============================================================================
// INTELLIGENT SPEECH MATCHING UTILITIES
// Handles Spanglish, accent variations, and common speech recognition errors
// ============================================================================

/**
 * Normalize speech input for better matching
 * Handles accent marks, common substitutions, and normalization
 * @param {string} speech - Raw speech input
 * @returns {string} Normalized speech
 */
function normalizeSpeechForMatching(speech) {
    if (!speech) return '';

    let normalized = speech.toLowerCase().trim();

    // Remove accent marks for matching (keep original for logging)
    const accentMap = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ü': 'u', 'ñ': 'n'
    };
    for (const [accented, plain] of Object.entries(accentMap)) {
        normalized = normalized.replace(new RegExp(accented, 'g'), plain);
    }

    // Common speech recognition substitutions
    // (Google/Twilio sometimes hears these differently)
    const substitutions = {
        // B/V confusion (common in Spanish)
        'reserbar': 'reservar',
        'boz': 'voz',
        // S/C/Z confusion
        'sita': 'cita',
        'zita': 'cita',
        // Double letters
        'appoiment': 'appointment',
        'appointmen': 'appointment',
        // Common mishears
        'eskeduler': 'schedule',
        'eskejul': 'schedule'
    };

    for (const [wrong, right] of Object.entries(substitutions)) {
        normalized = normalized.replace(new RegExp(wrong, 'g'), right);
    }

    return normalized;
}

/**
 * Check if speech matches any keywords using intelligent matching
 * Supports partial matches, word boundaries, and fuzzy matching
 * @param {string} normalizedSpeech - Normalized speech input
 * @param {string[]} keywords - Array of keywords to match
 * @returns {boolean} True if any keyword matches
 */
function matchesKeywords(normalizedSpeech, keywords) {
    if (!normalizedSpeech || !keywords.length) return false;

    // Direct substring match (most common case)
    for (const keyword of keywords) {
        if (normalizedSpeech.includes(keyword.toLowerCase())) {
            return true;
        }
    }

    // Word-by-word fuzzy match for longer keywords
    const speechWords = normalizedSpeech.split(/\s+/);
    for (const keyword of keywords) {
        const keywordWords = keyword.toLowerCase().split(/\s+/);

        // Single word keywords - check each speech word
        if (keywordWords.length === 1) {
            for (const word of speechWords) {
                // Fuzzy match: allow 1-2 character difference for words > 4 chars
                if (word.length > 4 && keywordWords[0].length > 4) {
                    if (fuzzyMatch(word, keywordWords[0], 2)) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Simple fuzzy matching using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} maxDistance - Maximum allowed distance
 * @returns {boolean} True if within distance
 */
function fuzzyMatch(str1, str2, maxDistance) {
    // Quick length check
    if (Math.abs(str1.length - str2.length) > maxDistance) return false;

    // Simple Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= str1.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
        for (let j = 1; j <= str2.length; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[str1.length][str2.length] <= maxDistance;
}

// Initialize Ana service
const anaService = new AnaVoiceService(
    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
    process.env.ELEVENLABS_API_KEY
);

const router = express.Router();

// ============================================================================
// PHASE 1: GREETING - Initial Spanish greeting
// ============================================================================

/**
 * Spanish greeting endpoint - entry point for Ana flow
 * Called after language selection (Spanish)
 */
router.post('/voice/ana/greeting', async (req, res) => {
    try {
        // Get context from query params (Twilio doesn't preserve sessions)
        const clientId = req.query.client_id;
        const businessName = decodeURIComponent(req.query.business_name || 'nuestra empresa');
        const userId = req.query.user_id || '';

        console.log(`🇪🇸 [ANA] Greeting for client ${clientId}: ${businessName}`);

        if (!clientId) {
            console.error('❌ [ANA] No client_id in query params');
            res.type('text/xml');
            return res.send(anaService.createSessionExpiredResponse());
        }

        // Store in session for later use
        req.session.client_id = parseInt(clientId, 10);
        req.session.business_name = businessName;
        req.session.user_id = userId;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        // Build context params for callbacks
        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);
        const timeGreeting = anaService.getTimeGreeting();
        const escapedBusiness = anaService.escapeXml(businessName);

        // Check if client has IVR enabled
        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        if (client && client.ivr_enabled && client.ivr_options && client.ivr_options.length > 0) {
            // IVR enabled - show Spanish IVR menu
            console.log(`✅ [ANA] IVR enabled for ${businessName} - showing menu`);
            const twiml = await createSpanishIVRMenu(client, anaService);
            res.type('text/xml');
            return res.send(twiml);
        }

        // No IVR - standard greeting with speech recognition
        const greetingText = `${timeGreeting}, gracias por llamar a ${escapedBusiness}. Mi nombre es Ana, su asistente virtual. Puedo ayudarle a agendar una cita, o si prefiere, puede dejarme un mensaje. ¿En qué puedo ayudarle hoy?`;

        const audioUrl = await anaService.generateAnaAudio(greetingText);

        let twiml;
        if (audioUrl) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="auto" action="/voice/ana/process-speech?${contextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${contextParams}</Redirect>
</Response>`;
        } else {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="auto" action="/voice/ana/process-speech?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${greetingText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${contextParams}</Redirect>
</Response>`;
        }

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error in greeting:', error);
        res.type('text/xml');
        res.send(anaService.createErrorResponse('Lo siento, hubo un error. Por favor llame de nuevo.'));
    }
});

// Handle GET for greeting (for redirects)
router.get('/voice/ana/greeting', (req, res) => {
    res.redirect(307, `/voice/ana/greeting?${req.url.split('?')[1] || ''}`);
});

// ============================================================================
// PHASE 2: INTENT DETECTION - Process speech and determine intent
// ============================================================================

/**
 * Process speech input and determine intent
 */
router.post('/voice/ana/process-speech', async (req, res) => {
    try {
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();

        // Restore context from query params
        const clientId = req.query.client_id || req.session.client_id;
        const businessName = decodeURIComponent(req.query.business_name || req.session.business_name || 'nuestra empresa');
        const userId = req.query.user_id || req.session.user_id || '';

        console.log(`🎤 [ANA] Speech: "${speechResult}" for client ${clientId}`);

        if (!clientId) {
            res.type('text/xml');
            return res.send(anaService.createSessionExpiredResponse());
        }

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);

        // ============================================================================
        // INTELLIGENT SPEECH RECOGNITION WITH SPANGLISH & ACCENT SUPPORT
        // Handles: code-switching, accent variations, common mispronunciations
        // ============================================================================

        // Normalize speech for matching (handle accent marks, common variations)
        const normalizedSpeech = normalizeSpeechForMatching(speechResult);

        // Booking keywords - comprehensive Spanglish and accent variations
        // Includes: Spanish, English, Spanglish, accent variations, common speech recognition errors
        const bookingKeywords = [
            // Core Spanish
            'cita', 'reservar', 'agendar', 'programar', 'turno', 'hora',
            // English mixed in (code-switching)
            'appointment', 'book', 'booking', 'schedule', 'meeting',
            // Spanglish variations (common in US Hispanic community)
            'bookear', 'booker', 'bukear', 'buquear', 'esquedular', 'eskedular',
            'schedulear', 'meetin', 'mitin', 'appoinmen', 'apoinmen',
            // Phrase fragments
            'una cita', 'un turno', 'una hora', 'un appointment',
            'quiero cita', 'necesito cita', 'hacer cita', 'sacar cita',
            'pedir cita', 'apartar', 'apartamento', // common confusion
            // Accent/pronunciation variations
            'sita', 'zita', 'reserbar', 'ajendar', 'programar',
            // Common speech recognition errors
            'citar', 'citas', 'reserva', 'reservación', 'reservacion',
            'reunion', 'reunión', 'junta', 'consulta'
        ];

        // Voicemail keywords - with variations
        const voicemailKeywords = [
            // Core Spanish
            'mensaje', 'dejar', 'grabar', 'buzón', 'buzon', 'recado',
            // English
            'voicemail', 'message', 'leave message',
            // Spanglish
            'voicemel', 'voismail', 'mesaje', 'mensage',
            // Phrases
            'dejar mensaje', 'dejar recado', 'grabar mensaje',
            'tomar mensaje', 'un mensaje', 'el buzon'
        ];

        // Pricing keywords - with variations
        const pricingKeywords = [
            // Core Spanish
            'precio', 'precios', 'costo', 'costos', 'cuánto', 'cuanto',
            'tarifa', 'tarifas', 'cobrar', 'cobran',
            // English
            'price', 'pricing', 'cost', 'how much', 'rate', 'rates',
            // Spanglish
            'prais', 'cuanto cuesta', 'cuanto vale', 'que precio',
            // Phrases
            'cuánto cuesta', 'cuánto cobran', 'cuánto vale',
            'que cuesta', 'que cobran', 'cuanto es'
        ];

        // Transfer/human keywords
        const transferKeywords = [
            // Spanish
            'persona', 'humano', 'agente', 'representante', 'alguien',
            'hablar con', 'transferir', 'operador', 'operadora',
            // English
            'person', 'human', 'agent', 'representative', 'someone',
            'transfer', 'operator', 'speak to',
            // Spanglish
            'real person', 'persona real', 'hablar con alguien'
        ];

        let twiml;

        // Check for booking intent (most common)
        if (matchesKeywords(normalizedSpeech, bookingKeywords)) {
            // Start appointment booking flow - ask for name
            console.log(`📅 [ANA] Booking intent detected`);

            const namePrompt = `¡Excelente! Con mucho gusto le ayudaré a agendar una cita con ${anaService.escapeXml(businessName)}. ¿Puede decirme su nombre por favor?`;

            const audioUrl = await anaService.generateAnaAudio(namePrompt);
            const playOrSay = audioUrl
                ? `<Play>${audioUrl}</Play>`
                : `<Say voice="Polly.Lupe" language="es-MX">${namePrompt}</Say>`;

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="auto" action="/voice/ana/collect-name?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${contextParams}</Redirect>
</Response>`;

        } else if (matchesKeywords(normalizedSpeech, voicemailKeywords)) {
            // Voicemail flow
            console.log(`📬 [ANA] Voicemail intent detected`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect method="POST">/voice/ana/voicemail?${contextParams}</Redirect>
</Response>`;

        } else if (matchesKeywords(normalizedSpeech, pricingKeywords)) {
            // Pricing inquiry
            console.log(`💰 [ANA] Pricing intent detected`);

            const pricingPrompt = `Gracias por su interés en los servicios de ${anaService.escapeXml(businessName)}. Con gusto le conectaré con alguien que puede hablar sobre precios y opciones. ¿Desea que le agende una consulta, o prefiere dejar un mensaje?`;

            const audioUrl = await anaService.generateAnaAudio(pricingPrompt);
            const playOrSay = audioUrl
                ? `<Play>${audioUrl}</Play>`
                : `<Say voice="Polly.Lupe" language="es-MX">${pricingPrompt}</Say>`;

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="auto" action="/voice/ana/process-speech?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/ana/greeting?${contextParams}</Redirect>
</Response>`;

        } else {
            // Unknown intent - ask again
            console.log(`❓ [ANA] Unknown intent: "${speechResult}"`);

            const unknownPrompt = `Lo siento, no entendí bien. Puedo ayudarle a agendar una cita o tomar un mensaje. ¿Qué le gustaría hacer?`;

            const audioUrl = await anaService.generateAnaAudio(unknownPrompt);
            const playOrSay = audioUrl
                ? `<Play>${audioUrl}</Play>`
                : `<Say voice="Polly.Lupe" language="es-MX">${unknownPrompt}</Say>`;

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="auto" action="/voice/ana/process-speech?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Gracias por llamar.</Say>
    <Hangup/>
</Response>`;
        }

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error processing speech:', error);
        res.type('text/xml');
        res.send(anaService.createErrorResponse('Lo siento, hubo un error. Intentemos de nuevo.'));
    }
});

// ============================================================================
// PHASE 3: DATA COLLECTION - Name, Phone, Date
// ============================================================================

/**
 * Collect customer name
 */
router.post('/voice/ana/collect-name', async (req, res) => {
    try {
        const name = req.body.SpeechResult || '';

        // Restore context from query params
        const clientId = req.query.client_id;
        const businessName = decodeURIComponent(req.query.business_name || 'nuestra empresa');
        const userId = req.query.user_id || '';

        console.log(`📝 [ANA] Name collected: "${name}" for client ${clientId}`);

        if (!clientId) {
            res.type('text/xml');
            return res.send(anaService.createSessionExpiredResponse());
        }

        // Store in session
        req.session.client_id = parseInt(clientId, 10);
        req.session.business_name = businessName;
        req.session.user_id = userId;
        req.session.prospect_name = name;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        // Build context with name for next step
        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);
        const escapedName = anaService.escapeXml(name);

        // Ask for phone number (SAME FLOW AS ENGLISH)
        const phonePrompt = `Gracias ${escapedName}. Ahora, ¿puede decirme su número de teléfono de 10 dígitos, o marcarlo usando el teclado?`;

        const audioUrl = await anaService.generateAnaAudio(phonePrompt);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${phonePrompt}</Say>`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="5" numDigits="10" action="/voice/ana/collect-phone?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta.</Say>
    <Redirect>/voice/ana/collect-name?${contextParams}</Redirect>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error collecting name:', error);
        res.type('text/xml');
        res.send(anaService.createErrorResponse('Lo siento, hubo un error. Intentemos de nuevo.'));
    }
});

/**
 * Collect phone number
 */
router.post('/voice/ana/collect-phone', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = req.body.SpeechResult || '';

        // Restore context
        const clientId = req.query.client_id;
        const businessName = decodeURIComponent(req.query.business_name || 'nuestra empresa');
        const userId = req.query.user_id || '';

        // Restore session data
        if (clientId) {
            req.session.client_id = parseInt(clientId, 10);
        }
        if (businessName) {
            req.session.business_name = businessName;
        }
        if (userId) {
            req.session.user_id = userId;
        }

        const prospectName = req.session.prospect_name || '';

        // Normalize phone from DTMF or speech
        let normalizedPhone;
        if (digits) {
            console.log(`📞 [ANA] Phone via keypad: ${digits}`);
            normalizedPhone = normalizePhoneFromSpeech(digits);
        } else if (speechResult) {
            console.log(`📞 [ANA] Phone via speech: ${speechResult}`);
            normalizedPhone = anaService.parseSpanishPhone(speechResult);
            if (normalizedPhone.length < 10) {
                // Try standard normalizer as fallback
                normalizedPhone = normalizePhoneFromSpeech(speechResult);
            }
        } else {
            normalizedPhone = '';
        }

        console.log(`✅ [ANA] Normalized phone: ${normalizedPhone} for ${prospectName}`);

        // Store in session
        req.session.prospect_phone = normalizedPhone;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);
        const escapedName = anaService.escapeXml(prospectName || 'amigo');

        // Ask for DATE only (not time!) - SAME FLOW AS ENGLISH
        const datePrompt = `Perfecto ${escapedName}. Déjeme revisar nuestro calendario. ¿Qué día desea su cita? Por ejemplo, puede decir mañana, o viernes, o 20 de diciembre.`;

        const audioUrl = await anaService.generateAnaAudio(datePrompt);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${datePrompt}</Say>`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/ana/collect-date?${contextParams}" method="POST" language="es-MX">
        ${playOrSay}
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/collect-phone?${contextParams}</Redirect>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error collecting phone:', error);
        res.type('text/xml');
        res.send(anaService.createErrorResponse('Lo siento, hubo un error. Intentemos de nuevo.'));
    }
});

/**
 * Collect date (NOT time) - then offer available slots
 */
router.post('/voice/ana/collect-date', async (req, res) => {
    try {
        const dateInput = req.body.SpeechResult || '';

        // Restore context
        const clientId = req.query.client_id;
        const businessName = decodeURIComponent(req.query.business_name || 'nuestra empresa');
        const userId = req.query.user_id || '';

        if (clientId) {
            req.session.client_id = parseInt(clientId, 10);
        }
        if (businessName) {
            req.session.business_name = businessName;
        }

        console.log(`📅 [ANA] Date input: "${dateInput}" for client ${clientId}`);

        // Parse Spanish date
        const appointmentDate = anaService.parseSpanishDate(dateInput);
        console.log(`📆 [ANA] Parsed date: ${appointmentDate}`);

        // Store in session
        req.session.appointment_date = appointmentDate;
        req.session.slot_offset = 0;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);

        // Format date for speech
        const dateForSpeech = anaService.formatDateForSpanishSpeech(appointmentDate);

        // Redirect to offer-slots to check availability
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Déjeme revisar las horas disponibles para ${dateForSpeech}.</Say>
    <Redirect>/voice/ana/offer-slots?${contextParams}</Redirect>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error collecting date:', error);
        const errorClientId = req.query.client_id || '';
        const errorBusinessName = req.query.business_name || '';
        const errorUserId = req.query.user_id || '';
        const errorContextParams = anaService.buildContextParamsXml(errorClientId, errorBusinessName, errorUserId);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, no entendí la fecha. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/collect-phone?${errorContextParams}</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

// ============================================================================
// PHASE 4: SLOT SELECTION - Offer available time slots from calendar
// ============================================================================

/**
 * Offer available time slots from CRM
 * Uses unifiedBookingService (same as English and WhatsApp)
 */
router.post('/voice/ana/offer-slots', async (req, res) => {
    try {
        // Restore context
        const clientId = req.query.client_id || req.session.client_id;
        const businessName = decodeURIComponent(req.query.business_name || req.session.business_name || 'nuestra empresa');
        const userId = req.query.user_id || req.session.user_id || '';

        if (clientId) {
            req.session.client_id = parseInt(clientId, 10);
        }

        const prospectName = req.session.prospect_name || '';
        const appointmentDate = req.session.appointment_date;
        const slotOffset = req.session.slot_offset || 0;

        console.log(`🔍 [ANA] Checking availability: client=${clientId}, date=${appointmentDate}, offset=${slotOffset}`);

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);

        // Get available slots from unified booking service (same as Rachel/WhatsApp)
        const unifiedBookingService = require('../services/unifiedBookingService');
        const availabilityResult = await unifiedBookingService.getAvailableSlots(clientId, appointmentDate);

        console.log(`📋 [ANA] Availability: source=${availabilityResult.source}, total=${availabilityResult.slots?.length || 0}`);

        const allSlots = availabilityResult.slots || [];
        const slotsToOffer = allSlots.slice(slotOffset, slotOffset + 3);

        const escapedName = anaService.escapeXml(prospectName || 'amigo');

        // Store offered slots in session
        const offeredSlots = slotsToOffer.map(slot => slot.time24 || slot.startTime?.substring(11, 16));
        req.session.offered_slots = offeredSlots;
        req.session.has_more_slots = (slotOffset + 3) < allSlots.length;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        let twiml;

        if (slotsToOffer.length === 0) {
            if (slotOffset === 0) {
                // No availability for this date
                console.log(`❌ [ANA] No availability for ${appointmentDate}`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="auto" action="/voice/ana/collect-date?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, no tenemos citas disponibles para esa fecha. ¿Desea probar con otra fecha? Por favor dígame otro día.</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Permítame transferirle a un especialista.</Say>
    <Redirect>/voice/ana/transfer-specialist?${contextParams}</Redirect>
</Response>`;
            } else {
                // All slots rejected
                console.log(`❌ [ANA] No more slots to offer`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esas fueron todas las horas disponibles para ese día. Permítame transferirle a un especialista que puede revisar otras opciones.</Say>
    <Redirect>/voice/ana/transfer-specialist?${contextParams}</Redirect>
</Response>`;
            }
        } else {
            // Build slot options with both keypress and voice
            const slot1 = anaService.formatTimeForSpanishSpeech(offeredSlots[0]);
            const slot2 = offeredSlots[1] ? anaService.formatTimeForSpanishSpeech(offeredSlots[1]) : null;
            const slot3 = offeredSlots[2] ? anaService.formatTimeForSpanishSpeech(offeredSlots[2]) : null;

            let optionsSpeech = `Para las ${slot1}, presione 1 o diga uno. `;
            if (slot2) optionsSpeech += `Para las ${slot2}, presione 2 o diga dos. `;
            if (slot3) optionsSpeech += `Para las ${slot3}, presione 3 o diga tres. `;

            if (req.session.has_more_slots) {
                optionsSpeech += `Para escuchar más horarios, presione 4 o diga más. `;
            }
            optionsSpeech += `O presione 0 o diga especialista para hablar con alguien.`;

            console.log(`🎙️ [ANA] Offering slots: ${offeredSlots.join(', ')}`);

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/ana/select-slot?${contextParams}" method="POST" speechTimeout="auto" language="es-MX" hints="uno, dos, tres, cuatro, más, especialista, cero">
        <Say voice="Polly.Lupe" language="es-MX">${escapedName}, tengo las siguientes horas disponibles. ${optionsSpeech}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No recibí su selección. Permítame repetir las opciones.</Say>
    <Redirect>/voice/ana/offer-slots?${contextParams}</Redirect>
</Response>`;
        }

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error offering slots:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error al revisar la disponibilidad. Permítame transferirle a un especialista.</Say>
    <Redirect>/voice/ana/transfer-specialist</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

// Handle GET for offer-slots (for redirects)
router.get('/voice/ana/offer-slots', (req, res) => {
    res.redirect(307, `/voice/ana/offer-slots?${req.url.split('?')[1] || ''}`);
});

/**
 * Handle slot selection via DTMF or speech
 */
router.post('/voice/ana/select-slot', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();

        // Convert speech to digit
        let digit = digits || anaService.speechToDigit(speechResult);

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDate = req.session.appointment_date;
        const offeredSlots = req.session.offered_slots || [];
        const businessName = req.session.business_name || 'nuestra empresa';

        const inputMethod = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'None';
        console.log(`🔢 [ANA] Slot selection: digit=${digit} (${inputMethod}), offered=${offeredSlots.join(',')}`);

        const escapedName = anaService.escapeXml(prospectName || 'amigo');
        const contextParams = anaService.buildContextParamsXml(clientId, businessName, req.session.user_id || '');

        let twiml;

        if (digit === '0') {
            // Transfer to specialist
            console.log(`📞 [ANA] User requested specialist transfer`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>/voice/ana/transfer-specialist?${contextParams}</Redirect>
</Response>`;

        } else if (digit === '4' && req.session.has_more_slots) {
            // Show more slots
            console.log(`➡️ [ANA] User requested more slots`);
            req.session.slot_offset = (req.session.slot_offset || 0) + 3;
            await new Promise((resolve, reject) => {
                req.session.save((err) => err ? reject(err) : resolve());
            });
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>/voice/ana/offer-slots?${contextParams}</Redirect>
</Response>`;

        } else if (['1', '2', '3'].includes(digit)) {
            const slotIndex = parseInt(digit) - 1;
            const selectedTime = offeredSlots[slotIndex];

            if (!selectedTime) {
                console.log(`❌ [ANA] Invalid slot index ${slotIndex}`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, esa opción no está disponible. Permítame repetir los horarios.</Say>
    <Redirect>/voice/ana/offer-slots?${contextParams}</Redirect>
</Response>`;
            } else {
                console.log(`✅ [ANA] User selected slot: ${selectedTime}`);

                // Store selected time
                req.session.appointment_time = selectedTime;
                req.session.appointment_datetime = `${appointmentDate} at ${selectedTime}`;

                await new Promise((resolve, reject) => {
                    req.session.save((err) => err ? reject(err) : resolve());
                });

                // Format for confirmation
                const timeForSpeech = anaService.formatTimeForSpanishSpeech(selectedTime);
                const dateForSpeech = anaService.formatDateForSpanishSpeech(appointmentDate);

                // Go directly to book-appointment
                console.log(`📞 [ANA] Phone already collected: ${prospectPhone}, proceeding to booking`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">¡Perfecto! Ha seleccionado las ${timeForSpeech} del ${dateForSpeech}. Por favor espere mientras confirmo su cita.</Say>
    <Redirect>/voice/ana/book-appointment?${contextParams}</Redirect>
</Response>`;
            }

        } else {
            // Invalid input - retry
            console.log(`❓ [ANA] Unclear input: ${digit || 'none'} (${inputMethod}) - retrying`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">No entendí bien. Permítame repetir las opciones.</Say>
    <Redirect>/voice/ana/offer-slots?${contextParams}</Redirect>
</Response>`;
        }

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error selecting slot:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Permítame transferirle a un especialista.</Say>
    <Redirect>/voice/ana/transfer-specialist</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

// ============================================================================
// PHASE 5: BOOKING - Create appointment in CRM
// ============================================================================

/**
 * Book appointment via unified booking service
 * Handle both GET (from redirects) and POST
 */
const handleBookAppointment = async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'nuestra empresa';
        const appointmentDate = req.session.appointment_date;
        const appointmentTime = req.session.appointment_time;

        console.log(`📅 [ANA] Booking: client=${clientId}, ${prospectName} (${prospectPhone}) at ${appointmentDate} ${appointmentTime}`);

        if (!clientId) {
            throw new Error('Missing clientId - cannot create appointment');
        }

        // Book via unified service (same as Rachel/WhatsApp)
        const unifiedBookingService = require('../services/unifiedBookingService');

        const bookingResult = await unifiedBookingService.bookAppointment(clientId, {
            customerName: prospectName || 'Unknown',
            customerPhone: prospectPhone || '',
            customerEmail: null,
            date: appointmentDate,
            time: appointmentTime,
            service: 'Reserva por Voz',
            notes: `Reservado via Ana asistente de voz en español`,
            source: 'voice_booking_spanish'
        });

        console.log(`📋 [ANA] Booking result:`, JSON.stringify(bookingResult, null, 2));

        const escapedName = anaService.escapeXml(prospectName || 'amigo');
        const escapedBusiness = anaService.escapeXml(businessName);

        if (!bookingResult.success) {
            console.error(`❌ [ANA] Booking failed: ${bookingResult.error}`);

            let errorTwiml;
            if (bookingResult.slotConflict) {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, ese horario acaba de ser reservado por otra persona. Por favor llame de nuevo para agendar en otro horario. Gracias.</Say>
    <Hangup/>
</Response>`;
            } else {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, hubo un error al reservar su cita. Por favor llame de nuevo o visite nuestro sitio web para agendar. Gracias por su paciencia.</Say>
    <Hangup/>
</Response>`;
            }

            res.type('text/xml');
            return res.send(errorTwiml);
        }

        // ============= BOOKING SUCCESS =============
        const confirmationCode = bookingResult.confirmationCode;
        const crmSystem = bookingResult.system;

        console.log(`✅✅✅ [ANA] CITA CREADA EXITOSAMENTE! ✅✅✅`);
        console.log(`   🏢 Cliente: ${clientId}`);
        console.log(`   👤 Prospecto: ${prospectName} (${prospectPhone})`);
        console.log(`   📅 Fecha/Hora: ${appointmentDate} ${appointmentTime}`);
        console.log(`   🔑 Confirmación: ${confirmationCode}`);
        console.log(`   📍 Sistema CRM: ${crmSystem}`);

        // Send SMS confirmation
        try {
            const { Client } = require('../models');
            const client = await Client.findByPk(clientId);

            if (client && client.ringlypro_number && prospectPhone) {
                console.log(`📱 [ANA] Sending SMS confirmation to ${prospectPhone}`);

                const smsResult = await sendAppointmentConfirmation({
                    customerPhone: prospectPhone,
                    customerName: prospectName,
                    appointmentDate: appointmentDate,
                    appointmentTime: appointmentTime,
                    confirmationCode: confirmationCode,
                    businessName: businessName,
                    fromNumber: client.ringlypro_number
                });

                if (smsResult.success) {
                    console.log(`✅ [ANA] SMS sent! SID: ${smsResult.messageSid}`);
                } else {
                    console.error(`❌ [ANA] SMS failed: ${smsResult.error}`);
                }
            }
        } catch (smsError) {
            console.error(`❌ [ANA] SMS error:`, smsError);
        }

        // Format for Spanish speech
        const dateForSpeech = anaService.formatDateForSpanishSpeech(appointmentDate);
        const timeForSpeech = anaService.formatTimeForSpanishSpeech(appointmentTime);

        // Check if client requires deposits - use pending deposit message
        // Client 32 always gets deposit message (legacy), other clients check deposit_required setting
        const requiresDeposit = (clientId == 32) || (client && client.deposit_required);

        let successMessage;
        if (requiresDeposit) {
            successMessage = `¡Excelentes noticias ${escapedName}! He registrado su cita con ${escapedBusiness} para el ${dateForSpeech} a las ${timeForSpeech}. Su cita está pendiente de un depósito inicial. Un especialista se comunicará con usted pronto para brindarle más asistencia y completar el proceso. Gracias por llamar, esperamos verle pronto.`;
            console.log(`🎙️ [ANA] Client ${clientId} - Using deposit pending message (deposit_required=${client?.deposit_required || 'legacy client 32'})`);
        } else {
            successMessage = `¡Excelentes noticias ${escapedName}! He reservado exitosamente su cita con ${escapedBusiness} para el ${dateForSpeech} a las ${timeForSpeech}. Su código de confirmación es ${confirmationCode}. Recibirá un mensaje de texto con todos los detalles en breve. Gracias por llamar, esperamos verle pronto.`;
        }

        const audioUrl = await anaService.generateAnaAudio(successMessage);

        let twiml;
        if (audioUrl) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>${audioUrl}</Play>
    <Hangup/>
</Response>`;
        } else {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">${successMessage}</Say>
    <Hangup/>
</Response>`;
        }

        console.log('📤 [ANA] Sending SUCCESS TwiML - appointment created');
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error booking appointment:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error al reservar su cita. Por favor llame de nuevo o visite nuestro sitio web para agendar.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
};

router.post('/voice/ana/book-appointment', handleBookAppointment);
router.get('/voice/ana/book-appointment', handleBookAppointment);

// ============================================================================
// TRANSFER & VOICEMAIL
// ============================================================================

/**
 * Transfer to specialist
 */
router.post('/voice/ana/transfer-specialist', async (req, res) => {
    try {
        const clientId = req.session.client_id || req.query.client_id;

        console.log(`📞 [ANA] Transferring to specialist for client ${clientId}`);

        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        let twiml;

        if (client && client.business_phone) {
            console.log(`📞 [ANA] Transferring to ${client.business_phone}`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Por favor espere mientras le transfiero a un especialista de programación.</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number || ''}">
        <Number>${client.business_phone}</Number>
    </Dial>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, la transferencia no fue exitosa. Por favor llame de nuevo durante horario de atención o deje un mensaje de voz.</Say>
    <Redirect>/voice/ana/voicemail</Redirect>
</Response>`;
        } else {
            console.log(`⚠️ [ANA] No business_phone for client ${clientId}`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, nuestros especialistas no están disponibles en este momento. ¿Desea dejar un mensaje de voz y le llamaremos de vuelta?</Say>
    <Redirect>/voice/ana/voicemail</Redirect>
</Response>`;
        }

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error transferring:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor llame de nuevo. Gracias.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

router.get('/voice/ana/transfer-specialist', (req, res) => {
    res.redirect(307, `/voice/ana/transfer-specialist?${req.url.split('?')[1] || ''}`);
});

/**
 * Voicemail recording
 */
router.post('/voice/ana/voicemail', async (req, res) => {
    try {
        const clientId = req.session.client_id || req.query.client_id;
        const businessName = req.session.business_name || decodeURIComponent(req.query.business_name || 'nuestra empresa');

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, req.session.user_id || '');
        const escapedBusiness = anaService.escapeXml(businessName);

        const voicemailPrompt = `Por supuesto, con mucho gusto tomaré su mensaje para ${escapedBusiness}. Después del tono, por favor comparta su mensaje. Puede hablar hasta por 3 minutos. Cuando termine, presione la tecla numeral o cuelgue.`;

        const audioUrl = await anaService.generateAnaAudio(voicemailPrompt);
        const playOrSay = audioUrl
            ? `<Play>${audioUrl}</Play>`
            : `<Say voice="Polly.Lupe" language="es-MX">${voicemailPrompt}</Say>`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    ${playOrSay}
    <Record maxLength="180" timeout="5" transcribe="true" transcriptionCallback="/voice/ana/voicemail-transcription" action="/voice/ana/voicemail-complete?${contextParams}" method="POST" playBeep="true" finishOnKey="#*"/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error in voicemail:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error con el buzón de voz. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

router.get('/voice/ana/voicemail', (req, res) => {
    res.redirect(307, `/voice/ana/voicemail?${req.url.split('?')[1] || ''}`);
});

/**
 * Voicemail complete
 */
router.post('/voice/ana/voicemail-complete', async (req, res) => {
    try {
        const { RecordingUrl, RecordingSid, RecordingDuration } = req.body;
        console.log(`✅ [ANA] Voicemail completed: ${RecordingSid}, Duration: ${RecordingDuration}s`);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias por su mensaje. Nos comunicaremos con usted pronto. ¡Hasta luego!</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] Error in voicemail complete:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Gracias. ¡Hasta luego!</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Voicemail transcription callback
 */
router.post('/voice/ana/voicemail-transcription', async (req, res) => {
    try {
        const {
            TranscriptionText,
            TranscriptionSid,
            RecordingSid,
            RecordingUrl,
            From,
            To
        } = req.body;

        console.log(`📝 [ANA] Transcription: "${TranscriptionText}"`);

        // Find client by RinglyPro number
        const { Client, Message } = require('../models');
        const client = await Client.findOne({
            where: { ringlypro_number: To }
        });

        if (!client) {
            console.warn(`⚠️ [ANA] No client for ${To}`);
            return res.status(200).send('OK');
        }

        // Summarize with Claude AI
        const ClaudeAIService = require('../services/claudeAI');
        const claudeAI = new ClaudeAIService();

        let summary;
        try {
            summary = await claudeAI.summarizeVoicemail(TranscriptionText, From, 'es');
        } catch (aiError) {
            console.error('⚠️ [ANA] Claude AI failed:', aiError.message);
            summary = `Mensaje de voz de ${From}: ${TranscriptionText}`;
        }

        // Store voicemail
        await Message.create({
            clientId: client.id,
            contactId: null,
            twilioSid: RecordingSid,
            recordingUrl: RecordingUrl,
            direction: 'incoming',
            fromNumber: From,
            toNumber: To,
            body: summary,
            status: 'received',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        console.log(`💾 [ANA] Voicemail stored for client ${client.id}`);

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ [ANA] Transcription error:', error);
        res.status(200).send('OK');
    }
});

// ============================================================================
// IVR MENU (Spanish)
// ============================================================================

/**
 * Create Spanish IVR menu with custom greeting support
 * Checks for custom_greeting_spanish in client settings, falls back to default
 */
async function createSpanishIVRMenu(client, anaService) {
    const businessName = client.business_name;
    const ivrOptions = client.ivr_options || [];
    const enabledDepts = ivrOptions.filter(dept => dept.enabled);

    // Check for custom Spanish greeting in client settings
    // Priority: settings.custom_greeting_spanish > default greeting
    let customGreeting = null;
    if (client.settings && client.settings.custom_greeting_spanish) {
        customGreeting = client.settings.custom_greeting_spanish;
        console.log(`🎙️ [ANA] Using custom Spanish greeting for ${businessName}`);
    }

    // Build menu text - start with custom greeting or default
    let menuText;
    if (customGreeting) {
        // Use custom greeting, then add IVR options
        menuText = `${customGreeting} `;
    } else {
        // Default greeting
        menuText = `¡Hola! Habla Ana de ${businessName}. Estoy aquí para ayudarle. `;
    }

    // Add IVR options
    menuText += `Para programar una cita, presione 1 o diga cita. `;

    let speechHints = 'cita, programar, uno, mensaje, buzón, nueve';

    enabledDepts.forEach((dept, index) => {
        const digit = index + 2;
        const numberWord = ['dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'][index] || digit;
        menuText += `Para ${dept.name}, presione ${digit} o diga ${dept.name.toLowerCase()}. `;
        speechHints += `, ${dept.name.toLowerCase()}, ${numberWord}`;
    });

    menuText += `O, para dejar un mensaje de voz, presione 9 o diga mensaje.`;

    const contextParams = `client_id=${client.id}&amp;business_name=${encodeURIComponent(businessName)}&amp;lang=es`;

    // Try to use Ana premium ElevenLabs voice
    const audioUrl = await anaService.generateAnaAudio(menuText);

    let twiml;
    if (audioUrl) {
        console.log(`✅ [ANA] Using premium ElevenLabs voice for IVR menu`);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/ana/ivr-selection?${contextParams}" method="POST" speechTimeout="auto" language="es-MX" hints="${speechHints}">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No entendí bien. Permítame repetir las opciones.</Say>
    <Redirect method="POST">/voice/ana/ivr-menu?${contextParams}</Redirect>
</Response>`;
    } else {
        // Fallback to Polly
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/ana/ivr-selection?${contextParams}" method="POST" speechTimeout="auto" language="es-MX" hints="${speechHints}">
        <Say voice="Polly.Lupe" language="es-MX">${menuText}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No entendí bien. Permítame repetir las opciones.</Say>
    <Redirect method="POST">/voice/ana/ivr-menu?${contextParams}</Redirect>
</Response>`;
    }

    console.log(`📋 [ANA] IVR Menu for ${businessName}: ${enabledDepts.length} departments`);
    return twiml;
}

/**
 * IVR menu endpoint for retries
 */
router.post('/voice/ana/ivr-menu', async (req, res) => {
    try {
        const clientId = req.query.client_id;

        if (!clientId) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        if (!client) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        const twiml = await createSpanishIVRMenu(client, anaService);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('[ANA] IVR menu error:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Handle IVR selection
 */
router.post('/voice/ana/ivr-selection', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();

        // Restore context
        const clientId = req.query.client_id || req.session.client_id;
        const businessName = decodeURIComponent(req.query.business_name || req.session.business_name || '');
        const userId = req.query.user_id || '';

        if (clientId) {
            req.session.client_id = parseInt(clientId, 10);
            req.session.business_name = businessName;
            req.session.user_id = userId;
        }

        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);
        const enabledDepts = client ? (client.ivr_options || []).filter(dept => dept.enabled) : [];

        // Convert speech to digit
        let digit = digits;
        if (!digit && speechResult) {
            if (speechResult.includes('cita') || speechResult.includes('programar') || speechResult === 'uno') {
                digit = '1';
            } else if (speechResult.includes('mensaje') || speechResult.includes('buzón') || speechResult === 'nueve') {
                digit = '9';
            } else {
                // Check department names
                enabledDepts.forEach((dept, index) => {
                    if (speechResult.includes(dept.name.toLowerCase())) {
                        digit = String(index + 2);
                    }
                });
                // Check number words
                if (!digit) {
                    const numberMap = { 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8' };
                    Object.keys(numberMap).forEach(word => {
                        if (speechResult.includes(word)) {
                            digit = numberMap[word];
                        }
                    });
                }
            }
        }

        console.log(`🔢 [ANA] IVR selection: ${digit} for client ${clientId}`);

        if (!clientId) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        const contextParams = anaService.buildContextParamsXml(clientId, businessName, userId);

        if (digit === '1') {
            // Appointment booking
            console.log(`📅 [ANA] IVR: Appointment selected`);

            const namePrompt = `¡Excelente! Me encantaría ayudarle a reservar una cita. ¿Puede decirme su nombre?`;

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/ana/collect-name?${contextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${namePrompt}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${contextParams}</Redirect>
</Response>`;

            res.type('text/xml');
            return res.send(twiml);

        } else if (digit === '9') {
            // Voicemail
            console.log(`📬 [ANA] IVR: Voicemail selected`);

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect method="POST">/voice/ana/voicemail?${contextParams}</Redirect>
</Response>`;

            res.type('text/xml');
            return res.send(twiml);

        } else {
            // Department transfer or invalid
            const deptIndex = parseInt(digit) - 2;

            if (deptIndex >= 0 && deptIndex < enabledDepts.length && client) {
                const dept = enabledDepts[deptIndex];
                console.log(`📞 [ANA] IVR: Transferring to ${dept.name} (${dept.phone})`);

                // Loop prevention (same as English)
                const normalizePhone = (phone) => (phone || '').replace(/\D/g, '');
                const destPhone = normalizePhone(dept.phone);
                const didPhone = normalizePhone(client.ringlypro_number);
                const businessPhone = normalizePhone(client.business_phone);

                const matchesDID = destPhone === didPhone || destPhone.endsWith(didPhone) || didPhone.endsWith(destPhone);
                const matchesBusinessPhone = destPhone === businessPhone || destPhone.endsWith(businessPhone) || businessPhone.endsWith(destPhone);
                const wouldLoop = matchesDID || matchesBusinessPhone;

                let twiml;

                if (wouldLoop) {
                    const ownerPhone = normalizePhone(client.owner_phone);
                    const ownerMatchesDID = ownerPhone === didPhone || ownerPhone.endsWith(didPhone) || didPhone.endsWith(ownerPhone);
                    const ownerMatchesBusiness = ownerPhone === businessPhone || ownerPhone.endsWith(businessPhone) || businessPhone.endsWith(ownerPhone);

                    if (client.owner_phone && !ownerMatchesDID && !ownerMatchesBusiness) {
                        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Transfiriéndolo a ${dept.name}. Por favor espere.</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${client.owner_phone}</Number>
    </Dial>
    <Say voice="Polly.Lupe" language="es-MX">La transferencia falló. Por favor intente más tarde. Hasta luego.</Say>
    <Hangup/>
</Response>`;
                    } else {
                        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, ${dept.name} no está disponible en este momento. Por favor intente más tarde o deje un mensaje.</Say>
    <Redirect method="POST">/voice/ana/voicemail?${contextParams}</Redirect>
</Response>`;
                    }
                } else {
                    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Transfiriéndolo a ${dept.name}. Por favor espere.</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${dept.phone}</Number>
    </Dial>
    <Say voice="Polly.Lupe" language="es-MX">La transferencia falló. Por favor intente más tarde. Hasta luego.</Say>
    <Hangup/>
</Response>`;
                }

                res.type('text/xml');
                return res.send(twiml);

            } else {
                // Invalid selection - retry
                console.log(`⚠️ [ANA] IVR: Invalid selection: ${digit}`);

                const retryParams = `client_id=${clientId}&amp;business_name=${encodeURIComponent(businessName)}&amp;lang=es`;

                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">No entendí bien. Permítame repetir las opciones.</Say>
    <Redirect method="POST">/voice/ana/ivr-menu?${retryParams}</Redirect>
</Response>`;

                res.type('text/xml');
                return res.send(twiml);
            }
        }

    } catch (error) {
        console.error('[ANA] IVR selection error:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor llame de nuevo.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

module.exports = router;
