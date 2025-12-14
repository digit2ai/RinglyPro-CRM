// =====================================================
// Auto-Migrate Project Tracker Tables
// This runs on server startup to ensure tables exist
// =====================================================

const { Sequelize } = require('sequelize');

async function autoMigrateProjects() {
    const sequelize = require('../src/config/database');

    try {
        console.log('📋 Auto-migrating Project Tracker tables...');

        // Check if projects table exists
        const [projectsExists] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'projects'
            );
        `);

        if (projectsExists[0].exists) {
            console.log('✅ Project Tracker tables already exist');
            return;
        }

        console.log('🔄 Creating Project Tracker tables...');

        // Create projects table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                priority VARCHAR(50) DEFAULT 'medium',
                estimated_completion DATE,
                actual_completion DATE,
                created_by_admin INTEGER REFERENCES users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Create indexes for projects
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
        `);

        // Create project_milestones table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS project_milestones (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                "order" INTEGER DEFAULT 0,
                due_date DATE,
                completed_at TIMESTAMP WITH TIME ZONE,
                admin_notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Create indexes for milestones
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON project_milestones(project_id);
            CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
        `);

        // Create project_messages table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS project_messages (
                id SERIAL PRIMARY KEY,
                milestone_id INTEGER NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                is_admin BOOLEAN DEFAULT false,
                message TEXT NOT NULL,
                read_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Create indexes for messages
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_milestone_id ON project_messages(milestone_id);
            CREATE INDEX IF NOT EXISTS idx_messages_is_admin ON project_messages(is_admin);
        `);

        console.log('✅ Project Tracker tables created successfully');

    } catch (error) {
        console.error('⚠️ Project Tracker auto-migration error:', error.message);
        // Don't throw - allow server to continue starting
    }
}

module.exports = { autoMigrateProjects };
