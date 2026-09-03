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
    BRAND_EG_ROLES: b.eg_roles_en, BRAND_EG_ROLES_ES: b.eg_roles_es
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
