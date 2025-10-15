// Decode JWT token to see what's inside
const axios = require('axios');

async function decodeJWT() {
    try {
        // Get the JWT token from database
        const response = await axios.get('https://ringlypro-crm.onrender.com/api/client/crm-credentials/15');
        const apiKey = response.data.credentials.gohighlevel.api_key;

        console.log('\n🔑 JWT Token Analysis:\n');
        console.log('Full token:', apiKey.substring(0, 50) + '...');

        // JWT tokens have 3 parts separated by dots
        const parts = apiKey.split('.');
        console.log('\nParts:', parts.length);

        if (parts.length === 3) {
            // Decode header
            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            console.log('\n📋 Header:', JSON.stringify(header, null, 2));

            // Decode payload
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('\n📦 Payload:', JSON.stringify(payload, null, 2));

            // Check expiration
            if (payload.exp) {
                const expDate = new Date(payload.exp * 1000);
                const now = new Date();
                console.log('\n⏰ Expiration:', expDate.toLocaleString());
                console.log('⏰ Current Time:', now.toLocaleString());
                console.log('⏰ Expired?', now > expDate ? '❌ YES - TOKEN EXPIRED!' : '✅ No');
            }

            // Check if location_id is in payload
            if (payload.location_id) {
                console.log('\n📍 Location ID from token:', payload.location_id);
            }
        } else {
            console.log('❌ Not a valid JWT token format');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

decodeJWT();
