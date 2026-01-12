// Prospect Manager JavaScript - Control scheduler and view prospects
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://ringlypro-crm.onrender.com';

let currentPage = 1;
let pageSize = 50;
let allProspects = [];
let filteredProspects = [];
let statusCheckInterval = null;
let currentClientId = null;

// Get client ID from URL parameters
function getClientIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('client_id');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('📊 Prospect Manager initialized');

    // Get and set client ID from URL or use default
    currentClientId = getClientIdFromURL() || '15'; // Default to 15 if not provided
    document.getElementById('clientIdFilter').value = currentClientId;

    console.log(`👤 Client ID: ${currentClientId}`);

    loadSchedulerStatus();
    loadProspects();

    // Auto-refresh status every 5 seconds when scheduler is running
    startStatusPolling();
});

/**
 * Start polling scheduler status
 */
function startStatusPolling() {
    // Clear any existing interval
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }

    // Poll every 5 seconds
    statusCheckInterval = setInterval(() => {
        loadSchedulerStatus();
    }, 5000);
}

/**
 * Load current scheduler status
 */
async function loadSchedulerStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/status`);
        const data = await response.json();

        if (data.success) {
            updateSchedulerUI(data);
        }
    } catch (error) {
        console.error('Error loading scheduler status:', error);
    }
}

/**
 * Update UI with scheduler status
 */
function updateSchedulerUI(status) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusInfo = document.getElementById('statusInfo');
    const statusCard = document.getElementById('statusCard');

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const stopBtn = document.getElementById('stopBtn');

    // Update status indicator
    if (status.isRunning && !status.isPaused) {
        statusDot.className = 'status-dot status-running';
        statusText.textContent = 'Running';
        statusCard.className = 'status-card status-running';
        statusInfo.innerHTML = `
            <p>✅ Scheduler is active and calling prospects</p>
            <p class="status-detail">Within business hours: ${status.isBusinessHours ? '✅ Yes' : '❌ No'}</p>
        `;

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        stopBtn.disabled = false;
    } else if (status.isRunning && status.isPaused) {
        statusDot.className = 'status-dot status-paused';
        statusText.textContent = 'Paused';
        statusCard.className = 'status-card status-paused';
        statusInfo.innerHTML = `<p>⏸️ Scheduler is paused - click Resume to continue</p>`;

        startBtn.disabled = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
        stopBtn.disabled = false;
    } else {
        statusDot.className = 'status-dot status-stopped';
        statusText.textContent = 'Stopped';
        statusCard.className = 'status-card status-stopped';
        statusInfo.innerHTML = `<p>⏹️ Scheduler is not running</p>`;

        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
    }

    // Update stats
    if (status.stats) {
        document.getElementById('totalProspects').textContent = status.stats.totalProspects || 0;
        document.getElementById('calledToday').textContent = status.stats.calledToday || 0;
        document.getElementById('remainingToday').textContent = status.stats.remainingToday || 0;
        document.getElementById('nextCallTime').textContent = status.nextCallTime || '-';

        // Update progress bar
        if (status.isRunning && status.stats.totalProspects > 0) {
            const progress = (status.stats.calledToday / status.stats.totalProspects) * 100;
            document.getElementById('progressFill').style.width = `${progress}%`;
            document.getElementById('progressCount').textContent =
                `${status.stats.calledToday} / ${status.stats.totalProspects} called`;
            document.getElementById('progressSection').style.display = 'block';
        } else {
            document.getElementById('progressSection').style.display = 'none';
        }
    }
}

/**
 * Start the scheduler
 */
async function startScheduler() {
    const location = document.getElementById('locationFilter').value;
    const category = document.getElementById('categoryFilter').value;

    // Always use the current client ID from session
    const payload = {
        clientId: parseInt(currentClientId)
    };
    if (location) payload.location = location;
    if (category) payload.category = category;

    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            showNotification('✅ Scheduler started successfully!', 'success');
            loadSchedulerStatus();
            loadProspects();
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error starting scheduler:', error);
        showNotification('❌ Failed to start scheduler', 'error');
    }
}

/**
 * Pause the scheduler
 */
async function pauseScheduler() {
    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/pause`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('⏸️ Scheduler paused', 'success');
            loadSchedulerStatus();
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error pausing scheduler:', error);
        showNotification('❌ Failed to pause scheduler', 'error');
    }
}

/**
 * Resume the scheduler
 */
async function resumeScheduler() {
    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/resume`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('▶️ Scheduler resumed', 'success');
            loadSchedulerStatus();
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error resuming scheduler:', error);
        showNotification('❌ Failed to resume scheduler', 'error');
    }
}

/**
 * Stop the scheduler
 */
async function stopScheduler() {
    if (!confirm('Are you sure you want to stop the scheduler? This will reset all progress.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/stop`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('⏹️ Scheduler stopped', 'success');
            loadSchedulerStatus();
            loadProspects();
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        showNotification('❌ Failed to stop scheduler', 'error');
    }
}

/**
 * Load prospects from database
 */
async function loadProspects() {
    const statusFilter = document.getElementById('statusFilterList').value;

    try {
        showNotification('📊 Loading prospects...', 'info');

        // Build query params - ALWAYS include client ID for multi-tenant security
        const params = new URLSearchParams();
        params.append('clientId', currentClientId); // REQUIRED - enforces data isolation
        if (statusFilter) params.append('status', statusFilter);
        params.append('limit', '100');
        params.append('offset', '0');

        const response = await fetch(`${API_BASE}/api/scheduled-caller/prospects?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            allProspects = data.prospects;
            filteredProspects = allProspects;
            currentPage = 1;
            renderProspects();
            showNotification(`✅ Loaded ${data.total} prospects`, 'success');
        } else {
            showNotification(`❌ Error: ${data.error}`, 'error');
        }

    } catch (error) {
        console.error('Error loading prospects:', error);
        showNotification('❌ Failed to load prospects', 'error');
    }
}

/**
 * Filter prospects by search term
 */
function filterProspects() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    if (!searchTerm) {
        filteredProspects = allProspects;
    } else {
        filteredProspects = allProspects.filter(p =>
            p.business_name.toLowerCase().includes(searchTerm) ||
            p.phone_number.includes(searchTerm)
        );
    }

    renderProspects();
}

/**
 * Render prospects table
 */
function renderProspects() {
    const tbody = document.getElementById('prospectTableBody');
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageProspects = filteredProspects.slice(start, end);

    if (pageProspects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: #9ca3af;">
                    No prospects found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pageProspects.map(p => `
        <tr>
            <td>${p.business_name || '-'}</td>
            <td>${formatPhone(p.phone_number)}</td>
            <td>${p.location || '-'}</td>
            <td>${p.category || '-'}</td>
            <td><span class="badge badge-${p.call_status}">${p.call_status}</span></td>
            <td>${p.call_attempts || 0}</td>
            <td>${p.last_called_at ? formatDate(p.last_called_at) : '-'}</td>
            <td>${p.call_result || '-'}</td>
        </tr>
    `).join('');

    updatePagination();
}

/**
 * Update pagination controls
 */
function updatePagination() {
    const totalPages = Math.ceil(filteredProspects.length / pageSize);

    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages || totalPages === 0;
}

/**
 * Navigate to previous page
 */
function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderProspects();
    }
}

/**
 * Navigate to next page
 */
function nextPage() {
    const totalPages = Math.ceil(filteredProspects.length / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        renderProspects();
    }
}

/**
 * Format phone number for display
 */
function formatPhone(phone) {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phone;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        font-weight: 500;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// CSV Upload Functions
// ============================================

let pendingUploadData = [];

/**
 * Handle CSV file selection
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('selectedFileName').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvText = e.target.result;
        parseCSV(csvText);
    };
    reader.readAsText(file);
}

/**
 * Parse CSV text into prospect data
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
        showNotification('❌ CSV file must have a header row and at least one data row', 'error');
        return;
    }

    // Parse header to find column indices
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    const colMap = {
        business_name: findColumnIndex(header, ['business_name', 'businessname', 'name', 'company', 'business']),
        phone_number: findColumnIndex(header, ['phone_number', 'phonenumber', 'phone', 'tel', 'telephone', 'mobile']),
        email: findColumnIndex(header, ['email', 'e-mail', 'emailaddress']),
        location: findColumnIndex(header, ['location', 'city', 'address', 'area']),
        category: findColumnIndex(header, ['category', 'type', 'industry', 'service'])
    };

    if (colMap.phone_number === -1) {
        showNotification('❌ CSV must have a phone_number column', 'error');
        return;
    }

    // Parse data rows
    pendingUploadData = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        const phone = normalizePhone(values[colMap.phone_number] || '');
        const prospect = {
            business_name: colMap.business_name >= 0 ? values[colMap.business_name]?.trim() : '',
            phone_number: phone,
            email: colMap.email >= 0 ? values[colMap.email]?.trim() : '',
            location: colMap.location >= 0 ? values[colMap.location]?.trim() : '',
            category: colMap.category >= 0 ? values[colMap.category]?.trim() : '',
            valid: isValidPhone(phone)
        };

        if (phone) {
            pendingUploadData.push(prospect);
        }
    }

    // Show preview
    showUploadPreview();
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Find column index by possible names
 */
function findColumnIndex(header, possibleNames) {
    for (const name of possibleNames) {
        const idx = header.indexOf(name);
        if (idx >= 0) return idx;
    }
    return -1;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone) {
    if (!phone) return '';

    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If starts with +, keep it
    if (cleaned.startsWith('+')) {
        return cleaned;
    }

    // Remove leading 1 if 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.substring(1);
    }

    // Add +1 prefix for US numbers
    if (cleaned.length === 10) {
        return '+1' + cleaned;
    }

    // Return with + prefix if looks like international
    if (cleaned.length > 10) {
        return '+' + cleaned;
    }

    return cleaned;
}

/**
 * Validate phone number
 */
function isValidPhone(phone) {
    if (!phone) return false;

    // Must start with + and have at least 10 digits
    if (!phone.startsWith('+')) return false;

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return false;

    // Check for invalid patterns
    const invalidPatterns = ['555', '000', '111', '911'];
    const areaCode = digits.substring(1, 4);
    if (invalidPatterns.includes(areaCode)) return false;

    return true;
}

/**
 * Show upload preview
 */
function showUploadPreview() {
    const validCount = pendingUploadData.filter(p => p.valid).length;
    const invalidCount = pendingUploadData.length - validCount;

    document.getElementById('previewCount').textContent =
        `${validCount} valid prospects ready to upload` +
        (invalidCount > 0 ? ` (${invalidCount} invalid)` : '');

    const tbody = document.getElementById('previewTableBody');
    tbody.innerHTML = pendingUploadData.slice(0, 20).map(p => `
        <tr class="${p.valid ? '' : 'invalid-row'}">
            <td>${p.business_name || '-'}</td>
            <td>${p.phone_number || '-'}</td>
            <td>${p.email || '-'}</td>
            <td>${p.location || '-'}</td>
            <td>${p.category || '-'}</td>
            <td>${p.valid ? '✅' : '❌'}</td>
        </tr>
    `).join('');

    if (pendingUploadData.length > 20) {
        tbody.innerHTML += `
            <tr>
                <td colspan="6" style="text-align: center; color: #6b7280;">
                    ... and ${pendingUploadData.length - 20} more rows
                </td>
            </tr>
        `;
    }

    document.getElementById('uploadPreview').style.display = 'block';
    document.getElementById('uploadBtn').disabled = validCount === 0;
}

/**
 * Cancel upload
 */
function cancelUpload() {
    pendingUploadData = [];
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('csvFileInput').value = '';
    document.getElementById('selectedFileName').textContent = '';
}

/**
 * Upload prospects to server
 */
async function uploadProspects() {
    const validProspects = pendingUploadData.filter(p => p.valid);

    if (validProspects.length === 0) {
        showNotification('❌ No valid prospects to upload', 'error');
        return;
    }

    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadBtn').disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/scheduled-caller/upload-prospects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: parseInt(currentClientId),
                prospects: validProspects.map(p => ({
                    business_name: p.business_name,
                    phone_number: p.phone_number,
                    email: p.email,
                    location: p.location,
                    category: p.category
                }))
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`✅ Uploaded ${data.inserted} prospects successfully!`, 'success');
            cancelUpload();
            loadProspects();
        } else {
            showNotification(`❌ Upload failed: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error uploading prospects:', error);
        showNotification('❌ Failed to upload prospects', 'error');
    } finally {
        document.getElementById('uploadProgress').style.display = 'none';
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }

    .invalid-row {
        background-color: #fef2f2;
        color: #dc2626;
    }
`;
document.head.appendChild(style);
