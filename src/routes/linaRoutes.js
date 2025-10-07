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
        console.log(`📋 Session data: clientId=${clientId}, businessName=${businessName}`);

        // Store name in session
        req.session.prospect_name = name;

        // Save session before sending response
        try {
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        console.error('❌ Session save error in collect-name:', err);
                        reject(err);
                    } else {
                        console.log('✅ Spanish - Session saved with prospect name');
                        resolve();
                    }
                });
            });
        } catch (sessionErr) {
            console.error('❌ Failed to save session in collect-name:', sessionErr);
            throw sessionErr; // Re-throw to trigger outer catch
        }

        // Escape XML special characters to prevent parse errors
        const escapedName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/lina/collect-phone" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">Gracias ${escapedName}. Ahora puede decirme su número de teléfono por favor</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-name</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-name:', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
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

        // Escape XML special characters to prevent parse errors
        const escapedName = (prospectName || 'señor')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedPhone = phone
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedBusiness = (businessName || 'nuestra empresa')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" timeout="10" speechTimeout="5" action="/voice/lina/collect-datetime" method="POST" language="es-MX">
        <Say voice="Polly.Lupe" language="es-MX">Perfecto ${escapedName}. Ahora dígame que día y hora prefiere para su cita. Por ejemplo puede decir mañana a las 10 de la mañana o el viernes a las 2 de la tarde</Say>
    </Gather>
    <Say voice="Polly.Lupe" language="es-MX">No escuché su respuesta. Intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-phone</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-phone (Spanish):', twiml.substring(0, 200));
        res.set('Content-Type', 'text/xml; charset=utf-8');
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
 * Collect date/time for appointment booking (Spanish)
 */
router.post('/voice/lina/collect-datetime', async (req, res) => {
    try {
        const datetime = req.body.SpeechResult || '';
        const clientId = req.session.client_id;
        const prospectName = req.session.prospect_name;
        const prospectPhone = req.session.prospect_phone;
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📅 Spanish - DateTime collected for client ${clientId}: ${datetime}`);
        console.log(`📝 Spanish - Prospect info: ${prospectName} (${prospectPhone})`);

        // Store datetime in session
        req.session.appointment_datetime = datetime;

        // Save session before sending response
        try {
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        console.error('❌ Session save error in collect-datetime:', err);
                        reject(err);
                    } else {
                        console.log('✅ Spanish - Session saved with datetime');
                        resolve();
                    }
                });
            });
        } catch (sessionErr) {
            console.error('❌ Failed to save session in collect-datetime:', sessionErr);
            throw sessionErr;
        }

        // Escape XML special characters
        const escapedName = (prospectName || 'señor')
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
    <Say voice="Polly.Lupe" language="es-MX">Perfecto ${escapedName}. Déjeme confirmar su cita para ${escapedDateTime}. Por favor espere un momento mientras verifico la disponibilidad.</Say>
    <Redirect>/voice/lina/book-appointment</Redirect>
</Response>`;

        console.log('📤 Sending TwiML from collect-datetime (Spanish)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.send(twiml);

    } catch (error) {
        console.error('Error collecting datetime (Spanish):', error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento, hubo un error. Por favor intente de nuevo.</Say>
    <Redirect>/voice/lina/collect-phone</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml; charset=utf-8');
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
        const appointmentDateTime = req.session.appointment_datetime || 'la fecha solicitada';
        const businessName = req.session.business_name || 'nuestra empresa';

        console.log(`📅 Spanish - Booking appointment for client ${clientId}: ${prospectName} (${prospectPhone}) at ${appointmentDateTime}`);

        const { Appointment } = require('../models');
        const moment = require('moment-timezone');

        let appointmentDate, appointmentTime;
        let confirmationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        try {
            const now = moment().tz('America/New_York');
            let parsedDateTime = now.clone();

            const lowerText = appointmentDateTime.toLowerCase();
            if (lowerText.includes('mañana') || lowerText.includes('manana')) {
                parsedDateTime.add(1, 'day');
            } else if (lowerText.includes('hoy')) {
                // Keep as today
            } else if (lowerText.includes('lunes')) {
                parsedDateTime = parsedDateTime.day(1);
            } else if (lowerText.includes('martes')) {
                parsedDateTime = parsedDateTime.day(2);
            } else if (lowerText.includes('miércoles') || lowerText.includes('miercoles')) {
                parsedDateTime = parsedDateTime.day(3);
            } else if (lowerText.includes('jueves')) {
                parsedDateTime = parsedDateTime.day(4);
            } else if (lowerText.includes('viernes')) {
                parsedDateTime = parsedDateTime.day(5);
            } else {
                parsedDateTime.add(1, 'day');
            }

            const timeMatch = appointmentDateTime.match(/(\d{1,2})/);
            if (timeMatch) {
                let hour = parseInt(timeMatch[1]);
                const isTarde = lowerText.includes('tarde');
                const isMañana = lowerText.includes('mañana') || lowerText.includes('manana');

                if (isTarde && hour < 12) hour += 12;
                if (hour === 12 && isMañana) hour = 12;

                parsedDateTime.hour(hour).minute(0).second(0);
            } else {
                parsedDateTime.hour(14).minute(0).second(0);
            }

            appointmentDate = parsedDateTime.format('YYYY-MM-DD');
            appointmentTime = parsedDateTime.format('HH:mm:ss');

            console.log(`📆 Parsed appointment: date=${appointmentDate}, time=${appointmentTime}`);
            console.log(`📋 Creating appointment: clientId=${clientId}, name="${prospectName}", phone="${prospectPhone}"`);

            if (!clientId) {
                throw new Error('Missing clientId');
            }

            const appointment = await Appointment.create({
                clientId: clientId,
                customerName: prospectName || 'Desconocido',
                customerPhone: prospectPhone || 'Desconocido',
                appointmentDate: appointmentDate,
                appointmentTime: appointmentTime,
                duration: 30,
                status: 'confirmed',
                confirmationCode: confirmationCode,
                source: 'voice_booking'
            });

            console.log(`✅✅✅ SPANISH APPOINTMENT CREATED! ✅✅✅`);
            console.log(`   📌 ID: ${appointment.id}`);
            console.log(`   🏢 Client: ${clientId}`);
            console.log(`   👤 Customer: ${prospectName} (${prospectPhone})`);
            console.log(`   📅 DateTime: ${appointmentDate} ${appointmentTime}`);
            console.log(`   🔑 Confirmation: ${confirmationCode}`);

        } catch (dbError) {
            console.error('❌❌❌ ERROR CREATING SPANISH APPOINTMENT ❌❌❌');
            console.error(`   Error message: ${dbError.message}`);
            console.error(`   Full error:`, dbError);
            console.error(`   Session: clientId=${clientId}, name="${prospectName}", phone="${prospectPhone}"`);

            const isDuplicateSlot = dbError.message && (
                dbError.message.includes('unique_time_slot_per_client') ||
                dbError.message.includes('duplicate key') ||
                dbError.message.includes('unique constraint')
            );

            const escapedName = (prospectName || 'señor')
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
                        // Format first 3 available slots for speech (Spanish)
                        const formatTimeForSpeechSpanish = (timeStr) => {
                            const [hours, minutes] = timeStr.split(':');
                            let hour = parseInt(hours);
                            const isPM = hour >= 12;
                            if (hour > 12) hour -= 12;
                            if (hour === 0) hour = 12;

                            // Spanish time format: "la 1 de la tarde" or "las 2 de la tarde"
                            const article = hour === 1 ? 'la' : 'las';
                            const period = isPM ? 'de la tarde' : 'de la mañana';

                            if (minutes === '00') {
                                return `${article} ${hour} ${period}`;
                            } else {
                                return `${article} ${hour} y ${minutes} ${period}`;
                            }
                        };

                        const suggestions = availableSlots.slice(0, 3).map(formatTimeForSpeechSpanish);
                        const suggestionText = suggestions.length === 1
                            ? suggestions[0]
                            : suggestions.length === 2
                            ? `${suggestions[0]} o ${suggestions[1]}`
                            : `${suggestions[0]}, ${suggestions[1]}, o ${suggestions[2]}`;

                        errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esa hora ya está reservada. Tenemos disponibilidad a ${suggestionText}. Por favor llame de nuevo para agendar una de estas horas. Gracias.</Say>
    <Hangup/>
</Response>`;
                    } else {
                        errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esa hora ya está reservada y estamos completamente llenos ese día. Por favor llame de nuevo para agendar otro día. Gracias.</Say>
    <Hangup/>
</Response>`;
                    }
                } catch (slotCheckError) {
                    console.error('Error checking available slots (Spanish):', slotCheckError);
                    errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, esa hora ya está reservada. Por favor llame de nuevo para agendar otra hora. Gracias.</Say>
    <Hangup/>
</Response>`;
                }
            } else {
                errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Lupe" language="es-MX">Lo siento ${escapedName}, hubo un error al agendar su cita. Por favor llame de nuevo o visite nuestro sitio web. Gracias por su paciencia.</Say>
    <Hangup/>
</Response>`;
            }

            console.log('📤 Sending ERROR TwiML (Spanish)');
            res.set('Content-Type', 'text/xml; charset=utf-8');
            return res.send(errorTwiml);
        }

        const escapedName = (prospectName || 'señor')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        const escapedBusiness = (businessName || 'nuestra empresa')
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
    <Say voice="Polly.Lupe" language="es-MX">Excelentes noticias ${escapedName}. He agendado exitosamente su cita con ${escapedBusiness} para ${escapedDateTime}. Su código de confirmación es ${confirmationCode}. Recibirá un mensaje de texto con todos los detalles. Gracias por llamar y esperamos verle pronto.</Say>
    <Hangup/>
</Response>`;

        console.log('📤 Sending SUCCESS TwiML (Spanish)');
        res.set('Content-Type', 'text/xml; charset=utf-8');
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
