'use strict';
/**
 * Aplica un reporte de SICAR (ya leído por sicar.js) a la base de Forzza. Un solo camino para
 * "Revisar" y "Aplicar": la revisión corre exactamente lo mismo dentro de una transacción y la
 * deshace al final, así que lo que se ve en la revisión es lo que pasará.
 *
 * QUÉ HACE CADA REPORTE
 *  - Créditos de Proveedores / a Clientes (con detalle): SICAR es la fuente de los SALDOS.
 *      documento nuevo con saldo         -> se crea (origen 'sicar'), lo ya abonado entra como abono "SICAR"
 *      saldo de SICAR menor que el nuestro -> se registra la diferencia como abono "SICAR" (una sola vez)
 *      saldo igual                        -> sin cambio
 *      saldo de SICAR MAYOR que el nuestro -> NO se toca: se reporta como diferencia para revisar
 *      documento que ya no aparece        -> NO se marca pagado solo: se reporta
 *  - Créditos por Periodo: foto de saldos por persona y su comparación con la app (no crea nada).
 *  - General de Compras / Ventas, Abonos: historial para análisis (compras, gastos, ventas por mes).
 *    No mueve saldos: los saldos los da el reporte de créditos, para no contar un abono dos veces.
 */
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 40);
const pesos = (c) => Math.round(c) / 100;

async function aplicar(ctx, rep, meta, t) {
  const { exec, sel, one, tenant, user, waNumero, config } = ctx;
  const q = (s, r) => sel(s, { ...(r || {}), t: tenant }, t);
  const run = (s, r) => exec(s, { ...(r || {}), t: tenant }, t);
  const res = { tipo: rep.tipo, nombre: rep.nombre, filtros: rep.filtros, cuadra: rep.cuadra, total_impreso: rep.total_impreso, total_leido: rep.total_leido,
    errores: rep.errores.slice(0, 50), n_errores: rep.errores.length, partes_que_no_cuadran: rep.partes_que_no_cuadran || [], conteo: {}, detalle: [] };
  const cuenta = (k) => { res.conteo[k] = (res.conteo[k] || 0) + 1; };
  const nota = (o) => { if (res.detalle.length < 300) res.detalle.push(o); };

  const [imp] = await run(`INSERT INTO fz_sicar_imports (tenant_id,tipo,archivo,sha256,origen,desde,hasta,filas,cuadra,total_impreso,total_leido,created_by)
    VALUES (:t,:tipo,:a,:h,:o,:d,:ha,:f,:c,:ti,:tl,:u) RETURNING id`, { tipo: rep.tipo, a: meta.archivo, h: meta.sha256, o: meta.origen, d: rep.filtros.desde || null,
    ha: rep.filtros.hasta || null, f: rep.filas.length, c: rep.cuadra, ti: rep.total_impreso == null ? null : pesos(rep.total_impreso), tl: rep.total_leido == null ? null : pesos(rep.total_leido), u: user.id });
  const importId = imp[0].id;
  res.import_id = importId;

  const lado = rep.parte === 'proveedor' ? 'cxp' : 'cxc';
  const T = lado === 'cxc'
    ? { doc: 'fz_cxc', pagos: 'fz_cxc_abonos', fk: 'cxc_id', parte: 'cliente_id', partes: 'fz_clientes', dias: 'dias_credito_clientes' }
    : { doc: 'fz_cxp', pagos: 'fz_cxp_pagos', fk: 'cxp_id', parte: 'proveedor_id', partes: 'fz_proveedores', dias: 'dias_credito_proveedores' };

  async function parteId(nombre, num, telefono) {
    await run(`INSERT INTO ${T.partes} (tenant_id,nombre,sicar_num) VALUES (:t,:n,:s) ON CONFLICT DO NOTHING`, { n: nombre, s: num || null });
    const p = (await q(`SELECT id, telefono, sicar_num FROM ${T.partes} WHERE tenant_id=:t AND LOWER(nombre)=LOWER(:n)`, { n: nombre }))[0];
    const tel = telefono ? waNumero(telefono) : null;
    if ((!p.telefono && tel) || (!p.sicar_num && num)) await run(`UPDATE ${T.partes} SET telefono=COALESCE(telefono,:tel), sicar_num=COALESCE(sicar_num,:s) WHERE id=:id AND tenant_id=:t`,
      { tel: tel ? '+' + tel : null, s: num || null, id: p.id });
    return p.id;
  }

  /* ── créditos SIN detalle ("Tipo: No"): solo foto de saldos por persona; no crea ni paga nada ── */
  if (rep.solo_saldos) {
    const app = await q(`SELECT LOWER(p.nombre) AS n, SUM(x.total - COALESCE((SELECT SUM(a.monto) FROM ${T.pagos} a WHERE a.${T.fk}=x.id AND a.tenant_id=x.tenant_id),0)) AS s
      FROM ${T.doc} x JOIN ${T.partes} p ON p.id=x.${T.parte} AND p.tenant_id=x.tenant_id WHERE x.tenant_id=:t AND x.estado NOT IN ('pagada','cancelada') GROUP BY LOWER(p.nombre)`);
    const mapa = new Map(app.map((r) => [r.n, Math.round(Number(r.s) * 100)]));
    for (const p of rep.partes || []) {
      await run(`INSERT INTO fz_sicar_saldos (tenant_id,import_id,lado,parte,num,saldo,vista) VALUES (:t,:i,:l,:p,:n,:s,:v)`,
        { i: importId, l: lado, p: p.parte, n: p.num || null, s: pesos(p.saldo || 0), v: rep.vista });
      cuenta('saldo_guardado');
      if (rep.vista === 'vencidos') continue; // un reporte de vencidos no es el saldo total: no se compara
      const nuestro = mapa.has(p.parte.toLowerCase()) ? mapa.get(p.parte.toLowerCase()) : null;
      if (nuestro != null && nuestro !== p.saldo) nota({ parte: p.parte, saldo_sicar: p.saldo, saldo_app: nuestro, resultado: 'diferencia' });
    }
    res.solo_saldos = true;
    res.aviso = 'Reporte sin detalle de documentos: se guardó el saldo de cada persona. Para cargar factura por factura (folio, fecha y vencimiento), genéralo en SICAR con "Tipo: Sí".';
  }

  /* ── créditos con detalle: sincroniza saldos ── */
  if (!rep.solo_saldos && (rep.tipo === 'creditos_proveedores' || rep.tipo === 'creditos_clientes')) {
    const cfg = await config(tenant);
    const vistos = new Set();
    const corte = rep.filtros.hasta || meta.hoy;
    for (const f of rep.filas) {
      const pid = await parteId(f.parte, f.num, f.celular || f.telefono);
      let d = f.folio
        ? (await q(`SELECT * FROM ${T.doc} WHERE tenant_id=:t AND ${T.parte}=:p AND folio=:f`, { p: pid, f: f.folio }))[0]
        : (await q(`SELECT * FROM ${T.doc} WHERE tenant_id=:t AND ${T.parte}=:p AND folio IS NULL AND fecha=:fe AND total=:to`, { p: pid, fe: f.fecha, to: pesos(f.total) }))[0];
      const etiqueta = { parte: f.parte, folio: f.folio || '(sin folio)', saldo_sicar: f.saldo };
      if (!d) {
        if (f.saldo <= 0) { cuenta('pagado_en_sicar'); continue; }
        const venc = f.vencimiento && f.vencimiento >= f.fecha ? f.vencimiento
          : new Date(Date.parse(f.fecha + 'T00:00:00Z') + (cfg[T.dias] || 30) * 86400000).toISOString().slice(0, 10);
        const [nd] = await run(`INSERT INTO ${T.doc} (tenant_id,${T.parte},folio,fecha,vencimiento,total,origen,created_by,notas)
          VALUES (:t,:p,:f,:fe,:v,:to,'sicar',:u,:n) RETURNING id`, { p: pid, f: f.folio, fe: f.fecha, v: venc, to: pesos(f.total), u: user.id,
          n: f.vencimiento ? null : 'SICAR no traía vencimiento: se calculó con los días de crédito de Ajustes.' });
        d = { id: nd[0].id };
        const ya = f.total - f.saldo;
        if (ya > 0) await run(`INSERT INTO ${T.pagos} (tenant_id,${T.fk},fecha,monto,nota,ref_externa,created_by) VALUES (:t,:id,:fe,:m,'Abonado según SICAR',:r,:u)`,
          { id: d.id, fe: corte, m: pesos(ya), r: `sicar-ini:${lado}:${d.id}`, u: user.id });
        vistos.add(d.id); cuenta('nuevo'); nota({ ...etiqueta, resultado: 'nuevo' });
        continue;
      }
      vistos.add(d.id);
      if (d.estado === 'cancelada') { cuenta('cancelado_en_app'); nota({ ...etiqueta, resultado: 'cancelado_en_app' }); continue; }
      const [s] = await q(`SELECT COALESCE(SUM(monto),0) AS s FROM ${T.pagos} WHERE tenant_id=:t AND ${T.fk}=:id`, { id: d.id });
      const nuestro = Math.max(0, Math.round(Number(d.total) * 100) - Math.round(Number(s.s) * 100));
      if (Math.round(Number(d.total) * 100) !== f.total) nota({ ...etiqueta, resultado: 'total_distinto', total_app: Math.round(Number(d.total) * 100), total_sicar: f.total });
      if (f.saldo === nuestro) { cuenta('sin_cambio'); continue; }
      if (f.saldo > nuestro) { cuenta('diferencia'); nota({ ...etiqueta, saldo_app: nuestro, resultado: 'sicar_mayor' }); continue; }
      const dif = nuestro - f.saldo;
      const [ins] = await run(`INSERT INTO ${T.pagos} (tenant_id,${T.fk},fecha,monto,nota,ref_externa,created_by) VALUES (:t,:id,:fe,:m,'Abono registrado en SICAR',:r,:u)
        ON CONFLICT DO NOTHING RETURNING id`, { id: d.id, fe: corte, m: pesos(dif), r: `sicar-corte:${lado}:${d.id}:${f.saldo}:${corte}`, u: user.id });
      if (!ins.length) { cuenta('sin_cambio'); continue; }
      if (f.saldo === 0) await run(`UPDATE ${T.doc} SET estado='pagada' WHERE id=:id AND tenant_id=:t`, { id: d.id });
      cuenta('actualizado'); nota({ ...etiqueta, saldo_app: nuestro, resultado: f.saldo === 0 ? 'pagado' : 'abono' });
    }
    // Lo que la app tiene abierto de SICAR y el reporte ya no trae: solo se avisa (si el reporte trae a todos).
    const filtroParte = String(rep.filtros[rep.parte] || 'Todos');
    if (/todos/i.test(filtroParte) && !/pagad|vencid/i.test(String(rep.filtros.estado || ''))) {
      const abiertos = await q(`SELECT x.id, x.folio, p.nombre FROM ${T.doc} x JOIN ${T.partes} p ON p.id=x.${T.parte} AND p.tenant_id=x.tenant_id
        WHERE x.tenant_id=:t AND x.origen='sicar' AND x.estado NOT IN ('pagada','cancelada')`);
      for (const a of abiertos) if (!vistos.has(a.id)) { cuenta('ya_no_aparece'); nota({ parte: a.nombre, folio: a.folio || '(sin folio)', resultado: 'ya_no_aparece' }); }
    }
    for (const p of rep.partes || []) {
      await run(`INSERT INTO fz_sicar_saldos (tenant_id,import_id,lado,parte,num,saldo,vista) VALUES (:t,:i,:l,:p,:n,:s,:v)`, { i: importId, l: lado, p: p.parte, n: p.num, s: pesos(p.saldo || 0), v: rep.vista || null });
    }
  }

  /* ── por periodo: foto de saldos y comparación ── */
  if (rep.tipo === 'periodo_clientes' || rep.tipo === 'periodo_proveedores') {
    const app = await q(`SELECT LOWER(p.nombre) AS n, SUM(x.total - COALESCE((SELECT SUM(a.monto) FROM ${T.pagos} a WHERE a.${T.fk}=x.id AND a.tenant_id=x.tenant_id),0)) AS s
      FROM ${T.doc} x JOIN ${T.partes} p ON p.id=x.${T.parte} AND p.tenant_id=x.tenant_id WHERE x.tenant_id=:t AND x.estado NOT IN ('pagada','cancelada') GROUP BY LOWER(p.nombre)`);
    const mapa = new Map(app.map((r) => [r.n, Math.round(Number(r.s) * 100)]));
    for (const f of rep.filas) {
      await run(`INSERT INTO fz_sicar_saldos (tenant_id,import_id,lado,parte,num,saldo,d0,d31,d61,d91,d121) VALUES (:t,:i,:l,:p,:n,:s,:a,:b,:c,:d,:e)`,
        { i: importId, l: lado, p: f.parte, n: f.num, s: pesos(f.total), a: pesos(f.d0), b: pesos(f.d31), c: pesos(f.d61), d: pesos(f.d91), e: pesos(f.d121) });
      const nuestro = mapa.has(f.parte.toLowerCase()) ? mapa.get(f.parte.toLowerCase()) : null;
      if (nuestro === f.total) cuenta('coincide');
      else { cuenta(nuestro == null ? 'no_esta_en_app' : 'diferencia'); nota({ parte: f.parte, saldo_sicar: f.total, saldo_app: nuestro, resultado: nuestro == null ? 'no_esta_en_app' : 'diferencia' }); }
    }
  }

  /* ── historial para análisis ── */
  const HIST = { compras_general: 'compra', ventas_general: 'venta', abonos_clientes: 'abono_cliente', abonos_proveedores: 'abono_proveedor' };
  if (HIST[rep.tipo]) {
    const vistos = new Map();
    for (const f of rep.filas) {
      const base = [HIST[rep.tipo], f.doc || f.doc_ori || '', f.folio || '', f.fecha, (f.parte || '').toLowerCase(), f.est || '', f.total, f.caja || ''].join('|');
      const k = vistos.get(base) || 0; vistos.set(base, k + 1); // dos renglones idénticos son dos documentos
      const [r] = await run(`INSERT INTO fz_sicar_docs (tenant_id,tipo,doc,folio,fecha,parte,caja,est,total,clave,import_id)
        VALUES (:t,:ti,:d,:f,:fe,:p,:c,:e,:to,:k,:i) ON CONFLICT DO NOTHING RETURNING id`,
        { ti: HIST[rep.tipo], d: f.doc || f.doc_ori || null, f: f.folio, fe: f.fecha, p: f.parte || null, c: f.caja, e: f.est || null, to: pesos(f.total), k: sha(base + '|' + k), i: importId });
      cuenta(r.length ? 'nuevo' : 'ya_estaba');
    }
    if (rep.tipo === 'compras_general' || rep.tipo === 'ventas_general') {
      const porDoc = {};
      for (const f of rep.filas) if (f.est === 'V' || f.doc === 'DEV') porDoc[f.doc || '?'] = (porDoc[f.doc || '?'] || 0) + f.total;
      res.por_documento = porDoc;
      res.cancelados = rep.filas.filter((f) => f.est && f.est !== 'V' && f.doc !== 'DEV').length;
    }
  }

  await run('UPDATE fz_sicar_imports SET resumen=:r WHERE id=:i AND tenant_id=:t', { i: importId, r: JSON.stringify({ conteo: res.conteo, cuadra: res.cuadra, n_errores: res.n_errores, vista: rep.vista || null, solo_saldos: !!rep.solo_saldos }) });
  return res;
}

module.exports = { aplicar };
