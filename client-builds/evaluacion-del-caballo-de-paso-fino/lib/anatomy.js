// =====================================================
// Anatomía equina — 22 puntos anatómicos (fuente de verdad para el seed de
// ecpf_puntos_anatomicos Y para la detección de contacto de casco en footfall.js).
// Los 4 puntos casco_* son los que tocan el suelo; el resto da contexto de pose.
// =====================================================

'use strict';

const PUNTOS = [
  { codigo: 'hocico', nombre: 'Hocico', region: 'cabeza' },
  { codigo: 'nuca', nombre: 'Nuca', region: 'cabeza' },
  { codigo: 'cruz', nombre: 'Cruz', region: 'tronco' },
  { codigo: 'dorso', nombre: 'Dorso', region: 'tronco' },
  { codigo: 'grupa', nombre: 'Grupa', region: 'tronco' },
  { codigo: 'base_cola', nombre: 'Base de la cola', region: 'tronco' },
  { codigo: 'codo_ant_izq', nombre: 'Codo anterior izq', region: 'ant_izq' },
  { codigo: 'rodilla_ant_izq', nombre: 'Rodilla anterior izq', region: 'ant_izq' },
  { codigo: 'menudillo_ant_izq', nombre: 'Menudillo anterior izq', region: 'ant_izq' },
  { codigo: 'casco_ant_izq', nombre: 'Casco anterior izq', region: 'ant_izq' },
  { codigo: 'codo_ant_der', nombre: 'Codo anterior der', region: 'ant_der' },
  { codigo: 'rodilla_ant_der', nombre: 'Rodilla anterior der', region: 'ant_der' },
  { codigo: 'menudillo_ant_der', nombre: 'Menudillo anterior der', region: 'ant_der' },
  { codigo: 'casco_ant_der', nombre: 'Casco anterior der', region: 'ant_der' },
  { codigo: 'babilla_post_izq', nombre: 'Babilla posterior izq', region: 'post_izq' },
  { codigo: 'corvejon_post_izq', nombre: 'Corvejón posterior izq', region: 'post_izq' },
  { codigo: 'menudillo_post_izq', nombre: 'Menudillo posterior izq', region: 'post_izq' },
  { codigo: 'casco_post_izq', nombre: 'Casco posterior izq', region: 'post_izq' },
  { codigo: 'babilla_post_der', nombre: 'Babilla posterior der', region: 'post_der' },
  { codigo: 'corvejon_post_der', nombre: 'Corvejón posterior der', region: 'post_der' },
  { codigo: 'menudillo_post_der', nombre: 'Menudillo posterior der', region: 'post_der' },
  { codigo: 'casco_post_der', nombre: 'Casco posterior der', region: 'post_der' }
];

// The four ground-contacting hoof points, mapped to their limb (extremidad).
const CASCOS = {
  casco_ant_izq: 'ant_izq',
  casco_ant_der: 'ant_der',
  casco_post_izq: 'post_izq',
  casco_post_der: 'post_der'
};

const EXTREMIDADES = ['ant_izq', 'ant_der', 'post_izq', 'post_der'];

function lado(extremidad) { return extremidad.endsWith('_izq') ? 'izq' : 'der'; }
function tren(extremidad) { return extremidad.startsWith('ant_') ? 'ant' : 'post'; }

// Two limbs are a diagonal pair if they're opposite side AND opposite tren.
function esDiagonal(a, b) { return lado(a) !== lado(b) && tren(a) !== tren(b); }
// Lateral pair: same side, opposite tren.
function esLateral(a, b) { return lado(a) === lado(b) && tren(a) !== tren(b); }

module.exports = { PUNTOS, CASCOS, EXTREMIDADES, lado, tren, esDiagonal, esLateral };
