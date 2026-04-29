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

// Serve intake static pages (dark dashboard, no build step)
app.use('/intake', express.static(path.join(dashboardPath, 'intake')));

// API routes (authenticated)
app.use('/api/v1/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/v1/contacts', authenticateToken, contactsRoutes);
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
      `ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS lead_staff_id INTEGER`
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

    // Sync models (safe - won't drop existing)
    await sequelize.sync({ alter: false });
    console.log('[D2AI-Projects] Models synced');
  } catch (err) {
    console.error('[D2AI-Projects] Database setup error:', err.message);
  }
})();

console.log('[D2AI-Projects] Digit2AI Contacts & Projects Hub loaded');
console.log('  - API: /projects/api/v1/*');
console.log('  - Dashboard: /projects/');
console.log('  - Health: /projects/health');

module.exports = app;
