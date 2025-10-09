/**
 * Referral Code Generator Utility
 *
 * Generates unique 8-character alphanumeric codes for client referrals
 */

const { Client } = require('../models');

/**
 * Generate a random 8-character referral code
 * Uses uppercase letters and numbers, excluding confusing characters (O, 0, I, 1, L)
 *
 * @returns {string} 8-character code (e.g., "ABC23XYZ")
 */
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed O, 0, I, 1, L for clarity
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Generate a unique referral code (checks database for uniqueness)
 *
 * @param {number} maxAttempts - Maximum attempts to generate unique code (default: 10)
 * @returns {Promise<string>} Unique referral code
 * @throws {Error} If unable to generate unique code after maxAttempts
 */
async function generateUniqueReferralCode(maxAttempts = 10) {
    let attempts = 0;

    while (attempts < maxAttempts) {
        const code = generateCode();

        // Check if code already exists
        const existingClient = await Client.findOne({
            where: { referral_code: code }
        });

        if (!existingClient) {
            return code;
        }

        attempts++;
    }

    throw new Error(`Failed to generate unique referral code after ${maxAttempts} attempts`);
}

/**
 * Get client by referral code
 *
 * @param {string} referralCode - The referral code to look up
 * @returns {Promise<Client|null>} Client object or null if not found
 */
async function getClientByReferralCode(referralCode) {
    if (!referralCode) return null;

    return await Client.findOne({
        where: { referral_code: referralCode.toUpperCase() }
    });
}

/**
 * Get referral statistics for a client
 *
 * @param {number} clientId - The client ID to get stats for
 * @returns {Promise<Object>} Referral statistics
 */
async function getReferralStats(clientId) {
    const { sequelize } = require('../models');

    // Get all clients referred by this client
    const referrals = await Client.findAll({
        where: { referred_by: clientId },
        attributes: ['id', 'business_name', 'created_at', 'active'],
        order: [['created_at', 'DESC']]
    });

    // Get total count
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => r.active).length;

    return {
        totalReferrals,
        activeReferrals,
        inactiveReferrals: totalReferrals - activeReferrals,
        referrals: referrals.map(r => ({
            id: r.id,
            businessName: r.business_name,
            signupDate: r.created_at,
            active: r.active
        }))
    };
}

module.exports = {
    generateUniqueReferralCode,
    getClientByReferralCode,
    getReferralStats
};
