// =====================================================
// Account store — cuentas + créditos (ecpf_users, ecpf_credit_tx).
//
// Sistema de usuarios PROPIO de la app (separado del CRM). Mismo patrón que
// models/championship.js: Sequelize contra DATABASE_URL con FALLBACK EN MEMORIA
// (ECPF_FORCE_MEMORY=1 o BD inalcanzable) detrás de la misma interfaz, para que
// el SIT y la demo nunca se bloqueen.
//
// Las operaciones de crédito son ATÓMICAS en Postgres (UPDATE ... RETURNING con
// guarda de saldo) para que dos análisis simultáneos no dejen el saldo negativo.
// =====================================================

'use strict';

const { DataTypes, QueryTypes } = require('sequelize');
const { getSequelize } = require('./index');

let sequelize = null;
let User = null, Tx = null;
let usingMemory = false;
let started = false;
const memUsers = []; let umSeq = 0;
const memTx = []; let txSeq = 0;

function defineModels(seq) {
  User = seq.define('ECPFUser', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(120), allowNull: false },
    nombre: { type: DataTypes.STRING(150) },
    credits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { tableName: 'ecpf_users', timestamps: false });

  Tx = seq.define('ECPFCreditTx', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    dollars: { type: DataTypes.DECIMAL(8, 2) },
    stripe_payment_intent_id: { type: DataTypes.STRING(80) },
    analysis_type: { type: DataTypes.STRING(20) },
    sesion_id: { type: DataTypes.BIGINT },
    description: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { tableName: 'ecpf_credit_tx', timestamps: false });
}

async function init() {
  if (started) return { mode: usingMemory ? 'memory' : 'postgres' };
  started = true;
  if (process.env.ECPF_FORCE_MEMORY === '1') { usingMemory = true; return { mode: 'memory' }; }
  try {
    sequelize = getSequelize();
    await sequelize.authenticate();
    defineModels(sequelize);
    await User.sync({ alter: false });
    await Tx.sync({ alter: false });
    return { mode: 'postgres' };
  } catch (err) {
    usingMemory = true; User = null; Tx = null;
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'account_db_fallback_memory', error: err.message }));
    return { mode: 'memory' };
  }
}

function plain(u) { return u ? { id: u.id, email: u.email, nombre: u.nombre, credits: u.credits, created_at: u.created_at } : null; }

async function findByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (usingMemory || !User) return memUsers.find((u) => u.email === e) || null;
  const r = await User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), e) });
  return r ? r.get({ plain: true }) : null;
}

async function findById(id) {
  const pid = String(id);
  if (usingMemory || !User) return memUsers.find((u) => String(u.id) === pid) || null;
  const r = await User.findByPk(id);
  return r ? r.get({ plain: true }) : null;
}

// Crea el usuario con saldo inicial `credits` (bono de bienvenida, normalmente 0).
async function createUser({ email, password_hash, nombre, credits }) {
  const e = String(email).trim().toLowerCase();
  const c = credits || 0;
  if (usingMemory || !User) {
    const row = { id: ++umSeq, email: e, password_hash, nombre: nombre || null, credits: c, created_at: new Date() };
    memUsers.push(row);
    if (c) memTx.push({ id: ++txSeq, user_id: row.id, kind: 'bonus', credits: c, description: 'welcome bonus', created_at: new Date() });
    return plain(row);
  }
  const row = await User.create({ email: e, password_hash, nombre: nombre || null, credits: c });
  if (c) await Tx.create({ user_id: row.id, kind: 'bonus', credits: c, description: 'welcome bonus' });
  return plain(row.get({ plain: true }));
}

async function getBalance(userId) {
  const u = await findById(userId);
  return u ? u.credits : 0;
}

// Suma créditos atómicamente + registra la transacción. Devuelve el nuevo saldo.
async function addCredits(userId, credits, meta = {}) {
  const n = parseInt(credits, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error('invalid credit amount');
  if (usingMemory || !User) {
    const u = memUsers.find((x) => String(x.id) === String(userId));
    if (!u) throw new Error('user not found');
    u.credits += n;
    memTx.push({ id: ++txSeq, user_id: u.id, kind: meta.kind || 'purchase', credits: n, dollars: meta.dollars || null, stripe_payment_intent_id: meta.payment_intent || null, description: meta.description || null, created_at: new Date() });
    return u.credits;
  }
  const [rows] = await sequelize.query(
    'UPDATE ecpf_users SET credits = credits + :n WHERE id = :id RETURNING credits',
    { replacements: { n, id: userId } }
  );
  if (!rows || !rows.length) throw new Error('user not found');
  await Tx.create({ user_id: userId, kind: meta.kind || 'purchase', credits: n, dollars: meta.dollars || null, stripe_payment_intent_id: meta.payment_intent || null, description: meta.description || null });
  return rows[0].credits;
}

// Descuenta 1 crédito atómicamente SOLO si el saldo es >= 1.
// Devuelve { ok:true, balance } o { ok:false, reason:'insufficient', balance }.
async function debitOne(userId, meta = {}) {
  if (usingMemory || !User) {
    const u = memUsers.find((x) => String(x.id) === String(userId));
    if (!u) return { ok: false, reason: 'user_not_found', balance: 0 };
    if (u.credits < 1) return { ok: false, reason: 'insufficient', balance: u.credits };
    u.credits -= 1;
    memTx.push({ id: ++txSeq, user_id: u.id, kind: 'debit', credits: -1, analysis_type: meta.analysis_type || null, sesion_id: meta.sesion_id || null, description: meta.description || null, created_at: new Date() });
    return { ok: true, balance: u.credits };
  }
  const [rows] = await sequelize.query(
    'UPDATE ecpf_users SET credits = credits - 1 WHERE id = :id AND credits >= 1 RETURNING credits',
    { replacements: { id: userId } }
  );
  if (!rows || !rows.length) {
    const bal = await getBalance(userId);
    return { ok: false, reason: 'insufficient', balance: bal };
  }
  await Tx.create({ user_id: userId, kind: 'debit', credits: -1, analysis_type: meta.analysis_type || null, sesion_id: meta.sesion_id || null, description: meta.description || null });
  return { ok: true, balance: rows[0].credits };
}

// Reembolsa 1 crédito (si un análisis falla después de cobrar).
async function refundOne(userId, meta = {}) {
  try { return await addCredits(userId, 1, { kind: 'refund', description: meta.description || 'refund' }); }
  catch (e) { return null; }
}

// ¿Ya se acreditó este PaymentIntent? (idempotencia del webhook/confirm).
async function paymentAlreadyCredited(pi) {
  if (!pi) return false;
  if (usingMemory || !Tx) return memTx.some((t) => t.stripe_payment_intent_id === pi);
  const r = await Tx.findOne({ where: { stripe_payment_intent_id: pi } });
  return !!r;
}

async function listTx(userId, limit = 50) {
  if (usingMemory || !Tx) return memTx.filter((t) => String(t.user_id) === String(userId)).sort((a, b) => b.id - a.id).slice(0, limit);
  const rows = await Tx.findAll({ where: { user_id: userId }, order: [['id', 'DESC']], limit });
  return rows.map((r) => r.get({ plain: true }));
}

function mode() { return usingMemory ? 'memory' : (User ? 'postgres' : 'uninitialized'); }

module.exports = { init, mode, findByEmail, findById, createUser, getBalance, addCredits, debitOne, refundOne, paymentAlreadyCredited, listTx };
