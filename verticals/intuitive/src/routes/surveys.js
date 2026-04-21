'use strict';
const router = require('express').Router();

// POST /api/v1/surveys - Create a survey
router.post('/', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveProject } = req.models;
    const { project_id, business_plan_id, title, hospital_name, system_type,
            distribution_method, questions, welcome_message, thank_you_message, closes_at } = req.body;

    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    const project = await IntuitiveProject.findByPk(project_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const survey = await IntuitiveSurvey.create({
      project_id,
      business_plan_id: business_plan_id || null,
      title,
      hospital_name: hospital_name || project.hospital_name,
      system_type: system_type || null,
      distribution_method: distribution_method || 'email',
      questions: questions || undefined, // use default if not provided
      welcome_message, thank_you_message,
      closes_at: closes_at || null
    });

    res.status(201).json({ success: true, data: survey });
  } catch (err) {
    console.error('Survey create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/surveys - List surveys
router.get('/', async (req, res) => {
  try {
    const { IntuitiveSurvey } = req.models;
    const where = {};
    if (req.query.project_id) where.project_id = parseInt(req.query.project_id);
    if (req.query.business_plan_id) where.business_plan_id = parseInt(req.query.business_plan_id);

    const surveys = await IntuitiveSurvey.findAll({ where, order: [['created_at', 'DESC']], limit: 50 });
    res.json({ success: true, data: surveys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/surveys/:id - Get survey with recipients + responses
router.get('/:id', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyRecipient, IntuitiveSurveyResponse } = req.models;
    const survey = await IntuitiveSurvey.findByPk(req.params.id, {
      include: [
        { model: IntuitiveSurveyRecipient, as: 'recipients' },
        { model: IntuitiveSurveyResponse, as: 'responses' }
      ]
    });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json({ success: true, data: survey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/surveys/:id/recipients - Add surgeon recipients (bulk)
router.post('/:id/recipients', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyRecipient } = req.models;
    const survey = await IntuitiveSurvey.findByPk(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const { recipients } = req.body; // Array of { surgeon_name, surgeon_email, surgeon_phone, surgeon_specialty }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients array is required' });
    }

    const created = [];
    for (const r of recipients) {
      if (!r.surgeon_name) continue;
      const recipient = await IntuitiveSurveyRecipient.create({
        survey_id: survey.id,
        surgeon_name: r.surgeon_name,
        surgeon_email: r.surgeon_email || null,
        surgeon_phone: r.surgeon_phone || null,
        surgeon_specialty: r.surgeon_specialty || null
      });
      created.push(recipient);
    }

    res.status(201).json({ success: true, data: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/surveys/:id/send - Distribute survey via email/sms/voice/link
router.post('/:id/send', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyRecipient } = req.models;
    const survey = await IntuitiveSurvey.findByPk(req.params.id, {
      include: [{ model: IntuitiveSurveyRecipient, as: 'recipients' }]
    });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const channel = req.body.channel || survey.distribution_method || 'link';
    const surgeonIds = req.body.surgeon_ids; // optional: only send to specific recipients

    await survey.update({ status: 'active' });

    let distribution;
    try { distribution = require('../services/survey-distribution'); } catch (e) {}

    const baseUrl = process.env.SURGICALMIND_BASE_URL || `${req.protocol}://${req.get('host')}/intuitive`;
    const links = [];
    const sendResults = [];

    const recipientsToSend = surgeonIds
      ? survey.recipients.filter(r => surgeonIds.includes(r.id))
      : survey.recipients;

    for (const recipient of recipientsToSend) {
      const link = `${baseUrl}/survey/${recipient.personal_token}`;

      // Try distributing via the requested channel
      let sendResult = { channel: 'link', success: true, message: 'Link generated (manual distribution)' };

      if (distribution && channel !== 'link') {
        try {
          sendResult = await distribution.distributeToRecipient(survey, recipient, channel);
        } catch (e) {
          sendResult = { channel, success: false, error: e.message };
        }
      }

      await recipient.update({ status: sendResult.success ? 'sent' : 'pending', sent_at: sendResult.success ? new Date() : null });

      links.push({
        surgeon_name: recipient.surgeon_name,
        surgeon_email: recipient.surgeon_email,
        survey_link: link,
        personal_token: recipient.personal_token,
        distribution: sendResult
      });
      sendResults.push(sendResult);
    }

    const successCount = sendResults.filter(r => r.success).length;
    await survey.update({ sent_count: successCount });

    // Also provide the general survey link
    const generalLink = `${baseUrl}/${survey.survey_url_token}`;

    res.json({
      success: true,
      data: {
        survey_id: survey.id,
        status: 'active',
        general_link: generalLink,
        recipient_links: links,
        total_sent: links.length,
        note: 'Links generated. Distribute via email/SMS manually or integrate with SendGrid/Twilio.'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/surveys/:id/responses
router.get('/:id/responses', async (req, res) => {
  try {
    const { IntuitiveSurveyResponse } = req.models;
    const responses = await IntuitiveSurveyResponse.findAll({
      where: { survey_id: req.params.id },
      order: [['completed_at', 'DESC']]
    });
    res.json({ success: true, data: responses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/surveys/:id/import-to-plan - Import responses as surgeon commitments
router.post('/:id/import-to-plan', async (req, res) => {
  try {
    const { IntuitiveSurvey, IntuitiveSurveyResponse, IntuitiveSurgeonCommitment, IntuitiveBusinessPlan } = req.models;
    const survey = await IntuitiveSurvey.findByPk(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const businessPlanId = req.body.business_plan_id || survey.business_plan_id;
    if (!businessPlanId) return res.status(400).json({ error: 'business_plan_id required' });

    const plan = await IntuitiveBusinessPlan.findByPk(businessPlanId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const responses = await IntuitiveSurveyResponse.findAll({
      where: { survey_id: survey.id }
    });

    let drgLib;
    try { drgLib = require('../services/drg-reimbursement'); } catch (e) { drgLib = null; }

    const imported = [];
    for (const resp of responses) {
      // Build procedure entries from the breakdown
      const procs = (resp.procedure_breakdown || []).map(pb => {
        const monthlyCases = Math.round((resp.incremental_cases_monthly || 0) * (pb.percentage || 0) / 100);
        let reimbursement = 0;
        if (drgLib && pb.procedure_type) {
          const drgEntry = drgLib.lookupByProcedure(pb.procedure_type);
          if (drgEntry) reimbursement = drgEntry.avg_blended_rate;
        }
        return {
          procedure_type: pb.procedure_type || 'unknown',
          procedure_name: pb.procedure_name || pb.procedure_type || 'Unknown',
          incremental_cases_monthly: monthlyCases,
          incremental_cases_annual: monthlyCases * 12,
          reimbursement_rate: reimbursement,
          competitive_leakage_cases: 0
        };
      });

      let totalAnnual = procs.reduce((s, p) => s + (p.incremental_cases_annual || 0), 0);
      if (totalAnnual === 0 && resp.incremental_cases_monthly) {
        totalAnnual = resp.incremental_cases_monthly * 12;
      }
      const totalRevenue = procs.reduce((s, p) => s + (p.incremental_cases_annual || 0) * (p.reimbursement_rate || 0), 0);

      const commitment = await IntuitiveSurgeonCommitment.create({
        business_plan_id: businessPlanId,
        project_id: plan.project_id,
        surgeon_name: resp.surgeon_name,
        surgeon_email: resp.surgeon_email,
        surgeon_specialty: resp.surgeon_specialty,
        procedures: procs,
        total_incremental_annual: totalAnnual,
        total_revenue_impact: totalRevenue,
        source: 'survey',
        survey_response_id: resp.id,
        status: resp.willing_to_commit ? 'confirmed' : 'draft',
        confirmed_at: resp.willing_to_commit ? new Date() : null
      });
      imported.push(commitment);
    }

    res.json({ success: true, data: imported, count: imported.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/surveys/:id - Update survey
router.patch('/:id', async (req, res) => {
  try {
    const { IntuitiveSurvey } = req.models;
    const survey = await IntuitiveSurvey.findByPk(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const allowed = ['title', 'status', 'distribution_method', 'questions', 'welcome_message', 'thank_you_message', 'closes_at'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    await survey.update(updates);
    res.json({ success: true, data: survey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/surveys/voice-webhook - ElevenLabs posts transcript + structured data
router.post('/voice-webhook', async (req, res) => {
  try {
    const { IntuitiveSurveyResponse, IntuitiveSurveyRecipient } = req.models;
    const { response_code, transcript, structured_answers, call_sid } = req.body;

    if (!response_code && !call_sid) {
      return res.status(400).json({ error: 'response_code or call_sid required' });
    }

    // Find the recipient by response code or call reference
    let recipient = null;
    if (response_code) {
      recipient = await IntuitiveSurveyRecipient.findOne({ where: { personal_token: response_code } });
    }

    if (!recipient) {
      // Log the webhook data even if we can't match a recipient
      console.log('[Voice Webhook] Unmatched call:', { call_sid, response_code, transcript: (transcript || '').substring(0, 200) });
      return res.json({ success: true, message: 'Webhook received, recipient not matched' });
    }

    // Parse structured answers if available
    const answers = structured_answers || {};
    const commitments = answers.incremental_commitments || [];

    // Create or update the survey response
    const [response, created] = await IntuitiveSurveyResponse.findOrCreate({
      where: { survey_id: recipient.survey_id, recipient_id: recipient.id },
      defaults: {
        surgeon_name: recipient.surgeon_name,
        surgeon_email: recipient.surgeon_email,
        surgeon_specialty: recipient.surgeon_specialty,
        answers: answers,
        incremental_cases_monthly: answers.incremental_cases_monthly || commitments.reduce((s, c) => s + (c.cases || 0), 0),
        procedure_breakdown: commitments,
        barriers: answers.barriers || transcript || '',
        competitive_leakage_cases: answers.competitive_volume_lost || 0,
        willing_to_commit: answers.willing_to_commit || false,
        additional_comments: transcript || '',
        completed_via: 'voice',
        completed_at: new Date()
      }
    });

    if (!created) {
      await response.update({
        answers, additional_comments: transcript || '',
        completed_via: 'voice', completed_at: new Date()
      });
    }

    await recipient.update({ status: 'completed', completed_at: new Date() });

    // Increment survey response count
    const { IntuitiveSurvey } = req.models;
    await IntuitiveSurvey.increment('response_count', { where: { id: recipient.survey_id } });

    res.json({ success: true, message: 'Voice survey response recorded' });
  } catch (err) {
    console.error('[Voice Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
