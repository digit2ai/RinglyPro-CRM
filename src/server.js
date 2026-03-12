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

        // AUTO-MIGRATE OTP / MUST-CHANGE-PASSWORD COLUMNS
        console.log('🔄 Running OTP/password-change migration...');
        try {
          await queryWithTimeout(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false`,
            'must_change_password migration'
          );
          await queryWithTimeout(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6)`,
            'otp_code migration'
          );
          await queryWithTimeout(
            `ALTER TABLE clients ALTER COLUMN business_days TYPE VARCHAR(50)`,
            'business_days resize migration'
          );
          console.log('✅ OTP columns ready (must_change_password, otp_code, business_days resized)');
        } catch (error) {
          console.log('⚠️ OTP migration skipped:', error.message);
        }

        // AUTO-MIGRATE STORE HEALTH AI TABLES
        try {
          const { migrateStoreHealthAI } = require('../scripts/migrate-store-health-ai');
          await migrateStoreHealthAI();
          console.log('✅ Store Health AI tables ready');
        } catch (error) {
          console.log('⚠️ Store Health AI migration skipped:', error.message);
          console.log('   Store Health AI will run in fallback mode with mock data');
        }

        // AUTO-MIGRATE PHONE BLOCKLIST TABLE
        console.log('🔄 Running phone blocklist migration...');
        try {
          await queryWithTimeout(
            `CREATE TABLE IF NOT EXISTS phone_blocklist (
              id SERIAL PRIMARY KEY,
              client_id INTEGER NOT NULL,
              phone_number VARCHAR(20) NOT NULL,
              reason VARCHAR(50) DEFAULT 'machine',
              created_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(client_id, phone_number)
            )`,
            'phone_blocklist migration'
          );
          console.log('✅ phone_blocklist table ready');
        } catch (error) {
          console.log('⚠️ phone_blocklist migration skipped:', error.message);
        }

        // AUTO-MIGRATE LEAD FOLLOWUPS TABLE
        console.log('🔄 Running lead followups migration...');
        try {
          await queryWithTimeout(
            `CREATE TABLE IF NOT EXISTS lead_followups (
              id SERIAL PRIMARY KEY,
              client_id INTEGER NOT NULL,
              conversation_id VARCHAR(100) NOT NULL,
              lead_date DATE NOT NULL,
              lead_type VARCHAR(20) DEFAULT 'hot',
              phone VARCHAR(20),
              followed_up_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(client_id, conversation_id)
            )`,
            'lead_followups migration'
          );
          console.log('✅ lead_followups table ready');
        } catch (error) {
          console.log('⚠️ lead_followups migration skipped:', error.message);
        }

        // AUTO-MIGRATE LEAD TRACKER TABLE (stores all discovered leads permanently)
        console.log('🔄 Running lead tracker migration...');
        try {
          await queryWithTimeout(
            `CREATE TABLE IF NOT EXISTS lead_tracker (
              id SERIAL PRIMARY KEY,
              client_id INTEGER NOT NULL,
              conversation_id VARCHAR(100) NOT NULL,
              lead_date DATE NOT NULL,
              lead_type VARCHAR(20) NOT NULL,
              subcategory VARCHAR(30),
              phone VARCHAR(20),
              business_name VARCHAR(200),
              duration INTEGER DEFAULT 0,
              summary TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(client_id, conversation_id)
            )`,
            'lead_tracker migration'
          );
          console.log('✅ lead_tracker table ready');
        } catch (error) {
          console.log('⚠️ lead_tracker migration skipped:', error.message);
        }

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

    // WebSocket relay: Twilio <Stream> ↔ ElevenLabs ConvAI
    try {
      const WebSocket = require('ws');
      const wss = new WebSocket.Server({ server, path: '/media-stream' });

      wss.on('connection', (twilioWs, req) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const agentId = params.get('agentId');
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!agentId || !apiKey) {
          console.error('❌ Media stream: missing agentId or ELEVENLABS_API_KEY');
          twilioWs.close();
          return;
        }

        console.log(`🔗 Media stream connected for agent ${agentId}`);
        let elevenLabsWs = null;
        let streamSid = null;

        twilioWs.on('message', async (data) => {
          try {
            const msg = JSON.parse(data);

            if (msg.event === 'start') {
              streamSid = msg.start.streamSid;
              console.log(`🎙️ Twilio stream started: ${streamSid}`);

              // Connect to ElevenLabs ConvAI WebSocket using signed URL (requires API key auth)
              let elUrl;
              try {
                const signedUrlResp = await fetch(
                  `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
                  { method: 'GET', headers: { 'xi-api-key': apiKey } }
                );
                if (signedUrlResp.ok) {
                  const signedData = await signedUrlResp.json();
                  elUrl = signedData.signed_url;
                  console.log(`🔑 Got ElevenLabs signed URL for agent ${agentId}`);
                } else {
                  console.error(`❌ Failed to get signed URL (${signedUrlResp.status}): ${await signedUrlResp.text()}`);
                  twilioWs.close();
                  return;
                }
              } catch (signErr) {
                console.error(`❌ Signed URL request failed: ${signErr.message}`);
                twilioWs.close();
                return;
              }

              elevenLabsWs = new WebSocket(elUrl);

              // Timeout: if ElevenLabs doesn't connect within 10s, close gracefully
              const elConnectTimeout = setTimeout(() => {
                if (elevenLabsWs && elevenLabsWs.readyState !== WebSocket.OPEN) {
                  console.error(`⏱️ ElevenLabs connection timeout for agent ${agentId}`);
                  elevenLabsWs.terminate();
                  if (twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.close();
                  }
                }
              }, 10000);

              elevenLabsWs.on('open', () => {
                clearTimeout(elConnectTimeout);
                console.log(`✅ Connected to ElevenLabs agent ${agentId}`);
                // Send initialization with audio config for Twilio's mulaw 8kHz
                elevenLabsWs.send(JSON.stringify({
                  type: 'conversation_initiation_client_data',
                  conversation_config_override: {
                    agent: { prompt: { prompt: '' } }, // Use agent's default prompt
                    tts: { encoding: 'ulaw_8000' }
                  },
                  custom_llm_extra_body: {},
                  dynamic_variables: {}
                }));
              });

              elevenLabsWs.on('message', (elData) => {
                try {
                  const elMsg = JSON.parse(elData);
                  if (elMsg.type === 'audio' && elMsg.audio?.chunk) {
                    // Send ElevenLabs audio back to Twilio
                    if (twilioWs.readyState === WebSocket.OPEN) {
                      twilioWs.send(JSON.stringify({
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: elMsg.audio.chunk }
                      }));
                    }
                  } else if (elMsg.type === 'ping') {
                    // Respond to ElevenLabs keepalive pings
                    if (elevenLabsWs.readyState === WebSocket.OPEN) {
                      elevenLabsWs.send(JSON.stringify({ type: 'pong' }));
                    }
                  }
                } catch (e) {
                  // Non-JSON or non-audio message, ignore
                }
              });

              elevenLabsWs.on('close', (code, reason) => {
                clearTimeout(elConnectTimeout);
                console.log(`🔌 ElevenLabs WS closed for ${agentId} (code=${code}, reason=${reason || 'none'})`);
                if (twilioWs.readyState === WebSocket.OPEN) {
                  twilioWs.close();
                }
              });

              elevenLabsWs.on('error', (err) => {
                clearTimeout(elConnectTimeout);
                console.error(`❌ ElevenLabs WS error for ${agentId}: ${err.message}`);
                if (twilioWs.readyState === WebSocket.OPEN) {
                  twilioWs.close();
                }
              });

            } else if (msg.event === 'media' && elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
              // Forward Twilio audio to ElevenLabs
              elevenLabsWs.send(JSON.stringify({
                user_audio_chunk: msg.media.payload
              }));

            } else if (msg.event === 'stop') {
              console.log(`🛑 Twilio stream stopped: ${streamSid}`);
              if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                elevenLabsWs.close();
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        twilioWs.on('close', () => {
          console.log(`🔌 Twilio stream closed: ${streamSid || 'unknown'}`);
          if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
          }
        });

        twilioWs.on('error', (err) => {
          console.error(`❌ Twilio WS error: ${err.message}`);
          if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
          }
        });
      });

      console.log('✅ WebSocket relay server ready at /media-stream');
    } catch (error) {
      console.log('⚠️ WebSocket relay setup skipped:', error.message);
    }

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