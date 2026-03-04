#!/usr/bin/env node
/**
 * Apply webhook tools to the PINAXIS ElevenLabs ConvAI agent
 *
 * Usage: node apply-elevenlabs-tools.js
 *
 * Reads tools from elevenlabs-tools-config.json and patches the agent via API.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const config = require('./elevenlabs-tools-config.json');

const AGENT_ID = config.agent_id;
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not found in .env');
  process.exit(1);
}

const tools = config.tools.map(t => ({
  type: t.type,
  name: t.name,
  description: t.description,
  api_schema: t.api_schema
}));

async function applyTools() {
  console.log('🔧 Applying PINAXIS tools to ElevenLabs agent:', AGENT_ID);
  console.log('');

  try {
    // Get current agent config
    console.log('📥 Fetching current agent configuration...');
    const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      method: 'GET',
      headers: { 'xi-api-key': API_KEY }
    });

    if (!getResponse.ok) {
      const error = await getResponse.text();
      throw new Error(`Failed to get agent: ${error}`);
    }

    const currentConfig = await getResponse.json();
    console.log('✅ Current config retrieved');
    console.log('   Current tools:', currentConfig.conversation_config?.agent?.prompt?.tools?.length || 0);

    // Update agent with PINAXIS tools
    console.log('');
    console.log('📤 Updating agent with', tools.length, 'PINAXIS tools...');

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

    await updateResponse.json();
    console.log('✅ Agent updated successfully!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('              PINAXIS VOICE AGENT TOOLS CONFIGURED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    tools.forEach((tool, i) => {
      console.log(`  ${i + 1}. ${tool.name}`);
      console.log(`     ${tool.description.substring(0, 70)}...`);
      console.log(`     URL: ${tool.api_schema.url}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎙️  The PINAXIS voice agent can now speak about warehouse reports!');
    console.log('');
    console.log('Test it by asking:');
    console.log('  • "What projects are available?"');
    console.log('  • "Give me the full report"');
    console.log('  • "What products do you recommend?"');
    console.log('  • "What\'s the ROI?"');
    console.log('  • "Tell me about the ABC classification"');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyTools();
