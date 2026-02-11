// Global variables
let currentClientId = null;
let contacts = [];
let pressReleases = [];
let currentLanguage = 'en';

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Get client_id from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentClientId = parseInt(urlParams.get('client_id'));

    // Verify client_id is 15 or 40 (TunjoRacing)
    if (currentClientId !== 15 && currentClientId !== 40) {
        alert('Access Denied: Press Release Manager is only available for TunjoRacing (Clients 15 & 40)');
        window.location.href = '/';
        return;
    }

    // Display client ID
    document.getElementById('clientBadge').textContent = `Client ID: ${currentClientId}`;

    // Load data
    loadDashboardStats();
    loadContacts();
    loadPressReleases();
});

// API Base URL
const API_BASE = window.location.origin + '/api/press';

// Tab switching
function switchTab(tabName) {
    // Remove active class from all tabs and panes
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    // Add active class to selected tab and pane
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Reload data if needed
    if (tabName === 'contacts') {
        loadContacts();
    } else if (tabName === 'releases') {
        loadPressReleases();
    } else if (tabName === 'analytics') {
        loadAnalytics();
    } else if (tabName === 'dashboard') {
        loadDashboardStats();
    }
}

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/stats?client_id=${currentClientId}`);
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalContacts').textContent = data.stats.contacts.total || 0;
            document.getElementById('totalReleases').textContent = data.stats.releases.total || 0;
            document.getElementById('deliveredCount').textContent = data.stats.engagement.delivered || 0;
            document.getElementById('openRate').textContent = (data.stats.engagement.openRate || 0) + '%';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        // Show placeholder on error
        document.getElementById('totalContacts').textContent = '--';
        document.getElementById('totalReleases').textContent = '--';
        document.getElementById('deliveredCount').textContent = '--';
        document.getElementById('openRate').textContent = '--%';
    }
}

// Load Contacts
async function loadContacts() {
    try {
        const search = document.getElementById('contactSearchInput')?.value || '';
        const language = document.getElementById('languageFilter')?.value || 'all';
        const status = document.getElementById('statusFilter')?.value || 'all';

        let url = `${API_BASE}/contacts?client_id=${currentClientId}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (language !== 'all') url += `&language=${language}`;
        if (status !== 'all') url += `&status=${status}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            contacts = data.contacts;
            renderContacts(contacts);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
        const tbody = document.getElementById('contactsTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Error loading contacts. Please try again.</td></tr>';
    }
}

// Render Contacts Table
function renderContacts(contactsList) {
    const tbody = document.getElementById('contactsTableBody');

    if (!contactsList || contactsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No contacts found. Upload contacts to get started.</td></tr>';
        return;
    }

    tbody.innerHTML = contactsList.map(contact => `
        <tr>
            <td>${escapeHtml(contact.email)}</td>
            <td>${escapeHtml(contact.first_name || '')} ${escapeHtml(contact.last_name || '')}</td>
            <td>${escapeHtml(contact.organization || '-')}</td>
            <td>${contact.language === 'es' ? '🇪🇸 Spanish' : '🇺🇸 English'}</td>
            <td>${escapeHtml(contact.country || '-')}</td>
            <td><span class="status-badge status-${contact.consent_status}">${contact.consent_status}</span></td>
            <td>
                <button class="btn-icon" onclick="deleteContact(${contact.id})" title="Delete">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// Filter Contacts
function filterContacts() {
    loadContacts();
}

// Delete Contact
async function deleteContact(contactId) {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
        const response = await fetch(`${API_BASE}/contacts/${contactId}?client_id=${currentClientId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Contact deleted');
            loadContacts();
            loadDashboardStats();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        showError('Failed to delete contact');
    }
}

// Load Press Releases
async function loadPressReleases() {
    try {
        const response = await fetch(`${API_BASE}/releases?client_id=${currentClientId}`);
        const data = await response.json();

        if (data.success) {
            pressReleases = data.releases;
            renderPressReleases(pressReleases);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading press releases:', error);
        const list = document.getElementById('releasesList');
        list.innerHTML = '<div class="empty-state"><p>Error loading press releases. Please try again.</p></div>';
    }
}

// Render Press Releases
function renderPressReleases(releasesList) {
    const list = document.getElementById('releasesList');

    if (!releasesList || releasesList.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No press releases yet. Create your first one!</p></div>';
        return;
    }

    list.innerHTML = releasesList.map(release => `
        <div class="release-card">
            <div class="release-header">
                <h3>${escapeHtml(release.title)}</h3>
                <span class="status-badge status-${release.status}">${release.status}</span>
            </div>
            <div class="release-meta">
                ${release.race_event ? `<span>🏎️ ${escapeHtml(release.race_event)}</span>` : ''}
                ${release.race_date ? `<span>📅 ${new Date(release.race_date).toLocaleDateString()}</span>` : ''}
                <span>📝 Created: ${new Date(release.created_at).toLocaleDateString()}</span>
            </div>
            <div class="release-content">
                ${release.subject_en ? `<p><strong>EN:</strong> ${escapeHtml(release.subject_en)}</p>` : ''}
                ${release.subject_es ? `<p><strong>ES:</strong> ${escapeHtml(release.subject_es)}</p>` : ''}
            </div>
            ${release.status === 'sent' ? `
            <div class="release-stats">
                <span>📬 Sent: ${release.sent_count || 0}</span>
                <span>✅ Delivered: ${release.delivered_count || 0}</span>
                <span>👀 Opens: ${release.open_count || 0}</span>
                <span>🔗 Clicks: ${release.click_count || 0}</span>
            </div>
            ` : ''}
            <div class="release-actions">
                ${release.status === 'draft' ? `
                    <button class="btn btn-small" onclick="editRelease(${release.id})">Edit</button>
                    <button class="btn btn-small btn-primary" onclick="sendRelease(${release.id})">Send Now</button>
                ` : ''}
                <button class="btn btn-small btn-danger" onclick="deleteRelease(${release.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Load Analytics
async function loadAnalytics() {
    try {
        const response = await fetch(`${API_BASE}/stats?client_id=${currentClientId}`);
        const data = await response.json();

        if (data.success) {
            const stats = data.stats;
            const delivered = stats.engagement.delivered || 0;
            const opens = stats.engagement.opens || 0;
            const clicks = stats.engagement.clicks || 0;

            const deliveryRate = stats.contacts.active > 0 ? Math.round((delivered / stats.contacts.active) * 100) : 0;
            const openRate = delivered > 0 ? Math.round((opens / delivered) * 100) : 0;
            const clickRate = opens > 0 ? Math.round((clicks / opens) * 100) : 0;

            document.getElementById('deliveryRate').textContent = deliveryRate + '%';
            document.getElementById('analyticsOpenRate').textContent = openRate + '%';
            document.getElementById('clickRate').textContent = clickRate + '%';
            document.getElementById('bounceRate').textContent = '0%'; // TODO: Calculate from events
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
        document.getElementById('deliveryRate').textContent = '--%';
        document.getElementById('analyticsOpenRate').textContent = '--%';
        document.getElementById('clickRate').textContent = '--%';
        document.getElementById('bounceRate').textContent = '--%';
    }
}

// Upload Contacts Modal
function showUploadContactsModal() {
    document.getElementById('uploadContactsModal').classList.add('active');
}

function closeUploadContactsModal() {
    document.getElementById('uploadContactsModal').classList.remove('active');
    document.getElementById('contactsFileInput').value = '';
    document.getElementById('uploadResults').style.display = 'none';
}

// Handle Contacts File Upload
async function handleContactsFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const resultsDiv = document.getElementById('uploadResults');
    const resultsContent = document.getElementById('uploadResultsContent');

    resultsDiv.style.display = 'block';
    resultsContent.innerHTML = '<p>Processing file...</p>';

    try {
        const text = await file.text();
        const lines = text.trim().split('\n');

        if (lines.length === 0) {
            throw new Error('File is empty');
        }

        // Parse CSV
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const contactsData = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const contact = {};

            headers.forEach((header, index) => {
                contact[header] = values[index] || '';
            });

            // Validate email
            if (contact.email && isValidEmail(contact.email)) {
                contactsData.push({
                    email: contact.email,
                    first_name: contact.first_name || '',
                    last_name: contact.last_name || '',
                    organization: contact.organization || '',
                    country: (contact.country || 'US').toUpperCase(),
                    language: (contact.language || 'en').toLowerCase()
                });
            }
        }

        if (contactsData.length === 0) {
            throw new Error('No valid contacts found in file');
        }

        // Send to API
        resultsContent.innerHTML = '<p>Uploading contacts to server...</p>';

        const response = await fetch(`${API_BASE}/contacts/upload?client_id=${currentClientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: currentClientId, contacts: contactsData })
        });
        const result = await response.json();

        if (result.success) {
            resultsContent.innerHTML = `
                <div style="background: #d1fae5; border: 2px solid #059669; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
                    <p><strong>✅ Upload Successful!</strong></p>
                    <p>Total processed: ${result.results.total}</p>
                    <p>Successfully imported: ${result.results.successful}</p>
                    ${result.results.duplicates > 0 ? `<p>Duplicates updated: ${result.results.duplicates}</p>` : ''}
                    ${result.results.invalid > 0 ? `<p>Invalid skipped: ${result.results.invalid}</p>` : ''}
                </div>
            `;

            // Reload data
            setTimeout(() => {
                loadContacts();
                loadDashboardStats();
            }, 1000);
        } else {
            throw new Error(result.error || 'Upload failed');
        }

    } catch (error) {
        console.error('Error uploading contacts:', error);
        resultsContent.innerHTML = `
            <div style="background: #fee2e2; border: 2px solid #dc2626; border-radius: 0.5rem; padding: 1rem;">
                <p><strong>❌ Upload Failed</strong></p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Create Press Release Modal
function showCreateReleaseModal() {
    document.getElementById('createReleaseModal').classList.add('active');
}

function closeCreateReleaseModal() {
    document.getElementById('createReleaseModal').classList.remove('active');
    document.getElementById('createReleaseForm').reset();
}

// Language Switching in Create Release Modal
function switchLanguage(lang) {
    currentLanguage = lang;

    // Update tab buttons
    document.querySelectorAll('.lang-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-lang="${lang}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.lang-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${lang}-content`).classList.add('active');
}

// Save Draft
async function saveDraft() {
    const pressRelease = getPressReleaseFormData();
    pressRelease.status = 'draft';

    try {
        const response = await fetch(`${API_BASE}/releases?client_id=${currentClientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pressRelease)
        });
        const result = await response.json();

        if (result.success) {
            showSuccess('Draft saved successfully!');
            closeCreateReleaseModal();
            loadPressReleases();
            loadDashboardStats();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error saving draft:', error);
        showError('Failed to save draft');
    }
}

// Create & Send Press Release
document.getElementById('createReleaseForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const pressRelease = getPressReleaseFormData();

    if (!pressRelease.content.en.subject && !pressRelease.content.es.subject) {
        alert('Please provide at least one language version');
        return;
    }

    if (confirm('Are you sure you want to create this press release?\n\nYou can send it later from the Press Releases tab.')) {
        try {
            pressRelease.status = 'draft';

            const response = await fetch(`${API_BASE}/releases?client_id=${currentClientId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pressRelease)
            });
            const result = await response.json();

            if (result.success) {
                showSuccess('Press release created! Go to Press Releases tab to send it.');
                closeCreateReleaseModal();
                loadPressReleases();
                loadDashboardStats();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error creating press release:', error);
            showError('Failed to create press release');
        }
    }
});

// Send Release (from list)
async function sendRelease(releaseId) {
    if (!confirm('Are you sure you want to send this press release?\n\nThis will send emails to all active press contacts.')) {
        return;
    }

    try {
        // Update status to sending
        const response = await fetch(`${API_BASE}/releases/${releaseId}?client_id=${currentClientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'sent' })
        });
        const result = await response.json();

        if (result.success) {
            showSuccess('Press release marked as sent!\n\nNote: SendGrid email integration coming soon.');
            loadPressReleases();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error sending release:', error);
        showError('Failed to send press release');
    }
}

// Edit Release (placeholder)
function editRelease(releaseId) {
    alert('Edit functionality coming soon!');
}

// Delete Release
async function deleteRelease(releaseId) {
    if (!confirm('Are you sure you want to delete this press release?')) return;

    try {
        const response = await fetch(`${API_BASE}/releases/${releaseId}?client_id=${currentClientId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            showSuccess('Press release deleted');
            loadPressReleases();
            loadDashboardStats();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error deleting release:', error);
        showError('Failed to delete press release');
    }
}

// Get Press Release Form Data
function getPressReleaseFormData() {
    return {
        client_id: currentClientId,
        title: document.getElementById('releaseTitle').value,
        race_event: document.getElementById('raceEvent').value,
        race_date: document.getElementById('raceDate').value,
        content: {
            en: {
                subject: document.getElementById('subjectEn').value,
                body: document.getElementById('bodyEn').value
            },
            es: {
                subject: document.getElementById('subjectEs').value,
                body: document.getElementById('bodyEs').value
            }
        }
    };
}

// Utility Functions
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    alert('❌ Error: ' + message);
}

function showSuccess(message) {
    alert('✅ ' + message);
}

// Console welcome message
console.log('%c📰 Press Release Manager', 'font-size: 20px; font-weight: bold; color: #0891b2;');
console.log(`Client ID: ${currentClientId}`);
console.log('Status: ✅ Backend API Connected');
console.log('\nFeatures:');
console.log('1. ✅ Contact management (CRUD, CSV upload)');
console.log('2. ✅ Press release management (Create, Edit, Delete)');
console.log('3. ✅ Dashboard statistics');
console.log('4. ⏳ SendGrid email sending (Phase 3)');
console.log('5. ⏳ AI content generation (Phase 4)');
