// kancho-ai/src/routes/admin-seed.js
// Server-side demo data seeder for Black Belt Academy
const router = require('express').Router();

// ===== NAME POOLS =====
const MN = ['Ethan','Lucas','Mason','Logan','Aiden','Noah','Liam','Oliver','James','Benjamin','Elijah','William','Henry','Alexander','Sebastian','Jack','Daniel','Michael','Owen','Carter','Jayden','Luke','Dylan','Grayson','Leo','Ryan','Nathan','Caleb','Hunter','Christian','Isaiah','Thomas','Aaron','Xavier','Eli','Landon','Austin','Connor','Ezra','Jose','Angel','Adrian','Miles','Nolan','Jaxon','Dominic','Gavin','Kai','Diego','Mateo','Anthony','Ian','Evan','Colton','Jeremiah','Max','Asher','Jordan','Cameron','Cooper','Roman'];
const FN = ['Sophia','Isabella','Olivia','Emma','Ava','Mia','Charlotte','Amelia','Harper','Evelyn','Abigail','Emily','Ella','Elizabeth','Sofia','Avery','Scarlett','Grace','Chloe','Victoria','Riley','Aria','Lily','Zoey','Penelope','Layla','Nora','Camila','Hannah','Addison','Luna','Savannah','Brooklyn','Elena','Natalie','Maya','Willow','Naomi','Aaliyah','Aubrey','Stella','Claire','Violet','Aurora','Madelyn','Kinsley','Quinn','Peyton','Skylar','Bella'];
const LN = ['Johnson','Garcia','Williams','Chen','Thompson','Martinez','Anderson','Taylor','Brown','Davis','Wilson','Moore','Jackson','Martin','Lee','Harris','Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Green','Baker','Adams','Nelson','Hill','Ramirez','Campbell','Mitchell','Roberts','Carter','Phillips','Evans','Turner','Torres','Parker','Collins','Edwards','Stewart','Flores','Morris','Nguyen','Murphy','Rivera','Cook','Rogers','Morgan','Peterson','Cooper','Reed','Bailey','Bell','Gomez','Kelly','Howard','Ward','Cox','Diaz','Richardson','Wood','Watson','Brooks','Bennett','Gray','Reyes','Cruz','Hughes','Price','Myers','Long','Foster','Sanders','Ross','Morales','Powell','Sullivan','Russell','Ortiz','Jenkins','Gutierrez','Perry','Butler','Barnes','Fisher','Henderson','Coleman','Simmons','Patterson','Jordan','Reynolds','Hamilton','Graham','Kim','Gonzalez','Alexander','Ramos','Wallace','Griffin','West','Cole','Hayes','Chavez','Gibson','Bryant','Ellis','Stevens','Murray','Freeman','Wells','Webb','Simpson','Washington','Patel'];

// ===== HELPERS =====
const rp = arr => arr[Math.floor(Math.random() * arr.length)];
const ri = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rd = (start, end) => { const s = new Date(start), e = new Date(end); return new Date(s.getTime() + Math.random() * (e.getTime() - s.getTime())).toISOString().split('T')[0]; };
const fmt = d => d.toISOString().split('T')[0];
let nameIdx = 0;
const uniqueName = (gender) => {
  const pool = gender === 'M' ? MN : FN;
  const first = pool[nameIdx % pool.length];
  const last = LN[(nameIdx * 7 + 13) % LN.length]; // deterministic but varied
  nameIdx++;
  return { first, last };
};

const SCHOOL_ID = 6;
const KARATE_BELTS = ['White','Yellow','Orange','Green','Blue','Purple','Brown','Black'];
const BJJ_BELTS = ['White','Blue','Purple','Brown','Black'];

function beltForMonths(months, isBJJ) {
  if (isBJJ) {
    if (months < 8) return 'White';
    if (months < 20) return Math.random() > 0.3 ? 'Blue' : 'White';
    if (months < 36) return rp(['Blue','Purple']);
    if (months < 54) return rp(['Purple','Brown']);
    return rp(['Brown','Black']);
  }
  if (months < 3) return 'White';
  if (months < 6) return rp(['White','Yellow']);
  if (months < 10) return rp(['Yellow','Orange']);
  if (months < 16) return rp(['Orange','Green']);
  if (months < 24) return rp(['Green','Blue']);
  if (months < 32) return rp(['Blue','Purple']);
  if (months < 42) return rp(['Purple','Brown']);
  return rp(['Brown','Black']);
}

// ===== MAIN SEED ENDPOINT =====
router.post('/seed-demo', async (req, res) => {
  if (req.query.key !== 'kancho-demo-2026') return res.status(403).json({ error: 'Invalid key' });

  const db = require('../../models');
  const seq = db.sequelize;
  const Op = db.Sequelize.Op;
  const summary = {};

  try {
    // ==========================================
    // 1. CLEANUP - Delete all existing school 6 data
    // ==========================================
    const delTables = [
      'kancho_attendance','kancho_class_enrollments','kancho_payments',
      'kancho_subscriptions','kancho_promotions','kancho_communications',
      'kancho_ai_calls','kancho_tasks','kancho_students','kancho_leads',
      'kancho_families','kancho_instructors','kancho_classes',
      'kancho_membership_plans','kancho_automations','kancho_campaigns',
      'kancho_funnels','kancho_appointments','kancho_revenue',
      'kancho_health_scores','kancho_business_health_metrics',
      'kancho_belt_requirements','kancho_merchandise','kancho_locations'
    ];
    for (const t of delTables) {
      try { await seq.query(`DELETE FROM ${t} WHERE school_id = ${SCHOOL_ID}`); } catch(e) {}
    }
    console.log('SEED: Cleanup complete');
    nameIdx = 0;

    // ==========================================
    // 2. UPDATE SCHOOL PROFILE
    // ==========================================
    await db.KanchoSchool.update({
      name: 'Black Belt Academy',
      owner_name: 'Grandmaster Tony Chen',
      owner_phone: '+18135550100',
      address: '4521 West Kennedy Blvd',
      city: 'Tampa', state: 'FL', zip: '33609', country: 'USA',
      timezone: 'America/New_York',
      martial_art_type: 'Karate, Brazilian Jiu-Jitsu',
      plan_type: 'pro',
      monthly_revenue_target: 35000,
      student_capacity: 300,
      active_students: 195,
      status: 'active',
      ai_enabled: true,
      voice_agent: 'kancho'
    }, { where: { id: SCHOOL_ID } });

    // ==========================================
    // 3. LOCATION
    // ==========================================
    await db.KanchoLocation.create({
      school_id: SCHOOL_ID, name: 'Black Belt Academy - Main', address: '4521 West Kennedy Blvd',
      city: 'Tampa', state: 'FL', zip: '33609', phone: '+18135550100',
      email: 'info@blackbeltacademy.com', timezone: 'America/New_York',
      business_hours: { mon:{open:'09:00',close:'21:00'}, tue:{open:'09:00',close:'21:00'}, wed:{open:'09:00',close:'21:00'}, thu:{open:'09:00',close:'21:00'}, fri:{open:'09:00',close:'21:00'}, sat:{open:'08:00',close:'15:00'}, sun:{open:'10:00',close:'13:00'} },
      is_primary: true, capacity: 120
    });

    // ==========================================
    // 4. STAFF (6)
    // ==========================================
    const staffData = [
      { first_name:'Tony', last_name:'Chen', email:'tony@blackbeltacademy.com', phone:'+18135550101', role:'head_instructor', belt_rank:'5th Dan Black Belt', specialties:['Karate','Kata','Leadership'], bio:'Grandmaster Chen founded Black Belt Academy in 2010. 35+ years of martial arts experience.', hire_date:'2020-01-01', pay_type:'salary', pay_rate:8000 },
      { first_name:'Sarah', last_name:'Rodriguez', email:'sarah@blackbeltacademy.com', phone:'+18135550102', role:'instructor', belt_rank:'3rd Dan Black Belt', specialties:['Kids Karate','After School','Character Development'], bio:'Director of youth programs. Certified child development specialist with 12 years teaching experience.', hire_date:'2021-03-15', pay_type:'salary', pay_rate:5500 },
      { first_name:'Marcus', last_name:'Silva', email:'marcus@blackbeltacademy.com', phone:'+18135550103', role:'instructor', belt_rank:'Black Belt BJJ', specialties:['Brazilian Jiu-Jitsu','No-Gi','Competition Coaching'], bio:'Head BJJ coach. Former IBJJF competitor with multiple gold medals. 15 years on the mat.', hire_date:'2021-09-01', pay_type:'salary', pay_rate:6000 },
      { first_name:'Jake', last_name:'Williams', email:'jake@blackbeltacademy.com', phone:'+18135550104', role:'instructor', belt_rank:'2nd Dan Black Belt', specialties:['Teen Program','Sparring','Competition Training'], bio:'Competition team coach. Produces state and national champions consistently.', hire_date:'2022-06-01', pay_type:'hourly', pay_rate:35 },
      { first_name:'Emily', last_name:'Park', email:'emily@blackbeltacademy.com', phone:'+18135550105', role:'assistant', belt_rank:'1st Dan Black Belt', specialties:['Beginner Classes','Fitness','Self-Defense'], bio:'Assistant instructor specializing in beginner-friendly classes and women\'s self-defense.', hire_date:'2023-01-15', pay_type:'hourly', pay_rate:28 },
      { first_name:'Amanda', last_name:'Torres', email:'amanda@blackbeltacademy.com', phone:'+18135550106', role:'admin', belt_rank:'Green Belt', specialties:['Front Desk','Enrollment','Scheduling'], bio:'Operations manager handling enrollment, scheduling, and parent communications.', hire_date:'2023-06-01', pay_type:'hourly', pay_rate:20 }
    ];
    const staffRecords = [];
    for (const s of staffData) {
      const r = await db.KanchoInstructor.create({ school_id: SCHOOL_ID, ...s, is_active: true });
      staffRecords.push(r);
    }
    summary.staff = staffRecords.length;

    // ==========================================
    // 5. CLASSES (~45/week)
    // ==========================================
    const classData = [
      // Kids Karate (12 classes/week)
      { name:'Little Dragons (Ages 4-6)', program_type:'kids', martial_art:'Karate', level:'beginner', schedule:{days:['Mon','Wed','Fri'],time:'16:00',end:'16:45'}, duration_minutes:45, capacity:15, instructor:'Sarah Rodriguez', price:0 },
      { name:'Kids Beginner (Ages 7-9)', program_type:'kids', martial_art:'Karate', level:'beginner', schedule:{days:['Mon','Wed','Fri'],time:'17:00',end:'17:45'}, duration_minutes:45, capacity:20, instructor:'Sarah Rodriguez', price:0 },
      { name:'Kids Advanced (Ages 7-12)', program_type:'kids', martial_art:'Karate', level:'intermediate', schedule:{days:['Mon','Wed','Fri'],time:'17:45',end:'18:30'}, duration_minutes:45, capacity:20, instructor:'Emily Park', price:0 },
      { name:'Kids All Levels', program_type:'kids', martial_art:'Karate', level:'all', schedule:{days:['Tue','Thu'],time:'16:30',end:'17:15'}, duration_minutes:45, capacity:20, instructor:'Sarah Rodriguez', price:0 },
      { name:'Kids Saturday Open Mat', program_type:'kids', martial_art:'Karate', level:'all', schedule:{days:['Sat'],time:'10:00',end:'10:45'}, duration_minutes:45, capacity:25, instructor:'Emily Park', price:0 },
      // Teen (6 classes/week)
      { name:'Teen Martial Arts MWF', program_type:'teens', martial_art:'Karate', level:'all', schedule:{days:['Mon','Wed','Fri'],time:'18:30',end:'19:15'}, duration_minutes:45, capacity:20, instructor:'Jake Williams', price:0 },
      { name:'Teen Martial Arts TTh', program_type:'teens', martial_art:'Karate', level:'all', schedule:{days:['Tue','Thu'],time:'17:15',end:'18:00'}, duration_minutes:45, capacity:20, instructor:'Jake Williams', price:0 },
      { name:'Teen Saturday', program_type:'teens', martial_art:'Karate', level:'all', schedule:{days:['Sat'],time:'11:00',end:'11:45'}, duration_minutes:45, capacity:20, instructor:'Jake Williams', price:0 },
      // Adult BJJ (10 classes/week)
      { name:'Adult BJJ Evening MWF', program_type:'adult', martial_art:'Brazilian Jiu-Jitsu', level:'all', schedule:{days:['Mon','Wed','Fri'],time:'19:30',end:'20:45'}, duration_minutes:75, capacity:25, instructor:'Marcus Silva', price:0 },
      { name:'Adult BJJ Evening TTh', program_type:'adult', martial_art:'Brazilian Jiu-Jitsu', level:'all', schedule:{days:['Tue','Thu'],time:'18:15',end:'19:30'}, duration_minutes:75, capacity:25, instructor:'Marcus Silva', price:0 },
      { name:'BJJ Noon Class', program_type:'adult', martial_art:'Brazilian Jiu-Jitsu', level:'all', schedule:{days:['Tue','Thu'],time:'12:00',end:'13:00'}, duration_minutes:60, capacity:15, instructor:'Marcus Silva', price:0 },
      { name:'No-Gi Grappling', program_type:'adult', martial_art:'Brazilian Jiu-Jitsu', level:'intermediate', schedule:{days:['Mon','Wed'],time:'20:45',end:'21:30'}, duration_minutes:45, capacity:15, instructor:'Marcus Silva', price:0 },
      { name:'BJJ Saturday', program_type:'adult', martial_art:'Brazilian Jiu-Jitsu', level:'all', schedule:{days:['Sat'],time:'12:00',end:'13:15'}, duration_minutes:75, capacity:25, instructor:'Marcus Silva', price:0 },
      // After School (5 classes/week)
      { name:'After School Program', program_type:'after_school', martial_art:'Karate', level:'all', schedule:{days:['Mon','Tue','Wed','Thu','Fri'],time:'15:00',end:'16:00'}, duration_minutes:60, capacity:30, instructor:'Emily Park', price:0 },
      // Competition Team (3 classes/week)
      { name:'Competition Training TTh', program_type:'competition', martial_art:'Mixed', level:'advanced', schedule:{days:['Tue','Thu'],time:'19:30',end:'21:00'}, duration_minutes:90, capacity:15, instructor:'Jake Williams', price:0 },
      { name:'Competition Saturday', program_type:'competition', martial_art:'Mixed', level:'advanced', schedule:{days:['Sat'],time:'13:30',end:'15:00'}, duration_minutes:90, capacity:15, instructor:'Jake Williams', price:0 },
      // Special classes (9 classes/week to reach ~45)
      { name:'Open Mat Friday', program_type:'open', martial_art:'Mixed', level:'all', schedule:{days:['Fri'],time:'20:00',end:'21:30'}, duration_minutes:90, capacity:30, instructor:'Tony Chen', price:0 },
      { name:'Weapons & Kata', program_type:'workshop', martial_art:'Karate', level:'intermediate', schedule:{days:['Sat'],time:'09:00',end:'09:45'}, duration_minutes:45, capacity:15, instructor:'Tony Chen', price:0 },
      { name:'Women\'s Self-Defense', program_type:'workshop', martial_art:'Self Defense', level:'beginner', schedule:{days:['Wed'],time:'18:00',end:'18:45'}, duration_minutes:45, capacity:20, instructor:'Emily Park', price:0 },
      { name:'Family Martial Arts Sunday', program_type:'family', martial_art:'Karate', level:'all', schedule:{days:['Sun'],time:'10:00',end:'11:00'}, duration_minutes:60, capacity:30, instructor:'Sarah Rodriguez', price:0 },
      { name:'Early Morning Kickboxing', program_type:'fitness', martial_art:'Kickboxing', level:'all', schedule:{days:['Tue','Thu'],time:'06:00',end:'06:45'}, duration_minutes:45, capacity:20, instructor:'Emily Park', price:0 },
      { name:'Private Lessons', program_type:'private', martial_art:'Mixed', level:'all', schedule:{days:['Mon','Tue','Wed','Thu','Fri'],time:'14:00',end:'15:00'}, duration_minutes:60, capacity:1, instructor:'Tony Chen', price:75 }
    ];
    const classRecords = [];
    for (const c of classData) {
      const r = await db.KanchoClass.create({ school_id: SCHOOL_ID, ...c, is_active: true });
      classRecords.push(r);
    }
    const classIds = classRecords.map(c => c.id);
    // Map program types to class IDs for attendance
    const classByProgram = {};
    classRecords.forEach(c => {
      const p = c.program_type;
      if (!classByProgram[p]) classByProgram[p] = [];
      classByProgram[p].push(c.id);
    });
    summary.classes = classRecords.length;

    // ==========================================
    // 6. MEMBERSHIP PLANS
    // ==========================================
    const planData = [
      { name:'Kids Karate Membership', type:'individual', billing_frequency:'monthly', price:159, classes_per_week:3, sort_order:0, features:['3 classes per week','Belt testing included','Uniform included first year','Character development curriculum'] },
      { name:'Teen Martial Arts', type:'individual', billing_frequency:'monthly', price:169, classes_per_week:3, sort_order:1, features:['3 classes per week','Competition eligibility','Anti-bullying training','Leadership development'] },
      { name:'Adult BJJ Membership', type:'individual', billing_frequency:'monthly', price:189, classes_per_week:99, sort_order:2, features:['Unlimited classes','Gi and No-Gi training','Open mat access','Competition preparation'] },
      { name:'After School Program', type:'individual', billing_frequency:'monthly', price:299, classes_per_week:5, sort_order:3, features:['Mon-Fri 3-6pm coverage','Homework assistance','Martial arts training','Healthy snacks provided','School pickup available'] },
      { name:'Competition Team', type:'premium', billing_frequency:'monthly', price:249, classes_per_week:99, sort_order:4, features:['Unlimited classes + comp training','Tournament entry fees included','Private coaching sessions','Competition gear discounts','Travel team eligible'] },
      { name:'Family Plan (2+ members)', type:'family', billing_frequency:'monthly', price:329, classes_per_week:99, family_discount_percent:20, max_family_members:4, sort_order:5, features:['Up to 4 family members','20% family discount','All programs included','Family events access'] },
      { name:'Drop-In Class', type:'drop_in', billing_frequency:'one_time', price:25, classes_per_week:1, sort_order:6, features:['Single class visit','Any program','No commitment'] },
      { name:'2-Week Free Trial', type:'trial', billing_frequency:'one_time', price:0, trial_days:14, classes_per_week:99, sort_order:7, features:['2 weeks unlimited access','Free uniform loan','Placement assessment','No obligation'] }
    ];
    for (const p of planData) {
      await db.KanchoMembershipPlan.create({ school_id: SCHOOL_ID, ...p, is_active: true });
    }
    summary.plans = planData.length;

    // ==========================================
    // 7. FAMILIES (45)
    // ==========================================
    const familyRecords = [];
    for (let i = 0; i < 45; i++) {
      const ln = LN[i % LN.length];
      const parent1G = Math.random() > 0.5 ? 'M' : 'F';
      const p1First = parent1G === 'M' ? MN[ri(0, MN.length-1)] : FN[ri(0, FN.length-1)];
      const r = await db.KanchoFamily.create({
        school_id: SCHOOL_ID,
        family_name: ln + ' Family',
        primary_contact_name: p1First + ' ' + ln,
        primary_contact_email: p1First.toLowerCase() + '.' + ln.toLowerCase() + '@email.com',
        primary_contact_phone: '+1813555' + String(2000 + i).padStart(4, '0'),
        city: 'Tampa', state: 'FL', zip: '336' + String(ri(0,15)).padStart(2, '0'),
        billing_method: Math.random() > 0.15 ? 'credit_card' : 'bank_transfer',
        is_active: true
      });
      familyRecords.push(r);
    }
    summary.families = familyRecords.length;

    // ==========================================
    // 8. STUDENTS (220) - Generate programmatically
    // ==========================================
    const today = new Date('2026-03-06');
    const allStudents = [];

    // Helper to create a student object
    function makeStudent(overrides) {
      const gender = Math.random() > 0.45 ? 'M' : 'F';
      const n = uniqueName(gender);
      const base = {
        school_id: SCHOOL_ID,
        first_name: n.first, last_name: n.last,
        email: n.first.toLowerCase() + '.' + n.last.toLowerCase() + nameIdx + '@email.com',
        phone: '+1813555' + String(3000 + nameIdx).padStart(4, '0'),
        status: 'active', churn_risk: 'low', churn_risk_score: ri(5, 30),
        belt_stripes: ri(0, 3),
        payment_status: 'current'
      };
      return { ...base, ...overrides };
    }

    // --- 15 AT-RISK students (explicit) ---
    const atRiskDefs = [
      { first_name:'Marcus', last_name:'Rivera', membership_type:'adult_bjj', belt_rank:'Blue', churn_risk:'critical', churn_risk_score:92, notes:'Attendance dropped from 4x/week to 0x/week in last 3 weeks. Previously most engaged adult BJJ member.', engagement:'inactive', date_of_birth:'1991-04-15', enrollment_date:'2024-01-10', total_classes:285, attendance_streak:0 },
      { first_name:'David', last_name:'Park', membership_type:'adult_bjj', belt_rank:'Purple', churn_risk:'critical', churn_risk_score:90, notes:'Mentioned considering another gym. Attendance declining steadily. Hasnt responded to last 2 check-in messages.', engagement:'declining', date_of_birth:'1988-09-22', enrollment_date:'2023-06-01', total_classes:340, attendance_streak:0 },
      { first_name:'Nicole', last_name:'Foster', membership_type:'kids_karate', belt_rank:'Yellow', churn_risk:'critical', churn_risk_score:88, notes:'No class attendance for 28 days. Account still active with autopay running. Parent not responding to calls.', engagement:'inactive', date_of_birth:'2015-03-18', enrollment_date:'2025-02-01', total_classes:45, attendance_streak:0, parent_guardian:{name:'Rachel Foster',phone:'+18135559001'} },
      { first_name:'Tyler', last_name:'Bennett', membership_type:'adult_bjj', belt_rank:'White', churn_risk:'critical', churn_risk_score:85, notes:'Two consecutive payment failures. Card on file expired. Last attendance 18 days ago.', engagement:'inactive', date_of_birth:'1995-07-30', enrollment_date:'2025-06-15', total_classes:52, attendance_streak:0, payment_status:'failed' },
      { first_name:'Amanda', last_name:'Nguyen', membership_type:'teen_martial_arts', belt_rank:'Orange', churn_risk:'high', churn_risk_score:82, notes:'Last payment failed March 1st. No response to payment reminder SMS. Was attending regularly before.', engagement:'declining', date_of_birth:'2009-11-05', enrollment_date:'2024-09-01', total_classes:98, attendance_streak:0, payment_status:'failed', parent_guardian:{name:'Tran Nguyen',phone:'+18135559002'} },
      { first_name:'Jason', last_name:'Moore', membership_type:'adult_bjj', belt_rank:'Blue', churn_risk:'high', churn_risk_score:78, notes:'Attendance declining 3 weeks. Dropped from 3x/week to once in last 2 weeks.', engagement:'declining', date_of_birth:'1993-02-14', enrollment_date:'2024-03-01', total_classes:175, attendance_streak:1 },
      { first_name:'Sarah', last_name:'Kim', membership_type:'kids_karate', belt_rank:'White', churn_risk:'high', churn_risk_score:76, notes:'Trial class attended Feb 15. No membership signup. No response to follow-up calls.', engagement:'inactive', status:'trial', date_of_birth:'2016-08-20', enrollment_date:'2026-02-15', total_classes:2, attendance_streak:0, parent_guardian:{name:'Min-Ji Kim',phone:'+18135559003'} },
      { first_name:'Brandon', last_name:'Torres', membership_type:'teen_martial_arts', belt_rank:'White', churn_risk:'high', churn_risk_score:75, notes:'Trial expired 10 days ago. Showed strong interest but hasnt committed to membership.', engagement:'inactive', status:'trial', date_of_birth:'2010-05-12', enrollment_date:'2026-02-10', total_classes:4, attendance_streak:0, parent_guardian:{name:'Luis Torres',phone:'+18135559004'} },
      { first_name:'Crystal', last_name:'Lewis', membership_type:'adult_bjj', belt_rank:'White', churn_risk:'high', churn_risk_score:73, notes:'Payment 15 days overdue. Manually pays each month. Hasnt come in to pay or train.', engagement:'inactive', date_of_birth:'1990-12-08', enrollment_date:'2025-08-01', total_classes:68, attendance_streak:0, payment_status:'overdue' },
      { first_name:'Ryan', last_name:'Mitchell', membership_type:'kids_karate', belt_rank:'Green', churn_risk:'high', churn_risk_score:72, notes:'Missed last 8 scheduled classes. Was regular 2x/week attendee. Parent says schedule changed.', engagement:'inactive', date_of_birth:'2013-06-25', enrollment_date:'2024-01-15', total_classes:142, attendance_streak:0, parent_guardian:{name:'Jennifer Mitchell',phone:'+18135559005'} },
      { first_name:'Megan', last_name:'Clark', membership_type:'competition_team', belt_rank:'Brown', churn_risk:'high', churn_risk_score:71, notes:'Dropped from 3x/week to 1x/week over past month. May be losing interest in competition.', engagement:'declining', date_of_birth:'2008-01-30', enrollment_date:'2022-06-01', total_classes:395, attendance_streak:1 },
      { first_name:'Justin', last_name:'Hall', membership_type:'adult_bjj', belt_rank:'Blue', churn_risk:'high', churn_risk_score:70, notes:'No attendance in 21 days. Adult BJJ member for 8 months. Not responding to text check-ins.', engagement:'inactive', date_of_birth:'1997-10-18', enrollment_date:'2025-07-01', total_classes:88, attendance_streak:0 },
      { first_name:'Priya', last_name:'Patel', membership_type:'after_school', belt_rank:'Yellow', churn_risk:'high', churn_risk_score:69, notes:'Account frozen 45 days ago. Was supposed to return this month. Parent hasnt confirmed.', engagement:'inactive', status:'frozen', date_of_birth:'2014-04-22', enrollment_date:'2024-08-15', total_classes:115, attendance_streak:0, parent_guardian:{name:'Raj Patel',phone:'+18135559006'} },
      { first_name:'Derek', last_name:'Washington', membership_type:'competition_team', belt_rank:'Purple', churn_risk:'high', churn_risk_score:68, notes:'Last visit 25 days ago. Competition season ended. May not return for off-season training.', engagement:'inactive', date_of_birth:'2007-09-03', enrollment_date:'2023-01-15', total_classes:310, attendance_streak:0 },
      { first_name:'Samantha', last_name:'Rodriguez', membership_type:'teen_martial_arts', belt_rank:'Green', churn_risk:'high', churn_risk_score:65, notes:'No belt promotion in 18 months. Expressed frustration about progress to instructor.', engagement:'declining', date_of_birth:'2009-07-14', enrollment_date:'2023-03-01', total_classes:225, attendance_streak:2, parent_guardian:{name:'Maria Rodriguez',phone:'+18135559007'} }
    ];

    for (const ar of atRiskDefs) {
      const s = makeStudent(ar);
      s.email = ar.first_name.toLowerCase() + '.' + ar.last_name.toLowerCase() + '@email.com';
      s.phone = '+1813555' + String(9000 + atRiskDefs.indexOf(ar)).padStart(4, '0');
      allStudents.push(s);
    }

    // --- Program definitions for bulk generation ---
    const programs = [
      { type:'kids_karate', count:68, price:159, ageMin:5, ageMax:12, isBJJ:false, needsParent:true },
      { type:'teen_martial_arts', count:30, price:169, ageMin:13, ageMax:17, isBJJ:false, needsParent:true },
      { type:'adult_bjj', count:48, price:189, ageMin:18, ageMax:55, isBJJ:true, needsParent:false },
      { type:'after_school', count:20, price:299, ageMin:6, ageMax:12, isBJJ:false, needsParent:true },
      { type:'competition_team', count:14, price:249, ageMin:12, ageMax:35, isBJJ:false, needsParent:false }
    ]; // 180 regular active

    let familyIdx = 0;
    for (const prog of programs) {
      for (let i = 0; i < prog.count; i++) {
        const monthsTraining = ri(2, 48);
        const enrollDate = new Date(today);
        enrollDate.setMonth(enrollDate.getMonth() - monthsTraining);
        const age = ri(prog.ageMin, prog.ageMax);
        const dobYear = 2026 - age;
        const engagementRoll = Math.random();
        let engagement = 'normal';
        if (engagementRoll < 0.35) engagement = 'high';
        else if (engagementRoll > 0.85) engagement = 'declining';

        const s = makeStudent({
          membership_type: prog.type,
          belt_rank: beltForMonths(monthsTraining, prog.isBJJ),
          date_of_birth: dobYear + '-' + String(ri(1,12)).padStart(2,'0') + '-' + String(ri(1,28)).padStart(2,'0'),
          enrollment_date: fmt(enrollDate),
          total_classes: Math.round(monthsTraining * ri(6, 14)),
          attendance_streak: engagement === 'high' ? ri(8, 30) : engagement === 'normal' ? ri(2, 12) : ri(0, 2),
          churn_risk_score: engagement === 'declining' ? ri(35, 55) : ri(5, 30),
          churn_risk: engagement === 'declining' ? 'medium' : 'low',
          engagement
        });

        if (prog.needsParent && age < 16) {
          const fam = familyRecords[familyIdx % familyRecords.length];
          s.family_id = fam.id;
          s.parent_guardian = { name: fam.primary_contact_name, phone: fam.primary_contact_phone };
          familyIdx++;
        }

        // 85% autopay, 10% manual, 5% issues
        const payRoll = Math.random();
        if (payRoll > 0.95) { s.payment_status = 'overdue'; s.churn_risk = 'medium'; s.churn_risk_score = ri(40, 60); }
        else if (payRoll > 0.85) s.payment_status = 'manual';

        allStudents.push(s);
      }
    }

    // --- 8 INACTIVE students ---
    for (let i = 0; i < 8; i++) {
      allStudents.push(makeStudent({
        status: 'inactive', membership_type: rp(['kids_karate','teen_martial_arts','adult_bjj']),
        belt_rank: rp(['White','Yellow','Orange']), engagement: 'inactive',
        date_of_birth: rd('1990-01-01','2016-01-01'), enrollment_date: rd('2024-01-01','2025-09-01'),
        total_classes: ri(15, 80), attendance_streak: 0, churn_risk: 'high', churn_risk_score: ri(60, 80),
        notes: rp(['Moved out of area','Work schedule conflict','Financial reasons','Lost interest'])
      }));
    }

    // --- 10 CANCELLED students ---
    for (let i = 0; i < 10; i++) {
      allStudents.push(makeStudent({
        status: 'cancelled', membership_type: rp(['kids_karate','teen_martial_arts','adult_bjj','after_school']),
        belt_rank: rp(['White','Yellow','Orange','Green']), engagement: 'inactive',
        date_of_birth: rd('1988-01-01','2015-01-01'), enrollment_date: rd('2023-06-01','2025-06-01'),
        total_classes: ri(20, 150), attendance_streak: 0, churn_risk: 'low', churn_risk_score: 0,
        notes: rp(['Relocated to another city','Switched to another school','Graduated/aged out','Season ended - may return'])
      }));
    }

    // --- 7 TRIAL students ---
    for (let i = 0; i < 7; i++) {
      allStudents.push(makeStudent({
        status: 'trial', membership_type: rp(['kids_karate','teen_martial_arts','adult_bjj']),
        belt_rank: 'White', engagement: 'normal',
        date_of_birth: rd('1990-01-01','2017-01-01'), enrollment_date: rd('2026-02-20','2026-03-05'),
        total_classes: ri(1, 5), attendance_streak: ri(1, 3), churn_risk: 'medium', churn_risk_score: ri(40, 55),
        notes: 'Currently on 2-week free trial'
      }));
    }

    // Remove engagement field (not in model) and bulkCreate
    const studentInserts = allStudents.map(s => {
      const { engagement, ...rest } = s;
      return rest;
    });
    const createdStudents = await db.KanchoStudent.bulkCreate(studentInserts, { returning: true, validate: false });
    // Map engagement levels back for attendance generation
    const studentEngagements = allStudents.map((s, i) => ({
      id: createdStudents[i].id,
      engagement: s.engagement || 'normal',
      program: s.membership_type,
      status: s.status
    }));
    summary.students = { total: createdStudents.length, active: allStudents.filter(s => s.status === 'active').length, trial: allStudents.filter(s => s.status === 'trial').length, inactive: allStudents.filter(s => s.status === 'inactive').length, cancelled: allStudents.filter(s => s.status === 'cancelled').length, at_risk: allStudents.filter(s => ['high','critical'].includes(s.churn_risk)).length };

    // ==========================================
    // 9. ATTENDANCE (90 days)
    // ==========================================
    const attendanceRecords = [];
    const startDate = new Date('2025-12-06');
    const endDate = new Date('2026-03-06');

    for (const se of studentEngagements) {
      if (se.status === 'cancelled') continue; // No attendance for cancelled
      const progClasses = classByProgram[se.program === 'competition_team' ? 'competition' : se.program === 'kids_karate' ? 'kids' : se.program === 'teen_martial_arts' ? 'teens' : se.program === 'adult_bjj' ? 'adult' : se.program === 'after_school' ? 'after_school' : 'kids'] || classIds;

      const d = new Date(startDate);
      while (d <= endDate) {
        if (d.getDay() !== 0) { // Skip Sundays
          let prob;
          const daysSinceStart = (d - startDate) / 86400000;
          const daysFromEnd = (endDate - d) / 86400000;

          if (se.engagement === 'high') prob = 0.55;
          else if (se.engagement === 'normal') prob = 0.28;
          else if (se.engagement === 'declining') {
            prob = daysSinceStart < 60 ? 0.35 : 0.05;
          } else { // inactive
            prob = daysFromEnd > 21 ? 0.2 : 0;
          }

          if (se.status === 'inactive') prob = daysFromEnd > 30 ? 0.15 : 0;
          if (se.status === 'trial') prob = daysFromEnd < 14 ? 0.5 : 0;

          if (Math.random() < prob) {
            attendanceRecords.push({
              school_id: SCHOOL_ID,
              student_id: se.id,
              class_id: rp(progClasses),
              date: fmt(d),
              status: Math.random() > 0.95 ? 'late' : 'present',
              recorded_by: 'system'
            });
          }
        }
        d.setDate(d.getDate() + 1);
      }
    }

    // Bulk insert attendance in chunks
    for (let i = 0; i < attendanceRecords.length; i += 500) {
      await db.KanchoAttendance.bulkCreate(attendanceRecords.slice(i, i + 500), { validate: false });
    }
    summary.attendance = attendanceRecords.length;

    // ==========================================
    // 10. LEADS (75)
    // ==========================================
    const leadSources = ['website','google','facebook','instagram','referral','walk_in','yelp','tiktok','community_event'];
    const leadInterests = ['Kids Karate','Teen Martial Arts','Adult BJJ','After School Program','Self-Defense','Family classes','Competition Team','Fitness Kickboxing'];
    const leadStatuses = ['new','contacted','trial_scheduled','trial_completed','follow_up','lost','unresponsive'];
    const leadTemps = ['hot','warm','cold'];

    const leadInserts = [];
    for (let i = 0; i < 75; i++) {
      const gender = Math.random() > 0.45 ? 'M' : 'F';
      const n = uniqueName(gender);
      const temp = i < 18 ? rp(['hot','warm']) : i < 45 ? 'warm' : 'cold';
      const status = i < 18 ? rp(['new','contacted','trial_scheduled']) : rp(leadStatuses);
      leadInserts.push({
        school_id: SCHOOL_ID,
        first_name: n.first, last_name: n.last,
        email: n.first.toLowerCase() + '.' + n.last.toLowerCase() + (i+1) + '@email.com',
        phone: '+1813555' + String(4000 + i).padStart(4, '0'),
        source: rp(leadSources),
        interest: rp(leadInterests),
        status, temperature: temp,
        lead_score: temp === 'hot' ? ri(75, 98) : temp === 'warm' ? ri(45, 74) : ri(10, 44),
        trial_date: status === 'trial_scheduled' ? rd('2026-03-07','2026-03-20') : status === 'trial_completed' ? rd('2026-02-15','2026-03-05') : null,
        follow_up_date: ['contacted','follow_up'].includes(status) ? rd('2026-03-07','2026-03-15') : null,
        contact_attempts: status === 'new' ? 0 : ri(1, 5),
        preferred_contact_method: rp(['phone','email','sms','any']),
        notes: status === 'trial_scheduled' ? 'Trial class scheduled - follow up to confirm' :
               status === 'trial_completed' ? 'Completed trial - follow up for enrollment' :
               status === 'lost' ? rp(['Price too high','Found another school','Schedule conflict','Not interested anymore']) :
               'Interested in ' + rp(leadInterests),
        utm_source: Math.random() > 0.6 ? rp(['google','facebook','instagram']) : null,
        utm_medium: Math.random() > 0.6 ? rp(['cpc','social','referral']) : null
      });
    }
    await db.KanchoLead.bulkCreate(leadInserts, { validate: false });
    summary.leads = { total: 75, hot: leadInserts.filter(l => l.temperature === 'hot').length, warm: leadInserts.filter(l => l.temperature === 'warm').length, cold: leadInserts.filter(l => l.temperature === 'cold').length, trials_booked: leadInserts.filter(l => l.status === 'trial_scheduled').length };

    // ==========================================
    // 11. PAYMENTS (3 months history)
    // ==========================================
    const paymentRecords = [];
    const months = ['2026-01','2026-02','2026-03'];
    const priceMap = { kids_karate:159, teen_martial_arts:169, adult_bjj:189, after_school:299, competition_team:249 };

    for (const student of createdStudents) {
      if (['cancelled'].includes(allStudents[createdStudents.indexOf(student)]?.status)) continue;
      const mType = allStudents[createdStudents.indexOf(student)]?.membership_type;
      const price = priceMap[mType] || 159;
      const isActive = allStudents[createdStudents.indexOf(student)]?.status === 'active';
      const pStatus = allStudents[createdStudents.indexOf(student)]?.payment_status;

      for (const m of months) {
        if (!isActive && m === '2026-03') continue;
        const isFailed = pStatus === 'failed' && m === '2026-03';
        const isOverdue = pStatus === 'overdue' && m === '2026-03';

        paymentRecords.push({
          school_id: SCHOOL_ID,
          student_id: student.id,
          type: 'tuition',
          amount: price, tax: 0, total: price,
          status: isFailed ? 'failed' : isOverdue ? 'pending' : 'completed',
          payment_method: pStatus === 'manual' ? 'cash' : 'credit_card',
          payment_date: m + '-01',
          description: (isFailed ? 'FAILED: ' : '') + 'Monthly tuition - ' + student.first_name + ' ' + student.last_name,
          invoice_number: 'BBA-' + m.replace('-','') + '-' + student.id
        });
      }
    }

    // Add some testing fees and merchandise purchases
    for (let i = 0; i < 20; i++) {
      const s = rp(createdStudents);
      paymentRecords.push({
        school_id: SCHOOL_ID, student_id: s.id, type: rp(['testing_fee','merchandise']),
        amount: rp([35,45,55,65,75]), tax: 0, total: rp([35,45,55,65,75]),
        status: 'completed', payment_method: rp(['credit_card','cash']),
        payment_date: rd('2026-01-01','2026-03-06'), description: rp(['Belt testing fee','Sparring gear purchase','Uniform purchase','Equipment purchase']),
        invoice_number: 'BBA-MISC-' + (1000 + i)
      });
    }

    // Add refunds
    for (let i = 0; i < 3; i++) {
      paymentRecords.push({
        school_id: SCHOOL_ID, type: 'refund',
        amount: -rp([79,99,159]), tax: 0, total: -rp([79,99,159]),
        status: 'completed', payment_method: 'credit_card',
        payment_date: rd('2026-02-01','2026-03-01'), description: rp(['Partial refund - account frozen','Overpayment correction','Duplicate charge refund']),
        invoice_number: 'BBA-REF-' + (100 + i)
      });
    }

    for (let i = 0; i < paymentRecords.length; i += 500) {
      await db.KanchoPayment.bulkCreate(paymentRecords.slice(i, i + 500), { validate: false });
    }
    summary.payments = paymentRecords.length;

    // ==========================================
    // 12. REVENUE (6 months)
    // ==========================================
    const revMonths = [
      { m:'2025-10', tuition:28500, merch:1800, testing:950, events:600 },
      { m:'2025-11', tuition:29800, merch:2100, testing:1100, events:450 },
      { m:'2025-12', tuition:30200, merch:3200, testing:800, events:1200 },
      { m:'2026-01', tuition:32100, merch:1900, testing:1250, events:500 },
      { m:'2026-02', tuition:33400, merch:2400, testing:1400, events:700 },
      { m:'2026-03', tuition:34700, merch:1600, testing:900, events:0 }
    ];
    for (const rv of revMonths) {
      await db.KanchoRevenue.bulkCreate([
        { school_id:SCHOOL_ID, date:rv.m+'-01', type:'tuition', category:'Monthly tuition', amount:rv.tuition, is_recurring:true, source:'stripe', description:'Tuition revenue '+rv.m },
        { school_id:SCHOOL_ID, date:rv.m+'-15', type:'merchandise', category:'Pro shop', amount:rv.merch, is_recurring:false, source:'pos', description:'Merchandise sales '+rv.m },
        { school_id:SCHOOL_ID, date:rv.m+'-20', type:'testing_fee', category:'Belt testing', amount:rv.testing, is_recurring:false, source:'mixed', description:'Testing fees '+rv.m },
        { school_id:SCHOOL_ID, date:rv.m+'-25', type:'event', category:'Events & workshops', amount:rv.events, is_recurring:false, source:'mixed', description:'Events revenue '+rv.m }
      ], { validate: false });
    }
    summary.revenue = { months: 6, total_mrr: 34700, six_month_total: revMonths.reduce((s,r) => s + r.tuition + r.merch + r.testing + r.events, 0) };

    // ==========================================
    // 13. BELT REQUIREMENTS
    // ==========================================
    const beltReqs = [
      { belt_name:'White', belt_color:'#FFFFFF', sort_order:0, min_classes:0, min_months:0, requirements:['Basic stance','Front kick','Low block'], testing_fee:0 },
      { belt_name:'Yellow', belt_color:'#FFD700', sort_order:1, min_classes:30, min_months:3, requirements:['Roundhouse kick','3 basic kata','Sparring basics'], testing_fee:35 },
      { belt_name:'Orange', belt_color:'#FF8C00', sort_order:2, min_classes:60, min_months:6, requirements:['Side kick','Back kick','5 kata forms','Light sparring'], testing_fee:45 },
      { belt_name:'Green', belt_color:'#228B22', sort_order:3, min_classes:100, min_months:9, requirements:['Spinning kicks','8 kata','Controlled sparring','Self-defense combos'], testing_fee:55 },
      { belt_name:'Blue', belt_color:'#1E90FF', sort_order:4, min_classes:150, min_months:14, requirements:['Jump kicks','10 kata','Full sparring','Board breaking'], testing_fee:65 },
      { belt_name:'Purple', belt_color:'#800080', sort_order:5, min_classes:200, min_months:20, requirements:['Advanced kata','Weapons intro','Teaching assist','Competition participation'], testing_fee:75 },
      { belt_name:'Brown', belt_color:'#8B4513', sort_order:6, min_classes:280, min_months:28, requirements:['Weapons proficiency','Advanced sparring','Teaching lower belts','Written exam'], testing_fee:85 },
      { belt_name:'Black', belt_color:'#000000', sort_order:7, min_classes:400, min_months:42, requirements:['Create original kata','Weapons mastery','Teaching certification','Panel review'], testing_fee:150 }
    ];
    for (const b of beltReqs) {
      await db.KanchoBeltRequirement.create({ school_id: SCHOOL_ID, ...b });
    }

    // ==========================================
    // 14. PROMOTIONS (30 belt test records)
    // ==========================================
    const promoRecords = [];
    const KARATE_PAIRS = [['White','Yellow'],['Yellow','Orange'],['Orange','Green'],['Green','Blue'],['Blue','Purple'],['Purple','Brown'],['Brown','Black']];
    const BJJ_PAIRS = [['White','Blue'],['Blue','Purple'],['Purple','Brown']];
    const activeStudents = createdStudents.filter((_, i) => allStudents[i].status === 'active');
    for (let i = 0; i < 30; i++) {
      const s = activeStudents[i % activeStudents.length];
      const isBJJ = allStudents[createdStudents.indexOf(s)]?.membership_type === 'adult_bjj';
      const pair = isBJJ ? rp(BJJ_PAIRS) : rp(KARATE_PAIRS);
      promoRecords.push({
        school_id: SCHOOL_ID, student_id: s.id,
        from_belt: pair[0], to_belt: pair[1],
        promotion_date: rd('2025-06-01','2026-03-01'),
        promoted_by: staffRecords[0].id,
        testing_score: ri(80, 99) + Math.random(),
        testing_fee_paid: rp([35,45,55,65,75,85]),
        classes_at_promotion: ri(50, 400),
        months_training: ri(4, 48)
      });
    }
    await db.KanchoPromotion.bulkCreate(promoRecords, { validate: false });
    summary.promotions = promoRecords.length;

    // ==========================================
    // 15. AUTOMATIONS (8)
    // ==========================================
    const automationData = [
      { name:'No-Show Follow Up', type:'attendance', trigger_type:'missed_class', trigger_config:{missed_count:3,within_days:14}, actions:[{type:'sms',template:'We miss you at Black Belt Academy, {{student_name}}! Your training goals are calling.'}], is_active:true, runs_count:127, success_count:108, failure_count:6 },
      { name:'Birthday Greeting', type:'engagement', trigger_type:'birthday', trigger_config:{days_before:0}, actions:[{type:'sms',template:'Happy Birthday {{student_name}}! Enjoy a FREE class this week!'}], is_active:true, runs_count:34, success_count:34, failure_count:0 },
      { name:'Trial Expiry Reminder', type:'conversion', trigger_type:'trial_ending', trigger_config:{days_before:3}, actions:[{type:'sms',template:'Your free trial at BBA ends in 3 days! Ready to join the family? Reply YES'}], is_active:true, runs_count:52, success_count:41, failure_count:2 },
      { name:'Payment Failed Alert', type:'billing', trigger_type:'payment_failed', trigger_config:{}, actions:[{type:'sms',template:'Hi {{student_name}}, we had trouble processing your payment. Please update your billing.'}], is_active:true, runs_count:18, success_count:14, failure_count:2 },
      { name:'Belt Test Eligible Notification', type:'achievement', trigger_type:'belt_test_eligible', trigger_config:{notify_instructor:true}, actions:[{type:'sms',template:'Great news! {{student_name}} is eligible for belt testing!'}], is_active:true, runs_count:65, success_count:62, failure_count:0 },
      { name:'New Lead Auto-Response', type:'lead', trigger_type:'new_lead', trigger_config:{delay_minutes:5}, actions:[{type:'sms',template:'Thanks for your interest in Black Belt Academy! Want to schedule a free trial?'}], is_active:true, runs_count:198, success_count:185, failure_count:5 },
      { name:'Reactivation Outreach', type:'retention', trigger_type:'inactive_30_days', trigger_config:{inactive_days:30}, actions:[{type:'sms',template:'We miss you! Come back to BBA for a free week on us.'}], is_active:true, runs_count:42, success_count:28, failure_count:3 },
      { name:'Monthly Progress Report', type:'engagement', trigger_type:'monthly', trigger_config:{day_of_month:1}, actions:[{type:'email',template:'Your monthly training report is ready!'}], is_active:false, runs_count:0, success_count:0, failure_count:0 }
    ];
    const autoRecords = [];
    for (const a of automationData) {
      const r = await db.KanchoAutomation.create({ school_id: SCHOOL_ID, ...a });
      autoRecords.push(r);
    }
    summary.automations = autoRecords.length;

    // ==========================================
    // 16. TASKS (20)
    // ==========================================
    const taskData = [
      { title:'Call Amanda Foster - hot lead interested in kids program', type:'follow_up', priority:'high', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-08' },
      { title:'Follow up with Nicole Adams - trial completed, ready to enroll', type:'conversion', priority:'urgent', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-07' },
      { title:'Check on Marcus Rivera - was most engaged BJJ student, now MIA', type:'retention', priority:'urgent', status:'in_progress', assigned_to:'Marcus Silva', due_date:'2026-03-07' },
      { title:'Call David Park - considering switching gyms', type:'retention', priority:'urgent', status:'pending', assigned_to:'Tony Chen', due_date:'2026-03-08' },
      { title:'Contact Tyler Bennett - update expired credit card', type:'billing', priority:'high', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-09' },
      { title:'Follow up with Crystal Lewis - overdue payment', type:'billing', priority:'high', status:'in_progress', assigned_to:'Amanda Torres', due_date:'2026-03-08' },
      { title:'Call Jennifer Mitchell - Ryan missed 8 classes, schedule change?', type:'retention', priority:'high', status:'pending', assigned_to:'Sarah Rodriguez', due_date:'2026-03-09' },
      { title:'Prepare spring break camp registration materials', type:'event', priority:'medium', status:'in_progress', assigned_to:'Sarah Rodriguez', due_date:'2026-03-15' },
      { title:'Order new sparring gear - helmets running low', type:'admin', priority:'medium', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-12' },
      { title:'Plan April belt testing schedule', type:'admin', priority:'medium', status:'pending', assigned_to:'Tony Chen', due_date:'2026-03-20' },
      { title:'Review competition team roster for April tournament', type:'competition', priority:'medium', status:'pending', assigned_to:'Jake Williams', due_date:'2026-03-15' },
      { title:'Update class schedule for spring season', type:'admin', priority:'low', status:'pending', assigned_to:'Tony Chen', due_date:'2026-03-25' },
      { title:'Send Priya Patel family return-to-training offer', type:'win_back', priority:'medium', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-10' },
      { title:'February revenue report - completed', type:'admin', priority:'low', status:'completed', assigned_to:'Amanda Torres', due_date:'2026-03-01', completed_at:'2026-03-02', result:'Total revenue $37,900. Up 8% from January. BJJ program strongest growth.' },
      { title:'Contacted Jake White about knee recovery', type:'retention', priority:'low', status:'completed', assigned_to:'Amanda Torres', due_date:'2026-03-04', completed_at:'2026-03-04', result:'Jake says hes recovering well. Plans to return mid-April.' },
      { title:'Fixed Stripe webhook for failed payment notifications', type:'admin', priority:'medium', status:'completed', assigned_to:'Amanda Torres', due_date:'2026-03-02', completed_at:'2026-03-03' },
      { title:'Call Brandon Torres parents - trial expired, strong interest shown', type:'conversion', priority:'high', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-08' },
      { title:'Schedule private lesson for Megan Clark competition prep', type:'training', priority:'medium', status:'pending', assigned_to:'Jake Williams', due_date:'2026-03-10' },
      { title:'Send monthly newsletter to all active members', type:'marketing', priority:'low', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-10' },
      { title:'Contact 5 lost leads from February for re-engagement', type:'win_back', priority:'low', status:'pending', assigned_to:'Amanda Torres', due_date:'2026-03-12' }
    ];
    for (const t of taskData) {
      await db.KanchoTask.create({ school_id: SCHOOL_ID, ...t });
    }
    summary.tasks = taskData.length;

    // ==========================================
    // 17. CAMPAIGNS (6)
    // ==========================================
    const campaignData = [
      { name:'Spring Break Camp 2026', type:'event', goal:'enrollment', status:'active', audience:{target:'local_families',age_range:'5-14',radius:'10mi'}, content:{headline:'Spring Break Camp Mar 24-28',body:'5 days of martial arts adventure! Early bird $199',channel:'facebook_ads'}, budget:750, spent:280, stats:{impressions:8500,clicks:420,leads:32,conversions:8,cost_per_lead:8.75} },
      { name:'Referral Bonus Program', type:'referral', goal:'enrollment', status:'active', content:{headline:'Refer a Friend = Free Month!',body:'Both you and your friend get a free month when they enroll.',channel:'email+sms'}, budget:0, spent:0, stats:{referrals_sent:45,referrals_enrolled:14,revenue_generated:2660} },
      { name:'Google Ads - Tampa Martial Arts', type:'paid_search', goal:'leads', status:'active', content:{headline:'Tampa Martial Arts Classes - Free Trial',body:'Kids Karate, BJJ, Self-Defense. All ages.',channel:'google_ads'}, budget:1200, spent:680, stats:{impressions:24000,clicks:890,leads:58,conversions:12,cost_per_lead:11.72} },
      { name:'February Re-engagement', type:'reactivation', goal:'retention', status:'completed', audience:{target:'inactive_30_days'}, content:{headline:'We Miss You!',body:'Come back for a free week.',channel:'sms'}, budget:50, spent:15, stats:{sent:28,responses:11,reactivated:6} },
      { name:'New Year Special - January', type:'promotion', goal:'enrollment', status:'completed', content:{headline:'New Year, New You!',body:'50% off first month for new members.',channel:'facebook+instagram'}, budget:500, spent:500, stats:{impressions:15000,clicks:720,leads:45,conversions:18,roi:3.2} },
      { name:'Instagram Content Series', type:'brand', goal:'awareness', status:'active', content:{headline:'#BBAWarriors Weekly',body:'Student spotlights and training tips.',channel:'instagram'}, budget:200, spent:85, stats:{posts:12,likes:2400,followers_gained:180,profile_visits:850} }
    ];
    for (const c of campaignData) {
      await db.KanchoCampaign.create({ school_id: SCHOOL_ID, ...c });
    }
    summary.campaigns = campaignData.length;

    // ==========================================
    // 18. FUNNELS (4)
    // ==========================================
    const funnelData = [
      { name:'Free Trial Class', slug:'free-trial', type:'trial_booking', status:'active', steps:[{name:'Landing Page',type:'hero'},{name:'Sign Up Form',type:'form'},{name:'Confirmation',type:'confirm'}], stats:{views:1250,submissions:185,conversion_rate:14.8} },
      { name:'Spring Camp Registration', slug:'spring-camp', type:'event_registration', status:'active', steps:[{name:'Camp Info',type:'info'},{name:'Registration',type:'form'},{name:'Payment',type:'checkout'}], stats:{views:380,submissions:42,conversion_rate:11.1} },
      { name:'Adult BJJ Intro', slug:'bjj-intro', type:'lead_capture', status:'active', steps:[{name:'BJJ Benefits',type:'info'},{name:'Get Started',type:'form'}], stats:{views:620,submissions:88,conversion_rate:14.2} },
      { name:'Referral Landing Page', slug:'refer-a-friend', type:'referral', status:'active', steps:[{name:'Referral Info',type:'info'},{name:'Submit Referral',type:'form'},{name:'Thank You',type:'confirm'}], stats:{views:290,submissions:45,conversion_rate:15.5} }
    ];
    for (const f of funnelData) {
      await db.KanchoFunnel.create({ school_id: SCHOOL_ID, ...f });
    }
    summary.funnels = funnelData.length;

    // ==========================================
    // 19. COMMUNICATIONS (60)
    // ==========================================
    const commRecords = [];
    const commTemplates = [
      { channel:'sms', direction:'outbound', subject:null, body:'Hi {{name}}! Just a reminder about your class tomorrow at {{time}}. See you on the mat!', template_name:'class_reminder', campaign:'Class Reminders' },
      { channel:'sms', direction:'outbound', subject:null, body:'We noticed you haven\'t been to class in a while. Everything okay? We\'d love to see you back!', template_name:'no_show_followup', campaign:'Retention' },
      { channel:'sms', direction:'outbound', subject:null, body:'Hi! Thanks for your interest in Black Belt Academy. Would you like to schedule a free trial class?', template_name:'lead_response', campaign:'Lead Follow-up' },
      { channel:'sms', direction:'outbound', subject:null, body:'Payment reminder: Your monthly tuition is due. Please update your payment method.', template_name:'payment_reminder', campaign:'Billing' },
      { channel:'email', direction:'outbound', subject:'Your Monthly Training Report - Black Belt Academy', body:'Here\'s your training summary for this month. You attended {{count}} classes!', template_name:'monthly_report', campaign:'Engagement' },
      { channel:'sms', direction:'outbound', subject:null, body:'Great news! You\'re eligible for your next belt test. Talk to your instructor!', template_name:'belt_eligible', campaign:'Achievement' },
      { channel:'voice', direction:'inbound', subject:null, body:'Caller asked about kids karate schedule and pricing. Provided info and scheduled trial.', template_name:'ai_receptionist', campaign:null },
      { channel:'voice', direction:'outbound', subject:null, body:'Called to follow up on missed classes. Student said schedule conflict. Offered alternative times.', template_name:'retention_call', campaign:'Retention' },
      { channel:'sms', direction:'inbound', subject:null, body:'Yes I\'d like to schedule a trial for my son. He\'s 8 years old.', template_name:null, campaign:null },
      { channel:'sms', direction:'outbound', subject:null, body:'Happy Birthday! Enjoy a FREE class on us this week!', template_name:'birthday', campaign:'Birthday Greetings' },
      { channel:'sms', direction:'outbound', subject:null, body:'Your trial at BBA ends in 3 days! Ready to continue? Reply YES.', template_name:'trial_expiry', campaign:'Trial Conversion' },
      { channel:'email', direction:'outbound', subject:'Spring Break Camp - Register Now!', body:'Don\'t miss our Spring Break Martial Arts Camp March 24-28!', template_name:'camp_promo', campaign:'Spring Camp' }
    ];

    const activeStudentIds = createdStudents.filter((_, i) => allStudents[i].status === 'active').map(s => s.id);
    for (let i = 0; i < 60; i++) {
      const tmpl = commTemplates[i % commTemplates.length];
      commRecords.push({
        school_id: SCHOOL_ID,
        channel: tmpl.channel,
        direction: tmpl.direction,
        from_number: tmpl.direction === 'outbound' ? '+18135550100' : '+1813555' + String(ri(3000,4500)).padStart(4,'0'),
        to_number: tmpl.direction === 'outbound' ? '+1813555' + String(ri(3000,4500)).padStart(4,'0') : '+18135550100',
        subject: tmpl.subject,
        body: tmpl.body,
        status: rp(['sent','delivered','delivered','delivered','opened']),
        student_id: i < 40 ? rp(activeStudentIds) : null,
        template_name: tmpl.template_name,
        campaign: tmpl.campaign,
        created_at: new Date(new Date('2026-03-06').getTime() - ri(0, 30) * 86400000)
      });
    }
    await db.KanchoCommunication.bulkCreate(commRecords, { validate: false });
    summary.communications = commRecords.length;

    // ==========================================
    // 20. AI CALLS (25)
    // ==========================================
    const aiCallData = [];
    const callTypes = [
      { call_type:'lead_followup', direction:'outbound', summary:'Called new lead about trial class interest. Scheduled trial for next week.', outcome:'trial_scheduled', sentiment:'positive' },
      { call_type:'no_show', direction:'outbound', summary:'Called student who missed 3 classes. Student said work schedule changed. Offered evening classes.', outcome:'rescheduled', sentiment:'neutral' },
      { call_type:'retention', direction:'outbound', summary:'Check-in call with at-risk member. Discussed concerns about progress. Offered private lesson.', outcome:'retained', sentiment:'positive' },
      { call_type:'payment_reminder', direction:'outbound', summary:'Called about failed payment. Student updated card on file. Payment processed successfully.', outcome:'payment_collected', sentiment:'neutral' },
      { call_type:'appointment_confirmation', direction:'outbound', summary:'Confirmed trial class appointment for tomorrow. Parent confirmed attendance with 2 kids.', outcome:'confirmed', sentiment:'positive' },
      { call_type:'winback', direction:'outbound', summary:'Reached out to inactive member. Offered free week to return. Student interested.', outcome:'interested', sentiment:'positive' },
      { call_type:'lead_followup', direction:'inbound', summary:'Incoming call about adult BJJ classes. Answered questions about schedule and pricing. Booked trial.', outcome:'trial_scheduled', sentiment:'positive' },
      { call_type:'other', direction:'inbound', summary:'Parent called asking about spring break camp details. Provided info and sent registration link.', outcome:'info_provided', sentiment:'positive' }
    ];
    for (let i = 0; i < 25; i++) {
      const ct = callTypes[i % callTypes.length];
      aiCallData.push({
        school_id: SCHOOL_ID,
        agent: 'kancho',
        call_type: ct.call_type,
        direction: ct.direction,
        phone_number: '+1813555' + String(ri(3000,5000)).padStart(4,'0'),
        student_id: ct.call_type !== 'lead_followup' ? rp(activeStudentIds) : null,
        duration_seconds: ri(45, 300),
        status: 'completed',
        outcome: ct.outcome,
        sentiment: ct.sentiment,
        summary: ct.summary,
        action_items: ct.outcome === 'trial_scheduled' ? ['Send confirmation SMS','Add to calendar'] : ct.outcome === 'retained' ? ['Schedule private lesson','Check in next week'] : [],
        created_at: new Date(new Date('2026-03-06').getTime() - ri(0, 21) * 86400000)
      });
    }
    await db.KanchoAiCall.bulkCreate(aiCallData, { validate: false });
    summary.ai_calls = aiCallData.length;

    // ==========================================
    // 21. HEALTH SCORES (30 days)
    // ==========================================
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-03-06');
      d.setDate(d.getDate() - i);
      const base = 78 + Math.round(Math.sin(i / 5) * 4);
      await db.KanchoHealthScore.create({
        school_id: SCHOOL_ID,
        date: fmt(d),
        retention_score: Math.min(100, base + ri(-3, 5)),
        revenue_score: Math.min(100, base + ri(-2, 6)),
        lead_score: Math.min(100, base + ri(-5, 8)),
        attendance_score: Math.min(100, base + ri(-4, 4)),
        engagement_score: Math.min(100, base + ri(-3, 5)),
        growth_score: Math.min(100, base + ri(-2, 7)),
        overall_score: Math.min(100, base + ri(-2, 3)),
        grade: base >= 85 ? 'A' : base >= 75 ? 'B' : 'C',
        vs_last_week: ri(-3, 5),
        vs_last_month: ri(2, 8),
        insights: [
          'MRR increased 6% this month to $34,700',
          'Adult BJJ program has highest retention rate at 94%',
          '14 students showing attendance decline - AI follow-up recommended',
          'Teen program enrollment up 12% quarter-over-quarter',
          'Competition team produced 3 tournament winners this month'
        ],
        alerts: [
          { type:'risk', message:'15 members flagged as at-risk', severity:'warning' },
          { type:'billing', message:'5 students with payment issues totaling $945', severity:'warning' },
          { type:'growth', message:'18 hot leads - conversion opportunity', severity:'info' },
          { type:'retention', message:'Spring break camp sold 42 of 50 spots', severity:'info' }
        ]
      });
    }
    summary.health_scores = 30;

    // ==========================================
    // 22. BUSINESS HEALTH METRICS (6 months)
    // ==========================================
    const bhMetrics = [
      { report_month:'2025-10', active_students:175, net_student_growth:5, churn_rate:3.2, arps:172, trial_conversion_rate:62, new_students:12, cancelled_students:7, trials_started:15, trials_converted:9, monthly_revenue:31850, monthly_revenue_target:32000 },
      { report_month:'2025-11', active_students:180, net_student_growth:5, churn_rate:2.8, arps:175, trial_conversion_rate:65, new_students:10, cancelled_students:5, trials_started:14, trials_converted:9, monthly_revenue:33550, monthly_revenue_target:33000 },
      { report_month:'2025-12', active_students:183, net_student_growth:3, churn_rate:3.5, arps:176, trial_conversion_rate:58, new_students:8, cancelled_students:5, trials_started:12, trials_converted:7, monthly_revenue:35400, monthly_revenue_target:34000 },
      { report_month:'2026-01', active_students:188, net_student_growth:5, churn_rate:2.5, arps:178, trial_conversion_rate:72, new_students:14, cancelled_students:9, trials_started:20, trials_converted:14, monthly_revenue:35750, monthly_revenue_target:34500 },
      { report_month:'2026-02', active_students:192, net_student_growth:4, churn_rate:2.1, arps:180, trial_conversion_rate:68, new_students:8, cancelled_students:4, trials_started:16, trials_converted:11, monthly_revenue:37900, monthly_revenue_target:35000 },
      { report_month:'2026-03', active_students:195, net_student_growth:3, churn_rate:2.6, arps:182, trial_conversion_rate:64, new_students:6, cancelled_students:3, trials_started:18, trials_converted:11, monthly_revenue:34700, monthly_revenue_target:35000 }
    ];
    for (const bh of bhMetrics) {
      const score = Math.round(
        (Math.min(100, 100 - bh.churn_rate * 5) * 0.25) +
        (Math.min(100, (bh.monthly_revenue / bh.monthly_revenue_target) * 100) * 0.25) +
        (Math.min(100, (bh.trial_conversion_rate / 80) * 100) * 0.20) +
        (Math.min(100, 50 + bh.net_student_growth * 5) * 0.15) +
        (Math.min(100, 85) * 0.15)
      );
      const grade = score >= 93 ? 'A' : score >= 85 ? 'B+' : score >= 80 ? 'B' : score >= 75 ? 'B-' : 'C+';
      await db.KanchoBusinessHealthMetrics.create({
        school_id: SCHOOL_ID, ...bh,
        health_score: score, health_grade: grade,
        revenue_at_risk: 15 * bh.arps,
        students_at_risk: 15,
        growth_potential: 18 * bh.arps,
        hot_leads: 18,
        revenue_vs_target_percent: Math.round((bh.monthly_revenue / bh.monthly_revenue_target) * 100 * 100) / 100,
        vs_previous_month: {}
      });
    }
    summary.business_metrics = bhMetrics.length;

    // ==========================================
    // 23. MERCHANDISE (12)
    // ==========================================
    const merchData = [
      { name:'BBA Gi (Uniform)', price:75, category:'gi', sizes:['YS','YM','YL','AS','AM','AL','AXL'], sort_order:0 },
      { name:'BBA Rashguard', price:45, category:'apparel', sizes:['YS','YM','YL','AS','AM','AL'], sort_order:1 },
      { name:'BBA T-Shirt', price:25, category:'apparel', sizes:['YS','YM','YL','AS','AM','AL','AXL'], sort_order:2 },
      { name:'Sparring Headgear', price:55, category:'gear', sort_order:3 },
      { name:'Sparring Gloves', price:45, category:'gear', sort_order:4 },
      { name:'Chest Protector', price:75, category:'gear', sort_order:5 },
      { name:'Shin Guards', price:35, category:'gear', sort_order:6 },
      { name:'Mouthguard Pro', price:18, category:'gear', sort_order:7 },
      { name:'Rebreakable Board', price:22, category:'gear', sort_order:8 },
      { name:'BBA Water Bottle', price:15, category:'accessories', sort_order:9 },
      { name:'Belt Display Rack', price:35, category:'accessories', sort_order:10 },
      { name:'BBA Gym Bag', price:40, category:'accessories', sort_order:11 }
    ];
    for (const m of merchData) {
      await db.KanchoMerchandise.create({ school_id: SCHOOL_ID, ...m, in_stock: true, description: m.name + ' - Black Belt Academy official merchandise' });
    }
    summary.merchandise = merchData.length;

    // ==========================================
    // 24. APPOINTMENTS (10)
    // ==========================================
    const apptData = [
      { customerName:'Lisa Chen', customerPhone:'+18135554101', customerEmail:'lisa.chen@email.com', date:'2026-03-10', time:'16:30', duration:30, purpose:'Free trial - Kids Karate (age 7)' },
      { customerName:'Robert Flores', customerPhone:'+18135554102', date:'2026-03-11', time:'19:30', duration:30, purpose:'Adult BJJ trial class' },
      { customerName:'Kathy Morgan', customerPhone:'+18135554103', customerEmail:'kathy.m@email.com', date:'2026-03-12', time:'16:00', duration:45, purpose:'Trial for 2 kids (ages 5 and 9)' },
      { customerName:'Aiden Thompson', customerPhone:'+18135553874', date:'2026-03-13', time:'14:00', duration:60, purpose:'Private lesson - Brown belt prep' },
      { customerName:'Mike Davis', customerPhone:'+18135554104', date:'2026-03-14', time:'06:00', duration:45, purpose:'Kickboxing trial' },
      { customerName:'Sandra Wells', customerPhone:'+18135554105', customerEmail:'sandra.wells@email.com', date:'2026-03-15', time:'10:00', duration:45, purpose:'Kids Saturday trial (age 6)' },
      { customerName:'Tom Rivera', customerPhone:'+18135554106', date:'2026-03-17', time:'12:00', duration:75, purpose:'BJJ noon class trial' },
      { customerName:'Christina Lee', customerPhone:'+18135554107', date:'2026-03-18', time:'18:30', duration:45, purpose:'Teen martial arts trial (age 14)' },
      { customerName:'James Baker', customerPhone:'+18135554108', date:'2026-03-19', time:'19:30', duration:75, purpose:'Adult BJJ - referred by Marcus Silva' },
      { customerName:'Angela Perez', customerPhone:'+18135554109', customerEmail:'angela.p@email.com', date:'2026-03-20', time:'15:00', duration:60, purpose:'After school program consultation' }
    ];

    // Insert via native-appointments route logic (direct model create)
    for (const a of apptData) {
      const code = 'KA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await db.KanchoAppointment.create({
        school_id: SCHOOL_ID,
        customer_name: a.customerName,
        customer_phone: a.customerPhone,
        customer_email: a.customerEmail || null,
        appointment_date: a.date,
        appointment_time: a.time,
        duration: a.duration,
        purpose: a.purpose,
        status: 'confirmed',
        confirmation_code: code,
        source: rp(['website','phone','referral','walk_in'])
      });
    }
    summary.appointments = apptData.length;

    // ==========================================
    // 25. UPDATE SCHOOL ACTIVE STUDENT COUNT
    // ==========================================
    await db.KanchoSchool.update({ active_students: summary.students.active }, { where: { id: SCHOOL_ID } });

    // ==========================================
    // FINAL SUMMARY
    // ==========================================
    summary.mrr_estimated = '$34,700';
    summary.avg_revenue_per_student = '$178';
    summary.at_risk_members = summary.students.at_risk;
    summary.ai_insights = [
      'MRR increased 6% this month to $34,700',
      'Adult BJJ program has highest retention at 94%',
      '15 members flagged as at-risk (critical: 4, high: 11)',
      '5 students with payment issues totaling ~$945',
      'Teen program enrollment up 12% quarter-over-quarter',
      '18 hot leads ready for conversion',
      'Trial conversion rate: 64% (target: 70%)',
      'Average class attendance: 68% capacity'
    ];

    console.log('SEED COMPLETE:', JSON.stringify(summary, null, 2));
    res.json({ success: true, message: 'Black Belt Academy demo data seeded successfully', summary });

  } catch (error) {
    console.error('SEED ERROR:', error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack?.split('\n').slice(0, 5) });
  }
});

module.exports = router;
