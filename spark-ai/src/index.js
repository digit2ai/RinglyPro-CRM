// spark-ai/src/index.js
// Spark Martial Arts AI - Main Entry Point
// Mounted at /spark in the main RinglyPro app

const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../dashboard/dist')));

// Import models
let models;
let modelsError = null;

try {
  models = require('../models');
  console.log('Spark AI Models loaded:', Object.keys(models).filter(k => k.startsWith('Spark')));
} catch (error) {
  modelsError = error;
  console.error('Error loading Spark AI models:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'Spark Martial Arts AI',
    status: modelsError ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    models: modelsError ? null : Object.keys(models).filter(k => k.startsWith('Spark')),
    error: modelsError ? modelsError.message : null,
    endpoints: {
      dashboard: '/spark/',
      api: '/spark/api/v1/*',
      health: '/spark/health'
    }
  });
});

// API Routes
if (models && !modelsError) {
  // Mount API routes
  const schoolsRoutes = require('./routes/schools')(models);
  const studentsRoutes = require('./routes/students')(models);
  const leadsRoutes = require('./routes/leads')(models);
  const dashboardRoutes = require('./routes/dashboard')(models);
  const healthRoutes = require('./routes/health')(models);
  const voiceRoutes = require('./routes/voice')(models);

  app.use('/api/v1/schools', schoolsRoutes);
  app.use('/api/v1/students', studentsRoutes);
  app.use('/api/v1/leads', leadsRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/voice', voiceRoutes);

  // Seed demo data endpoint
  app.post('/api/v1/seed-demo', async (req, res) => {
    try {
      const { SparkSchool, SparkStudent, SparkLead, SparkRevenue, SparkAiCall, SparkHealthScore } = models;
      const today = new Date();

      // Create or get demo school
      let [school] = await SparkSchool.findOrCreate({
        where: { name: 'Tampa Bay BJJ Academy', tenant_id: 1 },
        defaults: {
          tenant_id: 1,
          name: 'Tampa Bay BJJ Academy',
          martial_art_type: 'BJJ',
          owner_name: 'Professor Carlos Silva',
          owner_email: 'carlos@tampabaybjj.com',
          owner_phone: '+18135551234',
          address: '1234 Main Street',
          city: 'Tampa',
          state: 'FL',
          zip: '33601',
          monthly_revenue_target: 35000,
          student_capacity: 200,
          website: 'https://tampabaybjj.com'
        }
      });

      const schoolId = school.id;

      // Add students
      const students = [
        { first_name: 'Michael', last_name: 'Johnson', belt_rank: 'Purple', churn_risk: 'low', churn_risk_score: 12, monthly_rate: 189 },
        { first_name: 'Sarah', last_name: 'Williams', belt_rank: 'Blue', churn_risk: 'low', churn_risk_score: 8, monthly_rate: 175 },
        { first_name: 'David', last_name: 'Martinez', belt_rank: 'White', churn_risk: 'medium', churn_risk_score: 45, monthly_rate: 129 },
        { first_name: 'Emily', last_name: 'Brown', belt_rank: 'Brown', churn_risk: 'low', churn_risk_score: 5, monthly_rate: 199 },
        { first_name: 'James', last_name: 'Wilson', belt_rank: 'Blue', churn_risk: 'high', churn_risk_score: 72, monthly_rate: 175 },
        { first_name: 'Jessica', last_name: 'Davis', belt_rank: 'White', churn_risk: 'critical', churn_risk_score: 89, monthly_rate: 149 },
        { first_name: 'Christopher', last_name: 'Lee', belt_rank: 'Purple', churn_risk: 'low', churn_risk_score: 15, monthly_rate: 189 },
        { first_name: 'Amanda', last_name: 'Taylor', belt_rank: 'Black', churn_risk: 'low', churn_risk_score: 3, monthly_rate: 0 },
        { first_name: 'Daniel', last_name: 'Anderson', belt_rank: 'Blue', churn_risk: 'medium', churn_risk_score: 52, monthly_rate: 175 },
        { first_name: 'Ashley', last_name: 'Thomas', belt_rank: 'White', churn_risk: 'high', churn_risk_score: 78, monthly_rate: 129 },
        { first_name: 'Matthew', last_name: 'Jackson', belt_rank: 'Purple', churn_risk: 'low', churn_risk_score: 10, monthly_rate: 189 },
        { first_name: 'Nicole', last_name: 'Martin', belt_rank: 'White', churn_risk: 'critical', churn_risk_score: 92, monthly_rate: 149 },
        { first_name: 'Andrew', last_name: 'Harris', belt_rank: 'Brown', churn_risk: 'low', churn_risk_score: 7, monthly_rate: 199 },
        { first_name: 'Rachel', last_name: 'Robinson', belt_rank: 'Blue', churn_risk: 'low', churn_risk_score: 18, monthly_rate: 175 },
        { first_name: 'Kevin', last_name: 'Clark', belt_rank: 'Blue', churn_risk: 'low', churn_risk_score: 14, monthly_rate: 175 },
      ];

      for (const s of students) {
        await SparkStudent.findOrCreate({
          where: { school_id: schoolId, email: `${s.first_name.toLowerCase()}.${s.last_name.toLowerCase()}@email.com` },
          defaults: { school_id: schoolId, ...s, email: `${s.first_name.toLowerCase()}.${s.last_name.toLowerCase()}@email.com`, membership_type: 'Unlimited', enrollment_date: new Date() }
        });
      }

      // Add leads
      const leads = [
        { first_name: 'Robert', last_name: 'Thompson', source: 'Google Ads', interest: 'Adult BJJ', temperature: 'hot', lead_score: 92, status: 'trial_scheduled' },
        { first_name: 'Jennifer', last_name: 'Moore', source: 'Facebook', interest: 'Kids Program', temperature: 'hot', lead_score: 88, status: 'contacted' },
        { first_name: 'William', last_name: 'Hall', source: 'Referral', interest: 'Self Defense', temperature: 'hot', lead_score: 95, status: 'new' },
        { first_name: 'Elizabeth', last_name: 'Young', source: 'Walk-in', interest: 'Fitness BJJ', temperature: 'warm', lead_score: 65, status: 'trial_completed' },
        { first_name: 'Richard', last_name: 'King', source: 'Website', interest: 'Competition', temperature: 'warm', lead_score: 58, status: 'follow_up' },
        { first_name: 'Patricia', last_name: 'Wright', source: 'Instagram', interest: 'Kids BJJ', temperature: 'warm', lead_score: 62, status: 'contacted' },
        { first_name: 'Linda', last_name: 'Green', source: 'Facebook', interest: 'Women Only Class', temperature: 'hot', lead_score: 85, status: 'new' },
        { first_name: 'Joseph', last_name: 'Baker', source: 'Referral', interest: 'No-Gi BJJ', temperature: 'warm', lead_score: 70, status: 'trial_scheduled' },
      ];

      for (const l of leads) {
        await SparkLead.findOrCreate({
          where: { school_id: schoolId, email: `${l.first_name.toLowerCase()}.${l.last_name.toLowerCase()}@gmail.com` },
          defaults: { school_id: schoolId, ...l, email: `${l.first_name.toLowerCase()}.${l.last_name.toLowerCase()}@gmail.com` }
        });
      }

      // Add revenue
      const revenues = [
        { type: 'membership', amount: 3250.00, description: 'Monthly memberships batch 1' },
        { type: 'membership', amount: 2875.00, description: 'Monthly memberships batch 2' },
        { type: 'membership', amount: 1450.00, description: 'New enrollments' },
        { type: 'membership', amount: 4100.00, description: 'Monthly memberships batch 3' },
        { type: 'retail', amount: 450.00, description: 'Gi sales' },
        { type: 'retail', amount: 275.00, description: 'Rashguards' },
        { type: 'private_lesson', amount: 600.00, description: '4 private lessons' },
        { type: 'private_lesson', amount: 450.00, description: '3 private lessons' },
        { type: 'testing_fee', amount: 750.00, description: 'Belt promotions' },
        { type: 'event', amount: 1200.00, description: 'Tournament entry fees' },
      ];

      for (let i = 0; i < revenues.length; i++) {
        const date = new Date(today.getFullYear(), today.getMonth(), i + 1);
        await SparkRevenue.findOrCreate({
          where: { school_id: schoolId, date: date, description: revenues[i].description },
          defaults: { school_id: schoolId, date: date, ...revenues[i], is_recurring: revenues[i].type === 'membership', source: 'demo' }
        });
      }

      // Add AI calls
      const calls = [
        { agent: 'sensei', call_type: 'lead_followup', direction: 'outbound', status: 'completed', outcome: 'trial_booked', sentiment: 'positive', duration_seconds: 245, summary: 'Robert very interested in adult BJJ. Booked trial for Saturday.' },
        { agent: 'sensei', call_type: 'lead_followup', direction: 'outbound', status: 'completed', outcome: 'callback_scheduled', sentiment: 'neutral', duration_seconds: 180, summary: 'Jennifer interested but needs to check schedule. Will call back Thursday.' },
        { agent: 'sensei', call_type: 'retention', direction: 'outbound', status: 'completed', outcome: 'issue_resolved', sentiment: 'positive', duration_seconds: 320, summary: 'James had schedule conflict. Moved to evening classes. Very happy now.' },
        { agent: 'sensei', call_type: 'retention', direction: 'outbound', status: 'voicemail', outcome: 'left_message', sentiment: 'neutral', duration_seconds: 45, summary: 'Left voicemail for Jessica about missed classes.' },
        { agent: 'sensei', call_type: 'no_show', direction: 'outbound', status: 'completed', outcome: 'rescheduled', sentiment: 'positive', duration_seconds: 195, summary: 'Elizabeth rescheduled trial for next week. Had car trouble.' },
        { agent: 'maestro', call_type: 'lead_followup', direction: 'outbound', status: 'completed', outcome: 'trial_booked', sentiment: 'positive', duration_seconds: 275, summary: 'William excited about competition training. Trial set for Monday.' },
        { agent: 'sensei', call_type: 'payment_reminder', direction: 'outbound', status: 'completed', outcome: 'payment_made', sentiment: 'positive', duration_seconds: 120, summary: 'David updated payment method. All current now.' },
        { agent: 'sensei', call_type: 'retention', direction: 'outbound', status: 'no_answer', outcome: null, sentiment: 'neutral', duration_seconds: 0, summary: null },
      ];

      for (const c of calls) {
        await SparkAiCall.create({ school_id: schoolId, ...c, phone_number: '+1813555' + Math.floor(1000 + Math.random() * 9000) });
      }

      // Update school active_students count
      const activeCount = await SparkStudent.count({ where: { school_id: schoolId, status: 'active' } });
      await school.update({ active_students: activeCount });

      // Calculate health score
      const { SparkHealthScore: HealthScore } = models;
      const totalStudents = await SparkStudent.count({ where: { school_id: schoolId } });
      const atRiskStudents = await SparkStudent.count({ where: { school_id: schoolId, churn_risk: ['high', 'critical'] } });
      const hotLeads = await SparkLead.count({ where: { school_id: schoolId, temperature: 'hot' } });
      const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);

      const retentionScore = Math.round(((activeCount / totalStudents) * 60) + ((1 - atRiskStudents / activeCount) * 40));
      const revenueScore = Math.round((totalRevenue / 35000) * 100);
      const leadScoreVal = Math.min(100, hotLeads * 20 + 40);
      const overallScore = Math.round((retentionScore * 0.3) + (revenueScore * 0.3) + (leadScoreVal * 0.2) + 70 * 0.2);
      const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

      await SparkHealthScore.findOrCreate({
        where: { school_id: schoolId, date: today.toISOString().split('T')[0] },
        defaults: {
          school_id: schoolId,
          date: today,
          retention_score: retentionScore,
          revenue_score: revenueScore,
          lead_score: leadScoreVal,
          attendance_score: 75,
          engagement_score: 70,
          growth_score: 65,
          overall_score: overallScore,
          grade: grade,
          insights: [
            `${atRiskStudents} students are at risk of churning. Consider reaching out with Sensei AI.`,
            `${hotLeads} hot leads need immediate follow-up for best conversion rates.`,
            `Revenue at ${Math.round(totalRevenue / 35000 * 100)}% of monthly target.`
          ],
          alerts: atRiskStudents > 2 ? [{ type: 'warning', message: 'Multiple students at risk of churning' }] : []
        }
      });

      res.json({
        success: true,
        message: 'Demo data seeded successfully',
        school_id: schoolId,
        counts: {
          students: students.length,
          leads: leads.length,
          revenue_entries: revenues.length,
          ai_calls: calls.length
        }
      });
    } catch (error) {
      console.error('Seed error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Spark AI API routes mounted:');
  console.log('  - /spark/api/v1/schools');
  console.log('  - /spark/api/v1/students');
  console.log('  - /spark/api/v1/leads');
  console.log('  - /spark/api/v1/dashboard');
  console.log('  - /spark/api/v1/health');
  console.log('  - /spark/api/v1/voice');
} else {
  // Fallback routes when models not available
  app.use('/api/v1/*', (req, res) => {
    res.status(503).json({
      error: 'Spark AI database not available',
      message: 'Run database migrations to enable full functionality',
      details: modelsError ? modelsError.message : 'Unknown error'
    });
  });
}

// Serve dashboard for all other routes (SPA fallback)
app.get('*', (req, res) => {
  // For now, serve a simple dashboard HTML
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spark Martial Arts AI - Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    .gradient-bg { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
    .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
    .glow { box-shadow: 0 0 40px rgba(239, 68, 68, 0.3); }
    .score-ring { stroke-dasharray: 251; stroke-dashoffset: calc(251 - (251 * var(--score)) / 100); }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <!-- Header -->
  <header class="border-b border-white/10 px-6 py-4">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center glow">
          <i class="fas fa-fire text-white text-xl"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold">Spark AI</h1>
          <p class="text-xs text-gray-400">Martial Arts School Intelligence</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <select id="schoolSelect" class="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm">
          <option value="">Select School...</option>
        </select>
        <button class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-medium transition">
          <i class="fas fa-plus mr-2"></i>Add School
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-8">
    <!-- Welcome Message (no school selected) -->
    <div id="welcomeSection" class="text-center py-20">
      <div class="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <i class="fas fa-fire text-red-500 text-4xl"></i>
      </div>
      <h2 class="text-3xl font-bold mb-4">Welcome to Spark AI</h2>
      <p class="text-gray-400 max-w-lg mx-auto mb-8">
        AI-powered intelligence for martial arts schools. Monitor health scores,
        track leads, retain students, and grow revenue with Sensei & Maestro voice agents.
      </p>
      <div class="flex justify-center gap-4">
        <button onclick="createDemoSchool()" class="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-lg font-medium transition">
          <i class="fas fa-rocket mr-2"></i>Create Demo School
        </button>
        <a href="/spark/health" class="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition">
          <i class="fas fa-heart-pulse mr-2"></i>Check Health Status
        </a>
      </div>
    </div>

    <!-- Dashboard (school selected) -->
    <div id="dashboardSection" class="hidden">
      <!-- Health Score Card -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="card rounded-2xl p-6 md:col-span-1">
          <div class="text-center">
            <div class="relative w-32 h-32 mx-auto mb-4">
              <svg class="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="8"/>
                <circle id="scoreRing" cx="64" cy="64" r="56" fill="none" stroke="#ef4444" stroke-width="8"
                  class="score-ring transition-all duration-1000" style="--score: 0"/>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <div>
                  <span id="healthScore" class="text-3xl font-bold">--</span>
                  <p class="text-xs text-gray-400">Health Score</p>
                </div>
              </div>
            </div>
            <span id="healthGrade" class="inline-block px-4 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">
              Grade: --
            </span>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-users text-blue-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold" id="activeStudents">--</p>
              <p class="text-xs text-gray-400">Active Students</p>
            </div>
          </div>
          <div class="text-sm text-red-400" id="atRiskCount">
            <i class="fas fa-exclamation-triangle mr-1"></i>-- at risk
          </div>
        </div>

        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-user-plus text-green-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold" id="activeLeads">--</p>
              <p class="text-xs text-gray-400">Active Leads</p>
            </div>
          </div>
          <div class="text-sm text-orange-400" id="hotLeadsCount">
            <i class="fas fa-fire mr-1"></i>-- hot leads
          </div>
        </div>

        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-dollar-sign text-yellow-400"></i>
            </div>
            <div>
              <p class="text-2xl font-bold" id="monthlyRevenue">$--</p>
              <p class="text-xs text-gray-400">This Month</p>
            </div>
          </div>
          <div class="w-full bg-white/10 rounded-full h-2">
            <div id="revenueProgress" class="bg-yellow-500 h-2 rounded-full" style="width: 0%"></div>
          </div>
          <p class="text-xs text-gray-400 mt-1" id="revenueTarget">-- of $-- target</p>
        </div>
      </div>

      <!-- AI Insights -->
      <div class="card rounded-2xl p-6 mb-8">
        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
          <i class="fas fa-brain text-purple-400"></i>
          AI Insights
        </h3>
        <div id="insightsList" class="space-y-3">
          <p class="text-gray-400">Loading insights...</p>
        </div>
      </div>

      <!-- Action Lists -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- At-Risk Students -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-exclamation-circle text-red-400"></i>
            At-Risk Students
          </h3>
          <div id="atRiskList" class="space-y-3">
            <p class="text-gray-400 text-sm">No at-risk students</p>
          </div>
        </div>

        <!-- Hot Leads -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-fire text-orange-400"></i>
            Hot Leads
          </h3>
          <div id="hotLeadsList" class="space-y-3">
            <p class="text-gray-400 text-sm">No hot leads</p>
          </div>
        </div>

        <!-- Recent AI Calls -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-phone-volume text-green-400"></i>
            Recent AI Calls
          </h3>
          <div id="recentCallsList" class="space-y-3">
            <p class="text-gray-400 text-sm">No recent calls</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Voice Agent Floating Action -->
  <div class="fixed bottom-6 right-6 flex flex-col gap-3">
    <button onclick="triggerSensei()" class="w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full shadow-lg flex items-center justify-center transition group">
      <i class="fas fa-robot text-white text-xl"></i>
      <span class="absolute right-full mr-3 bg-gray-900 px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition">
        Sensei AI (EN)
      </span>
    </button>
    <button onclick="triggerMaestro()" class="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full shadow-lg flex items-center justify-center transition group">
      <i class="fas fa-robot text-white text-xl"></i>
      <span class="absolute right-full mr-3 bg-gray-900 px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition">
        Maestro AI (ES)
      </span>
    </button>
  </div>

  <script>
    let currentSchoolId = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      loadSchools();
    });

    async function loadSchools() {
      try {
        // For demo, use tenant_id=1
        const res = await fetch('/spark/api/v1/schools?tenant_id=1');
        const data = await res.json();

        const select = document.getElementById('schoolSelect');
        select.innerHTML = '<option value="">Select School...</option>';

        if (data.success && data.data.length > 0) {
          data.data.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = school.name;
            select.appendChild(option);
          });
        }

        select.addEventListener('change', (e) => {
          if (e.target.value) {
            currentSchoolId = e.target.value;
            loadDashboard(currentSchoolId);
          } else {
            document.getElementById('welcomeSection').classList.remove('hidden');
            document.getElementById('dashboardSection').classList.add('hidden');
          }
        });
      } catch (error) {
        console.error('Error loading schools:', error);
      }
    }

    async function loadDashboard(schoolId) {
      try {
        document.getElementById('welcomeSection').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');

        const res = await fetch(\`/spark/api/v1/dashboard?school_id=\${schoolId}\`);
        const data = await res.json();

        if (data.success) {
          updateDashboard(data.data);
        }
      } catch (error) {
        console.error('Error loading dashboard:', error);
      }
    }

    function updateDashboard(data) {
      // Health Score
      if (data.health) {
        document.getElementById('healthScore').textContent = data.health.overall_score;
        document.getElementById('healthGrade').textContent = \`Grade: \${data.health.grade}\`;
        document.getElementById('scoreRing').style.setProperty('--score', data.health.overall_score);
      }

      // Students
      document.getElementById('activeStudents').textContent = data.students?.active || 0;
      document.getElementById('atRiskCount').innerHTML = \`<i class="fas fa-exclamation-triangle mr-1"></i>\${data.students?.at_risk || 0} at risk\`;

      // Leads
      document.getElementById('activeLeads').textContent = data.leads?.active || 0;
      document.getElementById('hotLeadsCount').innerHTML = \`<i class="fas fa-fire mr-1"></i>\${data.leads?.hot || 0} hot leads\`;

      // Revenue
      const revenue = data.revenue?.this_month || 0;
      const target = data.revenue?.target || 0;
      document.getElementById('monthlyRevenue').textContent = \`$\${revenue.toLocaleString()}\`;
      document.getElementById('revenueProgress').style.width = \`\${data.revenue?.progress || 0}%\`;
      document.getElementById('revenueTarget').textContent = \`\${data.revenue?.progress || 0}% of $\${target.toLocaleString()} target\`;

      // Insights
      const insightsList = document.getElementById('insightsList');
      if (data.health?.insights?.length > 0) {
        insightsList.innerHTML = data.health.insights.map(insight => \`
          <div class="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
            <i class="fas fa-lightbulb text-yellow-400 mt-1"></i>
            <p class="text-sm">\${insight}</p>
          </div>
        \`).join('');
      }

      // At-Risk Students
      const atRiskList = document.getElementById('atRiskList');
      if (data.lists?.at_risk_students?.length > 0) {
        atRiskList.innerHTML = data.lists.at_risk_students.map(student => \`
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p class="font-medium">\${student.first_name} \${student.last_name}</p>
              <p class="text-xs text-red-400">\${student.churn_risk} risk</p>
            </div>
            <button onclick="triggerRetentionCall(\${student.id})" class="text-blue-400 hover:text-blue-300">
              <i class="fas fa-phone"></i>
            </button>
          </div>
        \`).join('');
      }

      // Hot Leads
      const hotLeadsList = document.getElementById('hotLeadsList');
      if (data.lists?.hot_leads?.length > 0) {
        hotLeadsList.innerHTML = data.lists.hot_leads.map(lead => \`
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p class="font-medium">\${lead.first_name} \${lead.last_name || ''}</p>
              <p class="text-xs text-orange-400">Score: \${lead.lead_score}</p>
            </div>
            <button onclick="triggerLeadCall(\${lead.id})" class="text-blue-400 hover:text-blue-300">
              <i class="fas fa-phone"></i>
            </button>
          </div>
        \`).join('');
      }

      // Recent Calls
      const recentCallsList = document.getElementById('recentCallsList');
      if (data.lists?.recent_ai_calls?.length > 0) {
        recentCallsList.innerHTML = data.lists.recent_ai_calls.map(call => \`
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <div>
              <p class="font-medium capitalize">\${call.agent} - \${call.call_type.replace('_', ' ')}</p>
              <p class="text-xs text-gray-400">\${call.status} - \${new Date(call.created_at).toLocaleString()}</p>
            </div>
            <span class="text-\${call.sentiment === 'positive' ? 'green' : call.sentiment === 'negative' ? 'red' : 'gray'}-400">
              <i class="fas fa-\${call.sentiment === 'positive' ? 'smile' : call.sentiment === 'negative' ? 'frown' : 'meh'}"></i>
            </span>
          </div>
        \`).join('');
      }
    }

    async function createDemoSchool() {
      try {
        const res = await fetch('/spark/api/v1/schools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: 1,
            name: 'Demo Martial Arts Academy',
            martial_art_type: 'BJJ',
            owner_name: 'Demo Owner',
            owner_email: 'demo@example.com',
            monthly_revenue_target: 15000
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('Demo school created! Refreshing...');
          location.reload();
        }
      } catch (error) {
        console.error('Error creating demo school:', error);
      }
    }

    function triggerSensei() {
      if (!currentSchoolId) {
        alert('Please select a school first');
        return;
      }
      // TODO: Integrate with Sensei voice agent
      alert('Sensei AI voice agent coming soon!');
    }

    function triggerMaestro() {
      if (!currentSchoolId) {
        alert('Please select a school first');
        return;
      }
      // TODO: Integrate with Maestro voice agent
      alert('Maestro AI voice agent coming soon!');
    }

    function triggerRetentionCall(studentId) {
      console.log('Triggering retention call for student:', studentId);
      // TODO: Call voice/trigger endpoint
    }

    function triggerLeadCall(leadId) {
      console.log('Triggering lead follow-up call:', leadId);
      // TODO: Call voice/trigger endpoint
    }
  </script>
</body>
</html>
  `);
});

module.exports = app;
