// =====================================================
// Lead Response Automation Service
// File: src/services/leadResponseService.js
// Purpose: AI-powered lead response automation for WhatsApp
// Features: Language detection, intent classification, lead qualification
// Integration: Claude AI, Vagaro scheduling
// =====================================================

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const whatsappService = require('./whatsappService');
const ghlBookingService = require('./ghlBookingService');
const {
  getLeadResponsePrompt,
  getIntentClassificationPrompt,
  getResponseGenerationPrompt,
  getAppointmentExtractionPrompt,
  getLeadQualificationPrompt
} = require('../prompts/whatsapp-lead-response');

// Claude client (lazy initialization)
let anthropicClient = null;

/**
 * Get or create Anthropic client
 * @returns {object} Anthropic client
 */
function getAnthropicClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

/**
 * Check if Claude AI is configured
 * @returns {boolean} Configuration status
 */
function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Call Claude API for text generation
 * @param {string} systemPrompt - System prompt
 * @param {string} userMessage - User message
 * @param {object} options - Additional options
 * @returns {Promise<string>} AI response
 */
async function callClaude(systemPrompt, userMessage, options = {}) {
  const client = getAnthropicClient();

  if (!client) {
    throw new Error('Claude AI not configured');
  }

  try {
    const response = await client.messages.create({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });

    return response.content[0]?.text || '';

  } catch (error) {
    logger.error('[LEAD-RESPONSE] Claude API error:', error.message);
    throw error;
  }
}

/**
 * Classify message intent using Claude AI
 * @param {string} message - Customer message
 * @param {string} language - Detected language
 * @returns {Promise<object>} Intent classification
 */
async function classifyIntent(message, language = 'en') {
  try {
    // First try simple pattern matching
    const simpleIntent = whatsappService.parseIntent(message, language);

    // If confidence is high, use simple detection
    if (simpleIntent.confidence >= 0.85) {
      return {
        ...simpleIntent,
        method: 'pattern_match'
      };
    }

    // Use Claude for complex cases
    if (!isConfigured()) {
      return {
        ...simpleIntent,
        method: 'pattern_match_fallback'
      };
    }

    const prompt = getIntentClassificationPrompt(message, language);
    const response = await callClaude(
      'You are an intent classification assistant. Respond only with valid JSON.',
      prompt,
      { maxTokens: 300 }
    );

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...parsed,
        language,
        method: 'claude_ai'
      };
    }

    // Fallback to simple detection
    return {
      ...simpleIntent,
      method: 'fallback'
    };

  } catch (error) {
    logger.error('[LEAD-RESPONSE] Intent classification error:', error.message);
    return whatsappService.parseIntent(message, language);
  }
}

/**
 * Generate AI-powered response for customer message
 * @param {string} customerMessage - Customer's message
 * @param {object} context - Conversation context
 * @param {object} clientConfig - Client configuration
 * @returns {Promise<object>} Generated response
 */
async function generateResponse(customerMessage, context = {}, clientConfig = {}) {
  const {
    conversationHistory = [],
    customerName = null,
    customerPhone = null,
    clientId = null,
    lastIntent = null
  } = context;

  const {
    businessName = 'our business',
    businessType = 'service business',
    services = [],
    hours = null,
    vagaroEnabled = false,
    language = 'en',
    deposit = { type: 'none', value: null },
    booking = { system: 'none', url: null },
    zelle = null,
    bookingUrl = null
  } = clientConfig;

  try {
    // Detect language if not specified
    const detectedLanguage = language || whatsappService.detectLanguage(customerMessage);

    // Classify intent
    const intent = await classifyIntent(customerMessage, detectedLanguage);

    logger.info(`[LEAD-RESPONSE] Intent: ${intent.intent}, Confidence: ${intent.confidence}, Language: ${detectedLanguage}`);

    // Build conversation context
    const conversationContext = {
      customerName,
      customerPhone,
      clientId,
      lastIntent,
      currentIntent: intent,
      messageCount: conversationHistory.length + 1,
      language: detectedLanguage,
      businessName,
      vagaroEnabled
    };

    let responseText;
    let requiresHuman = false;

    // Helper function to check for menu selection
    const getMenuSelection = (msg) => {
      const trimmed = msg.trim().toLowerCase();
      // Check for number selection (1, 2, 3, 4) or emoji numbers
      if (trimmed === '1' || trimmed === '1️⃣' || trimmed.includes('book') || trimmed.includes('agendar') || trimmed.includes('cita') || trimmed.includes('appointment')) {
        return 'appointment';
      }
      if (trimmed === '2' || trimmed === '2️⃣') {
        return 'zelle';
      }
      if (trimmed === '3' || trimmed === '3️⃣' || trimmed.includes('service') || trimmed.includes('servicio') || trimmed.includes('price') || trimmed.includes('precio')) {
        return 'services';
      }
      if (trimmed === '4' || trimmed === '4️⃣' || trimmed.includes('agent') || trimmed.includes('agente') || trimmed.includes('human') || trimmed.includes('persona')) {
        return 'human';
      }
      return null;
    };

    // Helper function to detect if we're in booking flow from conversation history
    // Checks if Rachel/Lina's last message was asking for booking info
    const isInBookingFlow = (history) => {
      if (!history || history.length === 0) {
        logger.info('[LEAD-RESPONSE] isInBookingFlow: No history');
        return false;
      }

      // Find the last outgoing message (Rachel's response)
      const lastOutgoing = [...history].reverse().find(m => m.direction === 'outgoing');
      if (!lastOutgoing) {
        logger.info('[LEAD-RESPONSE] isInBookingFlow: No outgoing message in history');
        return false;
      }

      const body = (lastOutgoing.body || '').toLowerCase();
      logger.info(`[LEAD-RESPONSE] isInBookingFlow: Last outgoing body starts with: "${body.substring(0, 80)}..."`);

      // Check if last response was asking for booking info
      const bookingPrompts = [
        'full name', 'nombre completo',                    // Step 1: asking for name
        'phone number', 'teléfono', 'número de teléfono', // Step 2: asking for phone
        'phone', 'telefono',                               // More phone variations
        'email', 'correo',                                 // Step 3: asking for email
        'available times', 'horarios disponibles',         // Step 4: showing time slots
        'reply with the number', 'responde con el número', // Asking for slot selection
        'schedule your appointment', 'agendar tu cita',    // Starting booking flow
        'let\'s schedule', 'vamos a agendar'               // More start phrases
      ];

      const found = bookingPrompts.some(prompt => body.includes(prompt));
      logger.info(`[LEAD-RESPONSE] isInBookingFlow: Found booking prompt? ${found}`);
      return found;
    };

    // Helper function to check for payment-related keywords (including typos)
    const isPaymentRelated = (msg) => {
      const lowerMsg = msg.toLowerCase();
      const paymentKeywords = [
        'payment', 'pay', 'pyment', 'paymnt', 'payement',  // English + typos
        'deposit', 'deposito', 'depósito', 'deposite',     // Deposit variations
        'zelle', 'zel', 'zell',                             // Zelle variations
        'pago', 'pagar', 'pagos',                           // Spanish
        'send money', 'enviar dinero', 'transfer',
        'how do i pay', 'como pago', 'quiero pagar',
        'want to pay', 'ready to pay', 'listo para pagar'
      ];
      return paymentKeywords.some(keyword => lowerMsg.includes(keyword));
    };

    // PRIORITY 0: Check for menu selection
    // Works on any message that looks like a menu selection (1, 2, 3, 4 or keywords)
    const menuSelection = getMenuSelection(customerMessage);
    const isDirectMenuNumber = ['1', '2', '3', '4'].includes(customerMessage.trim());

    // PRIORITY 0.5: Continue appointment flow if user is in the middle of booking
    // This handles: user provided name, user selecting time slot, etc.
    // Check if: starting booking (menu selection) OR continuing booking (last message was booking prompt)
    const inBookingFlow = isInBookingFlow(conversationHistory);
    logger.info(`[LEAD-RESPONSE] Booking flow check: menuSelection=${menuSelection}, inBookingFlow=${inBookingFlow}`);

    if (menuSelection === 'appointment' || inBookingFlow) {
      // User is in booking flow OR just started it
      // Pass conversationHistory to handleAppointmentIntent for data extraction
      const appointmentContext = { ...conversationContext, conversationHistory };
      const appointmentResult = await handleAppointmentIntent(customerMessage, appointmentContext, clientConfig);

      // handleAppointmentIntent may return a string or an object with {text, mediaUrl}
      const isStructured = typeof appointmentResult === 'object' && appointmentResult.text;
      responseText = isStructured ? appointmentResult.text : appointmentResult;

      return {
        success: true,
        response: responseText,
        mediaUrl: isStructured ? appointmentResult.mediaUrl : null,
        intent: { intent: 'appointment' },
        language: detectedLanguage,
        requiresHuman: false,
        context: conversationContext
      };
    }

    if (menuSelection && (isDirectMenuNumber || conversationContext.messageCount > 1)) {
      // Menu selection handled above for appointment, handle others here
      if (menuSelection === 'zelle') {
        // Show Zelle info
        if (zelle?.enabled && zelle?.email) {
          const depositAmount = deposit?.type !== 'none' && deposit?.value
            ? (deposit.type === 'fixed' ? `$${deposit.value}` : `${deposit.value}%`)
            : (zelle.defaultAmount ? `$${zelle.defaultAmount}` : '');

          responseText = zelle.depositMessage || (detectedLanguage === 'es'
            ? `Para asegurar tu cita, envía un depósito${depositAmount ? ` de ${depositAmount}` : ''} por Zelle a: ${zelle.email}`
            : `To secure your appointment, please send a deposit${depositAmount ? ` of ${depositAmount}` : ''} via Zelle to: ${zelle.email}`);

          if (zelle.qrCodeUrl) {
            responseText += detectedLanguage === 'es'
              ? '\n\n📲 Te envío nuestro código QR para facilitar el pago.'
              : '\n\n📲 Here is our QR code for easy payment.';
          }
        } else {
          responseText = detectedLanguage === 'es'
            ? 'El pago por Zelle no está configurado actualmente. Por favor contacta a un agente. 📞'
            : 'Zelle payment is not currently configured. Please contact an agent. 📞';
        }
        return {
          success: true,
          response: responseText,
          intent: { intent: 'payment' },
          language: detectedLanguage,
          requiresHuman: false,
          context: conversationContext
        };
      }
      if (menuSelection === 'services') {
        // Show services list
        if (services.length > 0) {
          const servicesList = services.slice(0, 6).map((s, i) =>
            `${i + 1}. ${s.name}${s.price ? ` - $${s.price}` : ''}${s.duration ? ` (${s.duration} min)` : ''}`
          ).join('\n');

          responseText = detectedLanguage === 'es'
            ? `¡Claro! Aquí están nuestros servicios:\n\n${servicesList}\n\n¿Cuál te interesa? Responde con el número o el nombre del servicio para agendar.`
            : `Of course! Here are our services:\n\n${servicesList}\n\nWhich one interests you? Reply with the number or service name to book.`;
        } else {
          responseText = detectedLanguage === 'es'
            ? `¿Qué servicio te interesa? Puedo darte información sobre precios y disponibilidad.`
            : `What service are you interested in? I can give you pricing and availability information.`;
        }
        return {
          success: true,
          response: responseText,
          intent: { intent: 'services' },
          language: detectedLanguage,
          requiresHuman: false,
          context: conversationContext
        };
      }
      if (menuSelection === 'human') {
        // Request human agent
        responseText = detectedLanguage === 'es'
          ? `Entendido. Un miembro de nuestro equipo te contactará pronto. 📞\n\nMientras tanto, ¿hay algo más en lo que pueda ayudarte?`
          : `Got it. A team member will contact you shortly. 📞\n\nIn the meantime, is there anything else I can help you with?`;
        return {
          success: true,
          response: responseText,
          intent: { intent: 'human_request' },
          language: detectedLanguage,
          requiresHuman: true,
          context: conversationContext
        };
      }
    }

    // PRIORITY 1: Check for payment intent FIRST (before human escalation)
    if (isPaymentRelated(customerMessage)) {
      // Payment/deposit request - send Zelle info if configured
      if (zelle?.enabled && zelle?.email) {
        const depositAmount = deposit?.type !== 'none' && deposit?.value
          ? (deposit.type === 'fixed' ? `$${deposit.value}` : `${deposit.value}%`)
          : (zelle.defaultAmount ? `$${zelle.defaultAmount}` : '');

        const zelleMsg = zelle.depositMessage || (detectedLanguage === 'es'
          ? `Para asegurar tu cita, envía un depósito${depositAmount ? ` de ${depositAmount}` : ''} por Zelle a: ${zelle.email}`
          : `To secure your appointment, please send a deposit${depositAmount ? ` of ${depositAmount}` : ''} via Zelle to: ${zelle.email}`);

        responseText = zelleMsg;
        if (zelle.qrCodeUrl) {
          responseText += detectedLanguage === 'es'
            ? '\n\n📲 Te envío nuestro código QR para facilitar el pago.'
            : '\n\n📲 Here is our QR code for easy payment.';
        }
      } else {
        responseText = detectedLanguage === 'es'
          ? 'Para información sobre pagos y depósitos, un miembro de nuestro equipo te contactará pronto. 📞'
          : 'For payment and deposit information, a team member will contact you shortly. 📞';
      }
    }
    // Check if human escalation is needed
    else if (intent.requires_human || intent.intent === 'complaint') {
      requiresHuman = true;
      responseText = detectedLanguage === 'es'
        ? `Entiendo tu preocupación. Voy a transferir tu consulta a uno de nuestros agentes que podrá ayudarte mejor. Te contactarán pronto. 📞`
        : `I understand your concern. Let me transfer your inquiry to one of our team members who can better assist you. They'll contact you shortly. 📞`;
    }
    // Handle based on intent
    else if (intent.intent === 'greeting') {
      // Greeting - ALWAYS show menu with options
      const hasZelle = zelle?.enabled && zelle?.email;
      const hasBooking = booking?.system !== 'none' || vagaroEnabled;

      let menuOptions = [];
      if (hasBooking) {
        menuOptions.push(detectedLanguage === 'es' ? '1️⃣ Agendar una cita' : '1️⃣ Book an Appointment');
      }
      if (hasZelle) {
        menuOptions.push(detectedLanguage === 'es' ? '2️⃣ Hacer un depósito con Zelle' : '2️⃣ Make a Zelle Deposit');
      }
      menuOptions.push(detectedLanguage === 'es' ? '3️⃣ Información de servicios' : '3️⃣ Service Information');
      menuOptions.push(detectedLanguage === 'es' ? '4️⃣ Hablar con un agente' : '4️⃣ Speak with an Agent');

      const menuText = menuOptions.join('\n');

      responseText = detectedLanguage === 'es'
        ? `¡Hola! 👋 Soy Lina, asistente virtual de ${businessName}.\n\n¿En qué puedo ayudarte hoy?\n\n${menuText}\n\nResponde con el número o escribe tu consulta.`
        : `Hi! 👋 I'm Rachel, the virtual assistant for ${businessName}.\n\nHow can I help you today?\n\n${menuText}\n\nReply with the number or type your question.`;
    }
    else if (intent.intent === 'appointment') {
      // Appointment booking intent
      const appointmentContext = { ...conversationContext, conversationHistory };
      responseText = await handleAppointmentIntent(customerMessage, appointmentContext, clientConfig);
    }
    else if (intent.intent === 'pricing' || intent.intent === 'inquiry') {
      // Pricing or general inquiry - show services with prices if available
      if (services.length > 0) {
        const servicesList = services.slice(0, 6).map((s, i) =>
          `${i + 1}. ${s.name}${s.price ? ` - $${s.price}` : ''}${s.duration ? ` (${s.duration} min)` : ''}`
        ).join('\n');

        responseText = detectedLanguage === 'es'
          ? `¡Claro! Aquí están nuestros servicios:\n\n${servicesList}\n\n¿Cuál te interesa? Responde con el número o el nombre del servicio.`
          : `Of course! Here are our services:\n\n${servicesList}\n\nWhich one interests you? Reply with the number or service name.`;
      } else {
        responseText = detectedLanguage === 'es'
          ? `¡Claro! ¿Qué servicio te interesa? Así puedo darte información más específica sobre precios y disponibilidad.`
          : `Of course! Which service are you interested in? I can give you more specific information about pricing and availability.`;
      }
    }
    else if (intent.intent === 'hours') {
      // Business hours inquiry
      const hoursText = hours
        ? `${hours.start} - ${hours.end}`
        : detectedLanguage === 'es' ? 'horario regular de atención' : 'regular business hours';

      responseText = detectedLanguage === 'es'
        ? `Nuestro horario de atención es ${hoursText}. ¿Te gustaría agendar una cita?`
        : `Our business hours are ${hoursText}. Would you like to schedule an appointment?`;
    }
    else if (intent.intent === 'cancel' || intent.intent === 'reschedule') {
      // Cancel or reschedule
      responseText = detectedLanguage === 'es'
        ? `Entendido. Para ${intent.intent === 'cancel' ? 'cancelar' : 'reprogramar'} tu cita, ¿puedes darme tu nombre y la fecha de tu cita actual?`
        : `Understood. To ${intent.intent === 'cancel' ? 'cancel' : 'reschedule'} your appointment, can you give me your name and the date of your current appointment?`;
    }
    else {
      // Use Claude for complex responses
      if (isConfigured()) {
        const systemPrompt = getLeadResponsePrompt({
          language: detectedLanguage,
          businessName,
          businessType,
          services,
          hours,
          vagaroEnabled
        });

        const responsePrompt = getResponseGenerationPrompt(customerMessage, conversationContext, detectedLanguage);
        responseText = await callClaude(systemPrompt, responsePrompt, { maxTokens: 300 });
      } else {
        // Fallback without AI
        responseText = detectedLanguage === 'es'
          ? `Gracias por tu mensaje. ¿Puedo ayudarte con información sobre nuestros servicios o agendar una cita?`
          : `Thank you for your message. Can I help you with information about our services or schedule an appointment?`;
      }
    }

    return {
      success: true,
      response: responseText,
      intent,
      language: detectedLanguage,
      requiresHuman,
      context: conversationContext
    };

  } catch (error) {
    logger.error('[LEAD-RESPONSE] Generate response error:', error.message);

    // Return safe fallback
    const fallbackLang = whatsappService.detectLanguage(customerMessage);
    return {
      success: false,
      response: fallbackLang === 'es'
        ? 'Gracias por tu mensaje. Un agente te contactará pronto. 📞'
        : 'Thank you for your message. An agent will contact you soon. 📞',
      intent: { intent: 'unknown' },
      language: fallbackLang,
      requiresHuman: true,
      error: error.message
    };
  }
}

/**
 * Handle appointment booking intent
 * @param {string} message - Customer message
 * @param {object} context - Conversation context
 * @param {object} clientConfig - Client configuration
 * @returns {Promise<string>} Response text
 */
async function handleAppointmentIntent(message, context, clientConfig) {
  const { language, customerName, customerPhone, businessName, vagaroEnabled, clientId, conversationHistory = [] } = context;
  const {
    services = [],
    booking = { system: 'none', url: null },
    deposit = { type: 'none', value: null },
    zelle = null,
    bookingUrl = null
  } = clientConfig;

  logger.info('[LEAD-RESPONSE] handleAppointmentIntent called', {
    customerName, customerPhone, bookingSystem: booking?.system, historyLength: conversationHistory.length,
    message: message.substring(0, 50)
  });

  // ============================================
  // EXTRACT BOOKING DATA FROM CONVERSATION HISTORY
  // Look through previous messages to find name, phone, email
  // ============================================
  const extractedData = extractBookingDataFromHistory(conversationHistory, message);
  logger.info('[LEAD-RESPONSE] Extracted booking data:', JSON.stringify(extractedData));

  // Check if we have a booking link to provide (Calendly, custom link)
  const effectiveBookingUrl = booking?.url || bookingUrl;
  const hasBookingLink = booking?.system === 'link' || booking?.system === 'calendly';

  if (hasBookingLink && effectiveBookingUrl) {
    let response = language === 'es'
      ? `¡Perfecto! Puedes agendar tu cita directamente aquí:\n\n📅 ${effectiveBookingUrl}`
      : `Perfect! You can book your appointment directly here:\n\n📅 ${effectiveBookingUrl}`;

    if (deposit?.type !== 'none' && deposit?.value && zelle?.enabled) {
      const depositAmount = deposit.type === 'fixed' ? `$${deposit.value}` : `${deposit.value}%`;
      response += language === 'es'
        ? `\n\n💰 Se requiere un depósito de ${depositAmount} para confirmar.`
        : `\n\n💰 A ${depositAmount} deposit is required to confirm.`;
    }
    return response;
  }

  // ============================================
  // CONVERSATIONAL BOOKING FLOW
  // Step 1: Ask for name
  // Step 2: Ask for phone number
  // Step 3: Ask for email
  // Step 4: Fetch availability & offer 3 slots
  // Step 5: Book when user selects a slot
  // Step 6: Include Zelle QR code in confirmation
  // ============================================

  const msgTrimmed = message.trim();
  const msgLower = msgTrimmed.toLowerCase();

  // Detect what the current message looks like
  const looksLikeName = msgTrimmed.length > 2 &&
    !/^\d+$/.test(msgTrimmed) &&
    !msgTrimmed.includes('@') &&
    !/^\+?\d{10,}$/.test(msgTrimmed.replace(/[\s\-\(\)]/g, '')) &&
    !/^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(msgTrimmed);
  const looksLikePhone = /^\+?\d{10,}$/.test(msgTrimmed.replace(/[\s\-\(\)]/g, '')) ||
    /^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(msgTrimmed);
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msgTrimmed);
  const isSlotSelection = ['1', '2', '3'].includes(msgTrimmed);

  // STEP 1: User just selected "1" to book OR this is start of booking flow - ask for name
  if ((msgTrimmed === '1' || msgLower.includes('book') || msgLower.includes('appointment') || msgLower.includes('cita') || msgLower.includes('agendar')) &&
      !extractedData.name && !extractedData.phone && !extractedData.email) {
    return language === 'es'
      ? '¡Perfecto! 📅 Vamos a agendar tu cita.\n\n¿Cuál es tu nombre completo?'
      : 'Perfect! 📅 Let\'s schedule your appointment.\n\nWhat is your full name?';
  }

  // STEP 2: We have name (from history or current message) but no phone - ask for phone
  // Current message looks like a name OR we already have name in history, but no phone yet
  if (extractedData.name && !extractedData.phone && !extractedData.email) {
    // User has provided name, now ask for phone
    const nameToUse = extractedData.name;
    return language === 'es'
      ? `¡Gracias ${nameToUse}! 📱\n\n¿Cuál es el mejor número de teléfono para contactarte?`
      : `Thanks ${nameToUse}! 📱\n\nWhat's the best phone number to reach you?`;
  }

  // STEP 3: We have name, current message is phone - ask for email
  if (looksLikePhone && extractedData.name) {
    return language === 'es'
      ? '¡Perfecto! 📧\n\n¿Cuál es tu dirección de correo electrónico?'
      : 'Perfect! 📧\n\nWhat is your email address?';
  }

  // STEP 4: We have name and phone, current message is email - show available time slots
  if (looksLikeEmail && extractedData.name && extractedData.phone) {
    // Store email from current message
    const userEmail = msgTrimmed;

    // Now show available time slots
    const formatDate = (d) => d.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    // For GHL booking - try to fetch available slots
    if (booking?.system === 'ghl' && clientId) {
      try {
        const today = new Date();
        const slots = [];

        for (let i = 1; i <= 7 && slots.length < 3; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() + i);
          if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;

          const dateStr = checkDate.toISOString().split('T')[0];
          const dayName = formatDate(checkDate);

          const ghlSlots = await ghlBookingService.getAvailableSlots(clientId, booking.ghlCalendarId, dateStr);

          if (ghlSlots.success && ghlSlots.slots?.length > 0) {
            const morning = ghlSlots.slots.find(s => s.includes('10:') || s.includes('11:'));
            const afternoon = ghlSlots.slots.find(s => s.includes('14:') || s.includes('15:'));
            const selectedTime = morning || afternoon || ghlSlots.slots[0];
            slots.push({ date: dateStr, time: selectedTime, display: `${dayName} @ ${formatTime(selectedTime)}` });
          } else {
            slots.push({ date: dateStr, time: '10:00', display: `${dayName} @ 10:00 AM` });
          }
        }

        if (slots.length > 0) {
          const slotOptions = slots.map((s, i) => `${i + 1}️⃣ ${s.display}`).join('\n');
          return language === 'es'
            ? `¡Excelente ${extractedData.name}! 📅\n\nAquí tienes nuestros próximos horarios disponibles:\n\n${slotOptions}\n\nResponde con el número (1, 2, o 3) para confirmar tu cita.`
            : `Excellent ${extractedData.name}! 📅\n\nHere are our next available times:\n\n${slotOptions}\n\nReply with the number (1, 2, or 3) to confirm your appointment.`;
        }
      } catch (ghlError) {
        logger.error('[LEAD-RESPONSE] Error fetching GHL availability:', ghlError.message);
      }
    }

    // Fallback time slots
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfter2 = new Date(); dayAfter2.setDate(dayAfter2.getDate() + 3);

    return language === 'es'
      ? `¡Excelente ${extractedData.name}! 📅\n\nAquí tienes nuestros próximos horarios disponibles:\n\n1️⃣ ${formatDate(tomorrow)} @ 10:00 AM\n2️⃣ ${formatDate(dayAfter)} @ 2:00 PM\n3️⃣ ${formatDate(dayAfter2)} @ 11:00 AM\n\nResponde con el número (1, 2, o 3) para confirmar tu cita.`
      : `Excellent ${extractedData.name}! 📅\n\nHere are our next available times:\n\n1️⃣ ${formatDate(tomorrow)} @ 10:00 AM\n2️⃣ ${formatDate(dayAfter)} @ 2:00 PM\n3️⃣ ${formatDate(dayAfter2)} @ 11:00 AM\n\nReply with the number (1, 2, or 3) to confirm your appointment.`;
  }

  // STEP 5: User selecting a time slot (1, 2, or 3) - we should have name, phone, email in history
  if (isSlotSelection && extractedData.name && extractedData.phone && extractedData.email) {
    const slotIndex = parseInt(msgTrimmed) - 1;

    // Calculate the date/time based on selection
    const today = new Date();
    const selectedDate = new Date(today);
    selectedDate.setDate(today.getDate() + slotIndex + 1);

    // Skip weekends
    while (selectedDate.getDay() === 0 || selectedDate.getDay() === 6) {
      selectedDate.setDate(selectedDate.getDate() + 1);
    }

    const times = ['10:00', '14:00', '11:00'];
    const selectedTime = times[slotIndex] || '10:00';
    const dateStr = selectedDate.toISOString().split('T')[0];

    const formattedDate = selectedDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    const formattedTime = formatTime(selectedTime);

    // Try to book via GHL
    if (booking?.system === 'ghl' && clientId) {
      try {
        const ghlResult = await ghlBookingService.bookFromWhatsApp(clientId, {
          customerName: extractedData.name,
          customerPhone: extractedData.phone || customerPhone,
          customerEmail: extractedData.email,
          date: dateStr,
          time: selectedTime,
          service: 'Appointment',
          calendarId: booking.ghlCalendarId,
          notes: `Booked via WhatsApp\nCustomer: ${extractedData.name}\nPhone: ${extractedData.phone}\nEmail: ${extractedData.email}`
        });

        if (ghlResult.success) {
          let successMsg = language === 'es'
            ? `✅ ¡Tu cita ha sido confirmada!\n\n📅 ${formattedDate}\n🕐 ${formattedTime}\n👤 ${extractedData.name}\n📱 ${extractedData.phone}\n📧 ${extractedData.email}`
            : `✅ Your appointment has been confirmed!\n\n📅 ${formattedDate}\n🕐 ${formattedTime}\n👤 ${extractedData.name}\n📱 ${extractedData.phone}\n📧 ${extractedData.email}`;

          let qrCodeUrl = null;

          // Add Zelle deposit information
          if (zelle?.enabled && zelle?.email) {
            const depositAmount = (deposit?.type !== 'none' && deposit?.value)
              ? (deposit.type === 'fixed' ? `$${deposit.value}` : `${deposit.value}%`)
              : (zelle.defaultAmount ? `$${zelle.defaultAmount}` : '');

            successMsg += language === 'es'
              ? `\n\n💰 Para asegurar tu cita, envía un depósito${depositAmount ? ` de ${depositAmount}` : ''} por Zelle a:\n📧 ${zelle.email}`
              : `\n\n💰 To secure your appointment, please send a deposit${depositAmount ? ` of ${depositAmount}` : ''} via Zelle to:\n📧 ${zelle.email}`;

            if (zelle.qrCodeUrl) {
              qrCodeUrl = zelle.qrCodeUrl;
              successMsg += language === 'es'
                ? '\n\n📲 Te envío el código QR para facilitar el pago.'
                : '\n\n📲 Here is our QR code for easy payment.';
            }
          }

          successMsg += language === 'es'
            ? '\n\n¡Gracias! Te esperamos. 🙌'
            : '\n\nThank you! We look forward to seeing you. 🙌';

          // Return structured response with QR code URL if available
          if (qrCodeUrl) {
            return { text: successMsg, mediaUrl: qrCodeUrl };
          }
          return successMsg;
        }
      } catch (ghlError) {
        logger.error('[LEAD-RESPONSE] GHL booking error:', ghlError.message);
      }
    }

    // Fallback confirmation (manual process)
    let fallbackMsg = language === 'es'
      ? `✅ ¡Excelente elección!\n\n📅 ${formattedDate} @ ${formattedTime}\n👤 ${extractedData.name}\n📱 ${extractedData.phone}\n📧 ${extractedData.email}`
      : `✅ Excellent choice!\n\n📅 ${formattedDate} @ ${formattedTime}\n👤 ${extractedData.name}\n📱 ${extractedData.phone}\n📧 ${extractedData.email}`;

    let qrCodeUrl = null;

    // Add Zelle deposit information for fallback too
    if (zelle?.enabled && zelle?.email) {
      const depositAmount = (deposit?.type !== 'none' && deposit?.value)
        ? (deposit.type === 'fixed' ? `$${deposit.value}` : `${deposit.value}%`)
        : (zelle.defaultAmount ? `$${zelle.defaultAmount}` : '');

      fallbackMsg += language === 'es'
        ? `\n\n💰 Para asegurar tu cita, envía un depósito${depositAmount ? ` de ${depositAmount}` : ''} por Zelle a:\n📧 ${zelle.email}`
        : `\n\n💰 To secure your appointment, please send a deposit${depositAmount ? ` of ${depositAmount}` : ''} via Zelle to:\n📧 ${zelle.email}`;

      if (zelle.qrCodeUrl) {
        qrCodeUrl = zelle.qrCodeUrl;
        fallbackMsg += language === 'es'
          ? '\n\n📲 Te envío el código QR para facilitar el pago.'
          : '\n\n📲 Here is our QR code for easy payment.';
      }
    }

    fallbackMsg += language === 'es'
      ? '\n\nUn miembro de nuestro equipo confirmará tu cita pronto. ¡Gracias! 🙌'
      : '\n\nA team member will confirm your appointment shortly. Thank you! 🙌';

    // Return structured response with QR code URL if available
    if (qrCodeUrl) {
      return { text: fallbackMsg, mediaUrl: qrCodeUrl };
    }
    return fallbackMsg;
  }

  // Default: Ask for name to start the flow
  return language === 'es'
    ? '¡Perfecto! 📅 Vamos a agendar tu cita.\n\n¿Cuál es tu nombre completo?'
    : 'Perfect! 📅 Let\'s schedule your appointment.\n\nWhat is your full name?';
}

/**
 * Extract booking data from conversation history
 * Looks for name, phone, email in previous messages
 * @param {Array} history - Conversation history
 * @param {string} currentMessage - Current message being processed
 * @returns {object} Extracted data {name, phone, email}
 */
function extractBookingDataFromHistory(history, currentMessage) {
  const data = { name: null, phone: null, email: null };

  // Patterns for detection
  const phonePattern = /^\+?\d{10,}$|^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  logger.info(`[LEAD-RESPONSE] extractBookingData: history has ${history.length} messages`);

  // Process all messages in history (both incoming and outgoing)
  for (const msg of history) {
    const body = (msg.body || '').trim();
    const cleanBody = body.replace(/[\s\-\(\)]/g, '');
    const direction = msg.direction;

    // Only check incoming messages for user data
    if (direction !== 'incoming') continue;

    // Skip menu selections and short responses
    if (['1', '2', '3', '4'].includes(body)) continue;

    // Skip greetings
    const lowerBody = body.toLowerCase();
    if (lowerBody === 'hi' || lowerBody === 'hello' || lowerBody === 'hola' ||
        lowerBody === 'hey' || lowerBody === 'good morning' || lowerBody === 'buenos dias') continue;

    logger.info(`[LEAD-RESPONSE] extractBookingData: Checking incoming message: "${body}"`);

    // Check for email
    if (emailPattern.test(body) && !data.email) {
      data.email = body;
      logger.info(`[LEAD-RESPONSE] extractBookingData: Found email: ${body}`);
      continue;
    }

    // Check for phone
    if ((phonePattern.test(cleanBody) || /^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(body)) && !data.phone) {
      data.phone = body;
      logger.info(`[LEAD-RESPONSE] extractBookingData: Found phone: ${body}`);
      continue;
    }

    // Check for name (text that's not a number, email, or phone)
    if (body.length > 2 &&
        !/^\d+$/.test(body) &&
        !body.includes('@') &&
        !phonePattern.test(cleanBody) &&
        !/^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(body) &&
        !lowerBody.includes('book') &&
        !lowerBody.includes('appointment') &&
        !lowerBody.includes('cita') &&
        !lowerBody.includes('agendar') &&
        !data.name) {
      data.name = body;
      logger.info(`[LEAD-RESPONSE] extractBookingData: Found name: ${body}`);
    }
  }

  return data;
}

/**
 * Format time string to readable format
 */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes || '00'} ${ampm}`;
}

/**
 * Qualify a lead based on conversation data
 * @param {object} leadData - Lead information
 * @param {string} language - Language
 * @returns {Promise<object>} Lead qualification
 */
async function qualifyLead(leadData, language = 'en') {
  try {
    if (!isConfigured()) {
      // Simple scoring without AI
      let score = 50; // Base score

      if (leadData.hasPhone) score += 15;
      if (leadData.hasEmail) score += 10;
      if (leadData.hasName) score += 10;
      if (leadData.requestedAppointment) score += 20;
      if (leadData.messageCount >= 3) score += 10;
      if (leadData.responseTime < 60) score -= 5; // Fast response = less urgent?

      const qualification = score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold';

      return {
        score,
        qualification,
        reasoning: 'Pattern-based scoring',
        suggestedFollowUp: qualification === 'hot'
          ? (language === 'es' ? 'Contactar inmediatamente para cerrar cita' : 'Contact immediately to close appointment')
          : (language === 'es' ? 'Enviar información adicional' : 'Send additional information'),
        priority: qualification === 'hot' ? 'high' : qualification === 'warm' ? 'medium' : 'low'
      };
    }

    const prompt = getLeadQualificationPrompt(leadData, language);
    const response = await callClaude(
      'You are a lead qualification assistant. Respond only with valid JSON.',
      prompt,
      { maxTokens: 300 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Invalid response format');

  } catch (error) {
    logger.error('[LEAD-RESPONSE] Lead qualification error:', error.message);

    return {
      score: 50,
      qualification: 'warm',
      reasoning: 'Qualification unavailable',
      suggestedFollowUp: language === 'es' ? 'Seguimiento estándar' : 'Standard follow-up',
      priority: 'medium'
    };
  }
}

/**
 * Process an incoming WhatsApp message with AI
 * Complete flow: detect language -> classify intent -> generate response
 * @param {object} params - Message parameters
 * @returns {Promise<object>} Processing result
 */
async function processIncomingMessage({
  message,
  customerPhone,
  clientId,
  clientConfig = {},
  conversationHistory = []
}) {
  logger.info(`[LEAD-RESPONSE] Processing message from ${customerPhone} for client ${clientId}`);

  try {
    // Step 1: Detect language
    const language = whatsappService.detectLanguage(message);

    // Step 2: Get previous context from conversation history
    const lastMessages = conversationHistory.slice(-5);
    const customerName = extractCustomerName(lastMessages);
    const lastIntent = lastMessages.length > 0 ? lastMessages[lastMessages.length - 1].intent : null;

    // Step 3: Generate AI response
    const result = await generateResponse(
      message,
      {
        conversationHistory: lastMessages,
        customerName,
        customerPhone,
        clientId,
        lastIntent
      },
      {
        ...clientConfig,
        language
      }
    );

    // Step 4: Prepare lead data for qualification
    const leadData = {
      phone: customerPhone,
      hasPhone: true,
      hasName: !!customerName,
      messageCount: conversationHistory.length + 1,
      requestedAppointment: result.intent.intent === 'appointment',
      intent: result.intent.intent,
      language
    };

    // Step 5: Qualify lead (async, don't block response)
    qualifyLead(leadData, language)
      .then(qualification => {
        logger.info(`[LEAD-RESPONSE] Lead ${customerPhone} qualified: ${qualification.qualification} (${qualification.score})`);
      })
      .catch(e => logger.warn('[LEAD-RESPONSE] Qualification failed:', e.message));

    return {
      success: true,
      response: result.response,
      intent: result.intent,
      language,
      requiresHuman: result.requiresHuman,
      customerName
    };

  } catch (error) {
    logger.error('[LEAD-RESPONSE] Process message error:', error.message);

    const fallbackLang = whatsappService.detectLanguage(message);
    return {
      success: false,
      response: fallbackLang === 'es'
        ? 'Gracias por tu mensaje. Te responderemos pronto. 🙏'
        : 'Thank you for your message. We\'ll respond soon. 🙏',
      intent: { intent: 'error' },
      language: fallbackLang,
      requiresHuman: true,
      error: error.message
    };
  }
}

/**
 * Extract customer name from conversation history
 * @param {Array} messages - Previous messages
 * @returns {string|null} Customer name or null
 */
function extractCustomerName(messages) {
  for (const msg of messages) {
    if (msg.customerName) return msg.customerName;

    // Try to extract from message content
    const namePatterns = [
      /(?:me llamo|soy|mi nombre es)\s+([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)?)/i,
      /(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /^([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)?)$/
    ];

    for (const pattern of namePatterns) {
      const match = msg.body?.match(pattern);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

module.exports = {
  isConfigured,
  classifyIntent,
  generateResponse,
  qualifyLead,
  processIncomingMessage,
  handleAppointmentIntent
};
