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
        const response = await fetch(`${window.location.origin}/api/client/crm-credentials/${clientId}`);
        const data = await response.json();

        if (data.success && data.credentials) {
            console.log('✅ CRM credentials loaded');

            // Auto-load GoHighLevel if configured
            if (data.credentials.gohighlevel && data.credentials.gohighlevel.configured) {
                document.getElementById('crmType').value = 'gohighlevel';
                document.getElementById('ghlAuth').style.display = 'block';
                document.getElementById('ghlApiKey').value = data.credentials.gohighlevel.api_key;
                document.getElementById('ghlLocationId').value = data.credentials.gohighlevel.location_id;

                // Auto-connect
                addMessage('system', '🔄 Auto-connecting to GoHighLevel...');
                await connectGoHighLevel();
                return;
            }

            // Auto-load HubSpot if configured
            if (data.credentials.hubspot && data.credentials.hubspot.configured) {
                document.getElementById('crmType').value = 'hubspot';
                document.getElementById('hubspotAuth').style.display = 'block';
                document.getElementById('hubspotToken').value = data.credentials.hubspot.api_key;

                // Auto-connect
                addMessage('system', '🔄 Auto-connecting to HubSpot...');
                await connectHubSpot();
                return;
            }

            // If no CRM configured
            addMessage('system', '⚠️ No CRM credentials found. Please configure in Settings.');
        }
    } catch (error) {
        console.error('❌ Failed to load CRM credentials:', error);
        addMessage('system', '⚠️ Could not load saved credentials. Please enter manually.');
    }
}

document.getElementById('crmType').addEventListener('change', (e) => {
    document.getElementById('hubspotAuth').style.display = 'none';
    document.getElementById('ghlAuth').style.display = 'none';

    if (e.target.value === 'hubspot') {
        document.getElementById('hubspotAuth').style.display = 'block';
    } else if (e.target.value === 'gohighlevel') {
        document.getElementById('ghlAuth').style.display = 'block';
    }
});

async function connectHubSpot() {
    const token = document.getElementById('hubspotToken').value;
    if (!token) {
        alert('Please enter your HubSpot access token');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/hubspot/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token })
        });

        const data = await response.json();
        if (data.success) {
            sessionId = data.sessionId;
            crmType = 'hubspot';
            updateConnectionStatus('Connected to HubSpot', 'success');
            addMessage('system', '✅ Successfully connected to HubSpot!');
        } else {
            alert('Failed to connect: ' + data.error);
        }
    } catch (error) {
        alert('Connection error: ' + error.message);
    }
}

async function connectGoHighLevel() {
    const apiKey = document.getElementById('ghlApiKey').value;
    const locationId = document.getElementById('ghlLocationId').value;

    if (!apiKey || !locationId) {
        alert('Please enter both API Key and Location ID');
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
    statusDiv.className = `status ${status}`;

    document.getElementById('crmStatus').textContent = message;
}
