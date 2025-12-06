# Photo Studio - Design Brief & AI Integration Implementation Guide

## ✅ Completed Backend Implementation

### Database Migrations Created

1. **`migrations/create-photo-studio-design-briefs.sql`**
   - Creates `photo_studio_design_briefs` table
   - 1-to-1 relationship with `photo_studio_orders`
   - Fields: business info, design request, branding, content/copy
   - Food service focus: Restaurant, Bakery, Café, Pastry Shop, Ice Cream Shop, Dessert Shop

2. **`migrations/create-photo-studio-ai-outputs.sql`**
   - Creates `photo_studio_ai_outputs` table
   - Stores AI-generated content (menu, flyer, social, generic)
   - Tracks model used, request context, structured output

### Backend Services

1. **`src/services/mcpClient.js`**
   - MCP server integration for OpenAI/Claude
   - Functions:
     - `runAIAssistant({ mode, brief, order, photos, extraInstructions })`
     - `generateFallbackContent(mode, brief)` - When MCP unavailable
   - Modes: `menu`, `flyer`, `social`, `generic`
   - Structured JSON output for each mode
   - Graceful fallback when MCP server is down

### API Endpoints

**Design Brief Endpoints:**
- `POST /api/photo-studio/order/:orderId/brief` - Create/update brief (upsert)
- `PUT /api/photo-studio/order/:orderId/brief` - Update brief (alias)
- `GET /api/photo-studio/order/:orderId/brief` - Get brief (customer or admin)

**AI Assistant Endpoints (Admin Only):**
- `POST /api/photo-studio/admin/order/:orderId/ai/generate` - Generate AI content
- `GET /api/photo-studio/admin/order/:orderId/ai/outputs` - List all AI outputs for order

All endpoints include:
- JWT authentication
- User ownership verification
- Admin role checking
- Comprehensive error handling

---

## 📋 Frontend Implementation Needed

### 1. Customer Portal (`views/photo-studio-portal.ejs`)

#### Add Design Brief Section to Order Details

**Location:** Insert after "Order Summary" card, before "Upload Your Photos" section (around line 1002)

**Implementation:**

```javascript
// Add to renderOrderDetails() function after Order Summary card

// Load design brief
loadDesignBrief(orderId);

// Add Design Brief Card
contentHTML += renderDesignBriefCard(orderId);
```

**New Functions to Add:**

```javascript
// Global variable
let designBriefs = {}; // Store briefs by orderId

// Load design brief for an order
async function loadDesignBrief(orderId) {
    try {
        const token = getAuthToken();
        const response = await fetch(`/api/photo-studio/order/${orderId}/brief`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            designBriefs[orderId] = data.brief;
            // Refresh details if this is the selected order
            if (selectedOrderId === orderId) {
                renderOrderDetails(orderId);
            }
        }
    } catch (error) {
        console.error('Error loading design brief:', error);
    }
}

// Render Design Brief card
function renderDesignBriefCard(orderId) {
    const brief = designBriefs[orderId];

    if (!brief) {
        // No brief exists - show form
        return `
            <div class="order-details-card" id="design-brief-card-${orderId}">
                <h3 style="margin-bottom: 1rem; font-size: 1.125rem;">
                    📋 Tell Us About Your Brand & Design Needs
                </h3>
                <p style="color: #64748b; margin-bottom: 1.5rem; font-size: 0.875rem;">
                    Help our designer and AI create the perfect marketing materials for your food service business.
                </p>
                ${renderDesignBriefForm(orderId)}
            </div>
        `;
    } else {
        // Brief exists - show read-only view with edit button
        return `
            <div class="order-details-card" id="design-brief-card-${orderId}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-size: 1.125rem; margin: 0;">📋 Design Brief</h3>
                    <button class="btn btn-secondary" onclick="editDesignBrief(${orderId})" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
                        Edit Brief
                    </button>
                </div>
                <div id="brief-view-${orderId}">
                    ${renderDesignBriefView(brief)}
                </div>
                <div id="brief-form-${orderId}" style="display: none;">
                    ${renderDesignBriefForm(orderId, brief)}
                </div>
            </div>
        `;
    }
}

// Render Design Brief Form
function renderDesignBriefForm(orderId, existingData = {}) {
    return `
        <form id="design-brief-form-${orderId}" style="display: grid; gap: 1.5rem;">
            <!-- Business Info -->
            <div>
                <h4 style="margin-bottom: 0.75rem; font-size: 1rem; color: #1e293b;">Business Information</h4>
                <div style="display: grid; gap: 0.75rem;">
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">
                            Business Name <span style="color: #ef4444;">*</span>
                        </label>
                        <input type="text" name="business_name" value="${existingData.business_name || ''}"
                               required
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">
                            Business Type <span style="color: #ef4444;">*</span>
                        </label>
                        <select name="business_type" required
                                style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                            <option value="">Select type...</option>
                            <option value="Restaurant" ${existingData.business_type === 'Restaurant' ? 'selected' : ''}>Restaurant</option>
                            <option value="Bakery" ${existingData.business_type === 'Bakery' ? 'selected' : ''}>Bakery</option>
                            <option value="Café" ${existingData.business_type === 'Café' ? 'selected' : ''}>Café</option>
                            <option value="Pastry Shop" ${existingData.business_type === 'Pastry Shop' ? 'selected' : ''}>Pastry Shop</option>
                            <option value="Ice Cream Shop" ${existingData.business_type === 'Ice Cream Shop' ? 'selected' : ''}>Ice Cream Shop</option>
                            <option value="Dessert Shop" ${existingData.business_type === 'Dessert Shop' ? 'selected' : ''}>Dessert Shop</option>
                            <option value="Other" ${existingData.business_type === 'Other' ? 'selected' : ''}>Other</option>
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">City</label>
                            <input type="text" name="location_city" value="${existingData.location_city || ''}"
                                   style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Country</label>
                            <input type="text" name="location_country" value="${existingData.location_country || ''}"
                                   style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Website</label>
                        <input type="url" name="website" value="${existingData.website || ''}"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                </div>
            </div>

            <!-- Design Request -->
            <div>
                <h4 style="margin-bottom: 0.75rem; font-size: 1rem; color: #1e293b;">Design Request</h4>
                <div style="display: grid; gap: 0.75rem;">
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">
                            Primary Design Need <span style="color: #ef4444;">*</span>
                        </label>
                        <select name="primary_design_need" required
                                style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                            <option value="">Select...</option>
                            <option value="Menu" ${existingData.primary_design_need === 'Menu' ? 'selected' : ''}>Menu</option>
                            <option value="Flyer/Postcard" ${existingData.primary_design_need === 'Flyer/Postcard' ? 'selected' : ''}>Flyer/Postcard</option>
                            <option value="Social Media Graphics" ${existingData.primary_design_need === 'Social Media Graphics' ? 'selected' : ''}>Social Media Graphics</option>
                            <option value="Product/Packaging Label" ${existingData.primary_design_need === 'Product/Packaging Label' ? 'selected' : ''}>Product/Packaging Label</option>
                            <option value="Other" ${existingData.primary_design_need === 'Other' ? 'selected' : ''}>Other</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">
                            Design Goal <span style="color: #ef4444;">*</span>
                        </label>
                        <textarea name="design_goal" required rows="3"
                                  placeholder="e.g., Promote weekday lunch special for office workers"
                                  style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">${existingData.design_goal || ''}</textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Target Audience</label>
                        <input type="text" name="target_audience" value="${existingData.target_audience || ''}"
                               placeholder="e.g., Young professionals, families, tourists"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Usage Channels</label>
                        <input type="text" name="usage_channels" value="${existingData.usage_channels || ''}"
                               placeholder="e.g., Printed menu + Instagram + website banner"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                </div>
            </div>

            <!-- Brand Style -->
            <div>
                <h4 style="margin-bottom: 0.75rem; font-size: 1rem; color: #1e293b;">Brand Style</h4>
                <div style="display: grid; gap: 0.75rem;">
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Brand Colors</label>
                        <input type="text" name="brand_colors" value="${existingData.brand_colors || ''}"
                               placeholder="e.g., #FF6B6B, soft pink + cream, or 'no preference'"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Brand Fonts</label>
                        <input type="text" name="brand_fonts" value="${existingData.brand_fonts || ''}"
                               placeholder="e.g., Playfair Display, modern sans-serif, or 'no preference'"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Style Reference Links</label>
                        <textarea name="style_reference_links" rows="2"
                                  placeholder="Instagram, Pinterest, or website URLs (one per line)"
                                  style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">${existingData.style_reference_links || ''}</textarea>
                    </div>
                    <div>
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer;">
                            <input type="checkbox" name="logo_present" ${existingData.logo_present ? 'checked' : ''}>
                            I have a logo (included in photo uploads or will provide separately)
                        </label>
                    </div>
                </div>
            </div>

            <!-- Content / Copy -->
            <div>
                <h4 style="margin-bottom: 0.75rem; font-size: 1rem; color: #1e293b;">Content & Copy</h4>
                <div style="display: grid; gap: 0.75rem;">
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500;">Who provides the text?</label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.375rem; cursor: pointer;">
                            <input type="radio" name="copy_status" value="client_provides_copy" ${existingData.copy_status === 'client_provides_copy' ? 'checked' : ''}>
                            <span style="font-size: 0.875rem;">I will provide all text</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.375rem; cursor: pointer;">
                            <input type="radio" name="copy_status" value="designer_writes_copy" ${existingData.copy_status === 'designer_writes_copy' || !existingData.copy_status ? 'checked' : ''}>
                            <span style="font-size: 0.875rem;">Please help write the text using AI based on my notes</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="radio" name="copy_status" value="mixed" ${existingData.copy_status === 'mixed' ? 'checked' : ''}>
                            <span style="font-size: 0.875rem;">Mix of both</span>
                        </label>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Main Headline (optional)</label>
                        <input type="text" name="main_headline" value="${existingData.main_headline || ''}"
                               placeholder="e.g., Weekend Brunch & Bottomless Mimosas"
                               style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Key Offers or Menu Items (optional)</label>
                        <textarea name="key_offers_or_items" rows="3"
                                  placeholder="List your signature dishes, special offers, or key products (one per line)"
                                  style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">${existingData.key_offers_or_items || ''}</textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; font-weight: 500;">Special Requirements & Languages</label>
                        <textarea name="special_requirements" rows="2"
                                  placeholder="e.g., Bilingual Spanish/English, highlight vegan dishes, show allergen icons, include QR code"
                                  style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">${existingData.special_requirements || ''}</textarea>
                    </div>
                </div>
            </div>

            <!-- Submit Button -->
            <div id="brief-form-message-${orderId}" style="display: none;"></div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">
                ${existingData.business_name ? 'Update Design Brief' : 'Save Design Brief'}
            </button>
        </form>

        <script>
        document.getElementById('design-brief-form-${orderId}').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveDesignBrief(${orderId});
        });
        </script>
    `;
}

// Render Design Brief View (read-only)
function renderDesignBriefView(brief) {
    return `
        <div style="display: grid; gap: 1.5rem; font-size: 0.875rem;">
            <!-- Business Info -->
            <div>
                <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; font-weight: 600;">Business Information</h4>
                <div style="display: grid; gap: 0.5rem;">
                    <div><strong>Name:</strong> ${brief.business_name}</div>
                    <div><strong>Type:</strong> ${brief.business_type}</div>
                    ${brief.location_city || brief.location_country ? `<div><strong>Location:</strong> ${[brief.location_city, brief.location_country].filter(Boolean).join(', ')}</div>` : ''}
                    ${brief.website ? `<div><strong>Website:</strong> <a href="${brief.website}" target="_blank" style="color: #3b82f6;">${brief.website}</a></div>` : ''}
                </div>
            </div>

            <!-- Design Request -->
            <div>
                <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; font-weight: 600;">Design Request</h4>
                <div style="display: grid; gap: 0.5rem;">
                    <div><strong>Primary Need:</strong> ${brief.primary_design_need}</div>
                    <div><strong>Goal:</strong> ${brief.design_goal}</div>
                    ${brief.target_audience ? `<div><strong>Target Audience:</strong> ${brief.target_audience}</div>` : ''}
                    ${brief.usage_channels ? `<div><strong>Usage:</strong> ${brief.usage_channels}</div>` : ''}
                </div>
            </div>

            <!-- Brand Style -->
            <div>
                <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; font-weight: 600;">Brand Style</h4>
                <div style="display: grid; gap: 0.5rem;">
                    ${brief.brand_colors ? `<div><strong>Colors:</strong> ${brief.brand_colors}</div>` : ''}
                    ${brief.brand_fonts ? `<div><strong>Fonts:</strong> ${brief.brand_fonts}</div>` : ''}
                    ${brief.style_reference_links ? `<div><strong>References:</strong> ${brief.style_reference_links.split('\n').join(', ')}</div>` : ''}
                    <div><strong>Logo:</strong> ${brief.logo_present ? `Yes${brief.logo_notes ? ` - ${brief.logo_notes}` : ''}` : 'No'}</div>
                </div>
            </div>

            <!-- Content -->
            <div>
                <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem; font-weight: 600;">Content & Copy</h4>
                <div style="display: grid; gap: 0.5rem;">
                    <div><strong>Copy Status:</strong> ${brief.copy_status === 'client_provides_copy' ? 'Client provides' : brief.copy_status === 'designer_writes_copy' ? 'AI-assisted' : 'Mixed'}</div>
                    ${brief.main_headline ? `<div><strong>Headline:</strong> ${brief.main_headline}</div>` : ''}
                    ${brief.key_offers_or_items ? `<div><strong>Key Items:</strong> ${brief.key_offers_or_items.substring(0, 150)}${brief.key_offers_or_items.length > 150 ? '...' : ''}</div>` : ''}
                    ${brief.special_requirements ? `<div><strong>Special Requirements:</strong> ${brief.special_requirements}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

// Save Design Brief
async function saveDesignBrief(orderId) {
    try {
        const form = document.getElementById(`design-brief-form-${orderId}`);
        const formData = new FormData(form);
        const briefData = {};

        formData.forEach((value, key) => {
            if (key === 'logo_present') {
                briefData[key] = value === 'on';
            } else {
                briefData[key] = value;
            }
        });

        const token = getAuthToken();
        const response = await fetch(`/api/photo-studio/order/${orderId}/brief`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(briefData)
        });

        const data = await response.json();

        if (data.success) {
            designBriefs[orderId] = data.brief;
            renderOrderDetails(orderId);
            showBriefMessage(orderId, 'Design brief saved successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to save brief');
        }
    } catch (error) {
        console.error('Save brief error:', error);
        showBriefMessage(orderId, 'Failed to save brief: ' + error.message, 'error');
    }
}

// Show brief form message
function showBriefMessage(orderId, message, type) {
    const messageEl = document.getElementById(`brief-form-message-${orderId}`);
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        messageEl.style.padding = '0.75rem';
        messageEl.style.borderRadius = '0.375rem';
        messageEl.style.marginBottom = '1rem';
        messageEl.style.backgroundColor = type === 'success' ? '#d1fae5' : '#fee2e2';
        messageEl.style.color = type === 'success' ? '#065f46' : '#991b1b';

        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }
}

// Edit Design Brief
function editDesignBrief(orderId) {
    const viewEl = document.getElementById(`brief-view-${orderId}`);
    const formEl = document.getElementById(`brief-form-${orderId}`);

    if (viewEl && formEl) {
        viewEl.style.display = 'none';
        formEl.style.display = 'block';
    }
}
```

---

### 2. Success Page (`views/photo-studio-success.ejs`)

**Add after order confirmation section:**

```html
<!-- Next Step: Design Brief CTA -->
<div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem;">
    <h3 style="color: #1e40af; margin-bottom: 0.75rem; font-size: 1.125rem;">
        📋 Next Step: Complete Your Design Brief
    </h3>
    <p style="color: #1e3a8a; margin-bottom: 1rem;">
        Before we start working on your photos and graphics, please fill out a brief about your brand, menu, and goals so our designer and AI can create the perfect designs for you.
    </p>
    <a href="/photo-studio-portal?orderId=<%= orderId %>"
       style="display: inline-block; background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.375rem; text-decoration: none; font-weight: 600;">
        Go to My Portal & Design Brief →
    </a>
</div>
```

---

### 3. Admin Dashboard (`views/photo-studio-admin-dashboard.ejs`)

**Add two new sections to order details panel:**

#### A. Design Brief Panel (Read-Only for Admin)

**Location:** Add after order details, before enhanced photos upload section

```javascript
// Add to order details rendering
if (selectedOrder && selectedOrder.design_brief) {
    html += renderAdminDesignBriefPanel(selectedOrder.design_brief);
}

function renderAdminDesignBriefPanel(brief) {
    return `
        <div class="admin-card">
            <h3 style="margin-bottom: 1rem;">📋 Design Brief</h3>
            ${/* Same read-only view as customer portal */}
            <div style="display: grid; gap: 1rem; font-size: 0.875rem;">
                <div>
                    <strong>Business:</strong> ${brief.business_name} (${brief.business_type})
                    ${brief.location_city ? ` • ${brief.location_city}` : ''}
                </div>
                <div><strong>Primary Need:</strong> ${brief.primary_design_need}</div>
                <div><strong>Goal:</strong> ${brief.design_goal}</div>
                ${brief.brand_colors ? `<div><strong>Colors:</strong> ${brief.brand_colors}</div>` : ''}
                ${brief.key_offers_or_items ? `<div><strong>Key Items:</strong> <pre style="white-space: pre-wrap; font-family: inherit;">${brief.key_offers_or_items}</pre></div>` : ''}
            </div>
        </div>
    `;
}
```

#### B. AI Design Assistant Panel

**Location:** Add after Design Brief panel

```javascript
function renderAIDesignAssistantPanel(orderId) {
    return `
        <div class="admin-card" id="ai-assistant-panel">
            <h3 style="margin-bottom: 1rem;">🤖 AI Design Assistant (OpenAI/Claude via MCP)</h3>

            ${/* No brief warning */}
            <div id="no-brief-warning" style="display: none; background: #fef3c7; border-left: 4px solid #f59e0b; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem;">
                ⚠️ No Design Brief found. AI will generate generic content. Ask customer to complete their brief first.
            </div>

            ${/* AI Generation Form */}
            <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem;">
                        Content Type
                    </label>
                    <select id="ai-mode-${orderId}" style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem;">
                        <option value="menu">Menu Copy</option>
                        <option value="flyer">Flyer / Postcard Copy</option>
                        <option value="social">Social Media Posts</option>
                        <option value="generic">Generic Marketing Copy</option>
                    </select>
                </div>

                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.875rem;">
                        Extra Instructions (Optional)
                    </label>
                    <textarea id="ai-instructions-${orderId}" rows="3"
                              placeholder="e.g., Focus on Mother's Day brunch, highlight bottomless mimosas and live music. Tone: elegant but friendly."
                              style="width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;"></textarea>
                </div>

                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button onclick="generateAIContent(${orderId})" id="ai-generate-btn-${orderId}"
                            class="btn btn-primary">
                        Generate with AI
                    </button>
                    <select id="ai-model-${orderId}" style="padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem;">
                        <option value="openai">OpenAI (GPT-4)</option>
                        <option value="claude">Claude (Sonnet 3.5)</option>
                    </select>
                </div>
            </div>

            ${/* AI Output Display */}
            <div id="ai-output-${orderId}" style="display: none;">
                <!-- Results will be rendered here -->
            </div>

            ${/* AI History */}
            <div id="ai-history-${orderId}">
                <h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 0.875rem; text-transform: uppercase; color: #64748b;">
                    Previous AI Generations
                </h4>
                <div id="ai-history-list-${orderId}" style="display: grid; gap: 0.5rem;">
                    <!-- History items will be loaded here -->
                </div>
            </div>
        </div>
    `;
}

// Generate AI Content
async function generateAIContent(orderId) {
    const btn = document.getElementById(`ai-generate-btn-${orderId}`);
    const mode = document.getElementById(`ai-mode-${orderId}`).value;
    const extraInstructions = document.getElementById(`ai-instructions-${orderId}`).value;
    const preferredModel = document.getElementById(`ai-model-${orderId}`).value;
    const outputEl = document.getElementById(`ai-output-${orderId}`);

    try {
        btn.disabled = true;
        btn.textContent = 'Generating...';
        outputEl.style.display = 'none';

        const token = getAuthToken();
        const response = await fetch(`/api/photo-studio/admin/order/${orderId}/ai/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mode,
                extraInstructions,
                preferredModel
            })
        });

        const data = await response.json();

        if (data.success) {
            renderAIOutput(orderId, data);
            loadAIHistory(orderId);
        } else {
            throw new Error(data.error || 'AI generation failed');
        }
    } catch (error) {
        console.error('AI generation error:', error);
        alert('Failed to generate AI content: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate with AI';
    }
}

// Render AI Output
function renderAIOutput(orderId, data) {
    const outputEl = document.getElementById(`ai-output-${orderId}`);
    let contentHTML = '';

    if (data.fallback) {
        contentHTML += `
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem;">
                ⚠️ MCP server unavailable. Fallback content provided.
            </div>
        `;
    }

    contentHTML += `
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div style="font-size: 0.875rem; color: #64748b;">
                    Generated by: <strong>${data.model}</strong> • Mode: <strong>${data.mode}</strong>
                </div>
                <button onclick="copyToClipboard('ai-content-${orderId}')" class="btn btn-secondary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;">
                    📋 Copy
                </button>
            </div>

            <div id="ai-content-${orderId}">
                ${renderAIContentByMode(data.mode, data.content)}
            </div>

            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #64748b;">
                <strong>Note:</strong> AI-generated content. Please review and edit before sending to client.
            </div>
        </div>
    `;

    outputEl.innerHTML = contentHTML;
    outputEl.style.display = 'block';
}

// Render AI Content by Mode
function renderAIContentByMode(mode, content) {
    if (mode === 'menu') {
        return renderMenuContent(content);
    } else if (mode === 'flyer') {
        return renderFlyerContent(content);
    } else if (mode === 'social') {
        return renderSocialContent(content);
    } else {
        return `<pre style="white-space: pre-wrap; font-family: inherit; font-size: 0.875rem;">${JSON.stringify(content, null, 2)}</pre>`;
    }
}

function renderMenuContent(content) {
    if (!content.menuSections) return '';

    return content.menuSections.map(section => `
        <div style="margin-bottom: 1.5rem;">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">${section.title}</h4>
            ${section.items.map(item => `
                <div style="margin-bottom: 0.75rem; padding-left: 1rem;">
                    <div style="font-weight: 600;">${item.name}</div>
                    ${item.description ? `<div style="font-size: 0.875rem; color: #64748b;">${item.description}</div>` : ''}
                    ${item.note ? `<div style="font-size: 0.75rem; color: #3b82f6; font-style: italic;">${item.note}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderFlyerContent(content) {
    return `
        <div style="display: grid; gap: 1rem;">
            ${content.headline ? `<div><strong>Headline:</strong><br>${content.headline}</div>` : ''}
            ${content.subheadline ? `<div><strong>Subheadline:</strong><br>${content.subheadline}</div>` : ''}
            ${content.body ? `<div><strong>Body:</strong><br>${content.body}</div>` : ''}
            ${content.callToAction ? `<div><strong>Call to Action:</strong><br>${content.callToAction}</div>` : ''}
            ${content.smallPrint ? `<div style="font-size: 0.75rem;"><strong>Small Print:</strong><br>${content.smallPrint}</div>` : ''}
        </div>
    `;
}

function renderSocialContent(content) {
    return `
        <div style="display: grid; gap: 1rem;">
            ${content.captions ? `
                <div>
                    <strong>Captions:</strong>
                    ${content.captions.map((caption, i) => `
                        <div style="background: white; padding: 0.75rem; margin-top: 0.5rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;">
                            ${i + 1}. ${caption}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${content.hashtags ? `
                <div>
                    <strong>Hashtags:</strong><br>
                    <div style="margin-top: 0.5rem;">
                        ${content.hashtags.map(tag => `<span style="background: #eff6ff; color: #3b82f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; margin-right: 0.25rem;">${tag}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Copy to Clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.innerText;

    navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Load AI History
async function loadAIHistory(orderId) {
    try {
        const token = getAuthToken();
        const response = await fetch(`/api/photo-studio/admin/order/${orderId}/ai/outputs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success && data.outputs.length > 0) {
            const listEl = document.getElementById(`ai-history-list-${orderId}`);
            listEl.innerHTML = data.outputs.slice(0, 5).map(output => `
                <div style="background: #f8fafc; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e5e7eb; font-size: 0.875rem; cursor: pointer;"
                     onclick="expandAIOutput(${output.id})">
                    <strong>${output.mode}</strong> • ${output.model_name} • ${new Date(output.created_at).toLocaleString()}
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Load AI history error:', error);
    }
}
```

---

## 🚀 Deployment Steps

1. **Run Database Migrations:**
   ```bash
   node scripts/run-design-brief-migration.js
   ```

2. **Update Environment Variables:**
   Add to `.env` or Render dashboard:
   ```
   MCP_SERVER_URL=http://localhost:3001
   MCP_API_KEY=your-mcp-api-key-here
   ```

3. **Test Locally:**
   - Create an order
   - Fill out design brief
   - Generate AI content (if MCP server running)
   - Verify fallback works when MCP offline

4. **Deploy to Render:**
   - Push to GitHub main branch
   - Render auto-deploys within 2-5 minutes

---

## 📊 Summary

### New Database Tables
- `photo_studio_design_briefs` - Stores design briefs (1-to-1 with orders)
- `photo_studio_ai_outputs` - Stores AI-generated content

### New API Endpoints
**Customer:**
- POST `/api/photo-studio/order/:orderId/brief`
- PUT `/api/photo-studio/order/:orderId/brief`
- GET `/api/photo-studio/order/:orderId/brief`

**Admin:**
- POST `/api/photo-studio/admin/order/:orderId/ai/generate`
- GET `/api/photo-studio/admin/order/:orderId/ai/outputs`

### Frontend Changes Needed
1. **photo-studio-portal.ejs** - Add Design Brief form/view in order details
2. **photo-studio-success.ejs** - Add CTA for completing design brief
3. **photo-studio-admin-dashboard.ejs** - Add Design Brief view + AI Assistant panel

### MCP Integration
- Graceful fallback when MCP server unavailable
- Supports OpenAI and Claude models
- Structured JSON output for menu, flyer, social, generic modes
- Stores all AI generations for history/reference

---

## 🔮 Future Enhancements (TODOs)

1. **PDF Export** - One-click export of AI content to PDF
2. **Multi-language Templates** - Support for multiple languages in AI generation
3. **Image Analysis** - Use uploaded photos to inform AI suggestions
4. **Client Approval** - Allow clients to approve AI-generated content before design
5. **Template Library** - Pre-built templates for common food service scenarios
6. **A/B Testing** - Generate multiple variations and let client choose
7. **Direct Integration** - Send approved content directly to design tools (Figma, Canva)
