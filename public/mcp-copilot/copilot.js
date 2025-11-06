let sessionId = null;
let crmType = null;
// API_BASE is defined globally in index.html
let currentClientId = null;
let ghlConfigured = false; // Track if GHL is configured
let ghlCheckComplete = false; // Track if we've checked GHL status
let tokenBalance = 100; // Track current token balance
let featuresDisabled = false; // Track if features are disabled due to zero balance

// Mobile detection
function isMobile() {
    return window.innerWidth <= 768;
}

// Mobile popup functions
function openMobilePopup(title, url) {
    const modal = document.getElementById('mobilePopupModal');
    const titleEl = document.getElementById('mobilePopupTitle');
    const content = document.getElementById('mobilePopupContent');

    titleEl.textContent = title;
    content.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; border: none;"></iframe>`;
    modal.classList.add('active');

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

function closeMobilePopup() {
    const modal = document.getElementById('mobilePopupModal');
    const content = document.getElementById('mobilePopupContent');

    modal.classList.remove('active');
    content.innerHTML = '';

    // Restore body scroll
    document.body.style.overflow = '';
}

// Show query results in mobile popup
async function showMobileResultsPopup(message) {
    const modal = document.getElementById('mobilePopupModal');
    const titleEl = document.getElementById('mobilePopupTitle');
    const content = document.getElementById('mobilePopupContent');

    titleEl.textContent = '📊 Results';
    content.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        const response = await fetch(`${API_BASE}/copilot/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, message })
        });

        const data = await response.json();

        if (data.success) {
            // Format response with proper line breaks and styling
            const formattedText = data.response
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

            let html = `
                <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 15px; white-space: pre-wrap;">
                        ${formattedText}
                    </div>
            `;

            // Add data results if available
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                html += `<div style="margin-top: 20px; font-size: 14px; color: #6b7280;">Total Results: ${data.data.length}</div>`;
            }

            // Add CSV download button if available
            if (data.csvData && data.csvFilename) {
                html += `
                    <button onclick="downloadCSVFromPopup('${data.csvData}', '${data.csvFilename}')"
                            style="margin-top: 20px; width: 100%; padding: 15px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                        📥 Download CSV
                    </button>
                `;
            }

            html += '</div>';
            content.innerHTML = html;
        } else {
            content.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error: ${data.error}</div>`;
        }
    } catch (error) {
        content.innerHTML = `<div style="padding: 20px; color: #ef4444;">Failed to load results</div>`;
    }
}

// Download CSV from mobile popup
function downloadCSVFromPopup(csvData, filename) {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Disable all feature buttons
function disableAllButtons() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(button => {
        button.disabled = true;
        button.classList.add('disabled');
        button.style.opacity = '0.4';
        button.style.cursor = 'not-allowed';
    });

    // Also disable chat input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = 'Configure GoHighLevel in Settings to use features';
    }

    const sendButton = document.querySelector('button[onclick="sendMessage()"]');
    if (sendButton) {
        sendButton.disabled = true;
    }

    console.log('🔒 All buttons disabled - GHL not configured');
}

// Enable all feature buttons
function enableAllButtons() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(button => {
        button.disabled = false;
        button.classList.remove('disabled');
        button.style.opacity = '';
        button.style.cursor = '';
    });

    // Enable chat input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = 'Ask about contacts, appointments, or send commands...';
    }

    const sendButton = document.querySelector('button[onclick="sendMessage()"]');
    if (sendButton) {
        sendButton.disabled = false;
    }

    console.log('✅ All buttons enabled - GHL configured');
}

// Check token balance and show lock screen if zero
async function checkTokenBalance() {
    try {
        const response = await fetch(`${window.location.origin}/api/tokens/balance`, {
            credentials: 'include' // Include session cookies
        });
        const data = await response.json();

        if (data.success !== false) {
            tokenBalance = data.balance || data.tokens_balance || 0;
            featuresDisabled = data.features_disabled || tokenBalance <= 0;

            console.log(`💰 Token Balance: ${tokenBalance}`, featuresDisabled ? '(❌ Features Disabled)' : '(✅ Features Available)');

            // Show lock screen if tokens are zero
            if (featuresDisabled) {
                showTokenLockScreen();
            } else {
                hideTokenLockScreen();
            }

            return !featuresDisabled;
        } else {
            console.warn('⚠️ Could not fetch token balance');
            return true; // Don't block if we can't check
        }
    } catch (error) {
        console.error('Error checking token balance:', error);
        return true; // Don't block on error
    }
}

// Show full-page lock screen for zero tokens (similar to GHL lock)
function showTokenLockScreen() {
    // Remove existing lock screen if any
    hideTokenLockScreen();

    const lockScreen = document.createElement('div');
    lockScreen.id = 'tokenLockScreen';
    lockScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;

    lockScreen.innerHTML = `
        <div style="
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        ">
            <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>

            <h2 style="
                font-size: 28px;
                font-weight: 700;
                color: #111827;
                margin-bottom: 16px;
            ">
                AI Copilot Locked
            </h2>

            <p style="
                font-size: 16px;
                color: #6b7280;
                margin-bottom: 24px;
                line-height: 1.6;
            ">
                Your token balance is <strong style="color: #ef4444;">${tokenBalance} tokens</strong>.
                <br><br>
                Purchase tokens to unlock all AI Copilot features:
            </p>

            <div style="
                background: #f9fafb;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                text-align: left;
            ">
                <div style="font-size: 14px; color: #374151; margin-bottom: 12px;">
                    <strong>🚀 AI Copilot Features:</strong>
                </div>
                <ul style="
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    font-size: 14px;
                    color: #6b7280;
                ">
                    <li style="padding: 6px 0;">✓ Business Collector & Auto-Caller</li>
                    <li style="padding: 6px 0;">✓ AI Content Generator</li>
                    <li style="padding: 6px 0;">✓ Email Marketing</li>
                    <li style="padding: 6px 0;">✓ Social Media Marketing</li>
                    <li style="padding: 6px 0;">✓ Prospect Manager</li>
                    <li style="padding: 6px 0;">✓ CRM Data Analysis</li>
                </ul>
            </div>

            <a href="/" style="
                display: inline-block;
                background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                color: white;
                padding: 16px 32px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                text-decoration: none;
                margin-bottom: 12px;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 30px rgba(79, 70, 229, 0.3)';"
               onmouseout="this.style.transform=''; this.style.boxShadow='';">
                💳 Purchase Tokens
            </a>

            <div style="margin-top: 16px;">
                <a href="/" style="
                    color: #6b7280;
                    font-size: 14px;
                    text-decoration: none;
                " onmouseover="this.style.color='#374151';" onmouseout="this.style.color='#6b7280';">
                    ← Return to Dashboard
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(lockScreen);
    console.log('🔒 Token lock screen displayed');
}

// Hide token lock screen
function hideTokenLockScreen() {
    const lockScreen = document.getElementById('tokenLockScreen');
    if (lockScreen) {
        lockScreen.remove();
        console.log('✅ Token lock screen hidden');
    }
}

// Check GHL configuration status
async function checkGHLConfiguration() {
    if (!currentClientId) {
        console.log('⚠️ No client ID - cannot check GHL status');
        disableAllButtons();
        return false;
    }

    try {
        const response = await fetch(`${window.location.origin}/api/copilot/check-access/${currentClientId}`);
        const data = await response.json();

        ghlConfigured = data.ghl_configured || false;
        ghlCheckComplete = true;

        console.log(`🔍 GHL Configuration Status:`, ghlConfigured ? '✅ Configured' : '❌ Not Configured');

        // Also check token balance
        const hasTokens = await checkTokenBalance();

        // Enable or disable buttons based on BOTH GHL configuration AND token balance
        if (ghlConfigured && hasTokens) {
            enableAllButtons();
        } else {
            disableAllButtons();
        }

        return ghlConfigured && hasTokens;
    } catch (error) {
        console.error('Error checking GHL configuration:', error);
        ghlCheckComplete = true;
        disableAllButtons();
        return false;
    }
}

// Check if feature requires GHL and tokens
function requireGHL(featureName) {
    if (!ghlCheckComplete) {
        console.log('⏳ GHL check not complete yet');
        return false;
    }

    // Check token balance first (more critical)
    // Lock screen already displayed, just log and return false
    if (featuresDisabled || tokenBalance <= 0) {
        console.log(`⚠️ ${featureName} blocked: Insufficient tokens (balance: ${tokenBalance})`);
        return false;
    }

    // Then check GHL configuration
    if (!ghlConfigured) {
        console.log(`⚠️ ${featureName} requires GHL configuration`);
        if (window.ghlUpgrade && window.ghlUpgrade.show) {
            window.ghlUpgrade.show();
        } else {
            alert('You must configure GoHighLevel in Settings to use this feature.');
        }
        return false;
    }

    return true;
}

// Check for client_id in URL and auto-load credentials
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client_id');

    if (clientId) {
        currentClientId = clientId;
        console.log('📋 Client ID detected:', clientId);

        // Check GHL configuration first
        await checkGHLConfiguration();

        // Then load credentials
        await autoLoadCredentials(clientId);
    }
});

// Open Social Media Marketing Tool
function openSocialMedia() {
    // Check GHL requirement
    if (!requireGHL('Social Media Marketing')) {
        return;
    }

    // Build URL with optional params
    let params = [];
    if (currentClientId) params.push(`client_id=${currentClientId}`);
    if (sessionId) params.push(`session_id=${sessionId}`);

    const socialUrl = `${window.location.origin}/mcp-copilot/social-media.html${params.length ? '?' + params.join('&') : ''}`;

    // Use popup on mobile, new tab on desktop
    if (isMobile()) {
        openMobilePopup('📱 Social Media Marketing', socialUrl);
    } else {
        window.open(socialUrl, '_blank');
    }
}

// Open Email Marketing Tool
function openEmailMarketing() {
    // Build URL with optional client_id
    const emailUrl = currentClientId
        ? `${window.location.origin}/mcp-copilot/email-marketing.html?client_id=${currentClientId}`
        : `${window.location.origin}/mcp-copilot/email-marketing.html`;

    // Use popup on mobile, new tab on desktop
    if (isMobile()) {
        openMobilePopup('📧 Email Marketing', emailUrl);
    } else {
        window.open(emailUrl, '_blank');
    }
}

// Open Prospect Manager
function openProspectManager() {
    // Check GHL requirement
    if (!requireGHL('Prospect Manager')) {
        return;
    }

    // Build URL with optional client_id
    const prospectUrl = currentClientId
        ? `${window.location.origin}/mcp-copilot/prospect-manager.html?client_id=${currentClientId}`
        : `${window.location.origin}/mcp-copilot/prospect-manager.html`;

    // Use popup on mobile, new tab on desktop
    if (isMobile()) {
        openMobilePopup('📊 Prospect Manager', prospectUrl);
    } else {
        window.open(prospectUrl, '_blank');
    }
}

// Connect to Business Collector
function connectBusinessCollector() {
    // Check GHL requirement
    if (!requireGHL('Business Collector')) {
        return;
    }

    console.log('🔍 Opening Business Collector...');
    if (typeof openBusinessCollectorForm === 'function') {
        openBusinessCollectorForm();
    } else {
        console.error('❌ Business Collector form not loaded');
        alert('Business Collector form not available. Please refresh the page.');
    }
}

// Disconnect from Business Collector
function disconnectBusinessCollector() {
    sessionId = null;
    crmType = null;

    const btn = document.getElementById('businessCollectorBtn');
    const statusDiv = document.getElementById('businessCollectorStatus');

    btn.innerHTML = '🔍 Business Collector';
    btn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
    btn.onclick = connectBusinessCollector;

    statusDiv.textContent = 'Not connected';
    statusDiv.style.background = '#f3f4f6';
    statusDiv.style.color = '#6b7280';

    // Update header
    const headerStatus = document.getElementById('crmStatus');
    if (headerStatus) {
        headerStatus.textContent = 'Not Connected';
        headerStatus.style.background = '#6b7280';
    }

    addMessage('system', '👋 Disconnected from Business Collector');
}

async function autoLoadCredentials(clientId) {
    try {
        console.log('🔄 Auto-loading credentials for client:', clientId);
        updateConnectionStatus('Loading...', 'loading');

        const url = `${window.location.origin}/api/client/crm-credentials/${clientId}`;
        console.log('📡 Fetching from:', url);

        const response = await fetch(url);
        console.log('📥 Response status:', response.status);

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (data.success && data.credentials) {
            console.log('✅ CRM credentials loaded:', data.credentials);

            // Auto-connect to GoHighLevel if configured
            if (data.credentials.gohighlevel && data.credentials.gohighlevel.configured) {
                console.log('🔗 GoHighLevel configured, auto-connecting...');

                // Store credentials for connection
                window.ghlCredentials = {
                    apiKey: data.credentials.gohighlevel.api_key,
                    locationId: data.credentials.gohighlevel.location_id
                };

                // Save to localStorage for chat page auto-connect
                localStorage.setItem('ghl_apiKey', data.credentials.gohighlevel.api_key);
                localStorage.setItem('ghl_locationId', data.credentials.gohighlevel.location_id);

                console.log('💾 Stored credentials:', window.ghlCredentials);

                // Auto-connect silently (no chat message)
                await connectGoHighLevel();
                return;
            } else {
                console.log('⚠️ GoHighLevel not configured:', data.credentials.gohighlevel);
            }

            // If no CRM configured
            updateConnectionStatus('Not configured', 'error');
            addMessage('system', '⚠️ No GoHighLevel credentials found. Please configure in Settings.');
        } else {
            console.log('❌ Invalid response:', data);
        }
    } catch (error) {
        console.error('❌ Failed to load CRM credentials:', error);
        updateConnectionStatus('Connection failed', 'error');
        addMessage('system', '⚠️ Could not load saved credentials. Please configure in Settings.');
    }
}

async function connectGoHighLevel() {
    // Use pre-loaded credentials from Settings
    const apiKey = window.ghlCredentials?.apiKey;
    const locationId = window.ghlCredentials?.locationId;

    console.log('🔗 connectGoHighLevel called');
    console.log('📋 currentClientId:', currentClientId);

    if (!apiKey || !locationId) {
        updateConnectionStatus('Not configured', 'error');
        addMessage('error', '❌ GoHighLevel credentials not configured. Please go to Settings in the dashboard.');
        return;
    }

    if (!currentClientId) {
        updateConnectionStatus('Configuration error', 'error');
        addMessage('error', '❌ Client ID not found. Please open the copilot from the dashboard.');
        return;
    }

    try {
        console.log('📤 Sending connection request with clientId:', currentClientId);
        const response = await fetch(`${API_BASE}/gohighlevel/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, locationId, clientId: currentClientId })
        });

        const data = await response.json();
        if (data.success) {
            sessionId = data.sessionId;
            crmType = 'gohighlevel';
            updateConnectionStatus('Connected to GoHighLevel', 'success');
            // Silent connection - no chat message
        } else {
            alert('Failed to connect: ' + data.error);
        }
    } catch (error) {
        alert('Connection error: ' + error.message);
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    // Check GHL requirement for CRM AI Agent chat
    if (!requireGHL('CRM AI Agent')) {
        return;
    }

    if (!sessionId) {
        alert('Please connect to a CRM first');
        return;
    }

    // Check if this is a conversational command that needs back-and-forth
    const isConversational = /(create|add|new|update|send|sms|email|tag).*contact/i.test(message) ||
                            /create.*contact|send.*sms|send.*email|add.*tag|remove.*tag/i.test(message);

    // On mobile, show popup with results (but NOT for conversational commands)
    if (isMobile() && !isConversational) {
        showMobileResultsPopup(message);
        input.value = '';
        return;
    }

    addMessage('user', message);
    input.value = '';

    try {
        const response = await fetch(`${API_BASE}/copilot/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, message })
        });

        const data = await response.json();
        if (data.success) {
            addMessage('assistant', data.response, data.data);

            // Handle CSV download if provided
            if (data.csvData && data.csvFilename) {
                downloadCSV(data.csvData, data.csvFilename);
            }

            if (data.suggestions) {
                addSuggestions(data.suggestions);
            }
        } else {
            addMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        addMessage('error', 'Failed to send message');
    }
}

function addMessage(type, text, data = null) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    // Preserve line breaks by converting \n to <br> and escaping HTML
    const formattedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    let content = `<p style="white-space: pre-wrap;">${formattedText}</p>`;

    if (data && Array.isArray(data) && data.length > 0) {
        content += '<div class="data-results">';
        content += `<p>Found ${data.length} results</p>`;
        content += '</div>';
    }

    messageDiv.innerHTML = content;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSuggestions(suggestions) {
    const messagesDiv = document.getElementById('chatMessages');
    const suggestDiv = document.createElement('div');
    suggestDiv.className = 'suggestions';

    suggestions.forEach(suggestion => {
        const btn = document.createElement('button');
        btn.textContent = suggestion;
        btn.onclick = () => quickAction(suggestion);
        suggestDiv.appendChild(btn);
    });

    messagesDiv.appendChild(suggestDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function quickAction(action) {
    document.getElementById('messageInput').value = action;
    sendMessage();
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function downloadCSV(csvData, filename) {
    // Create a blob from the CSV data
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });

    // Create a temporary link to trigger download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    URL.revokeObjectURL(url);

    // Add a message to confirm download
    addMessage('system', `📥 CSV file "${filename}" downloaded successfully!`);
}

function updateConnectionStatus(message, status) {
    const statusDiv = document.getElementById('connectionStatus');
    const statusDot = document.getElementById('statusDot');

    statusDiv.textContent = message;

    // Update status dot (red/green indicator)
    if (status === 'success') {
        statusDot.classList.remove('inactive');
        statusDot.classList.add('active');
    } else {
        statusDot.classList.remove('active');
        statusDot.classList.add('inactive');
    }

    // Update styling based on status
    if (status === 'success') {
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';
    } else if (status === 'error') {
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#991b1b';
    } else if (status === 'loading') {
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
    } else {
        statusDiv.style.background = '#f3f4f6';
        statusDiv.style.color = '#6b7280';
    }

    // Update header status
    const headerStatus = document.getElementById('crmStatus');
    if (headerStatus) {
        headerStatus.textContent = message;
    }
}
