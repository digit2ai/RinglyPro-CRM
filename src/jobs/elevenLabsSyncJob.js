/**
 * ElevenLabs Call Sync Job
 *
 * Runs every 5 minutes to sync ElevenLabs Conversational AI calls
 * to the RinglyPro messages table for all enabled clients.
 */

const cron = require('node-cron');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const elevenLabsConvAI = require('../services/elevenLabsConvAIService');

let isRunning = false;
let lastRunTime = null;
let lastRunResult = null;

/**
 * Get all clients with ElevenLabs agent configured
 */
async function getElevenLabsClients() {
    const clients = await sequelize.query(`
        SELECT id, business_name, elevenlabs_agent_id
        FROM clients
        WHERE elevenlabs_agent_id IS NOT NULL
          AND elevenlabs_agent_id != ''
          AND active = true
    `, { type: QueryTypes.SELECT });

    return clients;
}

/**
 * Run sync for a single client
 */
async function syncClientCalls(clientId, agentId, businessName) {
    try {
        console.log(`🔄 [ElevenLabs Sync] Syncing calls for ${businessName} (Client ${clientId})`);

        const result = await elevenLabsConvAI.syncConversationsToMessages(
            clientId,
            agentId,
            sequelize
        );

        return {
            clientId,
            businessName,
            success: result.success,
            inserted: result.inserted || 0,
            skipped: result.skipped || 0,
            errors: result.errors?.length || 0
        };
    } catch (error) {
        console.error(`❌ [ElevenLabs Sync] Error syncing client ${clientId}:`, error.message);
        return {
            clientId,
            businessName,
            success: false,
            error: error.message
        };
    }
}

/**
 * Fix ElevenLabs message directions in the database.
 * Old syncs stored all calls as 'incoming' regardless of actual direction.
 * This checks the ElevenLabs API and corrects outbound calls to 'outgoing'.
 */
async function fixMessageDirections() {
    try {
        // Check if there are any messages that might need fixing
        const [needsFix] = await sequelize.query(
            `SELECT COUNT(*) as cnt FROM messages WHERE message_source = 'elevenlabs' AND direction = 'incoming'`,
            { type: QueryTypes.SELECT }
        );
        if (!needsFix || parseInt(needsFix.cnt) === 0) return;

        console.log(`🔧 [Direction Fix] Checking ${needsFix.cnt} ElevenLabs messages...`);
        const clients = await getElevenLabsClients();
        let totalFixed = 0;

        for (const client of clients) {
            let cursor = null;
            let page = 0;
            let fixed = 0;
            do {
                const data = await elevenLabsConvAI.listConversations(client.elevenlabs_agent_id, { limit: 100, cursor });
                const conversations = data.conversations || [];
                for (const conv of conversations) {
                    if (conv.direction === 'outbound') {
                        const [result] = await sequelize.query(
                            `UPDATE messages SET direction = 'outgoing' WHERE twilio_sid = $1 AND client_id = $2 AND direction = 'incoming' RETURNING id`,
                            { bind: [conv.conversation_id, client.id], type: QueryTypes.SELECT }
                        );
                        if (result) fixed++;
                    }
                }
                cursor = data.next_cursor || data.cursor || null;
                page++;
                if (cursor) await new Promise(r => setTimeout(r, 200));
            } while (cursor && page < 20);
            if (fixed > 0) {
                console.log(`🔧 [Direction Fix] Fixed ${fixed} messages for ${client.business_name}`);
                totalFixed += fixed;
            }
        }
        if (totalFixed > 0) {
            console.log(`✅ [Direction Fix] Total fixed: ${totalFixed} messages`);
        } else {
            console.log(`✅ [Direction Fix] All directions already correct`);
        }
    } catch (e) {
        console.log('⚠️ [Direction Fix] Error:', e.message);
    }
}

/**
 * Main sync job - runs for all ElevenLabs clients
 */
async function runSync() {
    if (isRunning) {
        console.log('⚠️ [ElevenLabs Sync] Previous sync still running, skipping...');
        return;
    }

    isRunning = true;
    const startTime = new Date();
    console.log(`\n🚀 [ElevenLabs Sync] Starting scheduled sync at ${startTime.toISOString()}`);

    try {
        const clients = await getElevenLabsClients();

        if (clients.length === 0) {
            console.log('📭 [ElevenLabs Sync] No ElevenLabs clients found');
            lastRunResult = { clients: 0, totalInserted: 0, totalSkipped: 0, errors: 0 };
            return;
        }

        console.log(`📋 [ElevenLabs Sync] Found ${clients.length} ElevenLabs-enabled clients`);

        let totalInserted = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        const results = [];

        for (const client of clients) {
            const result = await syncClientCalls(
                client.id,
                client.elevenlabs_agent_id,
                client.business_name
            );

            results.push(result);

            if (result.success) {
                totalInserted += result.inserted;
                totalSkipped += result.skipped;
            } else {
                totalErrors++;
            }

            // Small delay between clients to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const duration = (new Date() - startTime) / 1000;

        lastRunResult = {
            timestamp: startTime.toISOString(),
            duration: `${duration.toFixed(1)}s`,
            clients: clients.length,
            totalInserted,
            totalSkipped,
            errors: totalErrors,
            results
        };

        console.log(`✅ [ElevenLabs Sync] Completed in ${duration.toFixed(1)}s`);
        console.log(`   📊 Clients: ${clients.length}, Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);

        if (totalInserted > 0) {
            console.log(`   🆕 New calls synced: ${totalInserted}`);
        }

    } catch (error) {
        console.error('❌ [ElevenLabs Sync] Job failed:', error.message);
        lastRunResult = { error: error.message, timestamp: startTime.toISOString() };
    } finally {
        isRunning = false;
        lastRunTime = new Date();
    }
}

/**
 * Start the scheduled job
 * Runs every 5 minutes
 */
function startScheduledSync() {
    console.log('⏰ [ElevenLabs Sync] Starting scheduled job (every 5 minutes)');

    // Schedule to run every 5 minutes
    const job = cron.schedule('*/5 * * * *', runSync, {
        scheduled: true,
        timezone: 'America/New_York'
    });

    // Run immediately on startup (after 10 second delay to let server fully start)
    setTimeout(async () => {
        console.log('🚀 [ElevenLabs Sync] Running initial sync...');
        await fixMessageDirections();
        runSync();
    }, 10000);

    return job;
}

/**
 * Get status of the sync job
 */
function getSyncStatus() {
    return {
        isRunning,
        lastRunTime: lastRunTime?.toISOString() || null,
        lastRunResult,
        nextRun: lastRunTime
            ? new Date(lastRunTime.getTime() + 5 * 60 * 1000).toISOString()
            : null
    };
}

/**
 * Manually trigger a sync
 */
async function triggerSync() {
    await runSync();
    return getSyncStatus();
}

module.exports = {
    startScheduledSync,
    runSync,
    getSyncStatus,
    triggerSync
};
