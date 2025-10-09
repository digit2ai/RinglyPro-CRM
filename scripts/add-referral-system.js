/**
 * Migration: Add referral system to clients table
 *
 * Adds:
 * - referral_code: Unique code for each client to share
 * - referred_by: Tracks which client referred this signup
 *
 * Also generates referral codes for existing clients
 */

const { Sequelize } = require('sequelize');

// Database connection with proper priority
const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ No database URL found. Set CRM_DATABASE_URL or DATABASE_URL');
    process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

// Generate a unique 8-character alphanumeric referral code
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like O, 0, I, 1
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function addReferralSystem() {
    try {
        console.log('🔄 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Check if referral_code column exists
        console.log('\n📝 Checking if referral_code column exists...');
        const [codeResults] = await sequelize.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'clients'
            AND column_name = 'referral_code'
        `);

        if (codeResults.length === 0) {
            console.log('➕ Adding referral_code column...');
            await sequelize.query(`
                ALTER TABLE clients
                ADD COLUMN referral_code VARCHAR(10) UNIQUE
            `);
            console.log('✅ referral_code column added');

            // Add comment
            await sequelize.query(`
                COMMENT ON COLUMN clients.referral_code
                IS 'Unique referral code for this client to share with others'
            `);
        } else {
            console.log('⚠️  referral_code column already exists');
        }

        // Check if referred_by column exists
        console.log('\n📝 Checking if referred_by column exists...');
        const [referredResults] = await sequelize.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'clients'
            AND column_name = 'referred_by'
        `);

        if (referredResults.length === 0) {
            console.log('➕ Adding referred_by column...');
            await sequelize.query(`
                ALTER TABLE clients
                ADD COLUMN referred_by INTEGER REFERENCES clients(id)
            `);
            console.log('✅ referred_by column added');

            // Add comment
            await sequelize.query(`
                COMMENT ON COLUMN clients.referred_by
                IS 'Client ID of the referrer (who referred this client)'
            `);
        } else {
            console.log('⚠️  referred_by column already exists');
        }

        // Generate referral codes for existing clients without one
        console.log('\n🔄 Generating referral codes for existing clients...');
        const [existingClients] = await sequelize.query(`
            SELECT id, business_name
            FROM clients
            WHERE referral_code IS NULL
            ORDER BY id
        `);

        console.log(`Found ${existingClients.length} clients without referral codes`);

        for (const client of existingClients) {
            let referralCode;
            let isUnique = false;
            let attempts = 0;

            // Try to generate a unique code (max 5 attempts)
            while (!isUnique && attempts < 5) {
                referralCode = generateReferralCode();

                // Check if code already exists
                const [existing] = await sequelize.query(`
                    SELECT id FROM clients WHERE referral_code = $1
                `, {
                    bind: [referralCode]
                });

                if (existing.length === 0) {
                    isUnique = true;
                } else {
                    attempts++;
                }
            }

            if (isUnique) {
                await sequelize.query(`
                    UPDATE clients
                    SET referral_code = $1
                    WHERE id = $2
                `, {
                    bind: [referralCode, client.id]
                });

                console.log(`✅ Generated code ${referralCode} for client ${client.id} (${client.business_name})`);
            } else {
                console.error(`❌ Failed to generate unique code for client ${client.id} after ${attempts} attempts`);
            }
        }

        console.log('\n✅ Referral system migration completed successfully!');
        console.log('\n📊 Summary:');
        console.log('   - referral_code column added (unique, shareable)');
        console.log('   - referred_by column added (tracks referrer)');
        console.log(`   - ${existingClients.length} referral codes generated`);

        await sequelize.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        await sequelize.close();
        process.exit(1);
    }
}

addReferralSystem();
