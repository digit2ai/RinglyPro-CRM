'use strict';
/**
 * Publica un documento HTML como enlace privado: node scripts/shared-doc.js <archivo.html> "<título>" [AAAA-MM-DD vence]
 * Imprime el enlace UNA sola vez (en la base solo queda el SHA-256 del token). El HTML no se guarda en el repo.
 * Revocar: UPDATE d2_shared_docs SET revoked_at = NOW() WHERE id = <id>;
 */
require('dotenv').config();
const fs = require('fs');
const [, , file, title, vence] = process.argv;
if (!file || !title) { console.error('Uso: node scripts/shared-doc.js <archivo.html> "<título>" [AAAA-MM-DD]'); process.exit(1); }
const docs = require('../src/routes/shared-docs');
(async () => {
  const token = await docs.create({ title, html: fs.readFileSync(file, 'utf8'), expiresAt: vence || null });
  const base = process.env.SHARED_DOCS_BASE_URL || 'https://aiagent.ringlypro.com';
  console.log(base + '/d/' + token);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
