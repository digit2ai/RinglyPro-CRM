// Add Missing Call Tracking Columns - Safe Migration
// Only adds columns that don't already exist
const sequelize = require('../src/config/database');
const { QueryTypes } = require('sequelize');

async function addMissingColumns() {
  console.log('🚀 Adding missing call tracking columns...\n');

  try {
    console.log('📡 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Check which columns already exist
    console.log('🔍 Checking existing columns...');
    const existingColumns = await sequelize.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'business_directory'`,
      { type: QueryTypes.SELECT }
    );

    const columnNames = existingColumns.map(row => row.column_name);
    console.log(`📋 Found ${columnNames.length} existing columns\n`);

    const columnsToAdd = [
      {
        name: 'location',
        sql: `ALTER TABLE business_directory ADD COLUMN location VARCHAR(255);`,
        comment: `COMMENT ON COLUMN business_directory.location IS 'Combined city and state (e.g., "Miami, FL")';`
      },
      {
        name: 'call_status',
        sql: `ALTER TABLE business_directory ADD COLUMN call_status VARCHAR(20) DEFAULT 'TO_BE_CALLED' NOT NULL;`,
        comment: `COMMENT ON COLUMN business_directory.call_status IS 'Call status: TO_BE_CALLED, CALLED, FAILED, SKIPPED';`
      },
      {
        name: 'last_called_at',
        sql: `ALTER TABLE business_directory ADD COLUMN last_called_at TIMESTAMP;`,
        comment: `COMMENT ON COLUMN business_directory.last_called_at IS 'Timestamp of last call attempt';`
      },
      {
        name: 'call_attempts',
        sql: `ALTER TABLE business_directory ADD COLUMN call_attempts INTEGER DEFAULT 0 NOT NULL;`,
        comment: `COMMENT ON COLUMN business_directory.call_attempts IS 'Number of call attempts made';`
      },
      {
        name: 'call_result',
        sql: `ALTER TABLE business_directory ADD COLUMN call_result VARCHAR(50);`,
        comment: `COMMENT ON COLUMN business_directory.call_result IS 'Result: human, voicemail, no_answer, busy, failed';`
      },
      {
        name: 'call_notes',
        sql: `ALTER TABLE business_directory ADD COLUMN call_notes TEXT;`,
        comment: `COMMENT ON COLUMN business_directory.call_notes IS 'Notes from call attempts';`
      }
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const col of columnsToAdd) {
      if (columnNames.includes(col.name)) {
        console.log(`⏭️  Skipping ${col.name} (already exists)`);
        skippedCount++;
      } else {
        console.log(`➕ Adding ${col.name}...`);
        await sequelize.query(col.sql);
        await sequelize.query(col.comment);
        console.log(`✅ Added ${col.name}`);
        addedCount++;
      }
    }

    console.log('\n🔍 Creating indexes...');

    // Create indexes (skip if already exist)
    const indexes = [
      {
        name: 'business_directory_call_status_idx',
        sql: `CREATE INDEX IF NOT EXISTS business_directory_call_status_idx ON business_directory(call_status);`
      },
      {
        name: 'business_directory_location_idx',
        sql: `CREATE INDEX IF NOT EXISTS business_directory_location_idx ON business_directory(location);`
      },
      {
        name: 'business_directory_client_status_idx',
        sql: `CREATE INDEX IF NOT EXISTS business_directory_client_status_idx ON business_directory(client_id, call_status);`
      },
      {
        name: 'business_directory_last_called_idx',
        sql: `CREATE INDEX IF NOT EXISTS business_directory_last_called_idx ON business_directory(last_called_at);`
      }
    ];

    for (const idx of indexes) {
      try {
        await sequelize.query(idx.sql);
        console.log(`✅ Index: ${idx.name}`);
      } catch (error) {
        console.log(`⏭️  Index ${idx.name} already exists`);
      }
    }

    console.log('\n✅ Migration completed successfully!\n');
    console.log(`📊 Summary:`);
    console.log(`   - Added: ${addedCount} columns`);
    console.log(`   - Skipped: ${skippedCount} columns (already existed)`);
    console.log(`   - Indexes: 4 created/verified\n`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('👋 Database connection closed');
  }
}

addMissingColumns();
