// =====================================================
// JWT Authentication Middleware
// File: src/middleware/auth.js
// =====================================================

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const CreditSystem = require('../services/creditSystem');

// Initialize credit system for client lookups
const creditSystem = new CreditSystem();

// JWT token authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Access token required' 
            });
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        
        // Get user from database
        const user = await User.findByPk(decoded.userId);
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token - user not found' 
            });
        }
        
        // Add user info to request object
        req.user = {
            userId: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            businessName: user.business_name
        };
        
        next();
    } catch (error) {
        console.error('JWT authentication error:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expired' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        return res.status(500).json({ 
            success: false,
            error: 'Authentication failed' 
        });
    }
};

// Get user's associated client account
const getUserClient = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'User not authenticated' 
            });
        }
        
        // Get client associated with this user
        const client = await creditSystem.getClientByUserId(req.user.userId);
        if (!client) {
            return res.status(404).json({ 
                success: false,
                error: 'No client account associated with user' 
            });
        }
        
        // Add client info to request object
        req.client = {
            id: client.id,
            businessName: client.business_name,
            businessPhone: client.business_phone,
            ownerName: client.owner_name,
            ownerPhone: client.owner_phone,
            monthlyFreeMinutes: client.monthly_free_minutes,
            perMinuteRate: parseFloat(client.per_minute_rate),
            active: client.active
        };
        
        next();
    } catch (error) {
        console.error('Error getting user client:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to get client information' 
        });
    }
};

// Combined middleware for routes that need both authentication and client data
const authenticateAndGetClient = [authenticateToken, getUserClient];

// Test response function for debugging
const testAuth = (req, res) => {
    res.json({
        success: true,
        message: 'Authentication successful',
        user: req.user,
        client: req.client,
        timestamp: new Date().toISOString()
    });
};

// Export all middleware functions
module.exports = {
    authenticateToken,
    getUserClient,
    authenticateAndGetClient,
    testAuth
};