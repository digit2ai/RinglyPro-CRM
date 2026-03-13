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
  } catch (err) {
    console.error('  ⚠️ Torna Idioma init error:', err.message);
  }
}

initialize();
module.exports = router;
