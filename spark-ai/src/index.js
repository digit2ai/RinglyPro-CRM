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
