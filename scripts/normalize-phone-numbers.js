// Normalize Phone Numbers to E.164 Format - Node.js Version with Progress
const { Sequelize, QueryTypes } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
function normalizePhoneE164(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Must be 10 or 11 digits
  if (digits.length !== 10 && digits.length !== 11) {
    return null; // Invalid phone
  }

  // Normalize to 11 digits (add country code 1 if needed)
  const normalized = digits.length === 10 ? '1' + digits : digits;

  // Return E.164 format with + prefix
  return '+' + normalized;
}

async function normalizePhoneNumbers() {
  try {
    console.log('\n🔧 PHONE NUMBER NORMALIZATION SCRIPT');
    console.log('====================================\n');

    // Get all prospects with phone numbers
    console.log('📊 Fetching all prospects with phone numbers...');
    const prospects = await sequelize.query(
      `SELECT id, business_name, phone_number, call_status
       FROM business_directory
       WHERE phone_number IS NOT NULL
       ORDER BY id`,
      { type: QueryTypes.SELECT }
    );

    console.log(`✅ Found ${prospects.length} prospects with phone numbers\n`);

    // Analyze current state
    const stats = {
      total: prospects.length,
      alreadyNormalized: 0,
      needsNormalization: 0,
      invalid: 0,
      updated: 0,
      failed: 0
    };

    const updates = [];

    console.log('🔍 Analyzing phone number formats...\n');

    for (const prospect of prospects) {
      const currentPhone = prospect.phone_number;
      const normalizedPhone = normalizePhoneE164(currentPhone);

      if (!normalizedPhone) {
        stats.invalid++;
        console.log(`❌ Invalid: ${prospect.business_name} - ${currentPhone}`);
        continue;
      }

      if (currentPhone === normalizedPhone) {
        stats.alreadyNormalized++;
      } else {
        stats.needsNormalization++;
        updates.push({
          id: prospect.id,
          name: prospect.business_name,
          oldPhone: currentPhone,
          newPhone: normalizedPhone
        });
      }
    }

    console.log('\n📈 ANALYSIS SUMMARY:');
    console.log(`   Total prospects: ${stats.total}`);
    console.log(`   ✅ Already normalized: ${stats.alreadyNormalized}`);
    console.log(`   🔄 Need normalization: ${stats.needsNormalization}`);
    console.log(`   ❌ Invalid phones: ${stats.invalid}\n`);

    if (updates.length === 0) {
      console.log('✅ All phone numbers are already in E.164 format!');
      console.log('   No migration needed.\n');
      await sequelize.close();
      return;
    }

    // Show preview of first 10 updates
    console.log('📋 PREVIEW OF CHANGES (first 10):');
    updates.slice(0, 10).forEach((update, i) => {
      console.log(`   ${i + 1}. ${update.name}`);
      console.log(`      ${update.oldPhone} → ${update.newPhone}`);
    });

    if (updates.length > 10) {
      console.log(`   ... and ${updates.length - 10} more`);
    }

    console.log('\n⚠️  WARNING: This will update phone numbers in the database!');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');

    // Wait 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🚀 Starting migration...\n');

    // Update phone numbers one by one with progress
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];

      try {
        await sequelize.query(
          `UPDATE business_directory
           SET phone_number = :newPhone,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = :id`,
          {
            replacements: {
              id: update.id,
              newPhone: update.newPhone
            },
            type: QueryTypes.UPDATE
          }
        );

        stats.updated++;

        // Show progress every 50 updates
        if ((i + 1) % 50 === 0 || i === updates.length - 1) {
          const percentage = ((i + 1) / updates.length * 100).toFixed(1);
          console.log(`   Progress: ${i + 1}/${updates.length} (${percentage}%)`);
        }

      } catch (error) {
        stats.failed++;
        console.error(`   ❌ Failed to update ${update.name}: ${error.message}`);
      }
    }

    console.log('\n✅ MIGRATION COMPLETE!\n');
    console.log('📊 FINAL SUMMARY:');
    console.log(`   Total prospects: ${stats.total}`);
    console.log(`   ✅ Successfully updated: ${stats.updated}`);
    console.log(`   ❌ Failed updates: ${stats.failed}`);
    console.log(`   ⚠️  Invalid phones: ${stats.invalid}`);
    console.log(`   ✨ Already normalized: ${stats.alreadyNormalized}\n`);

    // Verify results
    console.log('🔍 Verifying normalization...');
    const verification = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (WHERE phone_number ~ '^\\+1\\d{10}$') as normalized,
        COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND phone_number !~ '^\\+1\\d{10}$') as not_normalized,
        COUNT(*) FILTER (WHERE phone_number IS NULL) as null_phones,
        COUNT(*) as total
       FROM business_directory`,
      { type: QueryTypes.SELECT }
    );

    const v = verification[0];
    console.log(`   ✅ Normalized (E.164): ${v.normalized}`);
    console.log(`   ⚠️  Not normalized: ${v.not_normalized}`);
    console.log(`   ⚪ Null phones: ${v.null_phones}`);
    console.log(`   📊 Total prospects: ${v.total}\n`);

    console.log('🎉 Phone number normalization completed successfully!');
    console.log('   All new prospects will be saved in E.164 format automatically.\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

// Run the migration
normalizePhoneNumbers();
