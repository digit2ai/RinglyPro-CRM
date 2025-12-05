// Voicemail Audio Service - Generate ElevenLabs audio for custom outbound voicemail messages
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

class VoicemailAudioService {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseUrl = 'https://api.elevenlabs.io/v1';

        // Lina's voice ID (ElevenLabs Bella - natural Spanish/English bilingual voice)
        // You can change this to any other ElevenLabs voice ID
        this.linaVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Bella voice

        // AWS S3 Configuration
        this.bucketName = process.env.AWS_S3_BUCKET || 'ringlypro-uploads';
        this.s3Client = null;

        // Initialize S3 client if credentials available
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            this.s3Client = new S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                }
            });
            logger.info('✅ AWS S3 initialized for voicemail audio storage');
        } else {
            logger.warn('⚠️ AWS S3 credentials not found - voicemail audio will use local storage fallback');
        }

        // Local directory for fallback storage (if S3 not available)
        this.audioDir = path.join(process.cwd(), 'public', 'voicemail-audio');

        // Ensure directory exists (fallback only)
        if (!this.s3Client) {
            this.ensureAudioDirectory();
        }
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
     * Generate voicemail audio using ElevenLabs Lina voice and upload to S3
     * @param {string} text - Custom voicemail message text
     * @param {number} clientId - Client ID (used for filename)
     * @returns {Promise<string>} Public S3 URL to generated audio file
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
            // Prepare text for speech (improve pronunciation)
            const speechText = text
                .replace(/RinglyPro/gi, 'Ringly Pro')
                .replace(/PixlyPro/gi, 'Pixly Pro')
                .replace(/\bAI\b/g, 'A.I.')
                .replace(/\$/g, ' dollars')
                .replace(/&/g, ' and ')
                .replace(/\s+/g, ' ')
                .trim();

            logger.info(`🎤 Generating Lina voicemail for client ${clientId}: "${speechText.substring(0, 50)}..."`);

            // Call ElevenLabs API with arraybuffer response
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
                responseType: 'arraybuffer', // Get buffer for S3 upload
                timeout: 30000 // 30 second timeout
            });

            const audioBuffer = Buffer.from(response.data);
            const fileSize = audioBuffer.length;
            logger.info(`✅ ElevenLabs audio generated: ${(fileSize / 1024).toFixed(2)} KB`);

            // Upload to S3 if available
            if (this.s3Client) {
                return await this.uploadToS3(audioBuffer, clientId);
            } else {
                // Fallback: Save to local disk
                logger.warn('⚠️ S3 not available, saving to local disk (will be lost on deployment)');
                return await this.saveToLocalDisk(audioBuffer, clientId);
            }

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
     * Upload audio buffer to AWS S3
     * @param {Buffer} audioBuffer - MP3 audio data
     * @param {number} clientId - Client ID
     * @returns {Promise<string>} Public S3 URL
     */
    async uploadToS3(audioBuffer, clientId) {
        try {
            const timestamp = Date.now();
            const s3Key = `voicemail/client_${clientId}/voicemail_${timestamp}.mp3`;

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: audioBuffer,
                ContentType: 'audio/mpeg',
                ACL: 'public-read', // Make file publicly accessible
                ServerSideEncryption: 'AES256',
                CacheControl: 'max-age=31536000' // Cache for 1 year (audio doesn't change)
            });

            await this.s3Client.send(command);

            // Generate public S3 URL
            const s3Url = `https://${this.bucketName}.s3.amazonaws.com/${s3Key}`;
            logger.info(`✅ Uploaded to S3: ${s3Url}`);

            return s3Url;

        } catch (error) {
            logger.error(`❌ S3 upload error: ${error.message}`);
            // Fallback to local storage
            logger.warn('⚠️ Falling back to local storage');
            return await this.saveToLocalDisk(audioBuffer, clientId);
        }
    }

    /**
     * Save audio buffer to local disk (fallback)
     * @param {Buffer} audioBuffer - MP3 audio data
     * @param {number} clientId - Client ID
     * @returns {Promise<string>} Local public URL
     */
    async saveToLocalDisk(audioBuffer, clientId) {
        try {
            this.ensureAudioDirectory();
            const filename = `voicemail_client_${clientId}_${Date.now()}.mp3`;
            const filepath = path.join(this.audioDir, filename);

            fs.writeFileSync(filepath, audioBuffer);

            const publicUrl = `/voicemail-audio/${filename}`;
            logger.info(`✅ Saved to local disk: ${publicUrl} (${(audioBuffer.length / 1024).toFixed(2)} KB)`);

            return publicUrl;

        } catch (error) {
            logger.error(`❌ Local storage error: ${error.message}`);
            return null;
        }
    }

    /**
     * Delete old voicemail audio file from S3 or local disk
     * @param {string} audioUrl - URL of the audio file to delete
     */
    async deleteVoicemailAudio(audioUrl) {
        if (!audioUrl) {
            return;
        }

        try {
            // Check if it's an S3 URL
            if (audioUrl.includes('.s3.amazonaws.com/') || audioUrl.includes('s3://')) {
                await this.deleteFromS3(audioUrl);
            }
            // Check if it's a local URL
            else if (audioUrl.startsWith('/voicemail-audio/')) {
                this.deleteFromLocalDisk(audioUrl);
            }
        } catch (error) {
            logger.error(`❌ Error deleting voicemail audio: ${error.message}`);
            // Non-fatal error - don't throw
        }
    }

    /**
     * Delete audio file from S3
     * @param {string} s3Url - S3 URL to delete
     */
    async deleteFromS3(s3Url) {
        if (!this.s3Client) {
            logger.warn('⚠️ S3 client not available, skipping deletion');
            return;
        }

        try {
            // Extract S3 key from URL
            // URL format: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_29/voicemail_1764866447.mp3
            const s3Key = s3Url.split('.s3.amazonaws.com/')[1] || s3Url.replace('s3://', '').split('/').slice(1).join('/');

            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key
            });

            await this.s3Client.send(command);
            logger.info(`🗑️ Deleted from S3: ${s3Key}`);

        } catch (error) {
            logger.error(`❌ S3 deletion error: ${error.message}`);
        }
    }

    /**
     * Delete audio file from local disk
     * @param {string} localUrl - Local URL to delete
     */
    deleteFromLocalDisk(localUrl) {
        try {
            const filename = localUrl.replace('/voicemail-audio/', '');
            const filepath = path.join(this.audioDir, filename);

            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                logger.info(`🗑️ Deleted from local disk: ${filename}`);
            }
        } catch (error) {
            logger.error(`❌ Local deletion error: ${error.message}`);
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
