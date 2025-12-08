// Run migration to make business_name and business_type optional
const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Make business_name nullable
    await client.query(`
      ALTER TABLE ordergopro_clients
      ALTER COLUMN business_name DROP NOT NULL;
    `);
    console.log('✅ Made business_name nullable');

    // Make business_type nullable (if it has NOT NULL constraint)
    try {
      await client.query(`
        ALTER TABLE ordergopro_clients
        ALTER COLUMN business_type DROP NOT NULL;
      `);
      console.log('✅ Made business_type nullable');
    } catch (err) {
      console.log('ℹ️  business_type was already nullable');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('business_name and business_type are now optional fields in ordergopro_clients');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
