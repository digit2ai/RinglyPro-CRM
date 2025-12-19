const crmAwareAvailabilityService = require('./crmAwareAvailabilityService');
const unifiedBookingService = require('./unifiedBookingService');

class VoiceFlowHandler {
    constructor() {
        this.conversationStates = new Map(); // In-memory state storage
    }

    /**
     * Main appointment booking flow handler
     * @param {string} callSid - Twilio call identifier
     * @param {string} userInput - Transcribed user speech
     * @param {string} clientId - Client ID from database
     * @returns {object} TwiML response and conversation state
     */
    async handleAppointmentBookingFlow(callSid, userInput, clientId) {
        try {
            // Get or create conversation state
            let conversationState = this.getConversationState(callSid);
            
            console.log(`🎯 Processing step: ${conversationState.step} for client: ${clientId}`);
            console.log(`📝 User input: "${userInput}"`);

            let response;
            
            switch (conversationState.step) {
                case 'greeting':
                    response = await this.handleGreeting(userInput, conversationState, clientId);
                    break;
                    
                case 'collecting_name':
                    response = await this.collectCustomerName(userInput, conversationState);
                    break;
                    
                case 'collecting_phone':
                    response = await this.collectCustomerPhone(userInput, conversationState);
                    break;
                    
                case 'collecting_email':
                    response = await this.collectCustomerEmail(userInput, conversationState);
                    break;
                    
                case 'collecting_preferred_time':
                    response = await this.collectPreferredTime(userInput, conversationState, clientId);
                    break;
                    
                case 'confirming_appointment':
                    response = await this.confirmAppointment(userInput, conversationState, clientId);
                    break;
                    
                default:
                    response = this.generateErrorResponse('I\'m sorry, something went wrong. Let me transfer you to someone who can help.');
                    conversationState.step = 'error';
            }

            // Update conversation state
            this.updateConversationState(callSid, conversationState);
            
            return {
                success: true,
                response: response,
                conversationState: conversationState
            };

        } catch (error) {
            console.error('❌ Voice flow error:', error.message);
            return {
                success: false,
                response: this.generateErrorResponse('I apologize, but I\'m having technical difficulties. Please try calling back in a few minutes.'),
                error: error.message
            };
        }
    }

    /**
     * Handle initial greeting and intent recognition
     */
    async handleGreeting(userInput, conversationState, clientId) {
        const lowerInput = userInput.toLowerCase();
        
        // Check if user wants to book appointment
        const appointmentKeywords = ['appointment', 'book', 'schedule', 'meeting', 'consultation', 'visit'];
        const wantsAppointment = appointmentKeywords.some(keyword => lowerInput.includes(keyword));
        
        if (wantsAppointment) {
            conversationState.step = 'collecting_name';
            return this.generateVoiceResponse(
                'Great! I\'d be happy to help you schedule an appointment. First, could you please tell me your full name?',
                'collecting_name'
            );
        } else {
            // Handle other intents or ask for clarification
            conversationState.step = 'greeting';
            return this.generateVoiceResponse(
                'I can help you schedule an appointment, get pricing information, or connect you with someone. What would you like to do today?',
                'greeting'
            );
        }
    }

    /**
     * Collect customer name from voice input
     */
    async collectCustomerName(userInput, conversationState) {
        // Basic name validation and cleaning
        const cleanedName = this.extractName(userInput);
        
        if (cleanedName && cleanedName.length >= 2) {
            conversationState.customerData.name = cleanedName;
            conversationState.step = 'collecting_phone';
            
            return this.generateVoiceResponse(
                `Thank you, ${cleanedName}. Now I need your phone number for the appointment confirmation.`,
                'collecting_phone'
            );
        } else {
            conversationState.attemptCount = (conversationState.attemptCount || 0) + 1;
            
            if (conversationState.attemptCount >= 3) {
                return this.generateErrorResponse('I\'m having trouble understanding your name. Let me connect you with someone who can help.');
            }
            
            return this.generateVoiceResponse(
                'I didn\'t quite catch that. Could you please say your full name clearly?',
                'collecting_name'
            );
        }
    }

    /**
     * Collect customer phone number
     */
    async collectCustomerPhone(userInput, conversationState) {
        const phoneNumber = this.extractPhoneNumber(userInput);
        
        if (phoneNumber) {
            conversationState.customerData.phone = phoneNumber;
            conversationState.step = 'collecting_email';
            
            return this.generateVoiceResponse(
                'Perfect! And what\'s your email address? This is optional but helps with appointment confirmations.',
                'collecting_email'
            );
        } else {
            conversationState.attemptCount = (conversationState.attemptCount || 0) + 1;
            
            if (conversationState.attemptCount >= 3) {
                return this.generateErrorResponse('I\'m having trouble with the phone number. Let me transfer you to someone who can help.');
            }
            
            return this.generateVoiceResponse(
                'I couldn\'t understand the phone number. Please say your 10-digit phone number clearly, like 5-5-5, 1-2-3, 4-5-6-7.',
                'collecting_phone'
            );
        }
    }

    /**
     * Collect customer email (optional)
     */
    async collectCustomerEmail(userInput, conversationState) {
        const lowerInput = userInput.toLowerCase();
        
        // Check if user wants to skip email
        if (lowerInput.includes('skip') || lowerInput.includes('no email') || lowerInput.includes('none')) {
            conversationState.customerData.email = null;
        } else {
            const email = this.extractEmail(userInput);
            conversationState.customerData.email = email; // Can be null if not understood
        }
        
        conversationState.step = 'collecting_preferred_time';
        return this.generateVoiceResponse(
            'Great! Now, what day and time would you prefer for your appointment? I can check what\'s available.',
            'collecting_preferred_time'
        );
    }

    /**
     * Collect preferred time and check availability
     */
    async collectPreferredTime(userInput, conversationState, clientId) {
        try {
            const timePreference = this.extractTimePreference(userInput);
            
            if (!timePreference.date) {
                conversationState.attemptCount = (conversationState.attemptCount || 0) + 1;
                
                if (conversationState.attemptCount >= 3) {
                    return this.generateErrorResponse('I\'m having trouble understanding the date. Let me connect you with someone.');
                }
                
                return this.generateVoiceResponse(
                    'I didn\'t catch the date. Could you say something like "tomorrow morning" or "next Monday afternoon"?',
                    'collecting_preferred_time'
                );
            }

            // Check availability using CRM-aware service (GHL, HubSpot, Vagaro, or local)
            const availableSlots = await crmAwareAvailabilityService.getAvailableSlots(clientId, timePreference.date);
            console.log(`📅 Availability check: source=${availableSlots.source}, slots=${availableSlots.slots?.length || 0}`);
            
            if (!availableSlots.success || availableSlots.slots.length === 0) {
                return this.generateVoiceResponse(
                    `I don't have any availability on ${timePreference.date}. Would you like me to suggest some other available times?`,
                    'collecting_preferred_time'
                );
            }

            // Find best matching slot based on preference
            const suggestedSlot = this.findBestTimeSlot(availableSlots.slots, timePreference.timeOfDay);
            
            conversationState.customerData.appointment_date = suggestedSlot.date;
            conversationState.customerData.appointment_time = suggestedSlot.time;
            conversationState.suggestedSlot = suggestedSlot;
            conversationState.step = 'confirming_appointment';
            
            return this.generateVoiceResponse(
                `Perfect! I have availability on ${this.formatDateForSpeech(suggestedSlot.date)} at ${this.formatTimeForSpeech(suggestedSlot.time)}. Should I book that for you?`,
                'confirming_appointment'
            );

        } catch (error) {
            console.error('Error checking availability:', error);
            return this.generateErrorResponse('I\'m having trouble checking availability. Let me connect you with someone.');
        }
    }

    /**
     * Confirm and book the appointment
     */
    async confirmAppointment(userInput, conversationState, clientId) {
        const lowerInput = userInput.toLowerCase();
        const confirmationWords = ['yes', 'yeah', 'sure', 'ok', 'okay', 'book it', 'perfect', 'sounds good'];
        const rejectionWords = ['no', 'nah', 'not', 'different time'];
        
        const isConfirming = confirmationWords.some(word => lowerInput.includes(word));
        const isRejecting = rejectionWords.some(word => lowerInput.includes(word));
        
        if (isConfirming) {
            try {
                // Book the appointment using unified CRM-aware booking service
                // This routes to GHL, HubSpot, Vagaro, or local based on client config
                console.log(`🎯 Booking appointment for client ${clientId} via unified service`);

                const bookingResult = await unifiedBookingService.bookAppointment(clientId, {
                    customerName: conversationState.customerData.name,
                    customerPhone: conversationState.customerData.phone,
                    customerEmail: conversationState.customerData.email,
                    date: conversationState.customerData.appointment_date,
                    time: conversationState.customerData.appointment_time,
                    service: 'Consultation',
                    notes: 'Booked via Rachel Voice AI',
                    source: 'voice_booking'
                });

                console.log(`📅 Booking result: system=${bookingResult.system}, success=${bookingResult.success}`);

                if (bookingResult.success) {
                    conversationState.step = 'completed';
                    conversationState.appointmentId = bookingResult.localAppointmentId || bookingResult.meetingId;
                    conversationState.crmSystem = bookingResult.system;

                    // Use confirmation code from result
                    const confirmationCode = bookingResult.confirmationCode ||
                                           bookingResult.localAppointment?.confirmation_code ||
                                           Math.random().toString(36).substring(2, 8).toUpperCase();

                    return this.generateVoiceResponse(
                        `Excellent! Your appointment is confirmed for ${this.formatDateForSpeech(conversationState.customerData.appointment_date)} at ${this.formatTimeForSpeech(conversationState.customerData.appointment_time)}. You'll receive a confirmation text message shortly. Your confirmation code is ${confirmationCode}. Is there anything else I can help you with?`,
                        'completed'
                    );
                } else {
                    console.error(`❌ Booking failed: ${bookingResult.error}`);
                    return this.generateErrorResponse('I\'m sorry, there was an issue booking your appointment. Let me connect you with someone who can help.');
                }

            } catch (error) {
                console.error('Booking error:', error);
                return this.generateErrorResponse('I apologize, but I encountered an error while booking. Let me transfer you.');
            }
            
        } else if (isRejecting) {
            conversationState.step = 'collecting_preferred_time';
            conversationState.attemptCount = 0;
            
            return this.generateVoiceResponse(
                'No problem! What other day and time would work better for you?',
                'collecting_preferred_time'
            );
        } else {
            return this.generateVoiceResponse(
                'I didn\'t catch that. Should I book the appointment for you? Please say yes or no.',
                'confirming_appointment'
            );
        }
    }

    /**
     * Generate TwiML voice response
     */
    generateVoiceResponse(message, nextAction = null) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">${message}</Say>
    <Gather input="speech" speechTimeout="3" timeout="10" action="/voice/rachel/process-speech" method="POST">
        <Say voice="alice">I'm listening...</Say>
    </Gather>
    <Say voice="alice">I didn't hear anything. Please try again.</Say>
    <Redirect>/voice/rachel/process-speech</Redirect>
</Response>`;
    }

    /**
     * Generate error response TwiML
     */
    generateErrorResponse(message) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">${message}</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Get conversation state for call
     */
    getConversationState(callSid) {
        if (!this.conversationStates.has(callSid)) {
            this.conversationStates.set(callSid, {
                step: 'greeting',
                customerData: {},
                attemptCount: 0,
                startedAt: new Date(),
                clientId: null
            });
        }
        return this.conversationStates.get(callSid);
    }

    /**
     * Update conversation state
     */
    updateConversationState(callSid, updates) {
        const currentState = this.getConversationState(callSid);
        const updatedState = { ...currentState, ...updates };
        this.conversationStates.set(callSid, updatedState);
        return updatedState;
    }

    // Helper Methods for Voice Processing

    extractName(input) {
        // Remove common filler words and extract name
        const cleaned = input.replace(/my name is|i'm|i am|this is|call me/gi, '').trim();
        return cleaned.length > 0 ? cleaned : null;
    }

    extractPhoneNumber(input) {
        // Extract phone number from speech
        const phoneRegex = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4})/;
        const match = input.match(phoneRegex);
        
        if (match) {
            // Clean and format phone number
            const digits = match[0].replace(/\D/g, '');
            if (digits.length === 10) {
                return `+1${digits}`;
            }
        }
        
        // Try to extract digits from speech (like "five five five one two three...")
        const digitWords = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
        };
        
        let digits = '';
        const words = input.toLowerCase().split(/\s+/);
        
        for (const word of words) {
            if (digitWords[word]) {
                digits += digitWords[word];
            } else if (/^\d$/.test(word)) {
                digits += word;
            }
        }
        
        if (digits.length === 10) {
            return `+1${digits}`;
        }
        
        return null;
    }

    extractEmail(input) {
        // Basic email extraction from speech
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const match = input.match(emailRegex);
        return match ? match[0] : null;
    }

    extractTimePreference(input) {
        const lowerInput = input.toLowerCase();
        const today = new Date();
        let targetDate = null;
        let timeOfDay = 'morning'; // default
        
        // Date extraction
        if (lowerInput.includes('today')) {
            targetDate = today.toISOString().split('T')[0];
        } else if (lowerInput.includes('tomorrow')) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            targetDate = tomorrow.toISOString().split('T')[0];
        } else if (lowerInput.includes('monday')) {
            targetDate = this.getNextWeekday(1); // Monday = 1
        } else if (lowerInput.includes('tuesday')) {
            targetDate = this.getNextWeekday(2);
        } else if (lowerInput.includes('wednesday')) {
            targetDate = this.getNextWeekday(3);
        } else if (lowerInput.includes('thursday')) {
            targetDate = this.getNextWeekday(4);
        } else if (lowerInput.includes('friday')) {
            targetDate = this.getNextWeekday(5);
        }
        
        // Time of day extraction
        if (lowerInput.includes('morning')) {
            timeOfDay = 'morning';
        } else if (lowerInput.includes('afternoon')) {
            timeOfDay = 'afternoon';
        } else if (lowerInput.includes('evening')) {
            timeOfDay = 'evening';
        }
        
        return { date: targetDate, timeOfDay };
    }

    getNextWeekday(targetDay) {
        const today = new Date();
        const currentDay = today.getDay();
        let daysUntilTarget = targetDay - currentDay;
        
        if (daysUntilTarget <= 0) {
            daysUntilTarget += 7; // Next week
        }
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysUntilTarget);
        return targetDate.toISOString().split('T')[0];
    }

    findBestTimeSlot(slots, timeOfDay) {
        // Filter slots by time of day preference
        const filtered = slots.filter(slot => {
            const hour = parseInt(slot.time.split(':')[0]);
            
            switch (timeOfDay) {
                case 'morning':
                    return hour >= 8 && hour < 12;
                case 'afternoon':
                    return hour >= 12 && hour < 17;
                case 'evening':
                    return hour >= 17 && hour < 20;
                default:
                    return true;
            }
        });
        
        // Return first available slot in preferred time, or first available overall
        return filtered.length > 0 ? filtered[0] : slots[0];
    }

    formatDateForSpeech(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    formatTimeForSpeech(timeString) {
        const [hour, minute] = timeString.split(':');
        const hourNum = parseInt(hour);
        const period = hourNum >= 12 ? 'PM' : 'AM';
        const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
        return `${displayHour}:${minute} ${period}`;
    }
}

module.exports = new VoiceFlowHandler();