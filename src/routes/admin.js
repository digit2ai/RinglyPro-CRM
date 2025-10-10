// Admin Portal API Routes
// Only accessible by info@digit2ai.com
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const router = express.Router();
const { sequelize, Client, User, AdminCommunication, AdminNote } = require('../models');
const twilio = require('twilio');

// ============= ADMIN LOGIN (NO AUTH REQUIRED) =============

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`🔐 Admin login attempt: ${email}`);

        // Only allow info@digit2ai.com
        if (email !== 'info@digit2ai.com') {
            console.log(`🚨 Non-admin email attempted admin login: ${email}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Find admin user
        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log(`❌ Admin user not found: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            console.log(`❌ Invalid password for admin: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if user is admin (note: underscored:true converts is_admin to isAdmin)
        console.log(`🔍 User admin status: isAdmin=${user.isAdmin}, is_admin=${user.is_admin}`);
        if (!user.isAdmin) {
            console.log(`🚨 Non-admin user attempted admin login: ${email}`);
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                isAdmin: true
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '24h' }
        );

        console.log(`✅ Admin login successful: ${email}`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                isAdmin: user.isAdmin
            }
        });

    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

        // Check if user is admin
        const user = await User.findByPk(decoded.userId);

        if (!user || !user.isAdmin) {
            console.log(`🚨 Non-admin user ${decoded.email} attempted to access admin portal`);
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Only allow info@digit2ai.com
        if (user.email !== 'info@digit2ai.com') {
            console.log(`🚨 Non-authorized admin ${user.email} attempted access`);
            return res.status(403).json({
                success: false,
                error: 'Unauthorized admin account'
            });
        }

        req.adminUser = user;
        req.adminId = user.id;

        console.log(`✅ Admin access granted: ${user.email}`);
        next();
    } catch (error) {
        console.error('Admin authentication error:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// ============= ADMIN DASHBOARD - CLIENT LIST =============

router.get('/clients', async (req, res) => {
    try {
        const { search, sortBy = 'created_at', sortOrder = 'DESC', limit = 50, offset = 0 } = req.query;

        console.log(`📊 Admin loading clients list (search: ${search || 'none'})`);

        // Build query
        let query = `
            SELECT
                c.id,
                c.business_name,
                c.owner_name,
                c.owner_phone,
                c.owner_email,
                c.ringlypro_number,
                c.rachel_enabled,
                c.active,
                c.created_at as signup_date,
                c.monthly_free_minutes,
                c.per_minute_rate,

                -- Calculate last activity (most recent call, message, or appointment)
                GREATEST(
                    MAX(calls.created_at),
                    MAX(messages.created_at),
                    MAX(appointments.created_at),
                    c.created_at
                ) as last_activity_at,

                -- Calculate minutes used from calls table (duration is in seconds, convert to minutes)
                COALESCE(SUM(calls.duration) / 60.0, 0) as total_minutes_used,

                -- Calculate dollar amount (minutes * rate)
                ROUND(COALESCE(SUM(calls.duration) / 60.0, 0) * c.per_minute_rate, 2) as dollar_amount,

                -- Count appointments
                COUNT(DISTINCT appointments.id) as total_appointments,

                -- Count messages
                COUNT(DISTINCT messages.id) as total_messages,

                -- Count calls
                COUNT(DISTINCT calls.id) as total_calls

            FROM clients c
            LEFT JOIN calls ON calls.client_id = c.id
            LEFT JOIN appointments ON appointments.client_id = c.id
            LEFT JOIN messages ON messages.client_id = c.id
        `;

        // Add search filter
        const replacements = {};
        if (search) {
            query += ` WHERE (
                c.business_name ILIKE :search
                OR c.owner_name ILIKE :search
                OR c.owner_phone ILIKE :search
                OR c.owner_email ILIKE :search
            )`;
            replacements.search = `%${search}%`;
        }

        query += ` GROUP BY c.id`;

        // Add sorting
        const validSortColumns = ['business_name', 'signup_date', 'last_activity_at', 'total_minutes_used', 'dollar_amount'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY ${sortColumn} ${order}`;

        // Add pagination
        query += ` LIMIT :limit OFFSET :offset`;
        replacements.limit = parseInt(limit);
        replacements.offset = parseInt(offset);

        const clients = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Get total count
        let countQuery = `SELECT COUNT(DISTINCT c.id) as total FROM clients c`;
        if (search) {
            countQuery += ` WHERE (
                c.business_name ILIKE :search
                OR c.owner_name ILIKE :search
                OR c.owner_phone ILIKE :search
                OR c.owner_email ILIKE :search
            )`;
        }

        const [{ total }] = await sequelize.query(countQuery, {
            replacements: search ? { search: `%${search}%` } : {},
            type: sequelize.QueryTypes.SELECT
        });

        console.log(`✅ Admin loaded ${clients.length} clients (total: ${total})`);

        res.json({
            success: true,
            clients,
            pagination: {
                total: parseInt(total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + clients.length < parseInt(total)
            }
        });

    } catch (error) {
        console.error('❌ Admin clients list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load clients',
            details: error.message
        });
    }
});

// ============= CLIENT PROFILE =============

router.get('/clients/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;

        console.log(`📋 Admin loading client profile: ${client_id}`);

        // Get client details with aggregated stats
        const query = `
            SELECT
                c.*,
                -- Calculate last activity
                GREATEST(
                    MAX(calls.created_at),
                    MAX(messages.created_at),
                    MAX(appointments.created_at),
                    c.created_at
                ) as last_activity_at,
                -- Convert duration from seconds to minutes
                COALESCE(SUM(calls.duration) / 60.0, 0) as total_minutes_used,
                ROUND(COALESCE(SUM(calls.duration) / 60.0, 0) * c.per_minute_rate, 2) as dollar_amount,
                COUNT(DISTINCT appointments.id) as total_appointments,
                COUNT(DISTINCT messages.id) as total_messages,
                COUNT(DISTINCT calls.id) as total_calls
            FROM clients c
            LEFT JOIN calls ON calls.client_id = c.id
            LEFT JOIN appointments ON appointments.client_id = c.id
            LEFT JOIN messages ON messages.client_id = c.id
            WHERE c.id = :client_id
            GROUP BY c.id
        `;

        const [client] = await sequelize.query(query, {
            replacements: { client_id },
            type: sequelize.QueryTypes.SELECT
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Get recent activity
        const recentActivity = await sequelize.query(`
            SELECT * FROM (
                SELECT
                    'call' as type,
                    created_at,
                    direction,
                    duration,
                    from_number as phone
                FROM calls
                WHERE client_id = :client_id

                UNION ALL

                SELECT
                    'message' as type,
                    created_at,
                    direction,
                    NULL as duration,
                    from_number as phone
                FROM messages
                WHERE client_id = :client_id

                UNION ALL

                SELECT
                    'appointment' as type,
                    created_at,
                    NULL as direction,
                    NULL as duration,
                    customer_phone as phone
                FROM appointments
                WHERE client_id = :client_id
            ) combined
            ORDER BY created_at DESC
            LIMIT 50
        `, {
            replacements: { client_id },
            type: sequelize.QueryTypes.SELECT
        });

        // Get admin notes
        const notes = await AdminNote.findAll({
            where: { clientId: client_id },
            include: [{
                model: User,
                as: 'admin',
                attributes: ['email', 'first_name', 'last_name']
            }],
            order: [['created_at', 'DESC']],
            limit: 20
        });

        console.log(`✅ Admin loaded client profile: ${client.business_name}`);

        res.json({
            success: true,
            client,
            recentActivity,
            notes
        });

    } catch (error) {
        console.error('❌ Admin client profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load client profile',
            details: error.message
        });
    }
});

// ============= SEND SMS TO CLIENT =============

router.post('/clients/:client_id/send-sms', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { message, to } = req.body;

        if (!message || !to) {
            return res.status(400).json({
                success: false,
                error: 'Message and phone number required'
            });
        }

        const client = await Client.findByPk(client_id);
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        console.log(`📤 Admin sending SMS to client ${client.business_name} (${to})`);

        // Initialize Twilio
        const twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );

        // Send SMS from admin number
        const adminPhone = '+18886103810';

        const twilioMessage = await twilioClient.messages.create({
            body: message,
            from: adminPhone,
            to: to
        });

        // Log to admin_communications table
        await AdminCommunication.create({
            adminUserId: req.adminId,
            clientId: client_id,
            communicationType: 'sms',
            message,
            phoneNumber: to,
            twilioSid: twilioMessage.sid,
            direction: 'outbound',
            status: twilioMessage.status
        });

        // Also log to messages table with admin flag
        await sequelize.query(`
            INSERT INTO messages (
                client_id, twilio_sid, direction, from_number, to_number,
                body, status, is_admin_message, created_at
            ) VALUES (
                :client_id, :twilio_sid, 'outbound', :from_number, :to_number,
                :body, :status, TRUE, NOW()
            )
        `, {
            replacements: {
                client_id,
                twilio_sid: twilioMessage.sid,
                from_number: adminPhone,
                to_number: to,
                body: message,
                status: twilioMessage.status
            }
        });

        console.log(`✅ Admin SMS sent successfully: ${twilioMessage.sid}`);

        res.json({
            success: true,
            message: 'SMS sent successfully',
            twilioSid: twilioMessage.sid,
            status: twilioMessage.status
        });

    } catch (error) {
        console.error('❌ Admin SMS sending error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send SMS',
            details: error.message
        });
    }
});

// ============= GET SMS HISTORY WITH CLIENT =============

router.get('/clients/:client_id/sms-history', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { limit = 50 } = req.query;

        const communications = await AdminCommunication.findAll({
            where: {
                clientId: client_id,
                communicationType: 'sms'
            },
            include: [{
                model: User,
                as: 'admin',
                attributes: ['email', 'first_name', 'last_name']
            }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            communications
        });

    } catch (error) {
        console.error('❌ Admin SMS history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load SMS history',
            details: error.message
        });
    }
});

// ============= ADD ADMIN NOTE =============

router.post('/clients/:client_id/notes', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { note, noteType = 'general' } = req.body;

        if (!note) {
            return res.status(400).json({
                success: false,
                error: 'Note text required'
            });
        }

        const adminNote = await AdminNote.create({
            adminUserId: req.adminId,
            clientId: client_id,
            note,
            noteType
        });

        console.log(`📝 Admin added note to client ${client_id}`);

        res.json({
            success: true,
            note: adminNote
        });

    } catch (error) {
        console.error('❌ Admin note creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create note',
            details: error.message
        });
    }
});

// ============= SEARCH CLIENTS BY PHONE =============

router.get('/search/phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        console.log(`🔍 Admin searching for phone: ${phone}`);

        const clients = await sequelize.query(`
            SELECT
                c.*,
                COALESCE(SUM(calls.duration), 0) as total_minutes_used,
                ROUND(COALESCE(SUM(calls.duration), 0) / 60.0 * c.per_minute_rate, 2) as dollar_amount
            FROM clients c
            LEFT JOIN calls ON calls.client_id = c.id
            WHERE c.owner_phone ILIKE :phone
               OR c.business_phone ILIKE :phone
            GROUP BY c.id
        `, {
            replacements: { phone: `%${phone}%` },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            success: true,
            clients
        });

    } catch (error) {
        console.error('❌ Admin phone search error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed',
            details: error.message
        });
    }
});

// ============= ADMIN REPORTS =============

router.get('/reports/overview', async (req, res) => {
    try {
        console.log('📊 Admin loading overview report');

        const overview = await sequelize.query(`
            SELECT
                COUNT(DISTINCT c.id) as total_clients,
                COUNT(DISTINCT CASE WHEN c.active = TRUE THEN c.id END) as active_clients,
                COUNT(DISTINCT CASE WHEN c.rachel_enabled = TRUE THEN c.id END) as rachel_enabled_clients,
                COALESCE(SUM(calls.duration) / 60.0, 0) as total_minutes_used,
                ROUND(COALESCE(SUM(calls.duration) / 60.0 * c.per_minute_rate, 0), 2) as total_revenue,
                COUNT(DISTINCT appointments.id) as total_appointments,
                COUNT(DISTINCT messages.id) as total_messages,
                COUNT(DISTINCT calls.id) as total_calls
            FROM clients c
            LEFT JOIN calls ON calls.client_id = c.id
            LEFT JOIN appointments ON appointments.client_id = c.id
            LEFT JOIN messages ON messages.client_id = c.id
        `, {
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            success: true,
            overview: overview[0]
        });

    } catch (error) {
        console.error('❌ Admin overview report error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load overview',
            details: error.message
        });
    }
});

module.exports = router;
