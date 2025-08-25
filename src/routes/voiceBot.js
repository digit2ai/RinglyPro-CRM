// src/routes/voiceBot.js - COMPLETE FIXED VERSION FOR CONTACT AUTO-CREATION
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

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

// Available appointment slots (in production, this would be from database)
const availableSlots = [
    { time: '09:00', day: 'Monday', available: true },
    { time: '10:00', day: 'Monday', available: true },
    { time: '11:00', day: 'Monday', available: true },
    { time: '14:00', day: 'Monday', available: true },
    { time: '15:00', day: 'Monday', available: true },
    { time: '16:00', day: 'Monday', available: true },
    { time: '09:00', day: 'Tuesday', available: true },
    { time: '10:00', day: 'Tuesday', available: true },
    { time: '11:00', day: 'Tuesday', available: true },
    { time: '14:00', day: 'Tuesday', available: true },
    { time: '15:00', day: 'Tuesday', available: true },
    { time: '16:00', day: 'Tuesday', available: true }
];

// Main voice webhook handler - FIXED TO USE CONVERSATION FLOW
router.post('/webhook/voice', async (req, res) => {
    try {
        const CallSid = req.body?.CallSid || req.query?.CallSid || 'unknown';
        const From = req.body?.From || req.query?.From || 'unknown';
        const To = req.body?.To || req.query?.To || 'unknown';
        const Digits = req.body?.Digits || req.query?.Digits || '';
        const SpeechResult = req.body?.SpeechResult || req.query?.SpeechResult || '';
        const CallStatus = req.body?.CallStatus || req.query?.CallStatus || 'unknown';
        const Direction = req.body?.Direction || req.query?.Direction || 'inbound';
        
        console.log(`📞 Voice call from ${From}, CallSid: ${CallSid}`);
        console.log(`Input - Digits: "${Digits}", Speech: "${SpeechResult}"`);
        
        // Get or create session
        let session = voiceSessions.get(CallSid) || {
            step: 'greeting',
            from: From,
            data: {},
            callSid: CallSid,
            createdAt: Date.now()
        };

        // Store call data in PostgreSQL
        try {
            if (Call && Call.create) {
                await Call.create({
                    twilioCallSid: CallSid,
                    direction: Direction === 'inbound' ? 'incoming' : 'outgoing',
                    fromNumber: From,
                    toNumber: To,
                    status: CallStatus,
                    startTime: new Date(),
                    notes: `Voice bot step: ${session.step}`
                });
                console.log(`📊 Call data saved: ${CallSid}`);
            }
        } catch (dbError) {
            console.error('Failed to save call:', dbError.message);
        }

        // FIXED: Process conversation flow properly
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
            return handleShowAvailability(session, twiml);
            
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

// Handle initial greeting
function handleGreeting(session, twiml) {
    session.step = 'main_menu';
    
    twiml.say({
        voice: 'alice',
        rate: 'medium'
    }, 'Hello! Welcome to RinglyPro Customer Service. I\'m Rachel, your virtual assistant.');
    
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
        console.log(`📝 Name collected: "${speech}" cleaned to "${name}"`);
        
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

// Show available appointment slots
function handleShowAvailability(session, twiml) {
    const available = getAvailableSlots();
    
    if (available.length === 0) {
        twiml.say('I apologize, but we don\'t have any available appointments this week. Let me connect you to someone who can help you find alternative times.');
        twiml.dial('+1234567892');
        return twiml;
    }
    
    session.step = 'select_slot';
    
    twiml.say(`${session.data.customerName}, I found several available appointment times. Let me read you the options.`);
    twiml.pause({ length: 1 });
    
    const gather = twiml.gather({
        input: 'dtmf',
        timeout: 15,
        numDigits: 1,
        action: '/voice/webhook/voice'
    });
    
    let optionsText = 'Please press the number for your preferred time: ';
    available.slice(0, 5).forEach((slot, index) => {
        optionsText += `Press ${index + 1} for ${slot.day} at ${formatTime(slot.time)}. `;
        session.data[`slot_${index + 1}`] = slot;
    });
    
    if (available.length > 5) {
        optionsText += 'Or press 9 for more options.';
    }
    
    gather.say(optionsText);
    
    twiml.say('I didn\'t receive your selection. Let me connect you to a representative.');
    twiml.dial('+1234567892');
    
    return twiml;
}

// Handle slot selection
function handleSelectSlot(session, twiml, digits) {
    const selection = parseInt(digits);
    console.log(`📅 Slot selection: ${selection}`);
    
    if (selection >= 1 && selection <= 5 && session.data[`slot_${selection}`]) {
        session.data.selectedSlot = session.data[`slot_${selection}`];
        session.step = 'confirm_appointment';
        
        const slot = session.data.selectedSlot;
        
        twiml.say(`You selected ${slot.day} at ${formatTime(slot.time)}.`);
        twiml.pause({ length: 1 });
        
        const gather = twiml.gather({
            input: 'dtmf',
            timeout: 10,
            numDigits: 1,
            action: '/voice/webhook/voice'
        });
        
        gather.say(`To confirm: ${session.data.customerName}, phone number ${formatPhoneForSpeech(session.data.customerPhone)}, appointment on ${slot.day} at ${formatTime(slot.time)}. Press 1 to confirm or 2 to choose a different time.`);
        
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

// Book the appointment - THIS IS WHERE CONTACT CREATION HAPPENS
async function handleBookAppointment(session, twiml) {
    try {
        console.log(`🎯 Booking appointment for ${session.data.customerName} (${session.data.customerPhone})`);
        
        // Create or find contact - THIS WILL CREATE THE CONTACT IN DATABASE
        let contact = await findOrCreateContact(session.data.customerName, session.data.customerPhone);
        
        // Book appointment in database/system
        const appointment = await bookAppointmentInSystem({
            contactId: contact.id,
            customerName: session.data.customerName,
            customerPhone: session.data.customerPhone,
            slot: session.data.selectedSlot,
            callSid: session.callSid
        });
        
        if (appointment) {
            // Success
            const slot = session.data.selectedSlot;
            
            twiml.say(`Perfect! Your appointment has been booked for ${slot.day} at ${formatTime(slot.time)}.`);
            twiml.pause({ length: 1 });
            twiml.say(`${session.data.customerName}, you should receive a confirmation text message shortly at ${formatPhoneForSpeech(session.data.customerPhone)}.`);
            twiml.pause({ length: 1 });
            twiml.say('Thank you for calling RinglyPro. We look forward to seeing you. Goodbye!');
            
            // Send confirmation SMS
            await sendAppointmentConfirmationSMS(session.data.customerPhone, appointment);
            
            // Clean up session
            voiceSessions.delete(session.callSid);
            
            console.log(`✅ Appointment booked successfully: ${appointment.id}`);
            
        } else {
            throw new Error('Failed to book appointment');
        }
        
    } catch (error) {
        console.error('❌ Appointment booking error:', error);
        
        twiml.say('I apologize, but I\'m having trouble booking your appointment right now. Let me connect you to a representative who can help you immediately.');
        twiml.dial('+1234567892');
    }
    
    return twiml;
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

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
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

function getAvailableSlots() {
    // In production, query actual calendar database
    // For now, return mock available slots
    return availableSlots.filter(slot => slot.available).slice(0, 5);
}

// FIXED: Contact creation function with proper database integration
async function findOrCreateContact(name, phone) {
    try {
        console.log(`🔍 Looking for contact: ${name} (${phone})`);
        
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

async function bookAppointmentInSystem(appointmentData) {
    try {
        const appointmentDate = getNextDateForDay(appointmentData.slot.day);
        const appointmentTime = appointmentData.slot.time + ':00'; // Add seconds
        
        let appointment = null;
        
        // Generate confirmation code
        const confirmationCode = `VOICE${Date.now().toString().slice(-6)}`;
        
        // Try to save to database if Appointment model is available
        if (Appointment && Appointment.create) {
            appointment = await Appointment.create({
                contactId: appointmentData.contactId,
                customerName: appointmentData.customerName,
                customerPhone: appointmentData.customerPhone,
                customerEmail: `${appointmentData.customerName.replace(/\s+/g, '').toLowerCase()}@voicebooking.temp`,
                appointmentDate: appointmentDate,
                appointmentTime: appointmentTime,
                duration: 60,
                purpose: 'Voice Consultation',
                status: 'confirmed',
                source: 'voice_booking',
                confirmationCode: confirmationCode,
                notes: `Booked via voice call ${appointmentData.callSid}`
            });
            
            console.log(`📅 Appointment saved to database: ${appointment.id}`);
        } else {
            // Create mock appointment
            appointment = {
                id: Math.floor(Math.random() * 10000),
                contactId: appointmentData.contactId,
                customerName: appointmentData.customerName,
                customerPhone: appointmentData.customerPhone,
                appointmentDate: appointmentDate,
                appointmentTime: appointmentTime,
                duration: 60,
                purpose: 'Voice Consultation',
                status: 'confirmed',
                source: 'voice_booking',
                confirmationCode: confirmationCode,
                callSid: appointmentData.callSid,
                createdAt: new Date()
            };
            
            console.log(`📅 Mock appointment created: ${appointment.id}`);
        }
        
        // Mark slot as unavailable
        const slot = availableSlots.find(s => 
            s.day === appointmentData.slot.day && 
            s.time === appointmentData.slot.time
        );
        if (slot) {
            slot.available = false;
        }
        
        return appointment;
        
    } catch (error) {
        console.error('❌ Error booking appointment:', error);
        return null;
    }
}

function getNextDateForDay(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const targetDay = days.indexOf(dayName);
    
    if (targetDay === -1) return today.toISOString().split('T')[0];
    
    const daysUntilTarget = (targetDay - today.getDay() + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + (daysUntilTarget || 7)); // Next occurrence
    
    return targetDate.toISOString().split('T')[0];
}

async function sendAppointmentConfirmationSMS(phone, appointment) {
    try {
        const message = `📅 Appointment Confirmed!\n\nHi ${appointment.customerName},\n\nYour appointment is confirmed for ${appointment.appointmentDate} at ${formatTime(appointment.appointmentTime.slice(0, 5))}.\n\nLocation: RinglyPro Office\nDuration: ${appointment.duration} minutes\n\nCall us at 888-610-3810 if you need to reschedule.\n\nThank you!`;
        
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
                    contactId: appointment.contactId,
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
        note: 'Configure this URL in your Twilio phone number settings'
    });
});

module.exports = router;
