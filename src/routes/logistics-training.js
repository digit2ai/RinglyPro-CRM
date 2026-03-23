// src/routes/logistics-training.js
// Logistics Training Platform (LMS) — self-contained Express router
// Mounted at /logistics/training on the main app

const express = require('express');
const router = express.Router();
const { Sequelize } = require('sequelize');

// Manual cookie parser (avoids cookie-parser dependency)
router.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach(c => {
      const [k, ...v] = c.split('=');
      if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('=').trim());
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS lms_learners (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(150) UNIQUE,
  enrolled_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_modules (
  id SERIAL PRIMARY KEY,
  track VARCHAR(50) NOT NULL,
  position INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  lesson_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lms_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER REFERENCES lms_modules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary TEXT,
  youtube_video_id VARCHAR(20),
  youtube_title TEXT,
  transcript_notes TEXT,
  duration_minutes INTEGER DEFAULT 10,
  is_published BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lms_quiz_questions (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER REFERENCES lms_lessons(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT,
  correct_option CHAR(1),
  explanation TEXT
);

CREATE TABLE IF NOT EXISTS lms_progress (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER REFERENCES lms_learners(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lms_lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  quiz_passed BOOLEAN DEFAULT FALSE,
  last_watched_at TIMESTAMP,
  UNIQUE(learner_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS lms_certificates (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER REFERENCES lms_learners(id),
  module_id INTEGER REFERENCES lms_modules(id),
  issued_at TIMESTAMP DEFAULT NOW(),
  certificate_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_lms_lessons_module ON lms_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lms_progress_learner ON lms_progress(learner_id);
CREATE INDEX IF NOT EXISTS idx_lms_progress_lesson ON lms_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_quiz_lesson ON lms_quiz_questions(lesson_id);
`;

sequelize.query(INIT_SQL)
  .then(() => console.log('LMS tables ready'))
  .catch(err => console.error('LMS table init error:', err.message));

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------
const BASE = '/logistics/training';

function htmlShell(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | Logistics Training Academy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--card:#161b22;--border:#30363d;
  --text:#e6edf3;--text2:#8b949e;
  --accent:#00c2a8;--accent-hover:#00e6c3;
  --warehouse:#8b5cf6;--freight:#3b82f6;
  --radius:12px;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
a{color:var(--accent);text-decoration:none}a:hover{color:var(--accent-hover)}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.badge-warehouse{background:var(--warehouse);color:#fff}
.badge-freight{background:var(--freight);color:#fff}
.btn{display:inline-block;padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:all .2s}
.btn-primary{background:var(--accent);color:#0d1117}.btn-primary:hover{background:var(--accent-hover)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}.btn-outline:hover{border-color:var(--accent);color:var(--accent)}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
.grid{display:grid;gap:24px}
.grid-2{grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.grid-3{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
header{border-bottom:1px solid var(--border);padding:16px 0}
header .container{display:flex;align-items:center;justify-content:space-between}
header .logo{font-size:18px;font-weight:700;color:var(--text)}
header .logo span{color:var(--accent)}
.hero{padding:64px 0 48px;text-align:center}
.hero h1{font-size:42px;font-weight:800;margin-bottom:12px;background:linear-gradient(135deg,var(--accent),var(--freight));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{font-size:18px;color:var(--text2);max-width:600px;margin:0 auto}
.section{padding:48px 0}
.section-title{font-size:24px;font-weight:700;margin-bottom:24px}
.progress-bar{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;background:var(--accent);border-radius:4px;transition:width .3s}
footer{border-top:1px solid var(--border);padding:32px 0;text-align:center;color:var(--text2);font-size:13px;margin-top:64px}
input[type="text"],input[type="email"]{width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:14px;font-family:inherit}
input:focus{outline:none;border-color:var(--accent)}
label{display:block;font-size:13px;color:var(--text2);margin-bottom:4px}
.form-group{margin-bottom:16px}
.video-wrap{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:var(--radius);margin-bottom:24px;background:#000}
.video-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
.quiz-option{display:block;padding:12px 16px;margin-bottom:8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color .2s}
.quiz-option:hover{border-color:var(--accent)}
.quiz-option.selected{border-color:var(--accent);background:rgba(0,194,168,.1)}
.quiz-option.correct{border-color:#22c55e;background:rgba(34,197,94,.1)}
.quiz-option.wrong{border-color:#ef4444;background:rgba(239,68,68,.1)}
.breadcrumb{font-size:14px;color:var(--text2);margin-bottom:16px}
.breadcrumb a{color:var(--text2)}.breadcrumb a:hover{color:var(--accent)}
.lesson-list{list-style:none}
.lesson-list li{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.lesson-list li:last-child{border-bottom:none}
.lesson-list li a{flex:1}
.check{color:#22c55e;font-size:18px}
.pending{color:var(--text2);font-size:18px}
.stats{display:flex;gap:32px;justify-content:center;margin-top:24px}
.stat{text-align:center}
.stat-value{font-size:28px;font-weight:800;color:var(--accent)}
.stat-label{font-size:13px;color:var(--text2)}
.nav-row{display:flex;justify-content:space-between;margin-top:32px}
@media(max-width:768px){
  .hero h1{font-size:28px}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .stats{flex-direction:column;gap:16px}
}
</style>
</head>
<body>
<header><div class="container">
  <div class="logo">Ringly<span>Pro</span> Training</div>
  <nav><a href="${BASE}" class="btn btn-outline">Home</a></nav>
</div></header>
${bodyContent}
<footer><div class="container">Logistics Training Academy &mdash; Powered by RinglyPro &copy; ${new Date().getFullYear()}</div></footer>
</body></html>`;
}

function trackBadge(track) {
  const label = track === 'warehouse' ? 'Warehouse Logistics' : 'Freight Transportation';
  return `<span class="badge badge-${track}">${label}</span>`;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------------------------------------------------------------------------
// GET / — Landing page
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const [modules] = await sequelize.query(
      `SELECT m.*, (SELECT COUNT(*) FROM lms_lessons l WHERE l.module_id = m.id) AS real_lesson_count
       FROM lms_modules m WHERE m.is_published = true ORDER BY m.track, m.position`
    );

    const warehouseModules = modules.filter(m => m.track === 'warehouse');
    const freightModules = modules.filter(m => m.track === 'freight');
    const warehouseLessons = warehouseModules.reduce((s, m) => s + parseInt(m.real_lesson_count || m.lesson_count || 0), 0);
    const freightLessons = freightModules.reduce((s, m) => s + parseInt(m.real_lesson_count || m.lesson_count || 0), 0);

    function moduleCards(mods) {
      if (!mods.length) return '<p style="color:var(--text2)">Modules coming soon.</p>';
      return `<div class="grid grid-3">${mods.map(m => {
        const lc = parseInt(m.real_lesson_count || m.lesson_count || 0);
        const hours = (lc * 10 / 60).toFixed(1);
        return `<a href="${BASE}/module/${m.id}" class="card" style="text-decoration:none;color:inherit">
          ${trackBadge(m.track)}
          <h3 style="margin:12px 0 8px">${escHtml(m.title)}</h3>
          <p style="color:var(--text2);font-size:14px;margin-bottom:12px">${escHtml(m.description)}</p>
          <div style="display:flex;gap:16px;font-size:13px;color:var(--text2)">
            <span>${lc} lessons</span><span>~${hours} hrs</span>
          </div>
        </a>`;
      }).join('')}</div>`;
    }

    const html = htmlShell('Home', `
      <div class="hero"><div class="container">
        <h1>Logistics Training Academy</h1>
        <p>Master warehouse operations and freight transportation with expert-led video courses, quizzes, and certificates.</p>
        <div class="stats">
          <div class="stat"><div class="stat-value">2</div><div class="stat-label">Learning Tracks</div></div>
          <div class="stat"><div class="stat-value">${modules.length}</div><div class="stat-label">Modules</div></div>
          <div class="stat"><div class="stat-value">${warehouseLessons + freightLessons}</div><div class="stat-label">Total Lessons</div></div>
        </div>
      </div></div>

      <div class="section"><div class="container">
        <div class="grid grid-2">
          <a href="${BASE}/track/warehouse" class="card" style="text-decoration:none;color:inherit;border-left:4px solid var(--warehouse)">
            <span class="badge badge-warehouse">Warehouse Logistics</span>
            <h2 style="margin:12px 0 8px">Warehouse Track</h2>
            <p style="color:var(--text2)">${warehouseModules.length} modules &middot; ${warehouseLessons} lessons</p>
            <p style="color:var(--text2);font-size:14px;margin-top:8px">Inventory management, WMS, receiving, shipping, and quality control.</p>
          </a>
          <a href="${BASE}/track/freight" class="card" style="text-decoration:none;color:inherit;border-left:4px solid var(--freight)">
            <span class="badge badge-freight">Freight Transportation</span>
            <h2 style="margin:12px 0 8px">Freight Track</h2>
            <p style="color:var(--text2)">${freightModules.length} modules &middot; ${freightLessons} lessons</p>
            <p style="color:var(--text2);font-size:14px;margin-top:8px">Carrier management, load planning, TMS, compliance, and freight brokerage.</p>
          </a>
        </div>
      </div></div>

      <div class="section"><div class="container">
        <h2 class="section-title" style="color:var(--warehouse)">Warehouse Logistics</h2>
        ${moduleCards(warehouseModules)}
      </div></div>

      <div class="section"><div class="container">
        <h2 class="section-title" style="color:var(--freight)">Freight Transportation</h2>
        ${moduleCards(freightModules)}
      </div></div>
    `);

    res.send(html);
  } catch (err) {
    console.error('LMS landing error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------------------------------------------------------------------------
// GET /track/:track
// ---------------------------------------------------------------------------
router.get('/track/:track', async (req, res) => {
  try {
    const track = req.params.track;
    if (!['warehouse', 'freight'].includes(track)) return res.status(404).send('Track not found');

    const [modules] = await sequelize.query(
      `SELECT m.*, (SELECT COUNT(*) FROM lms_lessons l WHERE l.module_id = m.id) AS real_lesson_count
       FROM lms_modules m WHERE m.track = :track AND m.is_published = true ORDER BY m.position`,
      { replacements: { track } }
    );

    const label = track === 'warehouse' ? 'Warehouse Logistics' : 'Freight Transportation';
    const totalLessons = modules.reduce((s, m) => s + parseInt(m.real_lesson_count || m.lesson_count || 0), 0);

    const html = htmlShell(label, `
      <div class="hero"><div class="container">
        ${trackBadge(track)}
        <h1 style="margin-top:12px">${label}</h1>
        <p>${modules.length} modules &middot; ${totalLessons} lessons</p>
      </div></div>
      <div class="section"><div class="container">
        <div class="grid grid-3">
          ${modules.map(m => {
            const lc = parseInt(m.real_lesson_count || m.lesson_count || 0);
            const hours = (lc * 10 / 60).toFixed(1);
            return `<a href="${BASE}/module/${m.id}" class="card" style="text-decoration:none;color:inherit">
              <h3 style="margin-bottom:8px">${escHtml(m.title)}</h3>
              <p style="color:var(--text2);font-size:14px;margin-bottom:12px">${escHtml(m.description)}</p>
              <div style="display:flex;gap:16px;font-size:13px;color:var(--text2)">
                <span>${lc} lessons</span><span>~${hours} hrs</span>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div></div>
    `);

    res.send(html);
  } catch (err) {
    console.error('LMS track error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------------------------------------------------------------------------
// GET /module/:id
// ---------------------------------------------------------------------------
router.get('/module/:id', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const learnerId = req.cookies && req.cookies.lms_learner_id ? parseInt(req.cookies.lms_learner_id) : null;

    const [modules] = await sequelize.query(
      'SELECT * FROM lms_modules WHERE id = :id', { replacements: { id: moduleId } }
    );
    if (!modules.length) return res.status(404).send('Module not found');
    const mod = modules[0];

    const [lessons] = await sequelize.query(
      'SELECT * FROM lms_lessons WHERE module_id = :mid ORDER BY position',
      { replacements: { mid: moduleId } }
    );

    let progressMap = {};
    if (learnerId) {
      const [rows] = await sequelize.query(
        'SELECT lesson_id, completed, quiz_passed FROM lms_progress WHERE learner_id = :lid',
        { replacements: { lid: learnerId } }
      );
      rows.forEach(r => { progressMap[r.lesson_id] = r; });
    }

    const completedCount = lessons.filter(l => progressMap[l.id] && progressMap[l.id].completed).length;
    const pct = lessons.length ? Math.round(completedCount / lessons.length * 100) : 0;
    const allDone = lessons.length > 0 && completedCount === lessons.length;

    const enrollForm = learnerId ? '' : `
      <div class="card" style="margin-top:24px">
        <h3 style="margin-bottom:16px">Enroll to Track Progress</h3>
        <form method="POST" action="${BASE}/enroll" id="enrollForm">
          <div class="form-group"><label>Name</label><input type="text" name="name" required></div>
          <div class="form-group"><label>Email</label><input type="email" name="email" required></div>
          <button type="submit" class="btn btn-primary">Enroll Now</button>
        </form>
      </div>`;

    const certButton = allDone ? `<a href="${BASE}/certificate/${moduleId}" class="btn btn-primary" style="margin-top:16px">View Certificate</a>` : '';

    const html = htmlShell(mod.title, `
      <div class="section"><div class="container">
        <div class="breadcrumb">
          <a href="${BASE}">Home</a> / <a href="${BASE}/track/${mod.track}">${mod.track === 'warehouse' ? 'Warehouse' : 'Freight'}</a> / ${escHtml(mod.title)}
        </div>
        ${trackBadge(mod.track)}
        <h1 style="margin:12px 0">${escHtml(mod.title)}</h1>
        <p style="color:var(--text2);max-width:700px">${escHtml(mod.description)}</p>

        ${learnerId ? `
        <div style="margin-top:24px">
          <div style="font-size:14px;color:var(--text2)">${completedCount} of ${lessons.length} lessons complete (${pct}%)</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          ${certButton}
        </div>` : ''}

        <div class="card" style="margin-top:24px;padding:0">
          <ul class="lesson-list">
            ${lessons.map((l, i) => {
              const done = progressMap[l.id] && progressMap[l.id].completed;
              return `<li>
                <span class="${done ? 'check' : 'pending'}">${done ? '&#10003;' : '&#9675;'}</span>
                <a href="${BASE}/lesson/${l.id}">${i + 1}. ${escHtml(l.title)}</a>
                <span style="font-size:13px;color:var(--text2)">${l.duration_minutes || 10} min</span>
              </li>`;
            }).join('')}
          </ul>
        </div>

        ${enrollForm}
      </div></div>
    `);

    res.send(html);
  } catch (err) {
    console.error('LMS module error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------------------------------------------------------------------------
// GET /lesson/:id
// ---------------------------------------------------------------------------
router.get('/lesson/:id', async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const learnerId = req.cookies && req.cookies.lms_learner_id ? parseInt(req.cookies.lms_learner_id) : null;

    const [lessons] = await sequelize.query('SELECT * FROM lms_lessons WHERE id = :id', { replacements: { id: lessonId } });
    if (!lessons.length) return res.status(404).send('Lesson not found');
    const lesson = lessons[0];

    const [modules] = await sequelize.query('SELECT * FROM lms_modules WHERE id = :id', { replacements: { id: lesson.module_id } });
    const mod = modules[0] || { title: 'Module', track: 'warehouse', id: lesson.module_id };

    const [allLessons] = await sequelize.query(
      'SELECT id, position, title FROM lms_lessons WHERE module_id = :mid ORDER BY position',
      { replacements: { mid: lesson.module_id } }
    );
    const idx = allLessons.findIndex(l => l.id === lessonId);
    const prevLesson = idx > 0 ? allLessons[idx - 1] : null;
    const nextLesson = idx < allLessons.length - 1 ? allLessons[idx + 1] : null;

    const [questions] = await sequelize.query(
      'SELECT * FROM lms_quiz_questions WHERE lesson_id = :lid ORDER BY id',
      { replacements: { lid: lessonId } }
    );

    // Bullet-point notes from transcript_notes
    const notes = lesson.transcript_notes
      ? lesson.transcript_notes.split('\n').filter(n => n.trim()).map(n => `<li>${escHtml(n.trim())}</li>`).join('')
      : '';

    const videoSection = lesson.youtube_video_id
      ? `<div class="video-wrap"><iframe src="https://www.youtube.com/embed/${escHtml(lesson.youtube_video_id)}" allowfullscreen></iframe></div>`
      : `<div class="card" style="text-align:center;padding:48px;margin-bottom:24px"><p style="color:var(--text2);font-size:18px">Video coming soon</p></div>`;

    const quizSection = questions.length ? `
      <div class="card" style="margin-top:32px">
        <h3 style="margin-bottom:16px">Lesson Quiz</h3>
        <form id="quizForm">
          ${questions.map((q, qi) => `
            <div style="margin-bottom:24px">
              <p style="font-weight:600;margin-bottom:8px">${qi + 1}. ${escHtml(q.question)}</p>
              ${['a','b','c','d'].map(opt => {
                const text = q['option_' + opt];
                if (!text) return '';
                return `<label class="quiz-option" data-q="${q.id}" data-opt="${opt}">
                  <input type="radio" name="q${q.id}" value="${opt}" style="margin-right:8px"> ${escHtml(text)}
                </label>`;
              }).join('')}
              <div id="explain-${q.id}" style="display:none;margin-top:8px;font-size:14px;color:var(--text2)"></div>
            </div>
          `).join('')}
          <button type="button" onclick="submitQuiz()" class="btn btn-primary">Submit Answers</button>
          <div id="quizResult" style="margin-top:16px;font-weight:600"></div>
        </form>
      </div>
      <script>
      async function submitQuiz(){
        const answers = {};
        document.querySelectorAll('#quizForm input[type=radio]:checked').forEach(r => {
          const qid = r.name.replace('q','');
          answers[qid] = r.value;
        });
        const resp = await fetch('${BASE}/api/quiz/check', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ lesson_id: ${lessonId}, answers })
        });
        const data = await resp.json();
        document.getElementById('quizResult').innerHTML =
          'Score: ' + data.score + '/' + data.total + (data.passed ? ' — Passed!' : ' — Try again');
        document.getElementById('quizResult').style.color = data.passed ? '#22c55e' : '#ef4444';
        if (data.results) {
          data.results.forEach(r => {
            const labels = document.querySelectorAll('[data-q="'+r.question_id+'"]');
            labels.forEach(lb => {
              lb.classList.remove('selected','correct','wrong');
              if (lb.dataset.opt === r.correct) lb.classList.add('correct');
              else if (lb.dataset.opt === r.given && r.given !== r.correct) lb.classList.add('wrong');
            });
            const ex = document.getElementById('explain-'+r.question_id);
            if (ex && r.explanation) { ex.style.display='block'; ex.textContent = r.explanation; }
          });
        }
        ${learnerId ? `
        // Save progress
        fetch('${BASE}/progress', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ learner_id: ${learnerId}, lesson_id: ${lessonId}, completed: true, quiz_passed: data.passed })
        });` : ''}
      }
      </script>
    ` : '';

    const html = htmlShell(lesson.title, `
      <div class="section"><div class="container" style="max-width:860px">
        <div class="breadcrumb">
          <a href="${BASE}">Home</a> /
          <a href="${BASE}/track/${mod.track}">${mod.track === 'warehouse' ? 'Warehouse' : 'Freight'}</a> /
          <a href="${BASE}/module/${mod.id}">${escHtml(mod.title)}</a> /
          ${escHtml(lesson.title)}
        </div>

        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">Lesson ${idx + 1} of ${allLessons.length}</div>
        <h1 style="margin-bottom:24px">${escHtml(lesson.title)}</h1>

        ${videoSection}

        ${lesson.summary ? `<p style="color:var(--text2);margin-bottom:24px">${escHtml(lesson.summary)}</p>` : ''}

        ${notes ? `
        <div class="card" style="margin-bottom:24px">
          <h3 style="margin-bottom:12px">Key Takeaways</h3>
          <ul style="padding-left:20px;color:var(--text2)">${notes}</ul>
        </div>` : ''}

        ${quizSection}

        ${learnerId && !questions.length ? `
        <div style="margin-top:24px">
          <button onclick="markComplete()" class="btn btn-primary" id="markBtn">Mark as Complete</button>
        </div>
        <script>
        async function markComplete(){
          await fetch('${BASE}/progress',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({learner_id:${learnerId},lesson_id:${lessonId},completed:true,quiz_passed:false})
          });
          document.getElementById('markBtn').textContent='Completed!';
          document.getElementById('markBtn').disabled=true;
        }
        </script>` : ''}

        <div class="nav-row">
          ${prevLesson ? `<a href="${BASE}/lesson/${prevLesson.id}" class="btn btn-outline">&larr; Previous</a>` : '<span></span>'}
          ${nextLesson ? `<a href="${BASE}/lesson/${nextLesson.id}" class="btn btn-primary">Next &rarr;</a>` : `<a href="${BASE}/module/${mod.id}" class="btn btn-outline">Back to Module</a>`}
        </div>
      </div></div>
    `);

    res.send(html);
  } catch (err) {
    console.error('LMS lesson error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------------------------------------------------------------------------
// POST /enroll
// ---------------------------------------------------------------------------
router.post('/enroll', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    await sequelize.query(
      `INSERT INTO lms_learners (name, email) VALUES (:name, :email) ON CONFLICT (email) DO NOTHING`,
      { replacements: { name: name || 'Learner', email } }
    );

    const [rows] = await sequelize.query(
      'SELECT id FROM lms_learners WHERE email = :email', { replacements: { email } }
    );

    if (rows.length) {
      res.cookie('lms_learner_id', String(rows[0].id), { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, path: '/' });

      // If form POST (not JSON), redirect back
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
        return res.redirect(req.headers.referer || BASE);
      }
      return res.json({ learner_id: rows[0].id });
    }

    res.status(500).json({ error: 'Enrollment failed' });
  } catch (err) {
    console.error('LMS enroll error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /progress
// ---------------------------------------------------------------------------
router.post('/progress', async (req, res) => {
  try {
    const { learner_id, lesson_id, completed, quiz_passed } = req.body;
    if (!learner_id || !lesson_id) return res.status(400).json({ error: 'learner_id and lesson_id required' });

    await sequelize.query(
      `INSERT INTO lms_progress (learner_id, lesson_id, completed, quiz_passed, last_watched_at)
       VALUES (:learner_id, :lesson_id, :completed, :quiz_passed, NOW())
       ON CONFLICT (learner_id, lesson_id)
       DO UPDATE SET completed = COALESCE(:completed, lms_progress.completed),
                     quiz_passed = COALESCE(:quiz_passed, lms_progress.quiz_passed),
                     last_watched_at = NOW()`,
      { replacements: { learner_id, lesson_id, completed: completed || false, quiz_passed: quiz_passed || false } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('LMS progress error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /certificate/:moduleId
// ---------------------------------------------------------------------------
router.get('/certificate/:moduleId', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    const learnerId = req.cookies && req.cookies.lms_learner_id ? parseInt(req.cookies.lms_learner_id) : null;
    if (!learnerId) return res.status(401).send('Please enroll first');

    const [modules] = await sequelize.query('SELECT * FROM lms_modules WHERE id = :id', { replacements: { id: moduleId } });
    if (!modules.length) return res.status(404).send('Module not found');
    const mod = modules[0];

    const [learners] = await sequelize.query('SELECT * FROM lms_learners WHERE id = :id', { replacements: { id: learnerId } });
    if (!learners.length) return res.status(404).send('Learner not found');
    const learner = learners[0];

    const [lessons] = await sequelize.query(
      'SELECT id FROM lms_lessons WHERE module_id = :mid', { replacements: { mid: moduleId } }
    );
    const lessonIds = lessons.map(l => l.id);

    if (lessonIds.length === 0) return res.status(400).send('Module has no lessons');

    const [progress] = await sequelize.query(
      `SELECT lesson_id FROM lms_progress WHERE learner_id = :lid AND completed = true AND lesson_id IN (:ids)`,
      { replacements: { lid: learnerId, ids: lessonIds } }
    );

    if (progress.length < lessonIds.length) {
      return res.status(403).send(`Complete all ${lessonIds.length} lessons first (${progress.length}/${lessonIds.length} done)`);
    }

    // Upsert certificate record
    await sequelize.query(
      `INSERT INTO lms_certificates (learner_id, module_id) VALUES (:lid, :mid)
       ON CONFLICT DO NOTHING`,
      { replacements: { lid: learnerId, mid: moduleId } }
    );

    const trackLabel = mod.track === 'warehouse' ? 'Warehouse Logistics' : 'Freight Transportation';
    const issueDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Certificate — ${escHtml(mod.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
@media print { body{margin:0} .no-print{display:none!important} }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0d1117;display:flex;flex-direction:column;align-items:center;padding:40px 20px;min-height:100vh}
.cert{width:900px;max-width:100%;background:linear-gradient(135deg,#161b22 0%,#1c2333 100%);border:3px solid #00c2a8;border-radius:16px;padding:64px;text-align:center;position:relative;overflow:hidden}
.cert::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 40%,rgba(0,194,168,.06) 0%,transparent 60%);pointer-events:none}
.cert h1{font-family:'Playfair Display',serif;font-size:36px;color:#00c2a8;margin-bottom:8px}
.cert .subtitle{font-size:14px;color:#8b949e;text-transform:uppercase;letter-spacing:3px;margin-bottom:48px}
.cert .name{font-size:32px;font-weight:800;color:#e6edf3;margin-bottom:8px}
.cert .body-text{font-size:16px;color:#8b949e;margin-bottom:48px;line-height:1.8}
.cert .module-name{color:#e6edf3;font-weight:700}
.cert .track-name{color:#00c2a8;font-weight:600}
.divider{width:120px;height:2px;background:linear-gradient(90deg,transparent,#00c2a8,transparent);margin:0 auto 48px}
.cert .date{font-size:14px;color:#8b949e;margin-bottom:16px}
.cert .brand{font-size:13px;color:#484f58}
.btn-row{margin-top:24px}
.btn{display:inline-block;padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;border:none;text-decoration:none;margin:0 8px}
.btn-accent{background:#00c2a8;color:#0d1117}
.btn-outline{background:transparent;border:1px solid #30363d;color:#e6edf3}
</style>
</head>
<body>
<div class="cert">
  <h1>Certificate of Completion</h1>
  <div class="subtitle">Logistics Training Academy</div>
  <div class="divider"></div>
  <div class="name">${escHtml(learner.name)}</div>
  <div class="body-text">
    Has successfully completed<br>
    <span class="module-name">${escHtml(mod.title)}</span><br>
    <span class="track-name">${trackLabel} Training</span>
  </div>
  <div class="date">Issued on ${issueDate}</div>
  <div class="brand">Powered by RinglyPro</div>
</div>
<div class="btn-row no-print">
  <button onclick="window.print()" class="btn btn-accent">Print Certificate</button>
  <a href="${BASE}/module/${moduleId}" class="btn btn-outline">Back to Module</a>
</div>
</body></html>`);
  } catch (err) {
    console.error('LMS certificate error:', err);
    res.status(500).send('Internal server error');
  }
});

// ---------------------------------------------------------------------------
// JSON API routes
// ---------------------------------------------------------------------------
router.get('/api/modules', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT m.*, (SELECT COUNT(*) FROM lms_lessons l WHERE l.module_id = m.id) AS lesson_count_real
       FROM lms_modules m WHERE m.is_published = true ORDER BY m.track, m.position`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/modules/:id/lessons', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM lms_lessons WHERE module_id = :mid AND is_published = true ORDER BY position',
      { replacements: { mid: parseInt(req.params.id) } }
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/lesson/:id/quiz', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      'SELECT id, lesson_id, question, option_a, option_b, option_c, option_d FROM lms_quiz_questions WHERE lesson_id = :lid ORDER BY id',
      { replacements: { lid: parseInt(req.params.id) } }
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/quiz/check', async (req, res) => {
  try {
    const { lesson_id, answers } = req.body;
    if (!lesson_id || !answers) return res.status(400).json({ error: 'lesson_id and answers required' });

    const [questions] = await sequelize.query(
      'SELECT id, correct_option, explanation FROM lms_quiz_questions WHERE lesson_id = :lid ORDER BY id',
      { replacements: { lid: lesson_id } }
    );

    let score = 0;
    const results = questions.map(q => {
      const given = answers[String(q.id)] || '';
      const correct = given.toLowerCase() === (q.correct_option || '').toLowerCase();
      if (correct) score++;
      return {
        question_id: q.id,
        given,
        correct: q.correct_option,
        is_correct: correct,
        explanation: q.explanation
      };
    });

    const passed = questions.length > 0 && score >= Math.ceil(questions.length * 0.7);

    res.json({ score, total: questions.length, passed, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
router.get('/health', async (req, res) => {
  try {
    const [[modCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM lms_modules');
    const [[lessonCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM lms_lessons');
    res.json({ status: 'ok', modules: parseInt(modCount.c), lessons: parseInt(lessonCount.c) });
  } catch (err) {
    res.json({ status: 'ok', modules: 0, lessons: 0, note: 'tables may not exist yet' });
  }
});

// ── Admin: Video Manager ──────────────────────────────────────
router.get('/admin/videos', async (req, res) => {
  try {
    const [lessons] = await sequelize.query(`
      SELECT l.id, l.title, l.youtube_video_id, l.youtube_title, l.position as lpos,
             m.title as module_title, m.track, m.position as mpos
      FROM lms_lessons l JOIN lms_modules m ON l.module_id = m.id
      ORDER BY m.track, m.position, l.position
    `);
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LMS Video Manager</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0d1117;color:#e6edf3;padding:24px}
h1{font-size:24px;margin-bottom:8px}
.sub{color:#8b949e;font-size:14px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;background:#161b22;color:#8b949e;font-weight:600;position:sticky;top:0;z-index:1}
td{padding:8px 12px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:hover{background:#161b22}
.track-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase}
.warehouse{background:#8b5cf6;color:#fff}.freight{background:#3b82f6;color:#fff}
.vid-input{background:#0d1117;border:1px solid #30363d;color:#e6edf3;padding:6px 10px;border-radius:6px;width:140px;font-size:12px;font-family:monospace}
.vid-input:focus{border-color:#00c2a8;outline:none}
.title-input{background:#0d1117;border:1px solid #30363d;color:#e6edf3;padding:6px 10px;border-radius:6px;width:200px;font-size:12px}
.title-input:focus{border-color:#00c2a8;outline:none}
.btn-save{background:#00c2a8;color:#0d1117;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
.btn-save:hover{background:#00e6c3}
.btn-save:disabled{opacity:.4;cursor:not-allowed}
.btn-search{background:#30363d;color:#e6edf3;border:none;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap}
.btn-search:hover{background:#484f58}
.status{font-size:11px;padding:2px 6px;border-radius:4px}
.has-vid{color:#3fb950;background:#3fb95015}.no-vid{color:#f85149;background:#f8514915}
.saved{animation:flash .5s}
@keyframes flash{0%{background:#00c2a830}100%{background:transparent}}
.stats{display:flex;gap:16px;margin-bottom:20px}
.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 20px}
.stat-num{font-size:28px;font-weight:700;color:#00c2a8}
.stat-label{font-size:11px;color:#8b949e;margin-top:2px}
</style></head><body>
<h1>LMS Video Manager</h1>
<p class="sub">Paste YouTube video IDs for each lesson. Click the search icon to open YouTube with the lesson topic pre-filled.</p>
<div class="stats">
  <div class="stat"><div class="stat-num" id="total">${lessons.length}</div><div class="stat-label">Total Lessons</div></div>
  <div class="stat"><div class="stat-num" id="filled">${lessons.filter(l => l.youtube_video_id).length}</div><div class="stat-label">With Videos</div></div>
  <div class="stat"><div class="stat-num" id="missing">${lessons.filter(l => !l.youtube_video_id).length}</div><div class="stat-label">Missing Videos</div></div>
</div>
<table>
<thead><tr><th>#</th><th>Track</th><th>Module</th><th>Lesson</th><th>Video ID</th><th>Video Title</th><th>Status</th><th></th><th></th></tr></thead>
<tbody>
${lessons.map((l, i) => `<tr id="row-${l.id}">
  <td>${i + 1}</td>
  <td><span class="track-badge ${l.track}">${l.track}</span></td>
  <td style="max-width:160px">${l.module_title}</td>
  <td style="max-width:200px">${l.title}</td>
  <td><input class="vid-input" id="vid-${l.id}" value="${l.youtube_video_id || ''}" placeholder="e.g. dQw4w9WgXcQ"></td>
  <td><input class="title-input" id="title-${l.id}" value="${(l.youtube_title || '').replace(/"/g, '&quot;')}" placeholder="Video title"></td>
  <td><span class="status ${l.youtube_video_id ? 'has-vid' : 'no-vid'}" id="status-${l.id}">${l.youtube_video_id ? 'Set' : 'Missing'}</span></td>
  <td><button class="btn-search" onclick="window.open('https://www.youtube.com/results?search_query='+encodeURIComponent('${l.title.replace(/'/g, '')} logistics education'),'_blank')">Search</button></td>
  <td><button class="btn-save" onclick="saveVideo(${l.id})">Save</button></td>
</tr>`).join('')}
</tbody></table>
<script>
async function saveVideo(id) {
  const vid = document.getElementById('vid-' + id).value.trim();
  const title = document.getElementById('title-' + id).value.trim();
  const btn = event.target;
  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await fetch('/logistics/training/admin/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: id, youtube_video_id: vid || null, youtube_title: title || null })
    });
    const data = await res.json();
    if (data.success) {
      const row = document.getElementById('row-' + id);
      row.classList.add('saved');
      setTimeout(() => row.classList.remove('saved'), 600);
      const st = document.getElementById('status-' + id);
      st.className = 'status ' + (vid ? 'has-vid' : 'no-vid');
      st.textContent = vid ? 'Set' : 'Missing';
      updateStats();
    }
  } catch (e) { alert('Error: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Save';
}
function updateStats() {
  const inputs = document.querySelectorAll('.vid-input');
  let filled = 0;
  inputs.forEach(i => { if (i.value.trim()) filled++; });
  document.getElementById('filled').textContent = filled;
  document.getElementById('missing').textContent = inputs.length - filled;
}
</script></body></html>`);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

router.post('/admin/videos', async (req, res) => {
  try {
    const { lesson_id, youtube_video_id, youtube_title } = req.body;
    await sequelize.query(
      `UPDATE lms_lessons SET youtube_video_id = :vid, youtube_title = :title WHERE id = :id`,
      { replacements: { vid: youtube_video_id, title: youtube_title, id: lesson_id } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
