const axios = require('axios');
const sequelize = require('./db.cw');

const HUBSPOT_BASE = 'https://api.hubapi.com';
const ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

async function hubspotRequest(method, path, data = null) {
  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    const config = { method, url: `${HUBSPOT_BASE}${path}`, headers };
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (err) {
    if (err.response && err.response.status === 429) {
      const retryAfter = parseInt(err.response.headers['retry-after'] || '2', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return hubspotRequest(method, path, data);
    }
    return { success: false, error: err.response?.data?.message || err.message };
  }
}

async function logSync(objectType, objectId, action, payload, status, errorMsg = null) {
  try {
    await sequelize.query(
      `INSERT INTO cw_hubspot_sync (object_type, object_id, action, payload, status, error_msg, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      { bind: [objectType, objectId, action, JSON.stringify(payload), status, errorMsg] }
    );
  } catch (e) {
    console.error('CW HubSpot sync log error:', e.message);
  }
}

async function createContact(data) {
  await logSync('contact', null, 'create', data, 'pending');
  const result = await hubspotRequest('POST', '/crm/v3/objects/contacts', {
    properties: {
      email: data.email,
      firstname: data.full_name?.split(' ')[0] || '',
      lastname: data.full_name?.split(' ').slice(1).join(' ') || '',
      company: data.company_name || '',
      phone: data.phone || '',
      hs_lead_status: data.contact_type === 'prospect' ? 'NEW' : 'OPEN'
    }
  });
  const status = result.success ? 'success' : 'error';
  await logSync('contact', result.data?.id || null, 'create', data, status, result.error);
  return result;
}

async function updateContact(hubspotId, data) {
  await logSync('contact', hubspotId, 'update', data, 'pending');
  const result = await hubspotRequest('PATCH', `/crm/v3/objects/contacts/${hubspotId}`, {
    properties: data
  });
  const status = result.success ? 'success' : 'error';
  await logSync('contact', hubspotId, 'update', data, status, result.error);
  return result;
}

async function createDeal(data) {
  await logSync('deal', null, 'create', data, 'pending');
  const result = await hubspotRequest('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: `Load ${data.load_ref || ''}: ${data.origin} → ${data.destination}`,
      amount: data.rate_usd || 0,
      pipeline: 'default',
      dealstage: data.status === 'open' ? 'appointmentscheduled' : 'qualifiedtobuy',
      description: `Freight: ${data.freight_type || 'N/A'} | Weight: ${data.weight_lbs || 'N/A'} lbs`,
      closedate: data.delivery_date || null
    }
  });
  const status = result.success ? 'success' : 'error';
  await logSync('deal', result.data?.id || null, 'create', data, status, result.error);
  return result;
}

async function updateDeal(hubspotDealId, data) {
  await logSync('deal', hubspotDealId, 'update', data, 'pending');
  const result = await hubspotRequest('PATCH', `/crm/v3/objects/deals/${hubspotDealId}`, {
    properties: data
  });
  const status = result.success ? 'success' : 'error';
  await logSync('deal', hubspotDealId, 'update', data, status, result.error);
  return result;
}

async function logCallActivity(data) {
  await logSync('activity', null, 'log', data, 'pending');
  const result = await hubspotRequest('POST', '/crm/v3/objects/calls', {
    properties: {
      hs_call_title: data.title || 'CW Carriers AI Call',
      hs_call_body: data.summary || data.transcript || '',
      hs_call_direction: data.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      hs_call_duration: String((data.duration_sec || 0) * 1000),
      hs_call_status: 'COMPLETED',
      hs_timestamp: new Date().toISOString()
    }
  });
  const status = result.success ? 'success' : 'error';
  await logSync('activity', result.data?.id || null, 'log', data, status, result.error);

  if (result.success && data.hubspot_contact_id) {
    await associateObjects('calls', result.data.id, 'contacts', data.hubspot_contact_id);
  }
  return result;
}

async function createTask(data) {
  await logSync('task', null, 'create', data, 'pending');
  const result = await hubspotRequest('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: data.subject || 'Follow-up Required',
      hs_task_body: data.body || '',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: data.priority || 'MEDIUM',
      hs_timestamp: new Date().toISOString()
    }
  });
  const status = result.success ? 'success' : 'error';
  await logSync('task', result.data?.id || null, 'create', data, status, result.error);
  return result;
}

async function associateObjects(fromType, fromId, toType, toId) {
  return hubspotRequest('PUT',
    `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 0 }]
  );
}

async function searchContacts(query) {
  return hubspotRequest('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{
      filters: [{
        propertyName: 'email',
        operator: 'CONTAINS_TOKEN',
        value: query
      }]
    }],
    properties: ['email', 'firstname', 'lastname', 'company', 'phone'],
    limit: 20
  });
}

async function getDeals() {
  return hubspotRequest('GET', '/crm/v3/objects/deals?limit=50&properties=dealname,amount,dealstage,pipeline,closedate');
}

async function getContacts() {
  return hubspotRequest('GET', '/crm/v3/objects/contacts?limit=50&properties=email,firstname,lastname,company,phone');
}

async function getSyncQueue() {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM cw_hubspot_sync ORDER BY created_at DESC LIMIT 100`
    );
    return rows;
  } catch (e) {
    return [];
  }
}

async function retrySyncItem(syncId) {
  try {
    const [[item]] = await sequelize.query(
      `SELECT * FROM cw_hubspot_sync WHERE id = $1`, { bind: [syncId] }
    );
    if (!item) return { success: false, error: 'Item not found' };

    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;

    let result;
    if (item.object_type === 'contact' && item.action === 'create') {
      result = await createContact(payload);
    } else if (item.object_type === 'deal' && item.action === 'create') {
      result = await createDeal(payload);
    } else if (item.object_type === 'activity' && item.action === 'log') {
      result = await logCallActivity(payload);
    } else {
      return { success: false, error: 'Unknown sync type' };
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  createContact,
  updateContact,
  createDeal,
  updateDeal,
  logCallActivity,
  createTask,
  associateObjects,
  searchContacts,
  getDeals,
  getContacts,
  getSyncQueue,
  retrySyncItem
};
