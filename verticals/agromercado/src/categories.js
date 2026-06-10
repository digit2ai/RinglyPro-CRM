'use strict';

/**
 * AgroMercado — 8 structural categories (ISTC spec §3.4 + live site).
 * Each declares its critical EAV/JSONB metadata attributes and the per-category
 * base bid increment (Δ_base) used by the auction engine.
 */

const CATEGORIES = [
  { id: 'cat_01', name: 'Maquinaria Agrícola', slug: 'maquinaria',
    attrs: ['horas_uso', 'hp', 'traccion', 'marca', 'anio'], base_increment_usd: 100 },
  { id: 'cat_02', name: 'Semovientes', slug: 'semovientes',
    attrs: ['raza', 'edad', 'estatus_sanitario', 'certificado_sada'], base_increment_usd: 50 },
  { id: 'cat_03', name: 'Insumos Agrícolas', slug: 'insumos',
    attrs: ['presentacion', 'compuesto_activo'], base_increment_usd: 25 },
  { id: 'cat_04', name: 'Medicina Veterinaria', slug: 'medicina-veterinaria',
    attrs: ['registro_insai', 'lote', 'fecha_vencimiento', 'dosificacion_ml'], base_increment_usd: 20 },
  { id: 'cat_05', name: 'Servicios del Agro', slug: 'servicios',
    attrs: ['area_geografica', 'certificacion_profesional', 'tarifa_base'], base_increment_usd: 20 },
  { id: 'cat_06', name: 'Semillas y Cultivos', slug: 'semillas',
    attrs: ['tasa_germinacion', 'variedad_hibrido', 'resistencia_climatica'], base_increment_usd: 20 },
  { id: 'cat_07', name: 'Equipos e Implementos', slug: 'equipos',
    attrs: ['tipo', 'compatibilidad', 'estado'], base_increment_usd: 40 },
  { id: 'cat_08', name: 'Herramientas', slug: 'herramientas',
    attrs: ['tipo', 'material', 'estado'], base_increment_usd: 15 }
];

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Venezuela's 23 states + Distrito Capital.
const VE_STATES = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo',
  'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'Lara',
  'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre',
  'Táchira', 'Trujillo', 'La Guaira', 'Yaracuy', 'Zulia'
];

module.exports = { CATEGORIES, CATEGORY_BY_ID, VE_STATES };
