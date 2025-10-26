let sessionId = null;
let crmType = null;
const API_BASE = window.location.origin + '/api/mcp';
let currentClientId = null;

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
async function connectBusinessCollector() {
    try {
        const btn = document.getElementById('businessCollectorBtn');
        const statusDiv = document.getElementById('businessCollectorStatus');

        // If not connected yet, establish connection first
        if (!sessionId || crmType !== 'business-collector') {
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

                // Silent connection - no chat message

                // Re-enable button
                btn.disabled = false;
            } else {
                throw new Error(data.error || 'Connection failed');
            }
        }

        // Open the Business Collector form modal
        if (typeof openBusinessCollectorForm === 'function') {
            openBusinessCollectorForm();
        } else {
            console.error('Business Collector form not loaded');
            addMessage('error', 'Business Collector form not available. Please refresh the page.');
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
    if (!sessionId) {
        alert('Please connect to a CRM first');
        return;
    }

    // On mobile, show popup with results
    if (isMobile()) {
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
