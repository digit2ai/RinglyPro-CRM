// routes/rachelRoutes.js
const express = require('express');
const MultiTenantRachelService = require('../services/rachelVoiceService');
const path = require('path');
const fs = require('fs').promises;
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
const { sendAppointmentConfirmation } = require('../services/appointmentNotification');

// Initialize Rachel service
const rachelService = new MultiTenantRachelService(
    process.env.DATABASE_URL,
    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
    process.env.ELEVENLABS_API_KEY
);

const router = express.Router();

/**
 * Main Rachel webhook endpoint - handles incoming calls
 */
router.post('/voice/rachel/', async (req, res) => {
    try {
        console.log('📞 Rachel webhook called with:', req.body);
        
        const twimlResponse = await rachelService.handleIncomingCall(req.body, req.session);
        
        res.type('text/xml');
        res.send(twimlResponse);
        
    } catch (error) {
        console.error('Error in Rachel webhook:', error);
        
        // Fallback TwiML response
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try calling again.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Process speech input endpoint
 */
router.post('/voice/rachel/process-speech', async (req, res) => {
    try {
        console.log('🎤 Processing speech:', req.body.SpeechResult);
        
        const twimlResponse = await rachelService.processSpeechInput(req.body, req.session);
        
        res.type('text/xml');
        res.send(twimlResponse);
        
    } catch (error) {
        console.error('Error processing speech:', error);
        
        // Fallback TwiML response
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error processing your request. Please try again.</Say>
                <Redirect>/voice/rachel/webhook</Redirect>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect name for appointment booking
 */
router.post('/voice/rachel/collect-name', async (req, res) => {
    try {
        const name = req.body.SpeechResult || '';

        // Restore context from query params (Twilio doesn't preserve sessions between webhooks)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        const userIdFromQuery = req.query.user_id;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }
        if (userIdFromQuery) {
            req.session.user_id = userIdFromQuery;
        }

        const clientId = req.session.client_id;
        const businessName = req.session.business_name || 'this business';

        // Build context params for subsequent redirects
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;

        console.log(`📝 Name collected for client ${clientId}: ${name}`);

        // Store name in session
        req.session.prospect_name = name;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Escape XML special characters to prevent parse errors
        const escapedName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // CORRECT FLOW: After name, collect phone number (same as WhatsApp flow)
        const phonePrompt = `Thank you ${name}. <break time="0.5s"/> Can you please provide your phone number so we can send you a confirmation?`;
        console.log(`🎙️ Generating Rachel premium voice for phone collection`);

        const audioUrl = await rachelService.generateRachelAudio(phonePrompt);

        // XML-safe context params (escape & as &amp;)
        const xmlContextParams = contextParams.replace(/&/g, '&amp;');

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="auto" numDigits="10" action="/voice/rachel/collect-phone?${xmlContextParams}" method="POST" language="en-US">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name?${xmlContextParams}</Redirect>
</Response>`;
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="auto" numDigits="10" action="/voice/rachel/collect-phone?${xmlContextParams}" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Thank you ${escapedName}. Can you please provide your phone number so we can send you a confirmation?</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name?${xmlContextParams}</Redirect>
</Response>`;
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        }

    } catch (error) {
        console.error('Error collecting name:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Let me try again.</Say>
                <Redirect>/voice/rachel/process-speech</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect phone number for appointment booking
 */
router.post('/voice/rachel/collect-phone', async (req, res) => {
    try {
        const digits = req.body.Digits || '';  // DTMF keypad input
        const speechResult = req.body.SpeechResult || '';  // Voice input

        // Restore context from query params (Twilio doesn't preserve sessions between webhooks)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        const userIdFromQuery = req.query.user_id;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }
        if (userIdFromQuery) {
            req.session.user_id = userIdFromQuery;
        }

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';

        // Build context params for subsequent redirects
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;

        let normalizedPhone;

        if (digits) {
            // User entered phone via keypad - this is already accurate
            console.log(`📞 Phone entered via keypad for client ${clientId}: ${digits}`);
            normalizedPhone = normalizePhoneFromSpeech(digits);  // Just formats it
        } else if (speechResult) {
            // User spoke the phone number - needs normalization
            console.log(`📞 Phone spoken for client ${clientId}: ${speechResult}`);
            normalizedPhone = normalizePhoneFromSpeech(speechResult);
            console.log(`📞 Normalized from speech: ${speechResult} → ${normalizedPhone}`);
        } else {
            console.log(`⚠️ No phone input received for client ${clientId}`);
            normalizedPhone = '';
        }

        console.log(`📝 Prospect name from session: ${prospectName}`);
        console.log(`✅ Final phone number: ${normalizedPhone}`);

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
        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // CORRECT FLOW: Say "give me a minute to check our calendar" then ask for date
        const datePrompt = `Perfect ${prospectName || 'there'}. <break time="0.5s"/> Give me a minute to check our calendar. <break time="1s"/> What date would you like to schedule your appointment? <break time="0.5s"/> For example, you can say tomorrow, or Friday, or December 20th.`;
        console.log(`🎙️ Generating Rachel premium voice for calendar check + date collection`);

        const audioUrl = await rachelService.generateRachelAudio(datePrompt);

        // XML-safe context params (escape & as &amp;)
        const xmlContextParams = contextParams.replace(/&/g, '&amp;');

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/rachel/collect-date?${xmlContextParams}" method="POST" language="en-US">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone?${xmlContextParams}</Redirect>
</Response>`;
            console.log('📤 Sending TwiML from collect-phone with Rachel premium voice');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/rachel/collect-date?${xmlContextParams}" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Perfect ${escapedName}. Give me a minute to check our calendar. What date would you like to schedule your appointment? For example, you can say tomorrow, or Friday, or December 20th.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone?${xmlContextParams}</Redirect>
</Response>`;
            console.log('📤 Sending TwiML from collect-phone (fallback to Polly)');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        }

    } catch (error) {
        console.error('Error collecting phone:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try again.</Say>
                <Redirect>/voice/rachel/collect-name</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * NEW FLOW: Collect date only (not time)
 * After getting date, we check availability and offer time slots
 */
router.post('/voice/rachel/collect-date', async (req, res) => {
    try {
        const dateInput = req.body.SpeechResult || '';

        // Restore context from query params (Twilio doesn't preserve sessions between webhooks)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        const userIdFromQuery = req.query.user_id;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }
        if (userIdFromQuery) {
            req.session.user_id = userIdFromQuery;
        }

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';

        // Build context params for subsequent redirects
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;
        const xmlContextParams = contextParams.replace(/&/g, '&amp;');

        console.log(`📅 [SLOT-FLOW] Date input for client ${clientId}: "${dateInput}"`);

        // Parse the date from speech
        const moment = require('moment-timezone');
        const now = moment().tz('America/New_York');
        let appointmentDate;

        const lowerInput = dateInput.toLowerCase();

        if (lowerInput.includes('tomorrow')) {
            appointmentDate = now.clone().add(1, 'day').format('YYYY-MM-DD');
        } else if (lowerInput.includes('today')) {
            appointmentDate = now.format('YYYY-MM-DD');
        } else if (lowerInput.includes('monday')) {
            appointmentDate = now.clone().day(1 + (now.day() >= 1 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('tuesday')) {
            appointmentDate = now.clone().day(2 + (now.day() >= 2 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('wednesday')) {
            appointmentDate = now.clone().day(3 + (now.day() >= 3 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('thursday')) {
            appointmentDate = now.clone().day(4 + (now.day() >= 4 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('friday')) {
            appointmentDate = now.clone().day(5 + (now.day() >= 5 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('saturday')) {
            appointmentDate = now.clone().day(6 + (now.day() >= 6 ? 7 : 0)).format('YYYY-MM-DD');
        } else if (lowerInput.includes('sunday')) {
            appointmentDate = now.clone().day(0 + (now.day() >= 0 ? 7 : 0)).format('YYYY-MM-DD');
        } else {
            // Try to parse as a date (e.g., "December 20th", "January 5")
            const parsedDate = moment(dateInput, ['MMMM Do', 'MMMM D', 'MMM Do', 'MMM D', 'M/D', 'MM/DD']);
            if (parsedDate.isValid()) {
                // Set to current year, or next year if date has passed
                parsedDate.year(now.year());
                if (parsedDate.isBefore(now, 'day')) {
                    parsedDate.add(1, 'year');
                }
                appointmentDate = parsedDate.format('YYYY-MM-DD');
            } else {
                // Default to tomorrow if we can't parse
                appointmentDate = now.clone().add(1, 'day').format('YYYY-MM-DD');
                console.log(`⚠️ [SLOT-FLOW] Could not parse date "${dateInput}", defaulting to tomorrow`);
            }
        }

        console.log(`📆 [SLOT-FLOW] Parsed date: ${appointmentDate}`);

        // Store date in session
        req.session.appointment_date = appointmentDate;
        req.session.slot_offset = 0;  // Start showing from first available slot

        // Save session
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Redirect to offer-slots which will check availability and offer times
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Let me check our available times for ${dateInput}.</Say>
    <Redirect>/voice/rachel/offer-slots?${xmlContextParams}</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('[SLOT-FLOW] Error collecting date:', error);
        // Build error context params
        const errorClientId = req.query.client_id || req.session?.client_id || '';
        const errorBusinessName = req.query.business_name || req.session?.business_name || '';
        const errorUserId = req.query.user_id || req.session?.user_id || '';
        const errorContextParams = `client_id=${errorClientId}&amp;business_name=${encodeURIComponent(errorBusinessName)}&amp;user_id=${errorUserId}`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, I had trouble understanding the date. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone?${errorContextParams}</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * NEW FLOW: Offer available time slots from CRM
 * Checks availability and offers 3 options via DTMF
 */
router.post('/voice/rachel/offer-slots', async (req, res) => {
    try {
        // Restore context from query params (Twilio doesn't preserve sessions between webhooks)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        const userIdFromQuery = req.query.user_id;

        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
        }
        if (userIdFromQuery) {
            req.session.user_id = userIdFromQuery;
        }

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const appointmentDate = req.session.appointment_date;
        const slotOffset = req.session.slot_offset || 0;
        const businessName = req.session.business_name || 'this business';

        // Build context params for subsequent redirects
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;
        const xmlContextParams = contextParams.replace(/&/g, '&amp;');

        console.log(`🔍 [SLOT-FLOW] Checking availability for client ${clientId}, date ${appointmentDate}, offset ${slotOffset}`);

        // Get available slots from unified booking service (same as WhatsApp)
        const unifiedBookingService = require('../services/unifiedBookingService');
        const availabilityResult = await unifiedBookingService.getAvailableSlots(clientId, appointmentDate);

        console.log(`📋 [SLOT-FLOW] Availability: source=${availabilityResult.source}, total=${availabilityResult.slots?.length || 0}`);

        const allSlots = availabilityResult.slots || [];

        // Get 3 slots starting from offset
        const slotsToOffer = allSlots.slice(slotOffset, slotOffset + 3);

        console.log(`📋 [SLOT-FLOW] Offering slots ${slotOffset + 1}-${slotOffset + slotsToOffer.length} of ${allSlots.length}`);

        // Format time for speech
        const formatTimeForSpeech = (timeStr) => {
            const [hours, minutes] = timeStr.split(':');
            let hour = parseInt(hours);
            const isPM = hour >= 12;
            if (hour > 12) hour -= 12;
            if (hour === 0) hour = 12;
            const period = isPM ? 'PM' : 'AM';
            return minutes === '00' ? `${hour} ${period}` : `${hour}:${minutes} ${period}`;
        };

        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        // Store offered slots in session for selection
        const offeredSlots = slotsToOffer.map(slot => slot.time24 || slot.startTime?.substring(11, 16));
        req.session.offered_slots = offeredSlots;
        req.session.has_more_slots = (slotOffset + 3) < allSlots.length;

        await new Promise((resolve, reject) => {
            req.session.save((err) => err ? reject(err) : resolve());
        });

        let twiml;

        if (slotsToOffer.length === 0) {
            // No slots available for this date
            if (slotOffset === 0) {
                // First try - no availability at all for this date
                console.log(`❌ [SLOT-FLOW] No availability for ${appointmentDate}`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="8" speechTimeout="auto" action="/voice/rachel/collect-date?${xmlContextParams}" method="POST" language="en-US">
        <Say voice="Polly.Joanna">I'm sorry ${escapedName}, we don't have any available appointments for that date. Would you like to try a different date? Please tell me another date you'd prefer.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear a response. Let me transfer you to a specialist who can help.</Say>
    <Redirect>/voice/rachel/transfer-specialist?${xmlContextParams}</Redirect>
</Response>`;
            } else {
                // We've shown all slots and user rejected them all
                console.log(`❌ [SLOT-FLOW] No more slots to offer`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, those were all our available times for that day. Let me transfer you to a specialist who can check other options for you.</Say>
    <Redirect>/voice/rachel/transfer-specialist?${xmlContextParams}</Redirect>
</Response>`;
            }
        } else {
            // Build the slot options speech with both keypress and voice options
            const slot1 = formatTimeForSpeech(offeredSlots[0]);
            const slot2 = offeredSlots[1] ? formatTimeForSpeech(offeredSlots[1]) : null;
            const slot3 = offeredSlots[2] ? formatTimeForSpeech(offeredSlots[2]) : null;

            let optionsSpeech = `For ${slot1}, press 1 or say one. `;
            if (slot2) optionsSpeech += `For ${slot2}, press 2 or say two. `;
            if (slot3) optionsSpeech += `For ${slot3}, press 3 or say three. `;

            // Add option to hear more slots or transfer
            if (req.session.has_more_slots) {
                optionsSpeech += `To hear more times, press 4 or say more. `;
            }
            optionsSpeech += `Or press 0 or say specialist to speak with someone.`;

            console.log(`🎙️ [SLOT-FLOW] Offering: ${offeredSlots.join(', ')}`);

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/rachel/select-slot?${xmlContextParams}" method="POST" speechTimeout="auto" language="en-US" hints="one, two, three, four, more, specialist, zero">
        <Say voice="Polly.Joanna">${escapedName}, I have the following times available. ${optionsSpeech}</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't receive a selection. Let me repeat the options.</Say>
    <Redirect>/voice/rachel/offer-slots?${xmlContextParams}</Redirect>
</Response>`;
        }

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('[SLOT-FLOW] Error offering slots:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error checking availability. Let me transfer you to a specialist.</Say>
    <Redirect>/voice/rachel/transfer-specialist</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

// Handle both GET and POST for offer-slots (for redirects)
router.get('/voice/rachel/offer-slots', (req, res) => {
    // Redirect GET to POST handler
    res.redirect(307, '/voice/rachel/offer-slots');
});

/**
 * NEW FLOW: Handle slot selection via DTMF or speech
 */
router.post('/voice/rachel/select-slot', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();

        // Convert speech to digit equivalent
        let digit = digits;
        if (!digit && speechResult) {
            // Map speech to digit
            if (speechResult.includes('one') || speechResult === '1') {
                digit = '1';
            } else if (speechResult.includes('two') || speechResult === '2') {
                digit = '2';
            } else if (speechResult.includes('three') || speechResult === '3') {
                digit = '3';
            } else if (speechResult.includes('four') || speechResult.includes('more') || speechResult === '4') {
                digit = '4';
            } else if (speechResult.includes('zero') || speechResult.includes('specialist') || speechResult.includes('someone') || speechResult === '0') {
                digit = '0';
            }
        }

        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDate = req.session.appointment_date;
        const offeredSlots = req.session.offered_slots || [];
        const businessName = req.session.business_name || 'this business';

        const inputMethod = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'None';
        console.log(`🔢 [SLOT-FLOW] Slot selection: digit=${digit} (${inputMethod}), offered=${offeredSlots.join(',')}`);

        const escapedName = (prospectName || 'there')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        let twiml;

        if (digit === '0') {
            // Transfer to specialist
            console.log(`📞 [SLOT-FLOW] User requested specialist transfer`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>/voice/rachel/transfer-specialist</Redirect>
</Response>`;
        } else if (digit === '4' && req.session.has_more_slots) {
            // Show more slots
            console.log(`➡️ [SLOT-FLOW] User requested more slots`);
            req.session.slot_offset = (req.session.slot_offset || 0) + 3;
            await new Promise((resolve, reject) => {
                req.session.save((err) => err ? reject(err) : resolve());
            });
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>/voice/rachel/offer-slots</Redirect>
</Response>`;
        } else if (['1', '2', '3'].includes(digit)) {
            const slotIndex = parseInt(digit) - 1;
            const selectedTime = offeredSlots[slotIndex];

            if (!selectedTime) {
                console.log(`❌ [SLOT-FLOW] Invalid slot index ${slotIndex}`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, that option is not available. Let me repeat the times.</Say>
    <Redirect>/voice/rachel/offer-slots</Redirect>
</Response>`;
            } else {
                console.log(`✅ [SLOT-FLOW] User selected slot: ${selectedTime}`);

                // Store selected time in session
                req.session.appointment_time = selectedTime;
                req.session.appointment_datetime = `${appointmentDate} at ${selectedTime}`;

                await new Promise((resolve, reject) => {
                    req.session.save((err) => err ? reject(err) : resolve());
                });

                // Format time for confirmation
                const formatTimeForSpeech = (timeStr) => {
                    const [hours, minutes] = timeStr.split(':');
                    let hour = parseInt(hours);
                    const isPM = hour >= 12;
                    if (hour > 12) hour -= 12;
                    if (hour === 0) hour = 12;
                    const period = isPM ? 'PM' : 'AM';
                    return minutes === '00' ? `${hour} ${period}` : `${hour}:${minutes} ${period}`;
                };

                const timeForSpeech = formatTimeForSpeech(selectedTime);
                const moment = require('moment-timezone');
                const dateForSpeech = moment(appointmentDate).format('dddd, MMMM Do');

                // CORRECT FLOW: Phone already collected, go directly to book-appointment
                console.log(`📞 [SLOT-FLOW] Phone already collected: ${prospectPhone}, proceeding to booking`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Perfect! You've selected ${timeForSpeech} on ${dateForSpeech}. Please hold while I confirm your appointment.</Say>
    <Redirect>/voice/rachel/book-appointment</Redirect>
</Response>`;
            }
        } else {
            // Invalid or unrecognized input - retry with context
            const inputInfo = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'None';
            console.log(`❓ [SLOT-FLOW] Unclear input: ${digit || 'none'} (${inputInfo}) - retrying`);

            // Build context params for retry
            const retryContextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;
            const xmlRetryParams = retryContextParams.replace(/&/g, '&amp;');

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I didn't quite catch that. Let me repeat your options.</Say>
    <Redirect>/voice/rachel/offer-slots?${xmlRetryParams}</Redirect>
</Response>`;
        }

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('[SLOT-FLOW] Error selecting slot:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error. Let me transfer you to a specialist.</Say>
    <Redirect>/voice/rachel/transfer-specialist</Redirect>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Transfer to specialist when no slots work or user requests it
 */
router.post('/voice/rachel/transfer-specialist', async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';

        console.log(`📞 [SLOT-FLOW] Transferring to specialist for client ${clientId}`);

        // Get client's transfer number from database
        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        let twiml;

        if (client && client.business_phone) {
            // Transfer to the client's business phone
            console.log(`📞 [SLOT-FLOW] Transferring to ${client.business_phone}`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Please hold while I transfer you to a scheduling specialist.</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number || ''}">
        <Number>${client.business_phone}</Number>
    </Dial>
    <Say voice="Polly.Joanna">I'm sorry, the transfer was unsuccessful. Please call back during business hours or leave a voicemail.</Say>
    <Redirect>/voice/rachel/voicemail</Redirect>
</Response>`;
        } else {
            // No business phone configured - offer voicemail
            console.log(`⚠️ [SLOT-FLOW] No business_phone for client ${clientId}, offering voicemail`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, our scheduling specialists are not available right now. Would you like to leave a voicemail and we'll call you back?</Say>
    <Redirect>/voice/rachel/voicemail</Redirect>
</Response>`;
        }

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('[SLOT-FLOW] Error transferring to specialist:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error. Please call back later. Thank you.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

// Handle GET for transfer-specialist (for redirects)
router.get('/voice/rachel/transfer-specialist', (req, res) => {
    res.redirect(307, '/voice/rachel/transfer-specialist');
});

/**
 * Collect date/time for appointment booking (English)
 * LEGACY: Kept for backwards compatibility, but new flow uses collect-date -> offer-slots
 */
router.post('/voice/rachel/collect-datetime', async (req, res) => {
    try {
        const datetime = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'this business';

        console.log(`📅 DateTime collected for client ${clientId}: ${datetime}`);
        console.log(`📝 Prospect info: ${prospectName} (${prospectPhone})`);

        // Store datetime in session
        req.session.appointment_datetime = datetime;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error in collect-datetime:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved with datetime');
                    resolve();
                }
            });
        });

        // Generate confirmation prompt with Rachel's premium voice
        const confirmPrompt = `Perfect ${prospectName || 'there'}. <break time="0.5s"/> Let me confirm your appointment for ${datetime}. <break time="0.5s"/> Please hold while I check availability.`;
        console.log(`🎙️ Generating Rachel premium voice for appointment confirmation`);

        const audioUrl = await rachelService.generateRachelAudio(confirmPrompt);

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>${audioUrl}</Play>
    <Redirect>/voice/rachel/book-appointment</Redirect>
</Response>`;
            console.log('📤 Sending TwiML from collect-datetime with Rachel premium voice');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const escapedName = (prospectName || 'there')
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

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Perfect ${escapedName}. Let me confirm your appointment for ${escapedDateTime}. Please hold while I check availability.</Say>
    <Redirect>/voice/rachel/book-appointment</Redirect>
</Response>`;
            console.log('📤 Sending TwiML from collect-datetime (fallback to Polly)');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        }

    } catch (error) {
        console.error('Error collecting datetime:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);
    }
});

/**
 * Book appointment endpoint - CRM-AWARE booking
 * Routes to HubSpot, GHL, Vagaro, or local calendar based on client config
 *
 * KEY PRINCIPLE: Uses same booking logic as WhatsApp (unifiedBookingService)
 * Handle both GET (from redirects) and POST
 *
 * NEW FLOW: Date and time come from session (pre-selected via offer-slots)
 * - appointment_date: YYYY-MM-DD format
 * - appointment_time: HH:mm format (already validated as available)
 */
const handleBookAppointment = async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'this business';

        // Import unified booking service (same as WhatsApp uses)
        const unifiedBookingService = require('../services/unifiedBookingService');
        const moment = require('moment-timezone');

        let appointmentDate, appointmentTime;

        // NEW FLOW: Check if date/time were pre-selected via slot selection
        if (req.session.appointment_date && req.session.appointment_time) {
            // New flow - time was pre-validated via offer-slots
            appointmentDate = req.session.appointment_date;
            appointmentTime = req.session.appointment_time;
            console.log(`📅 [RACHEL-CRM-BOOKING] Using pre-selected slot: ${appointmentDate} ${appointmentTime}`);
        } else {
            // Legacy flow - parse from appointment_datetime string
            const appointmentDateTime = req.session.appointment_datetime || 'tomorrow at 2pm';
            console.log(`📅 [RACHEL-CRM-BOOKING] Parsing datetime from: "${appointmentDateTime}"`);

            const now = moment().tz('America/New_York');
            let parsedDateTime = now.clone();

            if (appointmentDateTime.toLowerCase().includes('tomorrow')) {
                parsedDateTime.add(1, 'day');
            } else if (appointmentDateTime.toLowerCase().includes('today')) {
                // Keep as today
            } else {
                parsedDateTime = moment(appointmentDateTime, ['MMMM Do [at] ha', 'MMMM D [at] ha', 'MMM D [at] ha']);
                if (!parsedDateTime.isValid()) {
                    parsedDateTime = now.clone().add(1, 'day');
                }
            }

            const timeMatch = appointmentDateTime.match(/(\d{1,2})\s*(?:a\.?m\.?|p\.?m\.?)/i);
            if (timeMatch) {
                let hour = parseInt(timeMatch[0].match(/\d{1,2}/)[0]);
                const isPM = /p\.?m\.?/i.test(timeMatch[0]);
                const isAM = /a\.?m\.?/i.test(timeMatch[0]);

                if (isPM && hour !== 12) hour += 12;
                else if (isAM && hour === 12) hour = 0;

                parsedDateTime.hour(hour).minute(0).second(0);
            } else {
                parsedDateTime.hour(14).minute(0).second(0);
            }

            appointmentDate = parsedDateTime.format('YYYY-MM-DD');
            appointmentTime = parsedDateTime.format('HH:mm');
        }

        console.log(`📅 [RACHEL-CRM-BOOKING] Booking: client=${clientId}, ${prospectName} (${prospectPhone}) at ${appointmentDate} ${appointmentTime}`);

        // Validate required data
        if (!clientId) {
            throw new Error('Missing clientId - cannot create appointment');
        }

        // For the new flow, we skip availability check since slot was pre-validated
        // For legacy flow, we still check availability
        const isPreValidated = !!(req.session.appointment_date && req.session.appointment_time);

        if (!isPreValidated) {
            // Legacy flow - check availability
            console.log(`🔍 [RACHEL-CRM-BOOKING] Checking availability (legacy flow)...`);
            const availabilityResult = await unifiedBookingService.getAvailableSlots(clientId, appointmentDate);

            const isSlotAvailable = availabilityResult.slots?.some(slot => {
                const slotTime = slot.time24 || slot.startTime?.substring(11, 16);
                return slotTime === appointmentTime;
            });

            if (!isSlotAvailable && availabilityResult.slots?.length > 0) {
                console.log(`⚠️ [RACHEL-CRM-BOOKING] Slot not available, redirecting to offer-slots`);

                // Store date and redirect to new flow
                req.session.appointment_date = appointmentDate;
                req.session.slot_offset = 0;
                await new Promise((resolve, reject) => {
                    req.session.save((err) => err ? reject(err) : resolve());
                });

                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, that time is not available. Let me show you our available times.</Say>
    <Redirect>/voice/rachel/offer-slots</Redirect>
</Response>`;
                res.set('Content-Type', 'text/xml; charset=utf-8');
                return res.send(twiml);
            }
        }

        // ============= BOOK VIA UNIFIED SERVICE =============

        const bookingResult = await unifiedBookingService.bookAppointment(clientId, {
            customerName: prospectName || 'Unknown',
            customerPhone: prospectPhone || '',
            customerEmail: null,
            date: appointmentDate,
            time: appointmentTime,
            service: 'Voice Booking',
            notes: `Booked via Rachel voice assistant`,
            source: 'voice_booking'
        });

        console.log(`📋 [RACHEL-CRM-BOOKING] Booking result:`, JSON.stringify(bookingResult, null, 2));

        if (!bookingResult.success) {
            // Booking failed
            console.error(`❌ [RACHEL-CRM-BOOKING] Booking failed: ${bookingResult.error}`);

            const escapedName = (prospectName || 'there')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            let errorTwiml;
            if (bookingResult.slotConflict) {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot was just booked by someone else. Please call back to schedule a different time. Thank you.</Say>
    <Hangup/>
</Response>`;
            } else {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, there was an error booking your appointment. Please call back or visit our website to schedule. Thank you for your patience.</Say>
    <Hangup/>
</Response>`;
            }

            console.log('📤 Sending ERROR TwiML - booking failed');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            return res.send(errorTwiml);
        }

        // ============= BOOKING SUCCESS =============
        const confirmationCode = bookingResult.confirmationCode;
        const crmSystem = bookingResult.system;

        console.log(`✅✅✅ [RACHEL-CRM-BOOKING] APPOINTMENT CREATED SUCCESSFULLY! ✅✅✅`);
        console.log(`   🏢 Client: ${clientId}`);
        console.log(`   👤 Customer: ${prospectName} (${prospectPhone})`);
        console.log(`   📅 DateTime: ${appointmentDate} ${appointmentTime}`);
        console.log(`   🔑 Confirmation: ${confirmationCode}`);
        console.log(`   📍 CRM System: ${crmSystem}`);
        if (bookingResult.meetingId) console.log(`   🔗 HubSpot Meeting: ${bookingResult.meetingId}`);
        if (bookingResult.vagaroAppointmentId) console.log(`   🔗 Vagaro Appointment: ${bookingResult.vagaroAppointmentId}`);

        // Send SMS confirmation
        try {
            const { Client } = require('../models');
            const client = await Client.findByPk(clientId);

            if (client && client.ringlypro_number && prospectPhone) {
                console.log(`📱 Sending SMS confirmation to ${prospectPhone}`);

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
                    console.log(`✅ SMS confirmation sent! SID: ${smsResult.messageSid}`);
                } else {
                    console.error(`❌ SMS failed: ${smsResult.error}`);
                }
            } else {
                console.warn(`⚠️ Cannot send SMS - missing phone or RinglyPro number`);
            }
        } catch (smsError) {
            console.error(`❌ Error sending SMS notification:`, smsError);
            // Don't fail the appointment if SMS fails
        }

        // Generate success confirmation with Rachel's premium voice
        const crmName = crmSystem === 'hubspot' ? 'HubSpot' :
                       crmSystem === 'ghl' ? 'GoHighLevel' :
                       crmSystem === 'vagaro' ? 'Vagaro' : 'our system';

        // Format date and time for speech (moment already imported above)
        const dateForSpeech = moment(appointmentDate).format('dddd, MMMM Do');
        const formatTimeForSpeech = (timeStr) => {
            const [hours, minutes] = timeStr.split(':');
            let hour = parseInt(hours);
            const isPM = hour >= 12;
            if (hour > 12) hour -= 12;
            if (hour === 0) hour = 12;
            const period = isPM ? 'PM' : 'AM';
            return minutes === '00' ? `${hour} ${period}` : `${hour}:${minutes} ${period}`;
        };
        const timeForSpeech = formatTimeForSpeech(appointmentTime);
        const appointmentDateTimeForSpeech = `${dateForSpeech} at ${timeForSpeech}`;

        // Check if client requires deposits - use pending deposit message
        // Client 32 always gets deposit message (legacy), other clients check deposit_required setting
        const requiresDeposit = (clientId == 32) || (client && client.deposit_required);

        let successMessage;
        if (requiresDeposit) {
            // Custom message for clients requiring deposits - pending deposit flow
            successMessage = `Great news ${prospectName || 'there'}. <break time="0.5s"/> I've entered your appointment with ${businessName || 'this business'} for ${appointmentDateTimeForSpeech}. <break time="0.5s"/> Your appointment is currently pending an initial deposit. <break time="0.5s"/> A specialist will contact you shortly to provide further assistance and complete the process. <break time="0.5s"/> Thank you for calling, and we look forward to seeing you.`;
            console.log(`🎙️ Client ${clientId} - Using deposit pending message (deposit_required=${client?.deposit_required || 'legacy client 32'})`);
        } else {
            // Standard message for clients without deposit requirement
            successMessage = `Great news ${prospectName || 'there'}. <break time="0.5s"/> I've successfully booked your appointment with ${businessName || 'this business'} for ${appointmentDateTimeForSpeech}. <break time="0.5s"/> Your confirmation code is ${confirmationCode}. <break time="0.5s"/> You'll receive a text message confirmation shortly with all the details. <break time="0.5s"/> Thank you for calling and we look forward to seeing you.`;
        }
        console.log(`🎙️ Generating Rachel premium voice for success confirmation`);
        console.log(`📍 Appointment synced to: ${crmName}`);

        const audioUrl = await rachelService.generateRachelAudio(successMessage);

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>${audioUrl}</Play>
    <Hangup/>
</Response>`;
            console.log('📤 Sending SUCCESS TwiML with Rachel premium voice - appointment created');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const escapedName = (prospectName || 'there')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            const escapedBusiness = (businessName || 'this business')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            const escapedDateTime = appointmentDateTimeForSpeech
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            // Use deposit pending message for clients with deposit_required, standard message otherwise
            let pollyMessage;
            if (requiresDeposit) {
                pollyMessage = `Great news ${escapedName}. I've entered your appointment with ${escapedBusiness} for ${escapedDateTime}. Your appointment is currently pending an initial deposit. A specialist will contact you shortly to provide further assistance and complete the process. Thank you for calling, and we look forward to seeing you.`;
            } else {
                pollyMessage = `Great news ${escapedName}. I've successfully booked your appointment with ${escapedBusiness} for ${escapedDateTime}. Your confirmation code is ${confirmationCode}. You'll receive a text message confirmation shortly with all the details. Thank you for calling and we look forward to seeing you.`;
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">${pollyMessage}</Say>
    <Hangup/>
</Response>`;
            console.log('📤 Sending SUCCESS TwiML (fallback to Polly) - appointment created');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        }

    } catch (error) {
        console.error('[RACHEL-CRM-BOOKING] Error booking appointment:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error booking your appointment. Please call back or visit our website to schedule.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/rachel/book-appointment', handleBookAppointment);
router.get('/voice/rachel/book-appointment', handleBookAppointment);

/**
 * Handle pricing response
 */
router.post('/voice/rachel/handle-pricing-response', async (req, res) => {
    try {
        const response = req.body.SpeechResult || '';
        const businessName = req.session.business_name || 'this business';
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for your interest. I'll connect you with ${businessName}'s pricing specialist who can provide detailed information about our services and costs. Please hold while I transfer your call.</Say>
                <Say voice="Polly.Joanna">Transfer functionality is not configured yet. Please visit our website or call back later for pricing information.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
        
    } catch (error) {
        console.error('Error handling pricing response:', error);
        
        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please call back later.</Say>
                <Hangup/>
            </Response>
        `;
        
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Language selection handler
 */
router.post('/voice/rachel/select-language', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();

        // Determine language from DTMF or speech input
        let selectedLanguage = null;

        // Check DTMF first
        if (digits === '1') {
            selectedLanguage = 'en';
        } else if (digits === '2') {
            selectedLanguage = 'es';
        }

        // Check speech input if no DTMF
        if (!selectedLanguage && speechResult) {
            // English keywords
            const englishKeywords = ['english', 'inglés', 'ingles', 'one', '1'];
            // Spanish keywords
            const spanishKeywords = ['spanish', 'español', 'espanol', 'two', 'dos', '2'];

            if (englishKeywords.some(keyword => speechResult.includes(keyword))) {
                selectedLanguage = 'en';
            } else if (spanishKeywords.some(keyword => speechResult.includes(keyword))) {
                selectedLanguage = 'es';
            }
        }

        // Default to English if no valid selection
        if (!selectedLanguage) {
            selectedLanguage = 'en';
        }

        const languageLabel = selectedLanguage === 'en' ? 'English' : 'Spanish';
        const inputMethod = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'Default';
        console.log(`🌍 Language selected: ${languageLabel} (${inputMethod})`);

        // Restore context from query params (Twilio doesn't preserve sessions between webhooks)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        if (clientIdFromQuery) {
            const parsedClientId = parseInt(clientIdFromQuery, 10);
            if (!isNaN(parsedClientId)) {
                req.session.client_id = parsedClientId;
                console.log(`🔄 Restored client_id from query: ${parsedClientId}`);
            }
        }
        if (businessNameFromQuery) {
            req.session.business_name = decodeURIComponent(businessNameFromQuery);
            console.log(`🔄 Restored business_name from query: ${req.session.business_name}`);
        }

        // Store language preference in session
        req.session.language = selectedLanguage;

        // ============= DEDUCT TOKEN FOR LINA AI CALL =============
        // Deduct 1 token when user selects a language (call is being handled)
        const userId = req.session.user_id;
        if (userId && !req.session.tokens_deducted) {
            try {
                const tokenService = require('../services/tokenService');
                await tokenService.deductTokens(userId, 'lina_ai_receptionist', {
                    call_sid: req.session.call_sid,
                    caller_number: req.session.caller_number,
                    language: req.session.language,
                    business_name: req.session.business_name
                });
                req.session.tokens_deducted = true;
                console.log(`✅ Deducted 1 token from user ${userId} for Lina AI call`);
            } catch (tokenError) {
                console.error(`❌ Failed to deduct token for user ${userId}:`, tokenError.message);
                // Don't block the call if token deduction fails
            }
        }

        // Save session before redirecting to ensure persistence across language switch
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Error saving session before language redirect:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved before language redirect');
                    resolve();
                }
            });
        });

        // Build context params for any redirects/callbacks
        const clientId = req.session.client_id;
        const businessName = req.session.business_name || '';
        const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}`;

        if (selectedLanguage === 'en') {
            // English - Continue with Rachel (include context params for safety)
            res.redirect(307, `/voice/rachel/incoming?lang=en&${contextParams}`);
        } else if (selectedLanguage === 'es') {
            // Spanish - Redirect to Ana flow (new Spanish agent, mirrors Rachel exactly)
            // All context via query params - NO session dependency
            console.log('🇪🇸 Spanish selected - redirecting to Ana flow');

            const userId = req.session.user_id || '';
            const spanishBusinessName = businessName || 'nuestra empresa';
            const spanishContextParams = `client_id=${clientId}&business_name=${encodeURIComponent(spanishBusinessName)}&user_id=${userId}`;

            if (!clientId) {
                console.error("❌ No client context for Spanish");
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">La sesion ha expirado. Por favor, llame de nuevo.</Say>
    <Hangup/>
</Response>`;
                res.type('text/xml');
                return res.send(twiml);
            }

            // Use TwiML Redirect to Ana Spanish flow
            // IMPORTANT: Twilio requires absolute URL for reliable redirects
            // IMPORTANT: Must escape & as &amp; for valid XML
            const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com';
            const absoluteRedirectUrl = `${baseUrl}/voice/ana/greeting?${spanishContextParams}`;
            // Escape & for XML (query string separators)
            const xmlSafeUrl = absoluteRedirectUrl.replace(/&/g, '&amp;');

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect method="POST">${xmlSafeUrl}</Redirect>
</Response>`;

            console.log(`✅ Redirecting to Ana: ${absoluteRedirectUrl}`);
            res.type('text/xml');
            return res.send(twiml);
        } else {
            // Fallback - default to English (shouldn't reach here with new logic)
            console.warn(`⚠️ Unexpected language selection fallback, defaulting to English`);
            res.redirect(307, `/voice/rachel/incoming?lang=en&${contextParams}`);
        }

    } catch (error) {
        console.error('Error handling language selection:', error);

        // Try to preserve context even in error case
        const errorClientId = req.query.client_id || req.session?.client_id || '';
        const errorBusinessName = req.query.business_name || req.session?.business_name || '';
        const errorContextParams = `client_id=${errorClientId}&business_name=${encodeURIComponent(errorBusinessName)}`;

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Continuing in English.</Say>
                <Redirect>/voice/rachel/incoming?lang=en&amp;${errorContextParams}</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Create IVR menu with dynamic options based on client configuration
 * @param {Object} client - Client database record with IVR settings
 * @param {String} language - 'en' or 'es'
 * @returns {String} TwiML response
 */
async function createIVRMenu(client, language = 'en') {
    const businessName = client.business_name;
    const ivrOptions = client.ivr_options || [];

    // Get enabled departments only
    const enabledDepts = ivrOptions.filter(dept => dept.enabled);

    // Build menu text with both keypress and voice options for hands-free use
    let menuText = '';
    // Build speech hints for recognition
    let speechHints = 'appointment, schedule, one, voicemail, message, nine';

    if (language === 'en') {
        menuText = `Hello! This is Lina from ${businessName}. I'm here to help you today. <break time="0.8s"/> `;
        menuText += `To schedule an appointment, press 1 or say appointment. <break time="0.5s"/> `;

        // Add department options (starting from 2)
        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            const numberWord = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight'][index] || digit;
            menuText += `For ${dept.name}, press ${digit} or say ${dept.name.toLowerCase()}. <break time="0.5s"/> `;
            speechHints += `, ${dept.name.toLowerCase()}, ${numberWord}`;
        });

        menuText += `Or, to leave a voicemail message, press 9 or say voicemail. `;
    } else {
        // Spanish
        menuText = `¡Hola! Habla Lina de ${businessName}. Estoy aquí para ayudarle. <break time="0.8s"/> `;
        menuText += `Para programar una cita, presione 1 o diga cita. <break time="0.5s"/> `;
        speechHints = 'cita, programar, uno, mensaje, buzón, nueve';

        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            const numberWord = ['dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'][index] || digit;
            menuText += `Para ${dept.name}, presione ${digit} o diga ${dept.name.toLowerCase()}. <break time="0.5s"/> `;
            speechHints += `, ${dept.name.toLowerCase()}, ${numberWord}`;
        });

        menuText += `O, para dejar un mensaje de voz, presione 9 o diga mensaje. `;
    }

    // For English, try to use Rachel's premium voice
    const speechLang = language === 'en' ? 'en-US' : 'es-MX';

    // Build context params for retry redirect
    const contextParams = `client_id=${client.id}&amp;business_name=${encodeURIComponent(businessName)}&amp;lang=${language}`;

    // Retry message for unclear input
    const retryMsg = language === 'en'
        ? "I didn't quite catch that. Let me repeat your options."
        : "No entendí bien. Permítame repetir las opciones.";

    if (language === 'en') {
        console.log(`🎙️ Generating Rachel premium voice for IVR menu: "${menuText.substring(0, 50)}..."`);
        const audioUrl = await rachelService.generateRachelAudio(menuText);

        if (audioUrl) {
            // Use premium Rachel voice with speech + DTMF input
            // Increased timeout to 10s and speechTimeout to 3s for noise tolerance
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/rachel/ivr-selection?lang=${language}" method="POST" speechTimeout="auto" language="${speechLang}" hints="${speechHints}">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">${retryMsg}</Say>
    <Redirect method="POST">/voice/rachel/ivr-menu?${contextParams}</Redirect>
</Response>`;
            console.log(`✅ IVR Menu created with Rachel premium voice for ${businessName}: ${enabledDepts.length} departments, URL: ${audioUrl}`);
            return twiml;
        } else {
            console.warn(`⚠️ Rachel premium voice generation FAILED for ${businessName} - falling back to Polly.Joanna`);
        }
    }

    // Fallback to standard voice (or Spanish)
    const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf speech" numDigits="1" timeout="10" action="/voice/rachel/ivr-selection?lang=${language}" method="POST" speechTimeout="auto" language="${speechLang}" hints="${speechHints}">
        <Say voice="${voice}">${menuText}</Say>
    </Gather>
    <Say voice="${voice}">${retryMsg}</Say>
    <Redirect method="POST">/voice/rachel/ivr-menu?${contextParams}</Redirect>
</Response>`;

    console.log(`📋 IVR Menu created for ${businessName} (${language}): ${enabledDepts.length} departments`);
    return twiml;
}

/**
 * IVR Menu endpoint - used for retries when input is unclear
 * Loads client from query params and generates IVR menu
 */
router.post('/voice/rachel/ivr-menu', async (req, res) => {
    try {
        const clientId = req.query.client_id;
        const language = req.query.lang || 'en';

        if (!clientId) {
            const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${language === 'en' ? 'Session expired. Please call back.' : 'La sesión ha expirado. Por favor llame de nuevo.'}</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

        if (!client) {
            const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${language === 'en' ? 'I\'m sorry, there was an error. Please call back.' : 'Lo siento, hubo un error. Por favor llame de nuevo.'}</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Generate and return IVR menu
        const twiml = await createIVRMenu(client, language);
        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error generating IVR menu:', error);
        const voice = req.query.lang === 'es' ? 'Polly.Lupe' : 'Polly.Joanna';
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">I'm sorry, there was an error. Please try calling again.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Handle IVR menu selection via DTMF or speech
 * Restores client context from query params since Twilio doesn't preserve sessions
 */
router.post('/voice/rachel/ivr-selection', async (req, res) => {
    try {
        const digits = req.body.Digits || '';
        const speechResult = (req.body.SpeechResult || '').toLowerCase().trim();
        const language = req.query.lang || 'en';

        // Restore client context from query params (Twilio doesn't preserve sessions)
        const clientIdFromQuery = req.query.client_id;
        const businessNameFromQuery = req.query.business_name;
        const userIdFromQuery = req.query.user_id;

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
        if (userIdFromQuery) {
            req.session.user_id = userIdFromQuery;
        }

        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        // Load client IVR settings early to match department names for speech
        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);
        const enabledDepts = client ? (client.ivr_options || []).filter(dept => dept.enabled) : [];

        // Convert speech to digit equivalent
        let digit = digits;
        if (!digit && speechResult) {
            // Map speech to digit based on language
            if (language === 'en') {
                // English speech recognition
                if (speechResult.includes('appointment') || speechResult.includes('schedule') || speechResult.includes('book') || speechResult === 'one' || speechResult === '1') {
                    digit = '1';
                } else if (speechResult.includes('voicemail') || speechResult.includes('message') || speechResult.includes('leave a message') || speechResult === 'nine' || speechResult === '9') {
                    digit = '9';
                } else {
                    // Check for department name matches
                    enabledDepts.forEach((dept, index) => {
                        if (speechResult.includes(dept.name.toLowerCase())) {
                            digit = String(index + 2);
                        }
                    });
                    // Check for number words
                    if (!digit) {
                        const numberMap = { 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8' };
                        Object.keys(numberMap).forEach(word => {
                            if (speechResult.includes(word)) {
                                digit = numberMap[word];
                            }
                        });
                    }
                }
            } else {
                // Spanish speech recognition
                if (speechResult.includes('cita') || speechResult.includes('programar') || speechResult.includes('reservar') || speechResult === 'uno' || speechResult === '1') {
                    digit = '1';
                } else if (speechResult.includes('mensaje') || speechResult.includes('buzón') || speechResult.includes('voz') || speechResult === 'nueve' || speechResult === '9') {
                    digit = '9';
                } else {
                    // Check for department name matches
                    enabledDepts.forEach((dept, index) => {
                        if (speechResult.includes(dept.name.toLowerCase())) {
                            digit = String(index + 2);
                        }
                    });
                    // Check for Spanish number words
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
        }

        const inputMethod = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'None';
        console.log(`🔢 IVR selection: ${digit} (${inputMethod}) (${language}) for client ${clientId}`);

        if (!clientId) {
            const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">Session expired. Please call back.</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Client already loaded above for speech recognition
        if (!client) {
            const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">I'm sorry, there was an error. Please call back.</Say>
    <Hangup/>
</Response>`;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Handle selection
        if (digit === '1') {
            // Appointment booking
            console.log(`📅 Appointment booking selected for ${businessName}`);

            // Generate TwiML to start appointment booking flow with premium voice
            const namePrompt = language === 'en'
                ? 'Great! I\'d be happy to help you book an appointment. <break time="0.5s"/> Can you please tell me your first name?'
                : 'Excelente! Me encantaría ayudarle a reservar una cita. ¿Puede decirme su nombre?';

            // Try to use premium voice for English (Rachel) or Spanish (Lina)
            if (language === 'en') {
                console.log(`🎙️ Generating Rachel premium voice for appointment booking prompt`);
                rachelService.generateRachelAudio(namePrompt).then(audioUrl => {
                    if (audioUrl) {
                        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/rachel/collect-name" method="POST" language="en-US">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/incoming?lang=en</Redirect>
</Response>`;
                        res.type('text/xml');
                        res.send(twiml);
                    } else {
                        // Fallback to Polly
                        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/rachel/collect-name" method="POST" language="en-US">
        <Say voice="Polly.Joanna">${namePrompt}</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/incoming?lang=en</Redirect>
</Response>`;
                        res.type('text/xml');
                        res.send(twiml);
                    }
                });
                return; // Exit early since we're handling response in promise
            } else {
                // Spanish - use Ana premium voice (ElevenLabs Bella)
                // Pass context via query params since Twilio doesn't preserve sessions
                const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;
                const xmlContextParams = contextParams.replace(/&/g, '&amp;');

                console.log(`🎙️ Generating Ana premium voice for Spanish appointment booking`);
                const AnaVoiceService = require('../services/anaVoiceService');
                const anaService = new AnaVoiceService(
                    process.env.WEBHOOK_BASE_URL || 'https://ringlypro-crm.onrender.com',
                    process.env.ELEVENLABS_API_KEY
                );

                const audioUrl = await anaService.generateAnaAudio(namePrompt);

                if (audioUrl) {
                    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/ana/collect-name?${xmlContextParams}" method="POST" language="es-MX">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${xmlContextParams}</Redirect>
</Response>`;
                    res.type('text/xml');
                    return res.send(twiml);
                } else {
                    // Fallback to Polly
                    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="auto" action="/voice/ana/collect-name?${xmlContextParams}" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">${namePrompt}</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/ana/greeting?${xmlContextParams}</Redirect>
</Response>`;
                    res.type('text/xml');
                    return res.send(twiml);
                }
            }
        } else if (digit === '9') {
            // Voicemail
            console.log(`📬 Voicemail selected for ${businessName}`);

            // Redirect to voicemail using TwiML Redirect with context params
            const contextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&user_id=${req.session.user_id || ''}`;
            const voicePath = language === 'en' ? 'rachel' : 'ana';
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect method="POST">/voice/${voicePath}/voicemail?${contextParams}</Redirect>
</Response>`;

            res.type('text/xml');
            return res.send(twiml);
        } else {
            // Check if it's a department transfer (2, 3, 4, etc.)
            const deptIndex = parseInt(digit) - 2;
            if (deptIndex >= 0 && deptIndex < enabledDepts.length) {
                const dept = enabledDepts[deptIndex];
                console.log(`📞 Transferring to ${dept.name} (${dept.phone}) for ${businessName}`);

                const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
                const transferMsg = language === 'en'
                    ? `Transferring you to ${dept.name}. Please hold.`
                    : `Transfiriéndolo a ${dept.name}. Por favor espere.`;

                // ============= IVR LOOP PREVENTION =============
                // Normalize phone numbers for comparison (remove all non-digits)
                const normalizePhone = (phone) => (phone || '').replace(/\D/g, '');
                const destPhone = normalizePhone(dept.phone);
                const didPhone = normalizePhone(client.ringlypro_number);
                const businessPhone = normalizePhone(client.business_phone);

                // Check if destination matches the client's DID (would cause infinite loop)
                const matchesDID = destPhone === didPhone ||
                                   destPhone.endsWith(didPhone) ||
                                   didPhone.endsWith(destPhone);

                // ALSO check if destination matches business_phone
                // Because business_phone has call forwarding TO the DID, so it will also loop!
                const matchesBusinessPhone = destPhone === businessPhone ||
                                              destPhone.endsWith(businessPhone) ||
                                              businessPhone.endsWith(destPhone);

                const wouldLoop = matchesDID || matchesBusinessPhone;

                let twiml;

                if (wouldLoop) {
                    // LOOP PREVENTION: Cannot forward to DID or business_phone (both would loop)
                    // Need to use owner_phone or show error
                    if (matchesDID) {
                        console.log(`⚠️ [IVR-LOOP-PREVENTION] Destination ${dept.phone} matches DID ${client.ringlypro_number}`);
                    } else {
                        console.log(`⚠️ [IVR-LOOP-PREVENTION] Destination ${dept.phone} matches business_phone ${client.business_phone} (which forwards to DID)`);
                    }

                    // Try owner_phone as fallback (personal cell that doesn't forward to DID)
                    const ownerPhone = normalizePhone(client.owner_phone);
                    const ownerMatchesDID = ownerPhone === didPhone ||
                                            ownerPhone.endsWith(didPhone) ||
                                            didPhone.endsWith(ownerPhone);
                    const ownerMatchesBusiness = ownerPhone === businessPhone ||
                                                  ownerPhone.endsWith(businessPhone) ||
                                                  businessPhone.endsWith(ownerPhone);

                    if (client.owner_phone && !ownerMatchesDID && !ownerMatchesBusiness) {
                        // Forward to owner's personal phone (bypasses the forwarding loop)
                        console.log(`✅ [IVR-LOOP-PREVENTION] Forwarding to owner_phone: ${client.owner_phone}`);
                        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${client.owner_phone}</Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;
                    } else {
                        // No safe number available - inform the caller
                        console.log(`❌ [IVR-LOOP-PREVENTION] No safe number available for client ${clientId}`);
                        console.log(`   DID: ${client.ringlypro_number}, business_phone: ${client.business_phone}, owner_phone: ${client.owner_phone}`);
                        const noForwardMsg = language === 'en'
                            ? `I'm sorry, ${dept.name} is not available at this time. Please try again later or leave a voicemail.`
                            : `Lo siento, ${dept.name} no está disponible en este momento. Por favor intente más tarde o deje un mensaje.`;

                        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${noForwardMsg}</Say>
    <Redirect method="POST">/voice/${language === 'en' ? 'rachel' : 'lina'}/voicemail</Redirect>
</Response>`;
                    }
                } else {
                    // Normal transfer - destination is different from DID
                    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${dept.phone}</Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;
                }

                res.type('text/xml');
                return res.send(twiml);
            } else {
                // Invalid or unrecognized selection - retry instead of hanging up
                const inputInfo = digits ? `DTMF: ${digits}` : speechResult ? `Speech: "${speechResult}"` : 'None';
                console.log(`⚠️ Unclear IVR selection: ${digit || 'none'} (${inputInfo}) - retrying`);

                const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
                const retryMsg = language === 'en'
                    ? "I didn't quite understand that. Let me give you the options again."
                    : "No entendí bien. Permítame repetir las opciones.";

                // Build context params for retry redirect
                const retryContextParams = `client_id=${clientId}&business_name=${encodeURIComponent(businessName)}&lang=${language}`;
                const xmlRetryParams = retryContextParams.replace(/&/g, '&amp;');

                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${retryMsg}</Say>
    <Redirect method="POST">/voice/rachel/ivr-menu?${xmlRetryParams}</Redirect>
</Response>`;

                res.type('text/xml');
                return res.send(twiml);
            }
        }

    } catch (error) {
        console.error('Error handling IVR selection:', error);
        const voice = req.query.lang === 'es' ? 'Polly.Lupe' : 'Polly.Joanna';
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">I'm sorry, there was an error. Please try calling again.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * English greeting endpoint (called after language selection)
 * Handle both GET (from redirects) and POST (from direct calls)
 */
const handleEnglishIncoming = async (req, res) => {
    try {
        console.log('📞 English language selected - Rachel continuing');

        // Get client info from session
        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        if (!clientId) {
            console.error("❌ No client context in session");
            const twiml = `
                <?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <Say voice="Polly.Joanna">Session expired. Please call back.</Say>
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
                    <Say voice="Polly.Joanna">I'm sorry, there was an error. Please call back.</Say>
                    <Hangup/>
                </Response>
            `;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Check if IVR is enabled
        if (client.ivr_enabled && client.ivr_options && client.ivr_options.length > 0) {
            console.log(`✅ IVR enabled for ${businessName} - showing menu`);
            const twiml = await createIVRMenu(client, 'en');
            res.type('text/xml');
            return res.send(twiml);
        }

        // No IVR - use original personalized greeting (speech-based appointment booking)
        console.log(`📞 No IVR for ${businessName} - using original flow`);
        const clientInfo = {
            client_id: clientId,
            business_name: businessName,
            rachel_enabled: true
        };

        const twimlResponse = await rachelService.createPersonalizedGreeting(clientInfo);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in Rachel incoming:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Please try calling again.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/rachel/incoming', handleEnglishIncoming);
router.get('/voice/rachel/incoming', handleEnglishIncoming);

/**
 * Fallback webhook endpoint
 */
router.post('/voice/rachel/webhook', async (req, res) => {
    try {
        const businessName = req.session.business_name || 'us';

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for calling ${businessName}. Have a great day!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error in fallback webhook:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">Thank you for calling. Goodbye!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Serve audio files for Rachel's voice
 */
router.get('/audio/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const audioPath = path.join('/tmp', filename);
        
        // Check if file exists
        await fs.access(audioPath);
        
        // Set appropriate headers for audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Send the audio file
        res.sendFile(audioPath);
        
        console.log(`🎵 Served audio file: ${filename}`);
        
    } catch (error) {
        console.error(`Error serving audio file ${req.params.filename}:`, error);
        res.status(404).send('Audio file not found');
    }
});

/**
 * Voicemail recording endpoint
 */
router.post('/voice/rachel/voicemail', async (req, res) => {
    try {
        console.log('📬 Voicemail requested');

        const twimlResponse = await rachelService.handleVoicemailRequest(req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in voicemail:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error with voicemail. Please try calling again.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
});

router.get('/voice/rachel/voicemail', async (req, res) => {
    try {
        console.log('📬 Voicemail requested (GET)');

        const twimlResponse = await rachelService.handleVoicemailRequest(req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in voicemail:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, there was an error with voicemail. Please try calling again.</Say>
    <Hangup/>
</Response>`;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Handle voicemail recording completion
 */
router.post('/voice/rachel/voicemail-complete', async (req, res) => {
    try {
        const {
            RecordingUrl,
            RecordingSid,
            RecordingDuration,
            CallSid
        } = req.body;

        console.log(`✅ Voicemail recording completed: ${RecordingSid}, Duration: ${RecordingDuration}s`);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you for your message. We'll get back to you soon. Goodbye!</Say>
    <Hangup/>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error handling voicemail completion:', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you. Goodbye!</Say>
    <Hangup/>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);
    }
});

/**
 * Handle voicemail transcription callback
 */
router.post('/voice/rachel/voicemail-transcription', async (req, res) => {
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

        console.log(`📝 Voicemail transcription received: ${TranscriptionSid}`);
        console.log(`Transcription: "${TranscriptionText}"`);

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

        // Summarize with Claude AI
        const ClaudeAIService = require('../services/claudeAI');
        const claudeAI = new ClaudeAIService();

        let summary;
        try {
            summary = await claudeAI.summarizeVoicemail(TranscriptionText, From, 'en');
        } catch (aiError) {
            console.error('⚠️ Claude AI summarization failed, using fallback:', aiError.message);
            summary = `Voicemail from ${From}: ${TranscriptionText}`;
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

        console.log(`💾 Voicemail stored for client ${client.id} (${client.business_name})`);
        console.log(`🎵 Recording URL: ${RecordingUrl}`);

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Error processing voicemail transcription:', error);
        res.status(200).send('OK'); // Always return 200 to Twilio
    }
});

/**
 * Test endpoint to verify client identification
 */
router.get('/voice/rachel/test-client/:number', async (req, res) => {
    try {
        const phoneNumber = req.params.number;
        const clientInfo = await rachelService.clientService.identifyClientByNumber(phoneNumber);

        if (clientInfo) {
            res.json({
                success: true,
                message: `Client found: ${clientInfo.business_name}`,
                client: clientInfo
            });
        } else {
            res.json({
                success: false,
                message: `No client found for number: ${phoneNumber}`
            });
        }

    } catch (error) {
        console.error('Error testing client identification:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing client identification',
            error: error.message
        });
    }
});

/**
 * Debug endpoint to see what TwiML the language menu generates
 * Usage: /voice/rachel/debug-language-menu/:clientId
 */
router.get('/voice/rachel/debug-language-menu/:clientId', async (req, res) => {
    try {
        const clientId = parseInt(req.params.clientId, 10);
        const { Client } = require('../models');

        const client = await Client.findByPk(clientId);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const clientInfo = {
            client_id: client.id,
            business_name: client.business_name
        };

        const twiml = await rachelService.createLanguageSelectionMenu(clientInfo);

        res.type('text/xml');
        res.send(twiml);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;