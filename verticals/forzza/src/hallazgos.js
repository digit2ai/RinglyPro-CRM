'use strict';
/**
 * Neural Findings de Forzza: hallazgo -> diagnóstico -> prescripción.
 *
 * REGLAS FIJAS, NO UN MODELO. Cada hallazgo sale de una cifra que ya calcula el tablero (bancos, SICAR,
 * Monte Carlo, catálogos) y la trae como evidencia. Si falta el dato, el hallazgo no se inventa: se pide
 * el dato. Montos en centavos; `impacto` es null cuando no hay una cifra honesta que poner.
 *
 * Entrada (todo opcional): {hoy, efectivo, dias_efectivo, salida_diaria, prob60, prob90, minimo_p50,
 *   reserva, cartera:{total,vencido,fuente}, top_vencidos:[{parte,saldo}], top5, clientes_n,
 *   sin_categoria_pct, meses:[{mes,neto}], datos_hasta, cuentas_sin_datos:[nombre], por_pagar,
 *   hay_cxp_sicar, financiamientos:[{concepto,monto}]}
 */
const SEV = { critico: 0, atencion: 1, oportunidad: 2 };
const mx = (c) => (Number(c) < 0 ? '-$' : '$') + Math.abs(Math.round(Number(c) / 100)).toLocaleString('es-MX');
const pct = (x) => Math.round(x * 100) + '%';
function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

function hallazgos(f) {
  f = f || {};
  const out = [];
  const add = (h) => out.push(h);

  // 1. Liquidez: cuántos días aguanta la caja.
  if (f.dias_efectivo != null && f.salida_diaria) {
    const d = f.dias_efectivo;
    if (d < 15) {
      const falta15 = Math.max(0, Math.round(15 * f.salida_diaria - (f.efectivo || 0)));
      add({ codigo: 'FZ-LIQUIDEZ', severidad: d < 7 ? 'critico' : 'atencion', titulo: 'La caja alcanza para pocos días',
        diagnostico: `Con ${mx(f.efectivo)} en bancos y salidas promedio de ${mx(f.salida_diaria)} al día, el efectivo alcanza para ${d.toFixed(1)} días si no entra nada.`,
        prescripcion: `Junta ${mx(falta15)} más para llegar a 15 días de colchón: primero cobra lo vencido de los clientes más grandes y mueve a después los pagos que se puedan negociar.`,
        evidencia: 'Bancos cargados: saldo de hoy y salida diaria promedio de los meses completos.', impacto: falta15, enlace: { href: '#cxc', label: 'Ver por cobrar' } });
    }
  }

  // 2. Riesgo de quedar en negativo (Monte Carlo).
  if (f.prob60 != null && f.prob60 >= 0.2) {
    add({ codigo: 'FZ-NEGATIVO', severidad: f.prob60 >= 0.35 ? 'critico' : 'atencion', titulo: 'Riesgo alto de quedar en negativo',
      diagnostico: `En ${pct(f.prob60)} de 2,000 futuros posibles el banco queda en negativo antes de 60 días${f.prob90 != null ? ` (${pct(f.prob90)} antes de 90)` : ''}.${f.minimo_p50 != null ? ` El punto más bajo más probable es ${mx(f.minimo_p50)}.` : ''}`,
      prescripcion: 'Define una reserva mínima, programa los pagos grandes después de los días de cobro y revisa en Proyección qué pasa si los clientes pagan 15 días tarde.',
      evidencia: 'Simulación Monte Carlo con lo que de verdad pasó en los bancos.', impacto: f.minimo_p50 != null && f.minimo_p50 < 0 ? -f.minimo_p50 : null, enlace: { href: '#proyeccion', label: 'Abrir Proyección' } });
  }

  // 3. Cartera vencida.
  const cart = f.cartera;
  if (cart && cart.total > 0 && cart.vencido != null) {
    const p = cart.vencido / cart.total;
    if (p >= 0.15) {
      const top = (f.top_vencidos || []).slice(0, 5);
      const sumaTop = top.reduce((a, x) => a + x.saldo, 0);
      add({ codigo: 'FZ-VENCIDO', severidad: p >= 0.3 ? 'critico' : 'atencion', titulo: 'Mucho dinero vencido en la calle',
        diagnostico: `Te deben ${mx(cart.total)} y ${mx(cart.vencido)} ya está vencido (${pct(p)}).`,
        prescripcion: top.length ? `Empieza por estos ${top.length}, que juntos deben ${mx(sumaTop)} vencido: ${top.map((x) => `${x.parte} (${mx(x.saldo)})`).join(', ')}. Mándales recordatorio por WhatsApp desde Por cobrar y pide fecha de pago.`
          : 'Ordena a los clientes por saldo vencido y llama primero a los más grandes; pide una fecha de compromiso.',
        evidencia: cart.fuente === 'sicar' ? 'Reportes de SICAR: Créditos a Clientes (Por Pagar y Vencidos).' : 'Facturas por cobrar capturadas en la app.', impacto: cart.vencido, enlace: { href: '#clientes', label: 'Ver clientes' } });
    }
  }

  // 4. Meses en que salió más de lo que entró.
  const meses = f.meses || [];
  const rojos = meses.filter((m) => m.neto < 0);
  if (meses.length >= 2 && rojos.length) {
    const peor = rojos.slice().sort((a, b) => a.neto - b.neto)[0];
    add({ codigo: 'FZ-FLUJO', severidad: rojos.length >= meses.length / 2 ? 'atencion' : 'oportunidad', titulo: 'Meses en que salió más dinero del que entró',
      diagnostico: `En ${rojos.length} de ${meses.length} meses salió más de lo que entró. El peor fue ${peor.mes}: ${mx(peor.neto)}.`,
      prescripcion: 'Revisa en el Tablero a dónde se fue el dinero ese mes y qué pagos se juntaron. Si fue un pago grande de una vez, sepáralo en partes la próxima vez.',
      evidencia: 'Movimientos de banco por mes, sin traspasos entre tus cuentas.', impacto: -peor.neto, enlace: { href: '#tablero', label: 'Ver mes por mes' } });
  }

  // 5. Concentración de clientes.
  if (f.top5 != null && f.clientes_n >= 5 && f.top5 >= 0.5) {
    add({ codigo: 'FZ-CONCENTRACION', severidad: f.top5 >= 0.7 ? 'atencion' : 'oportunidad', titulo: 'Pocos clientes pesan mucho',
      diagnostico: `Los 5 clientes más grandes son ${pct(f.top5)} de lo cobrado en los últimos 6 meses.`,
      prescripcion: 'Si uno de ellos se atrasa, se siente en la caja. Pon límite de crédito a los más grandes y busca más clientes de tamaño medio.',
      evidencia: 'Depósitos de clientes con nombre en el banco.', impacto: null, enlace: { href: '#clientes', label: 'Ver clientes' } });
  }

  // 6. Datos que faltan o están viejos.
  if (f.datos_hasta && f.hoy) {
    const d = diasEntre(f.datos_hasta, f.hoy);
    if (d > 10) add({ codigo: 'FZ-DATOS-VIEJOS', severidad: 'atencion', titulo: 'Los bancos están atrasados',
      diagnostico: `El último movimiento de banco cargado es del ${f.datos_hasta}, hace ${d} días. Todo lo de hoy es una estimación.`,
      prescripcion: 'Sube los estados de cuenta (o el Excel del banco) hasta hoy en Bancos.', evidencia: 'Fecha del último movimiento cargado.', impacto: null, enlace: { href: '#bancos', label: 'Ir a Bancos' } });
  }
  for (const n of f.cuentas_sin_datos || []) {
    add({ codigo: 'FZ-CUENTA-SIN-DATOS', severidad: 'atencion', titulo: `${n}: sin movimientos cargados`,
      diagnostico: `La cuenta ${n} cuenta como efectivo pero no tiene ningún movimiento cargado, así que aparece en $0.`,
      prescripcion: `Sube el estado de cuenta de ${n} en Bancos, o márcala como "no incluir" si no se usa.`, evidencia: 'Catálogo de cuentas.', impacto: null, enlace: { href: '#bancos', label: 'Ir a Bancos' } });
  }
  if (!f.por_pagar && !f.hay_cxp_sicar) {
    add({ codigo: 'FZ-SIN-CXP', severidad: 'oportunidad', titulo: 'No sabemos cuánto debes a proveedores',
      diagnostico: 'No hay facturas de proveedores cargadas, así que la proyección no ve esos pagos.',
      prescripcion: 'En SICAR genera "Créditos de Proveedores" con Tipo: Sí y súbelo (o déjalo en la carpeta del puente).', evidencia: 'Por pagar vacío.', impacto: null, enlace: { href: '#sicar', label: 'Importar de SICAR' } });
  }
  if (f.reserva == null) {
    add({ codigo: 'FZ-SIN-RESERVA', severidad: 'oportunidad', titulo: 'No hay reserva mínima definida',
      diagnostico: 'Sin una reserva, la app no puede avisarte cuándo el banco baja de lo que quieres tener siempre.',
      prescripcion: 'En Ajustes pon cuánto dinero quieres tener siempre como mínimo en el banco.', evidencia: 'Ajustes.', impacto: null, enlace: { href: '#ajustes', label: 'Ir a Ajustes' } });
  }
  if (f.sin_categoria_pct != null && f.sin_categoria_pct >= 0.3) {
    add({ codigo: 'FZ-SIN-CATEGORIA', severidad: 'oportunidad', titulo: 'La mayoría de los movimientos no tiene categoría',
      diagnostico: `${pct(f.sin_categoria_pct)} del dinero que se mueve en los bancos está como "sin categoría".`,
      prescripcion: 'Clasifica en Bancos los movimientos más grandes (clientes, proveedores, nómina): las gráficas y los hallazgos se vuelven mucho más precisos.', evidencia: 'Movimientos de banco por categoría.', impacto: null, enlace: { href: '#bancos', label: 'Ir a Bancos' } });
  }
  return out.sort((a, b) => SEV[a.severidad] - SEV[b.severidad]);
}
module.exports = { hallazgos };
