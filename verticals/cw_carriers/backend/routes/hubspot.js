const express = require('express');
const router = express.Router();
const hubspot = require('../services/hubspot.cw');
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// POST /sync/contact - push contact to HubSpot
router.post('/sync/contact', async (req, res) => {
  try {
    const { contact_id } = req.body;
    const [[contact]] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE id = $1`, { bind: [contact_id] }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const result = await hubspot.createContact(contact);
    if (result.success && result.data?.id) {
      await sequelize.query(
        `UPDATE cw_contacts SET hubspot_id = $1, hubspot_synced_at = NOW() WHERE id = $2`,
        { bind: [result.data.id, contact_id] }
      );
    }
    res.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sync/deal - push deal to HubSpot
router.post('/sync/deal', async (req, res) => {
  try {
    const { load_id } = req.body;
    const [[load]] = await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [load_id] });
    if (!load) return res.status(404).json({ error: 'Load not found' });

    const result = await hubspot.createDeal(load);
    if (result.success && result.data?.id) {
      await sequelize.query(
        `UPDATE cw_loads SET hubspot_deal_id = $1 WHERE id = $2`,
        { bind: [result.data.id, load_id] }
      );
    }
    res.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sync/activity - log call activity to HubSpot
router.post('/sync/activity', async (req, res) => {
  try {
    const result = await hubspot.logCallActivity(req.body);
    res.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /deals - pull deals from HubSpot
router.get('/deals', async (req, res) => {
  try {
    const result = await hubspot.getDeals();
    res.json({ success: result.success, data: result.data?.results || [], error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /contacts - pull contacts from HubSpot
router.get('/contacts', async (req, res) => {
  try {
    const result = await hubspot.getContacts();
    res.json({ success: result.success, data: result.data?.results || [], error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sync-queue - sync queue status
router.get('/sync-queue', async (req, res) => {
  try {
    const items = await hubspot.getSyncQueue();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /retry/:id - retry a failed sync
router.post('/retry/:id', async (req, res) => {
  try {
    const result = await hubspot.retrySyncItem(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sync-all/contacts - sync all contacts to HubSpot (batched, no limit)
router.post('/sync-all/contacts', async (req, res) => {
  try {
    const [contacts] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE hubspot_id IS NULL ORDER BY id`
    );
    let synced = 0, errors = 0;
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const result = await hubspot.createContact(contact);
      if (result.success && result.data?.id) {
        await sequelize.query(
          `UPDATE cw_contacts SET hubspot_id = $1, hubspot_synced_at = NOW() WHERE id = $2`,
          { bind: [result.data.id, contact.id] }
        );
        synced++;
      } else {
        errors++;
      }
      // Brief pause every 10 records to avoid HubSpot rate limits
      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }
    res.json({ success: true, message: `Synced ${synced} of ${contacts.length} contacts (${errors} errors)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sync-all/deals - sync all deals to HubSpot (batched, no limit)
router.post('/sync-all/deals', async (req, res) => {
  try {
    const [loads] = await sequelize.query(
      `SELECT * FROM cw_loads WHERE hubspot_deal_id IS NULL ORDER BY id`
    );
    let synced = 0, errors = 0;
    for (let i = 0; i < loads.length; i++) {
      const load = loads[i];
      const result = await hubspot.createDeal(load);
      if (result.success && result.data?.id) {
        await sequelize.query(
          `UPDATE cw_loads SET hubspot_deal_id = $1 WHERE id = $2`,
          { bind: [result.data.id, load.id] }
        );
        synced++;
      } else {
        errors++;
      }
      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }
    res.json({ success: true, message: `Synced ${synced} of ${loads.length} deals (${errors} errors)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contacts/bulk - delete contacts from HubSpot in batches
router.delete('/contacts/bulk', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    let deleted = 0;
    let hasMore = true;

    while (hasMore && deleted < limit) {
      // Fetch a page of contacts
      const listResult = await hubspot.hubspotRequest('GET', '/crm/v3/objects/contacts?limit=100&properties=email,createdate');
      if (!listResult.success || !listResult.data?.results?.length) {
        hasMore = false;
        break;
      }

      const ids = listResult.data.results.map(c => c.id);
      // Delete in batch of 10
      for (let i = 0; i < ids.length && deleted < limit; i++) {
        const delResult = await hubspot.hubspotRequest('DELETE', `/crm/v3/objects/contacts/${ids[i]}`);
        if (delResult.success || delResult.error?.includes('not found')) deleted++;
        if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 300));
      }

      if (!listResult.data.paging?.next) hasMore = false;
    }

    res.json({ success: true, deleted, message: `Deleted ${deleted} contacts from HubSpot` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
