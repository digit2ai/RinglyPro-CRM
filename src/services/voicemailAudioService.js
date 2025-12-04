// Voicemail Audio Service - Generate ElevenLabs audio for custom outbound voicemail messages
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class VoicemailAudioService {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1';

        // Lina's voice ID (ElevenLabs Bella - natural Spanish/English bilingual voice)
        // You can change this to any other ElevenLabs voice ID
        this.linaVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Bella voice

        // Directory for storing voicemail audio files
        this.audioDir = path.join(process.cwd(), 'public', 'voicemail-audio');

        // Ensure directory exists
        this.ensureAudioDirectory();
    }

    /**
     * Ensure the audio directory exists
     */
    ensureAudioDirectory() {
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
        if (!fs.existsSync(this.audioDir)) {
            fs.mkdirSync(this.audioDir, { recursive: true });
            logger.info('📁 Created voicemail-audio directory');
        }
    }

    /**
     * Generate voicemail audio using ElevenLabs Lina voice
     * @param {string} text - Custom voicemail message text
     * @param {number} clientId - Client ID (used for filename)
     * @returns {Promise<string>} Public URL to generated audio file
     */
    async generateVoicemailAudio(text, clientId) {
        if (!this.apiKey) {
            logger.error('❌ ElevenLabs API key not configured');
            return null;
        }

        if (!text || text.trim().length === 0) {
            logger.error('❌ No text provided for voicemail generation');
            return null;
        }

        try {
            // Generate unique filename based on client ID and timestamp
            const filename = `voicemail_client_${clientId}_${Date.now()}.mp3`;
            const filepath = path.join(this.audioDir, filename);
            const publicUrl = `/voicemail-audio/${filename}`;

            // Prepare text for speech (improve pronunciation)
            const speechText = text
                .replace(/RinglyPro/gi, 'Ringly Pro')
                .replace(/\bAI\b/g, 'A.I.')
                .replace(/\$/g, ' dollars')
                .replace(/&/g, ' and ')
                .replace(/\s+/g, ' ')
                .trim();

            logger.info(`🎤 Generating Lina voicemail for client ${clientId}: "${speechText.substring(0, 50)}..."`);

            // Call ElevenLabs API
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/text-to-speech/${this.linaVoiceId}`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                data: {
                    text: speechText,
                    model_id: 'eleven_multilingual_v2', // Supports English and Spanish
                    voice_settings: {
                        stability: 0.6,        // Slightly higher stability for voicemail
                        similarity_boost: 0.8, // High similarity for consistent voice
                        style: 0.3,            // Moderate style for natural delivery
                        use_speaker_boost: true
                    }
                },
                responseType: 'stream',
                timeout: 30000 // 30 second timeout
            });

            // Save audio file to disk
            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    const fileSize = fs.statSync(filepath).size;
                    logger.info(`✅ Voicemail audio generated for client ${clientId}: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
                    resolve(publicUrl);
                });
                writer.on('error', (error) => {
                    logger.error(`❌ Error writing voicemail audio file: ${error.message}`);
                    reject(error);
                });
            });

        } catch (error) {
            logger.error(`❌ ElevenLabs voicemail generation error:`, {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });

            // Return null to allow fallback to Twilio TTS
            return null;
        }
    }

    /**
     * Delete old voicemail audio file for a client
     * @param {string} audioUrl - URL of the audio file to delete (e.g., /voicemail-audio/voicemail_client_15_1234567890.mp3)
     */
    deleteVoicemailAudio(audioUrl) {
        if (!audioUrl || !audioUrl.startsWith('/voicemail-audio/')) {
            return;
        }

        try {
            const filename = audioUrl.replace('/voicemail-audio/', '');
            const filepath = path.join(this.audioDir, filename);

            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                logger.info(`🗑️ Deleted old voicemail audio: ${filename}`);
            }
        } catch (error) {
            logger.error(`❌ Error deleting voicemail audio: ${error.message}`);
            // Non-fatal error - don't throw
        }
    }

    /**
     * Clean up old voicemail audio files (older than 30 days)
     */
    cleanupOldAudioFiles() {
        try {
            const files = fs.readdirSync(this.audioDir);
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            let deletedCount = 0;

            files.forEach(file => {
                const filepath = path.join(this.audioDir, file);
                const stats = fs.statSync(filepath);

                if (stats.mtimeMs < thirtyDaysAgo) {
                    fs.unlinkSync(filepath);
                    deletedCount++;
                }
            });

            if (deletedCount > 0) {
                logger.info(`🗑️ Cleaned up ${deletedCount} old voicemail audio files`);
            }
        } catch (error) {
            logger.error(`❌ Error cleaning up old audio files: ${error.message}`);
        }
    }
}

// Singleton instance
const voicemailAudioService = new VoicemailAudioService();

// Run cleanup on startup (non-blocking)
setTimeout(() => {
    voicemailAudioService.cleanupOldAudioFiles();
}, 5000);

module.exports = voicemailAudioService;
