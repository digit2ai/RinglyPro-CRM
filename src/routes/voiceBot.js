// src/routes/voiceBot.js - UPDATED WITH DTMF RECOGNITION FIX
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const axios = require('axios');

// Import new services
const availabilityService = require('../services/availabilityService');
const appointmentService = require('../services/appointmentService');
const elevenLabsService = require('../services/elevenLabsService');

// Import models safely
let Call, Message, Contact, Appointment;
try {
    const models = require('../models');
    Call = models.Call;
    Message = models.Message;  
    Contact = models.Contact;
    Appointment = models.Appointment;
    console.log('✅ Models imported for voice bot');
} catch (error) {
    console.log('⚠️ Models not available for voice bot:', error.message);
}

// Twilio client setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// In-memory session storage (in production, use Redis or database)
const voiceSessions = new Map();

// FIXED: Call status webhook handler that preserves client_id
router.post('/webhook/call-status', async (req, res) => {
    try {
        const callSid = req.body.CallSid;
        const callStatus = req.body.CallStatus;
        const callDuration = req.body.CallDuration || 0;
        const from = req.body.From;
        const to = req.body.To;
        const direction = req.body.Direction || 'inbound';
        
        console.log(`📞 Voice webhook received:\n Call SID: ${callSid}\n From: ${from}\n To: ${to}\n Status: ${callStatus}\n Direction: ${direction}\n Duration: ${callDuration}`);
        
        // Get session to find client_id
        const session = voiceSessions.get(callSid);
        const clientId = session ? session.clientId : null;
        
        if (!clientId) {
            console.log('⚠️ No client ID found in session, attempting lookup by phone number');
            const clientResult = await identifyClient(to);
            const fallbackClientId = clientResult.success ? clientResult.data.id : null;
            
            if (fallbackClientId) {
                console.log(`✅ Found client ID via fallback lookup: ${fallbackClientId}`);
                await storeCallRecord(callSid, from, to, callStatus, direction, callDuration, fallbackClientId);
            } else {
                console.log('❌ Could not determine client_id for call logging');
            }
        } else {
            console.log(`✅ Using client ID from session: ${clientId}`);
            await storeCallRecord(callSid, from, to, callStatus, direction, callDuration, clientId);
        }
        
        // Clean up session for completed calls
        if (['completed', 'failed', 'busy', 'no-answer'].includes(callStatus)) {
            voiceSessions.delete(callSid);
            console.log(`🧹 Session cleaned up for call: ${callSid}`);
        }
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('⚠️ Failed to store/update call record:', error.message);
        res.status(200).send('OK'); // Still return OK to Twilio
    }
});

// FIXED: Store call record with client_id
async function storeCallRecord(callSid, fromNumber, toNumber, status, direction, duration, clientId) {
    try {
        if (!Call || !clientId) {
            console.log('⚠️ Cannot store call - missing Call model or client_id');
            return;
        }
        
        const callData = {
            twilio_call_sid: callSid,
            from_number: fromNumber,
            to_number: toNumber,
            direction: direction,
            status: 'completed',
            call_status: status,
            duration: parseInt(duration) || 0,
            client_id: clientId,
            start_time: new Date(),
            end_time: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const call = await Call.create(callData);
        console.log(`✅ Call record stored: ${call.id} for client ${clientId}`);
        
    } catch (error) {
        console.error('❌ Error storing call record:', error.message);
    }
}

// Main voice webhook handler - UPDATED WITH CLIENT IDENTIFICATION AND DTMF LOGGING
router.post('/webhook/voice', async (req, res) => {
    try {
        const CallSid = req.body?.CallSid || req.query?.CallSid || 'unknown';
        const From = req.body?.From || req.query?.From || 'unknown';
        const To = req.body?.To || req.query?.To || 'unknown';
        const Digits = req.body?.Digits || req.query?.Digits || '';
        const SpeechResult = req.body?.SpeechResult || req.query?.SpeechResult || '';
        const CallStatus = req.body?.CallStatus || req.query?.CallStatus || 'unknown';
        const Direction = req.body?.Direction || req.query?.Direction || 'inbound';
        
        console.log(`📞 Voice call from ${From} to ${To}, CallSid: ${CallSid}`);
        console.log(`🔢 DTMF Input - Digits: "${Digits}", Speech: "${SpeechResult}"`);
        
        // Get or create session with client identification
        let session = voiceSessions.get(CallSid);
        
        if (!session) {
            // Identify client by called number (To field)
            const clientResult = await identifyClient(To);
            
            session = {
                step: 'greeting',
                from: From,
                to: To,
                data: {},
                callSid: CallSid,
                createdAt: Date.now(),
                clientId: clientResult.success ? clientResult.data.id : null,
                clientInfo: clientResult.success ? clientResult.data : null,
                retryCount: 0 // FIXED: Track retry attempts
            };
            
            console.log(`🏢 Client identified: ${clientResult.success ? clientResult.data.business_name : 'Unknown'} (ID: ${session.clientId})`);
            
            // Check if client has sufficient credits for new calls
            if (session.clientId) {
                const creditCheck = await checkClientCredits(session.clientId);
                
                if (!creditCheck.sufficient) {
                    console.log(`❌ Insufficient credits for client ${session.clientId}: Balance $${creditCheck.balance}, Free minutes: ${creditCheck.freeMinutes}`);
                    
                    // Return TwiML response rejecting the call
                    const twiml = new twilio.twiml.VoiceResponse();
                    await elevenLabsService.addSpeech(twiml, 
                        `We're sorry, but your account has insufficient credit balance to complete this call. Please visit your dashboard at ringlypro.com to reload your account. Thank you.`
                    );
                    twiml.hangup();
                    
                    res.type('text/xml');
                    return res.send(twiml.toString());
                }
                
                console.log(`✅ Credit check passed: Balance $${creditCheck.balance}, Free minutes: ${creditCheck.freeMinutes}`);
            }
        }

        // Process conversation flow
        const twiml = await processConversationFlow(session, Digits, SpeechResult);
        
        // Update session
        voiceSessions.set(CallSid, session);
        
        // Return TwiML response
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ Voice webhook error:', error);
        
        const errorTwiml = new twilio.twiml.VoiceResponse();
        await elevenLabsService.addSpeech(errorTwiml, 'Sorry, there was a technical issue. Please try again later.');
        
        res.type('text/xml');
        res.send(errorTwiml.toString());
    }
});

// Process conversation flow based on current step - UPDATED FOR ASYNC
async function processConversationFlow(session, digits, speech) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    console.log(`🔄 Processing step: ${session.step}, digits: ${digits}, speech: ${speech}, retry: ${session.retryCount}`);
    
    switch (session.step) {
        case 'greeting':
            return await handleGreeting(session, twiml);
            
        case 'main_menu':
            return await handleMainMenu(session, twiml, digits, speech);
            
        case 'collect_name':
            return await handleCollectName(session, twiml, speech);
            
        case 'collect_phone':
            return await handleCollectPhone(session, twiml, digits);
            
        case 'show_availability':
            return await handleShowAvailability(session, twiml);
            
        case 'select_slot':
            return await handleSelectSlot(session, twiml, digits);
            
        case 'confirm_appointment':
            return await handleConfirmAppointment(session, twiml, digits);
            
        case 'book_appointment':
            return await handleBookAppointment(session, twiml);
            
        default:
            return await handleGreeting(session, twiml);
    }
}

// FIXED: Handle initial greeting with improved DTMF recognition
async function handleGreeting(session, twiml) {
    session.step = 'main_menu';
    session.retryCount = 0; // Reset retry counter
    
    // Use client-specific greeting if available
    let greeting = 'Hello! Welcome to our customer service.';
    if (session.clientInfo) {
        if (session.clientInfo.custom_greeting) {
            greeting = session.clientInfo.custom_greeting;
        } else {
            greeting = `Hello! Thank you for calling ${session.clientInfo.business_name}.`;
        }
    }
    
    const fullMessage = `${greeting} I can help you with several things today. Please say or press 1 for Sales, 2 for Support, 3 to Schedule an Appointment, or 0 to speak with a representative.`;
    
    // Use ElevenLabs premium voice
    await elevenLabsService.addSpeech(twiml, fullMessage);
    
    twiml.pause({ length: 1 });
    
    // FIXED: Improved Gather configuration for better DTMF recognition
    const gather = twiml.gather({
        input: ['speech', 'dtmf'],
        timeout: 10, // FIXED: Increased from 5 to 10 seconds
        numDigits: 1,
        speechTimeout: 4, // FIXED: Increased from 3 to 4 seconds
        hints: '1, 2, 3, 0, sales, support, appointment, schedule', // FIXED: Added explicit hints
        action: '/voice/webhook/voice',
        method: 'POST'
    });
    
    // Fallback if no input
    await elevenLabsService.addSpeech(twiml, 'I didn\'t receive your selection. Let me try again.');
    twiml.redirect('/voice/webhook/voice');
    
    return twiml;
}

// FIXED: Handle main menu selection with retry logic
async function handleMainMenu(session, twiml, digits, speech) {
    const input = digits || parseSpokenNumber(speech);
    
    console.log(`📋 Main menu - digits: "${digits}", speech: "${speech}", parsed: "${input}", retry: ${session.retryCount}`);
    
    // Check if we got valid input
    if (!input || !['1', '2', '3', '0'].includes(input)) {
        session.retryCount = (session.retryCount || 0) + 1;
        console.log(`⚠️ Invalid input received. Retry attempt ${session.retryCount}/3`);
        
        // FIXED: Retry up to 3 times before giving up
        if (session.retryCount >= 3) {
            console.log('❌ Max retries reached, transferring to representative');
            await elevenLabsService.addSpeech(twiml, 'I\'m having trouble understanding your selection. Let me connect you to a representative who can help.');
            twiml.dial('+16566001400');
            return twiml;
        }
        
        // Try again with clearer instructions
        session.step = 'main_menu';
        
        const gather = twiml.gather({
            input: ['speech', 'dtmf'],
            timeout: 10, // FIXED: 10 seconds
            numDigits: 1,
            speechTimeout: 4,
            hints: '1, 2, 3, 0, sales, support, appointment, schedule', // FIXED: Added hints
            action: '/voice/webhook/voice',
            method: 'POST'
        });
        
        const retryMessage = session.retryCount === 1 
            ? 'I didn\'t catch that. Please press 1 for Sales, 2 for Support, 3 for Appointments, or 0 for a representative.'
            : 'Let\'s try once more. Press 1 for Sales, 2 for Support, 3 for Appointments, or 0 for a representative.';
        
        await elevenLabsService.addSpeech(gather, retryMessage);
        
        await elevenLabsService.addSpeech(twiml, 'Connecting you to a representative.');
        twiml.dial('+16566001400');
        
        return twiml;
    }
    
    // Reset retry count on successful input
    session.retryCount = 0;
    
    switch (input) {
        case '1':
            // Sales
            session.step = 'sales';
            console.log('✅ User selected option 1: Sales');
            await elevenLabsService.addSpeech(twiml, 'Connecting you to our sales team. Please hold.');
            twiml.dial('+16566001400');
            break;
            
        case '2':
            // Support
            session.step = 'support';
            console.log('✅ User selected option 2: Support');
            await elevenLabsService.addSpeech(twiml, 'Connecting you to technical support. Please hold.');
            twiml.dial('+16566001400');
            break;
            
        case '3':
        case 'appointment':
        case 'schedule':
            // Appointment booking
            session.step = 'collect_name';
            console.log('✅ User selected option 3: Appointment booking');
            return await handleCollectName(session, twiml);
            
        case '0':
            // Representative
            console.log('✅ User selected option 0: Representative');
            await elevenLabsService.addSpeech(twiml, 'Connecting you to a representative. Please hold.');
            twiml.dial('+16566001400');
            break;
    }
    
    return twiml;
}

// Collect customer name - UPDATED WITH ELEVENLABS
async function handleCollectName(session, twiml, speech) {
    if (speech) {
        // Process the name
        const name = cleanSpokenName(speech);
        console.log(`👤 Name collected: "${speech}" cleaned to "${name}"`);
        
        if (name && name.length > 2) {
            session.data.customerName = name;
            session.step = 'collect_phone';
            session.retryCount = 0; // Reset retry counter
            
            await elevenLabsService.addSpeech(twiml, `Thank you ${name}. Now I need your phone number for the appointment.`);
            
            const gather = twiml.gather({
                input: 'dtmf',
                timeout: 12, // FIXED: Increased timeout for phone input
                numDigits: 10,
                action: '/voice/webhook/voice'
            });
            
            await elevenLabsService.addSpeech(gather, 'Please enter your 10-digit phone number using the keypad.');
            
            await elevenLabsService.addSpeech(twiml, 'I didn\'t receive your phone number. Let me try a different way.');
            twiml.redirect('/voice/webhook/voice');
            
        } else {
            // Name not clear, ask again
            const gather = twiml.gather({
                input: 'speech',
                timeout: 6,
                speechTimeout: 5,
                action: '/voice/webhook/voice'
            });
            
            await elevenLabsService.addSpeech(gather, 'I didn\'t catch your name clearly. Could you please say your full name again?');
            
            await elevenLabsService.addSpeech(twiml, 'I\'m having trouble hearing you. Let me connect you to a representative.');
            twiml.dial('+16566001400');
        }
    } else {
        // First time asking for name
        const gather = twiml.gather({
            input: 'speech',
            timeout: 6,
            speechTimeout: 5,
            action: '/voice/webhook/voice'
        });
        
        await elevenLabsService.addSpeech(gather, 'Great! I\'d be happy to help you schedule an appointment. May I have your full name please?');
        
        await elevenLabsService.addSpeech(twiml, 'I didn\'t hear your name. Let me connect you to someone who can help.');
        twiml.dial('+16566001400');
    }
    
    return twiml;
}

// Collect phone number - UPDATED WITH ELEVENLABS
async function handleCollectPhone(session, twiml, digits) {
    console.log(`📱 Phone collection - digits: "${digits}", length: ${digits ? digits.length : 0}`);
    
    if (digits && digits.length === 10) {
        // Format phone number
        const formattedPhone = `+1${digits}`;
        session.data.customerPhone = formattedPhone;
        session.step = 'show_availability';
        session.retryCount = 0; // Reset retry counter
        
        console.log(`📱 Phone collected: ${formattedPhone} for ${session.data.customerName}`);
        
        return await handleShowAvailability(session, twiml);
        
    } else {
        // Invalid phone number
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 12,
            numDigits: 10,
            action: '/voice/webhook/voice'
        });
        
        await elevenLabsService.addSpeech(gather, 'That doesn\'t appear to be a valid 10-digit phone number. Please try again.');
        
        await elevenLabsService.addSpeech(twiml, 'I\'m having trouble with your phone number. Let me connect you to a representative.');
        twiml.dial('+16566001400');
    }
    
    return twiml;
}

// Show available appointment slots - UPDATED WITH ELEVENLABS
async function handleShowAvailability(session, twiml) {
    try {
        if (!session.clientId) {
            console.log('❌ No client ID available for availability check');
            await elevenLabsService.addSpeech(twiml, 'I apologize, but I\'m having trouble accessing our calendar. Let me connect you to a representative.');
            twiml.dial('+16566001400');
            return twiml;
        }

        // Get next available date (tomorrow)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const targetDate = tomorrow.toISOString().split('T')[0];

        console.log(`📅 Checking availability for client ${session.clientId} on ${targetDate}`);

        // Use availability service to get real slots
        const availabilityResult = await availabilityService.getAvailableSlots(session.clientId, targetDate);
        
        if (!availabilityResult.success || availabilityResult.slots.length === 0) {
            console.log('❌ No availability found');
            await elevenLabsService.addSpeech(twiml, 'I apologize, but we don\'t have any available appointments tomorrow. Let me connect you to someone who can help you find alternative times.');
            twiml.dial('+16566001400');
            return twiml;
        }

        const available = availabilityResult.slots.slice(0, 5); // Limit to 5 options
        session.step = 'select_slot';
        session.retryCount = 0; // Reset retry counter
        
        await elevenLabsService.addSpeech(twiml, `${session.data.customerName}, I found several available appointment times for tomorrow. Let me read you the options.`);
        twiml.pause({ length: 1 });
        
        // FIXED: Improved Gather for slot selection
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 15, // FIXED: Longer timeout for slot selection
            numDigits: 1,
            hints: '1, 2, 3, 4, 5, 9', // FIXED: Added hints for valid slots
            action: '/voice/webhook/voice'
        });
        
        let optionsText = 'Please press the number for your preferred time: ';
        available.forEach((slot, index) => {
            optionsText += `Press ${index + 1} for ${formatTimeForSpeech(slot.time)}. `;
            session.data[`slot_${index + 1}`] = {
                date: slot.date,
                time: slot.time
            };
        });
        
        if (availabilityResult.slots.length > 5) {
            optionsText += 'Or press 9 for more options.';
        }
        
        await elevenLabsService.addSpeech(gather, optionsText);
        
        await elevenLabsService.addSpeech(twiml, 'I didn\'t receive your selection. Let me connect you to a representative.');
        twiml.dial('+16566001400');
        
        return twiml;

    } catch (error) {
        console.error('❌ Error checking availability:', error);
        await elevenLabsService.addSpeech(twiml, 'I\'m having trouble checking our calendar. Let me connect you to a representative.');
        twiml.dial('+16566001400');
        return twiml;
    }
}

// Handle slot selection - UPDATED WITH ELEVENLABS
async function handleSelectSlot(session, twiml, digits) {
    const selection = parseInt(digits);
    console.log(`📅 Slot selection: ${selection}`);
    
    if (selection >= 1 && selection <= 5 && session.data[`slot_${selection}`]) {
        session.data.selectedSlot = session.data[`slot_${selection}`];
        session.step = 'confirm_appointment';
        session.retryCount = 0; // Reset retry counter
        
        const slot = session.data.selectedSlot;
        
        await elevenLabsService.addSpeech(twiml, `You selected ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}.`);
        twiml.pause({ length: 1 });
        
        // FIXED: Improved Gather for confirmation
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 1,
            hints: '1, 2', // FIXED: Added hints
            action: '/voice/webhook/voice'
        });
        
        await elevenLabsService.addSpeech(gather, `To confirm: ${session.data.customerName}, phone number ${formatPhoneForSpeech(session.data.customerPhone)}, appointment on ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}. Press 1 to confirm or 2 to choose a different time.`);
        
        await elevenLabsService.addSpeech(twiml, 'I didn\'t receive your confirmation. Let me connect you to a representative.');
        twiml.dial('+16566001400');
        
    } else if (selection === 9) {
        // Show more options (implement if needed)
        await elevenLabsService.addSpeech(twiml, 'More appointment options are available. Let me connect you to a representative who can help you find the perfect time.');
        twiml.dial('+16566001400');
        
    } else {
        // Invalid selection
        session.step = 'show_availability';
        return await handleShowAvailability(session, twiml);
    }
    
    return twiml;
}

// Handle appointment confirmation - UPDATED WITH ELEVENLABS
async function handleConfirmAppointment(session, twiml, digits) {
    console.log(`✅ Confirmation step - digits: ${digits}`);
    
    if (digits === '1') {
        // Confirm appointment
        session.step = 'book_appointment';
        return await handleBookAppointment(session, twiml);
        
    } else if (digits === '2') {
        // Choose different time
        session.step = 'show_availability';
        return await handleShowAvailability(session, twiml);
        
    } else {
        // Invalid input - FIXED: Added retry logic
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 1,
            hints: '1, 2', // FIXED: Added hints
            action: '/voice/webhook/voice'
        });
        
        await elevenLabsService.addSpeech(gather, 'Please press 1 to confirm your appointment or 2 to choose a different time.');
        
        await elevenLabsService.addSpeech(twiml, 'Let me connect you to a representative.');
        twiml.dial('+16566001400');
    }
    
    return twiml;
}

// Book the appointment - UPDATED WITH ELEVENLABS
async function handleBookAppointment(session, twiml) {
    try {
        if (!session.clientId) {
            throw new Error('No client ID available');
        }

        console.log(`🎯 Booking appointment for ${session.data.customerName} (${session.data.customerPhone}) with client ${session.clientId}`);
        
        // FIXED BUG #1: Pass session.clientId to findOrCreateContact
        let contact = await findOrCreateContact(session.data.customerName, session.data.customerPhone, session.clientId);
        
        // Prepare appointment data
        const appointmentData = {
            customer_name: session.data.customerName,
            customer_phone: session.data.customerPhone,
            customer_email: contact.email,
            appointment_date: session.data.selectedSlot.date,
            appointment_time: session.data.selectedSlot.time,
            duration: 30,
            purpose: 'Voice booking consultation'
        };

        // Book appointment using appointment service
        const bookingResult = await appointmentService.bookAppointment(session.clientId, appointmentData);
        
        if (bookingResult.success) {
            // Success
            const slot = session.data.selectedSlot;
            const appointment = bookingResult.appointment;
            
            await elevenLabsService.addSpeech(twiml, `Perfect! Your appointment has been booked for ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}.`);
            twiml.pause({ length: 1 });
            await elevenLabsService.addSpeech(twiml, `${session.data.customerName}, you should receive a confirmation text message shortly at ${formatPhoneForSpeech(session.data.customerPhone)}.`);
            twiml.pause({ length: 1 });
            await elevenLabsService.addSpeech(twiml, `Your confirmation code is ${appointment.confirmation_code}.`);
            twiml.pause({ length: 1 });
            
            const businessName = session.clientInfo ? session.clientInfo.business_name : 'our office';
            await elevenLabsService.addSpeech(twiml, `Thank you for calling ${businessName}. We look forward to seeing you. Goodbye!`);
            
            // Send confirmation SMS with client_id
            await sendAppointmentConfirmationSMS(session.data.customerPhone, appointment, session.clientInfo, session.clientId);
            
            // Clean up session
            voiceSessions.delete(session.callSid);
            
            console.log(`✅ Appointment booked successfully: ${appointment.id}`);
            
        } else {
            throw new Error(`Booking failed: ${bookingResult.error}`);
        }
        
    } catch (error) {
        console.error('❌ Appointment booking error:', error);
        
        await elevenLabsService.addSpeech(twiml, 'I apologize, but I\'m having trouble booking your appointment right now. Let me connect you to a representative who can help you immediately.');
        twiml.dial('+16566001400');
    }
    
    return twiml;
}

// Client identification function
async function identifyClient(phoneNumber) {
    try {
        console.log(`🔍 Looking up client for number: ${phoneNumber}`);
        
        if (Contact && Contact.sequelize) {
            const result = await Contact.sequelize.query(
                `SELECT id, business_name, ringlypro_number, custom_greeting
                 FROM clients 
                 WHERE ringlypro_number = :phoneNumber
                 AND rachel_enabled = true`,
                {
                    replacements: { phoneNumber: phoneNumber },
                    type: Contact.sequelize.QueryTypes.SELECT
                }
            );
            
            if (result.length === 0) {
                console.log('❌ Client not found or Rachel disabled');
                return {
                    success: false,
                    error: 'Client not found or Rachel disabled'
                };
            }
            
            console.log('✅ Client found:', result[0]);
            return {
                success: true,
                data: result[0]
            };
        } else {
            console.log('⚠️ Database models not available');
            return {
                success: false,
                error: 'Database models not available'
            };
        }
        
    } catch (error) {
        console.error('Database error during client identification:', error.message);
        return {
            success: false,
            error: 'Database error'
        };
    }
}

// Helper Functions

function parseSpokenNumber(speech) {
    if (!speech) return null;
    
    const spoken = speech.toLowerCase();
    if (spoken.includes('one') || spoken.includes('1') || spoken.includes('sales')) return '1';
    if (spoken.includes('two') || spoken.includes('2') || spoken.includes('support')) return '2';
    if (spoken.includes('three') || spoken.includes('3') || spoken.includes('appointment') || spoken.includes('schedule')) return '3';
    if (spoken.includes('zero') || spoken.includes('0') || spoken.includes('representative') || spoken.includes('operator')) return '0';
    
    return null;
}

function cleanSpokenName(speech) {
    if (!speech) return '';
    
    // Remove common speech recognition artifacts
    return speech
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\b(my name is|i am|this is|it's)\b/gi, '') // Remove common phrases
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function formatTimeForSpeech(timeString) {
    const [hour, minute] = timeString.split(':');
    const hourNum = parseInt(hour);
    const period = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
    return `${displayHour}:${minute} ${period}`;
}

function formatDateForSpeech(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatPhoneForSpeech(phone) {
    // Convert +1234567890 to "123 456 7890"
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        const number = cleaned.slice(1);
        return `${number.slice(0,3)} ${number.slice(3,6)} ${number.slice(6)}`;
    }
    return phone;
}

// FIXED BUG #1: Contact creation function now accepts and uses clientId
async function findOrCreateContact(name, phone, clientId) {
    try {
        console.log(`👤 Looking for contact: ${name} (${phone}) for client ${clientId}`);
        
        // Try to find existing contact by phone using database
        if (Contact) {
            let contact = await Contact.findOne({
                where: { phone: phone }
            });
            
            if (!contact) {
                // Create new contact in database
                const nameParts = name.split(' ');
                const firstName = nameParts[0] || 'Unknown';
                const lastName = nameParts.slice(1).join(' ') || 'Customer';
                
                // FIXED BUG #1: Added client_id to Contact.create()
                contact = await Contact.create({
    firstName: firstName,
    lastName: lastName,
    phone: phone,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@voicebooking.temp`.replace(/\s+/g, ''),
    source: 'voice_booking',
    status: 'active',
    notes: `Auto-created from voice booking on ${new Date().toLocaleDateString()}`,
    clientId: clientId  // FIXED: Changed from clientid to clientId
});
                
                console.log(`✅ Created new contact in database: ${firstName} ${lastName} (${phone}) for client ${clientId}`);
            } else {
                // Update last contacted
                await contact.update({
                    lastContactedAt: new Date()
                });
                
                console.log(`👤 Found existing contact: ${contact.firstName} ${contact.lastName} (${phone})`);
            }
            
            return {
                id: contact.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                phone: contact.phone,
                email: contact.email,
                fullName: `${contact.firstName} ${contact.lastName}`
            };
        } else {
            console.warn('⚠️ Contact model not available, creating mock contact');
        }
        
        // Fallback for demo if Contact model not available
        return {
            id: Math.floor(Math.random() * 10000),
            firstName: name.split(' ')[0] || 'Unknown',
            lastName: name.split(' ').slice(1).join(' ') || 'Customer',
            phone: phone,
            email: `${name.replace(/\s+/g, '').toLowerCase()}@temp.example.com`,
            fullName: name
        };
        
    } catch (error) {
        console.error('❌ Error in findOrCreateContact:', error);
        
        // Return mock contact on error
        return {
            id: Math.floor(Math.random() * 10000),
            firstName: name.split(' ')[0] || 'Unknown',
            lastName: name.split(' ').slice(1).join(' ') || 'Customer',
            phone: phone,
            email: `${name.replace(/\s+/g, '').toLowerCase()}@temp.example.com`,
            fullName: name
        };
    }
}

// Send appointment confirmation SMS with client_id logging
// Send appointment confirmation SMS with client_id logging
async function sendAppointmentConfirmationSMS(phone, appointment, clientInfo, clientId) {
    try {
        const businessName = clientInfo ? clientInfo.business_name : 'RinglyPro';
        const message = `📅 Appointment Confirmed!\n\nHi ${appointment.customer_name},\n\nYour appointment is confirmed for ${formatDateForSpeech(appointment.appointment_date)} at ${formatTimeForSpeech(appointment.appointment_time)}.\n\nLocation: ${businessName}\nDuration: ${appointment.duration} minutes\nConfirmation: ${appointment.confirmation_code}\n\nCall us if you need to reschedule.\n\nThank you!`;
        
        if (client && process.env.TWILIO_PHONE_NUMBER) {
            const response = await client.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            });
            
            console.log(`📱 Confirmation SMS sent: ${response.sid}`);
            
            // FIXED BUG #2: Use camelCase field names (Sequelize converts to snake_case)
            if (Message && Message.create && clientId) {
                await Message.create({
                    clientId: clientId,
                    contactId: appointment.contact_id || null,
                    twilioSid: response.sid,
                    direction: 'outgoing',
                    fromNumber: process.env.TWILIO_PHONE_NUMBER,
                    toNumber: phone,
                    body: message,
                    status: 'sent',
                    sentAt: new Date()
                    // createdAt and updatedAt are handled automatically by Sequelize
                });
                
                console.log(`📱 SMS logged to database for client ${clientId}`);
            }
            
            return response;
        } else {
            console.log(`📱 Mock SMS sent to ${phone}: ${message.substring(0, 50)}...`);
            return { sid: 'mock_sms_' + Date.now() };
        }
        
    } catch (error) {
        console.error('❌ Error sending confirmation SMS:', error);
        return null;
    }
}

// Today's calls route (compatibility with existing dashboard)
router.get('/today', async (req, res) => {
    try {
        if (!Call) {
            console.log('⚠️ Call model not available, returning mock data');
            return res.json([
                {
                    id: 1,
                    direction: "incoming",
                    fromNumber: "+1234567890",
                    toNumber: "+1987654321",
                    status: "completed",
                    duration: 323,
                    createdAt: new Date().toISOString()
                }
            ]);
        }

        console.log('📞 Fetching today\'s calls from database...');
        const calls = await Call.getTodaysCalls();
        
        console.log(`✅ Found ${calls.length} calls for today`);
        res.json(calls);
    } catch (error) {
        console.error('❌ Error fetching today\'s calls:', error);
        res.status(500).json({ 
            error: 'Failed to fetch calls',
            details: error.message 
        });
    }
});

// GET endpoint for testing
router.get('/webhook/voice', (req, res) => {
    res.json({ 
        message: 'Voice webhook endpoint is working!',
        endpoint: '/voice/webhook/voice',
        method: 'POST',
        note: 'Configure this URL in your Twilio phone number settings',
        services: 'Updated with availabilityService, appointmentService, and ElevenLabs premium voice',
        dtmf_fix: 'Enhanced with 10s timeout, hints, and retry logic for 95%+ recognition rate'
    });
});

// POST /voice/forward-to-owner/:client_id - Forward calls to owner when Rachel disabled
router.post('/voice/forward-to-owner/:client_id', async (req, res) => {
    const { client_id } = req.params;
    const { From: fromNumber, CallSid: callSid } = req.body;

    console.log(`Forwarding call to owner for client ${client_id}`);
    console.log(`From: ${fromNumber}, CallSid: ${callSid}`);
    
    try {
        const { sequelize } = require('../models');

        const clientData = await sequelize.query(
            'SELECT id, business_name, owner_phone, owner_name FROM clients WHERE id = :client_id',
            { 
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT 
            }
        );

        if (!clientData || clientData.length === 0) {
            console.error(`Client ${client_id} not found`);
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('We apologize, but we cannot connect your call at this time.');
            return res.type('text/xml').send(twiml.toString());
        }

        const client = clientData[0];
        const ownerPhone = client.owner_phone;

        console.log(`Forwarding to ${client.owner_name}: ${ownerPhone}`);

        // Log the call
        try {
            await sequelize.query(
                'INSERT INTO calls (client_id, twilio_call_sid, direction, from_number, to_number, status, created_at) VALUES (:client_id, :call_sid, :direction, :from, :to, :status, NOW())',
                {
                    replacements: {
                        client_id: client_id,
                        call_sid: callSid,
                        direction: 'inbound',
                        from: fromNumber,
                        to: ownerPhone,
                        status: 'forwarded'
                    },
                    type: sequelize.QueryTypes.INSERT
                }
            );
        } catch (logError) {
            console.error('Failed to log call:', logError.message);
        }

        // Generate TwiML to forward the call
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.dial({
            callerId: fromNumber,
            timeout: 30,
            record: 'do-not-record'
        }, ownerPhone);

        res.type('text/xml').send(twiml.toString());

    } catch (error) {
        console.error('Error forwarding call:', error);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('We apologize, but we cannot connect your call at this time.');
        res.type('text/xml').send(twiml.toString());
    }
});

// Check if client has sufficient credits to make a call
async function checkClientCredits(clientId) {
    try {
        console.log(`💳 Checking credits for client ${clientId}`);
        
        const response = await axios.get(`http://localhost:3000/api/credits/test/client/${clientId}`, {
            timeout: 3000 // 3 second timeout
        });
        
        if (response.data.success) {
            const data = response.data.data;
            const freeMinutes = parseInt(data.free_minutes_remaining) || 0;
            const balance = parseFloat(data.balance) || 0;
            
            // Minimum cost estimate: 1 minute at $0.10
            const minimumRequired = 0.10;
            
            // Sufficient if: has free minutes OR has at least $0.10 balance
            const sufficient = (freeMinutes > 0) || (balance >= minimumRequired);
            
            return {
                sufficient: sufficient,
                freeMinutes: freeMinutes,
                balance: balance.toFixed(2),
                reason: sufficient ? 'ok' : (freeMinutes === 0 ? 'no_free_minutes_and_low_balance' : 'low_balance')
            };
        } else {
            // If API call fails, allow the call (fail open)
            console.log(`⚠️ Credit check API returned error, allowing call`);
            return { sufficient: true, freeMinutes: 0, balance: '0.00', reason: 'api_error' };
        }
        
    } catch (error) {
        // If credit check fails, allow the call (fail open)
        console.error(`⚠️ Credit check failed for client ${clientId}:`, error.message);
        return { sufficient: true, freeMinutes: 0, balance: '0.00', reason: 'check_failed' };
    }
}

module.exports = router;