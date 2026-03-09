#!/usr/bin/env node
/**
 * Apply webhook tools to the LOGISTICS ElevenLabs ConvAI agent
 *
 * Usage: node apply-elevenlabs-tools.js
 *
 * Reads tools from elevenlabs-tools-config.json and MERGES them with
 * existing agent tools (preserving appointment booking, SMS, etc.).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const config = require('./elevenlabs-tools-config.json');

const AGENT_ID = config.agent_id;
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY not found in .env');
  process.exit(1);
}

const logisticsTools = config.tools.map(t => ({
  type: t.type,
  name: t.name,
  description: t.description,
  api_schema: t.api_schema
}));

// Names of all LOGISTICS tools (for dedup)
const logisticsToolNames = new Set(logisticsTools.map(t => t.name));

async function applyTools() {
  console.log('Applying LOGISTICS tools to ElevenLabs agent:', AGENT_ID);
  console.log('');

  try {
    // 1. Get current agent config
    console.log('Fetching current agent configuration...');
    const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      method: 'GET',
      headers: { 'xi-api-key': API_KEY }
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`Failed to get agent: ${error}`);
    }

    const currentConfig = await getResponse.json();
    const existingTools = currentConfig.conversation_config?.agent?.prompt?.tools || [];
    console.log('Current tools on agent:', existingTools.length);
    existingTools.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} (${t.type})`));

    // 2. Merge: keep existing non-LOGISTICS tools + add all LOGISTICS tools
    const keptTools = existingTools.filter(t => !logisticsToolNames.has(t.name));
    const mergedTools = [...keptTools, ...logisticsTools];

    console.log('');
    console.log(`Keeping ${keptTools.length} existing tools, adding ${logisticsTools.length} LOGISTICS tools`);
    console.log(`Total tools after merge: ${mergedTools.length}`);

    // 3. Update agent
    console.log('');
    console.log('Updating agent...');

    const updatePayload = {
      conversation_config: {
        agent: {
          prompt: {
            tools: mergedTools
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
    console.log('Agent updated successfully!');
    console.log('');
    console.log('====================================================================');
    console.log('              LOGISTICS VOICE AGENT TOOLS CONFIGURED');
    console.log('====================================================================');
    console.log('');

    // Show kept tools
    if (keptTools.length > 0) {
      console.log('  Existing tools (preserved):');
      keptTools.forEach((t, i) => {
        console.log(`    ${i + 1}. ${t.name} (${t.type})`);
      });
      console.log('');
    }

    // Show LOGISTICS tools
    console.log('  LOGISTICS tools (added):');
    logisticsTools.forEach((tool, i) => {
      console.log(`    ${i + 1}. ${tool.name}`);
      console.log(`       ${tool.description.substring(0, 70)}...`);
      console.log(`       URL: ${tool.api_schema.url}`);
      console.log('');
    });

    console.log('====================================================================');
    console.log('');
    console.log('The LOGISTICS voice agent can now speak about warehouse reports!');
    console.log('');
    console.log('Test it by asking:');
    console.log('  - "What projects are available?"');
    console.log('  - "Give me the full report"');
    console.log('  - "What products do you recommend?"');
    console.log('  - "What\'s the ROI?"');
    console.log('  - "Tell me about the ABC classification"');
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

applyTools();
