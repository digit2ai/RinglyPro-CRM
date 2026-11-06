'use strict';
/**
 * del Calor al Sabor (Delca, Maracaibo) — the menu, transcribed from the
 * restaurant's own PDF ("menu-delca-mcbo", 7 pages, prices in EUR as printed).
 *
 * This file is the SEED of dlc_products and the matching vocabulary Dalia uses
 * to recognise an item in plain speech. Once seeded, the PRICE and the
 * availability live in the database (the owner edits them in the admin table);
 * the names, descriptions and match terms live here.
 *
 * Match DSL: groups separated by " + ", alternatives inside a group by "|".
 * Every group must appear in what the customer said. A group starting with "?"
 * is the VARIANT (sencilla/especial, x1/x2...): when only that group is missing
 * and several items tie, Dalia asks which one instead of guessing.
 * `not` lists words that rule the item out ("pollo" must not be "pollo crunchy").
 */

const CATEGORIES = [
  { id: 'hamburguesas', name: 'Hamburguesas Extra Whoppers', page: 2, tone: 'red' },
  { id: 'panes', name: 'Panes', page: 3, tone: 'yellow' },
  { id: 'pepitos', name: 'Pepitos', page: 3, tone: 'yellow' },
  { id: 'promo-perrito', name: 'Promo de Perrito', page: 3, tone: 'yellow', note: 'Pan con salchicha de pollo, repollo, papas y salsas' },
  { id: 'arepas-cabimeras', name: 'Arepas Cabimeras', page: 3, tone: 'yellow', note: 'Arepa asada o frita, 1/4 queso de mano, jamón ahumado, queso amarillo, queso blanco rayado, huevo, lechuga, tomate y salsas' },
  { id: 'promos', name: 'Promos Delca', page: 4, tone: 'red' },
  { id: 'asaditas', name: 'Asaditas', page: 4, tone: 'red' },
  { id: 'promo-resuelve', name: 'Promo Resuelve', page: 4, tone: 'red', note: 'Hamburguesas Jr de 70 gr. con 1/4 de queso de mano, papas y salsas (carne, pollo o pollo crunchy)' },
  { id: 'arepas-fritas', name: 'Arepas Fritas pequeñas', page: 5, tone: 'yellow' },
  { id: 'arepas-asadas', name: 'Arepas Asadas y Corianas', page: 5, tone: 'yellow' },
  { id: 'asaditas-carne-asada', name: 'Asaditas de Carne Asada', page: 5, tone: 'yellow' },
  { id: 'pinchos', name: 'Pinchos', page: 6, tone: 'red' },
  { id: 'tumbarranchos', name: 'Tumbarranchos', page: 6, tone: 'red' },
  { id: 'parrilla', name: 'Parrilla Delca', page: 6, tone: 'red', note: 'Filet de pollo, de lomito, o mixta, arepa asada, 1 rueda queso de mano, pico de gallo' },
  { id: 'granjero', name: 'Granjero Delca', page: 6, tone: 'red' },
  { id: 'wraps', name: 'Wraps', page: 6, tone: 'red' },
  { id: 'patacones', name: 'Patacones', page: 7, tone: 'yellow' },
  { id: 'promo-patacon', name: 'Promo Patacón', page: 7, tone: 'yellow' },
  { id: 'postres', name: 'Postre', page: 7, tone: 'yellow' },
  { id: 'otras-delicias', name: 'Otras Delicias', page: 7, tone: 'yellow' },
  { id: 'bebidas', name: 'Bebidas', page: 7, tone: 'yellow' },
  { id: 'adicionales', name: 'Adicionales', page: 7, tone: 'yellow' }
];

const ITEMS = [];
function add(cat, code, name, euros, desc, match, extra) {
  ITEMS.push(Object.assign({ cat, code, name, price_cents: Math.round(euros * 100), desc: desc || '', match, kind: 'product' }, extra || {}));
}

/* ---- Hamburguesas Extra Whoppers (page 2) ---- */
const H = 'hamburguesa|burger|whopper|hamburguesas';
const SEN = '1/2 queso de mano, papas rayadas, repollo blanco y salsas';
const ESP = '1/2 queso de mano, jamón ahumado, queso amarillo, tocineta, papas rayadas, repollo blanco y salsas';
[['carne', 'Carne', 9.00, 11.70, 'carne', 'mechada|asada|jr'],
 ['pollo', 'Pollo', 8.00, 10.70, 'pollo', 'crunchy|jr'],
 ['lomito', 'Lomito', 12.60, 15.30, 'lomito', 'jr'],
 ['pernil', 'Pernil', 8.10, 10.80, 'pernil', 'jr'],
 ['chuleta', 'Chuleta', 11.50, 14.20, 'chuleta', 'jr'],
 ['crunchy', 'Crunchy', 7.50, 10.20, 'crunchy', 'jr']].forEach(([k, n, s, e, m, not]) => {
  add('hamburguesas', `hamb-${k}-sencilla`, `Hamburguesa de ${n} Sencilla`, s, SEN, `${H} + ${m} + ?sencilla|sencillas|normal`, { not });
  add('hamburguesas', `hamb-${k}-especial`, `Hamburguesa de ${n} Especial`, e, ESP, `${H} + ${m} + ?especial|especiales`, { not });
});
add('hamburguesas', 'king-delca', 'King Delca', 4.75, 'Queso facilista, lechuga y mayonesa', 'king');

/* ---- Panes (page 3) ---- */
const P = 'pan|panes';
const Q4 = '1/4 queso de mano, papas rayadas, repollo blanco y salsas';
add('panes', 'pan-salchicha', 'Pan con Salchicha', 3.80, 'Papas rayadas, repollo blanco y salsas', `${P} + salchicha`, { not: 'queso' });
add('panes', 'pan-salchicha-queso', 'Pan con Salchicha y Queso', 4.50, Q4, `${P} + salchicha + queso`);
add('panes', 'pan-queso', 'Pan con Queso', 3.80, '1/2 queso de mano, papas rayadas, repollo blanco y salsas', `${P} + queso`, { not: 'salchicha|huevo|pernil|pollo|lomito|mechada' });
add('panes', 'pan-huevo-queso', 'Pan con Huevo y Queso', 3.60, Q4, `${P} + huevo + queso`);
add('panes', 'pan-pernil-queso', 'Pan con Pernil y Queso', 6.60, Q4, `${P} + pernil`);
add('panes', 'pan-pollo-queso', 'Pan con Pollo y Queso', 5.60, Q4, `${P} + pollo`);
add('panes', 'pan-lomito-queso', 'Pan con Filet de Lomito y Queso', 9.10, Q4, `${P} + lomito`);
add('panes', 'pan-mechada-queso', 'Pan con Carne Mechada y Queso', 7.50, Q4, `${P} + mechada`);

/* ---- Pepitos (page 3) ---- */
const PG = '1/2 queso de mano, pico de gallo, queso blanco rayado y salsas';
add('pepitos', 'pepito-pernil', 'Pepito de Pernil', 10.60, PG, 'pepito|pepitos + pernil');
add('pepitos', 'pepito-pollo', 'Pepito de Pollo', 8.60, PG, 'pepito|pepitos + pollo');
add('pepitos', 'pepito-lomito', 'Pepito de Lomito', 11.60, PG, 'pepito|pepitos + lomito');

/* ---- Promo de Perrito (page 3) ---- */
const PR = 'perrito|perro|perros|perro caliente|hot dog|hotdog';
add('promo-perrito', 'perrito-x1', 'Promo Perrito X1', 2.50, '1 perrito personal', `${PR} + ?x1|personal|uno solo`);
add('promo-perrito', 'perrito-x2', 'Promo Perrito X2', 5.75, '2 perritos + refresco bombita', `${PR} + ?x2|bombita`);
add('promo-perrito', 'perrito-x4', 'Promo Perrito X4', 11.00, '4 perritos + refresco de 2 lts.', `${PR} + ?x4`);
add('promo-perrito', 'perrito-x6', 'Promo Perrito X6', 16.00, '6 perritos + refresco de 2 lts.', `${PR} + ?x6`);

/* ---- Arepas Cabimeras (page 3) ---- */
add('arepas-cabimeras', 'cabimera-pernil', 'Arepa Cabimera de Pernil', 10.40, '', 'cabimera|cabimeras + pernil');
add('arepas-cabimeras', 'cabimera-pollo', 'Arepa Cabimera de Pollo', 8.40, '', 'cabimera|cabimeras + pollo');
add('arepas-cabimeras', 'cabimera-lomito', 'Arepa Cabimera de Lomito', 11.40, '', 'cabimera|cabimeras + lomito');
add('arepas-cabimeras', 'cabimera-mechada', 'Arepa Cabimera de Carne Mechada', 12.20, '', 'cabimera|cabimeras + mechada');

/* ---- Promos Delca (page 4) ---- */
const PW = '1/4 queso de mano, jamón ahumado, queso amarillo, papas rayadas, repollo blanco y salsas';
const OPT = ['carne', 'pollo', 'pollo crunchy'];
add('promos', 'promo-delca', 'Promo Delca', 14.00, `2 Whoppers carne, pollo o pollo crunchy. ${PW} + 1 litro`, 'promo delca', { options: OPT });
add('promos', 'media-promo', 'Media Promo', 6.25, `1 Whopper carne, pollo o pollo crunchy. ${PW}`, 'media promo', { not: 'lomito|pernil', options: OPT });
add('promos', 'media-promo-lomito', 'Media Promo Lomito', 10.25, `1 Whopper. ${PW}`, 'media promo + lomito');
add('promos', 'media-promo-pernil', 'Media Promo Pernil', 7.75, `1 Whopper. ${PW}`, 'media promo + pernil');
add('promos', 'promo-crunchy', 'Promo Crunchy', 33.00, `4 Whoppers carne, pollo o pollo crunchy. ${PW}, servicio de tequeños, servicio de deditos crunchy + 2 litros`, 'promo crunchy', { options: OPT });
add('promos', 'promo-pa-5', 'Promo Pa 5', 32.25, `5 Whoppers carne, pollo o pollo crunchy. ${PW} + 2 litros`, 'promo pa 5|promo pa cinco|promo para 5|promo para cinco|pa cinco|pa 5', { options: OPT });

/* ---- Asaditas (page 4) ---- */
const AS = '2 unidades, pico de gallo, queso blanco rayado y salsas';
add('asaditas', 'asaditas-pollo', 'Asaditas Pollo', 6.80, AS, 'asadita|asaditas + pollo');
add('asaditas', 'asaditas-lomito', 'Asaditas Lomito', 12.80, AS, 'asadita|asaditas + lomito');
add('asaditas', 'asaditas-mechada', 'Asaditas Mechada', 10.00, AS, 'asadita|asaditas + mechada');
add('asaditas', 'asaditas-pernil', 'Asaditas Pernil', 10.00, AS, 'asadita|asaditas + pernil');

/* ---- Promo Resuelve (page 4) ---- */
const RS = 'resuelve';
add('promo-resuelve', 'resuelve-x1', 'Promo Resuelve X1', 4.50, '1 hamburguesa Jr', `${RS} + ?x1`, { options: OPT });
add('promo-resuelve', 'resuelve-x2', 'Promo Resuelve X2', 10.00, '2 hamburguesas Jr con refresco de 2 lts.', `${RS} + ?x2`, { options: OPT });
add('promo-resuelve', 'resuelve-x4', 'Promo Resuelve X4', 19.00, '4 hamburguesas Jr con refresco de 2 lts.', `${RS} + ?x4`, { options: OPT });
add('promo-resuelve', 'resuelve-x6', 'Promo Resuelve X6', 28.00, '6 hamburguesas Jr con refresco de 2 lts.', `${RS} + ?x6`, { options: OPT });

/* ---- Arepas fritas pequeñas (page 5) ---- */
const A = 'arepa|arepas|arepita|arepitas';
const LT = '1/4 queso de mano, lechuga, tomate y salsas';
const NOF = 'asada|asadas|coriana|corianas|cabimera';
add('arepas-fritas', 'frita-queso', 'Arepa Frita con Queso', 3.90, '3/4 queso de mano, lechuga, tomate y salsas', `${A} + queso + ?frita|fritas`, { not: `jamon|pernil|pollo|lomito|mechada|${NOF}` });
add('arepas-fritas', 'frita-jamon-queso', 'Arepa Frita con Jamón y Queso', 4.90, '3/4 queso de mano, jamón ahumado, lechuga, tomate y salsas', `${A} + jamon + ?frita|fritas`, { not: NOF });
add('arepas-fritas', 'frita-pernil-queso', 'Arepa Frita con Pernil y Queso', 6.00, LT, `${A} + pernil + ?frita|fritas`, { not: NOF });
add('arepas-fritas', 'frita-pollo-queso', 'Arepa Frita con Pollo y Queso', 5.00, LT, `${A} + pollo + ?frita|fritas`, { not: NOF });
add('arepas-fritas', 'frita-lomito-queso', 'Arepa Frita con Lomito y Queso', 8.50, LT, `${A} + lomito + ?frita|fritas`, { not: NOF });
add('arepas-fritas', 'frita-mechada-queso', 'Arepa Frita con Mechada y Queso', 6.90, LT, `${A} + mechada + ?frita|fritas`, { not: NOF });

/* ---- Asadas y corianas (page 5) ---- */
const AJ = '1/2 queso de mano, lechuga, jamón ahumado, tomate y salsas';
const NOA = 'frita|fritas|cabimera';
const AA = '?asada|asadas|coriana|corianas';
add('arepas-asadas', 'asada-queso', 'Arepa Asada con Queso', 3.80, '1 rueda queso de mano, jamón ahumado, lechuga, tomate y salsas', `${A} + queso + ${AA}`, { not: `jamon|pernil|pollo|lomito|carne|${NOA}` });
add('arepas-asadas', 'asada-jamon-queso', 'Arepa Asada con Jamón y Queso', 4.80, '1 rueda queso de mano, jamón ahumado, lechuga, tomate y salsas', `${A} + jamon + ${AA}`, { not: NOA });
add('arepas-asadas', 'asada-pernil-queso', 'Arepa Asada con Pernil y Queso', 9.90, AJ, `${A} + pernil + ${AA}`, { not: NOA });
add('arepas-asadas', 'asada-pollo-queso', 'Arepa Asada con Pollo y Queso', 7.90, AJ, `${A} + pollo + ${AA}`, { not: NOA });
add('arepas-asadas', 'asada-lomito-queso', 'Arepa Asada con Lomito y Queso', 10.90, AJ, `${A} + lomito + ${AA}`, { not: NOA });
add('arepas-asadas', 'asada-carne-asada', 'Arepa Asada con Carne Asada', 5.20, '150 gr. de carne asada, salsa, jamón ahumado, pico de gallo y queso rallado', `${A} + carne asada`, { not: 'asadita|asaditas|frita|fritas' });

/* ---- Asaditas de carne asada (page 5) ---- */
add('asaditas-carne-asada', 'asaditas-carne-asada', 'Asaditas de Carne Asada', 7.00, '2 unidades, pico de gallo, queso rallado y salsa', 'asadita|asaditas + carne asada');

/* ---- Pinchos (page 6) ---- */
add('pinchos', 'pincho-lomito', 'Pincho de Lomito', 17.50, '280 grs de lomito, arepa asada o frita, 1/2 queso de mano y ensalada de repollo', 'pincho|pinchos + lomito', { not: 'mixto|solo' });
add('pinchos', 'pincho-pollo', 'Pincho de Pollo', 10.70, '280 grs de pollo, arepa asada o frita, 1/2 queso de mano y ensalada de repollo', 'pincho|pinchos + pollo', { not: 'mixto|solo' });
add('pinchos', 'pincho-mixto', 'Pincho Mixto', 15.50, '140 grs de pollo y lomito, arepa asada o frita, 1/2 queso de mano y ensalada de repollo', 'pincho|pinchos + mixto');

/* ---- Tumbarranchos (page 6) ---- */
const TB = 'Mortadela, 1/2 queso de mano, repollo blanco, mayonesa y salsa roja';
const T = 'tumbarrancho|tumbarranchos|tumba rancho|tumba ranchos';
add('tumbarranchos', 'tumba-queso', 'Tumbarrancho de Queso', 3.60, TB, `${T} + ?queso|sencillo`, { not: 'pernil|pollo|lomito|mechada' });
add('tumbarranchos', 'tumba-pernil', 'Tumbarrancho de Pernil', 6.40, TB, `${T} + pernil`);
add('tumbarranchos', 'tumba-mechada', 'Tumbarrancho de Carne Mechada', 7.30, TB, `${T} + mechada`);
add('tumbarranchos', 'tumba-pollo', 'Tumbarrancho de Pollo', 5.40, TB, `${T} + pollo`);
add('tumbarranchos', 'tumba-lomito', 'Tumbarrancho de Lomito', 8.90, TB, `${T} + lomito`);

/* ---- Parrilla y Granjero Delca (page 6) ---- */
add('parrilla', 'parrilla-lomito', 'Parrilla Delca de Lomito', 19.80, '', 'parrilla + lomito', { not: 'mixta|mixto' });
add('parrilla', 'parrilla-pollo', 'Parrilla Delca de Pollo', 10.60, '', 'parrilla + pollo', { not: 'mixta|mixto' });
add('parrilla', 'parrilla-mixta', 'Parrilla Delca Mixta', 15.20, '', 'parrilla + mixta|mixto');
add('granjero', 'granjero-delca', 'Granjero Delca', 10.40, 'Queso facilista, 1/2 queso de mano, lechuga, tomate y salsas + servicio de papas fritas', 'granjero');

/* ---- Wraps (page 6) ---- */
const W = 'wrap|wraps|rap';
add('wraps', 'wrap-queso', 'Wrap de Queso', 5.50, '1 rueda queso de mano, lechuga, tomate y salsas', `${W} + ?queso`, { not: 'pollo|lomito|pernil|crunchy' });
add('wraps', 'wrap-pollo', 'Wrap de Pollo', 9.10, '1/2 queso de mano, lechuga, tomate y salsas', `${W} + pollo`, { not: 'crunchy' });
add('wraps', 'wrap-lomito', 'Wrap de Lomito', 12.10, '1 rueda queso de mano, lechuga, tomate y salsas', `${W} + lomito`);
add('wraps', 'wrap-pernil', 'Wrap de Pernil', 11.10, '1/2 queso de mano, lechuga, tomate y salsas', `${W} + pernil`);
add('wraps', 'wrap-crunchy', 'Wrap de Pollo Crunchy', 7.00, '1/2 queso de mano, lechuga, tomate y salsas', `${W} + crunchy`);

/* ---- Patacones (page 7) ---- */
const PT = 'patacon|patacones';
const PJ = '1/2 queso de mano, jamón ahumado, lechuga, tomate y salsas';
add('patacones', 'patacon-queso', 'Patacón con Queso', 5.80, '1 rueda queso de mano, lechuga y salsas', `${PT} + ?queso`, { not: 'jamon|pernil|pollo|lomito|chuleta|mechada|promo' });
add('patacones', 'patacon-jamon-queso', 'Patacón con Jamón y Queso', 6.80, '1 rueda queso de mano, jamón ahumado, lechuga, tomate y salsas', `${PT} + jamon`, { not: 'promo' });
add('patacones', 'patacon-pernil', 'Patacón con Pernil', 11.90, PJ, `${PT} + pernil`, { not: 'promo' });
add('patacones', 'patacon-pollo', 'Patacón con Pollo', 9.90, PJ, `${PT} + pollo`, { not: 'promo' });
add('patacones', 'patacon-lomito', 'Patacón con Lomito', 12.90, PJ, `${PT} + lomito`, { not: 'promo' });
add('patacones', 'patacon-chuleta', 'Patacón con Chuleta', 11.80, PJ, `${PT} + chuleta`, { not: 'promo' });
add('patacones', 'patacon-mechada', 'Patacón con Mechada', 13.70, PJ, `${PT} + mechada`, { not: 'promo' });
add('promo-patacon', 'promo-patacon', 'Promo Patacón', 16.50, '2 Patacones Jr de pollo, carne mechada o pernil con 1/4 de queso de mano y jamón + refresco de 1 lt.', `promo + ${PT}`, { options: ['pollo', 'carne mechada', 'pernil'] });

/* ---- Postre, otras delicias, bebidas (page 7) ---- */
add('postres', 'barquilla', 'Barquilla', 1.50, 'Postre', 'barquilla|barquillas|helado');
add('otras-delicias', 'deditos-crunchy', 'Deditos Crunchy', 3.50, '', 'dedito|deditos');
add('otras-delicias', 'papas-fritas', 'Papas Fritas', 4.00, '', 'papas fritas|papa frita|papitas');
add('otras-delicias', 'tequenos', 'Tequeños', 4.00, '', 'tequeno|tequenos');
add('bebidas', 'bebida-botella', 'Refresco Botella', 2.00, '', 'botella|refresco|refrescos', { not: 'litro|litros|lata|bombita|agua' });
add('bebidas', 'bebida-litro-medio', 'Refresco Litro y Medio', 3.00, '', 'litro y medio|1 5 litro');
add('bebidas', 'agua-grande', 'Agua Grande', 2.00, '', 'agua');
add('bebidas', 'bebida-lata', 'Refresco Lata', 2.50, '', 'lata|latas');
add('bebidas', 'te-lipton', 'Té Lipton', 3.00, '', 'lipton');
add('bebidas', 'te-delca', 'Té Delca', 3.00, '', 'te delca');
add('bebidas', 'nestea', 'Nestea', 2.50, '', 'nestea');

/* ---- Adicionales (page 7) — "services" added to another item ---- */
const AD = 'adicional|adicionales|extra|extras|agregale|agrega|agregar|con extra';
[['jamon', 'Jamón', 0.50], ['queso-amarillo', 'Queso Amarillo', 0.70], ['queso-de-mano', 'Queso de Mano', 0.70],
 ['tocineta', 'Tocineta', 1.50], ['arepa-pequena', 'Arepa Pequeña', 1.80], ['coriana-asada', 'Coriana/Asada', 1.00],
 ['huevo', 'Huevo', 0.50], ['salchicha', 'Salchicha', 1.40], ['carne-hamburguesa', 'Carne Hamburguesa', 4.40],
 ['carne-mechada', 'Carne Mechada', 4.40], ['filet-pollo', 'Filet de Pollo', 3.40], ['pernil', 'Pernil', 3.50],
 ['filet-lomito', 'Filet de Lomito', 8.00], ['chuleta', 'Chuleta', 6.90], ['pincho-pollo-solo', 'Pincho Pollo Solo', 8.30],
 ['pincho-lomito-solo', 'Pincho Lomito Solo', 15.50], ['yenyere-pollo', 'Yenyere Pollo', 2.50], ['yenyere-lomito', 'Yenyere Lomito', 6.00],
 ['pollo-crunchy', 'Pollo Crunchy', 2.90], ['mortadela', 'Mortadela', 0.40], ['proteina-promo', 'Proteína Promo', 2.00],
 ['queso-facilista', 'Queso Facilista', 0.20], ['jamon-promo', 'Jamón Promo', 0.50], ['amarillo-promo', 'Amarillo Promo', 0.50]
].forEach(([k, n, p]) => {
  const words = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const solo = /solo$/.test(k);
  const m = solo ? words : `${AD} + ${words}`;
  add('adicionales', `adic-${k}`, `Adicional ${n}`, p, '', m, { kind: 'service' });
});

module.exports = { CATEGORIES, ITEMS, BRAND: {
  name: 'del Calor al Sabor', short: 'Delca', city: 'Maracaibo', instagram: '@delcaloralsabor',
  slogan: 'El verdadero sabor de la ciudad', currency: 'EUR'
} };
