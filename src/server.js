// Calendar Settings + Migration - deployed 2025-10-07
const app = require('./app');
const sequelize = require('./config/database');
const { syncDatabase } = require('./models'); // IMPORT DATABASE SYNC

const PORT = process.env.PORT || 3000;

// Database connection and server startup
async function startServer() {
  try {
    console.log('🚀 Starting Twilio Voice Bot CRM...');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    
    // Test database connection and sync models
    try {
      if (process.env.DATABASE_URL) {
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully.');
        
        // ENABLE DATABASE SYNC - MODELS ARE READY!
        console.log('🔄 Synchronizing database models...');
        await syncDatabase();
        console.log('✅ Database models synchronized successfully');
        console.log('📊 SMS history will be stored in PostgreSQL');

        // AUTO-MIGRATE SENDGRID COLUMNS
        try {
          const { autoMigrateSendGrid } = require('../scripts/auto-migrate-sendgrid');
          await autoMigrateSendGrid();
        } catch (error) {
          console.log('⚠️ SendGrid auto-migration skipped:', error.message);
        }

        // AUTO-MIGRATE EMAIL EVENTS TABLE
        try {
          const { autoMigrateEmailEvents } = require('../scripts/auto-migrate-email-events');
          await autoMigrateEmailEvents();
        } catch (error) {
          console.log('⚠️ Email events auto-migration skipped:', error.message);
        }

        // AUTO-MIGRATE PROJECT TRACKER TABLES
        try {
          const { autoMigrateProjects } = require('../scripts/auto-migrate-projects');
          await autoMigrateProjects();
        } catch (error) {
          console.log('⚠️ Project Tracker auto-migration skipped:', error.message);
        }

        // AUTO-MIGRATE A2P 10DLC TABLE
        try {
          const { autoMigrateA2P } = require('../scripts/auto-migrate-a2p');
          await autoMigrateA2P();
          console.log('🔄 A2P migration complete, continuing startup...');
        } catch (error) {
          console.log('⚠️ A2P auto-migration skipped:', error.message);
        }

        // Helper function to run query with timeout
        const queryWithTimeout = async (sql, name, timeoutMs = 10000) => {
          return Promise.race([
            sequelize.query(sql),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
            )
          ]);
        };

        // AUTO-MIGRATE WEBSITE_URL COLUMN
        console.log('🔄 Running website_url migration...');
        try {
          await queryWithTimeout(
            `ALTER TABLE clients ADD COLUMN IF NOT EXISTS website_url VARCHAR(500)`,
            'website_url migration'
          );
          console.log('✅ website_url column ready');
        } catch (error) {
          console.log('⚠️ website_url migration skipped:', error.message);
        }

        // AUTO-MIGRATE CALENDAR SYNC COLUMNS
        console.log('🔄 Running calendar sync columns migration...');
        try {
          await queryWithTimeout(
            `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255)`,
            'google_event_id migration'
          );
          await queryWithTimeout(
            `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoho_event_id VARCHAR(255)`,
            'zoho_event_id migration'
          );
          console.log('✅ Calendar sync columns ready (google_event_id, zoho_event_id)');
        } catch (error) {
          console.log('⚠️ Calendar sync columns migration skipped:', error.message);
        }

        // AUTO-MIGRATE STORE HEALTH AI TABLES
        // NOTE: Store Health AI migrations temporarily disabled - needs database setup
        // TODO: Set up Store Health AI database and enable migrations
        // try {
        //   const { migrateStoreHealthAI } = require('../scripts/migrate-store-health-ai');
        //   await migrateStoreHealthAI();
        // } catch (error) {
        //   console.log('⚠️ Store Health AI migration skipped:', error.message);
        // }

        console.log('✅ All migrations complete, ready to start server');
      } else {
        console.log('⚠️ No DATABASE_URL provided, running without database');
      }
    } catch (dbError) {
      console.log('⚠️ Database connection failed, running in memory mode:', dbError.message);
    }

    // Start server
    console.log(`🚀 Starting HTTP server on port ${PORT}...`);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Dashboard: http://localhost:${PORT}/`);
      console.log(`📞 Voice Webhook: ${process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`}/webhook/twilio/voice`);
      console.log(`💬 SMS Webhook: ${process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`}/webhook/twilio/sms`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth/register`);
      console.log(`💳 Credits API: http://localhost:${PORT}/api/credits/test/client/1`);

      if (process.env.NODE_ENV === 'production') {
        console.log(`🔗 Production URL: ${process.env.WEBHOOK_BASE_URL}`);
      }

      // CHECK IF DATABASE MODE IS ACTIVE
      if (process.env.DATABASE_URL) {
        console.log('✅ Twilio Voice Bot CRM is ready! (Database mode)');
        console.log('✅ User authentication system active');
        console.log('✅ Credit system active');

        // Start ElevenLabs call sync job (every 5 minutes)
        try {
          const { startScheduledSync } = require('./jobs/elevenLabsSyncJob');
          startScheduledSync();
          console.log('✅ ElevenLabs call sync job started');
        } catch (error) {
          console.log('⚠️ ElevenLabs sync job skipped:', error.message);
        }
      } else {
        console.log('✅ Twilio Voice Bot CRM is ready! (Memory mode)');
      }
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      
      // Close server
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        // Close database connections if available
        try {
          if (process.env.DATABASE_URL) {
            await sequelize.close();
            console.log('📊 Database connections closed');
          }
        } catch (error) {
          console.error('❌ Error closing database:', error);
        }
        
        console.log('👋 Graceful shutdown complete');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.error('⏰ Forced shutdown after 30 seconds');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('💡 Check your configuration and try again');
    process.exit(1);
  }
}

// Start the server
startServer();