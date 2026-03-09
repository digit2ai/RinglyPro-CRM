const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const chrono = require('chrono-node');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3700;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());

// No-cache for SW and HTML so browsers always get fresh versions
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Serve index.html explicitly at root (avoids redirect issues when mounted as sub-app)
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Create table and run migrations
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_up_items (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        assigned_to VARCHAR(50) DEFAULT NULL,
        source VARCHAR(10) DEFAULT 'text',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    // Calendar columns (idempotent)
    await client.query(`ALTER TABLE follow_up_items ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ`);
    await client.query(`ALTER TABLE follow_up_items ADD COLUMN IF NOT EXISTS event_title VARCHAR(255)`);
    await client.query(`ALTER TABLE follow_up_items ADD COLUMN IF NOT EXISTS d2_task_id INTEGER`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_event_date
      ON follow_up_items (event_date) WHERE event_date IS NOT NULL
    `);
    // Add quicktask_id to d2_tasks for bidirectional sync
    try {
      await client.query(`ALTER TABLE d2_tasks ADD COLUMN IF NOT EXISTS quicktask_id INTEGER`);
    } catch (e) { /* d2_tasks may not exist yet */ }
    console.log('✅ follow_up_items table ready (with calendar + sync columns)');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
}

// Staff members
const STAFF = ['manuel', 'unai', 'carlos', 'ting'];

// Detect name in message — uses geo-based default if no name mentioned
function detectAssignee(message, defaultAssignee = 'manuel') {
  const lower = message.toLowerCase();
  if (lower.includes('unai')) return 'unai';
  if (lower.includes('carlos')) return 'carlos';
  if (lower.includes('ting')) return 'ting';
  if (lower.includes('manuel') || lower.includes('manny')) return 'manuel';
  return defaultAssignee;
}

// Parse date/time and clean title from message (English + Spanish)
function parseEventFromMessage(message) {
  // Try English first, then Spanish
  let results = chrono.parse(message, new Date(), { forwardDate: true });
  if (results.length === 0) {
    results = chrono.es.parse(message, new Date(), { forwardDate: true });
  }
  if (results.length === 0) {
    return { eventDate: null, eventTitle: null };
  }

  const result = results[0];
  // Default ambiguous times (1-6) to PM for business context
  if (result.start.isCertain('hour') && !result.start.isCertain('meridiem')) {
    const hour = result.start.get('hour');
    if (hour >= 1 && hour <= 6) {
      result.start.assign('hour', hour + 12);
      result.start.assign('meridiem', 1);
    }
  }
  const eventDate = result.start.date();

  // Build clean title: remove date text and assignee prefix
  let title = message;
  title = title.replace(result.text, '').trim();
  title = title.replace(/^(manuel|unai|carlos|ting|manny)\s*[,:]?\s*/i, '').trim();
  title = title.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return { eventDate, eventTitle: title || null };
}

// =====================================================
// D2AI TASKS SYNC — bidirectional sync with d2_tasks
// =====================================================

// Map quicktask assignee name → d2_staff_members id (looked up at runtime)
const staffIdCache = {};

async function getStaffId(name) {
  if (!name) return null;
  if (staffIdCache[name]) return staffIdCache[name];
  try {
    const r = await pool.query(
      `SELECT id FROM d2_staff_members WHERE LOWER(first_name) = $1 AND workspace_id = 1 LIMIT 1`,
      [name.toLowerCase()]
    );
    if (r.rows.length > 0) {
      staffIdCache[name] = r.rows[0].id;
      return r.rows[0].id;
    }
  } catch (e) { /* staff table may not exist */ }
  return null;
}

// Create a d2_task from a quicktask follow_up_item
async function syncToD2Tasks(item) {
  try {
    const staffId = await getStaffId(item.assigned_to);
    const r = await pool.query(
      `INSERT INTO d2_tasks (workspace_id, title, description, task_type, status, priority, due_date, assigned_staff_id, quicktask_id, "createdAt", "updatedAt")
       VALUES (1, $1, $2, 'task', 'pending', 'medium', $3, $4, $5, NOW(), NOW()) RETURNING id`,
      [
        item.event_title || item.message.substring(0, 500),
        item.message,
        item.event_date || null,
        staffId,
        item.id
      ]
    );
    if (r.rows.length > 0) {
      await pool.query(`UPDATE follow_up_items SET d2_task_id = $1 WHERE id = $2`, [r.rows[0].id, item.id]);
    }
  } catch (e) {
    console.log('[QuickTask] D2AI sync error (create):', e.message.substring(0, 100));
  }
}

// Sync status change to d2_tasks
async function syncStatusToD2(itemId, status) {
  try {
    const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
    await pool.query(
      `UPDATE d2_tasks SET status = $1, completed_at = ${completedAt}, "updatedAt" = NOW()
       WHERE quicktask_id = $2`,
      [status, itemId]
    );
  } catch (e) { /* ignore if d2_tasks doesn't exist */ }
}

// Delete corresponding d2_task
async function syncDeleteToD2(itemId) {
  try {
    await pool.query(`DELETE FROM d2_tasks WHERE quicktask_id = $1`, [itemId]);
  } catch (e) { /* ignore */ }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'quicktask' });
});

// GET /api/tasks — Fetch all tasks with custom ordering
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM follow_up_items
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        CASE
          WHEN status = 'pending' AND assigned_to IS NULL THEN 0
          WHEN status = 'pending' AND assigned_to = 'manuel' THEN 1
          WHEN status = 'pending' AND assigned_to = 'unai' THEN 2
          WHEN status = 'pending' AND assigned_to = 'carlos' THEN 3
          WHEN status = 'pending' AND assigned_to = 'ting' THEN 4
          ELSE 5
        END,
        created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/tasks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar — Fetch tasks with events in a date range
app.get('/api/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query, params;

    if (start && end) {
      query = `
        SELECT * FROM follow_up_items
        WHERE event_date IS NOT NULL
          AND event_date >= $1::timestamptz
          AND event_date < $2::timestamptz + interval '1 day'
        ORDER BY event_date ASC
      `;
      params = [start, end];
    } else {
      query = `
        SELECT * FROM follow_up_items
        WHERE event_date IS NOT NULL
          AND event_date >= NOW() - interval '7 days'
        ORDER BY event_date ASC
      `;
      params = [];
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/calendar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — Create a new task (with optional calendar event)
app.post('/api/tasks', async (req, res) => {
  try {
    const { message, source, default_assignee } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const assigned_to = detectAssignee(message, default_assignee || 'manuel');
    const { eventDate, eventTitle } = parseEventFromMessage(message.trim());
    const result = await pool.query(
      `INSERT INTO follow_up_items (message, assigned_to, source, event_date, event_title)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [message.trim(), assigned_to, source || 'text', eventDate, eventTitle]
    );

    const item = result.rows[0];
    res.status(201).json({ success: true, data: item });
    // Async sync to D2AI tasks (non-blocking)
    syncToD2Tasks(item).catch(() => {});
  } catch (err) {
    console.error('POST /api/tasks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id — Update task status, assignment, or event fields
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;

    if (status) {
      const completed_at = status === 'completed' ? 'NOW()' : 'NULL';
      const result = await pool.query(
        `UPDATE follow_up_items
         SET status = $1, completed_at = ${completed_at}
         WHERE id = $2 RETURNING *`,
        [status, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      // Sync status to D2AI
      syncStatusToD2(id, status).catch(() => {});
      return res.json({ success: true, data: result.rows[0] });
    }

    if (assigned_to !== undefined) {
      const result = await pool.query(
        `UPDATE follow_up_items SET assigned_to = $1 WHERE id = $2 RETURNING *`,
        [assigned_to, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json({ success: true, data: result.rows[0] });
    }

    if (req.body.event_date !== undefined || req.body.event_title !== undefined) {
      const updates = [];
      const values = [];
      let p = 1;
      if (req.body.event_date !== undefined) { updates.push(`event_date = $${p++}`); values.push(req.body.event_date); }
      if (req.body.event_title !== undefined) { updates.push(`event_title = $${p++}`); values.push(req.body.event_title); }
      values.push(id);
      const result = await pool.query(
        `UPDATE follow_up_items SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json({ success: true, data: result.rows[0] });
    }

    res.status(400).json({ error: 'Provide status, assigned_to, event_date, or event_title' });
  } catch (err) {
    console.error('PATCH /api/tasks/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Sync delete to D2AI before removing
    syncDeleteToD2(id).catch(() => {});
    const result = await pool.query(
      'DELETE FROM follow_up_items WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/tasks/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback — serve index.html for non-API, non-file routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB table on import
initDB();

// Export app for mounting in main CRM
module.exports = app;

// Start standalone server only when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🏁 TunjoRacing To Do running on port ${PORT}`);
  });
}
