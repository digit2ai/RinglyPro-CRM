'use strict';

/**
 * SpeakUp AI Factory — append-only audit trail (su_audit).
 * Every job transition, every denial, every dispatch and callback writes a row.
 * Nothing in the factory updates or deletes an audit row.
 * A failed audit write is logged loudly and never swallowed silently.
 */

const { Audit } = require('../models');
const security = require('./security');

async function record({ tenant_id, user_id, actor, action, entity, entity_id, from_status, to_status, detail, req }) {
  try {
    return await Audit.create({
      tenant_id, user_id: user_id || null,
      actor: String(actor || 'system').slice(0, 200),
      action: String(action || '').slice(0, 60),
      entity: entity || null, entity_id: entity_id || null,
      from_status: from_status || null, to_status: to_status || null,
      detail: detail || {},
      ip_hash: req ? security.ipHash(req) : null
    });
  } catch (e) {
    console.error('SPEAKUP AUDIT WRITE FAILED', action, entity, entity_id, e.message);
    return null;
  }
}

async function forEntity(tenant_id, entity, entity_id) {
  return Audit.findAll({ where: { tenant_id, entity, entity_id }, order: [['id', 'ASC']] });
}

module.exports = { record, forEntity };
