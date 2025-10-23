let sessionId = null;
let crmType = null;
const API_BASE = window.location.origin + '/api/mcp';
let currentClientId = null;

// Check for client_id in URL and auto-load credentials
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client_id');

    if (clientId) {
        currentClientId = clientId;
        console.log('📋 Client ID detected:', clientId);
        await autoLoadCredentials(clientId);
    }
});

// Open Social Media Marketing Tool
function openSocialMedia() {
    if (!currentClientId) {
        alert('Client ID not found. Please open MCP Copilot from the dashboard.');
        return;
    }

    if (!sessionId) {
        alert('Please connect to GoHighLevel first.');
        return;
    }

    // Pass sessionId and clientId to social media page
    const socialUrl = `${window.location.origin}/mcp-copilot/social-media.html?client_id=${currentClientId}&session_id=${sessionId}`;
    window.open(socialUrl, '_blank');
}

// Open Email Marketing Tool
function openEmailMarketing() {
    if (!currentClientId) {
        alert('Client ID not found. Please open MCP Copilot from the dashboard.');
        return;
    }

    // Email marketing doesn't require GHL session
    const emailUrl = `${window.location.origin}/mcp-copilot/email-marketing.html?client_id=${currentClientId}`;
    window.open(emailUrl, '_blank');
}

// Connect to Business Collector
async function connectBusinessCollector() {
    try {
        const btn = document.getElementById('businessCollectorBtn');
        const statusDiv = document.getElementById('businessCollectorStatus');

        // Update button state
        btn.disabled = true;
        btn.innerHTML = '🔄 Connecting...';
        statusDiv.style.display = 'block';
        statusDiv.textContent = 'Connecting to Business Collector...';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';

        const response = await fetch(`${API_BASE}/business-collector/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            sessionId = data.sessionId;
            crmType = 'business-collector';

            // Update UI
            btn.innerHTML = '✅ Connected';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            statusDiv.textContent = `Connected (v${data.version})`;
            statusDiv.style.background = '#d1fae5';
            statusDiv.style.color = '#065f46';

            // Update header
            const headerStatus = document.getElementById('crmStatus');
            if (headerStatus) {
                headerStatus.textContent = 'Business Collector Connected';
                headerStatus.style.background = '#10b981';
            }

            // Add system message
            addMessage('system', '✅ Connected to Business Collector! Try: "Collect Real Estate Agents in Florida"');
            addMessage('system', '💡 Example commands:\n• "Collect [Category] in [Location]"\n• "Find Dentists in Miami"\n• "Get Plumbers in Tampa, FL"');

            // Re-enable button with disconnect option
            setTimeout(() => {
                btn.disabled = false;
                btn.onclick = disconnectBusinessCollector;
            }, 1000);
        } else {
            throw new Error(data.error || 'Connection failed');
        }
    } catch (error) {
        console.error('Connection error:', error);

        const btn = document.getElementById('businessCollectorBtn');
        const statusDiv = document.getElementById('businessCollectorStatus');

        btn.disabled = false;
        btn.innerHTML = '❌ Connection Failed';
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';

        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#991b1b';

        addMessage('system', `❌ Failed to connect: ${error.message}`);

        // Reset after 3 seconds
        setTimeout(() => {
            btn.innerHTML = '🔍 Business Collector';
            btn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
        }, 3000);
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

                console.log('💾 Stored credentials:', window.ghlCredentials);

                // Auto-connect
                addMessage('system', '🔄 Auto-connecting to GoHighLevel...');
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

    if (!apiKey || !locationId) {
        updateConnectionStatus('Not configured', 'error');
        addMessage('error', '❌ GoHighLevel credentials not configured. Please go to Settings in the dashboard.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/gohighlevel/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, locationId })
        });

        const data = await response.json();
        if (data.success) {
            sessionId = data.sessionId;
            crmType = 'gohighlevel';
            updateConnectionStatus('Connected to GoHighLevel', 'success');
            addMessage('system', '✅ Successfully connected to GoHighLevel!');
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
    if (!sessionId) {
        alert('Please connect to a CRM first');
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

function updateConnectionStatus(message, status) {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.textContent = message;

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
