'use strict';

// =============================================================
// THE HELP AGENT — it answers about THIS account, not about a product manual.
//
// "How do I increase my visibility?" has a different correct answer for a
// subscriber with no identity links than for one with five, and a generic
// answer to that question is worse than none: it sends somebody to do work they
// have already done and leaves the actual gap untouched. So every reply is
// grounded in a snapshot of what this tenant's record actually says right now.
//
// THREE PROPERTIES ENFORCED IN CODE, NOT IN THE PROMPT:
//
//  1. IT CANNOT INVENT A CONTROL. The model may return `actions`, but each one
//     is checked against the real tab list and dropped if it names anything
//     else. A confident "open the Billing tab" pointing at a tab that does not
//     exist is the fastest way to make an assistant untrustworthy.
//
//  2. IT CANNOT ACT. There is no tool surface here — it advises and links.
//     Everything in this product is approval-gated by design, and an assistant
//     that could flip settings would be the one exception.
//
//  3. IT CANNOT INVENT THE SUBSCRIBER'S STATE. The snapshot below is assembled
//     from real rows; the model is told to answer only from it, and with no
//     API key the deterministic path answers from the same snapshot rather than
//     apologising. A wrong count is worse than a missing one.
// =============================================================

const brain = require('./brain');
const settingsSvc = require('./settings');

/** The tabs that exist. An action naming anything else is dropped. */
const TABS = {
  analytics: 'Analytics',
  matches: 'Job Matches',
  opps: 'Opportunities',
  pipeline: 'Pipeline',
  targets: 'Getting job matches',
  guide: 'Getting found',
  cv: 'My CV',
  settings: 'Settings',
  account: 'Account',
};

/**
 * What this product can actually do, in the words of the surfaces that do it.
 * Deliberately hand-written rather than scraped: the assistant should describe
 * the product as it IS, including what it refuses to do, and a scrape would
 * happily quote a button label as a capability.
 */
const CAPABILITIES = `
JobUp gives one person a job-finding ecosystem. What exists, and where:

- Analytics — profile views, unique visitors, what AI crawlers read, and the
  two agent buttons ("Search for jobs now", "Check my presence").
- Job Matches — real openings scored against the résumé, with the reasoning and
  what is missing. "Tailor my resume to this Job Posting" costs $10 and produces
  a PDF built ONLY from bullets already in the résumé.
- Opportunities — inbound messages from recruiters; a reply can be drafted in
  one click, and the subscriber sends it themselves.
- Pipeline — new / saved / applied / screening / interviewing / offer / closed.
  The agent only ever adds to "new"; every later move is the subscriber's.
- Getting job matches — which state, role titles, industries, employers to
  chase, words a job must contain, words that rule one out, employers never to
  contact, seniority nudge, minimum score. This decides WHICH JOBS ARRIVE.
- Getting found — the four steps that decide WHETHER RECRUITERS ARRIVE:
  1. check the job titles being targeted (each becomes an indexable page)
  2. put the address in five places (LinkedIn, a job board, GitHub, email
     signature, a printed QR)
  3. list in the public JobUp directory (the only thing that puts the address
     in the sitemap search engines read)
  4. state where else the person already exists — the sameAs links, which is
     the one thing AI sourcing tools (SeekOut, hireEZ, Pin) can actually use.
- My CV — the résumé itself. Each role has a Show/Hide select controlling
  whether it appears on the public CV, resume.json, the agent card and any
  tailored PDF. Hidden roles STILL count for job matching.
- Settings — approval (always on, cannot be disabled), quotas.
- Account — photo, résumé upload, web address, data export, subscription,
  delete account.

Hard truths this product states and must not contradict:
- JobUp NEVER applies to a job and never sends a message on anyone's behalf.
- It cannot post a profile to LinkedIn, Indeed or any job board — those are
  closed platforms.
- SeekOut, hireEZ and Pin accept no submissions and publish no API; the only
  way in is being linked from a source they already crawl.
- Search visibility takes weeks, not days, for a new address.
`.trim();

/** A compact, true picture of this account. Every number comes from a row. */
function snapshot({ profile, settings, presence, counts, subscriber }) {
  const st = settingsSvc.sanitize(settings || {});
  const p = profile || {};
  const roles = settingsSvc.pageRoles(st);
  const exp = Array.isArray(p.experience) ? p.experience : [];
  const lines = [
    `Name: ${p.name || subscriber && subscriber.name || 'not set'}`,
    `Public address: ${subscriber && subscriber.address ? 'https://' + subscriber.address : 'not assigned yet'}`,
    `Headline: ${p.headline || 'not set'}`,
    `Role titles targeted: ${roles.length ? roles.map((r) => r.title).join(', ') : 'NONE — the site is a single page with nothing for a search to match'}`,
    `Skills on file: ${(p.skills || []).length}`,
    `Roles on the résumé: ${exp.length} (${exp.filter((e) => e && e.hidden).length} hidden from the public CV)`,
    `Education entries: ${(p.education || []).length}`,
    `Listed in the public directory: ${st.presence.directory_opt_in ? 'yes' : 'NO — nothing on jobup.dev links to the site, so it is in no sitemap'}`,
    `Address placed in: ${st.presence.placed.length} of 5 places (${st.presence.placed.join(', ') || 'none yet'})`,
    `Identity links (sameAs): ${st.identity_links.length}${st.identity_links.length ? ' — ' + st.identity_links.map((l) => l.network).join(', ') : ' — NONE, so no sourcing tool can tie this page to a person it already holds'}`,
    `States searched: ${st.geo.allowed_states.length ? st.geo.allowed_states.join(', ').toUpperCase() : 'the whole US'}`,
    `Industries: ${st.targeting.industries.join(', ') || 'none set'}`,
    `Target employers: ${st.targeting.employers.join(', ') || 'none set'}`,
    `Minimum score to file: ${st.targeting.min_score}`,
  ];
  if (counts) {
    lines.push(`Job matches on the board: ${counts.matches}`);
    lines.push(`Inbound opportunities: ${counts.opportunities}`);
    lines.push(`Tailored résumés produced: ${counts.tailorings}`);
    lines.push(`Tailoring credits available: ${counts.credits}`);
  }
  if (presence && presence.items) {
    const undone = presence.items.filter((i) => !i.done).map((i) => i.title);
    if (undone.length) lines.push(`Placements NOT done yet: ${undone.join('; ')}`);
  }
  return lines.join('\n');
}

const SYSTEM = `You are the JobUp assistant, helping ONE subscriber inside their own dashboard.

Answer ONLY from the capability list and the account snapshot you are given.
If neither covers the question, say plainly that you do not know and name the
tab where the subscriber can look. NEVER invent a feature, a menu item, a
setting, a price or a number.

Be specific to THIS account. If the snapshot says something is missing, say so
and give the step that fixes it. If it is already done, say it is done rather
than telling them to do it again.

Keep the answer under 130 words, in plain prose. No markdown headings, no
bullet characters, no emoji.

Return STRICT JSON:
{"answer":"...","actions":[{"label":"Getting found","tab":"guide"}]}
"actions" is optional, at most 3, and every "tab" MUST be one of:
analytics, matches, opps, pipeline, targets, guide, cv, settings, account.
Use an action whenever the answer tells the subscriber to go somewhere.

Never claim JobUp applies to jobs, sends messages, or submits a profile to
LinkedIn, Indeed, SeekOut, hireEZ or Pin. It does none of those.`;

/** Only actions naming a tab that exists survive. */
function cleanActions(v, lang) {
  return (Array.isArray(v) ? v : [])
    .map((a) => {
      const tab = String((a && a.tab) || '').toLowerCase().trim();
      if (!TABS[tab]) return null;
      // The LABEL is ours, not the model's: it must match what the tab is
      // actually called, in the language being spoken.
      return { tab, label: TABS[tab] };
    })
    .filter(Boolean)
    .filter((a, i, arr) => arr.findIndex((x) => x.tab === a.tab) === i)
    .slice(0, 3);
}

/**
 * The keyless path. Not an apology and not a stub: the same snapshot, read by
 * rules, so the most useful thing to say is still said.
 */
function deterministic(question, snap, st) {
  const q = String(question || '').toLowerCase();
  const gaps = [];
  if (!settingsSvc.pageRoles(st).length) {
    gaps.push({ tab: 'guide', why: 'you have no role titles set, so your site is a single page with nothing for a recruiter’s search to match' });
  }
  if (!st.identity_links.length) {
    gaps.push({ tab: 'guide', why: 'you have not said where else you exist online, so no sourcing tool can tie your page to a person it already holds' });
  }
  if (st.presence.placed.length < 5) {
    gaps.push({ tab: 'guide', why: `your address is in ${st.presence.placed.length} of the five places worth putting it` });
  }
  if (!st.presence.directory_opt_in) {
    gaps.push({ tab: 'guide', why: 'you are not listed in the public directory, which is the only thing that puts your address in the sitemap search engines read' });
  }

  // INTENT IS MATCHED, AND A MISS SAYS SO.
  //
  // The first version of this fell through to the visibility answer whenever
  // nothing else matched, so "what does tailoring cost?" got a confident
  // paragraph about sitemaps. A fallback that answers the WRONG question with
  // total confidence is worse than one that admits the limit — it is the exact
  // failure this product spends its code preventing everywhere else.
  const hit = (re) => re.test(q);
  const A = (answer, tabs) => ({ answer, actions: cleanActions(tabs.map((t) => ({ tab: t }))) });

  if (hit(/appl(y|ies|ying)|on my behalf|send.*(message|email)|auto.?appl|postul|env[ií]a/)) {
    return A('JobUp never applies to a job and never sends a message for you. It finds openings, '
      + 'scores them and drafts, and you review and send everything yourself. That is not a setting '
      + 'you can turn off — approval is always on.', ['matches', 'settings']);
  }
  if (hit(/tailor|pdf|cost|price|\$|charge|pay|precio|cuesta|adaptar/)) {
    return A(`Tailoring one résumé to one posting costs $10 and produces a PDF built only from `
      + `bullets already in your résumé — nothing is invented. You have `
      + `${(snapCredits(snap))} credit(s) available. The button is on each card under Job Matches.`,
    ['matches']);
  }
  if (hit(/hide|hidden|show.*role|public cv|ocultar|mostrar/)) {
    return A('Each role in My CV has a Show/Hide select. Hiding one removes it from your public '
      + 'page, your resume.json, your agent card and any tailored PDF you send — but it still '
      + 'counts when your agent scores jobs, because that is private to you.', ['cv']);
  }
  if (hit(/pipeline|stage|applied|interview|proceso|etapa/)) {
    return A('The Pipeline board tracks new, saved, applied, screening, interviewing, offer and '
      + 'closed. Your agent only ever adds to "new" — every move after that is yours, from the '
      + 'dropdown on each card.', ['pipeline']);
  }
  if (hit(/r[eé]sum[eé]|\bcv\b|curr[ií]culum|skills|experience|upload/)) {
    return A('My CV is the record everything else is built from: your public page, your '
      + 'resume.json, your agent card and every job score. Upload a new file or edit the fields '
      + 'directly — nothing there is generated.', ['cv', 'account']);
  }
  if (hit(/visib|found|recruit|seo|google|discover|sameas|link|encontrar|visibil|reclutador/)) {
    return A(gaps.length
      ? `Open Getting found — that page is where visibility is decided, and right now ${gaps.slice(0, 3).map((g) => g.why).join('; ')}. Work down the four steps in order; step 1 and step 2 move the needle most.`
      : 'Getting found shows all four steps complete. From here visibility is a waiting game: a new address usually takes two to eight weeks to appear in search results, and the strongest remaining lever is a link from your own LinkedIn profile.',
    ['guide']);
  }
  if (hit(/match|job|offer|vacan|oferta|empleo|score|puntu|state|estado/)) {
    return A('Which jobs reach you is set on Getting job matches: role titles, the state, '
      + 'industries, employers to chase, words a job must contain and words that rule one out. '
      + 'Every field there is the live record the hunt runs against, so a change today changes '
      + 'what arrives tomorrow. The board itself is under Job Matches.', ['targets', 'matches']);
  }

  // Nothing matched. Say that, and point at the three places an answer lives —
  // rather than guessing and sounding certain about it.
  return A('I could not match that to anything I know for certain, and I would rather say so than '
    + 'guess. Getting found covers being discovered by recruiters, Getting job matches covers which '
    + 'jobs reach you, and My CV is the résumé the rest is built from. Ask about one of those and I '
    + 'will tell you exactly where your account stands.', ['guide', 'targets', 'cv']);
}

/** Read the credit count back out of the snapshot rather than re-deriving it. */
function snapCredits(snap) {
  const m = String(snap || '').match(/Tailoring credits available: (\d+)/);
  return m ? m[1] : '0';
}

/**
 * Answer one question.
 * Returns { answer, actions, is_simulated, cost_usd }.
 */
async function ask({ question, profile, settings, presence, counts, subscriber, lang }) {
  const q = String(question || '').trim().slice(0, 600);
  if (!q) return { answer: '', actions: [], is_simulated: false, cost_usd: 0 };

  const st = settingsSvc.sanitize(settings || {});
  const snap = snapshot({ profile, settings, presence, counts, subscriber });

  if (!brain.enabled()) {
    const out = deterministic(q, snap, st);
    return { ...out, is_simulated: true, cost_usd: 0 };
  }

  const res = await brain.json({
    system: SYSTEM,
    // The capability list is identical on every call, so it is the cached
    // prefix; the account snapshot is volatile and goes after it.
    cachedPrefix: CAPABILITIES,
    prompt: [
      `ACCOUNT SNAPSHOT (the only source of facts about this subscriber):`,
      snap,
      '',
      lang === 'es' ? 'Answer in Spanish.' : 'Answer in English.',
      '',
      `QUESTION: ${q}`,
    ].join('\n'),
    maxTokens: 500,
  });

  if (!res.ok || !res.data || !res.data.answer) {
    // A model outage must not produce silence or an invented answer.
    const out = deterministic(q, snap, st);
    return { ...out, is_simulated: true, cost_usd: res.cost_usd || 0 };
  }
  return {
    answer: String(res.data.answer).slice(0, 1200),
    actions: cleanActions(res.data.actions, lang),
    is_simulated: false,
    cost_usd: res.cost_usd || 0,
  };
}

module.exports = { ask, snapshot, cleanActions, deterministic, TABS, CAPABILITIES, SYSTEM };
