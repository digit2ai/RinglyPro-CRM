/* ─────────────────────────────────────────────────────────────────────────
   THE BRAND REGISTRY — one engine, two products.

   JobMD.io is a replica of JobUp.dev for doctors, surgeons and medical staff:
   same landing page, same dashboard, same ecosystem, same emails, same colours.
   The only differences are the name, the domain, and who the copy speaks to.

   THAT IS A SKIN, NOT A FORK. Copying 21,000 lines into a second vertical would
   give two codebases that agree today and disagree by the end of the quarter —
   a bug fixed in one, a price changed in one, an email template improved in one.
   Everything here is therefore ONE engine reading a brand record.

   THE DEFAULT IS JOBUP, AND JOBUP'S VALUES ARE THE LITERALS THAT WERE ALREADY
   IN THE CODE. That is the safety property: JobUp is live and has paying
   subscribers, so every brand-aware call must produce byte-identical output for
   JobUp to what it produced before this file existed. SIT asserts exactly that.

   BRAND IS A PROPERTY OF THE SUBSCRIBER, NOT ONLY OF THE REQUEST. A weekly
   digest is sent by a scheduler with no request in scope; a JobMD subscriber
   must still receive a JobMD email. So `ju_subscribers.brand` is stamped at
   signup and is what every background sender reads. Resolving from the request
   alone would have quietly sent JobUp-branded mail to doctors.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

const BRANDS = {
  /* ── JobUp.dev — the original. These values are the literals that were
        hardcoded throughout the engine before the registry existed. ──────── */
  jobup: {
    id: 'jobup',
    name: 'JobUp',
    domain: 'jobup.dev',
    hosts: ['jobup.dev', 'www.jobup.dev'],
    mount: '/jobup',
    tagline: 'Your Personal AI Career Platform',
    title: 'JobUp — Your Personal AI Career Platform',
    // The nav wordmark is split across spans for styling, so it needs its own
    // tokens: a whole-name replacement cannot see "Job" + "Up" + ".dev".
    word_head: 'Job', word_tail: 'Up', word_tld: '.dev',
    // Example roles in the job-search placeholder. A medical site prompting
    // for "analyst, sales" tells a surgeon they are on the wrong website.
    eg_roles_en: 'analyst, sales', eg_roles_es: 'analista, ventas',
    // The number under the hero. PER BRAND, because the landing page is one
    // file serving both products — a raw number in the markup would put
    // JobUp's line on jobmd.io too. A brand with no number renders nothing at
    // all rather than an empty link.
    phone: '+1 813-212-4888',
    // JobUp FLAGS a posting it cannot place rather than dropping it: its
    // subscriber reviews the edge cases themselves, and a US role written as
    // "WQAD-TV Davenport" is worth showing with a caveat.
    us_only_strict: false,
    // Who the product speaks to. Drives the copy overlay, nothing structural.
    audience: 'professional',
    audience_one: 'professional',
    audience_many: 'professionals',
    // Subscriber sites live at <name>.jobup.dev.
    site_suffix: 'jobup.dev',
    // Icon prefix in public/. Empty = the shared set.
    icon_prefix: '',
    // The in-dashboard assistant.
    assistant: 'Eva',
    from_name_env: 'JOBUP_FROM_NAME',
    public_url_env: 'JOBUP_PUBLIC_URL',
    stripe_product: 'JobUp — Personal AI Career Platform',
    stripe_resume_product: 'JobUp — one tailored résumé',
    footer_by: 'JobUp — a Digit2AI product.',
    built_by: 'Built and maintained by JobUp'
  },

  /* ── JobMD.io — the medical replica. Same structure, same colours, same
        everything; the copy is directed at doctors, surgeons and medical
        staff, and only at them. ──────────────────────────────────────────── */
  jobmd: {
    id: 'jobmd',
    name: 'JobMD',
    domain: 'jobmd.io',
    hosts: ['jobmd.io', 'www.jobmd.io'],
    mount: '/jobmd',
    tagline: 'Your Personal AI Medical Career Platform',
    title: 'JobMD.io — Your Personal AI Medical Career Platform',
    word_head: 'Job', word_tail: 'MD', word_tld: '.io',
    eg_roles_en: 'nurse practitioner, surgeon',
    eg_roles_es: 'enfermera especialista, cirujano',
    // Same line as JobUp — one number answered for both products.
    phone: '+1 813-212-4888',
    // US POSTINGS ONLY, AND NOTHING ELSE. Every filter in the engine drops
    // BLOCK and passes FLAG, so "we could not verify this is in the US" was a
    // pass — a posting with no location, one saying "Anywhere", and one nobody
    // could parse all reached the subscriber. For a licensed clinical role
    // that is wrong: unverified means no. Costs some genuinely-US postings
    // whose location is unreadable, which is the right side to err on here.
    us_only_strict: true,
    audience: 'medical',
    audience_one: 'clinician',
    audience_many: 'doctors, surgeons and medical staff',
    site_suffix: 'jobmd.io',
    // SHARED MARK, ON PURPOSE. The agreement was a replica — "same colour, same
    // thing, same everything" — and the nav glyph is drawn inline in the page,
    // so giving JobMD its own favicon while the header kept JobUp's produced a
    // product whose tab icon and masthead disagreed.
    //
    // The alternative is already built and is one line: set this to 'jobmd-'
    // and the JobMD mark (public/jobmd-*.png, shipped and ready) is served
    // instead, with a fallback to the shared file for anything it lacks.
    icon_prefix: '',
    assistant: 'Eva',
    from_name_env: 'JOBMD_FROM_NAME',
    public_url_env: 'JOBMD_PUBLIC_URL',
    stripe_product: 'JobMD — Personal AI Medical Career Platform',
    stripe_resume_product: 'JobMD — one tailored CV',
    footer_by: 'JobMD — a Digit2AI product.',
    built_by: 'Built and maintained by JobMD'
  },

  /* ── TornaJobs.com — the same engine, a third brand. A replica of JobUp for
        the Hispanic / bilingual jobseeker (sister brand to Torna Idioma): same
        landing, dashboard, ecosystem, emails and colours; the name, the domain
        and who the copy speaks to are the only differences. US-only, like the
        rest of the engine now is. Subscriber sites live at <name>.tornajobs.com.
        Add the brand and tornajobs.com routes automatically — see brand.byHost
        and the host handler in src/app.js, which iterate the registry. ─────── */
  tornajobs: {
    id: 'tornajobs',
    name: 'TornaJobs',
    domain: 'tornajobs.com',
    hosts: ['tornajobs.com', 'www.tornajobs.com'],
    mount: '/tornajobs',
    tagline: 'Your Personal AI Career Platform',
    title: 'TornaJobs — Your Personal AI Career Platform',
    word_head: 'Torna', word_tail: 'Jobs', word_tld: '.com',
    eg_roles_en: 'nurse, driver', eg_roles_es: 'enfermera, conductor',
    phone: '+1 813-212-4888',
    // THE GEO EXCEPTION. TornaJobs is the Filipino-worker brand, so it matches
    // BOTH the United States AND the Philippines — every other brand stays
    // US-only. match_countries is the allowed set the engine enforces (strict:
    // a posting must be positively in one of these, everything else is blocked).
    // A brand that omits this field defaults to ['US'], so JobUp/JobMD are
    // byte-identical.
    match_countries: ['US', 'PH'],
    us_only_strict: true,
    audience: 'professional',
    audience_one: 'professional',
    audience_many: 'professionals',
    site_suffix: 'tornajobs.com',
    // Shared mark until a TornaJobs icon set ships (public/tornajobs-*.png);
    // then set this to 'tornajobs-' and it is served with a shared fallback.
    icon_prefix: '',
    assistant: 'Eva',
    from_name_env: 'TORNAJOBS_FROM_NAME',
    public_url_env: 'TORNAJOBS_PUBLIC_URL',
    stripe_product: 'TornaJobs — Personal AI Career Platform',
    stripe_resume_product: 'TornaJobs — one tailored résumé',
    footer_by: 'TornaJobs — a Digit2AI product.',
    built_by: 'Built and maintained by TornaJobs'
  },

  /* ── ColJobs.app — the same engine, a fourth brand. A replica of TornaJobs for
        the Colombian jobseeker: same landing, dashboard, ecosystem, emails and
        colours; the name, the domain and who the copy speaks to are the only
        differences. Subscriber sites live at <name>.coljobs.app. The custom
        domain is served automatically by brand.byHost + the host handler in
        src/app.js, which iterate the registry. ────────────────────────────── */
  coljobs: {
    id: 'coljobs',
    name: 'ColJobs',
    domain: 'coljobs.app',
    hosts: ['coljobs.app', 'www.coljobs.app'],
    mount: '/coljobs',
    tagline: 'Your Personal AI Career Platform',
    title: 'ColJobs — Your Personal AI Career Platform',
    word_head: 'Col', word_tail: 'Jobs', word_tld: '.app',
    eg_roles_en: 'nurse, driver', eg_roles_es: 'enfermera, conductor',
    phone: '+1 813-212-4888',
    // THE GEO EXCEPTION. ColJobs is the Colombian brand, so it matches BOTH the
    // United States AND Colombia — every other brand stays US-only (TornaJobs is
    // the US+PH exception). match_countries is the allowed set the engine
    // enforces strictly: a posting must be positively placed in one of these,
    // everything else is blocked. A brand that omits this field defaults to
    // ['US'], so JobUp/JobMD are byte-identical.
    match_countries: ['US', 'CO'],
    us_only_strict: true,
    audience: 'professional',
    audience_one: 'professional',
    audience_many: 'professionals',
    site_suffix: 'coljobs.app',
    // Shared mark until a ColJobs icon set ships (public/coljobs-*.png); then
    // set this to 'coljobs-' and it is served with a shared fallback.
    icon_prefix: '',
    assistant: 'Eva',
    from_name_env: 'COLJOBS_FROM_NAME',
    public_url_env: 'COLJOBS_PUBLIC_URL',
    stripe_product: 'ColJobs — Personal AI Career Platform',
    stripe_resume_product: 'ColJobs — one tailored résumé',
    footer_by: 'ColJobs — a Digit2AI product.',
    built_by: 'Built and maintained by ColJobs'
  }
};

const DEFAULT_ID = 'jobup';

/** Every brand id the engine knows. */
function ids() { return Object.keys(BRANDS); }

/**
 * Look a brand up by id.
 *
 * An UNKNOWN id resolves to JobUp rather than throwing. A stored brand that no
 * longer exists must not make a subscriber's dashboard 500 — they still have a
 * live site and a paid subscription, and the worst honest outcome is that their
 * page says the wrong product name until someone fixes the row.
 */
function byId(id) {
  return BRANDS[String(id || '').toLowerCase()] || BRANDS[DEFAULT_ID];
}

/** Resolve from a Host header. Returns null when no brand claims that host. */
function byHost(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  if (!h) return null;
  for (const id of ids()) {
    if (BRANDS[id].hosts.indexOf(h) !== -1) return BRANDS[id];
    // Subscriber sites: <name>.jobup.dev / <name>.jobmd.io.
    if (h.endsWith('.' + BRANDS[id].domain)) return BRANDS[id];
  }
  return null;
}

/**
 * The brand for a request.
 *
 * Order matters and is deliberate:
 *   1. An explicit brand set by the mount (app.js stamps req.jobupBrand).
 *   2. The Host header.
 *   3. The path mount, so /jobmd/... on the shared CRM host is JobMD.
 *   4. JobUp.
 */
function forRequest(req) {
  if (!req) return BRANDS[DEFAULT_ID];
  if (req.jobupBrand && BRANDS[req.jobupBrand]) return BRANDS[req.jobupBrand];
  const h = byHost(req.headers && req.headers.host);
  if (h) return h;
  const url = String(req.originalUrl || req.url || '');
  for (const id of ids()) {
    if (id === DEFAULT_ID) continue;
    if (url === BRANDS[id].mount || url.indexOf(BRANDS[id].mount + '/') === 0) return BRANDS[id];
  }
  return BRANDS[DEFAULT_ID];
}

/**
 * The brand for a subscriber row — what every BACKGROUND sender must use.
 * A row with no brand is a JobUp account created before the registry existed.
 */
function forSubscriber(sub) {
  return byId(sub && sub.brand);
}

/**
 * The token map substituted into an HTML shell, an email or a rendered site.
 *
 * `BRAND_JS` is deliberately absent: the browser global is `JobUpI18n` in both
 * products, and renaming it per brand would mean two i18n bundles and a class
 * of bug where the dashboard silently loses its Spanish. Internal identifiers
 * are not branding.
 */
function tokens(brand) {
  const b = brand || BRANDS[DEFAULT_ID];
  return {
    BRAND: b.name,
    BRAND_ID: b.id,
    BRAND_DOMAIN: b.domain,
    BRAND_SITE: b.site_suffix,
    BRAND_TITLE: b.title,
    BRAND_TAGLINE: b.tagline,
    BRAND_AUDIENCE: b.audience_many,
    BRAND_AUDIENCE_ONE: b.audience_one,
    BRAND_ASSISTANT: b.assistant,
    BRAND_FOOTER: b.footer_by,
    BRAND_BUILT_BY: b.built_by,
    BRAND_URL: 'https://' + b.domain,
    BRAND_HEAD: b.word_head, BRAND_TAIL: b.word_tail, BRAND_TLD: b.word_tld,
    BRAND_EG_ROLES: b.eg_roles_en, BRAND_EG_ROLES_ES: b.eg_roles_es,
    BRAND_PHONE: b.phone || '',
    // tel: wants digits and a leading +, nothing else.
    BRAND_PHONE_TEL: b.phone ? String(b.phone).replace(/[^0-9+]/g, '') : '',
    // A brand with no number hides the block outright — an empty <a> would
    // still take vertical space and still be focusable.
    BRAND_PHONE_CLASS: b.phone ? '' : 'no-phone'
  };
}

/** Apply the token map to a string. */
function apply(text, brand) {
  const t = tokens(brand);
  let out = String(text == null ? '' : text);
  for (const k of Object.keys(t)) {
    out = out.split('{{' + k + '}}').join(t[k]);
  }
  return out;
}

/** The public base URL for a brand, honouring its own env override. */
function publicUrl(brand) {
  const b = brand || BRANDS[DEFAULT_ID];
  const env = process.env[b.public_url_env];
  return String(env || ('https://' + b.domain)).replace(/\/$/, '');
}

/** The From: display name for a brand's outbound mail. */
function fromName(brand) {
  const b = brand || BRANDS[DEFAULT_ID];
  return process.env[b.from_name_env] || b.name;
}

module.exports = {
  BRANDS, DEFAULT_ID, ids, byId, byHost,
  forRequest, forSubscriber, tokens, apply, publicUrl, fromName
};
