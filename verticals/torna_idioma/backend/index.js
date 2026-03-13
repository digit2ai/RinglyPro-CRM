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

      // Seed demo lessons for Spanish Fundamentals (course 1)
      const [[c1]] = await sequelize.query(`SELECT id FROM ti_courses WHERE title_en = 'Spanish Fundamentals' LIMIT 1`);
      if (c1) {
        const lessons = [
          { title_en: 'Greetings & Introductions', title_es: 'Saludos y Presentaciones', title_fil: 'Mga Pagbati at Pagpapakilala', type: 'reading', mins: 20,
            content_en: '# Greetings & Introductions\n\nSpanish greetings are the foundation of every conversation. In the Philippines, many of these words already exist in our daily language!\n\n## Basic Greetings\n- **Hola** — Hello\n- **Buenos días** — Good morning\n- **Buenas tardes** — Good afternoon\n- **Buenas noches** — Good evening/night\n\n## Introductions\n- **Me llamo...** — My name is...\n- **¿Cómo te llamas?** — What is your name?\n- **Mucho gusto** — Nice to meet you\n- **¿Cómo estás?** — How are you?\n- **Estoy bien, gracias** — I am fine, thank you\n\n## Filipino Connection\nDid you know? The Filipino word "kumusta" comes from the Spanish "¿Cómo está?" — a direct heritage connection that has survived over 100 years!',
            exercises: JSON.stringify([{type:'multiple_choice',q:'How do you say "Good morning" in Spanish?',options:['Buenas noches','Buenos días','Buenas tardes','Hola'],answer:1},{type:'multiple_choice',q:'What Filipino word comes from "¿Cómo está?"',options:['Salamat','Kumusta','Maganda','Paalam'],answer:1},{type:'fill_blank',q:'Me _____ Juan. (My name is Juan)',answer:'llamo'}]) },
          { title_en: 'Numbers & Counting', title_es: 'Números y Contar', title_fil: 'Mga Numero at Pagbibilang', type: 'reading', mins: 25,
            content_en: '# Numbers & Counting\n\nNumbers are essential for everyday communication — shopping, telling time, and exchanging phone numbers.\n\n## 1-10\n1. **Uno** 2. **Dos** 3. **Tres** 4. **Cuatro** 5. **Cinco**\n6. **Seis** 7. **Siete** 8. **Ocho** 9. **Nueve** 10. **Diez**\n\n## 11-20\n11. Once 12. Doce 13. Trece 14. Catorce 15. Quince\n16. Dieciséis 17. Diecisiete 18. Dieciocho 19. Diecinueve 20. Veinte\n\n## Filipino Connection\nFilipinos already count in Spanish! "Uno, dos, tres" is used daily across the Philippines — from markets to basketball courts.',
            exercises: JSON.stringify([{type:'multiple_choice',q:'What is "siete" in English?',options:['Six','Seven','Eight','Five'],answer:1},{type:'fill_blank',q:'The number after "nueve" is ____',answer:'diez'}]) },
          { title_en: 'Common Phrases for Daily Life', title_es: 'Frases Comunes para la Vida Diaria', title_fil: 'Mga Karaniwang Parirala para sa Araw-araw', type: 'reading', mins: 20,
            content_en: '# Common Phrases for Daily Life\n\n## Polite Expressions\n- **Por favor** — Please\n- **Gracias** — Thank you\n- **De nada** — You\'re welcome\n- **Perdón / Disculpe** — Excuse me / Sorry\n\n## Useful Phrases\n- **¿Cuánto cuesta?** — How much does it cost?\n- **¿Dónde está...?** — Where is...?\n- **No entiendo** — I don\'t understand\n- **¿Puede repetir?** — Can you repeat?\n- **Sí / No** — Yes / No\n\n## Filipino Heritage Words from Spanish\nMany everyday Filipino words are Spanish: mesa (table), silya (chair), kutsara (cuchara/spoon), tinidor (tenedor/fork), bintana (ventana/window), kuwarto (cuarto/room).',
            exercises: JSON.stringify([{type:'multiple_choice',q:'How do you say "Thank you" in Spanish?',options:['Por favor','De nada','Gracias','Perdón'],answer:2},{type:'multiple_choice',q:'The Filipino word "bintana" comes from which Spanish word?',options:['Ventana','Ventaja','Binta','Banana'],answer:0}]) },
          { title_en: 'The Alphabet & Pronunciation', title_es: 'El Alfabeto y la Pronunciación', title_fil: 'Ang Alpabeto at Pagbigkas', type: 'reading', mins: 30,
            content_en: '# The Spanish Alphabet & Pronunciation\n\nGreat news: Spanish pronunciation is very phonetic — words are pronounced as they are spelled. And since Filipino uses many of the same sounds, you already have a head start!\n\n## Key Pronunciation Rules\n- **Vowels** are always consistent: A (ah), E (eh), I (ee), O (oh), U (oo)\n- **H** is always silent: "hola" = "ola"\n- **J** sounds like English H: "José" = "Ho-SEH"\n- **Ñ** sounds like "ny": "español" = "es-pa-NYOL"\n- **LL** sounds like "y": "calle" = "KA-yeh"\n- **RR** is rolled/trilled: "perro" = "PEH-rro"\n\n## Practice Words\nTry saying these aloud:\n- Buenas noches (BWEH-nas NO-ches)\n- Gracias (GRA-syas)\n- Universidad (oo-nee-ver-see-DAD)',
            exercises: JSON.stringify([{type:'multiple_choice',q:'How is the letter H pronounced in Spanish?',options:['Like English H','It is silent','Like CH','Like J'],answer:1},{type:'multiple_choice',q:'What sound does Ñ make?',options:['N','NY','NG','NH'],answer:1}]) },
          { title_en: 'Days, Months & Time', title_es: 'Días, Meses y Hora', title_fil: 'Mga Araw, Buwan at Oras', type: 'reading', mins: 20,
            content_en: '# Days, Months & Time\n\n## Days of the Week\n- Lunes (Monday), Martes (Tuesday), Miércoles (Wednesday)\n- Jueves (Thursday), Viernes (Friday)\n- Sábado (Saturday), Domingo (Sunday)\n\n## Months\nEnero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre\n\n## Filipino Connection\nAll Filipino names for days and months come directly from Spanish! Lunes, Martes, Miyerkules, Huwebes, Biyernes, Sabado, Linggo — and Enero, Pebrero, Marso, etc.\n\n## Telling Time\n- **¿Qué hora es?** — What time is it?\n- **Es la una** — It\'s one o\'clock\n- **Son las dos** — It\'s two o\'clock\n- **Son las tres y media** — It\'s 3:30',
            exercises: JSON.stringify([{type:'multiple_choice',q:'What is "Jueves" in English?',options:['Tuesday','Wednesday','Thursday','Friday'],answer:2},{type:'fill_blank',q:'¿Qué _____ es? (What time is it?)',answer:'hora'}]) },
        ];
        for (let i = 0; i < lessons.length; i++) {
          const l = lessons[i];
          await sequelize.query(
            `INSERT INTO ti_lessons (course_id, title_en, title_es, title_fil, content_en, lesson_type, sort_order, duration_minutes, exercises, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
            { bind: [c1.id, l.title_en, l.title_es, l.title_fil, l.content_en, l.type, i+1, l.mins, l.exercises] }
          );
        }
        console.log('  ✅ Torna Idioma demo lessons seeded');
      }
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
        { cid: tp?.id, title: 'Spanish-Speaking Customer Service Rep', desc: 'Handle inbound customer inquiries in Spanish for LATAM clients. Training provided.', salary: '₱28,000 - ₱35,000', level: 'B1', type: 'full_time', slots: 10 },
        { cid: tp?.id, title: 'Bilingual Team Lead (Spanish/English)', desc: 'Lead a team of 15 agents serving Spanish-speaking accounts. Must have B2+ proficiency.', salary: '₱45,000 - ₱55,000', level: 'B2', type: 'full_time', slots: 3 },
        { cid: cx?.id, title: 'Spanish Technical Support Analyst', desc: 'Provide technical support in Spanish for a major tech company. IT background preferred.', salary: '₱32,000 - ₱40,000', level: 'B1', type: 'full_time', slots: 8 },
        { cid: cx?.id, title: 'Quality Analyst — Spanish Accounts', desc: 'Monitor and evaluate calls for Spanish-speaking accounts. Ensure service quality standards.', salary: '₱35,000 - ₱42,000', level: 'B2', type: 'full_time', slots: 2 },
        { cid: ttec?.id, title: 'Spanish Chat Support Specialist', desc: 'Handle chat and email support in Spanish for e-commerce clients. Work from home option available.', salary: '₱25,000 - ₱30,000', level: 'A2', type: 'full_time', slots: 12 },
        { cid: sitel?.id, title: 'Spanish Sales Representative', desc: 'Outbound sales calls to Spanish-speaking markets in Latin America. Commission-based bonuses.', salary: '₱22,000 - ₱28,000 + commission', level: 'B1', type: 'full_time', slots: 15 },
        { cid: alorica?.id, title: 'Bilingual Healthcare Coordinator', desc: 'Coordinate healthcare appointments and insurance claims for Spanish-speaking patients in the US.', salary: '₱30,000 - ₱38,000', level: 'B2', type: 'full_time', slots: 5 },
        { cid: alorica?.id, title: 'Spanish Interpreter (Part-Time)', desc: 'Provide real-time interpretation services between Spanish and English. Flexible hours.', salary: '₱18,000 - ₱22,000', level: 'C1', type: 'part_time', slots: 8 },
      ];
      for (const j of demoJobs) {
        if (!j.cid) continue;
        await sequelize.query(
          `INSERT INTO ti_bpo_jobs (company_id, title, description_en, location, job_type, salary_range, spanish_level_required, slots, status, posted_at, created_at, updated_at) VALUES ($1,$2,$3,'Makati City',$4,$5,$6,$7,'open',NOW(),NOW(),NOW())`,
          { bind: [j.cid, j.title, j.desc, j.type, j.salary, j.level, j.slots] }
        );
      }
      console.log('  ✅ Torna Idioma BPO jobs seeded');
    }
  } catch (err) {
    console.error('  ⚠️ Torna Idioma init error:', err.message);
  }
}

initialize();
module.exports = router;
