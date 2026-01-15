/**
 * ElevenLabs Conversation Service
 *
 * This service handles fetching conversation details and audio recordings
 * from the ElevenLabs Conversational AI API.
 *
 * API Reference: https://elevenlabs.io/docs/api-reference/conversations/get-audio
 */

const logger = require('../utils/logger');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

class ElevenLabsConversationService {

  /**
   * Get conversation details from ElevenLabs
   * @param {string} conversationId - The ElevenLabs conversation ID
   * @returns {Promise<Object>} Conversation details
   */
  async getConversationDetails(conversationId) {
    try {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }

      const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}`, {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[ElevenLabs] Failed to get conversation ${conversationId}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get conversation: ${response.status}`);
      }

      const data = await response.json();
      logger.info(`[ElevenLabs] Got conversation details for ${conversationId}`);
      return data;

    } catch (error) {
      logger.error(`[ElevenLabs] Error getting conversation details:`, error);
      throw error;
    }
  }

  /**
   * Get conversation audio recording from ElevenLabs
   * @param {string} conversationId - The ElevenLabs conversation ID
   * @returns {Promise<Buffer>} Audio data as buffer
   */
  async getConversationAudio(conversationId) {
    try {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }

      logger.info(`[ElevenLabs] Fetching audio for conversation ${conversationId}`);

      const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}/audio`, {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[ElevenLabs] Failed to get audio for ${conversationId}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get audio: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      logger.info(`[ElevenLabs] Got audio for conversation ${conversationId} (${audioBuffer.byteLength} bytes)`);

      return Buffer.from(audioBuffer);

    } catch (error) {
      logger.error(`[ElevenLabs] Error getting conversation audio:`, error);
      throw error;
    }
  }

  /**
   * Get audio URL that can be streamed/played directly
   * Returns a signed URL or proxied endpoint
   * @param {string} conversationId - The ElevenLabs conversation ID
   * @returns {string} URL to access the audio
   */
  getAudioProxyUrl(conversationId) {
    // This returns the URL to our proxy endpoint that will fetch and stream the audio
    return `/api/elevenlabs/conversations/${conversationId}/audio`;
  }

  /**
   * List conversations for an agent
   * @param {string} agentId - The ElevenLabs agent ID
   * @param {Object} options - Optional parameters (cursor, limit)
   * @returns {Promise<Object>} List of conversations
   */
  async listConversations(agentId, options = {}) {
    try {
      if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY not configured');
      }

      const params = new URLSearchParams();
      if (agentId) params.append('agent_id', agentId);
      if (options.cursor) params.append('cursor', options.cursor);

      const url = `${ELEVENLABS_API_BASE}/convai/conversations${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[ElevenLabs] Failed to list conversations: ${response.status} - ${errorText}`);
        throw new Error(`Failed to list conversations: ${response.status}`);
      }

      const data = await response.json();
      logger.info(`[ElevenLabs] Listed ${data.conversations?.length || 0} conversations for agent ${agentId}`);
      return data;

    } catch (error) {
      logger.error(`[ElevenLabs] Error listing conversations:`, error);
      throw error;
    }
  }

  /**
   * Get conversation transcript/messages
   * @param {string} conversationId - The ElevenLabs conversation ID
   * @returns {Promise<Array>} Array of transcript messages
   */
  async getConversationTranscript(conversationId) {
    try {
      const details = await this.getConversationDetails(conversationId);
      return details.transcript || details.messages || [];
    } catch (error) {
      logger.error(`[ElevenLabs] Error getting transcript:`, error);
      throw error;
    }
  }
}

module.exports = new ElevenLabsConversationService();
