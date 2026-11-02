'use strict';
/**
 * Inventory + the outfit matrix. The matrix is every active shirt x every
 * active pair of trousers x every active pair of shoes (20 x 5 x 1 = 100 with
 * the starting wardrobe). It is rebuilt idempotently whenever inventory
 * changes; an outfit's favourite, rating and history survive because the row
 * is never deleted, only hidden while one of its garments is archived.
 */
const db = require('./db');
const stylist = require('./stylist');
const sketch = require('./sketch');

const ITEM_COLS = 'id, category, name, brand, garment_type, color_name, color_hex, color2_hex, pattern, notes, favorite, archived, is_slot, sort';

async function ensureMatrix(tenantId) {
  await db.exec(`INSERT INTO sty_outfits (tenant_id, shirt_id, pants_id, shoe_id)
    SELECT :t, s.id, p.id, sh.id FROM sty_items s, sty_items p, sty_items sh
    WHERE s.tenant_id=:t AND p.tenant_id=:t AND sh.tenant_id=:t
      AND s.category='shirt' AND p.category='pants' AND sh.category='shoes'
      AND NOT s.archived AND NOT p.archived AND NOT sh.archived
    ON CONFLICT ON CONSTRAINT sty_outfits_combo_uq DO NOTHING`, { t: tenantId });
}

async function items(tenantId, { includeArchived = false } = {}) {
  const rows = await db.sel(`SELECT ${ITEM_COLS},
      (SELECT id FROM sty_photos ph WHERE ph.item_id=i.id AND ph.tenant_id=i.tenant_id AND ph.kind='garment' ORDER BY is_primary DESC, id DESC LIMIT 1) AS photo_id,
      (SELECT COUNT(*)::int FROM sty_photos ph WHERE ph.item_id=i.id AND ph.tenant_id=i.tenant_id AND ph.kind='garment') AS photo_count
    FROM sty_items i WHERE tenant_id=:t ${includeArchived ? '' : 'AND NOT archived'} ORDER BY category, sort, id`, { t: tenantId });
  return rows;
}

/** Every visible outfit with its garments, scores and render state. */
async function outfits(tenantId, { ids = null } = {}) {
  const items_ = await items(tenantId, { includeArchived: true });
  const byId = new Map(items_.map((i) => [i.id, i]));
  const rows = await db.sel(`SELECT o.id, o.shirt_id, o.pants_id, o.shoe_id, o.favorite, o.rating, o.notes, o.ai_note,
      (SELECT status FROM sty_renders r WHERE r.outfit_id=o.id AND r.tenant_id=o.tenant_id ORDER BY (status='done') DESC, id DESC LIMIT 1) AS render_status,
      (SELECT id FROM sty_renders r WHERE r.outfit_id=o.id AND r.tenant_id=o.tenant_id AND status='done' ORDER BY id DESC LIMIT 1) AS render_id,
      (SELECT MAX(worn_on) FROM sty_wear w WHERE w.outfit_id=o.id AND w.tenant_id=o.tenant_id) AS last_worn,
      (SELECT COUNT(*)::int FROM sty_wear w WHERE w.outfit_id=o.id AND w.tenant_id=o.tenant_id) AS times_worn
    FROM sty_outfits o WHERE o.tenant_id=:t ${ids ? 'AND o.id IN (:ids)' : ''} ORDER BY o.id`, { t: tenantId, ids: ids && ids.length ? ids : [0] });
  const out = [];
  for (const r of rows) {
    const shirt = byId.get(r.shirt_id), pants = byId.get(r.pants_id), shoe = byId.get(r.shoe_id);
    if (!shirt || !pants || !shoe || shirt.archived || pants.archived || shoe.archived) continue;
    const e = stylist.evaluate(shirt, pants);
    out.push({ ...r, shirt, pants, shoe, eval: e });
  }
  out.sort((a, b) => (a.shirt.sort - b.shirt.sort) || (a.pants.sort - b.pants.sort) || a.id - b.id);
  return out;
}

async function textures(tenantId, itemIds) {
  if (!itemIds.length) return new Map();
  const rows = await db.sel(`SELECT DISTINCT ON (item_id) item_id, texture FROM sty_photos
    WHERE tenant_id=:t AND kind='garment' AND item_id IN (:ids) AND texture IS NOT NULL ORDER BY item_id, is_primary DESC, id DESC`, { t: tenantId, ids: itemIds });
  return new Map(rows.map((r) => [r.item_id, 'data:image/jpeg;base64,' + Buffer.from(r.texture).toString('base64')]));
}

/** The illustration SVG for one outfit, using photo textures when uploaded. */
async function sketchFor(tenantId, o, tex = null, idp = 'f') {
  const t = tex || await textures(tenantId, [o.shirt.id, o.pants.id]);
  return sketch.render({
    shirt: o.shirt, pants: o.pants, shoe: o.shoe, idp,
    tucked: o.eval.tuck.advice === 'Tucked', sleevesRolled: /Rolled/.test(o.eval.sleeves.advice),
    shirtTexture: t.get(o.shirt.id) || null, pantsTexture: t.get(o.pants.id) || null
  });
}

async function renderImage(tenantId, renderId) {
  return db.one(`SELECT image, mime FROM sty_renders WHERE id=:r AND tenant_id=:t AND status='done'`, { r: renderId, t: tenantId });
}

module.exports = { ensureMatrix, items, outfits, textures, sketchFor, renderImage, ITEM_COLS };
