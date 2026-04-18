const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken, verifyToken } = require('../middleware/auth');

// POST /api/v1/auth/register -- Community member registration
router.post('/register', async (req, res) => {
  try {
    const models = require('../../models');
    const { email, password, first_name, last_name, age, country, city, language_pref,
            phone, school_or_university, field_of_interest, registration_source,
            geo_detected_country, geo_detected_city } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'email, password, first_name, and last_name are required' });
    }

    const existing = await models.VisionariumCommunityMember.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const member = await models.VisionariumCommunityMember.create({
      email: email.toLowerCase(),
      password_hash,
      first_name, last_name, age,
      country: country || geo_detected_country,
      city: city || geo_detected_city,
      language_pref: language_pref || 'en',
      phone, school_or_university, field_of_interest,
      registration_source: registration_source || 'web',
      geo_detected_country, geo_detected_city
    });

    const token = generateToken({ id: member.id, email: member.email, role: 'community' });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: member.id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        tier: member.tier,
        role: 'community'
      }
    });
  } catch (err) {
    console.error('Visionarium register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/login -- Login (all roles)
router.post('/login', async (req, res) => {
  try {
    const models = require('../../models');
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const lowerEmail = email.toLowerCase();

    // Check admin accounts
    const adminAccounts = {
      'admin@visionarium.app': { password: 'Visionarium2026!', first_name: 'Admin', last_name: 'Visionarium' },
      'mstagg@digit2ai.com': { password: 'Palindrome@7', first_name: 'Manuel', last_name: 'Stagg' }
    };

    if (adminAccounts[lowerEmail]) {
      const acct = adminAccounts[lowerEmail];
      if (password === acct.password) {
        const token = generateToken({ id: 0, email: lowerEmail, role: 'admin' });
        return res.json({ success: true, token, user: { id: 0, email: lowerEmail, role: 'admin', first_name: acct.first_name, last_name: acct.last_name } });
      }
    }

    // Check community members
    const member = await models.VisionariumCommunityMember.findOne({ where: { email: lowerEmail } });
    if (member) {
      const valid = await bcrypt.compare(password, member.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      // Determine role based on tier
      let role = 'community';
      if (member.tier === 'fellow' || member.tier === 'alumni') role = 'fellow';

      const token = generateToken({ id: member.id, email: member.email, role, tier: member.tier });
      return res.json({
        success: true, token,
        user: { id: member.id, email: member.email, role, tier: member.tier, first_name: member.first_name, last_name: member.last_name }
      });
    }

    // Check mentors
    const mentor = await models.VisionariumMentor.findOne({ where: { email: lowerEmail } });
    if (mentor) {
      const valid = await bcrypt.compare(password, mentor.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = generateToken({ id: mentor.id, email: mentor.email, role: 'mentor' });
      return res.json({
        success: true, token,
        user: { id: mentor.id, email: mentor.email, role: 'mentor', first_name: mentor.first_name, last_name: mentor.last_name }
      });
    }

    // Check sponsors
    const sponsor = await models.VisionariumSponsor.findOne({ where: { email: lowerEmail } });
    if (sponsor) {
      const valid = await bcrypt.compare(password, sponsor.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = generateToken({ id: sponsor.id, email: sponsor.email, role: 'sponsor' });
      return res.json({
        success: true, token,
        user: { id: sponsor.id, email: sponsor.email, role: 'sponsor', company_name: sponsor.company_name, contact_name: sponsor.contact_name }
      });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Visionarium login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/auth/me -- Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    res.json({ success: true, user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
