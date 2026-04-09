// src/routes/hispatec-matching.js -- AI Matching Engine for HISPATEC
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
  try {
    req.member = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }
}

// Sector catalog for one-hot encoding
const SECTORS = [
  'tecnologia', 'logistica', 'agroindustria', 'energia', 'salud', 'educacion',
  'finanzas', 'construccion', 'manufactura', 'comercio', 'turismo', 'legal',
  'comunicacion', 'transporte', 'mineria', 'telecomunicaciones', 'inmobiliaria',
  'consultoria', 'alimentacion', 'defensa'
];

const MEMBERSHIP_SCORES = {
  'numerario': 0.4, 'protector': 0.6, 'patrono': 0.8, 'fundador': 1.0, 'honorifico': 0.9
};

// Build a numeric vector from a member profile
function buildVector(member) {
  const vec = [];

  // Sector one-hot (20 dims, weight 0.25)
  for (const s of SECTORS) {
    vec.push((member.sector || '').toLowerCase() === s ? 0.25 : 0);
  }

  // Region one-hot (6 dims, weight 0.10)
  for (let r = 1; r <= 6; r++) {
    vec.push(member.region_id === r ? 0.10 : 0);
  }

  // Experience normalized (1 dim, weight 0.10)
  vec.push(Math.min((member.years_experience || 0) / 30, 1) * 0.10);

  // Languages (4 dims: es, en, pt, fr, weight 0.05)
  const langs = member.languages || [];
  for (const l of ['es', 'en', 'pt', 'fr']) {
    vec.push(langs.includes(l) ? 0.05 / 4 : 0);
  }

  // Membership (1 dim, weight 0.05)
  vec.push((MEMBERSHIP_SCORES[member.membership_type] || 0.4) * 0.05);

  // Trust score (1 dim, weight 0.15)
  vec.push((parseFloat(member.trust_score) || 0.5) * 0.15);

  return vec;
}

// Cosine similarity
function cosineSim(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// POST /match -- AI-powered member matching
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { query_text, sector, region_id, country, limit = 10 } = req.body;

    // Build query vector from search criteria
    const queryProfile = {
      sector: sector || '',
      region_id: region_id ? parseInt(region_id) : null,
      years_experience: 10,
      languages: ['es', 'en'],
      membership_type: 'numerario',
      trust_score: 0.7
    };
    const queryVec = buildVector(queryProfile);

    // Get all active members (excluding requester)
    let whereClause = 'WHERE m.status = \'active\' AND m.id != :requesterId';
    const replacements = { requesterId: req.member.id };

    if (country) {
      whereClause += ' AND m.country = :country';
      replacements.country = country;
    }

    const members = await sequelize.query(`
      SELECT m.*, r.name as region_name, r.opportunity_count
      FROM hispatec_members m
      LEFT JOIN hispatec_regions r ON m.region_id = r.id
      ${whereClause}
    `, { replacements, type: QueryTypes.SELECT });

    // Calculate Gini corrections for regions
    const regions = await sequelize.query(
      'SELECT id, opportunity_count FROM hispatec_regions',
      { type: QueryTypes.SELECT }
    );
    const oppCounts = regions.map(r => r.opportunity_count || 0);
    const meanOpp = oppCounts.reduce((a, b) => a + b, 0) / (oppCounts.length || 1);
    const giniCorrections = {};
    for (const r of regions) {
      const opp = r.opportunity_count || 0;
      giniCorrections[r.id] = meanOpp > 0 ? 1 + 0.3 * ((meanOpp - opp) / meanOpp) : 1;
    }

    // Score each candidate
    const scored = members.map(m => {
      const memberVec = buildVector(m);
      const similarity = cosineSim(queryVec, memberVec);
      const trustFactor = parseFloat(m.trust_score) || 0.5;
      const giniFactor = giniCorrections[m.region_id] || 1;
      const finalScore = similarity * trustFactor * giniFactor;

      return {
        member_id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        company_name: m.company_name,
        sector: m.sector,
        country: m.country,
        region_name: m.region_name,
        years_experience: m.years_experience,
        trust_score: parseFloat(m.trust_score),
        membership_type: m.membership_type,
        similarity_score: Math.round(similarity * 1000) / 1000,
        gini_correction: Math.round(giniFactor * 1000) / 1000,
        final_score: Math.round(finalScore * 1000) / 1000
      };
    });

    // Sort by final score descending
    scored.sort((a, b) => b.final_score - a.final_score);
    const results = scored.slice(0, parseInt(limit));

    // Log the match
    await sequelize.query(`
      INSERT INTO hispatec_matches (query_vector, query_text, requester_id, results_json, gini_correction_applied)
      VALUES (:queryVector, :queryText, :requesterId, :results, :giniApplied)
    `, {
      replacements: {
        queryVector: JSON.stringify(queryVec),
        queryText: query_text || `sector:${sector} region:${region_id} country:${country}`,
        requesterId: req.member.id,
        results: JSON.stringify(results),
        giniApplied: meanOpp > 0
      }
    });

    res.json({
      success: true,
      data: {
        query: { sector, region_id, country, query_text },
        gini_corrections: giniCorrections,
        total_candidates: members.length,
        results
      }
    });
  } catch (error) {
    console.error('Matching error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /match/history -- Past matching requests
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const matches = await sequelize.query(`
      SELECT id, query_text, gini_correction_applied, created_at,
             jsonb_array_length(results_json) as result_count
      FROM hispatec_matches
      WHERE requester_id = :memberId
      ORDER BY created_at DESC
      LIMIT 20
    `, { replacements: { memberId: req.member.id }, type: QueryTypes.SELECT });

    res.json({ success: true, data: matches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
