const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require'
});

async function addDemoData() {
    const client = await pool.connect();

    try {
        console.log('🔍 Finding demo account...');

        // Get demo user and client
        const userResult = await client.query(`
            SELECT u.id as user_id, u.email, c.id as client_id, c.business_name
            FROM users u
            JOIN clients c ON u.id = c.user_id
            WHERE u.email = 'demo@ringlypro.com'
        `);

        if (userResult.rows.length === 0) {
            console.log('❌ Demo account not found!');
            return;
        }

        const { user_id, client_id, business_name } = userResult.rows[0];
        console.log(`✅ Found demo account: ${business_name} (Client ID: ${client_id})`);

        // Add dummy contacts
        console.log('\n📇 Adding demo contacts...');
        const contacts = [
            { first_name: 'John', last_name: 'Smith', phone: '+15550101', email: 'john.smith@example.com', notes: 'Tech Solutions Inc - Interested in AI features', status: 'active' },
            { first_name: 'Sarah', last_name: 'Johnson', phone: '+15550102', email: 'sarah.j@example.com', notes: 'Marketing Pro - Pricing inquiry (Sales Lead)', status: 'active' },
            { first_name: 'Michael', last_name: 'Chen', phone: '+15550103', email: 'mchen@example.com', notes: 'Chen Consulting - Technical support', status: 'active' },
            { first_name: 'Emily', last_name: 'Rodriguez', phone: '+15550104', email: 'emily.r@example.com', notes: 'Rodriguez & Associates - New customer', status: 'active' },
            { first_name: 'David', last_name: 'Brown', phone: '+15550105', email: 'dbrown@example.com', notes: 'Brown Enterprises - Demo scheduled (Sales Lead)', status: 'active' },
            { first_name: 'Lisa', last_name: 'Anderson', phone: '+15550106', email: 'lisa.a@example.com', notes: 'Anderson LLC - Integration setup', status: 'active' },
            { first_name: 'James', last_name: 'Wilson', phone: '+15550107', email: 'jwilson@example.com', notes: 'Wilson Group - Past customer', status: 'inactive' },
            { first_name: 'Maria', last_name: 'Garcia', phone: '+15550108', email: 'mgarcia@example.com', notes: 'Garcia Solutions - Sales lead', status: 'active' }
        ];

        // First, clear any existing demo data to start fresh
        await client.query('DELETE FROM appointments WHERE client_id = $1', [client_id]);
        await client.query('DELETE FROM calls WHERE client_id = $1', [client_id]);
        await client.query('DELETE FROM contacts WHERE client_id = $1', [client_id]);
        console.log('  ✓ Cleared existing demo data');

        for (const contact of contacts) {
            await client.query(`
                INSERT INTO contacts (client_id, first_name, last_name, phone, email, notes, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            `, [client_id, contact.first_name, contact.last_name, contact.phone, contact.email, contact.notes, contact.status]);
            console.log(`  ✓ Added: ${contact.first_name} ${contact.last_name} (${contact.notes.split(' - ')[0]})`);
        }

        // Add dummy calls
        console.log('\n📞 Adding demo calls...');

        // First, get the contact IDs we just created
        const contactsResult = await client.query(`
            SELECT id, first_name, last_name, phone FROM contacts WHERE client_id = $1
        `, [client_id]);

        const contactMap = {};
        contactsResult.rows.forEach(row => {
            contactMap[row.phone] = { id: row.id, name: `${row.first_name} ${row.last_name}` };
        });

        const callLogs = [
            { phone: '+15550101', duration: 245, direction: 'inbound', status: 'completed', notes: 'Customer inquired about our AI voice assistant features' },
            { phone: '+15550102', duration: 180, direction: 'outgoing', status: 'completed', notes: 'Follow-up call regarding pricing plans' },
            { phone: '+15550103', duration: 320, direction: 'inbound', status: 'completed', notes: 'Technical support for calendar integration' },
            { phone: '+15550104', duration: 156, direction: 'inbound', status: 'completed', notes: 'New customer onboarding call' },
            { phone: '+15550105', duration: 95, direction: 'outgoing', status: 'no-answer', notes: 'No answer - will try again later' },
            { phone: '+15550106', duration: 420, direction: 'inbound', status: 'completed', notes: 'Discussed GoHighLevel integration setup' }
        ];

        for (const call of callLogs) {
            const daysAgo = Math.floor(Math.random() * 7);
            const startTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
            const endTime = new Date(startTime.getTime() + call.duration * 1000);
            const contact = contactMap[call.phone];

            await client.query(`
                INSERT INTO calls (
                    client_id, contact_id, direction, from_number, to_number,
                    status, call_status, duration, caller_name, notes,
                    start_time, end_time, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            `, [
                client_id,
                contact.id,
                call.direction,
                call.direction === 'inbound' ? call.phone : '+18001234567',
                call.direction === 'inbound' ? '+18001234567' : call.phone,
                call.status,
                call.status,
                call.duration,
                contact.name,
                call.notes,
                startTime,
                endTime
            ]);
            console.log(`  ✓ ${call.direction === 'inbound' ? '📥' : '📤'} ${contact.name} - ${Math.floor(call.duration / 60)}m ${call.duration % 60}s`);
        }

        // Add dummy appointments
        console.log('\n📅 Adding demo appointments...');
        const appointments = [
            { phone: '+15550101', purpose: 'Product Demo', daysOffset: 2, duration: 60, status: 'confirmed' },
            { phone: '+15550102', purpose: 'Onboarding Call', daysOffset: 5, duration: 45, status: 'confirmed' },
            { phone: '+15550103', purpose: 'Technical Review', daysOffset: 1, duration: 30, status: 'confirmed' },
            { phone: '+15550104', purpose: 'Strategy Session', daysOffset: -3, duration: 60, status: 'completed' },
            { phone: '+15550106', purpose: 'Monthly Check-in', daysOffset: 10, duration: 30, status: 'confirmed' }
        ];

        for (const apt of appointments) {
            const contact = contactMap[apt.phone];
            const appointmentDate = new Date(Date.now() + apt.daysOffset * 24 * 60 * 60 * 1000);
            const appointmentDateStr = appointmentDate.toISOString().split('T')[0];
            const appointmentTime = '14:00:00'; // 2 PM

            await client.query(`
                INSERT INTO appointments (
                    client_id, contact_id, customer_name, customer_phone, customer_email,
                    appointment_date, appointment_time, duration, purpose, status,
                    source, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            `, [
                client_id,
                contact.id,
                contact.name,
                apt.phone,
                null, // customer_email
                appointmentDateStr,
                appointmentTime,
                apt.duration,
                apt.purpose,
                apt.status,
                'online'
            ]);
            console.log(`  ✓ ${apt.status === 'completed' ? '✅' : '🕐'} ${apt.purpose} with ${contact.name}`);
        }

        // Add token balance for demo
        console.log('\n💰 Setting demo account tokens...');
        await client.query(`
            INSERT INTO credit_accounts (client_id, balance, free_minutes_used, total_minutes_used, created_at)
            VALUES ($1, 500, 25, 50, NOW())
            ON CONFLICT (client_id)
            DO UPDATE SET balance = 500, free_minutes_used = 25, total_minutes_used = 50
        `, [client_id]);
        console.log('  ✓ Set balance: 500 tokens (used 25 of 100 free minutes)');

        console.log('\n✅ Demo data added successfully!');
        console.log('\n📊 Summary:');
        console.log(`   • 8 contacts added`);
        console.log(`   • 6 calls added`);
        console.log(`   • 5 appointments added`);
        console.log(`   • 500 tokens balance`);
        console.log('\n🔐 Demo Account Credentials:');
        console.log('   Email: demo@ringlypro.com');
        console.log('   Password: DemoRingly2024!');

    } catch (error) {
        console.error('❌ Error adding demo data:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the script
addDemoData()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
