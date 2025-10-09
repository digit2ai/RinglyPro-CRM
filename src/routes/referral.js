/**
 * Referral System Routes
 *
 * Handles referral code sharing and statistics
 */

const express = require('express');
const router = express.Router();
const { getReferralStats } = require('../utils/referralCode');
const { Client } = require('../models');

// GET /api/referral/:clientId - Get referral stats for a client
router.get('/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;

        // Get client info including referral code
        const client = await Client.findByPk(clientId, {
            attributes: ['id', 'business_name', 'referral_code', 'referred_by']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Get referral statistics
        const stats = await getReferralStats(clientId);

        // Build shareable link
        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const referralLink = client.referral_code
            ? `${baseUrl}/signup?ref=${client.referral_code}`
            : null;

        res.json({
            success: true,
            client: {
                id: client.id,
                businessName: client.business_name,
                referralCode: client.referral_code,
                referralLink: referralLink,
                wasReferred: !!client.referred_by
            },
            stats: {
                totalReferrals: stats.totalReferrals,
                activeReferrals: stats.activeReferrals,
                inactiveReferrals: stats.inactiveReferrals,
                referrals: stats.referrals
            }
        });

    } catch (error) {
        console.error('Error fetching referral stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch referral statistics',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/referral/:clientId/link - Get just the referral link (quick endpoint)
router.get('/:clientId/link', async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await Client.findByPk(clientId, {
            attributes: ['referral_code', 'business_name']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        if (!client.referral_code) {
            return res.status(404).json({
                success: false,
                error: 'No referral code found for this client'
            });
        }

        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const referralLink = `${baseUrl}/signup?ref=${client.referral_code}`;

        res.json({
            success: true,
            referralCode: client.referral_code,
            referralLink: referralLink,
            shareMessage: `Join me on RinglyPro! Get your own AI assistant to handle calls 24/7. Sign up with my link: ${referralLink}`
        });

    } catch (error) {
        console.error('Error fetching referral link:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch referral link',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
