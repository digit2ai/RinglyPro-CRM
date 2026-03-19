/**
 * CW ↔ LG Bridge Sync Service
 *
 * Keeps cross-reference columns in sync between cw_* and lg_* tables.
 * Called after inserts/updates in either table set to maintain the bridge.
 */
const sequelize = require('./db.cw');

/**
 * After a CW contact is created/updated, ensure it has an lg_ counterpart
 */
async function syncContactToLG(cwContactId) {
  try {
    const [[contact]] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE id = $1`, { bind: [cwContactId] }
    );
    if (!contact) return null;

    if (contact.contact_type === 'carrier') {
      // Check if already linked
      if (contact.lg_carrier_id) return { linked: true, lg_id: contact.lg_carrier_id };

      // Try to find existing lg_carrier by name or MC
      const [existing] = await sequelize.query(
        `SELECT id FROM lg_carriers WHERE cw_contact_id = $1
         OR (carrier_name IS NOT NULL AND LOWER(TRIM(carrier_name)) = LOWER(TRIM($2)))
         OR (mc_number IS NOT NULL AND REPLACE(mc_number, 'MC-', '') = REPLACE($3, 'MC-', ''))
         LIMIT 1`,
        { bind: [cwContactId, contact.company_name || '', contact.mc_number || ''] }
      );

      if (existing.length > 0) {
        // Link existing
        const lgId = existing[0].id;
        await sequelize.query(`UPDATE lg_carriers SET cw_contact_id = $1 WHERE id = $2`, { bind: [cwContactId, lgId] });
        await sequelize.query(`UPDATE cw_contacts SET lg_carrier_id = $1 WHERE id = $2`, { bind: [lgId, cwContactId] });
        return { linked: true, lg_id: lgId, action: 'linked_existing' };
      } else {
        // Create new lg_carrier
        const equipArray = contact.freight_types ? `{${contact.freight_types.join(',')}}` : '{dry_van}';
        const [[newCarrier]] = await sequelize.query(
          `INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, contact_name, phone, email,
            equipment_types, cw_contact_id, source, created_at, updated_at)
           VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, 'cw_sync', NOW(), NOW()) RETURNING id`,
          { bind: [contact.company_name, contact.mc_number, contact.dot_number,
            contact.full_name, contact.phone, contact.email, equipArray, cwContactId] }
        );
        await sequelize.query(`UPDATE cw_contacts SET lg_carrier_id = $1 WHERE id = $2`, { bind: [newCarrier.id, cwContactId] });
        return { linked: true, lg_id: newCarrier.id, action: 'created_new' };
      }
    }

    if (contact.contact_type === 'shipper') {
      if (contact.lg_customer_id) return { linked: true, lg_id: contact.lg_customer_id };

      const [existing] = await sequelize.query(
        `SELECT id FROM lg_customers WHERE cw_contact_id = $1
         OR (customer_name IS NOT NULL AND LOWER(TRIM(customer_name)) = LOWER(TRIM($2)))
         LIMIT 1`,
        { bind: [cwContactId, contact.company_name || ''] }
      );

      if (existing.length > 0) {
        const lgId = existing[0].id;
        await sequelize.query(`UPDATE lg_customers SET cw_contact_id = $1 WHERE id = $2`, { bind: [cwContactId, lgId] });
        await sequelize.query(`UPDATE cw_contacts SET lg_customer_id = $1 WHERE id = $2`, { bind: [lgId, cwContactId] });
        return { linked: true, lg_id: lgId, action: 'linked_existing' };
      } else {
        const [[newCust]] = await sequelize.query(
          `INSERT INTO lg_customers (tenant_id, customer_name, contact_name, phone, email, source, cw_contact_id, created_at, updated_at)
           VALUES ('logistics', $1, $2, $3, $4, 'cw_sync', $5, NOW(), NOW()) RETURNING id`,
          { bind: [contact.company_name, contact.full_name, contact.phone, contact.email, cwContactId] }
        );
        await sequelize.query(`UPDATE cw_contacts SET lg_customer_id = $1 WHERE id = $2`, { bind: [newCust.id, cwContactId] });
        return { linked: true, lg_id: newCust.id, action: 'created_new' };
      }
    }

    return { linked: false, reason: `contact_type '${contact.contact_type}' not bridged` };
  } catch (e) {
    console.error('[Bridge] syncContactToLG error:', e.message);
    return { linked: false, error: e.message };
  }
}

/**
 * After an LG carrier is created, ensure it has a cw_contacts counterpart
 */
async function syncCarrierToCW(lgCarrierId) {
  try {
    const [[carrier]] = await sequelize.query(
      `SELECT * FROM lg_carriers WHERE id = $1`, { bind: [lgCarrierId] }
    );
    if (!carrier) return null;
    if (carrier.cw_contact_id) return { linked: true, cw_id: carrier.cw_contact_id };

    const [existing] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE lg_carrier_id = $1
       OR (contact_type = 'carrier' AND company_name IS NOT NULL AND LOWER(TRIM(company_name)) = LOWER(TRIM($2)))
       LIMIT 1`,
      { bind: [lgCarrierId, carrier.carrier_name || ''] }
    );

    if (existing.length > 0) {
      const cwId = existing[0].id;
      await sequelize.query(`UPDATE cw_contacts SET lg_carrier_id = $1 WHERE id = $2`, { bind: [lgCarrierId, cwId] });
      await sequelize.query(`UPDATE lg_carriers SET cw_contact_id = $1 WHERE id = $2`, { bind: [cwId, lgCarrierId] });
      return { linked: true, cw_id: cwId, action: 'linked_existing' };
    } else {
      const [[newContact]] = await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, full_name, phone, email, mc_number, dot_number,
          lg_carrier_id, created_at, updated_at)
         VALUES ('carrier', $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
        { bind: [carrier.carrier_name, carrier.contact_name, carrier.phone, carrier.email,
          carrier.mc_number, carrier.dot_number, lgCarrierId] }
      );
      await sequelize.query(`UPDATE lg_carriers SET cw_contact_id = $1 WHERE id = $2`, { bind: [newContact.id, lgCarrierId] });
      return { linked: true, cw_id: newContact.id, action: 'created_new' };
    }
  } catch (e) {
    console.error('[Bridge] syncCarrierToCW error:', e.message);
    return { linked: false, error: e.message };
  }
}

/**
 * After an LG customer is created, ensure it has a cw_contacts counterpart
 */
async function syncCustomerToCW(lgCustomerId) {
  try {
    const [[customer]] = await sequelize.query(
      `SELECT * FROM lg_customers WHERE id = $1`, { bind: [lgCustomerId] }
    );
    if (!customer) return null;
    if (customer.cw_contact_id) return { linked: true, cw_id: customer.cw_contact_id };

    const [existing] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE lg_customer_id = $1
       OR (contact_type = 'shipper' AND company_name IS NOT NULL AND LOWER(TRIM(company_name)) = LOWER(TRIM($2)))
       LIMIT 1`,
      { bind: [lgCustomerId, customer.customer_name || ''] }
    );

    if (existing.length > 0) {
      const cwId = existing[0].id;
      await sequelize.query(`UPDATE cw_contacts SET lg_customer_id = $1 WHERE id = $2`, { bind: [lgCustomerId, cwId] });
      await sequelize.query(`UPDATE lg_customers SET cw_contact_id = $1 WHERE id = $2`, { bind: [cwId, lgCustomerId] });
      return { linked: true, cw_id: cwId, action: 'linked_existing' };
    } else {
      const [[newContact]] = await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, full_name, phone, email, lg_customer_id, created_at, updated_at)
         VALUES ('shipper', $1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
        { bind: [customer.customer_name, customer.contact_name, customer.phone, customer.email, lgCustomerId] }
      );
      await sequelize.query(`UPDATE lg_customers SET cw_contact_id = $1 WHERE id = $2`, { bind: [newContact.id, lgCustomerId] });
      return { linked: true, cw_id: newContact.id, action: 'created_new' };
    }
  } catch (e) {
    console.error('[Bridge] syncCustomerToCW error:', e.message);
    return { linked: false, error: e.message };
  }
}

/**
 * Bulk sync all unlinked records — run on startup or on-demand
 */
async function bulkSync() {
  const results = { carriers: 0, customers: 0, loads: 0, errors: 0 };

  try {
    // Unlinked lg_carriers
    const [unlinkCarriers] = await sequelize.query(
      `SELECT id FROM lg_carriers WHERE cw_contact_id IS NULL`
    );
    for (const c of unlinkCarriers) {
      const r = await syncCarrierToCW(c.id);
      if (r?.linked) results.carriers++;
      else results.errors++;
    }

    // Unlinked lg_customers
    const [unlinkCustomers] = await sequelize.query(
      `SELECT id FROM lg_customers WHERE cw_contact_id IS NULL`
    );
    for (const c of unlinkCustomers) {
      const r = await syncCustomerToCW(c.id);
      if (r?.linked) results.customers++;
      else results.errors++;
    }

    // Unlinked cw_contacts (carriers)
    const [unlinkCwCarriers] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE contact_type = 'carrier' AND lg_carrier_id IS NULL`
    );
    for (const c of unlinkCwCarriers) {
      const r = await syncContactToLG(c.id);
      if (r?.linked) results.carriers++;
      else results.errors++;
    }

    // Unlinked cw_contacts (shippers)
    const [unlinkCwShippers] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE contact_type = 'shipper' AND lg_customer_id IS NULL`
    );
    for (const c of unlinkCwShippers) {
      const r = await syncContactToLG(c.id);
      if (r?.linked) results.customers++;
      else results.errors++;
    }

    // Link loads by load_ref
    const [loadLinks] = await sequelize.query(
      `UPDATE lg_loads SET cw_load_id = cw.id
       FROM cw_loads cw WHERE lg_loads.cw_load_id IS NULL AND lg_loads.load_ref = cw.load_ref
       RETURNING lg_loads.id`
    );
    results.loads += loadLinks.length;

    const [revLoadLinks] = await sequelize.query(
      `UPDATE cw_loads SET lg_load_id = lg.id
       FROM lg_loads lg WHERE cw_loads.lg_load_id IS NULL AND lg.cw_load_id = cw_loads.id
       RETURNING cw_loads.id`
    );
    results.loads += revLoadLinks.length;

    console.log(`[Bridge] Bulk sync complete: ${results.carriers} carriers, ${results.customers} customers, ${results.loads} loads linked (${results.errors} errors)`);
  } catch (e) {
    console.error('[Bridge] Bulk sync error:', e.message);
  }

  return results;
}

/**
 * Get bridge status — how many records are linked vs unlinked
 */
async function getStatus() {
  const [[carrierStats]] = await sequelize.query(
    `SELECT
      (SELECT COUNT(*) FROM lg_carriers) as lg_total,
      (SELECT COUNT(*) FROM lg_carriers WHERE cw_contact_id IS NOT NULL) as lg_linked,
      (SELECT COUNT(*) FROM cw_contacts WHERE contact_type = 'carrier') as cw_total,
      (SELECT COUNT(*) FROM cw_contacts WHERE contact_type = 'carrier' AND lg_carrier_id IS NOT NULL) as cw_linked`
  );
  const [[customerStats]] = await sequelize.query(
    `SELECT
      (SELECT COUNT(*) FROM lg_customers) as lg_total,
      (SELECT COUNT(*) FROM lg_customers WHERE cw_contact_id IS NOT NULL) as lg_linked,
      (SELECT COUNT(*) FROM cw_contacts WHERE contact_type = 'shipper') as cw_total,
      (SELECT COUNT(*) FROM cw_contacts WHERE contact_type = 'shipper' AND lg_customer_id IS NOT NULL) as cw_linked`
  );
  const [[loadStats]] = await sequelize.query(
    `SELECT
      (SELECT COUNT(*) FROM lg_loads) as lg_total,
      (SELECT COUNT(*) FROM lg_loads WHERE cw_load_id IS NOT NULL) as lg_linked,
      (SELECT COUNT(*) FROM cw_loads) as cw_total,
      (SELECT COUNT(*) FROM cw_loads WHERE lg_load_id IS NOT NULL) as cw_linked`
  );

  return {
    carriers: {
      lg: { total: parseInt(carrierStats.lg_total), linked: parseInt(carrierStats.lg_linked) },
      cw: { total: parseInt(carrierStats.cw_total), linked: parseInt(carrierStats.cw_linked) },
    },
    customers: {
      lg: { total: parseInt(customerStats.lg_total), linked: parseInt(customerStats.lg_linked) },
      cw: { total: parseInt(customerStats.cw_total), linked: parseInt(customerStats.cw_linked) },
    },
    loads: {
      lg: { total: parseInt(loadStats.lg_total), linked: parseInt(loadStats.lg_linked) },
      cw: { total: parseInt(loadStats.cw_total), linked: parseInt(loadStats.cw_linked) },
    },
  };
}

module.exports = { syncContactToLG, syncCarrierToCW, syncCustomerToCW, bulkSync, getStatus };
