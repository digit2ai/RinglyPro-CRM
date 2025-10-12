require('dotenv').config();
const { RinglyProMCPServer } = require('./api/claude-integration');
const HubSpotMCPProxy = require('./api/hubspot-proxy');
const GoHighLevelMCPProxy = require('./api/gohighlevel-proxy');

const hubspotProxy = process.env.HUBSPOT_ACCESS_TOKEN
  ? new HubSpotMCPProxy(process.env.HUBSPOT_ACCESS_TOKEN)
  : null;

const ghlProxy = process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID
  ? new GoHighLevelMCPProxy(process.env.GHL_API_KEY, process.env.GHL_LOCATION_ID)
  : null;

if (!hubspotProxy && !ghlProxy) {
  console.error('Error: No CRM credentials provided');
  process.exit(1);
}

const server = new RinglyProMCPServer(hubspotProxy, ghlProxy);
server.run().catch(console.error);
