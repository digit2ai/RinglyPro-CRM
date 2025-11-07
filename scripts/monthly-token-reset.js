// =====================================================
// Monthly Token Reset Script
// Run this on the 1st of every month via cron
// =====================================================

require('dotenv').config();
const tokenService = require('../src/services/tokenService');

async function runMonthlyReset() {
    console.log('\n🗓️  MONTHLY 100 FREE TOKENS - Starting...\n');
    console.log(`Date: ${new Date().toISOString()}`);
    console.log('Adding 100 free tokens to all users (purchased/referral tokens kept)');
    console.log('=' .repeat(60));

    try {
        const results = await tokenService.resetMonthlyTokens();

        console.log('\n📊 RESULTS:');
        console.log(`✅ Successfully added 100 tokens to: ${results.resetCount}/${results.totalUsers} users`);

        if (results.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered: ${results.errors.length}`);
            results.errors.forEach(error => {
                console.log(`   - User ${error.userId} (${error.email}): ${error.error}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Monthly 100 free tokens added successfully\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runMonthlyReset();
}

module.exports = { runMonthlyReset };
