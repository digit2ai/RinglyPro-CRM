'use strict';

// Ronin Brotherhood → KanchoAI Bridge
// Links Ronin members to KanchoAI schools and provides federation-level views

const express = require('express');
const router = express.Router();
const { authenticateMember } = require('../middleware/auth');

let roninModels, kanchoModels;
try { roninModels = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }
try { kanchoModels = require('../../../kancho-ai/models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// POST /register-dojo - Register a Ronin member's dojo with KanchoAI
// This creates a KanchoAI school linked to the Ronin member
router.post('/register-dojo', authenticateMember, async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'KanchoAI not available' });

  try {
    const member = await roninModels.RoninMember.findByPk(req.memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    // Check if member already has a linked dojo
    if (member.kancho_school_id) {
      const existingSchool = await kanchoModels.KanchoSchool.findByPk(member.kancho_school_id);
      if (existingSchool) {
        return res.status(409).json({ success: false, error: 'You already have a registered dojo', data: existingSchool });
      }
    }

    const {
      dojoName, martialArtType, address, city, state, zip, country, timezone,
      monthlyRevenueTarget, studentCapacity, website
    } = req.body;

    if (!dojoName) {
      return res.status(400).json({ success: false, error: 'Dojo name is required' });
    }

    // Determine martial art from member's styles or group
    const artType = martialArtType || (member.styles?.length > 0 ? member.styles[0] : 'Karate');

    // Create KanchoAI school
    const school = await kanchoModels.KanchoSchool.create({
      tenant_id: 1,
      name: dojoName,
      owner_name: `${member.first_name} ${member.last_name}`,
      owner_email: member.email,
      owner_phone: member.phone || '',
      address: address || member.dojo_address || null,
      city: city || member.city || null,
      state: state || member.state || null,
      zip: zip || null,
      country: country || member.country || 'USA',
      timezone: timezone || 'America/New_York',
      martial_art_type: artType,
      plan_type: 'starter',
      monthly_revenue_target: monthlyRevenueTarget || 0,
      student_capacity: studentCapacity || 100,
      website: website || null,
      ai_enabled: true,
      voice_agent: 'kancho',
      status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ronin_member_id: member.id
    });

    // Link member to school
    await member.update({ kancho_school_id: school.id });

    console.log(`Ronin→Kancho Bridge: Member ${member.id} (${member.email}) linked to KanchoSchool ${school.id}`);

    res.status(201).json({
      success: true,
      message: 'Your dojo has been registered with KanchoAI',
      data: {
        school: {
          id: school.id,
          name: school.name,
          martialArtType: school.martial_art_type,
          status: school.status,
          voiceAgent: school.voice_agent,
          trialEndsAt: school.trial_ends_at
        },
        member: {
          id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          rank: member.rank,
          kanchoSchoolId: school.id
        }
      }
    });
  } catch (error) {
    console.error('Ronin→Kancho register-dojo error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /my-dojo - Get the member's linked KanchoAI school with health data
router.get('/my-dojo', authenticateMember, async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'KanchoAI not available' });

  try {
    const member = await roninModels.RoninMember.findByPk(req.memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    if (!member.kancho_school_id) {
      return res.json({ success: true, data: null, message: 'No dojo registered. Use POST /register-dojo to connect your dojo to KanchoAI.' });
    }

    const school = await kanchoModels.KanchoSchool.findByPk(member.kancho_school_id);
    if (!school) return res.json({ success: true, data: null, message: 'Linked school not found' });

    // Get health score and recent metrics
    let healthScore = null, recentMetrics = null;
    try {
      healthScore = await kanchoModels.KanchoHealthScore.findOne({
        where: { school_id: school.id },
        order: [['created_at', 'DESC']]
      });
      recentMetrics = await kanchoModels.KanchoBusinessHealthMetrics.findOne({
        where: { school_id: school.id },
        order: [['created_at', 'DESC']]
      });
    } catch (e) {}

    // Get counts
    let studentCount = 0, leadCount = 0, atRiskCount = 0;
    try {
      [studentCount, leadCount, atRiskCount] = await Promise.all([
        kanchoModels.KanchoStudent.count({ where: { school_id: school.id, status: 'active' } }),
        kanchoModels.KanchoLead.count({ where: { school_id: school.id, status: { [require('sequelize').Op.notIn]: ['converted', 'lost'] } } }),
        kanchoModels.KanchoStudent.count({ where: { school_id: school.id, status: 'active', churn_risk: { [require('sequelize').Op.in]: ['high', 'critical'] } } })
      ]);
    } catch (e) {}

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.name,
          martialArtType: school.martial_art_type,
          activeStudents: studentCount,
          studentCapacity: school.student_capacity,
          voiceAgent: school.voice_agent,
          status: school.status
        },
        health: healthScore ? {
          overallScore: healthScore.overall_score,
          grade: healthScore.grade,
          retention: healthScore.retention_score,
          revenue: healthScore.revenue_score,
          leads: healthScore.lead_score,
          date: healthScore.date
        } : null,
        metrics: recentMetrics ? {
          churnRate: recentMetrics.churn_rate,
          arps: recentMetrics.arps,
          trialConversion: recentMetrics.trial_conversion_rate,
          monthlyRevenue: recentMetrics.monthly_revenue,
          revenueAtRisk: recentMetrics.revenue_at_risk,
          healthGrade: recentMetrics.health_grade
        } : null,
        counts: { students: studentCount, leads: leadCount, atRisk: atRiskCount }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /federation-overview - Admin view: all Ronin member dojos with KanchoAI health
router.get('/federation-overview', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'KanchoAI not available' });

  try {
    // Find all Ronin members who have linked KanchoAI schools
    const members = await roninModels.RoninMember.findAll({
      where: { tenant_id: 1, kancho_school_id: { [require('sequelize').Op.not]: null } },
      attributes: ['id', 'first_name', 'last_name', 'email', 'rank', 'dan_level', 'country', 'dojo_name', 'kancho_school_id'],
      order: [['first_name', 'ASC']]
    });

    // Get health scores for all linked schools
    const schoolIds = members.map(m => m.kancho_school_id).filter(Boolean);
    const schools = schoolIds.length > 0 ? await kanchoModels.KanchoSchool.findAll({
      where: { id: { [require('sequelize').Op.in]: schoolIds } },
      attributes: ['id', 'name', 'martial_art_type', 'active_students', 'status', 'voice_agent']
    }) : [];

    const healthScores = schoolIds.length > 0 ? await kanchoModels.sequelize.query(`
      SELECT DISTINCT ON (school_id) school_id, overall_score, grade, date
      FROM kancho_health_scores
      WHERE school_id IN (:schoolIds)
      ORDER BY school_id, created_at DESC
    `, {
      replacements: { schoolIds },
      type: require('sequelize').QueryTypes.SELECT
    }) : [];

    // Build federation map
    const schoolMap = {};
    schools.forEach(s => { schoolMap[s.id] = s; });
    const healthMap = {};
    healthScores.forEach(h => { healthMap[h.school_id] = h; });

    const dojos = members.map(m => ({
      member: {
        id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        rank: m.rank,
        danLevel: m.dan_level,
        country: m.country
      },
      school: schoolMap[m.kancho_school_id] ? {
        id: schoolMap[m.kancho_school_id].id,
        name: schoolMap[m.kancho_school_id].name,
        martialArt: schoolMap[m.kancho_school_id].martial_art_type,
        activeStudents: schoolMap[m.kancho_school_id].active_students,
        status: schoolMap[m.kancho_school_id].status
      } : null,
      health: healthMap[m.kancho_school_id] ? {
        score: healthMap[m.kancho_school_id].overall_score,
        grade: healthMap[m.kancho_school_id].grade,
        date: healthMap[m.kancho_school_id].date
      } : null
    }));

    // Summary stats
    const grades = healthScores.map(h => h.grade).filter(Boolean);
    const avgScore = healthScores.length > 0
      ? Math.round(healthScores.reduce((sum, h) => sum + (h.overall_score || 0), 0) / healthScores.length)
      : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalDojos: dojos.length,
          averageHealthScore: avgScore,
          gradesDistribution: {
            A: grades.filter(g => g === 'A').length,
            B: grades.filter(g => g === 'B').length,
            C: grades.filter(g => g === 'C').length,
            D: grades.filter(g => g === 'D').length,
            F: grades.filter(g => g === 'F').length
          }
        },
        dojos
      }
    });
  } catch (error) {
    console.error('Federation overview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
