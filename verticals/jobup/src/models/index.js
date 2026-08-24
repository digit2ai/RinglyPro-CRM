'use strict';

// =============================================================
// Schema + store.
//
// JobUp owns its database, so tables carry no prefix (spec section 21).
//
// SHARED DATABASE: JobUp runs on the CRM's Postgres alongside 20 other
// products, so EVERY table carries the `ju_` prefix (repo convention: lc_, df_,
// su_, ar_, gr_ ...). Unprefixed names like `jobs`, `settings` or `invoices`
// would be a collision waiting to happen.
//
// MULTITENANCY (spec section 4): every per-subscriber table carries tenant_id,
// and every read goes through the store's tenant-scoped helpers, which take the
// tenant from the caller's session — never from a request parameter.
//
// SHARED vs ISOLATED:
//   shared   -> jobs, employers        (one fetch of a board serves every tenant)
//   isolated -> everything else
// =============================================================

const { DataTypes, Op } = require('sequelize');
const db = require('../db');

const TABLE_PREFIX = 'ju_';

const TENANT_SCOPED = new Set([
  'profiles', 'settings', 'teasers', 'job_matches', 'job_scores', 'tailored_resumes', 'tailor_credits',
  'applications', 'opportunities', 'outreach', 'sites', 'agent_runs',
  'invoices', 'notification_prefs', 'audit_log', 'page_views', 'assets',
  'address_aliases',
  // The social poster's tables. They are owned by the PLATFORM tenant
  // (JOBUP_PLATFORM_TENANT_ID, default 0) rather than by a subscriber, but they
  // are listed here for two reasons: scoped() refuses any table not in this
  // set, and purge() walks it — so if a social account ever were attached to a
  // subscriber, deleting that subscriber would take it with them instead of
  // leaving a live credential behind owned by nobody.
  'social_accounts', 'social_copy', 'social_campaigns', 'social_posts',
  'video_briefs', 'videos',
  'admin_state', 'admin_push_subs',
  'referrals', 'referral_clicks',
  'email_sends',
]);

const SCHEMA = {
  subscribers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 'paid' | 'free_test' — a test account must never be counted as revenue.
    activation: { type: DataTypes.STRING, defaultValue: 'paid' },
    activated_at: { type: DataTypes.DATE },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },              // E.164
    language: { type: DataTypes.STRING, defaultValue: 'en' },
    password_hash: { type: DataTypes.STRING },
    email_verified_at: { type: DataTypes.DATE },
    address: { type: DataTypes.STRING },            // firstnamelastname.jobup.dev
    status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|active|past_due|canceled
    stripe_customer_id: { type: DataTypes.STRING },
    stripe_subscription_id: { type: DataTypes.STRING },
    current_period_end: { type: DataTypes.DATE },
    plan: { type: DataTypes.STRING },            // free|search|landed; NULL = legacy account (untouched)
    pending_plan: { type: DataTypes.STRING },    // set on a scheduled downgrade (applied at period end)
    plan_change_at: { type: DataTypes.DATE },    // when the pending change takes effect (period end)
    paused_until: { type: DataTypes.DATE },      // auto-resume ceiling for a paused subscription
    // The subscriber's own shareable code. Generated on first use, never reused.
    referral_code: { type: DataTypes.STRING, unique: true },
    // Where this subscriber came from. Kept as BOTH the raw code and the
    // resolved tenant: the code is what they actually clicked and survives even
    // if the referrer is later deleted, which is what makes a dispute checkable.
    referred_by_code: { type: DataTypes.STRING },
    referred_by_tenant: { type: DataTypes.INTEGER },
    // Email job-match notifications. Cadence follows `plan` (landed=daily,
    // search/legacy=weekly, free=never). The cap is enforced from next_eligible_at.
    notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    unsubscribe_token: { type: DataTypes.STRING },
    timezone: { type: DataTypes.STRING },             // IANA tz; null => America/New_York
    last_notified_at: { type: DataTypes.DATE },
    next_eligible_at: { type: DataTypes.DATE },
    bounce_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    welcomed_at: { type: DataTypes.DATE },            // welcome email sent once, on signup
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // tenant_id === subscribers.id
  profiles: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    photo_asset_id: { type: DataTypes.INTEGER },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    resume_json: { type: DataTypes.JSONB },         // JSON Resume shape
    source_text: { type: DataTypes.TEXT },          // raw extracted resume text
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  settings: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    settings: { type: DataTypes.JSONB, defaultValue: {} },
  },
  // SHARED pool — no tenant_id, by design (spec section 4)
  employers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    ats: { type: DataTypes.STRING },
    token: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'unverified' }, // live|unverified|closed|demo
    note: { type: DataTypes.TEXT },
    last_fetched_at: { type: DataTypes.DATE },
  },
  jobs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING },
    external_id: { type: DataTypes.STRING },
    employer: { type: DataTypes.STRING },
    title: { type: DataTypes.STRING },
    location: { type: DataTypes.STRING },
    url: { type: DataTypes.TEXT },
    description: { type: DataTypes.TEXT },
    compensation: { type: DataTypes.STRING },       // only when the posting states it
    posted_at: { type: DataTypes.DATE },
    dedupe_key: { type: DataTypes.STRING },
    first_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  job_matches: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    stage_changed_at: { type: DataTypes.DATE },
    note: { type: DataTypes.TEXT },
    // Where this pipeline entry came from:
    //   'hunter'  — the agent found the posting (job_id points into ju_jobs)
    //   'inbound' — a recruiter contacted you (opportunity_id points at it)
    //   'manual'  — you added it yourself
    // job_id is NULL for the last two: ju_jobs is the SHARED pool, and writing
    // a private conversation into it would expose it to every other tenant's
    // matching.
    source: { type: DataTypes.STRING, defaultValue: 'hunter' },
    opportunity_id: { type: DataTypes.INTEGER },
    title: { type: DataTypes.STRING },
    employer: { type: DataTypes.STRING },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER, allowNull: false },
    score: { type: DataTypes.INTEGER },
    explanation: { type: DataTypes.TEXT },
    missing: { type: DataTypes.JSONB, defaultValue: [] },
    stage: { type: DataTypes.STRING, defaultValue: 'new' }, // new|saved|applied|screening|interviewing|offer|closed
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Stamped when this match has been included in a sent email digest. A match
    // is emailed exactly once, ever — the notifier only ever reads WHERE
    // notified_at IS NULL, so a stamped row can never reappear in a later digest.
    notified_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // One row per digest actually sent (or attempted). The audit trail that makes
  // the frequency cap and the "once ever" guarantee checkable after the fact.
  // tenant_id === subscribers.id (JobUp has one user per tenant).
  email_sends: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING, defaultValue: 'job_match_digest' },
    period: { type: DataTypes.STRING },            // 'daily' | 'weekly'
    tier_at_send: { type: DataTypes.STRING },       // the plan at the moment of send
    locale: { type: DataTypes.STRING },
    match_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    sendgrid_message_id: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'sent' }, // sent|failed|dry_run
    error: { type: DataTypes.TEXT },
    sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // EVERY posting this tenant has spent a model call on, whether or not it was
  // filed. job_matches only holds what cleared `min_score`, so it is the wrong
  // thing to build the "already looked at this" set from: a subscriber whose
  // scores all land below their floor files nothing, so that set stays empty
  // and the hunter re-scores the identical postings every morning forever —
  // same jobs, same verdict, same charge, and a run summary that never moves.
  // This ledger is the record of what was PAID to look at; job_matches stays
  // the clean board of what was worth showing.
  job_scores: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER, allowNull: false },
    score: { type: DataTypes.INTEGER },
    filed: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  tailored_resumes: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER },
    content: { type: DataTypes.TEXT },
    diff: { type: DataTypes.JSONB, defaultValue: [] },
    flagged_terms: { type: DataTypes.JSONB, defaultValue: [] }, // no-invented-facts check
    confirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    // The structured document the PDF is rendered FROM, so the exact file a
    // subscriber sent an employer is always recoverable. Render's disk is
    // ephemeral; a stored path would not survive the next deploy.
    doc: { type: DataTypes.JSONB, defaultValue: null },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    keyword_coverage: { type: DataTypes.JSONB, defaultValue: null },
    gaps: { type: DataTypes.JSONB, defaultValue: [] },
    employer: { type: DataTypes.STRING(255) },
    title: { type: DataTypes.STRING(255) },
    credit_id: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // MONEY. One row per purchased tailoring, created ONLY from a Stripe session
  // this server has confirmed as paid — never from a redirect parameter, which
  // the buyer controls. consumed_at is set when a tailoring actually renders,
  // so a generation failure leaves the credit spendable rather than burning it.
  tailor_credits: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    amount_cents: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING(8), defaultValue: 'usd' },
    stripe_session_id: { type: DataTypes.STRING(255), unique: true },
    stripe_payment_intent: { type: DataTypes.STRING(255) },
    source: { type: DataTypes.STRING(32), defaultValue: 'stripe' },
    consumed_at: { type: DataTypes.DATE },
    consumed_job_id: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  applications: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER },
    // ONLY set when the subscriber confirms they submitted it (spec 11.4 / 19.1)
    confirmed_by_subscriber_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  teasers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },          // null until they pay
    token: { type: DataTypes.STRING, unique: true },
    email: { type: DataTypes.STRING },
    name: { type: DataTypes.STRING },
    language: { type: DataTypes.STRING, defaultValue: 'en' },
    address_offer: { type: DataTypes.STRING },
    // The extracted resume text. Kept so provisioning can carry it to the
    // profile — the matcher's keyless pre-filter has nothing to work with
    // without it — and expired by resume_purge_after, which exists for exactly
    // this and previously had nothing to purge.
    resume_text: { type: DataTypes.TEXT },
    payload: { type: DataTypes.JSONB, defaultValue: {} },
    narration: { type: DataTypes.JSONB, defaultValue: [] },
    status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|ready|failed
    // Real build progress — set as each stage completes, so the waiting screen
    // reports what is actually happening instead of animating a fake bar.
    stage: { type: DataTypes.STRING },
    stage_label: { type: DataTypes.STRING },
    stage_n: { type: DataTypes.INTEGER, defaultValue: 0 },
    stages_total: { type: DataTypes.INTEGER, defaultValue: 6 },
    started_at: { type: DataTypes.DATE },
    cost_usd: { type: DataTypes.FLOAT, defaultValue: 0 },
    ip_hash: { type: DataTypes.STRING },
    resume_purge_after: { type: DataTypes.DATE },    // 90-day purge (spec 19.1)
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  outreach: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    channel: { type: DataTypes.STRING },
    job_id: { type: DataTypes.INTEGER },      // what it is about
    to_email: { type: DataTypes.STRING },     // filled in by the subscriber
    to_name: { type: DataTypes.STRING },
    subject: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    // approval is forced on in code, never a prompt (spec section 10)
    approved_at: { type: DataTypes.DATE },
    sent_at: { type: DataTypes.DATE },
    consent_snapshot: { type: DataTypes.JSONB },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // INBOUND interest — a recruiter (or their AI) reached the subscriber via
  // the public site or the agent endpoint. The subscriber's own inbox.
  opportunities: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    source: { type: DataTypes.STRING },          // site_form | agent_endpoint | manual
    company: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING },
    from_name: { type: DataTypes.STRING },
    from_email: { type: DataTypes.STRING },
    note: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'new' },   // new | read | replied | archived
    ip_hash: { type: DataTypes.STRING },   // salted; never a raw IP
    reply_draft: { type: DataTypes.TEXT },
    read_at: { type: DataTypes.DATE },
    replied_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Traffic to the subscriber's own public site.
  // NO raw IP is ever stored — visitor_hash is a salted daily digest, so a
  // unique-visitor count is possible without retaining an identifier.
  page_views: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    path: { type: DataTypes.STRING },
    referrer: { type: DataTypes.STRING },
    visitor_hash: { type: DataTypes.STRING },
    is_agent: { type: DataTypes.BOOLEAN, defaultValue: false },  // an AI crawler, not a person
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Binary a subscriber uploaded — today only a profile photo. Kept out of
  // resume_json so the JSON surfaces stay small and cacheable.
  assets: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },        // null while still a teaser
    teaser_token: { type: DataTypes.STRING },
    kind: { type: DataTypes.STRING, defaultValue: 'photo' },
    mime: { type: DataTypes.STRING },
    bytes: { type: DataTypes.INTEGER },
    data: { type: DataTypes.TEXT },                // base64
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Every address a subscriber has ever held. An old link a recruiter saved
  // must keep working, and must never be handed to someone else.
  address_aliases: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    address: { type: DataTypes.STRING, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  sites: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    address: { type: DataTypes.STRING },
    published_at: { type: DataTypes.DATE },
    health: { type: DataTypes.JSONB, defaultValue: {} },
  },
  agent_runs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    agent: { type: DataTypes.STRING },
    scored: { type: DataTypes.INTEGER, defaultValue: 0 },   // for the daily ceiling
    // WHAT ASKED FOR THIS RUN. Without it, the button and the scheduler drained
    // one pool: whichever ran first spent the day's allowance and the other
    // found nothing left.
    trigger: { type: DataTypes.STRING, defaultValue: 'scheduled' },  // signup|scheduled|manual
    status: { type: DataTypes.STRING },
    summary: { type: DataTypes.TEXT },
    cost_usd: { type: DataTypes.FLOAT, defaultValue: 0 },
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  invoices: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    stripe_invoice_id: { type: DataTypes.STRING },
    amount_cents: { type: DataTypes.INTEGER },
    status: { type: DataTypes.STRING },
    dunning_stage: { type: DataTypes.INTEGER, defaultValue: 0 },
    paid_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  notification_prefs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    prefs: { type: DataTypes.JSONB, defaultValue: {} },
    unsubscribed_all_at: { type: DataTypes.DATE },
  },
  audit_log: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },
    actor: { type: DataTypes.STRING },
    action: { type: DataTypes.STRING },
    reason: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },

  // ---- Referral programme --------------------------------------------------
  // One row per referred signup. tenant_id is the REFERRER, so a referrer can
  // read their own rows through the same scoped accessor as everything else.
  referrals: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },   // the referrer
    referee_tenant_id: { type: DataTypes.INTEGER },
    code: { type: DataTypes.STRING },
    // pending  -> signed up, has not paid
    // qualified-> a REAL paid invoice exists; commission is owed
    // void     -> disqualified (self-referral, refund, duplicate)
    // paid_out -> the owner recorded a payment to the referrer
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    invoice_id: { type: DataTypes.INTEGER },          // the invoice that qualified it
    invoice_cents: { type: DataTypes.INTEGER },       // what the referee actually paid
    commission_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
    commission_pct: { type: DataTypes.FLOAT },
    note: { type: DataTypes.TEXT },
    qualified_at: { type: DataTypes.DATE },
    paid_out_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Clicks on a share link. Never stores a raw IP.
  referral_clicks: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },   // the referrer
    code: { type: DataTypes.STRING },
    ip_hash: { type: DataTypes.STRING },
    user_agent: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },

  // ---- Admin console state (watermarks, VAPID keys, push subscriptions) ---
  // Keyed by the admin's own identity so two operators do not clear each
  // other's badge. tenant_id is the platform tenant, like the social tables.
  admin_state: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    actor: { type: DataTypes.STRING },        // admin email, or '' for shared keys
    key: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.JSONB, defaultValue: {} },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // One row per installed console. A push subscription is a capability URL:
  // anyone holding it can push to that device, so it is never returned by a read.
  admin_push_subs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    actor: { type: DataTypes.STRING },
    endpoint: { type: DataTypes.TEXT },
    keys_json: { type: DataTypes.JSONB },
    user_agent: { type: DataTypes.STRING },
    failures: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },

  // ---- Social Media Image Poster -----------------------------------------
  // The destination registry. This IS the "<social account credentials store>"
  // the spec left as a placeholder.
  // ---- video posting creator -------------------------------------------
  // A brief is a natural-language description of the ad. The SPEC is what the
  // pipeline actually renders, and it is editable by a human before a cent is
  // spent — the whole point of the review step.
  video_briefs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING },
    brief: { type: DataTypes.TEXT, allowNull: false },      // what the operator typed
    lang: { type: DataTypes.STRING, defaultValue: 'en' },
    // { character:{description,styleTokens}, beats:[...], targetSeconds, music:{...}, voice:{...} }
    spec: { type: DataTypes.JSONB },
    // Identifier-shaped claims the brief did NOT contain — shown above the
    // artifact so nobody signs off on an invented product claim.
    unverified: { type: DataTypes.JSONB },
    composed_by: { type: DataTypes.STRING },                 // model id | 'heuristic'
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    estimate: { type: DataTypes.JSONB },                     // plan + projected cost
    // draft -> approved -> rendering -> done | failed
    status: { type: DataTypes.STRING, defaultValue: 'draft' },
    status_reason: { type: DataTypes.TEXT },
    progress: { type: DataTypes.JSONB },                     // {step, pct, note}
    approved_at: { type: DataTypes.DATE },
    approved_by: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // The rendered library. One row per finished mp4.
  videos: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    brief_id: { type: DataTypes.INTEGER },
    title: { type: DataTypes.STRING },
    filename: { type: DataTypes.STRING, allowNull: false },
    path: { type: DataTypes.TEXT, allowNull: false },
    poster_path: { type: DataTypes.TEXT },
    // Where the DURABLE copy lives. 'local' means the only copy is the one on
    // this host's ephemeral disk and is gone at the next deploy.
    storage: { type: DataTypes.STRING, defaultValue: 'local' },
    bucket: { type: DataTypes.STRING },
    object_key: { type: DataTypes.TEXT },
    seconds: { type: DataTypes.FLOAT },
    width: { type: DataTypes.INTEGER },
    height: { type: DataTypes.INTEGER },
    bytes: { type: DataTypes.INTEGER },
    caption: { type: DataTypes.TEXT },                       // ready for the social poster
    // What the providers actually reported, not the rate-card guess.
    ledger: { type: DataTypes.JSONB },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  social_accounts: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },   // "Orlando HOA", "Kissimmee Chamber"
    // facebook_page | instagram | facebook_group | other
    platform: { type: DataTypes.STRING, allowNull: false },
    account_or_page_id: { type: DataTypes.STRING },
    // AES-256-GCM. The raw token is never stored and never returned.
    access_token_enc: { type: DataTypes.TEXT },
    token_expires_at: { type: DataTypes.DATE },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // The "<JobUp marketing copy library>".
  social_copy: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    label: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    lang: { type: DataTypes.STRING, defaultValue: 'en' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // One agent run.
  social_campaigns: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    campaign_id: { type: DataTypes.STRING },
    image_reference: { type: DataTypes.TEXT },
    caption: { type: DataTypes.TEXT },
    dry_run: { type: DataTypes.BOOLEAN, defaultValue: false },
    run_timestamp: { type: DataTypes.DATE },
    result: { type: DataTypes.JSONB },     // the declared output shape, verbatim
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // One row per destination attempt — the audit behind every posts[] entry.
  social_posts: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    campaign_id: { type: DataTypes.STRING },
    account_id: { type: DataTypes.INTEGER },
    destination_name: { type: DataTypes.STRING },
    platform: { type: DataTypes.STRING },
    account_or_page_id: { type: DataTypes.STRING },
    caption_posted: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING },    // posted | failed | skipped
    post_id: { type: DataTypes.STRING },
    post_url: { type: DataTypes.TEXT },
    posted_at: { type: DataTypes.DATE },
    failure_reason: { type: DataTypes.TEXT },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
};

// ---------------------------------------------------------------
// In-memory fallback with the same surface as the Sequelize models.
// ---------------------------------------------------------------
function memoryTable(name) {
  const rows = [];
  let seq = 1;
  const clone = (r) => (r == null ? null : JSON.parse(JSON.stringify(r)));
  const matches = (row, where) =>
    Object.entries(where || {}).every(([k, v]) => {
      if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].includes(row[k]);
      if (v && typeof v === 'object' && v[Op.ne] !== undefined) return row[k] !== v[Op.ne];
      return row[k] === v;
    });
  return {
    _name: name,
    async create(values) {
      // Apply schema defaults so the memory backend behaves like Postgres.
      const defaults = {};
      for (const [col, def] of Object.entries(SCHEMA[name] || {})) {
        if (def && def.defaultValue !== undefined && def.defaultValue !== DataTypes.NOW) {
          defaults[col] = typeof def.defaultValue === 'object'
            ? JSON.parse(JSON.stringify(def.defaultValue)) : def.defaultValue;
        }
      }
      const row = { id: seq++, created_at: new Date(), ...defaults, ...values };
      rows.push(row);
      return clone(row);
    },
    async findOne({ where } = {}) {
      return clone(rows.find((r) => matches(r, where)) || null);
    },
    async findAll({ where, limit, order } = {}) {
      let out = rows.filter((r) => matches(r, where));
      if (order && order[0]) {
        const [col, dir] = order[0];
        out = out.slice().sort((a, b) =>
          dir === 'DESC' ? (b[col] > a[col] ? 1 : -1) : (a[col] > b[col] ? 1 : -1));
      }
      if (limit) out = out.slice(0, limit);
      return out.map(clone);
    },
    async count({ where } = {}) {
      return rows.filter((r) => matches(r, where)).length;
    },
    async update(values, { where } = {}) {
      let n = 0;
      rows.forEach((r) => { if (matches(r, where)) { Object.assign(r, values); n++; } });
      return [n];
    },
    async destroy(opts = {}) {
      // Sequelize throws on a destroy with no `where`; the memory backend used
      // to treat it as "match everything" and quietly empty the table. So
      // `destroy({ id })` — options where a where-clause was meant — passed in
      // SIT and would have deleted every row of the real table in production.
      // Behave like the thing being stood in for.
      if (!opts.where) {
        throw new Error(`${name}.destroy called without a where clause — refusing to delete every row`);
      }
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matches(rows[i], opts.where)) { rows.splice(i, 1); n++; }
      }
      return n;
    },
  };
}

const models = {};
let ready = false;
let activeBackend = 'memory';

async function init() {
  const conn = await db.connect();
  const seq = db.sequelize();
  activeBackend = conn.ok ? 'postgres' : 'memory';

  if (conn.ok && seq) {
    for (const [name, attrs] of Object.entries(SCHEMA)) {
      models[name] = seq.define('ju_' + name, attrs, {
        tableName: TABLE_PREFIX + name,
        timestamps: false,
        indexes: TENANT_SCOPED.has(name) ? [{ fields: ['tenant_id'] }] : [],
      });
    }
    // alter:false — sync() creates missing TABLES but never missing COLUMNS.
    // Scoped to OUR models only; never touches another product's tables.
    for (const m of Object.values(models)) await m.sync({ alter: false });

    // ...so columns added to an existing table are applied explicitly here,
    // idempotently (repo convention). Without this a new column exists in the
    // model and in the SIT's memory backend but NOT in production Postgres,
    // and every read of it silently returns undefined.
    await ensureColumns(seq);
    await ensureIndexes(seq);
  } else {
    for (const name of Object.keys(SCHEMA)) models[name] = memoryTable(name);
  }
  ready = true;
  return { backend: activeBackend, tables: Object.keys(models).length };
}

// Columns added after a table first shipped. Safe to re-run forever.
const ADDED_COLUMNS = [
  // Referral programme. sync({alter:false}) never adds a column to an existing
  // table, so a new field is invisible to Postgres until it is listed here —
  // and every INSERT naming it fails outright, which is what happened.
  ['ju_tailored_resumes', 'doc',              'JSONB'],
  ['ju_tailored_resumes', 'version',          'INTEGER DEFAULT 1'],
  ['ju_tailored_resumes', 'keyword_coverage', 'JSONB'],
  ['ju_tailored_resumes', 'gaps',             'JSONB'],
  ['ju_tailored_resumes', 'employer',         'VARCHAR(255)'],
  ['ju_tailored_resumes', 'title',            'VARCHAR(255)'],
  ['ju_tailored_resumes', 'credit_id',        'INTEGER'],
  ['ju_subscribers',   'referral_code',      'VARCHAR(32)'],
  ['ju_subscribers',   'referred_by_code',   'VARCHAR(32)'],
  ['ju_subscribers',   'referred_by_tenant', 'INTEGER'],
  ['ju_subscribers',   'activation',   "VARCHAR(32) DEFAULT 'paid'"],
  ['ju_subscribers',   'activated_at', 'TIMESTAMPTZ'],
  // Tiers (Free/Search/Landed). NULL plan = legacy account, left untouched.
  ['ju_subscribers',   'plan',           'VARCHAR(16)'],
  ['ju_subscribers',   'pending_plan',   'VARCHAR(16)'],
  ['ju_subscribers',   'plan_change_at', 'TIMESTAMPTZ'],
  ['ju_subscribers',   'paused_until',   'TIMESTAMPTZ'],
  ['ju_opportunities', 'from_name',    'VARCHAR(255)'],
  ['ju_opportunities', 'from_email',   'VARCHAR(255)'],
  ['ju_opportunities', 'status',       "VARCHAR(32) DEFAULT 'new'"],
  ['ju_opportunities', 'reply_draft',  'TEXT'],
  ['ju_opportunities', 'read_at',      'TIMESTAMPTZ'],
  ['ju_opportunities', 'replied_at',   'TIMESTAMPTZ'],
  ['ju_teasers',       'stage',        'VARCHAR(64)'],
  ['ju_teasers',       'stage_label',  'VARCHAR(128)'],
  ['ju_teasers',       'stage_n',      'INTEGER DEFAULT 0'],
  ['ju_teasers',       'stages_total', 'INTEGER DEFAULT 6'],
  ['ju_teasers',       'started_at',   'TIMESTAMPTZ'],
  ['ju_opportunities', 'ip_hash',      'VARCHAR(64)'],
  ['ju_teasers',       'resume_text',  'TEXT'],
  ['ju_job_matches',   'stage_changed_at', 'TIMESTAMPTZ'],
  ['ju_job_matches',   'note',         'TEXT'],
  ['ju_job_matches',   'source',       "VARCHAR(32) DEFAULT 'hunter'"],
  ['ju_job_matches',   'opportunity_id', 'INTEGER'],
  ['ju_job_matches',   'title',        'VARCHAR(250)'],
  ['ju_job_matches',   'employer',     'VARCHAR(250)'],
  ['ju_job_matches',   'notified_at',  'TIMESTAMPTZ'],
  // Email job-match notifications. Cadence is driven by `plan`; these carry the
  // per-user state the cap is enforced from.
  ['ju_subscribers',   'notifications_enabled', 'BOOLEAN DEFAULT true'],
  ['ju_subscribers',   'unsubscribe_token',     'VARCHAR(64)'],
  ['ju_subscribers',   'timezone',              'VARCHAR(64)'],
  ['ju_subscribers',   'last_notified_at',      'TIMESTAMPTZ'],
  ['ju_subscribers',   'next_eligible_at',      'TIMESTAMPTZ'],
  ['ju_subscribers',   'bounce_count',          'INTEGER DEFAULT 0'],
  ['ju_subscribers',   'welcomed_at',           'TIMESTAMPTZ'],
  ['ju_outreach',      'job_id',       'INTEGER'],
  ['ju_outreach',      'to_email',     'VARCHAR(255)'],
  ['ju_outreach',      'to_name',      'VARCHAR(255)'],
  ['ju_agent_runs',    'scored',       'INTEGER DEFAULT 0'],
  ['ju_agent_runs',    'trigger',      "VARCHAR(24) DEFAULT 'scheduled'"],
  ['ju_profiles',      'photo_asset_id', 'INTEGER'],
  // Durable video storage. The table shipped local-disk-only, so these are
  // invisible to Postgres until listed here and every INSERT naming them fails.
  ['ju_videos',        'storage',    "VARCHAR(16) DEFAULT 'local'"],
  ['ju_videos',        'bucket',     'VARCHAR(255)'],
  ['ju_videos',        'object_key', 'TEXT'],
];

// Indexes the notifier's hot paths need. Idempotent; safe to re-run forever.
const ADDED_INDEXES = [
  ['idx_ju_job_matches_notify', 'ju_job_matches', '(tenant_id, notified_at)'],
  ['idx_ju_subscribers_eligible', 'ju_subscribers', '(next_eligible_at)'],
  ['idx_ju_email_sends_tenant', 'ju_email_sends', '(tenant_id, sent_at)'],
];
async function ensureIndexes(sequelize) {
  if (!sequelize) return;
  for (const [name, table, cols] of ADDED_INDEXES) {
    try { await sequelize.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`); }
    catch (e) { console.warn(`[jobup] could not ensure index ${name}:`, e.message); }
  }
}

async function ensureColumns(sequelize) {
  // The instance is passed in — it is local to init(), and reaching for a
  // module-scope `seq` here silently no-ops instead of migrating.
  if (!sequelize) return { applied: 0, skipped: 'no connection' };
  let applied = 0;
  for (const [table, col, type] of ADDED_COLUMNS) {
    try {
      await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      applied++;
    } catch (e) {
      console.warn(`[jobup] could not ensure ${table}.${col}:`, e.message);
    }
  }
  console.log(`[jobup] ensured ${applied}/${ADDED_COLUMNS.length} post-launch columns`);
  return { applied };
}

// ---------------------------------------------------------------
// Tenant-scoped accessors. The ONLY sanctioned way to read per-subscriber
// data. tenant_id comes from the caller (session), never from user input.
// A cross-tenant read returns null/[] — asserted by the SIT.
// ---------------------------------------------------------------
function scoped(table, tenantId) {
  if (!TENANT_SCOPED.has(table)) {
    throw new Error(`scoped() is for tenant tables only; ${table} is shared`);
  }
  if (!Number.isInteger(tenantId)) throw new Error('tenant_id must be an integer');
  const m = models[table];
  return {
    create: (v) => m.create({ ...v, tenant_id: tenantId }),
    findOne: (where = {}) => m.findOne({ where: { ...where, tenant_id: tenantId } }),
    findAll: (opts = {}) =>
      m.findAll({ ...opts, where: { ...(opts.where || {}), tenant_id: tenantId } }),
    count: (where = {}) => m.count({ where: { ...where, tenant_id: tenantId } }),
    update: (values, where = {}) =>
      m.update(values, { where: { ...where, tenant_id: tenantId } }),
    destroy: (where = {}) => m.destroy({ where: { ...where, tenant_id: tenantId } }),
  };
}

/**
 * Sequelize rows are class instances: spreading one yields dataValues,
 * _previousDataValues and friends — NOT the columns. The memory backend
 * returns plain objects, so a spread works there and the bug only appears on
 * Postgres. That is exactly how `score` reached the dashboard as undefined
 * while every SIT assertion passed.
 */
function plain(row) {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(plain);
  return typeof row.get === 'function' ? row.get({ plain: true })
       : typeof row.toJSON === 'function' ? row.toJSON()
       : row;
}

module.exports = {
  init,
  plain,
  TABLE_PREFIX,
  models,
  scoped,
  SCHEMA,
  TENANT_SCOPED,
  isReady: () => ready,
  backend: () => activeBackend,
  ensureColumns,
  ADDED_COLUMNS,
  Op,
};
