'use strict';

/**
 * Press & Media Portal Routes - TunjoRacing
 * Handles press user authentication, access requests, and media post management
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireAdmin, generateToken } = require('../middleware/auth');

const RESET_SECRET = process.env.JWT_SECRET || 'tunjo-reset-secret-key';
const APP_URL = process.env.APP_URL || 'https://aiagent.ringlypro.com';

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

// POST /api/v1/press/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const TunjoPressUser = models.TunjoPressUser;
  if (!TunjoPressUser) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const user = await TunjoPressUser.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1 }
  });

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ success: false, error: 'Your account has been suspended. Please contact the media team.' });
  }

  const valid = await user.validatePassword(password);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  await user.update({ last_login_at: new Date() });

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: 'press',
    full_name: user.full_name
  });

  res.json({
    success: true,
    token,
    press_user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      media_outlet: user.media_outlet,
      role: user.role,
      country: user.country
    }
  });
}));

// POST /api/v1/press/forgot-password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const TunjoPressUser = models.TunjoPressUser;
  if (!TunjoPressUser) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const user = await TunjoPressUser.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1 }
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'No account found with this email' });
  }

  const resetToken = jwt.sign(
    { id: user.id, email: user.email, purpose: 'password_reset' },
    RESET_SECRET,
    { expiresIn: '1h' }
  );

  const resetLink = `${APP_URL}/tunjoracing/press/reset-password?token=${resetToken}`;

  res.json({
    success: true,
    resetLink,
    expiresIn: '1 hour'
  });
}));

// POST /api/v1/press/reset-password-token
router.post('/reset-password-token', asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({ success: false, error: 'Token and new password are required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, RESET_SECRET);
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
  }

  if (decoded.purpose !== 'password_reset') {
    return res.status(400).json({ success: false, error: 'Invalid reset token' });
  }

  const TunjoPressUser = models.TunjoPressUser;
  const user = await TunjoPressUser.findByPk(decoded.id);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  await user.update({ password_hash: new_password });

  res.json({ success: true, message: 'Password has been reset successfully' });
}));

// ============================================================================
// ACCESS REQUESTS (Public)
// ============================================================================

// POST /api/v1/press/request-access
router.post('/request-access', asyncHandler(async (req, res) => {
  const { full_name, media_outlet, role, email, country, website, phone, message, password, confirm_password } = req.body;

  if (!full_name || !media_outlet || !email) {
    return res.status(400).json({
      success: false,
      error: 'Full name, media outlet, and email are required'
    });
  }

  if (!password || !confirm_password) {
    return res.status(400).json({
      success: false,
      error: 'Password and password confirmation are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }

  if (password !== confirm_password) {
    return res.status(400).json({
      success: false,
      error: 'Passwords do not match'
    });
  }

  const TunjoPressAccessRequest = models.TunjoPressAccessRequest;
  const TunjoPressUser = models.TunjoPressUser;
  if (!TunjoPressAccessRequest) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  // Check if already has an account
  if (TunjoPressUser) {
    const existingUser = await TunjoPressUser.findOne({
      where: { email: email.toLowerCase(), tenant_id: 1 }
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists. Please sign in.'
      });
    }
  }

  // Check for pending request
  const existingRequest = await TunjoPressAccessRequest.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1, status: 'pending' }
  });

  if (existingRequest) {
    return res.status(400).json({
      success: false,
      error: 'You already have a pending access request. Please wait for review.'
    });
  }

  const request = await TunjoPressAccessRequest.create({
    tenant_id: 1,
    full_name,
    media_outlet,
    role: role || null,
    email: email.toLowerCase(),
    country: country || null,
    website: website || null,
    phone: phone || null,
    message: message || null,
    password_hash: password
  });

  res.status(201).json({
    success: true,
    message: 'Your access request has been submitted. You will receive login credentials once approved.',
    request_id: request.id
  });
}));

// ============================================================================
// PRESS PORTAL (Authenticated)
// ============================================================================

// Middleware to require press role
const requirePress = (req, res, next) => {
  if (!req.user || req.user.role !== 'press') {
    return res.status(403).json({ success: false, error: 'Press access required' });
  }
  next();
};

// GET /api/v1/press/me - Get press user profile
router.get('/me', authenticateToken, requirePress, asyncHandler(async (req, res) => {
  const TunjoPressUser = models.TunjoPressUser;
  const user = await TunjoPressUser.findByPk(req.user.id, {
    attributes: { exclude: ['password_hash'] }
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({ success: true, data: user });
}));

// GET /api/v1/press/media-posts - List published media posts
router.get('/media-posts', authenticateToken, requirePress, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  if (!TunjoMediaPost) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const { season, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const where = { tenant_id: 1, status: 'published' };
  if (season) where.season = season;

  const { count, rows } = await TunjoMediaPost.findAndCountAll({
    where,
    order: [['race_date', 'DESC'], ['published_at', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset),
    attributes: ['id', 'title', 'slug', 'race_date', 'race_location', 'season', 'series', 'summary', 'cover_image_url', 'published_at', 'total_views']
  });

  res.json({
    success: true,
    data: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / limit)
    }
  });
}));

// GET /api/v1/press/media-posts/:slug - Get single media post with assets
router.get('/media-posts/:slug', authenticateToken, requirePress, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;
  if (!TunjoMediaPost) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const post = await TunjoMediaPost.findOne({
    where: { slug: req.params.slug, tenant_id: 1, status: 'published' },
    include: TunjoMediaPostAsset ? [{
      model: TunjoMediaPostAsset,
      as: 'assets',
      order: [['sort_order', 'ASC']]
    }] : []
  });

  if (!post) {
    return res.status(404).json({ success: false, error: 'Media post not found' });
  }

  // Increment view count
  await post.increment('total_views');

  res.json({ success: true, data: post });
}));

// POST /api/v1/press/media-posts/:id/download - Track download
router.post('/media-posts/:id/download', authenticateToken, requirePress, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;
  const TunjoPressUser = models.TunjoPressUser;

  const { asset_id } = req.body;

  // Track on media post
  if (TunjoMediaPost) {
    const post = await TunjoMediaPost.findByPk(req.params.id);
    if (post) await post.increment('total_downloads');
  }

  // Track on specific asset
  if (asset_id && TunjoMediaPostAsset) {
    const asset = await TunjoMediaPostAsset.findByPk(asset_id);
    if (asset) await asset.increment('download_count');
  }

  // Track on press user
  if (TunjoPressUser) {
    const user = await TunjoPressUser.findByPk(req.user.id);
    if (user) await user.increment('download_count');
  }

  res.json({ success: true, message: 'Download tracked' });
}));

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// GET /api/v1/press/admin/requests - List access requests
router.get('/admin/requests', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressAccessRequest = models.TunjoPressAccessRequest;
  if (!TunjoPressAccessRequest) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const { status, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const where = { tenant_id: 1 };
  if (status) where.status = status;

  const { count, rows } = await TunjoPressAccessRequest.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  res.json({
    success: true,
    data: rows,
    pagination: { total: count, page: parseInt(page), limit: parseInt(limit) }
  });
}));

// POST /api/v1/press/admin/requests/:id/approve - Approve access request
router.post('/admin/requests/:id/approve', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressAccessRequest = models.TunjoPressAccessRequest;
  const TunjoPressUser = models.TunjoPressUser;

  const request = await TunjoPressAccessRequest.findByPk(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Request has already been reviewed' });
  }

  // Create press user account with the password they set during request
  const pressUser = await TunjoPressUser.create({
    tenant_id: 1,
    email: request.email,
    full_name: request.full_name,
    media_outlet: request.media_outlet,
    role: request.role,
    country: request.country,
    website: request.website,
    phone: request.phone,
    password_hash: request.password_hash || null,
    status: 'active',
    approved_at: new Date()
  });

  // Skip the beforeCreate hook hashing since password_hash is already hashed
  // The password was hashed in the PressAccessRequest beforeCreate hook

  await request.update({
    status: 'approved',
    reviewed_at: new Date(),
    press_user_id: pressUser.id
  });

  // Generate a setup link only if no password was set during request
  let setupLink = null;
  if (!request.password_hash) {
    const setupToken = jwt.sign(
      { id: pressUser.id, email: pressUser.email, purpose: 'password_reset' },
      RESET_SECRET,
      { expiresIn: '24h' }
    );
    setupLink = `${APP_URL}/tunjoracing/press/reset-password?token=${setupToken}`;
  }

  res.json({
    success: true,
    message: request.password_hash
      ? 'Request approved. The journalist can now sign in with their email and password.'
      : 'Request approved. Share the setup link with the journalist.',
    press_user: {
      id: pressUser.id,
      email: pressUser.email,
      full_name: pressUser.full_name
    },
    setupLink
  });
}));

// POST /api/v1/press/admin/requests/:id/reject - Reject access request
router.post('/admin/requests/:id/reject', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressAccessRequest = models.TunjoPressAccessRequest;

  const request = await TunjoPressAccessRequest.findByPk(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, error: 'Request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Request has already been reviewed' });
  }

  await request.update({
    status: 'rejected',
    reviewed_at: new Date(),
    rejection_reason: req.body.reason || null
  });

  res.json({ success: true, message: 'Request rejected' });
}));

// GET /api/v1/press/admin/users - List press users
router.get('/admin/users', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressUser = models.TunjoPressUser;
  if (!TunjoPressUser) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const users = await TunjoPressUser.findAll({
    where: { tenant_id: 1 },
    attributes: { exclude: ['password_hash'] },
    order: [['created_at', 'DESC']]
  });

  res.json({ success: true, data: users });
}));

// PUT /api/v1/press/admin/users/:id - Update press user (suspend/activate)
router.put('/admin/users/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressUser = models.TunjoPressUser;

  const user = await TunjoPressUser.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const { status, full_name, media_outlet, role, country } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (full_name) updates.full_name = full_name;
  if (media_outlet) updates.media_outlet = media_outlet;
  if (role) updates.role = role;
  if (country) updates.country = country;

  await user.update(updates);

  res.json({ success: true, data: user });
}));

// POST /api/v1/press/admin/users/:id/reset-link - Generate password setup/reset link
router.post('/admin/users/:id/reset-link', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressUser = models.TunjoPressUser;

  const user = await TunjoPressUser.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const resetToken = jwt.sign(
    { id: user.id, email: user.email, purpose: 'password_reset' },
    RESET_SECRET,
    { expiresIn: '24h' }
  );

  const resetLink = `${APP_URL}/tunjoracing/press/reset-password?token=${resetToken}`;

  res.json({
    success: true,
    resetLink,
    expiresIn: '24 hours'
  });
}));

// ============================================================================
// ADMIN - MEDIA POSTS MANAGEMENT
// ============================================================================

// GET /api/v1/press/admin/media-posts - List all media posts (including drafts)
router.get('/admin/media-posts', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;
  if (!TunjoMediaPost) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const posts = await TunjoMediaPost.findAll({
    where: { tenant_id: 1 },
    order: [['created_at', 'DESC']],
    include: TunjoMediaPostAsset ? [{
      model: TunjoMediaPostAsset,
      as: 'assets',
      attributes: ['id', 'asset_type', 'filename', 'download_count']
    }] : []
  });

  res.json({ success: true, data: posts });
}));

// POST /api/v1/press/admin/media-posts - Create media post
router.post('/admin/media-posts', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  if (!TunjoMediaPost) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const {
    title, race_date, race_location, season, series,
    summary, press_release_text, driver_quotes,
    championship_highlights, cover_image_url, status
  } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  const post = await TunjoMediaPost.create({
    tenant_id: 1,
    title,
    race_date: race_date || null,
    race_location: race_location || null,
    season: season || null,
    series: series || null,
    summary: summary || null,
    press_release_text: press_release_text || null,
    driver_quotes: driver_quotes || [],
    championship_highlights: championship_highlights || null,
    cover_image_url: cover_image_url || null,
    status: status || 'draft',
    published_at: status === 'published' ? new Date() : null
  });

  res.status(201).json({ success: true, data: post });
}));

// PUT /api/v1/press/admin/media-posts/:id - Update media post
router.put('/admin/media-posts/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;

  const post = await TunjoMediaPost.findByPk(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Media post not found' });
  }

  const updates = { ...req.body };

  // If publishing for first time, set published_at
  if (updates.status === 'published' && !post.published_at) {
    updates.published_at = new Date();
  }

  // Regenerate slug if title changed
  if (updates.title && updates.title !== post.title) {
    updates.slug = updates.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // Remove fields that shouldn't be directly updated
  delete updates.id;
  delete updates.tenant_id;
  delete updates.created_at;

  await post.update(updates);

  res.json({ success: true, data: post });
}));

// DELETE /api/v1/press/admin/media-posts/:id - Delete media post
router.delete('/admin/media-posts/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;

  const post = await TunjoMediaPost.findByPk(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Media post not found' });
  }

  // Delete associated assets
  if (TunjoMediaPostAsset) {
    await TunjoMediaPostAsset.destroy({ where: { media_post_id: post.id } });
  }

  await post.destroy();

  res.json({ success: true, message: 'Media post deleted' });
}));

// ============================================================================
// ADMIN - MEDIA ASSETS MANAGEMENT
// ============================================================================

// POST /api/v1/press/admin/media-posts/:id/assets - Add asset to media post
router.post('/admin/media-posts/:id/assets', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPost = models.TunjoMediaPost;
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;

  const post = await TunjoMediaPost.findByPk(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Media post not found' });
  }

  const { asset_type, url, thumbnail_url, filename, file_size, caption, credit, sort_order } = req.body;

  if (!asset_type || !url) {
    return res.status(400).json({ success: false, error: 'asset_type and url are required' });
  }

  const asset = await TunjoMediaPostAsset.create({
    tenant_id: 1,
    media_post_id: post.id,
    asset_type,
    url,
    thumbnail_url: thumbnail_url || null,
    filename: filename || null,
    file_size: file_size || null,
    caption: caption || null,
    credit: credit || null,
    sort_order: sort_order || 0
  });

  res.status(201).json({ success: true, data: asset });
}));

// DELETE /api/v1/press/admin/assets/:id - Delete asset
router.delete('/admin/assets/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaPostAsset = models.TunjoMediaPostAsset;

  const asset = await TunjoMediaPostAsset.findByPk(req.params.id);
  if (!asset) {
    return res.status(404).json({ success: false, error: 'Asset not found' });
  }

  await asset.destroy();

  res.json({ success: true, message: 'Asset deleted' });
}));

// ============================================================================
// ADMIN - STATS
// ============================================================================

// GET /api/v1/press/admin/stats - Press portal statistics
router.get('/admin/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoPressUser = models.TunjoPressUser;
  const TunjoPressAccessRequest = models.TunjoPressAccessRequest;
  const TunjoMediaPost = models.TunjoMediaPost;

  const [
    totalUsers,
    activeUsers,
    pendingRequests,
    totalPosts,
    publishedPosts
  ] = await Promise.all([
    TunjoPressUser ? TunjoPressUser.count({ where: { tenant_id: 1 } }) : 0,
    TunjoPressUser ? TunjoPressUser.count({ where: { tenant_id: 1, status: 'active' } }) : 0,
    TunjoPressAccessRequest ? TunjoPressAccessRequest.count({ where: { tenant_id: 1, status: 'pending' } }) : 0,
    TunjoMediaPost ? TunjoMediaPost.count({ where: { tenant_id: 1 } }) : 0,
    TunjoMediaPost ? TunjoMediaPost.count({ where: { tenant_id: 1, status: 'published' } }) : 0
  ]);

  res.json({
    success: true,
    data: {
      total_press_users: totalUsers,
      active_press_users: activeUsers,
      pending_requests: pendingRequests,
      total_media_posts: totalPosts,
      published_media_posts: publishedPosts
    }
  });
}));

module.exports = router;
