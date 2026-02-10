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

  // Comprehensive demo data seed endpoint - Multiple schools with realistic data
  app.post('/api/v1/seed-demo', async (req, res) => {
    try {
      const { SparkSchool, SparkStudent, SparkLead, SparkRevenue, SparkAiCall, SparkHealthScore } = models;
      const today = new Date();
      const results = { schools: [], totalStudents: 0, totalLeads: 0, totalRevenue: 0, totalCalls: 0 };

      // ========================================
      // SCHOOL DATA - 8 Diverse Martial Arts Schools
      // ========================================
      const schoolsData = [
        {
          info: {
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
            monthly_revenue_target: 45000,
            student_capacity: 250,
            plan_type: 'pro',
            voice_agent: 'both',
            status: 'active',
            website: 'https://tampabaybjj.com'
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
            address: '5678 Oak Boulevard',
            city: 'Houston',
            state: 'TX',
            zip: '77001',
            monthly_revenue_target: 38000,
            student_capacity: 180,
            plan_type: 'growth',
            voice_agent: 'sensei',
            status: 'active',
            website: 'https://elitekaratehouston.com'
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
            address: '890 Palm Avenue',
            city: 'Miami',
            state: 'FL',
            zip: '33101',
            monthly_revenue_target: 52000,
            student_capacity: 300,
            plan_type: 'enterprise',
            voice_agent: 'both',
            status: 'active',
            website: 'https://championstaekwondo.com'
          },
          beltSystem: ['White', 'Yellow', 'Green', 'Blue', 'Red', 'Black 1st Dan', 'Black 2nd Dan', 'Black 3rd Dan'],
          membershipTypes: ['Olympic Track', 'Traditional', 'Little Tigers', 'Family'],
          rateRange: [139, 229],
          programs: ['Olympic Sparring', 'Traditional Forms', 'Little Tigers (4-6)', 'Junior Program', 'Adult Program']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Apex MMA Center',
            martial_art_type: 'MMA',
            owner_name: 'Coach Derek "The Hammer" Williams',
            owner_email: 'derek@apexmma.com',
            owner_phone: '+13035558432',
            address: '2345 Fighter Way',
            city: 'Denver',
            state: 'CO',
            zip: '80201',
            monthly_revenue_target: 65000,
            student_capacity: 200,
            plan_type: 'pro',
            voice_agent: 'sensei',
            status: 'active',
            website: 'https://apexmmacenter.com'
          },
          beltSystem: ['Beginner', 'Intermediate', 'Advanced', 'Pro-Am', 'Professional'],
          membershipTypes: ['All Access', 'Striking Only', 'Grappling Only', 'Fight Team'],
          rateRange: [169, 299],
          programs: ['MMA Fundamentals', 'Striking', 'Wrestling', 'Submission Grappling', 'Fight Team']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Golden Dragon Kung Fu',
            martial_art_type: 'Kung Fu',
            owner_name: 'Sifu James Chen',
            owner_email: 'sifu.chen@goldendragon.com',
            owner_phone: '+14155553210',
            address: '456 Chinatown Square',
            city: 'San Francisco',
            state: 'CA',
            zip: '94102',
            monthly_revenue_target: 28000,
            student_capacity: 120,
            plan_type: 'growth',
            voice_agent: 'sensei',
            status: 'active',
            website: 'https://goldendragonsf.com'
          },
          beltSystem: ['White Sash', 'Yellow Sash', 'Orange Sash', 'Green Sash', 'Blue Sash', 'Red Sash', 'Black Sash'],
          membershipTypes: ['Traditional', 'Wushu', 'Tai Chi', 'Full Access'],
          rateRange: [139, 219],
          programs: ['Wing Chun', 'Shaolin', 'Tai Chi', 'Wushu', 'Lion Dance']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Victory Kickboxing Academy',
            martial_art_type: 'Kickboxing',
            owner_name: 'Coach Maria Santos',
            owner_email: 'maria@victorykickboxing.com',
            owner_phone: '+16025559988',
            address: '789 Victory Lane',
            city: 'Phoenix',
            state: 'AZ',
            zip: '85001',
            monthly_revenue_target: 42000,
            student_capacity: 175,
            plan_type: 'pro',
            voice_agent: 'maestro',
            status: 'active',
            website: 'https://victorykickboxing.com'
          },
          beltSystem: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Instructor'],
          membershipTypes: ['Fitness Kickboxing', 'Technical', 'Competition', 'Personal Training'],
          rateRange: [129, 249],
          programs: ['Cardio Kickboxing', 'Muay Thai', 'K-1 Style', 'Womens Only', 'Kids Kickboxing']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Midwest Judo Club',
            martial_art_type: 'Judo',
            owner_name: 'Sensei Robert Yamamoto',
            owner_email: 'yamamoto@midwestjudo.com',
            owner_phone: '+13125556677',
            address: '321 Olympic Drive',
            city: 'Chicago',
            state: 'IL',
            zip: '60601',
            monthly_revenue_target: 32000,
            student_capacity: 150,
            plan_type: 'growth',
            voice_agent: 'sensei',
            status: 'active',
            website: 'https://midwestjudo.com'
          },
          beltSystem: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black 1st Dan', 'Black 2nd Dan'],
          membershipTypes: ['Recreational', 'Competitive', 'Masters (40+)', 'Youth'],
          rateRange: [119, 189],
          programs: ['Recreational Judo', 'Competition Team', 'Kids Judo', 'Self Defense', 'Kata']
        },
        {
          info: {
            tenant_id: 1,
            name: 'Northwest Wrestling Academy',
            martial_art_type: 'Wrestling',
            owner_name: 'Coach Dan Peterson',
            owner_email: 'dan@nwwrestling.com',
            owner_phone: '+12065554321',
            address: '567 Grappler Street',
            city: 'Seattle',
            state: 'WA',
            zip: '98101',
            monthly_revenue_target: 35000,
            student_capacity: 140,
            plan_type: 'growth',
            voice_agent: 'sensei',
            status: 'active',
            website: 'https://nwwrestlingacademy.com'
          },
          beltSystem: ['Novice', 'Intermediate', 'Varsity', 'Elite', 'All-American'],
          membershipTypes: ['Youth Program', 'High School', 'Collegiate', 'Open'],
          rateRange: [99, 179],
          programs: ['Freestyle', 'Greco-Roman', 'Folkstyle', 'Youth Wrestling', 'Adult Grappling']
        }
      ];

      // ========================================
      // REALISTIC NAME POOLS
      // ========================================
      const firstNames = ['James', 'Michael', 'Robert', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher', 'Daniel',
        'Matthew', 'Anthony', 'Mark', 'Steven', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'Timothy',
        'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
        'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna',
        'Carlos', 'Miguel', 'Jose', 'Luis', 'Juan', 'Sofia', 'Isabella', 'Valentina', 'Camila', 'Lucia',
        'Ethan', 'Mason', 'Logan', 'Alexander', 'Lucas', 'Jackson', 'Aiden', 'Liam', 'Noah', 'Oliver',
        'Emma', 'Olivia', 'Ava', 'Sophia', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Abigail'];

      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
        'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
        'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
        'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'];

      const leadSources = ['Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Yelp', 'Groupon', 'TikTok', 'YouTube'];

      // Helper to get random item
      const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randDate = (daysBack) => new Date(today.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);

      // ========================================
      // CREATE EACH SCHOOL WITH DATA
      // ========================================
      for (const schoolData of schoolsData) {
        // Create school
        const [school] = await SparkSchool.findOrCreate({
          where: { name: schoolData.info.name, tenant_id: 1 },
          defaults: schoolData.info
        });
        const schoolId = school.id;

        // ========================================
        // GENERATE STUDENTS (20-45 per school)
        // ========================================
        const numStudents = randBetween(20, 45);
        const usedEmails = new Set();

        for (let i = 0; i < numStudents; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`;

          // Ensure unique email
          let counter = 1;
          while (usedEmails.has(email)) {
            email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@email.com`;
            counter++;
          }
          usedEmails.add(email);

          // Realistic churn distribution: 60% low, 20% medium, 12% high, 8% critical
          const churnRand = Math.random();
          let churnRisk, churnScore;
          if (churnRand < 0.60) { churnRisk = 'low'; churnScore = randBetween(1, 25); }
          else if (churnRand < 0.80) { churnRisk = 'medium'; churnScore = randBetween(26, 55); }
          else if (churnRand < 0.92) { churnRisk = 'high'; churnScore = randBetween(56, 80); }
          else { churnRisk = 'critical'; churnScore = randBetween(81, 100); }

          // Belt distribution weighted toward lower ranks
          const beltIdx = Math.min(Math.floor(Math.pow(Math.random(), 1.5) * schoolData.beltSystem.length), schoolData.beltSystem.length - 1);

          await SparkStudent.findOrCreate({
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

        // ========================================
        // GENERATE LEADS (8-18 per school)
        // ========================================
        const numLeads = randBetween(8, 18);
        const usedLeadEmails = new Set();

        for (let i = 0; i < numLeads; i++) {
          const firstName = randItem(firstNames);
          const lastName = randItem(lastNames);
          let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;

          let counter = 1;
          while (usedLeadEmails.has(email)) {
            email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@gmail.com`;
            counter++;
          }
          usedLeadEmails.add(email);

          // Temperature distribution: 25% hot, 50% warm, 25% cold
          const tempRand = Math.random();
          let temperature, leadScore;
          if (tempRand < 0.25) { temperature = 'hot'; leadScore = randBetween(80, 100); }
          else if (tempRand < 0.75) { temperature = 'warm'; leadScore = randBetween(50, 79); }
          else { temperature = 'cold'; leadScore = randBetween(20, 49); }

          const statuses = ['new', 'contacted', 'trial_scheduled', 'trial_completed', 'follow_up', 'unresponsive'];

          await SparkLead.findOrCreate({
            where: { school_id: schoolId, email },
            defaults: {
              school_id: schoolId,
              first_name: firstName,
              last_name: lastName,
              email,
              phone: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
              source: randItem(leadSources),
              interest: randItem(schoolData.programs),
              temperature,
              lead_score: leadScore,
              status: randItem(statuses),
              contact_attempts: randBetween(0, 5),
              last_contact_date: randDate(14),
              created_at: randDate(30)
            }
          });
        }
        results.totalLeads += numLeads;

        // ========================================
        // GENERATE REVENUE (15-25 entries per school)
        // ========================================
        const numRevenues = randBetween(15, 25);
        const revenueTypes = [
          { type: 'membership', weight: 0.6 },
          { type: 'retail', weight: 0.15 },
          { type: 'private_lesson', weight: 0.12 },
          { type: 'testing_fee', weight: 0.08 },
          { type: 'event', weight: 0.05 }
        ];

        let schoolRevenue = 0;
        for (let i = 0; i < numRevenues; i++) {
          const rand = Math.random();
          let cumWeight = 0;
          let revenueType = 'membership';
          for (const rt of revenueTypes) {
            cumWeight += rt.weight;
            if (rand < cumWeight) { revenueType = rt.type; break; }
          }

          let amount, description;
          switch (revenueType) {
            case 'membership':
              amount = randBetween(800, 4500);
              description = randItem(['Monthly memberships batch', 'New enrollments', 'Membership renewals', 'Family plan payments']);
              break;
            case 'retail':
              amount = randBetween(75, 650);
              description = randItem(['Gi/Dobok sales', 'Equipment', 'Apparel', 'Gear & accessories', 'Protective equipment']);
              break;
            case 'private_lesson':
              amount = randBetween(150, 800);
              description = randItem(['Private lessons', 'Semi-private training', 'Personal coaching session']);
              break;
            case 'testing_fee':
              amount = randBetween(200, 1200);
              description = randItem(['Belt testing fees', 'Rank promotion testing', 'Certification fees']);
              break;
            case 'event':
              amount = randBetween(300, 2000);
              description = randItem(['Tournament entry fees', 'Seminar fees', 'Workshop registration', 'Camp fees']);
              break;
          }

          const date = new Date(today.getFullYear(), today.getMonth(), randBetween(1, today.getDate()));
          await SparkRevenue.findOrCreate({
            where: { school_id: schoolId, date, description: `${description} #${i+1}` },
            defaults: {
              school_id: schoolId,
              date,
              type: revenueType,
              amount,
              description: `${description} #${i+1}`,
              is_recurring: revenueType === 'membership',
              source: 'demo'
            }
          });
          schoolRevenue += amount;
        }
        results.totalRevenue += schoolRevenue;

        // ========================================
        // GENERATE AI CALLS (6-15 per school)
        // ========================================
        const numCalls = randBetween(6, 15);
        const callTypes = ['lead_followup', 'no_show', 'retention', 'payment_reminder', 'winback', 'appointment_confirmation'];
        const callStatuses = ['completed', 'no_answer', 'voicemail', 'busy', 'transferred'];
        const outcomes = {
          lead_followup: ['trial_booked', 'callback_scheduled', 'not_interested', 'sent_info'],
          no_show: ['rescheduled', 'cancelled', 'callback_scheduled'],
          retention: ['issue_resolved', 'schedule_adjusted', 'referred_to_owner', 'staying'],
          payment_reminder: ['payment_made', 'payment_scheduled', 'needs_assistance'],
          winback: ['reactivated', 'considering', 'not_interested'],
          appointment_confirmation: ['confirmed', 'rescheduled', 'cancelled']
        };
        const summaries = {
          lead_followup: [
            'Very interested in {program}. Booked trial for this weekend.',
            'Needs to discuss with spouse. Will call back Thursday.',
            'Excited about kids program. Scheduled family visit.',
            'Asked about pricing options. Sent detailed info via email.',
            'Looking for self-defense classes. Scheduled consultation.'
          ],
          retention: [
            'Had schedule conflict. Moved to evening classes. Very happy now.',
            'Concerned about progress. Set up meeting with instructor.',
            'Financial concerns discussed. Offered payment plan options.',
            'Work travel impacting attendance. Will resume next month.',
            'Discussed goals and created personalized training plan.'
          ],
          no_show: [
            'Car trouble prevented attendance. Rescheduled for next week.',
            'Forgot about appointment. Very apologetic. Rebooked.',
            'Child was sick. Rescheduled for when feeling better.',
            'Work emergency came up. Will try again next week.'
          ],
          payment_reminder: [
            'Updated payment method. All current now.',
            'Scheduled payment for Friday payday.',
            'Had billing question resolved. Payment processing.',
            'Set up autopay to prevent future issues.'
          ]
        };

        for (let i = 0; i < numCalls; i++) {
          const callType = randItem(callTypes);
          const status = randItem(callStatuses);
          const agent = schoolData.info.voice_agent === 'both' ? randItem(['sensei', 'maestro']) :
                        (schoolData.info.voice_agent === 'maestro' ? 'maestro' : 'sensei');

          let outcome = null, summary = null, sentiment = 'neutral';
          if (status === 'completed') {
            outcome = randItem(outcomes[callType] || ['completed']);
            if (summaries[callType]) {
              summary = randItem(summaries[callType]).replace('{program}', randItem(schoolData.programs));
            }
            sentiment = ['trial_booked', 'reactivated', 'issue_resolved', 'payment_made', 'confirmed', 'staying'].includes(outcome)
              ? 'positive' : (['not_interested', 'cancelled'].includes(outcome) ? 'negative' : 'neutral');
          } else if (status === 'voicemail') {
            outcome = 'left_message';
            summary = 'Left voicemail with callback number.';
          }

          await SparkAiCall.create({
            school_id: schoolId,
            agent,
            call_type: callType,
            direction: 'outbound',
            phone_number: `+1${randBetween(200, 999)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
            duration_seconds: status === 'completed' ? randBetween(120, 420) : (status === 'voicemail' ? randBetween(30, 60) : 0),
            status,
            outcome,
            sentiment,
            summary,
            created_at: randDate(7)
          });
        }
        results.totalCalls += numCalls;

        // ========================================
        // UPDATE SCHOOL STATS & HEALTH SCORE
        // ========================================
        const activeCount = await SparkStudent.count({ where: { school_id: schoolId, status: 'active' } });
        const totalStudentsCount = await SparkStudent.count({ where: { school_id: schoolId } });
        await school.update({ active_students: activeCount });

        const atRiskStudents = await SparkStudent.count({
          where: { school_id: schoolId, churn_risk: ['high', 'critical'] }
        });
        const hotLeads = await SparkLead.count({
          where: { school_id: schoolId, temperature: 'hot' }
        });

        // Calculate realistic health scores
        const retentionScore = Math.round(((activeCount / Math.max(totalStudentsCount, 1)) * 60) +
          ((1 - atRiskStudents / Math.max(activeCount, 1)) * 40));
        const revenueScore = Math.min(100, Math.round((schoolRevenue / schoolData.info.monthly_revenue_target) * 100));
        const leadScore = Math.min(100, hotLeads * 15 + 35);
        const attendanceScore = randBetween(65, 90);
        const engagementScore = randBetween(60, 85);
        const growthScore = randBetween(50, 80);

        const overallScore = Math.round(
          (retentionScore * 0.25) + (revenueScore * 0.25) + (leadScore * 0.20) +
          (attendanceScore * 0.15) + (engagementScore * 0.10) + (growthScore * 0.05)
        );
        const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

        await SparkHealthScore.findOrCreate({
          where: { school_id: schoolId, date: today.toISOString().split('T')[0] },
          defaults: {
            school_id: schoolId,
            date: today,
            retention_score: retentionScore,
            revenue_score: revenueScore,
            lead_score: leadScore,
            attendance_score: attendanceScore,
            engagement_score: engagementScore,
            growth_score: growthScore,
            overall_score: overallScore,
            grade,
            vs_last_week: randBetween(-5, 8),
            vs_last_month: randBetween(-10, 15),
            insights: [
              atRiskStudents > 0 ? `${atRiskStudents} student${atRiskStudents > 1 ? 's' : ''} at risk of churning. Sensei AI can help re-engage them.` : 'Student retention is excellent this month!',
              hotLeads > 0 ? `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready for conversion. Follow up within 24 hours for best results.` : 'Lead pipeline needs attention - consider running a promotion.',
              revenueScore >= 80 ? `Revenue is ${revenueScore}% to target. Great progress!` : `Revenue at ${revenueScore}% of monthly target. ${100 - revenueScore}% to go.`,
              overallScore >= 80 ? 'School health is strong. Keep up the great work!' : 'Focus on retention and lead conversion to improve health score.'
            ],
            alerts: [
              ...(atRiskStudents > 3 ? [{ type: 'warning', message: `${atRiskStudents} students showing signs of churning` }] : []),
              ...(revenueScore < 50 ? [{ type: 'alert', message: 'Revenue significantly below target' }] : [])
            ]
          }
        });

        results.schools.push({
          id: schoolId,
          name: schoolData.info.name,
          martial_art: schoolData.info.martial_art_type,
          city: schoolData.info.city,
          students: numStudents,
          leads: numLeads,
          health_grade: grade,
          health_score: overallScore
        });
      }

      res.json({
        success: true,
        message: 'Comprehensive demo data seeded successfully',
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
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // ========================================
  // SEED DATA FOR SPECIFIC SCHOOL (e.g., Demo school id=2)
  // ========================================
  app.post('/api/v1/seed-school/:id', async (req, res) => {
    try {
      const schoolId = parseInt(req.params.id, 10);
      const { SparkSchool, SparkStudent, SparkLead, SparkRevenue, SparkAiCall, SparkHealthScore } = models;
      const today = new Date();

      // Find the school
      const school = await SparkSchool.findByPk(schoolId);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      // BJJ-specific configuration for Demo school
      const beltSystem = ['White', 'Blue', 'Purple', 'Brown', 'Black'];
      const membershipTypes = ['Unlimited', '3x Week', '2x Week', 'Competition Team', 'Family Plan'];
      const programs = ['Adult BJJ', 'Kids BJJ', 'No-Gi', 'Competition Team', 'Fundamentals', 'Women Only BJJ'];
      const rateRange = [149, 229];

      // Name pools
      const firstNames = ['James', 'Michael', 'Robert', 'David', 'William', 'Carlos', 'Miguel', 'Jose', 'Sofia', 'Isabella',
        'Mary', 'Patricia', 'Jennifer', 'Sarah', 'Jessica', 'Ashley', 'Emily', 'Olivia', 'Emma', 'Ava',
        'Ethan', 'Mason', 'Logan', 'Alexander', 'Lucas', 'Jackson', 'Aiden', 'Liam', 'Noah', 'Oliver',
        'Marcus', 'Tyler', 'Brandon', 'Ryan', 'Kevin', 'Brian', 'Derek', 'Austin', 'Jake', 'Chris'];
      const lastNames = ['Smith', 'Johnson', 'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Hernandez', 'Gonzalez',
        'Silva', 'Santos', 'Costa', 'Oliveira', 'Ferreira', 'Almeida', 'Williams', 'Brown', 'Jones', 'Davis',
        'Miller', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson'];
      const leadSources = ['Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Yelp', 'Groupon', 'TikTok'];

      const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randDate = (daysBack) => new Date(today.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);

      let results = { students: 0, leads: 0, revenue: 0, calls: 0 };

      // ========================================
      // GENERATE 35 STUDENTS
      // ========================================
      const numStudents = 35;
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
        if (churnRand < 0.55) { churnRisk = 'low'; churnScore = randBetween(5, 25); }
        else if (churnRand < 0.78) { churnRisk = 'medium'; churnScore = randBetween(30, 55); }
        else if (churnRand < 0.92) { churnRisk = 'high'; churnScore = randBetween(60, 78); }
        else { churnRisk = 'critical'; churnScore = randBetween(82, 98); }

        const beltIdx = Math.min(Math.floor(Math.pow(Math.random(), 1.5) * beltSystem.length), beltSystem.length - 1);

        await SparkStudent.create({
          school_id: schoolId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: `+1${randBetween(305, 786)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          belt_rank: beltSystem[beltIdx],
          belt_stripes: randBetween(0, 4),
          membership_type: randItem(membershipTypes),
          monthly_rate: randBetween(rateRange[0], rateRange[1]),
          churn_risk: churnRisk,
          churn_risk_score: churnScore,
          enrollment_date: randDate(730),
          last_attendance: randDate(churnRisk === 'critical' ? 35 : churnRisk === 'high' ? 18 : 5),
          attendance_streak: churnRisk === 'low' ? randBetween(8, 35) : randBetween(0, 4),
          total_classes: randBetween(20, 450),
          lifetime_value: randBetween(1500, 12000),
          status: churnRisk === 'critical' && Math.random() < 0.25 ? 'inactive' : 'active',
          payment_status: churnRisk === 'critical' ? randItem(['current', 'past_due']) : 'current'
        });
      }
      results.students = numStudents;

      // ========================================
      // GENERATE 15 LEADS
      // ========================================
      const numLeads = 15;
      const usedLeadEmails = new Set();

      for (let i = 0; i < numLeads; i++) {
        const firstName = randItem(firstNames);
        const lastName = randItem(lastNames);
        let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;
        let counter = 1;
        while (usedLeadEmails.has(email)) {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@gmail.com`;
          counter++;
        }
        usedLeadEmails.add(email);

        const tempRand = Math.random();
        let temperature, leadScore;
        if (tempRand < 0.30) { temperature = 'hot'; leadScore = randBetween(80, 98); }
        else if (tempRand < 0.70) { temperature = 'warm'; leadScore = randBetween(50, 79); }
        else { temperature = 'cold'; leadScore = randBetween(25, 49); }

        const statuses = ['new', 'contacted', 'trial_scheduled', 'trial_completed', 'follow_up'];

        await SparkLead.create({
          school_id: schoolId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: `+1${randBetween(305, 786)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          source: randItem(leadSources),
          interest: randItem(programs),
          temperature,
          lead_score: leadScore,
          status: randItem(statuses),
          contact_attempts: randBetween(0, 4),
          last_contact_date: randDate(10),
          created_at: randDate(21)
        });
      }
      results.leads = numLeads;

      // ========================================
      // GENERATE 25 REVENUE ENTRIES
      // ========================================
      const numRevenues = 25;
      let totalRevenue = 0;
      const revenueTypes = [
        { type: 'membership', weight: 0.55 },
        { type: 'retail', weight: 0.18 },
        { type: 'private_lesson', weight: 0.14 },
        { type: 'testing_fee', weight: 0.08 },
        { type: 'event', weight: 0.05 }
      ];

      for (let i = 0; i < numRevenues; i++) {
        const rand = Math.random();
        let cumWeight = 0;
        let revenueType = 'membership';
        for (const rt of revenueTypes) {
          cumWeight += rt.weight;
          if (rand < cumWeight) { revenueType = rt.type; break; }
        }

        let amount, description;
        switch (revenueType) {
          case 'membership':
            amount = randBetween(1200, 5500);
            description = randItem(['Monthly memberships batch', 'New member signups', 'Membership renewals', 'Family plan payments', 'Competition team fees']);
            break;
          case 'retail':
            amount = randBetween(85, 750);
            description = randItem(['Gi sales', 'Rashguard/Apparel', 'Training gear', 'Belt ceremony fees']);
            break;
          case 'private_lesson':
            amount = randBetween(175, 900);
            description = randItem(['Private lessons', 'Competition prep sessions', 'Semi-private training']);
            break;
          case 'testing_fee':
            amount = randBetween(250, 1100);
            description = randItem(['Belt promotion testing', 'Stripe testing']);
            break;
          case 'event':
            amount = randBetween(400, 2200);
            description = randItem(['Tournament entry fees', 'Seminar fees', 'Open mat fees', 'Camp registration']);
            break;
        }

        const date = new Date(today.getFullYear(), today.getMonth(), randBetween(1, Math.min(today.getDate(), 28)));
        await SparkRevenue.create({
          school_id: schoolId,
          date,
          type: revenueType,
          amount,
          description,
          is_recurring: revenueType === 'membership',
          source: 'demo'
        });
        totalRevenue += amount;
      }
      results.revenue = totalRevenue;

      // ========================================
      // GENERATE 12 AI CALLS
      // ========================================
      const numCalls = 12;
      const callTypes = ['lead_followup', 'no_show', 'retention', 'payment_reminder', 'winback'];
      const callStatuses = ['completed', 'no_answer', 'voicemail'];
      const outcomes = {
        lead_followup: ['trial_booked', 'callback_scheduled', 'sent_info'],
        no_show: ['rescheduled', 'callback_scheduled'],
        retention: ['issue_resolved', 'schedule_adjusted', 'staying'],
        payment_reminder: ['payment_made', 'payment_scheduled'],
        winback: ['reactivated', 'considering', 'not_interested']
      };
      const summaries = {
        lead_followup: [
          'Very interested in BJJ. Booked trial class for Saturday.',
          'Wants to try kids program. Scheduled family visit.',
          'Asked about no-gi classes. Sent schedule via email.'
        ],
        retention: [
          'Had schedule conflict with work. Moved to morning classes.',
          'Concerned about competition prep. Set up meeting with coach.',
          'Discussed training goals. Very motivated to continue.'
        ]
      };

      for (let i = 0; i < numCalls; i++) {
        const callType = randItem(callTypes);
        const status = randItem(callStatuses);
        let outcome = null, summary = null, sentiment = 'neutral';

        if (status === 'completed') {
          outcome = randItem(outcomes[callType] || ['completed']);
          if (summaries[callType]) {
            summary = randItem(summaries[callType]);
          }
          sentiment = ['trial_booked', 'reactivated', 'issue_resolved', 'payment_made', 'staying'].includes(outcome)
            ? 'positive' : (['not_interested'].includes(outcome) ? 'negative' : 'neutral');
        } else if (status === 'voicemail') {
          outcome = 'left_message';
          summary = 'Left voicemail with callback number.';
        }

        await SparkAiCall.create({
          school_id: schoolId,
          agent: 'sensei',
          call_type: callType,
          direction: 'outbound',
          phone_number: `+1${randBetween(305, 786)}${randBetween(100, 999)}${randBetween(1000, 9999)}`,
          duration_seconds: status === 'completed' ? randBetween(90, 380) : (status === 'voicemail' ? randBetween(25, 55) : 0),
          status,
          outcome,
          sentiment,
          summary,
          created_at: randDate(7)
        });
      }
      results.calls = numCalls;

      // ========================================
      // UPDATE SCHOOL STATS & CREATE HEALTH SCORE
      // ========================================
      const activeCount = await SparkStudent.count({ where: { school_id: schoolId, status: 'active' } });
      const totalStudentsCount = await SparkStudent.count({ where: { school_id: schoolId } });
      await school.update({
        active_students: activeCount,
        monthly_revenue_target: 35000,
        student_capacity: 150,
        status: 'active'
      });

      const atRiskStudents = await SparkStudent.count({
        where: { school_id: schoolId, churn_risk: ['high', 'critical'] }
      });
      const hotLeads = await SparkLead.count({
        where: { school_id: schoolId, temperature: 'hot' }
      });

      const retentionScore = Math.round(((activeCount / Math.max(totalStudentsCount, 1)) * 60) +
        ((1 - atRiskStudents / Math.max(activeCount, 1)) * 40));
      const revenueScore = Math.min(100, Math.round((totalRevenue / 35000) * 100));
      const leadScore = Math.min(100, hotLeads * 15 + 40);
      const attendanceScore = randBetween(72, 88);
      const engagementScore = randBetween(68, 85);
      const growthScore = randBetween(60, 82);

      const overallScore = Math.round(
        (retentionScore * 0.25) + (revenueScore * 0.25) + (leadScore * 0.20) +
        (attendanceScore * 0.15) + (engagementScore * 0.10) + (growthScore * 0.05)
      );
      const grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

      await SparkHealthScore.findOrCreate({
        where: { school_id: schoolId, date: today.toISOString().split('T')[0] },
        defaults: {
          school_id: schoolId,
          date: today,
          retention_score: retentionScore,
          revenue_score: revenueScore,
          lead_score: leadScore,
          attendance_score: attendanceScore,
          engagement_score: engagementScore,
          growth_score: growthScore,
          overall_score: overallScore,
          grade,
          vs_last_week: randBetween(-3, 8),
          vs_last_month: randBetween(-5, 12),
          insights: [
            atRiskStudents > 0 ? `${atRiskStudents} student${atRiskStudents > 1 ? 's' : ''} showing signs of churning. Spark can help re-engage them.` : 'Student retention is excellent!',
            hotLeads > 0 ? `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready for conversion. Follow up within 24 hours.` : 'Lead pipeline needs attention.',
            `Revenue at ${revenueScore}% of monthly target.`,
            overallScore >= 80 ? 'Business health is strong!' : 'Focus on retention and lead conversion.'
          ],
          alerts: [
            ...(atRiskStudents > 2 ? [{ type: 'warning', message: `${atRiskStudents} students at risk of churning` }] : []),
            ...(revenueScore < 60 ? [{ type: 'alert', message: 'Revenue below target' }] : [])
          ]
        }
      });

      res.json({
        success: true,
        message: `Demo data seeded for ${school.name}`,
        school: {
          id: schoolId,
          name: school.name,
          active_students: activeCount,
          health_score: overallScore,
          grade
        },
        data_created: {
          students: results.students,
          leads: results.leads,
          revenue_entries: numRevenues,
          total_revenue: `$${totalRevenue.toLocaleString()}`,
          ai_calls: results.calls
        }
      });

    } catch (error) {
      console.error('Seed school error:', error);
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
  console.log('  - /spark/api/v1/seed-school/:id');
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
  // Spark AI Business Intelligence Dashboard
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spark AI - Business Intelligence for Martial Arts Schools</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            spark: {
              coral: '#E85A4F',
              'coral-dark': '#D64A3F',
              'coral-light': '#F17A70',
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
    .card-spark { background: linear-gradient(135deg, rgba(232, 90, 79, 0.1) 0%, rgba(232, 90, 79, 0.05) 100%); border-color: rgba(232, 90, 79, 0.2); }
    .glow-spark { box-shadow: 0 0 60px rgba(232, 90, 79, 0.4); }
    .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
    @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 40px rgba(232, 90, 79, 0.3); } 50% { box-shadow: 0 0 60px rgba(232, 90, 79, 0.5); } }
    .score-ring { stroke-dasharray: 377; stroke-dashoffset: calc(377 - (377 * var(--score)) / 100); transition: stroke-dashoffset 1.5s ease-out; }
    .fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .spark-icon { background: linear-gradient(135deg, #E85A4F 0%, #D64A3F 100%); }
    .spark-btn { background: linear-gradient(135deg, #E85A4F 0%, #D64A3F 100%); }
    .spark-btn:hover { background: linear-gradient(135deg, #D64A3F 0%, #C53A2F 100%); }
    .money-leak { border-left: 3px solid #E85A4F; }
    .growth-opp { border-left: 3px solid #22c55e; }
    .action-item { border-left: 3px solid #E85A4F; }
    .text-spark { color: #E85A4F; }
    .bg-spark { background-color: #E85A4F; }
    .border-spark { border-color: #E85A4F; }
    .bg-spark-coral\/10 { background-color: rgba(232, 90, 79, 0.1); }
    .bg-spark-coral\/20 { background-color: rgba(232, 90, 79, 0.2); }
    .bg-spark-coral\/30 { background-color: rgba(232, 90, 79, 0.3); }
    .hover\:bg-spark-coral\/10:hover { background-color: rgba(232, 90, 79, 0.1); }
    .hover\:bg-spark-coral\/30:hover { background-color: rgba(232, 90, 79, 0.3); }
    .border-spark-coral\/30 { border-color: rgba(232, 90, 79, 0.3); }
    .shadow-spark-coral\/20 { --tw-shadow-color: rgba(232, 90, 79, 0.2); }
    .bg-gradient-spark { background: linear-gradient(to right, #F17A70, #E85A4F); }
    /* Spark flame logo SVG */
    .spark-flame { filter: drop-shadow(0 0 10px rgba(232, 90, 79, 0.5)); }

    /* ========== MOBILE OPTIMIZATIONS ========== */
    @media (max-width: 768px) {
      /* Header - stack on mobile */
      .mobile-header {
        flex-direction: column;
        gap: 12px;
        padding: 12px 16px;
      }
      .mobile-header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
      .mobile-header-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }
      .mobile-header-controls select {
        width: 100%;
        font-size: 14px;
        padding: 10px 12px;
      }
      .mobile-header-controls .spark-btn {
        display: flex; /* Show talk button on mobile */
        width: 100%;
        justify-content: center;
        padding: 12px 16px;
      }

      /* Main content - reduced padding */
      .mobile-main {
        padding: 16px !important;
      }

      /* Welcome Section - more compact */
      .mobile-welcome {
        padding-top: 24px !important;
        padding-bottom: 24px !important;
      }
      .mobile-welcome-icon {
        width: 80px !important;
        height: 80px !important;
        margin-bottom: 20px !important;
      }
      .mobile-welcome-icon i {
        font-size: 32px !important;
      }
      .mobile-welcome h2 {
        font-size: 28px !important;
        margin-bottom: 8px !important;
      }
      .mobile-welcome .subtitle {
        font-size: 16px !important;
        margin-bottom: 4px !important;
      }
      .mobile-welcome .description {
        font-size: 14px !important;
        padding: 0 8px;
        line-height: 1.5;
      }

      /* Value props cards - compact grid */
      .mobile-value-props {
        gap: 12px !important;
        margin-bottom: 24px !important;
      }
      .mobile-value-card {
        padding: 16px !important;
      }
      .mobile-value-card .icon-wrap {
        width: 48px !important;
        height: 48px !important;
        margin-bottom: 12px !important;
      }
      .mobile-value-card .icon-wrap i {
        font-size: 20px !important;
      }
      .mobile-value-card h3 {
        font-size: 16px !important;
        margin-bottom: 6px !important;
      }
      .mobile-value-card p {
        font-size: 12px !important;
        line-height: 1.4;
      }

      /* CTA section */
      .mobile-cta {
        margin-top: 8px !important;
      }
      .mobile-cta p {
        font-size: 13px !important;
        margin-bottom: 12px !important;
      }
      .mobile-cta button {
        padding: 14px 24px !important;
        font-size: 14px !important;
        width: 100%;
      }

      /* Floating action button */
      .mobile-fab {
        width: 56px !important;
        height: 56px !important;
        bottom: 80px !important;
        right: 16px !important;
      }
      .mobile-fab i {
        font-size: 22px !important;
      }
      .mobile-fab span {
        display: none !important;
      }

      /* Bottom controls - fixed bar */
      .mobile-bottom-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #1A1A1A;
        border-top: 1px solid #2A2A2A;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 100;
      }
      .mobile-lang-toggle {
        position: static !important;
        display: flex;
        gap: 8px;
      }
      .mobile-lang-toggle button {
        padding: 8px 16px !important;
        font-size: 13px !important;
      }

      /* Add padding to body for fixed bottom bar */
      body {
        padding-bottom: 70px;
      }

      /* Dashboard cards on mobile */
      .mobile-stats-grid {
        grid-template-columns: 1fr 1fr !important;
        gap: 12px !important;
      }
      .mobile-stat-card {
        padding: 14px !important;
      }
      .mobile-stat-card .stat-value {
        font-size: 22px !important;
      }
      .mobile-stat-card .stat-label {
        font-size: 10px !important;
      }

      /* Hide desktop-only elements */
      .desktop-only {
        display: none !important;
      }
    }

    /* Small phones */
    @media (max-width: 375px) {
      .mobile-welcome h2 {
        font-size: 24px !important;
      }
      .mobile-welcome-icon {
        width: 64px !important;
        height: 64px !important;
      }
      .mobile-welcome-icon i {
        font-size: 26px !important;
      }
      .mobile-value-props {
        grid-template-columns: 1fr !important;
      }
    }
  </style>
</head>
<body class="gradient-bg min-h-screen text-white">
  <!-- Header -->
  <header class="border-b border-spark-dark-border sticky top-0 z-50 bg-spark-dark/95 backdrop-blur-xl">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 mobile-header">
      <div class="flex items-center gap-3 mobile-header-top">
        <div class="flex items-center gap-3">
          <!-- Spark Flame Logo -->
          <svg class="w-8 h-8 md:w-10 md:h-10 spark-flame" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2C20 2 8 14 8 24C8 30.627 13.373 36 20 36C26.627 36 32 30.627 32 24C32 20 30 16 28 14C28 14 27 20 24 22C24 22 26 14 22 8C22 8 20 12 18 14C18 14 20 6 20 2Z" fill="url(#sparkGradient)"/>
            <defs>
              <linearGradient id="sparkGradient" x1="8" y1="2" x2="32" y2="36" gradientUnits="userSpaceOnUse">
                <stop stop-color="#F17A70"/>
                <stop offset="1" stop-color="#E85A4F"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <h1 class="text-xl md:text-2xl font-bold text-white tracking-tight">SPARK</h1>
            <p class="text-xs text-gray-500">AI Business Intelligence</p>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-4 mobile-header-controls">
        <select id="schoolSelect" class="bg-spark-dark-card border border-spark-dark-border rounded-lg px-4 py-2.5 text-sm focus:border-spark-coral focus:outline-none transition">
          <option value="">Select Your Business...</option>
        </select>
        <button onclick="talkToSpark()" class="spark-btn px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-lg">
          <i class="fas fa-microphone"></i>
          <span>Talk to Spark</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-8 mobile-main">
    <!-- Welcome Section -->
    <div id="welcomeSection" class="py-16 mobile-welcome">
      <div class="text-center mb-10 md:mb-16">
        <div class="w-28 h-28 spark-icon rounded-3xl flex items-center justify-center mx-auto mb-8 glow-pulse mobile-welcome-icon">
          <i class="fas fa-bolt text-white text-5xl"></i>
        </div>
        <h2 class="text-4xl font-bold mb-4">Meet <span class="text-spark">Spark</span></h2>
        <p class="text-xl text-gray-300 mb-2 subtitle">Your AI Business Intelligence Officer</p>
        <p class="text-gray-400 max-w-2xl mx-auto description">
          Connects to your company data, understands how your business really works,
          and delivers clear insights on where you're losing money, where you can grow,
          and what actions will maximize your profit and performance.
        </p>
      </div>

      <!-- Value Props -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 mobile-value-props">
        <div class="card card-danger rounded-2xl p-8 text-center mobile-value-card">
          <div class="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 icon-wrap">
            <i class="fas fa-money-bill-wave text-red-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-red-400">Find Money Leaks</h3>
          <p class="text-gray-400 text-sm">Identify where you're losing revenue - churning members, failed payments, missed opportunities</p>
        </div>

        <div class="card card-success rounded-2xl p-8 text-center mobile-value-card">
          <div class="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 icon-wrap">
            <i class="fas fa-chart-line text-green-400 text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-green-400">Spot Growth</h3>
          <p class="text-gray-400 text-sm">Discover untapped potential - hot leads, upsell opportunities, expansion possibilities</p>
        </div>

        <div class="card card-spark rounded-2xl p-8 text-center mobile-value-card">
          <div class="w-16 h-16 bg-spark-coral/20 rounded-2xl flex items-center justify-center mx-auto mb-4 icon-wrap">
            <i class="fas fa-bolt text-spark text-2xl"></i>
          </div>
          <h3 class="text-xl font-bold mb-2 text-spark">Take Action</h3>
          <p class="text-gray-400 text-sm">Get prioritized recommendations that maximize profit and performance immediately</p>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center mobile-cta">
        <p class="text-gray-400 mb-6">Select a business above to see Spark in action, or:</p>
        <button onclick="seedDemoData()" class="spark-btn px-8 py-4 rounded-xl font-medium transition shadow-lg shadow-spark-coral/20">
          <i class="fas fa-rocket mr-2"></i>Load Demo Data
        </button>
      </div>
    </div>

    <!-- Dashboard Section -->
    <div id="dashboardSection" class="hidden fade-in">
      <!-- Spark Speaking -->
      <div class="card rounded-2xl p-6 mb-8 border-spark-coral/30">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 spark-icon rounded-xl flex items-center justify-center flex-shrink-0">
            <i class="fas fa-bolt text-white text-xl"></i>
          </div>
          <div>
            <p class="text-spark font-medium mb-1">Spark says:</p>
            <p id="sparkMessage" class="text-lg text-gray-200">Analyzing your business data...</p>
          </div>
        </div>
      </div>

      <!-- Business Health Overview -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <!-- Health Score -->
        <div class="card rounded-2xl p-6">
          <div class="text-center">
            <p class="text-xs text-gray-400 uppercase tracking-wider mb-4">Business Health</p>
            <div class="relative w-36 h-36 mx-auto mb-4">
              <svg class="w-36 h-36 transform -rotate-90">
                <circle cx="72" cy="72" r="60" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
                <circle id="scoreRing" cx="72" cy="72" r="60" fill="none" stroke="url(#scoreGradient)" stroke-width="10" stroke-linecap="round"
                  class="score-ring" style="--score: 0"/>
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
            <span id="healthGrade" class="inline-block px-4 py-1.5 bg-spark-coral/20 text-spark rounded-full text-sm font-bold">
              Grade: --
            </span>
          </div>
        </div>

        <!-- Revenue at Risk -->
        <div class="card card-danger rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-down text-red-400"></i>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wider">Revenue at Risk</p>
            </div>
          </div>
          <p class="text-3xl font-bold text-red-400 mb-1" id="revenueAtRisk">$--</p>
          <p class="text-sm text-gray-400" id="atRiskReason">-- members may churn</p>
          <div class="mt-4 pt-4 border-t border-red-500/20">
            <p class="text-xs text-red-300"><i class="fas fa-exclamation-circle mr-1"></i> <span id="atRiskUrgent">Needs attention</span></p>
          </div>
        </div>

        <!-- Growth Potential -->
        <div class="card card-success rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-arrow-trend-up text-green-400"></i>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wider">Growth Potential</p>
            </div>
          </div>
          <p class="text-3xl font-bold text-green-400 mb-1" id="growthPotential">$--</p>
          <p class="text-sm text-gray-400" id="growthReason">-- hot leads ready</p>
          <div class="mt-4 pt-4 border-t border-green-500/20">
            <p class="text-xs text-green-300"><i class="fas fa-rocket mr-1"></i> <span id="growthAction">Ready to convert</span></p>
          </div>
        </div>

        <!-- Monthly Revenue -->
        <div class="card rounded-2xl p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-spark-coral/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-sack-dollar text-spark"></i>
            </div>
            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wider">This Month</p>
            </div>
          </div>
          <p class="text-3xl font-bold mb-1" id="monthlyRevenue">$--</p>
          <div class="w-full bg-white/10 rounded-full h-2 mb-2">
            <div id="revenueProgress" class="bg-gradient-spark h-2 rounded-full transition-all duration-1000" style="width: 0%"></div>
          </div>
          <p class="text-sm text-gray-400" id="revenueTarget">--% to goal</p>
        </div>
      </div>

      <!-- Three Column Insights -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <!-- Money Leaks -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2 text-red-400">
            <i class="fas fa-money-bill-wave"></i>
            Where You're Losing Money
          </h3>
          <div id="moneyLeaksList" class="space-y-3">
            <div class="p-4 bg-white/5 rounded-xl money-leak">
              <p class="text-gray-400 text-sm">Analyzing your data...</p>
            </div>
          </div>
        </div>

        <!-- Growth Opportunities -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2 text-green-400">
            <i class="fas fa-chart-line"></i>
            Where You Can Grow
          </h3>
          <div id="growthList" class="space-y-3">
            <div class="p-4 bg-white/5 rounded-xl growth-opp">
              <p class="text-gray-400 text-sm">Identifying opportunities...</p>
            </div>
          </div>
        </div>

        <!-- Priority Actions -->
        <div class="card rounded-2xl p-6">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2 text-spark">
            <i class="fas fa-bolt"></i>
            Priority Actions
          </h3>
          <div id="actionsList" class="space-y-3">
            <div class="p-4 bg-white/5 rounded-xl action-item">
              <p class="text-gray-400 text-sm">Preparing recommendations...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Spark Voice Actions -->
      <div class="card rounded-2xl p-6 mb-8">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold flex items-center gap-2">
            <i class="fas fa-phone-volume text-spark"></i>
            Spark Voice Agent Activity
          </h3>
          <div class="flex gap-2">
            <button onclick="triggerSparkCalls('retention')" class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition">
              <i class="fas fa-user-shield mr-2"></i>Retention Calls
            </button>
            <button onclick="triggerSparkCalls('leads')" class="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition">
              <i class="fas fa-user-plus mr-2"></i>Lead Follow-ups
            </button>
          </div>
        </div>
        <div id="recentCallsList" class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-4 bg-white/5 rounded-xl">
            <p class="text-gray-400 text-sm">Loading call activity...</p>
          </div>
        </div>
      </div>

      <!-- Detailed Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- At-Risk Members -->
        <div class="card rounded-2xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold flex items-center gap-2">
              <i class="fas fa-user-xmark text-red-400"></i>
              Members at Risk
            </h3>
            <span id="atRiskBadge" class="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">0</span>
          </div>
          <div id="atRiskList" class="space-y-2 max-h-80 overflow-y-auto">
            <p class="text-gray-400 text-sm p-4">No at-risk members detected</p>
          </div>
        </div>

        <!-- Hot Leads -->
        <div class="card rounded-2xl p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold flex items-center gap-2">
              <i class="fas fa-fire text-spark"></i>
              Hot Leads Ready to Convert
            </h3>
            <span id="hotLeadsBadge" class="px-3 py-1 bg-spark-coral/20 text-spark rounded-full text-sm">0</span>
          </div>
          <div id="hotLeadsList" class="space-y-2 max-h-80 overflow-y-auto">
            <p class="text-gray-400 text-sm p-4">No hot leads detected</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Floating Spark Button (Desktop) -->
  <div class="fixed bottom-6 right-6 hidden md:block">
    <button onclick="talkToSpark()" class="w-16 h-16 spark-icon rounded-2xl shadow-2xl flex items-center justify-center transition hover:scale-110 glow-pulse group">
      <i class="fas fa-bolt text-white text-2xl"></i>
      <span class="absolute right-full mr-4 bg-gray-900/95 backdrop-blur px-4 py-2 rounded-xl text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition shadow-xl">
        Talk to Spark
      </span>
    </button>
  </div>

  <!-- Language Toggle (Desktop) -->
  <div class="fixed bottom-6 left-6 hidden md:flex gap-2">
    <button onclick="setLanguage('en')" id="langEnDesktop" class="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition border border-white/10">EN</button>
    <button onclick="setLanguage('es')" id="langEsDesktop" class="px-3 py-2 bg-white/5 hover:bg-white/20 rounded-lg text-sm transition border border-white/5">ES</button>
  </div>

  <!-- Voice Chat Modal - Custom Voice Orb (No ElevenLabs Branding) -->
  <div id="voiceModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] items-center justify-center p-4">
    <div class="bg-spark-dark-card border border-spark-dark-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
      <!-- Modal Header -->
      <div class="p-6 border-b border-spark-dark-border flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 spark-icon rounded-xl flex items-center justify-center">
            <i class="fas fa-bolt text-white text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold">Talk to Spark</h3>
            <p id="voiceStatus" class="text-sm text-gray-400">Click the orb below to start</p>
          </div>
        </div>
        <button onclick="closeVoiceModal()" class="p-2 hover:bg-white/10 rounded-lg transition">
          <i class="fas fa-times text-gray-400"></i>
        </button>
      </div>

      <!-- Custom Voice Orb Container -->
      <div class="p-8 flex flex-col items-center justify-center min-h-[300px]">
        <!-- Custom Orb Button -->
        <div id="voiceOrbContainer" class="relative mb-6">
          <button id="voiceOrbBtn" onclick="toggleVoiceConnection()" class="voice-orb relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); box-shadow: 0 0 30px rgba(245, 158, 11, 0.3);">
            <!-- Animated rings (shown when active) -->
            <div id="voiceOrbRing1" class="voice-ring hidden absolute inset-0 rounded-full border-2 border-amber-400 opacity-75"></div>
            <div id="voiceOrbRing2" class="voice-ring hidden absolute inset-[-8px] rounded-full border border-amber-500/50"></div>

            <!-- Outer glow -->
            <div id="voiceOrbGlow" class="absolute inset-0 rounded-full blur-md transition-all duration-300" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(249, 115, 22, 0.2));"></div>

            <!-- Inner orb -->
            <div id="voiceOrbInner" class="relative w-20 h-20 rounded-full transition-all duration-300" style="background: linear-gradient(135deg, #374151 0%, #1f2937 100%); box-shadow: inset 0 0 15px rgba(0,0,0,0.4), 0 0 10px rgba(0,0,0,0.2);">
              <!-- Icon container -->
              <div id="voiceOrbIcon" class="absolute inset-0 flex items-center justify-center">
                <i class="fas fa-microphone text-white text-2xl"></i>
              </div>
              <!-- Highlight -->
              <div class="absolute top-2 left-3 w-4 h-3 rounded-full bg-white opacity-20 blur-[2px]"></div>
            </div>
          </button>
        </div>

        <p id="widgetSchoolName" class="text-lg font-medium text-white mb-2"></p>
        <p id="voiceInstructions" class="text-sm text-gray-400 text-center">
          Click the orb to start talking to Spark.<br>
          Ask about revenue, members, leads, and more.
        </p>

        <!-- Transcript area (shown during conversation) -->
        <div id="transcriptArea" class="hidden w-full mt-4 max-h-40 overflow-y-auto bg-white/5 rounded-xl p-3">
          <div id="transcriptContent" class="text-sm text-gray-300 space-y-2"></div>
        </div>
      </div>

      <!-- Close Button -->
      <div class="p-4 border-t border-spark-dark-border">
        <button onclick="closeVoiceModal()" class="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <style>
    .voice-orb.active {
      background: linear-gradient(135deg, #b45309 0%, #d97706 100%) !important;
      box-shadow: 0 0 40px rgba(245, 158, 11, 0.6) !important;
    }
    .voice-orb.active .voice-ring {
      display: block !important;
      animation: voicePing 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .voice-orb.active #voiceOrbGlow {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.6), rgba(249, 115, 22, 0.5)) !important;
    }
    .voice-orb.active #voiceOrbInner {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
      box-shadow: inset 0 0 15px rgba(0,0,0,0.3), 0 0 20px rgba(245, 158, 11, 0.5) !important;
    }
    .voice-orb.connecting {
      opacity: 0.7;
      cursor: wait;
    }
    .voice-orb.connecting #voiceOrbIcon i {
      animation: spin 1s linear infinite;
    }
    @keyframes voicePing {
      0% { transform: scale(1); opacity: 0.75; }
      75%, 100% { transform: scale(1.3); opacity: 0; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>

  <!-- Mobile Bottom Bar (Language Toggle Only) -->
  <div class="fixed bottom-0 left-0 right-0 bg-spark-dark-card border-t border-spark-dark-border p-3 flex justify-center items-center z-50 md:hidden mobile-bottom-bar">
    <div class="flex gap-2 mobile-lang-toggle">
      <button onclick="setLanguage('en')" id="langEn" class="px-4 py-2 bg-white/10 rounded-lg text-sm font-medium border border-white/10">EN</button>
      <button onclick="setLanguage('es')" id="langEs" class="px-4 py-2 bg-white/5 rounded-lg text-sm border border-white/5">ES</button>
    </div>
  </div>

  <script>
    let currentSchoolId = null;
    let currentSchoolData = null;
    let currentLanguage = 'en';

    document.addEventListener('DOMContentLoaded', loadSchools);

    async function loadSchools() {
      try {
        const res = await fetch('/spark/api/v1/schools?tenant_id=1');
        const data = await res.json();
        const select = document.getElementById('schoolSelect');
        select.innerHTML = '<option value="">Select Your Business...</option>';

        if (data.success && data.data.length > 0) {
          data.data.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = school.name + ' (' + school.martial_art_type + ')';
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
        document.getElementById('dashboardSection').classList.add('fade-in');

        const res = await fetch(\`/spark/api/v1/dashboard?school_id=\${schoolId}\`);
        const data = await res.json();

        if (data.success) {
          currentSchoolData = data.data;
          updateDashboard(data.data);
        }
      } catch (error) {
        console.error('Error loading dashboard:', error);
      }
    }

    function updateDashboard(data) {
      // Health Score
      if (data.health) {
        document.getElementById('healthScore').textContent = data.health.overall_score || '--';
        document.getElementById('healthGrade').textContent = 'Grade: ' + (data.health.grade || '--');
        document.getElementById('scoreRing').style.setProperty('--score', data.health.overall_score || 0);
      }

      // Calculate revenue at risk (at-risk students * avg monthly rate)
      const atRiskCount = data.students?.at_risk || 0;
      const avgRate = 175; // Approximate average
      const revenueAtRisk = atRiskCount * avgRate;
      document.getElementById('revenueAtRisk').textContent = '$' + revenueAtRisk.toLocaleString();
      document.getElementById('atRiskReason').textContent = atRiskCount + ' member' + (atRiskCount !== 1 ? 's' : '') + ' may churn';
      document.getElementById('atRiskUrgent').textContent = atRiskCount > 3 ? 'Urgent: Take action now' : 'Monitor closely';

      // Calculate growth potential (hot leads * avg initial value)
      const hotLeads = data.leads?.hot || 0;
      const leadValue = 189; // First month avg
      const growthPotential = hotLeads * leadValue * 12; // Annual value
      document.getElementById('growthPotential').textContent = '$' + growthPotential.toLocaleString();
      document.getElementById('growthReason').textContent = hotLeads + ' hot lead' + (hotLeads !== 1 ? 's' : '') + ' ready';
      document.getElementById('growthAction').textContent = 'Potential annual revenue';

      // Monthly Revenue
      const revenue = data.revenue?.this_month || 0;
      const target = data.revenue?.target || 1;
      const progress = data.revenue?.progress || 0;
      document.getElementById('monthlyRevenue').textContent = '$' + revenue.toLocaleString();
      document.getElementById('revenueProgress').style.width = progress + '%';
      document.getElementById('revenueTarget').textContent = progress + '% of $' + target.toLocaleString() + ' goal';

      // Spark Message
      let sparkMsg = '';
      if (atRiskCount > 3) {
        sparkMsg = 'I see ' + atRiskCount + ' members at risk of leaving. That\\'s $' + revenueAtRisk.toLocaleString() + '/month at stake. I recommend triggering retention calls immediately.';
      } else if (hotLeads > 2) {
        sparkMsg = 'You have ' + hotLeads + ' hot leads ready to convert! That\\'s $' + growthPotential.toLocaleString() + ' potential annual revenue. Let me help you close them.';
      } else if (progress < 50) {
        sparkMsg = 'Revenue is at ' + progress + '% of target. Let\\'s focus on lead conversion and retention to close the gap.';
      } else {
        sparkMsg = 'Your business is performing well! Health score is ' + (data.health?.overall_score || '--') + '. Keep monitoring the insights below.';
      }
      document.getElementById('sparkMessage').textContent = sparkMsg;

      // Money Leaks
      const moneyLeaksList = document.getElementById('moneyLeaksList');
      const leaks = [];
      if (atRiskCount > 0) {
        leaks.push({ icon: 'user-minus', text: atRiskCount + ' members showing churn signals', value: '$' + revenueAtRisk + '/mo at risk', severity: 'high' });
      }
      if (data.students?.inactive > 0) {
        leaks.push({ icon: 'user-slash', text: (data.students?.inactive || 0) + ' inactive accounts', value: 'Lost recurring revenue', severity: 'medium' });
      }
      if (progress < 80) {
        leaks.push({ icon: 'chart-line', text: 'Revenue ' + (100 - progress) + '% below target', value: 'Missed opportunity', severity: 'medium' });
      }
      if (leaks.length > 0) {
        moneyLeaksList.innerHTML = leaks.map(leak => \`
          <div class="p-4 bg-white/5 rounded-xl money-leak hover:bg-white/10 transition cursor-pointer">
            <div class="flex items-center gap-3 mb-2">
              <i class="fas fa-\${leak.icon} text-red-400"></i>
              <span class="font-medium">\${leak.text}</span>
            </div>
            <p class="text-sm text-red-300">\${leak.value}</p>
          </div>
        \`).join('');
      } else {
        moneyLeaksList.innerHTML = '<div class="p-4 bg-green-500/10 rounded-xl border border-green-500/20"><p class="text-green-400 text-sm"><i class="fas fa-check-circle mr-2"></i>No significant money leaks detected!</p></div>';
      }

      // Growth Opportunities
      const growthList = document.getElementById('growthList');
      const opportunities = [];
      if (hotLeads > 0) {
        opportunities.push({ icon: 'fire', text: hotLeads + ' hot leads ready to close', value: '$' + growthPotential.toLocaleString() + ' annual potential' });
      }
      if (data.leads?.warm > 0) {
        opportunities.push({ icon: 'thermometer-half', text: (data.leads?.warm || 0) + ' warm leads to nurture', value: 'Future pipeline' });
      }
      opportunities.push({ icon: 'users', text: 'Referral program potential', value: 'Each member = 1.5 referrals avg' });

      growthList.innerHTML = opportunities.map(opp => \`
        <div class="p-4 bg-white/5 rounded-xl growth-opp hover:bg-white/10 transition cursor-pointer">
          <div class="flex items-center gap-3 mb-2">
            <i class="fas fa-\${opp.icon} text-green-400"></i>
            <span class="font-medium">\${opp.text}</span>
          </div>
          <p class="text-sm text-green-300">\${opp.value}</p>
        </div>
      \`).join('');

      // Priority Actions
      const actionsList = document.getElementById('actionsList');
      const actions = [];
      if (atRiskCount > 0) {
        actions.push({ icon: 'phone', text: 'Call ' + atRiskCount + ' at-risk members', action: 'retention', priority: 1 });
      }
      if (hotLeads > 0) {
        actions.push({ icon: 'user-plus', text: 'Follow up with ' + hotLeads + ' hot leads', action: 'leads', priority: 2 });
      }
      if (data.leads?.trial_scheduled > 0) {
        actions.push({ icon: 'calendar-check', text: 'Confirm ' + (data.leads?.trial_scheduled || 0) + ' scheduled trials', action: 'confirm', priority: 3 });
      }
      actions.push({ icon: 'bullhorn', text: 'Run a referral campaign', action: 'campaign', priority: 4 });

      actionsList.innerHTML = actions.slice(0, 4).map((action, idx) => \`
        <div onclick="executeAction('\${action.action}')" class="p-4 bg-white/5 rounded-xl action-item hover:bg-spark-coral/10 transition cursor-pointer group">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 bg-spark-coral/20 rounded-full flex items-center justify-center text-xs text-spark">\${idx + 1}</span>
              <i class="fas fa-\${action.icon} text-spark"></i>
              <span class="font-medium">\${action.text}</span>
            </div>
            <i class="fas fa-chevron-right text-gray-600 group-hover:text-spark transition"></i>
          </div>
        </div>
      \`).join('');

      // At-Risk List
      const atRiskList = document.getElementById('atRiskList');
      document.getElementById('atRiskBadge').textContent = atRiskCount;
      if (data.lists?.at_risk_students?.length > 0) {
        atRiskList.innerHTML = data.lists.at_risk_students.map(student => \`
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <span class="text-red-400 font-medium">\${student.first_name[0]}\${student.last_name[0]}</span>
              </div>
              <div>
                <p class="font-medium">\${student.first_name} \${student.last_name}</p>
                <p class="text-xs text-red-400">\${student.churn_risk} risk (\${student.churn_risk_score}%)</p>
              </div>
            </div>
            <button onclick="triggerCall('retention', \${student.id})" class="px-3 py-1.5 bg-spark-coral/20 hover:bg-spark-coral/30 text-spark rounded-lg text-sm transition">
              <i class="fas fa-phone mr-1"></i>Call
            </button>
          </div>
        \`).join('');
      }

      // Hot Leads List
      const hotLeadsList = document.getElementById('hotLeadsList');
      document.getElementById('hotLeadsBadge').textContent = hotLeads;
      if (data.lists?.hot_leads?.length > 0) {
        hotLeadsList.innerHTML = data.lists.hot_leads.map(lead => \`
          <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-spark-coral/20 rounded-full flex items-center justify-center">
                <span class="text-spark font-medium">\${lead.first_name[0]}\${(lead.last_name || 'X')[0]}</span>
              </div>
              <div>
                <p class="font-medium">\${lead.first_name} \${lead.last_name || ''}</p>
                <p class="text-xs text-spark">Score: \${lead.lead_score} | \${lead.source || 'Direct'}</p>
              </div>
            </div>
            <button onclick="triggerCall('lead', \${lead.id})" class="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition">
              <i class="fas fa-phone mr-1"></i>Call
            </button>
          </div>
        \`).join('');
      }

      // Recent Calls
      const recentCallsList = document.getElementById('recentCallsList');
      if (data.lists?.recent_ai_calls?.length > 0) {
        recentCallsList.innerHTML = data.lists.recent_ai_calls.slice(0, 4).map(call => {
          const sentimentColor = call.sentiment === 'positive' ? 'green' : call.sentiment === 'negative' ? 'red' : 'gray';
          const sentimentIcon = call.sentiment === 'positive' ? 'smile' : call.sentiment === 'negative' ? 'frown' : 'meh';
          return \`
            <div class="p-4 bg-white/5 rounded-xl">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-400">\${call.call_type.replace('_', ' ')}</span>
                <span class="text-\${sentimentColor}-400"><i class="fas fa-\${sentimentIcon}"></i></span>
              </div>
              <p class="text-sm font-medium capitalize mb-1">\${call.status}</p>
              <p class="text-xs text-gray-500">\${call.summary ? call.summary.substring(0, 50) + '...' : 'No summary'}</p>
            </div>
          \`;
        }).join('');
      }
    }

    async function seedDemoData() {
      try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Loading...';

        const res = await fetch('/spark/api/v1/seed-demo', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          alert('Demo data loaded! ' + data.summary.schools_created + ' schools with ' + data.summary.total_students + ' students created.');
          location.reload();
        }
      } catch (error) {
        console.error('Error seeding data:', error);
        alert('Error loading demo data');
      }
    }

    // =====================================================
    // SPARK VOICE INTEGRATION - Custom WebSocket Client
    // No ElevenLabs branding - uses direct WebSocket connection
    // =====================================================

    const SPARK_AGENT_ID = 'agent_5601kh453hqqfz59nfemkwk02vax';

    // Voice client state
    let voiceClient = null;
    let voiceStatus = 'disconnected'; // disconnected, connecting, connected

    // WebSocket Voice Client Class
    class SparkVoiceClient {
      constructor(options = {}) {
        this.tokenEndpoint = options.tokenEndpoint || '/spark/api/v1/voice/webrtc-token';
        this.dynamicVariables = options.dynamicVariables || {};
        this.onTranscript = options.onTranscript || (() => {});
        this.onStatusChange = options.onStatusChange || (() => {});
        this.onError = options.onError || console.error;

        this.status = 'disconnected';
        this.websocket = null;
        this.localStream = null;
        this.audioContext = null;
        this.scriptProcessor = null;
        this.audioQueue = [];
        this.isPlaying = false;
      }

      async connect() {
        if (this.status === 'connected' || this.status === 'connecting') return;
        this._setStatus('connecting');

        try {
          // Get microphone
          console.log('[SparkVoice] Getting microphone...');
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
            video: false
          });

          // Get signed URL
          console.log('[SparkVoice] Getting signed URL...');
          const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              school_id: this.dynamicVariables.school_id,
              language: this.dynamicVariables.language
            })
          });

          const data = await response.json();
          if (!data.success || !data.signed_url) {
            throw new Error(data.error || 'Failed to get voice token');
          }

          // Connect WebSocket
          console.log('[SparkVoice] Connecting WebSocket...');
          await this._connectWebSocket(data.signed_url);

          // Setup audio capture
          this._setupAudioCapture();
          console.log('[SparkVoice] Connected!');

        } catch (error) {
          console.error('[SparkVoice] Connection failed:', error);
          this._setStatus('disconnected');
          this.onError(error);
          this.disconnect();
          throw error;
        }
      }

      disconnect() {
        console.log('[SparkVoice] Disconnecting...');
        if (this.websocket) { this.websocket.close(); this.websocket = null; }
        if (this.scriptProcessor) { this.scriptProcessor.disconnect(); this.scriptProcessor = null; }
        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
        if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
        this.audioQueue = [];
        this.isPlaying = false;
        this._setStatus('disconnected');
      }

      _setStatus(status) {
        this.status = status;
        this.onStatusChange(status);
      }

      async _connectWebSocket(signedUrl) {
        return new Promise((resolve, reject) => {
          this.websocket = new WebSocket(signedUrl);

          this.websocket.onopen = () => {
            console.log('[WebSocket] Connected');
            if (Object.keys(this.dynamicVariables).length > 0) {
              this.websocket.send(JSON.stringify({
                type: 'conversation_initiation_client_data',
                conversation_initiation_client_data: { dynamic_variables: this.dynamicVariables }
              }));
            }
            this._setStatus('connected');
            resolve();
          };

          this.websocket.onmessage = async (event) => {
            try {
              const msg = JSON.parse(event.data);
              await this._handleMessage(msg);
            } catch (e) { console.error('[WebSocket] Message error:', e); }
          };

          this.websocket.onerror = (e) => { console.error('[WebSocket] Error:', e); reject(new Error('WebSocket failed')); };
          this.websocket.onclose = () => { console.log('[WebSocket] Closed'); this._setStatus('disconnected'); };
        });
      }

      async _handleMessage(msg) {
        if (msg.type === 'audio' || msg.audio) {
          const audio = msg.audio?.chunk || msg.audio_event?.audio_base_64 || msg.audio;
          if (audio && typeof audio === 'string') await this._playAudio(audio);
        } else if (msg.type === 'agent_response') {
          const text = msg.agent_response_event?.agent_response || msg.agent_response || msg.text;
          if (text) this.onTranscript('agent', text);
        } else if (msg.type === 'user_transcript') {
          const text = msg.user_transcription_event?.user_transcript || msg.user_transcript;
          if (text) this.onTranscript('user', text);
        } else if (msg.type === 'ping') {
          if (this.websocket?.readyState === WebSocket.OPEN) this.websocket.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'interruption') {
          this.audioQueue = [];
        } else if (msg.type === 'error') {
          this.onError(new Error(msg.error || msg.message || 'Server error'));
        }
      }

      _setupAudioCapture() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.localStream);
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.scriptProcessor.onaudioprocess = (event) => {
          if (this.websocket?.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          const bytes = new Uint8Array(pcm.buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          this.websocket.send(JSON.stringify({ user_audio_chunk: btoa(binary) }));
        };

        source.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
      }

      async _playAudio(base64) {
        try {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
          this.audioQueue.push(audioBuffer);
          if (!this.isPlaying) this._playNext();
        } catch (e) { console.warn('[Audio] Decode error:', e); }
      }

      _playNext() {
        if (this.audioQueue.length === 0) { this.isPlaying = false; return; }
        this.isPlaying = true;
        const buffer = this.audioQueue.shift();
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.onended = () => this._playNext();
        source.start(0);
      }
    }

    function talkToSpark() {
      if (!currentSchoolId) {
        alert('Please select a business first to talk to Spark');
        return;
      }
      openVoiceModal();
    }

    function openVoiceModal() {
      const modal = document.getElementById('voiceModal');
      const schoolNameEl = document.getElementById('widgetSchoolName');

      // Show modal
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      // Update school name
      const schoolSelect = document.getElementById('schoolSelect');
      const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
      schoolNameEl.textContent = selectedOption ? selectedOption.text : '';

      // Reset UI state
      updateVoiceUI('disconnected');
      document.getElementById('transcriptArea').classList.add('hidden');
      document.getElementById('transcriptContent').innerHTML = '';

      console.log('[Spark Voice] Modal opened for school:', currentSchoolId);
    }

    function closeVoiceModal() {
      const modal = document.getElementById('voiceModal');

      // Disconnect voice if connected
      if (voiceClient) {
        voiceClient.disconnect();
        voiceClient = null;
      }
      voiceStatus = 'disconnected';

      // Hide modal
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    async function toggleVoiceConnection() {
      const orbBtn = document.getElementById('voiceOrbBtn');

      if (voiceStatus === 'connected') {
        // Disconnect
        if (voiceClient) {
          voiceClient.disconnect();
          voiceClient = null;
        }
        voiceStatus = 'disconnected';
        updateVoiceUI('disconnected');
      } else if (voiceStatus === 'disconnected') {
        // Connect
        voiceStatus = 'connecting';
        updateVoiceUI('connecting');

        try {
          voiceClient = new SparkVoiceClient({
            dynamicVariables: {
              school_id: parseInt(currentSchoolId, 10),
              language: currentLanguage || 'en'
            },
            onStatusChange: (status) => {
              voiceStatus = status;
              updateVoiceUI(status);
            },
            onTranscript: (role, text) => {
              addTranscriptLine(role, text);
            },
            onError: (error) => {
              console.error('[Spark Voice] Error:', error);
              document.getElementById('voiceStatus').textContent = 'Error: ' + error.message;
              voiceStatus = 'disconnected';
              updateVoiceUI('disconnected');
            }
          });

          await voiceClient.connect();
        } catch (error) {
          console.error('[Spark Voice] Connection failed:', error);
          voiceStatus = 'disconnected';
          updateVoiceUI('disconnected');
        }
      }
    }

    function updateVoiceUI(status) {
      const orbBtn = document.getElementById('voiceOrbBtn');
      const orbIcon = document.getElementById('voiceOrbIcon');
      const statusEl = document.getElementById('voiceStatus');
      const transcriptArea = document.getElementById('transcriptArea');

      orbBtn.classList.remove('active', 'connecting');

      if (status === 'connected') {
        orbBtn.classList.add('active');
        orbIcon.innerHTML = '<i class="fas fa-stop text-white text-2xl"></i>';
        statusEl.textContent = 'Listening... Click orb to stop';
        transcriptArea.classList.remove('hidden');
      } else if (status === 'connecting') {
        orbBtn.classList.add('connecting');
        orbIcon.innerHTML = '<i class="fas fa-spinner fa-spin text-white text-2xl"></i>';
        statusEl.textContent = 'Connecting...';
      } else {
        orbIcon.innerHTML = '<i class="fas fa-microphone text-white text-2xl"></i>';
        statusEl.textContent = 'Click the orb below to start';
      }
    }

    function addTranscriptLine(role, text) {
      const container = document.getElementById('transcriptContent');
      const line = document.createElement('div');
      line.className = role === 'agent' ? 'text-amber-400' : 'text-blue-400';
      line.innerHTML = '<span class="font-semibold">' + (role === 'agent' ? 'Spark: ' : 'You: ') + '</span>' + text;
      container.appendChild(line);
      container.scrollTop = container.scrollHeight;
    }

    function triggerSparkCalls(type) {
      if (!currentSchoolId) {
        alert('Please select a business first');
        return;
      }
      const msg = type === 'retention'
        ? 'Spark will call all at-risk members with personalized retention messages.'
        : 'Spark will follow up with all hot leads to schedule trials.';
      alert(msg + '\\n\\n(Voice calling integration coming soon)');
    }

    function triggerCall(type, id) {
      console.log('Triggering', type, 'call for ID:', id);
      alert('Initiating Spark call...\\n\\n(Voice integration coming soon)');
    }

    function executeAction(action) {
      console.log('Executing action:', action);
      if (action === 'retention') triggerSparkCalls('retention');
      else if (action === 'leads') triggerSparkCalls('leads');
      else alert('Action: ' + action + '\\n\\n(Feature coming soon)');
    }

    function setLanguage(lang) {
      currentLanguage = lang;
      // Mobile buttons
      const enBtn = document.getElementById('langEn');
      const esBtn = document.getElementById('langEs');
      // Desktop buttons
      const enBtnDesktop = document.getElementById('langEnDesktop');
      const esBtnDesktop = document.getElementById('langEsDesktop');

      const activeClass = 'px-4 py-2 bg-white/10 rounded-lg text-sm font-medium border border-white/10';
      const inactiveClass = 'px-4 py-2 bg-white/5 rounded-lg text-sm border border-white/5';
      const activeClassDesktop = 'px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition border border-white/10';
      const inactiveClassDesktop = 'px-3 py-2 bg-white/5 hover:bg-white/20 rounded-lg text-sm transition border border-white/5';

      if (enBtn) enBtn.className = lang === 'en' ? activeClass : inactiveClass;
      if (esBtn) esBtn.className = lang === 'es' ? activeClass : inactiveClass;
      if (enBtnDesktop) enBtnDesktop.className = lang === 'en' ? activeClassDesktop : inactiveClassDesktop;
      if (esBtnDesktop) esBtnDesktop.className = lang === 'es' ? activeClassDesktop : inactiveClassDesktop;
    }
  </script>
</body>
</html>
  `);
});

module.exports = app;
