'use strict';
/**
 * Runs the canonical migration on boot, idempotently, under an advisory lock so
 * two instances starting together do not race. Then seeds the first client
 * workspace (Grupo HITTES) and its first project, only if they do not exist.
 */
const fs = require('fs');
const path = require('path');

const SEED_TASKS = [
  ['Reunión de arranque: elegir la obra y la contraparte', 1],
  ['Firmar acuerdo de confidencialidad', 1],
  ['Recibir exporte de Neodata y programa en Excel de la obra', 1],
  ['Medir el punto de partida del proceso actual en Excel', 1],
  ['Generar el programa de obra desde Neodata', 2],
  ['Revisión y aprobación del programa por el planeador', 2],
  ['Captura de avance desde campo con un residente', 3],
  ['Tablero semanal: avance programado contra real', 3],
  ['Borrador de estimación desde el avance capturado', 4],
  ['Costo de CONTPAQi junto al avance', 4],
  ['Presentación de resultados y plan del siguiente bloque', 4]
];

async function init(db) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261018_clientspace_tables.sql'), 'utf8');
  await db.transaction(async (t) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('clientspace_schema'))", { transaction: t });
    await db.query(sql, { transaction: t });
    if (process.env.CLIENTSPACE_SEED !== 'off') {
      await db.query("INSERT INTO cws_workspaces (name,slug) VALUES ('Grupo HITTES','hittes') ON CONFLICT (slug) DO NOTHING", { transaction: t });
      const [[w]] = await db.query("SELECT id FROM cws_workspaces WHERE slug='hittes'", { transaction: t });
      const [[c]] = await db.query('SELECT COUNT(*)::int AS n FROM cws_projects WHERE workspace_id=:w', { replacements: { w: w.id }, transaction: t });
      if (!c.n) {
        const [[p]] = await db.query(`INSERT INTO cws_projects (workspace_id,name,description,status)
          VALUES (:w,'Bloque 1 · Plataforma inteligente de manejo de proyectos',
          'Prueba de concepto de 4 semanas sobre una obra real, cubierta por Digit2AI. Integra Neodata, CONTPAQi, SAP y Excel bajo la capa de inteligencia neural.','planeado') RETURNING id`,
          { replacements: { w: w.id }, transaction: t });
        let pos = 0;
        for (const [title, week] of SEED_TASKS) {
          await db.query('INSERT INTO cws_tasks (workspace_id,project_id,title,assignee,position) VALUES (:w,:p,:t,:a,:pos)',
            { replacements: { w: w.id, p: p.id, t: 'Semana ' + week + ' · ' + title, a: null, pos: ++pos }, transaction: t });
        }
      }
    }
  });
}
module.exports = { init, SEED_TASKS };
