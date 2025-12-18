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
        const clientId = req.session.client_id;
        const businessName = req.session.business_name || 'this business';

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

        // Generate phone prompt with Rachel's premium voice
        const phonePrompt = `Thank you ${name}. <break time="0.5s"/> Now please say your 10 digit phone number, or enter it using your keypad.`;
        console.log(`🎙️ Generating Rachel premium voice for phone collection`);

        const audioUrl = await rachelService.generateRachelAudio(phonePrompt);

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="3" numDigits="10" action="/voice/rachel/collect-phone" method="POST" language="en-US">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name</Redirect>
</Response>`;
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="12" speechTimeout="3" numDigits="10" action="/voice/rachel/collect-phone" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Thank you ${escapedName}. Now please say your 10 digit phone number, or enter it using your keypad.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name</Redirect>
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
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';

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

        // NEW FLOW: Ask for date only, then we'll offer available time slots
        const datePrompt = `Perfect ${prospectName || 'there'}. <break time="0.5s"/> What date would you like to schedule your appointment? <break time="0.5s"/> For example, you can say tomorrow, or Friday, or December 20th.`;
        console.log(`🎙️ Generating Rachel premium voice for date collection`);

        const audioUrl = await rachelService.generateRachelAudio(datePrompt);

        if (audioUrl) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/rachel/collect-date" method="POST" language="en-US">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
</Response>`;
            console.log('📤 Sending TwiML from collect-phone with Rachel premium voice');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            res.send(twiml);
        } else {
            // Fallback to Polly
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/rachel/collect-date" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Perfect ${escapedName}. What date would you like to schedule your appointment? For example, you can say tomorrow, or Friday, or December 20th.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
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
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'this business';

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
    <Redirect>/voice/rachel/offer-slots</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('[SLOT-FLOW] Error collecting date:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry, I had trouble understanding the date. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
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
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const appointmentDate = req.session.appointment_date;
        const slotOffset = req.session.slot_offset || 0;
        const businessName = req.session.business_name || 'this business';

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
    <Gather input="speech" timeout="8" speechTimeout="3" action="/voice/rachel/collect-date" method="POST" language="en-US">
        <Say voice="Polly.Joanna">I'm sorry ${escapedName}, we don't have any available appointments for that date. Would you like to try a different date? Please tell me another date you'd prefer.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear a response. Let me transfer you to a specialist who can help.</Say>
    <Redirect>/voice/rachel/transfer-specialist</Redirect>
</Response>`;
            } else {
                // We've shown all slots and user rejected them all
                console.log(`❌ [SLOT-FLOW] No more slots to offer`);
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, those were all our available times for that day. Let me transfer you to a specialist who can check other options for you.</Say>
    <Redirect>/voice/rachel/transfer-specialist</Redirect>
</Response>`;
            }
        } else {
            // Build the slot options speech
            const slot1 = formatTimeForSpeech(offeredSlots[0]);
            const slot2 = offeredSlots[1] ? formatTimeForSpeech(offeredSlots[1]) : null;
            const slot3 = offeredSlots[2] ? formatTimeForSpeech(offeredSlots[2]) : null;

            let optionsSpeech = `For ${slot1}, press 1. `;
            if (slot2) optionsSpeech += `For ${slot2}, press 2. `;
            if (slot3) optionsSpeech += `For ${slot3}, press 3. `;

            // Add option to hear more slots or transfer
            if (req.session.has_more_slots) {
                optionsSpeech += `To hear more times, press 4. `;
            }
            optionsSpeech += `Or press 0 to speak with a specialist.`;

            console.log(`🎙️ [SLOT-FLOW] Offering: ${offeredSlots.join(', ')}`);

            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf" numDigits="1" timeout="10" action="/voice/rachel/select-slot" method="POST">
        <Say voice="Polly.Joanna">${escapedName}, I have the following times available. ${optionsSpeech}</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't receive a selection. Let me repeat the options.</Say>
    <Redirect>/voice/rachel/offer-slots</Redirect>
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
 * NEW FLOW: Handle slot selection via DTMF
 */
router.post('/voice/rachel/select-slot', async (req, res) => {
    try {
        const digit = req.body.Digits || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDate = req.session.appointment_date;
        const offeredSlots = req.session.offered_slots || [];
        const businessName = req.session.business_name || 'this business';

        console.log(`🔢 [SLOT-FLOW] Slot selection: digit=${digit}, offered=${offeredSlots.join(',')}`);

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

                // Proceed directly to booking
                twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Perfect! You've selected ${timeForSpeech} on ${dateForSpeech}. Please hold while I confirm your booking.</Say>
    <Redirect>/voice/rachel/book-appointment</Redirect>
</Response>`;
            }
        } else {
            // Invalid input
            console.log(`❓ [SLOT-FLOW] Invalid digit: ${digit}`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I didn't understand that selection. Let me repeat the options.</Say>
    <Redirect>/voice/rachel/offer-slots</Redirect>
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
 * NEW FLOW: Transfer to specialist when no slots work
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

        if (client && client.forward_number) {
            // Transfer to the business's forwarding number
            console.log(`📞 [SLOT-FLOW] Transferring to ${client.forward_number}`);
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Please hold while I transfer you to a scheduling specialist.</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number || ''}">
        <Number>${client.forward_number}</Number>
    </Dial>
    <Say voice="Polly.Joanna">I'm sorry, the transfer was unsuccessful. Please call back during business hours or leave a voicemail.</Say>
    <Redirect>/voice/rachel/voicemail</Redirect>
</Response>`;
        } else {
            // No transfer number - offer voicemail
            console.log(`⚠️ [SLOT-FLOW] No transfer number for client ${clientId}, offering voicemail`);
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

        const successMessage = `Great news ${prospectName || 'there'}. <break time="0.5s"/> I've successfully booked your appointment with ${businessName || 'this business'} for ${appointmentDateTime}. <break time="0.5s"/> Your confirmation code is ${confirmationCode}. <break time="0.5s"/> You'll receive a text message confirmation shortly with all the details. <break time="0.5s"/> Thank you for calling and we look forward to seeing you.`;
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
            const escapedDateTime = appointmentDateTime
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Great news ${escapedName}. I've successfully booked your appointment with ${escapedBusiness} for ${escapedDateTime}. Your confirmation code is ${confirmationCode}. You'll receive a text message confirmation shortly with all the details. Thank you for calling and we look forward to seeing you.</Say>
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
        console.log(`🌍 Language selected: ${digits === '1' ? 'English' : digits === '2' ? 'Spanish' : 'Unknown'}`);

        // Store language preference in session
        req.session.language = digits === '1' ? 'en' : digits === '2' ? 'es' : 'en';

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

        if (digits === '1') {
            // English - Continue with Rachel
            res.redirect(307, '/voice/rachel/incoming?lang=en');
        } else if (digits === '2') {
            // Spanish - Route to Lina
            res.redirect(307, '/voice/lina/incoming?lang=es');
        } else {
            // Invalid input - default to English
            console.warn(`⚠️ Invalid language selection: ${digits}, defaulting to English`);
            res.redirect(307, '/voice/rachel/incoming?lang=en');
        }

    } catch (error) {
        console.error('Error handling language selection:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">I'm sorry, there was an error. Continuing in English.</Say>
                <Redirect>/voice/rachel/incoming?lang=en</Redirect>
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

    // Build menu text
    let menuText = '';
    if (language === 'en') {
        menuText = `Hello! This is Lina from ${businessName}. I'm here to help you today. <break time="0.8s"/> `;
        menuText += `To schedule an appointment, please press 1. <break time="0.5s"/> `;

        // Add department options (starting from 2)
        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            menuText += `For ${dept.name}, press ${digit}. <break time="0.5s"/> `;
        });

        menuText += `Or, to leave a voicemail message, press 9. `;
    } else {
        // Spanish
        menuText = `¡Hola! Habla Lina de ${businessName}. Estoy aquí para ayudarle. <break time="0.8s"/> `;
        menuText += `Para programar una cita, presione 1. <break time="0.5s"/> `;

        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            menuText += `Para ${dept.name}, presione ${digit}. <break time="0.5s"/> `;
        });

        menuText += `O, para dejar un mensaje de voz, presione 9. `;
    }

    // For English, try to use Rachel's premium voice
    if (language === 'en') {
        console.log(`🎙️ Generating Rachel premium voice for IVR menu: "${menuText.substring(0, 50)}..."`);
        const audioUrl = await rachelService.generateRachelAudio(menuText);

        if (audioUrl) {
            // Use premium Rachel voice
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf" numDigits="1" timeout="8" action="/voice/rachel/ivr-selection?lang=${language}" method="POST">
        <Play>${audioUrl}</Play>
    </Gather>
    <Say voice="Polly.Joanna">I didn't receive a selection. Goodbye.</Say>
    <Hangup/>
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
    <Gather input="dtmf" numDigits="1" timeout="8" action="/voice/rachel/ivr-selection?lang=${language}" method="POST">
        <Say voice="${voice}">${menuText}</Say>
    </Gather>
    <Say voice="${voice}">I didn't receive a selection. Goodbye.</Say>
    <Hangup/>
</Response>`;

    console.log(`📋 IVR Menu created for ${businessName} (${language}): ${enabledDepts.length} departments`);
    return twiml;
}

/**
 * Handle IVR menu selection
 */
router.post('/voice/rachel/ivr-selection', async (req, res) => {
    try {
        const digit = req.body.Digits || '';
        const language = req.query.lang || 'en';
        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        console.log(`🔢 IVR selection: ${digit} (${language}) for client ${clientId}`);

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

        // Load client IVR settings
        const { Client } = require('../models');
        const client = await Client.findByPk(clientId);

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

        const enabledDepts = (client.ivr_options || []).filter(dept => dept.enabled);

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
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/rachel/collect-name" method="POST" language="en-US">
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
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/rachel/collect-name" method="POST" language="en-US">
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
                // Spanish - use Polly.Lupe for now (or can add Lina premium voice)
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="12" speechTimeout="3" action="/voice/lina/collect-name" method="POST" language="es-MX">
        <Say voice="Polly.Lupe">${namePrompt}</Say>
    </Gather>
    <Say voice="Polly.Lupe">No escuché eso. Intentemos de nuevo.</Say>
    <Redirect>/voice/lina/incoming?lang=es</Redirect>
</Response>`;
                res.type('text/xml');
                return res.send(twiml);
            }
        } else if (digit === '9') {
            // Voicemail
            console.log(`📬 Voicemail selected for ${businessName}`);

            // Redirect to voicemail using TwiML Redirect
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect method="POST">/voice/${language === 'en' ? 'rachel' : 'lina'}/voicemail</Redirect>
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

                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${transferMsg}</Say>
    <Dial timeout="30" callerId="${client.ringlypro_number}">
        <Number>${dept.phone}</Number>
    </Dial>
    <Say voice="${voice}">The transfer failed. Please try again later. Goodbye.</Say>
    <Hangup/>
</Response>`;

                res.type('text/xml');
                return res.send(twiml);
            } else {
                // Invalid selection
                console.log(`❌ Invalid IVR selection: ${digit}`);
                const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';
                const errorMsg = language === 'en'
                    ? 'Invalid selection. Goodbye.'
                    : 'Selección inválida. Adiós.';

                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voice}">${errorMsg}</Say>
    <Hangup/>
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

module.exports = router;