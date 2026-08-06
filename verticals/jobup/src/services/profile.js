'use strict';

// =============================================================
// The résumé record — the single source every public surface reads.
//
// resume_json feeds the site, resume.json, the JSON-LD, the agent card,
// llms.txt, the matcher's cached prefix and every tailored resume. So an edit
// here changes what recruiters and their AI see, and what the Hunter scores
// against. It gets bounded and shaped on the way in rather than trusted.
//
// WHAT THIS DOES NOT DO: invent anything. Empty stays empty. There is no
// "improve my summary" here — the no-invented-facts guard exists precisely
// because a resume must say only what its owner wrote.
// =============================================================

const LIMITS = {
  name: 120,
  headline: 200,
  summary: 4000,
  location: 120,
  email: 200,
  phone: 40,
  website: 300,
  linkedin: 300,
  skill: 80,
  skills: 200,
  role_title: 160,
  company: 160,
  date: 40,
  highlight: 600,
  highlights: 12,
  experience: 40,
  institution: 200,
  study: 160,
  education: 20,
  certification: 200,
  certifications: 60,
};

function str(v, max) {
  if (v === undefined || v === null) return '';
  // Strip control characters (tab, newline and carriage return survive).
  // They serve no purpose in a resume and break the JSON surfaces, the
  // vCard and the QR payload downstream.
  return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim().slice(0, max);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

/** Skills arrive as strings or {name}. Store strings — that is what everything reads. */
function cleanSkills(v) {
  const out = [];
  const seen = new Set();
  for (const s of arr(v)) {
    const name = str(typeof s === 'string' ? s : (s && (s.name || s.title)), LIMITS.skill);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;      // a duplicated skill helps nobody
    seen.add(key);
    out.push(name);
    if (out.length >= LIMITS.skills) break;
  }
  return out;
}

function cleanExperience(v) {
  const out = [];
  for (const e of arr(v)) {
    if (!e || typeof e !== 'object') continue;
    const title = str(e.title || e.position, LIMITS.role_title);
    const company = str(e.company || e.employer || e.name, LIMITS.company);
    if (!title && !company) continue;   // a row with neither is noise
    out.push({
      title,
      company,
      location: str(e.location, LIMITS.location),
      start: str(e.start || e.startDate, LIMITS.date),
      end: str(e.end || e.endDate, LIMITS.date),
      highlights: arr(e.highlights)
        .map((h) => str(h, LIMITS.highlight))
        .filter(Boolean)
        .slice(0, LIMITS.highlights),
    });
    if (out.length >= LIMITS.experience) break;
  }
  return out;
}

function cleanEducation(v) {
  const out = [];
  for (const e of arr(v)) {
    if (!e || typeof e !== 'object') continue;
    const institution = str(e.institution || e.school || e.name, LIMITS.institution);
    const studyType = str(e.studyType || e.degree || e.study, LIMITS.study);
    if (!institution && !studyType) continue;
    out.push({
      institution,
      studyType,
      area: str(e.area, LIMITS.study),
      start: str(e.start || e.startDate, LIMITS.date),
      end: str(e.end || e.endDate, LIMITS.date),
      note: str(e.note, LIMITS.highlight),
    });
    if (out.length >= LIMITS.education) break;
  }
  return out;
}

function cleanCertifications(v) {
  const out = [];
  const seen = new Set();
  for (const c of arr(v)) {
    const name = str(typeof c === 'string' ? c : (c && (c.name || c.title)), LIMITS.certification);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= LIMITS.certifications) break;
  }
  return out;
}

/**
 * Merge an edit over the stored record.
 *
 * Only keys PRESENT in the patch are touched, so a UI that sends one section
 * cannot blank the rest. Sending an explicit empty array does clear a section —
 * that is a deliberate act and must be possible.
 */
function applyEdit(current, patch) {
  const c = (current && typeof current === 'object') ? current : {};
  const p = (patch && typeof patch === 'object') ? patch : {};
  const out = { ...c };

  const scalars = [
    ['name', LIMITS.name], ['headline', LIMITS.headline], ['summary', LIMITS.summary],
    ['location', LIMITS.location], ['email', LIMITS.email], ['phone', LIMITS.phone],
    ['website', LIMITS.website], ['linkedin', LIMITS.linkedin],
  ];
  for (const [k, max] of scalars) {
    if (k in p) out[k] = str(p[k], max) || null;
  }
  if ('skills' in p) out.skills = cleanSkills(p.skills);
  if ('experience' in p) out.experience = cleanExperience(p.experience);
  if ('education' in p) out.education = cleanEducation(p.education);
  if ('certifications' in p) out.certifications = cleanCertifications(p.certifications);

  // An edited record is the owner's own words — it is no longer a machine
  // extraction, so the simulated marker and the extraction note come off.
  delete out.is_simulated;
  delete out.note;
  out.edited_at = new Date().toISOString();
  return out;
}

/** What the editor needs to render, in one predictable shape. */
function forEditor(resume) {
  const r = (resume && typeof resume === 'object') ? resume : {};
  return {
    name: r.name || '',
    headline: r.headline || '',
    summary: r.summary || '',
    location: r.location || '',
    email: r.email || '',
    phone: r.phone || '',
    website: r.website || '',
    linkedin: r.linkedin || '',
    skills: cleanSkills(r.skills),
    experience: cleanExperience(r.experience),
    education: cleanEducation(r.education),
    certifications: cleanCertifications(r.certifications),
  };
}

module.exports = { applyEdit, forEditor, cleanSkills, cleanExperience, cleanEducation, cleanCertifications, LIMITS };
