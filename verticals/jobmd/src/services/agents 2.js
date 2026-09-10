'use strict';

/**
 * THE AGENT RUNTIME — the automations that sit on top of the platform.
 *
 * Five of the eleven agents do real work here: Recruitment Outreach,
 * Scheduling, Follow-Up, Candidate Matching (as a background rescan) and the
 * Recruiter Copilot (conversational search). They are ordinary functions over
 * real rows, not a chat loop.
 *
 * TWO RULES GOVERN ALL OF THEM.
 *
 * 1. NOTHING SENDS. This repository's standing policy is that no server-
 *    initiated email goes out (EMAIL_AUTOSEND_DISABLED, default on, because
 *    SendGrid mail was landing in client spam folders). So the Outreach Agent
 *    DRAFTS and a human approves and sends. There is no transport in this file
 *    at all, and SIT greps for that — a draft queue that could quietly send is
 *    not a draft queue.
 *
 * 2. NOTHING IS INVENTED. Every value in a draft is copied from a row that
 *    exists. The Copilot returns only rows the database actually holds, and
 *    reports the filters it applied so a recruiter can see why a candidate is
 *    in the list. No agent may change a pipeline stage from here; that goes
 *    through pipeline.js, which enforces the corpus allow-list.
 */

const C = require('./corpus');
const cvSvc = require('./cv');

// ── Recruitment Outreach Agent ─────────────────────────────────────────────
/**
 * Draft an approach to one candidate about one position.
 * Every fact in the draft comes from the rows passed in. If a value is absent
 * the sentence is omitted rather than softened into a guess.
 */
function outreachDraft(ctx) {
  const c = ctx.candidateName, pos = ctx.position, org = ctx.organization, p = ctx.physician;
  const lines = [];
  const facts = [];

  lines.push('Hello ' + c + ',');
  lines.push('');

  let opener = 'I am recruiting for ' + pos.title;
  if (org && org.name) opener += ' at ' + org.name;
  if (pos.city && pos.state) opener += ' in ' + pos.city + ', ' + pos.state;
  lines.push(opener + '.');

  // Why them — only reasons the engine actually produced.
  if (ctx.reasons && ctx.reasons.length) {
    lines.push('');
    lines.push('I am contacting you because:');
    ctx.reasons.slice(0, 3).forEach(function (r) {
      lines.push('  - ' + r.replace(/^[^:]+:\s*/, ''));
      facts.push(r);
    });
  }

  const money = [];
  if (pos.compensation_min) money.push('$' + Number(pos.compensation_min).toLocaleString());
  if (pos.compensation_max) money.push('$' + Number(pos.compensation_max).toLocaleString());
  if (money.length) { lines.push(''); lines.push('The posted range is ' + money.join(' to ') + '.'); }
  if (pos.call_schedule) lines.push('Call is ' + pos.call_schedule + '.');
  if (pos.start_date) lines.push('They are looking to start around ' + pos.start_date + '.');

  // Gaps are stated to the recruiter, never hidden — but they are NOT put in
  // the message to the candidate. A gap is our problem to raise in a call.
  lines.push('');
  lines.push('If the timing is wrong I would still value a short conversation.');
  lines.push('');
  lines.push('Best regards');

  return {
    agent: 'Recruitment Outreach Agent',
    kind: 'outreach',
    subject: pos.title + (org && org.name ? ' at ' + org.name : ''),
    body: lines.join('\n'),
    grounded_in: facts,
    // Surfaced to the recruiter alongside the draft so they go in informed.
    gaps_for_recruiter: (ctx.gaps || []).slice(0, 4),
    status: 'draft',
    note: 'Draft only. Nothing is sent by the platform; approve it and send it yourself.'
  };
}

// ── Scheduling Agent ───────────────────────────────────────────────────────
/**
 * Propose interview slots. It proposes; it books nothing, because it has no
 * access to anybody's calendar and inventing availability would be worse than
 * proposing nothing.
 */
function schedulingPropose(ctx) {
  const base = ctx.from ? new Date(ctx.from) : new Date();
  const slots = [];
  let d = new Date(base.getTime());
  // Next three weekday mornings, at least two days out.
  d.setDate(d.getDate() + 2);
  while (slots.length < 3) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      slots.push({ date: d.toISOString().slice(0, 10), window: slots.length % 2 ? '14:00-15:00' : '09:00-10:00' });
    }
    d.setDate(d.getDate() + 1);
  }
  return {
    agent: 'Scheduling Agent',
    kind: 'scheduling',
    subject: 'Proposed interview times',
    body: 'Proposed times for ' + ctx.candidateName + ' and ' + (ctx.position ? ctx.position.title : 'the position') +
          ':\n' + slots.map(function (s) { return '  - ' + s.date + ' ' + s.window; }).join('\n') +
          '\n\nThese are suggestions only. No calendar has been read and nothing is booked.',
    payload: { slots: slots },
    status: 'draft',
    note: 'Proposed only. The platform holds no calendar access and has booked nothing.'
  };
}

// ── Follow-Up Agent ────────────────────────────────────────────────────────
const STALL_DAYS = {
  Prospect: 14, Contacted: 7, Interested: 5, Qualified: 7, Matched: 5,
  Submitted: 7, 'Hospital Review': 10, Interview: 7, Offer: 5,
  Negotiation: 7, Accepted: 14, Credentialing: 21, Placement: 0
};

/**
 * Find pipeline rows that have sat too long. IT FLAGS; IT NEVER MOVES ANYONE.
 * Advancing a stalled candidate would be exactly the silent automation the
 * pipeline authority rules exist to prevent.
 */
function followupScan(rows, now) {
  const today = now ? new Date(now) : new Date();
  const out = [];
  rows.forEach(function (r) {
    const limit = STALL_DAYS[r.stage];
    if (!limit) return;                       // Placement is the end of the road
    const days = Math.floor((today - new Date(r.updated_at)) / 86400000);
    if (days >= limit) {
      out.push({
        pipeline_id: r.id, stage: r.stage, days_in_stage: days, threshold_days: limit,
        candidate: r.candidateName, position: r.positionTitle,
        suggestion: 'Sat in ' + r.stage + ' for ' + days + ' days (threshold ' + limit +
                    '). Follow up or move it on.'
      });
    }
  });
  return out.sort(function (a, b) { return b.days_in_stage - a.days_in_stage; });
}

// ── Recruiter Copilot / Conversational Search ──────────────────────────────
const STATE_WORDS = {};
cvSvc.STATES.forEach(function (s) { STATE_WORDS[s.toLowerCase()] = s; });
// Plural and adjectival forms a recruiter actually types. Values are always a
// corpus specialty — this table can never introduce a new one.
const SPECIALTY_ALIASES = {
  'urolog': 'Urology', 'neurosurg': 'Neurosurgery', 'neuro surg': 'Neurosurgery',
  'cardiac': 'Cardiac Surgery', 'cardiothoracic': 'Cardiac Surgery',
  'thoracic': 'Thoracic Surgery', 'orthopaedic': 'Orthopaedic Surgery',
  'orthopedic': 'Orthopaedic Surgery', 'ortho ': 'Orthopaedic Surgery',
  'gynecolog': 'Gynecology', 'gynaecolog': 'Gynecology', 'obgyn': 'Gynecology',
  'colorectal': 'Colon & Rectal Surgery', 'colon and rectal': 'Colon & Rectal Surgery',
  'trauma': 'Trauma Surgery', 'plastic': 'Plastic Surgery', 'vascular': 'Vascular Surgery',
  'pediatric': 'Pediatric Surgery', 'paediatric': 'Pediatric Surgery',
  'transplant': 'Transplant Surgery', 'hepatobiliary': 'Hepatobiliary Surgery',
  'hpb': 'Hepatobiliary Surgery', 'general surgeon': 'General Surgery'
};

const STATE_NAMES = { florida: 'FL', georgia: 'GA', texas: 'TX', california: 'CA',
  'north carolina': 'NC', 'south carolina': 'SC', 'new york': 'NY', ohio: 'OH',
  illinois: 'IL', arizona: 'AZ', tennessee: 'TN', virginia: 'VA', michigan: 'MI',
  pennsylvania: 'PA', washington: 'WA', colorado: 'CO', massachusetts: 'MA' };

/**
 * Turn a plain-English question into a structured filter.
 *
 * It only ever recognises vocabulary the platform actually has — a specialty
 * from the corpus, a real state, a robotic platform it knows. Anything it did
 * not understand is returned in `ignored`, so a recruiter can see that
 * "in the southeast" was not applied rather than assuming it was.
 */
function parseQuery(q) {
  const raw = String(q || '');
  const low = ' ' + raw.toLowerCase().replace(/[.,;]/g, ' ') + ' ';
  const f = {};
  const applied = [];
  const consumed = [];

  // A recruiter types "urologists", not "Urology". Every alias maps to a
  // corpus specialty and nowhere else, so the vocabulary can widen without the
  // filter ever naming a specialty the platform does not have.
  let spec = C.MEDICAL_SPECIALTIES
    .map(function (s) { return { name: s, at: low.indexOf(s.toLowerCase()) }; })
    .filter(function (x) { return x.at !== -1; })
    .sort(function (a, b) { return b.name.length - a.name.length; })[0];
  if (!spec) {
    const hit = Object.keys(SPECIALTY_ALIASES).filter(function (k) {
      return new RegExp('\\b' + k, 'i').test(low);
    }).sort(function (a, b) { return b.length - a.length; })[0];
    if (hit) spec = { name: SPECIALTY_ALIASES[hit], at: low.search(new RegExp('\\b' + hit, 'i')), alias: hit };
  }
  if (spec) {
    f.specialty = spec.name;
    applied.push('specialty is ' + spec.name);
    consumed.push(spec.name.toLowerCase());
    if (spec.alias) consumed.push(spec.alias);
  }

  Object.keys(STATE_NAMES).forEach(function (n) {
    if (low.indexOf(' ' + n + ' ') !== -1) { f.state = STATE_NAMES[n]; applied.push('state is ' + f.state); consumed.push(n); }
  });
  if (!f.state) {
    const m = raw.match(/\b([A-Z]{2})\b/);
    if (m && STATE_WORDS[m[1].toLowerCase()]) { f.state = m[1]; applied.push('state is ' + m[1]); }
  }

  if (/\brobotic|\brobot\b|da vinci/.test(low)) { f.robotic = true; applied.push('has robotic experience'); }
  if (/board.?certified/.test(low)) { f.board_certified = true; applied.push('board certified'); }
  if (/relocat/.test(low)) { f.relocation_willing = true; applied.push('open to relocation'); consumed.push('relocat'); }

  const yrs = low.match(/(?:more than|over|at least|minimum(?: of)?|\+)\s*(\d{1,2})\s*(?:\+\s*)?years?/) ||
              low.match(/(\d{1,2})\s*\+\s*years?/);
  if (yrs) { f.min_years = parseInt(yrs[1], 10); applied.push('at least ' + f.min_years + ' years'); }

  const under = low.match(/(?:under|below|less than|up to)\s*\$?\s*(\d{3,4})\s*k/) ||
                low.match(/(?:under|below|less than|up to)\s*\$?\s*(\d{6,7})\b/);
  if (under) {
    const n = parseInt(under[1], 10);
    f.max_expectation = n < 2000 ? n * 1000 : n;
    applied.push('expects under $' + f.max_expectation.toLocaleString());
  }

  cvSvc.ROBOT_PLATFORMS.forEach(function (p) {
    if (low.indexOf(p.toLowerCase()) !== -1 && !f.platform) {
      f.platform = p; applied.push('trained on ' + p);
    }
  });

  // Words we did not act on, so nobody assumes we did.
  const stop = ' find show me all any who with and or the a an of in for is are that have has been ' +
    'surgeons surgeon physicians physician doctors doctor candidates candidate please list ' +
    'years year experience more than over least minimum under below less up to board certified ' +
    'trained available anyone someone need looking ';
  const ignored = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(function (w) {
      if (!w || w.length < 3) return false;
      if (stop.indexOf(' ' + w + ' ') !== -1) return false;
      if (/^\d+k?$/.test(w)) return false;
      return !consumed.some(function (c) { return c.indexOf(w) !== -1 || w.indexOf(c) !== -1; }) &&
             !applied.join(' ').toLowerCase().includes(w);
    });

  return { filters: f, applied: applied, ignored: Array.from(new Set(ignored)) };
}

/** Apply a parsed filter to real physician rows. Nothing is generated. */
/**
 * Does a searched-for platform match one on a record?
 *
 * NOT string equality, which is what this was and which made the commonest
 * search in the division return nothing. The vocabulary deliberately holds both
 * families ("da Vinci", "Hugo") and specific systems ("da Vinci Xi", "Hugo
 * RAS"), and cv.js stores the MOST SPECIFIC one it can find — so every real
 * record says "da Vinci Xi" while every recruiter types "da Vinci". Equality
 * meant the Copilot reported "trained on da Vinci" as an applied filter and
 * then returned zero, which reads as "we have no such surgeon" rather than
 * "the filter did not work". That is precisely the false belief the Copilot's
 * `ignored[]` exists to prevent, arriving through the front door.
 *
 * A family therefore matches its own systems, by WHOLE TOKENS: "da Vinci"
 * matches "da Vinci Xi", and "da Vinci X" does NOT match "da Vinci Xi" —
 * the X and the Xi are different systems and a recruiter who names one is not
 * asking for the other.
 */
function platformTokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function platformMatches(wanted, held) {
  const w = platformTokens(wanted), h = platformTokens(held);
  if (!w.length || !h.length) return false;
  const short = w.length <= h.length ? w : h;
  const long = w.length <= h.length ? h : w;
  return short.every(function (t, i) { return long[i] === t; });
}

function applyQuery(parsed, physicians) {
  const f = parsed.filters;
  return physicians.filter(function (p) {
    if (f.specialty && p.specialty !== f.specialty) return false;
    if (f.board_certified && p.board_certified !== true) return false;
    if (f.min_years && (p.years_experience || 0) < f.min_years) return false;
    if (f.robotic && !(Array.isArray(p.robotic_platforms) && p.robotic_platforms.length)) return false;
    if (f.platform && !(Array.isArray(p.robotic_platforms) &&
        p.robotic_platforms.some(function (x) { return platformMatches(f.platform, x); }))) return false;
    if (f.max_expectation && p.compensation_expectation && p.compensation_expectation > f.max_expectation) return false;
    if (f.relocation_willing && p.relocation_willing !== true) return false;
    if (f.state) {
      const prefs = (p.geographic_preferences || []).map(function (s) { return String(s).toUpperCase(); });
      const lic = (p.licenses || []).map(function (s) { return String(s).toUpperCase(); });
      if (prefs.indexOf(f.state) === -1 && lic.indexOf(f.state) === -1 && !p.relocation_willing) return false;
    }
    return true;
  });
}

module.exports = { platformMatches, outreachDraft, schedulingPropose, followupScan, parseQuery, applyQuery, STALL_DAYS };
