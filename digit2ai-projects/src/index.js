'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

// Initialize models and database
const { sequelize } = require('./models');
const { authenticateToken } = require('./middleware/auth');

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const contactsRoutes = require('./routes/contacts');
const projectsRoutes = require('./routes/projects');
const calendarRoutes = require('./routes/calendar');
const tasksRoutes = require('./routes/tasks');
const notificationsRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activity');
const verticalsRoutes = require('./routes/verticals');
const nlpRoutes = require('./routes/nlp');
const staffRoutes = require('./routes/staff');
const pipelineRoutes = require('./routes/pipeline');
const campaignRoutes = require('./routes/campaigns');
const workflowRoutes = require('./routes/workflows');
const intakeRoutes = require('./routes/intake');
const meetingMinutesRoutes = require('./routes/meeting-minutes');
const contractsRoutes = require('./routes/contracts');

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (unauthenticated)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Digit2AI Contacts & Projects Hub',
    timestamp: new Date().toISOString()
  });
});


// Serve dashboard static files
const dashboardPath = path.join(__dirname, '..', 'dashboard');
app.use('/assets', express.static(path.join(dashboardPath, 'assets')));

// PWA files — no-cache for freshness
app.get('/manifest.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(dashboardPath, 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Content-Type', 'application/javascript');
  res.sendFile(path.join(dashboardPath, 'sw.js'));
});

// Intake module — uses its own auth (admin JWT or share-token JWT)
// Mounted BEFORE the authenticated routes so /health and /share/*/identify stay public
app.use('/api/v1/intake', intakeRoutes);

// /api/v1/me — returns the caller's role + identity (used by the dashboard
// to decide which tabs to show). Honored even for calendar_only role.
app.get('/api/v1/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      email: req.user.email,
      name: req.userAccess ? (req.userAccess.display_name || req.user.email) : req.user.email,
      role: req.userAccess ? req.userAccess.role : 'admin',
      businessName: req.user.businessName || null
    }
  });
});

// Serve intake static pages (dark dashboard, no build step)
app.use('/intake', express.static(path.join(dashboardPath, 'intake')));
// Public contract signoff page (token-gated; no admin auth required)
app.use('/contracts', express.static(path.join(dashboardPath, 'contracts')));
// Public stakeholder magic-link viewer (no auth, token + email verified server-side)
// /share/:token serves the viewer HTML; viewer JS reads the token from location.pathname
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'share', 'index.html'));
});
app.use('/share', express.static(path.join(dashboardPath, 'share')));

// Public NDA signing page (no auth; token alone identifies the stakeholder)
// /nda/:token serves the form HTML; viewer JS reads the token from location.pathname
app.get('/nda/:token', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'nda', 'index.html'));
});
app.use('/nda', express.static(path.join(dashboardPath, 'nda')));

// API routes (authenticated)
app.use('/api/v1/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/v1/contacts', authenticateToken, contactsRoutes);
// Stakeholder magic-link share endpoints — PUBLIC (no auth).
// MUST be mounted BEFORE the authenticated /api/v1/projects router so
// the more-specific /share/* path wins the prefix match.
app.use('/api/v1/projects/share', express.json(), require('./routes/projectShare'));
// Public RSVP click-through — recipient clicks Yes/No/Maybe in the meeting
// invite email; token in the URL is the credential, no auth needed.
app.use('/api/v1/meeting-rsvp', require('./routes/meetingRsvp'));
// NDA signing endpoints — PUBLIC (no auth, token-gated). Mount BEFORE
// the authenticated /api/v1/projects router so the /nda/* path wins.
const ndaRoutes = require('./routes/projectNda');
app.use('/api/v1/projects/nda', express.json({ limit: '4mb' }), ndaRoutes.publicRouter);
app.use('/api/v1/projects', authenticateToken, ndaRoutes.adminRouter); // admin NDA mgmt
app.use('/api/v1/projects', authenticateToken, projectsRoutes);
app.use('/api/v1/calendar', authenticateToken, calendarRoutes);
app.use('/api/v1/tasks', authenticateToken, tasksRoutes);
app.use('/api/v1/notifications', authenticateToken, notificationsRoutes);
app.use('/api/v1/activity', authenticateToken, activityRoutes);
app.use('/api/v1/verticals', authenticateToken, verticalsRoutes);
app.use('/api/v1/nlp', authenticateToken, nlpRoutes);
app.use('/api/v1/staff', authenticateToken, staffRoutes);
app.use('/api/v1/pipeline', authenticateToken, pipelineRoutes);
app.use('/api/v1/campaigns', authenticateToken, campaignRoutes);
app.use('/api/v1/workflows', authenticateToken, workflowRoutes);
app.use('/api/v1/meeting-minutes', authenticateToken, meetingMinutesRoutes);
app.use('/api/v1/contracts', authenticateToken, contractsRoutes);

// Public contract signoff endpoint (token-gated, no auth header).
// The Client opens this from their email/magic-link page; they submit
// their name + email, we mark the contract as signed and the project
// flips into "awaiting deposit" (phase 2 will wire Stripe here).
app.get('/api/v1/public/contracts/:token', async (req, res) => {
  try {
    const { ProjectContract, Project } = require('./models');
    const row = await ProjectContract.findOne({ where: { signoff_token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Contract not found' });
    const project = await Project.findByPk(row.project_id);
    res.json({
      success: true,
      data: {
        ...row.toJSON(),
        project: project ? { id: project.id, name: project.name, description: project.description } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/public/contracts/:token/sign', express.json(), async (req, res) => {
  try {
    const { ProjectContract, Project } = require('./models');
    const stripeContract = require('./services/stripeContract');

    const row = await ProjectContract.findOne({ where: { signoff_token: req.params.token } });
    if (!row) return res.status(404).json({ success: false, error: 'Contract not found' });
    if (row.status === 'signed' || row.status === 'active') {
      return res.status(400).json({ success: false, error: 'Contract already signed' });
    }
    const { name, email } = req.body || {};
    if (!name || !email) return res.status(400).json({ success: false, error: 'name and email required' });

    // Stash signer info now — even if the Client bails on Stripe Checkout
    // we have their attribution.
    row.signed_by_name = String(name).trim();
    row.signed_by_email = String(email).trim().toLowerCase();
    await row.save();

    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(500).json({ success: false, error: 'Project missing on contract' });

    // Phase 2: hand off to Stripe Checkout for the 10% deposit. The
    // webhook completes the signature + creates the monthly subscription.
    // If Stripe is not configured (e.g. local dev), fall back to the
    // legacy direct-sign behavior from phase 1.
    let checkout = { skipped: true };
    try {
      checkout = await stripeContract.createDepositCheckoutSession({
        contract: row,
        project,
        signerName: row.signed_by_name,
        signerEmail: row.signed_by_email
      });
    } catch (stripeErr) {
      console.error('[D2AI-Contracts] Stripe checkout create failed:', stripeErr.message);
      checkout = { skipped: true, reason: 'stripe_error', error: stripeErr.message };
    }

    if (checkout && checkout.url) {
      row.stripe_deposit_session_id = checkout.id;
      row.sent_at = row.sent_at || new Date();
      row.status = 'sent';
      await row.save();
      project.contract_status = 'sent';
      project.workflow_phase = 'awaiting_deposit';
      await project.save();
      return res.json({ success: true, redirect_url: checkout.url, data: row });
    }

    // Fallback (no Stripe): legacy direct-sign flow from phase 1.
    row.signed_at = new Date();
    row.status = 'signed';
    await row.save();
    project.contract_status = 'signed';
    project.workflow_phase = 'awaiting_deposit';
    await project.save();
    res.json({ success: true, data: row, stripe: checkout });
  } catch (err) {
    console.error('[D2AI-Contracts] sign error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stripe webhook for contract checkout sessions. Mounted with raw body
// so signature verification works. Idempotent: re-receiving an event
// will short-circuit if the contract is already active.
app.post('/api/v1/webhooks/stripe-contract', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripeContract = require('./services/stripeContract');
    const stripe = stripeContract.getStripe();
    if (!stripe) return res.status(500).send('stripe_not_configured');
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_CONTRACT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
      event = secret ? stripe.webhooks.constructEvent(req.body, sig, secret) : JSON.parse(req.body.toString('utf8'));
    } catch (verifyErr) {
      console.error('[D2AI-Contracts] webhook verify failed:', verifyErr.message);
      return res.status(400).send('bad signature');
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session?.metadata?.d2ai_kind === 'project_deposit' || session?.metadata?.d2ai_contract_id) {
        try {
          await stripeContract.activateContractFromCompletedSession(session);
          console.log('[D2AI-Contracts] Contract activated from checkout', session.id);
        } catch (activateErr) {
          console.error('[D2AI-Contracts] activation failed:', activateErr.message);
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[D2AI-Contracts] webhook handler error:', err);
    res.status(500).send('error');
  }
});

// SendGrid webhook (unauthenticated — called by SendGrid)
app.post('/api/v1/webhooks/sendgrid', express.json({ limit: '5mb' }), (req, res, next) => {
  const campaignRoute = require('./routes/campaigns');
  req.url = '/webhook/sendgrid';
  campaignRoute.handle(req, res, next);
});

// Admin token mint (gated by INTAKE_SEED_SECRET) — issues an admin-role
// share token scoped to a company that overrides company-scope checks.
app.post('/api/v1/intake-seed/admin', express.json(), async (req, res) => {
  try {
    const secret = req.query.secret || req.body.secret;
    if (!secret || secret !== (process.env.INTAKE_SEED_SECRET || 'd2ai-larry-ting-2026')) {
      return res.status(401).json({ success: false, error: 'Bad seed secret' });
    }
    const { Company, IntakeBatch, CompanyAccessToken } = require('./models');
    const company_name = req.body.company_name || 'Company ABC';
    const grantee_email = req.body.grantee_email || 'manuel@digit2ai.com';
    const grantee_name = req.body.grantee_name || 'Manuel Stagg';
    const company = await Company.findOne({ where: { workspace_id: 1, name: company_name } });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found: ' + company_name });
    const batch = await IntakeBatch.findOne({ where: { company_id: company.id }, order: [['created_at', 'DESC']] });
    let token = await CompanyAccessToken.findOne({ where: { company_id: company.id, grantee_email, role: 'admin' } });
    if (!token) {
      token = await CompanyAccessToken.create({
        company_id: company.id,
        batch_id: batch ? batch.id : null,
        grantee_email,
        grantee_name,
        role: 'admin'
      });
    }
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com';
    res.json({
      success: true,
      company_id: company.id,
      batch_id: batch ? batch.id : null,
      grantee_email,
      grantee_name,
      role: 'admin',
      token: token.token,
      admin_url: `${baseUrl}/projects/intake/admin.html?token=${token.token}`,
      reviewer_url: `${baseUrl}/projects/intake/batch.html?token=${token.token}`
    });
  } catch (err) {
    console.error('[D2AI-Projects] admin mint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed trigger (gated by INTAKE_SEED_SECRET) — idempotent Larry & Ting batch
app.post('/api/v1/intake-seed/larry-ting', express.json(), async (req, res) => {
  try {
    const secret = req.query.secret || req.body.secret;
    if (!secret || secret !== (process.env.INTAKE_SEED_SECRET || 'd2ai-larry-ting-2026')) {
      return res.status(401).json({ success: false, error: 'Bad seed secret' });
    }
    const seed = require('../scripts/seed-larry');
    const out = await seed({
      larry_email: req.body.larry_email || 'larry@iqbiz.net',
      larry_name: req.body.larry_name || 'Larry',
      ting_email: req.body.ting_email || 'ting@iqbiz.net',
      ting_name: req.body.ting_name || 'Ting'
    });
    res.json({ success: true, ...out });
  } catch (err) {
    console.error('[D2AI-Projects] seed error:', err);
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// SPA catch-all: serve dashboard for all non-API, non-intake routes
app.get('*', (req, res) => {
  // Don't catch the intake static directory (already served above) or API
  if (req.path.startsWith('/intake/') || req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  const indexPath = path.join(dashboardPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <!DOCTYPE html>
      <html><head><title>Digit2AI Projects Hub</title></head>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0">
        <div style="text-align:center">
          <h1>Digit2AI Contacts & Projects Hub</h1>
          <p>API is running. Dashboard files not found.</p>
          <p><a href="/projects/health" style="color:#6366f1">Health Check</a></p>
        </div>
      </body></html>
    `);
  }
});

// Sync database tables on startup
(async () => {
  try {
    await sequelize.authenticate();
    console.log('[D2AI-Projects] Database connected');

    // Run migration SQL if tables don't exist
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_schema.sql');
    if (fs.existsSync(migrationPath)) {
      try {
        // Check if tables exist
        const [tables] = await sequelize.query(
          "SELECT tablename FROM pg_tables WHERE tablename LIKE 'd2_%'"
        );
        if (tables.length < 5) {
          console.log('[D2AI-Projects] Running schema migration...');
          const sql = fs.readFileSync(migrationPath, 'utf8');
          // Execute each statement separately
          const statements = sql.split(';').filter(s => s.trim().length > 0);
          for (const stmt of statements) {
            try {
              await sequelize.query(stmt.trim() + ';');
            } catch (stmtErr) {
              // Skip non-critical errors (duplicate tables, etc)
              if (!stmtErr.message.includes('already exists') && !stmtErr.message.includes('duplicate')) {
                console.log('[D2AI-Projects] Migration statement notice:', stmtErr.message.substring(0, 100));
              }
            }
          }
          console.log('[D2AI-Projects] Schema migration complete');
        } else {
          console.log('[D2AI-Projects] Tables already exist (' + tables.length + ' d2_* tables)');
        }
      } catch (migErr) {
        console.log('[D2AI-Projects] Migration check error:', migErr.message);
      }
    }

    // Staff module migration — create tables & columns if missing
    const staffMigrations = [
      `CREATE TABLE IF NOT EXISTS d2_staff_members (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        avatar_url VARCHAR(500),
        department VARCHAR(100),
        position VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        hire_date DATE,
        notes TEXT,
        archived_at TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_roles (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(20) DEFAULT '#2563eb',
        sort_order INTEGER DEFAULT 0,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_staff_roles (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_responsibilities (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        role_id INTEGER,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )`,
      `ALTER TABLE d2_tasks ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER`,
      `ALTER TABLE d2_tasks ADD COLUMN IF NOT EXISTS quicktask_id INTEGER`,
      `ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS lead_staff_id INTEGER`,
      // Migration 013 — project NDAs (per-stakeholder magic-link signing)
      // Sequelize is configured with underscored:true at the global define level,
      // so timestamps must be created_at / updated_at (snake_case).
      `CREATE TABLE IF NOT EXISTS d2_project_ndas (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        project_id INTEGER NOT NULL,
        token UUID NOT NULL,
        stakeholder_email VARCHAR(255) NOT NULL,
        stakeholder_name VARCHAR(255),
        stakeholder_company VARCHAR(255),
        stakeholder_title VARCHAR(255),
        purpose TEXT,
        nda_text TEXT,
        signature_data TEXT,
        signed_at TIMESTAMPTZ,
        signed_ip VARCHAR(64),
        signed_user_agent TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_by VARCHAR(255),
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // Heal tables created by an earlier bad CREATE that used camelCase quoted
      // identifiers ("createdAt"/"updatedAt"). Rename in place if they exist.
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'd2_project_ndas' AND column_name = 'createdAt')
         THEN
           ALTER TABLE d2_project_ndas RENAME COLUMN "createdAt" TO created_at;
         END IF;
         IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'd2_project_ndas' AND column_name = 'updatedAt')
         THEN
           ALTER TABLE d2_project_ndas RENAME COLUMN "updatedAt" TO updated_at;
         END IF;
       END $$`,
      // Bilingual NDA support (en / es) — added after initial deploy
      `ALTER TABLE d2_project_ndas ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'en'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_d2_project_ndas_token ON d2_project_ndas (token)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_project_ndas_project ON d2_project_ndas (project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_project_ndas_email ON d2_project_ndas (stakeholder_email)`,
      // Start NDA reference numbering at 144 (display: NDA-000144). Idempotent:
      // only bumps the SERIAL sequence forward, never backward, so existing
      // higher ids are preserved.
      `DO $$
       DECLARE
         seq_name TEXT;
         current_max BIGINT;
       BEGIN
         SELECT pg_get_serial_sequence('d2_project_ndas', 'id') INTO seq_name;
         IF seq_name IS NULL THEN RETURN; END IF;
         SELECT COALESCE(MAX(id), 0) FROM d2_project_ndas INTO current_max;
         IF current_max < 143 THEN
           PERFORM setval(seq_name, 143, true);
         END IF;
       END $$`
    ];
    for (const sql of staffMigrations) {
      try { await sequelize.query(sql); } catch (e) {
        if (!e.message.includes('already exists')) console.log('[D2AI-Projects] Staff migration notice:', e.message.substring(0, 100));
      }
    }
    console.log('[D2AI-Projects] Staff tables ready');

    // Pipeline & Workflow migrations
    const pipelineMigrations = [
      `ALTER TABLE d2_contacts ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'prospect'`,
      `ALTER TABLE d2_contacts ADD COLUMN IF NOT EXISTS last_email_event VARCHAR(50)`,
      `ALTER TABLE d2_contacts ADD COLUMN IF NOT EXISTS last_email_event_at TIMESTAMPTZ`,
      `ALTER TABLE d2_contacts ADD COLUMN IF NOT EXISTS workflow_id INTEGER`,
      `CREATE TABLE IF NOT EXISTS d2_pipeline_history (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        contact_id INTEGER NOT NULL,
        from_stage VARCHAR(50),
        to_stage VARCHAR(50) NOT NULL,
        trigger_type VARCHAR(50) DEFAULT 'manual',
        trigger_detail TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_email_campaigns (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        name VARCHAR(500) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body_html TEXT NOT NULL,
        from_name VARCHAR(255),
        from_email VARCHAR(255),
        target_stage VARCHAR(50),
        target_vertical_id INTEGER,
        status VARCHAR(50) DEFAULT 'draft',
        sent_count INTEGER DEFAULT 0,
        open_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        bounce_count INTEGER DEFAULT 0,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_email_sends (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        contact_id INTEGER NOT NULL,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'queued',
        sg_message_id VARCHAR(255),
        opened_at TIMESTAMPTZ,
        clicked_at TIMESTAMPTZ,
        replied_at TIMESTAMPTZ,
        bounced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_workflows (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(50) DEFAULT 'manual',
        active BOOLEAN DEFAULT true,
        steps JSONB DEFAULT '[]',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS d2_workflow_runs (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL,
        contact_id INTEGER NOT NULL,
        current_step INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        next_action_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        step_data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_d2_contacts_pipeline ON d2_contacts(pipeline_stage)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_email_sends_campaign ON d2_email_sends(campaign_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_email_sends_contact ON d2_email_sends(contact_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_email_sends_msg ON d2_email_sends(sg_message_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_pipeline_history_contact ON d2_pipeline_history(contact_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_workflow_runs_contact ON d2_workflow_runs(contact_id)`,
      `CREATE INDEX IF NOT EXISTS idx_d2_workflow_runs_next ON d2_workflow_runs(next_action_at) WHERE status = 'active'`
    ];
    for (const sql of pipelineMigrations) {
      try { await sequelize.query(sql); } catch (e) {
        if (!e.message.includes('already exists')) console.log('[D2AI-Projects] Pipeline migration notice:', e.message.substring(0, 100));
      }
    }
    console.log('[D2AI-Projects] Pipeline & workflow tables ready');

    // Calendar: recurrence_group_id column for linked-recurring-events support
    try {
      await sequelize.query('ALTER TABLE d2_calendar_events ADD COLUMN IF NOT EXISTS recurrence_group_id UUID');
      await sequelize.query('CREATE INDEX IF NOT EXISTS idx_d2_calendar_recurrence_group ON d2_calendar_events(recurrence_group_id)');
    } catch (e) {
      console.log('[D2AI-Projects] recurrence column notice:', e.message.substring(0, 120));
    }

    // Project Owner kickoff-reschedule counter (cap = 2)
    try {
      await sequelize.query('ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS kickoff_reschedule_count INTEGER NOT NULL DEFAULT 0');
    } catch (e) {
      console.log('[D2AI-Projects] kickoff_reschedule_count notice:', e.message.substring(0, 120));
    }

    // Per-event reschedule counter (cap = 2 per meeting, used by share-page
    // Owner-driven reschedules for on-demand project meetings)
    try {
      await sequelize.query('ALTER TABLE d2_calendar_events ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0');
    } catch (e) {
      console.log('[D2AI-Projects] event reschedule_count notice:', e.message.substring(0, 120));
    }

    // Meeting reminder bookkeeping + invite language. reminder_sent_at is
    // set by the hourly meetingReminder poller when the day-before email
    // goes out; language is captured at send-invite time so the reminder
    // can match the original language (en/es). minutes_prompt_sent_at is
    // set by the hourly meetingMinutesPrompt poller after a meeting ends.
    try {
      await sequelize.query('ALTER TABLE d2_calendar_events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ');
      await sequelize.query("ALTER TABLE d2_calendar_events ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'en'");
      await sequelize.query('ALTER TABLE d2_calendar_events ADD COLUMN IF NOT EXISTS minutes_prompt_sent_at TIMESTAMPTZ');
    } catch (e) {
      console.log('[D2AI-Projects] reminder/language notice:', e.message.substring(0, 120));
    }

    // Per-recipient RSVP tracking for on-demand meeting invites. One row per
    // (event, email); the token gates the public click-through endpoint that
    // records the recipient's response (yes / no / maybe).
    try {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS d2_meeting_rsvps (
        id SERIAL PRIMARY KEY,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        event_id INTEGER NOT NULL,
        project_id INTEGER,
        email VARCHAR(255) NOT NULL,
        response VARCHAR(20),
        token UUID NOT NULL,
        invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMPTZ,
        ip VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_d2_meeting_rsvps_token ON d2_meeting_rsvps (token)');
      await sequelize.query('CREATE INDEX IF NOT EXISTS idx_d2_meeting_rsvps_event ON d2_meeting_rsvps (event_id)');
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_d2_meeting_rsvps_event_email ON d2_meeting_rsvps (event_id, LOWER(email))');
      // Tracks the "are you coming?" nudge fired when the meeting is <48h
      // away and the recipient still has no response. One nudge per row.
      await sequelize.query('ALTER TABLE d2_meeting_rsvps ADD COLUMN IF NOT EXISTS rsvp_reminder_sent_at TIMESTAMPTZ');
    } catch (e) {
      console.log('[D2AI-Projects] meeting rsvps notice:', e.message.substring(0, 120));
    }

    // Meeting-minutes stakeholder distribution (sent_at + sent_to log)
    try {
      await sequelize.query('ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ');
      await sequelize.query("ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS sent_to JSONB NOT NULL DEFAULT '[]'::jsonb");
    } catch (e) {
      console.log('[D2AI-Projects] meeting minutes send-log notice:', e.message.substring(0, 120));
    }

    // Migration 002 — Project Intake & Discussion module
    const intakeMigrationPath = path.join(__dirname, '..', 'migrations', '002_intake.sql');
    if (fs.existsSync(intakeMigrationPath)) {
      try {
        // pgcrypto for gen_random_uuid()
        await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
        const sql = fs.readFileSync(intakeMigrationPath, 'utf8');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 002_intake notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 002_intake migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 002_intake error:', mErr.message);
      }
    }

    // Migration 003 — Project Intake Fields + AI Plan + Business Plan
    const intakeFieldsMigrationPath = path.join(__dirname, '..', 'migrations', '003_project_intake_fields.sql');
    if (fs.existsSync(intakeFieldsMigrationPath)) {
      try {
        const sql = fs.readFileSync(intakeFieldsMigrationPath, 'utf8');
        // Strip line comments first, THEN split on ; (so a chunk that starts
        // with a -- comment block doesn't get filtered out wholesale)
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 003_intake_fields notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 003_intake_fields migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 003_intake_fields error:', mErr.message);
      }
    }

    // Migration 004 — Meeting Minutes
    const meetingMinutesMigrationPath = path.join(__dirname, '..', 'migrations', '004_meeting_minutes.sql');
    if (fs.existsSync(meetingMinutesMigrationPath)) {
      try {
        const sql = fs.readFileSync(meetingMinutesMigrationPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 004_meeting_minutes notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 004_meeting_minutes migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 004_meeting_minutes error:', mErr.message);
      }
    }

    // Migration 005 — Zoom meeting columns on d2_calendar_events
    const zoomMigrationPath = path.join(__dirname, '..', 'migrations', '005_zoom_meeting.sql');
    if (fs.existsSync(zoomMigrationPath)) {
      try {
        const sql = fs.readFileSync(zoomMigrationPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 005_zoom notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 005_zoom_meeting migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 005_zoom_meeting error:', mErr.message);
      }
    }

    // Migration 006 — Calendar invitees
    const invitedEmailsMigrationPath = path.join(__dirname, '..', 'migrations', '006_invited_emails.sql');
    if (fs.existsSync(invitedEmailsMigrationPath)) {
      try {
        const sql = fs.readFileSync(invitedEmailsMigrationPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 006_invited_emails notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 006_invited_emails migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 006_invited_emails error:', mErr.message);
      }
    }

    // Migration 007 — Workflow Phase 1 (business requirements, action items, contracts)
    const workflowPhase1Path = path.join(__dirname, '..', 'migrations', '007_workflow_phase1.sql');
    if (fs.existsSync(workflowPhase1Path)) {
      try {
        const sql = fs.readFileSync(workflowPhase1Path, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 007_workflow_phase1 notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 007_workflow_phase1 migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 007_workflow_phase1 error:', mErr.message);
      }
    }

    // Migration 008 — Stripe wire-up for contracts (Phase 2). Must run
    // after 007 because it alters the d2_project_contracts table that
    // 007 creates.
    const stripeContractsPath = path.join(__dirname, '..', 'migrations', '008_stripe_contracts.sql');
    if (fs.existsSync(stripeContractsPath)) {
      try {
        const sql = fs.readFileSync(stripeContractsPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 008_stripe_contracts notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 008_stripe_contracts migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 008_stripe_contracts error:', mErr.message);
      }
    }

    // Migration 009 — Project delivery & price targets (entered before AI plan generation)
    const projectTargetsPath = path.join(__dirname, '..', 'migrations', '009_project_targets.sql');
    if (fs.existsSync(projectTargetsPath)) {
      try {
        const sql = fs.readFileSync(projectTargetsPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 009_project_targets notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 009_project_targets migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 009_project_targets error:', mErr.message);
      }
    }

    // Migration 010 — Switch delivery target from months to weeks
    const deliveryWeeksPath = path.join(__dirname, '..', 'migrations', '010_delivery_weeks.sql');
    if (fs.existsSync(deliveryWeeksPath)) {
      try {
        const sql = fs.readFileSync(deliveryWeeksPath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate') && !e.message.includes('does not exist')) {
              console.log('[D2AI-Projects] 010_delivery_weeks notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 010_delivery_weeks migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 010_delivery_weeks error:', mErr.message);
      }
    }

    // Migration 011 — Architect pipeline (post-payment build orchestration)
    const architectPipelinePath = path.join(__dirname, '..', 'migrations', '011_architect_pipeline.sql');
    if (fs.existsSync(architectPipelinePath)) {
      try {
        const sql = fs.readFileSync(architectPipelinePath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 011_architect_pipeline notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 011_architect_pipeline migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 011_architect_pipeline error:', mErr.message);
      }
    }

    // Migration 012 — Stakeholder share tokens (per-project magic-link access)
    const stakeholderSharePath = path.join(__dirname, '..', 'migrations', '012_stakeholder_share.sql');
    if (fs.existsSync(stakeholderSharePath)) {
      try {
        const sql = fs.readFileSync(stakeholderSharePath, 'utf8');
        const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try { await sequelize.query(stmt + ';'); } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
              console.log('[D2AI-Projects] 012_stakeholder_share notice:', e.message.substring(0, 200));
            }
          }
        }
        console.log('[D2AI-Projects] 012_stakeholder_share migration applied');
      } catch (mErr) {
        console.log('[D2AI-Projects] 012_stakeholder_share error:', mErr.message);
      }
    }

    // Sync models (safe - won't drop existing)
    await sequelize.sync({ alter: false });
    console.log('[D2AI-Projects] Models synced');

    // Boot the architect-pipeline build poller (auto-detects deploy completion
    // for projects in manual_build phase and fires onBuildComplete -> SIT -> UAT).
    try {
      const architectPipeline = require('./services/architectPipeline');
      if (typeof architectPipeline.startBuildPoller === 'function') {
        architectPipeline.startBuildPoller();
      }
    } catch (pollErr) {
      console.log('[D2AI-Projects] build poller boot error:', pollErr.message);
    }

    // Boot the day-before meeting reminder poller (hourly). Picks up project
    // meetings whose start_time is within the next 24h and reminder_sent_at
    // is NULL; sends a styled reminder email to every non-declined RSVP.
    try {
      const meetingReminder = require('./services/meetingReminder');
      if (typeof meetingReminder.startPoller === 'function') {
        meetingReminder.startPoller();
      }
    } catch (reminderErr) {
      console.log('[D2AI-Projects] meeting reminder poller boot error:', reminderErr.message);
    }

    // Boot the "Are you coming?" RSVP nudge poller (hourly). For meetings
    // <48h away with at least one invited recipient who never clicked
    // Yes/No/Maybe, sends a soft nudge with the same RSVP buttons.
    try {
      const rsvpReminder = require('./services/rsvpReminder');
      if (typeof rsvpReminder.startPoller === 'function') {
        rsvpReminder.startPoller();
      }
    } catch (nudgeErr) {
      console.log('[D2AI-Projects] rsvp reminder poller boot error:', nudgeErr.message);
    }

    // Boot the intake-inbox digest poller (6h check, at most one email
    // per 23h while there are pending_review project requests).
    try {
      const inboxDigest = require('./services/inboxDigest');
      if (typeof inboxDigest.startPoller === 'function') {
        inboxDigest.startPoller();
      }
    } catch (digestErr) {
      console.log('[D2AI-Projects] inbox digest poller boot error:', digestErr.message);
    }

    // Boot the post-meeting minutes-prompt poller (hourly). For project
    // meetings that ended in the last 6h with no minutes prompt yet,
    // emails Manuel a one-click reminder to add the minutes.
    try {
      const minutesPrompt = require('./services/meetingMinutesPrompt');
      if (typeof minutesPrompt.startPoller === 'function') {
        minutesPrompt.startPoller();
      }
    } catch (mErr) {
      console.log('[D2AI-Projects] minutes prompt poller boot error:', mErr.message);
    }
  } catch (err) {
    console.error('[D2AI-Projects] Database setup error:', err.message);
  }
})();

console.log('[D2AI-Projects] Digit2AI Contacts & Projects Hub loaded');
console.log('  - API: /projects/api/v1/*');
console.log('  - Dashboard: /projects/');
console.log('  - Health: /projects/health');

module.exports = app;
