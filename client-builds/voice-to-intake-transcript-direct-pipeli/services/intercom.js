// =====================================================
// Intercom — two-way chat between each champion and the owner.
// One thread per champion (keyed by champion email). Stored in the voice app's
// own DB (DATABASE_URL). Unread is tracked per side:
//   champion badge = owner-sent messages not yet read by the champion
//   owner badge    = champion-sent messages not yet read by the owner
// =====================================================

const { getSequelize } = require('../models');

const TABLE = 'voice_to_intake_transcript_direct_pipeli_intercom';
let tableReady = false;

async function ensureTable(seq) {
  if (tableReady) return;
  await seq.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id SERIAL PRIMARY KEY,
       champion_email VARCHAR(255) NOT NULL,
       champion_name VARCHAR(255),
       sender VARCHAR(16) NOT NULL,            -- 'champion' | 'owner'
       body TEXT NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT NOW(),
       read_by_champion BOOLEAN NOT NULL DEFAULT FALSE,
       read_by_owner BOOLEAN NOT NULL DEFAULT FALSE
     )`
  );
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_email ON ${TABLE} (champion_email)`);
  // Voice-message support (added later): text rows keep msg_type='text' + NULL audio.
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS msg_type VARCHAR(16) NOT NULL DEFAULT 'text'`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS audio_data BYTEA`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS audio_mime VARCHAR(64)`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS audio_duration INTEGER`);
  // Image/photo support (WhatsApp-style attach/paste/drop): msg_type='image',
  // bytes in image_data, optional caption reused in body. text/audio rows keep NULL image.
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS image_data BYTEA`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS image_mime VARCHAR(64)`);
  // Generic file/document support (CSV, PDF, docs...): msg_type='file',
  // bytes in file_data, original filename kept for download.
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS file_data BYTEA`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS file_mime VARCHAR(128)`);
  await seq.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
  tableReady = true;
}

function norm(email) { return String(email || '').trim().toLowerCase(); }

async function postMessage({ email, name, sender, body, msgType, audioData, audioMime, audioDuration, imageData, imageMime, fileData, fileMime, fileName }) {
  const seq = getSequelize();
  await ensureTable(seq);
  const e = norm(email);
  const readChamp = sender === 'champion';
  const readOwner = sender === 'owner';
  let type = 'text';
  if (msgType === 'audio') type = 'audio';
  else if (msgType === 'image') type = 'image';
  else if (msgType === 'file') type = 'file';
  let text;
  if (type === 'audio') text = '[Voice message]';
  else if (type === 'image') text = (body && String(body).trim()) ? String(body).slice(0, 4000) : '[Photo]';
  else if (type === 'file') text = (body && String(body).trim()) ? String(body).slice(0, 4000) : (fileName ? String(fileName).slice(0, 255) : '[File]');
  else text = String(body).slice(0, 4000);
  // BYTEA must go through real bind params ($1..) so the pg driver sends the
  // Buffer as binary; Sequelize `replacements` does string interpolation and
  // would corrupt the bytes. So everything here uses `bind`.
  const [rows] = await seq.query(
    `INSERT INTO ${TABLE} (champion_email, champion_name, sender, body, msg_type, audio_data, audio_mime, audio_duration, image_data, image_mime, file_data, file_mime, file_name, read_by_champion, read_by_owner, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()) RETURNING id, created_at`,
    {
      bind: [
        e, name || null, sender, text, type,
        type === 'audio' ? (audioData || null) : null,
        type === 'audio' ? (audioMime || 'audio/webm') : null,
        type === 'audio' ? (audioDuration || null) : null,
        type === 'image' ? (imageData || null) : null,
        type === 'image' ? (imageMime || 'image/jpeg') : null,
        type === 'file' ? (fileData || null) : null,
        type === 'file' ? (fileMime || 'application/octet-stream') : null,
        type === 'file' ? (fileName || 'file') : null,
        readChamp, readOwner
      ]
    }
  );
  return rows[0];
}

async function getThread(email) {
  const seq = getSequelize();
  await ensureTable(seq);
  const [rows] = await seq.query(
    `SELECT id, sender, body, created_at, msg_type, audio_mime, audio_duration, image_mime, file_mime, file_name, octet_length(file_data) AS file_size FROM ${TABLE} WHERE champion_email = :email ORDER BY id ASC LIMIT 500`,
    { replacements: { email: norm(email) } }
  );
  return rows;
}

// Returns the raw audio bytes for one message (or null). Includes champion_email
// so the route can authorize champion access to their own thread only.
async function getAudio(id) {
  const seq = getSequelize();
  await ensureTable(seq);
  const [rows] = await seq.query(
    `SELECT id, champion_email, audio_data, audio_mime FROM ${TABLE} WHERE id = :id AND msg_type = 'audio' LIMIT 1`,
    { replacements: { id: parseInt(id, 10) || 0 } }
  );
  return rows[0] || null;
}

// Returns the raw image bytes for one message (or null). Includes champion_email
// so the route can authorize champion access to their own thread only.
async function getImage(id) {
  const seq = getSequelize();
  await ensureTable(seq);
  const [rows] = await seq.query(
    `SELECT id, champion_email, image_data, image_mime FROM ${TABLE} WHERE id = :id AND msg_type = 'image' LIMIT 1`,
    { replacements: { id: parseInt(id, 10) || 0 } }
  );
  return rows[0] || null;
}

// Returns the raw file bytes + name for one message (or null). Includes
// champion_email so the route can authorize champion access to their own thread.
async function getFile(id) {
  const seq = getSequelize();
  await ensureTable(seq);
  const [rows] = await seq.query(
    `SELECT id, champion_email, file_data, file_mime, file_name FROM ${TABLE} WHERE id = :id AND msg_type = 'file' LIMIT 1`,
    { replacements: { id: parseInt(id, 10) || 0 } }
  );
  return rows[0] || null;
}

async function markReadByChampion(email) {
  const seq = getSequelize();
  await ensureTable(seq);
  await seq.query(`UPDATE ${TABLE} SET read_by_champion = TRUE WHERE champion_email = :email AND sender = 'owner' AND read_by_champion = FALSE`, { replacements: { email: norm(email) } });
}

async function markReadByOwner(email) {
  const seq = getSequelize();
  await ensureTable(seq);
  await seq.query(`UPDATE ${TABLE} SET read_by_owner = TRUE WHERE champion_email = :email AND sender = 'champion' AND read_by_owner = FALSE`, { replacements: { email: norm(email) } });
}

async function unreadForChampion(email) {
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    const [rows] = await seq.query(
      `SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE champion_email = :email AND sender = 'owner' AND read_by_champion = FALSE`,
      { replacements: { email: norm(email) } }
    );
    return rows[0] ? rows[0].n : 0;
  } catch (e) { return 0; }
}

async function totalUnreadForOwner() {
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    const [rows] = await seq.query(`SELECT COUNT(*)::int AS n FROM ${TABLE} WHERE sender = 'champion' AND read_by_owner = FALSE`);
    return rows[0] ? rows[0].n : 0;
  } catch (e) { return 0; }
}

async function listThreads() {
  const seq = getSequelize();
  await ensureTable(seq);
  const [rows] = await seq.query(
    `SELECT m.champion_email,
            MAX(m.champion_name) AS champion_name,
            MAX(m.created_at) AS last_at,
            COUNT(*) FILTER (WHERE m.sender = 'champion' AND m.read_by_owner = FALSE) AS unread,
            (SELECT body FROM ${TABLE} m2 WHERE m2.champion_email = m.champion_email ORDER BY id DESC LIMIT 1) AS last_body,
            (SELECT sender FROM ${TABLE} m3 WHERE m3.champion_email = m.champion_email ORDER BY id DESC LIMIT 1) AS last_sender
     FROM ${TABLE} m
     GROUP BY m.champion_email
     ORDER BY last_at DESC
     LIMIT 200`
  );
  return rows.map((r) => ({
    email: r.champion_email,
    name: r.champion_name,
    last_at: r.last_at,
    last_body: r.last_body,
    last_sender: r.last_sender,
    unread: Number(r.unread) || 0
  }));
}

module.exports = {
  postMessage, getThread, getAudio, getImage, getFile, markReadByChampion, markReadByOwner,
  unreadForChampion, totalUnreadForOwner, listThreads, TABLE
};
