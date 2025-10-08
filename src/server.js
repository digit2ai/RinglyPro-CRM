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
      } else {
        console.log('⚠️ No DATABASE_URL provided, running without database');
      }
    } catch (dbError) {
      console.log('⚠️ Database connection failed, running in memory mode:', dbError.message);
    }

    // Start server
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