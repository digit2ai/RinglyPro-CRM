// agent-framework.cw.js
// FreightMind AI — Core Agent Framework
// Base class for all 8 AI agents (7 workers + 1 orchestrator)

const Anthropic = require('@anthropic-ai/sdk').default;
const { EventEmitter } = require('events');
const sequelize = require('./db.cw');

// Global event bus for agent-to-agent communication
const agentBus = new EventEmitter();
agentBus.setMaxListeners(20);

class FreightMindAgent {
  constructor(config) {
    this.name = config.name;           // e.g. 'freight_finder', 'rate_engine'
    this.model = config.model || 'claude-sonnet-4-5-20250514';
    this.systemPrompt = config.systemPrompt || '';
    this.tools = config.tools || [];   // MCP tool definitions
    this.tenantId = config.tenantId || 'logistics';
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // Execute a specific tool by name with given input
  async executeTool(toolName, input) {
    const startTime = Date.now();
    let success = true;
    let result = null;
    let error = null;

    try {
      const tool = this.tools.find(t => t.name === toolName);
      if (!tool) throw new Error(`Tool ${toolName} not found on agent ${this.name}`);

      // Execute the tool's handler function
      result = await tool.handler(input);
      return result;
    } catch (err) {
      success = false;
      error = err.message;
      throw err;
    } finally {
      // Log to lg_agent_log
      await this.logActivity(toolName, input, result, Date.now() - startTime, success, error);
    }
  }

  // Run the agent with a natural language prompt (for orchestrator delegation)
  async run(prompt, context = {}) {
    const startTime = Date.now();
    try {
      // Build tool definitions for Claude
      const claudeTools = this.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema
      }));

      const messages = [{ role: 'user', content: prompt }];

      // Add context from other agents if provided
      if (context.agentData) {
        messages[0].content += `\n\nContext from other agents:\n${JSON.stringify(context.agentData, null, 2)}`;
      }

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: claudeTools.length > 0 ? claudeTools : undefined,
        messages
      });

      // Process tool use responses
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const toolResult = await this.executeTool(block.name, block.input);
          toolResults.push({ tool: block.name, input: block.input, result: toolResult });
        }
      }

      // Extract text response
      const textBlocks = response.content.filter(b => b.type === 'text');
      const textResponse = textBlocks.map(b => b.text).join('\n');

      return {
        agent: this.name,
        response: textResponse,
        toolResults,
        model: this.model,
        duration_ms: Date.now() - startTime
      };
    } catch (err) {
      await this.logActivity('run', { prompt }, null, Date.now() - startTime, false, err.message);
      throw err;
    }
  }

  // Log activity to lg_agent_log
  async logActivity(toolName, input, output, durationMs, success, error) {
    try {
      await sequelize.query(
        `INSERT INTO lg_agent_log (tenant_id, agent_name, tool_name, input, output, duration_ms, success, error, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        { bind: [this.tenantId, this.name, toolName, JSON.stringify(input || {}), JSON.stringify(output || {}), durationMs, success, error || null] }
      );
    } catch (e) {
      console.error(`[${this.name}] Failed to log activity:`, e.message);
    }
  }

  // Log decision to audit trail
  async logDecision(actionType, entityType, entityId, decision, reasoning, confidence) {
    try {
      await sequelize.query(
        `INSERT INTO lg_audit_trail (tenant_id, agent_name, action_type, entity_type, entity_id, decision, reasoning, confidence, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        { bind: [this.tenantId, this.name, actionType, entityType, entityId, decision, reasoning, confidence] }
      );
    } catch (e) {
      console.error(`[${this.name}] Failed to log decision:`, e.message);
    }
  }

  // Emit event for other agents to consume
  emit(event, data) {
    agentBus.emit(event, { source: this.name, timestamp: new Date().toISOString(), ...data });
  }

  // Listen for events from other agents
  on(event, handler) {
    agentBus.on(event, handler);
  }

  // Get agent status
  getStatus() {
    return {
      name: this.name,
      model: this.model,
      toolCount: this.tools.length,
      tools: this.tools.map(t => t.name),
      tenantId: this.tenantId
    };
  }
}

// Agent Registry — keeps track of all running agent instances
const agentRegistry = {};

function registerAgent(agent) {
  agentRegistry[agent.name] = agent;
  console.log(`[FreightMind] Agent registered: ${agent.name} (${agent.tools.length} tools)`);
}

function getAgent(name) {
  return agentRegistry[name] || null;
}

function getAllAgents() {
  return Object.values(agentRegistry).map(a => a.getStatus());
}

module.exports = {
  FreightMindAgent,
  agentBus,
  registerAgent,
  getAgent,
  getAllAgents
};
