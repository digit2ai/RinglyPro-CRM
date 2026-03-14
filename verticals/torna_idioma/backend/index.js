const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const router = express.Router();
const sequelize = require('./services/db.ti');

// --- Routes ---
router.use('/api/auth', require('./routes/auth'));
router.use('/api/courses', require('./routes/courses'));
router.use('/api/analytics', require('./routes/analytics'));
router.use('/api/advocacy', require('./routes/advocacy'));
router.use('/api/bpo', require('./routes/bpo'));
router.use('/api/tutor', require('./routes/tutor'));

router.get('/health', (req, res) => {
  res.json({ service: 'Torna Idioma', status: 'healthy', tagline: 'Vida · Cultura · Legado', timestamp: new Date().toISOString() });
});

// Serve React frontend
const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

async function initialize() {
  try {
    const fs = require('fs');
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await sequelize.query(sql);
    }
    console.log('  ✅ Torna Idioma schema initialized (' + migrationFiles.length + ' migrations)');

    const users = [
      { email: 'admin@tornaidioma.ph', password: 'TornaIdioma2026!', role: 'admin', full_name: 'Torna Idioma Admin' },
      { email: 'mstagg@digit2ai.com', password: 'Palindrome@7', role: 'admin', full_name: 'Manuel Stagg', organization: 'Digit2AI' },
      { email: 'teacher@tornaidioma.ph', password: 'TeacherDemo2026!', role: 'teacher', full_name: 'María García', organization: 'Instituto Cervantes' },
      { email: 'student@tornaidioma.ph', password: 'StudentDemo2026!', role: 'student', full_name: 'Juan dela Cruz' },
      { email: 'official@makati.gov.ph', password: 'MakatiOfficial2026!', role: 'official', full_name: 'City Official', organization: 'Makati City Government' },
      { email: 'bpo@tornaidioma.ph', password: 'BPODemo2026!', role: 'bpo_worker', full_name: 'Ana Santos', organization: 'Teleperformance Philippines' },
      { email: 'partner@tornaidioma.ph', password: 'PartnerDemo2026!', role: 'partner', full_name: 'Carlos Méndez', organization: 'Instituto Cervantes Manila' },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);
      const [[existing]] = await sequelize.query(`SELECT id FROM ti_users WHERE email = $1`, { bind: [u.email] });
      if (existing) {
        await sequelize.query(`UPDATE ti_users SET password_hash = $1, updated_at = NOW() WHERE email = $2`, { bind: [hash, u.email] });
      } else {
        await sequelize.query(`INSERT INTO ti_users (email, password_hash, tenant_id, role, full_name, organization, status, created_at, updated_at) VALUES ($1, $2, 'torna_idioma', $3, $4, $5, 'active', NOW(), NOW())`, { bind: [u.email, hash, u.role, u.full_name, u.organization || null] });
      }
    }
    console.log('  ✅ Torna Idioma users initialized');

    // Seed demo courses
    const [[courseExists]] = await sequelize.query(`SELECT id FROM ti_courses LIMIT 1`);
    if (!courseExists) {
      const demoCourses = [
        { title_en: 'Spanish Fundamentals', title_es: 'Fundamentos del Español', title_fil: 'Mga Batayan ng Espanyol', desc_en: 'Essential Spanish vocabulary, grammar, and conversational skills for absolute beginners.', level: 'beginner', category: 'general', hours: 40 },
        { title_en: 'BPO Spanish Communication', title_es: 'Comunicación en Español para BPO', title_fil: 'Komunikasyon sa Espanyol para sa BPO', desc_en: 'Professional Spanish for call center and BPO environments. Customer service, technical support, and sales terminology.', level: 'intermediate', category: 'bpo', hours: 60 },
        { title_en: 'Filipino-Spanish Heritage', title_es: 'Herencia Filipino-Española', title_fil: 'Pamana ng Pilipino-Espanyol', desc_en: 'Explore the deep connections between Filipino and Spanish languages, history, and culture through the lens of 333 years of shared heritage.', level: 'beginner', category: 'cultural', hours: 20 },
        { title_en: 'Advanced Business Spanish', title_es: 'Español de Negocios Avanzado', title_fil: 'Advanced na Espanyol para sa Negosyo', desc_en: 'High-level business communication, negotiation, and presentation skills in Spanish for professionals and executives.', level: 'advanced', category: 'business', hours: 80 },
        { title_en: 'DELE Exam Preparation', title_es: 'Preparación para el Examen DELE', title_fil: 'Paghahanda para sa DELE Exam', desc_en: 'Comprehensive preparation for the Diplomas de Español como Lengua Extranjera (DELE) certification exams.', level: 'intermediate', category: 'certification', hours: 100 },
      ];
      for (let i = 0; i < demoCourses.length; i++) {
        const c = demoCourses[i];
        await sequelize.query(
          `INSERT INTO ti_courses (title_en, title_es, title_fil, description_en, level, category, duration_hours, total_lessons, is_published, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,NOW(),NOW())`,
          { bind: [c.title_en, c.title_es, c.title_fil, c.desc_en, c.level, c.category, c.hours, Math.ceil(c.hours/2), i+1] }
        );
      }
      console.log('  ✅ Torna Idioma demo courses seeded');

    }

    // Seed lessons independently — checks for lessons regardless of whether courses existed before
    const [[lessonExists]] = await sequelize.query(`SELECT id FROM ti_lessons LIMIT 1`);
    if (!lessonExists) {
      const lessonSeedData = require('./seeds/lessons');
      for (const [courseTitle, lessons] of Object.entries(lessonSeedData)) {
        const [[course]] = await sequelize.query(`SELECT id FROM ti_courses WHERE title_en = $1 LIMIT 1`, { bind: [courseTitle] });
        if (!course) continue;
        for (let i = 0; i < lessons.length; i++) {
          const l = lessons[i];
          await sequelize.query(
            `INSERT INTO ti_lessons (course_id, title_en, title_es, title_fil, content_en, lesson_type, sort_order, duration_minutes, exercises, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
            { bind: [course.id, l.title_en, l.title_es, l.title_fil, l.content_en, l.type, i+1, l.mins, l.exercises] }
          );
        }
        // Update total_lessons to actual count
        await sequelize.query(`UPDATE ti_courses SET total_lessons = $1 WHERE id = $2`, { bind: [lessons.length, course.id] });
      }
      console.log('  ✅ Torna Idioma lessons seeded (25 lessons across 5 courses)');
    }

    // Seed demo partners
    const [[partnerExists]] = await sequelize.query(`SELECT id FROM ti_partners LIMIT 1`);
    if (!partnerExists) {
      const demoPartners = [
        { name: 'Instituto Cervantes Manila', country: 'Spain', flag: '🇪🇸', type: 'cultural_center' },
        { name: 'Universidad Nacional Autónoma de México', country: 'Mexico', flag: '🇲🇽', type: 'university' },
        { name: 'Universidad de los Andes', country: 'Colombia', flag: '🇨🇴', type: 'university' },
        { name: 'Pontificia Universidad Católica de Chile', country: 'Chile', flag: '🇨🇱', type: 'university' },
        { name: 'Universidad de Buenos Aires', country: 'Argentina', flag: '🇦🇷', type: 'university' },
        { name: 'University of Makati', country: 'Philippines', flag: '🇵🇭', type: 'university' },
        { name: 'Universidad de Medellín', country: 'Colombia', flag: '🇨🇴', type: 'university' },
        { name: 'Colegio de San Juan de Letrán', country: 'Philippines', flag: '🇵🇭', type: 'university' },
        { name: 'Polytechnic University of the Philippines', country: 'Philippines', flag: '🇵🇭', type: 'university' },
      ];
      for (const p of demoPartners) {
        await sequelize.query(
          `INSERT INTO ti_partners (name, country, country_flag, partner_type, partnership_status, signed_at, created_at, updated_at) VALUES ($1,$2,$3,$4,'active',NOW(),NOW(),NOW())`,
          { bind: [p.name, p.country, p.flag, p.type] }
        );
      }
      console.log('  ✅ Torna Idioma demo partners seeded');
    }

    // Seed demo BPO companies and jobs
    const [[bpoExists]] = await sequelize.query(`SELECT id FROM ti_bpo_companies LIMIT 1`);
    if (!bpoExists) {
      const bpoCompanies = [
        { name: 'Teleperformance Philippines', industry: 'BPO / Contact Center', positions: 45, salary: 32, status: 'hiring' },
        { name: 'Concentrix Makati', industry: 'BPO / Customer Experience', positions: 30, salary: 28, status: 'hiring' },
        { name: 'TTEC Manila', industry: 'BPO / Tech Support', positions: 20, salary: 35, status: 'active' },
        { name: 'Sitel Group', industry: 'BPO / Sales', positions: 15, salary: 25, status: 'hiring' },
        { name: 'Alorica BGC', industry: 'BPO / Healthcare', positions: 25, salary: 30, status: 'active' },
      ];
      for (const c of bpoCompanies) {
        await sequelize.query(
          `INSERT INTO ti_bpo_companies (name, industry, spanish_positions, avg_salary_increase, partnership_status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
          { bind: [c.name, c.industry, c.positions, c.salary, c.status] }
        );
      }
      console.log('  ✅ Torna Idioma BPO companies seeded');

      // Seed demo jobs
      const [[tp]] = await sequelize.query(`SELECT id FROM ti_bpo_companies WHERE name LIKE 'Teleperformance%' LIMIT 1`);
      const [[cx]] = await sequelize.query(`SELECT id FROM ti_bpo_companies WHERE name LIKE 'Concentrix%' LIMIT 1`);
      const [[ttec]] = await sequelize.query(`SELECT id FROM ti_bpo_companies WHERE name LIKE 'TTEC%' LIMIT 1`);
      const [[sitel]] = await sequelize.query(`SELECT id FROM ti_bpo_companies WHERE name LIKE 'Sitel%' LIMIT 1`);
      const [[alorica]] = await sequelize.query(`SELECT id FROM ti_bpo_companies WHERE name LIKE 'Alorica%' LIMIT 1`);
      const demoJobs = [
        { cid: tp?.id, title: 'Spanish-Speaking Customer Service Rep', desc: 'Handle inbound customer inquiries in Spanish for LATAM clients. Training provided.', salary: '₱28,000 - ₱35,000', level: 'B1', type: 'full_time', slots: 10, loc: 'Makati City' },
        { cid: tp?.id, title: 'Bilingual Team Lead (Spanish/English)', desc: 'Lead a team of 15 agents serving Spanish-speaking accounts. Must have B2+ proficiency.', salary: '₱45,000 - ₱55,000', level: 'B2', type: 'full_time', slots: 3, loc: 'Makati City' },
        { cid: cx?.id, title: 'Spanish Technical Support Analyst', desc: 'Provide technical support in Spanish for a major tech company. IT background preferred.', salary: '₱32,000 - ₱40,000', level: 'B1', type: 'full_time', slots: 8, loc: 'Cavite' },
        { cid: cx?.id, title: 'Quality Analyst — Spanish Accounts', desc: 'Monitor and evaluate calls for Spanish-speaking accounts. Ensure service quality standards.', salary: '₱35,000 - ₱42,000', level: 'B2', type: 'full_time', slots: 2, loc: 'Makati City' },
        { cid: ttec?.id, title: 'Spanish Chat Support Specialist', desc: 'Handle chat and email support in Spanish for e-commerce clients. Work from home option available.', salary: '₱25,000 - ₱30,000', level: 'A2', type: 'full_time', slots: 12, loc: 'Zamboanga City' },
        { cid: sitel?.id, title: 'Spanish Sales Representative', desc: 'Outbound sales calls to Spanish-speaking markets in Latin America. Commission-based bonuses.', salary: '₱22,000 - ₱28,000 + commission', level: 'B1', type: 'full_time', slots: 15, loc: 'Zamboanga City' },
        { cid: alorica?.id, title: 'Bilingual Healthcare Coordinator', desc: 'Coordinate healthcare appointments and insurance claims for Spanish-speaking patients in the US.', salary: '₱30,000 - ₱38,000', level: 'B2', type: 'full_time', slots: 5, loc: 'Cavite' },
        { cid: alorica?.id, title: 'Spanish Interpreter (Part-Time)', desc: 'Provide real-time interpretation services between Spanish and English. Flexible hours.', salary: '₱18,000 - ₱22,000', level: 'C1', type: 'part_time', slots: 8, loc: 'Makati City' },
      ];
      for (const j of demoJobs) {
        if (!j.cid) continue;
        await sequelize.query(
          `INSERT INTO ti_bpo_jobs (company_id, title, description_en, location, job_type, salary_range, spanish_level_required, slots, status, posted_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',NOW(),NOW(),NOW())`,
          { bind: [j.cid, j.title, j.desc, j.loc, j.type, j.salary, j.level, j.slots] }
        );
      }
      console.log('  ✅ Torna Idioma BPO jobs seeded');
    }

    // Seed demo events
    const [[eventExists]] = await sequelize.query(`SELECT id FROM ti_events LIMIT 1`);
    if (!eventExists) {
      const demoEvents = [
        { title_en: 'Día de la Hispanidad Festival', title_es: 'Festival del Día de la Hispanidad', title_fil: 'Pista ng Día de la Hispanidad', desc_en: 'Celebrate the shared heritage between the Philippines and the Hispanic world with music, dance, food, and cultural exhibitions in Ayala Triangle Gardens.', type: 'cultural', location: 'Ayala Triangle Gardens, Makati', date: '2026-04-12 10:00:00', capacity: 500 },
        { title_en: 'Spanish for BPO — Free Workshop', title_es: 'Español para BPO — Taller Gratuito', title_fil: 'Espanyol para sa BPO — Libreng Workshop', desc_en: 'Free introductory workshop on Spanish for BPO professionals. Learn essential phrases, customer service vocabulary, and career opportunities.', type: 'workshop', location: 'University of Makati, Main Hall', date: '2026-04-05 14:00:00', capacity: 100 },
        { title_en: 'Tertulias Literarias — Book Club', title_es: 'Tertulias Literarias — Club de Lectura', title_fil: 'Tertulias Literarias — Book Club', desc_en: 'Monthly Spanish book club meeting. This month: "Noli Me Tangere" by José Rizal — reading selected chapters in the original Spanish.', type: 'cultural', location: 'Filipinas Heritage Library, Makati', date: '2026-04-19 18:00:00', capacity: 30 },
        { title_en: 'DELE Exam Information Session', title_es: 'Sesión Informativa DELE', title_fil: 'DELE Exam Info Session', desc_en: 'Learn about the DELE certification exams, requirements, preparation strategies, and registration. Presented by Instituto Cervantes Manila.', type: 'info_session', location: 'Instituto Cervantes Manila', date: '2026-04-26 10:00:00', capacity: 50 },
        { title_en: 'Filipino-Spanish Heritage Walk', title_es: 'Caminata del Patrimonio Filipino-Español', title_fil: 'Filipino-Spanish Heritage Walk', desc_en: 'Guided walking tour of Spanish colonial heritage sites in Intramuros and Makati. Discover the architectural and cultural legacy of 333 years of shared history.', type: 'cultural', location: 'Intramuros, Manila', date: '2026-05-03 08:00:00', capacity: 40 },
        { title_en: 'Paella & Conversation Night', title_es: 'Noche de Paella y Conversación', title_fil: 'Paella & Conversation Night', desc_en: 'Practice your Spanish in a relaxed social setting over authentic paella. All levels welcome!', type: 'social', location: 'La Tienda, Greenbelt 5, Makati', date: '2026-05-10 19:00:00', capacity: 60 },
      ];
      for (const e of demoEvents) {
        await sequelize.query(
          `INSERT INTO ti_events (title_en, title_es, title_fil, description_en, event_type, location, event_date, capacity, is_published, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW())`,
          { bind: [e.title_en, e.title_es, e.title_fil, e.desc_en, e.type, e.location, e.date, e.capacity] }
        );
      }
      console.log('  ✅ Torna Idioma demo events seeded');
    }

    // Seed demo schools
    const [[schoolExists]] = await sequelize.query(`SELECT id FROM ti_schools LIMIT 1`);
    if (!schoolExists) {
      const demoSchools = [
        { name: 'University of Makati', type: 'public', barangay: 'West Rembo', principal: 'Dr. Tomas Reyes', email: 'admin@umak.edu.ph', total: 12500, enrolled: 450, status: 'active' },
        { name: 'Makati Science High School', type: 'public', barangay: 'Guadalupe Nuevo', principal: 'Maria Lourdes Santos', email: 'mshs@makati.gov.ph', total: 2800, enrolled: 320, status: 'active' },
        { name: 'Makati High School', type: 'public', barangay: 'Poblacion', principal: 'Roberto Cruz', email: 'mhs@makati.gov.ph', total: 3500, enrolled: 180, status: 'pilot' },
        { name: 'Don Bosco Technical College', type: 'private', barangay: 'San Antonio', principal: 'Fr. Antonio Reyes', email: 'info@donbosco-makati.edu.ph', total: 1800, enrolled: 95, status: 'pilot' },
        { name: 'Assumption College Makati', type: 'private', barangay: 'San Lorenzo', principal: 'Sr. Carmen Villanueva', email: 'admin@assumption.edu.ph', total: 2200, enrolled: 150, status: 'expanding' },
        { name: 'Makati Elementary School Central', type: 'public', barangay: 'Poblacion', principal: 'Elena Mendoza', email: 'mesc@makati.gov.ph', total: 1500, enrolled: 0, status: 'pilot' },
        { name: 'Ospital ng Makati School of Nursing', type: 'public', barangay: 'Pembo', principal: 'Dr. Patricia Reyes', email: 'nursing@makati.gov.ph', total: 600, enrolled: 45, status: 'pilot' },
        { name: 'Western Mindanao State University', type: 'public', barangay: 'Baliwasan, Zamboanga City', principal: 'Dr. Maria Teresa Payot', email: 'admin@wmsu.edu.ph', total: 18000, enrolled: 0, status: 'pilot' },
        { name: 'Ateneo de Zamboanga University', type: 'private', barangay: 'La Purisima, Zamboanga City', principal: 'Fr. Karel San Juan', email: 'info@adzu.edu.ph', total: 8500, enrolled: 0, status: 'pilot' },
        { name: 'Cavite State University', type: 'public', barangay: 'Indang, Cavite', principal: 'Dr. Hernando Robles', email: 'admin@cvsu.edu.ph', total: 25000, enrolled: 0, status: 'pilot' },
        { name: 'De La Salle University - Dasmariñas', type: 'private', barangay: 'Dasmariñas, Cavite', principal: 'Br. Gus Boquer', email: 'info@dlsud.edu.ph', total: 12000, enrolled: 0, status: 'pilot' },
      ];
      for (const sch of demoSchools) {
        await sequelize.query(
          `INSERT INTO ti_schools (name, school_type, barangay, principal_name, contact_email, total_students, enrolled_students, program_status, joined_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),NOW())`,
          { bind: [sch.name, sch.type, sch.barangay, sch.principal, sch.email, sch.total, sch.enrolled, sch.status] }
        );
      }
      console.log('  ✅ Torna Idioma demo schools seeded');
    }
  } catch (err) {
    console.error('  ⚠️ Torna Idioma init error:', err.message);
  }
}

initialize();
module.exports = router;
