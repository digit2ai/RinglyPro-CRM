// Run Design Brief & AI Outputs migrations for Photo Studio
const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    try {
        console.log('🔄 Running Photo Studio Design Brief migrations...\n');

        // Migration 1: Design Briefs
        console.log('1️⃣ Creating photo_studio_design_briefs table...');
        const designBriefPath = path.join(__dirname, '..', 'migrations', 'create-photo-studio-design-briefs.sql');
        const designBriefSQL = fs.readFileSync(designBriefPath, 'utf8');
        await sequelize.query(designBriefSQL);
        console.log('   ✅ photo_studio_design_briefs table created\n');

        // Migration 2: AI Outputs
        console.log('2️⃣ Creating photo_studio_ai_outputs table...');
        const aiOutputsPath = path.join(__dirname, '..', 'migrations', 'create-photo-studio-ai-outputs.sql');
        const aiOutputsSQL = fs.readFileSync(aiOutputsPath, 'utf8');
        await sequelize.query(aiOutputsSQL);
        console.log('   ✅ photo_studio_ai_outputs table created\n');

        console.log('✅ All Design Brief migrations completed successfully!\n');
        console.log('📋 Next steps:');
        console.log('   1. Update frontend views with Design Brief UI (see DESIGN_BRIEF_IMPLEMENTATION_GUIDE.md)');
        console.log('   2. Configure MCP_SERVER_URL in environment variables');
        console.log('   3. Test design brief creation in customer portal');
        console.log('   4. Test AI generation in admin dashboard\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();
