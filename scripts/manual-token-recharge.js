// =====================================================
// Manual Token Recharge Script
// Use this to manually add tokens to a user's account
// when payment succeeded but webhook failed
// =====================================================

require('dotenv').config();
const { User, Client } = require('../src/models');
const tokenService = require('../src/services/tokenService');

async function manualRecharge(clientId, amountPaid) {
    try {
        console.log(`\n🔧 Manual Token Recharge for Client ${clientId}`);
        console.log(`💰 Amount Paid: $${amountPaid}`);

        // Get client and user
        const client = await Client.findByPk(clientId);
        if (!client) {
            throw new Error(`Client ${clientId} not found`);
        }

        if (!client.user_id) {
            throw new Error(`Client ${clientId} has no user_id - cannot add tokens`);
        }

        const user = await User.findByPk(client.user_id);
        if (!user) {
            throw new Error(`User ${client.user_id} not found`);
        }

        console.log(`\n👤 User Found:`);
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Current Balance: ${user.tokens_balance} tokens`);
        console.log(`   - Package: ${user.token_package}`);

        // Calculate tokens to add ($0.09 per token - 40% margin rate)
        const tokensToAdd = Math.floor(amountPaid / 0.09);
        console.log(`\n📊 Calculation:`);
        console.log(`   - Amount Paid: $${amountPaid}`);
        console.log(`   - Token Rate: $0.09 per token`);
        console.log(`   - Tokens to Add: ${tokensToAdd} tokens`);

        // Add tokens
        console.log(`\n⏳ Adding ${tokensToAdd} tokens to user ${user.id}...`);

        await tokenService.addTokens(
            user.id,
            tokensToAdd,
            'manual_recharge',
            {
                client_id: clientId,
                amount_paid: amountPaid,
                reason: 'Manual recharge - payment succeeded but webhook failed',
                admin_action: true
            }
        );

        // Get updated balance
        const updatedUser = await User.findByPk(user.id);
        console.log(`\n✅ Success!`);
        console.log(`   - Previous Balance: ${user.tokens_balance} tokens`);
        console.log(`   - Tokens Added: ${tokensToAdd} tokens`);
        console.log(`   - New Balance: ${updatedUser.tokens_balance} tokens`);
        console.log(`\n🎉 Token recharge completed successfully!`);

        return {
            success: true,
            userId: user.id,
            email: user.email,
            tokensAdded: tokensToAdd,
            previousBalance: user.tokens_balance,
            newBalance: updatedUser.tokens_balance
        };

    } catch (error) {
        console.error(`\n❌ Error:`, error.message);
        throw error;
    }
}

// Command line execution
if (require.main === module) {
    const clientId = process.argv[2];
    const amountPaid = parseFloat(process.argv[3]);

    if (!clientId || !amountPaid) {
        console.log(`
Usage: node scripts/manual-token-recharge.js <clientId> <amountPaid>

Example: node scripts/manual-token-recharge.js 15 17

This will add 100 tokens (17 / 0.17) to client 15's account.
        `);
        process.exit(1);
    }

    manualRecharge(clientId, amountPaid)
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Failed:', error);
            process.exit(1);
        });
}

module.exports = { manualRecharge };
