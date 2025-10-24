// Business Collector Form Handler
let currentResults = null;

document.getElementById('collectorForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = document.getElementById('category').value;
    const state = document.getElementById('state').value;
    const city = document.getElementById('city').value.trim();
    const maxResults = parseInt(document.getElementById('maxResults').value);

    // Build location string
    const location = city ? `${city}, ${state}` : state;

    // Show loading
    document.getElementById('loading').classList.add('show');
    document.getElementById('results').classList.remove('show');
    document.getElementById('collectBtn').disabled = true;

    try {
        // Call Business Collector API
        const response = await fetch('/api/mcp/business-collector/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                category,
                geography: location,
                maxResults
            })
        });

        const data = await response.json();

        if (data.success && data.data) {
            currentResults = data.data;
            displayResults(data.data, category, location);
        } else {
            alert('Error collecting leads: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Collection error:', error);
        alert('Failed to collect leads. Please try again.');
    } finally {
        document.getElementById('loading').classList.remove('show');
        document.getElementById('collectBtn').disabled = false;
    }
});

function displayResults(data, category, location) {
    const businesses = data.businesses || [];
    const summary = data.summary || {};

    // Update stats
    const statsHtml = `
        <div class="stat-card">
            <div class="stat-number">${businesses.length}</div>
            <div class="stat-label">Leads Found</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${businesses.filter(b => b.phone).length}</div>
            <div class="stat-label">With Phone</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${businesses.filter(b => b.website).length}</div>
            <div class="stat-label">With Website</div>
        </div>
    `;
    document.getElementById('stats').innerHTML = statsHtml;

    // Update title
    document.getElementById('resultsTitle').textContent =
        `Found ${businesses.length} ${category} in ${location}`;

    // Display businesses
    const businessList = document.getElementById('businessList');
    businessList.innerHTML = businesses.slice(0, 20).map(b => `
        <div class="business-card">
            <div class="business-name">${escapeHtml(b.business_name || 'Unnamed Business')}</div>
            <div class="business-info">
                ${b.phone ? `📱 ${formatPhone(b.phone)}<br>` : ''}
                ${b.website ? `🌐 ${escapeHtml(b.website)}<br>` : ''}
                ${b.street ? `📍 ${escapeHtml(b.street)}<br>` : ''}
                ${b.google_rating ? `⭐ ${b.google_rating} (${b.google_reviews || 0} reviews)` : ''}
            </div>
        </div>
    `).join('');

    if (businesses.length > 20) {
        businessList.innerHTML += `
            <div class="business-card" style="text-align: center; border-left-color: #6c757d;">
                <div class="business-info">
                    ... and ${businesses.length - 20} more leads<br>
                    Export to CSV to see all results
                </div>
            </div>
        `;
    }

    // Show results and action buttons
    document.getElementById('results').classList.add('show');
    document.querySelector('.action-buttons').classList.add('show');
}

// Export to CSV
document.getElementById('exportBtn').addEventListener('click', () => {
    if (!currentResults || !currentResults.businesses) {
        alert('No results to export');
        return;
    }

    const businesses = currentResults.businesses;
    const category = document.getElementById('category').options[document.getElementById('category').selectedIndex].text;
    const state = document.getElementById('state').value;
    const city = document.getElementById('city').value.trim();

    // Create CSV
    const headers = ['Name', 'phone', 'Website'];
    const rows = [headers.join(',')];

    businesses.forEach(b => {
        let phone = b.phone || b.phone_e164 || '';
        // Normalize phone number
        phone = phone.replace(/[^\d]/g, '');
        if (phone.length === 10) {
            phone = '1' + phone; // Add country code
        }

        const website = b.website || '';
        const name = (b.business_name || '').replace(/"/g, '""'); // Escape quotes

        rows.push(`"${name}",${phone},"${website}"`);
    });

    const csvContent = rows.join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const location = city ? `${city}-${state}` : state;
    const filename = `${category.replace(/\s+/g, '-').toLowerCase()}-${location.replace(/\s+/g, '-').toLowerCase()}-${businesses.length}-leads.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`✅ Downloaded ${businesses.length} leads to ${filename}`);
});

// Outbound Caller
document.getElementById('outboundBtn').addEventListener('click', () => {
    if (!currentResults || !currentResults.businesses) {
        alert('No results to call');
        return;
    }

    const leadsWithPhones = currentResults.businesses.filter(b => b.phone || b.phone_e164);

    if (leadsWithPhones.length === 0) {
        alert('No leads with phone numbers found');
        return;
    }

    if (confirm(`Start calling ${leadsWithPhones.length} leads?\n\n⚠️ This will make REAL calls during business hours.\n\nCalls will be made every 2 minutes.`)) {
        window.location.href = `/outbound-caller?leads=${leadsWithPhones.length}`;
    }
});

// New Search
document.getElementById('newSearchBtn').addEventListener('click', () => {
    document.getElementById('results').classList.remove('show');
    document.querySelector('.action-buttons').classList.remove('show');
    currentResults = null;
    document.getElementById('collectorForm').scrollIntoView({ behavior: 'smooth' });
});

// Utility functions
function formatPhone(phone) {
    const cleaned = phone.replace(/[^\d]/g, '');
    if (cleaned.length === 11) {
        return `+${cleaned.substring(0, 1)} (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
    } else if (cleaned.length === 10) {
        return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phone;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
