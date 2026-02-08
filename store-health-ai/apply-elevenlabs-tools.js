#!/usr/bin/env node
/**
 * Apply webhook tools to ElevenLabs AI Store Manager agent
 *
 * Usage: node apply-elevenlabs-tools.js
 */

require('dotenv').config();

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_3701kgg7d7v3e1vbjsxv0p5pn48e';
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not found in .env');
  process.exit(1);
}

// Correct ElevenLabs webhook tool format
const tools = [
  {
    type: "webhook",
    name: "get_dashboard_overview",
    description: "Get the current dashboard overview with total stores, health scores, and status breakdown (green/yellow/red counts). Use this when the user asks about overall network health, how many stores need attention, or general performance summary.",
    api_schema: {
      url: "https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/overview",
      method: "GET"
    }
  },
  {
    type: "webhook",
    name: "get_store_details",
    description: "Get detailed information about a specific store including its KPIs, health score, and current status. Use this when the user asks about a specific store by name or code. Store mapping: 1=Manhattan 42nd St, 2=Brooklyn Heights, 3=Queens Plaza, 4=Bronx Fordham, 5=Staten Island Mall, 6=Upper East Side, 7=Harlem 125th, 8=Greenwich Village, 9=Williamsburg, 10=Long Island City",
    api_schema: {
      url: "https://aiagent.ringlypro.com/aiastore/api/v1/stores/{store_id}",
      method: "GET",
      path_params_schema: {
        store_id: {
          type: "string",
          description: "The store ID number (1-10)"
        }
      }
    }
  },
  {
    type: "webhook",
    name: "get_critical_stores",
    description: "Get a list of stores that are in critical condition (red status) and require immediate attention. Use this when the user asks 'Which stores need attention?', 'What stores are critical?', 'Show me problem stores', or 'What should I focus on today?'.",
    api_schema: {
      url: "https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/critical-stores",
      method: "GET"
    }
  },
  {
    type: "webhook",
    name: "get_kpi_breakdown",
    description: "Get detailed breakdown of a specific KPI across all stores. Use when user asks about specific metrics like sales, labor, inventory, traffic, or conversion. KPI codes: SALES, LABOR, INVENTORY, TRAFFIC, CONVERSION",
    api_schema: {
      url: "https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/kpi-breakdown/{kpi_code}",
      method: "GET",
      path_params_schema: {
        kpi_code: {
          type: "string",
          description: "The KPI code: SALES, LABOR, INVENTORY, TRAFFIC, or CONVERSION",
          enum: ["SALES", "LABOR", "INVENTORY", "TRAFFIC", "CONVERSION"]
        }
      }
    }
  },
  {
    type: "webhook",
    name: "get_active_alerts",
    description: "Get list of active alerts that need attention. Use when user asks 'What alerts do I have?', 'Any new issues?', 'What's happening today?'.",
    api_schema: {
      url: "https://aiagent.ringlypro.com/aiastore/api/v1/alerts?status=active&limit=10",
      method: "GET"
    }
  }
];

async function applyTools() {
  console.log('🔧 Applying tools to ElevenLabs agent:', AGENT_ID);
  console.log('');

  try {
    // First, get current agent config
    console.log('📥 Fetching current agent configuration...');
    const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      method: 'GET',
      headers: {
        'xi-api-key': API_KEY
      }
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`Failed to get agent: ${error}`);
    }

    const currentConfig = await getResponse.json();
    console.log('✅ Current config retrieved');
    console.log('   Current tools:', currentConfig.conversation_config?.agent?.prompt?.tools?.length || 0);

    // Update agent with new tools
    console.log('');
    console.log('📤 Updating agent with', tools.length, 'tools...');

    const updatePayload = {
      conversation_config: {
        agent: {
          prompt: {
            tools: tools
          }
        }
      }
    };

    const updateResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      throw new Error(`Failed to update agent: ${error}`);
    }

    const result = await updateResponse.json();
    console.log('✅ Agent updated successfully!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    TOOLS CONFIGURED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    tools.forEach((tool, i) => {
      console.log(`  ${i + 1}. ${tool.name}`);
      console.log(`     ${tool.description.substring(0, 60)}...`);
      console.log(`     URL: ${tool.api_schema.url}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎉 Virginia can now fetch live Store Health AI data!');
    console.log('');
    console.log('Test it by asking:');
    console.log('  • "How are my stores doing today?"');
    console.log('  • "Which stores need attention?"');
    console.log('  • "Tell me about Manhattan 42nd St"');
    console.log('  • "How are sales performing?"');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyTools();
