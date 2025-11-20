#!/usr/bin/env node

/**
 * Script to manually credit tokens for successful Stripe payments
 * that didn't get credited due to the bug
 *
 * Usage: node scripts/credit-missing-tokens.js <user-email> <tokens> <amount>
 * Example: node scripts/credit-missing-tokens.js mstagg@digit2ai.com 100 10
 */

const { User } = require('../src/models');
const tokenService = require('../src/services/tokenService');

async function creditMissingTokens() {
  try {
    const email = process.argv[2];
    const tokens = parseInt(process.argv[3]);
    const amount = parseFloat(process.argv[4]);

    if (!email || !tokens || !amount) {
      console.error('❌ Usage: node scripts/credit-missing-tokens.js <email> <tokens> <amount>');
      console.error('   Example: node scripts/credit-missing-tokens.js user@example.com 100 10');
      process.exit(1);
    }

    console.log('🔍 Looking up user...');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.first_name} ${user.last_name} (ID: ${user.id})`);
    console.log(`   Current balance: ${user.tokens_balance} tokens`);

    console.log(`\n💳 Crediting ${tokens} tokens for $${amount} payment...`);

    const result = await tokenService.addTokens(user.id, tokens, 'manual_credit', {
      reason: 'Manual credit for successful Stripe payment that was not automatically credited',
      amount: amount,
      currency: 'usd',
      credited_by: 'admin_script',
      timestamp: new Date().toISOString()
    });

    console.log(`✅ SUCCESS! Tokens credited.`);
    console.log(`   Previous balance: ${user.tokens_balance} tokens`);
    console.log(`   New balance: ${result.balance} tokens`);
    console.log(`   Tokens added: ${tokens}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

creditMissingTokens();
