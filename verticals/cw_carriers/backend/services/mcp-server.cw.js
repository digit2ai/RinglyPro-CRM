// mcp-server.cw.js
// FreightMind AI — MCP Server Orchestrator
// Central nervous system connecting all tiers

const { getAgent, getAllAgents, agentBus } = require('./agent-framework.cw');
const sequelize = require('./db.cw');

// Tool-to-Tier mapping
const TOOL_TIER_MAP = {
  // TIER 1: Load Operations
  scan_load_boards: 1, filter_by_equipment: 1, check_shipper_reputation: 1,
  qualify_load: 1, match_freight_to_truck: 1, score_load: 1, find_load_pairs: 1,
  post_to_load_board: 1, search_available_trucks: 1, onboard_carrier: 1,
  score_carrier: 1, monitor_carrier_insurance: 1, score_shipper_relationship: 1,
  predict_shipper_demand: 1, identify_upsell_lanes: 1, detect_shipper_churn: 1,
  get_shipper_360: 1,
  get_market_rate: 1, calc_lane_rate: 1, compare_spot_vs_contract: 1,
  predict_rate_trend: 1, set_min_rate: 1, negotiate_rate: 1,
  calc_trip_profitability: 1, get_rate_benchmarks: 1, track_quote_outcome: 1,
  analyze_win_loss_by_lane: 1, optimize_spot_pricing: 1, get_spot_market_dashboard: 1,
  import_rfp: 1, auto_price_rfp: 1, analyze_rfp_profitability: 1,
  generate_bid_response: 1, track_rfp_awards: 1,

  // TIER 2: Fleet Operations
  get_driver_location: 2, check_hos: 2, assign_load: 2, optimize_route: 2,
  send_dispatch: 2, chain_loads: 2, rebalance_fleet: 2, find_best_driver: 2,
  estimate_detention: 2, book_dock_appointment: 2,
  get_truck_position: 2, calc_eta: 2, detect_delay: 2, alert_customer: 2,
  update_load_status: 2, log_detention: 2, geofence_trigger: 2,
  get_fleet_map: 2, check_weather_route: 2, log_check_call: 2,

  // TIER 3: Financial Operations
  generate_invoice: 3, calc_driver_pay: 3, submit_to_factoring: 3,
  track_payment: 3, reconcile_fuel: 3, aging_report: 3, settle_driver: 3,
  calc_load_profit: 3, send_collections_notice: 3,
  audit_carrier_invoice: 3, flag_billing_discrepancy: 3,
  generate_dispute: 3, track_dispute_resolution: 3,

  // TIER 4: Compliance & Safety
  check_hos_violation: 4, verify_cdl: 4, check_insurance: 4,
  log_inspection: 4, flag_violation: 4, schedule_drug_test: 4,
  audit_eld_logs: 4, check_carrier_authority: 4,
  generate_compliance_report: 4, track_expiring_docs: 4,
  check_truck_health: 4, schedule_pm: 4, log_repair: 4,
  track_fuel_mpg: 4, predict_failure: 4, find_nearest_shop: 4,
  calc_truck_cost_per_mile: 4, get_fleet_utilization: 4,

  // TIER 5: Neural Intelligence
  run_neural_scan: 5, get_findings: 5, get_finding_detail: 5,
  acknowledge_finding: 5, get_scan_schedule: 5,
  configure_scan_thresholds: 5, get_neural_dashboard: 5,
};

// Tool-to-Agent mapping
const TOOL_AGENT_MAP = {
  // Freight Finder tools
  scan_load_boards: 'freight_finder', filter_by_equipment: 'freight_finder',
  check_shipper_reputation: 'freight_finder', qualify_load: 'freight_finder',
  match_freight_to_truck: 'freight_finder', score_load: 'freight_finder',
  find_load_pairs: 'freight_finder', post_to_load_board: 'freight_finder',
  search_available_trucks: 'freight_finder', onboard_carrier: 'freight_finder',
  score_carrier: 'freight_finder', monitor_carrier_insurance: 'freight_finder',
  score_shipper_relationship: 'freight_finder', predict_shipper_demand: 'freight_finder',
  identify_upsell_lanes: 'freight_finder', detect_shipper_churn: 'freight_finder',
  get_shipper_360: 'freight_finder',

  // Rate Engine tools
  get_market_rate: 'rate_engine', calc_lane_rate: 'rate_engine',
  compare_spot_vs_contract: 'rate_engine', predict_rate_trend: 'rate_engine',
  set_min_rate: 'rate_engine', negotiate_rate: 'rate_engine',
  calc_trip_profitability: 'rate_engine', get_rate_benchmarks: 'rate_engine',
  track_quote_outcome: 'rate_engine', analyze_win_loss_by_lane: 'rate_engine',
  optimize_spot_pricing: 'rate_engine', get_spot_market_dashboard: 'rate_engine',
  import_rfp: 'rate_engine', auto_price_rfp: 'rate_engine',
  analyze_rfp_profitability: 'rate_engine', generate_bid_response: 'rate_engine',
  track_rfp_awards: 'rate_engine',

  // Dispatch AI tools (Tier 2)
  get_driver_location: 'dispatch_ai', check_hos: 'dispatch_ai',
  assign_load: 'dispatch_ai', optimize_route: 'dispatch_ai',
  send_dispatch: 'dispatch_ai', chain_loads: 'dispatch_ai',
  rebalance_fleet: 'dispatch_ai', find_best_driver: 'dispatch_ai',
  estimate_detention: 'dispatch_ai', book_dock_appointment: 'dispatch_ai',

  // Tracking tools (Tier 2)
  get_truck_position: 'tracking', calc_eta: 'tracking',
  detect_delay: 'tracking', alert_customer: 'tracking',
  update_load_status: 'tracking', log_detention: 'tracking',
  geofence_trigger: 'tracking', get_fleet_map: 'tracking',
  check_weather_route: 'tracking', log_check_call: 'tracking',

  // Billing tools (Tier 3)
  generate_invoice: 'billing', calc_driver_pay: 'billing',
  submit_to_factoring: 'billing', track_payment: 'billing',
  reconcile_fuel: 'billing', aging_report: 'billing',
  settle_driver: 'billing', calc_load_profit: 'billing',
  send_collections_notice: 'billing', audit_carrier_invoice: 'billing',
  flag_billing_discrepancy: 'billing', generate_dispute: 'billing',
  track_dispute_resolution: 'billing',

  // Compliance tools (Tier 4)
  check_hos_violation: 'compliance', verify_cdl: 'compliance',
  check_insurance: 'compliance', log_inspection: 'compliance',
  flag_violation: 'compliance', schedule_drug_test: 'compliance',
  audit_eld_logs: 'compliance', check_carrier_authority: 'compliance',
  generate_compliance_report: 'compliance', track_expiring_docs: 'compliance',
  check_truck_health: 'maintenance', schedule_pm: 'maintenance',
  log_repair: 'maintenance', track_fuel_mpg: 'maintenance',
  predict_failure: 'maintenance', find_nearest_shop: 'maintenance',
  calc_truck_cost_per_mile: 'maintenance', get_fleet_utilization: 'maintenance',

  // Neural tools (Tier 5)
  run_neural_scan: 'neural', get_findings: 'neural',
  get_finding_detail: 'neural', acknowledge_finding: 'neural',
  get_scan_schedule: 'neural', configure_scan_thresholds: 'neural',
  get_neural_dashboard: 'neural',
};

// Cross-tier event definitions
const CROSS_TIER_EVENTS = {
  load_booked:        { source_tier: 1, targets: [{ tier: 2, action: 'auto_dispatch' }, { tier: 4, action: 'verify_carrier_compliance' }] },
  load_covered:       { source_tier: 1, targets: [{ tier: 2, action: 'start_tracking' }] },
  carrier_onboarded:  { source_tier: 1, targets: [{ tier: 4, action: 'verify_compliance' }] },
  load_dispatched:    { source_tier: 2, targets: [{ tier: 1, action: 'update_load_status' }] },
  pod_captured:       { source_tier: 2, targets: [{ tier: 3, action: 'generate_invoice' }] },
  load_delivered:     { source_tier: 2, targets: [{ tier: 3, action: 'trigger_settlement' }, { tier: 1, action: 'find_next_load' }] },
  detention_logged:   { source_tier: 2, targets: [{ tier: 3, action: 'add_detention_charges' }] },
  hos_warning:        { source_tier: 2, targets: [{ tier: 4, action: 'alert_compliance' }] },
  driver_assigned:    { source_tier: 2, targets: [{ tier: 4, action: 'pre_dispatch_gate' }] },
  invoice_generated:  { source_tier: 3, targets: [] },
  insurance_lapsed:   { source_tier: 4, targets: [{ tier: 1, action: 'block_carrier' }, { tier: 3, action: 'hold_payments' }] },
  pm_overdue:         { source_tier: 4, targets: [{ tier: 2, action: 'flag_truck' }] },
};

// Get tenant config from database (with in-memory cache)
const tenantCache = {};
async function getTenantConfig(tenantId) {
  if (tenantCache[tenantId] && tenantCache[tenantId].expires > Date.now()) {
    return tenantCache[tenantId].config;
  }
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM lg_tenant_config WHERE tenant_id = $1 AND status = $2',
      { bind: [tenantId, 'active'] }
    );
    const config = rows[0] || {
      // Default: all tiers active (for backward compat / demo)
      tier_1_load_ops: true, tier_2_fleet_ops: true,
      tier_3_financial: true, tier_4_compliance: true,
      tier_5_neural: true, addon_voice: true, addon_treatment: false
    };
    tenantCache[tenantId] = { config, expires: Date.now() + 60000 }; // 1 min cache
    return config;
  } catch (e) {
    // Table might not exist yet — return all-active default
    return {
      tier_1_load_ops: true, tier_2_fleet_ops: true,
      tier_3_financial: true, tier_4_compliance: true,
      tier_5_neural: true, addon_voice: true, addon_treatment: false
    };
  }
}

// Check if tenant has access to a specific tier
function hasTierAccess(config, tier) {
  const tierMap = {
    1: config.tier_1_load_ops,
    2: config.tier_2_fleet_ops,
    3: config.tier_3_financial,
    4: config.tier_4_compliance,
    5: config.tier_5_neural,
  };
  return !!tierMap[tier];
}

// List available tools for a tenant (filtered by licensed tiers)
async function listTools(tenantId) {
  const config = await getTenantConfig(tenantId);
  const availableTools = [];

  for (const [toolName, tier] of Object.entries(TOOL_TIER_MAP)) {
    if (hasTierAccess(config, tier)) {
      const agentName = TOOL_AGENT_MAP[toolName];
      const agent = getAgent(agentName);
      const tool = agent ? agent.tools.find(t => t.name === toolName) : null;
      availableTools.push({
        name: toolName,
        tier,
        agent: agentName,
        description: tool ? tool.description : 'Agent not yet initialized',
        available: !!agent
      });
    }
  }
  return availableTools;
}

// Execute a tool via MCP (with tier access check)
async function callTool(tenantId, toolName, input) {
  const config = await getTenantConfig(tenantId);
  const tier = TOOL_TIER_MAP[toolName];

  if (!tier) throw new Error(`Unknown tool: ${toolName}`);
  if (!hasTierAccess(config, tier)) {
    throw new Error(`Tier ${tier} not licensed for tenant ${tenantId}. Tool ${toolName} requires Tier ${tier}.`);
  }

  const agentName = TOOL_AGENT_MAP[toolName];
  const agent = getAgent(agentName);
  if (!agent) throw new Error(`Agent ${agentName} not initialized. Tier ${tier} tools are not yet deployed.`);

  const result = await agent.executeTool(toolName, { ...input, tenant_id: tenantId });
  return { tool: toolName, tier, agent: agentName, result };
}

// Emit a cross-tier event
async function emitEvent(tenantId, eventName, data) {
  const config = await getTenantConfig(tenantId);
  const eventDef = CROSS_TIER_EVENTS[eventName];
  if (!eventDef) return { event: eventName, processed: false, reason: 'unknown event' };

  const results = [];
  for (const target of eventDef.targets) {
    if (hasTierAccess(config, target.tier)) {
      agentBus.emit(eventName, { tenant_id: tenantId, action: target.action, ...data });
      results.push({ tier: target.tier, action: target.action, status: 'emitted' });
    } else {
      results.push({ tier: target.tier, action: target.action, status: 'skipped_no_license' });
    }
  }

  // Always emit to Neural (Tier 5) if active
  if (hasTierAccess(config, 5)) {
    agentBus.emit('neural_event', { tenant_id: tenantId, event: eventName, ...data });
    results.push({ tier: 5, action: 'neural_scan', status: 'emitted' });
  }

  return { event: eventName, tenant_id: tenantId, targets: results };
}

// Get orchestrator status
async function getStatus(tenantId) {
  const config = await getTenantConfig(tenantId || 'logistics');
  const agents = getAllAgents();
  const tools = await listTools(tenantId || 'logistics');

  return {
    orchestrator: 'FreightMind MCP Server',
    version: '1.0.0',
    tenant_id: tenantId || 'logistics',
    tiers: {
      tier_1_load_ops: config.tier_1_load_ops,
      tier_2_fleet_ops: config.tier_2_fleet_ops,
      tier_3_financial: config.tier_3_financial,
      tier_4_compliance: config.tier_4_compliance,
      tier_5_neural: config.tier_5_neural,
    },
    addons: {
      voice: config.addon_voice,
      treatment: config.addon_treatment,
    },
    agents: { count: agents.length, names: agents.map(a => a.name) },
    tools: { total_registered: Object.keys(TOOL_TIER_MAP).length, available_for_tenant: tools.filter(t => t.available).length },
  };
}

module.exports = {
  listTools, callTool, emitEvent, getStatus, getTenantConfig,
  TOOL_TIER_MAP, TOOL_AGENT_MAP, CROSS_TIER_EVENTS
};
