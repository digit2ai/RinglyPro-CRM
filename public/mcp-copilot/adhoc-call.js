// Ad-Hoc Single Outbound Call Feature
// Standalone feature for making instant calls without Business Collector

let adhocCallModal = null;

// Open ad-hoc call modal
function openAdHocCall() {
    if (!adhocCallModal) {
        createAdHocCallModal();
    }
    adhocCallModal.style.display = 'flex';
    // Focus on phone input
    setTimeout(() => {
        document.getElementById('adhocPhone').focus();
    }, 100);
}

// Create the ad-hoc call modal
function createAdHocCallModal() {
    const modalHTML = `
        <div id="adhocCallModal" class="bc-modal">
            <div class="bc-modal-content" style="max-width: 500px;">
                <div class="bc-modal-header">
                    <h2>📞 Make Outbound Call</h2>
                    <button class="bc-close-btn" onclick="closeAdHocCall()">&times;</button>
                </div>

                <div class="bc-adhoc-call">
                    <p style="color: #95a5a6; font-size: 14px; margin-bottom: 20px;">
                        Make an instant call to any phone number for event-based outreach, hot leads, or VIP follow-ups.
                    </p>

                    <form id="adhocCallForm" class="bc-form">
                        <div class="bc-form-group">
                            <label for="adhocPhone">Phone Number *</label>
                            <input
                                type="tel"
                                id="adhocPhone"
                                placeholder="e.g., (555) 123-4567 or +15551234567"
                                required
                                pattern="[\\d\\s\\(\\)\\-\\+]+"
                            >
                            <small>US format: 10 digits or with +1 country code</small>
                        </div>

                        <div class="bc-form-group">
                            <label for="adhocName">Contact Name (Optional)</label>
                            <input
                                type="text"
                                id="adhocName"
                                placeholder="e.g., John Smith"
                            >
                            <small>Helps identify the call in logs</small>
                        </div>

                        <div class="bc-adhoc-actions">
                            <button type="submit" class="bc-btn-success">📞 Call Now</button>
                            <button type="button" class="bc-btn-secondary" onclick="closeAdHocCall()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    adhocCallModal = document.getElementById('adhocCallModal');

    // Add form submit handler
    document.getElementById('adhocCallForm').addEventListener('submit', handleAdHocCallSubmit);
}

// Handle ad-hoc call form submission
async function handleAdHocCallSubmit(e) {
    e.preventDefault();

    const phone = document.getElementById('adhocPhone').value.trim();
    const name = document.getElementById('adhocName').value.trim();

    if (!phone) {
        alert('Please enter a phone number');
        return;
    }

    // Confirm before calling
    const confirmMsg = name
        ? `Make a call to ${name} at ${phone}?\\n\\nThis will make a REAL call using Twilio.`
        : `Make a call to ${phone}?\\n\\nThis will make a REAL call using Twilio.`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        // Step 1: Save to database
        console.log('💾 Saving contact to database...');
        await saveAdHocContactToDatabase(phone, name);

        // Step 2: Export to GHL CRM
        console.log('📤 Exporting to GHL CRM...');
        await exportAdHocContactToGHL(phone, name);

        // Step 3: Make the call
        console.log('📞 Initiating call to', phone);

        const response = await fetch('/api/outbound-caller/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone,
                leadData: {
                    name: name || 'Unknown',
                    source: 'adhoc',
                    timestamp: new Date().toISOString()
                }
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Call initiated successfully! Status:', data.status, 'SID:', data.callSid);
            alert(`✅ Call initiated successfully!\n\nCalling ${name || phone}...\nStatus: ${data.status}\nCall SID: ${data.callSid}`);

            // Reset form and close
            document.getElementById('adhocCallForm').reset();
            closeAdHocCall();
        } else {
            alert('Error making call: ' + (data.error || 'Unknown error'));
            console.error('❌ Call failed:', data.error);
        }
    } catch (error) {
        console.error('Error making ad-hoc call:', error);
        alert('Failed to initiate call. Check server logs.');
    }
}

// Save ad-hoc contact to database
async function saveAdHocContactToDatabase(phone, name) {
    if (!currentClientId) {
        console.warn('No client ID - skipping database save');
        return;
    }

    try {
        const contact = {
            business_name: name || 'Ad-Hoc Call',
            phone: phone,
            category: 'Ad-Hoc Outbound Call',
            source_url: 'Manual Entry',
            notes: `Ad-hoc call initiated on ${new Date().toLocaleString()}`
        };

        const response = await fetch(`${API_BASE}/business-collector/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentClientId,
                businesses: [contact]
            })
        });

        const data = await response.json();
        if (data.success && data.saved > 0) {
            console.log('✅ Contact saved to database');
        }
    } catch (error) {
        console.error('Error saving ad-hoc contact:', error);
        // Don't fail the call if database save fails
    }
}

// Export ad-hoc contact to GHL CRM
async function exportAdHocContactToGHL(phone, name) {
    if (!currentClientId) {
        console.warn('No client ID - skipping GHL export');
        return;
    }

    try {
        const contact = {
            business_name: name || 'Ad-Hoc Call',
            phone: phone,
            category: 'Ad-Hoc Outbound Call',
            notes: `Ad-hoc call initiated on ${new Date().toLocaleString()}`
        };

        const response = await fetch(`${API_BASE}/business-collector/export-to-ghl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentClientId,
                businesses: [contact]
            })
        });

        const data = await response.json();
        if (data.success && data.exported > 0) {
            console.log('✅ Contact exported to GHL CRM with "NEW LEAD" tag');
        } else if (data.skipped > 0) {
            console.log('ℹ️ Contact already exists in GHL CRM');
        }
    } catch (error) {
        console.error('Error exporting ad-hoc contact to GHL:', error);
        // Don't fail the call if GHL export fails
    }
}

// Close ad-hoc call modal
function closeAdHocCall() {
    if (adhocCallModal) {
        adhocCallModal.style.display = 'none';
        document.getElementById('adhocCallForm').reset();
    }
}
