// =====================================================
// Create Project Tracker Tables Migration
// Run: node scripts/create-project-tables.js
// =====================================================

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

async function createProjectTables() {
    try {
        console.log('🔄 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Create projects table
        console.log('\n📋 Creating projects table...');
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'on_hold', 'cancelled')),
                priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                estimated_completion DATE,
                actual_completion DATE,
                created_by_admin INTEGER REFERENCES users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Projects table created');

        // Create indexes for projects
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);
        `);
        console.log('✅ Projects indexes created');

        // Create project_milestones table
        console.log('\n📋 Creating project_milestones table...');
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS project_milestones (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
                "order" INTEGER DEFAULT 0,
                due_date DATE,
                completed_at TIMESTAMP WITH TIME ZONE,
                admin_notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Project milestones table created');

        // Create indexes for milestones
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON project_milestones(project_id);
            CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
            CREATE INDEX IF NOT EXISTS idx_milestones_order ON project_milestones("order");
            CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON project_milestones(due_date);
        `);
        console.log('✅ Milestone indexes created');

        // Create project_messages table
        console.log('\n📋 Creating project_messages table...');
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
        console.log('✅ Project messages table created');

        // Create indexes for messages
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_milestone_id ON project_messages(milestone_id);
            CREATE INDEX IF NOT EXISTS idx_messages_user_id ON project_messages(user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_is_admin ON project_messages(is_admin);
            CREATE INDEX IF NOT EXISTS idx_messages_read_at ON project_messages(read_at);
        `);
        console.log('✅ Message indexes created');

        console.log('\n🎉 All Project Tracker tables created successfully!');

        // Verify tables exist
        const [tables] = await sequelize.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('projects', 'project_milestones', 'project_messages')
            ORDER BY table_name;
        `);

        console.log('\n📊 Verified tables:');
        tables.forEach(t => console.log(`   ✓ ${t.table_name}`));

    } catch (error) {
        console.error('❌ Error creating tables:', error);
        throw error;
    } finally {
        await sequelize.close();
        console.log('\n👋 Database connection closed');
    }
}

createProjectTables()
    .then(() => {
        console.log('\n✅ Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    });
