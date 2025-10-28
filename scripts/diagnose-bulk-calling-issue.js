// Diagnose Bulk Calling Issue
const { Sequelize, QueryTypes } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

async function diagnose() {
  try {
    console.log('\n🔍 DIAGNOSING BULK CALLING ISSUE\n');

    // Check the problem phone number
    console.log('1️⃣  Checking problem phone: +18135536872');
    const [problemProspect] = await sequelize.query(
      `SELECT * FROM business_directory WHERE phone_number LIKE '%8135536872%'`,
      { type: QueryTypes.SELECT }
    );

    if (problemProspect) {
      console.log('   Found in database:');
      console.log('   ID:', problemProspect.id);
      console.log('   Business:', problemProspect.business_name);
      console.log('   Phone:', problemProspect.phone_number);
      console.log('   Call Status:', problemProspect.call_status);
      console.log('   Call Attempts:', problemProspect.call_attempts);
      console.log('   Last Called:', problemProspect.last_called_at);
    } else {
      console.log('   ❌ NOT FOUND in business_directory table');
    }

    // Check TO_BE_CALLED queue
    console.log('\n2️⃣  Checking TO_BE_CALLED queue:');
    const [queueStats] = await sequelize.query(
      `SELECT
        call_status,
        COUNT(*) as count
       FROM business_directory
       GROUP BY call_status
       ORDER BY count DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log('   Status Distribution:');
    const allStats = await sequelize.query(
      `SELECT call_status, COUNT(*) FROM business_directory GROUP BY call_status`,
      { type: QueryTypes.SELECT }
    );
    allStats.forEach(stat => {
      console.log(`   ${stat.call_status}: ${stat.count}`);
    });

    // Check first 5 TO_BE_CALLED prospects
    console.log('\n3️⃣  First 5 prospects in queue:');
    const queue = await sequelize.query(
      `SELECT id, business_name, phone_number, call_status, call_attempts
       FROM business_directory
       WHERE call_status = 'TO_BE_CALLED'
       ORDER BY created_at ASC
       LIMIT 5`,
      { type: QueryTypes.SELECT }
    );

    if (queue.length > 0) {
      queue.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.business_name} - ${p.phone_number} (Attempts: ${p.call_attempts})`);
      });
    } else {
      console.log('   ❌ NO PROSPECTS with TO_BE_CALLED status');
    }

    // Check recently CALLED prospects
    console.log('\n4️⃣  Recently called prospects:');
    const recent = await sequelize.query(
      `SELECT business_name, phone_number, call_status, call_result, call_attempts, last_called_at
       FROM business_directory
       WHERE call_status = 'CALLED'
       ORDER BY last_called_at DESC
       LIMIT 5`,
      { type: QueryTypes.SELECT }
    );

    if (recent.length > 0) {
      recent.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.business_name} - ${p.phone_number}`);
        console.log(`      Result: ${p.call_result}, Attempts: ${p.call_attempts}, Last: ${p.last_called_at}`);
      });
    } else {
      console.log('   No CALLED prospects found');
    }

    // Check database columns
    console.log('\n5️⃣  Checking database schema:');
    const [columns] = await sequelize.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'business_directory'
       AND column_name IN ('call_status', 'call_attempts', 'last_called_at', 'call_result')`,
      { type: QueryTypes.SELECT }
    );

    console.log('   Available columns:');
    if (columns) {
      const allCols = await sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'business_directory'`,
        { type: QueryTypes.SELECT }
      );
      allCols.forEach(col => console.log(`   - ${col.column_name}`));
    }

    console.log('\n✅ Diagnosis complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

diagnose();
