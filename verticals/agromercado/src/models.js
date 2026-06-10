'use strict';

/**
 * AgroMercadoDigital — Sequelize models
 * National agricultural marketplace for Venezuela. Built by ISTC (Ingeniería y
 * Servicios Tecnológicos Colón); AI layer by Digit2AI. Every table is
 * multi-tenant (tenant_id) with an am_ prefix.
 *
 * Tables: am_users, am_products, am_auctions, am_bids, am_fx_rates,
 *         am_kyc, am_directory, am_farms, am_service_requests
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// Default tenant for the public AgroMercado instance. Grupo Agrollano (white-label
// "AgrollanoDigital") would run as a separate tenant_id.
const DEFAULT_TENANT = 1;

// ─── am_users ───────────────────────────────────────────────────────────────
// Unified accounts keyed by Cédula/RIF. Roles: admin | producer | buyer.
const User = sequelize.define('AmUser', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  cedula_rif: { type: DataTypes.STRING(20), allowNull: false },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  role: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'buyer' }, // admin|producer|buyer
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  password_hash: { type: DataTypes.STRING(255) },
  phone: { type: DataTypes.STRING(40) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_users', timestamps: false,
  indexes: [{ unique: true, fields: ['tenant_id', 'cedula_rif'] }]
});

// ─── am_products ──────────────────────────────────────────────────────────
// Prices normalized in USD; rendered to VES via the FX module. metadata = EAV
// JSONB so each category carries its own critical attributes (GIN-indexed).
const Product = sequelize.define('AmProduct', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  title: { type: DataTypes.STRING(255), allowNull: false },
  category_id: { type: DataTypes.STRING(20), allowNull: false }, // cat_01..cat_08
  price_usd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  location_state: { type: DataTypes.STRING(50), allowNull: false },
  vendor_id: { type: DataTypes.UUID },
  condition: { type: DataTypes.STRING(20) }, // nuevo|usado
  metadata: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING(20), defaultValue: 'active' }, // active|sold|paused
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_products', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['category_id'] }, { fields: ['location_state'] }]
});

// ─── am_auctions ──────────────────────────────────────────────────────────
const Auction = sequelize.define('AmAuction', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  title: { type: DataTypes.STRING(255), allowNull: false },
  category_id: { type: DataTypes.STRING(20), allowNull: false },
  lots: { type: DataTypes.INTEGER, defaultValue: 1 },
  start_price_usd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  current_bid_usd: { type: DataTypes.DECIMAL(12, 2) },
  base_increment_usd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 50 },
  starts_at: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING(20), defaultValue: 'scheduled' }, // scheduled|live|closed
  location: { type: DataTypes.STRING(120) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_auctions', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }]
});

// ─── am_bids ──────────────────────────────────────────────────────────────
const Bid = sequelize.define('AmBid', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  auction_id: { type: DataTypes.BIGINT, allowNull: false },
  bidder_id: { type: DataTypes.UUID },
  amount_usd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_bids', timestamps: false,
  indexes: [{ fields: ['auction_id', 'created_at'] }, { fields: ['tenant_id'] }]
});

// ─── am_fx_rates ──────────────────────────────────────────────────────────
// BCV official + parallel reference. Polled twice daily (09:00 & 13:00).
const FxRate = sequelize.define('AmFxRate', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  bcv_ves: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
  parallel_ves: { type: DataTypes.DECIMAL(14, 4) },
  source: { type: DataTypes.STRING(40) },
  fetched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_fx_rates', timestamps: false,
  indexes: [{ fields: ['tenant_id', 'fetched_at'] }]
});

// ─── am_kyc ───────────────────────────────────────────────────────────────
const Kyc = sequelize.define('AmKyc', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  user_id: { type: DataTypes.UUID },
  cedula_rif: { type: DataTypes.STRING(20), allowNull: false },
  doc_url: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING(20), defaultValue: 'pending' }, // pending|approved|rejected
  reviewed_by: { type: DataTypes.UUID },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_kyc', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }]
});

// ─── am_directory ─────────────────────────────────────────────────────────
const Directory = sequelize.define('AmDirectory', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  nombre: { type: DataTypes.STRING(120), allowNull: false },
  profession: { type: DataTypes.STRING(60), allowNull: false }, // veterinario|zootecnista|inseminador
  state: { type: DataTypes.STRING(50) },
  certification: { type: DataTypes.STRING(120) },
  contact: { type: DataTypes.STRING(120) },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_directory', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['profession'] }]
});

// ─── am_farms ─────────────────────────────────────────────────────────────
const Farm = sequelize.define('AmFarm', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  owner_id: { type: DataTypes.UUID },
  name: { type: DataTypes.STRING(120) },
  state: { type: DataTypes.STRING(50) },
  lat: { type: DataTypes.DECIMAL(9, 6) },
  lng: { type: DataTypes.DECIMAL(9, 6) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_farms', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }]
});

// ─── am_service_requests ──────────────────────────────────────────────────
// Financiamiento + logística leads.
const ServiceRequest = sequelize.define('AmServiceRequest', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TENANT },
  type: { type: DataTypes.STRING(20), allowNull: false }, // financiamiento|logistica
  requester_id: { type: DataTypes.UUID },
  payload: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING(20), defaultValue: 'new' }, // new|in_progress|done
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'am_service_requests', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['type'] }]
});

// Associations
User.hasMany(Product, { foreignKey: 'vendor_id' });
Product.belongsTo(User, { foreignKey: 'vendor_id' });
Auction.hasMany(Bid, { foreignKey: 'auction_id' });
Bid.belongsTo(Auction, { foreignKey: 'auction_id' });

module.exports = {
  sequelize, DEFAULT_TENANT,
  User, Product, Auction, Bid, FxRate, Kyc, Directory, Farm, ServiceRequest
};
