// routes/linaRoutes.js - Spanish Voice Routes
const express = require('express');
const LinaSpanishVoiceService = require('../services/linaVoiceService');
const ClientIdentificationService = require('../services/clientIdentificationService');
const path = require('path');

// Initialize Lina service
const linaService = new LinaSpanishVoiceService(
    process.env.DATABASE_URL,
    process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com',
    process.env.ELEVENLABS_API_KEY
);

const clientService = new ClientIdentificationService(process.env.DATABASE_URL);

const router = express.Router();

/**
 * Spanish greeting endpoint (called after language selection)
 * Handle both GET (from redirects) and POST (from direct calls)
 */
const handleSpanishIncoming = async (req, res) => {
    try {
        console.log('📞 Spanish language selected - Lina webhook called');

        // Get client info from session
        const clientId = req.session.client_id;
        const businessName = req.session.business_name;

        if (!clientId) {
            console.error("❌ No client context in session");
            const twiml = `
                <?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <Say voice="Polly.Lupe" language="es-MX">La sesión ha expirado. Por favor, llame de nuevo.</Say>
                    <Hangup/>
                </Response>
            `;
            res.type('text/xml');
            return res.send(twiml);
        }

        // Reconstruct client info from session
        const clientInfo = {
            client_id: clientId,
            business_name: businessName,
            rachel_enabled: true
        };

        const twimlResponse = await linaService.createPersonalizedGreeting(clientInfo);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error in Lina webhook:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, intente llamar de nuevo.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/lina/incoming', handleSpanishIncoming);
router.get('/voice/lina/incoming', handleSpanishIncoming);

/**
 * Process Spanish speech input endpoint
 */
router.post('/voice/lina/process-speech', async (req, res) => {
    try {
        console.log('🎤 Processing Spanish speech:', req.body.SpeechResult);

        const twimlResponse = await linaService.processSpeechInput(req.body, req.session);

        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        console.error('Error processing Spanish speech:', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error procesando su solicitud. Por favor, intente de nuevo.</Say>
                <Redirect>/voice/lina/webhook</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect name for appointment booking (Spanish)
 */
router.post('/voice/lina/collect-name', async (req, res) => {
    try {
        const name = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📝 Spanish - Name collected for client ${clientId}: ${name}`);

        // Store name in session
        req.session.prospect_name = name;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Gather input="speech" timeout="10" action="/voice/lina/collect-phone" method="POST" speechTimeout="auto" language="es-MX">
                    <Say voice="Polly.Lupe" language="es-MX">Gracias ${name}. Ahora, ¿puede decirme su número de teléfono, por favor?</Say>
                </Gather>
                <Redirect>/voice/lina/webhook</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting name (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Intentemos de nuevo.</Say>
                <Redirect>/voice/lina/process-speech</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Collect phone number for appointment booking (Spanish)
 */
router.post('/voice/lina/collect-phone', async (req, res) => {
    try {
        const phone = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📞 Spanish - Phone collected for client ${clientId}: ${phone}`);
        console.log(`📝 Spanish - Prospect name from session: ${prospectName}`);

        // Store phone in session
        req.session.prospect_phone = phone;

        // Save session before sending response
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Perfecto! ${prospectName}, tengo su número como ${phone}. Déjeme verificar la disponibilidad y agendar su cita con ${businessName}. Por favor, espere un momento.</Say>
                <Redirect>/voice/lina/book-appointment</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting phone (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, intente de nuevo.</Say>
                <Redirect>/voice/lina/collect-name</Redirect>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Book appointment endpoint (Spanish)
 * Handle both GET (from redirects) and POST
 */
const handleBookAppointmentSpanish = async (req, res) => {
    try {
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📅 Spanish - Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone})`);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Excelentes noticias ${prospectName}! He agendado exitosamente su cita con ${businessName}. Recibirá un mensaje de texto con la confirmación y todos los detalles próximamente. Gracias por llamar, y esperamos hablar con usted pronto!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error booking appointment (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error al agendar su cita. Por favor, llame de nuevo o visite nuestro sitio web para programar.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
};

// Register both GET and POST routes
router.post('/voice/lina/book-appointment', handleBookAppointmentSpanish);
router.get('/voice/lina/book-appointment', handleBookAppointmentSpanish);

/**
 * Handle pricing response (Spanish)
 */
router.post('/voice/lina/handle-pricing-response', async (req, res) => {
    try {
        const response = req.body.SpeechResult || '';
        const businessName = req.session.business_name || 'nuestra empresa';

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por su interés. Le conectaré con un especialista en precios de ${businessName} quien puede proporcionarle información detallada sobre nuestros servicios y costos. Por favor, espere mientras transfiero su llamada.</Say>
                <Say voice="Polly.Lupe" language="es-MX">La función de transferencia aún no está configurada. Por favor, visite nuestro sitio web o llame más tarde para obtener información sobre precios.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error handling pricing response (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor, llame más tarde.</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

/**
 * Fallback webhook endpoint (Spanish)
 */
router.post('/voice/lina/webhook', async (req, res) => {
    try {
        const businessName = req.session.business_name || 'nosotros';

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por llamar a ${businessName}. ¡Que tenga un excelente día!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error('Error in fallback webhook (Spanish):', error);

        const twiml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Lupe" language="es-MX">Gracias por llamar. ¡Adiós!</Say>
                <Hangup/>
            </Response>
        `;

        res.type('text/xml');
        res.send(twiml);
    }
});

module.exports = router;
