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
        addMessage('system', `📞 Initiating call to ${phone}...`);

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
            addMessage('system', `✅ Call initiated successfully!`);
            addMessage('system', `📞 Calling ${name || phone}... Status: ${data.status}`);
            addMessage('system', `🆔 Call SID: ${data.callSid}`);

            // Reset form and close
            document.getElementById('adhocCallForm').reset();
            closeAdHocCall();
        } else {
            alert('Error making call: ' + (data.error || 'Unknown error'));
            addMessage('system', `❌ Call failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Error making ad-hoc call:', error);
        alert('Failed to initiate call. Check server logs.');
        addMessage('system', `❌ Call failed: ${error.message}`);
    }
}

// Close ad-hoc call modal
function closeAdHocCall() {
    if (adhocCallModal) {
        adhocCallModal.style.display = 'none';
        document.getElementById('adhocCallForm').reset();
    }
}
