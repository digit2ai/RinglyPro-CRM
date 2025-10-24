// Business Collector Form Modal for MCP Copilot
// Integrated form that uses existing sessionId for authentication

let businessCollectorModal = null;
let currentLeads = null;

// US Cities by State - Top cities for each state
const US_CITIES_BY_STATE = {
    'Florida': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Tallahassee', 'Cape Coral', 'Port St. Lucie', 'Pembroke Pines', 'Hollywood', 'Miramar', 'Coral Springs', 'Clearwater', 'Palm Bay', 'Lakeland', 'Pompano Beach', 'West Palm Beach', 'Boca Raton', 'Gainesville', 'Fort Myers', 'Daytona Beach', 'Sarasota', 'Kissimmee', 'Naples', 'Deerfield Beach', 'Boynton Beach', 'Delray Beach', 'Melbourne', 'Ocala', 'Pensacola', 'Brandon', 'Spring Hill', 'Largo'],
    'Texas': ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Laredo', 'Lubbock', 'Irving', 'Garland', 'Frisco', 'McKinney', 'Amarillo', 'Grand Prairie', 'Brownsville', 'Pasadena', 'Mesquite', 'Killeen', 'McAllen', 'Waco', 'Carrollton', 'Pearland', 'Denton', 'Midland', 'Abilene', 'Round Rock', 'The Woodlands', 'Richardson', 'Tyler', 'College Station', 'Lewisville', 'Sugar Land'],
    'California': ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Santa Ana', 'Riverside', 'Stockton', 'Irvine', 'Chula Vista', 'Fremont', 'San Bernardino', 'Modesto', 'Fontana', 'Oxnard', 'Moreno Valley', 'Huntington Beach', 'Glendale', 'Santa Clarita', 'Garden Grove', 'Oceanside', 'Rancho Cucamonga', 'Santa Rosa', 'Ontario', 'Elk Grove', 'Corona', 'Lancaster', 'Palmdale', 'Salinas', 'Hayward', 'Pomona', 'Sunnyvale', 'Escondido', 'Pasadena', 'Torrance', 'Orange', 'Fullerton', 'Thousand Oaks', 'Visalia', 'Simi Valley', 'Concord', 'Roseville'],
    'New York': ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany', 'New Rochelle', 'Mount Vernon', 'Schenectady', 'Utica', 'White Plains', 'Hempstead', 'Troy', 'Niagara Falls', 'Binghamton', 'Freeport', 'Valley Stream', 'Long Beach', 'Spring Valley', 'Levittown', 'Poughkeepsie', 'West Seneca', 'Cheektowaga', 'West Babylon', 'Hicksville'],
    'Georgia': ['Atlanta', 'Augusta', 'Columbus', 'Macon', 'Savannah', 'Athens', 'Sandy Springs', 'Roswell', 'Johns Creek', 'Albany', 'Warner Robins', 'Alpharetta', 'Marietta', 'Valdosta', 'Smyrna', 'Dunwoody', 'Rome', 'East Point', 'Milton', 'Peachtree City', 'Gainesville', 'Hinesville', 'Newnan', 'Kennesaw', 'Douglasville'],
    'North Carolina': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville', 'Cary', 'Wilmington', 'High Point', 'Concord', 'Greenville', 'Asheville', 'Gastonia', 'Jacksonville', 'Chapel Hill', 'Rocky Mount', 'Burlington', 'Wilson', 'Huntersville', 'Kannapolis', 'Apex', 'Hickory', 'Goldsboro', 'Indian Trail', 'Monroe'],
    'Arizona': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Glendale', 'Gilbert', 'Tempe', 'Peoria', 'Surprise', 'Yuma', 'Avondale', 'Goodyear', 'Flagstaff', 'Buckeye', 'Lake Havasu City', 'Casa Grande', 'Sierra Vista', 'Maricopa', 'Oro Valley', 'Prescott', 'Bullhead City', 'Prescott Valley', 'Apache Junction', 'Marana'],
    'Nevada': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks', 'Carson City', 'Fernley', 'Elko', 'Mesquite', 'Boulder City', 'Fallon', 'Winnemucca', 'West Wendover', 'Ely', 'Yerington'],
    'Colorado': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Thornton', 'Arvada', 'Westminster', 'Pueblo', 'Centennial', 'Boulder', 'Greeley', 'Longmont', 'Loveland', 'Grand Junction', 'Broomfield', 'Castle Rock', 'Commerce City', 'Parker', 'Littleton', 'Northglenn', 'Brighton', 'Englewood', 'Wheat Ridge', 'Fountain'],
    'Washington': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Kent', 'Everett', 'Renton', 'Spokane Valley', 'Federal Way', 'Yakima', 'Bellingham', 'Kennewick', 'Auburn', 'Pasco', 'Marysville', 'Lakewood', 'Redmond', 'Shoreline', 'Richland', 'Kirkland', 'Burien', 'Sammamish', 'Olympia', 'Lacey', 'Edmonds', 'Bremerton', 'Puyallup', 'Wenatchee', 'Mount Vernon']
};

// Open Business Collector Form Modal
function openBusinessCollectorForm() {
    if (!sessionId) {
        addMessage('error', 'Please connect to Business Collector first');
        return;
    }

    // Create modal if doesn't exist
    if (!businessCollectorModal) {
        createBusinessCollectorModal();
    }

    businessCollectorModal.style.display = 'flex';
}

// Create the modal HTML
function createBusinessCollectorModal() {
    const modalHTML = `
        <div id="businessCollectorModal" class="bc-modal">
            <div class="bc-modal-content">
                <div class="bc-modal-header">
                    <h2>🔍 Business Collector</h2>
                    <button class="bc-close-btn" onclick="closeBusinessCollectorForm()">&times;</button>
                </div>

                <form id="bcForm" class="bc-form">
                    <div class="bc-form-group">
                        <label for="bcCategory">Business Category *</label>
                        <select id="bcCategory" required>
                            <option value="">Select a category...</option>
                            <optgroup label="Home & Property Services">
                                <option value="lawn care service">Lawn Care & Landscaping</option>
                                <option value="tree service">Tree Trimming & Removal</option>
                                <option value="pool cleaning service">Pool Cleaning & Maintenance</option>
                                <option value="pest control service">Pest Control</option>
                                <option value="pressure washing service">Pressure Washing</option>
                                <option value="roofing contractor">Roofing & Gutters</option>
                                <option value="painting contractor">Painting Contractors</option>
                                <option value="plumber">Plumbing</option>
                                <option value="electrician">Electrical Services</option>
                                <option value="HVAC contractor">HVAC (Air Conditioning & Heating)</option>
                                <option value="garage door repair">Garage Door Repair</option>
                                <option value="handyman service">Handyman Services</option>
                                <option value="flooring contractor">Flooring & Tile</option>
                                <option value="fence contractor">Fence Installation & Repair</option>
                                <option value="carpet cleaning service">Carpet Cleaning</option>
                                <option value="window cleaning service">Window Cleaning</option>
                                <option value="junk removal service">Junk Removal</option>
                                <option value="home remodeling contractor">Home Remodeling</option>
                                <option value="cleaning service">Cleaning Services</option>
                                <option value="appliance repair service">Appliance Repair</option>
                            </optgroup>
                            <optgroup label="Real Estate & Housing">
                                <option value="real estate agent">Real Estate Agents</option>
                                <option value="property management company">Property Managers</option>
                                <option value="apartment complex">Apartment Complexes</option>
                                <option value="home inspection service">Home Inspectors</option>
                                <option value="mortgage lender">Mortgage Loan Officers</option>
                                <option value="title company">Title Companies</option>
                                <option value="real estate photography service">Real Estate Photographers</option>
                            </optgroup>
                            <optgroup label="Health, Wellness & Personal Care">
                                <option value="chiropractor">Chiropractors</option>
                                <option value="dentist">Dentists & Orthodontists</option>
                                <option value="physical therapy clinic">Physical Therapists</option>
                                <option value="massage therapist">Massage Therapists</option>
                                <option value="medical spa">Med Spas</option>
                                <option value="hair salon">Hair Salons & Barbershops</option>
                                <option value="nail salon">Nail Salons</option>
                                <option value="personal trainer">Personal Trainers & Gyms</option>
                                <option value="nutritionist">Nutritionists & Dieticians</option>
                                <option value="counseling service">Counseling & Therapy</option>
                            </optgroup>
                            <optgroup label="Professional Services">
                                <option value="insurance agency">Insurance Agents</option>
                                <option value="financial planner">Financial Advisors</option>
                                <option value="accounting firm">Accountants & Tax Preparers</option>
                                <option value="law firm">Lawyers & Legal Services</option>
                                <option value="notary public">Notaries</option>
                                <option value="business consultant">Consultants & Coaches</option>
                            </optgroup>
                            <optgroup label="Auto & Transportation">
                                <option value="auto repair shop">Auto Repair</option>
                                <option value="auto detailing service">Car Detailing</option>
                                <option value="mobile mechanic">Mobile Mechanics</option>
                                <option value="towing service">Towing Services</option>
                                <option value="car dealership">Car Dealerships</option>
                                <option value="driving school">Driving Schools</option>
                                <option value="auto glass repair">Auto Glass Repair</option>
                            </optgroup>
                            <optgroup label="Events & Lifestyle">
                                <option value="wedding planner">Wedding Planners</option>
                                <option value="photographer">Photographers & Videographers</option>
                                <option value="DJ service">DJs & Entertainment</option>
                                <option value="catering service">Caterers & Food Trucks</option>
                                <option value="party equipment rental">Party Rentals</option>
                                <option value="event venue">Event Venues</option>
                                <option value="florist">Florists</option>
                            </optgroup>
                            <optgroup label="Pet & Animal Services">
                                <option value="dog grooming service">Dog Groomers</option>
                                <option value="veterinarian">Veterinarians</option>
                                <option value="pet boarding service">Pet Boarding & Daycare</option>
                                <option value="dog trainer">Dog Training</option>
                            </optgroup>
                            <optgroup label="Medical & Healthcare">
                                <option value="medical clinic">Medical Clinics</option>
                                <option value="medical billing service">Medical Billing</option>
                                <option value="home health care service">Home Health Care</option>
                                <option value="optometrist">Optometrists & Eye Clinics</option>
                                <option value="dental clinic">Dental Offices</option>
                                <option value="speech therapist">Speech & Occupational Therapy</option>
                            </optgroup>
                            <optgroup label="Education & Tutoring">
                                <option value="tutoring service">Private Tutors</option>
                                <option value="test preparation center">Test Prep Centers</option>
                                <option value="childcare center">Childcare & Preschools</option>
                                <option value="art school">Art & Music Schools</option>
                            </optgroup>
                            <optgroup label="Technology & Marketing">
                                <option value="web design agency">Web Design Agencies</option>
                                <option value="marketing agency">Marketing Consultants</option>
                                <option value="IT services">IT Support & MSPs</option>
                                <option value="SEO service">SEO & Social Media</option>
                            </optgroup>
                            <optgroup label="Construction & B2B">
                                <option value="general contractor">General Contractors</option>
                                <option value="excavation contractor">Excavation & Concrete</option>
                                <option value="welding service">Welding & Fabrication</option>
                                <option value="equipment rental service">Equipment Rental</option>
                            </optgroup>
                        </select>
                    </div>

                    <div class="bc-form-group">
                        <label for="bcState">State *</label>
                        <select id="bcState" required>
                            <option value="">Select a state...</option>
                            <option value="Florida">Florida</option>
                            <option value="Texas">Texas</option>
                            <option value="California">California</option>
                            <option value="New York">New York</option>
                            <option value="Georgia">Georgia</option>
                            <option value="North Carolina">North Carolina</option>
                            <option value="Arizona">Arizona</option>
                            <option value="Nevada">Nevada</option>
                            <option value="Colorado">Colorado</option>
                            <option value="Washington">Washington</option>
                        </select>
                    </div>

                    <div class="bc-form-group">
                        <label for="bcCity">City (Optional)</label>
                        <select id="bcCity">
                            <option value="">Select a city or leave blank for entire state...</option>
                        </select>
                        <small>Cities populate based on selected state</small>
                    </div>

                    <div class="bc-form-group">
                        <label for="bcMaxResults">Number of Leads</label>
                        <select id="bcMaxResults">
                            <option value="50">50 leads</option>
                            <option value="100" selected>100 leads</option>
                            <option value="150">150 leads</option>
                            <option value="200">200 leads</option>
                        </select>
                    </div>

                    <button type="submit" class="bc-submit-btn">🔍 Collect Leads</button>
                </form>

                <div class="bc-loading" id="bcLoading" style="display: none;">
                    <div class="bc-spinner"></div>
                    <p>Collecting leads...</p>
                </div>

                <div class="bc-results" id="bcResults" style="display: none;">
                    <h3 id="bcResultsTitle"></h3>
                    <div id="bcResultsList"></div>
                    <div class="bc-actions">
                        <button class="bc-btn-primary" onclick="startOutboundCalling()">📞 Start Outbound Caller</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    businessCollectorModal = document.getElementById('businessCollectorModal');

    // Add form submit handler
    document.getElementById('bcForm').addEventListener('submit', handleBusinessCollectorSubmit);

    // Add state change listener to populate cities
    document.getElementById('bcState').addEventListener('change', populateCitiesForState);
}

// Populate cities dropdown based on selected state
function populateCitiesForState() {
    const state = document.getElementById('bcState').value;
    const citySelect = document.getElementById('bcCity');

    // Clear existing options
    citySelect.innerHTML = '<option value="">Select a city or leave blank for entire state...</option>';

    // If no state selected, return
    if (!state) {
        return;
    }

    // Get cities for selected state
    const cities = US_CITIES_BY_STATE[state] || [];

    // Populate city dropdown
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });

    console.log(`✅ Populated ${cities.length} cities for ${state}`);
}

// Handle form submission
async function handleBusinessCollectorSubmit(e) {
    e.preventDefault();

    const category = document.getElementById('bcCategory').value;
    const state = document.getElementById('bcState').value;
    const city = document.getElementById('bcCity').value; // Now a dropdown value
    const maxResults = parseInt(document.getElementById('bcMaxResults').value);

    const location = city ? `${city}, ${state}` : state;

    // Show loading
    document.getElementById('bcForm').style.display = 'none';
    document.getElementById('bcLoading').style.display = 'block';

    try {
        const response = await fetch(`${API_BASE}/business-collector/collect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                category,
                geography: location,
                maxResults
            })
        });

        const data = await response.json();

        if (data.success && data.businesses) {
            currentLeads = data.businesses;
            displayBusinessCollectorResults(data, category, location);
        } else {
            alert('Error: ' + (data.error || 'Failed to collect leads'));
            document.getElementById('bcForm').style.display = 'block';
        }
    } catch (error) {
        console.error('Collection error:', error);
        alert('Failed to collect leads');
        document.getElementById('bcForm').style.display = 'block';
    } finally {
        document.getElementById('bcLoading').style.display = 'none';
    }
}

// Display results
async function displayBusinessCollectorResults(data, category, location) {
    const businesses = data.businesses || [];

    document.getElementById('bcResultsTitle').textContent =
        `Found ${businesses.length} ${category} in ${location}`;

    const resultsList = document.getElementById('bcResultsList');
    resultsList.innerHTML = businesses.slice(0, 20).map(b => `
        <div class="bc-business-card">
            <strong>${b.business_name || 'Unnamed'}</strong><br>
            ${b.phone ? `📱 ${b.phone}<br>` : ''}
            ${b.website ? `🌐 ${b.website}<br>` : ''}
            ${b.street ? `📍 ${b.street}` : ''}
        </div>
    `).join('');

    if (businesses.length > 20) {
        resultsList.innerHTML += `<div class="bc-business-card"><center>... and ${businesses.length - 20} more leads</center></div>`;
    }

    document.getElementById('bcResults').style.display = 'block';

    // Auto-save businesses to database
    if (currentClientId && businesses.length > 0) {
        await saveBusinessesToDatabase(businesses);
    }
}

// Save businesses to database
async function saveBusinessesToDatabase(businesses) {
    try {
        console.log(`💾 Saving ${businesses.length} businesses to database...`);

        const response = await fetch(`${API_BASE}/business-collector/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: currentClientId,
                businesses: businesses
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`✅ Saved ${data.saved} businesses to directory`);
            if (data.duplicates > 0) {
                console.log(`⚠️ Skipped ${data.duplicates} duplicates`);
            }
            addMessage('system', `💾 Saved ${data.saved} businesses to your directory${data.duplicates > 0 ? ` (${data.duplicates} duplicates skipped)` : ''}`);

            // Auto-export to GHL CRM with "NEW LEAD" tag
            await exportBusinessesToGHL(businesses);
        } else {
            console.error('Failed to save businesses:', data.error);
            addMessage('system', `⚠️ Warning: Could not save businesses to database`);
        }
    } catch (error) {
        console.error('Error saving businesses to database:', error);
        // Don't show error to user - this is a background operation
    }
}

// Export businesses to GHL CRM with "NEW LEAD" tag
async function exportBusinessesToGHL(businesses) {
    if (!currentClientId || !businesses || businesses.length === 0) {
        return;
    }

    try {
        console.log(`📤 Exporting ${businesses.length} businesses to GHL CRM...`);

        const response = await fetch(`${API_BASE}/business-collector/export-to-ghl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId: currentClientId,
                businesses: businesses
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`✅ Exported ${data.exported} contacts to GHL CRM`);
            if (data.exported > 0) {
                addMessage('system', `📤 Exported ${data.exported} contacts to GHL CRM with "NEW LEAD" tag${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
            }
            if (data.failed > 0) {
                console.warn(`⚠️ Failed to export ${data.failed} contacts to GHL`);
                addMessage('system', `⚠️ Failed to export ${data.failed} contacts to GHL CRM`);
            }
        } else {
            // If GHL is not configured, silently skip (don't alarm the user)
            if (data.error && data.error.includes('not configured')) {
                console.log('ℹ️ GHL CRM not configured for this client - skipping export');
            } else {
                console.error('Failed to export to GHL:', data.error);
                addMessage('system', `⚠️ Could not export to GHL CRM: ${data.error}`);
            }
        }
    } catch (error) {
        console.error('Error exporting businesses to GHL:', error);
        // Don't show error to user if GHL is not configured
    }
}

// Export to CSV
function exportLeadsToCSV() {
    if (!currentLeads) return;

    const headers = ['Business Name', 'Category', 'Phone', 'Website'];
    const rows = [headers.join(',')];

    currentLeads.forEach(b => {
        let phone = (b.phone || '').replace(/[^\d]/g, '');
        if (phone.length === 10) phone = '1' + phone;

        const name = (b.business_name || '').replace(/"/g, '""');
        const category = (b.category || '').replace(/"/g, '""');
        const website = b.website || '';

        rows.push(`"${name}","${category}",${phone},"${website}"`);
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `business-leads-${Date.now()}.csv`;
    link.click();

    addMessage('system', `✅ Exported ${currentLeads.length} leads to CSV with category`);
}

// Start outbound calling
async function startOutboundCalling() {
    if (!currentLeads) return;

    const leadsWithPhones = currentLeads.filter(b => b.phone);

    if (leadsWithPhones.length === 0) {
        alert('No leads with phone numbers');
        return;
    }

    if (!confirm(`Start calling ${leadsWithPhones.length} leads?\n\nThis will make REAL calls using Twilio!\n\nCalls will be made every 2 minutes.`)) {
        return;
    }

    try {
        // Start auto-calling
        const response = await fetch('/api/outbound-caller/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leads: leadsWithPhones,
                intervalMinutes: 2
            })
        });

        const data = await response.json();

        if (data.success) {
            closeBusinessCollectorForm();
            addMessage('system', `📞 Outbound Caller started! Calling ${leadsWithPhones.length} leads every 2 minutes.`);

            // Show progress modal
            showOutboundCallerProgress();
        } else {
            alert('Error starting calls: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error starting outbound caller:', error);
        alert('Failed to start outbound caller. Check server logs.');
    }
}

// Show outbound caller progress modal
let progressModal = null;
let progressInterval = null;

function showOutboundCallerProgress() {
    // Create progress modal if doesn't exist
    if (!progressModal) {
        const modalHTML = `
            <div id="callingProgressModal" class="bc-modal">
                <div class="bc-modal-content" style="max-width: 600px;">
                    <div class="bc-modal-header">
                        <h2>📞 Outbound Calling in Progress</h2>
                        <button class="bc-close-btn" onclick="closeProgressModal()">&times;</button>
                    </div>

                    <div class="calling-status">
                        <div class="status-summary">
                            <h3 id="callingStatusText">Starting calls...</h3>
                            <div class="progress-bar">
                                <div id="callingProgressBar" class="progress-fill"></div>
                            </div>
                            <p id="callingStats">Preparing to call leads...</p>
                        </div>

                        <div class="recent-calls">
                            <h4>Recent Calls</h4>
                            <div id="recentCallsList" class="calls-list">
                                <p style="text-align: center; color: #999;">No calls yet...</p>
                            </div>
                        </div>

                        <div class="calling-actions" style="margin-top: 20px;">
                            <button onclick="stopOutboundCalling()" class="bc-btn-danger">⏹️ Stop Calling</button>
                            <button onclick="refreshCallingStatus()" class="bc-btn-secondary">🔄 Refresh</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        progressModal = document.getElementById('callingProgressModal');
    }

    progressModal.style.display = 'flex';

    // Start polling for status updates every 10 seconds
    refreshCallingStatus();
    progressInterval = setInterval(refreshCallingStatus, 10000);
}

// Refresh calling status
async function refreshCallingStatus() {
    try {
        const response = await fetch('/api/outbound-caller/status');
        const data = await response.json();

        if (data.success) {
            const { isRunning, callsMade, totalLeads, remaining, recentLogs } = data;

            // Update status text
            if (isRunning) {
                document.getElementById('callingStatusText').textContent =
                    `Calling ${callsMade}/${totalLeads} leads`;
            } else {
                document.getElementById('callingStatusText').textContent =
                    `Completed - ${callsMade}/${totalLeads} calls made`;
            }

            // Update progress bar
            const percentage = totalLeads > 0 ? (callsMade / totalLeads * 100) : 0;
            document.getElementById('callingProgressBar').style.width = percentage + '%';

            // Update stats
            document.getElementById('callingStats').textContent =
                `${remaining} leads remaining • Next call in ~${data.intervalMinutes || 2} minutes`;

            // Update recent calls list
            const callsList = document.getElementById('recentCallsList');
            if (recentLogs && recentLogs.length > 0) {
                callsList.innerHTML = recentLogs.reverse().map(log => `
                    <div class="call-log-entry">
                        <span class="call-phone">${log.phone || 'Unknown'}</span>
                        <span class="call-status status-${log.status}">${log.status || 'unknown'}</span>
                        <span class="call-time">${log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                    </div>
                `).join('');
            }

            // Stop polling if not running
            if (!isRunning && progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }
    } catch (error) {
        console.error('Error fetching calling status:', error);
    }
}

// Stop outbound calling
async function stopOutboundCalling() {
    if (!confirm('Stop calling? Remaining leads will not be called.')) {
        return;
    }

    try {
        const response = await fetch('/api/outbound-caller/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            addMessage('system', `⏹️ Outbound calling stopped. Made ${data.callsMade}/${data.totalLeads} calls.`);
            refreshCallingStatus();

            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }
    } catch (error) {
        console.error('Error stopping calls:', error);
        alert('Failed to stop calling');
    }
}

// Close progress modal
function closeProgressModal() {
    if (progressModal) {
        progressModal.style.display = 'none';
    }

    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// Close modal
function closeBusinessCollectorForm() {
    if (businessCollectorModal) {
        businessCollectorModal.style.display = 'none';
        document.getElementById('bcForm').style.display = 'block';
        document.getElementById('bcResults').style.display = 'none';
        currentLeads = null;
    }
}
