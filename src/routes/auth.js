const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const router = express.Router();

console.log('🔍 AUTH ROUTES FILE LOADED - Routes should be available');

// Simple test route (no middleware)
router.get('/simple-test', (req, res) => {
    console.log('🎯 Simple test route was called!');
    res.json({ success: true, message: 'Auth routes are loading successfully!' });
});

// POST /api/auth/register - User registration
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, businessName, businessPhone } = req.body;
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ 
                error: 'User already exists with this email' 
            });
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Create user
        const user = await User.create({
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            business_phone: businessPhone
        });
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                userId: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                businessName: user.business_name,
                token
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed. Please try again.' 
        });
    }
});

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }
        
        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                userId: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                businessName: user.business_name,
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed. Please try again.' 
        });
    }
});

module.exports = router;