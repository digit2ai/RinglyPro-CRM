// src/routes/voiceBot.js - UPDATED WITH NEW APPOINTMENT SERVICES
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import new services
const availabilityService = require('../services/availabilityService');
const appointmentService = require('../services/appointmentService');
const db = require('../config/database');

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

// Main voice webhook handler - UPDATED WITH CLIENT IDENTIFICATION
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
        console.log(`Input - Digits: "${Digits}", Speech: "${SpeechResult}"`);
        
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
                clientInfo: clientResult.success ? clientResult.data : null
            };
            
            console.log(`🏢 Client identified: ${clientResult.success ? clientResult.data.business_name : 'Unknown'} (ID: ${session.clientId})`);
        }

        // Store call data in PostgreSQL
        try {
            if (Call && Call.create) {
                await Call.create({
    client_id: session.clientId || null,
    twilioCallSid: CallSid,
    direction: Direction === 'inbound' ? 'incoming' : 'outgoing',
    fromNumber: From,
    toNumber: To,
    status: CallStatus,
    startTime: new Date(),
    notes: `Voice bot step: ${session.step}, Client: ${session.clientId || 'Unknown'}`
});
                console.log(`📊 Call data saved: ${CallSid}`);
            }
        } catch (dbError) {
            console.error('Failed to save call:', dbError.message);
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
        errorTwiml.say('Sorry, there was a technical issue. Please try again later.');
        
        res.type('text/xml');
        res.send(errorTwiml.toString());
    }
});

// Process conversation flow based on current step
async function processConversationFlow(session, digits, speech) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    console.log(`🔄 Processing step: ${session.step}, digits: ${digits}, speech: ${speech}`);
    
    switch (session.step) {
        case 'greeting':
            return handleGreeting(session, twiml);
            
        case 'main_menu':
            return handleMainMenu(session, twiml, digits, speech);
            
        case 'collect_name':
            return handleCollectName(session, twiml, speech);
            
        case 'collect_phone':
            return handleCollectPhone(session, twiml, digits);
            
        case 'show_availability':
            return await handleShowAvailability(session, twiml);
            
        case 'select_slot':
            return handleSelectSlot(session, twiml, digits);
            
        case 'confirm_appointment':
            return handleConfirmAppointment(session, twiml, digits);
            
        case 'book_appointment':
            return await handleBookAppointment(session, twiml);
            
        default:
            return handleGreeting(session, twiml);
    }
}

// Handle initial greeting - ENHANCED WITH CLIENT INFO
function handleGreeting(session, twiml) {
    session.step = 'main_menu';
    
    // Use client-specific greeting if available
    let greeting = 'Hello! Welcome to our customer service.';
    if (session.clientInfo) {
        if (session.clientInfo.custom_greeting) {
            greeting = session.clientInfo.custom_greeting;
        } else {
            greeting = `Hello! Thank you for calling ${session.clientInfo.business_name}.`;
        }
    }
    
    twiml.say({
        voice: 'alice',
        rate: 'medium'
    }, `${greeting} I'm Rachel, your virtual assistant.`);
    
    twiml.pause({ length: 1 });
    
    const gather = twiml.gather({
        input: ['speech', 'dtmf'],
        timeout: 5,
        numDigits: 1,
        speechTimeout: 3,
        action: '/voice/webhook/voice'
    });
    
    gather.say({
        voice: 'alice',
        rate: 'medium'
    }, 'I can help you with several things today. Please say or press 1 for Sales, 2 for Support, 3 to Schedule an Appointment, or 0 to speak with a representative.');
    
    // Fallback if no input
    twiml.say('I didn\'t receive your selection. Let me transfer you to a representative.');
    twiml.dial('+1234567890'); // Replace with actual number
    
    return twiml;
}

// Handle main menu selection
function handleMainMenu(session, twiml, digits, speech) {
    const input = digits || parseSpokenNumber(speech);
    
    console.log(`📋 Main menu - digits: ${digits}, speech: "${speech}", parsed: ${input}`);
    
    switch (input) {
        case '1':
            // Sales
            session.step = 'sales';
            twiml.say('Connecting you to our sales team. Please hold.');
            twiml.dial('+1234567890'); // Replace with sales number
            break;
            
        case '2':
            // Support
            session.step = 'support';
            twiml.say('Connecting you to technical support. Please hold.');
            twiml.dial('+1234567891'); // Replace with support number
            break;
            
        case '3':
        case 'appointment':
        case 'schedule':
            // Appointment booking
            session.step = 'collect_name';
            return handleCollectName(session, twiml);
            
        case '0':
            // Representative
            twiml.say('Connecting you to a representative. Please hold.');
            twiml.dial('+1234567892'); // Replace with main number
            break;
            
        default:
            // Invalid input, try again
            session.step = 'main_menu';
            const gather = twiml.gather({
                input: ['speech', 'dtmf'],
                timeout: 5,
                numDigits: 1,
                speechTimeout: 3,
                action: '/voice/webhook/voice'
            });
            
            gather.say('I didn\'t understand that. Please press 1 for Sales, 2 for Support, 3 for Appointments, or 0 for a representative.');
            break;
    }
    
    return twiml;
}

// Collect customer name
function handleCollectName(session, twiml, speech) {
    if (speech) {
        // Process the name
        const name = cleanSpokenName(speech);
        console.log(`👤 Name collected: "${speech}" cleaned to "${name}"`);
        
        if (name && name.length > 2) {
            session.data.customerName = name;
            session.step = 'collect_phone';
            
            twiml.say(`Thank you ${name}. Now I need your phone number for the appointment.`);
            
            const gather = twiml.gather({
                input: 'dtmf',
                timeout: 10,
                numDigits: 10,
                action: '/voice/webhook/voice'
            });
            
            gather.say('Please enter your 10-digit phone number using the keypad.');
            
            twiml.say('I didn\'t receive your phone number. Let me try a different way.');
            twiml.redirect('/voice/webhook/voice');
            
        } else {
            // Name not clear, ask again
            const gather = twiml.gather({
                input: 'speech',
                timeout: 5,
                speechTimeout: 4,
                action: '/voice/webhook/voice'
            });
            
            gather.say('I didn\'t catch your name clearly. Could you please say your full name again?');
            
            twiml.say('I\'m having trouble hearing you. Let me connect you to a representative.');
            twiml.dial('+1234567892');
        }
    } else {
        // First time asking for name
        const gather = twiml.gather({
            input: 'speech',
            timeout: 5,
            speechTimeout: 4,
            action: '/voice/webhook/voice'
        });
        
        gather.say({
            voice: 'alice',
            rate: 'medium'
        }, 'Great! I\'d be happy to help you schedule an appointment. May I have your full name please?');
        
        twiml.say('I didn\'t hear your name. Let me connect you to someone who can help.');
        twiml.dial('+1234567892');
    }
    
    return twiml;
}

// Collect phone number
function handleCollectPhone(session, twiml, digits) {
    console.log(`📱 Phone collection - digits: "${digits}", length: ${digits ? digits.length : 0}`);
    
    if (digits && digits.length === 10) {
        // Format phone number
        const formattedPhone = `+1${digits}`;
        session.data.customerPhone = formattedPhone;
        session.step = 'show_availability';
        
        console.log(`📱 Phone collected: ${formattedPhone} for ${session.data.customerName}`);
        
        return handleShowAvailability(session, twiml);
        
    } else {
        // Invalid phone number
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 10,
            action: '/voice/webhook/voice'
        });
        
        gather.say('That doesn\'t appear to be a valid 10-digit phone number. Please try again.');
        
        twiml.say('I\'m having trouble with your phone number. Let me connect you to a representative.');
        twiml.dial('+1234567892');
    }
    
    return twiml;
}

// Show available appointment slots - UPDATED TO USE AVAILABILITY SERVICE
async function handleShowAvailability(session, twiml) {
    try {
        if (!session.clientId) {
            console.log('❌ No client ID available for availability check');
            twiml.say('I apologize, but I\'m having trouble accessing our calendar. Let me connect you to a representative.');
            twiml.dial('+1234567892');
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
            twiml.say('I apologize, but we don\'t have any available appointments tomorrow. Let me connect you to someone who can help you find alternative times.');
            twiml.dial('+1234567892');
            return twiml;
        }

        const available = availabilityResult.slots.slice(0, 5); // Limit to 5 options
        session.step = 'select_slot';
        
        twiml.say(`${session.data.customerName}, I found several available appointment times for tomorrow. Let me read you the options.`);
        twiml.pause({ length: 1 });
        
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 15,
            numDigits: 1,
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
        
        gather.say(optionsText);
        
        twiml.say('I didn\'t receive your selection. Let me connect you to a representative.');
        twiml.dial('+1234567892');
        
        return twiml;

    } catch (error) {
        console.error('❌ Error checking availability:', error);
        twiml.say('I\'m having trouble checking our calendar. Let me connect you to a representative.');
        twiml.dial('+1234567892');
        return twiml;
    }
}

// Handle slot selection
function handleSelectSlot(session, twiml, digits) {
    const selection = parseInt(digits);
    console.log(`📅 Slot selection: ${selection}`);
    
    if (selection >= 1 && selection <= 5 && session.data[`slot_${selection}`]) {
        session.data.selectedSlot = session.data[`slot_${selection}`];
        session.step = 'confirm_appointment';
        
        const slot = session.data.selectedSlot;
        
        twiml.say(`You selected ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}.`);
        twiml.pause({ length: 1 });
        
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 1,
            action: '/voice/webhook/voice'
        });
        
        gather.say(`To confirm: ${session.data.customerName}, phone number ${formatPhoneForSpeech(session.data.customerPhone)}, appointment on ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}. Press 1 to confirm or 2 to choose a different time.`);
        
        twiml.say('I didn\'t receive your confirmation. Let me connect you to a representative.');
        twiml.dial('+1234567892');
        
    } else if (selection === 9) {
        // Show more options (implement if needed)
        twiml.say('More appointment options are available. Let me connect you to a representative who can help you find the perfect time.');
        twiml.dial('+1234567892');
        
    } else {
        // Invalid selection
        session.step = 'show_availability';
        return handleShowAvailability(session, twiml);
    }
    
    return twiml;
}

// Handle appointment confirmation
function handleConfirmAppointment(session, twiml, digits) {
    console.log(`✅ Confirmation step - digits: ${digits}`);
    
    if (digits === '1') {
        // Confirm appointment
        session.step = 'book_appointment';
        return handleBookAppointment(session, twiml);
        
    } else if (digits === '2') {
        // Choose different time
        session.step = 'show_availability';
        return handleShowAvailability(session, twiml);
        
    } else {
        // Invalid input
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 1,
            action: '/voice/webhook/voice'
        });
        
        gather.say('Please press 1 to confirm your appointment or 2 to choose a different time.');
        
        twiml.say('Let me connect you to a representative.');
        twiml.dial('+1234567892');
    }
    
    return twiml;
}

// Book the appointment - UPDATED TO USE APPOINTMENT SERVICE
async function handleBookAppointment(session, twiml) {
    try {
        if (!session.clientId) {
            throw new Error('No client ID available');
        }

        console.log(`🎯 Booking appointment for ${session.data.customerName} (${session.data.customerPhone}) with client ${session.clientId}`);
        
        // Create or find contact
        let contact = await findOrCreateContact(session.data.customerName, session.data.customerPhone);
        
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
            
            twiml.say(`Perfect! Your appointment has been booked for ${formatDateForSpeech(slot.date)} at ${formatTimeForSpeech(slot.time)}.`);
            twiml.pause({ length: 1 });
            twiml.say(`${session.data.customerName}, you should receive a confirmation text message shortly at ${formatPhoneForSpeech(session.data.customerPhone)}.`);
            twiml.pause({ length: 1 });
            twiml.say(`Your confirmation code is ${appointment.confirmation_code}.`);
            twiml.pause({ length: 1 });
            
            const businessName = session.clientInfo ? session.clientInfo.business_name : 'our office';
            twiml.say(`Thank you for calling ${businessName}. We look forward to seeing you. Goodbye!`);
            
            // Send confirmation SMS
            await sendAppointmentConfirmationSMS(session.data.customerPhone, appointment, session.clientInfo);
            
            // Clean up session
            voiceSessions.delete(session.callSid);
            
            console.log(`✅ Appointment booked successfully: ${appointment.id}`);
            
        } else {
            throw new Error(`Booking failed: ${bookingResult.error}`);
        }
        
    } catch (error) {
        console.error('❌ Appointment booking error:', error);
        
        twiml.say('I apologize, but I\'m having trouble booking your appointment right now. Let me connect you to a representative who can help you immediately.');
        twiml.dial('+1234567892');
    }
    
    return twiml;
}

// Client identification function - NEW
async function identifyClient(phoneNumber) {
    try {
        console.log(`🔍 Looking up client for number: ${phoneNumber}`);
        
        // Use your existing database connection pattern
        const query = `
    SELECT id, business_name, ringlypro_number, custom_greeting
    FROM clients 
    WHERE ringlypro_number = $1
    AND rachel_enabled = true
`;
        
        // Use your existing database query method (likely through models)
        if (Contact && Contact.sequelize) {
            const result = await Contact.sequelize.query(query, {
                replacements: [phoneNumber],
                type: Contact.sequelize.QueryTypes.SELECT
            });
            
            if (result.length === 0) {
                console.log('❌ Client not found or Rachel disabled');
                return {
                    success: false,
                    error: 'Client not found or Rachel disabled'
                };
            }
            
            return {
                success: true,
                data: result[0]
            };
        } else {
            // Fallback if models not available
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
    if (spoken.includes('one') || spoken.includes('1')) return '1';
    if (spoken.includes('two') || spoken.includes('2')) return '2';
    if (spoken.includes('three') || spoken.includes('3')) return '3';
    if (spoken.includes('appointment') || spoken.includes('schedule')) return '3';
    if (spoken.includes('zero') || spoken.includes('0')) return '0';
    
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

// ENHANCED: Contact creation function
async function findOrCreateContact(name, phone) {
    try {
        console.log(`👤 Looking for contact: ${name} (${phone})`);
        
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
                
                contact = await Contact.create({
                    firstName: firstName,
                    lastName: lastName,
                    phone: phone,
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@voicebooking.temp`.replace(/\s+/g, ''),
                    source: 'voice_booking',
                    status: 'active',
                    notes: `Auto-created from voice booking on ${new Date().toLocaleDateString()}`
                });
                
                console.log(`✅ Created new contact in database: ${firstName} ${lastName} (${phone})`);
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

async function sendAppointmentConfirmationSMS(phone, appointment, clientInfo) {
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
            
            // Log SMS to database
            if (Message && Message.create) {
                await Message.create({
                    contactId: appointment.contact_id,
                    twilioSid: response.sid,
                    direction: 'outgoing',
                    fromNumber: process.env.TWILIO_PHONE_NUMBER,
                    toNumber: phone,
                    body: message,
                    status: 'sent',
                    sentAt: new Date()
                });
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
        services: 'Updated with availabilityService and appointmentService'
    });
});

module.exports = router;
