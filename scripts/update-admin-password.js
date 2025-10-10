// Update admin account password with properly hashed version
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || process.env.CRM_DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ No database URL found. Set DATABASE_URL or CRM_DATABASE_URL environment variable.');
    process.exit(1);
}

async function updateAdminPassword() {
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        console.log('🔐 Generating bcrypt hash for password: Admin2024!');

        // Generate bcrypt hash with salt rounds = 10
        const password = 'Admin2024!';
        const passwordHash = await bcrypt.hash(password, 10);

        console.log(`✅ Generated hash: ${passwordHash}`);
        console.log(`📏 Hash length: ${passwordHash.length}`);

        // Update the admin account
        console.log('📝 Updating info@digit2ai.com account...');

        const updateQuery = `
            UPDATE users
            SET password_hash = $1,
                is_admin = TRUE,
                admin_phone = '+18886103810',
                phone_number = '+18886103810',
                terms_accepted = TRUE,
                email_verified = TRUE,
                updated_at = NOW()
            WHERE email = 'info@digit2ai.com'
            RETURNING id, email, first_name, last_name, is_admin, admin_phone;
        `;

        const result = await pool.query(updateQuery, [passwordHash]);

        if (result.rows.length === 0) {
            console.log('⚠️ Account not found. Creating new account...');

            const insertQuery = `
                INSERT INTO users (
                    email, password_hash, first_name, last_name, phone_number,
                    is_admin, admin_phone, terms_accepted, email_verified,
                    created_at, updated_at
                ) VALUES (
                    'info@digit2ai.com', $1, 'Admin', 'RinglyPro', '+18886103810',
                    TRUE, '+18886103810', TRUE, TRUE,
                    NOW(), NOW()
                )
                RETURNING id, email, first_name, last_name, is_admin, admin_phone;
            `;

            const insertResult = await pool.query(insertQuery, [passwordHash]);
            console.log('✅ Admin account created:');
            console.log(insertResult.rows[0]);
        } else {
            console.log('✅ Admin account updated:');
            console.log(result.rows[0]);
        }

        console.log('\n✅ SUCCESS! Admin account ready.');
        console.log('📧 Email: info@digit2ai.com');
        console.log('🔑 Password: Admin2024!');
        console.log('📞 Admin Phone: +18886103810');

        await pool.end();

    } catch (error) {
        console.error('❌ Error updating admin password:', error.message);
        process.exit(1);
    }
}

updateAdminPassword();
