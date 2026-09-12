/* ─────────────────────────────────────────────────────────────────────────
   THE WALKTHROUGH'S PER-BRAND MOCK DATA.

   `public/presentation.html` is ONE deck served at /presentation for every
   brand on all three roots. Almost all of it is already brand-neutral or
   tokenised, but two things are not: the wordmark drawn inside the product
   mock-ups (fixed with BRAND_HEAD/TAIL/TLD), and the EXAMPLE JOB SEARCH on
   the Job Map screen — which was "IT Project Manager · Tampa" on every brand.

   A deck prompting a nurse with "IT Project Manager" tells her she is on the
   wrong website, which is the same reason `eg_roles` exists on the brand
   record for the landing page's search placeholder.

   WHAT MAY LIVE HERE, AND WHAT MAY NOT.

   The Job Map screen is the deck's one PUBLIC screen: its own narration says
   "anyone can search live openings on a map", so the rows are the result of a
   public search and belong to no persona. They are therefore safe to vary per
   brand — PROVIDED they are real.

   AND THEY ARE REAL. Every row below was pulled from this product's own live
   search (GET /api/v1/jobs/search?what=&where=) and carries the pay the
   posting itself states. The deck promises, on screen, "we show you real
   openings or none at all — never invented ones"; a deck that breaks its own
   promise in its own screenshot is worse than one that shows another city.
   To refresh a set, re-run that endpoint and paste what it returns. Do not
   compose a plausible-looking row by hand.

   WHAT IS DELIBERATELY *NOT* HERE: the persona. The Matches, Pipeline and CV
   screens show a scored candidate — Manny Stagg, a real résumé, with real
   scores and real explanations the engine produced. Swapping that persona
   means re-running the scorer, because a score and its "why it matches" are
   ENGINE OUTPUT. Typing a plausible 92 next to a hand-written explanation is
   the exact fabrication the surrounding product forbids, and it would sit two
   screens away from the promise above. See BLOCKED in the TornaJobs entry.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

/* Per brand: the example search the Job Map screen demonstrates.
   `query`/`city` are what the mock search bar shows; `jobs` are rows of
   [title, 'Employer · City', pay] with pay EXACTLY as the posting stated it
   (the deck appends the /yr suffix itself), or '' where the posting stated
   none — the narration already says "when the posting gives it".
   A brand with no entry keeps the deck's own defaults. */
const DECKS = {
  /* ── TornaJobs.com ────────────────────────────────────────────────────
     Its own brand record says `eg_roles: 'nurse, driver'` and it is the one
     brand matching US + PH, so nursing is the representative search rather
     than a guess. (Note for whoever picks this up: brand.js describes this
     brand's audience TWICE and not identically — the record's header comment
     says "the Hispanic / bilingual jobseeker", the geo comment says "the
     Filipino-worker brand". `eg_roles` is data rather than prose, so it is
     what this follows. Worth the owner settling.)

     Pulled 2026-09-11 from the live search, `what=Registered Nurse`,
     `where=Tampa, FL` — 50 real openings, these four with stated pay.

     BLOCKED, and not worked around: the Matches / Pipeline / CV screens still
     show JobUp's scored persona. A nurse persona needs the real scorer run
     against real postings, and `matcher.scoreOne` falls back to a labelled
     heuristic (score 24, no explanation) without ANTHROPIC_API_KEY, which is
     absent locally and has no endpoint that scores an arbitrary profile in
     production. UNBLOCKED BY: a scoring run on a seeded TornaJobs subscriber
     account with the key present — then paste the engine's real score,
     explanation and `missing` here and extend this record with the persona. */
  tornajobs: {
    query: 'Registered Nurse',
    city: 'Tampa',
    jobs: [
      ['Certified Registered Nurse Anesthetist', 'HCA Healthcare · Tampa', '$105,950'],
      ['Charge Registered Nurse - RN', 'Fresenius Medical Care · Tampa', '$101,554'],
      ['Registered Nurse', 'HCA Healthcare · Brandon', '$82,000–$92,000'],
      ['New Graduate Registered Nurse', 'HCA Florida Brandon Hospital · Brandon', '$88,800'],
    ],
    /* Copy the deck's own UI object cannot receive from copy.js: its keys are
       unquoted (`lndP:`), and applyHtml's inline-map pass matches `'key':`.
       Merged over UI at boot. Only the hero line needs it — the deck draws a
       QR for this brand, so a caption saying "Talk to the Orb" describes
       something that is not on the screen. */
    ui: {
      en: { lndP: 'Scan the code or upload your resume. In minutes, {{BRAND}} builds your career '
        + 'ecosystem — a personal website, a custom web address, an AI-readable profile, and '
        + 'real-time job matches.' },
      es: { lndP: 'Escanea el código o sube tu currículum. En minutos, {{BRAND}} construye tu '
        + 'ecosistema profesional: un sitio personal, una dirección web propia, un perfil legible '
        + 'por IA y coincidencias de empleo en tiempo real.' },
    },
  },
};

/** The deck override for a brand, or null when it keeps the defaults. */
function forBrand(brand) {
  const id = brand && brand.id;
  return (id && DECKS[id]) || null;
}

/** The override as a JS literal for the {{DECK}} token, or 'null'. */
function literal(brand) {
  const d = forBrand(brand);
  return d ? JSON.stringify(d) : 'null';
}

module.exports = { DECKS, forBrand, literal };
