const COPILOT_VERSION = 'v126';
console.log(`🚀 MCP Copilot ${COPILOT_VERSION} loaded`);

let sessionId = null;
let crmType = null;
// API_BASE is defined globally in index.html
let currentClientId = null;
let crmConfigured = false; // Track if ANY CRM is configured (GHL, HubSpot, or Vagaro)
let activeCRM = null; // Track which CRM is active ('ghl', 'hubspot', 'vagaro', or null)
let ghlConfigured = false; // Track if GHL is configured (backwards compatibility)
let ghlCheckComplete = false; // Track if we've checked CRM status
let tokenBalance = 100; // Track current token balance
let featuresDisabled = false; // Track if features are disabled due to zero balance
let connectionStatusLocked = false; // Prevent status updates after initial check (Safari fix)

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
        // Skip Business Collector, Prospect Manager, and Outbound Call - they work without GHL
        if (button.classList.contains('btn-business') ||
            button.classList.contains('btn-prospects') ||
            button.classList.contains('btn-call')) {
            return; // Skip these buttons
        }

        // Don't fully disable - keep clickable but add visual indicator
        button.classList.add('requires-ghl');
        button.style.textDecoration = 'line-through';
        button.style.cursor = 'pointer';

        // Add lock emoji to button text if not already there
        const buttonText = button.querySelector('div:last-child');
        if (buttonText && !buttonText.textContent.includes('🔒')) {
            buttonText.textContent = '🔒 ' + buttonText.textContent;
        }

        // Override onclick to show GHL upgrade prompt
        const originalOnclick = button.getAttribute('onclick');
        button.setAttribute('data-original-onclick', originalOnclick);
        button.setAttribute('onclick', 'showGHLUpgradePrompt()');
    });

    // Also disable chat input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = true;
        const reason = (featuresDisabled || tokenBalance <= 0)
            ? 'Purchase tokens to use AI Copilot features'
            : 'Configure GoHighLevel in Settings to use features';
        messageInput.placeholder = reason;
    }

    const sendButton = document.querySelector('button[onclick="sendMessage()"]');
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.style.opacity = '0.4';
        sendButton.style.cursor = 'not-allowed';
    }

    const lockReason = (featuresDisabled || tokenBalance <= 0)
        ? `Zero token balance (${tokenBalance} tokens)`
        : 'CRM not configured';
    console.log(`🔒 CRM-dependent buttons require upgrade - ${lockReason} (Business tools remain available)`);
}

// Enable only token-based features (Business Collector, Outbound Caller, Prospect Manager)
// These DO NOT require CRM, only tokens
function enableTokenBasedFeatures() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(button => {
        // Enable Business Collector, Prospect Manager, and Outbound Call
        if (button.classList.contains('btn-business') ||
            button.classList.contains('btn-prospects') ||
            button.classList.contains('btn-call')) {
            button.disabled = false;
            button.classList.remove('disabled', 'requires-ghl', 'requires-crm');
            button.style.opacity = '';
            button.style.cursor = '';
            button.style.textDecoration = '';
            button.style.pointerEvents = '';

            // Restore original onclick if it was saved
            const originalOnclick = button.getAttribute('data-original-onclick');
            if (originalOnclick) {
                button.setAttribute('onclick', originalOnclick);
                button.removeAttribute('data-original-onclick');
            }

            // Remove lock emoji from button text
            const buttonText = button.querySelector('div:last-child');
            if (buttonText && buttonText.textContent.includes('🔒 ')) {
                buttonText.textContent = buttonText.textContent.replace('🔒 ', '');
            }
        } else {
            // Disable CRM-dependent features (CRM AI Agent, Social Media, Email Marketing)
            button.classList.add('requires-crm');
            button.style.textDecoration = 'line-through';
            button.style.cursor = 'pointer';

            // Add lock emoji if not there
            const buttonText = button.querySelector('div:last-child');
            if (buttonText && !buttonText.textContent.includes('🔒')) {
                buttonText.textContent = '🔒 ' + buttonText.textContent;
            }

            // Override onclick to show CRM upgrade prompt
            const originalOnclick = button.getAttribute('onclick');
            if (originalOnclick && !button.getAttribute('data-original-onclick')) {
                button.setAttribute('data-original-onclick', originalOnclick);
            }
            button.setAttribute('onclick', 'showCRMUpgradePrompt()');
        }
    });

    // Keep chat disabled (requires CRM for AI responses)
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = 'Configure a CRM (GHL, HubSpot, or Vagaro) to use AI chat features';
    }

    const sendButton = document.querySelector('button[onclick="sendMessage()"]');
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.style.opacity = '0.4';
        sendButton.style.cursor = 'not-allowed';
    }

    console.log('✅ Token-based features enabled (Business Collector, Outbound Caller, Prospect Manager)');
    console.log('🔒 CRM-dependent features locked (AI Chat, Social Media, Email Marketing)');
}

// Enable all feature buttons
function enableAllButtons() {
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(button => {
        button.disabled = false;
        button.classList.remove('disabled', 'requires-ghl', 'requires-crm');
        button.style.opacity = '';
        button.style.cursor = '';
        button.style.textDecoration = '';
        button.style.pointerEvents = '';

        // Restore original onclick if it was saved
        const originalOnclick = button.getAttribute('data-original-onclick');
        if (originalOnclick) {
            button.setAttribute('onclick', originalOnclick);
            button.removeAttribute('data-original-onclick');
        }

        // Remove lock emoji from button text
        const buttonText = button.querySelector('div:last-child');
        if (buttonText && buttonText.textContent.includes('🔒 ')) {
            buttonText.textContent = buttonText.textContent.replace('🔒 ', '');
        }
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
        sendButton.style.opacity = '';
        sendButton.style.cursor = '';
    }

    console.log('✅ All buttons enabled - CRM configured');
}

// Check token balance and disable buttons if zero
async function checkTokenBalance() {
    try {
        // Use client_id parameter for copilot access (no JWT required)
        const url = currentClientId
            ? `${window.location.origin}/api/tokens/balance-from-copilot?client_id=${currentClientId}`
            : `${window.location.origin}/api/tokens/balance`;

        console.log(`💰 Fetching token balance from: ${url}`);

        const response = await fetch(url, {
            credentials: 'include' // Include session cookies (for authenticated endpoint fallback)
        });

        console.log(`💰 Token API response status: ${response.status}`);

        const data = await response.json();
        console.log(`💰 Token API response data:`, data);

        if (data.success !== false) {
            tokenBalance = data.balance || data.tokens_balance || 0;
            featuresDisabled = data.features_disabled || tokenBalance <= 0;

            console.log(`💰 Token Balance: ${tokenBalance}`, featuresDisabled ? '(❌ Features Disabled)' : '(✅ Features Available)');
            console.log(`💰 Returning: ${!featuresDisabled}`);

            return !featuresDisabled;
        } else {
            console.warn('⚠️ Could not fetch token balance - API returned success: false');
            console.warn('⚠️ Defaulting to ALLOW (return true)');
            return true; // Don't block if we can't check
        }
    } catch (error) {
        console.error('❌ Error checking token balance:', error);
        console.error('❌ Defaulting to ALLOW (return true)');
        return true; // Don't block on error
    }
}

// Show popup to purchase tokens (triggered when clicking disabled buttons)
function showTokenPurchasePopup() {
    // Remove existing popup if any
    const existingPopup = document.getElementById('tokenPurchasePopup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.id = 'tokenPurchasePopup';
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.2s ease-out;
    `;

    popup.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 450px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease-out;
        ">
            <div style="font-size: 56px; margin-bottom: 16px;">⚠️</div>

            <h2 style="
                font-size: 24px;
                font-weight: 700;
                color: #111827;
                margin-bottom: 12px;
            ">
                Insufficient Tokens
            </h2>

            <p style="
                font-size: 16px;
                color: #6b7280;
                margin-bottom: 24px;
                line-height: 1.5;
            ">
                Your token balance is <strong style="color: #ef4444;">${tokenBalance} tokens</strong>.
                <br><br>
                Purchase tokens to continue using AI Copilot features.
            </p>

            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <a href="/" style="
                    display: inline-block;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    padding: 14px 28px;
                    border-radius: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: transform 0.2s, box-shadow 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(79, 70, 229, 0.3)';"
                   onmouseout="this.style.transform=''; this.style.boxShadow='';">
                    💳 Purchase Tokens
                </a>

                <button onclick="closeTokenPurchasePopup()" style="
                    background: #f3f4f6;
                    color: #374151;
                    padding: 14px 28px;
                    border-radius: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#e5e7eb';"
                   onmouseout="this.style.background='#f3f4f6';">
                    Cancel
                </button>
            </div>
        </div>
    `;

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(popup);
    console.log('⚠️ Token purchase popup displayed');
}

// Close token purchase popup
function closeTokenPurchasePopup() {
    const popup = document.getElementById('tokenPurchasePopup');
    if (popup) {
        popup.remove();
        console.log('✅ Token purchase popup closed');
    }
}

// Check CRM configuration status (GHL, HubSpot, or Vagaro)
async function checkGHLConfiguration() {
    console.log(`🔍 checkCRMConfiguration() called for client: ${currentClientId}`);

    if (!currentClientId) {
        console.log('⚠️ No client ID - cannot check CRM status');
        disableAllButtons();
        return false;
    }

    try {
        const apiUrl = `${window.location.origin}/api/copilot/check-access/${currentClientId}`;
        console.log(`📡 Calling CRM check API: ${apiUrl}`);

        const response = await fetch(apiUrl);
        console.log(`📡 CRM check response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`📦 CRM check response:`, data);

        // Multi-CRM support: check for any configured CRM
        crmConfigured = data.crm_configured || data.ghl_configured || false;
        activeCRM = data.active_crm || null;
        ghlConfigured = data.ghl_configured || false; // Backwards compatibility
        ghlCheckComplete = true;

        console.log(`🔍 CRM Configuration Status:`, crmConfigured ? `✅ Configured (${activeCRM})` : '❌ Not Configured');
        if (data.integrations) {
            console.log(`📊 Available integrations:`, data.integrations);
        }

        // Also check token balance
        console.log(`💰 Checking token balance...`);
        const hasTokens = await checkTokenBalance();
        console.log(`💰 Token check result: ${hasTokens ? '✅ Has tokens' : '❌ No tokens'}`);

        // Enable or disable buttons based on configuration
        // Business Collector, Outbound Caller, and Prospect Manager only need TOKENS (no CRM required)
        // CRM AI Agent, Social Media, Email Marketing need BOTH CRM AND tokens
        console.log(`🎯 Final decision: crmConfigured=${crmConfigured}, activeCRM=${activeCRM}, hasTokens=${hasTokens}`);

        if (hasTokens) {
            // Has tokens - enable token-based features (Business Collector, Outbound, Prospects)
            // CRM-dependent features will be controlled separately
            if (crmConfigured) {
                console.log(`✅ ENABLING all buttons (${activeCRM} + Tokens)`);
                enableAllButtons();
                // Show which CRM is connected
                const crmDisplayName = getCRMDisplayName(activeCRM);
                updateConnectionStatus(`Connected to ${crmDisplayName}`, 'success');
            } else {
                console.log('✅ ENABLING token-based features only (No CRM)');
                enableTokenBasedFeatures();
                updateConnectionStatus('Business tools ready (CRM not configured)', 'warning');
            }
        } else {
            console.log(`❌ DISABLING all buttons (No tokens: ${tokenBalance})`);
            disableAllButtons();
            updateConnectionStatus('Insufficient tokens', 'error');
            console.log('⚠️ Token balance is zero - popup will show on button click');
        }

        return hasTokens; // Return true if user can use token-based features
    } catch (error) {
        console.error('❌ Error checking CRM configuration:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
        ghlCheckComplete = true;
        disableAllButtons();
        updateConnectionStatus(`Check failed: ${error.message}`, 'error');
        return false;
    }
}

// Get display name for CRM type
function getCRMDisplayName(crm) {
    switch (crm) {
        case 'ghl':
            return 'GoHighLevel';
        case 'hubspot':
            return 'HubSpot';
        case 'vagaro':
            return 'Vagaro';
        default:
            return crm || 'CRM';
    }
}

// Check if feature requires CRM and tokens
function requireGHL(featureName) {
    if (!ghlCheckComplete) {
        console.log('⏳ CRM check not complete yet');
        return false;
    }

    // Check token balance first (more critical)
    // Lock screen already displayed, just log and return false
    if (featuresDisabled || tokenBalance <= 0) {
        console.log(`⚠️ ${featureName} blocked: Insufficient tokens (balance: ${tokenBalance})`);
        return false;
    }

    // Then check CRM configuration (any of GHL, HubSpot, or Vagaro)
    if (!crmConfigured) {
        console.log(`⚠️ ${featureName} requires CRM configuration (GHL, HubSpot, or Vagaro)`);
        if (window.ghlUpgrade && window.ghlUpgrade.show) {
            window.ghlUpgrade.show();
        } else {
            alert('You must configure a CRM (GoHighLevel, HubSpot, or Vagaro) in Settings to use this feature.');
        }
        return false;
    }

    return true;
}

// Alias for backwards compatibility
function requireCRM(featureName) {
    return requireGHL(featureName);
}

// Show CRM upgrade prompt when locked features are clicked
function showGHLUpgradePrompt() {
    showCRMUpgradePrompt();
}

// Show CRM integration prompt (supports GHL, HubSpot, Vagaro)
function showCRMUpgradePrompt() {
    console.log('🔒 User clicked CRM-required feature - showing integration prompt');
    if (window.ghlUpgrade && window.ghlUpgrade.show) {
        window.ghlUpgrade.show();
    } else {
        // Fallback if upgrade modal not loaded
        const settingsUrl = currentClientId
            ? `${window.location.origin}/settings?client_id=${currentClientId}`
            : `${window.location.origin}/settings`;
        if (confirm('This feature requires a CRM integration (GoHighLevel, HubSpot, or Vagaro).\n\nWould you like to configure your CRM in Settings?')) {
            window.open(settingsUrl, '_blank');
        }
    }
}

// Check for client_id in URL and auto-load credentials
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client_id');

    if (clientId) {
        currentClientId = clientId;
        console.log('📋 Client ID detected:', clientId);

        // Show loading state immediately to prevent "Not connected" flash
        updateConnectionStatus('Checking connection...', 'loading');

        // Check GHL configuration first (this also checks tokens and enables/disables buttons)
        await checkGHLConfiguration();

        // NO automatic redirect to GHL signup - users can still use Business Collector,
        // Prospect Manager, and Outbound Call without GHL
        // GHL-dependent features (AI Agent, Social Media, Email Marketing) will show
        // upgrade prompt when clicked

        // Load credentials if GHL is configured
        if (ghlConfigured) {
            await autoLoadCredentials(clientId);
        }
    }

    // Check for hash anchor to auto-open features
    const hash = window.location.hash.substring(1); // Remove the # character
    if (hash === 'business-collector') {
        console.log('📋 Auto-opening Business Collector from hash anchor');
        setTimeout(() => openBusinessCollectorForm(), 500);
    } else if (hash === 'outbound-call') {
        console.log('📞 Auto-opening Outbound Call from hash anchor');
        setTimeout(() => openAdHocCall(), 500);
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
    // GHL requirement removed - Prospect Manager works independently
    // Optional GHL integration enhances features but is not required

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
    // GHL requirement removed - Business Collector works independently
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
        // DON'T update status here - checkGHLConfiguration() already set it
        // updateConnectionStatus('Loading...', 'loading');

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

            // If no GHL CRM configured (HubSpot/Vagaro may still work)
            // DON'T update status - checkGHLConfiguration() already handled this
            // updateConnectionStatus('Not configured', 'error');
            // Only show message if no CRM is configured at all
            if (!crmConfigured) {
                addMessage('system', '⚠️ No CRM credentials found. Please configure GoHighLevel, HubSpot, or Vagaro in Settings.');
            }
        } else {
            console.log('❌ Invalid response:', data);
        }
    } catch (error) {
        console.error('❌ Failed to load CRM credentials:', error);
        // DON'T update status - checkGHLConfiguration() already handled this
        // updateConnectionStatus('Connection failed', 'error');
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
            // DON'T update status - checkGHLConfiguration() already set it to avoid Safari blinking
            // updateConnectionStatus('Connected to GoHighLevel', 'success');
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

    // Check CRM requirement for CRM AI Agent chat (GHL, HubSpot, or Vagaro)
    if (!requireGHL('CRM AI Agent')) {
        return;
    }

    if (!sessionId) {
        alert('Please connect to a CRM (GoHighLevel, HubSpot, or Vagaro) first');
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

function updateConnectionStatus(message, status, force = false) {
    // Safari fix: Once status is set to success, lock it to prevent blinking
    if (connectionStatusLocked && !force) {
        console.log('🔒 Status locked, ignoring update:', message);
        return;
    }

    const statusDiv = document.getElementById('connectionStatus');
    const statusDot = document.getElementById('statusDot');

    if (!statusDiv || !statusDot) {
        console.warn('⚠️ Connection status elements not found');
        return;
    }

    console.log(`📊 Updating connection status: ${message} (${status})`);
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
        // Lock status after successful connection to prevent Safari blinking
        connectionStatusLocked = true;
        console.log('🔒 Connection status locked after success');
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
