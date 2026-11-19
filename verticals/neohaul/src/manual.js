'use strict';
/**
 * Manual de uso de la app para Dalia: QUÉ se hace en cada pantalla, QUIÉN lo hace (rol) y DÓNDE apretar, con los
 * nombres exactos de los botones. Dalia lo consulta como herramienta (manual_de_uso), así lo que explica sale de aquí
 * y no de su memoria. Si una pantalla cambia sus botones, se cambia aquí también.
 */
const MANUAL = {
  tablero: { titulo: 'Tablero', normalmente: 'todos (lo mira sobre todo el director y solo lectura)', palabras: ['tablero', 'calificacion', 'salud', 'hallazgo', 'neural', 'riesgo', 'monte carlo', 'ganancia', 'margen', 'indicador'],
    pasos: ['Menú izquierdo > Semana > Tablero. Es la primera pantalla que abre la app.',
      'Arriba: "Lo que hay que atender" (avisos) y la calificación de 0 a 100: 75 o más es sana, de 50 a 74 pide atención, menos de 50 está en riesgo.',
      '"¿De dónde sale la calificación?" muestra cada parte con su valor de hoy. Cada indicador tiene una "i": al pasar el mouse o tocarla explica qué significa.',
      'Neural Findings: cada hallazgo trae diagnóstico, prescripción (qué hacer) y un enlace a la pantalla donde se corrige.',
      '"¿Qué tan probable es ir en pérdida?" es una estimación con 2,000 futuros posibles armados con semanas reales.',
      '"Ganancia de cada camión (4 semanas)": cobró menos diésel, chofer y otros costos; verde deja 20% o más, amarillo de 5% a 20%, rojo menos de 5% o pierde.',
      'Abajo, "La semana": cifras de la semana elegida con "Semana anterior" y "Siguiente", y "Enviar resumen por WhatsApp".'] },
  pedidos: { titulo: 'Pedidos', normalmente: 'Captura y Director', palabras: ['pedido', 'asignar', 'avisar', 'chofer whatsapp', 'ingeniero pide'],
    pasos: ['Menú > Semana > Pedidos.', 'En "Nuevo pedido" llena fecha, obra, tarifa o ruta, cuántos camiones y quién pide. Aprieta "Guardar pedido".',
      'En el pedido aprieta "Asignar camión": salen primero los camiones propios libres ese día. Elige camión y chofer y aprieta "Asignar".',
      'El botón de WhatsApp del chofer abre su chat con el mensaje ya escrito; tú lo envías. "Quitar" saca un camión del pedido.'] },
  viaje_foto: { titulo: 'Registrar un viaje con la foto del ticket', normalmente: 'Captura', palabras: ['foto', 'ticket', 'vale', 'bascula', 'subir foto', 'leer ticket'],
    pasos: ['Menú > Semana > Viajes. Aprieta el botón "Subir foto del ticket" (en el teléfono abre la cámara). También está en la Guía de usuario, paso 2, "Tomar o subir foto del ticket".',
      'Espera "Leyendo el ticket…". La app propone vale, folio, fecha, peso neto en toneladas, placas, chofer y obra.',
      'Revisa contra el papel (sobre todo lo escrito a mano), elige la obra y la tarifa, y aprieta "Guardar y confirmar" (o "Guardar sin confirmar" si falta revisar).'] },
  viaje_manual: { titulo: 'Registrar un viaje sin foto', normalmente: 'Captura', palabras: ['sin foto', 'capturar sin foto', 'manual', 'a mano'],
    pasos: ['Menú > Viajes > botón "Capturar sin foto".', 'Llena fecha, obra, tarifa, camión, chofer, ticket y cantidad; el importe se calcula solo con la tarifa.', 'Aprieta "Guardar y confirmar".'] },
  viaje_excel: { titulo: 'Cargar viajes del Excel de la planta', normalmente: 'Captura', palabras: ['excel', 'importar', 'planta', 'csv', 'varios viajes'],
    pasos: ['Menú > Viajes > botón "Importar Excel de planta" (o Guía de usuario, paso 3, "Cargar Excel de planta").',
      'El Excel necesita columnas Fecha, Ticket y Toneladas; si trae Placas, cada viaje va solo a su camión y chofer. El renglón de Total se ignora y un ticket repetido se rechaza.',
      'Elige obra y tarifa, arrastra el archivo y aprieta "Importar". Los viajes entran sin confirmar.'] },
  viaje_confirmar: { titulo: 'Confirmar, editar o borrar viajes', normalmente: 'Captura (borrar no lo puede hacer el Administrador)', palabras: ['confirmar', 'confirmados', 'editar viaje', 'borrar viaje', 'semana de viajes'],
    pasos: ['Menú > Viajes. Arriba eliges la semana y la obra.', 'Marca la casilla de los viajes capturados y aprieta "Confirmar seleccionados". Sin confirmar no entran a la estimación.',
      'Cada viaje tiene "Editar" y "Borrar" mientras no esté en una estimación. Puedes ordenar la tabla con un clic en el encabezado y filtrarla con la caja "Filtrar…".'] },
  estimaciones: { titulo: 'Estimación semanal', normalmente: 'Captura y Director', palabras: ['estimacion', 'estimaciones', 'armar', 'htr aprobo', 'enviar estimacion', 'cobro semanal'],
    pasos: ['Menú > Cobro > Estimaciones. Elige la obra, Desde y Hasta (lunes a domingo) y aprieta "Armar estimación". Usa solo viajes confirmados.',
      'En la fila: "Ver" muestra los viajes, "Excel" la descarga, "Enviar por WhatsApp" abre el chat del ingeniero de la obra (o "Marcar enviada").',
      'Cuando HTR la acepta aprieta "HTR aprobó"; luego aparece "Pedir factura". "Borrar" (solo en borrador) libera los viajes.'] },
  facturas: { titulo: 'Facturas: requisición, folio y cobro', normalmente: 'Administrador y Director', palabras: ['factura', 'requisicion', 'folio', 'cobrada', 'cfdi', 'iva', 'retencion', 'cancelar factura'],
    pasos: ['Desde Estimaciones aprieta "Pedir factura" en la aprobada: se crea la requisición con IVA 16% y retención 4% por acarreo.',
      'Menú > Cobro > Facturas. "Requisición" muestra el formato para la auxiliar de HTR. Cuando emitan el CFDI aprieta "Anotar folio".',
      'Cuando HTR pague aprieta "Cobrada". "Cancelar" anula una requisición o factura (el Administrador no puede cancelar).',
      'Para cobrar algo que no es una estimación (renta diaria, servicio a empresa hermana) usa "Requisición suelta" arriba.'] },
  gastos: { titulo: 'Gastos de proveedores y pagos', normalmente: 'Administrador y Director', palabras: ['gasto', 'proveedor', 'programar pago', 'pagado', 'cuentas por pagar', 'repartir por km'],
    pasos: ['Menú > Costos > Gastos y diésel. "Nuevo gasto": fecha, proveedor, folio, categoría, total, camión u obra y la foto o PDF de la factura. Aprieta "Guardar gasto".',
      'En cada factura: "Programar pago" (semana y monto) y, cuando se pague, "Pagado".',
      '"Repartir por km" divide una factura de diésel sin cargas entre camiones según sus kilómetros.'] },
  pps: { titulo: 'PPS (propuesta de pagos semanal)', normalmente: 'Administrador y Director', palabras: ['pps', 'propuesta de pagos', 'pagos de la semana', 'descargar pps'],
    pasos: ['Menú > Gastos y diésel > "Cargar PPS (Excel)" (o Guía de usuario, paso 7). Sube el Excel tal cual, con sus 16 columnas.',
      'La app agrega las nuevas, actualiza saldos y compara contra el renglón de totales. Lo que ya asignaste a camión u obra no se toca.',
      '"Descargar PPS de esta semana" lo regresa en el mismo formato con lo propuesto para pagar.'] },
  diesel: { titulo: 'Factura de diésel y cargas por camión', normalmente: 'Administrador', palabras: ['diesel', 'gasolina', 'gasolinera', 'cargas', 'combustible', 'litros'],
    pasos: ['Menú > Gastos y diésel > "Subir factura de diésel (PDF o XML)" (o Guía de usuario, paso 6). Debe cuadrar al centavo con el total de la factura.',
      'Si la factura ya venía en el PPS, se le agregan las cargas en lugar de duplicarla. Sube primero el PPS y luego la factura.',
      'Aprieta "Asignar cargas a camiones" (o "Cargas por camión" en la fila): elige el camión de cada carga o marca varias y usa "Aplicar a las marcadas". Aprieta "Guardar". La premium de camionetas puede quedar sin camión.'] },
  nomina: { titulo: 'Nómina semanal', normalmente: 'Administrador y Director', palabras: ['nomina', 'salario', 'sueldo', 'comision', 'bono', 'faltas', 'asistencia', 'cerrar semana'],
    pasos: ['Menú > Costos > Nómina. Elige la semana.', 'En cada persona marca la asistencia de cada día (asistió, faltó, incapacidad, vacaciones, descanso), revisa salario y bonos y elige el % de comisión.',
      'La comisión sale de sus viajes confirmados; el bono de puntualidad y el descuento por faltas salen de los parámetros de Ajustes.', 'Aprieta "Guardar" en cada persona y al final "Cerrar semana" (ya no se edita).'] },
  taller: { titulo: 'Taller', normalmente: 'Captura y Administrador', palabras: ['taller', 'mecanico', 'servicio', 'reparacion', 'refacciones'],
    pasos: ['Menú > Costos > Taller > "Nuevo servicio": fecha, cliente, camión de la flota u otra unidad, mecánico, trabajos, horas, refacciones y mano de obra. Aprieta "Guardar".',
      'Si el cliente no es NeoHaul queda por cobrar; cuando paguen aprieta "Cobrado".'] },
  choferes: { titulo: 'Choferes y nómina (Ajustes)', normalmente: 'Director, Administrador y Super administrador', palabras: ['chofer', 'choferes', 'alta', 'baja', 'nuevo chofer', 'parametros', 'camionero'],
    pasos: ['Menú > Ajustes > Choferes y nómina. "Agregar persona": nombre, puesto, empresa, WhatsApp, salario semanal, % de comisión propio y fecha de ingreso.',
      '"Editar" cambia sus datos; "Dar de baja" pide la fecha de salida y no borra su historial; "Reactivar" lo regresa.',
      'Arriba, "Parámetros de la nómina": comisión normal y su rango, bono de puntualidad, descontar faltas y cuántos días cubre el salario. Aprieta "Guardar parámetros".'] },
  catalogos: { titulo: 'Catálogos', normalmente: 'Director y Administrador (camiones también Captura)', palabras: ['catalogo', 'camion', 'camiones', 'placa', 'obra', 'obras', 'tarifa', 'tarifas', 'cliente'],
    pasos: ['Menú > Ajustes > Catálogos. Pestañas: Camiones, Choferes, Obras, Tarifas y Clientes.',
      'Camión: número económico y placas; el nombre queda como «PLACA (número)». Obra: nombre, clave, cliente, ingeniero y su WhatsApp (para mandar la estimación).',
      'Tarifa: nombre, origen, destino, cobro por tonelada, día o viaje, y precio. Solo director, administrador o super administrador cambian tarifas.',
      'Desde el Tablero también hay "+ Agregar camión".'] },
  usuarios: { titulo: 'Usuarios y roles', normalmente: 'Director y Super administrador', palabras: ['usuario', 'usuarios', 'cuenta', 'rol', 'roles', 'permiso', 'contrasena', 'acceso'],
    pasos: ['Menú > Ajustes > Usuarios. Escribe correo, nombre, WhatsApp y rol, y aprieta "Crear cuenta". La contraseña temporal sale una sola vez; al entrar se cambia.',
      'Roles: Captura (captura viajes, pedidos y gastos), Administrador (lee, agrega y modifica, no borra), Solo lectura (ve todo), Director (todo en la empresa), Super administrador (absolutamente todo).',
      '"Nueva contraseña" da otra temporal; "Desactivar" quita el acceso. "Qué puede hacer cada rol" muestra la tabla de permisos.'] },
  cuenta: { titulo: 'Mi cuenta', normalmente: 'todos', palabras: ['mi cuenta', 'cambiar contrasena', 'mi contrasena'],
    pasos: ['Menú > Ajustes > Mi cuenta: ves tus datos y cambias tu contraseña (mínimo 10 caracteres).'] },
  guia: { titulo: 'Guía de usuario', normalmente: 'todos', palabras: ['guia', 'ayuda', 'como se usa', 'manual', 'paso a paso'],
    pasos: ['Menú > Ajustes > Guía de usuario: 12 pasos de principio a fin, cada uno con el rol que lo hace, una captura de pantalla y "Hazlo aquí" para hacerlo desde ahí.',
      'Los botones con flechita abren la pantalla en otra pestaña para no perder la guía. Arriba puedes ver solo los pasos de un rol.'] },
  tablas: { titulo: 'Ordenar y filtrar tablas', normalmente: 'todos', palabras: ['ordenar', 'filtrar', 'buscar en la tabla', 'sortear'],
    pasos: ['En cualquier tabla, un clic en el encabezado de una columna ordena; otro clic invierte el orden.', 'Arriba de cada tabla, "Filtrar…" busca en todas las columnas o en la que elijas.'] }
};
// Permisos REALES de la app (los mismos que valida el servidor). "normalmente" en cada tema es quién suele hacerlo, no quién puede.
const PERMISOS = {
  regla: 'Pueden capturar, agregar y modificar: Captura, Administrador, Director, Super administrador y Digit2AI. Solo lectura (contador) solo ve. El Administrador no puede borrar, cancelar facturas ni desactivar cuentas. Tarifas y parámetros de nómina: Director, Administrador, Super administrador. Usuarios: Director y Super administrador; crear o cambiar cuentas de Director solo Super administrador o Digit2AI.',
  por_rol: { capturista: 'captura, agrega y modifica; no tarifas, parámetros ni usuarios', administrador: 'agrega y modifica todo, incluidas tarifas y parámetros; no borra, no cancela, no usuarios', contador: 'solo ve', director: 'todo en la empresa, incluidos usuarios (menos crear otro director)', soporte: 'absolutamente todo', owner: 'absolutamente todo' }
};
function buscar(tema) {
  const t = String(tema || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return { permisos: PERMISOS, temas: Object.entries(MANUAL).map(([k, v]) => ({ tema: k, titulo: v.titulo })) };
  if (MANUAL[t]) return { permisos: PERMISOS, [t]: MANUAL[t] };
  const hit = Object.entries(MANUAL).map(([k, v]) => [k, v, v.palabras.filter((p) => t.includes(p)).reduce((a, p) => a + p.length, 0) + (t.includes(k) ? 5 : 0)]).filter((x) => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3);
  return hit.length ? { permisos: PERMISOS, ...Object.fromEntries(hit.map(([k, v]) => [k, v])) } : { permisos: PERMISOS, temas: Object.entries(MANUAL).map(([k, v]) => ({ tema: k, titulo: v.titulo })) };
}
module.exports = { MANUAL, PERMISOS, buscar };
