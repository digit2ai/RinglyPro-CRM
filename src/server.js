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

        // AUTO-MIGRATE NEURAL TREATMENTS TABLE
        console.log('🔄 Running neural treatments migration...');
        try {
          await queryWithTimeout(
            `CREATE TABLE IF NOT EXISTS neural_treatments (
              id SERIAL PRIMARY KEY,
              client_id INTEGER NOT NULL,
              treatment_type VARCHAR(50) NOT NULL,
              trigger_event VARCHAR(100) NOT NULL,
              actions JSONB NOT NULL DEFAULT '[]',
              crm_target VARCHAR(20) DEFAULT 'auto',
              is_active BOOLEAN DEFAULT false,
              activated_at TIMESTAMP,
              deactivated_at TIMESTAMP,
              execution_count INTEGER DEFAULT 0,
              last_executed_at TIMESTAMP,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            )`,
            'neural_treatments migration'
          );
          await queryWithTimeout(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_treatments_type ON neural_treatments(client_id, treatment_type)`,
            'neural_treatments unique index'
          );
          await queryWithTimeout(
            `CREATE INDEX IF NOT EXISTS idx_treatments_active ON neural_treatments(client_id, is_active)`,
            'neural_treatments active index'
          );
          console.log('✅ neural_treatments table ready');
        } catch (error) {
          console.log('⚠️ neural_treatments migration skipped:', error.message);
        }

        // AUTO-MIGRATE TREATMENT EXECUTION LOG TABLE
        try {
          await queryWithTimeout(
            `CREATE TABLE IF NOT EXISTS treatment_execution_log (
              id SERIAL PRIMARY KEY,
              client_id INTEGER NOT NULL,
              treatment_id INTEGER,
              treatment_type VARCHAR(50) NOT NULL,
              trigger_event VARCHAR(100) NOT NULL,
              contact_phone VARCHAR(30),
              actions_executed JSONB DEFAULT '[]',
              status VARCHAR(20) DEFAULT 'completed',
              error_message TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            )`,
            'treatment_execution_log migration'
          );
          await queryWithTimeout(
            `CREATE INDEX IF NOT EXISTS idx_exec_log_client ON treatment_execution_log(client_id, created_at DESC)`,
            'treatment_execution_log index'
          );
          console.log('✅ treatment_execution_log table ready');
        } catch (error) {
          console.log('⚠️ treatment_execution_log migration skipped:', error.message);
        }

        // ═══ CRM EXPANSION MIGRATIONS ═══

        // DEALS TABLE
        console.log('🔄 Running CRM deals migration...');
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS deals (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            contact_id INTEGER,
            title VARCHAR(255) NOT NULL,
            stage VARCHAR(50) NOT NULL DEFAULT 'new_lead',
            amount DECIMAL(12,2) DEFAULT 0,
            currency VARCHAR(3) DEFAULT 'USD',
            probability INTEGER DEFAULT 0,
            expected_close_date DATE,
            actual_close_date DATE,
            lost_reason VARCHAR(255),
            source VARCHAR(50),
            notes TEXT,
            assigned_to VARCHAR(255),
            tags JSONB DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )`, 'deals migration');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_deals_client ON deals(client_id)', 'deals idx1');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(client_id, stage)', 'deals idx2');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id)', 'deals idx3');
          console.log('✅ deals table ready');
        } catch (e) { console.log('⚠️ deals migration skipped:', e.message); }

        // CRM TASKS TABLE (separate from store-health-ai tasks)
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS crm_tasks (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            contact_id INTEGER,
            deal_id INTEGER,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            task_type VARCHAR(30) DEFAULT 'follow_up',
            priority VARCHAR(10) DEFAULT 'medium',
            status VARCHAR(20) DEFAULT 'pending',
            due_date DATE,
            due_time TIME,
            completed_at TIMESTAMP,
            reminder_at TIMESTAMP,
            source VARCHAR(30) DEFAULT 'manual',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )`, 'crm_tasks migration');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_crm_tasks_client ON crm_tasks(client_id)', 'crm_tasks idx1');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(client_id, due_date, status)', 'crm_tasks idx2');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact ON crm_tasks(contact_id)', 'crm_tasks idx3');
          console.log('✅ crm_tasks table ready');
        } catch (e) { console.log('⚠️ crm_tasks migration skipped:', e.message); }

        // ACTIVITIES TABLE
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS activities (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            contact_id INTEGER,
            deal_id INTEGER,
            activity_type VARCHAR(30) NOT NULL,
            title VARCHAR(255),
            description TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
          )`, 'activities migration');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id)', 'activities idx1');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, created_at DESC)', 'activities idx2');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id, created_at DESC)', 'activities idx3');
          console.log('✅ activities table ready');
        } catch (e) { console.log('⚠️ activities migration skipped:', e.message); }

        // CONTACT NOTES TABLE
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS contact_notes (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            note TEXT NOT NULL,
            note_type VARCHAR(20) DEFAULT 'general',
            pinned BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
          )`, 'contact_notes migration');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_notes_contact ON contact_notes(contact_id, created_at DESC)', 'notes idx');
          console.log('✅ contact_notes table ready');
        } catch (e) { console.log('⚠️ contact_notes migration skipped:', e.message); }

        // SMS TEMPLATES TABLE (P2)
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS sms_templates (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            name VARCHAR(100) NOT NULL,
            body TEXT NOT NULL,
            category VARCHAR(30) DEFAULT 'general',
            variables JSONB DEFAULT '[]',
            is_default BOOLEAN DEFAULT false,
            use_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
          )`, 'sms_templates migration');
          await queryWithTimeout("ALTER TABLE sms_templates ADD COLUMN IF NOT EXISTS description VARCHAR(255)", 'sms_templates desc col');
          console.log('✅ sms_templates table ready');
        } catch (e) { console.log('⚠️ sms_templates migration skipped:', e.message); }

        // SCHEDULED ACTIONS TABLE (P2)
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS scheduled_actions (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            action_type VARCHAR(30) NOT NULL,
            target_phone VARCHAR(30),
            target_email VARCHAR(255),
            message_body TEXT,
            scheduled_for TIMESTAMP NOT NULL,
            reference_type VARCHAR(30),
            reference_id INTEGER,
            status VARCHAR(20) DEFAULT 'pending',
            sent_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          )`, 'scheduled_actions migration');
          await queryWithTimeout('CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled_actions(scheduled_for, status)', 'scheduled idx');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ", 'scheduled_at col');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30)", 'recipient_phone col');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255)", 'recipient_name col');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS template_id INTEGER", 'template_id col');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(255)", 'twilio_sid col');
          await queryWithTimeout("ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS error_message TEXT", 'error_message col');
          console.log('✅ scheduled_actions table ready');
        } catch (e) { console.log('⚠️ scheduled_actions migration skipped:', e.message); }

        // CUSTOM FIELDS TABLES (P2)
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS custom_fields (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL,
            field_name VARCHAR(100) NOT NULL,
            field_type VARCHAR(20) NOT NULL,
            options JSONB,
            required BOOLEAN DEFAULT false,
            display_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(client_id, field_name)
          )`, 'custom_fields migration');
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS custom_field_values (
            id SERIAL PRIMARY KEY,
            custom_field_id INTEGER,
            contact_id INTEGER NOT NULL,
            value TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(custom_field_id, contact_id)
          )`, 'custom_field_values migration');
          console.log('✅ custom_fields tables ready');
        } catch (e) { console.log('⚠️ custom_fields migration skipped:', e.message); }

        // EMAIL EVENTS TABLE (P2)
        try {
          await queryWithTimeout(`CREATE TABLE IF NOT EXISTS email_events (
            id SERIAL PRIMARY KEY,
            client_id INTEGER,
            message_id VARCHAR(255),
            event_type VARCHAR(30),
            email VARCHAR(255),
            timestamp TIMESTAMP,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
          )`, 'email_events migration');
          console.log('✅ email_events table ready');
        } catch (e) { console.log('⚠️ email_events migration skipped:', e.message); }

        // CONTACTS TABLE EXTENSIONS
        try {
          await queryWithTimeout("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'", 'contacts tags');
          await queryWithTimeout("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(30) DEFAULT 'lead'", 'contacts lifecycle');
          await queryWithTimeout("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0", 'contacts score');
          await queryWithTimeout("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company VARCHAR(255)", 'contacts company');
          await queryWithTimeout("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_title VARCHAR(255)", 'contacts title');
          console.log('✅ contacts extensions ready');
        } catch (e) { console.log('⚠️ contacts extensions skipped:', e.message); }

        // APPOINTMENTS EXTENSIONS (P3 - recurring)
        try {
          await queryWithTimeout("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_rule JSONB", 'appointments recurrence');
          console.log('✅ appointments extensions ready');
        } catch (e) { console.log('⚠️ appointments extensions skipped:', e.message); }

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