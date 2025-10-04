// Migration: Make customer_email optional in appointments table
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Making customer_email column optional in appointments table...');

    await pool.query(`
      ALTER TABLE appointments
      ALTER COLUMN customer_email DROP NOT NULL;
    `);

    console.log('✅ Migration completed successfully!');
    console.log('   - customer_email is now optional in appointments table');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = migrate;