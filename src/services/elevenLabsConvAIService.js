/**
 * ElevenLabs Conversational AI Service
 *
 * Fetches call history, recordings, and conversation data from ElevenLabs ConvAI API
 * API Docs: https://elevenlabs.io/docs/conversational-ai/api-reference/conversations
 */

const axios = require('axios');

class ElevenLabsConvAIService {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1/convai';
    }

    /**
     * Get headers for API requests
     */
    getHeaders() {
        return {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };
    }

    /**
     * List all conversations for an agent
     * @param {string} agentId - The ElevenLabs agent ID
     * @param {object} options - Filter options
     * @returns {Promise<Array>} List of conversations
     */
    async listConversations(agentId, options = {}) {
        try {
            const params = {
                agent_id: agentId,
                page_size: options.limit || 30
            };

            if (options.cursor) {
                params.cursor = options.cursor;
            }

            if (options.startAfter) {
                params.call_successful_start_after = options.startAfter;
            }

            console.log(`📞 Fetching ElevenLabs conversations for agent ${agentId}...`);

            const response = await axios.get(`${this.baseUrl}/conversations`, {
                headers: this.getHeaders(),
                params
            });

            console.log(`✅ Found ${response.data.conversations?.length || 0} conversations`);
            return response.data;

        } catch (error) {
            console.error('❌ Error fetching ElevenLabs conversations:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get details for a specific conversation
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<object>} Conversation details
     */
    async getConversation(conversationId) {
        try {
            console.log(`📋 Fetching conversation details: ${conversationId}`);

            const response = await axios.get(`${this.baseUrl}/conversations/${conversationId}`, {
                headers: this.getHeaders()
            });

            return response.data;

        } catch (error) {
            console.error(`❌ Error fetching conversation ${conversationId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get audio recording URL for a conversation
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<string>} Audio URL
     */
    async getConversationAudio(conversationId) {
        try {
            console.log(`🎵 Fetching audio for conversation: ${conversationId}`);

            const response = await axios.get(`${this.baseUrl}/conversations/${conversationId}/audio`, {
                headers: this.getHeaders(),
                responseType: 'arraybuffer'
            });

            // Return the audio data or URL
            return {
                audioData: response.data,
                contentType: response.headers['content-type']
            };

        } catch (error) {
            console.error(`❌ Error fetching audio for ${conversationId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get signed audio URL for a conversation (preferred method)
     * @param {string} conversationId - The conversation ID
     * @returns {Promise<string>} Signed audio URL
     */
    async getSignedAudioUrl(conversationId) {
        try {
            const response = await axios.get(`${this.baseUrl}/conversations/${conversationId}/audio-url`, {
                headers: this.getHeaders()
            });

            return response.data.signed_url || response.data.url;

        } catch (error) {
            // Fall back to direct audio endpoint if signed URL not available
            console.log(`⚠️ Signed URL not available, using direct endpoint`);
            return null;
        }
    }

    /**
     * List ALL conversations for a specific day, paginating through all pages
     * @param {string} agentId - The ElevenLabs agent ID
     * @param {string} dateString - Date in YYYY-MM-DD format
     * @returns {Promise<Array>} All conversations for that day
     */
    async listAllConversationsForDay(agentId, dateString) {
        const dayStart = new Date(dateString + 'T00:00:00-05:00'); // EST
        const dayEnd = new Date(dateString + 'T23:59:59-05:00');
        const startUnix = Math.floor(dayStart.getTime() / 1000);
        const endUnix = Math.floor(dayEnd.getTime() / 1000);

        const allConversations = [];
        let cursor = null;
        let page = 0;
        let done = false;

        while (done === false && page < 30) {
            page++;
            const data = await this.listConversations(agentId, { limit: 100, cursor });
            const conversations = data.conversations || [];

            if (conversations.length === 0) break;

            for (const c of conversations) {
                if (c.start_time_unix_secs >= startUnix && c.start_time_unix_secs <= endUnix) {
                    allConversations.push(c);
                } else if (c.start_time_unix_secs < startUnix) {
                    done = true;
                    break;
                }
            }

            cursor = data.next_cursor || data.cursor || null;
            if (!cursor || done) break;
            await new Promise(r => setTimeout(r, 200));
        }

        return allConversations;
    }

    /**
     * Generate a daily actionable report for an agent
     * @param {string} agentId - The ElevenLabs agent ID
     * @param {string} dateString - Date in YYYY-MM-DD format
     * @returns {Promise<object>} Categorized report
     */
    async generateDailyReport(agentId, dateString) {
        console.log(`📊 Generating daily report for agent ${agentId}, date ${dateString}`);

        // Step 1: Fetch all conversations for the day
        const allConvs = await this.listAllConversationsForDay(agentId, dateString);
        console.log(`📋 Found ${allConvs.length} total conversations for ${dateString}`);

        // Step 2: Identify calls that need detail fetching
        const needDetails = allConvs.filter(c => {
            const tools = c.tool_names || [];
            const hasRealTool = tools.some(t => t.includes('transfer') || t.includes('send_sms') || t.includes('book_appointment'));
            const isInbound = c.direction === 'inbound';
            const isLong = c.call_duration_secs >= 30;
            const isVoicemailOnly = tools.length === 1 && tools[0] === 'voicemail_detection';
            return hasRealTool || isInbound || (isLong && !isVoicemailOnly);
        });

        // Also add long voicemail-only calls (60s+) which might be IVR traps or real convos
        for (const c of allConvs) {
            const tools = c.tool_names || [];
            const isVoicemailOnly = tools.length === 1 && tools[0] === 'voicemail_detection';
            if (isVoicemailOnly && c.call_duration_secs >= 60) {
                if (!needDetails.find(x => x.conversation_id === c.conversation_id)) {
                    needDetails.push(c);
                }
            }
        }

        console.log(`🔍 Fetching details for ${needDetails.length} interesting conversations...`);

        // Step 3: Fetch details with rate limiting
        const detailMap = new Map();
        let fetched = 0;
        for (const c of needDetails) {
            try {
                const detail = await this.getConversation(c.conversation_id);
                detailMap.set(c.conversation_id, detail);
                fetched++;
                if (fetched % 20 === 0) console.log(`  Fetched ${fetched}/${needDetails.length}...`);
                await new Promise(r => setTimeout(r, 80));
            } catch (e) {
                // skip failed fetches
            }
        }
        console.log(`✅ Fetched ${fetched} conversation details`);

        // Step 4: Categorize
        const report = this.categorizeConversations(allConvs, detailMap);
        report.date = dateString;
        report.agentId = agentId;
        report.generatedAt = new Date().toISOString();

        return report;
    }

    /**
     * Categorize conversations into actionable groups
     */
    categorizeConversations(allConvs, detailMap) {
        const categories = {
            sms_sent: [],
            transferred: [],
            callback_requested: [],
            engaged_humans: [],
            not_interested: [],
            voicemail: [],
            ivr_trap: [],
            brief: [],
            no_engagement: []
        };

        for (const c of allConvs) {
            const tools = c.tool_names || [];
            const d = detailMap.get(c.conversation_id);
            const duration = c.call_duration_secs || 0;
            const summary = d?.analysis?.transcript_summary || c.transcript_summary || c.call_summary_title || '';
            const summaryLower = summary.toLowerCase();
            const termReason = d?.metadata?.termination_reason || '';

            // Extract phone from detail (user_id) or metadata
            const phone = d?.user_id || d?.metadata?.phone_call?.external_number || 'Unknown';

            // Extract business name from summary
            let businessName = '';
            const bizMatch = summary.match(/called\s+([A-Z][A-Za-z0-9\s&'.-]+?)(?:\s+(?:but|to|and|,|\.|The|in response))/);
            if (bizMatch) businessName = bizMatch[1].trim();

            // Build transcript text for keyword analysis
            let transcriptLower = '';
            if (d?.transcript) {
                transcriptLower = d.transcript.map(t => `${t.role}: ${t.message}`).join('\n').toLowerCase();
            }

            const entry = {
                conversation_id: c.conversation_id,
                phone,
                businessName,
                duration,
                direction: c.direction || 'outbound',
                summary: summary.substring(0, 300),
                toolNames: tools,
                startTime: new Date(c.start_time_unix_secs * 1000).toISOString(),
                callSuccessful: c.call_successful,
                terminationReason: termReason
            };

            // Categorization (priority order)
            if (tools.some(t => t.includes('send_sms'))) {
                categories.sms_sent.push(entry);
            } else if (tools.some(t => t.includes('transfer')) || termReason.includes('transferred')) {
                categories.transferred.push(entry);
            } else if (duration < 10 && tools.length === 0) {
                categories.no_engagement.push(entry);
            } else if (transcriptLower.includes('call back') || transcriptLower.includes('call me back') ||
                       transcriptLower.includes('call later') || transcriptLower.includes('busy right now') ||
                       summaryLower.includes('callback') || summaryLower.includes('call back')) {
                categories.callback_requested.push(entry);
            } else if (transcriptLower.includes('not interested') || transcriptLower.includes('no thank') ||
                       transcriptLower.includes('stop calling') || transcriptLower.includes('do not call') ||
                       transcriptLower.includes('remove my number') || transcriptLower.includes('take me off')) {
                categories.not_interested.push(entry);
            } else if ((summaryLower.includes('automated') || summaryLower.includes('voicemail') ||
                        summaryLower.includes('menu options') || termReason.includes('voicemail_detection')) &&
                       duration >= 120 && (summaryLower.includes('menu') || summaryLower.includes('repeatedly'))) {
                categories.ivr_trap.push(entry);
            } else if (summaryLower.includes('voicemail') || summaryLower.includes('automated') ||
                       summaryLower.includes('menu options') || termReason.includes('voicemail_detection')) {
                categories.voicemail.push(entry);
            } else if (duration >= 60) {
                categories.engaged_humans.push(entry);
            } else if (duration >= 10 && duration < 30) {
                categories.brief.push(entry);
            } else {
                categories.brief.push(entry);
            }
        }

        // Sort each category by duration descending (longest/most engaged first)
        for (const key of Object.keys(categories)) {
            categories[key].sort((a, b) => b.duration - a.duration);
        }

        const totalOutbound = allConvs.filter(c => c.direction === 'outbound').length;
        const totalInbound = allConvs.filter(c => c.direction === 'inbound').length;
        const actionableCount = categories.sms_sent.length + categories.transferred.length +
                               categories.callback_requested.length + categories.engaged_humans.length;
        const totalDuration = allConvs.reduce((s, c) => s + (c.call_duration_secs || 0), 0);

        // Group into Human vs Machine
        const humanCalls = [
            ...categories.sms_sent,
            ...categories.transferred,
            ...categories.callback_requested,
            ...categories.engaged_humans,
            ...categories.not_interested
        ].sort((a, b) => b.duration - a.duration);

        const machineCalls = [
            ...categories.voicemail,
            ...categories.ivr_trap,
            ...categories.brief,
            ...categories.no_engagement
        ].sort((a, b) => b.duration - a.duration);

        // Tag each call with its subcategory for display
        categories.sms_sent.forEach(c => c.subcategory = 'SMS Sent');
        categories.transferred.forEach(c => c.subcategory = 'Transferred');
        categories.callback_requested.forEach(c => c.subcategory = 'Callback');
        categories.engaged_humans.forEach(c => c.subcategory = 'Engaged');
        categories.not_interested.forEach(c => c.subcategory = 'Not Interested');
        categories.voicemail.forEach(c => c.subcategory = 'Voicemail');
        categories.ivr_trap.forEach(c => c.subcategory = 'IVR Trap');
        categories.brief.forEach(c => c.subcategory = 'Brief');
        categories.no_engagement.forEach(c => c.subcategory = 'No Engagement');

        // Machine time wasted
        const machineMinutes = Math.round(machineCalls.reduce((s, c) => s + c.duration, 0) / 60);

        return {
            totalCalls: allConvs.length,
            totalOutbound,
            totalInbound,
            totalDurationMinutes: Math.round(totalDuration / 60),
            avgDurationSeconds: allConvs.length > 0 ? Math.round(totalDuration / allConvs.length) : 0,
            humanReachRate: totalOutbound > 0
                ? ((actionableCount + categories.not_interested.length) / totalOutbound * 100).toFixed(1)
                : '0.0',
            human: humanCalls,
            machine: machineCalls,
            machineMinutes,
            categories,
            summary: {
                sms_sent: categories.sms_sent.length,
                transferred: categories.transferred.length,
                callback_requested: categories.callback_requested.length,
                engaged_humans: categories.engaged_humans.length,
                not_interested: categories.not_interested.length,
                voicemail: categories.voicemail.length,
                ivr_trap: categories.ivr_trap.length,
                brief: categories.brief.length,
                no_engagement: categories.no_engagement.length,
                actionable: actionableCount,
                humanTotal: humanCalls.length,
                machineTotal: machineCalls.length
            }
        };
    }

    /**
     * Sync conversations from ElevenLabs to the Messages table
     * @param {number} clientId - RinglyPro client ID
     * @param {string} agentId - ElevenLabs agent ID
     * @param {object} sequelize - Sequelize instance
     * @returns {Promise<object>} Sync results
     */
    async syncConversationsToMessages(clientId, agentId, sequelize) {
        try {
            console.log(`🔄 Syncing ElevenLabs calls for client ${clientId}, agent ${agentId}`);

            // Fetch recent conversations with pagination
            let conversations = [];
            let cursor = null;
            let page = 0;
            do {
                const data = await this.listConversations(agentId, { limit: 100, cursor });
                conversations = conversations.concat(data.conversations || []);
                cursor = data.next_cursor || data.cursor || null;
                page++;
                if (cursor) await new Promise(r => setTimeout(r, 200));
            } while (cursor && page < 10); // up to 1000 conversations

            let inserted = 0;
            let skipped = 0;
            const synced = [];
            const errors = [];

            console.log(`📋 Processing ${conversations.length} conversations from ElevenLabs`);

            for (const conv of conversations) {
                try {
                    console.log(`🔍 Processing conversation: ${conv.conversation_id}`);

                    // Check if already synced (by conversation ID in twilioSid field)
                    const [existing] = await sequelize.query(
                        'SELECT id FROM messages WHERE twilio_sid = $1 AND client_id = $2',
                        { bind: [conv.conversation_id, clientId], type: sequelize.QueryTypes.SELECT }
                    );

                    if (existing) {
                        console.log(`⏭️ Already synced: ${conv.conversation_id}`);
                        skipped++;
                        continue;
                    }

                    // Get conversation details
                    let details = {};
                    try {
                        details = await this.getConversation(conv.conversation_id);
                    } catch (e) {
                        console.log(`⚠️ Could not get details for ${conv.conversation_id}`);
                    }

                    // Extract phone number - primary sources are detail.user_id
                    // and detail.metadata.phone_call.external_number
                    const phoneNumber = details.user_id ||
                                       details.metadata?.phone_call?.external_number ||
                                       conv.user_id ||
                                       'Unknown';

                    // Build summary - prefer ElevenLabs AI analysis summary
                    let summary = details.analysis?.transcript_summary ||
                                 conv.transcript_summary ||
                                 conv.call_summary_title ||
                                 'AI Phone Call';
                    if (summary === 'AI Phone Call' && details.transcript && details.transcript.length > 0) {
                        const firstMessages = details.transcript.slice(0, 4)
                            .map(t => t.message || t.text)
                            .filter(Boolean)
                            .join(' | ');
                        summary = firstMessages.substring(0, 500) || 'AI Phone Call';
                    }

                    // Calculate duration - ElevenLabs API uses call_duration_secs in metadata
                    const duration = details.metadata?.call_duration_secs ||
                                   conv.call_duration_secs ||
                                   conv.duration_seconds ||
                                   details.call_duration_secs ||
                                   details.duration_seconds ||
                                   null;

                    // Use proxy URL for audio (using messages route which doesn't require admin auth)
                    const audioUrl = `/api/messages/elevenlabs-audio/${conv.conversation_id}`;

                    // Insert into messages table
                    // Use ElevenLabs timestamp from metadata.start_time_unix_secs (unix seconds)
                    // This ensures the dashboard displays the actual call time, not sync time
                    const confirmationCode = `EL${Date.now().toString().slice(-8)}`;
                    const startTimeUnix = details.metadata?.start_time_unix_secs;
                    const elevenLabsTimestamp = startTimeUnix ? new Date(startTimeUnix * 1000) : new Date();

                    await sequelize.query(
                        `INSERT INTO messages (
                            client_id, twilio_sid, recording_url, direction,
                            from_number, to_number, body, status,
                            message_type, call_duration, call_start_time,
                            message_source, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
                        {
                            bind: [
                                clientId,
                                conv.conversation_id,
                                audioUrl,
                                conv.direction === 'outbound' ? 'outgoing' : 'incoming',
                                phoneNumber,
                                '', // to_number
                                summary,
                                'received',
                                'call',
                                duration,
                                elevenLabsTimestamp,  // call_start_time
                                'elevenlabs',
                                elevenLabsTimestamp   // created_at - use ElevenLabs timestamp instead of NOW()
                            ]
                        }
                    );

                    inserted++;
                    console.log(`✅ Inserted: ${conv.conversation_id} | Phone: ${phoneNumber} | Duration: ${duration}s | Time: ${elevenLabsTimestamp.toISOString()}`);
                    synced.push({
                        conversationId: conv.conversation_id,
                        phone: phoneNumber,
                        duration,
                        startTime: elevenLabsTimestamp.toISOString()
                    });

                } catch (insertError) {
                    console.error(`❌ Error syncing conversation ${conv.conversation_id}:`, insertError.message);
                    errors.push({ conversationId: conv.conversation_id, error: insertError.message });
                }
            }

            console.log(`✅ Sync complete: ${inserted} inserted, ${skipped} skipped, ${errors.length} errors`);

            return {
                success: true,
                total: conversations.length,
                inserted,
                skipped,
                synced,
                errors: errors.slice(0, 5) // Return first 5 errors for debugging
            };

        } catch (error) {
            console.error('❌ Sync error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new ElevenLabsConvAIService();
