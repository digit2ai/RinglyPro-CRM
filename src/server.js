const app = require('./app');
const { syncDatabase } = require('./models');

const PORT = process.env.PORT || 3000;

// Database connection and server startup
async function startServer() {
  try {
    console.log('🚀 Starting Twilio Voice Bot CRM...');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    
    // Initialize database
    const syncOptions = {
      // In production, use alter: true to modify existing tables safely
      // In development, use force: false to avoid data loss
      alter: process.env.NODE_ENV === 'production',
      force: false // NEVER use force: true in production!
    };

    await syncDatabase(syncOptions);

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Dashboard: http://localhost:${PORT}/`);
      console.log(`📞 Voice Webhook: ${process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`}/webhook/twilio/voice`);
      console.log(`💬 SMS Webhook: ${process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`}/webhook/twilio/sms`);
      
      if (process.env.NODE_ENV === 'production') {
        console.log(`🔗 Production URL: ${process.env.WEBHOOK_BASE_URL}`);
      }

      console.log('✅ Twilio Voice Bot CRM is ready!');
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      
      // Close server
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        // Close database connections
        try {
          await require('./models').sequelize.close();
          console.log('📊 Database connections closed');
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
    console.error('💡 Check your DATABASE_URL and ensure PostgreSQL is running');
    process.exit(1);
  }
}

// Start the server
startServer();