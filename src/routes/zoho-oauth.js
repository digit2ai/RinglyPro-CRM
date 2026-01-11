/**
 * Zoho OAuth Routes
 *
 * Handles OAuth callback for Zoho CRM integration.
 * Used to capture authorization code and exchange for tokens.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

// Zoho OAuth configuration
const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';

/**
 * GET /zoho/callback
 *
 * OAuth callback endpoint - Zoho redirects here after user authorization
 * Displays the authorization code and optionally exchanges it for tokens
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description, location, 'accounts-server': accountsServer } = req.query;

  // Handle error response from Zoho
  if (error) {
    console.error('[Zoho OAuth] Error:', error, error_description);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Zoho Authorization Failed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #d32f2f; margin-bottom: 20px; }
          .error-box { background: #ffebee; border: 1px solid #ef9a9a; padding: 20px; border-radius: 8px; margin: 20px 0; }
          code { background: #f5f5f5; padding: 4px 8px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Authorization Failed</h1>
          <div class="error-box">
            <p><strong>Error:</strong> <code>${error}</code></p>
            ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ''}
          </div>
          <p>Please try the authorization process again.</p>
          <p><a href="/settings/zoho">Back to Zoho Settings</a></p>
        </div>
      </body>
      </html>
    `);
  }

  // No code received
  if (!code) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Zoho Authorization</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>No Authorization Code</h1>
          <p>No authorization code was received from Zoho.</p>
          <p>Please start the authorization process from the Zoho settings page.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Success - display the code
  console.log('[Zoho OAuth] Authorization code received:', code.substring(0, 20) + '...');
  console.log('[Zoho OAuth] Location:', location);
  console.log('[Zoho OAuth] Accounts Server:', accountsServer);

  // Determine the correct token endpoint based on region
  let tokenUrl = ZOHO_TOKEN_URL;
  if (accountsServer) {
    tokenUrl = `${accountsServer}/oauth/v2/token`;
  } else if (location) {
    const regionMap = {
      'us': 'https://accounts.zoho.com',
      'eu': 'https://accounts.zoho.eu',
      'in': 'https://accounts.zoho.in',
      'au': 'https://accounts.zoho.com.au',
      'jp': 'https://accounts.zoho.jp',
      'cn': 'https://accounts.zoho.com.cn'
    };
    tokenUrl = `${regionMap[location] || regionMap['us']}/oauth/v2/token`;
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zoho Authorization Successful</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: linear-gradient(135deg, #1a365d 0%, #0d1b2a 100%); min-height: 100vh; }
        .container { max-width: 700px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        h1 { color: #1a365d; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; }
        .success-icon { font-size: 48px; margin-bottom: 20px; }
        .code-section { background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .code-section h3 { margin-top: 0; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .code-value { background: #1a365d; color: white; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; margin: 10px 0; }
        .copy-btn { background: #1a365d; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-top: 10px; font-size: 14px; }
        .copy-btn:hover { background: #0d1b2a; }
        .next-steps { background: #e8f5e9; border: 1px solid #a5d6a7; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .next-steps h3 { color: #2e7d32; margin-top: 0; }
        .next-steps ol { margin: 0; padding-left: 20px; }
        .next-steps li { margin: 10px 0; color: #333; }
        .warning { background: #fff3e0; border: 1px solid #ffcc80; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .warning strong { color: #e65100; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #666; }
        .info-value { color: #333; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">&#10004;</div>
        <h1>Authorization Successful!</h1>
        <p class="subtitle">Zoho CRM has authorized RinglyPro AI Agent</p>

        <div class="code-section">
          <h3>Authorization Code</h3>
          <div class="code-value" id="auth-code">${code}</div>
          <button class="copy-btn" onclick="copyCode()">Copy Code</button>
        </div>

        <div class="code-section">
          <h3>Connection Details</h3>
          <div class="info-row">
            <span class="info-label">Region</span>
            <span class="info-value">${location || 'US (default)'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Token Endpoint</span>
            <span class="info-value">${tokenUrl}</span>
          </div>
        </div>

        <div class="warning">
          <strong>Important:</strong> This authorization code expires in <strong>10 minutes</strong>.
          You must exchange it for tokens before it expires.
        </div>

        <div class="next-steps">
          <h3>Next Steps</h3>
          <ol>
            <li>Copy the authorization code above</li>
            <li>Use the following curl command to exchange it for tokens:</li>
          </ol>
          <div class="code-value" id="curl-command" style="font-size: 11px; white-space: pre-wrap;">curl -X POST "${tokenUrl}" \\
  -d "grant_type=authorization_code" \\
  -d "client_id=YOUR_CLIENT_ID" \\
  -d "client_secret=YOUR_CLIENT_SECRET" \\
  -d "redirect_uri=https://aiagent.ringlypro.com/zoho/callback" \\
  -d "code=${code}"</div>
          <button class="copy-btn" onclick="copyCurl()" style="margin-top: 10px;">Copy Curl Command</button>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          The response will contain your <code>access_token</code> and <code>refresh_token</code>.
          Save the refresh token securely - you'll need it to configure the Zoho integration.
        </p>
      </div>

      <script>
        function copyCode() {
          const code = document.getElementById('auth-code').textContent;
          navigator.clipboard.writeText(code).then(() => {
            alert('Authorization code copied to clipboard!');
          });
        }

        function copyCurl() {
          const curl = document.getElementById('curl-command').textContent;
          navigator.clipboard.writeText(curl).then(() => {
            alert('Curl command copied to clipboard!');
          });
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * POST /zoho/exchange-token
 *
 * Exchange authorization code for access and refresh tokens
 * This is an API endpoint for programmatic token exchange
 */
router.post('/exchange-token', async (req, res) => {
  const { code, clientId, clientSecret, region } = req.body;

  if (!code || !clientId || !clientSecret) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: code, clientId, clientSecret'
    });
  }

  // Determine token URL based on region
  const regionMap = {
    'us': 'https://accounts.zoho.com',
    'eu': 'https://accounts.zoho.eu',
    'in': 'https://accounts.zoho.in',
    'au': 'https://accounts.zoho.com.au',
    'jp': 'https://accounts.zoho.jp',
    'cn': 'https://accounts.zoho.com.cn'
  };
  const baseUrl = regionMap[region] || regionMap['us'];
  const tokenUrl = `${baseUrl}/oauth/v2/token`;

  try {
    const response = await axios.post(tokenUrl, null, {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://aiagent.ringlypro.com/zoho/callback',
        code: code
      }
    });

    console.log('[Zoho OAuth] Token exchange successful');

    res.json({
      success: true,
      data: {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        scope: response.data.scope,
        apiDomain: response.data.api_domain
      }
    });

  } catch (error) {
    console.error('[Zoho OAuth] Token exchange failed:', error.response?.data || error.message);

    res.status(400).json({
      success: false,
      error: error.response?.data?.error || 'Token exchange failed',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
