'use strict';
const router = require('express').Router();

// GET /api/v1/dashboard/overview - Full pipeline overview for all hospitals
router.get('/overview', async (req, res) => {
  try {
    const { IntuitiveProject, IntuitiveBusinessPlan, IntuitiveSurvey,
            IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome,
            IntuitivePlanActual, IntuitiveAnalysisResult,
            IntuitiveSystemRecommendation } = req.models;

    // Get all projects with related data counts
    const projects = await IntuitiveProject.findAll({
      order: [['updated_at', 'DESC']],
      limit: 100
    });

    const hospitals = [];
    let pendingActionsTotal = 0;
    let activeSurveys = 0;
    let plansTracking = 0;
    const recentActivity = [];

    for (const project of projects) {
      const pid = project.id;

      // Get analysis results count
      const analysisCount = await IntuitiveAnalysisResult.count({ where: { project_id: pid } });

      // Get system recommendation
      let sysRec = null;
      try {
        const rec = await IntuitiveSystemRecommendation.findOne({
          where: { project_id: pid, is_primary: true }
        });
        if (rec) sysRec = { model: rec.system_model, score: Math.round(rec.fit_score || 0) };
      } catch (e) {}

      // Get business plan
      let planData = null;
      try {
        const plan = await IntuitiveBusinessPlan.findOne({
          where: { project_id: pid },
          order: [['created_at', 'DESC']]
        });
        if (plan) {
          planData = {
            id: plan.id,
            status: plan.status,
            total_roi: parseFloat(plan.total_combined_roi) || 0,
            incremental_cases: plan.total_incremental_cases_annual || 0
          };
          if (plan.status === 'tracking') plansTracking++;

          // Get surgeon commitment count
          const surgeonCount = await IntuitiveSurgeonCommitment.count({ where: { business_plan_id: plan.id } });
          planData.surgeon_count = surgeonCount;

          // Get clinical outcome
          const outcome = await IntuitiveClinicalOutcome.findOne({ where: { business_plan_id: plan.id } });
          planData.has_dollarization = !!outcome;
          planData.clinical_savings = outcome ? parseFloat(outcome.total_clinical_savings_annual) || 0 : 0;

          // Get actuals count
          const actualsCount = await IntuitivePlanActual.count({ where: { business_plan_id: plan.id } });
          planData.actuals_count = actualsCount;
        }
      } catch (e) {}

      // Get survey status
      let surveyStatus = null;
      try {
        const survey = await IntuitiveSurvey.findOne({
          where: { project_id: pid },
          order: [['created_at', 'DESC']]
        });
        if (survey) {
          surveyStatus = {
            id: survey.id,
            status: survey.status,
            total_sent: survey.sent_count || 0,
            responses: survey.response_count || 0
          };
          if (survey.status === 'active' && (survey.response_count || 0) < (survey.sent_count || 0)) {
            activeSurveys++;
          }
        }
      } catch (e) {}

      // Derive pipeline stage
      let pipelineStage = 'Intake';
      if (analysisCount > 0 && !planData) pipelineStage = 'Analyzed';
      else if (planData && planData.status === 'draft') pipelineStage = 'Planning';
      else if (planData && planData.status === 'finalized') pipelineStage = 'Finalized';
      else if (planData && (planData.status === 'tracking' || planData.actuals_count > 0)) pipelineStage = 'Tracking';

      // Derive pending actions
      const pendingActions = [];
      if (analysisCount === 0) pendingActions.push('Run Analysis');
      if (analysisCount > 0 && !planData) pendingActions.push('Create Business Plan');
      if (planData && !surveyStatus) pendingActions.push('Send Surgeon Survey');
      if (surveyStatus && surveyStatus.status === 'active' && surveyStatus.responses < surveyStatus.total_sent) {
        pendingActions.push('Collect Survey Responses (' + surveyStatus.responses + '/' + surveyStatus.total_sent + ')');
      }
      if (planData && !planData.has_dollarization) pendingActions.push('Run Dollarization');
      if (planData && planData.status === 'draft' && planData.surgeon_count > 0) pendingActions.push('Finalize Plan');
      if (planData && planData.status === 'finalized' && planData.actuals_count === 0) pendingActions.push('Import Actuals');
      if (planData && planData.actuals_count > 0) pendingActions.push('Review Variance');

      pendingActionsTotal += pendingActions.length;

      hospitals.push({
        id: pid,
        hospital_name: project.hospital_name,
        project_code: project.project_code,
        state: project.state,
        hospital_type: project.hospital_type,
        bed_count: project.bed_count,
        annual_surgical_volume: project.annual_surgical_volume,
        status: project.status,
        pipeline_stage: pipelineStage,
        system_recommendation: sysRec,
        survey_status: surveyStatus,
        business_plan: planData,
        pending_actions: pendingActions,
        last_updated: project.updated_at,
        created_at: project.created_at
      });

      // Add to recent activity
      recentActivity.push({
        hospital_name: project.hospital_name,
        project_id: pid,
        action: pipelineStage === 'Intake' ? 'Project created' :
                pipelineStage === 'Analyzed' ? 'Analysis completed' :
                pipelineStage === 'Planning' ? 'Business plan in progress' :
                pipelineStage === 'Finalized' ? 'Plan finalized' :
                'Tracking actuals',
        timestamp: project.updated_at
      });
    }

    // Sort recent activity by timestamp
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: {
        summary: {
          total_hospitals: projects.length,
          pending_actions: pendingActionsTotal,
          active_surveys: activeSurveys,
          plans_tracking: plansTracking
        },
        hospitals,
        recent_activity: recentActivity.slice(0, 10)
      }
    });
  } catch (err) {
    console.error('Dashboard overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
