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

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech dtmf" timeout="10" speechTimeout="5" numDigits="10" action="/voice/rachel/collect-phone" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Thank you ${escapedName}. Now please say your 10 digit phone number, or enter it using your keypad.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-name</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

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
        const escapedPhone = normalizedPhone
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

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/rachel/collect-datetime" method="POST" language="en-US">
        <Say voice="Polly.Joanna">Perfect ${escapedName}. Now tell me what date and time you prefer for your appointment. For example you can say tomorrow at 10 AM or Friday at 2 PM</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't catch that. Let me try again.</Say>
    <Redirect>/voice/rachel/collect-phone</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-phone (English):', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

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
 * Collect date/time for appointment booking (English)
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

        // Escape XML special characters
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

        console.log('📤 Sending TwiML from collect-datetime (English)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

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
 * Book appointment endpoint - would integrate with appointment booking system
 * Handle both GET (from redirects) and POST
 */
const handleBookAppointment = async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const appointmentDateTime = req.session.appointment_datetime || 'the requested time';
        const businessName = req.session.business_name || 'this business';

        console.log(`📅 Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone}) at ${appointmentDateTime}`);

        // Parse date and time from appointmentDateTime
        // Expected format: "tomorrow at 2pm" or "November 10th at 3pm"
        const { Appointment } = require('../models');
        const moment = require('moment-timezone');

        let appointmentDate, appointmentTime;
        let confirmationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        try {
            // Parse the date/time - handle common formats
            const now = moment().tz('America/New_York');
            let parsedDateTime = now.clone();

            if (appointmentDateTime.toLowerCase().includes('tomorrow')) {
                parsedDateTime.add(1, 'day');
            } else if (appointmentDateTime.toLowerCase().includes('today')) {
                // Keep as today
            } else {
                // Try to parse actual date
                parsedDateTime = moment(appointmentDateTime, ['MMMM Do [at] ha', 'MMMM D [at] ha', 'MMM D [at] ha']);
                if (!parsedDateTime.isValid()) {
                    // Default to tomorrow if can't parse
                    parsedDateTime = now.clone().add(1, 'day');
                }
            }

            // Extract time
            const timeMatch = appointmentDateTime.match(/(\d{1,2})\s*(am|pm)/i);
            if (timeMatch) {
                let hour = parseInt(timeMatch[1]);
                const isPM = timeMatch[2].toLowerCase() === 'pm';
                if (isPM && hour !== 12) hour += 12;
                if (!isPM && hour === 12) hour = 0;
                parsedDateTime.hour(hour).minute(0).second(0);
            } else {
                // Default to 2pm
                parsedDateTime.hour(14).minute(0).second(0);
            }

            appointmentDate = parsedDateTime.format('YYYY-MM-DD');
            appointmentTime = parsedDateTime.format('HH:mm:ss');

            console.log(`📆 Parsed appointment: date=${appointmentDate}, time=${appointmentTime}`);

            // Validate required data
            if (!clientId) {
                throw new Error('Missing clientId - cannot create appointment');
            }

            // ============= CHECK AVAILABILITY FIRST =============
            const { Op } = require('sequelize');
            const existingAppointment = await Appointment.findOne({
                where: {
                    clientId: clientId,
                    appointmentDate: appointmentDate,
                    appointmentTime: appointmentTime,
                    status: {
                        [Op.in]: ['confirmed', 'pending', 'scheduled']
                    }
                }
            });

            if (existingAppointment) {
                console.log(`⚠️ Time slot ${appointmentDate} ${appointmentTime} already booked!`);

                // Find available slots for the same day
                const bookedAppointments = await Appointment.findAll({
                    where: {
                        clientId: clientId,
                        appointmentDate: appointmentDate,
                        status: {
                            [Op.in]: ['confirmed', 'pending', 'scheduled']
                        }
                    },
                    attributes: ['appointmentTime'],
                    order: [['appointmentTime', 'ASC']]
                });

                const bookedTimes = bookedAppointments.map(apt => apt.appointmentTime);
                console.log(`📋 Booked times for ${appointmentDate}:`, bookedTimes);

                // Business hours - typical slots (9am-5pm, 30-min intervals)
                const allSlots = [
                    '09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00',
                    '12:00:00', '12:30:00', '13:00:00', '13:30:00', '14:00:00', '14:30:00',
                    '15:00:00', '15:30:00', '16:00:00', '16:30:00', '17:00:00'
                ];

                const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
                console.log(`✅ Available slots for ${appointmentDate}:`, availableSlots);

                const escapedName = (prospectName || 'friend')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');

                let errorTwiml;

                if (availableSlots.length > 0) {
                    // Format first 3 available slots for speech
                    const formatTimeForSpeech = (timeStr) => {
                        const [hours, minutes] = timeStr.split(':');
                        let hour = parseInt(hours);
                        const isPM = hour >= 12;
                        if (hour > 12) hour -= 12;
                        if (hour === 0) hour = 12;
                        const period = isPM ? 'PM' : 'AM';

                        if (minutes === '00') {
                            return `${hour} ${period}`;
                        } else {
                            return `${hour}:${minutes} ${period}`;
                        }
                    };

                    const suggestions = availableSlots.slice(0, 3).map(formatTimeForSpeech);
                    const suggestionText = suggestions.length === 1
                        ? suggestions[0]
                        : suggestions.length === 2
                        ? `${suggestions[0]} or ${suggestions[1]}`
                        : `${suggestions[0]}, ${suggestions[1]}, or ${suggestions[2]}`;

                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot is already booked. We have availability at ${suggestionText}. Please call back to schedule one of these times. Thank you.</Say>
    <Hangup/>
</Response>`;
                } else {
                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot is already booked and we are fully booked for that day. Please call back to schedule for another day. Thank you.</Say>
    <Hangup/>
</Response>`;
                }

                console.log('📤 Sending SLOT UNAVAILABLE TwiML (English)');
                res.set('Content-Type', 'text/xml; charset=utf-8');
                return res.send(errorTwiml);
            }

            console.log(`✅ Time slot ${appointmentDate} ${appointmentTime} is available!`);
            console.log(`📋 Creating appointment: clientId=${clientId}, name="${prospectName}", phone="${prospectPhone}"`);

            // Create appointment in database
            const appointment = await Appointment.create({
                clientId: clientId,
                customerName: prospectName || 'Unknown',
                customerPhone: prospectPhone || 'Unknown',
                appointmentDate: appointmentDate,
                appointmentTime: appointmentTime,
                duration: 30,
                status: 'confirmed',
                confirmationCode: confirmationCode,
                source: 'voice_booking'
            });

            console.log(`✅✅✅ APPOINTMENT CREATED SUCCESSFULLY! ✅✅✅`);
            console.log(`   📌 ID: ${appointment.id}`);
            console.log(`   🏢 Client: ${clientId}`);
            console.log(`   👤 Customer: ${prospectName} (${prospectPhone})`);
            console.log(`   📅 DateTime: ${appointmentDate} ${appointmentTime}`);
            console.log(`   🔑 Confirmation: ${confirmationCode}`);

            // Send SMS confirmation
            try {
                const { Client } = require('../models');
                const client = await Client.findByPk(clientId);

                if (client && client.ringlypro_number) {
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
                    console.warn(`⚠️  Cannot send SMS - client ${clientId} has no RinglyPro number`);
                }
            } catch (smsError) {
                console.error(`❌ Error sending SMS notification:`, smsError);
                // Don't fail the appointment if SMS fails
            }

        } catch (dbError) {
            console.error('❌❌❌ ERROR CREATING APPOINTMENT ❌❌❌');
            console.error(`   Error message: ${dbError.message}`);
            console.error(`   Full error:`, dbError);
            console.error(`   Session: clientId=${clientId}, name="${prospectName}", phone="${prospectPhone}"`);

            const isDuplicateSlot = dbError.message && (
                dbError.message.includes('unique_time_slot_per_client') ||
                dbError.message.includes('duplicate key') ||
                dbError.message.includes('unique constraint')
            );

            const escapedName = (prospectName || 'there')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            let errorTwiml;

            if (isDuplicateSlot) {
                // Try to find available slots for the same day
                try {
                    const { Op } = require('sequelize');
                    const bookedAppointments = await Appointment.findAll({
                        where: {
                            clientId: clientId,
                            appointmentDate: appointmentDate,
                            status: {
                                [Op.in]: ['confirmed', 'pending', 'scheduled']
                            }
                        },
                        attributes: ['appointmentTime'],
                        order: [['appointmentTime', 'ASC']]
                    });

                    const bookedTimes = bookedAppointments.map(apt => apt.appointmentTime);
                    console.log(`📋 Booked times for ${appointmentDate}:`, bookedTimes);

                    // Business hours - typical slots (9am-5pm, 30-min intervals)
                    const allSlots = [
                        '09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00',
                        '12:00:00', '12:30:00', '13:00:00', '13:30:00', '14:00:00', '14:30:00',
                        '15:00:00', '15:30:00', '16:00:00', '16:30:00', '17:00:00'
                    ];

                    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
                    console.log(`✅ Available slots for ${appointmentDate}:`, availableSlots);

                    if (availableSlots.length > 0) {
                        // Format first 3 available slots for speech
                        const formatTimeForSpeech = (timeStr) => {
                            const [hours, minutes] = timeStr.split(':');
                            let hour = parseInt(hours);
                            const isPM = hour >= 12;
                            if (hour > 12) hour -= 12;
                            if (hour === 0) hour = 12;
                            const period = isPM ? 'PM' : 'AM';
                            return minutes === '00' ? `${hour} ${period}` : `${hour} ${minutes} ${period}`;
                        };

                        const suggestions = availableSlots.slice(0, 3).map(formatTimeForSpeech);
                        const suggestionText = suggestions.length === 1
                            ? suggestions[0]
                            : suggestions.length === 2
                            ? `${suggestions[0]} or ${suggestions[1]}`
                            : `${suggestions[0]}, ${suggestions[1]}, or ${suggestions[2]}`;

                        errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot is already booked. We have availability at ${suggestionText}. Please call back to schedule one of these times. Thank you.</Say>
    <Hangup/>
</Response>`;
                    } else {
                        errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot is already booked and we're fully booked for that day. Please call back to schedule a different day. Thank you.</Say>
    <Hangup/>
</Response>`;
                    }
                } catch (slotCheckError) {
                    console.error('Error checking available slots:', slotCheckError);
                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, that time slot is already booked. Please call back to schedule a different time. Thank you.</Say>
    <Hangup/>
</Response>`;
                }
            } else {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">I'm sorry ${escapedName}, there was an error booking your appointment. Please call back or visit our website to schedule. Thank you for your patience.</Say>
    <Hangup/>
</Response>`;
            }

            console.log('📤 Sending ERROR TwiML - appointment creation failed');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            return res.send(errorTwiml);
        }

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

        console.log('📤 Sending SUCCESS TwiML - appointment created');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error booking appointment:', error);

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
function createIVRMenu(client, language = 'en') {
    const businessName = client.business_name;
    const ivrOptions = client.ivr_options || [];

    // Get enabled departments only
    const enabledDepts = ivrOptions.filter(dept => dept.enabled);

    // Build menu text
    let menuText = '';
    if (language === 'en') {
        menuText = `Hello, you've reached ${businessName}. `;
        menuText += `Press 1 to schedule an appointment. `;

        // Add department options (starting from 2)
        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            menuText += `Press ${digit} to reach ${dept.name}. `;
        });

        menuText += `Press 9 to leave a voicemail. `;
    } else {
        // Spanish
        menuText = `Hola, ha llamado a ${businessName}. `;
        menuText += `Presione 1 para programar una cita. `;

        enabledDepts.forEach((dept, index) => {
            const digit = index + 2;
            menuText += `Presione ${digit} para comunicarse con ${dept.name}. `;
        });

        menuText += `Presione 9 para dejar un mensaje de voz. `;
    }

    const voice = language === 'en' ? 'Polly.Joanna' : 'Polly.Lupe';

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="dtmf" numDigits="1" timeout="5" action="/voice/rachel/ivr-selection?lang=${language}" method="POST">
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
            if (language === 'en') {
                res.redirect(307, '/voice/rachel/collect-name');
            } else {
                res.redirect(307, '/voice/lina/collect-name');
            }
        } else if (digit === '9') {
            // Voicemail
            console.log(`📬 Voicemail selected for ${businessName}`);
            if (language === 'en') {
                res.redirect(307, '/voice/rachel/voicemail');
            } else {
                res.redirect(307, '/voice/lina/voicemail');
            }
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
            const twiml = createIVRMenu(client, 'en');
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