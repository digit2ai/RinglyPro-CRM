/**
 * Quick script to generate referral codes for existing clients
 * Run this if referral columns exist but codes are missing
 */

const { Client } = require('../src/models');

// Generate a unique 8-character alphanumeric referral code
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function generateCodes() {
    try {
        console.log('🔄 Finding clients without referral codes...');

        // Find all clients without referral codes
        const clients = await Client.findAll({
            where: {
                referral_code: null
            },
            attributes: ['id', 'business_name', 'owner_email']
        });

        console.log(`Found ${clients.length} clients without referral codes\n`);

        if (clients.length === 0) {
            console.log('✅ All clients already have referral codes!');
            process.exit(0);
        }

        for (const client of clients) {
            let referralCode;
            let isUnique = false;
            let attempts = 0;

            // Try to generate a unique code (max 5 attempts)
            while (!isUnique && attempts < 5) {
                referralCode = generateReferralCode();

                // Check if code already exists
                const existing = await Client.findOne({
                    where: { referral_code: referralCode }
                });

                if (!existing) {
                    isUnique = true;
                } else {
                    attempts++;
                }
            }

            if (isUnique) {
                await client.update({ referral_code: referralCode });
                console.log(`✅ ${client.owner_email} (${client.business_name})`);
                console.log(`   Referral Code: ${referralCode}`);
                console.log(`   Link: https://aiagent.ringlypro.com/signup?ref=${referralCode}\n`);
            } else {
                console.error(`❌ Failed to generate unique code for client ${client.id} after ${attempts} attempts\n`);
            }
        }

        console.log('✅ All referral codes generated successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

generateCodes();
