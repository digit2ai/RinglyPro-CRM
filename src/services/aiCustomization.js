// =====================================================
// RinglyPro AI Business Customization Service
// File: src/services/aiCustomization.js
// =====================================================

const { User } = require('../models');

class BusinessAICustomizer {
    constructor() {
        // Industry-specific response templates
        this.industryTemplates = {
            healthcare: {
                tone: 'professional, caring, HIPAA-compliant',
                commonQuestions: ['appointments', 'insurance', 'symptoms', 'hours'],
                restrictions: ['cannot provide medical advice', 'must refer to doctor'],
                greeting: 'Thank you for calling [BUSINESS_NAME]. How may I assist you with your healthcare needs today?'
            },
            legal: {
                tone: 'formal, confidential, precise',
                commonQuestions: ['consultation', 'case status', 'fees', 'documents'],
                restrictions: ['attorney-client privilege', 'cannot provide legal advice without consultation'],
                greeting: 'Good [TIME_OF_DAY]. You\'ve reached [BUSINESS_NAME]. How may I help with your legal matter?'
            },
            realestate: {
                tone: 'enthusiastic, knowledgeable, market-focused',
                commonQuestions: ['property listings', 'market prices', 'viewings', 'buying process'],
                restrictions: ['market conditions change rapidly', 'all offers subject to verification'],
                greeting: 'Hello! Thanks for calling [BUSINESS_NAME]. Are you looking to buy, sell, or have questions about the market?'
            },
            retail: {
                tone: 'friendly, helpful, customer-service focused',
                commonQuestions: ['product availability', 'store hours', 'returns', 'locations'],
                restrictions: ['inventory changes frequently', 'prices subject to change'],
                greeting: 'Hi there! Thanks for calling [BUSINESS_NAME]. How can I help you find what you\'re looking for today?'
            },
            restaurant: {
                tone: 'warm, welcoming, food-focused',
                commonQuestions: ['reservations', 'menu', 'hours', 'dietary restrictions'],
                restrictions: ['menu items may vary', 'allergies must be disclosed'],
                greeting: 'Thank you for calling [BUSINESS_NAME]! Would you like to make a reservation or do you have questions about our menu?'
            },
            professional: {
                tone: 'professional, efficient, service-oriented',
                commonQuestions: ['services', 'appointments', 'pricing', 'availability'],
                restrictions: ['specific advice requires consultation', 'pricing may vary'],
                greeting: 'Good [TIME_OF_DAY]. You\'ve reached [BUSINESS_NAME]. How may I assist you today?'
            }
        };
    }

    /**
     * Generate complete business context for AI responses
     * @param {number} userId - User ID from your database
     * @returns {Object} Complete business context for AI
     */
    async generateBusinessContext(userId) {
        try {
            const user = await User.findByPk(userId);
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }

            const context = {
                businessProfile: this.buildBusinessProfile(user),
                industryKnowledge: this.getIndustryTemplate(user.business_type),
                responseRules: this.generateResponseRules(user),
                operationalData: this.parseOperationalData(user),
                conversationFlow: this.buildConversationFlow(user),
                timestamp: new Date().toISOString()
            };

            console.log(`AI context generated for ${user.business_name} (${user.business_type})`);
            return context;

        } catch (error) {
            console.error('Error generating business context:', error);
            throw error;
        }
    }

    /**
     * Build business profile from user data
     */
    buildBusinessProfile(user) {
        return {
            name: user.business_name,
            type: user.business_type,
            phone: user.business_phone,
            website: user.website_url,
            description: user.business_description,
            services: this.parseServices(user.services),
            owner: `${user.first_name} ${user.last_name}`.trim(),
            isVerified: user.email_verified,
            trialMinutes: user.free_trial_minutes
        };
    }

    /**
     * Get industry-specific template
     */
    getIndustryTemplate(businessType) {
        const template = this.industryTemplates[businessType] || this.industryTemplates.professional;
        return {
            ...template,
            businessType
        };
    }

    /**
     * Generate AI response rules based on business data
     */
    generateResponseRules(user) {
        const rules = [
            `Always identify as calling on behalf of ${user.business_name}`,
            'Be helpful and professional in all interactions',
            'If you don\'t know specific information, offer to connect to a human or take a message'
        ];

        // Add business hours rules
        if (user.business_hours) {
            rules.push('Always check if we are currently open before scheduling or making commitments');
        }

        // Add industry-specific rules
        const industryTemplate = this.getIndustryTemplate(user.business_type);
        if (industryTemplate.restrictions) {
            rules.push(...industryTemplate.restrictions);
        }

        return rules;
    }

    /**
     * Parse operational data from user
     */
    parseOperationalData(user) {
        const operational = {
            businessHours: this.parseBusinessHours(user.business_hours),
            timezone: 'America/New_York', // Default - could be made configurable
            currentlyOpen: null
        };

        // Calculate if currently open
        if (operational.businessHours) {
            operational.currentlyOpen = this.isCurrentlyOpen(operational.businessHours);
        }

        return operational;
    }

    /**
     * Parse business hours from JSON or string
     */
    parseBusinessHours(hoursData) {
        if (!hoursData) return null;

        try {
            // If it's already an object with open/close times
            if (typeof hoursData === 'object' && hoursData.open && hoursData.close) {
                return {
                    monday: { open: hoursData.open, close: hoursData.close, enabled: true },
                    tuesday: { open: hoursData.open, close: hoursData.close, enabled: true },
                    wednesday: { open: hoursData.open, close: hoursData.close, enabled: true },
                    thursday: { open: hoursData.open, close: hoursData.close, enabled: true },
                    friday: { open: hoursData.open, close: hoursData.close, enabled: true },
                    saturday: { open: hoursData.open, close: hoursData.close, enabled: false },
                    sunday: { open: '00:00', close: '00:00', enabled: false }
                };
            }

            // If it's a JSON string, parse it
            if (typeof hoursData === 'string') {
                return JSON.parse(hoursData);
            }

            return hoursData;
        } catch (error) {
            console.warn('Could not parse business hours:', error);
            return null;
        }
    }

    /**
     * Check if business is currently open
     */
    isCurrentlyOpen(businessHours) {
        if (!businessHours) return null;

        const now = new Date();
        const dayName = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

        const todayHours = businessHours[dayName];
        if (!todayHours || !todayHours.enabled) {
            return false;
        }

        return currentTime >= todayHours.open && currentTime <= todayHours.close;
    }

    /**
     * Parse services into array
     */
    parseServices(servicesString) {
        if (!servicesString) return [];
        
        return servicesString
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    /**
     * Build conversation flow based on business type
     */
    buildConversationFlow(user) {
        const industryTemplate = this.getIndustryTemplate(user.business_type);
        
        return {
            greeting: industryTemplate.greeting
                .replace('[BUSINESS_NAME]', user.business_name)
                .replace('[TIME_OF_DAY]', this.getTimeOfDay()),
            commonTopics: industryTemplate.commonQuestions,
            escalationTriggers: [
                'pricing questions beyond general information',
                'complex technical questions',
                'complaints or disputes',
                'urgent matters requiring immediate attention'
            ],
            closingOptions: [
                'Would you like me to have someone call you back?',
                'Can I take a message for the team?',
                'Would you like to schedule an appointment?'
            ]
        };
    }

    /**
     * Get appropriate time of day greeting
     */
    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

    /**
     * Generate AI prompt for voice responses
     * @param {Object} context - Business context from generateBusinessContext
     * @param {string} customerMessage - What the customer said
     * @returns {string} AI prompt for generating response
     */
    generateAIPrompt(context, customerMessage) {
        return `You are an AI assistant for ${context.businessProfile.name}, a ${context.businessProfile.type} business.

BUSINESS INFO:
- Business: ${context.businessProfile.name}
- Type: ${context.industryKnowledge.businessType}
- Services: ${context.businessProfile.services.join(', ')}
- Description: ${context.businessProfile.description}
- Currently Open: ${context.operationalData.currentlyOpen ? 'Yes' : 'No'}

RESPONSE TONE: ${context.industryKnowledge.tone}

RULES:
${context.responseRules.map(rule => `- ${rule}`).join('\n')}

CUSTOMER MESSAGE: "${customerMessage}"

Respond naturally and helpfully as if you are answering the phone for this business. Keep responses under 150 words and always sound human, not robotic.`;
    }

    /**
     * Test method to validate context generation
     */
    async testContextGeneration(userId) {
        try {
            const context = await this.generateBusinessContext(userId);
            
            console.log('=== AI CONTEXT TEST ===');
            console.log('Business:', context.businessProfile.name);
            console.log('Type:', context.businessProfile.type);
            console.log('Currently Open:', context.operationalData.currentlyOpen);
            console.log('Services:', context.businessProfile.services);
            console.log('Sample Greeting:', context.conversationFlow.greeting);
            console.log('======================');
            
            return context;
        } catch (error) {
            console.error('Context generation test failed:', error);
            throw error;
        }
    }
}

module.exports = BusinessAICustomizer;