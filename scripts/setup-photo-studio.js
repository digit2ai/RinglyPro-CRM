#!/usr/bin/env node
/**
 * Complete Photo Studio Setup Script
 * Runs all necessary migrations for Photo Studio functionality
 */

const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runMigration(name, filename) {
    try {
        console.log(`\n🔄 Running ${name}...`);

        const migrationPath = path.join(__dirname, '..', 'migrations', filename);

        if (!fs.existsSync(migrationPath)) {
            console.log(`⚠️  Migration file not found: ${filename} - Skipping`);
            return false;
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');
        await sequelize.query(sql);

        console.log(`✅ ${name} completed successfully`);
        return true;
    } catch (error) {
        console.error(`❌ ${name} failed:`, error.message);
        return false;
    }
}

async function setupPhotoStudio() {
    console.log('========================================');
    console.log('  Photo Studio Complete Setup');
    console.log('========================================\n');

    const migrations = [
        {
            name: 'Photo Studio Orders Table',
            file: 'create-photo-studio-orders.sql'
        },
        {
            name: 'Photo Uploads Table',
            file: 'create-photo-uploads.sql'
        },
        {
            name: 'Enhanced Photos Table',
            file: 'create-enhanced-photos.sql'
        },
        {
            name: 'Photo Approval System',
            file: 'add-photo-approval-system.sql'
        },
        {
            name: 'DEMO Package',
            file: 'add-demo-package.sql'
        },
        {
            name: 'Admin User Setup',
            file: 'set-admin-user.sql'
        }
    ];

    let successCount = 0;
    let failCount = 0;

    for (const migration of migrations) {
        const success = await runMigration(migration.name, migration.file);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }

    console.log('\n========================================');
    console.log('  Setup Summary');
    console.log('========================================');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('========================================\n');

    if (failCount === 0) {
        console.log('🎉 Photo Studio setup completed successfully!');
        console.log('\nYou can now:');
        console.log('1. Login at: /photo-studio-admin-login');
        console.log('2. Admin emails: mstagg@digit2ai.com, pixlypro@digit2ai.com');
        console.log('3. Access admin dashboard to manage orders\n');
    } else {
        console.log('⚠️  Some migrations failed. Check errors above.');
    }

    process.exit(failCount > 0 ? 1 : 0);
}

setupPhotoStudio();
