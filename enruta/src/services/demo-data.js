'use strict';
/**
 * ENRUTA - Generador de datos de demostración
 *
 * Sirve para MOSTRAR el producto: 60 ciudadanos del Valle del Cauca con sus
 * vehículos, documentos, comparendos, llamadas y renovaciones.
 *
 * DOS COSAS QUE NO SON ADORNO:
 *
 * 1. LAS FECHAS SON RELATIVAS AL DÍA EN QUE SE SIEMBRA, nunca literales. El
 *    sembrador anterior escribió vencimientos fijos en febrero; seis meses
 *    después el tablero era un muro de vencidos y la casilla interesante —la
 *    de "por vencer", que es donde Laura llama— estaba en veinte. Aquí el
 *    reparto se calcula contra hoy, así que la demostración se ve igual de
 *    viva el día que se siembra que el mes entrante si se vuelve a correr.
 *
 * 2. EL AZAR ES SEMBRADO, NO ALEATORIO. Con la misma semilla salen las mismas
 *    personas con las mismas cédulas. Quien prepara la demostración se aprende
 *    una cédula y sigue sirviendo después de volver a sembrar.
 *
 * Todo es inventado y se nota: las cédulas respetan el formato colombiano pero
 * los números no pertenecen a nadie, y cada fila queda marcada en `notas` con
 * MARCA_DEMO para poder distinguirla y borrarla.
 */
const { hoyBogota, sumarDias, estadoDesdeFecha } = require('../utils/estado');

const MARCA_DEMO = '[demo]';
const TENANT_DEMO = '00000000-0000-0000-0000-000000000001';

// ── Azar reproducible (mulberry32) ────────────────────────────────────────
function prng(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Vocabulario colombiano ────────────────────────────────────────────────
const NOMBRES_M = ['Carlos', 'Andrés', 'Juan', 'Luis', 'Diego', 'Jorge', 'Miguel', 'Óscar', 'Fernando',
  'Julián', 'Santiago', 'Sebastián', 'Mauricio', 'Álvaro', 'Camilo', 'Héctor', 'Wilson', 'Édinson', 'Jhon', 'Ramiro'];
const NOMBRES_F = ['María', 'Ana', 'Luz', 'Claudia', 'Diana', 'Paola', 'Sandra', 'Valentina', 'Isabella',
  'Catalina', 'Ángela', 'Yeimy', 'Martha', 'Liliana', 'Sofía', 'Camila', 'Natalia', 'Beatriz', 'Gloria', 'Yuliana'];
const SEGUNDOS_M = ['Andrés', 'Alberto', 'Eduardo', 'Alonso', 'Enrique', 'Javier', 'Ramón', 'Esteban', null];
const SEGUNDOS_F = ['Fernanda', 'Isabel', 'Cristina', 'Elena', 'Lucía', 'Alejandra', 'del Pilar', 'Milena', null];
const APELLIDOS = ['Ramírez', 'Valencia', 'Ospina', 'Restrepo', 'Zapata', 'Betancourt', 'Cardona', 'Arboleda',
  'Mosquera', 'Rentería', 'Caicedo', 'Angulo', 'Riascos', 'Grajales', 'Marmolejo', 'Lozano', 'Peñaranda',
  'Sandoval', 'Vélez', 'Quintero', 'Bermúdez', 'Escobar', 'Palacios', 'Bonilla', 'Trujillo', 'Salazar',
  'Hurtado', 'Córdoba', 'Aristizábal', 'Montoya'];

// Municipios del Valle del Cauca, con el peso real de su población.
const CIUDADES = [
  { nombre: 'Cali', peso: 46, barrios: ['La Flora', 'Ciudad Jardín', 'San Fernando', 'Granada', 'El Peñón',
      'Versalles', 'Santa Mónica', 'Chipichape', 'Meléndez', 'Valle del Lili', 'El Ingenio', 'Alfonso López',
      'El Poblado', 'Junín', 'Los Álamos', 'Pance'] },
  { nombre: 'Palmira', peso: 9, barrios: ['Zamorano', 'La Emilia', 'Santa Bárbara', 'El Prado'] },
  { nombre: 'Buenaventura', peso: 8, barrios: ['El Jardín', 'Juan XXIII', 'La Independencia'] },
  { nombre: 'Tuluá', peso: 6, barrios: ['La Ribera', 'El Príncipe', 'Alvernia'] },
  { nombre: 'Buga', peso: 5, barrios: ['El Carmen', 'La Merced', 'Balboa'] },
  { nombre: 'Cartago', peso: 4, barrios: ['El Prado', 'Santa Ana'] },
  { nombre: 'Jamundí', peso: 6, barrios: ['Ciudad Country', 'Alfaguara', 'El Rincón'] },
  { nombre: 'Yumbo', peso: 5, barrios: ['Uribe Uribe', 'Belalcázar'] },
  { nombre: 'Candelaria', peso: 4, barrios: ['El Centro', 'Villa Gorgona'] },
  { nombre: 'Florida', peso: 3, barrios: ['El Palmar'] },
  { nombre: 'Pradera', peso: 2, barrios: ['La Carbonera'] },
  { nombre: 'Zarzal', peso: 2, barrios: ['El Vergel'] }
];

// Prefijos de celular realmente asignados en Colombia.
const PREFIJOS_CEL = ['300', '301', '302', '304', '305', '310', '311', '312', '313', '314',
  '315', '316', '317', '318', '320', '321', '322', '323', '350', '351'];

const VEHICULOS = [
  { marca: 'Renault', lineas: ['Logan', 'Sandero', 'Duster', 'Stepway', 'Kwid'], tipo: 'automovil', cil: [1000, 1600] },
  { marca: 'Chevrolet', lineas: ['Spark GT', 'Onix', 'Sail', 'Tracker', 'Joy'], tipo: 'automovil', cil: [1000, 1800] },
  { marca: 'Mazda', lineas: ['Mazda 2', 'Mazda 3', 'CX-30'], tipo: 'automovil', cil: [1500, 2000] },
  { marca: 'Kia', lineas: ['Picanto', 'Rio', 'Sportage'], tipo: 'automovil', cil: [1000, 2000] },
  { marca: 'Nissan', lineas: ['March', 'Versa', 'Kicks'], tipo: 'automovil', cil: [1200, 1600] },
  { marca: 'Hyundai', lineas: ['i10', 'Accent', 'Tucson'], tipo: 'automovil', cil: [1000, 2000] },
  { marca: 'Toyota', lineas: ['Hilux', 'Prado', 'Fortuner'], tipo: 'camioneta', cil: [2400, 2800] },
  { marca: 'Bajaj', lineas: ['Boxer CT 100', 'Pulsar NS 200', 'Discover 125'], tipo: 'motocicleta', cil: [100, 200] },
  { marca: 'Yamaha', lineas: ['FZ 2.0', 'NMAX 155', 'Crypton 110'], tipo: 'motocicleta', cil: [110, 155] },
  { marca: 'Honda', lineas: ['CB 110', 'XR 150', 'Navi 110'], tipo: 'motocicleta', cil: [110, 150] },
  { marca: 'AKT', lineas: ['NKD 125', 'TT 125'], tipo: 'motocicleta', cil: [125, 125] },
  { marca: 'Suzuki', lineas: ['Gixxer 150', 'Best 125'], tipo: 'motocicleta', cil: [125, 150] }
];
const COLORES = ['Blanco', 'Gris', 'Negro', 'Rojo', 'Plata', 'Azul', 'Beige'];
const ASEGURADORAS = ['Sura', 'Seguros del Estado', 'Seguros Mundial', 'La Previsora', 'Allianz',
  'AXA Colpatria', 'Seguros Bolívar', 'La Equidad', 'Seguros Solidaria', 'Mapfre'];

// Infracciones reales del Código Nacional de Tránsito, con su valor 2025.
const INFRACCIONES = [
  { tipo: 'C', codigo: 'C14', desc: 'Transitar sin portar la licencia de conducción', valor: 695000 },
  { tipo: 'C', codigo: 'C24', desc: 'No respetar la luz roja del semáforo', valor: 695000 },
  { tipo: 'C', codigo: 'C29', desc: 'Estacionar en sitio prohibido', valor: 695000 },
  { tipo: 'C', codigo: 'C02', desc: 'Estacionar sobre andén o zona peatonal', valor: 695000 },
  { tipo: 'D', codigo: 'D02', desc: 'Conducir sin SOAT vigente', valor: 1207800 },
  { tipo: 'D', codigo: 'D03', desc: 'Conducir sin revisión técnico mecánica vigente', valor: 1207800 },
  { tipo: 'D', codigo: 'D12', desc: 'Conducir motocicleta sin casco', valor: 1207800 },
  { tipo: 'B', codigo: 'B01', desc: 'Conducir un vehículo sin las luces reglamentarias', valor: 371000 },
  { tipo: 'B', codigo: 'B15', desc: 'No respetar el pico y placa', valor: 371000 },
  { tipo: 'E', codigo: 'E01', desc: 'Conducir en estado de embriaguez, primer grado', valor: 3623000 }
];

// Cuánto cuesta renovar cada documento y qué se necesita (referencia 2025).
const TRAMITES = {
  licencia_conduccion: {
    etiqueta: 'licencia de conducción',
    costo: { automovil: 126650, camioneta: 126650, motocicleta: 220050 },
    requisitos: ['Cédula de ciudadanía original', 'Examen de aptitud física, mental y de coordinación motriz en CRC autorizado',
      'Licencia anterior', 'Estar al día con los comparendos', 'Registro actualizado en el RUNT'],
    multa: { tipo: 'C', valor: 695000, inmoviliza: false }
  },
  soat: {
    etiqueta: 'SOAT',
    costo: { automovil: 292000, camioneta: 355000, motocicleta: 385000 },
    requisitos: ['Tarjeta de propiedad', 'Cédula del propietario', 'Datos del vehículo actualizados en el RUNT'],
    multa: { tipo: 'D', valor: 1207800, inmoviliza: true }
  },
  revision_tecnicomecanica: {
    etiqueta: 'revisión técnico mecánica',
    costo: { automovil: 285000, camioneta: 310000, motocicleta: 145000 },
    requisitos: ['SOAT vigente', 'Tarjeta de propiedad', 'Cédula del propietario', 'Vehículo en condiciones de ser revisado'],
    multa: { tipo: 'D', valor: 1207800, inmoviliza: true }
  },
  impuesto_vehicular: {
    etiqueta: 'impuesto vehicular',
    costo: { automovil: 340000, camioneta: 520000, motocicleta: 0 },
    requisitos: ['Tarjeta de propiedad', 'Avalúo del vehículo según tabla del Ministerio de Transporte'],
    multa: { tipo: 'B', valor: 371000, inmoviliza: false }
  }
};

// El reparto de vencimientos: lo que define cómo se ve el tablero. Se quiere
// una mayoría al día (o no habría producto que vender), una casilla de "por
// vencer" con volumen real (que es donde Laura trabaja) y un atraso creíble.
const REPARTO = [
  { estado: 'vencido', peso: 20, desde: -240, hasta: -1 },
  { estado: 'por_vencer_7_dias', peso: 13, desde: 0, hasta: 7 },
  { estado: 'por_vencer_15_dias', peso: 13, desde: 8, hasta: 15 },
  { estado: 'por_vencer_30_dias', peso: 16, desde: 16, hasta: 30 },
  { estado: 'vigente', peso: 38, desde: 31, hasta: 350 }
];

const SEDE_PRINCIPAL = 'Sede Principal - Calle 62 Norte # Avenida 3B - 40, Barrio La Flora, Santiago de Cali';
const SEDE_RTM = 'Sede RTMyEC - Calle 70 Norte # 3B - 81, Barrio La Flora, Santiago de Cali';

// ── Utilidades del generador ──────────────────────────────────────────────
function crearAzar(semilla) {
  const r = prng(semilla);
  const ent = (min, max) => Math.floor(r() * (max - min + 1)) + min;
  const uno = (lista) => lista[Math.floor(r() * lista.length)];
  const prob = (p) => r() < p;
  const pesado = (lista) => {
    const total = lista.reduce((s, x) => s + x.peso, 0);
    let t = r() * total;
    for (const x of lista) { t -= x.peso; if (t <= 0) return x; }
    return lista[lista.length - 1];
  };
  return { r, ent, uno, prob, pesado };
}

/**
 * Cédula con formato colombiano real: ocho dígitos para quien nació antes de
 * 1988 (con los rangos que el Valle usa de verdad) y diez que empiezan por 1
 * para el NUIP posterior. El formato es real; el número no es de nadie.
 */
function generarCedula(az, genero, nacimiento) {
  const anio = Number(String(nacimiento).slice(0, 4));
  if (anio >= 1988) return '1' + String(az.ent(0, 199)).padStart(3, '0') + String(az.ent(0, 999999)).padStart(6, '0');
  const raiz = genero === 'femenino' ? az.uno(['29', '31', '38', '66', '67']) : az.uno(['16', '94', '10', '79', '80']);
  return raiz + String(az.ent(0, 999999)).padStart(6, '0');
}

function generarPlaca(az, tipo) {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l3 = () => L[az.ent(0, 25)] + L[az.ent(0, 25)] + L[az.ent(0, 25)];
  // Motos: tres letras, dos dígitos y una letra. Carros: tres letras y tres dígitos.
  return tipo === 'motocicleta'
    ? l3() + String(az.ent(10, 99)) + L[az.ent(0, 25)]
    : l3() + String(az.ent(100, 999));
}

function fechaVencimiento(az, hoy) {
  const tramo = az.pesado(REPARTO);
  return sumarDias(hoy, az.ent(tramo.desde, tramo.hasta));
}

// ── El sembrador ──────────────────────────────────────────────────────────
/**
 * @param {object} models  el índice de modelos de ENRUTA
 * @param {object} opciones { tenant_id, clientes, semilla, reset }
 */
async function sembrarDemo(models, opciones = {}) {
  const {
    EnrutaCliente, EnrutaDocumento, EnrutaRegistroContacto,
    EnrutaRenovacion, EnrutaCampana, EnrutaPlantillaMensaje, EnrutaComparendo
  } = models;

  const tenant_id = opciones.tenant_id || TENANT_DEMO;
  const total = Math.min(Math.max(parseInt(opciones.clientes, 10) || 80, 1), 400);
  const az = crearAzar(opciones.semilla || 20260901);
  const hoy = hoyBogota();
  const anioActual = Number(hoy.slice(0, 4));

  const borrado = {};
  if (opciones.reset) {
    // Solo este tenant, y en orden: los hijos antes que los padres.
    for (const [nombre, Modelo] of [
      ['renovaciones', EnrutaRenovacion], ['contactos', EnrutaRegistroContacto],
      ['comparendos', EnrutaComparendo], ['documentos', EnrutaDocumento],
      ['clientes', EnrutaCliente], ['campanas', EnrutaCampana]
    ]) {
      borrado[nombre] = await Modelo.destroy({ where: { tenant_id } });
    }
  }

  const cedulasUsadas = new Set();
  const placasUsadas = new Set();
  const clientes = [];
  const documentos = [];
  const comparendos = [];
  const contactos = [];
  const renovaciones = [];

  for (let i = 0; i < total; i++) {
    // ── La persona
    const genero = az.prob(0.5) ? 'masculino' : 'femenino';
    const nacimiento = `${az.ent(1962, 2004)}-${String(az.ent(1, 12)).padStart(2, '0')}-${String(az.ent(1, 28)).padStart(2, '0')}`;
    let cedula = generarCedula(az, genero, nacimiento);
    while (cedulasUsadas.has(cedula)) cedula = generarCedula(az, genero, nacimiento);
    cedulasUsadas.add(cedula);

    const ciudad = az.pesado(CIUDADES);
    const primer_nombre = genero === 'masculino' ? az.uno(NOMBRES_M) : az.uno(NOMBRES_F);
    const segundo_nombre = genero === 'masculino' ? az.uno(SEGUNDOS_M) : az.uno(SEGUNDOS_F);
    const telefono = '+57' + az.uno(PREFIJOS_CEL) + String(az.ent(1000000, 9999999));

    // Una minoría pide no ser llamada: la cola de Laura tiene que respetarlo
    // a la vista, no en teoría.
    const noLlamar = az.prob(0.06);
    const cliente = await EnrutaCliente.create({
      tenant_id,
      tipo_documento: 'CC',
      numero_documento: cedula,
      primer_nombre,
      segundo_nombre,
      primer_apellido: az.uno(APELLIDOS),
      segundo_apellido: az.uno(APELLIDOS),
      fecha_nacimiento: nacimiento,
      genero,
      telefono_principal: telefono,
      correo_electronico: null,
      whatsapp_habilitado: az.prob(0.85),
      metodo_contacto_preferido: az.pesado([
        { peso: 55, v: 'telefono' }, { peso: 30, v: 'whatsapp' }, { peso: 15, v: 'sms' }]).v,
      departamento: 'Valle del Cauca',
      ciudad: ciudad.nombre,
      barrio: az.uno(ciudad.barrios),
      direccion: `${az.uno(['Calle', 'Carrera', 'Avenida', 'Transversal'])} ${az.ent(1, 120)} # ${az.ent(1, 90)} - ${az.ent(1, 99)}`,
      estado: noLlamar ? 'no_contactar' : 'activo',
      fuente_registro: az.uno(['tramite_sede', 'portal_web', 'linea_atencion', 'campana_whatsapp', 'runt']),
      horario_contacto_preferido: az.uno(['manana', 'tarde', 'noche']),
      idioma: 'es',
      zona_horaria: 'America/Bogota',
      no_llamar: noLlamar,
      consentimiento_datos: true,
      consentimiento_llamadas: !noLlamar,
      consentimiento_sms: !noLlamar && az.prob(0.9),
      consentimiento_whatsapp: !noLlamar && az.prob(0.88),
      fecha_consentimiento: sumarDias(hoy, -az.ent(30, 900)),
      notas: MARCA_DEMO
    });
    clientes.push(cliente);

    // ── El vehículo
    const v = az.uno(VEHICULOS);
    const esMoto = v.tipo === 'motocicleta';
    const modelo = az.ent(anioActual - 14, anioActual);
    let placa = generarPlaca(az, v.tipo);
    while (placasUsadas.has(placa)) placa = generarPlaca(az, v.tipo);
    placasUsadas.add(placa);
    const servicio = !esMoto && az.prob(0.12) ? 'publico' : 'particular';

    // ── Los documentos
    // La licencia la tiene todo el mundo. El resto depende del vehículo y de
    // las reglas reales: la RTMyEC no aplica a un particular de menos de seis
    // años, y la moto no paga impuesto vehicular.
    const tipos = ['licencia_conduccion'];
    if (az.prob(0.92)) tipos.push('soat');
    const antiguedad = anioActual - modelo;
    if ((servicio === 'publico' || esMoto ? antiguedad >= 2 : antiguedad >= 6) && az.prob(0.9)) {
      tipos.push('revision_tecnicomecanica');
    }
    if (!esMoto && az.prob(0.45)) tipos.push('impuesto_vehicular');

    for (const tipo of tipos) {
      const t = TRAMITES[tipo];
      const vence = fechaVencimiento(az, hoy);
      const estado = estadoDesdeFecha(vence, hoy);
      const vencido = estado === 'vencido';
      const esLicencia = tipo === 'licencia_conduccion';
      const vigenciaAnios = esLicencia ? (servicio === 'publico' ? 3 : 10) : 1;

      documentos.push({
        cliente_id: cliente.id,
        tenant_id,
        tipo_documento: tipo,
        numero_documento: esLicencia ? cedula
          : tipo === 'soat' ? `SOAT-${modelo}-${az.ent(100000, 999999)}`
            : tipo === 'revision_tecnicomecanica' ? `RTM-${az.ent(1000000, 9999999)}`
              : `IV-${anioActual}-${az.ent(10000, 99999)}`,
        fecha_expedicion: sumarDias(vence, -365 * vigenciaAnios),
        fecha_vencimiento: vence,
        // El estado se guarda por compatibilidad; lo que se lee siempre se
        // deriva de la fecha (ver src/utils/estado.js).
        estado,
        categoria_licencia: esLicencia ? (esMoto ? az.uno(['A1', 'A2']) : az.uno(['B1', 'B1', 'B1', 'B2', 'C1'])) : null,
        restriccion_licencia: esLicencia && az.prob(0.18) ? 'Debe usar lentes correctivos' : null,
        tipo_servicio: esLicencia ? servicio : null,
        organismo_expedicion: esLicencia ? 'Centro de Diagnóstico Automotor del Valle - Cali' : null,
        placa_vehiculo: esLicencia ? null : placa,
        marca_vehiculo: esLicencia ? null : v.marca,
        linea_vehiculo: esLicencia ? null : az.uno(v.lineas),
        modelo_vehiculo: esLicencia ? null : modelo,
        tipo_vehiculo: esLicencia ? null : v.tipo,
        color_vehiculo: esLicencia ? null : az.uno(COLORES),
        cilindraje: esLicencia ? null : az.ent(v.cil[0], v.cil[1]),
        tipo_combustible: esLicencia ? null : (v.tipo === 'camioneta' && az.prob(0.5) ? 'diesel' : 'gasolina'),
        servicio_vehiculo: esLicencia ? null : servicio,
        aseguradora_soat: tipo === 'soat' ? az.uno(ASEGURADORAS) : null,
        numero_poliza_soat: tipo === 'soat' ? String(az.ent(100000000, 999999999)) : null,
        cda_ultimo_revision: tipo === 'revision_tecnicomecanica' ? 'CDAV Sede RTMyEC - Cali' : null,
        resultado_ultima_revision: tipo === 'revision_tecnicomecanica' ? (az.prob(0.88) ? 'aprobado' : 'rechazado') : null,
        costo_estimado_renovacion: t.costo[esMoto ? 'motocicleta' : v.tipo] || t.costo.automovil,
        sede_recomendada: tipo === 'revision_tecnicomecanica' ? SEDE_RTM : SEDE_PRINCIPAL,
        requisitos_renovacion: t.requisitos,
        // La multa solo se escribe cuando el documento REALMENTE está vencido:
        // un riesgo que no existe no debe aparecer en pantalla.
        tipo_multa_asociada: vencido ? t.multa.tipo : null,
        valor_multa_cop: vencido ? t.multa.valor : null,
        riesgo_inmovilizacion: vencido && t.multa.inmoviliza,
        verificado_runt: az.prob(0.7),
        notas: MARCA_DEMO
      });
    }

    // ── Comparendos: uno de cada cuatro ciudadanos tiene alguno
    if (az.prob(0.26)) {
      for (let k = 0; k < az.ent(1, 2); k++) {
        const inf = az.uno(INFRACCIONES);
        const estadoC = az.pesado([
          { peso: 34, v: 'pendiente' }, { peso: 16, v: 'en_proceso' },
          { peso: 14, v: 'curso_pedagogico' }, { peso: 26, v: 'pagado' }, { peso: 10, v: 'resuelto' }]).v;
        const conCurso = estadoC === 'curso_pedagogico' || (estadoC === 'pagado' && az.prob(0.4));
        const descuento = conCurso ? az.uno([25, 50]) : 0;
        const pagado = estadoC === 'pagado' || estadoC === 'resuelto';
        const fecha = sumarDias(hoy, -az.ent(10, 400));
        comparendos.push({
          tenant_id, cliente_id: cliente.id,
          numero_comparendo: `76001000000${az.ent(10000000, 99999999)}`,
          fecha_comparendo: fecha,
          tipo_infraccion: inf.tipo,
          descripcion_infraccion: `${inf.codigo} - ${inf.desc}`,
          valor_multa_cop: inf.valor,
          estado: estadoC,
          curso_realizado: conCurso,
          fecha_curso: conCurso ? sumarDias(fecha, az.ent(5, 40)) : null,
          descuento_aplicado: descuento,
          valor_pagado_cop: pagado ? Math.round(inf.valor * (1 - descuento / 100)) : null,
          fecha_pago: pagado ? sumarDias(fecha, az.ent(10, 90)) : null,
          verificado_simit: az.prob(0.8),
          notas: MARCA_DEMO
        });
      }
    }
  }

  const docsCreados = await EnrutaDocumento.bulkCreate(documentos, { returning: true });
  if (comparendos.length) await EnrutaComparendo.bulkCreate(comparendos);

  // ── Historial de llamadas de Laura sobre los documentos que lo ameritan
  const candidatos = docsCreados.filter((d) => {
    const e = estadoDesdeFecha(d.fecha_vencimiento, hoy);
    return e !== 'vigente';
  });
  const porCliente = new Map(clientes.map((c) => [c.id, c]));

  for (const doc of candidatos) {
    const cli = porCliente.get(doc.cliente_id);
    if (!cli || cli.no_llamar) continue;
    if (!az.prob(0.55)) continue;

    // Hoy tiene que haber llamadas: el tablero muestra "llamadas hoy" y en una
    // demostración un cero se lee como que el agente no está trabajando.
    const diasAtras = az.prob(0.3) ? 0 : az.ent(1, 25);
    const inicio = new Date(`${sumarDias(hoy, -diasAtras)}T${String(az.ent(8, 17)).padStart(2, '0')}:${String(az.ent(0, 59)).padStart(2, '0')}:00-05:00`);
    const estadoLl = az.pesado([
      { peso: 58, v: 'completada' }, { peso: 14, v: 'sin_respuesta' }, { peso: 10, v: 'buzon_voz' },
      { peso: 8, v: 'ocupado' }, { peso: 6, v: 'numero_equivocado' }, { peso: 4, v: 'fallida' }]).v;
    const contestada = estadoLl === 'completada';
    const resultado = contestada
      ? az.pesado([
        { peso: 32, v: 'informado_renovara' }, { peso: 22, v: 'cita_agendada' }, { peso: 14, v: 'ya_renovo' },
        { peso: 12, v: 'solicito_info_sms' }, { peso: 10, v: 'necesita_seguimiento' },
        { peso: 6, v: 'no_interesado' }, { peso: 4, v: 'solicito_retiro' }]).v
      : 'no_contactado';
    const duracion = contestada ? az.ent(45, 260) : az.ent(0, 25);

    contactos.push({
      tenant_id, cliente_id: cli.id, documento_id: doc.id,
      direccion_llamada: az.prob(0.85) ? 'saliente' : 'entrante',
      tipo_llamada: 'recordatorio_vencimiento',
      call_sid: `CAdemo${az.ent(100000000, 999999999)}`,
      numero_origen: '+576023808957',
      numero_destino: cli.telefono_principal,
      duracion_llamada_segundos: duracion,
      estado_llamada: estadoLl,
      resultado,
      resumen_conversacion: contestada
        ? `Laura informó que su ${TRAMITES[doc.tipo_documento].etiqueta} vence el ${doc.fecha_vencimiento}. Resultado: ${resultado.replace(/_/g, ' ')}.`
        : null,
      version_agente_ia: 'laura-1.0',
      requiere_seguimiento: resultado === 'necesita_seguimiento',
      fecha_seguimiento: resultado === 'necesita_seguimiento' ? sumarDias(hoy, az.ent(2, 12)) : null,
      sms_enviado: resultado === 'solicito_info_sms',
      whatsapp_enviado: contestada && cli.whatsapp_habilitado && az.prob(0.5),
      llamada_inicio: inicio,
      llamada_fin: new Date(inicio.getTime() + duracion * 1000),
      creado_en: inicio,
      notas_seguimiento: MARCA_DEMO
    });

    // Una cita agendada es una renovación en curso: el embudo tiene que
    // verse conectado de punta a punta, no en casillas sueltas.
    if (resultado === 'cita_agendada') {
      const t = TRAMITES[doc.tipo_documento];
      const esRTM = doc.tipo_documento === 'revision_tecnicomecanica';
      renovaciones.push({
        tenant_id, cliente_id: cli.id, documento_id: doc.id,
        estado_renovacion: az.pesado([
          { peso: 34, v: 'cita_agendada' }, { peso: 20, v: 'reuniendo_documentos' },
          { peso: 14, v: 'examen_medico_pendiente' }, { peso: 12, v: 'pago_pendiente' },
          { peso: 12, v: 'en_proceso' }, { peso: 8, v: 'completada' }]).v,
        fecha_cita: new Date(`${sumarDias(hoy, az.ent(1, 20))}T${String(az.ent(8, 16)).padStart(2, '0')}:00:00-05:00`),
        sede_cita: esRTM ? SEDE_RTM : SEDE_PRINCIPAL,
        referencia_cita: `ENR-${az.ent(100000, 999999)}`,
        costo_estimado_cop: doc.costo_estimado_renovacion,
        metodo_pago: az.uno(['efectivo', 'tarjeta', 'PSE', 'Nequi', 'Daviplata']),
        historial_estados: [{ estado: 'iniciada', fecha: inicio.toISOString(), nota: 'Cita agendada por Laura durante la llamada' }],
        iniciada_en: inicio,
        notas: MARCA_DEMO
      });
    }
  }

  if (contactos.length) await EnrutaRegistroContacto.bulkCreate(contactos);
  if (renovaciones.length) await EnrutaRenovacion.bulkCreate(renovaciones);

  // ── Campañas, con contadores coherentes con lo anterior
  const campanas = [
    { nombre_campana: 'Recordatorio 30 días - Licencias Cali', tipo_campana: 'recordatorio_30',
      descripcion: 'Ciudadanos de Cali con licencia de conducción por vencer en 30 días',
      tipos_documentos_objetivo: ['licencia_conduccion'], ciudades_objetivo: ['Cali'], estado: 'activa' },
    { nombre_campana: 'SOAT y RTMyEC vencidos - Valle', tipo_campana: 'vencidos',
      descripcion: 'Documentos vencidos con riesgo de inmovilización en todo el Valle del Cauca',
      tipos_documentos_objetivo: ['soat', 'revision_tecnicomecanica'], ciudades_objetivo: null, estado: 'activa' },
    { nombre_campana: 'Urgente 7 días - Todo el Valle', tipo_campana: 'recordatorio_7',
      descripcion: 'Última llamada antes del vencimiento', tipos_documentos_objetivo: null,
      ciudades_objetivo: null, estado: 'pausada' },
    { nombre_campana: 'Renovación anticipada - Palmira y Yumbo', tipo_campana: 'recordatorio_15',
      descripcion: 'Prueba piloto en municipios del área de influencia',
      tipos_documentos_objetivo: ['soat'], ciudades_objetivo: ['Palmira', 'Yumbo'], estado: 'completada' }
  ].map((c) => {
    const objetivos = az.ent(40, 220);
    const realizadas = c.estado === 'borrador' ? 0 : Math.round(objetivos * (c.estado === 'completada' ? 1 : az.r() * 0.6 + 0.2));
    const contestadas = Math.round(realizadas * (az.r() * 0.25 + 0.45));
    const exitosas = Math.round(contestadas * (az.r() * 0.3 + 0.5));
    return {
      tenant_id, ...c,
      hora_inicio_llamadas: '08:00:00', hora_fin_llamadas: '18:00:00',
      max_llamadas_por_dia: az.ent(60, 200), max_reintentos: 2, intervalo_reintento_horas: 24,
      total_objetivos: objetivos, llamadas_realizadas: realizadas,
      llamadas_contestadas: contestadas, llamadas_exitosas: exitosas,
      renovaciones_iniciadas: Math.round(exitosas * (az.r() * 0.4 + 0.3))
    };
  });
  await EnrutaCampana.bulkCreate(campanas);

  // ── Plantillas: idempotentes, no se duplican al volver a sembrar
  const plantillas = [
    { nombre_plantilla: 'Recordatorio 30 días', tipo_plantilla: 'whatsapp', evento_disparador: 'recordatorio_30',
      cuerpo: 'Hola {nombre}, le recordamos que su {documento} vence el {fecha_vencimiento}. Puede renovarlo en {sede}. Necesita: {requisitos}. Más información en cdav.gov.co - Laura de enRuta' },
    { nombre_plantilla: 'Aviso urgente 7 días', tipo_plantilla: 'sms', evento_disparador: 'recordatorio_7',
      cuerpo: 'URGENTE {nombre}: su {documento} vence el {fecha_vencimiento}. Renueve para evitar multas. Linea (602) 380 8957 - enRuta' },
    { nombre_plantilla: 'Documento vencido', tipo_plantilla: 'whatsapp', evento_disparador: 'aviso_vencido',
      cuerpo: 'IMPORTANTE {nombre}: su {documento} venció el {fecha_vencimiento}. Circular así puede costarle ${valor_multa} COP y la inmovilización del vehículo. Info: cdav.gov.co - enRuta' },
    { nombre_plantilla: 'Cita confirmada', tipo_plantilla: 'whatsapp', evento_disparador: 'confirmacion_cita',
      cuerpo: '¡Cita confirmada! {nombre}, lo esperamos el {fecha_cita} a las {hora_cita} en {sede}. Traiga: {requisitos}' },
    { nombre_plantilla: 'Llamada perdida', tipo_plantilla: 'sms', evento_disparador: 'llamada_perdida',
      cuerpo: 'Hola {nombre}, intentamos comunicarnos desde enRuta sobre su {documento}. Llámenos al (602) 380 8957 o escríbanos al 317 513 4171' }
  ];
  for (const p of plantillas) {
    await EnrutaPlantillaMensaje.findOrCreate({
      where: { tenant_id, nombre_plantilla: p.nombre_plantilla },
      defaults: { tenant_id, esta_activa: true, ...p }
    });
  }

  // ── Resumen, calculado sobre lo que quedó, no sobre lo que se pretendía
  const reparto = {};
  for (const d of documentos) {
    const e = estadoDesdeFecha(d.fecha_vencimiento, hoy);
    reparto[e] = (reparto[e] || 0) + 1;
  }
  const ejemplos = clientes.slice(0, 5).map((c) => ({
    cedula: c.numero_documento, nombre: c.nombre_completo, ciudad: c.ciudad
  }));

  return {
    tenant_id, hoy, semilla: opciones.semilla || 20260901,
    borrado: opciones.reset ? borrado : null,
    creado: {
      clientes: clientes.length, documentos: documentos.length, comparendos: comparendos.length,
      contactos: contactos.length, renovaciones: renovaciones.length, campanas: campanas.length
    },
    documentos_por_estado: reparto,
    cedulas_de_ejemplo: ejemplos
  };
}

module.exports = { sembrarDemo, MARCA_DEMO, TENANT_DEMO };
