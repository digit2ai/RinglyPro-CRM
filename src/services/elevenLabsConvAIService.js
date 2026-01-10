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
     * Sync conversations from ElevenLabs to the Messages table
     * @param {number} clientId - RinglyPro client ID
     * @param {string} agentId - ElevenLabs agent ID
     * @param {object} sequelize - Sequelize instance
     * @returns {Promise<object>} Sync results
     */
    async syncConversationsToMessages(clientId, agentId, sequelize) {
        try {
            console.log(`🔄 Syncing ElevenLabs calls for client ${clientId}, agent ${agentId}`);

            // Fetch recent conversations
            const data = await this.listConversations(agentId, { limit: 50 });
            const conversations = data.conversations || [];

            let inserted = 0;
            let skipped = 0;
            const synced = [];
            const errors = [];

            console.log(`📋 Processing ${conversations.length} conversations from ElevenLabs`);
            console.log(`📋 Raw data keys: ${Object.keys(data).join(', ')}`);
            if (conversations.length > 0) {
                console.log(`📋 First conversation sample:`, JSON.stringify(conversations[0]).substring(0, 500));
            }

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

                    // Extract phone number from conversation data
                    // ElevenLabs stores phone in various fields depending on setup
                    const phoneNumber = conv.metadata?.phone_number ||
                                       conv.call?.phone_number ||
                                       conv.user_id ||  // Often contains phone number
                                       details.metadata?.phone_number ||
                                       details.user_id ||
                                       details.analysis?.user_id ||
                                       details.data_collection_results?.phone ||
                                       details.data_collection_results?.caller_phone ||
                                       'Unknown';

                    console.log(`📞 Phone extraction - conv.user_id: ${conv.user_id}, details keys: ${Object.keys(details).join(', ')}`);

                    // Build summary from transcript
                    let summary = 'AI Phone Call';
                    if (details.transcript && details.transcript.length > 0) {
                        // Get first few exchanges
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

                    // Use proxy URL for audio (signed URLs require auth, proxy handles it)
                    const audioUrl = `/api/admin/elevenlabs-audio/${conv.conversation_id}`;

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
                                conv.call_type === 'outbound' ? 'outgoing' : 'incoming',
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
