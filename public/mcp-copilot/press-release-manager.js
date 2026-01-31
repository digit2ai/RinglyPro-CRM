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

    // Verify client_id is 15 or 43
    if (currentClientId !== 15 && currentClientId !== 43) {
        alert('Access Denied: Press Release Manager is only available for TunjoRacing (Clients 15 & 43)');
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
    }
}

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        // In production, these would be API calls
        // For now, showing placeholder data
        document.getElementById('totalContacts').textContent = '--';
        document.getElementById('totalReleases').textContent = '--';
        document.getElementById('deliveredCount').textContent = '--';
        document.getElementById('openRate').textContent = '--%';

        // TODO: Implement actual API calls when backend is ready
        // const stats = await fetch(`${API_BASE}/stats?client_id=${currentClientId}`);
        // const data = await stats.json();
        // Update UI with real data
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Contacts
async function loadContacts() {
    try {
        // TODO: Implement API call when backend is ready
        // const response = await fetch(`${API_BASE}/contacts?client_id=${currentClientId}`);
        // contacts = await response.json();

        // For now, show empty state
        const tbody = document.getElementById('contactsTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No contacts found. Upload contacts to get started.</td></tr>';

    } catch (error) {
        console.error('Error loading contacts:', error);
        showError('Failed to load contacts');
    }
}

// Filter Contacts
function filterContacts() {
    const search = document.getElementById('contactSearchInput').value.toLowerCase();
    const language = document.getElementById('languageFilter').value;
    const status = document.getElementById('statusFilter').value;

    // TODO: Implement filtering when contacts are loaded
    console.log('Filtering:', { search, language, status });
}

// Load Press Releases
async function loadPressReleases() {
    try {
        // TODO: Implement API call when backend is ready
        // const response = await fetch(`${API_BASE}/releases?client_id=${currentClientId}`);
        // pressReleases = await response.json();

        // For now, show empty state
        const list = document.getElementById('releasesList');
        list.innerHTML = '<div class="empty-state"><p>No press releases yet. Create your first one!</p></div>';

    } catch (error) {
        console.error('Error loading press releases:', error);
        showError('Failed to load press releases');
    }
}

// Load Analytics
async function loadAnalytics() {
    try {
        // TODO: Implement API call when backend is ready
        document.getElementById('deliveryRate').textContent = '--%';
        document.getElementById('analyticsOpenRate').textContent = '--%';
        document.getElementById('clickRate').textContent = '--%';
        document.getElementById('bounceRate').textContent = '--%';
    } catch (error) {
        console.error('Error loading analytics:', error);
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
                    client_id: currentClientId,
                    email: contact.email,
                    first_name: contact.first_name || '',
                    last_name: contact.last_name || '',
                    organization: contact.organization || '',
                    country: (contact.country || '').toUpperCase(),
                    language: (contact.language || 'en').toLowerCase()
                });
            }
        }

        // TODO: Send to API when backend is ready
        // const response = await fetch(`${API_BASE}/contacts/upload`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ client_id: currentClientId, contacts: contactsData })
        // });
        // const result = await response.json();

        // Show results
        resultsContent.innerHTML = `
            <div style="background: #d1fae5; border: 2px solid #059669; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
                <p><strong>✅ Upload Successful</strong></p>
                <p>Total contacts: ${contactsData.length}</p>
                <p><em>Note: API integration pending. Contacts will be saved once backend is deployed.</em></p>
            </div>
        `;

        // Reload contacts
        setTimeout(() => {
            loadContacts();
        }, 2000);

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

    try {
        // TODO: Implement API call when backend is ready
        // const response = await fetch(`${API_BASE}/releases`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(pressRelease)
        // });

        alert('✅ Draft saved successfully!\n\nNote: API integration pending. Press releases will be saved once backend is deployed.');
        closeCreateReleaseModal();
        loadPressReleases();
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

    if (confirm('Are you sure you want to send this press release?\n\nThis will send emails to all active press contacts.')) {
        try {
            // TODO: Implement API call when backend is ready
            // const response = await fetch(`${API_BASE}/releases/send`, {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(pressRelease)
            // });

            alert('✅ Press release created!\n\nNote: API integration pending. Once backend is deployed, emails will be sent automatically.');
            closeCreateReleaseModal();
            loadPressReleases();
        } catch (error) {
            console.error('Error sending press release:', error);
            showError('Failed to send press release');
        }
    }
});

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

function showError(message) {
    alert('❌ Error: ' + message);
}

function showSuccess(message) {
    alert('✅ ' + message);
}

// Console welcome message
console.log('%c📰 Press Release Manager', 'font-size: 20px; font-weight: bold; color: #0891b2;');
console.log(`Client ID: ${currentClientId}`);
console.log('Status: Frontend ready, API integration pending');
console.log('\nNext steps:');
console.log('1. ✅ Database migrations deployed');
console.log('2. ⏳ Backend API endpoints (Phase 2)');
console.log('3. ⏳ SendGrid integration (Phase 3)');
console.log('4. ⏳ AI content generation (Phase 4)');
