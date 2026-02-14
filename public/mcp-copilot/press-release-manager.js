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

// Portal state
let portalPosts = [];
let driverQuotes = [];
let editingPostId = null;

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
    } else if (tabName === 'portal') {
        loadPortalPosts();
        loadPortalStats();
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
                <button class="btn btn-small btn-portal" onclick="pushToPortal(${release.id})">Push to Portal</button>
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

// =====================================================
// MEDIA PORTAL FUNCTIONS
// =====================================================

// Load Portal Posts
async function loadPortalPosts() {
    try {
        const response = await fetch(`${API_BASE}/portal/posts?client_id=${currentClientId}`);
        const data = await response.json();
        if (data.success) {
            portalPosts = data.posts;
            renderPortalPosts(portalPosts);
        }
    } catch (error) {
        console.error('Error loading portal posts:', error);
        document.getElementById('portalPostsList').innerHTML =
            '<div class="empty-state"><p>Error loading media posts. Please try again.</p></div>';
    }
}

// Load Portal Stats
async function loadPortalStats() {
    try {
        const response = await fetch(`${API_BASE}/portal/stats?client_id=${currentClientId}`);
        const data = await response.json();
        if (data.success) {
            document.getElementById('portalPublished').textContent = data.stats.published_posts || 0;
            document.getElementById('portalDrafts').textContent = data.stats.draft_posts || 0;
            document.getElementById('portalAssets').textContent = data.stats.total_assets || 0;
            document.getElementById('portalViews').textContent = data.stats.total_views || 0;
            document.getElementById('portalDownloads').textContent = data.stats.total_downloads || 0;
        }
    } catch (error) {
        console.error('Error loading portal stats:', error);
    }
}

// Render Portal Posts
function renderPortalPosts(posts) {
    const list = document.getElementById('portalPostsList');

    if (!posts || posts.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No media posts yet. Create your first one to share with press users.</p></div>';
        return;
    }

    list.innerHTML = posts.map(post => `
        <div class="release-card portal-card ${post.status === 'published' ? 'portal-published' : ''}">
            <div class="release-header">
                <h3>${escapeHtml(post.title)}</h3>
                <span class="status-badge status-portal-${post.status}">${post.status}</span>
            </div>
            <div class="release-meta">
                ${post.race_location ? `<span>📍 ${escapeHtml(post.race_location)}</span>` : ''}
                ${post.race_date ? `<span>📅 ${new Date(post.race_date).toLocaleDateString()}</span>` : ''}
                ${post.season ? `<span>🏆 ${escapeHtml(post.season)}</span>` : ''}
                ${post.series ? `<span>🏎️ ${escapeHtml(post.series)}</span>` : ''}
                <span>📎 ${post.asset_count || 0} assets</span>
                <span>👁️ ${post.total_views || 0} views</span>
                <span>⬇️ ${post.total_downloads || 0} downloads</span>
            </div>
            ${post.summary ? `<div class="release-content"><p>${escapeHtml(post.summary)}</p></div>` : ''}
            ${post.cover_image_url ? `<div class="portal-cover-preview"><img src="${escapeHtml(post.cover_image_url)}" alt="Cover" onerror="this.style.display='none'"></div>` : ''}
            <div class="release-actions">
                <button class="btn btn-small btn-primary" onclick="editPortalPost(${post.id})">Edit</button>
                ${post.status === 'draft'
                    ? `<button class="btn btn-small btn-success" onclick="togglePublish(${post.id}, 'published')">Publish</button>`
                    : `<button class="btn btn-small btn-secondary" onclick="togglePublish(${post.id}, 'draft')">Unpublish</button>`
                }
                <button class="btn btn-small btn-danger" onclick="deletePortalPost(${post.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Show Portal Post Modal (create mode)
function showPortalPostModal() {
    editingPostId = null;
    document.getElementById('portalModalTitle').textContent = 'Create Media Post';
    document.getElementById('portalPostId').value = '';
    document.getElementById('portalTitle').value = '';
    document.getElementById('portalRaceLocation').value = '';
    document.getElementById('portalRaceDate').value = '';
    document.getElementById('portalSeason').value = '';
    document.getElementById('portalSeries').value = '';
    document.getElementById('portalSummary').value = '';
    document.getElementById('portalCoverImage').value = '';
    document.getElementById('coverImagePreview').innerHTML = '';
    document.getElementById('portalPressRelease').value = '';
    document.getElementById('portalChampionship').value = '';
    driverQuotes = [];
    renderDriverQuotes();
    document.getElementById('assetsSection').style.display = 'none';
    document.getElementById('portalPostModal').classList.add('active');
}

// Close Portal Post Modal
function closePortalPostModal() {
    document.getElementById('portalPostModal').classList.remove('active');
    editingPostId = null;
}

// Edit Portal Post
async function editPortalPost(postId) {
    try {
        const response = await fetch(`${API_BASE}/portal/posts/${postId}?client_id=${currentClientId}`);
        const data = await response.json();

        if (!data.success) {
            showError('Failed to load post');
            return;
        }

        const post = data.post;
        editingPostId = post.id;
        document.getElementById('portalModalTitle').textContent = 'Edit Media Post';
        document.getElementById('portalPostId').value = post.id;
        document.getElementById('portalTitle').value = post.title || '';
        document.getElementById('portalRaceLocation').value = post.race_location || '';
        document.getElementById('portalRaceDate').value = post.race_date ? post.race_date.substring(0, 10) : '';
        document.getElementById('portalSeason').value = post.season || '';
        document.getElementById('portalSeries').value = post.series || '';
        document.getElementById('portalSummary').value = post.summary || '';
        document.getElementById('portalCoverImage').value = post.cover_image_url || '';
        previewCoverImage();
        document.getElementById('portalPressRelease').value = post.press_release_text || '';
        document.getElementById('portalChampionship').value = post.championship_highlights || '';

        // Parse driver quotes
        driverQuotes = [];
        if (post.driver_quotes) {
            const quotes = typeof post.driver_quotes === 'string' ? JSON.parse(post.driver_quotes) : post.driver_quotes;
            if (Array.isArray(quotes)) {
                driverQuotes = quotes;
            }
        }
        renderDriverQuotes();

        // Show assets section
        document.getElementById('assetsSection').style.display = 'block';
        renderAssets(post.assets || []);

        document.getElementById('portalPostModal').classList.add('active');
    } catch (error) {
        console.error('Error loading post for edit:', error);
        showError('Failed to load post');
    }
}

// Save Portal Post
async function savePortalPost(status) {
    const title = document.getElementById('portalTitle').value.trim();
    if (!title) {
        showError('Title is required');
        return;
    }

    const postData = {
        client_id: currentClientId,
        title,
        race_location: document.getElementById('portalRaceLocation').value.trim() || null,
        race_date: document.getElementById('portalRaceDate').value || null,
        season: document.getElementById('portalSeason').value.trim() || null,
        series: document.getElementById('portalSeries').value.trim() || null,
        summary: document.getElementById('portalSummary').value.trim() || null,
        cover_image_url: document.getElementById('portalCoverImage').value.trim() || null,
        press_release_text: document.getElementById('portalPressRelease').value.trim() || null,
        championship_highlights: document.getElementById('portalChampionship').value.trim() || null,
        driver_quotes: driverQuotes.filter(q => q.name || q.quote),
        status
    };

    try {
        let url, method;
        if (editingPostId) {
            url = `${API_BASE}/portal/posts/${editingPostId}?client_id=${currentClientId}`;
            method = 'PUT';
        } else {
            url = `${API_BASE}/portal/posts?client_id=${currentClientId}`;
            method = 'POST';
        }

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        const data = await response.json();

        if (data.success) {
            const action = editingPostId ? 'updated' : 'created';
            const statusMsg = status === 'published' ? ' and published' : '';
            showSuccess(`Media post ${action}${statusMsg}!`);
            closePortalPostModal();
            loadPortalPosts();
            loadPortalStats();
        } else {
            showError(data.error || 'Failed to save post');
        }
    } catch (error) {
        console.error('Error saving portal post:', error);
        showError('Failed to save post');
    }
}

// Toggle Publish
async function togglePublish(postId, newStatus) {
    const msg = newStatus === 'published'
        ? 'Publish this post? Press users will be able to see it.'
        : 'Unpublish this post? Press users will no longer see it.';

    if (!confirm(msg)) return;

    try {
        const response = await fetch(`${API_BASE}/portal/posts/${postId}/publish?client_id=${currentClientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await response.json();

        if (data.success) {
            showSuccess(`Post ${newStatus === 'published' ? 'published' : 'unpublished'}!`);
            loadPortalPosts();
            loadPortalStats();
        } else {
            showError(data.error || 'Failed to update status');
        }
    } catch (error) {
        console.error('Error toggling publish:', error);
        showError('Failed to update status');
    }
}

// Delete Portal Post
async function deletePortalPost(postId) {
    if (!confirm('Delete this media post and all its assets? This cannot be undone.')) return;

    try {
        const response = await fetch(`${API_BASE}/portal/posts/${postId}?client_id=${currentClientId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Media post deleted');
            loadPortalPosts();
            loadPortalStats();
        } else {
            showError(data.error || 'Failed to delete post');
        }
    } catch (error) {
        console.error('Error deleting portal post:', error);
        showError('Failed to delete post');
    }
}

// Push to Portal (from press releases tab)
function pushToPortal(releaseId) {
    const release = pressReleases.find(r => r.id === releaseId);
    if (!release) {
        showError('Release not found');
        return;
    }

    showPortalPostModal();

    // Pre-fill from press release
    document.getElementById('portalTitle').value = release.title || '';
    document.getElementById('portalRaceDate').value = release.race_date || '';
    document.getElementById('portalRaceLocation').value = release.race_event || '';

    // Combine bilingual content for press release text
    let pressText = '';
    if (release.body_en) {
        pressText += release.body_en;
    }
    if (release.body_es) {
        if (pressText) pressText += '\n\n---\n\n[ESPANOL]\n\n';
        pressText += release.body_es;
    }
    document.getElementById('portalPressRelease').value = pressText;

    // Use EN subject as summary
    document.getElementById('portalSummary').value = release.subject_en || release.subject_es || '';
}

// Import from Press Release modal
function showImportReleaseModal() {
    const list = document.getElementById('importReleaseList');
    if (!pressReleases || pressReleases.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No press releases available. Create one first.</p></div>';
    } else {
        list.innerHTML = pressReleases.map(r => `
            <div class="release-card" style="cursor:pointer;" onclick="importRelease(${r.id})">
                <div class="release-header">
                    <h3>${escapeHtml(r.title)}</h3>
                    <span class="status-badge status-${r.status}">${r.status}</span>
                </div>
                <div class="release-meta">
                    ${r.race_event ? `<span>🏎️ ${escapeHtml(r.race_event)}</span>` : ''}
                    ${r.race_date ? `<span>📅 ${new Date(r.race_date).toLocaleDateString()}</span>` : ''}
                </div>
                ${r.subject_en ? `<p style="color:#6b7280;font-size:0.875rem;">${escapeHtml(r.subject_en)}</p>` : ''}
            </div>
        `).join('');
    }
    document.getElementById('importReleaseModal').classList.add('active');
}

function closeImportReleaseModal() {
    document.getElementById('importReleaseModal').classList.remove('active');
}

function importRelease(releaseId) {
    const release = pressReleases.find(r => r.id === releaseId);
    if (!release) return;

    let pressText = '';
    if (release.body_en) pressText += release.body_en;
    if (release.body_es) {
        if (pressText) pressText += '\n\n---\n\n[ESPANOL]\n\n';
        pressText += release.body_es;
    }
    document.getElementById('portalPressRelease').value = pressText;

    if (!document.getElementById('portalSummary').value) {
        document.getElementById('portalSummary').value = release.subject_en || release.subject_es || '';
    }
    if (!document.getElementById('portalRaceDate').value && release.race_date) {
        document.getElementById('portalRaceDate').value = release.race_date;
    }
    if (!document.getElementById('portalRaceLocation').value && release.race_event) {
        document.getElementById('portalRaceLocation').value = release.race_event;
    }

    closeImportReleaseModal();
    showSuccess('Press release content imported!');
}

// Driver Quotes Management
function addDriverQuote() {
    driverQuotes.push({ name: '', quote: '' });
    renderDriverQuotes();
}

function removeDriverQuote(index) {
    driverQuotes.splice(index, 1);
    renderDriverQuotes();
}

function updateDriverQuote(index, field, value) {
    driverQuotes[index][field] = value;
}

function renderDriverQuotes() {
    const container = document.getElementById('driverQuotesList');
    if (driverQuotes.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af;font-size:0.875rem;">No driver quotes added yet.</p>';
        return;
    }

    container.innerHTML = driverQuotes.map((q, i) => `
        <div class="driver-quote-item">
            <div class="form-row">
                <div class="form-group" style="margin-bottom:0.5rem;">
                    <input type="text" value="${escapeHtml(q.name)}" placeholder="Driver name"
                        oninput="updateDriverQuote(${i}, 'name', this.value)">
                </div>
                <div style="display:flex;align-items:start;">
                    <button type="button" class="btn-icon" onclick="removeDriverQuote(${i})" title="Remove">🗑️</button>
                </div>
            </div>
            <textarea rows="2" placeholder="Quote text..." style="width:100%;padding:0.5rem;border:2px solid #e5e7eb;border-radius:0.5rem;font-family:inherit;font-size:0.95rem;"
                oninput="updateDriverQuote(${i}, 'quote', this.value)">${escapeHtml(q.quote)}</textarea>
        </div>
    `).join('');
}

// Cover Image Preview
function previewCoverImage() {
    const url = document.getElementById('portalCoverImage').value;
    const preview = document.getElementById('coverImagePreview');
    if (url) {
        preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Cover Preview"
            style="max-width:200px;max-height:120px;border-radius:0.5rem;border:1px solid #e5e7eb;"
            onerror="this.parentElement.innerHTML='<span style=color:#ef4444;font-size:0.875rem>Failed to load image</span>'">`;
    } else {
        preview.innerHTML = '';
    }
}

// Asset Management
function renderAssets(assets) {
    const container = document.getElementById('assetsList');
    if (!assets || assets.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af;font-size:0.875rem;margin-bottom:0.5rem;">No assets added yet.</p>';
        return;
    }

    container.innerHTML = assets.map(asset => `
        <div class="asset-item">
            <div class="asset-info">
                <span class="asset-type-badge asset-type-${asset.asset_type}">${asset.asset_type === 'photo' ? '📷' : '🎬'} ${asset.asset_type}</span>
                <span class="asset-filename">${escapeHtml(asset.filename || asset.caption || asset.url.substring(asset.url.lastIndexOf('/') + 1))}</span>
                ${asset.caption ? `<span class="asset-caption">${escapeHtml(asset.caption)}</span>` : ''}
                ${asset.credit ? `<span class="asset-credit">Credit: ${escapeHtml(asset.credit)}</span>` : ''}
            </div>
            ${asset.asset_type === 'photo' ? `
                <img src="${escapeHtml(asset.thumbnail_url || asset.url)}" alt="" class="asset-thumbnail"
                    onerror="this.style.display='none'">
            ` : ''}
            <button class="btn-icon" onclick="deleteAsset(${asset.id})" title="Delete Asset">🗑️</button>
        </div>
    `).join('');
}

function showAddAssetForm() {
    document.getElementById('addAssetForm').style.display = 'block';
    document.getElementById('showAddAssetBtn').style.display = 'none';
    document.getElementById('assetType').value = 'photo';
    document.getElementById('assetUrl').value = '';
    document.getElementById('assetCaption').value = '';
    document.getElementById('assetCredit').value = '';
    document.getElementById('assetFilename').value = '';
    document.getElementById('assetThumbnail').value = '';
}

function hideAddAssetForm() {
    document.getElementById('addAssetForm').style.display = 'none';
    document.getElementById('showAddAssetBtn').style.display = 'inline-block';
}

async function saveAsset() {
    const url = document.getElementById('assetUrl').value.trim();
    const assetType = document.getElementById('assetType').value;

    if (!url) {
        showError('Asset URL is required');
        return;
    }

    if (!editingPostId) {
        showError('Save the post first, then add assets');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/portal/posts/${editingPostId}/assets?client_id=${currentClientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset_type: assetType,
                url,
                thumbnail_url: document.getElementById('assetThumbnail').value.trim() || null,
                caption: document.getElementById('assetCaption').value.trim() || null,
                credit: document.getElementById('assetCredit').value.trim() || null,
                filename: document.getElementById('assetFilename').value.trim() || null
            })
        });
        const data = await response.json();

        if (data.success) {
            showSuccess('Asset added!');
            hideAddAssetForm();
            // Reload post to refresh assets
            const postResponse = await fetch(`${API_BASE}/portal/posts/${editingPostId}?client_id=${currentClientId}`);
            const postData = await postResponse.json();
            if (postData.success) {
                renderAssets(postData.post.assets || []);
            }
        } else {
            showError(data.error || 'Failed to add asset');
        }
    } catch (error) {
        console.error('Error saving asset:', error);
        showError('Failed to add asset');
    }
}

async function deleteAsset(assetId) {
    if (!confirm('Delete this asset?')) return;

    try {
        const response = await fetch(`${API_BASE}/portal/assets/${assetId}?client_id=${currentClientId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            // Reload post to refresh assets
            if (editingPostId) {
                const postResponse = await fetch(`${API_BASE}/portal/posts/${editingPostId}?client_id=${currentClientId}`);
                const postData = await postResponse.json();
                if (postData.success) {
                    renderAssets(postData.post.assets || []);
                }
            }
        } else {
            showError(data.error || 'Failed to delete asset');
        }
    } catch (error) {
        console.error('Error deleting asset:', error);
        showError('Failed to delete asset');
    }
}

// Console welcome message
console.log('%c📰 Press Release Manager', 'font-size: 20px; font-weight: bold; color: #0891b2;');
console.log(`Client ID: ${currentClientId}`);
console.log('Status: ✅ Backend API Connected');
console.log('\nFeatures:');
console.log('1. ✅ Contact management (CRUD, CSV upload)');
console.log('2. ✅ Press release management (Create, Edit, Delete)');
console.log('3. ✅ Dashboard statistics');
console.log('4. ✅ Media Portal bridge (Create, Publish, Assets)');
console.log('5. ⏳ SendGrid email sending (Phase 3)');
console.log('6. ⏳ AI content generation (Phase 4)');
