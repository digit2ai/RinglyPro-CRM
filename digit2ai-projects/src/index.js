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
