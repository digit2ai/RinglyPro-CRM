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

// Temporary sync test endpoint (no auth) — remove after testing
app.post('/api/v1/test-sync-create', async (req, res) => {
  try {
    const { Task } = require('./models');
    const task = await Task.create({
      workspace_id: 1,
      title: req.body.title || 'Sync test task',
      description: req.body.description || 'Test',
      task_type: 'task',
      status: 'pending',
      priority: 'medium',
      due_date: req.body.due_date || null,
      assigned_staff_id: req.body.assigned_staff_id || null
    });
    // Import sync function from tasks route
    const tasksModule = require('./routes/tasks');
    if (tasksModule._syncToQuickTask) {
      await tasksModule._syncToQuickTask(task.toJSON());
    }
    res.json({ success: true, data: task });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

// SPA catch-all: serve dashboard for all non-API routes
app.get('*', (req, res) => {
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
