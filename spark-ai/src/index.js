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
