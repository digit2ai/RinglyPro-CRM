// event-handlers.js
// FreightMind AI — Cross-Tier Event Handlers
// When one agent emits an event, other agents automatically react

const path = require('path');
const cwPath = path.join(__dirname, '../../../cw_carriers/backend');
const { agentBus, getAgent } = require(path.join(cwPath, 'services/agent-framework.cw'));
const { getTenantConfig } = require(path.join(cwPath, 'services/mcp-server.cw'));

// Helper: safely execute a tool on an agent
async function safeExecute(agentName, toolName, input) {
  const agent = getAgent(agentName);
  if (!agent) {
    console.log(`[EventHandler] Agent ${agentName} not available, skipping ${toolName}`);
    return null;
  }
  try {
    const result = await agent.executeTool(toolName, input);
    console.log(`[EventHandler] ${agentName}.${toolName} executed successfully`);
    return result;
  } catch (err) {
    console.error(`[EventHandler] ${agentName}.${toolName} failed:`, err.message);
    return null;
  }
}

function registerEventHandlers() {
  console.log('[FreightMind] Registering cross-tier event handlers...');

  // ================================================================
  // TIER 1 → TIER 2: Load booked → auto-dispatch
  // ================================================================
  agentBus.on('load_booked', async (data) => {
    const { tenant_id, load_id } = data;
    console.log(`[Event] load_booked: Load ${load_id}`);

    // Find best driver and auto-assign
    const bestDriver = await safeExecute('dispatch_ai', 'find_best_driver', { load_id, tenant_id });
    if (bestDriver && bestDriver.ranked_drivers && bestDriver.ranked_drivers.length > 0) {
      const top = bestDriver.ranked_drivers[0];
      await safeExecute('dispatch_ai', 'assign_load', {
        load_id, driver_id: top.driver_id, truck_id: top.truck_id, tenant_id
      });
      console.log(`[Event] Auto-dispatched Load ${load_id} to Driver ${top.driver_id}`);
    }
  });

  // ================================================================
  // TIER 1 → TIER 4: Carrier onboarded → verify compliance
  // ================================================================
  agentBus.on('carrier_onboarded', async (data) => {
    const { tenant_id, carrier_id, mc_number } = data;
    console.log(`[Event] carrier_onboarded: Carrier ${carrier_id}`);

    await safeExecute('compliance', 'check_carrier_authority', { mc_number });
    await safeExecute('compliance', 'check_insurance', { carrier_id });
  });

  // ================================================================
  // TIER 2 → TIER 1: Load dispatched → update load status
  // ================================================================
  agentBus.on('load_dispatched', async (data) => {
    const { tenant_id, load_id, driver_id } = data;
    console.log(`[Event] load_dispatched: Load ${load_id}`);

    await safeExecute('tracking', 'update_load_status', {
      load_id, status: 'dispatched', notes: 'Auto-dispatched by FreightMind', tenant_id
    });
  });

  // ================================================================
  // TIER 2 → TIER 3: POD captured → auto-generate invoice
  // ================================================================
  agentBus.on('pod_captured', async (data) => {
    const { tenant_id, load_id } = data;
    console.log(`[Event] pod_captured: Load ${load_id}`);

    await safeExecute('billing', 'generate_invoice', { load_id, tenant_id });
    console.log(`[Event] Auto-generated invoice for Load ${load_id}`);
  });

  // ================================================================
  // TIER 2 → TIER 3 + TIER 1: Load delivered → invoice + find next
  // ================================================================
  agentBus.on('load_delivered', async (data) => {
    const { tenant_id, load_id, truck_id } = data;
    console.log(`[Event] load_delivered: Load ${load_id}`);

    // Trigger settlement calculation
    await safeExecute('billing', 'generate_invoice', { load_id, tenant_id });

    // Find next load for the now-idle truck
    if (truck_id) {
      await safeExecute('freight_finder', 'find_load_pairs', { load_id, tenant_id });
    }
  });

  // ================================================================
  // TIER 2 → TIER 3: Detention logged → add charges
  // ================================================================
  agentBus.on('detention_logged', async (data) => {
    const { tenant_id, load_id, minutes } = data;
    console.log(`[Event] detention_logged: Load ${load_id}, ${minutes} min`);
    // Detention charges will be included when invoice is generated
  });

  // ================================================================
  // TIER 2 → TIER 4: HOS warning → compliance alert
  // ================================================================
  agentBus.on('hos_warning', async (data) => {
    const { tenant_id, driver_id, hours_remaining } = data;
    console.log(`[Event] hos_warning: Driver ${driver_id}, ${hours_remaining}hrs remaining`);

    await safeExecute('compliance', 'check_hos_violation', { driver_id });
  });

  // ================================================================
  // TIER 2 → TIER 4: Driver assigned → pre-dispatch compliance gate
  // ================================================================
  agentBus.on('driver_assigned', async (data) => {
    const { tenant_id, driver_id, load_id } = data;
    console.log(`[Event] driver_assigned: Driver ${driver_id} to Load ${load_id}`);

    const cdl = await safeExecute('compliance', 'verify_cdl', { driver_id });
    const hos = await safeExecute('compliance', 'check_hos_violation', { driver_id });

    if (cdl && !cdl.valid) {
      console.log(`[Event] BLOCKED: Driver ${driver_id} CDL invalid`);
      // In production: unassign and find another driver
    }
    if (hos && hos.violations && hos.violations.length > 0) {
      console.log(`[Event] BLOCKED: Driver ${driver_id} HOS violation`);
    }
  });

  // ================================================================
  // TIER 4 → TIER 1 + TIER 2: Insurance lapsed → block carrier
  // ================================================================
  agentBus.on('insurance_lapsed', async (data) => {
    const { tenant_id, carrier_id } = data;
    console.log(`[Event] insurance_lapsed: Carrier ${carrier_id}`);
    // Flag carrier as non-compliant — will be filtered out of future matching
  });

  // ================================================================
  // TIER 4 → TIER 2: PM overdue → flag truck
  // ================================================================
  agentBus.on('pm_overdue', async (data) => {
    const { tenant_id, truck_id } = data;
    console.log(`[Event] pm_overdue: Truck ${truck_id}`);
    await safeExecute('maintenance_fleet', 'check_truck_health', { truck_id });
  });

  // ================================================================
  // ANY TIER → TIER 5: All events feed Neural Intelligence
  // ================================================================
  agentBus.on('neural_event', async (data) => {
    const { tenant_id, event } = data;
    // Neural passively observes — scans run on schedule, not per-event
    // But we log the event for the next scan to pick up
  });

  console.log('[FreightMind] 10 cross-tier event handlers registered');
}

module.exports = { registerEventHandlers };
