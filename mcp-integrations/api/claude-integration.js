const Anthropic = require('@anthropic-ai/sdk');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class ClaudeIntegration {
  constructor(apiKey) {
    this.anthropic = new Anthropic({ apiKey });
    this.conversationHistory = [];
  }

  async chat(message, context = {}) {
    this.conversationHistory.push({
      role: 'user',
      content: message
    });

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: this.conversationHistory,
        system: this.buildSystemPrompt(context)
      });

      const assistantMessage = response.content[0].text;
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      return {
        response: assistantMessage,
        usage: response.usage
      };
    } catch (error) {
      console.error('Claude API Error:', error);
      throw error;
    }
  }

  buildSystemPrompt(context) {
    return `You are an AI assistant for RinglyPro, a CRM and voice receptionist platform.
You have access to ${context.crmType || 'CRM'} data and can help users manage contacts, deals, appointments, and communications.

Available capabilities:
- Search and manage contacts
- Create and update deals/opportunities
- Schedule appointments
- Send SMS and emails
- Trigger workflows
- Analyze CRM data

${context.recentActivity ? `Recent Activity: ${JSON.stringify(context.recentActivity)}` : ''}`;
  }

  reset() {
    this.conversationHistory = [];
  }

  getSummary() {
    return {
      messageCount: this.conversationHistory.length,
      messages: this.conversationHistory
    };
  }
}

class RinglyProMCPServer {
  constructor(hubspotProxy, ghlProxy) {
    this.hubspotProxy = hubspotProxy;
    this.ghlProxy = ghlProxy;

    this.server = new Server(
      { name: 'ringlypro-copilot', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_crm_contacts',
          description: 'Search for contacts in HubSpot or GoHighLevel',
          inputSchema: {
            type: 'object',
            properties: {
              crm: { type: 'string', enum: ['hubspot', 'gohighlevel'] },
              query: { type: 'string' },
              limit: { type: 'number', default: 10 }
            },
            required: ['crm', 'query']
          }
        },
        {
          name: 'create_crm_contact',
          description: 'Create a new contact',
          inputSchema: {
            type: 'object',
            properties: {
              crm: { type: 'string', enum: ['hubspot', 'gohighlevel'] },
              email: { type: 'string' },
              firstname: { type: 'string' },
              lastname: { type: 'string' },
              phone: { type: 'string' }
            },
            required: ['crm', 'email', 'firstname', 'lastname']
          }
        },
        {
          name: 'send_sms',
          description: 'Send SMS (GoHighLevel only)',
          inputSchema: {
            type: 'object',
            properties: {
              contactId: { type: 'string' },
              message: { type: 'string' }
            },
            required: ['contactId', 'message']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;
        switch (name) {
          case 'search_crm_contacts':
            const proxy = args.crm === 'hubspot' ? this.hubspotProxy : this.ghlProxy;
            result = await proxy.searchContacts(args.query, args.limit);
            break;
          case 'create_crm_contact':
            const crmProxy = args.crm === 'hubspot' ? this.hubspotProxy : this.ghlProxy;
            const { crm, ...contactData } = args;
            result = await crmProxy.createContact(contactData);
            break;
          case 'send_sms':
            result = await this.ghlProxy.sendSMS(args.contactId, args.message);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RinglyPro MCP server running on stdio');
  }
}

module.exports = { ClaudeIntegration, RinglyProMCPServer };
