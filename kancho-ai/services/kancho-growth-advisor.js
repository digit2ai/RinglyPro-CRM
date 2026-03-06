// kancho-ai/services/kancho-growth-advisor.js
// AI Growth Advisor - analyzes school data and generates strategic recommendations

'use strict';

const { Op } = require('sequelize');

class KanchoGrowthAdvisor {
  constructor(models) {
    this.models = models;
  }

  async generateInsights(schoolId) {
    const school = await this.models.KanchoSchool.findByPk(schoolId);
    if (!school) return { insights: [], score: 0 };

    // Gather all data points in parallel
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const todayStr = today.toISOString().split('T')[0];

    const [
      activeStudents,
      cancelledRecent,
      newStudentsThisMonth,
      newStudentsLastMonth,
      atRiskStudents,
      hotLeads,
      totalLeads,
      convertedLeads,
      trialScheduled,
      revenueThisMonth,
      revenueLastMonth,
      activeSubscriptions,
      pastDueSubs,
      upcomingAppointments,
      attendanceRecent,
      totalClasses,
      automationsActive,
      openTasks,
      recentCalls
    ] = await Promise.all([
      this.models.KanchoStudent.count({ where: { school_id: schoolId, status: 'active' } }),
      this.models.KanchoStudent.count({ where: { school_id: schoolId, status: 'cancelled', updated_at: { [Op.gte]: thirtyDaysAgo } } }),
      this.models.KanchoStudent.count({ where: { school_id: schoolId, status: 'active', created_at: { [Op.gte]: thirtyDaysAgo } } }),
      this.models.KanchoStudent.count({ where: { school_id: schoolId, status: 'active', created_at: { [Op.between]: [sixtyDaysAgo, thirtyDaysAgo] } } }),
      this.models.KanchoStudent.count({ where: { school_id: schoolId, churn_risk: { [Op.in]: ['high', 'critical'] } } }),
      this.models.KanchoLead.count({ where: { school_id: schoolId, temperature: 'hot', status: { [Op.notIn]: ['converted', 'lost'] } } }),
      this.models.KanchoLead.count({ where: { school_id: schoolId, created_at: { [Op.gte]: thirtyDaysAgo } } }),
      this.models.KanchoLead.count({ where: { school_id: schoolId, status: 'converted', conversion_date: { [Op.gte]: thirtyDaysAgo } } }),
      this.models.KanchoLead.count({ where: { school_id: schoolId, status: 'trial_scheduled' } }),
      this.models.KanchoPayment.sum('total', { where: { school_id: schoolId, status: 'completed', payment_date: { [Op.gte]: thirtyDaysAgo.toISOString().split('T')[0] } } }).then(v => v || 0),
      this.models.KanchoPayment.sum('total', { where: { school_id: schoolId, status: 'completed', payment_date: { [Op.between]: [sixtyDaysAgo.toISOString().split('T')[0], thirtyDaysAgo.toISOString().split('T')[0]] } } }).then(v => v || 0),
      this.models.KanchoSubscription.count({ where: { school_id: schoolId, status: 'active' } }),
      this.models.KanchoSubscription.count({ where: { school_id: schoolId, status: 'past_due' } }),
      this.models.KanchoAppointment.count({ where: { school_id: schoolId, appointment_date: { [Op.gte]: todayStr }, status: { [Op.ne]: 'cancelled' } } }),
      this.models.KanchoAttendance.count({ where: { school_id: schoolId, date: { [Op.gte]: thirtyDaysAgo.toISOString().split('T')[0] } } }),
      this.models.KanchoClass.count({ where: { school_id: schoolId, is_active: true } }),
      this.models.KanchoAutomation.count({ where: { school_id: schoolId, is_active: true } }),
      this.models.KanchoTask.count({ where: { school_id: schoolId, status: { [Op.notIn]: ['completed', 'cancelled'] } } }),
      this.models.KanchoAiCall.count({ where: { school_id: schoolId, created_at: { [Op.gte]: thirtyDaysAgo } } })
    ]);

    // Calculate metrics
    const churnRate = activeStudents > 0 ? Math.round((cancelledRecent / (activeStudents + cancelledRecent)) * 100) : 0;
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
    const revenueGrowth = revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0;
    const studentGrowth = newStudentsLastMonth > 0 ? Math.round(((newStudentsThisMonth - newStudentsLastMonth) / newStudentsLastMonth) * 100) : 0;
    const arps = activeStudents > 0 ? Math.round(revenueThisMonth / activeStudents) : 0;
    const capacity = school.student_capacity > 0 ? Math.round((activeStudents / school.student_capacity) * 100) : 0;

    // Generate insights
    const insights = [];

    // Revenue insights
    if (revenueGrowth > 10) {
      insights.push({ category: 'revenue', type: 'positive', priority: 'info', title: 'Revenue Growing', message: `Revenue is up ${revenueGrowth}% vs last month. Keep momentum with upsells and premium programs.`, metric: revenueGrowth + '%' });
    } else if (revenueGrowth < -10) {
      insights.push({ category: 'revenue', type: 'warning', priority: 'high', title: 'Revenue Declining', message: `Revenue dropped ${Math.abs(revenueGrowth)}% vs last month. Focus on retention and reducing past-due accounts.`, metric: revenueGrowth + '%', action: 'Review past-due subscriptions and run win-back campaigns' });
    }

    if (pastDueSubs > 0) {
      const atRiskRevenue = pastDueSubs * arps;
      insights.push({ category: 'revenue', type: 'alert', priority: 'urgent', title: `${pastDueSubs} Past-Due Subscription${pastDueSubs > 1 ? 's' : ''}`, message: `~$${atRiskRevenue} at risk. Enable payment reminder automation or contact these members directly.`, metric: '$' + atRiskRevenue, action: 'Activate payment_reminder automation' });
    }

    // Retention insights
    if (churnRate > 10) {
      insights.push({ category: 'retention', type: 'warning', priority: 'high', title: 'High Churn Rate', message: `${churnRate}% churn rate this month. Industry average is 5-8%. Focus on engagement and early intervention.`, metric: churnRate + '%', action: 'Enable retention automation and review at-risk student list' });
    } else if (churnRate <= 3 && activeStudents > 10) {
      insights.push({ category: 'retention', type: 'positive', priority: 'info', title: 'Excellent Retention', message: `Only ${churnRate}% churn this month. Your students are highly engaged!`, metric: churnRate + '%' });
    }

    if (atRiskStudents > 0) {
      insights.push({ category: 'retention', type: 'alert', priority: 'high', title: `${atRiskStudents} At-Risk Student${atRiskStudents > 1 ? 's' : ''}`, message: `These students show declining attendance or engagement. Personal outreach can prevent cancellations.`, metric: atRiskStudents, action: 'Review at-risk students in the Students tab' });
    }

    // Lead insights
    if (hotLeads > 0) {
      insights.push({ category: 'leads', type: 'opportunity', priority: 'urgent', title: `${hotLeads} Hot Lead${hotLeads > 1 ? 's' : ''} Ready to Convert`, message: `These leads scored high and are ready for a trial class. Contact them today before they cool off.`, metric: hotLeads, action: 'Call hot leads or enable lead_followup automation' });
    }

    if (conversionRate < 20 && totalLeads > 5) {
      insights.push({ category: 'leads', type: 'warning', priority: 'medium', title: 'Low Lead Conversion', message: `Only ${conversionRate}% of leads converted this month. Industry target is 25-35%. Improve follow-up speed and trial experience.`, metric: conversionRate + '%', action: 'Enable lead_followup and trial_booking automations' });
    } else if (conversionRate >= 30) {
      insights.push({ category: 'leads', type: 'positive', priority: 'info', title: 'Strong Conversion Rate', message: `${conversionRate}% conversion rate - above industry average! Your sales process is working well.`, metric: conversionRate + '%' });
    }

    if (trialScheduled > 0) {
      insights.push({ category: 'leads', type: 'opportunity', priority: 'medium', title: `${trialScheduled} Trial${trialScheduled > 1 ? 's' : ''} Scheduled`, message: `Make sure instructors are prepared and the experience is exceptional. Follow up within 24 hours after trial.`, metric: trialScheduled });
    }

    // Growth insights
    if (capacity > 85) {
      insights.push({ category: 'growth', type: 'alert', priority: 'high', title: 'Approaching Capacity', message: `Your school is at ${capacity}% capacity (${activeStudents}/${school.student_capacity}). Consider adding class times, expanding space, or raising prices.`, metric: capacity + '%', action: 'Add new class slots or increase student capacity' });
    } else if (capacity < 50 && activeStudents > 5) {
      insights.push({ category: 'growth', type: 'opportunity', priority: 'medium', title: 'Growth Opportunity', message: `Only ${capacity}% capacity utilized. There's room for ${school.student_capacity - activeStudents} more students. Increase marketing efforts.`, metric: capacity + '%', action: 'Launch referral program or increase ad spend' });
    }

    if (studentGrowth > 20 && newStudentsThisMonth > 3) {
      insights.push({ category: 'growth', type: 'positive', priority: 'info', title: 'Strong Student Growth', message: `${newStudentsThisMonth} new students this month (${studentGrowth > 0 ? '+' : ''}${studentGrowth}% vs last month). Momentum is building!`, metric: '+' + newStudentsThisMonth });
    }

    // Operational insights
    if (automationsActive === 0) {
      insights.push({ category: 'operations', type: 'recommendation', priority: 'medium', title: 'No Automations Active', message: 'You have no automated workflows running. Automations can save 5-10 hours/week on follow-ups, reminders, and outreach.', action: 'Go to AI Auto tab and install automation templates' });
    }

    if (openTasks > 10) {
      insights.push({ category: 'operations', type: 'warning', priority: 'medium', title: `${openTasks} Open Tasks`, message: 'Your task backlog is growing. Prioritize urgent tasks and delegate or automate repetitive ones.', metric: openTasks, action: 'Review tasks in the Tasks tab' });
    }

    if (totalClasses === 0) {
      insights.push({ category: 'operations', type: 'recommendation', priority: 'high', title: 'No Classes Configured', message: 'Set up your class schedule to enable attendance tracking, enrollment, and capacity management.', action: 'Go to Classes tab and add your class schedule' });
    }

    // AI usage insight
    if (recentCalls === 0 && activeStudents > 5) {
      insights.push({ category: 'ai', type: 'recommendation', priority: 'medium', title: 'AI Voice Agent Unused', message: 'Your AI receptionist hasn\'t handled any calls this month. Make sure your phone number is set up and the agent is enabled.', action: 'Check voice settings in the settings panel' });
    }

    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, info: 3 };
    insights.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    return {
      schoolId,
      schoolName: school.name,
      generatedAt: new Date().toISOString(),
      metrics: {
        activeStudents,
        newStudentsThisMonth,
        cancelledRecent,
        churnRate,
        revenueThisMonth: Math.round(revenueThisMonth),
        revenueGrowth,
        arps,
        hotLeads,
        conversionRate,
        capacity,
        pastDueSubs,
        atRiskStudents,
        automationsActive,
        openTasks,
        upcomingAppointments
      },
      insights,
      topActions: insights.filter(i => i.action).slice(0, 5).map(i => ({ title: i.title, action: i.action, priority: i.priority }))
    };
  }
}

module.exports = KanchoGrowthAdvisor;
