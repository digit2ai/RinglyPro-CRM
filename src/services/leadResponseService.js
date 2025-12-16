// =====================================================
// Lead Response Automation Service
// File: src/services/leadResponseService.js
// Purpose: AI-powered lead response automation for WhatsApp
// Features: Language detection, intent classification, lead qualification
// Integration: Claude AI, Vagaro scheduling
// =====================================================

const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
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

/**
 * Check if a QR code URL is valid (not undefined, null, or invalid path)
 * @param {string} url - The URL to check
 * @returns {boolean} Whether the URL is valid
 */
function isValidQrCodeUrl(url) {
  if (!url) return false;
  if (url === 'undefined' || url === 'null') return false;
  if (url.includes('/undefined') || url.includes('/null')) return false;
  return true;
}

/**
 * Get accessible URL for Zelle QR code
 * - If stored in S3, fetches a presigned URL that Twilio can access
 * - If local path, converts to full URL
 * @param {string} qrCodeUrl - The stored QR code URL
 * @param {number} clientId - Client ID for API call
 * @returns {Promise<string|null>} Accessible URL or null
 */
async function getAccessibleQrCodeUrl(qrCodeUrl, clientId) {
  if (!isValidQrCodeUrl(qrCodeUrl)) return null;

  try {
    // If it's an S3 URL, get a presigned URL for Twilio to access
    if (qrCodeUrl.includes('.s3.') && qrCodeUrl.includes('.amazonaws.com')) {
      // Call the internal endpoint to get presigned URL
      const baseUrl = process.env.APP_URL || 'https://aiagent.ringlypro.com';
      const response = await axios.get(`${baseUrl}/api/client-settings/zelle/qr/${clientId}`, {
        timeout: 5000
      });

      if (response.data.success && response.data.qrCodeUrl) {
        logger.info(`[LEAD-RESPONSE] Got presigned QR URL for client ${clientId}`);
        return response.data.qrCodeUrl;
      }
    }

    // If it's a local path, convert to full URL
    if (qrCodeUrl.startsWith('/')) {
      const baseUrl = process.env.APP_URL || 'https://aiagent.ringlypro.com';
      return `${baseUrl}${qrCodeUrl}`;
    }

    // Return as-is if already a full URL
    return qrCodeUrl;
  } catch (error) {
    logger.error(`[LEAD-RESPONSE] Error getting accessible QR URL: ${error.message}`);
    // Fall back to original URL
    return qrCodeUrl.startsWith('/')
      ? `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}${qrCodeUrl}`
      : qrCodeUrl;
  }
}

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

      // IMPORTANT: Check if booking was COMPLETED - if so, we're NOT in booking flow anymore
      // This prevents the loop where user sends "thank you" after booking and system restarts flow
      const bookingCompletedIndicators = [
        'appointment has been confirmed', 'cita ha sido confirmada',  // GHL success
        'excellent choice', 'excelente elección',                      // Fallback confirmation
        'we look forward to seeing you', 'te esperamos',               // Final thank you
        'a team member will confirm', 'un miembro de nuestro equipo confirmará' // Manual confirmation
      ];

      const isBookingComplete = bookingCompletedIndicators.some(indicator => body.includes(indicator));
      if (isBookingComplete) {
        logger.info('[LEAD-RESPONSE] isInBookingFlow: Booking COMPLETED - not in flow anymore');
        return false;
      }

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

    // Check if current message is a greeting
    const lowerMessage = customerMessage.trim().toLowerCase();
    const isGreeting = ['hi', 'hello', 'hola', 'hey', 'good morning', 'buenos dias', 'buenas tardes', 'good afternoon', 'good evening'].includes(lowerMessage);

    // PRIORITY 0.5: Continue appointment flow if user is in the middle of booking
    // This handles: user provided name, user selecting time slot, etc.
    // Check if: starting booking (menu selection) OR continuing booking (last message was booking prompt)
    // BUT NOT if user sends a greeting - greetings should always show the menu
    const inBookingFlow = isInBookingFlow(conversationHistory);
    logger.info(`[LEAD-RESPONSE] Booking flow check: menuSelection=${menuSelection}, inBookingFlow=${inBookingFlow}, isGreeting=${isGreeting}`);

    if ((menuSelection === 'appointment' || inBookingFlow) && !isGreeting) {
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

          if (isValidQrCodeUrl(zelle.qrCodeUrl)) {
            responseText += detectedLanguage === 'es'
              ? '\n\n📲 Te envío nuestro código QR para facilitar el pago.'
              : '\n\n📲 Here is our QR code for easy payment.';
            // Include QR code image in response
            const accessibleUrl = await getAccessibleQrCodeUrl(zelle.qrCodeUrl, clientId);
            if (accessibleUrl) {
              return {
                success: true,
                response: responseText,
                mediaUrl: accessibleUrl,
                intent: { intent: 'payment' },
                language: detectedLanguage,
                requiresHuman: false,
                context: conversationContext
              };
            }
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
        if (isValidQrCodeUrl(zelle.qrCodeUrl)) {
          responseText += detectedLanguage === 'es'
            ? '\n\n📲 Te envío nuestro código QR para facilitar el pago.'
            : '\n\n📲 Here is our QR code for easy payment.';
          // Return immediately with QR code media
          const accessibleUrl = await getAccessibleQrCodeUrl(zelle.qrCodeUrl, clientId);
          if (accessibleUrl) {
            return {
              success: true,
              response: responseText,
              mediaUrl: accessibleUrl,
              intent: { intent: 'payment' },
              language: detectedLanguage,
              requiresHuman: false,
              context: conversationContext
            };
          }
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

  // Use WhatsApp profile name as fallback if no name found in history
  if (!extractedData.name && customerName) {
    extractedData.name = customerName;
    logger.info(`[LEAD-RESPONSE] Using WhatsApp profile name: ${customerName}`);
  }

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
        logger.info(`[LEAD-RESPONSE] STEP 4: Fetching GHL slots for client ${clientId}, calendar ${booking.ghlCalendarId}`);
        const today = new Date();
        const slots = [];

        for (let i = 1; i <= 14 && slots.length < 3; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() + i);
          // Don't skip weekends - let GHL calendar determine availability

          const dateStr = checkDate.toISOString().split('T')[0];
          const dayName = formatDate(checkDate);

          const ghlSlots = await ghlBookingService.getAvailableSlots(clientId, booking.ghlCalendarId, dateStr);
          logger.info(`[LEAD-RESPONSE] GHL slots for ${dateStr}: ${ghlSlots.success ? ghlSlots.slots?.length : 'error'}`);

          if (ghlSlots.success && ghlSlots.slots?.length > 0) {
            // GHL slots are ISO strings like "2025-12-18T08:00:00-05:00"
            // Pick a good time from available slots
            const firstSlot = ghlSlots.slots[0];

            // Extract time directly from ISO string to avoid timezone conversion issues
            // Format: "2025-12-18T08:00:00-05:00" - the time is already in local timezone
            const timeMatch = firstSlot.match(/T(\d{2}):(\d{2})/);
            if (timeMatch) {
              const hour = parseInt(timeMatch[1]);
              const minute = timeMatch[2];
              const ampm = hour >= 12 ? 'PM' : 'AM';
              const hour12 = hour % 12 || 12;
              const displayTime = `${hour12}:${minute} ${ampm}`;
              const time24 = `${hour.toString().padStart(2, '0')}:${minute}`;

              slots.push({
                date: dateStr,
                time: time24,
                display: `${dayName} @ ${displayTime}`
              });
              logger.info(`[LEAD-RESPONSE] Added GHL slot: ${dateStr} @ ${displayTime} (raw: ${firstSlot})`);
            }
          }
        }

        if (slots.length > 0) {
          const slotOptions = slots.map((s, i) => `${i + 1}️⃣ ${s.display}`).join('\n');
          return language === 'es'
            ? `¡Excelente ${extractedData.name}! 📅\n\nAquí tienes nuestros próximos horarios disponibles:\n\n${slotOptions}\n\nResponde con el número (1, 2, o 3) para confirmar tu cita.`
            : `Excellent ${extractedData.name}! 📅\n\nHere are our next available times:\n\n${slotOptions}\n\nReply with the number (1, 2, or 3) to confirm your appointment.`;
        } else {
          logger.warn('[LEAD-RESPONSE] No GHL slots found in next 14 days');
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
  logger.info(`[LEAD-RESPONSE] STEP 5 check: isSlotSelection=${isSlotSelection}, name=${extractedData.name}, phone=${extractedData.phone}, email=${extractedData.email}`);
  logger.info(`[LEAD-RESPONSE] STEP 5 config: booking.system=${booking?.system}, clientId=${clientId}, zelle.enabled=${zelle?.enabled}, zelle.qrCodeUrl=${zelle?.qrCodeUrl}`);
  if (isSlotSelection && extractedData.name && extractedData.phone && extractedData.email) {
    const slotIndex = parseInt(msgTrimmed) - 1;

    // Try to extract actual slot info from Rachel's previous message in history
    let selectedDate = null;
    let selectedTime = '10:00';
    let dateStr = null;

    // Look for Rachel's slot offering message in history to get actual times
    // Note: direction can be 'outbound' or 'outgoing' depending on source
    const slotOfferingMsg = conversationHistory.slice(-10).find(m =>
      (m.direction === 'outbound' || m.direction === 'outgoing') &&
      (m.body?.includes('available times') || m.body?.includes('horarios disponibles'))
    );

    if (slotOfferingMsg) {
      logger.info(`[LEAD-RESPONSE] Found slot offering message: ${slotOfferingMsg.body?.substring(0, 100)}`);
      // Parse slot options from the message
      // Format: "1️⃣ Thursday, Dec 18 @ 10:00 AM" or similar
      const slotPattern = new RegExp(`${slotIndex + 1}️⃣\\s*([^@\\n]+)\\s*@\\s*([0-9]+:[0-9]+\\s*(?:AM|PM|am|pm)?)`, 'i');
      const match = slotOfferingMsg.body?.match(slotPattern);

      if (match) {
        const dateText = match[1].trim();
        const timeText = match[2].trim();
        logger.info(`[LEAD-RESPONSE] Parsed slot ${slotIndex + 1}: date="${dateText}" time="${timeText}"`);

        // Convert time to 24h format for GHL
        const timeParts = timeText.match(/(\d+):(\d+)\s*(AM|PM|am|pm)?/i);
        if (timeParts) {
          let hour = parseInt(timeParts[1]);
          const minute = timeParts[2];
          const ampm = timeParts[3]?.toUpperCase();
          if (ampm === 'PM' && hour < 12) hour += 12;
          if (ampm === 'AM' && hour === 12) hour = 0;
          selectedTime = `${hour.toString().padStart(2, '0')}:${minute}`;
        }

        // Try to parse the date from the text
        const dateMatch = dateText.match(/(\w+),?\s*(\w+)\s*(\d+)/);
        if (dateMatch) {
          const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
          const monthName = dateMatch[2].toLowerCase().substring(0, 3);
          const day = parseInt(dateMatch[3]);
          const month = months[monthName];
          if (month !== undefined) {
            selectedDate = new Date();
            selectedDate.setMonth(month);
            selectedDate.setDate(day);
            // Handle year rollover
            if (selectedDate < new Date()) {
              selectedDate.setFullYear(selectedDate.getFullYear() + 1);
            }
            dateStr = selectedDate.toISOString().split('T')[0];
            logger.info(`[LEAD-RESPONSE] Parsed date: ${dateStr}, time: ${selectedTime}`);
          }
        }
      }
    }

    // Fallback: calculate date/time if not extracted from history
    if (!selectedDate) {
      const today = new Date();
      selectedDate = new Date(today);
      selectedDate.setDate(today.getDate() + slotIndex + 1);

      // Skip weekends
      while (selectedDate.getDay() === 0 || selectedDate.getDay() === 6) {
        selectedDate.setDate(selectedDate.getDate() + 1);
      }

      // Use fallback times
      const times = ['10:00', '14:00', '11:00'];
      selectedTime = times[slotIndex] || '10:00';
      dateStr = selectedDate.toISOString().split('T')[0];
      logger.info(`[LEAD-RESPONSE] Using fallback date/time: ${dateStr} ${selectedTime}`);
    }

    const formattedDate = selectedDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    const formattedTime = formatTime(selectedTime);

    // Try to book via GHL
    logger.info(`[LEAD-RESPONSE] STEP 5 GHL check: booking.system=${booking?.system}, clientId=${clientId}`);
    if (booking?.system === 'ghl' && clientId) {
      try {
        logger.info(`[LEAD-RESPONSE] STEP 5 calling GHL bookFromWhatsApp with: name=${extractedData.name}, phone=${extractedData.phone || customerPhone}, email=${extractedData.email}, date=${dateStr}, time=${selectedTime}, calendarId=${booking.ghlCalendarId}`);
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

        logger.info(`[LEAD-RESPONSE] STEP 5 GHL result: success=${ghlResult.success}, error=${ghlResult.error || 'none'}`);
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

            if (isValidQrCodeUrl(zelle.qrCodeUrl)) {
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
            // Get accessible URL (presigned if S3, full URL if local)
            const accessibleUrl = await getAccessibleQrCodeUrl(qrCodeUrl, clientId);
            if (accessibleUrl) {
              logger.info(`[LEAD-RESPONSE] Using accessible QR URL: ${accessibleUrl}`);
              return { text: successMsg, mediaUrl: accessibleUrl };
            }
          }
          return successMsg;
        }
      } catch (ghlError) {
        logger.error('[LEAD-RESPONSE] GHL booking exception:', ghlError.message, ghlError.stack);
      }
    } else {
      logger.warn(`[LEAD-RESPONSE] STEP 5 skipping GHL booking: booking.system=${booking?.system}, clientId=${clientId}`);
    }

    // Fallback confirmation (manual process)
    logger.info('[LEAD-RESPONSE] STEP 5 using FALLBACK confirmation (GHL booking did not succeed)');
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

      if (isValidQrCodeUrl(zelle.qrCodeUrl)) {
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
    logger.info(`[LEAD-RESPONSE] STEP 5 fallback: qrCodeUrl=${qrCodeUrl}, isValid=${isValidQrCodeUrl(qrCodeUrl)}`);
    if (qrCodeUrl && isValidQrCodeUrl(qrCodeUrl)) {
      // Get accessible URL (presigned if S3, full URL if local)
      const accessibleUrl = await getAccessibleQrCodeUrl(qrCodeUrl, clientId);
      if (accessibleUrl) {
        logger.info(`[LEAD-RESPONSE] Returning structured response with QR code: ${accessibleUrl}`);
        return { text: fallbackMsg, mediaUrl: accessibleUrl };
      }
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

  // IMPORTANT: Only look at messages AFTER the FIRST booking flow started
  // Find the FIRST index where user selected "1" (booking) or where Rachel asked for name
  // We use the FIRST occurrence to avoid resetting when user sends "1" again to select a slot
  let bookingStartIndex = -1;
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    const body = (msg.body || '').trim().toLowerCase();
    const direction = msg.direction;

    // Check if this is where user started booking (selected "1") - only use FIRST occurrence
    if (bookingStartIndex === -1 && (direction === 'incoming' || direction === 'inbound') && body === '1') {
      bookingStartIndex = i;
      logger.info(`[LEAD-RESPONSE] extractBookingData: Found FIRST booking start at index ${i}`);
    }
    // Or if Rachel asked for name (outgoing message with "full name" or "nombre completo") - only use FIRST
    if (bookingStartIndex === -1 && (direction === 'outgoing' || direction === 'outbound') &&
        (body.includes('full name') || body.includes('nombre completo'))) {
      bookingStartIndex = i;
      logger.info(`[LEAD-RESPONSE] extractBookingData: Found FIRST name prompt at index ${i}`);
    }
  }

  // If we found a booking start, only look at messages after that point
  const startIndex = bookingStartIndex >= 0 ? bookingStartIndex : 0;
  logger.info(`[LEAD-RESPONSE] extractBookingData: Processing from index ${startIndex}`);

  // Process messages from booking start onwards
  for (let i = startIndex; i < history.length; i++) {
    const msg = history[i];
    const body = (msg.body || '').trim();
    const cleanBody = body.replace(/[\s\-\(\)]/g, '');
    const direction = msg.direction;

    // Only check incoming messages for user data
    // Note: direction can be 'incoming' or 'inbound' depending on source
    if (direction !== 'incoming' && direction !== 'inbound') continue;

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
  customerName: passedCustomerName = null,
  clientId,
  clientConfig = {},
  conversationHistory = []
}) {
  logger.info(`[LEAD-RESPONSE] Processing message from ${customerPhone} for client ${clientId}`);

  try {
    // Step 1: Detect language
    const language = whatsappService.detectLanguage(message);

    // Step 2: Get previous context from conversation history
    // Use more messages to ensure we capture full booking flow data (name, phone, email)
    const lastMessages = conversationHistory.slice(-15);
    // Use passed customer name (from WhatsApp profile) or try to extract from messages
    const customerName = passedCustomerName || extractCustomerName(lastMessages);
    const lastIntent = lastMessages.length > 0 ? lastMessages[lastMessages.length - 1].intent : null;

    logger.info(`[LEAD-RESPONSE] History: ${lastMessages.length} messages, customerName: ${customerName}`);

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
      mediaUrl: result.mediaUrl,  // Pass through QR code URL for WhatsApp
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
