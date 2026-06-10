'use strict';

/**
 * AgroMercado — opt-in demo seeding (AGROMERCADO_SEED_DEMO=1).
 * Seeds one admin, one verified producer, sample products across categories,
 * a couple of auctions, an FX snapshot, and directory entries. Idempotent.
 */

const bcrypt = require('bcryptjs');
const { User, Product, Auction, FxRate, Directory, DEFAULT_TENANT } = require('../models');
const { CATEGORIES } = require('../categories');

async function seedSampleData(tenantId = DEFAULT_TENANT) {
  const existing = await Product.count({ where: { tenant_id: tenantId } });
  if (existing > 0) return { seeded: false, products: existing };

  const pw = await bcrypt.hash('AgroMercado2026!', 10);
  const [admin] = await User.findOrCreate({
    where: { tenant_id: tenantId, cedula_rif: 'V-00000001' },
    defaults: { nombre: 'Administrador ISTC', role: 'admin', is_verified: true, password_hash: pw }
  });
  const [producer] = await User.findOrCreate({
    where: { tenant_id: tenantId, cedula_rif: 'V-12345678' },
    defaults: { nombre: 'Finca La Esperanza', role: 'producer', is_verified: true, password_hash: pw, phone: '0414-0000000' }
  });

  const samples = [
    { category_id: 'cat_02', title: 'Toro Brahman registrado', price_usd: 3200, location_state: 'Apure', metadata: { raza: 'Brahman', edad: '24 meses', certificado_sada: true } },
    { category_id: 'cat_01', title: 'Tractor 4x4 90HP', price_usd: 18500, location_state: 'Portuguesa', metadata: { hp: 90, traccion: '4x4', marca: 'John Deere', anio: 2019, horas_uso: 1200 } },
    { category_id: 'cat_03', title: 'Urea 46% — tonelada', price_usd: 620, location_state: 'Guárico', metadata: { presentacion: 'tonelada', compuesto_activo: 'Urea 46%' } },
    { category_id: 'cat_06', title: 'Semilla de maíz híbrido', price_usd: 95, location_state: 'Barinas', metadata: { tasa_germinacion: '95%', variedad_hibrido: 'DK-390' } }
  ];
  for (const s of samples) await Product.create({ tenant_id: tenantId, vendor_id: producer.id, condition: 'usado', status: 'active', ...s });

  const cat02 = CATEGORIES.find(c => c.id === 'cat_02');
  await Auction.create({ tenant_id: tenantId, title: 'Remate de toros Brahman (45 lotes)', category_id: 'cat_02', lots: 45, start_price_usd: 2500, base_increment_usd: cat02.base_increment_usd, starts_at: new Date(Date.now() + 86400000), status: 'scheduled', location: 'Apure' });
  await Auction.create({ tenant_id: tenantId, title: 'Maquinaria agrícola (18 lotes)', category_id: 'cat_01', lots: 18, start_price_usd: 5000, base_increment_usd: 100, starts_at: new Date(Date.now() + 5 * 86400000), status: 'scheduled', location: 'Portuguesa' });

  await FxRate.findOrCreate({ where: { tenant_id: tenantId, source: 'seed' }, defaults: { bcv_ves: 572.68, parallel_ves: 802.07 } });

  await Directory.bulkCreate([
    { tenant_id: tenantId, nombre: 'Dr. José Pérez', profession: 'veterinario', state: 'Apure', certification: 'MV-INSAI', contact: '0414-1112233', is_verified: true },
    { tenant_id: tenantId, nombre: 'Ing. María Rojas', profession: 'zootecnista', state: 'Guárico', certification: 'Colegio de Ingenieros', contact: '0424-4445566', is_verified: true }
  ]);

  const products = await Product.count({ where: { tenant_id: tenantId } });
  return { seeded: true, products };
}

module.exports = { seedSampleData };
