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
    lastIntent = null
  } = context;

  const {
    businessName = 'our business',
    businessType = 'service business',
    services = [],
    hours = null,
    vagaroEnabled = false,
    language = 'en'
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
      lastIntent,
      currentIntent: intent,
      messageCount: conversationHistory.length + 1,
      language: detectedLanguage,
      businessName,
      vagaroEnabled
    };

    let responseText;
    let requiresHuman = false;

    // Check if human escalation is needed
    if (intent.requires_human || intent.intent === 'complaint') {
      requiresHuman = true;
      responseText = detectedLanguage === 'es'
        ? `Entiendo tu preocupación. Voy a transferir tu consulta a uno de nuestros agentes que podrá ayudarte mejor. Te contactarán pronto. 📞`
        : `I understand your concern. Let me transfer your inquiry to one of our team members who can better assist you. They'll contact you shortly. 📞`;
    }
    // Handle based on intent
    else if (intent.intent === 'greeting' && conversationContext.messageCount === 1) {
      // First message greeting
      responseText = detectedLanguage === 'es'
        ? `¡Hola! 👋 Soy Lina, asistente virtual de ${businessName}. ¿En qué puedo ayudarte hoy?`
        : `Hi! 👋 I'm Rachel, the virtual assistant for ${businessName}. How can I help you today?`;
    }
    else if (intent.intent === 'appointment') {
      // Appointment booking intent
      responseText = await handleAppointmentIntent(customerMessage, conversationContext, clientConfig);
    }
    else if (intent.intent === 'pricing' || intent.intent === 'inquiry') {
      // Pricing or general inquiry
      responseText = detectedLanguage === 'es'
        ? `¡Claro! ¿Qué servicio te interesa? Así puedo darte información más específica sobre precios y disponibilidad.`
        : `Of course! Which service are you interested in? I can give you more specific information about pricing and availability.`;
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
  const { language, customerName, businessName, vagaroEnabled } = context;
  const { services = [] } = clientConfig;

  // Try to extract appointment details
  let appointmentDetails = {};

  if (isConfigured()) {
    try {
      const extractPrompt = getAppointmentExtractionPrompt(message, language);
      const extractResponse = await callClaude(
        'You are an appointment detail extractor. Respond only with valid JSON.',
        extractPrompt,
        { maxTokens: 300 }
      );

      const jsonMatch = extractResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        appointmentDetails = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.warn('[LEAD-RESPONSE] Appointment extraction failed:', e.message);
    }
  }

  // Build response based on what's missing
  const missing = appointmentDetails.missingFields || [];

  if (missing.length === 0 && appointmentDetails.date && appointmentDetails.time) {
    // All details captured - confirm
    if (language === 'es') {
      return `Perfecto, voy a confirmar tu cita:
📅 Fecha: ${appointmentDetails.date}
🕐 Hora: ${appointmentDetails.time}
📍 Servicio: ${appointmentDetails.service || 'Consulta'}
${customerName ? `👤 Nombre: ${customerName}` : ''}

¿Es correcto? Responde SÍ para confirmar.`;
    } else {
      return `Perfect, I'm confirming your appointment:
📅 Date: ${appointmentDetails.date}
🕐 Time: ${appointmentDetails.time}
📍 Service: ${appointmentDetails.service || 'Consultation'}
${customerName ? `👤 Name: ${customerName}` : ''}

Is this correct? Reply YES to confirm.`;
    }
  }

  // Ask for missing information
  if (!appointmentDetails.customerName && !customerName) {
    return language === 'es'
      ? '¡Perfecto! Para agendar tu cita, ¿cuál es tu nombre completo?'
      : 'Perfect! To schedule your appointment, what is your full name?';
  }

  if (!appointmentDetails.service) {
    const servicesText = services.length > 0
      ? services.slice(0, 5).map((s, i) => `${i + 1}. ${s.name}`).join('\n')
      : '';

    return language === 'es'
      ? `¿Qué servicio necesitas?${servicesText ? '\n\n' + servicesText + '\n\nResponde con el número o escribe el servicio.' : ''}`
      : `What service do you need?${servicesText ? '\n\n' + servicesText + '\n\nReply with the number or type the service.' : ''}`;
  }

  if (!appointmentDetails.date || !appointmentDetails.time) {
    return language === 'es'
      ? '¿Qué día y hora te convienen mejor para tu cita?'
      : 'What day and time work best for your appointment?';
  }

  // Fallback
  return language === 'es'
    ? `Para completar tu cita, necesito saber la fecha y hora que prefieres. ¿Cuándo te gustaría venir?`
    : `To complete your appointment, I need to know your preferred date and time. When would you like to come in?`;
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
