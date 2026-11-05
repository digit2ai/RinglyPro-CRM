'use strict';
// SIT de /:slug/api/documentos. Sin base de datos ni llaves: el modulo shared
// se reemplaza por uno en memoria que LEE los predicados del SQL (chamber_id,
// deleted_at), para que la prueba falle si la consulta real pierde uno.
const path = require('path');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const SECRET = 'sit-secret';
const sharedPath = path.join(__dirname, '../src/routes/unified-chamber/lib/shared.js');
const members = { 1: { id: 1, chamber_id: 104, access_level: 'superadmin', status: 'active', first_name: 'Ana', last_name: 'Admin' },
                  2: { id: 2, chamber_id: 104, access_level: 'member', status: 'active', first_name: 'Sol', last_name: 'Socio' },
                  3: { id: 3, chamber_id: 104, access_level: 'member', status: 'inactive' },
                  4: { id: 4, chamber_id: 200, access_level: 'superadmin', status: 'active' } };
const docs = [];
const seenSql = [];
function needs(sql, frag) { if (!sql.includes(frag)) throw new Error('SQL sin ' + frag + ': ' + sql.slice(0, 80)); }
const sequelize = { async query(sql, opts = {}) {
  const r = opts.replacements || {}; seenSql.push(sql);
  if (/CREATE (TABLE|INDEX)/.test(sql)) return [];
  if (/FROM members WHERE chamber_id = :c AND id = :m/.test(sql)) {
    const m = members[r.m]; return m && m.chamber_id === r.c ? [m] : [];
  }
  if (/^\s*SELECT d\.id/.test(sql)) {
    needs(sql, 'd.chamber_id = :c'); needs(sql, 'd.deleted_at IS NULL');
    return docs.filter(d => d.chamber_id === r.c && !d.deleted_at && (!r.q || d.title.toLowerCase().includes(r.q.toLowerCase())))
      .map(d => { const m = members[d.uploaded_by] || {}; return { ...d, data: undefined, uploaded_by_name: (m.first_name || '') + ' ' + (m.last_name || '') }; });
  }
  if (/INSERT INTO chamber_documents/.test(sql)) {
    const d = { id: docs.length + 1, chamber_id: r.c, title: r.title, description: r.description, filename: r.filename, kind: r.kind,
                mime: r.mime, size_bytes: r.size, data: r.data, uploaded_by: r.by, created_at: new Date().toISOString(), deleted_at: null };
    docs.push(d); return [d];
  }
  if (/SELECT filename, kind, mime, data/.test(sql)) {
    needs(sql, 'chamber_id = :c'); needs(sql, 'deleted_at IS NULL');
    return docs.filter(d => d.id === r.id && d.chamber_id === r.c && !d.deleted_at);
  }
  if (/UPDATE chamber_documents SET title/.test(sql)) {
    needs(sql, 'chamber_id = :c');
    const d = docs.find(x => x.id === r.id && x.chamber_id === r.c && !x.deleted_at); if (!d) return [];
    d.title = r.title; d.description = r.description; return [{ id: d.id }];
  }
  if (/UPDATE chamber_documents SET deleted_at/.test(sql)) {
    needs(sql, 'chamber_id = :c');
    const d = docs.find(x => x.id === r.id && x.chamber_id === r.c && !x.deleted_at); if (!d) return [];
    d.deleted_at = new Date(); return [{ id: d.id }];
  }
  throw new Error('SQL inesperado: ' + sql.slice(0, 80));
} };
require.cache[sharedPath] = { id: sharedPath, filename: sharedPath, loaded: true, exports: {
  sequelize, QueryTypes: { SELECT: 'SELECT' },
  authMiddleware(req, res, next) {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    try { const d = jwt.verify(t, SECRET); if (d.chamber_id !== req.chamber_id) return res.status(403).json({});
      req.member = d; req.member.id = d.member_id; next(); } catch (e) { res.status(401).json({}); }
  } } };
const docsRouter = require('../src/routes/unified-chamber/documentos');
const { detectKind } = docsRouter._test;

const app = express();
const CH = { 'cv-105': 104, 'cv-1': 200 };
app.use('/:chamber_slug/api', (req, res, next) => { req.chamber_id = CH[req.params.chamber_slug]; req.chamber = { slug: req.params.chamber_slug }; next(); },
  express.json(), express.Router({ mergeParams: true }).use('/documentos', docsRouter));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }
const tok = (id, ch) => jwt.sign({ member_id: id, chamber_id: ch, access_level: 'superadmin' }, SECRET);

function multipart(files, fields = {}) {
  const b = '----sit' + Date.now(); const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'));
    parts.push(f.buf); parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + b };
}

(async () => {
  // Deteccion por bytes
  ok(detectKind(Buffer.from('%PDF-1.7 x'), 'a.pdf') === 'pdf', 'pdf');
  ok(detectKind(Buffer.from('%PDF-1.7 x'), 'a.txt') === 'pdf', 'pdf aunque el nombre mienta');
  ok(detectKind(Buffer.concat([Buffer.from([0x50, 0x4B, 3, 4]), Buffer.from('....word/document.xml')]), 'a.docx') === 'docx', 'docx');
  ok(detectKind(Buffer.concat([Buffer.from([0x50, 0x4B, 3, 4]), Buffer.from('xl/workbook.xml')]), 'a.docx') === null, 'xlsx renombrado a docx se rechaza');
  ok(detectKind(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 1, 2]), 'a.doc') === 'doc', 'doc');
  ok(detectKind(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 1, 2]), 'a.xls') === null, 'OLE no-doc se rechaza');
  ok(detectKind(Buffer.from('Hola, ñandú y tildes á é'), 'n.txt') === 'txt', 'texto utf8');
  ok(detectKind(Buffer.from([0x4D, 0x5A, 0x90, 0, 3]), 'virus.pdf') === null, 'binario disfrazado de pdf se rechaza');
  ok(detectKind(Buffer.from([0x89, 0x50, 0x4E, 0x47]), 'img.pdf') === null, 'png se rechaza');
  ok(detectKind(Buffer.from('{\\rtf1 hola}'), 'a.rtf') === 'rtf', 'rtf');

  const srv = http.createServer(app).listen(0); const port = srv.address().port;
  const call = (method, p, { token, body, type, json } = {}) => new Promise((res) => {
    const headers = {}; if (token) headers.Authorization = 'Bearer ' + token;
    let payload = body; if (json) { payload = Buffer.from(JSON.stringify(json)); headers['Content-Type'] = 'application/json'; }
    if (type) headers['Content-Type'] = type;
    const r = http.request({ port, path: p, method, headers }, (resp) => { const ch = []; resp.on('data', c => ch.push(c));
      resp.on('end', () => { const buf = Buffer.concat(ch); let j = null; try { j = JSON.parse(buf.toString()); } catch (e) {} res({ status: resp.statusCode, headers: resp.headers, buf, json: j }); }); });
    if (payload) r.write(payload); r.end();
  });

  const A = tok(1, 104), M = tok(2, 104), X = tok(3, 104), O = tok(4, 200);
  ok((await call('GET', '/cv-105/api/documentos')).status === 401, 'sin sesion = 401');
  ok((await call('GET', '/cv-1/api/documentos', { token: O })).status === 404, 'otra camara = 404');
  ok((await call('GET', '/cv-105/api/documentos', { token: O })).status === 403, 'token de otra camara = 403');
  ok((await call('GET', '/cv-105/api/documentos', { token: X })).status === 403, 'miembro inactivo = 403');

  let mp = multipart([{ name: 'plan.pdf', buf: Buffer.from('%PDF-1.4 contenido') }]);
  ok((await call('POST', '/cv-105/api/documentos', { token: M, body: mp.body, type: mp.type })).status === 403, 'socio no sube');

  mp = multipart([{ name: 'Estatutos 2026.pdf', buf: Buffer.from('%PDF-1.4 estatutos') },
                  { name: 'acta.docx', buf: Buffer.concat([Buffer.from([0x50, 0x4B, 3, 4]), Buffer.from('word/document.xml')]) },
                  { name: 'notas.txt', buf: Buffer.from('Reunión de socios') },
                  { name: 'malo.pdf', buf: Buffer.from([0x4D, 0x5A, 0, 1]) }], { description: 'Documentos fundacionales' });
  let r = await call('POST', '/cv-105/api/documentos', { token: A, body: mp.body, type: mp.type });
  ok(r.status === 201 && r.json.saved === 3, 'admin sube 3 de 4');
  ok(r.json.results.find(x => x.filename === 'malo.pdf' && !x.ok), 'el falso pdf se reporta por nombre');

  r = await call('GET', '/cv-105/api/documentos', { token: M });
  ok(r.status === 200 && r.json.data.length === 3, 'socio ve los 3');
  ok(r.json.can_manage === false, 'socio no puede gestionar');
  ok(!JSON.stringify(r.json).includes('estatutos"') && r.json.data.every(d => d.data === undefined), 'la lista no lleva bytes');
  ok(r.json.data.some(d => d.title === 'Estatutos 2026'), 'titulo desde el nombre');
  ok((await call('GET', '/cv-105/api/documentos', { token: A })).json.can_manage === true, 'admin puede gestionar');

  const pdf = r.json.data.find(d => d.kind === 'pdf');
  r = await call('GET', `/cv-105/api/documentos/${pdf.id}/file`, { token: M });
  ok(r.status === 200 && r.buf.toString().startsWith('%PDF'), 'socio abre el pdf');
  ok(/inline/.test(r.headers['content-disposition']) && r.headers['x-content-type-options'] === 'nosniff', 'pdf inline + nosniff');
  ok(/sandbox/.test(r.headers['content-security-policy'] || ''), 'csp sandbox');
  const word = (await call('GET', '/cv-105/api/documentos', { token: M })).json.data.find(d => d.kind === 'docx');
  r = await call('GET', `/cv-105/api/documentos/${word.id}/file`, { token: M });
  ok(/attachment/.test(r.headers['content-disposition']), 'word se descarga');
  ok((await call('GET', `/cv-1/api/documentos/${pdf.id}/file`, { token: O })).status === 404, 'otra camara no abre el archivo');
  ok((await call('GET', `/cv-105/api/documentos/abc/file`, { token: M })).status === 404, 'id invalido = 404');

  ok((await call('PATCH', `/cv-105/api/documentos/${pdf.id}`, { token: M, json: { title: 'x' } })).status === 403, 'socio no edita');
  ok((await call('PATCH', `/cv-105/api/documentos/${pdf.id}`, { token: A, json: { title: '  ' } })).status === 400, 'titulo vacio = 400');
  ok((await call('PATCH', `/cv-105/api/documentos/${pdf.id}`, { token: A, json: { title: 'Estatutos vigentes' } })).status === 200, 'admin edita');
  ok((await call('GET', '/cv-105/api/documentos?q=vigentes', { token: M })).json.data.length === 1, 'busqueda');

  ok((await call('DELETE', `/cv-105/api/documentos/${pdf.id}`, { token: M })).status === 403, 'socio no retira');
  ok((await call('DELETE', `/cv-105/api/documentos/${pdf.id}`, { token: A })).status === 200, 'admin retira');
  ok((await call('GET', `/cv-105/api/documentos/${pdf.id}/file`, { token: M })).status === 404, 'retirado ya no se abre');
  ok((await call('GET', '/cv-105/api/documentos', { token: M })).json.data.length === 2, 'retirado sale de la lista');
  ok(docs.find(d => d.id === pdf.id).deleted_at, 'borrado logico (la fila sigue)');

  // Estructura: el router esta montado y la UI lo usa.
  const fs = require('fs');
  ok(/router\.use\('\/documentos'/.test(fs.readFileSync(path.join(__dirname, '../src/routes/unified-chamber/index.js'), 'utf8')), 'montado en el router unificado');
  const ui = fs.readFileSync(path.join(__dirname, '../public/dashboard/index.html'), 'utf8');
  ok(/data-page="docs"/.test(ui) && /docs:renderDocs/.test(ui), 'enlace y pagina en el panel');
  ok(/addEventListener\('drop'/.test(ui), 'arrastrar y soltar');

  srv.close();
  console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILED' : 'passed'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
