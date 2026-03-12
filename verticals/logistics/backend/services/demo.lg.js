// RinglyPro Logistics — Demo Workspace & Self-Serve Portal
// Safe prospect-facing demo environments with uploaded data

const sequelize = require('./db.lg');
const crypto = require('crypto');

function generateAccessCode() {
  return 'DEMO-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function create_workspace(input) {
  const { company_name, contact_email, contact_name, tier, lead_source, notes } = input;
  if (!company_name) throw new Error('company_name required');
  const accessCode = generateAccessCode();

  const [[workspace]] = await sequelize.query(`
    INSERT INTO lg_demo_workspaces (workspace_name, company_name, contact_email, contact_name,
      access_code, tier, lead_source, notes, status, expires_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW() + INTERVAL '30 days', NOW())
    RETURNING *
  `, { bind: [`${company_name} Demo`, company_name, contact_email, contact_name, accessCode,
    tier || 'demo', lead_source, notes] });

  return {
    workspace_id: workspace.id,
    workspace_name: workspace.workspace_name,
    access_code: accessCode,
    access_url: `/logistics/demo/${accessCode}`,
    company: company_name,
    contact: { name: contact_name, email: contact_email },
    expires_at: workspace.expires_at,
    modules: ['loads', 'carriers', 'pricing', 'analytics', 'matching'],
    instructions: `Share the access code "${accessCode}" with the prospect. They can upload their own data (CSV/Excel/JSON) and see the platform working with their operational data.`,
  };
}

async function get_workspace(input) {
  const { access_code, workspace_id } = input;
  if (!access_code && !workspace_id) throw new Error('access_code or workspace_id required');
  const where = access_code ? 'access_code = $1' : 'id = $1';
  const bind = access_code || workspace_id;

  const [[ws]] = await sequelize.query(`SELECT * FROM lg_demo_workspaces WHERE ${where}`, { bind: [bind] });
  if (!ws) throw new Error('Workspace not found');
  if (ws.status !== 'active') throw new Error(`Workspace is ${ws.status}`);
  if (new Date(ws.expires_at) < new Date()) {
    await sequelize.query(`UPDATE lg_demo_workspaces SET status = 'expired' WHERE id = $1`, { bind: [ws.id] });
    throw new Error('Workspace has expired');
  }

  // Update last activity
  await sequelize.query(`UPDATE lg_demo_workspaces SET last_activity = NOW() WHERE id = $1`, { bind: [ws.id] });

  return {
    workspace_id: ws.id,
    workspace_name: ws.workspace_name,
    company: ws.company_name,
    access_code: ws.access_code,
    modules_enabled: ws.modules_enabled,
    data_uploaded: ws.data_uploaded,
    upload_count: ws.upload_count || 0,
    expires_at: ws.expires_at,
    status: ws.status,
  };
}

async function list_workspaces(input) {
  const { status } = input;
  const where = status ? 'WHERE status = $1' : '';
  const bind = status ? [status] : [];

  const [workspaces] = await sequelize.query(`
    SELECT id, workspace_name, company_name, contact_email, access_code, tier, status,
      data_uploaded, upload_count, last_activity, expires_at, lead_source, created_at
    FROM lg_demo_workspaces ${where} ORDER BY created_at DESC
  `, { bind });

  return {
    total: workspaces.length,
    workspaces: workspaces.map(ws => ({
      id: ws.id,
      name: ws.workspace_name,
      company: ws.company_name,
      contact: ws.contact_email,
      code: ws.access_code,
      tier: ws.tier,
      status: ws.status,
      has_data: ws.data_uploaded,
      uploads: ws.upload_count || 0,
      last_active: ws.last_activity,
      expires: ws.expires_at,
      source: ws.lead_source,
      created: ws.created_at,
    })),
  };
}

async function demo_upload_data(input) {
  const { access_code, file_content, file_name, data_type } = input;
  if (!access_code) throw new Error('access_code required');

  // Verify workspace
  const [[ws]] = await sequelize.query(`SELECT * FROM lg_demo_workspaces WHERE access_code = $1 AND status = 'active'`, { bind: [access_code] });
  if (!ws) throw new Error('Invalid or expired demo workspace');

  // Use the ingestion service with demo tenant isolation
  const ingestion = require('./ingestion.lg');
  const result = await ingestion.process_upload({
    file_content, file_name, data_type,
    tenant_id: `demo_${ws.id}`,
    user_id: null,
  });

  // Update workspace
  await sequelize.query(`
    UPDATE lg_demo_workspaces SET data_uploaded = true, upload_count = COALESCE(upload_count, 0) + 1, last_activity = NOW()
    WHERE id = $1
  `, { bind: [ws.id] });

  return { workspace: ws.workspace_name, ...result };
}

async function generate_demo_data(input) {
  const { access_code, sample_size } = input;
  if (!access_code) throw new Error('access_code required');

  const [[ws]] = await sequelize.query(`SELECT * FROM lg_demo_workspaces WHERE access_code = $1 AND status = 'active'`, { bind: [access_code] });
  if (!ws) throw new Error('Invalid workspace');

  const tid = `demo_${ws.id}`;
  const size = sample_size || 50;

  const cities = [
    { city: 'Dallas', state: 'TX', zip: '75201' },
    { city: 'Houston', state: 'TX', zip: '77001' },
    { city: 'Chicago', state: 'IL', zip: '60601' },
    { city: 'Atlanta', state: 'GA', zip: '30301' },
    { city: 'Los Angeles', state: 'CA', zip: '90001' },
    { city: 'Miami', state: 'FL', zip: '33101' },
    { city: 'Memphis', state: 'TN', zip: '38101' },
    { city: 'Indianapolis', state: 'IN', zip: '46201' },
    { city: 'Charlotte', state: 'NC', zip: '28201' },
    { city: 'Nashville', state: 'TN', zip: '37201' },
    { city: 'Phoenix', state: 'AZ', zip: '85001' },
    { city: 'Denver', state: 'CO', zip: '80201' },
  ];
  const equip = ['dry_van', 'reefer', 'flatbed', 'step_deck'];
  const statuses = ['open', 'covered', 'in_transit', 'delivered', 'delivered', 'delivered', 'invoiced'];
  const customers = ['Acme Manufacturing', 'Global Foods Inc', 'Tech Components LLC', 'Stellar Logistics', 'Prime Distribution', 'Atlas Freight Co'];
  const carriers = ['FastHaul Transport', 'Eagle Express LLC', 'Summit Trucking', 'Blueridge Carriers', 'Patriot Freight', 'Liberty Lines'];

  // Generate sample loads
  let loadCount = 0;
  for (let i = 0; i < size; i++) {
    const orig = cities[Math.floor(Math.random() * cities.length)];
    let dest = cities[Math.floor(Math.random() * cities.length)];
    while (dest.city === orig.city) dest = cities[Math.floor(Math.random() * cities.length)];
    const miles = 200 + Math.floor(Math.random() * 1800);
    const rpm = 2.20 + Math.random() * 1.50;
    const buyRate = Math.round(miles * rpm);
    const marginPct = 10 + Math.random() * 15;
    const sellRate = Math.round(buyRate * (1 + marginPct / 100));
    const daysAgo = Math.floor(Math.random() * 60);
    const pickupDate = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0];

    await sequelize.query(`
      INSERT INTO lg_loads (tenant_id, load_ref, origin_city, origin_state, origin_zip,
        destination_city, destination_state, destination_zip, equipment_type,
        miles, buy_rate, sell_rate, margin, margin_pct, rate_per_mile,
        shipper_name, pickup_date, status, source, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'demo', NOW(), NOW())
    `, { bind: [tid, `DEMO-${ws.id}-${i + 1}`, orig.city, orig.state, orig.zip,
      dest.city, dest.state, dest.zip, equip[Math.floor(Math.random() * equip.length)],
      miles, buyRate, sellRate, sellRate - buyRate, Math.round(marginPct * 10) / 10, Math.round(rpm * 100) / 100,
      customers[Math.floor(Math.random() * customers.length)], pickupDate,
      statuses[Math.floor(Math.random() * statuses.length)]] }).catch(() => {});
    loadCount++;
  }

  // Generate sample carriers
  let carrierCount = 0;
  for (const name of carriers) {
    const home = cities[Math.floor(Math.random() * cities.length)];
    await sequelize.query(`
      INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, home_city, home_state,
        equipment_types, reliability_score, source, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'demo', NOW(), NOW())
    `, { bind: [tid, name, `MC${100000 + Math.floor(Math.random() * 900000)}`, home.city, home.state,
      `{${equip.slice(0, 2).join(',')}}`, 60 + Math.floor(Math.random() * 35)] }).catch(() => {});
    carrierCount++;
  }

  // Generate sample customers
  let customerCount = 0;
  for (const name of customers) {
    await sequelize.query(`
      INSERT INTO lg_customers (tenant_id, customer_name, payment_terms, source, created_at, updated_at)
      VALUES ($1, $2, 'net_30', 'demo', NOW(), NOW())
    `, { bind: [tid, name] }).catch(() => {});
    customerCount++;
  }

  await sequelize.query(`UPDATE lg_demo_workspaces SET data_uploaded = true, last_activity = NOW() WHERE id = $1`, { bind: [ws.id] });

  return {
    workspace: ws.workspace_name,
    generated: { loads: loadCount, carriers: carrierCount, customers: customerCount },
    message: `Generated ${loadCount} sample loads, ${carrierCount} carriers, and ${customerCount} customers for demo`,
  };
}

module.exports = { create_workspace, get_workspace, list_workspaces, demo_upload_data, generate_demo_data };
