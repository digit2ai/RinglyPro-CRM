const sequelize = require('./src/config/database');

async function checkConstraints() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Check the unique constraint
    const constraints = await sequelize.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        tc.constraint_type
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'appointments'
        AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.constraint_name, kcu.ordinal_position;
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('Unique constraints on appointments table:\n');
    constraints.forEach(c => {
      console.log(`  ${c.constraint_name}: ${c.column_name}`);
    });

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkConstraints();
