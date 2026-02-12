// kancho-ai/src/index.js
// Kancho Martial Arts AI - Main Entry Point
// Mounted at /kanchoai in the main RinglyPro app

const express = require('express');
const path = require('path');
const app = express();

// Kancho AI Logo URL
const KANCHO_LOGO_URL = 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d318b7f6dcf1134316df1.png';
const KANCHO_STRIPE_LOGO_URL = 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png';

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
  console.log('Kancho AI Models loaded:', Object.keys(models).filter(k => k.startsWith('Kancho')));
} catch (error) {
  modelsError = error;
  console.error('Error loading Kancho AI models:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'Kancho Martial Arts AI',
    status: modelsError ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    models: modelsError ? null : Object.keys(models).filter(k => k.startsWith('Kancho')),
    error: modelsError ? modelsError.message : null,
    endpoints: {
      dashboard: '/kanchoai/',
      api: '/kanchoai/api/v1/*',
      health: '/kanchoai/health'
    }
  });
});

// Dashboard Metrics Guide - Styled HTML page
app.get('/metrics-guide', (req, res) => {
  const fs = require('fs');
  const guidePath = path.join(__dirname, '../docs/DASHBOARD_METRICS_GUIDE.md');

  let markdownContent = '';
  try {
    markdownContent = fs.readFileSync(guidePath, 'utf8');
  } catch (error) {
    return res.status(404).send('Guide not found');
  }

  // Simple markdown to HTML conversion
  let htmlContent = markdownContent;

  // First, handle tables separately to avoid line break issues
  // Find all table blocks and convert them
  htmlContent = htmlContent.replace(/(\|[^\n]+\|\n)+/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    let tableHtml = '<div class="overflow-x-auto my-6"><table class="w-full border border-kancho-dark-border rounded-lg overflow-hidden">';
    let isFirstDataRow = true;

    rows.forEach((row, index) => {
      const cells = row.split('|').filter(c => c.trim() !== '');
      // Skip separator rows (|---|---|)
      if (cells.every(c => /^[\s-:]+$/.test(c))) {
        return;
      }
      // First row is header
      if (index === 0) {
        tableHtml += '<thead><tr>';
        cells.forEach(c => {
          tableHtml += `<th class="px-4 py-3 text-left text-xs font-bold text-kancho uppercase bg-kancho-dark-card">${c.trim().replace(/\*\*/g, '')}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
      } else {
        tableHtml += '<tr>';
        cells.forEach(c => {
          tableHtml += `<td class="px-4 py-3 text-sm text-gray-300 border-t border-kancho-dark-border">${c.trim().replace(/\*\*/g, '')}</td>`;
        });
        tableHtml += '</tr>';
      }
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // Now process the rest
  htmlContent = htmlContent
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-6 mb-3 text-kancho">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4 text-white border-b border-kancho-dark-border pb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-4xl font-bold mb-6 text-white">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg p-4 my-4 overflow-x-auto text-sm"><code class="text-green-400">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-kancho-dark-card px-2 py-1 rounded text-kancho text-sm">$1</code>')
    // Lists - wrap in ul/ol
    .replace(/^- (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300">$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300"><span class="text-kancho font-bold mr-2">$1.</span>$2</li>')
    // Wrap consecutive list items
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="my-3 list-disc list-inside">$&</ul>')
    // Horizontal rules
    .replace(/^---$/gim, '<hr class="border-kancho-dark-border my-6">')
    // Clean up empty paragraphs and excessive line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Paragraphs
    .replace(/\n\n(?!<)/g, '</p><p class="text-gray-300 mb-3 leading-relaxed">')
    // Single line breaks (not before HTML tags)
    .replace(/\n(?!<)/g, ' ')
    // Remove empty paragraphs
    .replace(/<p[^>]*>\s*<\/p>/g, '');

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Metrics Guide - Kancho AI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'kancho': '#E85A4F',
            'kancho-coral': '#E85A4F',
            'kancho-dark': '#0D0D0D',
            'kancho-dark-card': '#1A1A1A',
            'kancho-dark-border': '#2A2A2A'
          }
        }
      }
    }
  </script>
  <style>
    body { background: linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 100%); }
  </style>
</head>
<body class="min-h-screen text-gray-300">
  <!-- Header -->
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl">
    <div class="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
      <a href="/kanchoai" class="flex items-center gap-3 hover:opacity-80 transition">
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
        <div>
          <h1 class="text-xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500">Dashboard Metrics Guide</p>
        </div>
      </a>
      <a href="/kanchoai" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 hover:border-kancho-coral transition flex items-center gap-2">
        <i class="fas fa-arrow-left"></i>
        Back to Dashboard
      </a>
    </div>
  </header>

  <!-- Content -->
  <main class="max-w-4xl mx-auto px-6 py-12">
    <div class="prose prose-invert max-w-none">
      <p class="text-gray-300 mb-4 leading-relaxed">
      ${htmlContent}
      </p>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-kancho-dark-border mt-16">
    <div class="max-w-4xl mx-auto px-6 py-8 text-center">
      <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>
  `);
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
  const healthMetricsRoutes = require('./routes/health-metrics')(models);

  app.use('/api/v1/schools', schoolsRoutes);
  app.use('/api/v1/students', studentsRoutes);
  app.use('/api/v1/leads', leadsRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/health', healthRoutes);
  app.use('/api/v1/voice', voiceRoutes);
  app.use('/api/v1/health-metrics', healthMetricsRoutes);

  // =====================================================
  // KANCHO SUBSCRIPTION PLANS - Stripe Integration
  // =====================================================
  const KANCHO_PLANS = {
    intelligence: {
      name: 'Kancho Intelligence',
      price: 197,
      description: 'AI Business Intelligence Officer integrated with your CRM',
      features: ['AI Business Intelligence', 'CRM Integration', 'Health Scoring', 'Churn Detection', 'Lead Scoring', 'Revenue Analytics', 'Voice AI Advisor', '100 AI Voice Minutes ($0.50 thereafter)']
    },
    pro: {
      name: 'Kancho Pro',
      price: 397,
      description: 'Intelligence + AI Receptionist for 24/7 automation',
      features: ['Everything in Intelligence', '24/7 AI Receptionist', 'Lead Follow-up Calls', 'Retention Campaigns', 'No-show Recovery', 'Payment Reminders', 'Bilingual (EN/ES)', '500 AI Voice Minutes ($0.45 thereafter)']
    }
  };

  // POST /api/v1/subscribe - Create Stripe checkout session
  app.post('/api/v1/subscribe', async (req, res) => {
    try {
      const { plan, email } = req.body;

      // Validate plan
      if (!plan || !KANCHO_PLANS[plan]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid plan selected. Choose intelligence, pro, or complete.'
        });
      }

      const planDetails = KANCHO_PLANS[plan];
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: planDetails.name,
              description: planDetails.description,
              images: [KANCHO_STRIPE_LOGO_URL]
            },
            unit_amount: planDetails.price * 100,
            recurring: {
              interval: 'month',
              interval_count: 1
            }
          },
          quantity: 1
        }],
        mode: 'subscription',
        subscription_data: {
          trial_period_days: 14,
          metadata: {
            plan: plan,
            product: 'kancho_ai',
            features: planDetails.features.join(', ')
          }
        },
        success_url: webhookBaseUrl + '/kanchoai?subscribe=success&plan=' + plan,
        cancel_url: webhookBaseUrl + '/kanchoai?subscribe=canceled',
        metadata: {
          plan: plan,
          product: 'kancho_ai'
        }
      });

      console.log('[Kancho] Checkout session created: ' + session.id + ' for ' + planDetails.name);

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id
      });

    } catch (error) {
      console.error('[Kancho] Subscription error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create checkout session'
      });
    }
  });

  // Comprehensive demo data seed endpoint
  app.post('/api/v1/seed-demo', async (req, res) => {
    try {
      const { KanchoSchool, KanchoStudent, KanchoLead, KanchoRevenue, KanchoAiCall, KanchoHealthScore, KanchoBusinessHealthMetrics } = models;
      const today = new Date();
      const results = { schools: [], totalStudents: 0, totalLeads: 0, totalRevenue: 0, totalCalls: 0 };

      // School data - 8 Diverse Martial Arts Schools
      const schoolsData = [
        {
          info: {
            tenant_id: 1,
            name: 'Tampa Bay BJJ Academy',
            martial_art_type: 'BJJ',
            owner_name: 'Professor Carlos Silva',
            owner_email: 'carlos@tampabaybjj.com',
            owner_phone: '+18135551234',
            city: 'Tampa',
            state: 'FL',
            monthly_revenue_target: 45000,
            student_capacity: 250,
            plan_type: 'pro',
            voice_agent: 'both'
          },
          beltSystem: ['White', 'Blue', 'Purple', 'Brown', 'Black'],
          membershipTypes: ['Unlimited', '3x Week', '2x Week', 'Competition Team'],
          rateRange: [149, 249],
          programs: ['Adult BJJ', 'Kids BJJ', 'No-Gi', 'Competition', 'Women Only']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Elite Karate Academy',
            martial_art_type: 'Karate',
            owner_name: 'Sensei Michael Tanaka',
            owner_email: 'mtanaka@elitekarate.com',
            owner_phone: '+17135559876',
            city: 'Houston',
            state: 'TX',
            monthly_revenue_target: 38000,
            student_capacity: 180,
            plan_type: 'growth',
            voice_agent: 'kancho'
          },
          beltSystem: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
          membershipTypes: ['Family Plan', 'Individual', 'Kids Only', 'Adult Only'],
          rateRange: [129, 199],
          programs: ['Traditional Karate', 'Kids Karate', 'Kata', 'Kumite', 'Self Defense']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Champions Taekwondo Center',
            martial_art_type: 'Taekwondo',
            owner_name: 'Master Kim Sung-ho',
            owner_email: 'masterkim@championtkd.com',
            owner_phone: '+13055557654',
            city: 'Miami',
            state: 'FL',
            monthly_revenue_target: 52000,
            student_capacity: 300,
            plan_type: 'enterprise',
            voice_agent: 'both'
          },
          beltSystem: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black 1st Dan', 'Black 2nd Dan'],
          membershipTypes: ['Olympic Track', 'Traditional', 'Little Tigers', 'Family'],
          rateRange: [139, 229],
          programs: ['Olympic Sparring', 'Traditional Forms', 'Little Tigers (4-6)', 'Junior Program', 'Adult Program']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Apex MMA Center',
            martial_art_type: 'MMA',
            owner_name: 'Coach Derek Williams',
            owner_email: 'derek@apexmma.com',
            owner_phone: '+13035558432',
            city: 'Denver',
            state: 'CO',
            monthly_revenue_target: 65000,
            student_capacity: 200,
            plan_type: 'pro',
            voice_agent: 'kancho'
          },
          beltSystem: ['Beginner', 'Intermediate', 'Advanced', 'Pro-Am', 'Professional'],
          membershipTypes: ['All Access', 'Striking Only', 'Grappling Only', 'Fight Team'],
          rateRange: [169, 299],
          programs: ['MMA Fundamentals', 'Striking', 'Wrestling', 'Submission Grappling', 'Fight Team']
        }
      ];

      const firstNames = ['James', 'Michael', 'Robert', 'David', 'William', 'Carlos', 'Miguel', 'Jose', 'Sofia', 'Isabella',
        'Mary', 'Patricia', 'Jennifer', 'Sarah', 'Jessica', 'Ethan', 'Mason', 'Logan', 'Alexander', 'Lucas'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
      const leadSources = ['Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Yelp'];

      const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randDate = (daysBack) => new Date(today.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);

      for (const schoolData of schoolsData) {
        const [school] = await KanchoSchool.findOrCreate({
          where: { name: schoolData.info.name, tenant_id: 1 },
          defaults: schoolData.info
        });
        const schoolId = school.id;

        // Generate students
        const numStudents = randBetween(20, 40);
        const usedEmails = new Set();

        for (let i = 0; i < numStudents; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`;
          let counter = 1;
          while (usedEmails.has(email)) {
            email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@email.com`;
            counter++;
          }
          usedEmails.add(email);

          const churnRand = Math.random();
          let churnRisk, churnScore;
          if (churnRand < 0.60) { churnRisk = 'low'; churnScore = randBetween(1, 25); }
          else if (churnRand < 0.80) { churnRisk = 'medium'; churnScore = randBetween(26, 55); }
          else if (churnRand < 0.92) { churnRisk = 'high'; churnScore = randBetween(56, 80); }
          else { churnRisk = 'critical'; churnScore = randBetween(81, 100); }

          const beltIdx = Math.min(Math.floor(Math.pow(Math.random(), 1.5) * schoolData.beltSystem.length), schoolData.beltSystem.length - 1);

          await KanchoStudent.findOrCreate({
            where: { school_id: schoolId, email },
            defaults: {
              school_id: schoolId,
              first_name: firstName,
              last_name: lastName,
              email,
              phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
              belt_rank: schoolData.beltSystem[beltIdx],
              membership_type: randItem(schoolData.membershipTypes),
              monthly_rate: randBetween(schoolData.rateRange[0], schoolData.rateRange[1]),
              churn_risk: churnRisk,
              churn_risk_score: churnScore,
              enrollment_date: randDate(730),
              last_attendance: randDate(churnRisk === 'critical' ? 45 : churnRisk === 'high' ? 21 : 7),
              attendance_streak: churnRisk === 'low' ? randBetween(5, 30) : randBetween(0, 5),
              total_classes: randBetween(10, 500),
              status: churnRisk === 'critical' && Math.random() < 0.3 ? 'inactive' : 'active',
              payment_status: churnRisk === 'critical' ? randItem(['current', 'past_due', 'failed']) : 'current'
            }
          });
        }
        results.totalStudents += numStudents;

        // Generate leads
        const numLeads = randBetween(8, 15);
        for (let i = 0; i < numLeads; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          const tempRand = Math.random();
          let temperature, leadScore;
          if (tempRand < 0.25) { temperature = 'hot'; leadScore = randBetween(80, 100); }
          else if (tempRand < 0.75) { temperature = 'warm'; leadScore = randBetween(50, 79); }
          else { temperature = 'cold'; leadScore = randBetween(20, 49); }

          await KanchoLead.create({
            school_id: schoolId,
            first_name: firstName,
            last_name: lastName,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`,
            phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
            source: randItem(leadSources),
            interest: randItem(schoolData.programs),
            temperature,
            lead_score: leadScore,
            status: randItem(['new', 'contacted', 'trial_scheduled', 'follow_up']),
            contact_attempts: randBetween(0, 5),
            last_contact_date: randDate(14)
          });
        }
        results.totalLeads += numLeads;

        // Generate revenue
        const numRevenues = randBetween(15, 25);
        let schoolRevenue = 0;
        for (let i = 0; i < numRevenues; i++) {
          const revenueType = randItem(['membership', 'retail', 'private_lesson', 'testing_fee', 'event']);
          const amount = revenueType === 'membership' ? randBetween(1000, 5000) : randBetween(50, 500);
          const date = new Date(today.getFullYear(), today.getMonth(), randBetween(1, today.getDate()));
          await KanchoRevenue.create({
            school_id: schoolId,
            date,
            type: revenueType,
            amount,
            description: `${revenueType} transaction`,
            is_recurring: revenueType === 'membership',
            source: 'demo'
          });
          schoolRevenue += amount;
        }
        results.totalRevenue += schoolRevenue;

        // Generate AI calls
        const numCalls = randBetween(5, 12);
        for (let i = 0; i < numCalls; i++) {
          await KanchoAiCall.create({
            school_id: schoolId,
            agent: randItem(['kancho', 'maestro']),
            call_type: randItem(['lead_followup', 'retention', 'no_show', 'payment_reminder']),
            direction: 'outbound',
            phone_number: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
            duration_seconds: randBetween(60, 300),
            status: 'completed',
            outcome: randItem(['trial_booked', 'callback_scheduled', 'issue_resolved']),
            sentiment: 'positive',
            created_at: randDate(7)
          });
        }
        results.totalCalls += numCalls;

        // Update school and create health score
        const activeCount = await KanchoStudent.count({ where: { school_id: schoolId, status: 'active' } });
        await school.update({ active_students: activeCount });

        const atRisk = await KanchoStudent.count({ where: { school_id: schoolId, churn_risk: ['high', 'critical'] } });
        const hotLeads = await KanchoLead.count({ where: { school_id: schoolId, temperature: 'hot' } });

        const overallScore = randBetween(65, 92);
        const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : 'D';

        await KanchoHealthScore.findOrCreate({
          where: { school_id: schoolId, date: today.toISOString().split('T')[0] },
          defaults: {
            school_id: schoolId,
            date: today,
            retention_score: randBetween(60, 95),
            revenue_score: randBetween(50, 100),
            lead_score: randBetween(40, 90),
            attendance_score: randBetween(60, 90),
            engagement_score: randBetween(55, 85),
            growth_score: randBetween(50, 80),
            overall_score: overallScore,
            grade,
            vs_last_week: randBetween(-5, 10),
            insights: [
              atRisk > 0 ? `${atRisk} students at risk of churning` : 'Retention looks healthy',
              hotLeads > 0 ? `${hotLeads} hot leads ready for conversion` : 'Need more leads'
            ]
          }
        });

        // Create Business Health Metrics with KPIs including trial conversion and churn rate
        const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM format
        const trialsStarted = randBetween(8, 20);
        const trialsConverted = Math.floor(trialsStarted * (randBetween(45, 75) / 100)); // 45-75% conversion
        const trialConversionRate = ((trialsConverted / trialsStarted) * 100).toFixed(2);
        const cancelledStudents = randBetween(1, 5);
        const startingStudents = activeCount + cancelledStudents;
        const churnRate = ((cancelledStudents / startingStudents) * 100).toFixed(2);
        const arps = (schoolRevenue / activeCount).toFixed(2);
        const revenueAtRisk = (atRisk * parseFloat(arps)).toFixed(2);
        const growthPotential = (hotLeads * parseFloat(arps)).toFixed(2);
        const revenueTarget = schoolData.info.monthly_revenue_target;
        const revenueVsTargetPercent = ((schoolRevenue / revenueTarget) * 100).toFixed(2);

        if (KanchoBusinessHealthMetrics) {
          await KanchoBusinessHealthMetrics.findOrCreate({
            where: { school_id: schoolId, report_month: currentMonth },
            defaults: {
              school_id: schoolId,
              report_month: currentMonth,
              active_students: activeCount,
              net_student_growth: trialsConverted - cancelledStudents,
              churn_rate: parseFloat(churnRate),
              arps: parseFloat(arps),
              trial_conversion_rate: parseFloat(trialConversionRate),
              trials_started: trialsStarted,
              trials_converted: trialsConverted,
              cancelled_students: cancelledStudents,
              health_score: overallScore,
              health_grade: grade,
              revenue_at_risk: parseFloat(revenueAtRisk),
              students_at_risk: atRisk,
              growth_potential: parseFloat(growthPotential),
              hot_leads: hotLeads,
              monthly_revenue: schoolRevenue,
              revenue_vs_target_percent: parseFloat(revenueVsTargetPercent)
            }
          });
        }

        results.schools.push({
          id: schoolId,
          name: schoolData.info.name,
          students: numStudents,
          leads: numLeads,
          grade
        });
      }

      res.json({
        success: true,
        message: 'Demo data seeded successfully',
        summary: {
          schools_created: results.schools.length,
          total_students: results.totalStudents,
          total_leads: results.totalLeads,
          total_revenue: `$${results.totalRevenue.toLocaleString()}`,
          total_ai_calls: results.totalCalls
        },
        schools: results.schools
      });
    } catch (error) {
      console.error('Seed error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Kancho AI API routes mounted:');
  console.log('  - /kanchoai/api/v1/schools');
  console.log('  - /kanchoai/api/v1/students');
  console.log('  - /kanchoai/api/v1/leads');
  console.log('  - /kanchoai/api/v1/dashboard');
  console.log('  - /kanchoai/api/v1/health');
  console.log('  - /kanchoai/api/v1/voice');
} else {
  app.use('/api/v1/*', (req, res) => {
    res.status(503).json({
      error: 'Kancho AI database not available',
      message: 'Run database migrations to enable full functionality',
      details: modelsError ? modelsError.message : 'Unknown error'
    });
  });
}

// Serve dashboard for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kancho AI - Business Intelligence for Martial Arts Schools</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            kancho: {
              coral: '#E85A4F',
              'coral-dark': '#D64A3F',
              dark: '#0D0D0D',
              'dark-card': '#1A1A1A',
              'dark-border': '#2A2A2A'
            }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    .gradient-bg { background: #0D0D0D; }
    .card { background: #1A1A1A; border: 1px solid #2A2A2A; }
    .card-danger { background: linear-gradient(135deg, rgba(232, 90, 79, 0.15) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.3); }
    .card-success { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border-color: rgba(34, 197, 94, 0.2); }
    .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
    @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 40px rgba(232, 90, 79, 0.3); } 50% { box-shadow: 0 0 60px rgba(232, 90, 79, 0.5); } }
    .score-ring { stroke-dasharray: 377; stroke-dashoffset: calc(377 - (377 * var(--score)) / 100); transition: stroke-dashoffset 1.5s ease-out; }
    .fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .kancho-btn { background: linear-gradient(135deg, #E85A4F 0%, #D64A3F 100%); }
    .kancho-btn:hover { background: linear-gradient(135deg, #D64A3F 0%, #C53A2F 100%); }
    .text-kancho { color: #E85A4F; }
    @media (max-width: 768px) {
      .mobile-header { flex-direction: column; gap: 12px; padding: 12px 16px; }
      .mobile-main { padding: 16px !important; }
      body { padding-bottom: 70px; }
    }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <!-- Header -->
  <header class="border-b border-kancho-dark-border sticky top-0 z-50 bg-kancho-dark/95 backdrop-blur-xl">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 mobile-header">
      <div class="flex items-center gap-3">
        <!-- Kancho Logo -->
        <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain">
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-white tracking-tight">KANCHO AI</h1>
          <p class="text-xs text-gray-500">AI Business Intelligence</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-gray-400 text-sm font-medium">DEMO</span>
        <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
        <select id="schoolSelect" class="bg-kancho-dark-card border border-kancho-dark-border rounded-lg px-4 py-2.5 text-sm focus:border-kancho-coral focus:outline-none transition">
          <option value="">Select Your Business...</option>
        </select>
        <button onclick="talkToKancho()" class="kancho-btn px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-lg">
          <i class="fas fa-microphone"></i>
          <span>Talk to Kancho</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-8 mobile-main">
    <!-- Welcome Section -->
    <div id="welcomeSection" class="py-16">
      <div class="text-center mb-16">
        <div class="w-80 h-80 md:w-96 md:h-96 rounded-3xl flex items-center justify-center mx-auto mb-8 glow-pulse overflow-hidden bg-kancho-dark-card border border-kancho-dark-border">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-64 h-64 md:w-80 md:h-80 object-contain">
        </div>
        <h2 class="text-4xl font-bold mb-4">Meet <span class="text-kancho">Kancho AI</span></h2>
        <p class="text-xl text-gray-300 mb-2">Your AI Business Intelligence Officer</p>
        <p class="text-gray-400 max-w-2xl mx-auto">
          Connects to your company data, understands how your business really works,
          and delivers clear insights on where you're losing money, where you can grow,
          and what actions will maximize your profit and performance.
        </p>
      </div>

      <!-- Value Props -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div class="card card-danger rounded-2xl p-8 text-center">
          <div class="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-money-bill-wave text-red-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-red-400">Find Money Leaks</h3>
          <p class="text-gray-400 text-sm">Identify where you're losing revenue - churning members, failed payments, missed opportunities</p>
        </div>

        <div class="card card-success rounded-2xl p-8 text-center">
          <div class="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-chart-line text-green-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-green-400">Spot Growth</h3>
          <p class="text-gray-400 text-sm">Discover untapped potential - hot leads, upsell opportunities, expansion possibilities</p>
        </div>

        <div class="card rounded-2xl p-8 text-center" style="background: linear-gradient(135deg, rgba(232, 90, 79, 0.1) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.2);">
          <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-bolt text-kancho text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-kancho">Take Action</h3>
          <p class="text-gray-400 text-sm">Get prioritized recommendations that maximize profit and performance immediately</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center mb-16">
        <p class="text-gray-400 mb-6">Select a business above to see Kancho in action, or:</p>
        <button onclick="seedDemoData()" class="kancho-btn px-8 py-4 rounded-xl font-medium transition shadow-lg">
          <i class="fas fa-rocket mr-2"></i>Load Demo Data
        </button>
      </div>

      <!-- Onboarding Section -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Getting Started With <span class="text-kancho">Kancho AI</span> Is Effortless</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Our dedicated team personally guides you through every step of the process.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <!-- Step 1 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">1</span>
            </div>
            <h3 class="text-xl font-bold mb-3">Data Integration</h3>
            <p class="text-gray-400 text-sm">
              Connect your existing tools and platforms, and our team handles the setup for you. Fast, secure integration with no hassle.
            </p>
          </div>

          <!-- Step 2 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-kancho-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-kancho">2</span>
            </div>
            <h3 class="text-xl font-bold mb-3">White-Glove Onboarding</h3>
            <p class="text-gray-400 text-sm">
              Get personalized 1-on-1 training so you feel confident from day one. Our support team is like having your own dedicated IT department.
            </p>
          </div>
        </div>
      </div>

      <!-- Integration Image -->
      <div class="mt-16 flex justify-center">
        <img src="https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d575dbfe00f98dff7c57d.png" alt="Kancho AI Integrations" class="max-w-full md:max-w-4xl rounded-2xl">
      </div>

      <!-- Subscription Plans -->
      <div class="mt-16 pt-16 border-t border-kancho-dark-border">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold mb-4">Choose Your <span class="text-kancho">Kancho AI</span> Plan</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Power your martial arts school with AI-driven business intelligence, automated receptionist, and complete CRM solutions.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <!-- Plan 1: Kancho Intelligence -->
          <div class="card rounded-2xl p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Intelligence</h3>
              <p class="text-gray-400 text-sm mb-4">AI Business Intelligence</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$197</span>
                <span class="text-gray-400">/month</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">AI Business Intelligence Officer</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Integrates with your existing CRM</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Real-time health score monitoring</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Churn risk detection & alerts</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Lead scoring & prioritization</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Revenue analytics & forecasting</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Voice AI business advisor</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">100 AI voice minutes included ($0.50 thereafter)</span>
              </li>
            </ul>
            <button onclick="selectPlan('intelligence')" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition">
              Get Started
            </button>
          </div>

          <!-- Plan 2: Kancho Pro (Most Popular) -->
          <div class="card rounded-2xl p-8 relative border-kancho-coral/50 transform scale-105 shadow-xl shadow-kancho-coral/10">
            <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span class="bg-kancho-coral px-4 py-1 rounded-full text-sm font-bold">MOST POPULAR</span>
            </div>
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Pro</h3>
              <p class="text-gray-400 text-sm mb-4">Intelligence + AI Receptionist</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">$397</span>
                <span class="text-gray-400">/month</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Everything in Intelligence</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">24/7 AI Receptionist (Phone & SMS)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Automated lead follow-up calls</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Retention outreach campaigns</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">No-show recovery calls</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Payment reminder automation</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Bilingual support (EN/ES)</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">500 AI voice minutes included ($0.45 thereafter)</span>
              </li>
            </ul>
            <button onclick="selectPlan('pro')" class="w-full py-3 kancho-btn rounded-xl font-medium transition shadow-lg">
              Get Started
            </button>
          </div>

          <!-- Plan 3: Kancho Enterprise -->
          <div class="card rounded-2xl p-8 relative hover:border-kancho-coral/50 transition-all duration-300">
            <div class="text-center mb-6">
              <h3 class="text-xl font-bold mb-2">Kancho Enterprise</h3>
              <p class="text-gray-400 text-sm mb-4">Multi-Tenant SaaS Solution</p>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-4xl font-bold text-kancho">Custom</span>
              </div>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm"><strong>Everything in Pro</strong></span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">White-label multi-tenant platform</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Multi-language support</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Custom integrations & API access</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Dedicated account manager</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Priority support & SLA</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Volume pricing for SaaS providers</span>
              </li>
              <li class="flex items-start gap-3">
                <i class="fas fa-check text-green-400 mt-1"></i>
                <span class="text-gray-300 text-sm">Unlimited AI voice minutes</span>
              </li>
            </ul>
            <button onclick="openBookingModal()" class="w-full py-3 bg-white/10 hover:bg-kancho-coral/20 border border-kancho-dark-border hover:border-kancho-coral rounded-xl font-medium transition">
              Schedule a Call
            </button>
          </div>

        </div>

        <p class="text-center text-gray-500 text-sm mt-8">All plans include a 14-day free trial. No credit card required to start.</p>

        <!-- Final CTA -->
        <div class="text-center mt-12">
          <button onclick="selectPlan('intelligence')" class="kancho-btn px-10 py-4 rounded-xl font-medium text-lg transition shadow-lg">
            <i class="fas fa-rocket mr-2"></i>Start Your Free Trial
          </button>
          <p class="text-gray-500 text-sm mt-4">No credit card required • Cancel anytime</p>
        </div>
      </div>

      <!-- Hero CTA Section -->
      <div class="mt-20 pt-20 border-t border-kancho-dark-border text-center">
        <div class="mb-8">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png" alt="Kancho AI" class="max-w-2xl w-full mx-auto mb-6">
        </div>
        <p class="text-kancho text-lg font-medium mb-2">AI Business Intelligence — Voice & Analytics Platform</p>
        <p class="text-gray-400 text-sm mb-8">Churn Detection · Lead Scoring · Revenue Analytics</p>

        <h2 class="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-5xl mx-auto mb-12" style="color: #5BA4D4;">
          An all-in-one AI system that finds businesses, calls them automatically, collects leads, and schedules appointments.
        </h2>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <button onclick="selectPlan('intelligence')" class="kancho-btn px-10 py-4 rounded-full font-medium text-lg transition shadow-lg">
            Start Free
          </button>
          <button onclick="openBookingModal()" class="px-10 py-4 rounded-full font-medium text-lg border-2 border-gray-600 hover:border-gray-400 transition">
            Schedule a Demo
          </button>
        </div>
        <p class="text-gray-500 text-sm">Absolutely free — no credit card, no hidden fees</p>
      </div>

      <!-- Booking Modal -->
      <div id="bookingModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4 overflow-y-auto">
        <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-3xl shadow-2xl my-4 mx-auto">
          <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between sticky top-0 bg-kancho-dark-card z-10 rounded-t-3xl">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
                <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
              </div>
              <div>
                <h3 class="text-lg font-bold">Schedule Onboarding</h3>
                <p class="text-sm text-gray-400">Book your personalized onboarding session</p>
              </div>
            </div>
            <button onclick="closeBookingModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
              <i class="fas fa-times text-gray-400"></i>
            </button>
          </div>
          <div class="p-4">
            <iframe src="https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0" style="width: 100%; height: 800px; border: none;" scrolling="yes" id="nhKuDsn2At5csiDYc4d0_1770871834450"></iframe>
          </div>
        </div>
      </div>
      <script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>
    </div>

    <!-- Dashboard Section -->
    <div id="dashboardSection" class="hidden fade-in">
      <div class="card rounded-2xl p-6 mb-8 border-kancho-coral/30" style="border-color: rgba(232, 90, 79, 0.3);">
        <div class="flex items-start gap-4">
          <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-12 h-12 rounded-xl object-contain">
          <div>
            <p class="text-kancho font-medium mb-1">Kancho says:</p>
            <p id="kanchoMessage" class="text-lg text-gray-200">Analyzing your business data...</p>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div class="card rounded-2xl p-6 text-center relative">
          <a href="/kanchoai/metrics-guide" target="_blank" class="absolute top-4 right-4 text-gray-500 hover:text-kancho transition" title="Learn about metrics">
            <i class="fas fa-question-circle"></i>
          </a>
          <p class="text-xs text-gray-400 uppercase mb-4">Business Health</p>
          <div class="relative w-36 h-36 mx-auto mb-4">
            <svg class="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="60" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
              <circle id="scoreRing" cx="72" cy="72" r="60" fill="none" stroke="url(#scoreGradient)" stroke-width="10" stroke-linecap="round" class="score-ring" style="--score: 0"/>
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#F17A70"/>
                  <stop offset="100%" stop-color="#E85A4F"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div>
                <span id="healthScore" class="text-4xl font-bold">--</span>
                <p class="text-xs text-gray-500">/ 100</p>
              </div>
            </div>
          </div>
          <span id="healthGrade" class="inline-block px-4 py-1.5 bg-kancho-coral/20 text-kancho rounded-full text-sm font-bold">Grade: --</span>
        </div>

        <div class="card card-danger rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-down text-red-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Revenue at Risk</p>
          </div>
          <p id="revenueAtRisk" class="text-3xl font-bold text-red-400">$--</p>
          <p id="atRiskStudents" class="text-sm text-gray-400 mt-1">-- students at risk</p>
        </div>

        <div class="card card-success rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-up text-green-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Growth Potential</p>
          </div>
          <p id="growthPotential" class="text-3xl font-bold text-green-400">$--</p>
          <p id="hotLeads" class="text-sm text-gray-400 mt-1">-- hot leads</p>
        </div>

        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-dollar-sign text-blue-400"></i>
            </div>
            <p class="text-xs text-gray-400 uppercase">Monthly Revenue</p>
          </div>
          <p id="monthlyRevenue" class="text-3xl font-bold text-white">$--</p>
          <p id="revenueProgress" class="text-sm text-gray-400 mt-1">--% of target</p>
        </div>
      </div>

      <!-- KPI Metrics Section -->
      <div class="mb-8">
        <h3 class="text-lg font-bold mb-4 flex items-center justify-between">
          <span class="flex items-center gap-2">
            <i class="fas fa-chart-line text-kancho"></i>
            Key Performance Indicators
          </span>
          <a href="/kanchoai/metrics-guide" target="_blank" class="text-sm text-gray-400 hover:text-kancho transition flex items-center gap-1 font-normal">
            <i class="fas fa-question-circle"></i>
            <span class="hidden sm:inline">What do these mean?</span>
          </a>
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <!-- Active Students -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Active Students</p>
            <p id="kpiActiveStudents" class="text-2xl font-bold text-white">--</p>
            <p id="kpiStudentGrowth" class="text-xs text-gray-400 mt-1">-- net growth</p>
          </div>
          <!-- Churn Rate -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Churn Rate</p>
            <p id="kpiChurnRate" class="text-2xl font-bold text-amber-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">this month</p>
          </div>
          <!-- ARPS -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Avg Rev/Student</p>
            <p id="kpiARPS" class="text-2xl font-bold text-green-400">$--</p>
            <p class="text-xs text-gray-400 mt-1">ARPS</p>
          </div>
          <!-- Trial Conversion -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">Trial Conversion</p>
            <p id="kpiTrialConversion" class="text-2xl font-bold text-blue-400">--%</p>
            <p class="text-xs text-gray-400 mt-1">conversion rate</p>
          </div>
          <!-- Revenue vs Target -->
          <div class="card rounded-xl p-4 text-center">
            <p class="text-xs text-gray-400 uppercase mb-2">vs Target</p>
            <p id="kpiRevenueTarget" class="text-2xl font-bold text-kancho">--%</p>
            <p class="text-xs text-gray-400 mt-1">of monthly goal</p>
          </div>
        </div>
      </div>

      <!-- Action Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-user-minus text-red-400"></i>
            At-Risk Members
          </h3>
          <div id="atRiskList" class="space-y-3"></div>
        </div>

        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <i class="fas fa-fire text-green-400"></i>
            Hot Leads
          </h3>
          <div id="hotLeadsList" class="space-y-3"></div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="border-t border-kancho-dark-border bg-kancho-dark/95 mt-20">
    <div class="max-w-7xl mx-auto px-6 py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-12">
        <!-- Brand -->
        <div class="md:col-span-1">
          <div class="flex items-center gap-3 mb-4">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho AI" class="w-10 h-10 rounded-lg object-contain">
            <span class="text-xl font-bold">KANCHO AI</span>
          </div>
          <p class="text-gray-400 text-sm mb-4">AI Business Intelligence Officer for martial arts schools and fitness businesses.</p>
          <p class="text-gray-500 text-xs">Powered by RinglyPro</p>
        </div>

        <!-- Product -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Product</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Features</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Pricing</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Integrations</a></li>
            <li><a href="/kanchoai/metrics-guide" class="text-gray-400 hover:text-kancho transition">Dashboard Guide</a></li>
          </ul>
        </div>

        <!-- Company -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Company</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">About Us</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Careers</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Blog</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Contact</a></li>
          </ul>
        </div>

        <!-- Support -->
        <div>
          <h4 class="font-semibold mb-4 text-white">Support</h4>
          <ul class="space-y-2 text-sm">
            <li><a href="/kanchoai/metrics-guide" class="text-gray-400 hover:text-kancho transition">Metrics Guide</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Help Center</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Privacy Policy</a></li>
            <li><a href="#" class="text-gray-400 hover:text-kancho transition">Terms of Service</a></li>
            <li><a href="mailto:support@ringlypro.com" class="text-gray-400 hover:text-kancho transition">support@ringlypro.com</a></li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="border-t border-kancho-dark-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-gray-500 text-sm">&copy; ${new Date().getFullYear()} Kancho AI. All rights reserved.</p>
        <div class="flex items-center gap-6">
          <a href="https://facebook.com/ringlypro" target="_blank" class="text-gray-400 hover:text-kancho transition">
            <i class="fab fa-facebook text-lg"></i>
          </a>
          <a href="https://instagram.com/ringlypro" target="_blank" class="text-gray-400 hover:text-kancho transition">
            <i class="fab fa-instagram text-lg"></i>
          </a>
          <a href="https://linkedin.com/company/ringlypro" target="_blank" class="text-gray-400 hover:text-kancho transition">
            <i class="fab fa-linkedin text-lg"></i>
          </a>
          <a href="https://youtube.com/@ringlypro" target="_blank" class="text-gray-400 hover:text-kancho transition">
            <i class="fab fa-youtube text-lg"></i>
          </a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Language Toggle -->
  <div class="fixed bottom-4 left-4 flex gap-2">
    <button onclick="setLanguage('en')" id="langEn" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 transition">EN</button>
    <button onclick="setLanguage('es')" id="langEs" class="px-4 py-2 bg-kancho-dark-card border border-kancho-dark-border rounded-lg text-sm hover:bg-kancho-coral/20 transition">ES</button>
  </div>

  <!-- Voice Chat Modal - ElevenLabs Widget Auto-Start -->
  <div id="voiceModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4">
    <div class="bg-kancho-dark-card border border-kancho-dark-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
      <!-- Modal Header -->
      <div class="p-6 border-b border-kancho-dark-border flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-kancho-coral/20">
            <img src="${KANCHO_LOGO_URL}" alt="Kancho" class="w-10 h-10 object-contain">
          </div>
          <div>
            <h3 class="text-lg font-bold">Talk to Kancho</h3>
            <p id="voiceStatus" class="text-sm text-gray-400">Starting conversation...</p>
          </div>
        </div>
        <button onclick="closeVoiceModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
          <i class="fas fa-times text-gray-400"></i>
        </button>
      </div>

      <!-- ElevenLabs Widget Container -->
      <div class="p-8 flex flex-col items-center justify-center min-h-[300px]">
        <div id="voiceWidgetContainer" class="mb-4">
          <!-- Widget inserted here by JS and auto-started -->
        </div>

        <p id="widgetSchoolName" class="text-lg font-medium text-white mb-2"></p>
        <p class="text-sm text-gray-400 text-center">
          Click the orb to talk to Kancho.<br>
          Ask about revenue, members, leads, and more.
        </p>
      </div>

      <!-- Close Button -->
      <div class="p-4 border-t border-kancho-dark-border">
        <button onclick="closeVoiceModal()" class="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition">
          End Conversation
        </button>
      </div>
    </div>
  </div>

  <!-- ElevenLabs Widget SDK -->
  <script src="https://elevenlabs.io/convai-widget/index.js" async type="text/javascript"></script>

  <style>
    /* Style ElevenLabs widget in modal - center it */
    #voiceWidgetContainer {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 120px;
    }
    #voiceWidgetContainer elevenlabs-convai {
      position: relative !important;
      bottom: auto !important;
      right: auto !important;
    }
    /* Hide the powered-by branding */
    elevenlabs-convai::part(powered-by) {
      display: none !important;
    }
  </style>

  <script>
    let currentSchoolId = null;
    let currentSchoolData = null;
    let currentLanguage = 'en';

    async function loadSchools() {
      try {
        const res = await fetch('/kanchoai/api/v1/schools?tenant_id=1');
        const data = await res.json();
        const select = document.getElementById('schoolSelect');
        select.innerHTML = '<option value="">Select Your Business...</option>';
        if (data.data) {
          data.data.forEach(school => {
            select.innerHTML += '<option value="' + school.id + '">' + school.name + '</option>';
          });
        }
      } catch (e) {
        console.error('Failed to load schools:', e);
      }
    }

    document.getElementById('schoolSelect').addEventListener('change', async (e) => {
      currentSchoolId = e.target.value;
      if (currentSchoolId) {
        await loadDashboard(currentSchoolId);
      } else {
        document.getElementById('welcomeSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
      }
    });

    async function loadDashboard(schoolId) {
      document.getElementById('welcomeSection').classList.add('hidden');
      document.getElementById('dashboardSection').classList.remove('hidden');

      try {
        const res = await fetch('/kanchoai/api/v1/dashboard?school_id=' + schoolId);
        const data = await res.json();
        const d = data.data;

        // Store data for voice widget
        currentSchoolData = d;

        // Update health score
        const score = d.health?.overall_score || 0;
        document.getElementById('healthScore').textContent = score;
        document.getElementById('healthGrade').textContent = 'Grade: ' + (d.health?.grade || '--');
        document.getElementById('scoreRing').style.setProperty('--score', score);

        // Revenue at risk
        const atRiskCount = d.students?.at_risk || 0;
        const revenueAtRisk = atRiskCount * 175;
        document.getElementById('revenueAtRisk').textContent = '$' + revenueAtRisk.toLocaleString();
        document.getElementById('atRiskStudents').textContent = atRiskCount + ' students at risk';

        // Growth potential
        const hotLeadsCount = d.leads?.hot || 0;
        const growthPotential = hotLeadsCount * 175;
        document.getElementById('growthPotential').textContent = '$' + growthPotential.toLocaleString();
        document.getElementById('hotLeads').textContent = hotLeadsCount + ' hot leads';

        // Revenue
        const revenue = d.revenue?.this_month || 0;
        document.getElementById('monthlyRevenue').textContent = '$' + Math.round(revenue).toLocaleString();
        document.getElementById('revenueProgress').textContent = (d.revenue?.percent || 0) + '% of target';

        // KPI Metrics (from the new kpi object or fallback)
        const kpi = d.kpi || {};
        const activeStudents = kpi.active_students || d.students?.active || 0;
        const netGrowth = kpi.net_student_growth || 0;
        const churnRate = kpi.churn_rate || 0;
        const arps = kpi.arps || 175;
        const trialConversion = kpi.trial_conversion_rate || 0;
        const revenueVsTarget = kpi.revenue_vs_target_percent || d.revenue?.percent || 0;

        document.getElementById('kpiActiveStudents').textContent = activeStudents;
        document.getElementById('kpiStudentGrowth').textContent = (netGrowth >= 0 ? '+' : '') + netGrowth + ' net growth';
        document.getElementById('kpiChurnRate').textContent = parseFloat(churnRate).toFixed(1) + '%';
        document.getElementById('kpiARPS').textContent = '$' + Math.round(arps);
        document.getElementById('kpiTrialConversion').textContent = parseFloat(trialConversion).toFixed(1) + '%';
        document.getElementById('kpiRevenueTarget').textContent = parseFloat(revenueVsTarget).toFixed(1) + '%';

        // Color code churn rate
        const churnEl = document.getElementById('kpiChurnRate');
        if (churnRate > 10) churnEl.className = 'text-2xl font-bold text-red-400';
        else if (churnRate > 5) churnEl.className = 'text-2xl font-bold text-amber-400';
        else churnEl.className = 'text-2xl font-bold text-green-400';

        // Color code revenue vs target
        const targetEl = document.getElementById('kpiRevenueTarget');
        if (revenueVsTarget >= 100) targetEl.className = 'text-2xl font-bold text-green-400';
        else if (revenueVsTarget >= 80) targetEl.className = 'text-2xl font-bold text-amber-400';
        else targetEl.className = 'text-2xl font-bold text-red-400';

        // Kancho message
        let message = 'Your business health score is ' + score + '. ';
        if (atRiskCount > 0) message += atRiskCount + ' students at risk ($' + revenueAtRisk.toLocaleString() + '). ';
        if (hotLeadsCount > 0) message += hotLeadsCount + ' hot leads ready to convert. ';
        document.getElementById('kanchoMessage').textContent = message;

        // At-risk list
        const atRiskList = document.getElementById('atRiskList');
        atRiskList.innerHTML = '';
        if (d.lists?.at_risk_students) {
          d.lists.at_risk_students.forEach(s => {
            atRiskList.innerHTML += '<div class="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border-l-2 border-red-500">' +
              '<div><p class="font-medium">' + s.first_name + ' ' + s.last_name + '</p>' +
              '<p class="text-xs text-gray-400">' + s.churn_risk + ' risk</p></div>' +
              '<button class="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm">Call</button></div>';
          });
        }

        // Hot leads list
        const hotLeadsList = document.getElementById('hotLeadsList');
        hotLeadsList.innerHTML = '';
        if (d.lists?.hot_leads) {
          d.lists.hot_leads.forEach(l => {
            hotLeadsList.innerHTML += '<div class="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border-l-2 border-green-500">' +
              '<div><p class="font-medium">' + l.first_name + ' ' + (l.last_name || '') + '</p>' +
              '<p class="text-xs text-gray-400">Score: ' + l.lead_score + '</p></div>' +
              '<button class="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm">Call</button></div>';
          });
        }
      } catch (e) {
        console.error('Failed to load dashboard:', e);
      }
    }

    async function seedDemoData() {
      try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Loading...';

        const res = await fetch('/kanchoai/api/v1/seed-demo', { method: 'POST' });
        const data = await res.json();

        await loadSchools();
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Demo Data Loaded!';
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Load Demo Data';
        }, 2000);
      } catch (e) {
        console.error('Failed to seed demo data:', e);
      }
    }

    // =====================================================
    // KANCHO VOICE INTEGRATION - Hidden ElevenLabs Widget
    // Uses the official widget but hides it visually
    // Custom orb triggers the hidden widget
    // =====================================================

    const KANCHO_VOICE_AGENT_ID = 'agent_5601kh453hqqfz59nfemkwk02vax';
    let widgetElement = null;

    function talkToKancho() {
      if (!currentSchoolId) {
        alert('Please select a business first to talk to Kancho');
        return;
      }
      openVoiceModal();
    }

    function openVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const schoolNameEl = document.getElementById('widgetSchoolName');
      const container = document.getElementById('voiceWidgetContainer');
      const statusEl = document.getElementById('voiceStatus');

      // Show modal
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      statusEl.textContent = 'Starting conversation...';

      // Update school name
      const schoolSelect = document.getElementById('schoolSelect');
      const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
      schoolNameEl.textContent = selectedOption ? selectedOption.text : '';

      // Create widget with comprehensive dynamic variables
      const school = currentSchoolData?.school || {};
      const health = currentSchoolData?.health || {};
      const students = currentSchoolData?.students || {};
      const revenue = currentSchoolData?.revenue || {};
      const leads = currentSchoolData?.leads || {};

      const atRiskCount = students.at_risk || 0;
      const hotLeads = leads.hot || 0;

      const schoolId = parseInt(currentSchoolId, 10);
      const dynamicVars = {
        // ElevenLabs tool placeholder - maps to school_id
        dynamic_variable: schoolId,
        school_id: schoolId,
        language: currentLanguage || 'en',
        school_name: school.name || 'your school',
        martial_art: school.martial_art_type || 'martial arts',
        health_score: health.overall_score || 0,
        health_grade: health.grade || 'N/A',
        active_students: students.active || 0,
        at_risk_students: atRiskCount,
        revenue_at_risk: atRiskCount * 175,
        hot_leads: hotLeads,
        growth_potential: hotLeads * 175,
        monthly_revenue: revenue.this_month || 0,
        revenue_target: revenue.target || 0,
        revenue_percent: revenue.percent || 0
      };

      console.log('[Kancho] Creating widget with:', dynamicVars);

      // Clear any existing widget
      container.innerHTML = '';

      // Create the ElevenLabs widget
      widgetElement = document.createElement('elevenlabs-convai');
      widgetElement.setAttribute('agent-id', KANCHO_VOICE_AGENT_ID);
      widgetElement.setAttribute('dynamic-variables', JSON.stringify(dynamicVars));
      container.appendChild(widgetElement);

      // Auto-click the widget to start conversation
      autoStartWidget();
    }

    function autoStartWidget() {
      let attempts = 0;
      const maxAttempts = 20;
      const statusEl = document.getElementById('voiceStatus');

      function tryAutoStart() {
        attempts++;
        if (!widgetElement) return;

        const shadowRoot = widgetElement.shadowRoot;
        if (shadowRoot) {
          const btn = shadowRoot.querySelector('button');
          if (btn) {
            console.log('[Kancho] Auto-clicking widget button');
            statusEl.textContent = 'Connected - Click orb to talk';
            btn.click();
            return;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(tryAutoStart, 200);
        } else {
          console.log('[Kancho] Widget ready - click orb to start');
          statusEl.textContent = 'Click the orb to start talking';
        }
      }

      setTimeout(tryAutoStart, 500);
    }

    function closeVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const container = document.getElementById('voiceWidgetContainer');

      // Remove widget to end conversation
      if (container) container.innerHTML = '';
      widgetElement = null;

      // Hide modal
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function openBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeBookingModal() {
      const modal = document.getElementById('bookingModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      document.getElementById('langEn').classList.toggle('bg-kancho-coral/20', lang === 'en');
      document.getElementById('langEs').classList.toggle('bg-kancho-coral/20', lang === 'es');
    }

    // Plan selection and Stripe checkout
    async function selectPlan(plan) {
      const planNames = {
        intelligence: 'Kancho Intelligence',
        pro: 'Kancho Pro'
      };

      const planPrices = {
        intelligence: 197,
        pro: 397
      };

      try {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

        // Create Stripe checkout session
        const response = await fetch('/kanchoai/api/v1/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        });

        const data = await response.json();

        if (data.success && data.url) {
          // Redirect to Stripe Checkout
          window.location.href = data.url;
        } else {
          alert(data.error || 'Failed to create checkout session. Please try again.');
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      } catch (error) {
        console.error('Checkout error:', error);
        alert('Something went wrong. Please try again.');
        event.target.disabled = false;
        event.target.innerHTML = 'Get Started';
      }
    }

    // Check for successful subscription and open onboarding calendar
    function checkSubscriptionSuccess() {
      const urlParams = new URLSearchParams(window.location.search);
      const subscribeStatus = urlParams.get('subscribe');
      const plan = urlParams.get('plan');

      if (subscribeStatus === 'success') {
        // Show success message
        const planName = plan === 'pro' ? 'Kancho Pro' : 'Kancho Intelligence';

        // Create success banner
        const banner = document.createElement('div');
        banner.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[300] bg-green-500/90 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-pulse';
        banner.innerHTML = \`
          <i class="fas fa-check-circle text-2xl"></i>
          <div>
            <p class="font-bold">Welcome to \${planName}!</p>
            <p class="text-sm opacity-90">Your 14-day free trial has started. Let's schedule your onboarding call.</p>
          </div>
        \`;
        document.body.appendChild(banner);

        // Open booking modal after a short delay
        setTimeout(() => {
          openBookingModal();
          // Remove banner after modal opens
          setTimeout(() => banner.remove(), 3000);
        }, 1500);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (subscribeStatus === 'canceled') {
        // Show canceled message
        const banner = document.createElement('div');
        banner.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[300] bg-amber-500/90 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-4';
        banner.innerHTML = \`
          <i class="fas fa-info-circle text-2xl"></i>
          <div>
            <p class="font-bold">Checkout Canceled</p>
            <p class="text-sm opacity-90">No worries! You can try again whenever you're ready.</p>
          </div>
        \`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 5000);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Initialize
    loadSchools();
    checkSubscriptionSuccess();
  </script>
</body>
</html>
  `);
});

module.exports = app;
