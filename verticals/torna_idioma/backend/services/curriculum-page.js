// Renders the public curriculum review page (/Torna_Idioma/modules, tornaidioma.com/modules)
// straight from ti_courses + ti_lessons, so it can never drift from what a learner is served.
//
// ANSWER KEYS ARE WITHHELD BY DEFAULT. This page is on the open internet; a learner who
// finds it must not find the answer key with it. Correct answers render only when
// TI_MODULES_KEY is set in the environment AND the request carries ?key=<that value>.

const sequelize = require('./db.ti');
const activityPack = require('./activity-pack');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Minimal markdown for the lesson bodies: headings, bullets, bold, italics, code, paragraphs.
function md(src) {
  if (!src) return '<p class="empty">No content stored for this lesson.</p>';
  const out = [];
  let list = false, para = [];
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push('</ul>'); list = false; } };

  for (const raw of String(src).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushP(); flushL();
      const lvl = Math.min(h[1].length + 2, 6); // '#' becomes h3 so it nests under the lesson heading
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) {
      flushP();
      if (!list) { out.push('<ul>'); list = true; }
      out.push('<li>' + inline(li[1]) + '</li>');
      continue;
    }
    flushL();
    para.push(line.trim());
  }
  flushP(); flushL();
  return out.join('\n');
}

const cefr = (desc) => {
  const m = String(desc || '').match(/CEFR\s+([AB][12]\+?(?:\s*-\s*[AB][12]\+?)?)/i);
  if (m) return m[1].replace(/\s*-\s*/, '–');
  return /\bB1\+/.test(String(desc || '')) ? 'B1+' : '—';
};

const parseExercises = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch (e) { return []; }
};

async function loadCurriculum() {
  const [courses] = await sequelize.query(
    `SELECT id, title_en, title_es, title_fil, description_en, level, duration_hours,
            total_lessons, is_published, sort_order
       FROM ti_courses ORDER BY sort_order, id`
  );
  const [lessons] = await sequelize.query(
    `SELECT id, course_id, title_en, title_es, title_fil, content_en, content_es, content_fil,
            lesson_type, sort_order, duration_minutes, exercises
       FROM ti_lessons ORDER BY course_id, sort_order, id`
  );
  const packs = await activityPack.loadPacks(lessons.map((l) => l.id));
  return { courses, lessons, packs };
}

/** The practice layer for one lesson: speak, drill, work. */
function renderPack(pack) {
  if (!pack) return '';
  const sec = [];

  if (pack.can_do && pack.can_do.length) {
    sec.push(`<div class="pk"><h4 class="pk-h">By the end of this module I can</h4><ul class="cando">${
      pack.can_do.map((c) => `<li>${esc(c)}</li>`).join('')
    }</ul></div>`);
  }

  if (pack.roleplay) {
    const r = pack.roleplay;
    sec.push(`<div class="pk"><h4 class="pk-h">Roleplay &middot; ${esc(r.title)}</h4>
      <p class="sit">${esc(r.situation)}</p>
      <p class="opens"><span class="who">Tutor opens</span>${esc(r.opens)}</p>
      <p class="must"><span class="who">You must use</span>${(r.must_use || []).map((m) => `<code>${esc(m)}</code>`).join(' ')}</p>
    </div>`);
  }

  const a = pack.authored;
  if (a && a.dialogue && (a.dialogue.lines || []).length) {
    sec.push(`<div class="pk"><h4 class="pk-h">Listen first &middot; ${esc(a.dialogue.setting)}</h4>
      <div class="dlg">${a.dialogue.lines.map((l) => `<div class="dlg-line"><span class="spk">${esc(l.speaker)}</span><span class="dlg-es">${esc(l.es)}</span><span class="dlg-en">${esc(l.en)}</span></div>`).join('')}</div>
      ${a.comprehension_question ? `<p class="must"><span class="who">Answer aloud</span>${esc(a.comprehension_question)}</p>` : ''}
    </div>`);
  }

  if (a && (a.likely_errors || []).length) {
    sec.push(`<div class="pk"><h4 class="pk-h">What Filipino learners get wrong here</h4>
      ${a.likely_errors.map((e) => `<div class="drill"><span class="err">${esc(e.error)}</span><span class="fix">${esc(e.correction)}</span><p class="why">${esc(e.why)}</p></div>`).join('')}
    </div>`);
  }

  if (pack.debate) {
    sec.push(`<div class="pk"><h4 class="pk-h">Debate</h4>
      <p class="sit">${esc(pack.debate.prompt)}</p>
      <p class="pos"><span class="who">A</span>${esc(pack.debate.position_a)}</p>
      <p class="pos"><span class="who">B</span>${esc(pack.debate.position_b)}</p>
    </div>`);
  }

  if (pack.grammar) {
    sec.push(`<div class="pk"><h4 class="pk-h">Grammar focus &middot; ${esc(pack.grammar.point)}</h4>
      <p class="sit">${esc(pack.grammar.why)}</p>
      ${(pack.grammar.examples || []).map((e) => `<p class="ex-line">${esc(e)}</p>`).join('')}
    </div>`);
  }

  if (pack.sentence_mode && pack.sentence_mode.length) {
    sec.push(`<div class="pk"><h4 class="pk-h">Say it aloud &middot; ${pack.sentence_mode.length} drills</h4>
      ${pack.sentence_mode.map((d) => `<div class="drill"><span class="say">${esc(d.say)}</span><span class="means">${esc(d.means)}</span><span class="tgt">${esc(d.targets)}</span><p class="why">${esc(d.why)}</p></div>`).join('')}
    </div>`);
  }

  if (pack.pronunciation_focus && pack.pronunciation_focus.length) {
    sec.push(`<div class="pk"><h4 class="pk-h">Sounds this lesson exercises</h4>
      ${pack.pronunciation_focus.map((f) => `<div class="phon ${f.kind}"><span class="ph-sound">${esc(f.sound)}</span><span class="ph-kind">${f.kind === 'contrast' ? 'needs work' : 'free win from Tagalog'}</span><p class="why">${esc(f.tip_en)}</p><p class="ph-ex">${(f.examples || []).map((e) => `<code>${esc(e)}</code>`).join(' ')}</p></div>`).join('')}
    </div>`);
  }

  if (pack.word_mode && pack.word_mode.length) {
    sec.push(`<div class="pk"><h4 class="pk-h">Target vocabulary &middot; ${pack.counts ? pack.counts.vocabulary : pack.word_mode.length} terms${
      pack.counts && pack.counts.cognates ? `, ${pack.counts.cognates} with a Tagalog bridge` : ''
    }</h4>
      <div class="words">${pack.word_mode.map((w) => `<div class="word"><span class="w-es">${esc(w.term)}</span><span class="w-en">${esc(w.gloss)}</span>${
        w.cognate ? `<span class="w-tl">Tagalog: <strong>${esc(w.cognate.tagalog)}</strong>${w.cognate.note ? ` &middot; ${esc(w.cognate.note)}` : ''}</span>` : ''
      }</div>`).join('')}</div>
    </div>`);
  }

  if (pack.occupational) {
    const o = pack.occupational;
    sec.push(`<div class="pk occ"><h4 class="pk-h">Workplace track &middot; ${esc(o.track)}</h4>
      <p class="sit">${esc(o.register)}</p>
      ${o.scenario ? `<p class="opens"><span class="who">${esc(o.scenario.title)}</span>${esc(o.scenario.situation)}</p>
      <p class="must"><span class="who">You must use</span>${(o.scenario.must_use || []).map((m) => `<code>${esc(m)}</code>`).join(' ')}</p>` : ''}
      ${o.compliance ? `<p class="compliance">${esc(o.compliance)}</p>` : ''}
    </div>`);
  }

  if (!sec.length) return '';
  return `<div class="practice"><h3 class="practice-h">Practice</h3>${sec.join('')}</div>`;
}

function render({ courses, lessons, packs }, { showAnswers }) {
  const byCourse = {};
  lessons.forEach((l) => { (byCourse[l.course_id] = byCourse[l.course_id] || []).push(l); });

  const allEx = lessons.reduce((a, l) => a + parseExercises(l.exercises).length, 0);
  const words = lessons.reduce((a, l) => a + String(l.content_en || '').split(/\s+/).filter(Boolean).length, 0);
  const hours = courses.reduce((a, c) => a + (c.duration_hours || 0), 0);
  const published = courses.filter((c) => c.is_published).length;

  const withEs = lessons.filter((l) => l.content_es && String(l.content_es).trim()).length;
  const withFil = lessons.filter((l) => l.content_fil && String(l.content_fil).trim()).length;
  const withEn = lessons.filter((l) => l.content_en && String(l.content_en).trim()).length;
  const types = {};
  lessons.forEach((l) => { types[l.lesson_type] = (types[l.lesson_type] || 0) + 1; });
  const typeSummary = Object.entries(types).map(([k, v]) => `${v} ${k}`).join(', ');

  const P = Object.values(packs || {});
  const sum = (fn) => P.reduce((a, p) => a + (fn(p) || 0), 0);
  const practice = {
    packs: P.length,
    vocabulary: sum((p) => p.counts && p.counts.vocabulary),
    cognates: sum((p) => p.counts && p.counts.cognates),
    drills: sum((p) => (p.sentence_mode || []).length),
    roleplays: sum((p) => (p.all_roleplays || []).length ? 1 : 0),
    debates: P.filter((p) => p.debate).length,
    occupational: P.filter((p) => p.occupational).length,
  };

  const flag = (ok, label, value) =>
    `<li><span class="badge ${ok ? 'ok' : 'warn'}">${ok ? 'complete' : 'gap'}</span><span><span class="lbl">${esc(label)}</span> &mdash; <span class="val">${esc(value)}</span></span></li>`;

  const audit = [
    flag(practice.packs === lessons.length, 'Speaking practice', practice.packs ? `${practice.packs} of ${lessons.length} lessons carry a practice pack` : 'not built yet — run build-activity-packs.js'),
    flag(practice.cognates > 0, 'Tagalog cognate bridge', `${practice.cognates} target words linked to their Filipino cognate`),
    flag(practice.occupational > 0, 'Workplace (BPO) track', practice.occupational ? `${practice.occupational} lessons from Module 7 onward` : 'none'),
    flag(withEn === lessons.length, 'English lesson content', `${withEn} of ${lessons.length} lessons`),
    flag(lessons.every((l) => l.title_fil), 'Filipino lesson titles', `${lessons.filter((l) => l.title_fil).length} of ${lessons.length} lessons`),
    flag(lessons.every((l) => parseExercises(l.exercises).length > 0), 'Assessment items', `${allEx} across ${lessons.length} lessons`),
    flag(withEs === lessons.length, 'Spanish lesson content', `${withEs} of ${lessons.length} lessons`),
    flag(withFil === lessons.length, 'Filipino lesson content', `${withFil} of ${lessons.length} lessons`),
    flag(Object.keys(types).length > 1, 'Lesson formats', typeSummary || 'none'),
  ].join('\n        ');

  const nav = courses.map((c, i) =>
    `<li><a href="#m${c.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(String(c.title_en || '').replace(/^Module \d+:\s*/, ''))}</span><span class="c">${(byCourse[c.id] || []).length}</span></a></li>`
  ).join('\n');

  const modules = courses.map((c, i) => {
    const ls = byCourse[c.id] || [];

    const lessonHtml = ls.map((l, li) => {
      const ex = parseExercises(l.exercises).map((e, ei) => {
        if (e.type === 'multiple_choice') {
          const opts = (e.options || []).map((o, oi) => {
            const right = showAnswers && oi === e.answer;
            return `<li class="${right ? 'right' : ''}">${esc(o)}${right ? '<span class="key">correct</span>' : ''}</li>`;
          }).join('');
          return `<div class="ex"><div class="ex-h"><span class="ex-n">${ei + 1}</span><span class="ex-t">Multiple choice</span></div><p class="q">${esc(e.q)}</p><ol class="opts">${opts}</ol></div>`;
        }
        const ans = showAnswers
          ? `<p class="ans">Answer: <strong>${esc(e.answer)}</strong></p>`
          : `<p class="ans hidden-ans">Answer withheld</p>`;
        return `<div class="ex"><div class="ex-h"><span class="ex-n">${ei + 1}</span><span class="ex-t">Fill in the blank</span></div><p class="q">${esc(e.q)}</p>${ans}</div>`;
      }).join('');

      const search = esc([l.title_en, l.title_es, l.title_fil, l.content_en].join(' ').toLowerCase());

      return `<details class="lesson" data-search="${search}">
<summary>
  <span class="l-n">${i + 1}.${li + 1}</span>
  <span class="l-titles"><span class="l-en">${esc(l.title_en)}</span><span class="l-es">${esc(l.title_es)}</span></span>
  <span class="l-meta"><span class="chip type">${esc(l.lesson_type)}</span><span class="chip">${esc(l.duration_minutes)} min</span></span>
</summary>
<div class="l-body">
  <p class="l-fil">Filipino title: <strong>${esc(l.title_fil)}</strong></p>
  <div class="prose">${md(l.content_en)}</div>
  ${renderPack((packs || {})[l.id])}
  <div class="ex-block"><h3 class="ex-head">Assessment &middot; ${parseExercises(l.exercises).length} items</h3>${ex}</div>
</div>
</details>`;
    }).join('\n');

    return `<section class="module" id="m${c.id}">
  <header class="m-head">
    <div class="m-eyebrow"><span class="m-num">Module ${i + 1}</span><span class="chip cefr">${esc(cefr(c.description_en))}</span><span class="chip">${esc(c.duration_hours)} h</span><span class="chip">${ls.length} lessons</span>${c.is_published ? '<span class="chip live">published</span>' : '<span class="chip draft">draft</span>'}</div>
    <h2>${esc(String(c.title_en || '').replace(/^Module \d+:\s*/, ''))}</h2>
    <p class="m-es">${esc(String(c.title_es || '').replace(/^Módulo \d+:\s*/, ''))} &middot; <span class="fil">${esc(String(c.title_fil || '').replace(/^Module \d+:\s*/, ''))}</span></p>
    <p class="m-desc">${esc(c.description_en)}</p>
  </header>
  ${lessonHtml}
</section>`;
  }).join('\n');

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curriculum &mdash; Torna Idioma</title>
<meta name="description" content="The full Torna Idioma Spanish curriculum: ${courses.length} modules, ${lessons.length} lessons, CEFR A1 to B1+.">
<meta name="robots" content="noindex">
<link rel="icon" href="/Torna_Idioma/favicon.ico">
<style>
:root{
  --paper:#F3F4F7; --surface:#FFFFFF; --surface-2:#F8F9FB;
  --ink:#141824; --ink-2:#3D4557; --muted:#6B7387;
  --line:#DFE2EA; --line-soft:#EAECF2;
  --accent:#2E4A8F; --accent-soft:#E7EBF6;
  --ochre:#8A5E12; --ochre-soft:#F5EDDC;
  --ok:#1D6B5E; --ok-soft:#E1F0EC;
  --warn:#8E4426; --warn-soft:#F8E9E2;
  --serif:ui-serif,"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --paper:#0E1017; --surface:#161923; --surface-2:#1B1F2B;
    --ink:#E7E9F0; --ink-2:#B9BFCE; --muted:#8B93A6;
    --line:#272C39; --line-soft:#20242F;
    --accent:#93A9E4; --accent-soft:#1E2740;
    --ochre:#D5A957; --ochre-soft:#2E2716;
    --ok:#63C3B0; --ok-soft:#152A28;
    --warn:#E0906E; --warn-soft:#2E1D16;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{display:grid;grid-template-columns:264px minmax(0,1fr);gap:40px;max-width:1240px;margin:0 auto;padding:0 28px}
.masthead{border-bottom:1px solid var(--line);background:var(--surface)}
.masthead .inner{max-width:1240px;margin:0 auto;padding:34px 28px 26px}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.masthead h1{font-family:var(--serif);font-weight:600;font-size:clamp(28px,4vw,40px);line-height:1.12;margin:0;text-wrap:balance;letter-spacing:-.01em}
.sub{color:var(--ink-2);margin:10px 0 0;max-width:66ch}
.stamp{font-family:var(--mono);font-size:12px;color:var(--muted);margin:14px 0 0}
.stamp a{color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:22px 0 0}
.stat{background:var(--surface);padding:14px 16px}
.stat .v{font-family:var(--serif);font-size:26px;line-height:1;font-variant-numeric:tabular-nums}
.stat .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:7px}
.rail{position:sticky;top:0;align-self:start;max-height:100vh;overflow-y:auto;padding:28px 0 40px}
.rail h2{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;font-weight:500}
.search{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);font:inherit;font-size:14px;margin-bottom:16px}
.search:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
.rail ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.rail a{display:grid;grid-template-columns:22px 1fr auto;gap:9px;align-items:baseline;padding:6px 8px;border-radius:6px;text-decoration:none;color:var(--ink-2);font-size:13.5px;line-height:1.35}
.rail a:hover{background:var(--accent-soft);color:var(--accent)}
.rail .n,.rail .c{font-family:var(--mono);font-size:11px;color:var(--muted)}
.tools{display:flex;gap:8px;margin:18px 0 0}
.tools button{flex:1;font:inherit;font-size:12.5px;padding:7px 8px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);border-radius:6px;cursor:pointer}
.tools button:hover{border-color:var(--accent);color:var(--accent)}
main{padding:28px 0 96px;min-width:0}
.audit{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:0 0 40px}
.audit h2{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 14px;font-weight:500}
.audit ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.audit li{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:baseline;font-size:14px;border-top:1px solid var(--line-soft);padding-top:9px}
.audit li:first-child{border-top:0;padding-top:0}
.badge{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:4px;text-align:center}
.badge.ok{background:var(--ok-soft);color:var(--ok)}
.badge.warn{background:var(--warn-soft);color:var(--warn)}
.audit .lbl{color:var(--ink)}
.audit .val{color:var(--muted)}
.module{margin:0 0 56px;scroll-margin-top:16px}
.m-head{border-top:2px solid var(--ink);padding-top:16px;margin-bottom:18px}
.m-eyebrow{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:11px}
.m-num{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:600}
.chip{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;padding:3px 8px;border-radius:99px;background:var(--surface-2);color:var(--muted);border:1px solid var(--line-soft);white-space:nowrap}
.chip.cefr{background:var(--ochre-soft);color:var(--ochre);border-color:transparent;font-weight:600}
.chip.live{background:var(--ok-soft);color:var(--ok);border-color:transparent}
.chip.draft{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.chip.type{background:var(--accent-soft);color:var(--accent);border-color:transparent}
.m-head h2{font-family:var(--serif);font-size:clamp(22px,2.6vw,29px);font-weight:600;margin:0;line-height:1.2;text-wrap:balance;letter-spacing:-.01em}
.m-es{margin:6px 0 0;color:var(--ink-2);font-size:14.5px}
.m-es .fil{color:var(--muted)}
.m-desc{margin:11px 0 0;color:var(--ink-2);max-width:70ch;font-size:14.5px}
.lesson{background:var(--surface);border:1px solid var(--line);border-radius:9px;margin-bottom:8px;overflow:hidden}
.lesson[open]{border-color:var(--accent)}
.lesson summary{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 16px;cursor:pointer;list-style:none}
.lesson summary::-webkit-details-marker{display:none}
.lesson summary:hover{background:var(--surface-2)}
.lesson summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.l-n{font-family:var(--mono);font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.l-titles{min-width:0}
.l-en{display:block;font-weight:600;font-size:15px;line-height:1.3}
.l-es{display:block;font-family:var(--serif);font-style:italic;font-size:13.5px;color:var(--muted)}
.l-meta{display:flex;gap:6px;align-items:center}
.l-body{padding:4px 20px 22px;border-top:1px solid var(--line-soft)}
.l-fil{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin:14px 0 16px}
.prose{max-width:66ch}
.prose h3{font-family:var(--serif);font-size:19px;margin:0 0 8px;font-weight:600}
.prose h4{font-size:13px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:22px 0 8px;font-weight:600}
.prose h5{font-size:14px;margin:18px 0 6px}
.prose p{margin:0 0 12px;color:var(--ink-2)}
.prose ul{margin:0 0 14px;padding-left:20px;display:grid;gap:4px}
.prose li{color:var(--ink-2)}
.prose li strong{color:var(--ink)}
.prose code{font-family:var(--mono);font-size:.9em;background:var(--surface-2);padding:1px 4px;border-radius:3px}
.prose .empty{color:var(--warn);font-style:italic}
/* practice layer */
.practice{margin-top:26px;border-top:2px solid var(--accent);padding-top:16px;display:grid;gap:14px}
.practice-h{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0;font-weight:600}
.pk{background:var(--surface-2);border-radius:8px;padding:14px 16px;max-width:72ch}
.pk.occ{background:var(--ochre-soft)}
.pk-h{font-size:13.5px;margin:0 0 8px;font-weight:600;color:var(--ink)}
.pk .sit{margin:0 0 8px;font-size:14px;color:var(--ink-2)}
.pk .opens,.pk .must,.pk .pos{margin:0 0 6px;font-size:14px;color:var(--ink-2);display:flex;gap:9px;flex-wrap:wrap;align-items:baseline}
.who{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding-top:2px}
.pk code{font-family:var(--mono);font-size:12px;background:var(--surface);border:1px solid var(--line-soft);padding:1px 6px;border-radius:4px;color:var(--ink)}
.pk .compliance{margin:8px 0 0;font-size:13px;color:var(--warn);border-left:2px solid var(--warn);padding-left:10px}
.cando{margin:0;padding-left:18px;display:grid;gap:3px}
.cando li{font-size:14px;color:var(--ink-2)}
.ex-line{margin:0 0 4px;font-family:var(--serif);font-style:italic;font-size:14.5px;color:var(--ink)}
.drill{border-top:1px solid var(--line-soft);padding-top:9px;margin-top:9px;display:grid;gap:3px}
.drill:first-of-type{border-top:0;padding-top:0;margin-top:0}
.say{font-family:var(--serif);font-size:17px;color:var(--ink)}
.means{font-size:13px;color:var(--muted)}
.tgt{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);justify-self:start;background:var(--accent-soft);padding:2px 7px;border-radius:99px}
.why{margin:2px 0 0;font-size:13px;color:var(--ink-2);line-height:1.5}
.phon{border-top:1px solid var(--line-soft);padding-top:9px;margin-top:9px}
.phon:first-of-type{border-top:0;padding-top:0;margin-top:0}
.ph-sound{font-family:var(--mono);font-size:13px;color:var(--ink);font-weight:600;margin-right:9px}
.ph-kind{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:99px}
.phon.contrast .ph-kind{background:var(--warn-soft);color:var(--warn)}
.phon.advantage .ph-kind{background:var(--ok-soft);color:var(--ok)}
.ph-ex{margin:5px 0 0}
.dlg{display:grid;gap:8px}
.dlg-line{display:grid;grid-template-columns:78px 1fr;gap:4px 10px;align-items:baseline}
.spk{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);grid-row:span 2}
.dlg-es{font-family:var(--serif);font-size:15.5px;color:var(--ink)}
.dlg-en{font-size:12.5px;color:var(--muted)}
.err{font-family:var(--serif);font-size:15px;color:var(--warn);text-decoration:line-through}
.fix{font-family:var(--serif);font-size:15px;color:var(--ok)}
.words{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.word{background:var(--surface);border:1px solid var(--line-soft);border-radius:6px;padding:8px 10px;display:grid;gap:2px}
.w-es{font-family:var(--serif);font-size:15px;color:var(--ink)}
.w-en{font-size:12.5px;color:var(--muted)}
.w-tl{font-size:11.5px;color:var(--ok);margin-top:2px}
.ex-block{margin-top:26px;border-top:1px solid var(--line-soft);padding-top:18px}
.ex-head{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 14px;font-weight:500}
.ex{background:var(--surface-2);border-radius:7px;padding:13px 15px;margin-bottom:9px;max-width:66ch}
.ex-h{display:flex;gap:9px;align-items:baseline;margin-bottom:7px}
.ex-n{font-family:var(--mono);font-size:11px;color:var(--muted)}
.ex-t{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ex .q{margin:0 0 9px;font-size:14.5px;color:var(--ink)}
.opts{margin:0;padding-left:20px;display:grid;gap:3px}
.opts li{font-size:14px;color:var(--ink-2)}
.opts li.right{color:var(--ok);font-weight:600}
.key{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;margin-left:8px;background:var(--ok-soft);color:var(--ok);padding:2px 6px;border-radius:99px;font-weight:500}
.ans{margin:0;font-size:14px;color:var(--ok)}
.ans.hidden-ans{color:var(--muted);font-family:var(--mono);font-size:11.5px}
.foot{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;font-family:var(--mono);font-size:11.5px;color:var(--muted);line-height:1.8}
@media (max-width:900px){
  .wrap{grid-template-columns:1fr;gap:0;padding:0 18px}
  .rail{position:static;max-height:none;padding:22px 0 0;border-bottom:1px solid var(--line)}
  .masthead .inner{padding:26px 18px 22px}
  .lesson summary{grid-template-columns:38px minmax(0,1fr);row-gap:8px}
  .l-meta{grid-column:2}
}
@media print{
  .rail,.tools{display:none}
  .wrap{display:block;max-width:none}
  .lesson{break-inside:avoid;border-color:#ccc}
  body{background:#fff}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<header class="masthead">
  <div class="inner">
    <p class="kicker">Torna Idioma &middot; Spanish as a Foreign Language &middot; Curriculum</p>
    <h1>${courses.length} modules, ${lessons.length} lessons, CEFR A1 through B1+</h1>
    <p class="sub">Every module and lesson exactly as it is stored in the platform right now &mdash; lesson text, trilingual titles, and every assessment item. This page reads the live database, so it can never fall out of step with what a learner is served.</p>
    <p class="stamp">Rendered ${stamp} UTC &middot; ${published} of ${courses.length} modules published${showAnswers ? ' &middot; answer keys visible' : ''} &middot; <a href="/Torna_Idioma/">back to Torna Idioma</a></p>
    <div class="stats">
      <div class="stat"><div class="v">${courses.length}</div><div class="k">Modules</div></div>
      <div class="stat"><div class="v">${lessons.length}</div><div class="k">Lessons</div></div>
      <div class="stat"><div class="v">${hours}</div><div class="k">Contact hours</div></div>
      <div class="stat"><div class="v">${practice.drills}</div><div class="k">Speaking drills</div></div>
      <div class="stat"><div class="v">${practice.vocabulary.toLocaleString('en-US')}</div><div class="k">Target words</div></div>
      <div class="stat"><div class="v">${allEx}</div><div class="k">Assessment items</div></div>
      <div class="stat"><div class="v">A1&ndash;B1+</div><div class="k">CEFR span</div></div>
    </div>
  </div>
</header>

<div class="wrap">
  <nav class="rail" aria-label="Modules">
    <h2>Jump to module</h2>
    <input class="search" id="q" type="search" placeholder="Filter lessons&hellip;" aria-label="Filter lessons by keyword">
    <ul>${nav}</ul>
    <div class="tools">
      <button type="button" id="openAll">Expand all</button>
      <button type="button" id="closeAll">Collapse all</button>
    </div>
  </nav>

  <main>
    <section class="audit" aria-label="Content coverage">
      <h2>Content coverage</h2>
      <ul>
        ${audit}
      </ul>
    </section>

    ${modules}

    <p class="foot">Read live from ti_courses and ti_lessons. Editing a lesson in the platform changes this page immediately.${showAnswers ? '' : '<br>Answer keys are withheld on the public view.'}</p>
  </main>
</div>

<script>
(function(){
  var q = document.getElementById('q');
  var lessons = [].slice.call(document.querySelectorAll('.lesson'));
  var modules = [].slice.call(document.querySelectorAll('.module'));

  q.addEventListener('input', function(){
    var term = q.value.trim().toLowerCase();
    lessons.forEach(function(l){
      var hit = !term || l.dataset.search.indexOf(term) !== -1;
      l.hidden = !hit;
      l.open = !!(hit && term);
    });
    modules.forEach(function(m){
      m.hidden = !!term && !m.querySelector('.lesson:not([hidden])');
    });
  });

  document.getElementById('openAll').addEventListener('click', function(){
    lessons.forEach(function(l){ l.open = true; });
  });
  document.getElementById('closeAll').addEventListener('click', function(){
    lessons.forEach(function(l){ l.open = false; });
  });
})();
</script>
</body>
</html>`;
}

// Small cache so a burst of traffic doesn't hit the database for every render.
let cache = null;
const TTL_MS = 5 * 60 * 1000;

async function curriculumPage({ showAnswers }) {
  if (showAnswers) {
    // Never cache the answer-key variant alongside the public one.
    return render(await loadCurriculum(), { showAnswers: true });
  }
  if (cache && Date.now() - cache.at < TTL_MS) return cache.html;
  const html = render(await loadCurriculum(), { showAnswers: false });
  cache = { at: Date.now(), html };
  return html;
}

function answersAllowed(req) {
  const secret = process.env.TI_MODULES_KEY;
  if (!secret) return false; // unset means the answer key is simply unavailable
  return String(req.query.key || '') === secret;
}

module.exports = { curriculumPage, answersAllowed, loadCurriculum };
