const express = require('express');
const path = require('path');
const { Pool } = require('pg');
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
app.use(express.static(path.join(__dirname, 'public')));

// Create table if it doesn't exist
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
    console.log('✅ follow_up_items table ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
}

// Detect name in message
function detectAssignee(message) {
  const lower = message.toLowerCase();
  if (lower.includes('manuel')) return 'manuel';
  if (lower.includes('gonzalo')) return 'gonzalo';
  return null;
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
          WHEN status = 'pending' AND assigned_to = 'gonzalo' THEN 2
          ELSE 3
        END,
        created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/tasks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { message, source } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const assigned_to = detectAssignee(message);
    const result = await pool.query(
      `INSERT INTO follow_up_items (message, assigned_to, source)
       VALUES ($1, $2, $3) RETURNING *`,
      [message.trim(), assigned_to, source || 'text']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/tasks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id — Update task status or assignment
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

    res.status(400).json({ error: 'Provide status or assigned_to' });
  } catch (err) {
    console.error('PATCH /api/tasks/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
