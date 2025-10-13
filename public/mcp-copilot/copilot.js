let sessionId = null;
let crmType = null;
const API_BASE = window.location.origin + '/api/mcp';

// Check for client_id in URL and auto-load credentials
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client_id');

    if (clientId) {
        console.log('📋 Client ID detected:', clientId);
        await autoLoadCredentials(clientId);
    }
});

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

    let content = `<p>${text}</p>`;

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
