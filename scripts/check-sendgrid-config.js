/**
 * Check SendGrid Configuration for a Client
 * Usage: node scripts/check-sendgrid-config.js <client_id>
 */

const { sequelize } = require('../src/models');

async function checkSendGridConfig(clientId) {
    try {
        console.log(`\n🔍 Checking SendGrid configuration for client ${clientId}...\n`);

        const [results] = await sequelize.query(
            `SELECT
                id,
                business_name,
                sendgrid_api_key IS NOT NULL as has_api_key,
                LENGTH(sendgrid_api_key) as api_key_length,
                sendgrid_from_email,
                sendgrid_from_name,
                sendgrid_reply_to
             FROM clients
             WHERE id = :client_id`,
            {
                replacements: { client_id: clientId },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (results.length === 0) {
            console.log(`❌ Client ${clientId} not found`);
            process.exit(1);
        }

        const client = results[0];

        console.log('📋 Client Information:');
        console.log('  Business Name:', client.business_name);
        console.log('\n📧 SendGrid Configuration:');
        console.log('  API Key:', client.has_api_key ? `✅ Set (${client.api_key_length} chars)` : '❌ Not set');
        console.log('  From Email:', client.sendgrid_from_email || '❌ Not set');
        console.log('  From Name:', client.sendgrid_from_name || '(Not set - will default to "RinglyPro")');
        console.log('  Reply-To:', client.sendgrid_reply_to || '(Not set - will use From Email)');

        if (client.has_api_key && client.sendgrid_from_email) {
            console.log('\n✅ SendGrid is fully configured and ready to use!');
        } else {
            console.log('\n⚠️ SendGrid is NOT configured. Please configure in CRM Settings:');
            console.log('   1. Go to Dashboard → CRM Settings');
            console.log('   2. Fill in SendGrid configuration');
            console.log('   3. Save settings');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking configuration:', error.message);
        process.exit(1);
    }
}

const clientId = process.argv[2] || 15;
checkSendGridConfig(clientId);
