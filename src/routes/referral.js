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

        // Get client info including referral code (with fallback if columns don't exist)
        const client = await Client.findByPk(clientId, {
            attributes: ['id', 'business_name', 'referral_code', 'referred_by']
        }).catch(err => {
            // If columns don't exist yet (before migration), return minimal client data
            console.log('⚠️ Referral columns may not exist yet - returning defaults');
            return Client.findByPk(clientId, {
                attributes: ['id', 'business_name']
            });
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Get referral statistics (handle case where columns don't exist)
        let stats = { totalReferrals: 0, activeReferrals: 0, inactiveReferrals: 0, referrals: [] };
        try {
            stats = await getReferralStats(clientId);
        } catch (statsError) {
            console.log('⚠️ Unable to fetch referral stats - columns may not exist yet');
        }

        // Build shareable link
        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const referralCode = client.referral_code || null;
        const referralLink = referralCode
            ? `${baseUrl}/signup?ref=${referralCode}`
            : null;

        res.json({
            success: true,
            client: {
                id: client.id,
                businessName: client.business_name,
                referralCode: referralCode,
                referralLink: referralLink,
                wasReferred: !!(client.referred_by)
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
        console.error('Stack:', error.stack);
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
        }).catch(err => {
            // If referral_code column doesn't exist yet, return minimal data
            console.log('⚠️ Referral code column may not exist yet - returning minimal data');
            return Client.findByPk(clientId, {
                attributes: ['business_name']
            });
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        const referralCode = client.referral_code || null;

        if (!referralCode) {
            return res.status(200).json({
                success: true,
                referralCode: null,
                referralLink: null,
                shareMessage: 'Referral system not yet activated. Please run database migration.'
            });
        }

        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

        res.json({
            success: true,
            referralCode: referralCode,
            referralLink: referralLink,
            shareMessage: `Join me on RinglyPro! Get your own FREE AI assistant to handle calls 24/7. Sign up with my link: ${referralLink}`
        });

    } catch (error) {
        console.error('Error fetching referral link:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch referral link',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
