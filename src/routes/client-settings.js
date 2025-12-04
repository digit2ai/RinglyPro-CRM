const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const voicemailAudioService = require('../services/voicemailAudioService');

/**
 * GET /api/client-settings/:clientId/voicemail-message
 * Get client's custom outbound voicemail message
 */
router.get('/:clientId/voicemail-message', async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await sequelize.query(
      'SELECT outbound_voicemail_message, outbound_voicemail_audio_url FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: result[0].outbound_voicemail_message || null,
      audioUrl: result[0].outbound_voicemail_audio_url || null,
      isCustom: !!result[0].outbound_voicemail_message
    });

  } catch (error) {
    logger.error('Error fetching voicemail message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/client-settings/:clientId/voicemail-message
 * Update client's custom outbound voicemail message and generate Lina voice audio
 */
router.put('/:clientId/voicemail-message', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { message } = req.body;

    if (message && message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long. Maximum 1000 characters.'
      });
    }

    // Get old audio URL to delete later
    const oldData = await sequelize.query(
      'SELECT outbound_voicemail_audio_url FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    const oldAudioUrl = oldData[0]?.outbound_voicemail_audio_url;

    let audioUrl = null;

    // Generate ElevenLabs audio with Lina's voice if message is provided
    if (message && message.trim().length > 0) {
      logger.info(`🎤 Generating ElevenLabs audio for client ${clientId}...`);
      audioUrl = await voicemailAudioService.generateVoicemailAudio(message, clientId);

      if (audioUrl) {
        logger.info(`✅ Lina voice audio generated: ${audioUrl}`);
      } else {
        logger.warn(`⚠️ ElevenLabs generation failed, will use Twilio TTS fallback`);
      }
    }

    // Update database with message and audio URL
    await sequelize.query(
      'UPDATE clients SET outbound_voicemail_message = :message, outbound_voicemail_audio_url = :audioUrl, updated_at = CURRENT_TIMESTAMP WHERE id = :clientId',
      {
        replacements: {
          clientId: parseInt(clientId),
          message: message || null,
          audioUrl: audioUrl
        },
        type: QueryTypes.UPDATE
      }
    );

    // Delete old audio file if it exists
    if (oldAudioUrl) {
      voicemailAudioService.deleteVoicemailAudio(oldAudioUrl);
    }

    logger.info(`✅ Updated outbound voicemail message for client ${clientId}${audioUrl ? ' with Lina voice audio' : ''}`);

    res.json({
      success: true,
      message: 'Voicemail message updated successfully',
      audioUrl: audioUrl,
      usingLinaVoice: !!audioUrl
    });

  } catch (error) {
    logger.error('Error updating voicemail message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/client-settings/:clientId/voicemail-message
 * Remove custom message and revert to default
 */
router.delete('/:clientId/voicemail-message', async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get audio URL to delete
    const oldData = await sequelize.query(
      'SELECT outbound_voicemail_audio_url FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    const oldAudioUrl = oldData[0]?.outbound_voicemail_audio_url;

    // Clear both message and audio URL
    await sequelize.query(
      'UPDATE clients SET outbound_voicemail_message = NULL, outbound_voicemail_audio_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.UPDATE
      }
    );

    // Delete audio file if it exists
    if (oldAudioUrl) {
      voicemailAudioService.deleteVoicemailAudio(oldAudioUrl);
    }

    logger.info(`Reset voicemail message to default for client ${clientId}`);

    res.json({
      success: true,
      message: 'Voicemail message reset to default'
    });

  } catch (error) {
    logger.error('Error resetting voicemail message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
