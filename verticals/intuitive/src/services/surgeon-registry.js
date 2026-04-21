'use strict';

/**
 * Surgeon Registry Service - SurgicalMind AI
 *
 * CRUD operations and fuzzy matching for the intuitive_surgeons table.
 * Used by the CSV ingester, survey system, and dashboard.
 *
 * Copyright 2026 Digit2AI / RinglyPro CRM
 */

const db = require('../../models');
const { Op } = require('sequelize');

const Surgeon = db.IntuitiveSurgeon;

// ---------------------------------------------------------------------------
// Find or create a surgeon within a project
// ---------------------------------------------------------------------------

async function findOrCreateSurgeon(projectId, { name, email, phone, specialty }) {
  try {
    if (!name) {
      return { surgeon: null, created: false, error: 'Surgeon name is required' };
    }

    // Try exact email match first (most reliable identifier)
    if (email) {
      const byEmail = await Surgeon.findOne({
        where: { project_id: projectId, email: email.toLowerCase().trim() }
      });
      if (byEmail) {
        return { surgeon: byEmail, created: false };
      }
    }

    // Try exact name match
    const byName = await Surgeon.findOne({
      where: {
        project_id: projectId,
        full_name: { [Op.iLike]: name.trim() }
      }
    });
    if (byName) {
      // Backfill email/phone if we now have them
      const updates = {};
      if (email && !byName.email) updates.email = email.toLowerCase().trim();
      if (phone && !byName.phone) updates.phone = phone.trim();
      if (specialty && !byName.specialty) updates.specialty = specialty.trim();
      if (Object.keys(updates).length > 0) {
        await byName.update(updates);
      }
      return { surgeon: byName, created: false };
    }

    // Create new
    const surgeon = await Surgeon.create({
      project_id: projectId,
      full_name: name.trim(),
      email: email ? email.toLowerCase().trim() : null,
      phone: phone ? phone.trim() : null,
      specialty: specialty ? specialty.trim() : null
    });

    return { surgeon, created: true };
  } catch (err) {
    console.error('[SurgeonRegistry] findOrCreateSurgeon error:', err.message || err);
    return { surgeon: null, created: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// List surgeons for a project
// ---------------------------------------------------------------------------

async function listSurgeons(projectId, options = {}) {
  try {
    const where = { project_id: projectId };
    if (options.specialty) {
      where.specialty = { [Op.iLike]: `%${options.specialty}%` };
    }

    const surgeons = await Surgeon.findAll({
      where,
      order: [['full_name', 'ASC']],
      limit: options.limit || 500,
      offset: options.offset || 0
    });

    return { surgeons, count: surgeons.length };
  } catch (err) {
    console.error('[SurgeonRegistry] listSurgeons error:', err.message || err);
    return { surgeons: [], count: 0, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Update a surgeon record
// ---------------------------------------------------------------------------

async function updateSurgeon(id, updates) {
  try {
    const surgeon = await Surgeon.findByPk(id);
    if (!surgeon) {
      return { surgeon: null, error: 'Surgeon not found' };
    }

    // Sanitize updates -- only allow known fields
    const allowed = [
      'full_name', 'email', 'phone', 'specialty', 'primary_hospital',
      'currently_credentialed_robotic', 'current_annual_volume',
      'competitive_hospitals', 'notes'
    ];
    const clean = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        clean[key] = updates[key];
      }
    }

    if (clean.email) clean.email = clean.email.toLowerCase().trim();

    await surgeon.update(clean);
    return { surgeon };
  } catch (err) {
    console.error('[SurgeonRegistry] updateSurgeon error:', err.message || err);
    return { surgeon: null, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Fuzzy match a surgeon by name within a project (for CSV import)
// ---------------------------------------------------------------------------

async function matchSurgeonByName(projectId, name) {
  try {
    if (!name || !name.trim()) {
      return { surgeon: null, confidence: 0 };
    }

    const cleanName = name.trim();

    // 1. Exact match (case-insensitive)
    const exact = await Surgeon.findOne({
      where: { project_id: projectId, full_name: { [Op.iLike]: cleanName } }
    });
    if (exact) {
      return { surgeon: exact, confidence: 1.0 };
    }

    // 2. Contains match -- name is substring or vice versa
    const allSurgeons = await Surgeon.findAll({ where: { project_id: projectId } });
    const lowerInput = cleanName.toLowerCase();

    // Strip common prefixes for matching
    const normalize = (n) => n.toLowerCase()
      .replace(/^dr\.?\s*/i, '')
      .replace(/^doctor\s*/i, '')
      .replace(/,\s*(md|do|phd|facs|frcs)\.?/gi, '')
      .replace(/\s+(md|do|phd|facs|frcs)\.?$/gi, '')
      .trim();

    const normalizedInput = normalize(cleanName);

    let bestMatch = null;
    let bestScore = 0;

    for (const s of allSurgeons) {
      const normalizedDb = normalize(s.full_name);

      // Exact after normalization
      if (normalizedDb === normalizedInput) {
        return { surgeon: s, confidence: 0.95 };
      }

      // One contains the other
      if (normalizedDb.includes(normalizedInput) || normalizedInput.includes(normalizedDb)) {
        const longer = Math.max(normalizedDb.length, normalizedInput.length);
        const shorter = Math.min(normalizedDb.length, normalizedInput.length);
        const score = shorter / longer;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = s;
        }
        continue;
      }

      // Token overlap (last name match is strong)
      const inputTokens = normalizedInput.split(/\s+/);
      const dbTokens = normalizedDb.split(/\s+/);
      const inputLast = inputTokens[inputTokens.length - 1];
      const dbLast = dbTokens[dbTokens.length - 1];

      if (inputLast === dbLast && inputLast.length >= 3) {
        // Last names match -- check first initial
        const inputFirst = inputTokens[0] || '';
        const dbFirst = dbTokens[0] || '';
        if (inputFirst[0] === dbFirst[0]) {
          const score = 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = s;
          }
        } else {
          const score = 0.6;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = s;
          }
        }
      }
    }

    // Only return if confidence is above threshold
    if (bestMatch && bestScore >= 0.5) {
      return { surgeon: bestMatch, confidence: bestScore };
    }

    return { surgeon: null, confidence: 0 };
  } catch (err) {
    console.error('[SurgeonRegistry] matchSurgeonByName error:', err.message || err);
    return { surgeon: null, confidence: 0, error: err.message || String(err) };
  }
}

module.exports = {
  findOrCreateSurgeon,
  listSurgeons,
  updateSurgeon,
  matchSurgeonByName
};
