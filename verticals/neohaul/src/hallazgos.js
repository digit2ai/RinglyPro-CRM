'use strict';
/**
 * Neural Findings de NeoHaul: hallazgo -> diagnóstico -> prescripción. PURO: sin base de datos ni modelo.
 *
 * REGLAS FIJAS, NO UN MODELO. Cada hallazgo sale de una cifra que ya calculó saludDe() y la trae como
 * evidencia. Si falta un dato, el hallazgo no se inventa: se pide el dato. Montos en centavos; `impacto`
 * es null cuando no hay una cifra honesta que poner.
 *
 * Entrada: el objeto de saludDe() + extra {clientes_n, nominas_4s, obras_sin_ingeniero:[nombre]}.
 */
const SEV = { critico: 0, atencion: 1, oportunidad: 2 };
const mx = (c) => (Number(c) < 0 ? '-$' : '$') + Math.abs(Math.round(Number(c) / 100)).toLocaleString('es-MX');
const pct = (x) => Math.round(x * 100) + '%';

function hallazgos(s, extra) {
  s = s || {}; extra = extra || {};
  const out = [], add = (h) => out.push(h);
  const mc = s.montecarlo, u8 = s.ultimas_8 || {}, cart = s.cartera || {}, hist = s.semanas || [];
  const conViajes = hist.filter((w) => w.ingresos > 0);

  if (!conViajes.length) {
    add({ codigo: 'NH-SIN-VIAJES', severidad: 'critico', titulo: 'Aún no hay viajes capturados',
      diagnostico: 'Sin viajes no hay ingresos, así que el tablero no puede medir margen, riesgo ni uso de camiones.',
      prescripcion: 'Captura los viajes con la foto del ticket (Viajes) o importa el Excel de la planta. Con 4 semanas ya corre la simulación.',
      evidencia: 'Tabla de viajes vacía en las últimas 26 semanas.', impacto: null, enlace: { href: '#viajes', label: 'Ir a Viajes' } });
  }

  // 1. Riesgo de ir en pérdida (Monte Carlo).
  if (mc && mc.prob_perdida_en[8] != null && mc.prob_perdida_en[8] >= 0.15) {
    const p8 = mc.prob_perdida_en[8];
    add({ codigo: 'NH-PERDIDA', severidad: p8 >= 0.35 ? 'critico' : 'atencion', titulo: 'Riesgo de terminar en pérdida',
      diagnostico: `En ${pct(p8)} de ${mc.caminos.toLocaleString('es-MX')} futuros posibles la operación acumula pérdida en 8 semanas (${pct(mc.prob_perdida_en[4])} en 4). En un mal caso (1 de 20) el resultado a 13 semanas es ${mx(mc.final.p5)}.`,
      prescripcion: 'Revisa las semanas rojas de "Semana por semana": casi siempre son semanas con pocos viajes y un pago grande. Mueve los pagos grandes a semanas con más viajes y no dejes camiones parados.',
      evidencia: `Simulación con ${mc.semanas_historia} semanas reales de viajes y costos.`, impacto: mc.final.p5 < 0 ? -mc.final.p5 : null, enlace: { href: '#tablero', label: 'Ver semana por semana' } });
  }

  // 2. Margen.
  if (u8.ingresos > 0 && u8.costos > 0) {
    const m = u8.neto / u8.ingresos;
    if (m < 0.12) add({ codigo: 'NH-MARGEN', severidad: m < 0 ? 'critico' : 'atencion', titulo: m < 0 ? 'La operación pierde dinero' : 'Margen apretado',
      diagnostico: `En las últimas 8 semanas entraron ${mx(u8.ingresos)} y salieron ${mx(u8.costos)}: margen de ${pct(m)}.`,
      prescripcion: 'Compara en "Uso de cada camión" el diésel contra el ingreso de cada unidad y revisa las tarifas por tonelada: un peso más por tonelada pesa más que cualquier ahorro.',
      evidencia: 'Viajes antes de IVA contra gastos, diésel por carga, nómina y taller.', impacto: u8.neto < 0 ? -u8.neto : null, enlace: { href: '#catalogos', label: 'Ver tarifas' } });
  }

  // 3. Semanas en pérdida.
  const rojas = conViajes.filter((w) => w.neto < 0);
  if (conViajes.length >= 4 && rojas.length) {
    const peor = rojas.slice().sort((a, b) => a.neto - b.neto)[0];
    add({ codigo: 'NH-SEMANAS-ROJAS', severidad: rojas.length >= conViajes.length / 3 ? 'atencion' : 'oportunidad', titulo: 'Semanas en que salió más de lo que entró',
      diagnostico: `${rojas.length} de ${conViajes.length} semanas terminaron en pérdida. La peor fue la del ${peor.semana}: ${mx(peor.neto)} (ingresos ${mx(peor.ingresos)}, costos ${mx(peor.costos)}).`,
      prescripcion: 'Abre esa semana en el Tablero: si hubo pocos viajes, revisa qué camiones se quedaron sin pedido; si hubo un pago grande, sepáralo en partes.',
      evidencia: 'Ingresos y costos agrupados por semana.', impacto: -peor.neto, enlace: { href: '#tablero', label: 'Ver la semana' } });
  }

  // 4. Cartera vencida.
  if (cart.total > 0 && cart.vencido > 0) {
    const p = cart.vencido / cart.total;
    if (p >= 0.1) add({ codigo: 'NH-VENCIDO', severidad: p >= 0.3 ? 'critico' : 'atencion', titulo: 'Facturas vencidas sin cobrar',
      diagnostico: `HTR debe ${mx(cart.total)} en facturas emitidas y ${mx(cart.vencido)} (${pct(p)}) pasaron los ${cart.plazo} días de crédito.`,
      prescripcion: 'Manda a la auxiliar de HTR la lista de folios vencidos desde Facturas y pide fecha de pago por escrito.',
      evidencia: 'Facturas emitidas contra su fecha de emisión.', impacto: cart.vencido, enlace: { href: '#facturas', label: 'Ver facturas' } });
  }

  // 5. Trabajo hecho sin facturar.
  const prom = s.promedio_semanal_ingresos || 0;
  if (prom > 0 && s.detenido > 1.5 * prom) {
    const sem = s.detenido / prom;
    const paso = (s.embudo || []).slice(0, 4).sort((a, b) => b.monto - a.monto)[0];
    add({ codigo: 'NH-DETENIDO', severidad: sem >= 3 ? 'critico' : 'atencion', titulo: 'Mucho trabajo hecho que no se ha facturado',
      diagnostico: `${mx(s.detenido)} de viajes ya hechos siguen sin factura: ${sem.toFixed(1)} semanas de ingreso. Donde más se atora: "${paso.nombre}" (${mx(paso.monto)}).`,
      prescripcion: 'Confirma los viajes pendientes, arma las estimaciones de la semana y pide el folio de las requisiciones aprobadas. Cada semana de atraso es una semana más sin cobrar.',
      evidencia: 'Del viaje al cobro: viajes, estimaciones y requisiciones.', impacto: s.detenido, enlace: { href: '#estimaciones', label: 'Ver estimaciones' } });
  }

  // 6. Cobras más lento de lo que pagas.
  if (s.dso != null && s.dpo != null && s.dso > s.dpo + 7) {
    add({ codigo: 'NH-CICLO', severidad: 'atencion', titulo: 'Pagas mucho antes de cobrar',
      diagnostico: `HTR paga en ${s.dso} días en promedio y NeoHaul paga a proveedores en ${s.dpo}: financias ${Math.round(s.dso - s.dpo)} días de operación con tu propio dinero.`,
      prescripcion: 'Negocia con los proveedores grandes (diésel, aliados) pagar a 30 días, o pide a HTR que la estimación se pague por semana.',
      evidencia: 'Facturas cobradas y gastos pagados de los últimos 180 días.', impacto: null, enlace: { href: '#gastos', label: 'Ver gastos' } });
  }

  // 7. Dependencia de un solo cliente / una obra.
  if (extra.clientes_n === 1 && conViajes.length) {
    add({ codigo: 'NH-UN-CLIENTE', severidad: 'oportunidad', titulo: 'Todo el ingreso viene de un solo cliente',
      diagnostico: 'Todas las obras son de HTR. Si HTR se atrasa en pagar o frena obras, se siente en toda la operación.',
      prescripcion: 'Usa los días y camiones libres (ver "Uso de cada camión") para ofrecer fletes a otro cliente.',
      evidencia: 'Catálogo de clientes con obras activas.', impacto: null, enlace: { href: '#catalogos', label: 'Ver clientes' } });
  }
  const conc = s.concentracion;
  if (conc && conc.n >= 2 && conc.mayor >= 0.6) {
    add({ codigo: 'NH-UNA-OBRA', severidad: conc.mayor >= 0.8 ? 'atencion' : 'oportunidad', titulo: 'Una obra pesa demasiado',
      diagnostico: `${conc.mayores[0].nombre} es ${pct(conc.mayor)} del ingreso de las últimas 12 semanas.`,
      prescripcion: 'Cuando esa obra termine, el ingreso cae de golpe. Pide a HTR el calendario de sus próximas obras.',
      evidencia: 'Viajes por obra, 12 semanas.', impacto: null, enlace: { href: '#viajes', label: 'Ver viajes' } });
  }

  // 8. Camiones: parados y diésel alto.
  const propios = (s.camiones || []).filter((c) => c.empresa === 'NeoHaul');
  const bajos = propios.filter((c) => conViajes.length && c.uso < 0.5);
  if (bajos.length) add({ codigo: 'NH-CAMION-PARADO', severidad: 'atencion', titulo: bajos.length === 1 ? `${bajos[0].unidad} trabaja pocos días` : `${bajos.length} camiones propios trabajan pocos días`,
    diagnostico: bajos.map((c) => `${c.unidad}: ${c.dias} de 24 días con viaje`).join('; ') + '.',
    prescripcion: 'Un camión parado sigue pagando seguro, financiamiento y chofer. Asígnalo primero en los próximos pedidos o revisa si está en taller.',
    evidencia: 'Días con viaje de las últimas 4 semanas.', impacto: null, enlace: { href: '#pedidos', label: 'Ir a Pedidos' } });
  const ratios = propios.filter((c) => c.diesel_sobre_ingreso != null);
  if (ratios.length >= 3) {
    const prom2 = ratios.reduce((a, c) => a + c.diesel_sobre_ingreso, 0) / ratios.length;
    const altos = ratios.filter((c) => c.diesel_sobre_ingreso > Math.max(0.28, prom2 * 1.15));
    if (altos.length) add({ codigo: 'NH-DIESEL-ALTO', severidad: 'atencion', titulo: 'Camiones que gastan más diésel de lo normal',
      diagnostico: altos.map((c) => `${c.unidad}: diésel ${pct(c.diesel_sobre_ingreso)} del ingreso (${c.litros_por_viaje} L por viaje)`).join('; ') + `. El promedio de la flota es ${pct(prom2)}.`,
      prescripcion: 'Revisa con el GPS la ruta y el tiempo con motor encendido de esas unidades, y mándalas a taller si el consumo sigue alto (inyectores, llantas).',
      evidencia: 'Cargas de diésel por camión contra sus viajes, 4 semanas.', impacto: null, enlace: { href: '#gastos', label: 'Ver diésel' } });
  }

  // 9. Datos que faltan.
  const sinCamion = (s.alertas || []).find((a) => /cargas de diésel/.test(a.texto));
  if (sinCamion) add({ codigo: 'NH-DIESEL-SIN-CAMION', severidad: 'oportunidad', titulo: 'Diésel sin camión asignado',
    diagnostico: sinCamion.texto, prescripcion: 'Asigna cada carga a su camión en Gastos y diésel; sin eso el costo por camión sale incompleto.',
    evidencia: 'Cargas de la factura de la estación.', impacto: null, enlace: { href: '#gastos', label: 'Asignar cargas' } });
  if (conViajes.length && !extra.nominas_4s) add({ codigo: 'NH-SIN-NOMINA', severidad: 'oportunidad', titulo: 'No hay nómina capturada',
    diagnostico: 'Sin sueldos y comisiones el costo de la operación sale más bajo de lo real y el margen se ve mejor de lo que es.',
    prescripcion: 'Captura en Nómina el salario semanal de cada chofer; la comisión se calcula sola con sus viajes.',
    evidencia: 'Nómina de las últimas 4 semanas.', impacto: null, enlace: { href: '#nomina', label: 'Ir a Nómina' } });
  if ((extra.obras_sin_ingeniero || []).length) add({ codigo: 'NH-OBRA-SIN-CONTACTO', severidad: 'oportunidad', titulo: 'Obras sin ingeniero de contacto',
    diagnostico: `${extra.obras_sin_ingeniero.join(', ')} no tienen ingeniero ni WhatsApp, así que la estimación no se puede mandar desde la app.`,
    prescripcion: 'Agrega en Catálogos el nombre y WhatsApp del ingeniero de cada obra.', evidencia: 'Catálogo de obras.', impacto: null, enlace: { href: '#catalogos', label: 'Ir a Catálogos' } });

  return out.sort((a, b) => SEV[a.severidad] - SEV[b.severidad]);
}
module.exports = { hallazgos };
