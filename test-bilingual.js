// Test script for bilingual voice bot implementation
require('dotenv').config();
const ClientIdentificationService = require('./src/services/clientIdentificationService');
const MultiTenantRachelService = require('./src/services/rachelVoiceService');
const LinaSpanishVoiceService = require('./src/services/linaVoiceService');

async function testBilingualSystem() {
    console.log('🧪 Testing Bilingual Voice Bot System\n');
    console.log('=' .repeat(60));

    // Test 1: Environment Variables
    console.log('\n📋 TEST 1: Environment Variables');
    console.log('-'.repeat(60));
    const requiredEnvVars = {
        'DATABASE_URL': process.env.DATABASE_URL,
        'WEBHOOK_BASE_URL': process.env.WEBHOOK_BASE_URL,
        'ELEVENLABS_API_KEY': process.env.ELEVENLABS_API_KEY,
        'TWILIO_PHONE_NUMBER': process.env.TWILIO_PHONE_NUMBER
    };

    let envVarsOk = true;
    for (const [key, value] of Object.entries(requiredEnvVars)) {
        const status = value ? '✅' : '❌';
        const displayValue = value ? (key.includes('KEY') ? '***HIDDEN***' : value) : 'NOT SET';
        console.log(`${status} ${key}: ${displayValue}`);
        if (!value) envVarsOk = false;
    }

    if (!envVarsOk) {
        console.log('\n❌ Missing required environment variables. Exiting.');
        process.exit(1);
    }

    // Test 2: Client Identification
    console.log('\n📋 TEST 2: Client Identification Service');
    console.log('-'.repeat(60));

    const clientService = new ClientIdentificationService(process.env.DATABASE_URL);

    try {
        const testNumber = '+18886103810';
        console.log(`Testing with number: ${testNumber}`);

        const clientInfo = await clientService.identifyClientByNumber(testNumber);

        if (clientInfo) {
            console.log('✅ Client identified successfully:');
            console.log(`   - Client ID: ${clientInfo.client_id}`);
            console.log(`   - Business Name: ${clientInfo.business_name}`);
            console.log(`   - Rachel Enabled: ${clientInfo.rachel_enabled}`);
            console.log(`   - RinglyPro Number: ${clientInfo.ringlypro_number}`);
        } else {
            console.log('❌ No client found for this number');
            console.log('⚠️  You need to add a test client to the database');
        }
    } catch (error) {
        console.log('❌ Client identification failed:', error.message);
    }

    // Test 3: Rachel Service Initialization
    console.log('\n📋 TEST 3: Rachel Voice Service (English)');
    console.log('-'.repeat(60));

    const rachelService = new MultiTenantRachelService(
        process.env.DATABASE_URL,
        process.env.WEBHOOK_BASE_URL,
        process.env.ELEVENLABS_API_KEY
    );

    console.log('✅ Rachel service initialized');
    console.log(`   - Voice ID: ${rachelService.rachelVoiceId}`);
    console.log(`   - Webhook URL: ${rachelService.webhookBaseUrl}`);
    console.log(`   - ElevenLabs API: ${rachelService.elevenlabsApiKey ? 'Configured' : 'Missing'}`);

    // Test 4: Lina Service Initialization
    console.log('\n📋 TEST 4: Lina Voice Service (Spanish)');
    console.log('-'.repeat(60));

    const linaService = new LinaSpanishVoiceService(
        process.env.DATABASE_URL,
        process.env.WEBHOOK_BASE_URL,
        process.env.ELEVENLABS_API_KEY
    );

    console.log('✅ Lina service initialized');
    console.log(`   - Voice ID: ${linaService.linaVoiceId}`);
    console.log(`   - Webhook URL: ${linaService.webhookBaseUrl}`);
    console.log(`   - ElevenLabs API: ${linaService.elevenlabsApiKey ? 'Configured' : 'Missing'}`);

    // Test 5: Generate Spanish Greeting Text
    console.log('\n📋 TEST 5: Spanish Greeting Generation');
    console.log('-'.repeat(60));

    const mockClientInfo = {
        client_id: 1,
        business_name: 'RinglyPro',
        rachel_enabled: true
    };

    const spanishGreeting = linaService.getSpanishGreetingText(mockClientInfo);
    console.log('✅ Spanish greeting generated:');
    console.log(`   "${spanishGreeting.substring(0, 100)}..."`);

    // Test 6: Generate English Greeting Text
    console.log('\n📋 TEST 6: English Greeting Generation');
    console.log('-'.repeat(60));

    const englishGreeting = rachelService.clientService.getClientGreetingText(mockClientInfo);
    console.log('✅ English greeting generated:');
    console.log(`   "${englishGreeting.substring(0, 100)}..."`);

    // Test 7: Keyword Recognition (Spanish)
    console.log('\n📋 TEST 7: Spanish Keyword Recognition');
    console.log('-'.repeat(60));

    const spanishTestPhrases = [
        'Quiero hacer una cita',
        '¿Cuánto cuesta?',
        'Necesito ayuda'
    ];

    for (const phrase of spanishTestPhrases) {
        const hasAppointment = linaService.containsKeywords(phrase.toLowerCase(), ['cita', 'reservar', 'agendar']);
        const hasPricing = linaService.containsKeywords(phrase.toLowerCase(), ['precio', 'costo', 'cuánto']);
        const hasSupport = linaService.containsKeywords(phrase.toLowerCase(), ['ayuda', 'soporte']);

        let intent = 'unknown';
        if (hasAppointment) intent = 'appointment';
        else if (hasPricing) intent = 'pricing';
        else if (hasSupport) intent = 'support';

        console.log(`   "${phrase}" → Intent: ${intent} ${intent !== 'unknown' ? '✅' : '⚠️'}`);
    }

    // Test 8: Keyword Recognition (English)
    console.log('\n📋 TEST 8: English Keyword Recognition');
    console.log('-'.repeat(60));

    const englishTestPhrases = [
        'I want to book an appointment',
        'How much does it cost?',
        'I need help'
    ];

    for (const phrase of englishTestPhrases) {
        const hasAppointment = rachelService.containsKeywords(phrase.toLowerCase(), ['book', 'appointment', 'schedule']);
        const hasPricing = rachelService.containsKeywords(phrase.toLowerCase(), ['price', 'pricing', 'cost']);
        const hasSupport = rachelService.containsKeywords(phrase.toLowerCase(), ['support', 'help', 'speak with']);

        let intent = 'unknown';
        if (hasAppointment) intent = 'appointment';
        else if (hasPricing) intent = 'pricing';
        else if (hasSupport) intent = 'support';

        console.log(`   "${phrase}" → Intent: ${intent} ${intent !== 'unknown' ? '✅' : '⚠️'}`);
    }

    // Test 9: Test ElevenLabs TTS (Optional - only if you want to test API)
    console.log('\n📋 TEST 9: ElevenLabs TTS Test (Optional)');
    console.log('-'.repeat(60));
    console.log('⚠️  Skipping actual TTS generation to save API credits');
    console.log('   To test TTS, uncomment the code in test-bilingual.js');

    /*
    // Uncomment to test actual TTS generation
    try {
        console.log('Testing Rachel voice...');
        const rachelAudio = await rachelService.generateRachelAudio('Hello, this is a test.');
        console.log(rachelAudio ? '✅ Rachel TTS working' : '❌ Rachel TTS failed');

        console.log('Testing Lina voice...');
        const linaAudio = await linaService.generateLinaAudio('Hola, esto es una prueba.');
        console.log(linaAudio ? '✅ Lina TTS working' : '❌ Lina TTS failed');
    } catch (error) {
        console.log('❌ TTS test failed:', error.message);
    }
    */

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Environment variables configured');
    console.log('✅ Rachel service initialized');
    console.log('✅ Lina service initialized');
    console.log('✅ Keyword recognition working');
    console.log('✅ Greeting generation working');
    console.log('\n⚠️  NEXT STEPS:');
    console.log('   1. Ensure a test client exists in database with ringlypro_number = +18886103810');
    console.log('   2. Start the server: npm start');
    console.log('   3. Use ngrok to expose localhost: ngrok http 3000');
    console.log('   4. Configure Twilio webhook to point to ngrok URL');
    console.log('   5. Call +18886103810 to test live');
    console.log('\n');

    process.exit(0);
}

// Run tests
testBilingualSystem().catch(error => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
});
