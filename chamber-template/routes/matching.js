// Chamber Template - AI Matching Routes Factory
module.exports = function createMatchingRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const jwt = require('jsonwebtoken');
  const { Sequelize, QueryTypes } = require('sequelize');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;
  const SECTORS = config.sectors || [];
  const MEMBERSHIP_SCORES = config.membership_scores || {};

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try { req.member = jwt.verify(token, JWT_SECRET); req.member.id = req.member.member_id; next(); } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  function buildVector(member) {
    const vec = [];
    for (const s of SECTORS) vec.push((member.sector || '').toLowerCase() === s ? 0.25 : 0);
    const regionCount = (config.regions || []).length || 6;
    for (let r = 1; r <= regionCount; r++) vec.push(member.region_id === r ? 0.10 : 0);
    vec.push(Math.min((member.years_experience || 0) / 30, 1) * 0.10);
    const langs = member.languages || [];
    for (const l of ['en', 'fil', 'zh', 'es']) vec.push(langs.includes(l) ? 0.05 / 4 : 0);
    vec.push((MEMBERSHIP_SCORES[member.membership_type] || 0.4) * 0.05);
    vec.push((parseFloat(member.trust_score) || 0.5) * 0.15);
    return vec;
  }

  function cosineSim(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
    magA = Math.sqrt(magA); magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  // POST /
  router.post('/', authMiddleware, async (req, res) => {
    try {
      const { query_text, sector, region_id, country, limit = 10 } = req.body;
      const queryProfile = { sector: sector || '', region_id: region_id ? parseInt(region_id) : null, years_experience: 10, languages: ['en'], membership_type: Object.keys(MEMBERSHIP_SCORES)[0] || 'regular', trust_score: 0.7 };
      const queryVec = buildVector(queryProfile);

      let whereClause = `WHERE m.status = 'active' AND m.id != :requesterId`;
      const replacements = { requesterId: req.member.id };
      if (country) { whereClause += ' AND m.country = :country'; replacements.country = country; }

      const members = await sequelize.query(`SELECT m.*, r.name as region_name, r.opportunity_count FROM ${t}_members m LEFT JOIN ${t}_regions r ON m.region_id = r.id ${whereClause}`, { replacements, type: QueryTypes.SELECT });

      const regions = await sequelize.query(`SELECT id, opportunity_count FROM ${t}_regions`, { type: QueryTypes.SELECT });
      const oppCounts = regions.map(r => r.opportunity_count || 0);
      const meanOpp = oppCounts.reduce((a, b) => a + b, 0) / (oppCounts.length || 1);
      const giniCorrections = {};
      for (const r of regions) giniCorrections[r.id] = meanOpp > 0 ? 1 + 0.3 * ((meanOpp - (r.opportunity_count || 0)) / meanOpp) : 1;

      const scored = members.map(m => {
        const memberVec = buildVector(m);
        const similarity = cosineSim(queryVec, memberVec);
        const trustFactor = parseFloat(m.trust_score) || 0.5;
        const giniFactor = giniCorrections[m.region_id] || 1;
        return {
          member_id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email, company_name: m.company_name,
          sector: m.sector, country: m.country, region_name: m.region_name, years_experience: m.years_experience,
          trust_score: parseFloat(m.trust_score), membership_type: m.membership_type,
          similarity_score: Math.round(similarity * 1000) / 1000,
          gini_correction: Math.round(giniFactor * 1000) / 1000,
          final_score: Math.round(similarity * trustFactor * giniFactor * 1000) / 1000
        };
      });
      scored.sort((a, b) => b.final_score - a.final_score);
      const results = scored.slice(0, parseInt(limit));

      await sequelize.query(`INSERT INTO ${t}_matches (query_vector, query_text, requester_id, results_json, gini_correction_applied) VALUES (:queryVector, :queryText, :requesterId, :results, :giniApplied)`, {
        replacements: { queryVector: JSON.stringify(queryVec), queryText: query_text || `sector:${sector} region:${region_id} country:${country}`, requesterId: req.member.id, results: JSON.stringify(results), giniApplied: meanOpp > 0 }
      });

      res.json({ success: true, data: { query: { sector, region_id, country, query_text }, gini_corrections: giniCorrections, total_candidates: members.length, results } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /history
  router.get('/history', authMiddleware, async (req, res) => {
    try {
      const matches = await sequelize.query(`SELECT id, query_text, gini_correction_applied, created_at, jsonb_array_length(results_json) as result_count FROM ${t}_matches WHERE requester_id = :memberId ORDER BY created_at DESC LIMIT 20`, { replacements: { memberId: req.member.id }, type: QueryTypes.SELECT });
      res.json({ success: true, data: matches });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
